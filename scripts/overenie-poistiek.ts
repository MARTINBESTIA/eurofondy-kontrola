// Cielené overenie poistiek na konkrétnych úryvkoch: bez modelu sa skontroluje, či úryvok,
// ktorý model v teste uviedol namiesto chýbajúcej náležitosti, poistky odmietnu,
// a či správny úryvok z úplného dokumentu prejde. Spustenie: node scripts/overenie-poistiek.ts
import { nacitajBalik, overUryvok, vyhodnotNalezitosti, type Nalezitost } from '../src/core/posud.ts';

const VYZVA = 'PSK-SIEA-002-2023-DV-EFRR';
const nal = (modul: string, id: string, zaciatok: string) =>
  (nacitajBalik(VYZVA, modul).pravidla.find((p) => p.id === id)!.parametre!.nalezitosti as Nalezitost[]).find((n) => n.nazov.startsWith(zaciatok))!;
/** Tie isté poistky ako v najdiVTexte (overUryvok), bez volania modelu. */
const prejde = (n: Nalezitost, dokaz: string, text: string) => overUryvok(n, dokaz, text).najdene;

// Plnomocenstvo: model pri podpise štatutára cituje meno pod čiarou, slovo „podpis“ je o riadok vyššie (vzorOkolie).
const plnomocenstvo = 'Splnomocniteľ: Mesto Ukážkovo, v zastúpení: Mgr. Jana Ukážková, primátorka mesta (štatutárny orgán)\nSplnomocnenec: Ing. Peter Príkladný\nTýmto splnomocňujem splnomocnenca na všetky úkony.\nV Ukážkove, dňa 18. 11. 2025\n......................................... podpis splnomocniteľa\nMgr. Jana Ukážková, primátorka mesta\nPlnomocenstvo prijímam.\n......................................... podpis splnomocnenca\nIng. Peter Príkladný';
const bezPodpisuStatutara = 'Splnomocniteľ: Obec Skúšobná, v zastúpení: Ing. Ján Skúšobný, starosta obce\nSplnomocnenec: Bc. Eva Testová\nObec udeľuje plnomocenstvo.\nV Skúšobnej, dňa 20. 11. 2025\nIng. Ján Skúšobný, starosta obce\n......................................... podpis splnomocnenca\nBc. Eva Testová';
const podpisStatutara = nal('zonfp', 'L01', 'podpis štatutárneho');
const podpisSplnomocnenca = nal('zonfp', 'L01', 'podpis splnomocnenej');
// Oficiálny vzor SIEA (Príloha 1a / 1b ŽoNFP) po pdftotext -layout: pod čiarami sú len popisky, slovo „podpis“ chýba.
const vzor1a = 'PLNOMOCENSTVO\npodľa § 31 a nasl. zákona č. 40/1964 Zb. Občianskeho zákonníka\nSplnomocniteľ    : Obec Príkladová\nSídlo            : Hlavná 1, 999 01 Príkladová\nIČO              : 00999911\nV zastúpení      : Ing. Ján Vzorový, starosta obce\ntýmto udeľuje plnomocenstvo\nSplnomocnenec    : Mgr. Eva Ukážková\nspočívajúce v nasledovných úkonoch:\na) na predloženie ŽoNFP,\nToto plnomocenstvo je platné do odvolania.\nV Príkladovej, dňa: 12.03.2025                 V Príkladovej, dňa: 12.03.2025\n________________________________               ________________________________\nSplnomocniteľ                                  Splnomocnenec\n                                               Plnomocenstvo prijímam.';
const vzor1aBezStatutara = vzor1a.replace('________________________________               ________________________________\nSplnomocniteľ                                  Splnomocnenec', '                                               ________________________________\n                                               Splnomocnenec');
const vzor1b = 'POVERENIE\npodľa § 13b ods. 1 zákona č. 369/1990 Zb. o obecnom zriadení\nStarosta         : Ing. Ján Vzorový\nPoverenec        : Mgr. Eva Ukážková\nV Príkladovej, dňa: 12.03.2025                 V Príkladovej, dňa: 12.03.2025\n________________________________               ________________________________\nStarosta                                       Poverenec\n                                               Poverenie prijímam.';
const zaznamNovy = 'Výzva na predloženie cenovej ponuky bola 12.01.2026 zaslaná e-mailom týmto subjektom: ELTECH Košice s.r.o., Svetlo Plus s.r.o., VO-Light s.r.o.\nPrijaté ponuky: 1. Zelená strecha, s. r. o. – 46 125,00 EUR s DPH; 2. Strechy Hron s.r.o. – 48 708,00 EUR s DPH\nZmluva o dielo bola uzavretá 09.02.2026 na sumu 44 870,00 EUR bez DPH.';

