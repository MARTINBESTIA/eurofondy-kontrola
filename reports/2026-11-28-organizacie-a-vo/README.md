# Organizácie mimo SIEA: procesy, demo a jeho rozšírenie

Stav k 28. 11. 2026. Tento priečinok odpovedá na dve otázky:

1. Pre ktoré inštitúcie sa dá zostaviť demo s terajším softvérom?
2. Dá sa demo pre procesy, ktoré sa dajú zefektívniť AI, rozšíriť (duplikovať) aj na ďalšie organizácie?

Podklady:

- Astrine prílohy z 27. 11. 2026:
  - tabuľka 54 procesov eurofondov od prípravy výzvy po audit (`Procesy_a_dokazy.csv`, stĺpec „Čo zlepšiť / zmerať“),
  - porovnanie vyhlasovateľov Programu Slovensko (`Vyhlasovatelia_porovnanie.csv`).

  Prílohy nie sú v repozitári. Čo z nich treba, je prepísané nižšie. Čísla z nich som neprepočítal.
- Sedem diagramov procesov v tomto priečinku. Každý vychádza z aktuálnej verzie predpisu (časť Zdroje).
- Kód softvéru (odkazy `súbor:riadok`) a `README.md` projektu.

Všetky využitia vo verejnom obstarávaní (VO), hotové aj návrhy, sú v [`VYUZITIA-VO.md`](../../VYUZITIA-VO.md).
Údaj označený **[overiť]** zatiaľ nie je overený v zdroji.

## Odpoveď v skratke

- **Demo hneď, bez zmeny softvéru (úroveň A).**
  - SIEA, výzva `PSK-SIEA-002-2023-DV-EFRR`: všetkých šesť modulov a podateľňa. Je to dnešný pilot.
  - Plánovanie výziev pre žiadateľov a konzultantov vo všetkých výzvach Programu Slovensko (182 výziev
    a 4 plánované). Modul používa balík `PSK` pre celý program (`src/moduly/vyzvy/modul.ts:151`).
- **Demo bez nového kódu, len s novým balíkom pravidiel a stiahnutými dátami výzvy (úroveň B).**
  - Kontrola VO, žiadostí o platbu (ŽoP) a zmien projektu u ostatných vyhlasovateľov Programu Slovensko:
    MIRRI, Úrad vlády SR, MŽP, MPSVR, MŠVVaM, MD, MH, MZ a MV. Ich projekty sú vo verejnom API ITMS21+.
  - ÚVO ako kontrolór VO v Programe Slovensko, nad VO z ľubovoľných výziev programu. Pred takým demom treba
    opraviť limit V01 podľa MD 26 (`TODO.md`, T4). Inak by ÚVO videl pravidlo podľa príručky, ktorú MD 26
    nahradila.
  - MV SR (fondy AMIF, BMVI, ISF) a slovenskí partneri v Interreg SK-AT a SK-CZ, ak sú ich VO v ITMS21+ [overiť].
- **Demo s novým kódom (úroveň C).**
  - Lehoty ÚVO podľa MD 26: kalendárne dni a prerušenie lehoty.
  - Projektové zámery integrovaných územných investícií (MIRRI, VÚC, mestá).
  - Odborné hodnotenie a hodnotiaci hárok, potrebné pri každom SO.
  - SAŽP: kalendárne dni a párovanie energetických certifikátov s domom.
  - Modernizačný fond a pravidlo 80 dní pri platbe.
- **Demo len na vymyslených spisoch, kým nie je prístup k dátam (úroveň D):** PPA (IMS), Plán obnovy (ISPO),
  Zelená domácnostiam II, Interreg HU-SK a PL-SK, Erasmus+, Horizont Európa a SIH.
- **Duplikovanie dema na ďalšie organizácie: áno, s tromi výhradami.** Jadro nepozná výzvu. Balík pravidiel aj
  dáta sa vyberajú podľa kódu výzvy. AI vrstva, teda lokálny model s poistkami, je spoločná. Výhrady:
  - balík treba prepísať na predpisy danej organizácie, pilotné balíky citujú príručky SIEA;
  - výpočtové podmienky iného druhu potrebujú nové kontroly v kóde;
  - dáta mimo ITMS21+ potrebujú konektor alebo ručné nahratie súborov.

  Podrobnosti sú v časti „Duplikovanie dema na ďalšie organizácie“.

## Úrovne pripravenosti dema

| Úroveň | Čo treba | Rozsah vo `VYUZITIA-VO.md` |
|---|---|---|
| A | nič, beží dnes | Hotové |
| B | nový balík `packs/<výzva>/<modul>.json` a stiahnutie dát výzvy skriptami s kódom výzvy; kód sa nemení | S |
| C | nová kontrola, nový modul alebo nový režim lehôt v kóde | M, alebo L pri novom module |
| D | dáta sú mimo ITMS21+; bez konektora alebo prístupu je možné len demo na vymyslených spisoch | L (nový zdroj dát) |

Prílohy žiadostí nie sú verejné ani v ITMS21+ (`README.md`, časť Obmedzenia). Kontrola obsahu dokumentov preto
aj v pilote beží na vymyslených dokumentoch. Úroveň D teda znamená, že chýbajú aj štruktúrované údaje
(formulár, VO, ŽoP), nielen dokumenty.

## Inštitúcie: kde je demo reálne

