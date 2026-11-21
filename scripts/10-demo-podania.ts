// Demo podania pre simuláciu práce kontrolóra: tri vymyslené žiadosti o NFP s prílohami (PDF, DOCX, JSON formulár)
// a dve skutočné žiadosti z ITMS21+ (len odkaz na kód, verejné údaje formulára; prílohy ITMS nezverejňuje).
// Subjekty A, B, C sú fiktívne. Každý dokument má v päte upozornenie, že ide o ukážku.
// PDF vznikajú z HTML cez Edge alebo Chrome v režime bez okna (textová vrstva, ktorú prečíta pdftotext).
// Spustenie: node scripts/10-demo-podania.ts  → demo/podania/
import fs from 'node:fs';
import path from 'node:path';
import { docx as docxSPatou, ico, tlaciarenPdf, zip, type Odsek } from './lib/dokumenty.ts';

const KOREN = path.join(import.meta.dirname, '..');
const OUT = path.join(KOREN, 'demo', 'podania');
const VYZVA = 'PSK-SIEA-002-2023-DV-EFRR';
const PATA = 'Ukážkový dokument pre demo softvéru eurofondy-kontrola. Fiktívny subjekt, nejde o skutočný doklad.';
const docx = (odseky: Odsek[]) => docxSPatou(odseky, PATA);
const { pdf, prehliadac: PREHLIADAC, uprac } = tlaciarenPdf(PATA);

