// Nová skúšobná žiadosť o NFP pre kontrolóra: fiktívna Obec Dolné Posudzovce, výzva PSK-SIEA-002-2023-DV-EFRR.
// Podanie je úplné (formulár ŽoNFP, prílohy 1a, 3, 6, 7 a záväzný zošit Prílohy č. 8), ale má jednu chybu žiadateľa,
// ktorú má kontrolór nájsť sám. Riešenie je v demo/nova-ziadost/riesenie/: RIESENIE.md pre človeka, ocakavane.json pre
// skript 19 (npm run test:nova). Stavebné bloky (model prípadu, formulár, prílohy) sú zo scripts/18-testovacia-sada.ts.
// Výstup: demo/nova-ziadost/ (ZIP podania, priečinok subory, riesenie). Návod README.md je písaný ručne, generátor ho nemení.
// Spustenie (Windows, MS Excel, Edge alebo Chrome): node scripts/20-nova-ziadost.ts
import fs from 'node:fs';
import path from 'node:path';
import { tlaciarenPdf, zip } from './lib/dokumenty.ts';
import {
  OBEC, PD, VYZVA, ZAKLAD, cis, eur, fve, okna, osvetlenie, peVych, pePo, rozpocet, tc, trieda, uradBudova, vykurovanie, vytvorPodanie,
  zateplenieSteny, zateplenieStrechy, type Pripad, type SuborVZipe,
} from './18-testovacia-sada.ts';

const KOREN = path.join(import.meta.dirname, '..');
const OUT = path.join(KOREN, 'demo', 'nova-ziadost');
const PATA = 'Skúšobná žiadosť pre eurofondy-kontrola. Fiktívny subjekt, nejde o skutočný doklad.';
const ZIP = 'ZoNFP_Dolne_Posudzovce.zip';

const z = OBEC('Obec Dolné Posudzovce', 'Hlavná 18', '901 95', '0099820', 'Ing. Zuzana Posudková', 'starostka obce');
const b = uradBudova('Dolné Posudzovce', { adresa: 'Hlavná 18, Dolné Posudzovce', plocha: 1150, guPred: 232, guPo: 120, supisne: '118', parcela: '410/2', rok: 1979 });
const p: Pripad = {
  cislo: 'DP', slug: 'dolne-posudzovce', titul: 'Obnova budovy obecného úradu Dolné Posudzovce',
  scenar: 'Obec, Bratislavský kraj (VRR), predložená 26. 11. 2025. Úplné podanie: formulár, plnomocenstvo, uznesenia, energetický certifikát, projektová dokumentácia a záväzný zošit Prílohy č. 8.',
  preco: 'Formulár žiada výdavky obnovy budovy (opatrenie 2.1.2) v plnej výške, hoci pri úspore 48,3 % sú podľa PPP č. 13 oprávnené len na 90 %. Zošit Prílohy č. 8 ich kráti správne, preto sa so žiadosťou nezhoduje: P08b ide kontrolórovi.',
  kod: 'DP01', poznamka: 'Skúšobná žiadosť eurofondy-kontrola (Obec Dolné Posudzovce). Žiadateľ, IČO, osoby a všetky údaje sú vymyslené.',
  formularBezKratenia: true,
  ziadatel: z, miesto: { kraj: 'Bratislavský kraj', okres: 'Malacky', obec: 'Dolné Posudzovce' }, kategoriaRegionov: 'VRR',
  predlozenie: '2025-11-26', zaciatok: '2026-05-01', koniec: '2027-10-31',
  projekt: {
    nazov: 'Obnova budovy obecného úradu Dolné Posudzovce',
    popis: `Predmetom projektu je obnova administratívnej budovy obecného úradu Dolné Posudzovce z roku ${b.rok}, ktorej vlastníkom je obec. V budove sídli obecný úrad, matrika a spoločný stavebný úrad. Projekt zahŕňa zateplenie obvodového a strešného plášťa, výmenu okien a dverí, modernizáciu osvetlenia, rekonštrukciu vykurovacej sústavy, tepelné čerpadlo vzduch-voda a fotovoltickú elektráreň na vlastnú spotrebu budovy. Po obnove sa budova podľa globálneho ukazovateľa primárna energia zlepší z triedy ${trieda(b.kategoria, b.guPred)} na triedu ${trieda(b.kategoria, b.guPo)}.`,
    ucel: 'Účelom projektu je znížiť spotrebu primárnej energie budovy obecného úradu a pokryť časť jej spotreby z obnoviteľných zdrojov energie.',
  },
  budova: b,
  aktivity: [PD(26000, 430000), zateplenieSteny(1450, 102), zateplenieStrechy(610, 84), okna(230, 405), osvetlenie(110, 255, 12), vykurovanie(41000, 60), fve(30, 30000), tc(60, 55000)],
  oze: { elMW: 0.03, tepMW: 0.06 }, plnomoc: true,
  ocakavane: {
    navrh: 'na_preverenie', verzia: 'zmena3', ver: [], nalezy: { ...ZAKLAD(), P08b: 'na_preverenie' },
    obsahuje: { P08b: 'pred krátením podľa pásma úspory', D13: 'Očakávaná výška: 90 %' },
  },
};

