# Testovacia sada: nové žiadosti o NFP

Pätnásť fiktívnych žiadostí o NFP do výzvy **PSK-SIEA-002-2023-DV-EFRR** na skúšku podateľne. Každý ZIP je jedno nové podanie: formulár ŽoNFP a prílohy. Pri každom je uvedené, čo má softvér navrhnúť a prečo.

> Všetko je vymyslené: žiadatelia, osoby, IČO, čísla dokladov aj podpisy. Každý dokument to má v päte. Súbory sa nikam neposielajú.

## Z čoho je sada postavená

| Časť podania | Oficiálny vzor alebo pravidlo |
|---|---|
| Formulár ŽoNFP (`Formular_ZoNFP_*.json`) | štruktúra detailu žiadosti z verejného API ITMS21+ (`https://api.itms21.sk/public/v1/zonfp/id/{id}`), rovnaká ako v demo žiadosti G856; obsah podľa Prílohy č. 1 výzvy (Formulár ŽoNFP) |
| Príloha č. 1a – plnomocenstvo | vzor výzvy `Priloha_1a_ZoNFP__Plnomoc.doc` (akt. 3) |
| Prílohy č. 3, 6, 7 | náležitosti podľa Prílohy č. 2 výzvy (Zoznam príloh ŽoNFP, akt. 3): uznesenia o programe rozvoja a územnom pláne, predrealizačný energetický certifikát (§ 7 zákona č. 555/2005 Z. z.), projektová dokumentácia s energetickým hodnotením |
| Príloha č. 8 (`.xlsm`) | záväzný zošit výzvy `Priloha_8_ZoNFP_Dokument._k_OV_akt.3.xlsm`, vyplnený a prepočítaný v MS Excel; rozpočet formulára je z neho odvodený (krátenie podľa pásma úspory, PPP č. 13) |
| Príloha č. 9 (len znenie pred zmenou č. 3) | kontrolné zoznamy bezbariérovosti 9a (administratívne budovy) a 9b (školy) z Prílohy č. 2 výzvy akt. 1 |
| Dátumy, kolá, znenia výzvy | harmonogram kôl výzvy (kolo 1: 23. 2. 2024, kolo 2: 1. 3. 2024, potom každý piatok), § 14 a § 16 zákona č. 121/2022 Z. z. |
| Konanie (doplnenie, zastavenie) | MD č. 21 Konanie o ŽoNFP v1.0 (MIRRI, máj 2026): chýbajúca príloha → výzva na doplnenie (najmenej 5 pracovných dní), včasnosť podľa odoslania do e-schránky |

Zdroje sú v `data/zdroje/` (výzva a jej prílohy, MU č. 9 k príprave výzvy, MD č. 21, všeobecná informácia CKO).

## Ako nahrávať

