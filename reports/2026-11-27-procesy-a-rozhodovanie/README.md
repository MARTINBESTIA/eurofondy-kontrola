# Procesy a rozhodovanie: kto o čom rozhoduje a čo z toho vie softvér

Stav k 28. 11. 2026. Podklady:

- podklady od jazykového modelu **astra 6.2** z 27. 11. 2026: mapa procesov, katalóg 54 procesov s
  návrhmi zlepšení (príloha `Eurofondy_procesy_data.zip`, súbor `Procesy_a_dokazy.csv`; príloha nie je v
  repozitári) a textová odpoveď, ktorá vybrala šesť inštitúcií a navrhla, čo pre tento softvér overiť;
- primárne dokumenty v `data/zdroje/`;
- kód tohto repozitára (commit `9588175` a novší).

Dokument odpovedá na tri otázky:

1. Ako vyzerá proces eurofondov pred zmluvou aj po nej, vrátane toho, kde rozhoduje človek a podľa čoho?
2. Ktoré z miest, kde astra navrhuje zlepšenie, dnes zvládne `eurofondy-kontrola`?
3. Čo má zmysel doprogramovať ďalej?

Skrátená odpoveď: diagramy sú hotové. D1 až D3 sú mapy procesu s rozhodovacími bodmi, A1 až A3 diagramy
aktivít UML. Každý uzol, ktorý tvrdí fakt, má zdroj; dve výnimky opisuje časť 2. Z 24 procesov od podania
po ukončenie projektu (astra č. 9 až 32) softvér 12 pokrýva čiastočne, 11 nepokrýva a jeden do produktu
nepatrí. Žiadny proces nepokrýva celý. Najväčšie medzery sú mimo posudzovania dokumentov: lehota na
rozhodnutie, zmluva, zúčtovanie záloh, udržateľnosť a nezrovnalosti. Časť 6 ponúka desať rozšírení,
časť 9 vysvetľuje skratky.

## 1. Stručne o doméne

- **Program Slovensko** riadi MIRRI SR ako riadiaci orgán. Výzvu vykonáva **sprostredkovateľský orgán
  (SO)**, tu SIEA. Pilotná výzva repozitára je `PSK-SIEA-002-2023-DV-EFRR`: energetická efektívnosť
  a OZE vo verejných budovách.
- **Pred zmluvou.** Žiadateľ (obec, VÚC) podá **žiadosť o NFP (ŽoNFP)** v systéme ITMS21+. Kontrolór SO
  overí **podmienky poskytnutia príspevku (PPP)**. Ak niečo chýba, vyzve žiadateľa na doplnenie. Potom
  SO vydá rozhodnutie: schválenie, neschválenie alebo zastavenie konania. Schválená žiadosť vedie k
  **zmluve o NFP**, ktorá je účinná deň po zverejnení v Centrálnom registri zmlúv (CRZ).
- **Po zmluve.** Prijímateľ obstaráva dodávky podľa zákona o **verejnom obstarávaní (VO)**. SO a
  Úrad pre verejné obstarávanie (ÚVO) VO kontrolujú. Porušenie, ktoré malo alebo mohlo mať vplyv na
  výsledok VO, vedie k **finančnej oprave** (zníženiu oprávnených výdavkov).
- **Peniaze** prijímateľ žiada **žiadosťou o platbu (ŽoP)** jedným z troch systémov: refundácia,
  predfinancovanie alebo záloha. Pri **refundácii** poskytovateľ preplatí výdavky, ktoré prijímateľ už
  uhradil. Pri **predfinancovaní** dá peniaze na ešte neuhradené faktúry a prijímateľ platbu do 10 dní
  zúčtuje. **Záloha** je preddavok, ktorý prijímateľ zúčtuje do 12 mesiacov. SO pri každej ŽoP vykoná
  **finančnú kontrolu (FK)**, podľa potreby aj **kontrolu na mieste**.
- **Po realizácii** prijímateľ podáva **monitorovacie správy (MS)** o plnení **merateľných
  ukazovateľov (MU)** a udržiava výsledky počas **obdobia udržateľnosti**. Pri **nezrovnalosti** vracia
  NFP.
- **Lehoty** sú v pracovných dňoch (pd) alebo v dňoch, ako ich píše zdroj. Všeobecné zmluvné podmienky
  (VZP) slovom „Deň“ s veľkým D myslia pracovný deň, ak zmluva výslovne neurčí kalendárny (VZP r. 35).
  Preto je vrátenie NFP do 90 pd (VZP r. 579). Kde zdroj píše „dní“ malým písmenom, druh dní nespresňuje
  a diagram ho preberá doslovne, napríklad zúčtovanie predfinancovania do 10 dní (VZP r. 319, DOP 3.2
  r. 1513 až 1514).
- **Diagram aktivít** je diagram UML na modelovanie domény. Ukazuje tok činností a rozhodnutí a
  plavecké dráhy (partície) hovoria, kto koná.

## 2. Ako to vzniklo a ako to čítať

**Proces** som skladal z primárnych dokumentov, nie z mapy astry. Mapa slúžila ako kontrolný zoznam
toho, čo nesmie chýbať. Skratky zdrojov v diagramoch a v tomto texte:

