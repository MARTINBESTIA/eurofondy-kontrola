// Test kontroly P08 (záväzný zošit Prílohy č. 8) bez modelu a bez Excelu: prípady sa skladajú z buniek oficiálneho
// vzoru výzvy (data/zdroje, prázdny zošit) s doplnenými bunkami, plus jeden skutočný zošit vyplnený a prepočítaný
// Excelom (demo/podania/testy). Ten sa dá znova vytvoriť: node scripts/14-test-priloha8.ts --vytvor (Windows + Excel).
// Spustenie: node scripts/14-test-priloha8.ts
import fs from 'node:fs';
import path from 'node:path';
import { nacitajBalik } from '../src/core/posud.ts';
import { xlsxNaText, xlsxBunky } from '../src/ingest/dokument.ts';
import { KONTROLY } from '../src/moduly/zonfp/kontroly.ts';
import { dokladyPriloh } from '../src/moduly/zonfp/doklady-priloh.ts';
import { normalizujItms21 } from '../src/moduly/zonfp/normalizuj.ts';
import { VZOR_PRILOHY_8, vyplnPrilohu8, type Priloha8Spec } from './lib/priloha8.ts';
import type { Nalez, Priloha, Ziadost } from '../src/core/typy.ts';

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
  // Pôvodný a opravený zošit v jednej prílohe (doplnenie sa pridá k pôvodnému): výsledok nesmie závisieť od poradia.
  ['dva vyplnené zošity s iným rozpočtom', zBase, [zosit('P8.xlsm', { B9: ZI, B10: PR, ...pol }), zosit('P8-oprava.xlsm', { B9: ZI, B10: PR, ...pol, E24: '2700', F24: '2700' })], 'na_preverenie'],
  ['dva vyplnené zošity s iným rozpočtom, opačné poradie', zBase, [zosit('P8-oprava.xlsm', { B9: ZI, B10: PR, ...pol, E24: '2700', F24: '2700' }), zosit('P8.xlsm', { B9: ZI, B10: PR, ...pol })], 'na_preverenie'],
  ['dva vyplnené zošity s rovnakým rozpočtom', zBase, [zosit('P8.xlsm', { B9: ZI, B10: PR, ...pol }), zosit('P8-kopia.xlsm', { B9: ZI, B10: PR, ...pol })], 'splnene'],
  ['bunky sa nedali prečítať (chýba originál)', zBase, [{ nazov: 'P8.xlsm', text: textVzoru, citatelny: true }], 'na_preverenie'],
];
if (fs.existsSync(FIXTURE)) {
  const buf = fs.readFileSync(FIXTURE);
  const realny: Subor = { nazov: path.basename(FIXTURE), text: xlsxNaText(buf), citatelny: true, bunky: xlsxBunky(buf) };
  pripady.push(['zošit vyplnený Excelom (vzorka A)', zA, [realny], 'splnene']);
  pripady.push(['zošit vzorky A pri inej žiadosti', zBase, [realny], 'na_preverenie']);
} else console.log(`(chýba ${path.relative(KOREN, FIXTURE)}, prípady so skutočným zošitom sa preskočia)`);

let zle = 0;
const priloha8 = (subory: Subor[], zaradenie?: Priloha['zaradenie']): Priloha => ({ nazov: subory.map((s) => s.nazov).join('; '), text: subory.map((s) => s.text).join('\n'), subory, zaradenie });
for (const [nazov, z, subory, ocak] of pripady) {
  const r = KONTROLY[p.kontrola]({ ...z, prilohy: { '8': priloha8(subory) } }, p);
  if (r.stav !== ocak) zle++;
  console.log(`${r.stav === ocak ? '✓' : '✗'} ${nazov}: ${r.stav}${r.stav === ocak ? '' : ` (očakáva sa ${ocak}) – ${r.zdovodnenie}`}`);
}

