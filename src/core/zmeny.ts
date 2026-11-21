// Zmeny výzvy v ITMS21+. Balíky pravidiel vznikli z určitého stavu výzvy v ITMS21+ (verzie, dokumenty, PPP, termíny,
// aktuality). Stav, ktorý naposledy posúdil človek, je v packs/<výzva>/itms/stav-vyzvy.json (základ). Kontrola zmien
// (npm run zmeny) ho porovná so živým detailom výzvy a výsledok zapíše do data/odvodene/<výzva>/zmeny-vyzvy.json.
// Posudok z neho pridá bod na preverenie: VER-ITMS, kým človek zistené zmeny neposúdi, a VER-KONTROLA, keď kontrola
// chýba alebo je staršia ako MAX_VEK_KONTROLY_DNI. Z ITMS21+ sa iba číta verejné API, nič sa neodosiela.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import type { BalikPravidiel, Citacia, Nalez } from './typy.ts';

const KOREN = path.join(import.meta.dirname, '..', '..');
export const ITMS_API = 'https://api.itms21.sk/public/v1';

/**
 * Po koľkých dňoch je kontrola zmien stará. Zmena výzvy v celom rozsahu (§ 14 ods. 4) platí od kola, v ktorom vyšla,
 * a kolá sa uzatvárajú každý piatok; zmena formálnych náležitostí a príloh (§ 14 ods. 6) môže prísť kedykoľvek a týka sa
 * aj žiadostí, o ktorých sa ešte nerozhodlo. Týždeň teda zodpovedá jednému kolu.
 */
export const MAX_VEK_KONTROLY_DNI = 7;

/** Stav výzvy v ITMS21+ v tvare na porovnanie. Dlhé texty (popis PPP, text aktuality) len ako odtlačok, bez kontaktov. */
export interface StavVyzvyItms {
  itmsId: number;
  verzie: { cislo: number; id: number; datum: string | null }[];
  dokumenty: { uuid: string; nazov: string }[];
  ppp: { cislo: number; nazov: string; odtlacok: string }[];
  stav: { datumUkoncenia: string | null; uzavreta: boolean; pozastavene: boolean; zrusena: boolean };
  aktuality: { datum: string | null; nazov: string; odtlacok: string }[];
}

/** Základ: stav, ktorý posúdil človek, verzie výzvy, na ktoré sa nevzťahuje žiadny balík (s dôvodom), a citácia výzvy o zmenách. */
export interface ZakladZmien extends StavVyzvyItms {
  vyzva: string;
  prevzate: { kedy: string; kto: string; poznamka: string; stiahnute: string };
  bezBalika: { cislo: number; dovod: string }[];
  citacia: Citacia;
}

export interface ZmenaVyzvy {
  druh: 'verzia' | 'nepokryta_verzia' | 'dokument' | 'ppp' | 'stav' | 'aktualita';
  popis: string;
  datum: string | null;
}

/** Výsledok kontroly zmien: kedy prebehla, z čoho (živé ITMS21+ alebo uložený detail) a zmeny oproti základu. */
export interface KontrolaZmien {
  vyzva: string;
  zistene: string;
  zdroj: 'itms' | 'ulozeny';
  stiahnute: string;
  zakladZ: string;
  zmeny: ZmenaVyzvy[];
}

const datumSk = (d: string) => d.slice(0, 10).split('-').reverse().join('. ');
/** Dátum z ITMS21+ (ms o polnoci stredoeurópskeho času) ako YYYY-MM-DD; posun o 3 h ako v scripts/07-stiahni-vyzvy.ts. */
const datumItms = (ms: number | null | undefined) => (ms ? new Date(ms + 3 * 3600_000).toISOString().slice(0, 10) : null);
const odtlacok = (x: unknown) => crypto.createHash('sha256').update(JSON.stringify(x ?? null)).digest('hex').slice(0, 16);
const cestaZakladu = (vyzva: string) => path.join(KOREN, 'packs', vyzva, 'itms', 'stav-vyzvy.json');
const cestaKontroly = (vyzva: string) => path.join(KOREN, 'data', 'odvodene', vyzva, 'zmeny-vyzvy.json');
const priecinokDetailov = (vyzva: string) => path.join(KOREN, 'data', 'raw', 'itms21', vyzva, 'zmeny');

