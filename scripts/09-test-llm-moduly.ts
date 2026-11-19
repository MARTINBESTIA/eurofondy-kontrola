// Test lokálneho modelu ako čitateľa dokumentov v moduloch ŽoP, VO a zmeny.
// Reálne faktúry, výpisy a záznamy z VO nie sú verejné, preto sú dokumenty syntetické: každý typ v niekoľkých
// variantoch, raz úplný a raz bez jednej povinnej náležitosti. Kľúčová metrika je „falošne OK“:
// dokument bez náležitosti označený ako splnený. Úplné dokumenty merajú zbytočné poplachy.
// „Presne“ = softvér dokument zamietol a v zdôvodnení menuje práve vynechanú náležitosť.
// Pôvodné dokumenty slúžili aj na ladenie pravidiel (výsledok je na nich optimistický). Nové dokumenty
// (nove: true) sú napísané až po oprave pravidiel, inými formuláciami a s inými firmami, a po behu sa nemenia.
// Spustenie: node scripts/09-test-llm-moduly.ts [--iba=P12,Z08,V07c]
//   --iba = len časti, ktorých kód začína niektorou z hodnôt; ostatné časti sa prevezmú z predošlého výsledku.
// Výstup: eval/test-llm-moduly.json. Celý beh trvá desiatky minút (každá náležitosť = jedno volanie modelu).
import fs from 'node:fs';
import path from 'node:path';
import { nacitajBalik, posud } from '../src/core/posud.ts';
import { dostupny, MODEL } from '../src/llm/ollama.ts';
import type { Modul } from '../src/core/typy.ts';
import { zop } from '../src/moduly/zop/modul.ts';
import { vo } from '../src/moduly/vo/modul.ts';
import { zmeny } from '../src/moduly/zmeny/modul.ts';

const KOREN = path.join(import.meta.dirname, '..');
const VYZVA = process.env.VYZVA ?? 'PSK-SIEA-002-2023-DV-EFRR';
const IBA = process.argv.find((a) => a.startsWith('--iba='))?.slice(6).split(',').filter(Boolean);
if (!(await dostupny())) { console.error(`Model ${MODEL} nie je dostupný (Ollama).`); process.exit(1); }

/** Dokument ako zoznam blokov; každý blok patrí k jednej náležitosti (alebo k žiadnej). Vynechaním bloku vznikne chybný variant. */
type Blok = [kluc: string | null, text: string];
const zloz = (b: Blok[], bez?: string) => b.filter(([k]) => k !== bez).map(([, t]) => t).join('\n');
const sk = (n: number) => n.toLocaleString('sk-SK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const FIRMY = [
  { dod: 'STAVMONT Prešov, s.r.o.', ulica: 'Levočská 42', psc: '080 01', mesto: 'Prešov', ico: '36478521', dic: '2022145789', icdph: 'SK2022145789', obec: 'Obec Lipany', ulica2: 'Námestie sv. Martina 1', psc2: '082 71', iban: 'SK31 1100 0000 0029 4512 3378' },
  { dod: 'Energie Plus a.s.', ulica: 'Mlynské nivy 16', psc: '821 09', mesto: 'Bratislava', ico: '51234987', dic: '2120654321', icdph: 'SK2120654321', obec: 'Mesto Senec', ulica2: 'Mierové námestie 8', psc2: '903 01', iban: 'SK8975000000004012345678' },
  { dod: 'Tepelné systémy Žilina s. r. o.', ulica: 'Bratislavská 6', psc: '010 01', mesto: 'Žilina', ico: '47123456', dic: '2023789456', icdph: 'SK2023789456', obec: 'Obec Terchová', ulica2: 'Sv. Cyrila a Metoda 96', psc2: '013 06', iban: 'SK46 0200 0000 0012 3456 7890' },
];
// Firmy pre nové dokumenty: model ani pravidlá ich predtým nevideli.
const FIRMY_NOVE = [
  { dod: 'ELTECH Košice s.r.o.', ulica: 'Južná trieda 78', psc: '040 01', mesto: 'Košice', ico: '50321654', dic: '2120321654', icdph: 'SK2120321654', obec: 'Obec Čaňa', ulica2: 'Hlavná 1', psc2: '044 14', mesto2: 'Čaňa', iban: 'SK17 0900 0000 0051 2233 4455', iban2: 'SK60 5600 0000 0012 0034 5678', ucet2: '0012003456/5600' },
  { dod: 'Zelená strecha, s. r. o.', ulica: 'Hviezdoslavova 27', psc: '974 01', mesto: 'Banská Bystrica', ico: '46987123', dic: '2023987123', icdph: 'SK2023987123', obec: 'Mesto Brezno', ulica2: 'Námestie M. R. Štefánika 1', psc2: '977 01', mesto2: 'Brezno', iban: 'SK94 1100 0000 0026 8877 6655', iban2: 'SK38 0200 0000 0000 1122 3399', ucet2: '0000112233/0200' },
  { dod: 'TERMO-SERVIS Nitra, spol. s r.o.', ulica: 'Štúrova 132', psc: '949 01', mesto: 'Nitra', ico: '35741258', dic: '2020741258', icdph: 'SK2020741258', obec: 'Obec Lehota', ulica2: 'Nitrianska 2', psc2: '951 36', mesto2: 'Lehota', iban: 'SK05 7500 0000 0040 9988 7766', iban2: 'SK22 0900 0000 0003 5544 6677', ucet2: '4005566778/7500' },
];