| Skratka | Dokument | Súbor |
|---|---|---|
| MD č. 21 | Metodický dokument riadiaceho orgánu pre Program Slovensko č. 21: usmernenie ku konaniu o ŽoNFP, v1.0 | `data/zdroje/MIRRI-MU-konanie-ZoNFP/txt/MD_c_21_Konanie_o_ŽoNFP_v_1_0.txt` |
| výzva | výzva PSK-SIEA-002-2023 v znení Zmeny č. 3 | `data/zdroje/PSK-SIEA-002-2023/txt/Vyzva_PSK_2P1_SIEA_zmena_3.txt` |
| vzor zmluvy, VZP | vzor zmluvy o NFP 2.2 a jej príloha č. 1, všeobecné zmluvné podmienky | `data/zdroje/PSK-SIEA-002-2023/txt/Vzor_Zmluva_o_poskytnutí_NFP_*` |
| DOP 3.2 | Príručka SIEA pre prijímateľa k implementácii dopytovo orientovaných projektov, verzia 3.2 | `data/zdroje/SIEA-prirucka-DOP-3.2/txt/prirucka-DOP-3.2.txt` |
| CKO | Príručka Centrálneho koordinačného orgánu k procesu a kontrole VO, verzia 2 z 1. 8. 2024 | `data/zdroje/CKO-prirucka-VO/txt/prirucka_vo.txt` |
| Príloha č. 4 | finančné opravy za porušenie pravidiel VO (podklad výzvy) | `data/zdroje/PSK-SIEA-002-2023/txt/Financne_opravy_VO.txt` |

**Citácie.** Zápis `súbor:riadok` je cesta od koreňa repozitára a číslo riadka, napríklad
`src/podatelna/vyzva.ts:107`; samotné `:178-179` je rozsah riadkov v naposledy menovanom súbore. Pri
dokumentoch z tabuľky píšem skratku a riadok textovej verzie, napríklad MD č. 21 r. 596 až 599.
`README.md` bez cesty je hlavné README repozitára.

**Repozitár.** Pravidlá sú v balíkoch `packs/<výzva>/<modul>.json`. Pilotná výzva má
`packs/PSK-SIEA-002-2023-DV-EFRR/` so súbormi `zonfp`, `vo`, `zmeny`, `zop` a `ukazovatele`;
plánovanie výziev má `packs/PSK/vyzvy.json`. Logika modulov je v `src/moduly/<modul>/`, Podateľňa
v `src/podatelna/`.

**Zdroje v diagramoch.** Každý uzol, ktorý tvrdí fakt, má v detaile (klik na uzol) zdroj `súbor:riadok`.
Archify pri generovaní overí, že citovaný súbor a riadok existujú; že riadok tvrdenie dokladá, vyplýva z
čítania dokumentu pri písaní diagramu. Uzly bez zdroja sú dva: spôsob, ako sa projekt dostane do konania
pri národnom projekte a územnej investícii (D1, prevzaté od astry, označené „podľa astry“), a štartovací
uzol D3 „Realizuje aktivity“, ktorý len otvára realizáciu a netvrdí lehotu ani podmienku.

**Verdikty k astre** som overoval voči kódu a balíkom pravidiel, nie voči popisu v README. Pri každom
je dôkaz `súbor:riadok`. Stupnica:

- **Áno**: robí to, čo astra navrhuje.
- **Čiastočne**: robí časť; čo chýba, je vypísané.
- **Nie**: to, čo astra navrhuje, nerobí. Ak má aspoň súvisiaci údaj alebo kontrolu, uvádza ich posledný
  stĺpec (č. 13, 23, 28 a 32).
- **Mimo**: do produktu nepatrí.

## 3. Diagramy

D1 až D3 sú mapy procesu s rozhodovacími bodmi, A1 až A3 sú diagramy aktivít UML. HTML súbory v tomto
priečinku sa otvárajú priamo v prehliadači, bez servera. Ovládanie prehliadača diagramov je čiastočne po anglicky, lebo archify nemá
preložené všetky texty.

| | Diagram | Čo ukazuje |
|---|---|---|
| D1 | [Pred zmluvou](d1-pred-zmluvou.html) | od výzvy po účinnú zmluvu: podanie, overenie PPP, doplnenie, výber v kole, rozhodnutie, odvolanie, CRZ |
| D2 | [Po zmluve I: verejné obstarávanie](d2-po-zmluve-vo.html) | postup VO, zmluva s dodávateľom, riziková analýza, kontrola ÚVO, finančná oprava, opakovanie VO |
| D3 | [Po zmluve II: zmeny, platby, monitorovanie](d3-po-zmluve-platby.html) | zmeny projektu, ŽoP a FK, zúčtovanie, MS, udržateľnosť, nezrovnalosť a vrátenie NFP, audit |
| A1 | [Diagram aktivít: kontrolór posudzuje ŽoNFP](a1-aktivity-ziadost.html) | úsudok nad návrhom softvéru: sedí výrok s dokladom, treba doplniť, formálny či vecný nedostatok, preskúmanie výstupu |
| A2 | [Diagram aktivít: kontrola VO po zmluve](a2-aktivity-vo.html) | riziková analýza, súbežná kontrola ÚVO, vplyv na výsledok VO, voľba nápravy, námietky |
| A3 | [Diagram aktivít: finančná kontrola ŽoP](a3-aktivity-zop.html) | rozsah kontroly podľa analýzy rizík, pozastavenie či vyčlenenie výdavkov, námietky, správa |

Referenčná trasa je dopytová výzva PSK-SIEA-002-2023 so SIEA ako SO. Iné typy výziev sa môžu líšiť.

### Čo pribudlo oproti mape astry

