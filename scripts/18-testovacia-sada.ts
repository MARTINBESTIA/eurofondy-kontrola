// Testovacia sada nových žiadostí o NFP do výzvy PSK-SIEA-002-2023-DV-EFRR: 15 fiktívnych podaní na nahratie do podateľne.
// Stavia sa z oficiálnych vzorov a pravidiel:
// - formulár ŽoNFP v štruktúre verejného API ITMS21+ (ako detail https://api.itms21.sk/public/v1/zonfp/id/{id}, demo G856);
// - prílohy podľa Prílohy č. 2 výzvy (Zoznam príloh ŽoNFP, akt. 3; pre znenie pred zmenou č. 3 akt. 1 s Prílohou č. 9);
// - Príloha č. 8 = záväzný zošit vzoru výzvy (akt. 3), vyplnený a prepočítaný MS Excelom; rozpočet formulára sa z neho
//   odvodí (sumy po krátení podľa pásma úspory, PPP č. 13), aby formulár a zošit sedeli ako v skutočnej žiadosti;
// - plnomocenstvo podľa vzoru Prílohy č. 1a, kontrolné zoznamy bezbariérovosti podľa Príloh č. 9a a 9b (akt. 1);
// - dátumy a kolá podľa harmonogramu výzvy a MD č. 21 (MIRRI, Konanie o ŽoNFP v1.0): včasnosť, doplnenie, zastavenie.
// Žiadatelia, osoby, IČO a čísla dokladov sú vymyslené. Každý dokument má v päte upozornenie, že nejde o skutočný doklad.
// Výstup: demo/testovacia-sada/ (ZIP na prípad a doplnenie, ocakavane.json pre skript 19, README.md pre človeka).
// Spustenie (Windows, MS Excel, Edge alebo Chrome): node scripts/18-testovacia-sada.ts
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ico, tlaciarenPdf, zip, type Odsek } from './lib/dokumenty.ts';
import { vyplnPrilohu8, type Priloha8Spec, type Priloha8Vysledok } from './lib/priloha8.ts';
import type { Navrh, Stav } from '../src/core/typy.ts';

const KOREN = path.join(import.meta.dirname, '..');
const OUT = path.join(KOREN, 'demo', 'testovacia-sada');
const VYZVA = 'PSK-SIEA-002-2023-DV-EFRR';
const PATA = 'Testovací dokument pre eurofondy-kontrola (testovacia sada). Fiktívny subjekt, nejde o skutočný doklad.';
const KOD_OPATRENIA: Record<string, string> = { '2.1.2': '401201R20102', '2.2.2': '401201R20202', '2.1.1': '401201R20101' };
const PRAVNE_FORMY: Record<string, string> = { '801': 'Obec (obecný úrad), mesto (mestský úrad)', '112': 'Spoločnosť s ručením obmedzeným' };

// ---------- model prípadu
type Opatrenie = '2.1.2' | '2.2.2';
type Kategoria = 'administratívna budova' | 'budova škôl a školských zariadení';
type Skupina = 'Stavby' | 'Samostatné hnuteľné veci a súbory hnuteľných vecí';
interface Polozka { nazov: string; mj: string; pocet: number; cena: number; sposob: 1 | 2 | 3 | 4; opis: string }
/** sekcia = názov aktivity v ITMS21+ = nadpis sekcie hárku Rozpočet B1 zošita Prílohy č. 8. */
interface Aktivita { sekcia: string; opatrenie: Opatrenie; skupina: Skupina; parameter?: number; polozky: Polozka[]; technika: string }
interface Budova {
  nazov: string; adresa: string; kategoria: Kategoria; plocha: number; guPred: number; guPo: number;
  ku: string; lv: string; supisne: string; parcela: string; rok: number; podlazia: number;
}
interface Ziadatel { nazov: string; ico: string; forma: '801' | '112'; ulica: string; psc: string; sidlo: string; statutar: string; funkcia: string }
interface Ocakavane { navrh: Navrh; verzia: 'akt2' | 'zmena3'; ver: string[]; nalezy: Record<string, Stav> }
interface Pripad {
  cislo: string; slug: string; titul: string; scenar: string; preco: string;
  ziadatel: Ziadatel; miesto: { kraj: string; okres: string; obec: string }; kategoriaRegionov: 'VRR' | 'MRR';
  vyzvaKod?: string; predlozenie: string | null; zaciatok: string; koniec: string;
  projekt: { nazov: string; popis: string; ucel: string }; budova: Budova; aktivity: Aktivita[];
  oze?: { elMW: number; tepMW: number };
  /** Aktivita z opatrenia mimo výzvy: je len vo formulári, zošit ju nepozná. */
  cudziaAktivita?: { nazov: string; opatrenie: string; skupina: Skupina; suma: number };
  plnomoc?: boolean; priloha9?: '9a' | '9b';
  /** Prílohy, ktoré žiadateľ doloží až po výzve na doplnenie (vlastný ZIP). */
  doplnenie?: ('8' | '9')[];
  /** Súbory bez čísla prílohy v názve: podateľňa ich zaradí len odhadom podľa kľúčových slov. */
  bezCisla?: boolean;
  ocakavane: Ocakavane; poDoplneni?: Ocakavane; poPotvrdeni?: Ocakavane;
}

