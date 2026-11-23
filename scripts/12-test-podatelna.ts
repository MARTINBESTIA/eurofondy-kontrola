// Test podateľne bez modelu, na demo podaniach z demo/podania (vytvorí ich scripts/10-demo-podania.ts).
// Overuje celý tok spisu: príjem ZIP, zaradenie príloh, zmenu zaradenia, doplnenie, posúdenie a poistky proti
// falošnému OK pri zaradení len odhadom a pri nečitateľnom súbore. Databáza je v pamäti a súbory spisov idú do
// dočasného priečinka, nie do data/spisy: čísla spisov by sa zhodovali so spismi bežiaceho servera.
// Spustenie: node scripts/12-test-podatelna.ts
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { nacitajBalik, posud } from '../src/core/posud.ts';
import type { Posudok, Stav } from '../src/core/typy.ts';
import { zonfp } from '../src/moduly/zonfp/modul.ts';
import { navrhVyzvy } from '../src/podatelna/vyzva.ts';
import { ChybaVstupu } from '../src/core/chyby.ts';
import { rozbalZip } from '../src/ingest/dokument.ts';
import { zip } from './lib/dokumenty.ts';

// Statické importy sa vykonajú skôr než kód modulu, preto podateľňu (aj doklady, ktoré ju importujú) načítame až po nastavení úložiska.
const ULOZISKO = fs.mkdtempSync(path.join(os.tmpdir(), 'test-podatelna-'));
process.env.SPISY_DIR = ULOZISKO;
const pod = await import('../src/podatelna/podatelna.ts');
const { dolozPosudok } = await import('../src/podatelna/doklady.ts');

const KOREN = path.join(import.meta.dirname, '..');
const DEMO = path.join(KOREN, 'demo', 'podania');
const VYZVA = 'PSK-SIEA-002-2023-DV-EFRR';
if (!fs.existsSync(path.join(DEMO, 'A-Obec-Vzorova.zip'))) { console.error('Chýbajú demo podania: node scripts/10-demo-podania.ts'); process.exit(2); }

const db = new DatabaseSync(':memory:');
db.exec(`CREATE TABLE posudky (id INTEGER PRIMARY KEY, cas TEXT NOT NULL, ziadost_kod TEXT NOT NULL, balik TEXT NOT NULL, verzia TEXT NOT NULL,
  model TEXT, navrh TEXT NOT NULL, upravena INTEGER NOT NULL, trvanie_ms INTEGER NOT NULL, posudok_json TEXT NOT NULL, modul TEXT NOT NULL DEFAULT 'zonfp')`);
pod.pripravDb(db);
const balik = nacitajBalik(VYZVA, 'zonfp');
const SLOTY = zonfp.prilohy(undefined as never);
const zItms = (kod: string) => zonfp.nacitaj(kod);
const subor = (f: string) => ({ nazov: path.basename(f), data: fs.readFileSync(path.join(DEMO, f)) });
const prijmi = (subory: { nazov: string; data: Buffer }[], kodItms?: string) => pod.prijmiPodanie(db, { vyzva: VYZVA, zdroj: 'test', kodItms, subory, sloty: SLOTY, zItms });
const posudSpis = (id: number) => posud(pod.ziadostSpisu(db, id), balik, zonfp, { llm: false });
const stav = (p: Posudok, pravidlo: string): Stav | undefined => p.nalezy.find((n) => n.pravidlo === pravidlo)?.stav;
const suborId = (spis: number, meno: string) => (db.prepare('SELECT id FROM subory WHERE spis_id = ? AND nazov = ?').get(spis, meno) as { id: number }).id;

let chyb = 0; const spisy: number[] = [];
function over(nazov: string, skutocne: unknown, ocakavane: unknown) {
  const ok = JSON.stringify(skutocne) === JSON.stringify(ocakavane);
  if (!ok) chyb++;
  console.log(`${ok ? '✓' : '✗'} ${nazov}${ok ? '' : `: je ${JSON.stringify(skutocne)}, očakáva sa ${JSON.stringify(ocakavane)}`}`);
}