/** Detail výzvy z ITMS21+ (GET /vyzva/id/{id}) v tvare na porovnanie. Polia, ktoré sa menia bez zmeny výzvy (počty žiadostí, updatedAt), vynechá. */
export function stavZItms(d: any): StavVyzvyItms {
  const prilohy = (p: any[]) => [...(p ?? [])].sort((a, b) => (a.poradoveCislo ?? 0) - (b.poradoveCislo ?? 0))
    .map((x) => [x.poradoveCislo ?? null, x.nazovSk ?? null, x.sposobPredlozenia ?? null, x.prilohaPovinna ?? null]);
  return {
    itmsId: d.id,
    verzie: (d.verzia ?? []).map((x: any) => ({ cislo: x.cislo, id: x.id, datum: datumItms(x.datumVykonaniaZmeny) }))
      .sort((a: any, b: any) => a.cislo - b.cislo),
    dokumenty: (d.dokument ?? []).map((x: any) => ({ uuid: x.uuid, nazov: x.nazov })).sort((a: any, b: any) => a.uuid.localeCompare(b.uuid)),
    ppp: (d.podmienkaPoskytnutiaPrispevku ?? []).map((x: any) => ({ cislo: x.poradoveCislo, nazov: x.nazovSk, odtlacok: odtlacok([x.popisSk ?? null, prilohy(x.priloha)]) }))
      .sort((a: any, b: any) => a.cislo - b.cislo),
    stav: { datumUkoncenia: datumItms(d.datumUkoncenia), uzavreta: !!d.uzavreta, pozastavene: !!d.pozastavenePredkladanieZonfp, zrusena: !!d.zrusena },
    aktuality: (d.aktualitaNaVyzve ?? []).map((x: any) => ({ datum: datumItms(x.datumZverejnenia), nazov: x.nazov, odtlacok: odtlacok(x.text ?? null) }))
      .sort((a: any, b: any) => `${a.datum} ${a.nazov} ${a.odtlacok}`.localeCompare(`${b.datum} ${b.nazov} ${b.odtlacok}`)),
  };
}

/** Verzie výzvy v ITMS21+, ktoré nepokrýva žiadna verzia balíka (itmsVerzie) ani zoznam verzií bez balíka v základe. */
export function nepokryteVerzie(teraz: StavVyzvyItms, baliky: BalikPravidiel[], bezBalika: ZakladZmien['bezBalika']): StavVyzvyItms['verzie'] {
  const pokryte = new Set(baliky.flatMap((b) => b.verziaBalika?.itmsVerzie ?? []));
  return teraz.verzie.filter((v) => !pokryte.has(v.cislo) && !bezBalika.some((x) => x.cislo === v.cislo));
}

