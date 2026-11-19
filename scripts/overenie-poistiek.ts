// Cielené overenie poistiek na konkrétnych úryvkoch: bez modelu sa skontroluje, či úryvok,
// ktorý model v teste uviedol namiesto chýbajúcej náležitosti, poistky odmietnu,
// a či správny úryvok z úplného dokumentu prejde. Spustenie: node scripts/overenie-poistiek.ts
import { nacitajBalik, overUryvok, type Nalezitost } from '../src/core/posud.ts';

const VYZVA = 'PSK-SIEA-002-2023-DV-EFRR';
const nal = (modul: string, id: string, zaciatok: string) =>
  (nacitajBalik(VYZVA, modul).pravidla.find((p) => p.id === id)!.parametre!.nalezitosti as Nalezitost[]).find((n) => n.nazov.startsWith(zaciatok))!;
/** Tie isté poistky ako v najdiVTexte (overUryvok), bez volania modelu. */
const prejde = (n: Nalezitost, dokaz: string, text: string) => overUryvok(n, dokaz, text).najdene;

// Plnomocenstvo: model pri podpise štatutára cituje meno pod čiarou, slovo „podpis“ je o riadok vyššie (vzorOkolie).
const plnomocenstvo = 'Splnomocniteľ: Mesto Ukážkovo, v zastúpení: Mgr. Jana Ukážková, primátorka mesta (štatutárny orgán)\nSplnomocnenec: Ing. Peter Príkladný\nTýmto splnomocňujem splnomocnenca na všetky úkony.\nV Ukážkove, dňa 18. 11. 2025\n......................................... podpis splnomocniteľa\nMgr. Jana Ukážková, primátorka mesta\nPlnomocenstvo prijímam.\n......................................... podpis splnomocnenca\nIng. Peter Príkladný';
const bezPodpisuStatutara = 'Splnomocniteľ: Obec Skúšobná, v zastúpení: Ing. Ján Skúšobný, starosta obce\nSplnomocnenec: Bc. Eva Testová\nObec udeľuje plnomocenstvo.\nV Skúšobnej, dňa 20. 11. 2025\nIng. Ján Skúšobný, starosta obce\n......................................... podpis splnomocnenca\nBc. Eva Testová';
const podpisStatutara = nal('zonfp', 'L01', 'podpis štatutárneho');
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
];
let zle = 0;
for (const [nazov, n, dokaz, text, ocak] of pripady) {
  const r = prejde(n, dokaz, text);
  if (r !== ocak) zle++;
  console.log(`${r === ocak ? 'OK ' : 'ZLE'} ${nazov}: ${r ? 'prijaté' : 'odmietnuté'} (má byť ${ocak ? 'prijaté' : 'odmietnuté'})`);
}
console.log(zle ? `${zle} nesedí` : 'všetko sedí');
process.exit(zle ? 1 : 0);
