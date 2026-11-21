// Test návrhu výzvy na doplnenie (src/podatelna/vyzva.ts) na umelom posudku s balíkom výzvy PSK-SIEA-002-2023-DV-EFRR.
// Hlavná poistka: každý otvorený nález (nesplnené, chýba podklad, na preverenie) je v návrhu ako položka, alebo ho
// upozornenie výslovne vymenuje ako bod, ktorý do výzvy nepatrí. Kontrolór tak žiadny nález z výzvy nestratí potichu.
// Spustenie: node scripts/21-test-vyzva.ts
import { isDeepStrictEqual } from 'node:util';
import { verzieBalika, vyrokPosudku } from '../src/core/posud.ts';
import type { Nalez, Posudok, Stav } from '../src/core/typy.ts';
import { zonfp } from '../src/moduly/zonfp/modul.ts';
import { MIN_LEHOTA, navrhVyzvy, polozkyVyzvy, zistenieDoVyzvy, type UdajeVyzvy } from '../src/podatelna/vyzva.ts';

const VYZVA = 'PSK-SIEA-002-2023-DV-EFRR';
const verzie = verzieBalika(VYZVA, 'zonfp');
const balik = verzie.at(-1)!;
const SLOTY = zonfp.prilohy(undefined as never);
let chyb = 0;
const over = (nazov: string, skutocne: unknown, ocakavane: unknown = true) => {
  const ok = isDeepStrictEqual(skutocne, ocakavane);
  if (!ok) chyb++;
  console.log(`${ok ? '✓' : '✗'} ${nazov}${ok ? '' : `\n    čakané: ${JSON.stringify(ocakavane)}\n    je:     ${JSON.stringify(skutocne)}`}`);
};

/** Nález s údajmi pravidla z balíka (alebo podmienky inventára pri druhu rucne). */
const nalez = (pravidlo: string, stav: Stav, zdovodnenie: string, druh?: Nalez['druh']): Nalez => {
  const r = balik.pravidla.find((x) => x.id === pravidlo);
  const m = balik.podmienky?.find((x) => x.id === pravidlo);
  return { pravidlo, ppp: r?.ppp ?? m?.ppp ?? null, nazov: r?.nazov ?? m?.nazov ?? pravidlo, druh: druh ?? r?.druh ?? 'rucne', stav, zdovodnenie,
    citacia: r?.citacia ?? m?.citacia ?? { dokument: 'Zmena výzvy', cast: 'Účinnosť zmeny', znenie: '' } };
};
const nalezy: Nalez[] = [
  nalez('V01', 'splnene', 'Formulár je predložený do výzvy.'),
  nalez('F01', 'nesplnene', 'Žiadosť je predložená 12. 1. 2026, po uzavretí výzvy 9. 1. 2026.'),
  nalez('D01', 'splnene', 'Obec je oprávnený žiadateľ.'),
  nalez('L01', 'nesplnene', 'V dokumente sa nenašlo: rozsah splnomocnenia (úkony v konaní o ŽoNFP). Formálne náležitosti sa nekontrolovali (kontrola je vypnutá): podpis štatutárneho orgánu žiadateľa (splnomocniteľa). (zdroj: Príloha č. 1, Priloha_1a.pdf)'),
  nalez('P03', 'chyba_podklad', 'Príloha č. 3 sa vyžaduje a chýba (súbor je prázdny alebo nečitateľný). Náhrada: odkaz na zverejnené uznesenie v tabuľke č. 7.2 formulára ŽoNFP.'),
  nalez('P06', 'chyba_podklad', 'Príloha č. 6 sa vyžaduje a chýba.'),
  nalez('P08b', 'chyba_podklad', 'Príloha č. 8 chýba, preto sa oprávnené výdavky z nej nedajú porovnať s rozpočtom formulára.'),
  nalez('P08', 'chyba_podklad', 'Príloha č. 8 sa vyžaduje a chýba.'),
  nalez('D12', 'nesplnene', 'Žiadaný NFP 176 317 EUR je pod minimom 200 000 EUR.'),
  nalez('D14', 'na_preverenie', 'Hlavné aktivity končia 2028-12-31, teda 30 mesiaca po predložení žiadosti. Treba ho preveriť.'),
  nalez('D07b', 'splnene', 'Plánovaná úspora je 53,9 %.'),
  nalez('G10', 'mimo_podkladov', 'Vlastníctvo budovy overuje poskytovateľ v katastri.'),
  nalez('PPP7', 'na_preverenie', 'Pravidlá overujú len časť podmienky. Kontrolór overí zvyšok.', 'rucne'),
  nalez('VER-SCHVALENIE', 'na_preverenie', 'Pravidlá pre toto znenie výzvy čakajú na schválenie.', 'verzia'),
  { ...nalez('DS1', 'mimo_podkladov', 'Overuje sa pred uzavretím zmluvy.', 'rucne'), okamih: 'pred_zmluvou' },
];
const posudok: Posudok = { ziadostKod: 'NFP401201TEST', balik: balik.id, verziaBalika: balik.verzia, cas: '2026-11-22T09:30:00.000Z', trvanieMs: 120, model: null, formalne: false, nalezy, ...vyrokPosudku(nalezy) };
const udaje: UdajeVyzvy = { posudok, balik, sloty: SLOTY, spis: { cislo: 'POD-2026-0099', kod: 'NFP401201TEST', nazov: 'Obnova skúšobnej budovy', ziadatel: 'Obec Skúšobná', ico: '00000000' } };