function faktura(f: typeof FIRMY[number], i: number): Blok[] {
  const zaklad = [24380, 61250.5, 18920][i]; const dph = Math.round(zaklad * 23) / 100;
  return [
    ['cislo', `FAKTÚRA – DAŇOVÝ DOKLAD č. 2026${String(140 + i).padStart(4, '0')}`],
    [null, 'Variabilný symbol: 20260' + (140 + i)],
    ['dodavatel', `Dodávateľ: ${f.dod}, ${f.ulica}, ${f.psc} ${f.mesto}`],
    [null, `IČO: ${f.ico}   DIČ: ${f.dic}`],
    ['icdph', `IČ DPH: ${f.icdph}`],
    [null, `Bankové spojenie: IBAN ${f.iban}`],
    ['odberatel', `Odberateľ: ${f.obec}, ${f.ulica2}, ${f.psc2} ${f.obec.replace(/^(Obec|Mesto) /, '')}`],
    ['vyhotovenie', 'Dátum vyhotovenia: 12.03.2026'],
    ['dodanie', 'Dátum dodania: 28.02.2026'],
    [null, 'Dátum splatnosti: 26.03.2026'],
    ['polozky', ['Fakturujeme Vám podľa zmluvy o dielo č. 5/2025 za február 2026:\n1. Zateplenie obvodového plášťa EPS 160 mm – 420 m2\n2. Výmena otvorových konštrukcií – 18 ks', 'Fakturujeme Vám za dodávku a montáž:\n1. Fotovoltická elektráreň 49,5 kWp – 1 súbor\n2. Batériové úložisko 40 kWh – 1 ks', 'Fakturujeme Vám:\n1. Tepelné čerpadlo vzduch-voda 32 kW – 2 ks\n2. Rekonštrukcia rozvodov ÚK – 1 súbor'][i]],
    ['zaklad', `Základ dane: ${sk(zaklad)} EUR`],
    ['sadzba', 'Sadzba DPH: 23 %'],
    ['dph', `DPH: ${sk(dph)} EUR`],
    [null, `Celkom k úhrade: ${sk(zaklad + dph)} EUR`],
  ];
}
const KLUCE_FAKTURA = ['dodavatel', 'icdph', 'odberatel', 'cislo', 'vyhotovenie', 'dodanie', 'polozky', 'zaklad', 'sadzba', 'dph'];