const { pdf, prehliadac, uprac } = tlaciarenPdf(PATA);
if (!prehliadac) throw new Error('Na PDF prílohy treba Edge alebo Chrome (premenná PREHLIADAC).');
const SUBORY = path.join(OUT, 'subory'), RIESENIE = path.join(OUT, 'riesenie');
for (const d of [SUBORY, RIESENIE]) { fs.rmSync(d, { recursive: true, force: true }); fs.mkdirSync(d, { recursive: true }); }
const { f, r, subory } = vytvorPodanie(p, 50, SUBORY, pdf);
uprac();
if (r.hlasky.length) throw new Error(`Zošit Prílohy č. 8 hlási: ${r.hlasky.join(' | ')}. Žiadosť má mať len chybu vo formulári.`);
fs.writeFileSync(path.join(OUT, ZIP), zip(subory.map((s) => ({ nazov: s.nazov, data: fs.readFileSync(path.join(SUBORY, s.nazov)) }))));

// ---------- riešenie
const vZipe = (s: { nazov: string; priloha: string | null }): SuborVZipe => ({ nazov: s.nazov, typ: s.priloha ? 'priloha' : 'formular', priloha: s.priloha, istota: 'cislo' });
fs.writeFileSync(path.join(RIESENIE, 'ocakavane.json'), JSON.stringify({
  vyzva: VYZVA,
  poznamka: 'Riešenie skúšobnej žiadosti: očakávaný posudok bez modelu (llm: false). Body VER-ITMS a VER-KONTROLA závisia od kontroly zmien výzvy v prostredí a neporovnávajú sa.',
  pripady: [{ cislo: p.cislo, slug: p.slug, titul: p.titul, scenar: p.scenar, preco: p.preco, zip: ZIP, subory: subory.map(vZipe), ocakavane: p.ocakavane }],
}, null, 2) + '\n');

