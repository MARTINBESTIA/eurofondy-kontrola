// Cvičná sada pre modul VO (demo/vo): štyri záznamy zo zadania zákazky fiktívnej Obce Dolné Posudzovce (pokračovanie
// cvičnej žiadosti demo/nova-ziadost). Jeden je úplný, v každom ďalšom chýba jedna náležitosť podľa pravidla V07.
// Kontrolór ich prejde naslepo; čo chýba, je v demo/vo/riesenie (ocakavane.json pre test, RIESENIE.md pre človeka).
// Texty sú napísané nanovo, nie sú prevzaté z testu 09, takže pre model aj poistky sú to nové dokumenty.
// Spustenie: node scripts/23-demo-vo.ts   (prepíše demo/vo/zaznamy a demo/vo/riesenie)
import fs from 'node:fs';
import path from 'node:path';
import { docx, ico } from './lib/dokumenty.ts';

const KOREN = path.join(import.meta.dirname, '..');
const CIEL = path.join(KOREN, 'demo', 'vo');
const VO = JSON.parse(fs.readFileSync(path.join(KOREN, 'packs', 'PSK-SIEA-002-2023-DV-EFRR', 'vo.json'), 'utf8'));
const NALEZITOSTI: string[] = VO.pravidla.find((p: { id: string }) => p.id === 'V07').parametre.nalezitosti.map((n: { nazov: string }) => n.nazov);
/** Kľúč bloku = náležitosť V07 v poradí balíka (podpis je formálna náležitosť, pri vypnutých podpisoch sa nekontroluje). */
const KLUCE = ['predmet', 'phz', 'kriterium', 'osloveni', 'uchadzaci', 'uspesny', 'cena', 'konflikt', 'zodpovedna', 'podpis'];
if (NALEZITOSTI.length !== KLUCE.length) throw new Error(`V07 má ${NALEZITOSTI.length} náležitostí, sada pozná ${KLUCE.length}.`);

const OBSTARAVATEL = `Verejný obstarávateľ: Obec Dolné Posudzovce, Hlavná 18, 901 95 Dolné Posudzovce, IČO ${ico('0099820')}`;
const PATA = 'Skúšobný dokument eurofondy-kontrola (cvičenie VO). Obstarávateľ, uchádzači, IČO, osoby a všetky údaje sú vymyslené.';
type Blok = [kluc: string | null, text: string];
interface Zaznam { subor: string; nadpis: string; bez: string | null; bloky: Blok[] }