1. Spustite aplikáciu (`npm start`, http://127.0.0.1:5177) a otvorte **Podateľňa**.
2. Vyberte výzvu PSK-SIEA-002-2023-DV-EFRR, pridajte ZIP prípadu (napr. `01-komplet-zmena3.zip`) a kliknite **Prijať podanie**. Podateľňa ZIP rozbalí do jedného spisu.
3. V spise vypnite **Čítať prílohy lokálnym modelom** (očakávania platia pre posudok bez modelu) a kliknite **Posúdiť žiadosť**.
4. Porovnajte návrh a nálezy s tabuľkou nižšie. Body VER-ITMS a VER-KONTROLA (kontrola zmien výzvy v ITMS21+) závisia od toho, kedy sa naposledy spustilo `npm run zmeny`, preto nie sú v očakávaniach.
5. Prípady s doplnením (02, 07): po prvom posudku nahrajte `NN-doplnenie.zip` cez **Nahrať doplnenie** a posúďte znova.
6. Prípad 14: pri každej prílohe označenej „odhad“ kliknite **Potvrdiť** a posúďte znova.

Celú sadu overí aj automatický test (vlastný server, databáza v pamäti): `npm run test:sada`. Sadu znova vytvorí `npm run demo:sada` (Windows, MS Excel, Edge alebo Chrome).

## Prípady a očakávané výsledky (bez modelu)

Návrh „na preverenie“ pri úplnej žiadosti je správny: softvér niektoré podmienky výzvy nekontroluje celé (poistka úplnosti) a registre overuje človek, preto nikdy nenavrhne „bez zistení“.

| # | Scenár | Predložená | Kraj (kategória) | Znenie výzvy | Návrh | Určujúce nálezy |
|---|---|---|---|---|---|---|
| 01 | Úplná žiadosť (znenie zmeny č. 3) | 15. 10. 2025 | Bratislavský kraj (VRR) | zmena č. 3 | **na preverenie** | – |
| 02 | Chýba Príloha č. 8, doplní sa | 5. 11. 2025 | Bratislavský kraj (VRR) | zmena č. 3 | **výzva na doplnenie** | P08 chyba podklad, P08b chyba podklad |
| 03 | Formulár inej výzvy | 24. 9. 2025 | Bratislavský kraj (VRR) | zmena č. 3 | **nesplnené podmienky** | V01 nesplnene |
| 04 | Menej rozvinutý región po uzavretí pre MRR | 12. 3. 2025 | Trnavský kraj (MRR) | zmena č. 2 | **nesplnené podmienky** | F01 nesplnene, VER-SCHVALENIE |
| 05 | Predložená po uzavretí výzvy | 21. 1. 2026 | Bratislavský kraj (VRR) | zmena č. 3 | **nesplnené podmienky** | F01 nesplnene |
| 06 | Hlavná aktivita z iného opatrenia | 1. 10. 2025 | Bratislavský kraj (VRR) | zmena č. 3 | **nesplnené podmienky** | D07a nesplnene, P08b na preverenie |
| 07 | Znenie zmeny č. 2 bez Prílohy č. 9, doplní sa | 19. 6. 2024 | Nitriansky kraj (MRR) | zmena č. 2 | **výzva na doplnenie** | P09 chyba podklad, VER-SCHVALENIE |
| 08 | Predložená v deň uzavretia kola na hranici znení | 15. 8. 2025 | Bratislavský kraj (VRR) | zmena č. 2 | **na preverenie** | VER-KOLO, VER-SCHVALENIE |
| 09 | Predložená tesne pred účinnosťou zmeny č. 3 | 19. 8. 2025 | Bratislavský kraj (VRR) | zmena č. 3 | **na preverenie** | VER-ZMENA |
| 10 | Žiadaný NFP pod minimom | 12. 11. 2025 | Bratislavský kraj (VRR) | zmena č. 3 | **nesplnené podmienky** | D12 nesplnene |
| 11 | Úspora primárnej energie pod 30 % | 22. 10. 2025 | Bratislavský kraj (VRR) | zmena č. 3 | **nesplnené podmienky** | D07b nesplnene, D13 nesplnene |
| 12 | Prekročená hodnota za peniaze | 3. 12. 2025 | Bratislavský kraj (VRR) | zmena č. 3 | **nesplnené podmienky** | D07c nesplnene |
| 13 | Neoprávnený žiadateľ (s.r.o.) | 19. 11. 2025 | Bratislavský kraj (VRR) | zmena č. 3 | **nesplnené podmienky** | D01 nesplnene |
| 14 | Súbory bez čísla prílohy v názve | 10. 12. 2025 | Bratislavský kraj (VRR) | zmena č. 3 | **na preverenie** | P03 na preverenie, P06 na preverenie, P07 na preverenie, P08 na preverenie, P08b na preverenie |
| 15 | Formulár bez dátumu predloženia | chýba | Bratislavský kraj (VRR) | zmena č. 3 | **na preverenie** | F01 na preverenie, D14 na preverenie, VER-KOLO |

Po doplnení alebo potvrdení zaradenia:

| # | Krok | Návrh | Určujúce nálezy |
|---|---|---|---|
| 02 | nahrať `02-doplnenie.zip` | **na preverenie** | – |
| 07 | nahrať `07-doplnenie.zip` | **na preverenie** | VER-SCHVALENIE |
| 14 | potvrdiť zaradenie príloh | **na preverenie** | – |

## Podrobnosti prípadov

### 01 · Úplná žiadosť (znenie zmeny č. 3)

Obec, Bratislavský kraj (VRR), predložená 15. 10. 2025 (kolo 87). Všetky povinné prílohy vrátane plnomocenstva podľa vzoru 1a, zošit Prílohy č. 8 súhlasí s formulárom.

**Prečo:** Referenčný „dobrý“ prípad: žiadne nesplnené pravidlo ani chýbajúca príloha. Návrh je aj tak na preverenie, lebo časť podmienok výzvy softvér nekontroluje (poistka úplnosti) a register overuje človek.

Súbory v `01-komplet-zmena3.zip`: `Formular_ZoNFP_NFP401201TS01.json`, `Priloha_1a_Plnomocenstvo.pdf`, `Priloha_3_Uznesenie_Testovany.pdf`, `Priloha_6_Energeticky_certifikat.pdf`, `Priloha_7_Projektova_dokumentacia.pdf`, `Priloha_8_Dokumentacia_k_OV.xlsm`. Žiadaný NFP 783 405,45 EUR, úspora primárnej energie 58,7 %.

### 02 · Chýba Príloha č. 8, doplní sa

Obec, VRR, predložená 5. 11. 2025. Záväzný zošit Prílohy č. 8 v podaní chýba, žiadateľ ho doloží až po výzve na doplnenie (02-doplnenie.zip).

**Prečo:** MD č. 21: chýbajúca príloha je dôvod na výzvu na doplnenie (lehota najmenej 5 pracovných dní), nie na neschválenie. Po doplnení sa P08 a P08b musia zmeniť na splnené.

Súbory v `02-chyba-priloha-8.zip`: `Formular_ZoNFP_NFP401201TS02.json`, `Priloha_3_Uznesenie_Horne_Skusovce.pdf`, `Priloha_6_Energeticky_certifikat.pdf`, `Priloha_7_Projektova_dokumentacia.pdf`. Doplnenie `02-doplnenie.zip`: `Priloha_8_Dokumentacia_k_OV.xlsm`. Žiadaný NFP 523 918,50 EUR, úspora primárnej energie 64,3 %.

### 03 · Formulár inej výzvy

Mesto, VRR, predložená 24. 9. 2025. Formulár uvádza kód výzvy PSK-SIEA-008-2025-DV-EFRR (iná výzva SIEA), prílohy sú úplné.

**Prečo:** Pravidlá jednej výzvy sa nesmú použiť na formulár inej výzvy: V01 je nesplnené a ostatné výsledky posudku neplatia.

Súbory v `03-ina-vyzva.zip`: `Formular_ZoNFP_NFP401201TS03.json`, `Priloha_3_Uznesenie_Vzorkovo.pdf`, `Priloha_6_Energeticky_certifikat.pdf`, `Priloha_7_Projektova_dokumentacia.pdf`, `Priloha_8_Dokumentacia_k_OV.xlsm`. Žiadaný NFP 901 068,18 EUR, úspora primárnej energie 58,3 %.

### 04 · Menej rozvinutý región po uzavretí pre MRR

Obec v Trnavskom kraji (MRR), predložená 12. 3. 2025 (kolo 56, znenie zmeny č. 2). Pre MRR bola výzva uzavretá 9. 1. 2025. Prílohy vrátane Prílohy č. 9 (kontrolný zoznam 9a) sú úplné.

**Prečo:** Včasnosť podľa kategórie regiónu (§ 16 ods. 4 zákona č. 121/2022 Z. z.): po uzavretí pre MRR sa žiadosť z MRR nedá predložiť, F01 je nesplnené.

Súbory v `04-mrr-po-uzavreti.zip`: `Formular_ZoNFP_NFP401201TS04.json`, `Priloha_3_Uznesenie_Dolne_Overovce.pdf`, `Priloha_6_Energeticky_certifikat.pdf`, `Priloha_7_Projektova_dokumentacia.pdf`, `Priloha_8_Dokumentacia_k_OV.xlsm`, `Priloha_9_Horizontalne_principy_kontrolny_zoznam.pdf`. Žiadaný NFP 523 918,50 EUR, úspora primárnej energie 64,4 %.

### 05 · Predložená po uzavretí výzvy

Obec, VRR, predložená 21. 1. 2026, teda po uzavretí výzvy 9. 1. 2026. Prílohy sú úplné.

**Prečo:** Po uzavretí výzvy nie je možné predkladať žiadosti (§ 16 ods. 4 zákona č. 121/2022 Z. z.): F01 je nesplnené.

Súbory v `05-po-uzavreti-vyzvy.zip`: `Formular_ZoNFP_NFP401201TS05.json`, `Priloha_3_Uznesenie_Nova_Vzorka.pdf`, `Priloha_6_Energeticky_certifikat.pdf`, `Priloha_7_Projektova_dokumentacia.pdf`, `Priloha_8_Dokumentacia_k_OV.xlsm`. Žiadaný NFP 666 046,55 EUR, úspora primárnej energie 59,1 %.

### 06 · Hlavná aktivita z iného opatrenia

Obec, VRR, predložená 1. 10. 2025. Okrem obnovy budovy formulár obsahuje hlavnú aktivitu „Modernizácia verejného osvetlenia“ v opatrení 2.1.1, ktoré výzva nepodporuje (len 2.1.2 a 2.2.2).

**Prečo:** Oprávnené sú len aktivity opatrení výzvy: D07a je nesplnené. Zošit Prílohy č. 8 túto aktivitu nepozná, preto P08b upozorní na výdavky mimo opatrení.

Súbory v `06-aktivita-mimo-opatreni.zip`: `Formular_ZoNFP_NFP401201TS06.json`, `Priloha_3_Uznesenie_Kontrolany.pdf`, `Priloha_6_Energeticky_certifikat.pdf`, `Priloha_7_Projektova_dokumentacia.pdf`, `Priloha_8_Dokumentacia_k_OV.xlsm`. Žiadaný NFP 608 918,50 EUR, úspora primárnej energie 64,6 %.

### 07 · Znenie zmeny č. 2 bez Prílohy č. 9, doplní sa

Obec v Nitrianskom kraji (MRR), predložená 19. 6. 2024 (kolo 18, znenie zmeny č. 2). Príloha č. 9 (kontrolný zoznam horizontálnych princípov 9b pre školy) v podaní chýba, žiadateľ ju doloží v 07-doplnenie.zip.

**Prečo:** Znenie výzvy sa vyberá podľa kola (§ 14 ods. 4 zákona č. 121/2022 Z. z.). V znení zmeny č. 2 sa pri opatrení 2.1.2 vyžaduje Príloha č. 9, v znení zmeny č. 3 už nie. Pravidlá tohto znenia čakajú na schválenie človekom (VER-SCHVALENIE).

Súbory v `07-akt2-bez-prilohy-9.zip`: `Formular_ZoNFP_NFP401201TS07.json`, `Priloha_3_Uznesenie_Male_Priklady.pdf`, `Priloha_6_Energeticky_certifikat.pdf`, `Priloha_7_Projektova_dokumentacia.pdf`, `Priloha_8_Dokumentacia_k_OV.xlsm`. Doplnenie `07-doplnenie.zip`: `Priloha_9_Horizontalne_principy_kontrolny_zoznam.pdf`. Žiadaný NFP 744 387,07 EUR, úspora primárnej energie 58,3 %.

### 08 · Predložená v deň uzavretia kola na hranici znení

Obec, VRR, predložená v piatok 15. 8. 2025, v deň uzavretia kola 78. Kolo 78 patrí pod znenie zmeny č. 2, kolo 79 už pod zmenu č. 3. Prílohy vrátane Prílohy č. 9 (9a) sú úplné.

**Prečo:** Ak žiadosť prišla po termíne uzavretia kola, patrí do ďalšieho kola s iným znením výzvy. Rozhoduje čas predloženia, ktorý formulár nemá: VER-KOLO pre kontrolóra.

Súbory v `08-den-uzavretia-kola.zip`: `Formular_ZoNFP_NFP401201TS08.json`, `Priloha_3_Uznesenie_Hranicne_Testovce.pdf`, `Priloha_6_Energeticky_certifikat.pdf`, `Priloha_7_Projektova_dokumentacia.pdf`, `Priloha_8_Dokumentacia_k_OV.xlsm`, `Priloha_9_Horizontalne_principy_kontrolny_zoznam.pdf`. Žiadaný NFP 523 918,50 EUR, úspora primárnej energie 64,7 %.

### 09 · Predložená tesne pred účinnosťou zmeny č. 3

Obec, VRR, predložená 19. 8. 2025 (kolo 79). Zmena č. 3 je účinná od 21. 8. 2025 a vzťahuje sa už na kolo 79. Prílohy podľa znenia zmeny č. 3 sú úplné.

**Prečo:** § 14 ods. 4 a 5 zákona č. 121/2022 Z. z.: zmena platí aj pre prebiehajúce kolo, žiadateľ však musí dostať možnosť zosúladiť žiadosť (najmenej 10 pracovných dní). VER-ZMENA pre kontrolóra.

Súbory v `09-zmena-vyzvy-pocas-kola.zip`: `Formular_ZoNFP_NFP401201TS09.json`, `Priloha_3_Uznesenie_Prechodne_Vzorovce.pdf`, `Priloha_6_Energeticky_certifikat.pdf`, `Priloha_7_Projektova_dokumentacia.pdf`, `Priloha_8_Dokumentacia_k_OV.xlsm`. Žiadaný NFP 783 405,45 EUR, úspora primárnej energie 58,8 %.

### 10 · Žiadaný NFP pod minimom

Obec, VRR, predložená 12. 11. 2025. Malá obnova materskej školy (zateplenie a okná), žiadaný NFP okolo 100 000 EUR.

**Prečo:** Výzva pripúšťa NFP od 200 000 do 5 000 000 EUR: D12 je nesplnené. Zošit Prílohy č. 8 to hlási tiež (A17), preto P08b ide na preverenie.

Súbory v `10-nizky-nfp.zip`: `Formular_ZoNFP_NFP401201TS10.json`, `Priloha_3_Uznesenie_Mala_Skuska.pdf`, `Priloha_6_Energeticky_certifikat.pdf`, `Priloha_7_Projektova_dokumentacia.pdf`, `Priloha_8_Dokumentacia_k_OV.xlsm`. Žiadaný NFP 96 574,68 EUR, úspora primárnej energie 58 %.

### 11 · Úspora primárnej energie pod 30 %

Obec, VRR, predložená 22. 10. 2025. Len výmena okien a rekonštrukcia vykurovania, úspora primárnej energie 22 %.

**Prečo:** PPP č. 7: úspora primárnej energie musí byť aspoň 30 %. D07b je nesplnené; zošit Prílohy č. 8 pri takej úspore nepočíta oprávnené výdavky.

Súbory v `11-nizka-uspora.zip`: `Formular_ZoNFP_NFP401201TS11.json`, `Priloha_3_Uznesenie_Overovany.pdf`, `Priloha_6_Energeticky_certifikat.pdf`, `Priloha_7_Projektova_dokumentacia.pdf`, `Priloha_8_Dokumentacia_k_OV.xlsm`. Žiadaný NFP 260 514,00 EUR, úspora primárnej energie 22 %.

### 12 · Prekročená hodnota za peniaze

Obec, VRR, predložená 3. 12. 2025. Drahá obnova malej školy: úspora 35 % (asi 56 MWh/rok) pri výdavkoch takmer 600 000 EUR.

**Prečo:** Hodnota za peniaze pri opatrení 2.1.2 je najviac 5 500 EUR na MWh ročnej úspory; tu vychádza asi 10 000 EUR/MWh, nad limitom aj po odrátaní DPH. D07c je nesplnené, zošit hlási D17.

Súbory v `12-hodnota-za-peniaze.zip`: `Formular_ZoNFP_NFP401201TS12.json`, `Priloha_3_Uznesenie_Nakladne_Testovce.pdf`, `Priloha_6_Energeticky_certifikat.pdf`, `Priloha_7_Projektova_dokumentacia.pdf`, `Priloha_8_Dokumentacia_k_OV.xlsm`. Žiadaný NFP 692 121,00 EUR, úspora primárnej energie 34,8 %.

### 13 · Neoprávnený žiadateľ (s.r.o.)

Obchodná spoločnosť (právna forma 112), VRR, predložená 19. 11. 2025. Obnova jej administratívnej budovy, prílohy sú úplné okrem Prílohy č. 3, ktorá sa pri s.r.o. nevyžaduje.

**Prečo:** Výzva je určená verejným subjektom (obce, VÚC, rozpočtové a príspevkové organizácie a ďalšie formy z PPP č. 1). Spoločnosť s ručením obmedzeným medzi nimi nie je: D01 je nesplnené.

Súbory v `13-neopravneny-ziadatel.zip`: `Formular_ZoNFP_NFP401201TS13.json`, `Priloha_6_Energeticky_certifikat.pdf`, `Priloha_7_Projektova_dokumentacia.pdf`, `Priloha_8_Dokumentacia_k_OV.xlsm`. Žiadaný NFP 523 918,50 EUR, úspora primárnej energie 64,3 %.

### 14 · Súbory bez čísla prílohy v názve

Obec, VRR, predložená 10. 12. 2025. Prílohy sú úplné, ale súbory sa volajú napr. „Uznesenie_obecneho_zastupitelstva.pdf“ alebo „Rozpocet_projektu.xlsm“, bez čísla prílohy.

**Prečo:** Podateľňa zaradí súbor bez čísla prílohy len odhadom podľa kľúčových slov. Odhad sa nesmie počítať ako splnená príloha (riziko falošného OK): kontrolór musí zaradenie potvrdiť tlačidlom „Potvrdiť“. Po potvrdení sú prílohy splnené.

Súbory v `14-prilohy-bez-cisla.zip`: `Formular_ZoNFP_NFP401201TS14.json`, `Uznesenie_obecneho_zastupitelstva.pdf`, `Energeticky_certifikat_budovy.pdf`, `Technicka_sprava_a_vykresy.pdf`, `Rozpocet_projektu.xlsm`. Žiadaný NFP 523 918,50 EUR, úspora primárnej energie 64,5 %.

### 15 · Formulár bez dátumu predloženia

Obec, VRR. Formulár neobsahuje dátum predloženia, prílohy sú úplné podľa znenia zmeny č. 3.

**Prečo:** Bez dátumu sa nedá určiť kolo ani znenie výzvy a nedá sa overiť včasnosť. Softvér nesmie dosadiť dátum nahratia do podateľne (pri neskorom nahratí by vybral novšie znenie, napr. bez povinnej Prílohy č. 9): F01 a D14 idú na preverenie, VER-KOLO pre kontrolóra. Rozhodujúci je dátum odoslania do e-schránky poskytovateľa (MD č. 21).

Súbory v `15-bez-datumu-predlozenia.zip`: `Formular_ZoNFP_NFP401201TS15.json`, `Priloha_3_Uznesenie_Bezdatovce.pdf`, `Priloha_6_Energeticky_certifikat.pdf`, `Priloha_7_Projektova_dokumentacia.pdf`, `Priloha_8_Dokumentacia_k_OV.xlsm`. Žiadaný NFP 705 064,91 EUR, úspora primárnej energie 58,6 %.

## Čo sada neoveruje

- Posudok s lokálnym modelom (L01, L05, L07): závisí od modelu, očakávania platia pre posudok bez neho.
- Registre (G02 až G15): softvér ich z podkladov neoverí, vždy idú človeku.
- Hranice energetických tried v certifikátoch sú orientačné (nie sú overené voči vyhláške), na pravidlá softvéru nemajú vplyv.