const tabulka = 'Označenie dodávky | Množstvo | MJ | Cena za MJ bez DPH | Spolu bez DPH\nLED svietidlo verejného osvetlenia 60 W | 48 | ks | 312,00 | 14 976,00\nMontáž a nastavenie riadiacej jednotky | 1 | súbor | 2 840,00 | 2 840,00';
const faktura = `Faktúra číslo: FV-2026/0312\n${tabulka}\nSpolu bez DPH: 17 816,00 EUR\nSadzba dane: 23 %\nVýška DPH: 4 097,68 EUR`;
const zaznam = 'Predpokladaná hodnota zákazky: 48 900,00 EUR bez DPH\nOslovené hospodárske subjekty: Energie Plus a.s.; Stavby Sever s.r.o.; Montáže Východ, s.r.o.; výzva na predloženie ponuky odoslaná 03.02.2026\nPonuky predložili: Energie Plus a.s. (47 210,00 EUR bez DPH); Stavby Sever s.r.o. (49 800,00 EUR bez DPH)\nKonečná zmluvná cena: 47 210,00 EUR bez DPH';

const pripady: [string, Nalezitost, string, string, boolean][] = [
  ['P11 základ: hlavička a riadky tabuľky', nal('zop', 'P11', 'základ dane'), tabulka, faktura, false],
  ['P11 základ: riadok položky', nal('zop', 'P11', 'základ dane'), 'LED svietidlo verejného osvetlenia 60 W | 48 | ks | 312,00 | 14 976,00', faktura, false],
  ['P11 základ: správny riadok', nal('zop', 'P11', 'základ dane'), 'Spolu bez DPH: 17 816,00 EUR', faktura, true],
  ['V07 cena: zoznam ponúk', nal('vo', 'V07', 'konečná zmluvná cena'), 'Ponuky predložili: Energie Plus a.s. (47 210,00 EUR bez DPH)', zaznam, false],
  ['V07 cena: len suma z riadku ponúk', nal('vo', 'V07', 'konečná zmluvná cena'), '47 210,00 EUR bez DPH); Stavby Sever s.r.o. (49 800,00', zaznam, false],
  ['V07 cena: správny riadok', nal('vo', 'V07', 'konečná zmluvná cena'), 'Konečná zmluvná cena: 47 210,00 EUR bez DPH', zaznam, true],
  ['V07 PHZ: zmluvná cena', nal('vo', 'V07', 'predpokladaná hodnota'), 'Konečná zmluvná cena: 47 210,00 EUR bez DPH', zaznam, false],
  ['V07 PHZ: správny riadok', nal('vo', 'V07', 'predpokladaná hodnota'), 'Predpokladaná hodnota zákazky: 48 900,00 EUR bez DPH', zaznam, true],
  ['V07 uchádzači: oslovené subjekty', nal('vo', 'V07', 'zoznam uchádzačov'), 'Oslovené hospodárske subjekty: Energie Plus a.s.; Stavby Sever s.r.o.; Montáže Východ, s.r.o.', zaznam, false],
  ['V07 uchádzači: správny riadok', nal('vo', 'V07', 'zoznam uchádzačov'), 'Ponuky predložili: Energie Plus a.s. (47 210,00 EUR bez DPH); Stavby Sever s.r.o. (49 800,00 EUR bez DPH)', zaznam, true],
  // Nové (držané bokom) záznamy V07, beh 19. 11. 2026: úryvky, ktoré poistky nechali prejsť (dokument zamietnutý pre inú náležitosť).
  ['V07 PHZ: uzavretá zmluva', nal('vo', 'V07', 'predpokladaná hodnota'), 'Zmluva o dielo bola uzavretá 09.02.2026 na sumu 44 870,00 EUR bez DPH.', zaznamNovy, false],
  ['V07 uchádzači: komu bola výzva zaslaná', nal('vo', 'V07', 'zoznam uchádzačov'), 'Výzva na predloženie cenovej ponuky bola 12.01.2026 zaslaná e-mailom týmto subjektom: ELTECH Košice s.r.o., Svetlo Plus s.r.o.', zaznamNovy, false],
  ['V07 cena: zoznam prijatých ponúk', nal('vo', 'V07', 'konečná zmluvná cena'), 'Prijaté ponuky: 1. Zelená strecha, s. r. o. – 46 125,00 EUR s DPH; 2. Strechy Hron s.r.o. – 48 708,00 EUR s DPH', zaznamNovy, false],
  ['V07 cena: uzavretá zmluva (správne)', nal('vo', 'V07', 'konečná zmluvná cena'), 'Zmluva o dielo bola uzavretá 09.02.2026 na sumu 44 870,00 EUR bez DPH.', zaznamNovy, true],
  ['L01 podpis štatutára: meno pod čiarou na podpis', podpisStatutara, 'Mgr. Jana Ukážková, primátorka mesta', plnomocenstvo, true],
  ['L01 podpis štatutára: riadok s podpisom', podpisStatutara, '......................................... podpis splnomocniteľa', plnomocenstvo, true],
  ['L01 podpis štatutára: meno nad podpisom splnomocnenca', podpisStatutara, 'Ing. Ján Skúšobný, starosta obce', bezPodpisuStatutara, false],
  ['L01 podpis štatutára: meno splnomocnenca pod jeho podpisom', podpisStatutara, 'Ing. Peter Príkladný', plnomocenstvo, false],
  ['L01 podpis štatutára: meno len v záhlaví', podpisStatutara, 'Splnomocniteľ: Obec Skúšobná, v zastúpení: Ing. Ján Skúšobný, starosta obce', bezPodpisuStatutara, false],
  // Oficiálny vzor 1a/1b (20. 11. 2026): miesto podpisu = čiara s popiskom. Náležitosť je vizualne, takže najviac „na preverenie“.
  ['L01 vzor 1a: popisky pod čiarami', podpisStatutara, 'Splnomocniteľ                                  Splnomocnenec', vzor1a, true],
  ['L01 vzor 1a: čiary na podpis (popisok o riadok nižšie)', podpisStatutara, '________________________________               ________________________________', vzor1a, true],
  ['L01 vzor 1a: záhlavie „Splnomocniteľ : Obec“', podpisStatutara, 'Splnomocniteľ    : Obec Príkladová', vzor1a, false],
  ['L01 vzor 1a: „V zastúpení“ nie je podpis', podpisStatutara, 'V zastúpení      : Ing. Ján Vzorový, starosta obce', vzor1a, false],
  ['L01 vzor 1a bez čiary štatutára: popisok splnomocnenca', podpisStatutara, 'Splnomocnenec', vzor1aBezStatutara, false],
  ['L01 vzor 1a bez čiary štatutára: čiara splnomocnenca', podpisStatutara, '________________________________', vzor1aBezStatutara, false],
  ['L01 vzor 1a: podpis splnomocnenca („prijímam“)', podpisSplnomocnenca, 'Plnomocenstvo prijímam.', vzor1a, true],
  ['L01 vzor 1b: popisky „Starosta Poverenec“', podpisStatutara, 'Starosta                                       Poverenec', vzor1b, true],
  ['L01 vzor 1b: záhlavie „Starosta : meno“', podpisStatutara, 'Starosta         : Ing. Ján Vzorový', vzor1b, false],
];
let zle = 0;
for (const [nazov, n, dokaz, text, ocak] of pripady) {
  const r = prejde(n, dokaz, text);
  if (r !== ocak) zle++;
  console.log(`${r === ocak ? 'OK ' : 'ZLE'} ${nazov}: ${r ? 'prijaté' : 'odmietnuté'} (má byť ${ocak ? 'prijaté' : 'odmietnuté'})`);
}