try {
  // A: úplná žiadosť, dva súbory bez čísla prílohy. Sprievodný list sa podľa obsahu odhadne ako Príloha č. 3.
  const a = prijmi([subor('A-Obec-Vzorova.zip')]); spisy.push(a);
  let p = await posudSpis(a);
  over('A: certifikát bez čísla prílohy je len odhad → P06 na preverenie', stav(p, 'P06'), 'na_preverenie');
  over('A: sprievodný list odhadnutý do Prílohy č. 3 strhne aj potvrdené uznesenie na preverenie', stav(p, 'P03'), 'na_preverenie');
  over('A: výrok pred potvrdením nie je OK', p.navrh, 'vyzva_na_doplnenie');
  pod.zmenZaradenie(db, suborId(a, 'Sprievodny_list.pdf'), '', zItms);
  pod.zmenZaradenie(db, suborId(a, 'Energeticky_certifikat_ZS_Vzorova.pdf'), '6', zItms);
  p = await posudSpis(a);
  over('A: po vyradení listu a potvrdení certifikátu sú P03 a P06 splnené', [stav(p, 'P03'), stav(p, 'P06')], ['splnene', 'splnene']);
  // Syntetická Príloha 8 vo vzorke A je DOCX. Záväzný formulár je zošit MS Excel podľa vzoru výzvy, takže P08 = chýba podklad.
  over('A: Príloha 8 ako DOCX nie je záväzný zošit → P08 chýba podklad, výzva na doplnenie', [stav(p, 'P08'), p.navrh], ['chyba_podklad', 'vyzva_na_doplnenie']);
  pod.doplnPodklady(db, a, [{ nazov: 'Priloha_8_Obec_Vzorova.xlsm', data: fs.readFileSync(path.join(DEMO, 'testy', 'Priloha_8_Obec_Vzorova.xlsm')) }], SLOTY, zItms);
  p = await posudSpis(a);
  over('A: po doplnení vyplneného zošita (Excel) je P08 splnená', stav(p, 'P08'), 'splnene');
  // Syntetický zošit vzorky A nemá vyplnený hárok MU Budova, vzorce oprávnených výdavkov (M210, M270) dajú 0.
  // P08b to podľa Prílohy č. 2 výzvy vráti ako absenciu výpočtu výdavkov. Čiastočne overený výrok skúša test 13 (G856).
  over('A: zošit bez výpočtu oprávnených výdavkov → P08b chýba podklad, výrok ostáva výzva na doplnenie', [stav(p, 'P08b'), p.navrh], ['chyba_podklad', 'vyzva_na_doplnenie']);
  over('A: okrem P08b nie je v posudku nič nesplnené ani chýbajúce', p.nalezy.filter((n) => n.pravidlo !== 'P08b' && ['nesplnene', 'chyba_podklad'].includes(n.stav)).map((n) => n.pravidlo), []);

  // B: chýbajú prílohy 6 a 8 → výzva na doplnenie; po doplnení sú priložené.
  const b = prijmi(fs.readdirSync(path.join(DEMO, 'B-Mesto-Ukazkovo')).map((f) => subor(path.join('B-Mesto-Ukazkovo', f)))); spisy.push(b);
  p = await posudSpis(b);
  over('B: chýbajú prílohy č. 6 a 8', [stav(p, 'P06'), stav(p, 'P08'), p.navrh], ['chyba_podklad', 'chyba_podklad', 'vyzva_na_doplnenie']);
  pod.rozhodni(db, b, 'doplnenie', 'test');
  pod.doplnPodklady(db, b, [subor('B-Mesto-Ukazkovo-doplnenie.zip')], SLOTY, zItms);
  p = await posudSpis(b);
  over('B: po doplnení je P06 splnená, P08 len DOCX → záväzný zošit stále chýba', [stav(p, 'P06'), stav(p, 'P08')], ['splnene', 'chyba_podklad']);
  // Zošit inej žiadosti (vzorka A, Obec Vzorová) pri spise mesta Ukážkovo: žiadateľ ani projekt nesedia → človek.
  pod.doplnPodklady(db, b, [{ nazov: 'Priloha_8_Obec_Vzorova.xlsm', data: fs.readFileSync(path.join(DEMO, 'testy', 'Priloha_8_Obec_Vzorova.xlsm')) }], SLOTY, zItms);
  p = await posudSpis(b);
  over('B: zošit cudzej žiadosti → P08 na preverenie, nie splnené', stav(p, 'P08'), 'na_preverenie');
  over('B: stav spisu po doplnení', pod.spisRiadok(db, b)!.stav, 'doplnena');

  // C: úspora 27,4 % a prekročená hodnota za peniaze → nesplnené podmienky.
  const c = prijmi([subor('C-Obec-Skusobna.zip')]); spisy.push(c);
  p = await posudSpis(c);
  over('C: úspora pod 30 % a hodnota za peniaze nad limit', [stav(p, 'D07b'), stav(p, 'D07c'), stav(p, 'D13'), p.navrh], ['nesplnene', 'nesplnene', 'nesplnene', 'nesplnene_podmienky']);

  // D: skutočná žiadosť z ITMS21+ podľa kódu: NFP pod minimom (skutočne neschválená pre nesplnenie podmienok).
  const d = prijmi([], 'NFP401201A973'); spisy.push(d);
  p = await posudSpis(d);
  over('D: ITMS NFP401201A973 – NFP pod minimom', [stav(p, 'D12'), p.navrh], ['nesplnene', 'nesplnene_podmienky']);

  // Poistky: nečitateľné PDF s číslom prílohy + čitateľný súbor tej istej prílohy zaradený len odhadom.
  const formular = fs.readFileSync(path.join(DEMO, 'A-Obec-Vzorova', 'Formular_ZoNFP_Obec_Vzorova.json'));
  const e = prijmi([{ nazov: 'formular.json', data: formular }, { nazov: 'Priloha_7_sken.pdf', data: Buffer.from('%PDF-1.4\nnie je to platne PDF\n%%EOF') }]); spisy.push(e);
  p = await posudSpis(e);
  over('Nečitateľné PDF prílohy č. 7 → chýba podklad (nie splnené)', stav(p, 'P07'), 'chyba_podklad');
  over('Zdôvodnenie hovorí o nečitateľnom súbore', /nečitateľný/.test(p.nalezy.find((n) => n.pravidlo === 'P07')!.zdovodnenie), true);
  pod.doplnPodklady(db, e, [{ nazov: 'technicka_sprava.txt', data: Buffer.from('Projektová dokumentácia – technická správa. Stavba: obnova budovy školy, zateplenie obvodového plášťa a výmena okien.') }], SLOTY, zItms);
  const zaradenie = db.prepare("SELECT priloha, istota FROM subory WHERE spis_id = ? AND nazov = 'technicka_sprava.txt'").get(e) as { priloha: string; istota: string };
  over('Súbor bez čísla s kľúčovým slovom sa odhadne do prílohy č. 7', [zaradenie.priloha, zaradenie.istota], ['7', 'nazov']);
  p = await posudSpis(e);
  over('Nečitateľný súbor s číslom nepotvrdí text odhadnutého súboru → P07 na preverenie', stav(p, 'P07'), 'na_preverenie');

  // Audit A01: pomalý posudok spustený pred doplnením sa dokončí až po posudku doplneného spisu. Server zapíše posudok
  // do histórie s verziou podkladov pri začatí a aktuálnym ho urobí len ulozPosudok; poradie dokončenia tu riadi test.
  const itms = (f: string) => ({ nazov: f, data: fs.readFileSync(path.join(KOREN, 'demo', 'itms', f)) });
  const doHistorie = (spis: number, p: Posudok, verzia: string, zaciatok: string) => {
    const id = Number(db.prepare('INSERT INTO posudky (cas, ziadost_kod, balik, verzia, navrh, upravena, trvanie_ms, posudok_json, spis_id, verzia_spisu, zaciatok) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
      .run(p.cas, p.ziadostKod, p.balik, p.verziaBalika, p.navrh, 0, p.trvanieMs, JSON.stringify(p), spis, verzia, zaciatok).lastInsertRowid);
    return { id, aktualny: pod.ulozPosudok(db, spis, id, p.navrh, verzia, zaciatok) };
  };
  const r = prijmi([itms('02-pred-doplnenim.zip')]); spisy.push(r);
  const v1 = pod.verziaSpisu(db, r), t1 = new Date(Date.now() - 60_000).toISOString();
  const stary = await posudSpis(r);
  pod.doplnPodklady(db, r, [itms('03-doplnenie.zip')], SLOTY, zItms);
  const v2 = pod.verziaSpisu(db, r);
  const novy = await posudSpis(r);
  over('A01: doplnenie zmení verziu podkladov; nový posudok má P06 a P08 splnené', [v1 !== v2, stav(novy, 'P06'), stav(novy, 'P08')], [true, 'splnene', 'splnene']);
  const n1 = doHistorie(r, novy, v2, new Date().toISOString());
  const s1 = doHistorie(r, stary, v1, t1);
  over('A01: nový posudok je aktuálny, starší dokončený neskôr ním nie je', [n1.aktualny, s1.aktualny, pod.spisRiadok(db, r)!.posudok_id], [true, false, n1.id]);
  const det = pod.detailSpisu(db, r)!;
  over('A01: starší posudok je v histórii so svojou verziou podkladov', det.posudky.map((p) => [p.id, p.verziaSpisu]), [[s1.id, v1], [n1.id, v2]]);
  over('A01: aktuálny posudok zodpovedá súčasným podkladom', det.verziaPosledneho, det.verzia);
  over('A01: návrh výzvy z aktuálneho posudku nežiada prílohy 6 ani 8', navrhVyzvy({ posudok: det.posledny, balik, spis: det.spis, sloty: SLOTY }).polozky.filter((x) => /P0[68]/.test(x.id)).map((x) => x.id), []);
  const t2 = new Date().toISOString();
  over('A01: z dvoch posudkov tej istej verzie platí neskôr začatý', [doHistorie(r, novy, v2, t2).aktualny, doHistorie(r, novy, v2, t1).aktualny], [true, false]);
  pod.zmenZaradenie(db, (db.prepare("SELECT id FROM subory WHERE spis_id = ? AND typ = 'priloha' ORDER BY id LIMIT 1").get(r) as { id: number }).id, '', zItms);
  over('A01: po zmene zaradenia je aktuálny posudok zastaraný', pod.detailSpisu(db, r)!.verziaPosledneho !== pod.verziaSpisu(db, r), true);

  // Audit A02: opravený formulár v druhej dávke. Platí formulár z doplnenia, kontrolór môže určiť iný.
  const f0 = JSON.parse(formular.toString('utf8'));
  const fa = prijmi([{ nazov: 'formular.json', data: Buffer.from(JSON.stringify({ ...f0, sumaZiadanaNFP: 190000 })) }]); spisy.push(fa);
  over('A02: NFP 190 000 EUR je pod minimom (D12 nesplnené)', stav(await posudSpis(fa), 'D12'), 'nesplnene');
  const povodny = pod.spisRiadok(db, fa)!.formular_subor_id!;
  pod.doplnPodklady(db, fa, [{ nazov: 'formular-oprava.json', data: Buffer.from(JSON.stringify({ ...f0, sumaZiadanaNFP: 250825.77 })) }], SLOTY, zItms);
  const opraveny = pod.spisRiadok(db, fa)!.formular_subor_id!;
  const posudFa = async () => { const z = pod.ziadostSpisu(db, fa); return dolozPosudok(await posud(z, balik, zonfp, { llm: false }), z, pod.zdrojFormulara(db, pod.spisRiadok(db, fa)!), balik); };
  let pf = await posudFa();
  const d12 = () => pf.nalezy.find((n) => n.pravidlo === 'D12')!;
  over('A02: platí formulár z doplnenia; D12 je splnené a doklad cituje nový súbor', [opraveny !== povodny, d12().stav, d12().doklady?.[0]?.suborId], [true, 'splnene', opraveny]);
  pod.zmenZaradenie(db, povodny, 'formular', zItms);
  pf = await posudFa();
  over('A02: kontrolór vráti pôvodný formulár → D12 znova nesplnené s dokladom z pôvodného súboru', [pod.spisRiadok(db, fa)!.formular_subor_id, d12().stav, d12().doklady?.[0]?.suborId], [povodny, 'nesplnene', povodny]);
  pod.zmenZaradenie(db, opraveny, 'formular', zItms);
  pod.zmenZaradenie(db, opraveny, '', zItms);
  over('A02: vyradený platný formulár nahradí iný formulár spisu', pod.spisRiadok(db, fa)!.formular_subor_id, povodny);
  pod.zmenZaradenie(db, povodny, '', zItms);
  over('A02: bez formulára spis formulár nemá (nič sa neposudzuje zo zamietnutého súboru)', pod.spisRiadok(db, fa)!.formular_json, null);
  pod.zmenZaradenie(db, opraveny, 'formular', zItms);
  const kodFa = pod.spisRiadok(db, fa)!.kod;
  pod.doplnPodklady(db, fa, [{ nazov: 'formular-ina.json', data: Buffer.from(JSON.stringify({ ...f0, kod: 'NFP401201X999', sumaZiadanaNFP: 300000 })) }], SLOTY, zItms);
  const ina = db.prepare("SELECT id, chyba FROM subory WHERE spis_id = ? AND nazov = 'formular-ina.json'").get(fa) as { id: number; chyba: string | null };
  over('A02: formulár inej žiadosti v doplnení platný formulár nezmení a súbor to uvedie',
    [pod.spisRiadok(db, fa)!.formular_subor_id, pod.spisRiadok(db, fa)!.kod, /k inej žiadosti \(NFP401201X999\)/.test(ina.chyba ?? '')], [opraveny, kodFa, true]);
  pod.zmenZaradenie(db, ina.id, '', zItms);

  // Audit A03: výzva odoslaná a doručená 4. 11. 2026 s lehotou 5 pracovných dní; zmena čísla bez textu sa odmietne.
  const textVyzvy = 'Doplnenie predložte do 5 pracovných dní odo dňa doručenia tejto výzvy.';
  pod.rozhodni(db, fa, 'doplnenie', 'test', { odoslana: '2026-11-04', lehotaDni: 5, polozky: null, text: textVyzvy });
  const chyba = (f: () => void) => { try { f(); return ''; } catch (e) { return (e as Error).message; } };
  over('A03: opätovné uloženie s lehotou 10 a textom s 5 dňami sa odmietne',
    /Text výzvy uvádza lehotu 5 pracovných dní, zadaná lehota je 10\..*predĺženie s dôvodom/.test(chyba(() => pod.rozhodni(db, fa, 'doplnenie', 'test', { odoslana: '2026-11-04', lehotaDni: 10, polozky: null, text: null }))), true);
  over('A03: nová výzva s textom inej lehoty sa odmietne', /uvádza lehotu 10 pracovných dní, zadaná lehota je 5/.test(chyba(() => pod.rozhodni(db, e, 'doplnenie', 'test', { odoslana: '2026-11-04', lehotaDni: 5, polozky: null, text: textVyzvy.replace('do 5', 'do 10') }))), true);
  over('A03: odmietnutá výzva sa nezapísala', pod.lehotySpisu(db, e, '2026-11-30').length, 0);
  const [vyzvaA03] = pod.lehotySpisu(db, fa, '2026-11-30');
  pod.upravLehotu(db, fa, vyzvaA03.id, { dorucena: '2026-11-04' }, '2026-11-30');
  pod.doplnPodklady(db, fa, [{ nazov: 'doplnenie.txt', data: Buffer.from('Doplnenie podkladov k žiadosti, odpoveď na výzvu.') }], SLOTY, zItms, '2026-11-12');
  let lv = pod.lehotySpisu(db, fa, '2026-11-30')[0];
  over('A03: bez predĺženia je doplnenie z 12. 11. po lehote, ktorá uplynula 11. 11.', [lv.lehotaDni, lv.stav.koniec, lv.stav.kod], [5, '2026-11-11', 'doplnene_po_lehote']);
  pod.rozhodni(db, fa, 'doplnenie', 'test', { odoslana: '2026-11-04', lehotaDni: 10, polozky: null, text: textVyzvy.replace('do 5', 'do 10') });
  lv = pod.lehotySpisu(db, fa, '2026-11-30')[0];
  over('A03: oprava zápisu (lehota aj text) sa zapíše do histórie opráv výzvy', [lv.lehotaDni, lv.opravy.map((o) => [o.lehotaDni, o.text])], [10, [[[5, 10], true]]]);
  pod.upravLehotu(db, fa, lv.id, { odoslana: '2026-11-03' }, '2026-11-30');
  over('A03: oprava dňa odoslania sa tiež zapíše', pod.lehotySpisu(db, fa, '2026-11-30')[0].opravy.map((o) => o.odoslana ?? null), [null, ['2026-11-04', '2026-11-03']]);

  // Štatistika výzvy: úspešnosť = splnila / (splnila + nesplnila), rozhodnutie proti návrhu sa počíta zvlášť.
  pod.ulozPosudok(db, c, 1, 'nesplnene_podmienky'); pod.rozhodni(db, c, 'splnila', 'test proti návrhu');
  pod.ulozPosudok(db, d, 2, 'nesplnene_podmienky'); pod.rozhodni(db, d, 'nesplnila', 'test');
  const st = pod.statistikaSpisov(db).get(VYZVA)!;
  over('Štatistika: splnila 1, nesplnila 1, doplnenie 2 (aj spis A03), proti návrhu 1', [st.splnila, st.nesplnila, st.doplnenie, st.odlisne], [1, 1, 2, 1]);

  // Poškodený ZIP: nahratie sa odmietne chybou vstupu s menom súboru a dôvodom (server vráti 400) a nič sa neuloží.
  // Predtým orezaný archív hlásil „Podanie neobsahuje žiadne súbory“, adresár mimo súboru dal anglický RangeError (500),
  // poškodené dáta bez kompresie sa prijali ako platné súbory a doplnenie bez súborov spis označilo ako doplnený.
  const okZip = fs.readFileSync(path.join(DEMO, 'A-Obec-Vzorova.zip'));
  const koniecZip = okZip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06])), adresar = okZip.readUInt32LE(koniecZip + 16);
  const upraveny = (f: (b: Buffer) => void) => { const b = Buffer.from(okZip); f(b); return b; };
  const poskodeneData = upraveny((b) => { for (let i = 200; i < 260; i++) b[i] ^= 0xff; });
  const pokazeneZipy: [string, Buffer, RegExp][] = [
    ['náhodné bajty', Buffer.from('toto nie je ZIP archív '.repeat(20)), /chýba koncový záznam archívu/],
    ['orezaný na polovicu', okZip.subarray(0, Math.floor(okZip.length / 2)), /chýba koncový záznam archívu|centrálny adresár archívu je poškodený/],
    ['adresár mimo súboru', Buffer.concat([Buffer.alloc(100, 7), okZip.subarray(koniecZip)]), /centrálny adresár archívu je poškodený/],
    ['poškodené dáta bez kompresie', poskodeneData, /je poškodená \(nesedí veľkosť alebo kontrolný súčet CRC-32\)/],
    ['prázdny archív', Buffer.from([0x50, 0x4b, 0x05, 0x06, ...Array(18).fill(0)]), /archív neobsahuje žiadne súbory/],
    ['šifrovaná položka', upraveny((b) => b.writeUInt16LE(b.readUInt16LE(adresar + 8) | 1, adresar + 8)), /je zašifrovaná/],
    ['kompresia bzip2', upraveny((b) => b.writeUInt16LE(12, adresar + 10)), /nepodporovanou metódou \(12\)/],
  ];
  const vynimka = (f: () => unknown) => { try { f(); return null; } catch (x) { return x as Error; } };
  const pocetSpisov = () => (db.prepare('SELECT COUNT(*) AS n FROM spisy').get() as { n: number }).n;
  const spisovPred = pocetSpisov();
  for (const [druh, data, dovod] of pokazeneZipy) {
    const x = vynimka(() => prijmi([{ nazov: 'podanie.zip', data }]));
    over(`Poškodený ZIP (${druh}): chyba vstupu s menom súboru a dôvodom`,
      [x instanceof ChybaVstupu, /^Súbor „podanie\.zip“ sa nedá rozbaliť: /.test(x?.message ?? ''), dovod.test(x?.message ?? '')], [true, true, true]);
  }
  over('Poškodený ZIP: nevznikol žiadny spis', pocetSpisov(), spisovPred);
  const zp = prijmi([subor('A-Obec-Vzorova.zip')]); spisy.push(zp);
  const stavZp = () => Object.values(db.prepare('SELECT stav, (SELECT MAX(davka) FROM subory WHERE spis_id = s.id) AS davka, (SELECT COUNT(*) FROM subory WHERE spis_id = s.id) AS suborov FROM spisy s WHERE id = ?').get(zp) as object);
  const predZp = stavZp();
  const xD = vynimka(() => pod.doplnPodklady(db, zp, [{ nazov: 'doplnenie.zip', data: poskodeneData }, { nazov: 'list.txt', data: Buffer.from('Sprievodný list k doplneniu podkladov žiadosti o NFP.') }], SLOTY, zItms));
  over('Doplnenie s poškodeným ZIP sa odmietne celé (ani list sa neuloží) a stav spisu sa nezmení',
    [xD instanceof ChybaVstupu, /^Súbor „doplnenie\.zip“ sa nedá rozbaliť/.test(xD?.message ?? ''), stavZp()], [true, true, predZp]);
  const xP = vynimka(() => pod.doplnPodklady(db, zp, [], SLOTY, zItms));
  over('Doplnenie bez súborov sa odmietne a spis neoznačí ako doplnený', [xP instanceof ChybaVstupu, xP?.message, stavZp()], [true, 'Doplnenie neobsahuje žiadne súbory.', predZp]);
  // Poškodený DOCX v platnom archíve: súbor sa uloží s chybou formátu, nie s textom z poškodených dát.
  const pokazPolozku = (buf: Buffer, meno: string) => {
    const b = Buffer.from(buf), k = b.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    for (let i = 0, q = b.readUInt32LE(k + 16); i < b.readUInt16LE(k + 10); i++) {
      const n = b.readUInt16LE(q + 28);
      if (b.toString('utf8', q + 46, q + 46 + n) === meno) {
        const lok = b.readUInt32LE(q + 42), od = lok + 30 + b.readUInt16LE(lok + 26) + b.readUInt16LE(lok + 28) + Math.floor(b.readUInt32LE(q + 20) / 2);
        for (let j = od; j < od + 4; j++) b[j] ^= 0x55;
        return b;
      }
      q += 46 + n + b.readUInt16LE(q + 30) + b.readUInt16LE(q + 32);
    }
    throw new Error(`Položka ${meno} v archíve nie je.`);
  };
  const vnutro = rozbalZip(okZip), docx = vnutro.find((s) => s.nazov.endsWith('.docx'))!;
  const zd = prijmi([{ nazov: 'docx-pokazeny.zip', data: zip(vnutro.map((s) => (s === docx ? { nazov: s.nazov, data: pokazPolozku(s.data, 'word/document.xml') } : s))) }]); spisy.push(zd);
  const chybaDocx = (db.prepare('SELECT chyba FROM subory WHERE spis_id = ? AND nazov = ?').get(zd, docx.nazov) as { chyba: string | null }).chyba ?? '';
  over('Poškodený DOCX v platnom archíve: súbor má chybu formátu, text sa z neho nečíta',
    /^Súbor nie je platný DOCX: položka „word\/document\.xml“ (je poškodená|má poškodené komprimované dáta)/.test(chybaDocx), true);
} finally {
  for (const id of spisy) pod.vymazSpis(db, id);
  fs.rmSync(ULOZISKO, { recursive: true, force: true });
}
console.log(chyb ? `\n${chyb} kontrol zlyhalo.` : '\nVšetky kontroly prešli.');
process.exit(chyb ? 1 : 0);
