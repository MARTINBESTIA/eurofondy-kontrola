// Cielené overenie poistiek na konkrétnych úryvkoch: bez modelu sa skontroluje, či úryvok,
// ktorý model v teste uviedol namiesto chýbajúcej náležitosti, poistky odmietnu,
// a či správny úryvok z úplného dokumentu prejde. Spustenie: node scripts/overenie-poistiek.ts
import { nacitajBalik, overUryvok, overVerdikt, vyhodnotNalezitosti, type Nalezitost } from '../src/core/posud.ts';
import { dokladyPriloh } from '../src/moduly/zonfp/doklady-priloh.ts';
import type { Doklad, Nalez, Ziadost } from '../src/core/typy.ts';

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
const parL07 = nacitajBalik(VYZVA, 'zonfp').pravidla.find((p) => p.id === 'L07')!.parametre!;
const l07 = (stav: string, dokaz: string, text: string) => overVerdikt({ stav, zdovodnenie: 'Úvaha modelu.', dokaz }, text, parL07, 'test');
const popisUrad = 'Predmetom projektu je obnova budovy obecného úradu v obci Vzorová. Budova je vo výlučnom vlastníctve obce. Stavebné práce zrealizuje dodávateľ Stavby Prešov, s.r.o., vybraný vo verejnom obstarávaní.';
const popisSportHala = 'Predmetom projektu je rekonštrukcia športovej haly vo vlastníctve mesta Ukážkovo, ktorú využíva základná škola a verejnosť.';
const popisPenzion = 'Projekt rieši energetickú obnovu budovy penziónu a reštaurácie v obci Vzorová, ktorú vlastní a prevádzkuje súkromný podnikateľ – fyzická osoba.';
const popisHala = 'Predmetom projektu je obnova výrobnej haly spoločnosti KOVOSTROJ Vzorová, s.r.o. Hala je vo výlučnom vlastníctve obchodnej spoločnosti.';
const vyhodnotenia: [string, ReturnType<typeof vyhodnotNalezitosti>, string][] = [
  ['L01 G856: model nenašiel podpisy ani dátum, dátum v texte je', vyhodnotNalezitosti(L01, hladanie([1, 3, 5]), vzor1a, 'test'), 'na_preverenie'],
  ['L01 všetko nájdené vrátane podpisov', vyhodnotNalezitosti(L01, hladanie([]), vzor1a, 'test'), 'na_preverenie'],
  ['L01 dátum naozaj chýba', vyhodnotNalezitosti(L01, hladanie([5]), bezDatumu, 'test'), 'nesplnene'],
  ['L01 dátum narodenia nie je dátum udelenia', vyhodnotNalezitosti(L01, hladanie([5]), lenNarodenie, 'test'), 'nesplnene'],
  ['L01 bez vizuálnych náležitostí, všetko nájdené', vyhodnotNalezitosti(neviz, hladanie([], neviz), vzor1a, 'test'), 'splnene'],
  // L07: poistky nad verdiktom modelu (vzorDokazu, vzorPodozrenia), bez volania modelu
  ['L07 obecný úrad, dodávateľ s.r.o. vlastníkom nie je', l07('splnene', 'obnova budovy obecného úradu', popisUrad), 'splnene'],
  ['L07 športová hala vo vlastníctve mesta', l07('splnene', 'rekonštrukcia športovej haly', popisSportHala), 'splnene'],
  ['L07 penzión súkromníka: kategória oprávnená, vlastník súkromný', l07('splnene', 'budovy penziónu a reštaurácie', popisPenzion), 'na_preverenie'],
  ['L07 výrobná hala: samotné „haly“ už nie je dôkaz kategórie', l07('splnene', 'obnova výrobnej haly', popisHala), 'na_preverenie'],
  ['L07 nesplnené ostáva nesplnené', l07('nesplnene', 'obnova výrobnej haly', popisHala), 'nesplnene'],
];
for (const [nazov, r, ocak] of vyhodnotenia) {
  if (r.stav !== ocak) zle++;
  console.log(`${r.stav === ocak ? 'OK ' : 'ZLE'} ${nazov}: ${r.stav} (má byť ${ocak}) – ${r.zdovodnenie.slice(0, 140)}`);
}