const ZAZNAMY: Zaznam[] = [
  {
    subor: 'Zaznam_1_stavebne_prace.docx', nadpis: 'ZÁZNAM ZO ZADANIA ZÁKAZKY', bez: null, bloky: [
      [null, 'Podlimitná zákazka podľa § 108 zákona č. 343/2015 Z. z. o verejnom obstarávaní (ZVO), číslo zákazky DP-VO-01/2026'],
      [null, OBSTARAVATEL],
      ['predmet', 'Názov a predmet zákazky: Obnova budovy obecného úradu Dolné Posudzovce – stavebné práce (zateplenie obvodového plášťa a strechy, výmena otvorových konštrukcií, modernizácia osvetlenia), CPV 45210000-2.'],
      ['phz', 'Predpokladaná hodnota zákazky bola určená prieskumom trhu z 12.01.2026 vo výške 312 450,00 EUR bez DPH.'],
      ['kriterium', 'Kritérium na vyhodnotenie ponúk: najnižšia celková cena v EUR s DPH.'],
      ['osloveni', `Výzva na predkladanie ponúk bola dňa 02.02.2026 zaslaná týmto hospodárskym subjektom: TERMOSTAV Záhorie, s.r.o.; Fasády Malacky s.r.o.; STAVEX MA, a.s. Výzva bola v ten istý deň zverejnená aj v profile obstarávateľa.`],
      ['uchadzaci', 'Ponuky v lehote do 23.02.2026 predložili: TERMOSTAV Záhorie, s.r.o. (298 760,40 EUR bez DPH), STAVEX MA, a.s. (305 112,00 EUR bez DPH) a Fasády Malacky s.r.o. (311 980,00 EUR bez DPH). Žiadny uchádzač nebol vylúčený.'],
      ['uspesny', `Úspešný uchádzač: TERMOSTAV Záhorie, s.r.o., Priemyselná 7, 901 01 Malacky, IČO ${ico('5194376')}.`],
      ['cena', 'Zmluva o dielo bola uzavretá 16.03.2026. Konečná zmluvná cena je 298 760,40 EUR bez DPH, t. j. 358 512,48 EUR s DPH.'],
      ['konflikt', 'Všetky zainteresované osoby podľa § 23 ZVO podpísali čestné vyhlásenie o neprítomnosti konfliktu záujmov. Prepojenie zainteresovanej osoby s uchádzačmi nebolo zistené.'],
      ['zodpovedna', 'Vypracoval: Ing. Ivan Súťažný, osoba zodpovedná za verejné obstarávanie, Dolné Posudzovce, 18.03.2026'],
      ['podpis', 'Podpis: ......................................'],
    ],
  },
  {
    subor: 'Zaznam_2_stavebny_dozor.docx', nadpis: 'ZÁZNAM Z PRIESKUMU TRHU', bez: 'osloveni', bloky: [
      [null, 'Zákazka malého rozsahu podľa § 1 ods. 14 ZVO, číslo zákazky DP-VO-02/2026'],
      [null, OBSTARAVATEL],
      ['predmet', 'Predmet zákazky: výkon stavebného dozoru počas realizácie projektu Obnova budovy obecného úradu Dolné Posudzovce, CPV 71520000-9.'],
      ['phz', 'Predpokladaná hodnota zákazky: 9 600,00 EUR bez DPH, určená podľa cenníkov a obdobných zákaziek obce.'],
      ['kriterium', 'Ponuky sa vyhodnotili podľa najnižšej ceny za celý predmet zákazky s DPH.'],
      ['osloveni', 'Výzva na predloženie cenovej ponuky bola 09.02.2026 zaslaná e-mailom spoločnostiam DOZOR-TECH s.r.o., STAVDOZOR Senica s.r.o. a PROJEKT-DOZOR, s.r.o.'],
      ['uchadzaci', 'Cenové ponuky doručené do 20.02.2026: DOZOR-TECH s.r.o. (8 940,00 EUR), STAVDOZOR Senica s.r.o. (9 360,00 EUR) a PROJEKT-DOZOR, s.r.o. (9 900,00 EUR). Ceny sú konečné, dodávatelia nie sú platiteľmi DPH.'],
      ['uspesny', `Ako najvýhodnejšia bola vybraná ponuka spoločnosti DOZOR-TECH s.r.o., IČO ${ico('5321087')}.`],
      ['cena', 'Mandátna zmluva bola uzavretá 02.03.2026, cena za výkon stavebného dozoru je 8 940,00 EUR.'],
      ['konflikt', 'Starostka obce a členovia komisie vyhlásili, že nie sú vo vzťahu k uchádzačom zainteresovanými osobami ani s nimi nie sú prepojení.'],
      ['zodpovedna', 'Za obstarávateľa: Ing. Ivan Súťažný, osoba zodpovedná za VO, 03.03.2026'],
      ['podpis', 'podpis ....................'],
    ],
  },
  {
    subor: 'Zaznam_3_fotovoltika.docx', nadpis: 'ZÁPISNICA Z VYHODNOTENIA PONÚK', bez: 'konflikt', bloky: [
      [null, 'Zákazka s nízkou hodnotou podľa § 1 ods. 14 ZVO, číslo zákazky DP-VO-03/2026'],
      [null, OBSTARAVATEL],
      ['predmet', 'Názov zákazky: Dodávka a montáž fotovoltického systému s výkonom 29,9 kWp na streche obecného úradu.'],
      ['phz', 'Predpokladaná hodnota zákazky: 38 900,00 EUR bez DPH.'],
      ['kriterium', 'Kritériom bola najnižšia cena celkom bez DPH.'],
      ['osloveni', 'Dňa 05.03.2026 bola výzva na predloženie ponuky zaslaná e-mailom spoločnostiam SOLARPOS s.r.o., Energia Záhorie a.s. a FV-Montáže SK, s.r.o.'],
      ['uchadzaci', 'Do 19.03.2026 predložili ponuky: SOLARPOS s.r.o. – 36 480,00 EUR bez DPH; FV-Montáže SK, s.r.o. – 37 950,00 EUR bez DPH. Energia Záhorie a.s. ponuku nepredložila.'],
      ['uspesny', `Úspešným uchádzačom je SOLARPOS s.r.o., IČO ${ico('5408713')}, ktorý bol vyzvaný na uzavretie zmluvy.`],
      ['cena', 'Kúpna zmluva s montážou bola podpísaná 01.04.2026 na sumu 36 480,00 EUR bez DPH.'],
      ['konflikt', 'Členovia komisie podpísali čestné vyhlásenia podľa § 23 ZVO, konflikt záujmov ani prepojenie s uchádzačmi nebolo zistené.'],
      ['zodpovedna', 'Zapísal: Ing. Ivan Súťažný, osoba zodpovedná za VO, 02.04.2026'],
      ['podpis', '.............................. (podpis)'],
    ],
  },
  {
    subor: 'Zaznam_4_energeticky_certifikat.docx', nadpis: 'ZÁZNAM ZO ZADANIA ZÁKAZKY', bez: 'phz', bloky: [
      [null, 'Zákazka malého rozsahu podľa § 1 ods. 14 ZVO, číslo zákazky DP-VO-04/2026'],
      [null, OBSTARAVATEL],
      ['predmet', 'Predmet: vypracovanie energetického certifikátu budovy obecného úradu po obnove.'],
      ['phz', 'Predpokladaná hodnota zákazky: 1 300,00 EUR bez DPH.'],
      ['kriterium', 'Kritérium vyhodnotenia: najnižšia cena s DPH.'],
      ['osloveni', 'Oslovení dodávatelia (výzva odoslaná 10.06.2026): ENERGO-CERT s.r.o.; Certifikácia budov, s.r.o.; TEPLOAUDIT Bratislava s.r.o.'],
      ['uchadzaci', 'Ponuky predložili: ENERGO-CERT s.r.o. (1 450,00 EUR s DPH) a TEPLOAUDIT Bratislava s.r.o. (1 690,00 EUR s DPH).'],
      ['uspesny', `Víťaz: ENERGO-CERT s.r.o., IČO ${ico('5267341')}.`],
      ['cena', 'Objednávka č. 41/2026 zo dňa 24.06.2026 v sume 1 450,00 EUR s DPH.'],
      ['konflikt', 'Konflikt záujmov podľa § 23 ZVO nebol zistený, zainteresované osoby podpísali čestné vyhlásenia.'],
      ['zodpovedna', 'Vypracoval: Ing. Ivan Súťažný, osoba zodpovedná za VO, 25.06.2026'],
      ['podpis', 'podpis: ................'],
    ],
  },
];