- **Ľudské rozhodnutia ako samostatné uzly.** Mapa astry ukazovala hlavne kroky inštitúcií. D1 až D3
  pridávajú, kto o čom rozhoduje a podľa čoho. Napríklad žiadateľ (podať teraz?), kontrolór (riadne a
  včas? všetky PPP splnené? stačí alokácia kola?), SO pri rozhodnutí a odvolaní, obstarávateľ (aký
  postup VO?) a SO po zmluve (riziková zákazka? vplyv na výsledok VO? schváliť zmenu? rozsah FK?
  výdavky oprávnené? schváliť MS? nezrovnalosť?).
- **Procesy po podpise zmluvy v rovnakej podrobnosti ako pred ním** (D2, D3): VO od začatia po
  finančnú opravu, zmeny projektu, tri systémy platby, FK vrátane kontroly na mieste, zúčtovanie, MS,
  udržateľnosť, nezrovnalosť a vrátenie, kontrolné a auditné orgány.
- **Lehoty pri kroku, kde plynú**, každá zo zdroja. Príklady: doplnenie ŽoNFP aspoň 5 pd (MD č. 21
  r. 596 až 599), vyjadrenie k zisteniam ÚVO aspoň 7 pd (CKO r. 544), námietky k návrhu správy aspoň
  5 dní, pričom presnú lehotu určí návrh správy (DOP 3.2 r. 3991 až 3996), zúčtovanie predfinancovania
  do 10 dní (DOP 3.2 r. 1513 až 1514), vrátenie NFP do 90 pd od doručenia žiadosti o vrátenie (VZP
  r. 579 a 35).
- **Softvér ako samostatná dráha.** Prerušovaná šípka je návrh softvéru, nikdy rozhodnutie
  (README r. 8: „Softvér navrhuje, rozhoduje človek“). Vidno tak, kde softvér pomáha a kde nie.
- **Diagramy aktivít A1 až A3** rozkladajú tri ľudské úsudky, pri ktorých softvér dáva návrh, na
  kroky, rozhodnutia a stráže.

### Notácia

Každý diagram má legendu. Diagramy aktivít ju mapujú na UML takto:

| Prvok | Ako je zobrazený |
|---|---|
| partícia | vodorovná dráha aktéra |
| počiatočný uzol | ikona štartu na prvej činnosti |
| koncový uzol | ikona konca, úspechu alebo neúspechu; aktivita ich môže mať viac |
| činnosť | uzol „Činnosť“ |
| rozhodovací uzol a stráže | uzol „Ľudské rozhodnutie“ s ikonou rozhodnutia; výsledky ako `[áno]` a `[nie]` na šípkach |
| objektový uzol | uzol „Dokument, záznam“ (protokol, návrh správy) |
| čakanie na lehotu | uzol „Lehota, čakanie“ |
| návrh softvéru | uzol „Softvér: návrh“ v dráhe eurofondy-kontrola |
| iný aktér | uzol „Iný aktér“ |
| riadiaci tok | plná šípka |
| tok návrhu | prerušovaná šípka: návrh softvéru, nie rozhodnutie |
| zlúčenie | viac šípok vchádza do jedného uzla |
| vidlica | v A2 vedú z rizikovej zákazky dva súbežné toky; archify nemá pruh vidlice |

Oproti čistému UML sú dve zjednodušenia. Počiatočný a koncový uzol sú zlúčené s prvou a poslednou
činnosťou. Tri rozhodnutia, ktoré majú viac výsledkov a rovnaký ďalší krok, majú jeden tok; voľbu
nesie jeho obsah (A1 „Ktorý návrh rozhodnutia?“, A2 „Aká náprava?“, A3 „Prijme námietky?“).

### Ľudské úsudky v diagramoch aktivít

Každý rozhodovací uzol v A1 až A3 je úsudok človeka. Kritérium a zdroj sú aj v detaile uzla.

| Diagram | Kto | Rozhodnutie | Podľa čoho | Zdroj |
|---|---|---|---|---|
| A1 | kontrolór | Sedí výrok s dokladom? | číta citovaný odsek a prílohu; nesúlad ani odhadnuté zaradenie prílohy nevedú k „nesplnené“ | `README.md:106-107`, `:114-119` |
| A1 | kontrolór | Treba doplniť? | výzva na doplnenie pomenuje doklad a PPP; nenapraviteľný nedostatok do nej nejde | MD č. 21 r. 596 až 599; `src/podatelna/vyzva.ts:107` |
| A1 | kontrolór | Ktorý návrh rozhodnutia? | len pre formálny nedostatok nemožno neschváliť ani zastaviť, ak výzva na doplnenie na zastavenie výslovne neupozornila; zastavenie, keď ani po doplnení nemožno PPP overiť | MD č. 21 r. 850 až 855, 693 až 697 |
| A1 | SO, ktorý vydáva rozhodnutie | Výstup úplný? | výstup, ktorý bráni zákonnému rozhodnutiu, vráti na dopracovanie | MD č. 21 r. 335 až 342 |
| A2 | SO | Riziková zákazka? | vlastná riziková analýza; ÚVO kontroluje rizikové podlimitné zákazky | DOP 3.2 r. 4031 až 4036; CKO r. 288 |
| A2 | SO | Malo či mohlo mať vplyv? | vplyv porušenia na výsledok VO; protokol ÚVO premietne do 5 pd | Príloha č. 4 r. 2; CKO r. 562 |
| A2 | SO | Aká náprava? | ex ante (len pred pripustením výdavkov), ex post, alebo výdavky nepripustiť | CKO r. 721, 725 až 727; VZP r. 162 až 167 |
| A3 | SO | Formálna či úplná FK? | písomná analýza rizík určí rozsah, prípadne aj FK na mieste | DOP 3.2 r. 4119 až 4123, 4141 až 4145 |
| A3 | SO | Podklady úplné? | inak FK ŽoP pozastaví alebo dotknuté výdavky vyčlení | DOP 3.2 r. 4136 až 4138, 4146 až 4148; VZP r. 296 |
| A3 | prijímateľ | Podá námietky? | aspoň 5 dní od doručenia návrhu správy; bez námietok platí návrh za akceptovaný | DOP 3.2 r. 3991 až 3996, 4004 až 4008 |
| A3 | SO | Prijme námietky? | opodstatnené námietky zohľadní úplne alebo sčasti | DOP 3.2 r. 3997 až 4000 |