| Inštitúcia | Proces na demo | Dáta | Čo softvér už vie | Čo chýba | Úroveň |
|---|---|---|---|---|---|
| SIEA (Program Slovensko) | celý pilot: žiadosť o NFP, VO, zmeny, ŽoP, ukazovatele, podateľňa | ITMS21+: 799 žiadostí, 659 VO, 2 336 zmien, 1 362 ŽoP, 242 projektov | všetkých šesť modulov (`README.md`, tabuľka modulov) | otvorené úlohy T2, T3 a T4 v `TODO.md` | A |
| Vyhlasovatelia Programu Slovensko (MIRRI, ÚV SR, MŽP, MPSVR, MŠVVaM, MD, MH, MZ, MV) | plánovanie výziev | ITMS21+, 182 výziev | modul Plánovanie výziev | nič; pravidlá sú údaje ITMS21+, nie právny text | A |
| tí istí | kontrola VO, ŽoP a zmien na ich výzvach | ITMS21+; skripty berú kód výzvy (`scripts/05-stiahni-projekty.ts:11`, `scripts/06-stiahni-zop-vo.ts:11`) | V01 až V07, P01 až P12, 8 pravidiel zmien; limity postupov VO sú v kóde a platia pre každú výzvu (`src/moduly/vo/modul.ts:33-41`) | balík s citáciami príručky daného SO; ukazovatele počítajú sankcie podľa kalkulačky SIEA (`src/moduly/ukazovatele/kalkulacka.ts`) | B, ukazovatele C |
| tí istí | žiadosť o NFP v podateľni | formulár z ITMS21+; prílohy neverejné | podateľňa prijme podanie do každej výzvy, ktorá má balík `zonfp.json` (`src/podatelna/podatelna.ts:506`); 22 z 27 pravidiel pilotu používa kontroly s parametrami z balíka | 5 pravidiel pilotu je viazaných na energetickú efektívnosť (`packs/PSK-SIEA-002-2023-DV-EFRR/zonfp.json:184`, `:200`, `:218`, `:282`, `:358`); iná výzva potrebuje vlastné; vymyslené prílohy | B, doménové pravidlá C |
| ÚVO (sprostredkovateľský orgán pre kontrolu VO v Programe Slovensko), diagram O1 | predbežná kontrola a kontrola po uzavretí zmluvy | VO z ITMS21+; dokumentácia VO je neverejná | modul VO a 12 hotových alebo čiastočných využití vo `VYUZITIA-VO.md` | T4; lehoty podľa MD 26: oznámenie do 40 dní (r. 416), prerušenie, počas ktorého lehota neplynie (r. 475, 476, 479); úplnosť dokumentácie (U46) | B pre VO, C pre lehoty |
| MIRRI, VÚC a mestá (integrované územné investície), diagram O2 | projektový zámer a stanovisko | [overiť, či sú projektové zámery v ITMS21+]; uznesenia rád partnerstva sú zverejnené [overiť] | lehoty v pracovných dňoch (`src/podatelna/lehoty.ts:73-88`); model číta uznesenie obce pri P03 (`zonfp.json:431-449`) | modul projektového zámeru, kontrolný zoznam z MD 8, Príloha 6 | C |
| Ktorýkoľvek SO, diagram O6 | výber odborných hodnotiteľov, hodnotiaci hárok | neverejné | citácia a úryvok pri každom náleze; overenie štatutárov v RPO pri V06 (`src/moduly/vo/modul.ts:141-176`) | modul hárku podľa MD 21, Príloha 1; osobné údaje hodnotiteľov smie spracúvať len SO | C |
| MV SR (fondy vnútra) | VO a ŽoP | ITMS21+ (podľa astry) | ako u vyhlasovateľov Programu Slovensko | balík podľa príručky MV; VO v ITMS21+ [overiť] | B |
| Interreg SK-AT a SK-CZ, diagram O7 | kontrola VO slovenských partnerov | projekty v ITMS21+ (SK-AT overené na jednom projekte 28. 11. 2026); VO [overiť] | modul VO | pravidlá PVO PCS v2.1 namiesto MD 26; ÚVO tu nie je SO (CKO SP r. 438–440) | B, ak sú VO v API, inak D |
| Interreg HU-SK, HUSKROUA, PL-SK | podanie a vykazovanie | e-mail, CST2021 (podľa astry) | nič špecifické | konektor alebo ručné nahratie | D |
| PPA, diagram O3 | konanie o žiadosti (výzva 73.12, LEADER 77.1) | IMS a ispp.apa.sk, nie ITMS21+ | podateľňa prijme súbory a štruktúrovaný formulár v JSON | balík pre výzvu 73.12; konektor k IMS neexistuje | B na vymyslených spisoch, D na reálnych |
| SAŽP, diagram O4 | platba príspevku Obnov dom mini+ | on-line formulár SAŽP; verejné API nepoznám [overiť] | párovanie dokladov z modulu ŽoP, prílohy so znakmi obsahu | lehoty v kalendárnych dňoch (`lehoty.ts` počíta len pracovné), balík | C, reálne dáta D |
| NIKA a vykonávatelia Plánu obnovy, diagram O5 | kontrola VO pri žiadosti o platbu | ISPO | modul VO | konektor k ISPO; posledné míľniky mali termín 31. 8. 2026 (SIPOO r. 785–786), demo má zmysel pre uzatváranie a audit | D |
| SIEA, Zelená domácnostiam II | doklady domácností na preplatenie | nový systém SIEA, registrácia od 26. 10. 2026 (podľa astry) | podateľňa, prílohy so znakmi obsahu | balík nových podmienok | B na vymyslených spisoch, D na reálnych |
| Environmentálny fond (Modernizačný fond) | technický a dotačný spis | výzva a príručka [overiť] | prílohy so znakmi obsahu, model s poistkami | doménové kontroly (emisie, technická príloha) | C |
| MPRV (Program Rybné hospodárstvo) | od podania po zmluvu | astra má časy projektov [overiť, či z ITMS21+] | ako u vyhlasovateľov Programu Slovensko | balík; pri VO platí, že ÚVO tu nie je SO (CKO SP r. 438–440) | B, ak je program v ITMS21+ |
| SAAIC (Erasmus+), koordinátori Horizontu Európa, SIH, mestá v EUI, Interact a ESPON | procesy 46 až 49, 52 a 54 | systémy EÚ, banky | nič špecifické | prístup k dátam | D |