/** Nové faktúry: označenie Predávajúci/Kupujúci, tabuľka položiek, iné poradie a názvy polí. */
function fakturaNova(f: typeof FIRMY_NOVE[number], i: number): Blok[] {
  const polozky = [
    [['LED svietidlo verejného osvetlenia 60 W', 48, 'ks', 312], ['Montáž a nastavenie riadiacej jednotky', 1, 'súbor', 2840]],
    [['Vegetačná strecha – extenzívne súvrstvie', 640, 'm2', 38.5], ['Tepelná izolácia XPS 140 mm', 640, 'm2', 21.9]],
  ][i] as [string, number, string, number][];
  const zaklad = polozky.reduce((s, [, q, , c]) => s + q * c, 0); const dph = Math.round(zaklad * 23) / 100;
  return [
    ['cislo', i === 0 ? 'Faktúra číslo: FV-2026/0312' : 'DAŇOVÝ DOKLAD\nČíslo dokladu: 2026/0418'],
    [null, `Objednávka: OBJ-${17 + i}/2026   Konštantný symbol: 0308`],
    ['dodavatel', `Predávajúci:\n${f.dod}\n${f.ulica}\n${f.psc} ${f.mesto}`],
    [null, `IČO: ${f.ico}\nDIČ: ${f.dic}`],
    ['icdph', `IČ DPH: ${f.icdph} (platiteľ DPH)`],
    [null, `Banka: ${['Slovenská sporiteľňa', 'Tatra banka'][i]}, IBAN: ${f.iban}`],
    ['odberatel', `Kupujúci:\n${f.obec}\n${f.ulica2}\n${f.psc2} ${f.mesto2}`],
    [null, `IČO kupujúceho: ${['00324124', '00313271'][i]}`],
    ['vyhotovenie', `Dátum vystavenia: 0${4 + i}.04.2026`],
    ['dodanie', i === 0 ? 'Dátum dodania: 31.03.2026' : 'Dátum zdaniteľného plnenia: 31.03.2026'],
    [null, 'Dátum splatnosti: 18.04.2026   Forma úhrady: prevodným príkazom'],
    ['polozky', `Označenie dodávky | Množstvo | MJ | Cena za MJ bez DPH | Spolu bez DPH\n${polozky.map(([n, q, mj, c]) => `${n} | ${q} | ${mj} | ${sk(c)} | ${sk(q * c)}`).join('\n')}`],
    ['zaklad', `Spolu bez DPH: ${sk(zaklad)} EUR`],
    ['sadzba', 'Sadzba dane: 23 %'],
    ['dph', `Výška DPH: ${sk(dph)} EUR`],
    [null, `Spolu s DPH: ${sk(zaklad + dph)} EUR\nUhradené zálohou: 0,00 EUR\nK úhrade: ${sk(zaklad + dph)} EUR`],
    [null, 'Vystavil: P. Kováč'],
  ];
}

function vypis(f: typeof FIRMY[number], i: number): Blok[] {
  return [
    ['vypis', `VÝPIS Z ÚČTU č. ${3 + i}/2026`],
    [null, `Majiteľ účtu: ${f.obec}, ${f.ulica2}, ${f.psc2}`],
    ['iban', `Číslo účtu (IBAN): ${['SK52 5600 0000 0003 4567 8901', 'SK1209000000000123456789', 'SK75 0200 0000 0034 1122 3344'][i]}`],
    ['datum', 'Obdobie výpisu: 01.03.2026 – 31.03.2026\nDátum zaúčtovania: 27.03.2026'],
    [null, `Protistrana: ${f.dod}, IBAN ${f.iban}\nPopis: úhrada faktúry 2026${String(140 + i).padStart(4, '0')}`],
    ['suma', `Odpísaná suma: -${['29 987,40', '75 338,12', '23 271,60'][i]} EUR`],
    [null, `Počiatočný zostatok: ${['120 450,22', '310 004,90', '88 120,00'][i]} EUR\nKonečný zostatok: ${['90 462,82', '234 666,78', '64 848,40'][i]} EUR`],
  ];
}
const KLUCE_VYPIS = ['vypis', 'iban', 'datum', 'suma'];