// P08b: súlad oprávnených výdavkov zo zošita (M210 + ďalšie budovy, M270) s rozpočtom formulára demo žiadosti G856.
// Formulár: 2.1.2 = 214 406,49 € (7 položiek), 2.2.2 = 36 419,28 € (2 položky), spolu 250 825,77 €.
console.log('\nP08b – súlad Prílohy č. 8 s rozpočtom formulára');
const p8b = nacitajBalik('PSK-SIEA-002-2023-DV-EFRR', 'zonfp').pravidla.find((x) => x.id === 'P08b')!;
const zG = normalizujItms21(JSON.parse(fs.readFileSync(path.join(KOREN, 'demo', 'itms', 'subory', 'Formular_NFP401201G856.json'), 'utf8')));
const id = { B9: zG.ziadatel.nazov, B10: zG.nazov, ...pol };
const zosit8b = (zmeny: Record<string, string | undefined>, harky: Record<string, Record<string, string>> = {}): Subor => {
  const s = zosit('P8.xlsm', id);
  for (const [k, v] of Object.entries(zmeny)) if (v === undefined) delete s.bunky![H][k]; else s.bunky![H][k] = v;
  return { ...s, bunky: { ...s.bunky, ...harky } };
};
const zhoda = { M208: '225691.0395', M209: '214406.487525', M210: '214406.487525', M269: '36419.2791', M270: '36419.2791', B13: '1' };
const sPolozkou = (r: Partial<Ziadost['rozpocet'][number]>, o = 0) => ({ ...zG, rozpocet: [...zG.rozpocet, { aktivita: 'X', hlavna: false, opatrenie: null, skupinaVydavkov: '', suma: 0, ...r }], sumaZiadanaCelkova: zG.sumaZiadanaCelkova + o });
const pripady8b: [string, Ziadost, Priloha | undefined | null, string, RegExp?][] = [
  ['zhoda po krátení (demo G856)', zG, priloha8([zosit8b(zhoda)]), 'splnene'],
  ['zaokrúhlenie v tolerancii', zG, priloha8([zosit8b({ ...zhoda, M210: '214406.4851', M270: '36419.2849' })]), 'splnene'],
  ['OZE o 5 centov inak (mimo tolerancie)', zG, priloha8([zosit8b({ ...zhoda, M270: '36419.33' })]), 'na_preverenie', /2\.2\.2 formulár žiada o 0,05 EUR menej/],
  ['formulár uvádza sumu pred krátením (starý demo zošit)', zG, priloha8([zosit8b({ ...zhoda, M208: '214406.49', M209: '203686.1655', M210: '203686.1655', M270: '36419.28' })]), 'na_preverenie', /pred krátením/],
  ['zošit počíta viac než formulár', zG, priloha8([zosit8b({ ...zhoda, M210: '220000' })]), 'na_preverenie', /o 5\s593,51 EUR menej/],
  ['súčet sedí, rozdelenie medzi opatrenia nie', zG, priloha8([zosit8b({ ...zhoda, M210: '224406.49', M270: '26419.28' })]), 'na_preverenie', /rozdelenie medzi opatrenia/],
  ['chýba uložený výsledok M210', zG, priloha8([zosit8b({ ...zhoda, M210: undefined })]), 'na_preverenie', /MS Excel/],
  ['zošit nevypočítal nič (nevyplnené MU)', zG, priloha8([zosit8b({ M208: '0', M209: '0', M210: '0', M269: '0', M270: '0' })]), 'chyba_podklad', /absenciu výpočtu/],
  ['hlásenie HzP budovy (D17), budova 0', zG, priloha8([zosit8b({ ...zhoda, M210: '0', D17: 'Budova nespĺňa podmienku Hodnoty za Peniaze.' })]), 'na_preverenie', /Hodnoty za Peniaze/],
  ['hlásenie výšky NFP (A17) pri zhode súm', zG, priloha8([zosit8b({ ...zhoda, A17: 'Projekt nespĺňa podmienku výšky NFP.' })]), 'na_preverenie', /výšky NFP/],
  // Hlásenie hárku MU Budova (B13, I13) vynuluje M208 až M210: zošit je vyplnený, budova nespĺňa podmienku výzvy.
  // Rada „doplniť úplne vyplnený zošit“ (absencia výpočtu) by bola nepravdivá.
  ['úspora PE pod 30 % (MU Budova 1!I13), budova 0', zG, priloha8([zosit8b({ ...zhoda, M208: '0', M209: '0', M210: '0' }, { 'MU Budova 1': { J44: '22', I13: 'Budova nespĺňa podmienku úspory primárnej energie.' } })]),
    'na_preverenie', /^(?![\s\S]*absenciu výpočtu)[\s\S]*„Budova nespĺňa podmienku úspory primárnej energie\.“ \(„MU Budova 1“!I13\)/],
  ['neoprávnená kategória budovy (MU Budova 1!B13), budova 0', zG, priloha8([zosit8b({ ...zhoda, M208: '0', M209: '0', M210: '0' }, { 'MU Budova 1': { B13: 'Kategória budovy nie je oprávnená v zmysle výzvy.' } })]),
    'na_preverenie', /^(?![\s\S]*absenciu výpočtu)[\s\S]*„Kategória budovy nie je oprávnená v zmysle výzvy\.“ \(„MU Budova 1“!B13\)/],
  ['MU Budova 1 bez hlásení (B13 len medzera) pri zhode súm', zG, priloha8([zosit8b(zhoda, { 'MU Budova 1': { J44: '53.92', B13: ' ' } })]), 'splnene'],
  ['B13 = 2, sumy sedia, ale MU Budova 2 hlási úsporu (I13)', zG, priloha8([zosit8b({ ...zhoda, B13: '2', M210: '204406.49' }, { 'Rozpočet B2': { M207: '10000' }, 'MU Budova 2': { I13: 'Budova nespĺňa podmienku úspory primárnej energie.' } })]),
    'na_preverenie', /„MU Budova 2“!I13/],
  ['B13 = 1, hlásenie nevyužitého hárku MU Budova 2 sa nečíta', zG, priloha8([zosit8b(zhoda, { 'MU Budova 2': { I13: 'Budova nespĺňa podmienku úspory primárnej energie.' } })]), 'splnene'],
  ['B13 = 2, hárok Rozpočet B2 sa nedá prečítať', zG, priloha8([zosit8b({ ...zhoda, B13: '2' })]), 'na_preverenie', /Rozpočet B2/],
  ['B13 = 2, budova B2 dopĺňa sumu 2.1.2', zG, priloha8([zosit8b({ ...zhoda, B13: '2', M210: '204406.49' }, { 'Rozpočet B2': { M207: '10000' } })]), 'splnene'],
  ['B13 = 1, ale hárok B2 má sumu', zG, priloha8([zosit8b({ ...zhoda, M210: '204406.49' }, { 'Rozpočet B2': { M207: '10000' } })]), 'na_preverenie', /sumu majú aj hárky/],
  ['výdavok mimo opatrení 2.1.2 a 2.2.2', sPolozkou({ opatrenie: '1.1.1', suma: 300 }, 300), priloha8([zosit8b(zhoda)]), 'na_preverenie', /mimo opatrení/],
  ['súčet položiek ≠ celkové výdavky formulára', { ...zG, sumaZiadanaCelkova: zG.sumaZiadanaCelkova + 1000 }, priloha8([zosit8b(zhoda)]), 'na_preverenie', /nerovná celkovým/],
  ['formulár bez rozpočtu', { ...zG, rozpocet: [] }, priloha8([zosit8b(zhoda)]), 'chyba_podklad'],
  ['zošit inej žiadosti (P08 na preverenie)', zBase, priloha8([zosit8b(zhoda)]), 'na_preverenie', /bod P08/],
  ['prázdny vzor (P08 chýba podklad)', zG, priloha8([zosit('P8.xlsm')]), 'chyba_podklad', /bod P08/],
  ['zaradenie len odhadom', zG, priloha8([zosit8b(zhoda)], 'odhad'), 'na_preverenie'],
  // Audit astry: pôvodný a finálny zošit s rovnakými položkami, ale inou sumou po krátení (iné údaje MU Budova).
  // Skôr rozhodoval prvý súbor: finálny prvý dal splnené, opačné poradie na preverenie.
  ['pôvodný a opravený zošit s inou sumou po krátení', zG, priloha8([{ ...zosit8b(zhoda), nazov: 'P8-final.xlsm' }, { ...zosit8b({ ...zhoda, M210: '203686.1655' }), nazov: 'P8-vcera.xlsm' }]),
    'na_preverenie', /viaceré vyplnené zošity[\s\S]*P8-final\.xlsm: 2\.1\.2 214\s406,49 EUR[\s\S]*zhoduje sa s formulárom[\s\S]*P8-vcera\.xlsm: 2\.1\.2 203\s686,17 EUR/],
  ['pôvodný a opravený zošit, opačné poradie', zG, priloha8([{ ...zosit8b({ ...zhoda, M210: '203686.1655' }), nazov: 'P8-vcera.xlsm' }, { ...zosit8b(zhoda), nazov: 'P8-final.xlsm' }]),
    'na_preverenie', /viaceré vyplnené zošity/],
  ['dva rovnaké zošity (nahraté dvakrát)', zG, priloha8([{ ...zosit8b(zhoda), nazov: 'P8.xlsm' }, { ...zosit8b(zhoda), nazov: 'P8 (1).xlsm' }]), 'splnene'],
  ['príloha č. 8 chýba', zG, null, 'chyba_podklad'],
  ['prílohy nie sú v podkladoch (verejné API)', zG, undefined, 'mimo_podkladov'],
];
const DEMO8 = path.join(KOREN, 'demo', 'itms', 'subory', 'Priloha_8_Rozpocet.xlsm');
const buf8 = fs.readFileSync(DEMO8);
const demo8: Subor = { nazov: path.basename(DEMO8), text: xlsxNaText(buf8), citatelny: true, bunky: xlsxBunky(buf8) };
pripady8b.push(['skutočný demo zošit G856 (uložený Excelom)', zG, priloha8([demo8]), 'splnene']);
for (const [nazov, z, pr, ocak, text] of pripady8b) {
  const r = KONTROLY[p8b.kontrola]({ ...z, prilohy: pr === undefined ? undefined : pr === null ? {} : { '8': pr } }, p8b);
  const ok = r.stav === ocak && (!text || text.test(r.zdovodnenie)) && !/vecne overen|obsah (je|bol) overen|správnosť (je|bola) overen/i.test(r.zdovodnenie);
  if (!ok) zle++;
  console.log(`${ok ? '✓' : '✗'} ${nazov}: ${r.stav}${ok ? '' : ` (očakáva sa ${ocak}${text ? `, text ${text}` : ''}) – ${r.zdovodnenie}`}`);
}
// Doklad P08b (podateľňa) musí citovať aj bunku hlásenia hárku budovy, z ktorej je zdôvodnenie.
{
  const t = 'Budova nespĺňa podmienku úspory primárnej energie.';
  const s = { ...zosit8b({ ...zhoda, M208: '0', M209: '0', M210: '0' }, { 'MU Budova 1': { I13: t } }), suborId: 7 };
  const z: Ziadost = { ...zG, prilohy: { '8': { ...priloha8([s]), zaradenie: 'potvrdene' } } };
  const r = KONTROLY[p8b.kontrola](z, p8b);
  const doklady = dokladyPriloh(z, { ...r, pravidlo: 'P08b' } as unknown as Nalez, p8b);
  const ok = r.stav === 'na_preverenie' && doklady.some((d) => d.suborId === 7 && d.miesto === 'Hárok „MU Budova 1“, bunka I13' && d.citat === t);
  if (!ok) zle++;
  console.log(`${ok ? '✓' : '✗'} doklad P08b cituje bunku hlásenia „MU Budova 1“!I13${ok ? '' : ` – ${r.stav}, ${JSON.stringify(doklady.map((d) => d.miesto))}`}`);
}
// Pri rozdielnych zošitoch sú podkladom bunky oboch, nie len prvého súboru.
{
  const a = { ...zosit8b(zhoda), nazov: 'P8-final.xlsm', suborId: 7 }, b = { ...zosit8b({ ...zhoda, M210: '203686.1655' }), nazov: 'P8-vcera.xlsm', suborId: 8 };
  const z: Ziadost = { ...zG, prilohy: { '8': { ...priloha8([a, b]), zaradenie: 'potvrdene' } } };
  const r = KONTROLY[p8b.kontrola](z, p8b);
  const doklady = dokladyPriloh(z, { ...r, pravidlo: 'P08b' } as unknown as Nalez, p8b);
  const m210 = (id: number) => doklady.some((d) => d.suborId === id && d.miesto === `Hárok „${H}“, bunka M210`);
  const ok = r.stav === 'na_preverenie' && m210(7) && m210(8);
  if (!ok) zle++;
  console.log(`${ok ? '✓' : '✗'} doklad P08b pri dvoch rozdielnych zošitoch cituje M210 oboch${ok ? '' : ` – ${r.stav}, ${JSON.stringify(doklady.map((d) => `${d.suborId} ${d.miesto}`))}`}`);
}
const vsetky = pripady.length + pripady8b.length + 2;
console.log(zle ? `\n${zle} z ${vsetky} prípadov nesedí.` : `\nVšetkých ${vsetky} prípadov sedí.`);
process.exit(zle ? 1 : 0);