// Poistka úplnosti: každý otvorený nález je v práve jednej položke, alebo ho menuje upozornenie.
const { polozky, upozornenia } = polozkyVyzvy(udaje);
const vPolozkach = polozky.flatMap((x) => x.pravidla);
const otvorene = nalezy.filter((n) => ['nesplnene', 'chyba_podklad', 'na_preverenie'].includes(n.stav));
over('Každý otvorený nález je v práve jednej položke alebo v upozornení',
  otvorene.filter((n) => vPolozkach.filter((p) => p === n.pravidlo).length !== 1 && !upozornenia.some((u) => u.includes(n.pravidlo))).map((n) => n.pravidlo), []);
over('Do položiek nejde doručenie (F01), znenie výzvy (VER) ani bod inventára pre kontrolóra (PPP7)', ['F01', 'VER-SCHVALENIE', 'PPP7'].filter((k) => vPolozkach.includes(k)), []);
over('Položky idú podľa čísla PPP, súlad zošita je spolu s prílohou 8', polozky.map((x) => x.id), ['L01', 'P03', 'P06', 'D12', 'P08+P08b', 'D14']);
over('Položka prílohy 8 nesie PPP 13 a zistenie bodu prítomnosti', [polozky[4].ppp, polozky[4].zistenie], [[13], 'Príloha č. 8 sa vyžaduje a chýba.']);
over('Nadpis položky je PPP z inventára balíka', polozky[2].podmienka, 'PPP č. 7 – Oprávnenosť aktivít projektu');

const p = (id: string) => polozky.find((x) => x.id === id)!;
over('Chýbajúca príloha: požiadavka menuje prílohu z balíka', p('P06').poziadavka, 'Predložte Prílohu č. 6 ŽoNFP – Energetický certifikát v úplnej a čitateľnej podobe.');
over('Záväzný zošit: požiadavka žiada vyplnený záväzný formulár', /ako záväzný formulár Prílohy č\. 8 .* a vyplňte v ňom všetky povinné údaje\.$/.test(p('P08+P08b').poziadavka));
over('Náhrada prílohy 3 je v požiadavke, nie v zistení', [/Namiesto nej môžete uviesť odkaz na zverejnené uznesenie/.test(p('P03').poziadavka), p('P03').zistenie],
  [true, 'Príloha č. 3 sa vyžaduje a chýba (súbor je prázdny alebo nečitateľný).']);
over('Plnomocenstvo: zistenie bez poznámok pre kontrolóra, požiadavka menuje prílohu 1', [p('L01').zistenie, p('L01').poziadavka],
  ['V dokumente sa nenašlo: rozsah splnomocnenia (úkony v konaní o ŽoNFP).', 'Predložte Prílohu č. 1 ŽoNFP – Plnomocenstvo / poverenie upravenú tak, aby obsahovala uvedené náležitosti.']);
over('Nesplnené pravidlo upozorní na neodstrániteľný nedostatok (ods. 16)', /kap\. 2\.4 ods\. 16/.test(p('D12').upozornenie ?? ''));
over('Bod na preverenie nie je predvolene zaradený', polozky.filter((x) => !x.predvolene).map((x) => x.id), ['D14']);
over('Zistenie bez sporných miest a skenu', zistenieDoVyzvy('Nájdené náležitosti: 3 z 4. Sporné: x. Treba pozrieť sken (podpisy sa z textu overiť nedajú): y. (zdroj: z)'), 'Nájdené náležitosti: 3 z 4.');

over('Upozornenie na doručenie menuje F01 a § 17 ods. 1 písm. c)', upozornenia.some((u) => u.includes('F01') && u.includes('§ 17 ods. 1 písm. c)')));
over('Upozornenie na znenie výzvy menuje VER-SCHVALENIE', upozornenia.some((u) => u.includes('VER-SCHVALENIE')));
over('Body pre kontrolóra a neoverené body sú vymenované (PPP7, G10)', upozornenia.some((u) => u.includes('PPP7') && u.includes('G10')));
over('Podmienka overovaná až pred zmluvou (DS1) sa medzi bodmi pre výzvu neuvádza', upozornenia.some((u) => u.includes('DS1')), false);
over('Upozornenie na posudok bez modelu a nekontrolované podpisy', [upozornenia.some((u) => u.includes('bez lokálneho modelu')), upozornenia.some((u) => u.includes('Podpisy sa pri posúdení nekontrolovali'))], [true, true]);