Pravidlo z MD č. 21 r. 850 až 855 vysvetľuje, prečo návrh výzvy na doplnenie zo softvéru obsahuje
poučenie o zastavení konania (`src/podatelna/vyzva.ts:178`): bez neho by SO nemohol konanie zastaviť pre
pretrvávajúci formálny nedostatok.

## 4. Čo z návrhov astry dokáže softvér

Astra pri každom procese uviedla, čo zlepšiť alebo zmerať (`Procesy_a_dokazy.csv`, stĺpec „Čo
zlepšiť / zmerať“), a v odpovedi vybrala šesť inštitúcií s návrhom, čo overiť pre tento softvér.

### Procesy od podania po ukončenie (astra č. 9 až 32)

| č. | Proces | Astra navrhuje | Verdikt | Čo softvér robí dnes, dôkaz |
|---|---|---|---|---|
| 9 | Podanie a formálne náležitosti | označiť nesprávnu verziu prílohy, chýbajúci podpis, nesúlad identifikátora | Čiastočne | Zaradí prílohy k PPP; odhad potvrdí kontrolór (`src/podatelna/podatelna.ts:98-102`). Znenie výzvy vyberie podľa kola alebo dátumu (`src/core/typy.ts:154-158`, `src/moduly/zonfp/modul.ts:51-52`). Podpis z textu neoverí, pošle ho kontrolórovi na pohľad do skenu (`src/core/posud.ts:220`, `:237`). Kontrolu nesúladu identifikátora medzi prílohami som v pravidlách nenašiel. |
| 10 | Doplnenie neúplného spisu | pred odoslaním skontrolovať povinný obsah; pri návrate ukázať len zmenené a otvorené body | Čiastočne | Predkontrola 27 pravidiel k 13 PPP (`packs/PSK-SIEA-002-2023-DV-EFRR/zonfp.json`). Návrh výzvy na doplnenie s bodmi, poučením o zastavení a lehotou v pracovných dňoch (`src/podatelna/vyzva.ts:107`, `:178-179`, `:185-193`; `src/podatelna/lehoty.ts:129-135`). Po doplnení posúdi spis celý znova; rozdiel oproti predchádzajúcemu posudku neukáže. |
| 11 | Odborné hodnotenie a rozhodnutie | spárovať záver s kritériom a úryvkom; merať fázy zvlášť | Čiastočne | Každé pravidlo aj každý výrok nesie povinnú citáciu odseku výzvy (`src/core/typy.ts:56`, `:65`, `:104`). Vypočíta hodnotu za peniaze pre EE a OZE (`src/moduly/zonfp/kontroly.ts:272-280`). Vecné kritériá neboduje, časy fáz nemeria. |
| 12 | Nezávislosť a výkazy hodnotiteľov | dôkazový spis o hodnotiteľovi; konflikt posúdi človek | Nie | |
| 13 | Kapacita výzvy, poradie, rezervný zoznam | ukázať stav a dôvod čakania | Nie | Má len hodnoty pre hodnotu za peniaze, poradie nezostaví. |
| 14 | Preskúmanie rozhodnutia | chronológia a odkazy na sporné kritériá | Čiastočne | Spis drží podania, doplnenia, posudky a rozhodnutie s časom; rozhodnutie kontrolóra je oddelené od návrhu softvéru (`src/podatelna/podatelna.ts:3-4`, `:31`); odlišné rozhodnutia sa počítajú (`:534-543`). Chronológiu pre odvolanie nevytvorí. |
| 15 | Od podania po účinnosť zmluvy | merať fázu, vlastníka úlohy, počet doplnení | Nie | |
| 16 | Podpisy, prílohy, účinnosť | porovnať rozhodnutie, návrh zmluvy a prílohy | Nie | |
| 17 | Zmena projektu a dodatok | porovnať pôvodný a nový rozpočet s odôvodnením | Čiastočne | Pravidlá Z01 až Z08: druh zmeny, formulár, vplyv na NFP, lehoty (`packs/PSK-SIEA-002-2023-DV-EFRR/zmeny.json:37-161`, `src/moduly/zmeny/modul.ts:51-75`). Rozpočet po položkách neporovná. |
| 18 | Súťažné podklady | rozpory v opise predmetu, výkaze výmer, kritériách a zmluve | Nie | |
| 19 | Kontrola VO | pripraviť spis u prijímateľa pred odoslaním | Čiastočne | Pravidlá V01 až V07 nad hotovým VO: limit postupu, počet ponúk, cena voči predpokladanej hodnote, faktúry nad zmluvu, delenie zákazky, štatutári, záznam zo zadania (`packs/PSK-SIEA-002-2023-DV-EFRR/vo.json:38-125`). Úplnosť spisu pred odoslaním na ÚVO nekontroluje. |
| 20 | Námietky pri obstarávaní | zoradiť dôkazy pred podaním | Mimo | Ide o opravné prostriedky podľa zákona o VO, nie o kontrolu dokumentov k eurofondom. |
| 21 | Míľniky stavby | porovnať hlásenie s harmonogramom | Nie | |
| 22 | Akceptácia MS a ukazovateľov | spojiť tvrdenie o výstupe s protokolom, obdobím a definíciou | Čiastočne | Pravidlá U01 až U03: plnenie MU, krátenie NFP, včasnosť MS (`packs/PSK-SIEA-002-2023-DV-EFRR/ukazovatele.json:21-37`, `src/moduly/ukazovatele/modul.ts:60-141`). Text správy nečíta. |
| 23 | Overenie na mieste, dôkaz o dodaní | väzby faktúra, položka, odovzdávací protokol | Nie | Výnimka: pri záverečnej ŽoP so stavbou vyžaduje preberací protokol a kolaudačné rozhodnutie (`src/moduly/zop/modul.ts:278-280`). |
| 24 | Refundácia | spárovať faktúru, úhradu a položku rozpočtu | Čiastočne | Pravidlá P01 až P12: obdobie, sumy voči dokladu, dvojité nárokovanie, DPH, väzba na VO, hotovosť, prílohy, faktúra, bankový výpis (`packs/PSK-SIEA-002-2023-DV-EFRR/zop.json:36-263`). Väzbu na položku rozpočtu zmluvy som neoveril. |
| 25 | Zálohy a predfinancovanie | navrhnúť typ podania; spojiť položky s termínom zúčtovania | Čiastočne | Rozlišuje typ ŽoP a žiada prílohy podľa typu (`src/moduly/zop/modul.ts:380`). Termín zúčtovania nesleduje. |
| 26 | Zúčtovanie záloh a predfinancovania | nevyúčtovaný zvyšok, duplicity, chýbajúce výpisy | Čiastočne | Duplicity (P03) a výpis (P12) áno. Nevyúčtovaný zvyšok a lehoty 10 dní a 12 mesiacov (DOP 3.2 r. 1513 až 1514, 1535 až 1537, 1615 až 1616) nie. |
| 27 | Jednotkové náklady, paušály | dôkaz o výstupe pri paušáloch | Nie | |
| 28 | Pravidlo 80 dní pri úhrade | oddeliť úplnosť, prerušenie, dožiadanie a obnovenie plynutia | Nie | Lokálne podklady pravidlo nedokladajú. Podobnú logiku lehoty, doručenia a predĺženia má Podateľňa pri doplnení ŽoNFP (`src/podatelna/lehoty.ts`). |
| 29 | Záverečná platba | ktoré podmienky zmluvy ostali otvorené | Čiastočne | Pri záverečnej ŽoP so stavbou vyžaduje preberací protokol a kolaudáciu (`src/moduly/zop/modul.ts:278-280`); rozlišuje záverečnú MS (`src/moduly/ukazovatele/modul.ts:24`). Zoznam otvorených podmienok zmluvy nezostaví. |
| 30 | Udržateľnosť | následné správy, aktíva, odkaz na povinnosť | Nie | |
| 31 | Audit a uzavretie zistenia | export rozhodnutí a dôkazov s verziami | Čiastočne | Posudok si pamätá znenie výzvy a verziu balíka pravidiel (`src/core/typy.ts:154-158`). Ak sa pravidlo odvtedy zmenilo, staré doklady nevydá za platné (`src/podatelna/doklady.ts:55-58`, `:72`). Export pre audítora nemá. |
| 32 | Nezrovnalosť a vymáhanie | doložená chronológia a sumy | Nie | Signál dáva len pravidlo P03 (ten istý doklad nárokovaný viackrát). |