/** Úryvok bloku, podľa ktorého test overí, že text dokumentu blok má (alebo nemá). */
const uryvok = (t: string) => t.slice(0, 40);
fs.rmSync(path.join(CIEL, 'zaznamy'), { recursive: true, force: true });
fs.rmSync(path.join(CIEL, 'riesenie'), { recursive: true, force: true });
fs.mkdirSync(path.join(CIEL, 'zaznamy'), { recursive: true });
fs.mkdirSync(path.join(CIEL, 'riesenie'), { recursive: true });

const ocakavane = ZAZNAMY.map((z) => {
  if (z.bez && !KLUCE.includes(z.bez)) throw new Error(`${z.subor}: neznámy kľúč ${z.bez}`);
  const bloky = z.bloky.filter(([k]) => k !== z.bez);
  fs.writeFileSync(path.join(CIEL, 'zaznamy', z.subor), docx([{ b: z.nadpis }, ...bloky.map(([, t]) => t)], PATA));
  const vynechany = z.bloky.find(([k]) => k === z.bez);
  return {
    subor: z.subor, chyba: z.bez ? NALEZITOSTI[KLUCE.indexOf(z.bez)] : null,
    pritomne: bloky.filter(([k]) => k).map(([, t]) => uryvok(t)), chybajuci: vynechany ? uryvok(vynechany[1]) : null,
  };
});
fs.writeFileSync(path.join(CIEL, 'riesenie', 'ocakavane.json'), JSON.stringify({ pravidlo: 'V07', zaznamy: ocakavane }, null, 2) + '\n');

const riesenie = `# Riešenie: záznamy VO Obce Dolné Posudzovce

Otvor až po vlastnom posúdení. Pravidlo V07 žiada v zázname zo zadania zákazky ${NALEZITOSTI.length} náležitostí
(zdroj: MD č. 26, Príručka k procesu a kontrole VO/O verzia 1.0; ostatné náležitosti záznamu V07 neoveruje);
podpis je formálna náležitosť a kontroluje sa len pri zapnutom prepínači „Kontrolovať aj podpisy“.

| Súbor | Čo v ňom chýba | Čo má softvér urobiť (model zapnutý) |
|---|---|---|
${ocakavane.map((o) => `| \`${o.subor}\` | ${o.chyba ?? 'nič, záznam je úplný'} | ${o.chyba ? `V07 nesmie byť „splnené“; správne je „nesplnené“ s náležitosťou „${o.chyba}“ medzi nenájdenými` : 'ideálne „splnené“; „na preverenie“ alebo zamietnutie je falošný poplach (známa slabina poistiek, README test 4)'} |`).join('\n')}

Prečo sú niektoré prípady zradné:
- Záznam 2 nemá zoznam oslovených ani dátum oslovenia, ale má zoznam doručených ponúk s dátumom. Model môže
  zoznam ponúk vydávať za zoznam oslovených.
- Záznam 4 nemá predpokladanú hodnotu zákazky, ale má sumy ponúk a objednávky. Model môže sumu objednávky
  vydávať za predpokladanú hodnotu.
- Záznam 3 nemá vyhlásenie o konflikte záujmov; ostatné náležitosti sú úplné.

Ako dopadol posledný beh s modelom, je v \`beh-s-modelom.md\` v tomto priečinku; súbor zapíše
\`npm run test:demo-vo -- --model\`. Sadu znova vytvorí \`npm run demo:vo\`, test bez modelu je \`npm run test:demo-vo\`.
`;
fs.writeFileSync(path.join(CIEL, 'riesenie', 'RIESENIE.md'), riesenie);
console.log(`demo/vo: ${ZAZNAMY.length} záznamy, riešenie v demo/vo/riesenie (${ocakavane.filter((o) => o.chyba).length} s chybou).`);