### Objem práce u vyhlasovateľov Programu Slovensko

Podľa astrinho výpočtu z ITMS21+ (`Vyhlasovatelia_porovnanie.csv`, čísla som neprepočítal):

| Vyhlasovateľ | Zmlúv | Podanie po účinnosť zmluvy, medián dní | Refundácií | Refundácia, medián dní | Príklad výzvy (zmlúv) |
|---|---:|---:|---:|---:|---|
| MIRRI SR | 1 371 | 177 | 876 | 33 | PSK-MIRRI-010-2024-ITI-EFRR (299) |
| Úrad vlády SR | 888 | 219 | 2 744 | 27 | PSK-UV-001-2023-DV-ESF+ (422) |
| Životné prostredie | 849 | 235 | 501 | 42 | PSK-MZP-009-2024-DV-EFRR (288) |
| SIEA | 609 | 189 | 316 | 25,5 | PSK-SIEA-002-2023-DV-EFRR (236) |
| Práca a sociálne veci | 391 | 189 | 355 | 16 | PSK-MPSVR-034-2025-DV-ESF+ (72) |
| Školstvo | 162 | 160,5 | 266 | 30 | PSK-MSVVM-025-2024-DV-EFRR (38) |
| Doprava | 106 | 173 | 225 | 35 | PSK-MD-002-2024-ITI-EFRR (59) |
| Hospodárstvo | 83 | 466 | 73 | 196 | PSK-MH-010-2024-DV-EFRR (38) |
| Zdravotníctvo | 70 | 255,5 | 43 | 24 | PSK-MZ-002-2024-IUI-EFRR (16) |
| Vnútro | 10 | 154,5 | 3 | 14 | PSK-MV-003-2024-DV-EFRR (5) |

### Môj návrh poradia

Ide o úsudok, nie o overený fakt.

1. **ÚVO, modul VO nad VO z viacerých výziev Programu Slovensko** (úroveň B, po oprave T4).
   - Kontrola VO je zmerané úzke miesto. Podľa ÚVO trvala v priemere takmer 51 dní v roku 2025 a 43,6 dňa
     za január až júl 2026 (astrina metodika, aktualita ÚVO z 11. 8. 2026).
   - Modul VO od výzvy nezávisí.
2. **MIRRI alebo MŽP, moduly ŽoP a zmeny na výzve s najviac zmluvami** (úroveň B).
   - Kandidáti: PSK-MIRRI-010-2024-ITI-EFRR (299 zmlúv) a PSK-MZP-009-2024-DV-EFRR (288).
   - Výzva Úradu vlády SR má viac zmlúv (422) aj refundácií. Pri ESF+ však môžu prevládať zjednodušené náklady,
     na ktoré pravidlá ŽoP o faktúrach nesedia [overiť].
3. **Odborné hodnotenie (diagram O6) a lehoty ÚVO** (úroveň C). Potrebuje ich každý SO, takže nový kód sa použije
   viackrát.

### Nástroje, s ktorými sa demo bude porovnávať

Podľa astrinej tabuľky (stĺpec „Doložený zásah“; neoverené):

- ÚVO používa pri kontrole VO umelú inteligenciu (SOLA). Aktualita ÚVO zo 6. 5. 2026 je v zdrojoch nižšie.
- MIRRI má v Mape partnerstva asistenta na vyhľadávanie výziev.
- Pre MAS ponúka Truhlica formálnu kontrolu a AI hodnotenie.
- PPA prevádzkuje AMS na vyhodnocovanie poľnohospodárskych plôch.

Demo má preto stavať na tom, čo softvér preukázateľne robí:

- citáciu predpisu a doslovný úryvok pri každom výroku;
- poistky proti „falošne OK“, teda chýbajúci údaj nikdy nie je „splnené“;
- audit posudkov a rozhodnutí.

Či to robia aj tieto nástroje, nie je overené.

## Duplikovanie dema na ďalšie organizácie

### Prečo to ide bez prepisovania jadra

- Jadro nevie nič o výzve (`src/core/posud.ts:1`). Balík načíta podľa kódu výzvy a modulu
  (`src/core/posud.ts:10-12`).
- Server vyberie výzvu z premennej `VYZVA` (`src/server/server.ts:26`, `:33`). Dáta berie z
  `data/odvodene/<výzva>/` (`src/moduly/spolocne.ts:7-12`).
- Sťahovanie z ITMS21+ berie kód výzvy ako parameter (`scripts/01-stiahni-ziadosti.ts:8`,
  `scripts/05-stiahni-projekty.ts:11`, `scripts/06-stiahni-zop-vo.ts:11`).
- Pravidlo v balíku volá pomenovanú kontrolu s parametrami. Príklad: `"kontrola": "pravna_forma"` a zoznam
  povolených právnych foriem v `parametre` (`src/moduly/zonfp/kontroly.ts:355-360`). Nová výzva s rovnakým
  druhom podmienky mení len parametre.
- AI vrstva je jedna pre všetky výzvy:
  - Model dostane jednu podmienku a text. Vráti stav a doslovný úryvok.
  - Úryvok, ktorý v texte nie je, sa zahodí a bod ide človeku (`README.md`, Architektúra, bod 3).
  - Otázky pre model a vzory náležitostí sú v balíku, nie v kóde.

### Čo treba pre každú novú organizáciu

1. **Balík pravidiel s citáciami jej predpisov:** výzva, príručka pre prijímateľa, metodické usmernenia.
   Pilotné balíky citujú VZP 2.2 a príručku SIEA (DOP 3.2), preto sa nedajú len skopírovať.
2. **Doménové kontroly**, ak má výzva výpočtové podmienky iného druhu. V pilote je to 5 z 27 pravidiel žiadosti
   o NFP: úspora energie, hodnota za peniaze pri energetickej efektívnosti a pri OZE, pásmo oprávnených výdavkov
   a súlad Prílohy č. 8.