/** Nové výpisy: tri rôzne štýly bánk (protiúčet, partner, debet, národný tvar čísla účtu). */
function vypisNovy(f: typeof FIRMY_NOVE[number], i: number): Blok[] {
  if (i === 0) return [
    ['vypis', 'Výpis z účtu – obdobie 01.04.2026 – 30.04.2026'],
    [null, `Klient: ${f.obec}, ${f.ulica2}, ${f.psc2} ${f.mesto2}`],
    ['iban', `IBAN: ${f.iban2}   BIC: GIBASKBX   Mena: EUR`],
    [null, 'Pohyby na účte:'],
    ['datum', 'Dátum zaúčtovania: 14.04.2026   Dátum valuty: 14.04.2026'],
    [null, `Protiúčet: ${f.iban}\nNázov protiúčtu: ${f.dod}\nVS: 20260312   KS: 0308`],
    ['suma', 'Suma: -21 913,68 EUR'],
    [null, 'Počiatočný zostatok: 152 300,15 EUR   Konečný zostatok: 130 386,47 EUR'],
  ];
  if (i === 1) return [
    ['vypis', 'Bankový výpis č. 4/2026'],
    [null, `Majiteľ: ${f.obec}`],
    ['iban', `Účet: ${f.iban2}`],
    ['datum', 'Dátum transakcie: 09.04.2026'],
    [null, `Partner: ${f.dod}\nÚčet partnera: ${f.iban}\nSpráva pre príjemcu: faktúra 2026/0418`],
    ['suma', 'Čiastka: -8 450,00 EUR'],
    [null, 'Zostatok po transakcii: 41 220,30 EUR'],
  ];
  return [
    ['vypis', 'MESAČNÝ VÝPIS Z ÚČTU'],
    [null, `Názov účtu: ${f.obec} – bežný účet`],
    ['iban', `Číslo účtu: ${f.ucet2}`],
    ['datum', 'Dátum zúčtovania: 22.04.2026'],
    [null, `Názov účtu protistrany: ${f.dod}\nČíslo účtu protistrany: ${f.iban}`],
    ['suma', 'Debet: 12 090,50 EUR'],
    [null, 'Zostatok ku koncu obdobia: 77 410,05 EUR'],
  ];
}

function zaznam(f: typeof FIRMY[number], i: number): Blok[] {
  return [
    [null, `ZÁZNAM ZO ZADANIA ZÁKAZKY\nVerejný obstarávateľ: ${f.obec}, ${f.ulica2}, ${f.psc2}`],
    ['predmet', `Predmet zákazky: ${['Zateplenie budovy materskej školy', 'Fotovoltická elektráreň na streche obecného úradu', 'Rekonštrukcia kotolne kultúrneho domu'][i]}`],
    ['phz', `Predpokladaná hodnota zákazky: ${['41 200,00', '48 900,00', '36 750,00'][i]} EUR bez DPH`],
    ['kriterium', 'Kritérium na vyhodnotenie ponúk: najnižšia cena s DPH'],
    ['osloveni', `Oslovené hospodárske subjekty: ${f.dod}; Stavby Sever s.r.o.; Montáže Východ, s.r.o.; výzva na predloženie ponuky odoslaná 03.02.2026`],
    ['uchadzaci', `Ponuky predložili: ${f.dod} (${['39 980,00', '47 210,00', '35 400,00'][i]} EUR bez DPH); Stavby Sever s.r.o. (${['42 115,00', '49 800,00', '37 900,00'][i]} EUR bez DPH)`],
    ['uspesny', `Úspešný uchádzač: ${f.dod}, IČO ${f.ico}`],
    ['cena', `Konečná zmluvná cena: ${['39 980,00', '47 210,00', '35 400,00'][i]} EUR bez DPH`],
    ['konflikt', 'Zainteresované osoby podpísali čestné vyhlásenie o neprítomnosti konfliktu záujmov podľa § 23 ZVO; prepojenie s uchádzačmi nebolo zistené.'],
    ['podpis', `Vypracoval: Ing. Ján Novák, zodpovedná osoba za VO, dňa 20.02.2026, podpis: ..................`],
  ];
}
const KLUCE_ZAZNAM = ['predmet', 'phz', 'kriterium', 'osloveni', 'uchadzaci', 'uspesny', 'cena', 'konflikt', 'podpis'];