// Vyhodnotenie náležitostí po hľadaní (20. 11. 2026, skúška astry na G856): „nesplnené“ len ak náležitosť nenašiel
// model ani vzor v texte. Nenájdený podpis (vizuálny) a nenájdený, ale v texte zjavne prítomný dátum idú človeku.
const L01 = nacitajBalik(VYZVA, 'zonfp').pravidla.find((p) => p.id === 'L01')!.parametre!.nalezitosti as Nalezitost[];
const hladanie = (nenajdene: number[], zoznam = L01) => zoznam.map((_, i) => ({ najdene: !nenajdene.includes(i), dokaz: nenajdene.includes(i) ? '' : 'úryvok' }));
const bezDatumu = vzor1a.replace(/dňa: 12.03.2025/g, 'dňa:');
const lenNarodenie = bezDatumu.replace('Splnomocnenec    : Mgr. Eva Ukážková', 'Splnomocnenec    : Mgr. Eva Ukážková, narodená 1. 1. 1970');
const neviz = L01.filter((n) => !n.vizualne);
const vyhodnotenia: [string, ReturnType<typeof vyhodnotNalezitosti>, string][] = [
  ['L01 G856: model nenašiel podpisy ani dátum, dátum v texte je', vyhodnotNalezitosti(L01, hladanie([1, 3, 5]), vzor1a, 'test'), 'na_preverenie'],
  ['L01 všetko nájdené vrátane podpisov', vyhodnotNalezitosti(L01, hladanie([]), vzor1a, 'test'), 'na_preverenie'],
  ['L01 dátum naozaj chýba', vyhodnotNalezitosti(L01, hladanie([5]), bezDatumu, 'test'), 'nesplnene'],
  ['L01 dátum narodenia nie je dátum udelenia', vyhodnotNalezitosti(L01, hladanie([5]), lenNarodenie, 'test'), 'nesplnene'],
  ['L01 bez vizuálnych náležitostí, všetko nájdené', vyhodnotNalezitosti(neviz, hladanie([], neviz), vzor1a, 'test'), 'splnene'],
];
for (const [nazov, r, ocak] of vyhodnotenia) {
  if (r.stav !== ocak) zle++;
  console.log(`${r.stav === ocak ? 'OK ' : 'ZLE'} ${nazov}: ${r.stav} (má byť ${ocak}) – ${r.zdovodnenie.slice(0, 140)}`);
}
console.log(zle ? `${zle} nesedí` : 'všetko sedí');
process.exit(zle ? 1 : 0);