/** Zmeny živého stavu oproti základu a nezrovnalosti medzi verziami výzvy a balíkmi. Prázdne pole = pravidlá zodpovedajú ITMS21+. */
export function porovnajStav(zaklad: ZakladZmien, teraz: StavVyzvyItms, baliky: BalikPravidiel[]): ZmenaVyzvy[] {
  const zmeny: ZmenaVyzvy[] = [];
  const pridaj = (druh: ZmenaVyzvy['druh'], popis: string, datum: string | null = null) => zmeny.push({ druh, popis, datum });
  const zo = (d: string | null) => (d ? ` zo dňa ${datumSk(d)}` : '');

  for (const v of teraz.verzie) {
    const s = zaklad.verzie.find((x) => x.cislo === v.cislo);
    if (!s) pridaj('verzia', `Nová verzia výzvy č. ${v.cislo}${zo(v.datum)}.`, v.datum);
    else if (s.datum !== v.datum || s.id !== v.id) pridaj('verzia', `Verzia výzvy č. ${v.cislo} má v ITMS21+ iný dátum alebo identifikátor (${s.datum ?? '–'} → ${v.datum ?? '–'}).`, v.datum);
  }
  for (const s of zaklad.verzie) if (!teraz.verzie.some((v) => v.cislo === s.cislo)) pridaj('verzia', `Verzia výzvy č. ${s.cislo} už v ITMS21+ nie je.`);
  for (const v of nepokryteVerzie(teraz, baliky, zaklad.bezBalika))
    pridaj('nepokryta_verzia', `Verzia výzvy č. ${v.cislo}${zo(v.datum)} nemá balík pravidiel: nie je v itmsVerzie žiadnej verzie balíka ani medzi verziami bez balíka.`, v.datum);
  for (const b of baliky) for (const c of b.verziaBalika?.itmsVerzie ?? [])
    if (!teraz.verzie.some((v) => v.cislo === c)) pridaj('nepokryta_verzia', `Balík pre znenie ${b.verzia} sa odvoláva na verziu výzvy č. ${c}, ktorú ITMS21+ nemá.`);

  for (const d of teraz.dokumenty) {
    const s = zaklad.dokumenty.find((x) => x.uuid === d.uuid);
    if (!s) pridaj('dokument', `Nový dokument výzvy: ${d.nazov}.`);
    else if (s.nazov !== d.nazov) pridaj('dokument', `Dokument výzvy premenovaný: ${s.nazov} → ${d.nazov}.`);
  }
  for (const s of zaklad.dokumenty) if (!teraz.dokumenty.some((d) => d.uuid === s.uuid)) pridaj('dokument', `Dokument výzvy odstránený: ${s.nazov}.`);

  // ITMS21+ čísluje PPP podľa abecedy, nie podľa výzvy (napr. EDES je vo výzve PPP č. 15, v ITMS21+ č. 11) a nová PPP
  // posunie čísla ďalších. Podmienky sa preto párujú podľa názvu, číslo z ITMS21+ je len v zátvorke.
  for (const p of teraz.ppp) {
    const s = zaklad.ppp.find((x) => x.nazov === p.nazov);
    if (!s) pridaj('ppp', `Nová alebo premenovaná podmienka poskytnutia príspevku: ${p.nazov} (v ITMS21+ č. ${p.cislo}).`);
    else if (s.odtlacok !== p.odtlacok) pridaj('ppp', `Podmienka poskytnutia príspevku „${p.nazov}“ (v ITMS21+ č. ${p.cislo}) má zmenený popis alebo prílohy.`);
  }
  for (const s of zaklad.ppp) if (!teraz.ppp.some((p) => p.nazov === s.nazov)) pridaj('ppp', `Podmienka poskytnutia príspevku „${s.nazov}“ (v ITMS21+ bola č. ${s.cislo}) už v ITMS21+ nie je.`);

  const [a, b] = [zaklad.stav, teraz.stav];
  if (a.datumUkoncenia !== b.datumUkoncenia) pridaj('stav', `Termín ukončenia výzvy sa zmenil: ${a.datumUkoncenia ? datumSk(a.datumUkoncenia) : 'bez termínu'} → ${b.datumUkoncenia ? datumSk(b.datumUkoncenia) : 'bez termínu'}.`);
  if (a.uzavreta !== b.uzavreta) pridaj('stav', b.uzavreta ? 'Výzva je v ITMS21+ uzavretá.' : 'Výzva už v ITMS21+ nie je uzavretá.');
  if (a.pozastavene !== b.pozastavene) pridaj('stav', b.pozastavene ? 'Predkladanie žiadostí je pozastavené.' : 'Predkladanie žiadostí už nie je pozastavené.');
  if (a.zrusena !== b.zrusena) pridaj('stav', b.zrusena ? 'Výzva je zrušená.' : 'Výzva už nie je zrušená.');

  const kluc = (x: StavVyzvyItms['aktuality'][number]) => `${x.datum} ${x.nazov} ${x.odtlacok}`;
  for (const x of teraz.aktuality) if (!zaklad.aktuality.some((s) => kluc(s) === kluc(x))) pridaj('aktualita', `Nová alebo upravená aktualita k výzve${zo(x.datum)}: ${x.nazov}.`, x.datum);
  for (const s of zaklad.aktuality) if (!teraz.aktuality.some((x) => kluc(x) === kluc(s))) pridaj('aktualita', `Aktualita k výzve${zo(s.datum)} už nie je v pôvodnom znení: ${s.nazov}.`, s.datum);
  return zmeny;
}