/** Nové záznamy (po oprave poistiek V07, 2026-11-19): zápisnica z vyhodnotenia a záznam z prieskumu trhu, iné formulácie. */
function zaznamNovy(f: typeof FIRMY_NOVE[number], i: number): Blok[] {
  if (i === 0) return [
    [null, `ZÁPISNICA Z VYHODNOTENIA PONÚK – zákazka s nízkou hodnotou\nObstarávateľ: ${f.obec}, ${f.ulica2}, ${f.psc2} ${f.mesto2}`],
    ['predmet', 'Názov zákazky: Modernizácia verejného osvetlenia v obci'],
    ['phz', 'PHZ určená prieskumom trhu: 46 300,00 EUR bez DPH'],
    ['kriterium', 'Ponuky boli vyhodnotené podľa najnižšej celkovej ceny bez DPH.'],
    ['osloveni', `Výzva na predloženie cenovej ponuky bola 12.01.2026 zaslaná e-mailom týmto subjektom: ${f.dod}, Svetlo Plus s.r.o., VO-Light a.s.`],
    ['uchadzaci', `V lehote do 26.01.2026 doručili ponuky: ${f.dod} – 44 870,00 EUR; VO-Light a.s. – 45 990,00 EUR. Svetlo Plus s.r.o. ponuku nepredložil.`],
    ['uspesny', `Na prvom mieste sa umiestnil uchádzač ${f.dod}, ktorý bol vyzvaný na uzavretie zmluvy.`],
    ['cena', 'Zmluva o dielo bola uzavretá 09.02.2026 na sumu 44 870,00 EUR bez DPH.'],
    ['konflikt', 'Členovia komisie vyhlásili, že nie sú vo vzťahu k uchádzačom zainteresovanými osobami a nie sú s nimi prepojení.'],
    ['podpis', 'Za obstarávateľa: Mgr. Eva Horváthová, starostka, 10.02.2026 ............................ (podpis)'],
  ];
  return [
    [null, `Záznam z prieskumu trhu\nZadávateľ: ${f.obec}`],
    ['predmet', 'Predmet: dodávka a montáž vegetačnej strechy na budove ZŠ'],
    ['phz', 'Predpokladaná hodnota: 38 000 EUR bez DPH'],
    ['kriterium', 'Kritérium: najnižšia cena celkom s DPH'],
    ['osloveni', `Oslovení dodávatelia (dátum oslovenia 05.03.2026): ${f.dod}; Strechy Hron s.r.o.; GreenRoof SK s.r.o.`],
    ['uchadzaci', `Prijaté ponuky: 1. ${f.dod} – 46 125,00 EUR s DPH; 2. Strechy Hron s.r.o. – 48 708,00 EUR s DPH; 3. GreenRoof SK s.r.o. – 51 090,00 EUR s DPH`],
    ['uspesny', `Víťazný uchádzač: ${f.dod}, IČO ${f.ico}`],
    ['cena', 'Cena podľa uzavretej zmluvy: 46 125,00 EUR s DPH'],
    ['konflikt', 'Konflikt záujmov: nebol zistený, zainteresované osoby podpísali čestné vyhlásenia.'],
    ['podpis', 'Vypracoval a podpísal: Ing. Marek Lukáč, odborne spôsobilá osoba pre VO, 20.03.2026'],
  ];
}

function odovodnenie(i: number): Blok[] {
  return [
    ['popis', ['Navrhujeme predĺženie termínu ukončenia hlavnej aktivity projektu z 31.05.2026 na 31.08.2026.', 'Navrhujeme presun 12 400 EUR z rozpočtovej položky Stavebné práce – zateplenie do položky Technické zariadenia budov.', 'Navrhujeme nahradiť pôvodne navrhnuté plastové okná hliníkovými oknami s rovnakým súčiniteľom prechodu tepla.'][i]],
    ['dovod', ['Dôvodom je oneskorené dodanie tepelného čerpadla výrobcom, ktoré dodávateľ preukázal listom výrobcu z 10.03.2026.', 'Zmena je potrebná, pretože pri realizácii sa zistil havarijný stav rozvodov vykurovania, ktorý projektová dokumentácia nezachytila.', 'Keďže pôvodný typ okien sa prestal vyrábať, dodávateľ ponúkol rovnocennú náhradu za rovnakú cenu.'][i]],
    ['dopad', ['Zmena nemá vplyv na ciele projektu ani na merateľné ukazovatele, rozpočet projektu sa nemení.', 'Celkový rozpočet a výška NFP sa nemenia; cieľová hodnota ukazovateľa úspory energie zostáva zachovaná.', 'Dopad na rozpočet ani na merateľné ukazovatele projektu nie je, aktivity sa realizujú v pôvodnom rozsahu.'][i]],
  ];
}
const KLUCE_ODOV = ['popis', 'dovod', 'dopad'];