Spolu: 12 Čiastočne, 11 Nie, 1 Mimo, 0 Áno.

Body 1 až 8 (príprava výzvy a zámeru) a 33 až 54 (iné programy a osobitné režimy) nehodnotím: repozitár
pre ne nemá balík pravidiel. Čiastočne sa ich dotýka modul Plánovanie výziev: otvorenosť výzvy,
najbližšia uzávierka, posledná verzia výzvy (`README.md:17`).

### Šesť inštitúcií z odpovede astry

| Inštitúcia a proces | Astra navrhuje overiť | Verdikt | Prečo |
|---|---|---|---|
| MH SR, hodnotenie priemyselného výskumu | dátumy pridelenia hodnotiteľa a doplnení; kontrola rozpočtu, partnerstiev a podmienok účasti | Nie | Iné PPP a prílohy ako pilotná výzva. Treba nový balík pravidiel z textu výzvy MH; jadro softvéru (citácie, poistky, Podateľňa) sa dá použiť. |
| Ministerstvo školstva, rozhodnutia a monitoring výskumu | či má každý záver hodnotiteľa doklad, odôvodnenie a verziu kritéria; NKÚ našiel rozhodnutia po lehote | Nie | Dá sa postaviť: párovanie výroku s citáciou a verziou výzvy softvér robí pri PPP. Chýba záznam hodnotiteľa a sledovanie lehoty na rozhodnutie (ponuky č. 2 a 8 v časti 6). |
| SIEA, opravy žiadostí domácností | spisy pod novými pravidlami; koľko doplnení sa dá odvrátiť pred odoslaním | Nie | Iná agenda (domácnosti, zhotovitelia), samostatný balík. Astra ju sama oddeľuje od dema pre verejné budovy. |
| ŽSR a ministerstvo dopravy, pripravenosť stavieb | tvrdenie „projekt je pripravený“ voči povoleniam, pozemkom a harmonogramu | Nie | Iný produktový smer, ako uvádza aj astra. |
| MAS a PPA, LEADER | ktoré doklady sa dnes preverujú opakovane | Nie | Pre PPA nie je balík. Najprv treba prípady zo súčasnej intervencie. |
| ÚVO, kontrola VO | kontrola spisu obce pred odoslaním na ÚVO | Čiastočne | V01 až V07 overia obsah VO, úplnosť spisu pred odoslaním chýba (ponuka č. 1 v časti 6). |