3. **Konektor**, ak dáta nie sú v ITMS21+ (IMS, ISPO, formulár SAŽP, CST2021). Inak ručné nahratie súborov
   do podateľne.
4. **Režim lehôt.** Dnes sa počítajú len pracovné dni (`src/podatelna/lehoty.ts:73`, `:83`).
   - Kalendárne dni potrebujú SAŽP, ÚVO (40 dní) a pravidlo 80 dní.
   - Prerušenie lehoty potrebujú ÚVO, PPA a Interreg.
5. **Vymyslené testovacie spisy s očakávaným výsledkom**, ako v `demo/testovacia-sada/`. Bez nich sa nedá zmerať
   falošné OK.

### Sedem opakovateľných vzorov v astrinej tabuľke

Každý vzor je jedna úloha pre AI alebo pravidlá, ktorá sa opakuje v mnohých organizáciách. Demo jedného vzoru sa
dá preniesť do ďalšej organizácie vymenou balíka. Čísla procesov odkazujú na tabuľku v ďalšej časti.

| Vzor | Procesy | Čo je hotové | Čo treba pre ďalšiu organizáciu | Kde sa opakuje |
|---|---|---|---|---|
| V1 Úplnosť podania a príloh | 3, 8, 9, 10, 35, 37, 40, 41, 50, 53 | podateľňa, prílohy so znakmi obsahu, návrh výzvy na doplnenie a lehota (pilot) | balík s prílohami a znakmi obsahu; pri SAŽP kalendárne dni | všetci SO, PPA, SAŽP, MAS, Environmentálny fond |
| V2 Párovanie dokladov | 23, 24, 25, 26, 27, 34, 44, 45, 49 | modul ŽoP: sumy voči dokladom, dvojité nárokovanie, DPH, väzba na VO, výpis (P01 až P12 v `zop.json`) | balík podľa príručky SO; konektor pri dátach mimo ITMS21+ | všetci SO, Interreg, PPA, SAŽP |
| V3 Porovnanie dokumentov a verzií | 2, 5, 6, 16, 17, 43, 47, 54 | modul Zmeny; kontrola zmien výzvy v ITMS21+ (`src/core/zmeny.ts`) | model porovná dva dokumenty po podmienkach s úryvkom z oboch | MIRRI, VÚC, všetci SO, Interreg, EUI |
| V4 Lehoty a čakanie | 13, 15, 28, 38, 39 | lehota na doplnenie v pracovných dňoch aj pri neznámom dni doručenia (`src/podatelna/lehoty.ts:130`) | kalendárne dni, prerušenie lehoty, časová os fáz z ITMS21+ | všetci SO, ÚVO, PPA, Interreg |
| V5 Verejné obstarávanie | 18, 19, 20, 33 | modul VO V01 až V07; 68 využití vo `VYUZITIA-VO.md` | T4; pravidlá PVO PCS pre Interreg a SIPOO pre Plán obnovy | ÚVO, všetci SO, Interreg, NIKA, PPA (LEADER) |
| V6 Dôkazový spis pre človeka | 4, 7, 11, 12, 14, 21, 22, 29, 30, 31, 32, 42, 46 | citácia a úryvok pri každom náleze, audit posudkov a rozhodnutí, inventár 44 podmienok zmluvy | zostavy pre preskúmanie, audit a nezrovnalosť | všetci SO, orgán auditu, NIKA |
| V7 Odpovede z textu výzvy s citáciou | 1, 36, 48, 51, 52 | zatiaľ nič; plánovanie výziev rieši len termíny a verzie | nový modul otázok nad textom výzvy | regionálne centrá, národné kontaktné body, PPA |

### Čo duplikovanie nevyrieši

- **Jedna výzva na jeden server.** Server beží pre jednu výzvu naraz (premenná `VYZVA`). Demo s viacerými
  výzvami preto potrebuje viac inštancií alebo malú úpravu. Podateľňa už viac výziev zvláda
  (`src/podatelna/podatelna.ts:506`).
- **Neverejné prílohy.** Reálne prílohy nie sú verejné u žiadnej z týchto organizácií. Kvalitu čítania dokumentov
  treba merať na vymyslených alebo poskytnutých spisoch.
- **Model overený len na vymyslených textoch.** Platí to pre lokálny model qwen3.5:9b (`README.md`, testy 2,
  4 a 7).
- **Predpisy každej organizácie.** Pravidlá treba čítať z jej aktuálnych predpisov. Pri organizáciách
  z diagramov sú aktuálne verzie už stiahnuté (časť Zdroje).

## 54 procesov z astrinej tabuľky

Ako čítať stĺpce:

- **Proces:** skrátený názov z astrinej tabuľky.
- **Stav:** Hotové, Čiastočne alebo Nie, rovnako ako vo `VYUZITIA-VO.md`. Platí pre pilot SIEA.
- **Demo:** úroveň A až D pre prvé demo pri uvedenej organizácii.
- **Vzor:** V1 až V7 z predchádzajúcej časti.

Súhrn: 2 hotové, 11 čiastočne, 41 nespravených (návrhy).

### Príprava