/** Nové odôvodnenia: súvislý text, formulár s nadpismi, zníženie rozsahu, zmena subdodávateľa. */
function odovodnenieNove(i: number): Blok[] {
  return [
    ['popis', [
      'Žiadame o zmenu osoby vykonávajúcej stavebný dozor na stavbe Modernizácia verejného osvetlenia obce.',
      'Predmet zmeny: posun termínu dodania technológie kotolne z 04/2026 na 07/2026 a súvisiaca úprava harmonogramu.',
      'Znižujeme rozsah zateplenia strechy telocvične z 860 m2 na 610 m2.',
      'Navrhujeme zmenu subdodávateľa elektroinštalačných prác zo spoločnosti ELEKTRO-MONT s.r.o. na spoločnosť VOLTA Prešov, s.r.o.',
    ][i]],
    ['dovod', [
      'Pôvodný stavebný dozor Ing. Peter Malý ukončil k 31.01.2026 podnikanie a zmluvu s obcou vypovedal.',
      'Zdôvodnenie zmeny: dodávateľ kotlov oznámil výpadok výroby v dôsledku nedostatku komponentov, čo dokladá jeho oznámenie z 2.3.2026.',
      'Dôvodom je, že časť strechy nad šatňami bola zateplená z prostriedkov obce v roku 2025, čo projektová dokumentácia z roku 2023 nemohla zohľadniť.',
      'Pôvodný subdodávateľ vstúpil do likvidácie, preto ho hlavný dodávateľ nahradil subdodávateľom s rovnakou kvalifikáciou.',
    ][i]],
    ['dopad', [
      'Nový stavebný dozor vykoná práce za rovnakú cenu 4 800 EUR, preto sa rozpočet projektu, jeho ciele ani ukazovatele nemenia.',
      'Vplyv na projekt: harmonogram sa predĺži o tri mesiace v rámci lehoty podľa zmluvy; rozpočet a merateľné ukazovatele zostávajú bez zmeny.',
      'Oprávnené výdavky sa znížia o 18 250 EUR a cieľová hodnota ukazovateľa zníženia spotreby energie klesne z 92,4 MWh/rok na 81,0 MWh/rok.',
      'Zmena sa nedotkne ceny diela ani termínov a nemá dopad na dosiahnutie cieľov projektu.',
    ][i]],
  ];
}

const STAV: Record<string, string> = { splnene: 'splnené', nesplnene: 'nesplnené', na_preverenie: 'na preverenie', chyba_podklad: 'chýba podklad', mimo_podkladov: 'neoverené', neuplatnuje_sa: 'neuplatňuje sa' };
interface Vstup { v: any; popis: string; bez?: string }
interface Cast {
  kod: string; modul: string; nazov: string; nove: boolean; n: number; splnene: number; nesplnene: number; na_preverenie: number; ine: number;
  falosneOk: number | null; presne: number | null; nezachytene: string[]; msPriemer: number; chyby: string[]; cas: string; historia?: unknown[];
}
const casti: Cast[] = [];
const poradie: string[] = [];
async function testuj(kod: string, m: Modul, pravidlo: string, nazov: string, kluce: string[], uplne: boolean, vstupy: Vstup[], nove = false) {
  poradie.push(nazov);
  if (IBA && !IBA.some((x) => kod.startsWith(x))) return;
  const b = nacitajBalik(m.balikVyzva ?? VYZVA, m.id);
  const nal = (b.pravidla.find((p) => p.id === pravidlo)?.parametre?.nalezitosti ?? []) as { nazov: string }[];
  const c: Cast = { kod, modul: m.id, nazov, nove, n: 0, splnene: 0, nesplnene: 0, na_preverenie: 0, ine: 0, falosneOk: uplne ? null : 0, presne: uplne ? null : 0, nezachytene: [], msPriemer: 0, chyby: [], cas: new Date().toISOString() };
  let ms = 0;
  for (const { v, popis, bez } of vstupy) {
    const t = Date.now();
    const p = await posud(v, b, m, { llm: true, iba: [pravidlo] });
    ms += Date.now() - t; c.n++;
    const n = p.nalezy[0];
    if (n.stav === 'splnene') c.splnene++; else if (n.stav === 'nesplnene') c.nesplnene++; else if (n.stav === 'na_preverenie') c.na_preverenie++; else c.ine++;
    if (!uplne) {
      const ocak = bez ? nal[kluce.indexOf(bez)]?.nazov : undefined;
      if (!ocak) throw new Error(`Neznáma náležitosť „${bez}“ v ${nazov}`);
      // Chyba je zachytená presne, len ak je dokument zamietnutý a vynechaná náležitosť je medzi nenájdenými.
      if (n.stav === 'nesplnene' && n.zdovodnenie.includes(ocak)) c.presne!++;
      else {
        const citat = String(n.dokaz ?? '').split('\n').find((r) => r.startsWith(ocak + ':'));
        c.nezachytene.push(`${popis}: ${STAV[n.stav] ?? n.stav}${citat ? `, model namiesto chýbajúcej náležitosti uviedol ${citat.slice(ocak.length + 2, ocak.length + 140)}` : ''}`);
      }
      if (n.stav === 'splnene') { c.falosneOk!++; c.chyby.push(`${popis}: splnené – ${n.zdovodnenie.slice(0, 160)}`); }
    }
    if (uplne && n.stav === 'nesplnene') c.chyby.push(`${popis}: nesplnené – ${n.zdovodnenie.slice(0, 200)}`);
    process.stdout.write(`\r${nazov}: ${c.n}/${vstupy.length}   `);
  }
  c.msPriemer = Math.round(ms / Math.max(1, c.n));
  casti.push(c);
  console.log(`\r${nazov}: n ${c.n}, splnené ${c.splnene}, nesplnené ${c.nesplnene}, na preverenie ${c.na_preverenie}, falošne OK ${c.falosneOk ?? '–'}, presne ${c.presne ?? '–'}, ${(c.msPriemer / 1000).toFixed(1)} s/prípad`);
  for (const ch of c.chyby.slice(0, 6)) console.log(`   ! ${ch}`);
  for (const ch of c.nezachytene.filter((x) => !x.includes(': splnené')).slice(0, 6)) console.log(`   ? ${ch}`);
}