### Meranie pilotu

Pre pilot astra odporúča merať, koľko opráv nástroj zachytí pred odoslaním, koľko bezchybných spisov
zbytočne označí a koľko času ušetrí. Softvér má dva zdroje čísel: porovnanie výsledku pravidiel so
skutočným rozhodnutím poskytovateľa nad historickými žiadosťami (`web/app.js:167-172`) a počítadlo
rozhodnutí kontrolóra, ktoré sa líšia od návrhu softvéru (`src/podatelna/podatelna.ts:534-543`).

Počítadlo spája dva rôzne prípady (`src/podatelna/podatelna.ts:543`):

- softvér navrhol nesplnené podmienky a kontrolór schválil: možný **zbytočný poplach**;
- softvér nenašiel porušenie alebo spis overil len čiastočne a kontrolór zamietol: možná **prepustená
  chyba**, teda horší omyl.

Pre pilot treba tieto čísla vykazovať zvlášť (ponuka č. 3 v časti 6). Čas odborníka softvér nemeria.

## 5. Čo softvér dokáže dnes

- **Šesť modulov nad pilotnou výzvou** (`README.md:15-22`): plánovanie výziev (5 pravidiel), žiadosť
  a prílohy (27 pravidiel), verejné obstarávanie (7), zmeny projektu (8), žiadosť o platbu (12),
  merateľné ukazovatele (3). Prípady sú z verejných dát ITMS21+.
- **Podateľňa** napodobňuje prácu kontrolóra: prijme podanie, zaradí prílohy, spustí posúdenie,
  navrhne výzvu na doplnenie s lehotou a zapíše rozhodnutie kontrolóra oddelene od návrhu
  (`README.md:69-71`, `src/podatelna/podatelna.ts:3-4`).
- **Poistka proti najhoršej chybe.** Chýbajúci údaj nikdy nevedie k „splnené“, nejasný prípad ide
  človeku a výrok „bez zistení“ padne, len keď sa overilo všetko, čo pravidlá žiadajú (`README.md:8-10`).
- **Kde nepomáha.** Pri rozhodnutiach s voľnou úvahou: riziková analýza, vplyv na výsledok VO, rozsah
  FK, výber podľa alokácie. Ďalej pri lehote na rozhodnutie, zmluve, zúčtovaní záloh, udržateľnosti a
  nezrovnalostiach.

## 6. Ponuka implementácie

Zoradené podľa prínosu pre pilot a podľa toho, či repozitár má podklady; poradie nie je podľa rozsahu,
najmenšie zmeny sú č. 2, 3 a 4. Každá položka nadväzuje na bod astry alebo jej odporúčanie a na uzol v
diagrame. Rozsah:

- **malý**: stavia na existujúcom kóde, nové vstupy netreba;
- **stredný**: nové pravidlá zo vstupov, ktoré repozitár má;
- **veľký**: treba vstupy, ktoré repozitár nemá, alebo čítanie voľného textu jazykovým modelom.

1. **Spis VO pred odoslaním.** Kontrola úplnosti dokumentácie, ktorú prijímateľ predkladá SO a ÚVO
   (DOP 3.2 r. 4041 až 4043). Patrí sem napríklad čestné prehlásenie ku konfliktu záujmov pri
   predbežnej kontrole, ak ju prijímateľ žiada (je fakultatívna, CKO r. 497 a 505), a spresnené poistky
   pravidla V07 (`TODO.md`, T3).
   *Väzba:* astra č. 19 a riadok ÚVO; D2, A2.
   *Prínos:* obec opraví spis skôr, než ho ÚVO vráti; astra navrhuje merať počet vratiek a najpomalšiu
   desatinu kontrol.
   *Rozsah:* stredný; povinný obsah je v DOP 3.2 a CKO, cvičné spisy v `demo/vo/`.
   *Riziko:* zoznam povinných dokumentov sa líši podľa postupu VO; ak by to softvér nerozlíšil, mohol
   by úplný spis vyhlásiť za neúplný alebo naopak. Podľa astry ÚVO už používa vlastný nástroj (SOLA) a
   vyčíslil pokles priemerného času kontroly; ponuka preto mieri na prijímateľa pred odoslaním, nie na
   prácu ÚVO.
2. **Lehota na rozhodnutie o ŽoNFP.** Sledovať 70 pd od uzavretia kola (výzva r. 593 až 595), jej
   prerušenie výzvou na doplnenie a opätovné plynutie (MD č. 21 r. 381 až 384). Text návrhu výzvy
   prerušenie už uvádza (`src/podatelna/vyzva.ts:179`).
   *Väzba:* riadok Ministerstvo školstva (podľa astry NKÚ doložil rozhodnutia 20 až 27 pd po lehote); D1.
   *Prínos:* SO vidí spisy, ktorým hrozí rozhodnutie po lehote.
   *Rozsah:* malý; nadväzuje na `src/podatelna/lehoty.ts` (pracovné dni, sviatky, doručenie).
