// Test kontroly P08 (záväzný zošit Prílohy č. 8) bez modelu a bez Excelu: prípady sa skladajú z buniek oficiálneho
// vzoru výzvy (data/zdroje, prázdny zošit) s doplnenými bunkami, plus jeden skutočný zošit vyplnený a prepočítaný
// Excelom (demo/podania/testy). Ten sa dá znova vytvoriť: node scripts/14-test-priloha8.ts --vytvor (Windows + Excel).
// Spustenie: node scripts/14-test-priloha8.ts
import fs from 'node:fs';
import path from 'node:path';
import { nacitajBalik } from '../src/core/posud.ts';
import { xlsxNaText, xlsxBunky } from '../src/ingest/dokument.ts';
import { KONTROLY } from '../src/moduly/zonfp/kontroly.ts';
import { VZOR_PRILOHY_8, vyplnPrilohu8, type Priloha8Spec } from './lib/priloha8.ts';
import type { Priloha, Ziadost } from '../src/core/typy.ts';

const KOREN = path.join(import.meta.dirname, '..');
const FIXTURE = path.join(KOREN, 'demo', 'podania', 'testy', 'Priloha_8_Obec_Vzorova.xlsm');
const FORMULAR_A = path.join(KOREN, 'demo', 'podania', 'A-Obec-Vzorova', 'Formular_ZoNFP_Obec_Vzorova.json');
const zA = JSON.parse(fs.readFileSync(FORMULAR_A, 'utf8')) as Ziadost;

if (process.argv.includes('--vytvor')) {
  // Syntetická vzorka A (Obec Vzorová): sumy aktivít z formulára s DPH (obec nie je platiteľ), sekcie podľa nadpisov vzoru.
  // Emisie a výroba z OZE vo formulári A nie sú, preto ich zošit nemá: súčty M209/M269 ostanú 0 (pre P08 to nevadí).
  const s = (sekcia: string, parameter: number | undefined, nazov: string, mj: string, pocet: number, sumaSDph: number, sposob: 1 | 4) =>
    ({ sekcia, parameter, polozky: [{ nazov, mj, pocet, jednotkovaCenaBezDph: sumaSDph / 1.23 / pocet, sposob, opis: 'Syntetická regresná vzorka.' }] });
  const spec: Priloha8Spec = {
    ziadatel: zA.ziadatel.nazov, projekt: zA.nazov, platcaDph: false, opatrenia: 'Budovy a OZE', schvalenyRadou: true,
    budova: { katastralneUzemie: 'Vzorová', lv: '1', supisneCislo: '1', pravnyVztah: 'výlučné vlastníctvo budovy žiadateľom', kategoria: 'budova škôl a školských zariadení',
      triedaPred: 'C', triedaPo: 'A1', guPePredKwhM2: 412.6 * 1000 / 1650, plochaPredM2: 1650, guPePoKwhM2: 168.3 * 1000 / 1650, plochaPoM2: 1650,
      prevadzka: { hodinDenne: 10, dniTyzdenne: 5, tyzdnovRocne: 42 }, ozeElMW: 0.0495 },
    sekcie: [
      s('Zateplenie obvodového plášťa', 2400, 'Zateplenie obvodového plášťa a strechy', 'm²', 2400, 720000, 4),
      s('Výmena otvorových konštrukcií', 380, 'Výmena okien a dverí', 'm²', 380, 255000, 4),
      s('Osvetlenie', 18, 'Výmena svietidiel', 'ks', 120, 75000, 4),
      s('Zariadenia OZE - výroba elektriny', undefined, 'Fotovoltická elektráreň na streche', 'súbor', 1, 62000, 1),
      s('Projektová dokumentácia', 1050000, 'Projektová dokumentácia a podporné aktivity', 'súbor', 1, 68000, 1),
    ],
    poznamka: 'SYNTETICKÁ REGRESNÁ VZORKA – nejde o skutočnú žiadosť ani prílohu.',
  };
  console.log(JSON.stringify(vyplnPrilohu8(spec, FIXTURE), null, 1));
}

const p = nacitajBalik('PSK-SIEA-002-2023-DV-EFRR', 'zonfp').pravidla.find((x) => x.id === 'P08')!;
const H = 'Rozpočet B1 - Value for Money';
const vzor = fs.readFileSync(VZOR_PRILOHY_8);
const textVzoru = xlsxNaText(vzor);
type Subor = NonNullable<Priloha['subory']>[number];
const zosit = (nazov: string, zmeny: Record<string, string> = {}): Subor => { const b = xlsxBunky(vzor); Object.assign(b[H], zmeny); return { nazov, text: textVzoru, citatelny: true, bunky: b }; };
const ZI = 'Obec Vzorová', PR = 'Obnova obecného úradu v obci Vzorová';
const pol = { A24: 'Energetický audit', C24: 'ks', D24: '1', E24: '2500', F24: '2500', G24: '3075', H24: '3075' };
const pdf: Subor = { nazov: 'P8.pdf', text: 'Výkaz výmer a rozpočet stavby. '.repeat(20), citatelny: true };
const zBase = { ...zA, ziadatel: { ...zA.ziadatel, nazov: ZI }, nazov: PR };