export function nacitajZakladZmien(vyzva: string): ZakladZmien | null {
  const f = cestaZakladu(vyzva);
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null;
}

export function nacitajKontroluZmien(vyzva: string): KontrolaZmien | null {
  const f = cestaKontroly(vyzva);
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null;
}

const dnesLokalne = () => new Date().toLocaleDateString('sv-SE');
/** Miestny dátum (YYYY-MM-DD) z času ISO; neplatný čas = null. */
const lokalnyDatum = (iso: string | undefined) => { const t = Date.parse(iso ?? ''); return Number.isFinite(t) ? new Date(t).toLocaleDateString('sv-SE') : null; };

/**
 * Vek údajov výzvy v dňoch: od stiahnutia detailu z ITMS21+, s ktorým kontrola porovnávala, nie od behu kontroly.
 * Kontrola bez siete (--offline) nad starým uloženým detailom by inak vyzerala čerstvo. Neznámy dátum stiahnutia = null.
 */
export function vekUdajovDni(k: KontrolaZmien, dnes: string = dnesLokalne()): number | null {
  const d = lokalnyDatum(k.stiahnute);
  const vek = d ? Math.floor((Date.parse(dnes) - Date.parse(d)) / 86_400_000) : NaN;
  return Number.isFinite(vek) ? vek : null;
}

/**
 * Body posudku z kontroly zmien (druh verzia, vždy na preverenie, aby zastarané pravidlá nedali čistý výsledok):
 * VER-KONTROLA, keď kontrola chýba alebo údaje výzvy, s ktorými porovnávala, sú staršie ako MAX_VEK_KONTROLY_DNI
 * (alebo sa ich vek nedá určiť); VER-ITMS, keď kontrola našla zmeny, ktoré človek ešte neposúdil (npm run zmeny -- --prevzat).
 */
export function nalezyZmienVyzvy(k: KontrolaZmien | null, citacia: Citacia, dnes: string = dnesLokalne()): Nalez[] {
  const bod = (pravidlo: string, nazov: string, zdovodnenie: string): Nalez =>
    ({ pravidlo, ppp: null, nazov, druh: 'verzia', stav: 'na_preverenie', okamih: 'konanie', zdovodnenie, citacia });
  const spusti = 'Kontrolu spustí npm run zmeny alebo tlačidlo na stránke Pravidlá a zdroje.';
  if (!k) return [bod('VER-KONTROLA', 'Kontrola zmien výzvy v ITMS21+', `Zmeny výzvy v ITMS21+ sa ešte nekontrolovali, preto nie je isté, že pravidlá zodpovedajú platnému zneniu výzvy. ${spusti}`)];
  const nalezy: Nalez[] = [];
  const vek = vekUdajovDni(k, dnes);
  const offline = k.zdroj === 'ulozeny' ? ` Kontrola z ${datumSk(lokalnyDatum(k.zistene) ?? k.zistene)} nečítala živé ITMS21+, porovnávala uložený detail.` : '';
  if (vek === null)
    nalezy.push(bod('VER-KONTROLA', 'Kontrola zmien výzvy v ITMS21+', `Nedá sa určiť, kedy boli z ITMS21+ stiahnuté údaje výzvy, s ktorými kontrola zmien porovnávala, preto nie je isté, že pravidlá zodpovedajú platnému zneniu výzvy.${offline} ${spusti}`));
  else if (vek > MAX_VEK_KONTROLY_DNI)
    nalezy.push(bod('VER-KONTROLA', 'Kontrola zmien výzvy v ITMS21+', `Údaje výzvy, s ktorými kontrola zmien porovnávala, boli z ITMS21+ stiahnuté ${datumSk(lokalnyDatum(k.stiahnute)!)}, pred ${vek} dňami (najviac ${MAX_VEK_KONTROLY_DNI}).${offline} Výzva sa odvtedy mohla zmeniť. ${spusti}`));
  if (k.zmeny.length) {
    const zoznam = k.zmeny.slice(0, 4).map((z) => z.popis).join(' ');
    const dalsie = k.zmeny.length > 4 ? ` A ďalšie zmeny (${k.zmeny.length - 4}).` : '';
    nalezy.push(bod('VER-ITMS', 'Neposúdená zmena výzvy v ITMS21+', `Výzva sa v ITMS21+ zmenila oproti stavu, ktorý naposledy posúdil človek (${datumSk(k.zakladZ)}), a pravidlá to ešte nezohľadňujú: ${zoznam}${dalsie} Zmena v celom rozsahu (§ 14 ods. 4 zákona č. 121/2022 Z. z.) platí pre kolo, v ktorom vyšla, a nasledujúce; zmena formálnych náležitostí, príloh a ďalších skutočností (§ 14 ods. 6) sa môže týkať aj žiadostí, o ktorých sa ešte nerozhodlo. Kontrolór zmenu posúdi, doplní balík pravidiel a zmenu prevezme (npm run zmeny -- --prevzat).`));
  }
  return nalezy;
}