// Doklady z prílohy: citát dostane len text, ktorý v súbore naozaj je, s riadkom, na ktorom je.
const zPrilohou = { ...({} as Ziadost), prilohy: { '1': { nazov: 'P1.pdf', text: vzor1a, zaradenie: 'potvrdene' as const, subory: [{ suborId: 7, nazov: 'P1.pdf', text: vzor1a, citatelny: true }] } } };
const l01 = (stav: Nalez['stav'], dokaz: string, najdene: number): Nalez => ({ pravidlo: 'L01', ppp: 1, nazov: '', druh: 'llm', stav, zdovodnenie: '', dokaz, hodnoty: { najdene }, citacia: { dokument: '', cast: '', znenie: '' } });
const riadokSplnomocnenca = vzor1a.split('\n').findIndex((r) => r.includes('Mgr. Eva Ukážková')) + 1;
// P09 (akt. 2): prítomnosť kontrolného zoznamu dokladá nadpis a vyhlásenie o bezbariérovosti, ale len v potvrdenom slote.
const zoznam9 = 'Príloha č. 9a ŽoNFP – Dokument súladu projektu s horizontálnymi princípmi\nIdentifikácia výzvy\nPrehlasujem, že požiadavky na bezbariérovú prístupnosť sú realizované v súlade so stavebnou legislatívou.';
const sPrilohou9 = (zaradenie: 'potvrdene' | 'odhad') => ({ ...({} as Ziadost), prilohy: { '9': { nazov: 'Zoznam.pdf', text: zoznam9, zaradenie, subory: [{ suborId: 9, nazov: 'Zoznam.pdf', text: zoznam9, citatelny: true }] } } });
const p09: Nalez = { pravidlo: 'P09', ppp: 8, nazov: '', druh: 'priloha', stav: 'splnene', zdovodnenie: '', citacia: { dokument: '', cast: '', znenie: '' } };
const dokladove: [string, Doklad[], (d: Doklad[]) => boolean][] = [
  ['P09 potvrdený kontrolný zoznam dostane nadpis a vyhlásenie', dokladyPriloh(sPrilohou9('potvrdene'), p09),
    (d) => d.length === 2 && d.every((x) => x.suborId === 9) && d.map((x) => x.riadokOd).join() === '1,3'],
  ['P09 odhadnutý slot nedostane doklad', dokladyPriloh(sPrilohou9('odhad'), p09), (d) => d.length === 0],
  ['L01 skutočný úryvok dostane súbor a riadok', dokladyPriloh(zPrilohou, l01('na_preverenie', 'označenie splnomocnenej osoby: „Splnomocnenec    : Mgr. Eva Ukážková“', 1)),
    (d) => d.length === 1 && d[0].suborId === 7 && d[0].riadokOd === riadokSplnomocnenca],
  ['L01 vymyslený úryvok nedostane doklad', dokladyPriloh(zPrilohou, l01('na_preverenie', 'podpis štatutárneho orgánu: „podpísal starosta Ing. Ján Vymyslený“', 1)), (d) => d.length === 0],
  ['L01 splnené s jedným vymysleným z dvoch úryvkov nedostane nič', dokladyPriloh(zPrilohou, l01('splnene',
    'označenie splnomocnenej osoby: „Splnomocnenec    : Mgr. Eva Ukážková“\nrozsah plnomocenstva: „na podpis zmluvy o úvere“', 2)), (d) => d.length === 0],
];
for (const [nazov, d, ok] of dokladove) {
  if (!ok(d)) zle++;
  console.log(`${ok(d) ? 'OK ' : 'ZLE'} ${nazov}: ${d.map((x) => `${x.miesto} „${x.citat.slice(0, 40)}“`).join('; ') || 'bez dokladu'}`);
}
console.log(zle ? `${zle} nesedí` : 'všetko sedí');
process.exit(zle ? 1 : 0);