3. **Meranie pilotu: zbytočné poplachy a prepustené chyby zvlášť.** Rozdeliť počítadlo odlišných
   rozhodnutí (`src/podatelna/podatelna.ts:543`) na dva prípady z časti 4 a v druhom oddeliť návrh
   „bez zistení“ od návrhu „čiastočne overené“.
   *Väzba:* meranie pilotu, ktoré odporúča astra; A1 „Sedí výrok s dokladom?“.
   *Prínos:* vidno zvlášť, koľko bezchybných spisov softvér zbytočne označil a koľko chybných prepustil.
   *Rozsah:* malý.
   *Riziko:* meradlom je rozhodnutie kontrolóra; ak sa mýli on, mýli sa aj číslo.
4. **Návrat po doplnení: len zmenené a otvorené body.** Porovnať nový posudok s predchádzajúcim a s
   výzvou na doplnenie: čo žiadateľ doplnil a čo ostáva otvorené.
   *Väzba:* astra č. 10; slučka doplnenia v A1.
   *Prínos:* kontrolór nečíta celý spis odznova.
   *Rozsah:* malý; spis už drží posudky aj výzvu na doplnenie.
   *Riziko:* nízke, ak sa nezmenené body overia znova a len sa zobrazia oddelene.
5. **Dodatok voči pôvodnému rozpočtu po položkách.** Porovnať rozpočet pred zmenou a po nej s
   odôvodnením pri každej položke.
   *Väzba:* astra č. 17, pri ktorom astra uvádza stav „Cielené zlepšenie nedoložené“, teda verejne
   nenašla vyhodnotený zásah; D3 „Schváli zmenu?“.
   *Prínos:* zmena rozpočtu bez odôvodnenia sa ukáže pri položke.
   *Rozsah:* stredný [overiť, či verejné dáta ITMS21+ dávajú rozpočet zmeny po položkách; ak nie,
   veľký].
6. **Zúčtovanie zálohy a predfinancovania.** Nevyúčtovaný zvyšok a lehoty: predfinancovanie zúčtovať do
   10 dní, nezúčtovaný rozdiel vrátiť do 10 dní od konca lehoty na zúčtovanie, zálohu zúčtovať do
   12 mesiacov (DOP 3.2 r. 1513 až 1514, 1535 až 1537, 1615 až 1616).
   *Väzba:* astra č. 25 a 26 (pri č. 26 tiež „Cielené zlepšenie nedoložené“); D3.
   *Prínos:* prijímateľ nezmešká vrátenie rozdielu.
   *Rozsah:* stredný [overiť, či dáta ITMS21+ obsahujú dátum pripísania platby].
7. **Akceptácia monitorovacej správy.** Spárovať tvrdenie o výstupe s protokolom, obdobím a definíciou
   ukazovateľa.
   *Väzba:* astra č. 22 (tiež „Cielené zlepšenie nedoložené“); D3 „Schváli MS?“.
   *Prínos:* menej MS vrátených na opravu.
   *Rozsah:* veľký; text správy musí čítať jazykový model.
   *Riziko:* model môže tvrdenie prečítať zle, preto výrok musí ísť človeku.
8. **Dôkazový spis hodnotiteľa.** Má každý záver hodnotiteľa doklad, odôvodnenie a verziu kritéria?
   *Väzba:* astra č. 12 a riadok Ministerstvo školstva.
   *Prínos:* záver bez dokladu alebo s neplatnou verziou kritéria sa ukáže pred rozhodnutím.
   *Rozsah:* veľký; repozitár nemá vzor výstupu hodnotiteľa.
9. **Rozhodnutie, zmluva a prílohy.** Zhoda názvu projektu, rozpočtu a podmienok.
   *Väzba:* astra č. 16; D1.
   *Rozsah:* veľký; treba vzorky zmlúv, ktoré repozitár nemá (CRZ je verejný).
10. **Pravidlo 80 dní pri úhrade ŽoP.**
    *Väzba:* astra č. 28.
    *Rozsah:* zatiaľ blokované: najprv treba overiť pravidlo v primárnom zdroji, lokálne podklady ho
    nemajú.

## 7. Hranice a neoverené body

- **Pravidlo 80 dní** (astra č. 28) lokálne podklady nedokladajú.
- **Vstup národného projektu a územnej investície** v D1 je prevzatý z mapy astry, lokálne neoverený.
- **Dobrovoľná predbežná kontrola ÚVO po vyhodnotení ponúk od 21. 5. 2026** je tvrdenie astry.
  Lokálna príručka CKO uvádza predbežnú kontrolu ako fakultatívnu (r. 497); dátum a rozsah zmeny som
  neoveril.
- **Ďalšie tvrdenia astry** (nástroj SOLA v ÚVO, nálezy NKÚ, časy z ITMS21+) preberám ako jej tvrdenia;
  lokálne som ich neoveroval.
- **Druh dní** pri lehotách napísaných „dní“ malým písmenom (zúčtovanie predfinancovania, námietky)
  zdroje na citovaných miestach nespresňujú.
- **Nedokončené overenia verdiktov.** Pri č. 9 som kontrolu nesúladu identifikátora medzi prílohami
  hľadal len v balíkoch pravidiel. Pri č. 24 som neoveril, či sa výdavok viaže na položku rozpočtu
  zmluvy.
- **Útvar, ktorý ŽoP uhrádza**, lokálne podklady nerozlišujú (DOP 3.2 r. 203 uvádza MF SR ako
  platobný orgán).
