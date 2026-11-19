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

// Statické importy sa vykonajú skôr než kód modulu, preto podateľňu načítame až po nastavení úložiska.
const ULOZISKO = fs.mkdtempSync(path.join(os.tmpdir(), 'test-podatelna-'));
process.env.SPISY_DIR = ULOZISKO;
const pod = await import('../src/podatelna/podatelna.ts');

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
  over('A: bez modelu ostanú textové pravidlá neoverené → čiastočne overené', p.navrh, 'ciastocne_overene');

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

  // Štatistika výzvy: úspešnosť = splnila / (splnila + nesplnila), rozhodnutie proti návrhu sa počíta zvlášť.
  pod.ulozPosudok(db, c, 1, 'nesplnene_podmienky'); pod.rozhodni(db, c, 'splnila', 'test proti návrhu');
  pod.ulozPosudok(db, d, 2, 'nesplnene_podmienky'); pod.rozhodni(db, d, 'nesplnila', 'test');
  const st = pod.statistikaSpisov(db).get(VYZVA)!;
  over('Štatistika: splnila 1, nesplnila 1, doplnenie 1, proti návrhu 1', [st.splnila, st.nesplnila, st.doplnenie, st.odlisne], [1, 1, 1, 1]);
} finally {
  for (const id of spisy) pod.vymazSpis(db, id);
  fs.rmSync(ULOZISKO, { recursive: true, force: true });
}
console.log(chyb ? `\n${chyb} kontrol zlyhalo.` : '\nVšetky kontroly prešli.');
process.exit(chyb ? 1 : 0);