const t0 = Date.now();
const zakladZop = structuredClone(zop.nacitaj(zop.pripady('', 'refundacia', 1).pripady[0].id)!);
const zakladVo = structuredClone(vo.nacitaj(vo.pripady('', 'zmr', 1).pripady[0].id)!);
const zakladZmena = structuredClone(zmeny.nacitaj(zmeny.pripady('', '', 1).pripady[0].id)!);
const sPrilohou = (z: any, cislo: string, text: string) => ({ ...structuredClone(z), prilohy: { [cislo]: { nazov: `${cislo}.txt`, text } } });
const sOdovodnenim = (text: string) => ({ ...structuredClone(zakladZmena), odovodnenie: text });
/** Úplné dokumenty a ku každému varianty bez jednej náležitosti. */
const uplneD = (bloky: Blok[][], meno: string, vloz: (t: string) => any): Vstup[] => bloky.map((b, i) => ({ v: vloz(zloz(b)), popis: `${meno} ${i + 1}` }));
const chybneD = (bloky: Blok[][], meno: string, kluce: string[], vloz: (t: string) => any): Vstup[] => bloky.flatMap((b, i) => kluce.map((k) => ({ v: vloz(zloz(b, k)), popis: `${meno} ${i + 1} bez „${k}“`, bez: k })));

const fak = FIRMY.map(faktura); const fakN = FIRMY_NOVE.slice(0, 2).map(fakturaNova);
const vyp = FIRMY.map(vypis); const vypN = FIRMY_NOVE.map(vypisNovy);
const zaz = FIRMY.map(zaznam); const zazN = FIRMY_NOVE.slice(0, 2).map(zaznamNovy);
const odo = [0, 1, 2].map(odovodnenie); const odoN = [0, 1, 2, 3].map(odovodnenieNove);
const fa = (t: string) => sPrilohou(zakladZop, 'faktura', t); const uh = (t: string) => sPrilohou(zakladZop, 'uhrada', t); const za = (t: string) => sPrilohou(zakladVo, 'zaznam', t);