const pripady: [string, Ziadost, Subor[], string][] = [
  ['vyplnený zošit', zBase, [zosit('P8.xlsm', { B9: ZI, B10: PR, ...pol })], 'splnene'],
  ['prázdny vzor', zBase, [zosit('P8.xlsm')], 'chyba_podklad'],
  ['len žiadateľ', zBase, [zosit('P8.xlsm', { B9: ZI })], 'chyba_podklad'],
  ['žiadateľ a projekt bez položiek', zBase, [zosit('P8.xlsm', { B9: ZI, B10: PR })], 'chyba_podklad'],
  ['ručne vpísané nuly D/E/F', zBase, [zosit('P8.xlsm', { B9: ZI, B10: PR, A24: 'X', D24: '0', E24: '0', F24: '0' })], 'chyba_podklad'],
  ['nulová cena', zBase, [zosit('P8.xlsm', { B9: ZI, B10: PR, A24: 'X', D24: '5', E24: '0', F24: '0' })], 'chyba_podklad'],
  ['záporná suma', zBase, [zosit('P8.xlsm', { B9: ZI, B10: PR, A24: 'X', D24: '-1', E24: '100', F24: '-100' })], 'chyba_podklad'],
  ['len súčet „Spolu“ bez položiek', zBase, [zosit('P8.xlsm', { B9: ZI, B10: PR, F28: '5000' })], 'chyba_podklad'],
  ['položka v „Ostatné“ bez skupiny v B', zBase, [zosit('P8.xlsm', { B9: ZI, B10: PR, A195: 'Prípravné práce', C195: 'súbor', D195: '1', E195: '2817.25', F195: '2817.25' })], 'splnene'],
  ['iný žiadateľ (dlhší názov)', zBase, [zosit('P8.xlsm', { B9: 'Obec Vzorová nad Hronom', B10: PR, ...pol })], 'na_preverenie'],
  ['etapa I vs II', zBase, [zosit('P8.xlsm', { B9: ZI, B10: `${PR} II`, ...pol })], 'na_preverenie'],
  ['iný projekt toho istého žiadateľa', zBase, [zosit('P8.xlsm', { B9: ZI, B10: 'Obnova materskej školy v obci Vzorová', ...pol })], 'na_preverenie'],
  ['veľké písmená a bodka na konci', zBase, [zosit('P8.xlsm', { B9: 'OBEC VZOROVÁ', B10: `${PR}.`, ...pol })], 'splnene'],
  ['len PDF', zBase, [pdf], 'chyba_podklad'],
  ['PDF a vyplnený zošit', zBase, [pdf, zosit('P8.xlsx', { B9: ZI, B10: PR, ...pol })], 'splnene'],
  ['cudzí zošit bez hárku vzoru', zBase, [{ nazov: 'rozpocet.xlsx', text: '=== Hárok: Hárok1 ===\nPoložka | 100', citatelny: true, bunky: { Hárok1: { A1: 'Položka' } } }], 'na_preverenie'],
  ['nečitateľný zošit', zBase, [{ nazov: 'P8.xlsm', text: '', citatelny: false }], 'chyba_podklad'],
  ['O9 = áno ukáže text v O10, B10 prázdne', zBase, [zosit('P8.xlsm', { B9: ZI, O9: 'áno', O10: 'Uveďte link alebo predložte doklad.', ...pol })], 'chyba_podklad'],
  ['prázdny vzor a vyplnená kópia', zBase, [zosit('vzor.xlsm'), zosit('P8.xlsm', { B9: ZI, B10: PR, ...pol })], 'splnene'],
  ['správny a cudzí vyplnený zošit', zBase, [zosit('P8.xlsm', { B9: ZI, B10: PR, ...pol }), zosit('P8-ms.xlsm', { B9: ZI, B10: 'Obnova MŠ', ...pol })], 'na_preverenie'],
  ['bunky sa nedali prečítať (chýba originál)', zBase, [{ nazov: 'P8.xlsm', text: textVzoru, citatelny: true }], 'na_preverenie'],
];
if (fs.existsSync(FIXTURE)) {
  const buf = fs.readFileSync(FIXTURE);
  const realny: Subor = { nazov: path.basename(FIXTURE), text: xlsxNaText(buf), citatelny: true, bunky: xlsxBunky(buf) };
  pripady.push(['zošit vyplnený Excelom (vzorka A)', zA, [realny], 'splnene']);
  pripady.push(['zošit vzorky A pri inej žiadosti', zBase, [realny], 'na_preverenie']);
} else console.log(`(chýba ${path.relative(KOREN, FIXTURE)}, prípady so skutočným zošitom sa preskočia)`);

let zle = 0;
for (const [nazov, z, subory, ocak] of pripady) {
  const r = KONTROLY[p.kontrola]({ ...z, prilohy: { '8': { nazov: subory.map((s) => s.nazov).join('; '), text: subory.map((s) => s.text).join('\n'), subory } } }, p);
  if (r.stav !== ocak) zle++;
  console.log(`${r.stav === ocak ? '✓' : '✗'} ${nazov}: ${r.stav}${r.stav === ocak ? '' : ` (očakáva sa ${ocak}) – ${r.zdovodnenie}`}`);
}
console.log(zle ? `\n${zle} prípadov nesedí.` : `\nVšetkých ${pripady.length} prípadov sedí.`);
process.exit(zle ? 1 : 0);