- **Obdobie udržateľnosti** je vo vzore zmluvy prázdne („... rokov“, vzor zmluvy r. 146); určuje ho
  konkrétna zmluva.
- **Kontakty na pracovníkov** z adresára astry zámerne nepreberám.
- Verdikty platia pre kód v commite `9588175`; po zmene kódu ich treba overiť znova.

## 8. Obnovenie diagramov

Diagramy generuje archify, skill pre Claude Code (verzia 3.2.0, nainštalovaný v
`~/.claude/skills/archify`). Zdrojom každého diagramu je `<id>.candidate.json` v tomto priečinku; `<id>`
je `d1-pred-zmluvou`, `d2-po-zmluve-vo`, `d3-po-zmluve-platby`, `a1-aktivity-ziadost`, `a2-aktivity-vo`
alebo `a3-aktivity-zop`. HTML sa vygeneruje z koreňa repozitára:

```
node ~/.claude/skills/archify/bin/archify.mjs finalize workflow reports/2026-11-27-procesy-a-rozhodovanie/<id>.candidate.json reports/2026-11-27-procesy-a-rozhodovanie/<id>.html --repo-root . --quality showcase
```

Ak pri výstupe už ležia kontrolné záznamy z predchádzajúceho behu, pridajte `--out-dir <iný priečinok>`.
Automatické kontroly archify (schéma, doručenie, prísna kontrola zdrojov, kontrola v prehliadači) prešli
pri všetkých šiestich diagramoch. Snímky diagramov aktivít A1 až A3 som prezrel. Kontrolné záznamy
obsahujú absolútne cesty, preto ich `.gitignore` vynecháva.

## 9. Slovník skratiek

Slovník pokrýva aj skratky, ktoré sú len v diagramoch.

| Skratka, pojem | Význam |
|---|---|
| alokácia kola | suma, ktorú výzva vyčlenila na jedno hodnotiace kolo |
| ARACHNE | nástroj Európskej komisie na vyhľadávanie rizikových projektov a väzieb |
| balík pravidiel | súbor pravidiel jedného modulu pre jednu výzvu (`packs/<výzva>/<modul>.json`) |
| CKO | Centrálny koordinačný orgán; vydáva jednotné príručky pre eurofondy |
| CRZ | Centrálny register zmlúv |
| DOP | dopytovo orientované projekty; tu skratka príručky SIEA pre prijímateľa |
| DPH | daň z pridanej hodnoty |
| EE | energetická efektívnosť |
| EFRR | Európsky fond regionálneho rozvoja |
| ex ante, ex post | náprava porušenia VO pred pripustením výdavkov (ex ante) alebo finančná oprava po ňom (ex post) |
| FK | finančná kontrola |
| HzP | hodnota za peniaze |
| ITMS21+ | informačný monitorovací systém eurofondov 2021 až 2027; jeho verejné dáta sú zdrojom prípadov |
| kolaudačné rozhodnutie | rozhodnutie stavebného úradu, ktorým povoľuje užívať stavbu |
| LEADER | miestny rozvoj vedený komunitou cez MAS, z poľnohospodárskeho fondu |
| MAS | miestna akčná skupina |
| MD č. 21 | metodický dokument riadiaceho orgánu č. 21 ku konaniu o ŽoNFP |
| MF SR | Ministerstvo financií SR |
| MH SR | Ministerstvo hospodárstva SR |
| MIRRI SR | Ministerstvo investícií, regionálneho rozvoja a informatizácie SR; riadiaci orgán Programu Slovensko |
| MS | monitorovacia správa |
| MU | merateľný ukazovateľ |
| NFP | nenávratný finančný príspevok |
| NKÚ | Najvyšší kontrolný úrad SR |
| OoZ | oznámenie o zmene projektu |
| OZE | obnoviteľné zdroje energie |
| pd | pracovné dni |
| Podateľňa | karta aplikácie, ktorá napodobňuje prácu kontrolóra (`src/podatelna/`) |
| PPA | Pôdohospodárska platobná agentúra |
| PPP | podmienky poskytnutia príspevku |
| PSK | Program Slovensko (v kóde výzvy; DV = dopytová výzva) |
| r. | riadok textovej verzie dokumentu (časť 2) |
| RPO | register právnických osôb |
| RPVS | register partnerov verejného sektora |
| SIEA | Slovenská inovačná a energetická agentúra |
| SO | sprostredkovateľský orgán; tu SIEA |
| SOLA | nástroj, ktorý podľa astry používa ÚVO pri kontrole VO (neoverené) |
| T3 | úloha v `TODO.md` repozitára: spresniť poistky pravidla V07 |
| UML | Unified Modeling Language, jazyk diagramov na modelovanie softvéru a domény |
| ÚVO | Úrad pre verejné obstarávanie |
| V01 až V07, Z01 až Z08, P01 až P12, U01 až U03 | pravidlá modulov verejné obstarávanie, zmeny projektu, žiadosť o platbu a merateľné ukazovatele (`packs/PSK-SIEA-002-2023-DV-EFRR/`) |
| VO | verejné obstarávanie |
| VÚC | vyšší územný celok (samosprávny kraj) |
| VZP | všeobecné zmluvné podmienky, príloha č. 1 zmluvy o NFP |
| ŽoNFP | žiadosť o NFP |
| ŽoP | žiadosť o platbu |
| ŽoV | žiadosť o vrátenie NFP alebo jeho časti |
| ŽoZZ | žiadosť o zmenu zmluvy |
| ŽSR | Železnice Slovenskej republiky |