await testuj('P11u', zop, 'P11', 'Faktúra úplná (P11)', KLUCE_FAKTURA, true, uplneD(fak, 'faktúra', fa));
await testuj('P11c', zop, 'P11', 'Faktúra bez jednej náležitosti (P11)', KLUCE_FAKTURA, false, chybneD(fak, 'faktúra', KLUCE_FAKTURA, fa));
await testuj('P11nu', zop, 'P11', 'Nová faktúra úplná (P11)', KLUCE_FAKTURA, true, uplneD(fakN, 'nová faktúra', fa), true);
await testuj('P11nc', zop, 'P11', 'Nová faktúra bez jednej náležitosti (P11)', KLUCE_FAKTURA, false, chybneD(fakN, 'nová faktúra', KLUCE_FAKTURA, fa), true);
await testuj('P12u', zop, 'P12', 'Výpis z účtu úplný (P12)', KLUCE_VYPIS, true, uplneD(vyp, 'výpis', uh));
await testuj('P12c', zop, 'P12', 'Výpis z účtu bez jednej náležitosti (P12)', KLUCE_VYPIS, false, chybneD(vyp, 'výpis', KLUCE_VYPIS, uh));
await testuj('P12nu', zop, 'P12', 'Nový výpis úplný (P12)', KLUCE_VYPIS, true, uplneD(vypN, 'nový výpis', uh), true);
await testuj('P12nc', zop, 'P12', 'Nový výpis bez jednej náležitosti (P12)', KLUCE_VYPIS, false, chybneD(vypN, 'nový výpis', KLUCE_VYPIS, uh), true);
await testuj('V07u', vo, 'V07', 'Záznam zo zadania zákazky úplný (V07)', KLUCE_ZAZNAM, true, uplneD(zaz, 'záznam', za));
await testuj('V07c', vo, 'V07', 'Záznam bez jednej náležitosti (V07)', KLUCE_ZAZNAM, false, chybneD(zaz.slice(0, 2), 'záznam', KLUCE_ZAZNAM, za));
await testuj('V07nu', vo, 'V07', 'Nový záznam úplný (V07)', KLUCE_ZAZNAM, true, uplneD(zazN, 'nový záznam', za), true);
await testuj('V07nc', vo, 'V07', 'Nový záznam bez jednej náležitosti (V07)', KLUCE_ZAZNAM, false, chybneD(zazN, 'nový záznam', KLUCE_ZAZNAM, za), true);
await testuj('Z08u', zmeny, 'Z08', 'Odôvodnenie zmeny úplné (Z08)', KLUCE_ODOV, true, uplneD(odo, 'odôvodnenie', sOdovodnenim));
await testuj('Z08c', zmeny, 'Z08', 'Odôvodnenie bez dôvodu alebo dopadu (Z08)', KLUCE_ODOV, false, chybneD(odo, 'odôvodnenie', ['dovod', 'dopad'], sOdovodnenim));
await testuj('Z08nu', zmeny, 'Z08', 'Nové odôvodnenie úplné (Z08)', KLUCE_ODOV, true, uplneD(odoN, 'nové odôvodnenie', sOdovodnenim), true);
await testuj('Z08nc', zmeny, 'Z08', 'Nové odôvodnenie bez dôvodu alebo dopadu (Z08)', KLUCE_ODOV, false, chybneD(odoN, 'nové odôvodnenie', ['dovod', 'dopad'], sOdovodnenim), true);

// Pri --iba sa nespustené časti prevezmú z predošlého behu; prepísaná časť si nechá predošlé čísla v histórii.
const subor = path.join(KOREN, 'eval', 'test-llm-moduly.json');
const stary = IBA && fs.existsSync(subor) ? JSON.parse(fs.readFileSync(subor, 'utf8')) : null;
const zlucene = poradie.map((nz) => {
  const nova = casti.find((c) => c.nazov === nz);
  const stara = stary?.casti?.find((c: any) => c.nazov === nz);
  if (stara && !stara.cas) stara.cas = stary.cas;
  if (!nova) return stara;
  if (stara) nova.historia = [...(stara.historia ?? []), { cas: stara.cas, n: stara.n, splnene: stara.splnene, nesplnene: stara.nesplnene, na_preverenie: stara.na_preverenie, falosneOk: stara.falosneOk, presne: stara.presne ?? null }].slice(-5);
  return nova;
}).filter(Boolean) as Cast[];
fs.writeFileSync(subor, JSON.stringify({ cas: new Date().toISOString(), model: MODEL, trvanieMs: Date.now() - t0, casti: zlucene }, null, 1));
const sucet = (cc: Cast[]) => ({ n: cc.reduce((s, c) => s + c.n, 0), fok: cc.reduce((s, c) => s + (c.falosneOk ?? 0), 0), presne: cc.reduce((s, c) => s + (c.presne ?? 0), 0) });
const chybne = zlucene.filter((c) => c.falosneOk != null);
const vsetky = sucet(chybne); const nove = sucet(chybne.filter((c) => c.nove));
console.log(`\nChybných dokumentov ${vsetky.n}, falošne OK ${vsetky.fok}; z toho nové ${nove.n}, falošne OK ${nove.fok}, presne označených ${nove.presne}.`);
console.log(`Trvanie ${((Date.now() - t0) / 60000).toFixed(1)} min → eval/test-llm-moduly.json`);