/**
 * Posledný uložený detail výzvy: z kontrol zmien, inak zo stiahnutia žiadostí (scripts/01-stiahni-ziadosti.ts).
 * Kedy bol stiahnutý: z názvu vyzva-YYYY-MM-DD.json.gz (dátum UTC, ktorý zapisuje skontrolujZmeny; berie sa začiatok dňa,
 * teda skôr, nie neskôr), pri vyzva.json.gz zo stiahnutia žiadostí (meta.json). Čas zmeny súboru sa mení pri kopírovaní,
 * preto len obmedzuje zhora (berie sa skorší z časov) a sám rozhoduje, len keď iný údaj nie je.
 */
function ulozenyDetail(vyzva: string): { detail: any; stiahnute: string } | null {
  const dir = priecinokDetailov(vyzva);
  const kontroly = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /^vyzva-\d{4}-\d{2}-\d{2}\.json\.gz$/.test(f)).sort() : [];
  const subor = kontroly.length ? path.join(dir, kontroly[kontroly.length - 1]) : path.join(KOREN, 'data', 'raw', 'itms21', vyzva, 'vyzva.json.gz');
  if (!fs.existsSync(subor)) return null;
  const zNazvu = path.basename(subor).match(/^vyzva-(\d{4}-\d{2}-\d{2})\.json\.gz$/)?.[1];
  const meta = path.join(path.dirname(subor), 'meta.json');
  const zMeta = !zNazvu && fs.existsSync(meta) ? JSON.parse(fs.readFileSync(meta, 'utf8')).stiahnute as string | undefined : undefined;
  const casy = [zNazvu ? `${zNazvu}T00:00:00.000Z` : zMeta, fs.statSync(subor).mtime.toISOString()].filter((x): x is string => !!x && Number.isFinite(Date.parse(x)));
  const stiahnute = new Date(Math.min(...casy.map((x) => Date.parse(x)))).toISOString();
  return { detail: JSON.parse(zlib.gunzipSync(fs.readFileSync(subor)).toString('utf8')), stiahnute };
}

/**
 * Skontroluje zmeny výzvy: stiahne detail z ITMS21+ (alebo použije uložený, offline), porovná ho so základom a výsledok
 * zapíše do data/odvodene/<výzva>/zmeny-vyzvy.json. Baliky = všetky verzie balíka výzvy (verzieBalika).
 */