| # | Proces | Čo urobí softvér | Stav | Demo | Vzor | Organizácie |
|---|---|---|---|---|---|---|
| 1 | Výber vhodnej výzvy a prvá konzultácia | Plánovanie výziev: otvorené výzvy, uzávierky, či sa stihne príprava, posledná verzia výzvy. Návrh: odpovede z textu výzvy s citáciou podľa typu žiadateľa. | Čiastočne | A, odpovede C | V7 | žiadatelia, regionálne centrá, poradcovia |
| 2 | Text výzvy, oprávnenosť a pripomienky útvarov | Návrh: model pred zverejnením porovná podmienky, hodnotiace kritériá a formulár. Súvisí kontrola zmien už zverejnenej výzvy (`src/core/zmeny.ts`). | Nie | C | V3 | MIRRI, gestori výziev |
| 3 | DNSH a horizontálne princípy | Návrh: podmienky DNSH v balíku. Ku každej doklad, inak „chýba podklad“. | Nie | B | V1 | všetci SO |
| 4 | Štátna pomoc, de minimis a kumulácia | Dnes G11 len odovzdá bod kontrolórovi (`zonfp.json:601`, `TODO.md` T2). Návrh: párovanie subjektov a výdavkov so schémou. | Nie | D (register pomoci [overiť]) | V6 | SO, koordinátor pomoci |
| 5 | Územný zámer, uznesenie rady a podanie | Návrh: porovnať rozpočet a ukazovatele z uznesenia rady so žiadosťou, kontrolný zoznam z MD 8, Príloha 6 (diagram O2). Súvisí: model už číta uznesenie obce pri P03 (`zonfp.json:431-449`). | Nie | C | V3 | MIRRI, VÚC, mestá |
| 6 | Príprava zámeru národného projektu | Návrh: porovnať schválený zámer s podaním vrátane dátumov oboch verzií. | Nie | C | V3 | MIRRI, rezorty ako určení žiadatelia |
| 7 | Pozemky, povolenia a pripravenosť investície | Dnes G10 len odovzdá vlastníctvo kontrolórovi (`zonfp.json:588`). Návrh: register chýbajúcich povolení s dôkazom a závislou zákazkou. | Nie | D (kataster, `TODO.md` T1) | V6 | MD, ŽSR, NIKA |
| 8 | Zisťovacie konanie o vplyvoch na životné prostredie | Návrh: úplnosť podkladov pred konaním, rovnakým mechanizmom ako prílohy so znakmi obsahu. | Nie | C | V1 | MŽP, príslušné úrady |

### Výber

| # | Proces | Čo urobí softvér | Stav | Demo | Vzor | Organizácie |
|---|---|---|---|---|---|---|
| 9 | Podanie, registrácia a formálne náležitosti | Podateľňa: príjem, zaradenie príloh, znaky obsahu, súlad žiadateľa a projektu v Prílohe č. 8 s formulárom, znenie výzvy podľa kola. Podpis len označí, z textu sa overiť nedá. | Čiastočne | A (SIEA), inde B | V1 | všetci SO |
| 10 | Doplnenie neúplného spisu | Návrh výzvy na doplnenie (`src/podatelna/vyzva.ts`), lehota (`src/podatelna/lehoty.ts:73`), doplnenie k spisu (`src/podatelna/podatelna.ts:217`). Návrh: pri návrate ukázať len zmenené miesta. | Čiastočne | A (SIEA), inde B | V1 | všetci SO |
| 11 | Odborné hodnotenie a vydanie rozhodnutia | Každý nález k žiadosti o NFP má citáciu a úryvok. Návrh: hodnotiaci hárok podľa MD 21, Príloha 1 (diagram O6). | Čiastočne | C | V6 | všetci SO |
| 12 | Nezávislosť a výkazy odborných hodnotiteľov | Návrh: dôkazový spis o hodnotiteľovi, o konflikte rozhodne človek. Vzor: štatutári v RPO pri V06 (`src/moduly/vo/modul.ts:141-176`). | Nie | C | V6 | všetci SO |
| 13 | Kapacita výzvy, poradie a zásobník | Návrh: stav a dôvod čakania pri žiadosti. Súvisí: register výziev počíta zásobník (`src/podatelna/podatelna.ts:513`). | Nie | B | V4 | SIEA, ostatní SO |
| 14 | Preskúmanie rozhodnutia o príspevku | Posudky a rozhodnutia s poznámkou sa ukladajú (`src/podatelna/podatelna.ts:375`, `:387`). Návrh: chronológia a sporné kritériá pre odborníka. | Čiastočne | B | V6 | SO, PPA (odvolanie) |

### Zmluva

| # | Proces | Čo urobí softvér | Stav | Demo | Vzor | Organizácie |
|---|---|---|---|---|---|---|
| 15 | Od podania po účinnosť zmluvy | Návrh: časová os fáz z ITMS21+ s vlastníkom úlohy. Astra namerala medián 154,5 až 466 dní podľa vyhlasovateľa. | Nie | B | V4 | vyhlasovatelia Programu Slovensko |
| 16 | Podpisy, prílohy a účinnosť po schválení | Návrh: model porovná názvy, rozpočet a podmienky v rozhodnutí, v návrhu zmluvy a v prílohách. | Nie | C | V3 | všetci SO |
| 17 | Zmena projektu, rozpočtu a dodatok | Modul Zmeny: druh zmeny, podstatná zmena, NFP, 24-mesačný limit, lehoty, zníženie ukazovateľov, prílohy, odôvodnenie. | Hotové | A (SIEA), inde B | V3 | všetci SO |

### Realizácia

| # | Proces | Čo urobí softvér | Stav | Demo | Vzor | Organizácie |
|---|---|---|---|---|---|---|
| 18 | Súťažné podklady a vysvetlenia | Návrh: model hľadá rozpory medzi opisom predmetu, výkazom výmer, kritériami a zmluvou. | Nie | C | V5 | prijímatelia, ÚVO |
| 19 | Kontrola verejného obstarávania | Modul VO V01 až V07 (`packs/PSK-SIEA-002-2023-DV-EFRR/vo.json:38-125`). Lehoty ÚVO podľa MD 26 chýbajú. Prehľad 68 využití vo `VYUZITIA-VO.md`. | Čiastočne | A (SIEA), inde B, lehoty C | V5 | ÚVO, SO, prijímatelia |
| 20 | Námietky pri obstarávaní | Návrh: zoradiť dôkazy a odôvodnenia pred podaním. | Nie | C | V5 | uchádzači, ÚVO |
| 21 | Míľniky a skutočný postup stavby | Návrh: porovnať hlásenie s posledným harmonogramom a upozorniť na posunutý závislý termín. Súvisí: včasnosť monitorovacích správ v module Ukazovatele. | Nie | C, Plán obnovy D | V6 | NIKA, MD, SO |
| 22 | Monitorovacia správa a ukazovatele | Modul Ukazovatele: plnenie ukazovateľov, krátenie podľa kalkulačky SIEA, včasnosť správ. Návrh: väzba každého tvrdenia na protokol a definíciu ukazovateľa. | Čiastočne | A (SIEA), inde C | V6 | všetci SO |
| 23 | Overenie na mieste a dôkaz o dodaní | Modul ŽoP spája výdavok, doklad a zmluvu z VO. Návrh: odovzdávací protokol a zoznam podkladov na návštevu. | Čiastočne | B | V2 | SO, SAŽP |