// ---------- pomocné výpočty
const r2 = (n: number) => Math.round(n * 100) / 100;
const eur = (n: number) => n.toLocaleString('sk-SK', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' EUR';
const cis = (n: number, d = 1) => n.toLocaleString('sk-SK', { maximumFractionDigits: d });
const datumSk = (iso: string) => { const [r, m, d] = iso.split('-'); return `${Number(d)}. ${Number(m)}. ${r}`; };
const posunDni = (iso: string, dni: number) => new Date(Date.parse(iso) + dni * 86_400_000).toISOString().slice(0, 10);
/** Polnoc v Bratislave ako UTC milisekundy (tak dáva dátumy API ITMS21+). */
function msPolnoc(iso: string): number {
  const utc = Date.parse(`${iso}T00:00:00Z`);
  const posun = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Bratislava', timeZoneName: 'shortOffset' }).formatToParts(utc).find((p) => p.type === 'timeZoneName')!.value;
  return utc - Number(posun.replace('GMT', '') || 0) * 3_600_000;
}
const mesiace = (od: string, po: string) => Math.round((Date.parse(po) - Date.parse(od)) / 86_400_000 / 30.44);
/** Orientačné hranice energetických tried globálneho ukazovateľa PE v kWh/(m2.rok) pre dve kategórie budov (neoverené voči vyhláške, len pre test). */
const HRANICE: Record<Kategoria, number[]> = { 'administratívna budova': [61, 122, 244, 366, 488, 610, 732], 'budova škôl a školských zariadení': [34, 68, 136, 204, 272, 340, 408] };
const trieda = (k: Kategoria, kwhM2: number) => ['A0', 'A1', 'B', 'C', 'D', 'E', 'F'][HRANICE[k].findIndex((h) => kwhM2 <= h)] ?? 'G';
const peVych = (b: Budova) => (b.guPred * b.plocha) / 1000;
const pePo = (b: Budova) => (b.guPo * b.plocha) / 1000;
const EMISIE_T_NA_MWH = 0.22; // orientačný faktor emisií CO2 na MWh primárnej energie (len pre test)
const vyrobaOze = (o: { elMW: number; tepMW: number }) => ({ elVych: 0, elPlan: r2(o.elMW * 1050), tepVych: 0, tepPlan: r2(o.tepMW * 1400) });
const pol = (nazov: string, mj: string, pocet: number, cena: number, opis: string, sposob: 1 | 2 | 3 | 4 = 4): Polozka => ({ nazov, mj, pocet, cena, opis, sposob });

// ---------- archetypy projektov (skutočné typy aktivít výzvy = sekcie zošita Prílohy č. 8)
const PD = (cena: number, investicia: number): Aktivita => ({ sekcia: 'Projektová dokumentácia', opatrenie: '2.1.2', skupina: 'Stavby', parameter: investicia,
  polozky: [pol('Projektová dokumentácia pre stavebné povolenie a realizáciu stavby vrátane energetického hodnotenia', 'súbor', 1, cena, 'Cenová ponuka projektanta, prieskum trhu.', 1)],
  technika: 'projektová dokumentácia stavby v rozsahu pre povolenie a realizáciu, energetické hodnotenie budovy' });
const zateplenieSteny = (m2: number, cena: number): Aktivita => ({ sekcia: 'Zateplenie obvodového plášťa', opatrenie: '2.1.2', skupina: 'Stavby', parameter: m2,
  polozky: [pol('Kontaktný zatepľovací systém z minerálnej vlny hr. 160 mm vrátane omietky', 'm²', m2, cena, 'Podrobný rozpočet stavebných prác (výkaz výmer).')],
  technika: 'kontaktný zatepľovací systém z minerálnej vlny hrúbky 160 mm, U = 0,21 W/(m2.K)' });
const zateplenieStrechy = (m2: number, cena: number): Aktivita => ({ sekcia: 'Zateplenie strešného plášťa', opatrenie: '2.1.2', skupina: 'Stavby', parameter: m2,
  polozky: [pol('Zateplenie plochej strechy minerálnou vlnou hr. 300 mm s novou hydroizoláciou', 'm²', m2, cena, 'Podrobný rozpočet stavebných prác (výkaz výmer).')],
  technika: 'zateplenie plochej strechy minerálnou vlnou hrúbky 300 mm, U = 0,13 W/(m2.K)' });
const okna = (m2: number, cena: number): Aktivita => ({ sekcia: 'Výmena otvorových konštrukcií', opatrenie: '2.1.2', skupina: 'Stavby', parameter: m2,
  polozky: [pol('Okná a dvere z plastových profilov s izolačným trojsklom', 'm²', m2, cena, 'Podrobný rozpočet stavebných prác (výkaz výmer).')],
  technika: 'okná a dvere s izolačným trojsklom, Uw ≤ 0,85 W/(m2.K)' });
const osvetlenie = (ks: number, cena: number, kw: number): Aktivita => ({ sekcia: 'Osvetlenie', opatrenie: '2.1.2', skupina: 'Stavby', parameter: kw,
  polozky: [pol('LED svietidlá s reguláciou podľa denného svetla a prítomnosti osôb', 'ks', ks, cena, 'Prieskum trhu (tri cenové ponuky).', 1)],
  technika: `LED svietidlá s reguláciou podľa denného svetla, inštalovaný príkon ${cis(kw)} kW` });
const vykurovanie = (cena: number, kw: number): Aktivita => ({ sekcia: 'Vykurovací systém', opatrenie: '2.1.2', skupina: 'Stavby', parameter: kw,
  polozky: [pol('Rekonštrukcia vykurovacej sústavy s ekvitermickou reguláciou a termostatickými ventilmi', 'súbor', 1, cena, 'Podrobný rozpočet stavebných prác (výkaz výmer).')],
  technika: `rekonštrukcia vykurovacej sústavy s ekvitermickou reguláciou, výkon ${cis(kw, 0)} kW` });
const vetranie = (cena: number): Aktivita => ({ sekcia: 'Systémy chladenia a vetrania', opatrenie: '2.1.2', skupina: 'Stavby', parameter: 0.5,
  polozky: [pol('Vzduchotechnika s rekuperáciou tepla (účinnosť min. 80 %)', 'súbor', 1, cena, 'Podrobný rozpočet stavebných prác (výkaz výmer).')],
  technika: 'nútené vetranie s rekuperáciou tepla, intenzita výmeny vzduchu 0,5 1/h' });
const fve = (kwp: number, cena: number): Aktivita => ({ sekcia: 'Zariadenia OZE - výroba elektriny', opatrenie: '2.2.2', skupina: 'Samostatné hnuteľné veci a súbory hnuteľných vecí',
  polozky: [pol(`Fotovoltická elektráreň ${cis(kwp)} kWp vrátane striedača a montáže`, 'súbor', 1, cena, 'Prieskum trhu (tri cenové ponuky).', 1)],
  technika: `fotovoltická elektráreň na streche s výkonom ${cis(kwp)} kWp na vlastnú spotrebu budovy` });
const tc = (kw: number, cena: number): Aktivita => ({ sekcia: 'Zariadenia OZE - výroba tepla', opatrenie: '2.2.2', skupina: 'Samostatné hnuteľné veci a súbory hnuteľných vecí',
  polozky: [pol(`Tepelné čerpadlo vzduch-voda ${cis(kw, 0)} kW vrátane akumulačnej nádrže a napojenia`, 'súbor', 1, cena, 'Prieskum trhu (tri cenové ponuky).', 1)],
  technika: `tepelné čerpadlo vzduch-voda s tepelným výkonom ${cis(kw, 0)} kW` });

const OBEC = (nazov: string, ulica: string, psc: string, zaklad: string, statutar: string, funkcia = 'starosta obce'): Ziadatel =>
  ({ nazov, ico: ico(zaklad), forma: '801', ulica, psc, sidlo: nazov.replace(/^(Obec|Mesto) /, ''), statutar, funkcia });
const skolaBudova = (obec: string, o: Partial<Budova> = {}): Budova => ({ nazov: `Základná škola ${obec}`, adresa: `Školská 4, ${obec}`, kategoria: 'budova škôl a školských zariadení',
  plocha: 1800, guPred: 230, guPo: 95, ku: obec, lv: '1', supisne: '204', parcela: '312/4', rok: 1976, podlazia: 3, ...o });
const uradBudova = (obec: string, o: Partial<Budova> = {}): Budova => ({ nazov: `budova obecného úradu ${obec}`, adresa: `Hlavná 1, ${obec}`, kategoria: 'administratívna budova',
  plocha: 950, guPred: 420, guPo: 150, ku: obec, lv: '1', supisne: '1', parcela: '45/1', rok: 1968, podlazia: 2, ...o });
const skolaAktivity = (k = 1): Aktivita[] => [PD(r2(38000 * k), r2(620000 * k)), zateplenieSteny(Math.round(2600 * k), 105), zateplenieStrechy(Math.round(1100 * k), 85),
  okna(Math.round(420 * k), 410), osvetlenie(Math.round(150 * k), 260, r2(18 * k)), fve(r2(49.5 * k), r2(52000 * k))];
const uradAktivity = (): Aktivita[] => [PD(22000, 340000), zateplenieSteny(1300, 98), zateplenieStrechy(520, 80), okna(210, 395), vykurovanie(48000, 70), vetranie(36000), tc(70, 68000)];
const popisSkoly = (obec: string, b: Budova) => `Predmetom projektu je obnova budovy Základnej školy ${obec}, ktorej vlastníkom je Obec ${obec}. Budova z roku ${b.rok} slúži na výchovu a vzdelávanie žiakov 1. až 9. ročníka. Projekt rieši zateplenie obvodového a strešného plášťa, výmenu otvorových konštrukcií, modernizáciu osvetlenia a inštaláciu fotovoltickej elektrárne na vlastnú spotrebu školy. Po obnove sa budova podľa globálneho ukazovateľa primárna energia zlepší z triedy ${trieda(b.kategoria, b.guPred)} na triedu ${trieda(b.kategoria, b.guPo)}.`;
const popisUradu = (obec: string, b: Budova) => `Predmetom projektu je obnova administratívnej budovy obecného úradu ${obec} vo vlastníctve obce. V budove sídli obecný úrad, matrika a kancelária prvého kontaktu. Projekt zahŕňa zateplenie obvodového a strešného plášťa, výmenu okien a dverí, rekonštrukciu vykurovacej sústavy, vetranie s rekuperáciou tepla a tepelné čerpadlo vzduch-voda ako obnoviteľný zdroj tepla. Po obnove sa budova zlepší z triedy ${trieda(b.kategoria, b.guPred)} na triedu ${trieda(b.kategoria, b.guPo)}.`;

// ---------- očakávané výsledky (len to, čo je pre scenár určujúce; VER-ITMS a VER-KONTROLA závisia od prostredia)
const ZAKLAD = (o: { oze: boolean; akt2?: boolean; obec?: boolean } = { oze: true }): Record<string, Stav> => ({
  V01: 'splnene', F01: 'splnene', D01: 'splnene', D07a: 'splnene', D07b: 'splnene', D07c: 'splnene', D07d: o.oze ? 'splnene' : 'neuplatnuje_sa',
  D09: 'splnene', D12: 'splnene', D13: 'splnene', D14: 'splnene', P03: o.obec === false ? 'neuplatnuje_sa' : 'splnene', P05: 'neuplatnuje_sa',
  P06: 'splnene', P07: 'splnene', P08: 'splnene', P08b: 'splnene', ...(o.akt2 ? { P09: 'splnene' as Stav } : {}),
});
const bez = (m: Record<string, Stav>, ...kluce: string[]) => Object.fromEntries(Object.entries(m).filter(([k]) => !kluce.includes(k))) as Record<string, Stav>;

// ---------- prípady
const P: Pripad[] = [];
{
  const z = OBEC('Obec Testovany', 'Hlavná 12', '900 91', '0099801', 'Ing. Peter Testovací');
  const b = skolaBudova('Testovany');
  P.push({ cislo: '01', slug: 'komplet-zmena3', titul: 'Úplná žiadosť (znenie zmeny č. 3)',
    scenar: 'Obec, Bratislavský kraj (VRR), predložená 15. 10. 2025 (kolo 87). Všetky povinné prílohy vrátane plnomocenstva podľa vzoru 1a, zošit Prílohy č. 8 súhlasí s formulárom.',
    preco: 'Referenčný „dobrý“ prípad: žiadne nesplnené pravidlo ani chýbajúca príloha. Návrh je aj tak na preverenie, lebo časť podmienok výzvy softvér nekontroluje (poistka úplnosti) a register overuje človek.',
    ziadatel: z, miesto: { kraj: 'Bratislavský kraj', okres: 'Senec', obec: 'Testovany' }, kategoriaRegionov: 'VRR',
    predlozenie: '2025-10-15', zaciatok: '2026-03-01', koniec: '2027-08-31',
    projekt: { nazov: 'Obnova budovy Základnej školy Testovany', popis: popisSkoly('Testovany', b), ucel: 'Účelom projektu je znížiť spotrebu primárnej energie budovy školy a náklady obce na jej prevádzku.' },
    budova: b, aktivity: skolaAktivity(), oze: { elMW: 0.0495, tepMW: 0 }, plnomoc: true,
    ocakavane: { navrh: 'na_preverenie', verzia: 'zmena3', ver: [], nalezy: ZAKLAD() } });
}
{
  const z = OBEC('Obec Horné Skúšovce', 'Obecná 3', '902 91', '0099802', 'Mgr. Jana Skúšková', 'starostka obce');
  const b = uradBudova('Horné Skúšovce');
  P.push({ cislo: '02', slug: 'chyba-priloha-8', titul: 'Chýba Príloha č. 8, doplní sa',
    scenar: 'Obec, VRR, predložená 5. 11. 2025. Záväzný zošit Prílohy č. 8 v podaní chýba, žiadateľ ho doloží až po výzve na doplnenie (02-doplnenie.zip).',
    preco: 'MD č. 21: chýbajúca príloha je dôvod na výzvu na doplnenie (lehota najmenej 5 pracovných dní), nie na neschválenie. Po doplnení sa P08 a P08b musia zmeniť na splnené.',
    ziadatel: z, miesto: { kraj: 'Bratislavský kraj', okres: 'Pezinok', obec: 'Horné Skúšovce' }, kategoriaRegionov: 'VRR',
    predlozenie: '2025-11-05', zaciatok: '2026-04-01', koniec: '2027-09-30',
    projekt: { nazov: 'Zníženie energetickej náročnosti budovy obecného úradu Horné Skúšovce', popis: popisUradu('Horné Skúšovce', b), ucel: 'Účelom projektu je znížiť energetickú náročnosť budovy obecného úradu a využívať obnoviteľný zdroj tepla.' },
    budova: b, aktivity: uradAktivity(), oze: { elMW: 0, tepMW: 0.07 }, doplnenie: ['8'],
    ocakavane: { navrh: 'vyzva_na_doplnenie', verzia: 'zmena3', ver: [], nalezy: { ...ZAKLAD(), P08: 'chyba_podklad', P08b: 'chyba_podklad' } },
    poDoplneni: { navrh: 'na_preverenie', verzia: 'zmena3', ver: [], nalezy: ZAKLAD() } });
}
{
  const z = OBEC('Mesto Vzorkovo', 'Námestie mieru 1', '901 91', '0099803', 'Ing. Michal Vzorkový', 'primátor mesta');
  const b = skolaBudova('Vzorkovo', { nazov: 'Základná škola Vzorkovo, Mierová ulica', plocha: 2100, guPred: 240, guPo: 100 });
  P.push({ cislo: '03', slug: 'ina-vyzva', titul: 'Formulár inej výzvy',
    scenar: 'Mesto, VRR, predložená 24. 9. 2025. Formulár uvádza kód výzvy PSK-SIEA-008-2025-DV-EFRR (iná výzva SIEA), prílohy sú úplné.',
    preco: 'Pravidlá jednej výzvy sa nesmú použiť na formulár inej výzvy: V01 je nesplnené a ostatné výsledky posudku neplatia.',
    ziadatel: z, miesto: { kraj: 'Bratislavský kraj', okres: 'Malacky', obec: 'Vzorkovo' }, kategoriaRegionov: 'VRR', vyzvaKod: 'PSK-SIEA-008-2025-DV-EFRR',
    predlozenie: '2025-09-24', zaciatok: '2026-03-01', koniec: '2027-10-31',
    projekt: { nazov: 'Obnova budovy Základnej školy Vzorkovo', popis: popisSkoly('Vzorkovo', b).replace('Obec Vzorkovo', 'Mesto Vzorkovo'), ucel: 'Účelom projektu je znížiť spotrebu energie budovy školy.' },
    budova: b, aktivity: skolaAktivity(1.15), oze: { elMW: r2(49.5 * 1.15) / 1000, tepMW: 0 },
    ocakavane: { navrh: 'nesplnene_podmienky', verzia: 'zmena3', ver: [], nalezy: { ...ZAKLAD(), V01: 'nesplnene' } } });
}
{
  const z = OBEC('Obec Dolné Overovce', 'Hlavná 40', '925 99', '0099804', 'Ing. Ladislav Overovací');
  const b = uradBudova('Dolné Overovce', { plocha: 880, guPred: 450, guPo: 160 });
  P.push({ cislo: '04', slug: 'mrr-po-uzavreti', titul: 'Menej rozvinutý región po uzavretí pre MRR',
    scenar: 'Obec v Trnavskom kraji (MRR), predložená 12. 3. 2025 (kolo 56, znenie zmeny č. 2). Pre MRR bola výzva uzavretá 9. 1. 2025. Prílohy vrátane Prílohy č. 9 (kontrolný zoznam 9a) sú úplné.',
    preco: 'Včasnosť podľa kategórie regiónu (§ 16 ods. 4 zákona č. 121/2022 Z. z.): po uzavretí pre MRR sa žiadosť z MRR nedá predložiť, F01 je nesplnené.',
    ziadatel: z, miesto: { kraj: 'Trnavský kraj', okres: 'Galanta', obec: 'Dolné Overovce' }, kategoriaRegionov: 'MRR',
    predlozenie: '2025-03-12', zaciatok: '2025-09-01', koniec: '2027-02-28',
    projekt: { nazov: 'Obnova budovy obecného úradu Dolné Overovce', popis: popisUradu('Dolné Overovce', b), ucel: 'Účelom projektu je znížiť energetickú náročnosť budovy obecného úradu.' },
    budova: b, aktivity: uradAktivity(), oze: { elMW: 0, tepMW: 0.07 }, priloha9: '9a',
    ocakavane: { navrh: 'nesplnene_podmienky', verzia: 'akt2', ver: ['VER-SCHVALENIE'], nalezy: { ...ZAKLAD({ oze: true, akt2: true }), F01: 'nesplnene' } } });
}
{
  const z = OBEC('Obec Nová Vzorka', 'Lipová 2', '900 92', '0099805', 'Bc. Tomáš Vzorný');
  const b = skolaBudova('Nová Vzorka', { plocha: 1500, guPred: 225, guPo: 92 });
  P.push({ cislo: '05', slug: 'po-uzavreti-vyzvy', titul: 'Predložená po uzavretí výzvy',
    scenar: 'Obec, VRR, predložená 21. 1. 2026, teda po uzavretí výzvy 9. 1. 2026. Prílohy sú úplné.',
    preco: 'Po uzavretí výzvy nie je možné predkladať žiadosti (§ 16 ods. 4 zákona č. 121/2022 Z. z.): F01 je nesplnené.',
    ziadatel: z, miesto: { kraj: 'Bratislavský kraj', okres: 'Senec', obec: 'Nová Vzorka' }, kategoriaRegionov: 'VRR',
    predlozenie: '2026-01-21', zaciatok: '2026-06-01', koniec: '2027-11-30',
    projekt: { nazov: 'Obnova budovy Základnej školy Nová Vzorka', popis: popisSkoly('Nová Vzorka', b), ucel: 'Účelom projektu je znížiť spotrebu primárnej energie budovy školy.' },
    budova: b, aktivity: skolaAktivity(0.85), oze: { elMW: r2(49.5 * 0.85) / 1000, tepMW: 0 },
    ocakavane: { navrh: 'nesplnene_podmienky', verzia: 'zmena3', ver: [], nalezy: { ...ZAKLAD(), F01: 'nesplnene' } } });
}
{
  const z = OBEC('Obec Kontrolany', 'Dlhá 7', '902 92', '0099806', 'Ing. Róbert Kontrolný');
  const b = uradBudova('Kontrolany', { plocha: 1020, guPred: 410, guPo: 145 });
  P.push({ cislo: '06', slug: 'aktivita-mimo-opatreni', titul: 'Hlavná aktivita z iného opatrenia',
    scenar: 'Obec, VRR, predložená 1. 10. 2025. Okrem obnovy budovy formulár obsahuje hlavnú aktivitu „Modernizácia verejného osvetlenia“ v opatrení 2.1.1, ktoré výzva nepodporuje (len 2.1.2 a 2.2.2).',
    preco: 'Oprávnené sú len aktivity opatrení výzvy: D07a je nesplnené. Zošit Prílohy č. 8 túto aktivitu nepozná, preto P08b upozorní na výdavky mimo opatrení.',
    ziadatel: z, miesto: { kraj: 'Bratislavský kraj', okres: 'Pezinok', obec: 'Kontrolany' }, kategoriaRegionov: 'VRR',
    predlozenie: '2025-10-01', zaciatok: '2026-03-01', koniec: '2027-09-30',
    projekt: { nazov: 'Obnova obecného úradu a verejného osvetlenia v obci Kontrolany', popis: `${popisUradu('Kontrolany', b)} Súčasťou projektu je aj modernizácia verejného osvetlenia hlavnej ulice obce.`, ucel: 'Účelom projektu je znížiť spotrebu energie obce.' },
    budova: b, aktivity: uradAktivity(), oze: { elMW: 0, tepMW: 0.07 },
    cudziaAktivita: { nazov: 'Modernizácia verejného osvetlenia', opatrenie: '2.1.1', skupina: 'Stavby', suma: 85000 },
    ocakavane: { navrh: 'nesplnene_podmienky', verzia: 'zmena3', ver: [], nalezy: { ...ZAKLAD(), D07a: 'nesplnene', P08b: 'na_preverenie' } } });
}
{
  const z = OBEC('Obec Malé Príklady', 'Školská 1', '941 99', '0099807', 'Ing. Andrea Príkladná', 'starostka obce');
  const b = skolaBudova('Malé Príklady', { plocha: 1650, guPred: 235, guPo: 98, rok: 1981 });
  P.push({ cislo: '07', slug: 'akt2-bez-prilohy-9', titul: 'Znenie zmeny č. 2 bez Prílohy č. 9, doplní sa',
    scenar: 'Obec v Nitrianskom kraji (MRR), predložená 19. 6. 2024 (kolo 18, znenie zmeny č. 2). Príloha č. 9 (kontrolný zoznam horizontálnych princípov 9b pre školy) v podaní chýba, žiadateľ ju doloží v 07-doplnenie.zip.',
    preco: 'Znenie výzvy sa vyberá podľa kola (§ 14 ods. 4 zákona č. 121/2022 Z. z.). V znení zmeny č. 2 sa pri opatrení 2.1.2 vyžaduje Príloha č. 9, v znení zmeny č. 3 už nie. Pravidlá tohto znenia čakajú na schválenie človekom (VER-SCHVALENIE).',
    ziadatel: z, miesto: { kraj: 'Nitriansky kraj', okres: 'Nové Zámky', obec: 'Malé Príklady' }, kategoriaRegionov: 'MRR',
    predlozenie: '2024-06-19', zaciatok: '2024-12-01', koniec: '2026-05-31',
    projekt: { nazov: 'Obnova budovy Základnej školy Malé Príklady', popis: popisSkoly('Malé Príklady', b), ucel: 'Účelom projektu je znížiť spotrebu primárnej energie budovy školy.' },
    budova: b, aktivity: skolaAktivity(0.95), oze: { elMW: r2(49.5 * 0.95) / 1000, tepMW: 0 }, priloha9: '9b', doplnenie: ['9'],
    ocakavane: { navrh: 'vyzva_na_doplnenie', verzia: 'akt2', ver: ['VER-SCHVALENIE'], nalezy: { ...ZAKLAD({ oze: true, akt2: true }), P09: 'chyba_podklad' } },
    poDoplneni: { navrh: 'na_preverenie', verzia: 'akt2', ver: ['VER-SCHVALENIE'], nalezy: ZAKLAD({ oze: true, akt2: true }) } });
}
{
  const z = OBEC('Obec Hraničné Testovce', 'Poľná 5', '901 92', '0099808', 'Ing. Pavol Hraničný');
  const b = uradBudova('Hraničné Testovce', { plocha: 990, guPred: 430, guPo: 152 });
  P.push({ cislo: '08', slug: 'den-uzavretia-kola', titul: 'Predložená v deň uzavretia kola na hranici znení',
    scenar: 'Obec, VRR, predložená v piatok 15. 8. 2025, v deň uzavretia kola 78. Kolo 78 patrí pod znenie zmeny č. 2, kolo 79 už pod zmenu č. 3. Prílohy vrátane Prílohy č. 9 (9a) sú úplné.',
    preco: 'Ak žiadosť prišla po termíne uzavretia kola, patrí do ďalšieho kola s iným znením výzvy. Rozhoduje čas predloženia, ktorý formulár nemá: VER-KOLO pre kontrolóra.',
    ziadatel: z, miesto: { kraj: 'Bratislavský kraj', okres: 'Malacky', obec: 'Hraničné Testovce' }, kategoriaRegionov: 'VRR',
    predlozenie: '2025-08-15', zaciatok: '2026-02-01', koniec: '2027-07-31',
    projekt: { nazov: 'Obnova budovy obecného úradu Hraničné Testovce', popis: popisUradu('Hraničné Testovce', b), ucel: 'Účelom projektu je znížiť energetickú náročnosť budovy obecného úradu.' },
    budova: b, aktivity: uradAktivity(), oze: { elMW: 0, tepMW: 0.07 }, priloha9: '9a',
    ocakavane: { navrh: 'na_preverenie', verzia: 'akt2', ver: ['VER-KOLO', 'VER-SCHVALENIE'], nalezy: ZAKLAD({ oze: true, akt2: true }) } });
}
{
  const z = OBEC('Obec Prechodné Vzorovce', 'Nová 9', '900 93', '0099809', 'Mgr. Eva Prechodná', 'starostka obce');
  const b = skolaBudova('Prechodné Vzorovce', { plocha: 1720, guPred: 228, guPo: 94 });
  P.push({ cislo: '09', slug: 'zmena-vyzvy-pocas-kola', titul: 'Predložená tesne pred účinnosťou zmeny č. 3',
    scenar: 'Obec, VRR, predložená 19. 8. 2025 (kolo 79). Zmena č. 3 je účinná od 21. 8. 2025 a vzťahuje sa už na kolo 79. Prílohy podľa znenia zmeny č. 3 sú úplné.',
    preco: '§ 14 ods. 4 a 5 zákona č. 121/2022 Z. z.: zmena platí aj pre prebiehajúce kolo, žiadateľ však musí dostať možnosť zosúladiť žiadosť (najmenej 10 pracovných dní). VER-ZMENA pre kontrolóra.',
    ziadatel: z, miesto: { kraj: 'Bratislavský kraj', okres: 'Senec', obec: 'Prechodné Vzorovce' }, kategoriaRegionov: 'VRR',
    predlozenie: '2025-08-19', zaciatok: '2026-02-01', koniec: '2027-07-31',
    projekt: { nazov: 'Obnova budovy Základnej školy Prechodné Vzorovce', popis: popisSkoly('Prechodné Vzorovce', b), ucel: 'Účelom projektu je znížiť spotrebu primárnej energie budovy školy.' },
    budova: b, aktivity: skolaAktivity(), oze: { elMW: 0.0495, tepMW: 0 },
    ocakavane: { navrh: 'na_preverenie', verzia: 'zmena3', ver: ['VER-ZMENA'], nalezy: ZAKLAD() } });
}
{
  const z = OBEC('Obec Malá Skúška', 'Záhradná 2', '902 93', '0099810', 'Ing. Juraj Skúšobný');
  const b: Budova = { nazov: 'Materská škola Malá Skúška', adresa: 'Záhradná 6, Malá Skúška', kategoria: 'budova škôl a školských zariadení', plocha: 420, guPred: 250, guPo: 105,
    ku: 'Malá Skúška', lv: '1', supisne: '66', parcela: '120/2', rok: 1985, podlazia: 1 };
  P.push({ cislo: '10', slug: 'nizky-nfp', titul: 'Žiadaný NFP pod minimom',
    scenar: 'Obec, VRR, predložená 12. 11. 2025. Malá obnova materskej školy (zateplenie a okná), žiadaný NFP okolo 100 000 EUR.',
    preco: 'Výzva pripúšťa NFP od 200 000 do 5 000 000 EUR: D12 je nesplnené. Zošit Prílohy č. 8 to hlási tiež (A17), preto P08b ide na preverenie.',
    ziadatel: z, miesto: { kraj: 'Bratislavský kraj', okres: 'Pezinok', obec: 'Malá Skúška' }, kategoriaRegionov: 'VRR',
    predlozenie: '2025-11-12', zaciatok: '2026-04-01', koniec: '2026-12-31',
    projekt: { nazov: 'Zateplenie materskej školy Malá Skúška', popis: 'Predmetom projektu je zateplenie obvodového plášťa a výmena okien budovy materskej školy, ktorej vlastníkom je Obec Malá Skúška. Budova slúži predškolskej výchove približne 40 detí.', ucel: 'Účelom projektu je znížiť spotrebu energie materskej školy.' },
    budova: b, aktivity: [PD(9000, 80000), zateplenieSteny(520, 92), okna(80, 380)],
    ocakavane: { navrh: 'nesplnene_podmienky', verzia: 'zmena3', ver: [], nalezy: { ...bez(ZAKLAD({ oze: false }), 'P08b'), D12: 'nesplnene' } } });
}
{
  const z = OBEC('Obec Overovany', 'Krátka 4', '901 93', '0099811', 'Ing. Milan Overený');
  const b = uradBudova('Overovany', { plocha: 900, guPred: 300, guPo: 234 });
  P.push({ cislo: '11', slug: 'nizka-uspora', titul: 'Úspora primárnej energie pod 30 %',
    scenar: 'Obec, VRR, predložená 22. 10. 2025. Len výmena okien a rekonštrukcia vykurovania, úspora primárnej energie 22 %.',
    preco: 'PPP č. 7: úspora primárnej energie musí byť aspoň 30 %. D07b je nesplnené; zošit Prílohy č. 8 pri takej úspore nepočíta oprávnené výdavky.',
    ziadatel: z, miesto: { kraj: 'Bratislavský kraj', okres: 'Malacky', obec: 'Overovany' }, kategoriaRegionov: 'VRR',
    predlozenie: '2025-10-22', zaciatok: '2026-04-01', koniec: '2027-03-31',
    projekt: { nazov: 'Výmena okien a vykurovania v budove obecného úradu Overovany', popis: 'Predmetom projektu je výmena okien a dverí a rekonštrukcia vykurovacej sústavy administratívnej budovy obecného úradu Overovany vo vlastníctve obce.', ucel: 'Účelom projektu je znížiť náklady na vykurovanie budovy obecného úradu.' },
    budova: b, aktivity: [PD(12000, 250000), okna(240, 395), vykurovanie(85000, 90), osvetlenie(80, 250, 9)],
    ocakavane: { navrh: 'nesplnene_podmienky', verzia: 'zmena3', ver: [], nalezy: { ...bez(ZAKLAD({ oze: false }), 'P08b', 'D07c'), D07b: 'nesplnene', D13: 'nesplnene' } } });
}
{
  const z = OBEC('Obec Nákladné Testovce', 'Hlavná 30', '900 94', '0099812', 'Ing. Karol Nákladný');
  const b = skolaBudova('Nákladné Testovce', { plocha: 700, guPred: 230, guPo: 150 });
  P.push({ cislo: '12', slug: 'hodnota-za-peniaze', titul: 'Prekročená hodnota za peniaze',
    scenar: 'Obec, VRR, predložená 3. 12. 2025. Drahá obnova malej školy: úspora 35 % (asi 56 MWh/rok) pri výdavkoch takmer 600 000 EUR.',
    preco: 'Hodnota za peniaze pri opatrení 2.1.2 je najviac 5 500 EUR na MWh ročnej úspory; tu vychádza asi 10 000 EUR/MWh, nad limitom aj po odrátaní DPH. D07c je nesplnené, zošit hlási D17.',
    ziadatel: z, miesto: { kraj: 'Bratislavský kraj', okres: 'Senec', obec: 'Nákladné Testovce' }, kategoriaRegionov: 'VRR',
    predlozenie: '2025-12-03', zaciatok: '2026-05-01', koniec: '2027-10-31',
    projekt: { nazov: 'Komplexná obnova budovy Základnej školy Nákladné Testovce', popis: popisSkoly('Nákladné Testovce', b).replace(/, modernizáciu osvetlenia a inštaláciu fotovoltickej elektrárne na vlastnú spotrebu školy/, ' a vetranie s rekuperáciou'), ucel: 'Účelom projektu je obnova budovy školy.' },
    budova: b, aktivity: [PD(42000, 520000), zateplenieSteny(1150, 190), zateplenieStrechy(700, 160), okna(260, 520), vetranie(55000)],
    ocakavane: { navrh: 'nesplnene_podmienky', verzia: 'zmena3', ver: [], nalezy: { ...bez(ZAKLAD({ oze: false }), 'P08b'), D07c: 'nesplnene' } } });
}
{
  const z: Ziadatel = { nazov: 'Testovacia správa budov, s.r.o.', ico: ico('5099813'), forma: '112', ulica: 'Priemyselná 8', psc: '902 94', sidlo: 'Skúšobné Pole', statutar: 'Ing. Viktor Správny', funkcia: 'konateľ' };
  const b = uradBudova('Skúšobné Pole', { nazov: 'administratívna budova Priemyselná 8, Skúšobné Pole', adresa: 'Priemyselná 8, Skúšobné Pole', plocha: 960, guPred: 415, guPo: 148, supisne: '808' });
  P.push({ cislo: '13', slug: 'neopravneny-ziadatel', titul: 'Neoprávnený žiadateľ (s.r.o.)',
    scenar: 'Obchodná spoločnosť (právna forma 112), VRR, predložená 19. 11. 2025. Obnova jej administratívnej budovy, prílohy sú úplné okrem Prílohy č. 3, ktorá sa pri s.r.o. nevyžaduje.',
    preco: 'Výzva je určená verejným subjektom (obce, VÚC, rozpočtové a príspevkové organizácie a ďalšie formy z PPP č. 1). Spoločnosť s ručením obmedzeným medzi nimi nie je: D01 je nesplnené.',
    ziadatel: z, miesto: { kraj: 'Bratislavský kraj', okres: 'Pezinok', obec: 'Skúšobné Pole' }, kategoriaRegionov: 'VRR',
    predlozenie: '2025-11-19', zaciatok: '2026-04-01', koniec: '2027-09-30',
    projekt: { nazov: 'Obnova administratívnej budovy Priemyselná 8, Skúšobné Pole', popis: 'Predmetom projektu je obnova administratívnej budovy vo vlastníctve spoločnosti Testovacia správa budov, s.r.o.: zateplenie obvodového a strešného plášťa, výmena okien, rekonštrukcia vykurovania, vetranie s rekuperáciou a tepelné čerpadlo.', ucel: 'Účelom projektu je znížiť energetickú náročnosť administratívnej budovy.' },
    budova: b, aktivity: uradAktivity(), oze: { elMW: 0, tepMW: 0.07 },
    ocakavane: { navrh: 'nesplnene_podmienky', verzia: 'zmena3', ver: [], nalezy: { ...ZAKLAD({ oze: true, obec: false }), D01: 'nesplnene' } } });
}
{
  const z = OBEC('Obec Neoznačovce', 'Hlavná 21', '901 94', '0099814', 'Ing. Stanislav Neoznačený');
  const b = uradBudova('Neoznačovce', { plocha: 930, guPred: 425, guPo: 151 });
  const odhad = { ...ZAKLAD(), P03: 'na_preverenie', P06: 'na_preverenie', P07: 'na_preverenie', P08: 'na_preverenie', P08b: 'na_preverenie' } as Record<string, Stav>;
  P.push({ cislo: '14', slug: 'prilohy-bez-cisla', titul: 'Súbory bez čísla prílohy v názve',
    scenar: 'Obec, VRR, predložená 10. 12. 2025. Prílohy sú úplné, ale súbory sa volajú napr. „Uznesenie_obecneho_zastupitelstva.pdf“ alebo „Rozpocet_projektu.xlsm“, bez čísla prílohy.',
    preco: 'Podateľňa zaradí súbor bez čísla prílohy len odhadom podľa kľúčových slov. Odhad sa nesmie počítať ako splnená príloha (riziko falošného OK): kontrolór musí zaradenie potvrdiť tlačidlom „Potvrdiť“. Po potvrdení sú prílohy splnené.',
    ziadatel: z, miesto: { kraj: 'Bratislavský kraj', okres: 'Malacky', obec: 'Neoznačovce' }, kategoriaRegionov: 'VRR',
    predlozenie: '2025-12-10', zaciatok: '2026-05-01', koniec: '2027-10-31',
    projekt: { nazov: 'Obnova budovy obecného úradu Neoznačovce', popis: popisUradu('Neoznačovce', b), ucel: 'Účelom projektu je znížiť energetickú náročnosť budovy obecného úradu.' },
    budova: b, aktivity: uradAktivity(), oze: { elMW: 0, tepMW: 0.07 }, bezCisla: true,
    ocakavane: { navrh: 'na_preverenie', verzia: 'zmena3', ver: [], nalezy: odhad },
    poPotvrdeni: { navrh: 'na_preverenie', verzia: 'zmena3', ver: [], nalezy: ZAKLAD() } });
}
{
  const z = OBEC('Obec Bezdátovce', 'Pekná 3', '900 95', '0099815', 'Ing. Igor Bezdátový');
  const b = skolaBudova('Bezdátovce', { plocha: 1580, guPred: 232, guPo: 96 });
  P.push({ cislo: '15', slug: 'bez-datumu-predlozenia', titul: 'Formulár bez dátumu predloženia',
    scenar: 'Obec, VRR. Formulár neobsahuje dátum predloženia, prílohy sú úplné podľa znenia zmeny č. 3.',
    preco: 'Bez dátumu sa nedá určiť kolo ani znenie výzvy a nedá sa overiť včasnosť. Softvér nesmie dosadiť dátum nahratia do podateľne (pri neskorom nahratí by vybral novšie znenie, napr. bez povinnej Prílohy č. 9): F01 a D14 idú na preverenie, VER-KOLO pre kontrolóra. Rozhodujúci je dátum odoslania do e-schránky poskytovateľa (MD č. 21).',
    ziadatel: z, miesto: { kraj: 'Bratislavský kraj', okres: 'Senec', obec: 'Bezdátovce' }, kategoriaRegionov: 'VRR',
    predlozenie: null, zaciatok: '2026-03-01', koniec: '2027-08-31',
    projekt: { nazov: 'Obnova budovy Základnej školy Bezdátovce', popis: popisSkoly('Bezdátovce', b), ucel: 'Účelom projektu je znížiť spotrebu primárnej energie budovy školy.' },
    budova: b, aktivity: skolaAktivity(0.9), oze: { elMW: r2(49.5 * 0.9) / 1000, tepMW: 0 },
    ocakavane: { navrh: 'na_preverenie', verzia: 'zmena3', ver: ['VER-KOLO'], nalezy: { ...ZAKLAD(), F01: 'na_preverenie', D14: 'na_preverenie' } } });
}

// ---------- Príloha č. 8 a rozpočet formulára
const SKRATKA_OPATRENI = (p: Pripad) => {
  const o = new Set(p.aktivity.map((a) => a.opatrenie));
  return o.has('2.1.2') && o.has('2.2.2') ? 'Budovy a OZE' : o.has('2.2.2') ? '2.2.2 - OZE' : '2.1.2 - Budovy';
};
function specPrilohy8(p: Pripad): Priloha8Spec {
  const b = p.budova, oze = p.oze;
  return {
    ziadatel: p.ziadatel.nazov, projekt: p.projekt.nazov, platcaDph: false, opatrenia: SKRATKA_OPATRENI(p),
    budova: {
      katastralneUzemie: b.ku, lv: b.lv, supisneCislo: b.supisne, pravnyVztah: 'výlučné vlastníctvo budovy žiadateľom', kategoria: b.kategoria,
      triedaPred: trieda(b.kategoria, b.guPred), triedaPo: trieda(b.kategoria, b.guPo), guPePredKwhM2: b.guPred, plochaPredM2: b.plocha, guPePoKwhM2: b.guPo, plochaPoM2: b.plocha,
      prevadzka: b.kategoria === 'administratívna budova' ? { hodinDenne: 10, dniTyzdenne: 5, tyzdnovRocne: 50 } : { hodinDenne: 10, dniTyzdenne: 5, tyzdnovRocne: 42 },
      emisieCO2T: { vych: r2(peVych(b) * EMISIE_T_NA_MWH), plan: r2(pePo(b) * EMISIE_T_NA_MWH) },
      ...(oze ? { ozeElMW: oze.elMW, ozeTepMW: oze.tepMW, ozeVyrobaMWh: vyrobaOze(oze) } : {}),
    },
    sekcie: p.aktivity.map((a) => ({ sekcia: a.sekcia, parameter: a.parameter, opatrenie: a.opatrenie,
      polozky: a.polozky.map((x) => ({ nazov: x.nazov, mj: x.mj, pocet: x.pocet, jednotkovaCenaBezDph: x.cena, sposob: x.sposob, opis: x.opis })) })),
    poznamka: 'TESTOVACIA SADA – fiktívny žiadateľ, nejde o skutočnú prílohu žiadosti.',
  };
}
/** Suma aktivity vo formulári = výdavok sekcie zošita (s DPH, žiadateľ nie je platiteľ) krátený ako v zošite (M210/M270 k súčtu sekcií). */
function rozpocet(p: Pripad, r: Priloha8Vysledok) {
  const sekcia = new Map(r.sekcie.map((s) => [s.sekcia, s.vydavok ?? 0]));
  const sucet = (o: Opatrenie) => p.aktivity.filter((a) => a.opatrenie === o).reduce((s, a) => s + (sekcia.get(a.sekcia) ?? 0), 0);
  // Zošit, ktorý budovu alebo OZE zamietne (úspora, hodnota za peniaze), dá 0: žiadateľ vo formulári aj tak žiada celé výdavky.
  const faktor = (o: Opatrenie) => { const ciel = o === '2.1.2' ? r.poHodnoteZaPeniaze : r.ozePoHodnoteZaPeniaze; const s = sucet(o); return ciel && s ? ciel / s : 1; };
  return p.aktivity.map((a) => ({ a, suma: r2((sekcia.get(a.sekcia) ?? 0) * faktor(a.opatrenie)) }));
}

// ---------- formulár ŽoNFP v štruktúre API ITMS21+
function formular(p: Pripad, r: Priloha8Vysledok, n: number) {
  const suf = `TS${p.cislo}`;
  const kodAkt = (i: number) => `401${suf}000${String(i + 1).padStart(2, '0')}`;
  const op = (o: string) => ({ opatrenie: { kod: KOD_OPATRENIA[o] } });
  const polozky = rozpocet(p, r);
  const hlavne = p.aktivity.map((a, i) => ({ kod: kodAkt(i), nazov: a.sekcia, datumZaciatkuPlanovany: msPolnoc(p.zaciatok), datumKoncaPlanovany: msPolnoc(p.koniec), typAkcieProgramu: op(a.opatrenie) }));
  const cudzia = p.cudziaAktivita ? { kod: kodAkt(p.aktivity.length), nazov: p.cudziaAktivita.nazov, datumZaciatkuPlanovany: msPolnoc(p.zaciatok), datumKoncaPlanovany: msPolnoc(p.koniec), typAkcieProgramu: op(p.cudziaAktivita.opatrenie) } : null;
  const opatrenia = [...new Set([...p.aktivity.map((a) => a.opatrenie as string), ...(p.cudziaAktivita ? [p.cudziaAktivita.opatrenie] : [])])];
  const podporne = [...new Set(p.aktivity.map((a) => a.opatrenie))].map((o, i) => ({ kod: `401${suf}P000${i + 1}`, nazov: 'Podporné aktivity', typAkcieProgramu: op(o) }));
  const polozkyRozpoctu = [
    ...polozky.map(({ a, suma }, i) => ({ sumaOpravnenehoVydavku: suma, skupinaVydavkov: { nazovSk: a.skupina }, aktivita: hlavne[i] })),
    ...(cudzia ? [{ sumaOpravnenehoVydavku: p.cudziaAktivita!.suma, skupinaVydavkov: { nazovSk: p.cudziaAktivita!.skupina }, aktivita: cudzia }] : []),
  ];
  const celkom = r2(polozkyRozpoctu.reduce((s, x) => s + x.sumaOpravnenehoVydavku, 0));
  const b = p.budova, uk = (kod: string, nazovSk: string, mj: string, ciel: number, vych?: number) =>
    ({ ...(vych !== undefined ? { vychodiskovaHodnotaSpolu: vych } : {}), cielovaHodnotaSpolu: ciel, ukazovatelProjektovySC: { ukazovatelProjektovy: { kod, nazovSk, mernaJednotka: { nazovSk: mj } } } });
  const vyroba = p.oze ? vyrobaOze(p.oze) : null;
  return {
    id: 990100 + n, kod: `NFP401201${suf}`, nazov: p.projekt.nazov,
    ...(p.predlozenie ? { datumPredlozenia: msPolnoc(p.predlozenie) } : {}),
    sumaZiadanaNFP: celkom, sumaZiadanaCelkova: celkom, sumaZiadanaVZ: 0, percetnoZiadane: 1,
    dlzkaZiadanaCelkovaHlavnychAktivit: mesiace(p.zaciatok, p.koniec),
    datumZiadanyZaciatkuHlavnychAktivit: msPolnoc(p.zaciatok), datumZiadanyKoncaHlavnychAktivit: msPolnoc(p.koniec),
    vyzva: { kod: p.vyzvaKod ?? VYZVA },
    kategoriaRegionov: [{ kodZdroj: p.kategoriaRegionov }],
    opatrenie: opatrenia.map((o) => ({ kod: KOD_OPATRENIA[o] })),
    ziadatel: { nazov: p.ziadatel.nazov, ico: p.ziadatel.ico, pravnaForma: { kodZdroj: p.ziadatel.forma, nazovSk: PRAVNE_FORMY[p.ziadatel.forma] } },
    aktivity: [...hlavne, ...(cudzia ? [cudzia] : []), ...podporne],
    polozkyRozpoctu,
    miestoRealizacieFull: [{ nuts3: { nazovSk: p.miesto.kraj }, nuts4: { nazovSk: p.miesto.okres }, nuts5: { nazovSk: p.miesto.obec }, lokalita: 'SLOVENSKA_REPUBLIKA' }],
    ukazovatelZiadanyVystupu: [
      uk('PSKPRCO19', 'Verejné budovy so zlepšenou energetickou hospodárnosťou', 'm2', b.plocha),
      ...(p.oze?.elMW ? [uk('PSKPRCO22a', 'Dodatočná výrobná kapacita v oblasti energie z obnoviteľných zdrojov: elektrická', 'MW', p.oze.elMW)] : []),
      ...(p.oze?.tepMW ? [uk('PSKPRCO22b', 'Dodatočná výrobná kapacita v oblasti energie z obnoviteľných zdrojov: tepelná', 'MW', p.oze.tepMW)] : []),
    ],
    ukazovatelZiadanyVysledku: [
      uk('PSKPRCR26b', 'Ročná primárna spotreba energie: verejné budovy', 'MWh/rok', r2(r.pePlanMWh ?? pePo(b)), r2(r.peVychMWh ?? peVych(b))),
      uk('PSKPRCR29', 'Odhadované emisie skleníkových plynov', 'tony CO2 eq/rok', r2(pePo(b) * EMISIE_T_NA_MWH), r2(peVych(b) * EMISIE_T_NA_MWH)),
      ...(vyroba && p.oze!.elMW ? [uk('PSKPRCR31a', 'Celková vyrobená energia z obnoviteľných zdrojov: elektrická', 'MWh/rok', vyroba.elPlan, 0)] : []),
      ...(vyroba && p.oze!.tepMW ? [uk('PSKPRCR31b', 'Celková vyrobená energia z obnoviteľných zdrojov: tepelná', 'MWh/rok', vyroba.tepPlan, 0)] : []),
    ],
    popis: `<p>${p.projekt.popis}</p>`, ucel: `<p>${p.projekt.ucel}</p>`,
    _zdroj: 'Fiktívna testovacia žiadosť v štruktúre detailu ŽoNFP z verejného API ITMS21+ (https://api.itms21.sk/public/v1/zonfp/id/{id}).',
    _poznamka: `Testovacia sada eurofondy-kontrola, prípad ${p.cislo}: ${p.titul}. Žiadateľ, IČO a všetky údaje sú vymyslené.`,
  };
}

// ---------- prílohy (obsah podľa Prílohy č. 2 výzvy; osoby a čísla dokladov sú vymyslené)
const hlavicka = (z: Ziadatel) => `${z.nazov}\n${z.ulica}, ${z.psc} ${z.sidlo} · IČO ${z.ico}`;
const podpis = (meno: string, funkcia: string) => `......................................... podpis\n${meno}, ${funkcia}`;
const plnomoc = (p: Pripad): Odsek[] => [
  'podľa § 31 a nasl. zákona č. 40/1964 Zb. Občianskeho zákonníka v znení neskorších predpisov',
  { tab: [['Splnomocniteľ', ''], ['Obchodné meno/názov organizácie', p.ziadatel.nazov], ['Sídlo', `${p.ziadatel.ulica}, ${p.ziadatel.psc} ${p.ziadatel.sidlo}`], ['IČO', p.ziadatel.ico], ['V zastúpení', `${p.ziadatel.statutar}, ${p.ziadatel.funkcia}`]] },
  'týmto udeľuje plnomocenstvo',
  { tab: [['Splnomocnenec', ''], ['Titul, meno a priezvisko, funkcia', 'Ing. Lucia Zastupujúca, vedúca oddelenia investícií obecného úradu'], ['Dátum narodenia', '1. 1. 1980 (fiktívne)'], ['Trvalé bydlisko', `${p.ziadatel.sidlo} (fiktívne)`], ['Číslo OP/pasu', 'XX000000 (fiktívne)']] },
  'na zastupovanie splnomocniteľa v súvislosti so Žiadosťou o poskytnutie nenávratného finančného príspevku (ďalej len „ŽoNFP“) v rámci:',
  { tab: [['Údaj', 'Hodnota'], ['Operačný program', 'Program Slovensko'], ['Priorita', '2P1 Energetická efektívnosť a dekarbonizácia'], ['Kód výzvy', VYZVA], ['Názov projektu', p.projekt.nazov]] },
  'spočívajúce v nasledovných úkonoch: na predloženie ŽoNFP, na všetky úkony súvisiace s realizáciou konania o ŽoNFP, na komunikáciu s poskytovateľom v rámci vyššie uvedenej výzvy.',
  'Toto plnomocenstvo je platné do odvolania.',
  `V ${p.ziadatel.sidlo}, dňa ${datumSk(posunDni(p.predlozenie ?? p.zaciatok, -12))}`,
  `${podpis(p.ziadatel.statutar, p.ziadatel.funkcia)} (splnomocniteľ)`,
  'Plnomocenstvo prijímam.\n......................................... podpis\nIng. Lucia Zastupujúca (splnomocnenec)',
];
function uznesenie(p: Pripad): Odsek[] {
  const mesto = p.ziadatel.nazov.startsWith('Mesto'); const zast = mesto ? 'Mestské zastupiteľstvo' : 'Obecné zastupiteľstvo'; const obce = mesto ? 'mesta' : 'obce';
  const den = posunDni(p.predlozenie ?? p.zaciatok, -75);
  return [
    `z ${mesto ? 'mestského' : 'obecného'} zastupiteľstva v ${p.ziadatel.sidlo}`,
    { b: 'Uznesenie č. 14/2023 zo dňa 28. 3. 2023' },
    `${zast} v ${p.ziadatel.sidlo} schvaľuje Program hospodárskeho rozvoja a sociálneho rozvoja ${obce} ${p.ziadatel.sidlo} na roky 2023 – 2030.`,
    { b: 'Uznesenie č. 31/2019 zo dňa 17. 9. 2019' },
    `${zast} v ${p.ziadatel.sidlo} schvaľuje Územný plán ${obce} ${p.ziadatel.sidlo} v znení Zmien a doplnkov č. 1 a vyhlasuje jeho záväznú časť všeobecne záväzným nariadením č. 3/2019.`,
    { b: `Uznesenie č. 52/${den.slice(0, 4)} zo dňa ${datumSk(den)}` },
    `${zast} schvaľuje predloženie žiadosti o nenávratný finančný príspevok na projekt „${p.projekt.nazov}“ v rámci výzvy ${VYZVA}, ktorý je v súlade s Programom hospodárskeho rozvoja a sociálneho rozvoja ${obce} na roky 2023 – 2030 a s územným plánom, a zabezpečenie financovania neoprávnených výdavkov z rozpočtu ${obce}.`,
    'Hlasovanie: prítomní 7, za 7, proti 0, zdržal sa 0.',
    `Výpis vyhotovil ${mesto ? 'mestský' : 'obecný'} úrad dňa ${datumSk(posunDni(den, 2))}.`,
    podpis(p.ziadatel.statutar, p.ziadatel.funkcia),
  ];
}
function certifikat(p: Pripad, r: Priloha8Vysledok): Odsek[] {
  const b = p.budova;
  return [
    `Číslo certifikátu: EC-TS${p.cislo}-0001 (fiktívne) · energetický certifikát budovy podľa § 7 zákona č. 555/2005 Z. z. o energetickej hospodárnosti budov · stav pred obnovou (predrealizačný)`,
    { b: 'Identifikácia budovy' },
    { tab: [['Údaj', 'Hodnota'], ['Budova', b.nazov], ['Adresa', b.adresa], ['Katastrálne územie, parcela, súpisné číslo', `${b.ku}, parc. č. ${b.parcela}, súp. č. ${b.supisne}`], ['Kategória budovy', b.kategoria], ['Vlastník', p.ziadatel.nazov], ['Rok kolaudácie', String(b.rok)], ['Celková podlahová plocha', `${cis(b.plocha, 0)} m2`]] },
    { b: 'Globálny ukazovateľ – primárna energia (súčasný stav)' },
    { tab: [['Ukazovateľ', 'Hodnota'], ['Globálny ukazovateľ PE', `${cis(b.guPred, 0)} kWh/(m2.rok)`], ['Energetická trieda', trieda(b.kategoria, b.guPred)], ['Ročná primárna energia', `${cis(r.peVychMWh ?? peVych(b), 2)} MWh/rok`], ['Emisie CO2', `${cis(peVych(b) * EMISIE_T_NA_MWH, 2)} t/rok`]] },
    'Odporúčané opatrenia: zateplenie obalových konštrukcií, výmena otvorových konštrukcií, úprava vykurovacej sústavy a využitie obnoviteľných zdrojov energie.',
    `Spracovateľ: Ing. Marek Certifikačný, odborne spôsobilá osoba na energetickú certifikáciu budov, osvedčenie č. EC-T-0000/2020 (fiktívne).\nDátum vydania: ${datumSk(posunDni(p.predlozenie ?? p.zaciatok, -120))}\n......................................... podpis`,
  ];
}
function projektovaDokumentacia(p: Pripad, r: Priloha8Vysledok): Odsek[] {
  const b = p.budova, oze = p.aktivity.filter((a) => a.opatrenie === '2.2.2');
  return [
    `Stavba: ${p.projekt.nazov}\nMiesto stavby: ${b.adresa}, k. ú. ${b.ku}, parc. č. ${b.parcela}\nStavebník: ${p.ziadatel.nazov}\nStupeň: dokumentácia pre stavebné povolenie (overená v stavebnom konaní)`,
    { b: 'A. Technická správa' },
    `Budova z roku ${b.rok} má ${b.podlazia} nadzemné podlažia a celkovú podlahovú plochu ${cis(b.plocha, 0)} m2. Obalové konštrukcie nespĺňajú normové hodnoty súčiniteľa prechodu tepla podľa STN 73 0540-2. Navrhované riešenie:`,
    { tab: [['Aktivita', 'Navrhované riešenie'], ...p.aktivity.filter((a) => a.sekcia !== 'Projektová dokumentácia').map((a) => [a.sekcia, a.technika])] },
    { b: 'B. Statické posúdenie' },
    'Nosné konštrukcie unesú dodatočné zaťaženie zatepľovacím systémom a technologickými zariadeniami na streche; posúdenie je súčasťou dokumentácie.',
    { b: 'C. Výkresová časť' },
    { tab: [['Číslo výkresu', 'Názov'], ['A.01', 'Situácia'], ['A.02', 'Pôdorys 1. NP – navrhovaný stav'], ['A.03', 'Rez A-A'], ['A.04', 'Pohľady'], ['A.05', 'Detaily zateplenia']] },
    { b: 'D. Energetické hodnotenie (opatrenie 2.1.2)' },
    { tab: [['Ukazovateľ', 'Pred obnovou', 'Po obnove'], ['Globálny ukazovateľ PE [kWh/(m2.rok)]', cis(b.guPred, 0), cis(b.guPo, 0)], ['Energetická trieda', trieda(b.kategoria, b.guPred), trieda(b.kategoria, b.guPo)],
      ['Primárna energia [MWh/rok]', cis(r.peVychMWh ?? peVych(b), 2), cis(r.pePlanMWh ?? pePo(b), 2)], ['U obvodovej steny [W/(m2.K)]', '1,10', '0,21'], ['U strechy [W/(m2.K)]', '0,85', '0,13'], ['Uw okien [W/(m2.K)]', '2,60', '0,85']] },
    `Úspora primárnej energie: ${cis(r.usporaPercent ?? ((peVych(b) - pePo(b)) / peVych(b)) * 100)} %.`,
    ...(oze.length ? [{ b: 'E. Obnoviteľné zdroje energie (opatrenie 2.2.2): technická správa, situačný návrh' } as Odsek, ...oze.map((a) => `${a.sekcia}: ${a.technika}.`)] : []),
    'Zodpovedný projektant: Ing. arch. Jana Projektová, autorizovaný architekt, reg. č. 0000 AA (fiktívne)\n......................................... podpis a pečiatka',
  ];
}
function kontrolnyZoznam(p: Pripad, typ: '9a' | '9b'): Odsek[] {
  const skola = typ === '9b';
  const riadky = skola
    ? ['Parkovanie', 'Chodníky', 'Vstup do budovy', 'Vstupné dvere a priestory', 'Parametre rampy', 'Vybavenie rampy', 'Trasy po budove', 'Riešenie výškových rozdielov v budove', 'Bezbariér. toalety', 'Učebne, dielne', 'Šatne a umyvárne', 'Telocvičňa', 'Jedáleň', 'Školský areál', 'Ubytovacie zariadenie']
    : ['Parkovanie', 'Chodníky', 'Vstup do budovy', 'Vstupné dvere a priestory', 'Parametre rampy', 'Vybavenie rampy', 'Trasy po budove', 'Riešenie výškových rozdielov v budove', 'Bezbariér. toalety', 'Administr. pracoviská, kancelárie', 'Priestor styku s klientom, čakáreň', 'Šatne a umyvárne', 'Rokovacie miestnosti, zasadačky', 'Jedáleň', 'Únikové cesty', 'Rozptylové plochy, vonkajšie priestory', 'Prevádzk. priestory, dielne, archívy, sklady a p.'];
  const nerelevantne = new Set(skola ? ['Ubytovacie zariadenie'] : ['Jedáleň', 'Prevádzk. priestory, dielne, archívy, sklady a p.']);
  return [
    `Príloha č. ${typ === '9a' ? '9a' : '9b'} ŽoNFP – Dokument súladu projektu s horizontálnymi princípmi (kontrolný zoznam podľa vzoru výzvy, akt. 1)`,
    'Zisťuje sa súlad so stavebnou legislatívou, najmä so stavebným zákonom, vyhláškou MŽP č. 532/2002 Z. z. a článkom 9 Prístupnosť Dohovoru o právach osôb so zdravotným postihnutím.',
    { b: 'Identifikácia výzvy' },
    { tab: [['Údaj', 'Hodnota'], ['Názov výzvy', 'Výzva na predkladanie žiadostí o NFP – obnova verejných budov (opatrenie 2.1.2)'], ['Kód výzvy', VYZVA], ['Priorita', '2P1 Energetická efektívnosť a dekarbonizácia'], ['Špecifický cieľ', 'RSO2.1'], ['Opatrenie', '2.1.2'], ['Názov žiadateľa / prijímateľa', p.ziadatel.nazov]] },
    { b: 'Druh a umiestnenie stavby' },
    { tab: [['Údaj', 'Hodnota'], ['Druh stavby', 'rekonštrukcia'], ['Názov stavby', p.projekt.nazov], ['Adresa umiestnenia stavby', p.budova.adresa], ['Číslo parcely', p.budova.parcela], ['Autor návrhu', 'Ing. arch. Jana Projektová (fiktívne); telefón a e-mail sa v testovacej sade neuvádzajú']] },
    'Prehlasujem, že požiadavky na bezbariérovú prístupnosť sú realizované v súlade so stavebnou legislatívou a spĺňajú štandardy uvedené v nasledujúcej tabuľke.',
    { tab: [['Časť', 'Sú splnené požiadavky?'], ...riadky.map((t, i) => [`${i + 1}. ${t}`, nerelevantne.has(t) ? 'nie – nerelevantné pre túto budovu' : 'áno'])] },
    `Doplňujúce informácie: časti ${[...nerelevantne].join(', ')} nie sú v predmetnej budove relevantné.`,
    `Dátum, miesto: ${datumSk(posunDni(p.predlozenie ?? p.zaciatok, -30))}, ${p.ziadatel.sidlo}\n......................................... podpis autora návrhu`,
  ];
}

// ---------- zápis
const { pdf, prehliadac, uprac } = tlaciarenPdf(PATA);
if (!prehliadac) throw new Error('Na PDF prílohy treba Edge alebo Chrome (premenná PREHLIADAC).');
fs.mkdirSync(OUT, { recursive: true });
for (const f of fs.readdirSync(OUT)) fs.rmSync(path.join(OUT, f), { recursive: true, force: true });
const pracovny = fs.mkdtempSync(path.join(os.tmpdir(), 'testovacia-sada-'));
interface SuborVZipe { nazov: string; typ: 'formular' | 'priloha'; priloha: string | null; istota: 'cislo' | 'nazov' }
const vystup: { cislo: string; slug: string; titul: string; scenar: string; preco: string; zip: string; subory: SuborVZipe[]; ocakavane: Ocakavane;
  doplnenie?: { zip: string; subory: SuborVZipe[]; ocakavane: Ocakavane }; potvrdenie?: { ocakavane: Ocakavane };
  predlozenie: string | null; kraj: string; kategoria: string; nfp: number; uspora: number | null }[] = [];

P.forEach((p, n) => {
  const dir = path.join(pracovny, p.cislo); fs.mkdirSync(dir);
  const cesta = (meno: string) => path.join(dir, meno);
  const meno = (sCislom: string, bezCisla: string) => (p.bezCisla ? bezCisla : sCislom);
  const ascii = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '_');
  const p8 = meno('Priloha_8_Dokumentacia_k_OV.xlsm', 'Rozpocet_projektu.xlsm');
  const r = vyplnPrilohu8(specPrilohy8(p), cesta(p8));
  if (r.hlasky.length) console.log(`  ${p.cislo} hlásky zošita: ${r.hlasky.join(' | ')}`);
  const f = formular(p, r, n);
  const subory: { nazov: string; priloha: string | null }[] = [];
  const pridaj = (nazov: string, priloha: string | null) => subory.push({ nazov, priloha });
  const nazovFormulara = `Formular_ZoNFP_${f.kod}.json`;
  fs.writeFileSync(cesta(nazovFormulara), JSON.stringify(f, null, 2) + '\n'); pridaj(nazovFormulara, null);
  const hl = hlavicka(p.ziadatel);
  if (p.plnomoc) { pdf(cesta('Priloha_1a_Plnomocenstvo.pdf'), hl, 'PLNOMOCENSTVO', plnomoc(p)); pridaj('Priloha_1a_Plnomocenstvo.pdf', '1'); }
  if (p.ziadatel.forma === '801') { const m = meno(`Priloha_3_Uznesenie_${ascii(p.ziadatel.sidlo)}.pdf`, 'Uznesenie_obecneho_zastupitelstva.pdf'); pdf(cesta(m), hl, `Výpis z uznesení ${p.ziadatel.nazov.startsWith('Mesto') ? 'mestského' : 'obecného'} zastupiteľstva`, uznesenie(p)); pridaj(m, '3'); }
  { const m = meno('Priloha_6_Energeticky_certifikat.pdf', 'Energeticky_certifikat_budovy.pdf'); pdf(cesta(m), 'Energetická certifikácia budov', 'Energetický certifikát budovy', certifikat(p, r)); pridaj(m, '6'); }
  { const m = meno('Priloha_7_Projektova_dokumentacia.pdf', 'Technicka_sprava_a_vykresy.pdf'); pdf(cesta(m), 'Projektová dokumentácia stavby', 'Projektová dokumentácia', projektovaDokumentacia(p, r)); pridaj(m, '7'); }
  pridaj(p8, '8');
  if (p.priloha9) { const m = 'Priloha_9_Horizontalne_principy_kontrolny_zoznam.pdf'; pdf(cesta(m), hl, `Checklist – vyhlásenie o bezbariérovej prístupnosti – debarierizácia ${p.priloha9 === '9b' ? 'školy' : 'administratívnej budovy'}`, kontrolnyZoznam(p, p.priloha9)); pridaj(m, '9'); }

  const vZipe = (s: { nazov: string; priloha: string | null }): SuborVZipe => ({ nazov: s.nazov, typ: s.priloha ? 'priloha' : 'formular', priloha: s.priloha, istota: s.priloha && p.bezCisla ? 'nazov' : 'cislo' });
  const doDoplnenia = (s: { priloha: string | null }) => !!s.priloha && (p.doplnenie as string[] | undefined)?.includes(s.priloha);
  const hlavne = subory.filter((s) => !doDoplnenia(s)), neskor = subory.filter(doDoplnenia);
  const zapisZip = (nazov: string, zoznam: typeof subory) => fs.writeFileSync(path.join(OUT, nazov), zip(zoznam.map((s) => ({ nazov: s.nazov, data: fs.readFileSync(cesta(s.nazov)) }))));
  const zipMeno = `${p.cislo}-${p.slug}.zip`;
  zapisZip(zipMeno, hlavne);
  let doplnenie;
  if (neskor.length) { const z = `${p.cislo}-doplnenie.zip`; zapisZip(z, neskor); doplnenie = { zip: z, subory: neskor.map(vZipe), ocakavane: p.poDoplneni! }; }
  vystup.push({ cislo: p.cislo, slug: p.slug, titul: p.titul, scenar: p.scenar, preco: p.preco, zip: zipMeno, subory: hlavne.map(vZipe), ocakavane: p.ocakavane,
    ...(doplnenie ? { doplnenie } : {}), ...(p.poPotvrdeni ? { potvrdenie: { ocakavane: p.poPotvrdeni } } : {}),
    predlozenie: p.predlozenie, kraj: p.miesto.kraj, kategoria: p.kategoriaRegionov, nfp: f.sumaZiadanaNFP, uspora: r.usporaPercent });
  console.log(`${p.cislo} ${p.titul}: NFP ${eur(f.sumaZiadanaNFP)}, úspora ${r.usporaPercent == null ? '?' : cis(r.usporaPercent)} %, zošit M210 ${eur(r.poHodnoteZaPeniaze ?? 0)} + M270 ${eur(r.ozePoHodnoteZaPeniaze ?? 0)}; ${hlavne.length} súborov${neskor.length ? ` + doplnenie ${neskor.length}` : ''}`);
});
uprac();
fs.rmSync(pracovny, { recursive: true, force: true });