// ---------- fiktívne subjekty
const eur = (n: number) => n.toLocaleString('sk-SK', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' EUR';
const cis = (n: number, d = 1) => n.toLocaleString('sk-SK', { maximumFractionDigits: d });
const OBEC = 'Obec (obecný úrad), mesto (mestský úrad)';

interface Akt { kod: string; nazov: string; hlavna: boolean; opatrenie: string; skupina: string; suma: number }
interface Demo {
  kluc: string; priecinok: string; obec: string; ulica: string; psc: string; okres: string; kraj: string; ico: string; statutar: string; funkcia: string;
  kod: string; nazov: string; predlozenie: string; zaciatok: string; koniec: string; popis: string; ucel: string; budova: string; kategoria: string;
  akt: Akt[]; uk: { kod: string; nazov: string; typ: 'vystup' | 'vysledok'; jednotka: string; vychodisko: number | null; ciel: number }[];
}
const UK = {
  m2: (c: number) => ({ kod: 'PSKPRCO19', nazov: 'Verejné budovy so zlepšenou energetickou hospodárnosťou', typ: 'vystup' as const, jednotka: 'm2', vychodisko: 0, ciel: c }),
  pe: (v: number, c: number) => ({ kod: 'PSKPRCR26b', nazov: 'Ročná primárna spotreba energie: verejné budovy', typ: 'vysledok' as const, jednotka: 'MWh/rok', vychodisko: v, ciel: c }),
  ozeE: (c: number) => ({ kod: 'PSKPRCO22a', nazov: 'Dodatočná výrobná kapacita v oblasti energie z obnoviteľných zdrojov: elektrická', typ: 'vystup' as const, jednotka: 'MW', vychodisko: 0, ciel: c }),
  ozeT: (c: number) => ({ kod: 'PSKPRCO22b', nazov: 'Dodatočná výrobná kapacita v oblasti energie z obnoviteľných zdrojov: tepelná', typ: 'vystup' as const, jednotka: 'MW', vychodisko: 0, ciel: c }),
};

const A: Demo = {
  kluc: 'A', priecinok: 'A-Obec-Vzorova', obec: 'Obec Vzorová', ulica: 'Hlavná 1', psc: '903 99', okres: 'Senec', kraj: 'Bratislavský kraj', ico: ico('0099991'),
  statutar: 'Ing. Martin Vzorný', funkcia: 'starosta obce', kod: 'DEMO-A-2025-001', nazov: 'Obnova budovy Základnej školy Vzorová',
  predlozenie: '2025-11-27', zaciatok: '2026-03-01', koniec: '2027-10-31', budova: 'budova Základnej školy Vzorová, Školská 5, Vzorová', kategoria: 'budova školy a školského zariadenia',
  popis: 'Predmetom projektu je obnova budovy Základnej školy Vzorová, ktorej vlastníkom je Obec Vzorová. Budova slúži na výchovu a vzdelávanie približne 260 žiakov 1. až 9. ročníka a je v pôvodnom technickom stave z roku 1978. Projekt rieši zateplenie obvodového plášťa a strechy, výmenu otvorových konštrukcií, modernizáciu osvetlenia a inštaláciu fotovoltickej elektrárne s výkonom 49,5 kWp na streche školy. Po obnove sa budova podľa globálneho ukazovateľa primárna energia zlepší z triedy D na triedu B.',
  ucel: 'Účelom projektu je znížiť spotrebu primárnej energie budovy školy a náklady obce na jej prevádzku.',
  akt: [
    { kod: 'A1', nazov: 'Zateplenie obvodového plášťa a strechy budovy ZŠ Vzorová', hlavna: true, opatrenie: '2.1.2', skupina: 'Stavby', suma: 720000 },
    { kod: 'A2', nazov: 'Výmena otvorových konštrukcií budovy ZŠ Vzorová', hlavna: true, opatrenie: '2.1.2', skupina: 'Stavby', suma: 255000 },
    { kod: 'A3', nazov: 'Modernizácia osvetlenia budovy ZŠ Vzorová', hlavna: true, opatrenie: '2.1.2', skupina: 'Samostatné hnuteľné veci a súbory hnuteľných vecí', suma: 75000 },
    { kod: 'A4', nazov: 'Inštalácia fotovoltickej elektrárne na streche ZŠ Vzorová', hlavna: true, opatrenie: '2.2.2', skupina: 'Samostatné hnuteľné veci a súbory hnuteľných vecí', suma: 62000 },
    { kod: 'P1', nazov: 'Podporné aktivity', hlavna: false, opatrenie: '2.1.2', skupina: 'Ostatné služby', suma: 68000 },
  ],
  uk: [UK.m2(1650), UK.pe(412.6, 168.3), UK.ozeE(0.0495)],
};
const B: Demo = {
  kluc: 'B', priecinok: 'B-Mesto-Ukazkovo', obec: 'Mesto Ukážkovo', ulica: 'Námestie slobody 10', psc: '902 99', okres: 'Pezinok', kraj: 'Bratislavský kraj', ico: ico('0099992'),
  statutar: 'Mgr. Jana Ukážková', funkcia: 'primátorka mesta', kod: 'DEMO-B-2025-002', nazov: 'Zníženie energetickej náročnosti budovy Mestského úradu Ukážkovo',
  predlozenie: '2025-11-20', zaciatok: '2026-04-01', koniec: '2028-03-31', budova: 'budova Mestského úradu Ukážkovo, Námestie slobody 10, Ukážkovo', kategoria: 'administratívna budova',
  popis: 'Predmetom projektu je obnova administratívnej budovy Mestského úradu Ukážkovo vo vlastníctve Mesta Ukážkovo. V budove sídli mestský úrad a matrika, denne ju navštívi približne 150 občanov. Projekt zahŕňa zateplenie obvodového plášťa a strechy, výmenu okien a dverí, inštaláciu vzduchotechniky s rekuperáciou tepla a náhradu plynovej kotolne tepelnými čerpadlami vzduch-voda s tepelným výkonom 180 kW.',
  ucel: 'Účelom projektu je znížiť energetickú náročnosť budovy mestského úradu a využívať obnoviteľné zdroje energie na vykurovanie.',
  akt: [
    { kod: 'A1', nazov: 'Zateplenie obvodového plášťa a strechy budovy MsÚ Ukážkovo', hlavna: true, opatrenie: '2.1.2', skupina: 'Stavby', suma: 1380000 },
    { kod: 'A2', nazov: 'Výmena otvorových konštrukcií budovy MsÚ Ukážkovo', hlavna: true, opatrenie: '2.1.2', skupina: 'Stavby', suma: 420000 },
    { kod: 'A3', nazov: 'Inštalácia vzduchotechniky s rekuperáciou tepla v budove MsÚ Ukážkovo', hlavna: true, opatrenie: '2.1.2', skupina: 'Stavby', suma: 310000 },
    { kod: 'A4', nazov: 'Inštalácia tepelných čerpadiel vzduch-voda v budove MsÚ Ukážkovo', hlavna: true, opatrenie: '2.2.2', skupina: 'Samostatné hnuteľné veci a súbory hnuteľných vecí', suma: 205000 },
    { kod: 'P1', nazov: 'Podporné aktivity', hlavna: false, opatrenie: '2.1.2', skupina: 'Ostatné služby', suma: 135000 },
  ],
  uk: [UK.m2(3900), UK.pe(905.0, 391.0), UK.ozeT(0.18)],
};
const C: Demo = {
  kluc: 'C', priecinok: 'C-Obec-Skusobna', obec: 'Obec Skúšobná', ulica: 'Obecná 12', psc: '901 99', okres: 'Malacky', kraj: 'Bratislavský kraj', ico: ico('0099993'),
  statutar: 'Ing. Ján Skúšobný', funkcia: 'starosta obce', kod: 'DEMO-C-2025-003', nazov: 'Obnova obecného nájomného bytového domu Skúšobná',
  predlozenie: '2025-11-24', zaciatok: '2026-05-01', koniec: '2027-06-30', budova: 'obecný nájomný bytový dom, Lipová 3, Skúšobná', kategoria: 'bytový dom',
  popis: 'Predmetom projektu je obnova obecného nájomného bytového domu so 16 bytmi na ulici Lipová 3, ktorý vlastní Obec Skúšobná a prenajíma ho mladým rodinám. Projekt rieši zateplenie obvodového plášťa a výmenu okien v spoločných priestoroch aj v bytoch.',
  ucel: 'Účelom projektu je znížiť náklady nájomníkov na vykurovanie a predĺžiť životnosť budovy.',
  akt: [
    { kod: 'A1', nazov: 'Zateplenie obvodového plášťa bytového domu Lipová 3', hlavna: true, opatrenie: '2.1.2', skupina: 'Stavby', suma: 290000 },
    { kod: 'A2', nazov: 'Výmena otvorových konštrukcií bytového domu Lipová 3', hlavna: true, opatrenie: '2.1.2', skupina: 'Stavby', suma: 90000 },
    { kod: 'P1', nazov: 'Podporné aktivity', hlavna: false, opatrenie: '2.1.2', skupina: 'Ostatné služby', suma: 32000 },
  ],
  uk: [UK.m2(820), UK.pe(182.0, 132.1)],
};

const sumy = (d: Demo) => {
  const spolu = d.akt.reduce((s, a) => s + a.suma, 0);
  const ee = d.akt.filter((a) => a.hlavna && a.opatrenie === '2.1.2').reduce((s, a) => s + a.suma, 0);
  const oze = d.akt.filter((a) => a.hlavna && a.opatrenie === '2.2.2').reduce((s, a) => s + a.suma, 0);
  const pe = d.uk.find((u) => u.kod === 'PSKPRCR26b')!; const mwh = pe.vychodisko! - pe.ciel;
  const mw = d.uk.filter((u) => u.kod.startsWith('PSKPRCO22')).reduce((s, u) => s + u.ciel, 0);
  return { spolu, ee, oze, pe, mwh, percent: (mwh / pe.vychodisko!) * 100, mw };
};
const datumSk = (iso: string) => { const [r, m, d] = iso.split('-'); return `${Number(d)}. ${Number(m)}. ${r}`; };
const hlavicka = (d: Demo) => `${d.obec}\n${d.ulica}, ${d.psc} ${d.obec.replace(/^(Obec|Mesto) /, '')} · IČO ${d.ico}`;

function formular(d: Demo) {
  const s = sumy(d);
  const mesiace = Math.round((new Date(d.koniec).getTime() - new Date(d.zaciatok).getTime()) / 86400_000 / 30.44);
  return {
    _poznamka: 'Štruktúrované údaje formulára ŽoNFP (v praxi z ITMS21+). Fiktívny subjekt pre demo.',
    kod: d.kod, nazov: d.nazov, vyzvaKod: VYZVA, datumPredlozenia: d.predlozenie,
    ziadatel: { nazov: d.obec, ico: d.ico, pravnaFormaKod: '801', pravnaForma: OBEC },
    miesta: [{ kraj: d.kraj, okres: d.okres, obec: d.obec.replace(/^(Obec|Mesto) /, ''), lokalita: 'SLOVENSKA_REPUBLIKA' }],
    // Demo podania sú z novembra 2025: od 9. 1. 2025 bola výzva pre MRR uzavretá (ITMS21+, verzia 5 výzvy), preto Bratislavský kraj (VRR).
    kategoriaRegionov: ['VRR'], sumaZiadanaNFP: s.spolu, sumaZiadanaCelkova: s.spolu, percentoZiadane: 1,
    dlzkaHlavnychAktivitMes: mesiace, zaciatokHlavnychAktivit: d.zaciatok, koniecHlavnychAktivit: d.koniec,
    popis: d.popis, ucel: d.ucel, opatrenia: [...new Set(d.akt.filter((a) => a.hlavna).map((a) => a.opatrenie))],
    aktivity: d.akt.map((a) => ({ kod: a.kod, nazov: a.nazov, hlavna: a.hlavna, opatrenie: a.opatrenie, zaciatok: a.hlavna ? d.zaciatok : null, koniec: a.hlavna ? d.koniec : null })),
    rozpocet: d.akt.map((a) => ({ aktivita: a.nazov, hlavna: a.hlavna, opatrenie: a.opatrenie, skupinaVydavkov: a.skupina, suma: a.suma })),
    ukazovatele: d.uk,
  };
}

// ---------- prílohy
const uznesenie = (d: Demo): Odsek[] => {
  const zast = d.obec.startsWith('Mesto') ? 'Mestské zastupiteľstvo' : 'Obecné zastupiteľstvo';
  const meno = d.obec.replace(/^(Obec|Mesto) /, '');
  return [
    `z 18. zasadnutia: ${zast} v ${meno} konaného dňa 12. 6. 2025`,
    { b: `Uznesenie č. 45/2025` },
    `${zast} po prerokovaní`,
    `A) schvaľuje predloženie žiadosti o nenávratný finančný príspevok na realizáciu projektu „${d.nazov}“ v rámci výzvy ${VYZVA};`,
    `B) konštatuje, že projekt je v súlade s Programom hospodárskeho rozvoja a sociálneho rozvoja ${d.obec.startsWith('Mesto') ? 'mesta' : 'obce'} ${meno} na roky 2023 – 2030, schváleným uznesením č. 12/2023, a s Územným plánom ${d.obec.startsWith('Mesto') ? 'mesta' : 'obce'} ${meno} v znení zmien a doplnkov č. 2;`,
    `C) schvaľuje zabezpečenie realizácie projektu a financovanie prípadných neoprávnených výdavkov z rozpočtu.`,
    `Hlasovanie: za 7, proti 0, zdržal sa 0.`,
    `Výpis vyhotovil: obecný (mestský) úrad dňa 13. 6. 2025.\n\n${d.statutar}, ${d.funkcia}\n......................................... podpis`,
  ];
};
const certifikat = (d: Demo): Odsek[] => {
  const s = sumy(d);
  // Orientačné hranice tried v kWh/(m2.rok), len pre demo (skutočné hranice závisia od kategórie budovy).
  const trieda = (mwhM2: number) => { const k = mwhM2 * 1000; return k <= 34 ? 'A0' : k <= 68 ? 'A1' : k <= 136 ? 'B' : k <= 204 ? 'C' : k <= 272 ? 'D' : k <= 340 ? 'E' : k <= 408 ? 'F' : 'G'; };
  const m2 = d.uk.find((u) => u.kod === 'PSKPRCO19')!.ciel;
  return [
    `Číslo certifikátu: EC-${d.kluc}-2025-0417 · projektové energetické hodnotenie podľa zákona č. 555/2005 Z. z. o energetickej hospodárnosti budov`,
    { b: 'Identifikácia budovy' },
    { tab: [['Údaj', 'Hodnota'], ['Budova', d.budova], ['Kategória budovy', d.kategoria], ['Vlastník', d.obec], ['Celková podlahová plocha', `${cis(m2, 0)} m2`]] },
    { b: 'Globálny ukazovateľ – primárna energia' },
    { tab: [['Stav', 'Primárna energia (MWh/rok)', 'Energetická trieda'], ['Súčasný stav', cis(s.pe.vychodisko!), trieda(s.pe.vychodisko! / m2)], ['Po obnove (projekt)', cis(s.pe.ciel), trieda(s.pe.ciel / m2)]] },
    `Úspora primárnej energie po realizácii opatrení: ${cis(s.mwh)} MWh/rok, t. j. ${cis(s.percent)} %.`,
    `Spracovateľ: Ing. Lucia Certifikačná, odborne spôsobilá osoba na energetickú certifikáciu budov, osvedčenie č. ${d.kluc}-0123/2019.\nDátum vydania: 10. 10. 2025\n......................................... podpis`,
  ];
};
const technickaSprava = (d: Demo): Odsek[] => [
  `Stavba: ${d.nazov}\nMiesto stavby: ${d.budova}\nStavebník: ${d.obec}\nStupeň: dokumentácia pre stavebné povolenie`,
  { b: '1. Súhrnná technická správa' },
  `Budova je v pôvodnom technickom stave, obvodové konštrukcie nespĺňajú normové hodnoty súčiniteľa prechodu tepla podľa STN 73 0540-2. Projekt navrhuje tieto opatrenia:`,
  { tab: [['Aktivita', 'Navrhované riešenie'], ...d.akt.filter((a) => a.hlavna).map((a) => [a.nazov, /Zateplen/.test(a.nazov) ? 'kontaktný zatepľovací systém EPS 160 mm, strecha minerálna vlna 300 mm' : /otvorov/.test(a.nazov) ? 'okná a dvere s Uw ≤ 0,9 W/(m2.K), izolačné trojsklo' : /osvetl/.test(a.nazov) ? 'LED svietidlá s reguláciou podľa denného svetla' : /fotovolt/.test(a.nazov) ? 'fotovoltické panely 110 ks × 450 Wp, striedač 50 kW' : /čerpad/.test(a.nazov) ? 'tepelné čerpadlá vzduch-voda 3 × 60 kW, akumulačná nádrž' : 'zariadenie podľa výkresovej časti'])] },
  { b: '2. Vplyv na energetickú hospodárnosť' },
  `Navrhované opatrenia znížia potrebu tepla na vykurovanie a spotrebu primárnej energie budovy; výpočet je v projektovom energetickom hodnotení (energetický certifikát).`,
  `Zodpovedný projektant: Ing. arch. Pavol Projektový, autorizovaný architekt SKA, reg. č. 9${d.kluc.charCodeAt(0)}1\n......................................... podpis`,
];
const opravnenost = (d: Demo): Odsek[] => {
  const s = sumy(d);
  return [
    { b: `Príloha č. 8 ŽoNFP – Dokumentácia k oprávnenosti výdavkov` },
    `Projekt: ${d.nazov} · Žiadateľ: ${d.obec} · Výzva: ${VYZVA}`,
    { tab: [['Aktivita', 'Opatrenie', 'Skupina výdavkov', 'Oprávnený výdavok'], ...d.akt.map((a) => [a.nazov, a.opatrenie, a.skupina, eur(a.suma)]), ['Spolu', '', '', eur(s.spolu)]] },
    { b: 'Hodnota za peniaze' },
    { tab: [['Ukazovateľ', 'Výpočet', 'Výsledok', 'Limit výzvy'],
      ['Energetická efektívnosť (2.1.2)', `${eur(s.ee)} / ${cis(s.mwh)} MWh/rok`, `${cis(s.ee / s.mwh, 0)} EUR/MWh/rok`, '5 500 EUR/MWh/rok'],
      ...(s.oze ? [['Obnoviteľné zdroje (2.2.2)', `${eur(s.oze)} / ${cis(s.mw, 4)} MW`, `${cis(s.oze / s.mw, 0)} EUR/MW`, '1 400 000 EUR/MW']] : [])] },
    `Výdavky sú uvedené bez DPH, ktorá je pre žiadateľa neoprávneným výdavkom.`,
    `Vypracoval: ${d.statutar}, ${d.funkcia}, dňa ${datumSk(d.predlozenie)}`,
  ];
};
const plnomocenstvoUplne = (d: Demo): Odsek[] => [
  `Splnomocniteľ: ${d.obec}, ${d.ulica}, ${d.psc}, IČO ${d.ico}, v zastúpení: ${d.statutar}, ${d.funkcia} (štatutárny orgán)`,
  `Splnomocnenec: Ing. Peter Príkladný, vedúci odboru výstavby a investícií mestského úradu`,
  `Týmto splnomocňujem vyššie uvedeného splnomocnenca, aby v mene splnomocniteľa vykonával všetky úkony spojené s prípravou, predložením a zmenami žiadosti o nenávratný finančný príspevok na projekt „${d.nazov}“ v rámci výzvy ${VYZVA}, najmä podával a podpisoval žiadosť a jej prílohy v ITMS21+, odpovedal na výzvy na doplnenie a komunikoval s poskytovateľom.`,
  `Plnomocenstvo sa udeľuje na dobu do ukončenia konania o žiadosti.`,
  `V Ukážkove, dňa 18. 11. 2025`,
  `......................................... podpis splnomocniteľa\n${d.statutar}, ${d.funkcia}`,
  `Plnomocenstvo prijímam.\n......................................... podpis splnomocnenca\nIng. Peter Príkladný`,
];
const plnomocenstvoBezRozsahu = (d: Demo): Odsek[] => [
  `Splnomocniteľ: ${d.obec}, ${d.ulica}, ${d.psc}, IČO ${d.ico}, v zastúpení: ${d.statutar}, ${d.funkcia}`,
  `Splnomocnenec: Bc. Eva Testová, nar. 3. 4. 1985, referentka obecného úradu`,
  `${d.obec} týmto udeľuje plnomocenstvo vyššie uvedenej osobe v súvislosti so žiadosťou o nenávratný finančný príspevok vo výzve ${VYZVA}.`,
  `V Skúšobnej, dňa 20. 11. 2025`,
  `......................................... podpis splnomocniteľa\n${d.statutar}, ${d.funkcia}`,
  `Plnomocenstvo prijímam.\n......................................... podpis splnomocnenca\nBc. Eva Testová`,
];
const audit = (d: Demo): Odsek[] => {
  const s = sumy(d);
  return [
    `Predmet auditu: ${d.budova}\nObjednávateľ: ${d.obec}\nObdobie hodnotenia spotreby: 2022 – 2024`,
    { b: '1. Spracovateľ' },
    `Audit vypracoval Ing. Tomáš Audítorský, energetický audítor zapísaný v zozname energetických audítorov podľa zákona č. 321/2014 Z. z. o energetickej efektívnosti, číslo zápisu EA-${d.kluc}-0456.`,
    { b: '2. Súčasný stav a návrh opatrení' },
    `Priemerná ročná spotreba primárnej energie budovy je ${cis(s.pe.vychodisko!)} MWh. Najväčšie straty tepla sú cez obvodový plášť, strechu a okná. Audit odporúča zateplenie, výmenu otvorových konštrukcií, rekuperáciu tepla a náhradu plynového kotla tepelnými čerpadlami.`,
    { tab: [['Opatrenie', 'Úspora primárnej energie (MWh/rok)'], ['Zateplenie plášťa a strechy', cis(s.mwh * 0.55)], ['Výmena otvorových konštrukcií', cis(s.mwh * 0.2)], ['Vzduchotechnika s rekuperáciou', cis(s.mwh * 0.25)]] },
    `Celková úspora po realizácii všetkých opatrení: ${cis(s.mwh)} MWh/rok (${cis(s.percent)} %).`,
    `V Martine, dňa 2. 9. 2025\nIng. Tomáš Audítorský, energetický audítor\n......................................... podpis`,
  ];
};
const sprievodnyList = (d: Demo): Odsek[] => [
  `Slovenská inovačná a energetická agentúra\nodbor implementácie programu Slovensko`,
  `Vec: Predloženie žiadosti o NFP – výzva ${VYZVA}`,
  `Vážení, v prílohe predkladáme žiadosť o nenávratný finančný príspevok na projekt „${d.nazov}“. K žiadosti prikladáme výpis z uznesenia obecného zastupiteľstva, energetický certifikát budovy, projektovú dokumentáciu a dokumentáciu k oprávnenosti výdavkov.`,
  `S pozdravom\n${d.statutar}, ${d.funkcia}\n......................................... podpis`,
];

// ---------- zápis podaní
// Zmažú sa len vygenerované podania; ručne písaný postup demo/podania/README.md a testovacie súbory v testy/ ostanú.
fs.mkdirSync(OUT, { recursive: true });
for (const f of fs.readdirSync(OUT)) if (f !== 'README.md' && f !== 'testy') fs.rmSync(path.join(OUT, f), { recursive: true, force: true });
const podania: { priecinok: string; subory: string[] }[] = [];
function podanie(priecinok: string, subory: [string, () => Buffer | void][]) {
  const dir = path.join(OUT, priecinok); fs.mkdirSync(dir, { recursive: true });
  const mena: string[] = [];
  for (const [meno, vyrob] of subory) {
    const cesta = path.join(dir, meno);
    const data = vyrob.length ? undefined : vyrob();
    if (data) fs.writeFileSync(cesta, data); else (vyrob as unknown as (c: string) => void)(cesta);
    mena.push(meno); process.stdout.write(`  ${priecinok}/${meno}\n`);
  }
  fs.writeFileSync(path.join(OUT, `${priecinok}.zip`), zip(mena.map((m) => ({ nazov: m, data: fs.readFileSync(path.join(dir, m)) }))));
  podania.push({ priecinok, subory: mena });
}
const jsonSubor = (o: unknown) => () => Buffer.from(JSON.stringify(o, null, 2) + '\n');
const pdfSubor = (hl: string, nadpis: string, o: Odsek[]) => (cesta: string) => pdf(cesta, hl, nadpis, o);
const docxSubor = (o: Odsek[]) => () => docx(o);

console.log(`Prehliadač na PDF: ${PREHLIADAC ?? 'nenájdený (vzniknú HTML súbory)'}`);
podanie(A.priecinok, [
  ['Formular_ZoNFP_Obec_Vzorova.json', jsonSubor(formular(A))],
  ['Sprievodny_list.pdf', pdfSubor(hlavicka(A), 'Sprievodný list k žiadosti o NFP', sprievodnyList(A))],
  ['Priloha_3_Uznesenie_OZ_Vzorova.pdf', pdfSubor(hlavicka(A), 'Výpis z uznesenia obecného zastupiteľstva', uznesenie(A))],
  ['Energeticky_certifikat_ZS_Vzorova.pdf', pdfSubor('Projektové energetické hodnotenie budovy', 'Energetický certifikát budovy', certifikat(A))],
  ['Priloha_7_Projektova_dokumentacia_technicka_sprava.pdf', pdfSubor('Projektová dokumentácia', 'Projektová dokumentácia – technická správa', technickaSprava(A))],
  ['Priloha_8_Opravnenost_vydavkov.docx', docxSubor(opravnenost(A))],
]);
podanie(B.priecinok, [
  ['Formular_ZoNFP_Mesto_Ukazkovo.json', jsonSubor(formular(B))],
  ['Priloha_1_Plnomocenstvo.pdf', pdfSubor(hlavicka(B), 'Plnomocenstvo', plnomocenstvoUplne(B))],
  ['Priloha_3_Uznesenie_MsZ_Ukazkovo.pdf', pdfSubor(hlavicka(B), 'Výpis z uznesenia mestského zastupiteľstva', uznesenie(B))],
  ['Priloha_5_Energeticky_audit.pdf', pdfSubor('Energetický audit', 'Energetický audit budovy Mestského úradu Ukážkovo', audit(B))],
  ['Priloha_7_Projektova_dokumentacia.pdf', pdfSubor('Projektová dokumentácia', 'Projektová dokumentácia – technická správa', technickaSprava(B))],
]);
podanie(`${B.priecinok}-doplnenie`, [
  ['Priloha_6_Energeticky_certifikat.pdf', pdfSubor('Projektové energetické hodnotenie budovy', 'Energetický certifikát budovy', certifikat(B))],
  ['Priloha_8_Opravnenost_vydavkov.docx', docxSubor(opravnenost(B))],
]);
podanie(C.priecinok, [
  ['Formular_ZoNFP_Obec_Skusobna.json', jsonSubor(formular(C))],
  ['Priloha_1_Plnomocenstvo.pdf', pdfSubor(hlavicka(C), 'Plnomocenstvo', plnomocenstvoBezRozsahu(C))],
  ['Priloha_3_Uznesenie_OZ_Skusobna.pdf', pdfSubor(hlavicka(C), 'Výpis z uznesenia obecného zastupiteľstva', uznesenie(C))],
  ['Priloha_6_Energeticky_certifikat.pdf', pdfSubor('Projektové energetické hodnotenie budovy', 'Energetický certifikát budovy', certifikat(C))],
  ['Priloha_7_Projektova_dokumentacia.pdf', pdfSubor('Projektová dokumentácia', 'Projektová dokumentácia – technická správa', technickaSprava(C))],
  ['Priloha_8_Opravnenost_vydavkov.docx', docxSubor(opravnenost(C))],
]);
podanie('D-ITMS-historia', [
  ['Formular_NFP401201A973_Miloslavov.json', jsonSubor({ kodItms: 'NFP401201A973', _poznamka: 'Skutočná žiadosť z ITMS21+ (verejné údaje formulára). V skutočnosti neschválená pre nesplnenie podmienok.' })],
  ['Formular_NFP401201A012_Dunajska_Luzna.json', jsonSubor({ kodItms: 'NFP401201A012', _poznamka: 'Skutočná žiadosť z ITMS21+ (verejné údaje formulára). V skutočnosti schválená.' })],
]);
uprac();
for (const d of [A, B, C]) { const s = sumy(d); console.log(`${d.kluc}: NFP ${eur(s.spolu)}, úspora ${cis(s.percent)} %, hodnota za peniaze EE ${cis(s.ee / s.mwh, 0)} EUR/MWh/rok${s.oze ? `, OZE ${cis(s.oze / s.mw, 0)} EUR/MW` : ''}`); }
console.log(`Hotovo: ${podania.reduce((n, p) => n + p.subory.length, 0)} súborov v ${podania.length} podaniach → ${path.relative(KOREN, OUT)}`);