### Platby

| # | Proces | Čo urobí softvér | Stav | Demo | Vzor | Organizácie |
|---|---|---|---|---|---|---|
| 24 | Refundácia vynaložených výdavkov | Modul ŽoP: obdobie oprávnenosti, sumy voči dokladom, dvojité nárokovanie, DPH, väzba na VO, hotovosť, prílohy, faktúra, výpis. | Hotové | A (SIEA), inde B | V2 | všetci SO |
| 25 | Zálohy a predfinancovanie | Návrh: odporučiť typ ŽoP a spojiť položky s termínom zúčtovania. Súvisí: modul rozlišuje refundáciu, predfinancovanie a zúčtovanie (`src/moduly/zop/modul.ts:28-30`). | Nie | C | V2 | všetci SO |
| 26 | Zúčtovanie záloh a predfinancovania | Hotové je dvojité nárokovanie medzi ŽoP (`src/moduly/zop/modul.ts:364`) a výpis. Návrh: nevyúčtovaný zvyšok. | Čiastočne | A (SIEA), zvyšok C | V2 | všetci SO |
| 27 | Jednotkové náklady a paušály | Návrh: dôkaz o dosiahnutom výstupe namiesto faktúr. | Nie | C | V2 | SO so zjednodušenými nákladmi [overiť] |
| 28 | Pravidlo 80 dní pri úhrade | Návrh: oddeliť úplnosť, prerušenie, dožiadanie a obnovenie plynutia. `lehoty.ts` dnes počíta len pracovné dni a bez prerušenia. | Nie | C | V4 | riadiace a sprostredkovateľské orgány |

### Ukončenie

| # | Proces | Čo urobí softvér | Stav | Demo | Vzor | Organizácie |
|---|---|---|---|---|---|---|
| 29 | Záverečná platba a uzavretie | Inventár 44 podmienok zmluvy v moduloch; podmienka, ktorú pravidlá nepokrývajú, je bod pre kontrolóra. Filter záverečných ŽoP (`src/moduly/zop/modul.ts:380`). Návrh: prehľad otvorených podmienok za celý projekt. | Čiastočne | B | V6 | všetci SO |
| 30 | Udržateľnosť projektu | Návrh: následné správy, aktíva a pracovné miesta s odkazom na povinnosť zo zmluvy. | Nie | B [overiť] | V6 | SO, SAŽP |
| 31 | Audit operácií | Posudky sa ukladajú s verziou spisu (`src/podatelna/podatelna.ts:68`), balíky majú archívne verzie (`packs/<výzva>/verzie/`). Návrh: export pre audítora. | Čiastočne | B | V6 | orgán auditu, SO |
| 32 | Nezrovnalosť, korekcia a vymáhanie | Návrh: chronológia, sumy a percentá opráv podľa tabuliek (MD 26 r. 493–498, PVO PCS r. 1623–1690). | Nie | C | V6 | SO, ÚVO, Interreg |

### Osobitné režimy