export async function skontrolujZmeny(vyzva: string, baliky: BalikPravidiel[], m: { offline?: boolean } = {}): Promise<{ kontrola: KontrolaZmien; teraz: StavVyzvyItms }> {
  const zaklad = nacitajZakladZmien(vyzva);
  if (!zaklad) throw new Error(`Výzva ${vyzva} nemá základ zmien (packs/${vyzva}/itms/stav-vyzvy.json).`);
  let detail: any, stiahnute: string, zdroj: KontrolaZmien['zdroj'];
  if (m.offline) {
    const u = ulozenyDetail(vyzva);
    if (!u) throw new Error(`Výzva ${vyzva} nemá uložený detail z ITMS21+.`);
    ({ detail, stiahnute } = u); zdroj = 'ulozeny';
  } else {
    const r = await fetch(`${ITMS_API}/vyzva/id/${zaklad.itmsId}`, { signal: AbortSignal.timeout(90_000) });
    if (!r.ok) throw new Error(`ITMS21+ vrátilo HTTP ${r.status} pre detail výzvy ${zaklad.itmsId}.`);
    detail = await r.json(); stiahnute = new Date().toISOString(); zdroj = 'itms';
    fs.mkdirSync(priecinokDetailov(vyzva), { recursive: true });
    fs.writeFileSync(path.join(priecinokDetailov(vyzva), `vyzva-${stiahnute.slice(0, 10)}.json.gz`), zlib.gzipSync(JSON.stringify(detail)));
  }
  const teraz = stavZItms(detail);
  const kontrola: KontrolaZmien = { vyzva, zistene: new Date().toISOString(), zdroj, stiahnute, zakladZ: zaklad.prevzate.kedy, zmeny: porovnajStav(zaklad, teraz, baliky) };
  fs.mkdirSync(path.dirname(cestaKontroly(vyzva)), { recursive: true });
  fs.writeFileSync(cestaKontroly(vyzva), JSON.stringify(kontrola, null, 1));
  return { kontrola, teraz };
}

/**
 * Človek posúdil zistené zmeny: aktuálny stav sa stane novým základom. Odmietne, kým niektorá verzia výzvy nemá balík
 * (najprv ju treba doplniť do itmsVerzie niektorej verzie balíka, alebo do bezBalika s dôvodom).
 */
export function prevezmiStav(vyzva: string, teraz: StavVyzvyItms, baliky: BalikPravidiel[], poznamka: string, z: Pick<KontrolaZmien, 'stiahnute' | 'zdroj'>): ZakladZmien {
  const { stiahnute } = z;
  const zaklad = nacitajZakladZmien(vyzva);
  if (!zaklad) throw new Error(`Výzva ${vyzva} nemá základ zmien.`);
  if (!poznamka.trim()) throw new Error('Prevzatie zmien potrebuje poznámku: čo človek posúdil a prečo pravidlá stačia (--poznamka "…").');
  const chyba = nepokryteVerzie(teraz, baliky, zaklad.bezBalika);
  if (chyba.length) throw new Error(`Verzie výzvy ${chyba.map((v) => v.cislo).join(', ')} nemajú balík pravidiel. Doplňte ich do itmsVerzie verzie balíka alebo do bezBalika s dôvodom.`);
  const novy: ZakladZmien = { vyzva, ...teraz, prevzate: { kedy: dnesLokalne(), kto: 'človek (npm run zmeny -- --prevzat)', poznamka: poznamka.trim(), stiahnute }, bezBalika: zaklad.bezBalika, citacia: zaklad.citacia };
  fs.writeFileSync(cestaZakladu(vyzva), JSON.stringify(novy, null, 1) + '\n');
  const kontrola: KontrolaZmien = { vyzva, zistene: new Date().toISOString(), zdroj: z.zdroj, stiahnute, zakladZ: novy.prevzate.kedy, zmeny: porovnajStav(novy, teraz, baliky) };
  fs.writeFileSync(cestaKontroly(vyzva), JSON.stringify(kontrola, null, 1));
  return novy;
}
