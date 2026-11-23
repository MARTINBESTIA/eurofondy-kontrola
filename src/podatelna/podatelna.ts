// Podateľňa: spisy žiadostí o NFP, ktoré posudzuje kontrolór.
// Podanie príde z rozhrania (kontrolór nahrá súbory) alebo automaticky (e-mailový hook, priečinok) cez to isté API.
// Spis = údaje formulára + súbory podania a doplnení + posudky softvéru + rozhodnutie kontrolóra.
// Softvér navrhuje, rozhoduje človek: rozhodnutie kontrolóra sa ukladá zvlášť od návrhu softvéru.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import type { DatabaseSync } from 'node:sqlite';
import { dokumentNaText, rozbalZip, xlsxBunky } from '../ingest/dokument.ts';
import { ChybaVstupu } from '../core/chyby.ts';
import { normalizujItms21 } from '../moduly/zonfp/normalizuj.ts';
import type { Navrh, Priloha, Ziadost } from '../core/typy.ts';
import { jeDen, skDen, stavLehoty, type Den, type StavLehoty } from './lehoty.ts';
import { lehotyVTexte } from './vyzva.ts';

const KOREN = path.join(import.meta.dirname, '..', '..');
/** Úložisko súborov spisov. SPISY_DIR prepíše cestu (test nesmie zapisovať do priečinkov spisov bežiaceho servera). */
const ULOZISKO = path.resolve(process.env.SPISY_DIR ?? path.join(KOREN, 'data', 'spisy'));

export interface Subor { nazov: string; data: Buffer }
export type Rozhodnutie = 'splnila' | 'doplnenie' | 'nesplnila';
export const ROZHODNUTIA: Record<Rozhodnutie, string> = { splnila: 'Splnila podmienky', doplnenie: 'Výzva na doplnenie', nesplnila: 'Nesplnila podmienky' };
export interface Slot { cislo: string; nazov: string }