| # | Proces | Čo urobí softvér | Stav | Demo | Vzor | Organizácie |
|---|---|---|---|---|---|---|
| 33 | LEADER: prechod z MAS na PPA a kontrola VO | Návrh: jeden spis pre MAS aj PPA, VO cez modul VO. Dáta sú v IMS. | Nie | D | V5 | MAS, PPA |
| 34 | LEADER: preplatenie výdavkov | Návrh: pravidlá ŽoP v balíku PPA; oddeliť čas neúplnosti od frontu na PPA. | Nie | D | V2 | PPA, MAS |
| 35 | Mikrogrant MAS mimo LEADER | Návrh: podateľňa s malým balíkom a nahratými súbormi. | Nie | B (vymyslené spisy) | V1 | MAS |
| 36 | PPA: deklarácia a stav parcely | Návrh: vysvetliť oznámenie a pripraviť zoznam dôkazov pre farmára. Určenie parcely je odborný postup PPA. | Nie | D | V7 | PPA, farmári |
| 37 | PPA: investičná výzva podniku | Návrh: balík pre výzvu 73.12 v podateľni (diagram O3), vracané položky. | Nie | B (vymyslené), D | V1 | PPA |
| 38 | Rybné hospodárstvo: od podania po zmluvu | Návrh: časová os fáz pre 11 prípadov. | Nie | B [overiť zdroj dát] | V4 | MPRV |
| 39 | Fondy vnútra | Návrh: jedna skupina výziev jedného fondu z ITMS21+. | Nie | B | V4 | MV SR |
| 40 | SIEA: doklady domácností na preplatenie | Návrh: balík Zelená domácnostiam II, podiel spisov prijatých na prvý raz. | Nie | B (vymyslené), D | V1 | SIEA |
| 41 | Obnov dom: energetické certifikáty a ŽoP | Návrh: spárovať energetický podklad so správnym domom a typom výzvy. Súvisí: energetický certifikát v žiadosti o NFP pilotu. | Nie | C, D | V1 | SAŽP |
| 42 | Plán obnovy: míľniky a žiadosť EK | Návrh: každý míľnik so schváleným znením a dôkazmi. | Nie | D (ISPO) | V6 | NIKA, vykonávatelia |
| 43 | Interreg: posúdenie a zmluva | Návrh: zosúladiť rozpočty partnerov v dvoch jazykoch. | Nie | C | V3 | spoločné sekretariáty, programy Interreg |
| 44 | Interreg: národné overenie a spoločná správa | Návrh: dôkaz ku každému výdavku partnera; čakanie na poslednú krajinu. | Nie | B (SK-AT, SK-CZ), inak D | V2 | kontrolóri podľa PVO PCS, partneri |
| 45 | Malý cezhraničný projekt | Návrh: uznaný výstup s dokladom a jazykovou verziou. | Nie | D | V2 | správcovia fondov malých projektov |
| 46 | Erasmus+: hodnotenie partnerstiev | Návrh: čas overenia partnerských podkladov a nezávislosť hodnotiteľov. | Nie | D | V6 | národná agentúra |
| 47 | Horizont Európa: podpis grantu | Návrh: zosúladiť partnerov a podklady ku grantovej dohode. | Nie | D | V3 | slovenskí koordinátori |
| 48 | Národný kontakt pri priamych programoch | Návrh: odpovede na opakované otázky s citáciou. | Nie | C | V7 | národné kontaktné body |
| 49 | Úver a záruka cez finančný nástroj | Návrh: účel úveru a dôkazy oprávnenosti. | Nie | D | V2 | SIH, banky |
| 50 | Modernizačný fond: technický a dotačný spis | Návrh: predkontrola emisií a údajov technickej prílohy. | Nie | C | V1 | Environmentálny fond |
| 51 | Sociálno-klimatický plán | Návrh: sledovať požiadavky na dôkazy v konkrétnej výzve, až potom navrhnúť modul. | Nie | B neskôr | V7 | národný gestor |
| 52 | Interact a ESPON | Návrh: opakované metodické otázky; pri ESPON najprv konkrétna výzva. | Nie | C, D | V7 | BSK (Interact), ESPON EGTC |
| 53 | Obnov dom mini+: zúčtovanie zálohy a platba | Návrh: či doklady domácnosti pokrývajú práce podľa zmluvy, a ktoré prílohy sa vracajú (diagram O4). | Nie | C, D | V1 | SAŽP |
| 54 | Mestská iniciatíva EUI | Návrh: prepojiť pripomienky výboru s upravenými položkami a chýbajúcimi dohodami partnerov. | Nie | D | V3 | mestá |

## Diagramy procesov

Každý diagram má pruh „Softvér: hotové aj návrhy“. Každý uzol cituje riadky textového výťahu predpisu
v `data/zdroje/`. Jantárová karta uvádza verziu a dátum predpisu.

Diagramy prešli automatickými kontrolami archify (validácia, doručenie, kontrola, kontrola v prehliadači).
Prezrel som ich aj vizuálne, v svetlom aj tmavom režime. Diagram O2 má päť pruhov, preto je pruh softvéru na
obrazovke s výškou 900 px až po posunutí.

| Diagram | Organizácia a proces | Predpis |
|---|---|---|
| [O1](o1-uvo-kontrola-vo.html) | ÚVO: kontrola verejného obstarávania v Programe Slovensko | MD 26 v1.0 |
| [O2](o2-mirri-uzemne-investicie.html) | MIRRI a regióny: projektové zámery integrovaných územných investícií | MD 8 v4.0 a jeho Príloha 6 |
| [O3](o3-ppa-ziadosti.html) | PPA: konanie o žiadosti o príspevok v Strategickom pláne SPP | Príručka k výzve 73.12, výzva 77.1 akt. 2 |
| [O4](o4-sazp-obnov-dom.html) | SAŽP: platba príspevku na obnovu rodinného domu (Modernizačný fond) | Príručka pre prijímateľa v1.1 |
| [O5](o5-plan-obnovy-vo.html) | Plán obnovy: kontrola VO pri žiadosti o platbu | SIPOO v1.3 |
| [O6](o6-odborne-hodnotenie.html) | Odborné hodnotenie žiadosti o NFP: výber hodnotiteľov a hodnotiaci hárok | MD 3 v3.0, MD 21 v1.0 a jeho Príloha 1 |
| [O7](o7-interreg-vo.html) | Interreg: kontrola verejného obstarávania slovenských partnerov | PVO PCS v2.1 |

## Zdroje

Aktuálne verzie som stiahol 28. 11. 2026. Originál, rozbalené súbory a textový výťah sú v priečinku
`data/zdroje/<priečinok>/`.