// Text výzvy z predvolených bodov.
const n = navrhVyzvy(udaje);
over('Predvolene sú zaradené nesplnené a chýbajúce podklady', n.vybrane, ['L01', 'P03', 'P06', 'D12', 'P08+P08b']);
over('Text: hlavička, PPP, lehota 5 pracovných dní a poučenie o zastavení', [
  n.text.startsWith('[NÁVRH – zostavil ho softvér predkontroly z posudku zo dňa 22. 11. 2026 (spis POD-2026-0099).'),
  n.text.includes('Slovenská inovačná a energetická agentúra'), n.text.includes('Kód žiadosti: NFP401201TEST'),
  n.text.includes('3. PPP č. 7 – Oprávnenosť aktivít projektu\n   Zistenie: Príloha č. 6 sa vyžaduje a chýba.\n   Požadujeme: Predložte Prílohu č. 6 ŽoNFP'),
  n.text.includes('Doplnenie predložte do 5 pracovných dní odo dňa doručenia tejto výzvy.'),
  n.text.includes('označte v názve slovom „doplnenie“'),
  n.text.includes('môže konanie o ŽoNFP zastaviť podľa § 17 ods. 2 zákona č. 121/2022 Z. z.'),
], [true, true, true, true, true, true, true]);
over('Text neobsahuje nezaradený bod ani poznámky pre kontrolóra', ['D14', 'P08b', 'kontrolór', 'Sporné', 'zdroj:', 'Formálne náležitosti'].filter((s) => n.text.includes(s)), []);
over('Poznámka rozhodnutia: lehota a body podľa PPP', [n.poznamka.split('\n')[0], n.poznamka.split('\n').length, /^5\. PPP č\. 13: Predložte Prílohu č\. 8/.test(n.poznamka.split('\n')[5])],
  ['Výzva na doplnenie, lehota 5 pracovných dní od doručenia:', 6, true]);

// Výber a lehota.
over('Vlastný výber: len bod na preverenie', [navrhVyzvy(udaje, { vyber: ['D14'] }).vybrane, /Vysvetlite skutočnosť uvedenú v zistení, prípadne opravte údaje vo formulári ŽoNFP/.test(navrhVyzvy(udaje, { vyber: ['D14'] }).text)], [['D14'], true]);
over('Prázdny výber: žiadny text ani poznámka', (({ text, poznamka }) => [text, poznamka])(navrhVyzvy(udaje, { vyber: [] })), ['', '']);
over('Lehota 10 dní je v texte', navrhVyzvy(udaje, { lehota: 10 }).text.includes('do 10 pracovných dní'));
for (const zla of [MIN_LEHOTA - 1, 5.5, Number.NaN]) {
  let chyba = '';
  try { navrhVyzvy(udaje, { lehota: zla }); } catch (e) { chyba = (e as Error).message; }
  over(`Lehota ${zla} sa odmietne (najmenej 5 pracovných dní)`, /najmenej 5 \(MD č\. 21, kap\. 2\.4 ods\. 5\)/.test(chyba));
}

// Názvy príloh vo všetkých verziách balíka: 4. pád, bez „je priložená“ a bez podmienky v zátvorke.
for (const b of verzie) {
  const zle: string[] = [];
  for (const r of b.pravidla.filter((x) => x.kontrola === 'priloha_povinna')) {
    const navrh = navrhVyzvy({ ...udaje, balik: b, posudok: { ...posudok, nalezy: [{ ...nalez(r.id, 'chyba_podklad', `Príloha č. ${r.parametre?.cislo} sa vyžaduje a chýba.`), ppp: r.ppp, nazov: r.nazov, druh: r.druh, citacia: r.citacia }] } });
    const t = navrh.polozky[0]?.poziadavka ?? '';
    if (!new RegExp(`^Predložte Prílohu č\\. ${r.parametre?.cislo} ŽoNFP – [^()]+? (v úplnej|ako záväzný)`).test(t) || /je priložená/.test(t)) zle.push(`${r.id}: ${t}`);
  }
  over(`Názvy príloh v požiadavkách sú v poriadku (${b.verzia})`, zle, []);
}

console.log(chyb ? `\n${chyb} kontrol zlyhalo.` : '\nVšetky kontroly prešli.');
process.exit(chyb ? 1 : 0);