// ---------- očakávané výsledky a návod
const ocakavane = {
  vyzva: VYZVA,
  poznamka: 'Očakávané výsledky posudku bez modelu (llm: false). Body VER-ITMS a VER-KONTROLA závisia od kontroly zmien výzvy v prostredí a neporovnávajú sa. Porovnávajú sa len uvedené pravidlá.',
  pripady: vystup.map(({ predlozenie, kraj, kategoria, nfp, uspora, ...v }) => v),
};
fs.writeFileSync(path.join(OUT, 'ocakavane.json'), JSON.stringify(ocakavane, null, 2) + '\n');

const NAVRH: Record<Navrh, string> = { nesplnene_podmienky: 'nesplnené podmienky', vyzva_na_doplnenie: 'výzva na doplnenie', na_preverenie: 'na preverenie', ciastocne_overene: 'čiastočne overené', bez_zisteni: 'bez zistení' };
const VERZIA = { akt2: 'zmena č. 2', zmena3: 'zmena č. 3' };
const kluc = (o: Ocakavane, zaklad: Ocakavane | null) => {
  const zmeny = Object.entries(o.nalezy).filter(([k, s]) => s !== 'splnene' && s !== 'neuplatnuje_sa' && (!zaklad || zaklad.nalezy[k] !== s)).map(([k, s]) => `${k} ${s.replace('_', ' ')}`);
  return [...zmeny, ...o.ver].join(', ') || '–';
};
const riadok = (v: typeof vystup[number]) => `| ${v.cislo} | ${v.titul} | ${v.predlozenie ? datumSk(v.predlozenie) : 'chýba'} | ${v.kraj} (${v.kategoria}) | ${VERZIA[v.ocakavane.verzia]} | **${NAVRH[v.ocakavane.navrh]}** | ${kluc(v.ocakavane, null)} |`;
const readme = `# Testovacia sada: nové žiadosti o NFP

Pätnásť fiktívnych žiadostí o NFP do výzvy **${VYZVA}** na skúšku podateľne. Každý ZIP je jedno nové podanie: formulár ŽoNFP a prílohy. Pri každom je uvedené, čo má softvér navrhnúť a prečo.

> Všetko je vymyslené: žiadatelia, osoby, IČO, čísla dokladov aj podpisy. Každý dokument to má v päte. Súbory sa nikam neposielajú.

## Z čoho je sada postavená

| Časť podania | Oficiálny vzor alebo pravidlo |
|---|---|
| Formulár ŽoNFP (\`Formular_ZoNFP_*.json\`) | štruktúra detailu žiadosti z verejného API ITMS21+ (\`https://api.itms21.sk/public/v1/zonfp/id/{id}\`), rovnaká ako v demo žiadosti G856; obsah podľa Prílohy č. 1 výzvy (Formulár ŽoNFP) |
| Príloha č. 1a – plnomocenstvo | vzor výzvy \`Priloha_1a_ZoNFP__Plnomoc.doc\` (akt. 3) |
| Prílohy č. 3, 6, 7 | náležitosti podľa Prílohy č. 2 výzvy (Zoznam príloh ŽoNFP, akt. 3): uznesenia o programe rozvoja a územnom pláne, predrealizačný energetický certifikát (§ 7 zákona č. 555/2005 Z. z.), projektová dokumentácia s energetickým hodnotením |
| Príloha č. 8 (\`.xlsm\`) | záväzný zošit výzvy \`Priloha_8_ZoNFP_Dokument._k_OV_akt.3.xlsm\`, vyplnený a prepočítaný v MS Excel; rozpočet formulára je z neho odvodený (krátenie podľa pásma úspory, PPP č. 13) |
| Príloha č. 9 (len znenie pred zmenou č. 3) | kontrolné zoznamy bezbariérovosti 9a (administratívne budovy) a 9b (školy) z Prílohy č. 2 výzvy akt. 1 |
| Dátumy, kolá, znenia výzvy | harmonogram kôl výzvy (kolo 1: 23. 2. 2024, kolo 2: 1. 3. 2024, potom každý piatok), § 14 a § 16 zákona č. 121/2022 Z. z. |
| Konanie (doplnenie, zastavenie) | MD č. 21 Konanie o ŽoNFP v1.0 (MIRRI, máj 2026): chýbajúca príloha → výzva na doplnenie (najmenej 5 pracovných dní), včasnosť podľa odoslania do e-schránky |

Zdroje sú v \`data/zdroje/\` (výzva a jej prílohy, MU č. 9 k príprave výzvy, MD č. 21, všeobecná informácia CKO).

## Ako nahrávať

1. Spustite aplikáciu (\`npm start\`, http://127.0.0.1:5177) a otvorte **Podateľňa**.
2. Vyberte výzvu ${VYZVA}, pridajte ZIP prípadu (napr. \`01-komplet-zmena3.zip\`) a kliknite **Prijať podanie**. Podateľňa ZIP rozbalí do jedného spisu.
3. V spise vypnite **Čítať prílohy lokálnym modelom** (očakávania platia pre posudok bez modelu) a kliknite **Posúdiť žiadosť**.
4. Porovnajte návrh a nálezy s tabuľkou nižšie. Body VER-ITMS a VER-KONTROLA (kontrola zmien výzvy v ITMS21+) závisia od toho, kedy sa naposledy spustilo \`npm run zmeny\`, preto nie sú v očakávaniach.
5. Prípady s doplnením (02, 07): po prvom posudku nahrajte \`NN-doplnenie.zip\` cez **Nahrať doplnenie** a posúďte znova.
6. Prípad 14: pri každej prílohe označenej „odhad“ kliknite **Potvrdiť** a posúďte znova.

Celú sadu overí aj automatický test (vlastný server, databáza v pamäti): \`npm run test:sada\`. Sadu znova vytvorí \`npm run demo:sada\` (Windows, MS Excel, Edge alebo Chrome).

## Prípady a očakávané výsledky (bez modelu)

Návrh „na preverenie“ pri úplnej žiadosti je správny: softvér niektoré podmienky výzvy nekontroluje celé (poistka úplnosti) a registre overuje človek, preto nikdy nenavrhne „bez zistení“.

| # | Scenár | Predložená | Kraj (kategória) | Znenie výzvy | Návrh | Určujúce nálezy |
|---|---|---|---|---|---|---|
${vystup.map(riadok).join('\n')}

Po doplnení alebo potvrdení zaradenia:

| # | Krok | Návrh | Určujúce nálezy |
|---|---|---|---|
${vystup.flatMap((v) => [
  ...(v.doplnenie ? [`| ${v.cislo} | nahrať \`${v.doplnenie.zip}\` | **${NAVRH[v.doplnenie.ocakavane.navrh]}** | ${kluc(v.doplnenie.ocakavane, null)} |`] : []),
  ...(v.potvrdenie ? [`| ${v.cislo} | potvrdiť zaradenie príloh | **${NAVRH[v.potvrdenie.ocakavane.navrh]}** | ${kluc(v.potvrdenie.ocakavane, null)} |`] : []),
]).join('\n')}

## Podrobnosti prípadov

${vystup.map((v) => `### ${v.cislo} · ${v.titul}

${v.scenar}

**Prečo:** ${v.preco}

Súbory v \`${v.zip}\`: ${v.subory.map((s) => `\`${s.nazov}\``).join(', ')}${v.doplnenie ? `. Doplnenie \`${v.doplnenie.zip}\`: ${v.doplnenie.subory.map((s) => `\`${s.nazov}\``).join(', ')}` : ''}. Žiadaný NFP ${eur(v.nfp)}${v.uspora != null ? `, úspora primárnej energie ${cis(v.uspora)} %` : ''}.
`).join('\n')}
## Čo sada neoveruje

- Posudok s lokálnym modelom (L01, L05, L07): závisí od modelu, očakávania platia pre posudok bez neho.
- Registre (G02 až G15): softvér ich z podkladov neoverí, vždy idú človeku.
- Hranice energetických tried v certifikátoch sú orientačné (nie sú overené voči vyhláške), na pravidlá softvéru nemajú vplyv.
`;
fs.writeFileSync(path.join(OUT, 'README.md'), readme);
console.log(`Hotovo: ${vystup.length} prípadov → ${path.relative(KOREN, OUT)}`);