| Skratka | Dokument, verzia, dátum | Odkaz | Priečinok |
|---|---|---|---|
| MD 26 | Príručka k procesu a kontrole VO, metodický dokument RO pre Program Slovensko č. 26, v1.0. Zverejnená 30. 7. 2026, účinná 31. 7. 2026. Jej text v r. 101 uvádza 1. 7. 2026 [rozpor, overiť]. | [docx](https://eurofondy.gov.sk/wp-content/uploads/2026/07/MU_RO_PSK_26_Prirucka_k_procesu_a_kontrole_VO_v_1_0.docx) | `MIRRI-MD26-prirucka-VO` |
| MD 8 | Metodické usmernenie k podpore integrovaného územného rozvoja, v4.0. Vydané 25. 3. 2026, účinné 26. 3. 2026. | [zip](https://eurofondy.gov.sk/wp-content/uploads/2026/05/MD_8_verzia_4_0.zip) | `MIRRI-MD8-integrovany-uzemny-rozvoj` |
| PPA 73.12 | Príloha 1 výzvy: Príručka pre žiadateľa 73.12, verzia 1, platná a účinná od 10. 9. 2026. Žiadosti sa podávajú od 12. 10. do 15. 12. 2026. | [pdf](https://apa.sk/api/files?url=http%3A%2F%2Ffiles%3A8081%2Ffiles%2Fpublic%2F2026-09%2FPriloha-1-Vyzvy-Prirucka-pre-ziadatela-73_12.pdf) | `PPA-prirucka-vyzva-73` |
| PPA 77.1 | Výzva 77.1 LEADER, aktualizácia 2. Výzva bola uzavretá 16. 2. 2026. | [pdf](https://www.apa.sk/api/files?url=http%3A%2F%2Ffiles%3A8081%2Ffiles%2Fpublic%2F2026-02%2FVyzva%252077.1-LEADER-akt2.pdf) | `PPA-vyzva-77-1-LEADER` |
| SAŽP | Príručka pre prijímateľa Obnov dom mini+ (26-MFOD-V01), verzia 1.1, platná od 2. 11. 2026. | [pdf](https://obnovdom.sk/media/mini-plus/26-MFOD-V01_Prirucka_pre_prijimatela_V1.1.pdf) | `SAZP-ObnovDom-miniplus` |
| SIPOO | Systém implementácie Plánu obnovy, verzia 1.3, účinná 26. 2. 2026. | [pdf](https://www.planobnovy.sk/site/assets/files/1236/sipoo-_verzia_1_3.pdf) | `NIKA-SIPOO` |
| MD 3 | Metodické usmernenie k výberu odborných hodnotiteľov, v3.0, vydané a účinné 9. 9. 2026. | [zip](https://eurofondy.gov.sk/wp-content/uploads/2026/09/MU_3_v_3_0.zip) | `MIRRI-MD3-odborni-hodnotitelia` |
| MD 21 | Metodické usmernenie ku konaniu o žiadosti o NFP, v1.0, účinné 8. 5. 2026, s Prílohou 1 (hodnotiaci hárok). Archív na webe má v názve „v1-1“, dokument v ňom je v1.0 [overiť, či vyšla v1.1]. | [zip](https://eurofondy.gov.sk/wp-content/uploads/2026/05/Metodicke-usmernenie-ku-konaniu-o-ziadosti-v1-1.zip) | `MIRRI-MU-konanie-ZoNFP` |
| PVO PCS | Príručka k procesu a kontrole VO programov cezhraničnej spolupráce 2021–2027, verzia 2.1. Vydaná 26. 1. 2026, účinná 27. 1. 2026. | [pdf](https://eurofondy.gov.sk/wp-content/uploads/2026/01/PVO_PCS_21-27__verzia-2.1_final.pdf) | `MIRRI-PVO-PCS-cezhranicne` |
| CKO SP | Metodické usmernenie k sledovaným príznakom, verzia 1.0, vydané a účinné 12. 11. 2026. | [zip](https://eurofondy.gov.sk/wp-content/uploads/2026/11/Usmernenie_SP.zip) | `CKO-MU-sledovane-priznaky` |

Webové stránky ÚVO:

- [Predbežná kontrola](https://www.uvo.gov.sk/dohlad/sprostredkovatelsky-organ-pre-program-slovensko/kontrola/predbezna-kontrola)
- [Kontrola po uzavretí zmluvy](https://www.uvo.gov.sk/dohlad/sprostredkovatelsky-organ-pre-program-slovensko/kontrola/kontrola-po-uzavreti-zmluvy)
- [Kontroly ÚVO v Programe Slovensko naberajú tempo](https://www.uvo.gov.sk/aktualne-temy/aktualita/kontroly-uvo-v-programe-slovensko-naberaju-tempo)
  (11. 8. 2026)
- [Umelá inteligencia pri kontrole verejného obstarávania](https://www.uvo.gov.sk/aktualne-temy/aktualita/umela-inteligencia-pri-kontrole-verejneho-obstaravania-na-uvo-uz-realitou)
  (6. 5. 2026)
- [Usmernenie k zákazkám z Mechanizmu na podporu obnovy a odolnosti](https://www.uvo.gov.sk/aktualne-temy/aktualita/usmernenie-uradu-k-zakazkam-financovanym-z-mechanizmu-na-podporu-obnovy-a-odolnosti)
  (odkaz zo SIPOO r. 4506)

## Obmedzenia a čo overiť

- **Astrine čísla.** Objemy a mediány pochádzajú z jej výpočtu z ITMS21+. Neprepočítal som ich.
- **Dáta v ITMS21+.** Pred demom treba v API overiť:
  - VO projektov Interreg SK-AT a SK-CZ a fondov vnútra;
  - projektové zámery integrovaných územných investícií;
  - program Rybné hospodárstvo.
- **ESF+.** Pri výzvach ESF+ (Úrad vlády SR, MPSVR) treba overiť, koľko ŽoP má účtovné doklady. Pri
  zjednodušených nákladoch pravidlá ŽoP o faktúrach nesedia.
- **Ukazovatele u iných SO.** Sankčný mechanizmus ukazovateľov u iných SO môže byť iný ako kalkulačka SIEA.
- **SAŽP.** Nepoznám verejné API pre žiadosti a platby.
- **Existujúce nástroje** (SOLA, asistent v Mape partnerstva, Truhlica, AMS) sú uvedené podľa astry.
  Čo presne robia, som neoveril.
- **Demo pre ÚVO.** Má zmysel až po oprave T4. Kým pravidlá VO citujú príručku CKO VO v2, ÚVO by videl limit,
  ktorý MD 26 zmenila.

## Súvisiace

- [`VYUZITIA-VO.md`](../../VYUZITIA-VO.md): 68 využití vo verejnom obstarávaní so stavom a zdrojmi.
- [`TODO.md`](../../TODO.md): T1 (verejné registre), T2 (označenie neoverených bodov), T3 (poistky V07),
  T4 (balík VO podľa MD 26).
- [`reports/2026-11-27-procesy-a-rozhodovanie/README.md`](../2026-11-27-procesy-a-rozhodovanie/README.md):
  posúdenie astriných bodov 6.2 a diagramy procesov SIEA.