const polozky = rozpocet(p, r);
const sucet = (o: string) => polozky.filter((x) => x.a.opatrenie === o).reduce((s, x) => s + x.suma, 0);
const predKratenim = sucet('2.1.2'), poKrateni = r.poHodnoteZaPeniaze ?? NaN, oze = r.ozePoHodnoteZaPeniaze ?? NaN;
const usporaPct = r.usporaPercent ?? NaN, vych = r.peVychMWh ?? peVych(b), plan = r.pePlanMWh ?? pePo(b);
if (Math.abs(predKratenim * 0.9 - poKrateni) > 0.01) throw new Error(`Zošit nekráti budovu na 90 %: ${predKratenim} → ${poKrateni}.`);
if (Math.abs(f.sumaZiadanaNFP - predKratenim - oze) > 0.01) throw new Error('Žiadaný NFP sa nerovná súčtu budovy pred krátením a OZE.');
const riesenie = `# Riešenie: Obec Dolné Posudzovce

Otvorte až po vlastnom posúdení žiadosti. Žiadateľ, osoby, IČO aj všetky čísla sú vymyslené.

## Čo je v žiadosti zle

Formulár ŽoNFP žiada pri opatrení 2.1.2 (obnova budovy) výdavky v plnej výške: **${eur(predKratenim)}**. Plánovaná úspora primárnej energie je ${cis(usporaPct)} % (${cis(vych, 1)} → ${cis(plan, 1)} MWh/rok). Pri úspore nad 40 % a najviac 50 % sú podľa PPP č. 13 oprávnené výdavky len 90 % (\`data/zdroje/PSK-SIEA-002-2023/txt/Vyzva_PSK_2P1_SIEA_zmena_3.txt:480\`). Projekt má aj inštaláciu zariadení OZE (opatrenie 2.2.2), preto sa ďalších 5 percentuálnych bodov neodpočítava (\`:483\`).

Záväzný zošit Prílohy č. 8 krátenie počíta sám: po krátení uvádza **${eur(poKrateni)}** (hárok „Rozpočet B1 - Value for Money“, bunka M210). Formulár tak pri budove žiada o **${eur(predKratenim - poKrateni)}** viac. Žiadaný NFP je ${eur(f.sumaZiadanaNFP)}, so správnym krátením by bol ${eur(poKrateni + oze)}. Výdavky na OZE (${eur(oze)}, bunka M270) sú vo formulári aj v zošite rovnaké.

Takáto chyba vznikne, keď žiadateľ prepíše do formulára sumy z rozpočtu stavby a krátenie podľa pásma úspory vynechá. Úspora (minimum 30 %) aj hodnota za peniaze sú v limitoch výzvy, sporná je len výška oprávnených výdavkov.

## Čo má softvér navrhnúť

Posudok bez lokálneho modelu (prepínač **Čítať prílohy lokálnym modelom** vypnutý):

- Návrh **na preverenie** (v aplikácii „Treba posúdenie človekom“).
- **P08b na preverenie** ako prvý bod v skupine **Musí posúdiť človek**. Softvér porovná oprávnené výdavky zo zošita s rozpočtom formulára po opatreniach. Pri opatrení 2.1.2 napíše, že suma formulára sa rovná výdavkom budovy pred krátením podľa pásma úspory (bunka M208), a cituje bunky zošita aj položky formulára. Rovnaký text je už pred posúdením v boxe **Povinné prílohy podľa výzvy**.
- **D13 splnené** s textom „Očakávaná výška: 90 %“. Spolu s P08b ukazuje, o koľko mal žiadateľ výdavky krátiť.
- V skupine **Overené a splnené** sú aj V01, F01, D01, D07a, D07b, D07c, D07d, D09, D12, D14, P03, P06, P07 a P08. P05 sa neuplatňuje.
- V skupine **Musí posúdiť človek** sú okrem P08b podmienky výzvy, ktoré softvér nekontroluje celé: predloženie riadne a včas a PPP č. 4, 6, 7, 8 a 13. Preto ani úplne správna žiadosť nedostane návrh „bez zistení“.
- V skupine **Softvér neoveril** sú registre (napríklad výkon rozhodnutia, EDES, majetkovo-právne vzťahy) a pri posudku bez modelu aj plnomocenstvo, kategória budovy a energetický audit (L01, L07, L05).

Automaticky to overuje \`npm run test:nova\`.

## Čo má urobiť kontrolór

Softvér rozhodnutie nevyberá. Kontrolór porovná sumy v náleze P08b so zošitom a s formulárom. Potom podľa postupu poskytovateľa vyzve žiadateľa na zosúladenie rozpočtu formulára so zošitom alebo zníži oprávnené výdavky na výšku zo zošita. Pri rozhodnutí v aplikácii treba doplniť poznámku, napríklad sumu ${eur(poKrateni)} pri opatrení 2.1.2.

## Čo táto skúška neoveruje

- Či obsah certifikátu a projektovej dokumentácie zodpovedá formuláru. Pri prílohách 3, 6 a 7 softvér overuje prítomnosť a typické znaky dokumentu, nie každý údaj.
- Podpisy, pečiatky a osvedčovaciu doložku, ktoré v skutočnom podaní overuje človek na skene originálu.
- Posudok s lokálnym modelom, ktorý číta plnomocenstvo a kategóriu budovy; jeho výsledok sa môže líšiť podľa modelu.
`;
fs.writeFileSync(path.join(RIESENIE, 'RIESENIE.md'), riesenie);
console.log(`Hotovo: ${path.relative(KOREN, path.join(OUT, ZIP))}, ${subory.length} súborov; NFP ${eur(f.sumaZiadanaNFP)}, úspora ${cis(usporaPct)} %, budova pred krátením ${eur(predKratenim)}, M210 ${eur(poKrateni)}, M270 ${eur(oze)}`);