// AUTOINCREMENT: číslo spisu (POD-RRRR-NNNN) sa po vymazaní spisu nesmie prideliť znova, inak by staré záznamy
// v auditnej stope a v korešpondencii ukazovali na iné podanie. Bez neho SQLite recykluje najvyššie id.
const TABULKY: Record<string, string> = {
  spisy: `id INTEGER PRIMARY KEY AUTOINCREMENT, vyzva TEXT NOT NULL, kod TEXT, nazov TEXT, ziadatel TEXT, ico TEXT,
    zdroj TEXT NOT NULL, prijate TEXT NOT NULL, stav TEXT NOT NULL, navrh TEXT, posudok_id INTEGER,
    rozhodnutie TEXT, rozhodnutie_pozn TEXT, rozhodnutie_cas TEXT, formular_json TEXT, formular_zdroj TEXT`,
  subory: `id INTEGER PRIMARY KEY AUTOINCREMENT, spis_id INTEGER NOT NULL, davka INTEGER NOT NULL, nazov TEXT NOT NULL, velkost INTEGER NOT NULL,
    sha256 TEXT NOT NULL, typ TEXT NOT NULL, priloha TEXT, istota TEXT NOT NULL, text TEXT, chyba TEXT, cesta TEXT NOT NULL, nahrate TEXT NOT NULL`,
  // Odoslaná výzva na doplnenie a údaje o jej lehote. Odpoveďou na výzvu sú dávky podkladov od davka_od
  // (po davka_od ďalšej výzvy). Text a body výzvy sa ukladajú v podobe, v akej ich kontrolór odoslal.
  // opravy = JSON zoznam opráv záznamu po odoslaní (deň odoslania, lehota, text): oprava sa nesmie stratiť ani
  // vydávať za predĺženie lehoty, to je samostatný úkon (predlzene_do s dôvodom).
  vyzvy_doplnenie: `id INTEGER PRIMARY KEY AUTOINCREMENT, spis_id INTEGER NOT NULL, posudok_id INTEGER, davka_od INTEGER NOT NULL,
    vytvorena TEXT NOT NULL, odoslana TEXT NOT NULL, dorucena TEXT, lehota_dni INTEGER NOT NULL, predlzene_do TEXT, predlzenie_pozn TEXT,
    polozky TEXT, text TEXT, opravy TEXT`,
};
const pridajStlpec = (db: DatabaseSync, t: string, stlpec: string, typ: string) => {
  if (!db.prepare(`SELECT 1 FROM pragma_table_info('${t}') WHERE name = ?`).get(stlpec)) db.exec(`ALTER TABLE ${t} ADD COLUMN ${stlpec} ${typ}`);
};
export function pripravDb(db: DatabaseSync) {
  for (const [t, stlpce] of Object.entries(TABULKY)) {
    const sql = (db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?").get(t) as { sql: string } | undefined)?.sql;
    if (!sql) { db.exec(`CREATE TABLE ${t} (${stlpce})`); continue; }
    if (/AUTOINCREMENT/i.test(sql)) continue;
    // Staršia tabuľka bez AUTOINCREMENT: prenesieme ju so zachovanými id (na ne odkazujú posudky a cesty súborov).
    db.exec(`BEGIN; ALTER TABLE ${t} RENAME TO ${t}_stara; CREATE TABLE ${t} (${stlpce}); INSERT INTO ${t} SELECT * FROM ${t}_stara; DROP TABLE ${t}_stara; COMMIT;`);
  }
  if (!(db.prepare('PRAGMA table_info(posudky)').all() as { name: string }[]).some((c) => c.name === 'spis_id')) db.exec('ALTER TABLE posudky ADD COLUMN spis_id INTEGER');
  if (!db.prepare("SELECT 1 FROM pragma_table_info('spisy') WHERE name = 'formular_subor_id'").get()) db.exec('ALTER TABLE spisy ADD COLUMN formular_subor_id INTEGER');
  // Deň odoslania dávky do ITMS21+ (za deň doplnenia sa považuje deň odoslania, MD č. 21, kap. 2.4 ods. 5).
  pridajStlpec(db, 'subory', 'odoslane', 'TEXT');
  pridajStlpec(db, 'vyzvy_doplnenie', 'opravy', 'TEXT');
  // Verzia podkladov spisu a čas začatia posudku: starší posudok dokončený neskôr nesmie prepísať novší (verziaSpisu).
  pridajStlpec(db, 'posudky', 'verzia_spisu', 'TEXT');
  pridajStlpec(db, 'posudky', 'zaciatok', 'TEXT');
}

/**
 * Verzia podkladov spisu: súbory (obsah, dávka), ich zaradenie a platný formulár. Mení ju doplnenie, zmena zaradenia
 * aj zmena platného formulára. Posudok sa viaže na verziu pri svojom začatí; deň odoslania dávky do nej nepatrí,
 * lebo posudok nemení (ovplyvňuje len lehotu).
 */
export function verziaSpisu(db: DatabaseSync, spisId: number): string {
  const s = db.prepare('SELECT formular_subor_id AS f, formular_json AS j FROM spisy WHERE id = ?').get(spisId) as { f: number | null; j: string | null } | undefined;
  const subory = db.prepare('SELECT id, davka, sha256, typ, priloha, istota FROM subory WHERE spis_id = ? ORDER BY id').all(spisId);
  return crypto.createHash('sha256').update(JSON.stringify([s?.f ?? null, s?.j ?? null, subory])).digest('hex').slice(0, 16);
}

export const cisloSpisu = (id: number, prijate: string) => `POD-${prijate.slice(0, 4)}-${String(id).padStart(4, '0')}`;

// ---------- zaradenie súborov k prílohám
const bezDiakritiky = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
/** Kľúčové slová príloh ŽoNFP (bez diakritiky). Vyhráva to, ktoré je v názve alebo texte najskôr: nadpis býva na začiatku. */
const KLUCOVE: [string, RegExp][] = [
  ['1', /plnomocen|splnomocn|poveren/],
  ['3', /uznesen|program\w* (hospodarskeho a socialneho )?rozvoja|\bphrsr\b|\bphsr\b|uzemn\w* plan/],
  ['5', /energetick\w* audit|\baudit\b/],
  ['6', /energetick\w* certifik|certifikat|\becb\b/],
  ['7', /projektov\w* dokument|technick\w* sprav|vykres|stavebn\w* povolen|\bpd\b/],
  ['8', /opravnenost\w* vydavkov|rozpoc|hodnot\w* za peniaze/],
  ['9', /horizontaln\w* princip/],
];
function najskorsia(text: string, sloty: Set<string>): string | null {
  let naj: { cislo: string; idx: number } | null = null;
  for (const [cislo, re] of KLUCOVE) {
    if (!sloty.has(cislo)) continue;
    const idx = text.search(re);
    if (idx >= 0 && (!naj || idx < naj.idx)) naj = { cislo, idx };
  }
  return naj?.cislo ?? null;
}
/**
 * istota: cislo = číslo prílohy v názve súboru (vyhlásenie žiadateľa, ako slot v ITMS21+), rucne = potvrdil kontrolór;
 * nazov / obsah = odhad podľa kľúčových slov, ktorý musí kontrolór potvrdiť, inak pravidlo prílohy nebude „splnené“.
 */
export type Istota = 'cislo' | 'rucne' | 'nazov' | 'obsah' | 'ziadna';
export const jePotvrdene = (i: string) => i === 'cislo' || i === 'rucne';
export function zarad(nazov: string, text: string, sloty: Slot[]): { typ: 'formular' | 'priloha' | 'nezaradeny'; priloha: string | null; istota: Istota } {
  const mnozina = new Set(sloty.map((s) => s.cislo));
  if (/\.json$/i.test(nazov)) return { typ: 'formular', priloha: null, istota: 'cislo' };
  const meno = bezDiakritiky(nazov).replace(/[_\-.]+/g, ' ');
  const cislo = meno.match(/priloh[ay]? *(?:c *)?(\d{1,2})(?!\d)/)?.[1];
  if (cislo && mnozina.has(cislo)) return { typ: 'priloha', priloha: cislo, istota: 'cislo' };
  const podlaMena = najskorsia(meno, mnozina);
  if (podlaMena) return { typ: 'priloha', priloha: podlaMena, istota: 'nazov' };
  const podlaObsahu = najskorsia(bezDiakritiky(text.slice(0, 1500)), mnozina);
  if (podlaObsahu) return { typ: 'priloha', priloha: podlaObsahu, istota: 'obsah' };
  return { typ: 'nezaradeny', priloha: null, istota: 'ziadna' };
}

// ---------- formulár žiadosti
/**
 * Údaje formulára ŽoNFP zo súboru JSON. Tri tvary: odkaz na žiadosť v ITMS21+ ({"kodItms": "NFP..."}),
 * surový detail z API ITMS21+, alebo štruktúrovaný formulár v tvare Ziadost (chýbajúce polia sa doplnia prázdne).
 */
export function formularZJson(text: string, vyzva: string, zItms: (kod: string) => Ziadost | undefined): { ziadost: Ziadost; zdroj: string } {
  const d = JSON.parse(text);
  if (d.kodItms) {
    const z = zItms(String(d.kodItms));
    if (!z) throw new Error(`Žiadosť ${d.kodItms} sa v stiahnutých dátach ITMS21+ nenašla.`);
    return { ziadost: structuredClone(z), zdroj: `ITMS21+ (${d.kodItms})` };
  }
  if (d.polozkyRozpoctu || typeof d.ziadatel?.pravnaForma === 'object') return { ziadost: normalizujItms21(d), zdroj: 'detail z API ITMS21+' };
  if (!d.ziadatel?.nazov) throw new Error('Formulár nemá žiadateľa (ziadatel.nazov).');
  const z: Ziadost = {
    // Kód výzvy len z formulára: doplnený kód spisu by pravidlo V01 „splnilo“ bez dôkazu.
    id: 0, kod: d.kod ?? '', nazov: d.nazov ?? '', vyzvaKod: d.vyzvaKod ?? '', stav: 'Predložená', vysledok: 'ina', dovod: null, kolo: d.kolo ?? null,
    datumPredlozenia: d.datumPredlozenia ?? null, datumRozhodnutia: null,
    ziadatel: { nazov: d.ziadatel.nazov, ico: d.ziadatel.ico ?? '', pravnaFormaKod: String(d.ziadatel.pravnaFormaKod ?? ''), pravnaForma: d.ziadatel.pravnaForma ?? '' },
    miesta: d.miesta ?? [], kategoriaRegionov: d.kategoriaRegionov ?? [],
    sumaZiadanaNFP: Number(d.sumaZiadanaNFP ?? 0), sumaZiadanaCelkova: Number(d.sumaZiadanaCelkova ?? d.sumaZiadanaNFP ?? 0), sumaZiadanaVZ: Number(d.sumaZiadanaVZ ?? 0), percentoZiadane: d.percentoZiadane ?? null,
    dlzkaHlavnychAktivitMes: d.dlzkaHlavnychAktivitMes ?? null, zaciatokHlavnychAktivit: d.zaciatokHlavnychAktivit ?? null, koniecHlavnychAktivit: d.koniecHlavnychAktivit ?? null,
    popis: d.popis ?? '', ucel: d.ucel ?? '', opatrenia: d.opatrenia ?? [], aktivity: d.aktivity ?? [], rozpocet: d.rozpocet ?? [], ukazovatele: d.ukazovatele ?? [],
  };
  return { ziadost: z, zdroj: 'štruktúrovaný formulár (JSON)' };
}

// ---------- príjem podania a doplnenia
const bezpecneMeno = (s: string) => s.replace(/[^\p{L}\p{N}._ -]+/gu, '_').slice(0, 120);
function ulozSubory(db: DatabaseSync, spisId: number, davka: number, subory: Subor[], sloty: Slot[], odoslane: Den | null = null): number[] {
  const dir = path.join(ULOZISKO, String(spisId));
  fs.mkdirSync(dir, { recursive: true });
  const vloz = db.prepare('INSERT INTO subory (spis_id, davka, nazov, velkost, sha256, typ, priloha, istota, text, chyba, cesta, nahrate, odoslane) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)');
  const ids: number[] = [];
  for (const s of subory) {
    let text = ''; let chyba: string | null = null;
    try { text = dokumentNaText(s.nazov, s.data); if (!/\.json$/i.test(s.nazov) && text.trim().length < 40) chyba = 'Dokument nemá textovú vrstvu (sken?). Bez OCR sa nedá čítať.'; }
    catch (e) { chyba = (e as Error).message; }
    const z = zarad(s.nazov, text, sloty);
    const sha = crypto.createHash('sha256').update(s.data).digest('hex');
    const cesta = path.join(String(spisId), `${davka}-${sha.slice(0, 8)}-${bezpecneMeno(s.nazov)}`);
    fs.writeFileSync(path.join(ULOZISKO, cesta), s.data);
    ids.push(Number(vloz.run(spisId, davka, s.nazov, s.data.length, sha, z.typ, z.priloha, z.istota, text, chyba, cesta, new Date().toISOString(), odoslane).lastInsertRowid));
  }
  return ids;
}
/**
 * Súbory podania s rozbalenými archívmi ZIP. Volá sa pred prvým zápisom do spisu: poškodený alebo prázdny archív
 * odmietne celé nahratie (ChybaVstupu, server vráti 400), nič z neho sa neuloží ani potichu nevynechá.
 */
const rozbal = (subory: Subor[]) => subory.flatMap((s) => {
  if (!/\.zip$/i.test(s.nazov)) return [s];
  try { return rozbalZip(s.data); } catch (e) {
    if (!(e instanceof ChybaVstupu)) throw e;
    throw new ChybaVstupu(`Súbor „${s.nazov}“ sa nedá rozbaliť: ${e.message}. Nič z nahratia sa neuložilo. Nahrajte archív znova alebo prílohy jednotlivo.`);
  }
});

/**
 * Načíta formulár zo súborov spisu a uloží ho ako platný. Bez `ids` skúša formuláre spisu od prvého, s `ids` len
 * tieto súbory v danom poradí (formulár z doplnenia, voľba kontrolóra). Chyba formulára sa zapíše k súboru.
 * Vráti, či sa platný formulár zmenil na niektorý z kandidátov; pri neúspechu ostane doterajší formulár.
 * S `kodSpisu` sa formulár inej žiadosti nepoužije (doplnenie nesmie potichu zameniť posudzovanú žiadosť).
 */
function obnovFormular(db: DatabaseSync, spisId: number, vyzva: string, zItms: (kod: string) => Ziadost | undefined, ids?: number[], kodSpisu?: string | null): boolean {
  const kandidati = ids
    ? ids.map((id) => db.prepare('SELECT id, text FROM subory WHERE id = ? AND spis_id = ?').get(id, spisId) as { id: number; text: string } | undefined).filter((k) => !!k)
    : db.prepare("SELECT id, text FROM subory WHERE spis_id = ? AND typ = 'formular' ORDER BY id").all(spisId) as { id: number; text: string }[];
  for (const k of kandidati) {
    try {
      const { ziadost, zdroj } = formularZJson(k.text, vyzva, zItms);
      if (kodSpisu && ziadost.kod && ziadost.kod !== kodSpisu) {
        db.prepare('UPDATE subory SET chyba = ? WHERE id = ?').run(`Formulár je k inej žiadosti (${ziadost.kod}) než spis (${kodSpisu}), preto sa nepoužil. Ak ide o opravu tej istej žiadosti, určte ho ako platný formulár.`, k.id);
        continue;
      }
      db.prepare('UPDATE spisy SET formular_json = ?, formular_zdroj = ?, formular_subor_id = ?, kod = ?, nazov = ?, ziadatel = ?, ico = ? WHERE id = ?')
        .run(JSON.stringify(ziadost), zdroj, k.id, ziadost.kod || null, ziadost.nazov || null, ziadost.ziadatel.nazov, ziadost.ziadatel.ico, spisId);
      db.prepare('UPDATE subory SET chyba = NULL WHERE id = ?').run(k.id);
      return true;
    } catch (e) { db.prepare('UPDATE subory SET chyba = ? WHERE id = ?').run(`Formulár sa nedá načítať: ${(e as Error).message}`, k.id); }
  }
  return false;
}

export function prijmiPodanie(db: DatabaseSync, o: { vyzva: string; zdroj: string; kodItms?: string; subory: Subor[]; sloty: Slot[]; zItms: (kod: string) => Ziadost | undefined }): number {
  const subory = rozbal(o.subory);
  if (!subory.length && !o.kodItms) throw new ChybaVstupu('Podanie neobsahuje žiadne súbory ani kód žiadosti z ITMS21+.');
  const prijate = new Date().toISOString();
  const id = Number(db.prepare('INSERT INTO spisy (vyzva, zdroj, prijate, stav) VALUES (?,?,?,?)').run(o.vyzva, o.zdroj, prijate, 'prijata').lastInsertRowid);
  const kodItms = o.kodItms?.trim();
  if (kodItms) subory.unshift({ nazov: `formular-z-ITMS21-${bezpecneMeno(kodItms)}.json`, data: Buffer.from(JSON.stringify({ kodItms })) });
  ulozSubory(db, id, 1, subory, o.sloty);
  obnovFormular(db, id, o.vyzva, o.zItms);
  const s = db.prepare('SELECT nazov FROM spisy WHERE id = ?').get(id) as { nazov: string | null };
  if (!s.nazov) db.prepare('UPDATE spisy SET nazov = ? WHERE id = ?').run(`Podanie ${cisloSpisu(id, prijate)} (bez formulára)`, id);
  return id;
}

const poslednaDavka = (db: DatabaseSync, spisId: number) => (db.prepare('SELECT MAX(davka) AS d FROM subory WHERE spis_id = ?').get(spisId) as { d: number | null }).d ?? 0;

/** Doplnenie podkladov do spisu ako nová dávka. `odoslane` = deň odoslania doplnenia do ITMS21+, ak ho kontrolór pozná. */
export function doplnPodklady(db: DatabaseSync, spisId: number, subory: Subor[], sloty: Slot[], zItms: (kod: string) => Ziadost | undefined, odoslane: Den | null = null) {
  const spis = db.prepare('SELECT vyzva, kod, formular_json FROM spisy WHERE id = ?').get(spisId) as { vyzva: string; kod: string | null; formular_json: string | null } | undefined;
  if (!spis) throw new Error('Spis neexistuje.');
  const nove = rozbal(subory);
  // Doplnenie bez súborov (aj z nečitateľného archívu) by spis označilo ako doplnený bez jedinej dávky.
  if (!nove.length) throw new ChybaVstupu('Doplnenie neobsahuje žiadne súbory.');
  const ids = ulozSubory(db, spisId, poslednaDavka(db, spisId) + 1, nove, sloty, odoslane);
  // Formulár v doplnení je opravená verzia tej istej žiadosti: ak sa dá načítať, platí on. Pôvodný ostáva v spise
  // a posudky, ktoré ho citujú, ho citujú ďalej. Kontrolór môže platný formulár zmeniť (zmenZaradenie na „formular“).
  const noveFormulare = ids.filter((id) => (db.prepare('SELECT typ FROM subory WHERE id = ?').get(id) as { typ: string }).typ === 'formular');
  if (!(noveFormulare.length && obnovFormular(db, spisId, spis.vyzva, zItms, noveFormulare, spis.kod)) && !spis.formular_json) obnovFormular(db, spisId, spis.vyzva, zItms);
  db.prepare("UPDATE spisy SET stav = 'doplnena' WHERE id = ?").run(spisId);
}

/**
 * Zaradenie súboru, ktoré určil kontrolór. Súbor označený ako formulár sa stane platným formulárom (ak sa dá načítať).
 * Keď kontrolór vyradí platný formulár, platí najnovší iný formulár spisu; ak žiadny nie je, spis formulár nemá.
 */
export function zmenZaradenie(db: DatabaseSync, suborId: number, ciel: string, zItms: (kod: string) => Ziadost | undefined) {
  const s = db.prepare('SELECT spis_id, typ FROM subory WHERE id = ?').get(suborId) as { spis_id: number; typ: string } | undefined;
  if (!s) throw new Error('Súbor neexistuje.');
  const spis = db.prepare('SELECT vyzva, formular_subor_id FROM spisy WHERE id = ?').get(s.spis_id) as { vyzva: string; formular_subor_id: number | null };
  const [typ, priloha] = ciel === 'formular' ? ['formular', null] : ciel === '' ? ['nezaradeny', null] : ['priloha', ciel];
  db.prepare("UPDATE subory SET typ = ?, priloha = ?, istota = 'rucne' WHERE id = ?").run(typ, priloha, suborId);
  if (typ === 'formular') obnovFormular(db, s.spis_id, spis.vyzva, zItms, [suborId]);
  else if (s.typ === 'formular' && spis.formular_subor_id === suborId) {
    const ine = (db.prepare("SELECT id FROM subory WHERE spis_id = ? AND typ = 'formular' ORDER BY davka DESC, id").all(s.spis_id) as { id: number }[]).map((r) => r.id);
    if (!obnovFormular(db, s.spis_id, spis.vyzva, zItms, ine))
      db.prepare('UPDATE spisy SET formular_json = NULL, formular_zdroj = NULL, formular_subor_id = NULL WHERE id = ?').run(s.spis_id);
  }
  return s.spis_id;
}

// ---------- čítanie spisu
interface SpisRiadok {
  formular_subor_id: number | null;
  id: number; vyzva: string; kod: string | null; nazov: string | null; ziadatel: string | null; ico: string | null; zdroj: string; prijate: string; stav: string;
  navrh: Navrh | null; posudok_id: number | null; rozhodnutie: Rozhodnutie | null; rozhodnutie_pozn: string | null; rozhodnutie_cas: string | null; formular_json: string | null; formular_zdroj: string | null;
}
const zakladSpisu = (s: SpisRiadok) => ({
  id: s.id, cislo: cisloSpisu(s.id, s.prijate), vyzva: s.vyzva, kod: s.kod, nazov: s.nazov, ziadatel: s.ziadatel, ico: s.ico, zdroj: s.zdroj, prijate: s.prijate,
  stav: s.stav, navrh: s.navrh, rozhodnutie: s.rozhodnutie, rozhodnutiePozn: s.rozhodnutie_pozn, rozhodnutieCas: s.rozhodnutie_cas, maFormular: !!s.formular_json, formularZdroj: s.formular_zdroj,
  posudokId: s.posudok_id, formularSuborId: s.formular_subor_id,
});

/** Zoznam spisov. S dňom `dnes` pridá pri spisoch s rozhodnutím „Výzva na doplnenie“ stav lehoty poslednej výzvy. */
export function zoznamSpisov(db: DatabaseSync, vyzva?: string, dnes?: Den) {
  const riadky = (vyzva ? db.prepare('SELECT * FROM spisy WHERE vyzva = ? ORDER BY id DESC').all(vyzva) : db.prepare('SELECT * FROM spisy ORDER BY id DESC').all()) as unknown as SpisRiadok[];
  const pocty = new Map((db.prepare('SELECT spis_id, COUNT(*) AS n FROM subory GROUP BY spis_id').all() as { spis_id: number; n: number }[]).map((r) => [r.spis_id, r.n]));
  return riadky.map((s) => {
    const st = dnes && s.rozhodnutie === 'doplnenie' ? lehotySpisu(db, s.id, dnes)[0]?.stav : undefined;
    return { ...zakladSpisu(s), suborov: pocty.get(s.id) ?? 0, lehota: st ? { kod: st.kod, uroven: st.uroven, kratko: st.kratko, sprava: st.sprava } : null };
  });
}

export function spisRiadok(db: DatabaseSync, id: number) { return db.prepare('SELECT * FROM spisy WHERE id = ?').get(id) as unknown as SpisRiadok | undefined; }

export function detailSpisu(db: DatabaseSync, id: number) {
  const s = spisRiadok(db, id);
  if (!s) return undefined;
  const subory = (db.prepare('SELECT id, davka, nazov, velkost, typ, priloha, istota, chyba, nahrate, odoslane, length(text) AS znakov FROM subory WHERE spis_id = ? ORDER BY davka, id').all(id) as any[]);
  const posudky = db.prepare('SELECT id, cas, navrh, model, trvanie_ms AS trvanieMs, verzia_spisu AS verziaSpisu, zaciatok FROM posudky WHERE spis_id = ? ORDER BY id DESC').all(id) as unknown as { id: number; verziaSpisu: string | null }[];
  const posledny = s.posudok_id ? JSON.parse((db.prepare('SELECT posudok_json FROM posudky WHERE id = ?').get(s.posudok_id) as { posudok_json: string }).posudok_json) : null;
  const z = s.formular_json ? (JSON.parse(s.formular_json) as Ziadost) : null;
  // verzia = súčasná verzia podkladov; posudok s inou verziou vychádza zo staršieho stavu spisu (null = starý posudok bez verzie).
  const verzia = verziaSpisu(db, id);
  const verziaPosledneho = posudky.find((p) => p.id === s.posudok_id)?.verziaSpisu ?? null;
  return { spis: zakladSpisu(s), subory, posudky, posledny, ziadost: z, verzia, verziaPosledneho };
}

export function textSuboru(db: DatabaseSync, suborId: number) {
  return db.prepare('SELECT id, spis_id AS spisId, nazov, text, chyba FROM subory WHERE id = ?').get(suborId) as { id: number; spisId: number; nazov: string; text: string; chyba: string | null } | undefined;
}
export function suborNaStiahnutie(db: DatabaseSync, suborId: number) {
  const r = db.prepare('SELECT nazov, cesta FROM subory WHERE id = ?').get(suborId) as { nazov: string; cesta: string } | undefined;
  if (!r) return undefined;
  const p = path.normalize(path.join(ULOZISKO, r.cesta));
  return p.startsWith(ULOZISKO) && fs.existsSync(p) ? { nazov: r.nazov, data: fs.readFileSync(p) } : undefined;
}

/** Bunky zošita z uloženého originálu (pre kontrolu záväzného formulára); iný formát alebo chyba čítania -> undefined. */
function bunkyZosita(nazov: string, cesta: string): Record<string, Record<string, string>> | undefined {
  if (!/\.xls[xm]$/i.test(nazov)) return undefined;
  const p = path.normalize(path.join(ULOZISKO, cesta));
  try { return p.startsWith(ULOZISKO) ? xlsxBunky(fs.readFileSync(p)) : undefined; } catch { return undefined; }
}

/** Žiadosť na posúdenie: formulár spisu + priradené prílohy (viac súborov k jednej prílohe sa spojí). */
export function ziadostSpisu(db: DatabaseSync, id: number): Ziadost {
  const s = spisRiadok(db, id);
  if (!s) throw new Error('Spis neexistuje.');
  if (!s.formular_json) throw new Error('Spis nemá údaje formulára žiadosti. Priložte formulár (JSON) alebo zadajte kód žiadosti z ITMS21+.');
  const z = JSON.parse(s.formular_json) as Ziadost;
  z.kod ||= cisloSpisu(s.id, s.prijate);
  // Dátum predloženia sa nedopĺňa dátumom nahratia do podateľne: rozhoduje odoslanie do e-schránky poskytovateľa (MD č. 21)
  // a neskoršie nahratie by vybralo neskoršie kolo, teda iné znenie výzvy (napr. bez povinnej prílohy). Bez dátumu
  // idú včasnosť (F01), harmonogram (D14) a výber znenia (VER-KOLO) kontrolórovi.
  z.prilohy = prilohySpisu(db, id);
  return z;
}

function prilohySpisu(db: DatabaseSync, id: number, pred?: string) {
  const prilohy: Record<string, Priloha> = {};
  const maOdhad = new Set<string>();
  const riadky = db.prepare("SELECT id, priloha, nazov, text, istota, chyba, cesta FROM subory WHERE spis_id = ? AND typ = 'priloha' AND (? IS NULL OR nahrate < ?) ORDER BY davka, id")
    .all(id, pred ?? null, pred ?? null) as { id: number; priloha: string; nazov: string; text: string; istota: string; chyba: string | null; cesta: string }[];
  for (const r of riadky) {
    const c = r.priloha; const p = prilohy[c];
    // Nečitateľný súbor (sken, chyba pdftotext) ostane v prílohe bez textu: pravidlo povie „priložený, ale nečitateľný“,
    // nie „chýba“. Do textu ide len čitateľný obsah, aby samotné hlavičky súborov nevyzerali ako text prílohy.
    const citatelny = !r.chyba && r.text.trim().length > 0;
    const text = !citatelny ? (p?.text ?? '') : p?.text ? `${p.text}\n\n=== ${r.nazov} ===\n${r.text}` : r.text;
    // Stačí jeden čitateľný súbor zaradený len odhadom a celá príloha je odhad: jeho text (napr. sprievodný list,
    // ktorý uznesenie len spomína) by inak mohol modelu „dodať“ náležitosť, ktorá v skutočnej prílohe chýba.
    const odhad = citatelny && !jePotvrdene(r.istota);
    if (odhad) maOdhad.add(c);
    prilohy[c] = { nazov: `${p ? `${p.nazov}; ` : ''}${r.nazov}${odhad ? ' (odhad)' : ''}`, text, zaradenie: maOdhad.has(c) ? 'odhad' : 'potvrdene',
      subory: [...(p?.subory ?? []), { suborId: r.id, nazov: r.nazov, text: citatelny ? r.text : '', citatelny, bunky: citatelny ? bunkyZosita(r.nazov, r.cesta) : undefined }] };
  }
  return prilohy;
}

export interface ZdrojFormulara { nazov: string; text: string; suborId?: number }
type UlozenyFormular = { id: number; nazov: string; text: string };

/** JSON odkaz obsahuje iba kód. Hodnoty sa vtedy citujú z výpisu, ktorý sa uložil pri príjme. */
export function zdrojFormulara(db: DatabaseSync, s: SpisRiadok): ZdrojFormulara | undefined {
  if (!s.formular_json) return;
  const z = JSON.parse(s.formular_json) as Ziadost;
  if (s.formular_zdroj?.startsWith('ITMS21+ (')) return { nazov: `Uložený výpis ITMS21+ · ${z.kod}`, text: JSON.stringify(z, null, 2) };
  const kandidati = db.prepare("SELECT id, nazov, text FROM subory WHERE spis_id = ? AND (id = ? OR (? IS NULL AND typ = 'formular')) ORDER BY id")
    .all(s.id, s.formular_subor_id, s.formular_subor_id) as UlozenyFormular[];
  const zhodne = kandidati.filter(k => {
    try { return isDeepStrictEqual(JSON.parse(JSON.stringify(formularZJson(k.text, s.vyzva, () => undefined).ziadost)), z); }
    catch { return false; }
  });
  if (zhodne.length === 1) return { suborId: zhodne[0].id, nazov: zhodne[0].nazov, text: zhodne[0].text };
}

/** Pri starých posudkoch chýba história priradenia súborov. Rekonštruovať sa dá iba jednoznačné pôvodné podanie. */
export function historickePodklady(db: DatabaseSync, s: SpisRiadok, pred: string) {
  const subory = db.prepare('SELECT id, nazov, text, typ, istota FROM subory WHERE spis_id = ? AND nahrate < ? ORDER BY id')
    .all(s.id, pred) as (UlozenyFormular & { typ: string; istota: string })[];
  const kandidati = subory.filter(f => f.typ === 'formular' && /\.json$/i.test(f.nazov));
  if (kandidati.length !== 1 || subory.some(f => f.istota === 'rucne')) return;
  const f = kandidati[0];
  // Odkaz na register bez vtedajšieho výpisu ani súčasná verzia formulára nemôžu doložiť staré hodnoty.
  let z: Ziadost;
  try { z = formularZJson(f.text, s.vyzva, () => undefined).ziadost; } catch { return; }
  z.prilohy = prilohySpisu(db, s.id, pred);
  return { z, formular: { suborId: f.id, nazov: f.nazov, text: f.text } };
}

/**
 * Posudok sa stane aktuálnym posudkom spisu (podkladom výzvy na doplnenie) len vtedy, keď vychádza zo súčasnej verzie
 * podkladov a nezačal skôr ako aktuálny posudok tej istej verzie. Inak ostane len v histórii a vráti false:
 * pomalý posudok spustený pred doplnením by inak po dokončení prepísal novší výsledok a výzva by žiadala už doplnené.
 */
export function ulozPosudok(db: DatabaseSync, spisId: number, posudokId: number, navrh: Navrh, verzia = verziaSpisu(db, spisId), zaciatok = new Date().toISOString()): boolean {
  if (verziaSpisu(db, spisId) !== verzia) return false;
  const aktualny = db.prepare('SELECT p.verzia_spisu AS verzia, p.zaciatok FROM spisy s JOIN posudky p ON p.id = s.posudok_id WHERE s.id = ?').get(spisId) as { verzia: string | null; zaciatok: string | null } | undefined;
  if (aktualny?.verzia === verzia && aktualny.zaciatok && aktualny.zaciatok > zaciatok) return false;
  db.prepare("UPDATE spisy SET posudok_id = ?, navrh = ?, stav = CASE WHEN rozhodnutie IS NULL OR rozhodnutie = 'doplnenie' THEN 'posudena' ELSE stav END WHERE id = ?").run(posudokId, navrh, spisId);
  return true;
}

/** Údaje odoslanej výzvy na doplnenie, ktoré kontrolór zadá pri rozhodnutí „Výzva na doplnenie“. */
export interface OdoslanaVyzva { odoslana: Den; lehotaDni: number; polozky: string[] | null; text: string | null }

/** Rozhodnutie kontrolóra. Pri výzve na doplnenie sa v tej istej transakcii zapíše aj výzva, od ktorej plynie lehota. */
export function rozhodni(db: DatabaseSync, spisId: number, r: Rozhodnutie, poznamka: string, vyzva?: OdoslanaVyzva) {
  if (!ROZHODNUTIA[r]) throw new Error('Neznáme rozhodnutie.');
  db.exec('BEGIN');
  try {
    db.prepare('UPDATE spisy SET rozhodnutie = ?, rozhodnutie_pozn = ?, rozhodnutie_cas = ?, stav = ? WHERE id = ?')
      .run(r, poznamka.slice(0, 2000), new Date().toISOString(), r === 'doplnenie' ? 'caka_na_doplnenie' : 'rozhodnuta', spisId);
    if (r === 'doplnenie' && vyzva) ulozVyzvu(db, spisId, vyzva);
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
}

// ---------- výzvy na doplnenie a ich lehoty
interface VyzvaRiadok {
  id: number; spis_id: number; posudok_id: number | null; davka_od: number; vytvorena: string; odoslana: Den; dorucena: Den | null;
  lehota_dni: number; predlzene_do: Den | null; predlzenie_pozn: string | null; polozky: string | null; text: string | null; opravy: string | null;
}
/** Oprava záznamu odoslanej výzvy: čas a pôvodná a nová hodnota zmenených údajov (text a body len či sa zmenili). */
export interface OpravaVyzvy { cas: string; odoslana?: [Den, Den]; lehotaDni?: [number, number]; text?: true; polozky?: true }
const pridajOpravu = (r: VyzvaRiadok, o: Omit<OpravaVyzvy, 'cas'>): string | null => {
  const opravy: OpravaVyzvy[] = [...(r.opravy ? JSON.parse(r.opravy) : []), ...(Object.keys(o).length ? [{ cas: new Date().toISOString(), ...o }] : [])];
  return opravy.length ? JSON.stringify(opravy) : null;
};

/**
 * Zapíše odoslanú výzvu. Opätovné uloženie rozhodnutia k tomu istému posudku výzvu opraví (deň odoslania, lehota,
 * text) a opravu zapíše do jej histórie; doručenka a predĺženie ostanú. Nový posudok (po doplnení) znamená novú výzvu.
 * Lehota v evidencii sa musí zhodovať s lehotou v texte výzvy, ktorý sa uloží (aj s textom uloženým skôr): inak by
 * aplikácia sledovala inú lehotu, než dostal žiadateľ. Predĺženie lehoty sa zapisuje osobitne (upravLehotu).
 */
function ulozVyzvu(db: DatabaseSync, spisId: number, v: OdoslanaVyzva) {
  const posudok = (db.prepare('SELECT posudok_id FROM spisy WHERE id = ?').get(spisId) as { posudok_id: number | null }).posudok_id;
  const posledna = db.prepare('SELECT * FROM vyzvy_doplnenie WHERE spis_id = ? ORDER BY id DESC LIMIT 1').get(spisId) as unknown as VyzvaRiadok | undefined;
  const polozky = v.polozky ? JSON.stringify(v.polozky) : null;
  const oprava = !!posledna && posledna.posudok_id === posudok;
  const text = v.text ?? (oprava ? posledna!.text : null);
  const ine = text ? lehotyVTexte(text).filter((n) => n !== v.lehotaDni) : [];
  if (ine.length) throw new Error(`Text výzvy uvádza lehotu ${ine.join(' a ')} pracovných dní, zadaná lehota je ${v.lehotaDni}. Evidencia musí zodpovedať textu, ktorý žiadateľ dostal. `
    + (oprava ? 'Ak poskytovateľ lehotu predĺžil, zapíšte predĺženie s dôvodom v časti „Lehota na doplnenie“. Ak bol chybný zápis, opravte lehotu aj text podľa skutočne odoslanej výzvy.' : 'Zosúlaďte lehotu s textom výzvy.'));
  if (oprava) {
    const p = posledna!;
    const zmena: Omit<OpravaVyzvy, 'cas'> = {
      ...(p.odoslana !== v.odoslana ? { odoslana: [p.odoslana, v.odoslana] as [Den, Den] } : {}),
      ...(p.lehota_dni !== v.lehotaDni ? { lehotaDni: [p.lehota_dni, v.lehotaDni] as [number, number] } : {}),
      ...(v.text != null && v.text !== p.text ? { text: true as const } : {}),
      ...(polozky != null && polozky !== p.polozky ? { polozky: true as const } : {}),
    };
    db.prepare('UPDATE vyzvy_doplnenie SET odoslana = ?, lehota_dni = ?, polozky = COALESCE(?, polozky), text = COALESCE(?, text), opravy = ? WHERE id = ?')
      .run(v.odoslana, v.lehotaDni, polozky, v.text, pridajOpravu(p, zmena), p.id);
    return;
  }
  db.prepare('INSERT INTO vyzvy_doplnenie (spis_id, posudok_id, davka_od, vytvorena, odoslana, lehota_dni, polozky, text) VALUES (?,?,?,?,?,?,?,?)')
    .run(spisId, posudok, poslednaDavka(db, spisId) + 1, new Date().toISOString(), v.odoslana, v.lehotaDni, polozky, v.text);
}

/**
 * Údaje o lehote, ktoré kontrolór dopĺňa postupne: deň odoslania, deň doručenia z elektronickej doručenky
 * a predĺženie lehoty (MD č. 21, kap. 2.4 ods. 8). `undefined` = nemeniť, `null` = vymazať.
 * Nezmyselné dátumy odmietne: v lehote by posunuli koniec a mohli ukázať „včas“ tam, kde nie je.
 */
export function upravLehotu(db: DatabaseSync, spisId: number, vyzvaId: number, zmena: { odoslana?: Den; dorucena?: Den | null; predlzeneDo?: Den | null; predlzeniePozn?: string | null }, dnes: Den) {
  const v = db.prepare('SELECT * FROM vyzvy_doplnenie WHERE id = ? AND spis_id = ?').get(vyzvaId, spisId) as unknown as VyzvaRiadok | undefined;
  if (!v) throw new Error('Táto výzva v spise nie je.');
  const n = {
    odoslana: zmena.odoslana ?? v.odoslana,
    dorucena: zmena.dorucena === undefined ? v.dorucena : zmena.dorucena,
    predlzeneDo: zmena.predlzeneDo === undefined ? v.predlzene_do : zmena.predlzeneDo,
    predlzeniePozn: (zmena.predlzeniePozn === undefined ? v.predlzenie_pozn : zmena.predlzeniePozn)?.trim().slice(0, 500) || null,
  };
  for (const [pole, d] of [['odoslania', n.odoslana], ['doručenia', n.dorucena], ['konca predĺženia', n.predlzeneDo]] as const)
    if (d !== null && !jeDen(d)) throw new Error(`Dátum ${pole} nie je platný deň (RRRR-MM-DD).`);
  if (n.odoslana > dnes) throw new Error('Výzva nemôže byť odoslaná v budúcnosti.');
  if (n.dorucena && n.dorucena < n.odoslana) throw new Error(`Výzva nemohla byť doručená skôr, ako bola odoslaná (${skDen(n.odoslana)}).`);
  if (n.dorucena && n.dorucena > dnes) throw new Error('Deň doručenia nemôže byť v budúcnosti.');
  if (n.predlzeneDo && n.predlzeneDo < n.odoslana) throw new Error('Predĺžená lehota nemôže skončiť pred odoslaním výzvy.');
  if (n.predlzeneDo && !n.predlzeniePozn) throw new Error('Pri predĺžení uveďte, na základe čoho ho poskytovateľ povolil (napr. žiadosť žiadateľa a jej dátum).');
  // Zmena dňa odoslania je oprava záznamu, nie bežné doplnenie údaja: zapíše sa do histórie opráv výzvy.
  const opravy = pridajOpravu(v, n.odoslana !== v.odoslana ? { odoslana: [v.odoslana, n.odoslana] } : {});
  db.prepare('UPDATE vyzvy_doplnenie SET odoslana = ?, dorucena = ?, predlzene_do = ?, predlzenie_pozn = ?, opravy = ? WHERE id = ?')
    .run(n.odoslana, n.dorucena, n.predlzeneDo, n.predlzeniePozn, opravy, vyzvaId);
}

export interface LehotaVyzvy {
  id: number; poradie: number; posudokId: number | null; davkaOd: number; vytvorena: string; odoslana: Den; dorucena: Den | null;
  lehotaDni: number; predlzeneDo: Den | null; predlzeniePozn: string | null; polozky: string[] | null; text: string | null;
  opravy: OpravaVyzvy[]; stav: StavLehoty;
}
/** Výzvy na doplnenie v spise so stavom lehoty k dňu `dnes`, najnovšia prvá. */
export function lehotySpisu(db: DatabaseSync, spisId: number, dnes: Den): LehotaVyzvy[] {
  const vyzvy = db.prepare('SELECT * FROM vyzvy_doplnenie WHERE spis_id = ? ORDER BY id').all(spisId) as unknown as VyzvaRiadok[];
  if (!vyzvy.length) return [];
  const davky = db.prepare('SELECT davka, MAX(odoslane) AS odoslane FROM subory WHERE spis_id = ? GROUP BY davka ORDER BY davka').all(spisId) as { davka: number; odoslane: Den | null }[];
  return vyzvy.map((v, i) => {
    const doDavky = vyzvy[i + 1]?.davka_od ?? Infinity;
    const odpovede = davky.filter((d) => d.davka >= v.davka_od && d.davka < doDavky);
    return {
      id: v.id, poradie: i + 1, posudokId: v.posudok_id, davkaOd: v.davka_od, vytvorena: v.vytvorena, odoslana: v.odoslana, dorucena: v.dorucena,
      lehotaDni: v.lehota_dni, predlzeneDo: v.predlzene_do, predlzeniePozn: v.predlzenie_pozn, polozky: v.polozky ? JSON.parse(v.polozky) : null, text: v.text,
      opravy: v.opravy ? JSON.parse(v.opravy) : [],
      stav: stavLehoty({ odoslana: v.odoslana, dorucena: v.dorucena, lehotaDni: v.lehota_dni, predlzeneDo: v.predlzene_do }, odpovede, dnes),
    };
  }).reverse();
}

export function vymazSpis(db: DatabaseSync, spisId: number) {
  db.prepare('DELETE FROM vyzvy_doplnenie WHERE spis_id = ?').run(spisId);
  db.prepare('DELETE FROM subory WHERE spis_id = ?').run(spisId);
  db.prepare('UPDATE posudky SET spis_id = NULL WHERE spis_id = ?').run(spisId);
  db.prepare('DELETE FROM spisy WHERE id = ?').run(spisId);
  fs.rmSync(path.join(ULOZISKO, String(spisId)), { recursive: true, force: true });
}

// ---------- prehľad podľa výziev
export interface VyzvaRegister {
  kod: string; nazov: string; vyhlasovatel: string; maPravidla: boolean; stav: string;
  itms: { predlozenych: number; schvalenych: number; neschvalenych: number; vKonani: number; zasobnik?: number; nesplnili?: number; zastavenych?: number } | null;
}

const citajJson = (p: string) => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null);
/** Výzvy, ktoré majú balík pravidiel pre žiadosť o NFP: len do nich sa dá podanie posúdiť. */
export const vyzvySPravidlami = () => fs.readdirSync(path.join(KOREN, 'packs')).filter((d) => fs.existsSync(path.join(KOREN, 'packs', d, 'zonfp.json')));

/**
 * Register výziev pre prehľad: zoznam výziev programu z ITMS21+ (počty predložených, schválených a neschválených
 * žiadostí) doplnený o výzvy s balíkom pravidiel. Pri nich sú počty spočítané zo stiahnutých žiadostí, s rozpadom
 * neschválených na zásobník (podmienky splnila, chýbali peniaze), nesplnenie podmienok a zastavenie konania.
 */
export function registerVyziev(): VyzvaRegister[] {
  const dnes = new Date().toISOString().slice(0, 10);
  const stav = (v: any) => (v.zrusena ? 'zrušená' : v.pozastavena ? 'pozastavená' : v.uzavreta ? 'uzavretá' : v.ukoncena && v.ukoncena < dnes ? 'skončená' : 'otvorená');
  const out = new Map<string, VyzvaRegister>();
  for (const v of citajJson(path.join(KOREN, 'data', 'odvodene', 'vyzvy.json'))?.vyzvy ?? []) {
    out.set(v.kod, { kod: v.kod, nazov: v.nazov, vyhlasovatel: v.vyhlasovatel ?? '', maPravidla: false, stav: stav(v),
      itms: v.predlozenych == null ? null : { predlozenych: v.predlozenych, schvalenych: v.schvalenych ?? 0, neschvalenych: v.neschvalenych ?? 0, vKonani: v.vKonani ?? 0 } });
  }
  for (const kod of vyzvySPravidlami()) {
    const b = citajJson(path.join(KOREN, 'packs', kod, 'zonfp.json'));
    const z = citajJson(path.join(KOREN, 'data', 'odvodene', kod, 'ziadosti.json')) as Ziadost[] | null;
    const n = (f: (x: Ziadost) => boolean) => z!.filter(f).length;
    const itms = z?.length ? {
      predlozenych: z.length, schvalenych: n((x) => x.vysledok === 'schvalena'), neschvalenych: n((x) => ['zasobnik', 'neschvalena', 'zastavene', 'stiahnuta'].includes(x.vysledok)),
      vKonani: n((x) => x.vysledok === 'ina'), zasobnik: n((x) => x.vysledok === 'zasobnik'), nesplnili: n((x) => x.vysledok === 'neschvalena'), zastavenych: n((x) => x.vysledok === 'zastavene' || x.vysledok === 'stiahnuta'),
    } : out.get(kod)?.itms ?? null;
    out.set(kod, { kod, nazov: b.vyzvaNazov, vyhlasovatel: b.poskytovatel, maPravidla: true, stav: out.get(kod)?.stav ?? 'uzavretá', itms });
  }
  return [...out.values()];
}

/** Štatistika spisov podateľne za výzvu. Úspešnosť = splnila / (splnila + nesplnila); doplnenie je ešte otvorené. */
export function statistikaSpisov(db: DatabaseSync) {
  const out = new Map<string, { spolu: number; posudene: number; navrhy: Record<string, number>; splnila: number; nesplnila: number; doplnenie: number; nerozhodnute: number; odlisne: number }>();
  for (const s of db.prepare('SELECT vyzva, navrh, rozhodnutie FROM spisy').all() as { vyzva: string; navrh: Navrh | null; rozhodnutie: Rozhodnutie | null }[]) {
    const v = out.get(s.vyzva) ?? { spolu: 0, posudene: 0, navrhy: {}, splnila: 0, nesplnila: 0, doplnenie: 0, nerozhodnute: 0, odlisne: 0 };
    v.spolu++;
    if (s.navrh) { v.posudene++; v.navrhy[s.navrh] = (v.navrhy[s.navrh] ?? 0) + 1; }
    if (s.rozhodnutie) v[s.rozhodnutie]++; else v.nerozhodnute++;
    // Rozhodnutie proti návrhu softvéru: kontrolór schválil napriek zistenému porušeniu, alebo zamietol bez zistení.
    if ((s.rozhodnutie === 'splnila' && s.navrh === 'nesplnene_podmienky') || (s.rozhodnutie === 'nesplnila' && (s.navrh === 'bez_zisteni' || s.navrh === 'ciastocne_overene'))) v.odlisne++;
    out.set(s.vyzva, v);
  }
  return out;
}
