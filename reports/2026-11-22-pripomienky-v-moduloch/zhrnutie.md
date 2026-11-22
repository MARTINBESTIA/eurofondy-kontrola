# Pripomienky k ŽoNFP premietnuté do ostatných modulov

Stav kódu `e715556` z 22. 11. 2026. Je to analýza, kód sa nemenil. Čo sa bude implementovať, určí používateľ.

Skratky: ŽoP = žiadosť o platbu, OoZ = oznámenie o zmene, ŽoZZ = žiadosť o zmenu zmluvy, MU = merateľný ukazovateľ, PHZ = predpokladaná hodnota zákazky, ZMR = zákazka malého rozsahu, ZNH = zákazka s nízkou hodnotou, VZP = všeobecné zmluvné podmienky, FK = finančná kontrola.

## Postup

- Z prepisov rozhovorov som vybral pripomienky z 13. až 21. 11. 2026 a commity, ktoré z nich vznikli v module ŽoNFP.
- Prečítal som kód piatich ďalších modulov (`src/moduly/vo`, `zop`, `zmeny`, `ukazovatele`, `vyzvy`), ich balíky v `packs/` a spoločné jadro (`src/core/posud.ts`, `src/server/server.ts`).
- Štyri podozrivé cesty (N2, N4, N6, N17) som overil spustením kontrol modulov bez modelu (skript mimo repozitára, nič sa neuložilo). N1 som overil z kódu a výpočtom lehoty cez `src/podatelna/lehoty.ts`. Výskyt v dátach som spočítal zo snímok v `data/odvodene`, stiahnutých 13. až 21. 11. 2026.
- Lehoty a postupy som overil v textoch vzoru zmluvy o NFP 2.2, VZP 2.2 a Príručky pre prijímateľa DOP 3.2 v `data/zdroje`.

Veľkosť kódu ukazuje, kam išla práca. Modul ŽoNFP má asi 990 riadkov kódu a balík s 959 riadkami, k tomu archívnu verziu balíka s 889 riadkami a podateľňu. VO má 166 riadkov kódu a 170 riadkov balíka, ŽoP 266 a 264, zmeny 226 a 162, ukazovatele 231 a 38, výzvy 126 a 30.

## Pripomienky a čo z nich vzniklo pri ŽoNFP

| | Pripomienka | Čo vzniklo pri ŽoNFP | Princíp pre všetky moduly |
|---|---|---|---|
| P1 | 13. 11.: „horšie je, keď označí zlý dokument za dobrý“ | výrok „bez zistení“ len pri úplnom overení, poistky nad modelom, testy so zasadenými chybami | chýbajúci alebo neznámy údaj nesmie dať „splnené“ ani „neuplatňuje sa“ |
| P2 | 19. 11.: kontrolór nahrá podklady cez GUI, výsledky sa ukladajú, žiadosti sú podľa výziev s úspešnosťou | podateľňa so spismi (`7dd0c72`) | kontrola prebieha v spise s podkladmi, rozhodnutím a históriou |
| P3 | 19. 11.: presné šablóny dokumentov, nahrávanie do ITMS21+, vymyslené mená | demo na oficiálnych vzoroch (`dbec0cc`, `db9c3b6`), `demo/itms/VERNOST.md` (`02ace63`) | skúšať na oficiálnych vzoroch a popísať, nakoľko sa podobajú skutočnosti |
| P4 | 20. 11.: každý splnený bod má odkazovať na dokument a citovať riadky | doklady k nálezom (`c8d6cfd`), `npm run test:doklady`; splnený bod bez dokladu ide človeku | každý výsledok „splnené“ ukáže súbor a miesto, z ktorého vychádza |
| P5 | 20. 11.: pravidlá pre všetky typy, úplný zoznam typov, mechanizmus aktualizácie pravidiel | inventár podmienok (`e85479d`), verzie balíka podľa kola (`aa834da`), kontrola zmien výzvy v ITMS21+ (`28e4ee6`) | úplnosť voči všetkým podmienkam, pravidlá podľa rozhodného dňa, kontrola čerstvosti dát |
| P6 | 20. 11.: testovacia sada z oficiálnych vzorov | `demo/testovacia-sada` (`3ab90fe`) a opravy, ktoré sada našla (`67eb649`, `cc66298`, `b37ed7b`) | nové podania na skúšku pre každý proces |
| P7 | 21. 11.: úplne nová žiadosť na vlastnú skúšku | `demo/nova-ziadost` (`38d52ca`) | cvičný prípad, riešenie uložené oddelene |
| P8 | 21. 11.: prepínač pre podpisy, dôvody zamietnutí, čo robí kontrolór a či to vie softvér | `formalna` pri podpisoch L01 (`6896911`), postup podľa MD č. 21 | formálne náležitosti oddelené od obsahu, postup podľa oficiálnej metodiky |
| P9 | 21. 11.: návrh výzvy na doplnenie a sledovanie lehoty | `6fccc81`, `e715556` | výzva na doplnenie a lehota v pracovných dňoch s kalendárom sviatkov |

Patria sem aj nálezy z auditu astry (`39b7aa0`) a z testovacej sady:
- príloha sa uznala len podľa obsadeného miesta;
- neznáma kategória sa brala ako platná;
- rozporné zdroje sa neposlali človeku;
- chýbala kontrola veku dát;
- dátum nahratia nahradzoval dátum predloženia.

## Mapa po moduloch

| Princíp | VO | ŽoP | Zmeny | Ukazovatele | Výzvy |
|---|---|---|---|---|---|
| Chýbajúci údaj nedá „splnené“ (P1) | porušené (N2, N19) | porušené (N6, N17 až N19) | čiastočne (N4) | v poriadku, okrem N15 a N20 | porušené (N7, N21) |
| Doklad pri „splnené“ (P4) | chýba (N9) | chýba (N9) | chýba (N9) | chýba (N9) | chýba (N9) |
| Inventár podmienok (P5) | chýba (N8) | chýba (N8) | chýba (N8) | chýba (N8) | netreba, ide o plánovanie |
| Pravidlá podľa rozhodného dňa (P5) | zlý rozhodný dátum (N3) | jedno znenie (N10) | jedno znenie (N10) | jedno znenie (N10) | netýka sa |
| Čerstvosť dát (P5) | chýba (N11) | chýba (N11) | netýka sa | chýba | chýba (N7) |
| Úplný zoznam typov (P5) | overené 2 skupiny postupov (N2) | stavebné práce podľa slov (N15) | typy zmien z VZP, zhoda podľa slov (N4) | klesajúce MU pevným zoznamom (N15) | netýka sa |
| Obsah prílohy, nielen obsadené miesto | záznam VO áno | len miesto (N5) | len miesto (N5) | netýka sa | netýka sa |
| Súlad dokumentu s údajmi, obdoba P08b | chýba (N13) | chýba (N13) | chýba | chýba (N13) | netýka sa |
| Podpisy oddelené od obsahu (P8) | spojené s obsahom (N12) | nie sú v balíku (N12) | nie sú v balíku (N12) | nie sú v balíku | netýka sa |
| Výzva na doplnenie a lehota (P9) | chýba (N14) | chýba (N14) | chýba a dni sa počítajú zle (N1, N14) | počet správ, nie včasnosť (N14) | netýka sa |
| Sada z oficiálnych vzorov (P3, P6, P7) | chýba (N16) | chýba (N16) | chýba (N16) | chýba (N16) | netýka sa |

## A. Falošné „splnené“ alebo „neuplatňuje sa“ už dnes

### N1. Zmeny Z05 počíta 30 kalendárnych dní, zmluva určuje 30 pracovných
- **Kde:** `src/moduly/zmeny/modul.ts:118` (`pridajDni(v.datumZop, -30)`).
- **Dôkaz:**
  - Vzor zmluvy o NFP 2.2, čl. 1 ods. 1.3 písm. h): „za dni sa považujú Pracovné dni. Počítanie lehôt sa riadi podľa § 122 Občianskeho zákonníka“ (`data/zdroje/PSK-SIEA-002-2023/txt/Vzor_Zmluva_o_poskytnutí_NFP_verzia_2.2.txt:70`).
  - VZP 2.2 definuje „Deň – Pracovný deň, ak … nie je výslovne uvedené, že ide o kalendárny deň“ (riadok 35 textu VZP). Kalendárne dni VZP píše výslovne, napríklad „do 30 kalendárnych dní“ pri následnej monitorovacej správe (riadok 189).
  - Ex post zmena: „najneskôr 30 dní pred predložením Žiadosti o platbu“ (riadok 517).
- **Príklad** (výpočet s `src/podatelna/lehoty.ts`): pri ŽoP 15. 12. 2026 modul pustí ŽoZZ do 15. 11. 2026, zmluva však vyžaduje približne 3. 11. 2026. ŽoZZ podaná od 4. do 15. 11. dostane „splnené“.
- **Súvisí s:** P9.
- **Návrh:** počítať pracovné dni cez `lehoty.ts`, ktorý presunieme medzi spoločné pomôcky. Test 08 zasadzuje len podanie 11 dní pred ŽoP (`scripts/08-test-moduly.ts:143`), treba pridať hraničný prípad.

### N2. VO V01: 494 zo 659 obstarávaní výzvy dostane „neuplatňuje sa“, hoci limit postupu nie je overený
- **Kde:** `src/moduly/vo/modul.ts:36`. Stav „neuplatňuje sa“ nebráni výroku „bez zistení“ (`src/core/posud.ts:316`).
- **Dôkaz:**
  - Spustená kontrola: ZNH podľa § 117 vráti `neuplatnuje_sa`.
  - Postupy v dátach z 15. 11.: ZNH podľa § 117 (111), podlimitná zákazka podľa ZVO (84), podlimitná so zverejnením podľa § 110 (80), ZMR podľa § 1 ods. 15 od 31. 3. 2022 (63), výnimka (43), verejná súťaž (26), ZNH väčšieho rozsahu (12), iná zákazka (10) a ďalšie.
- **Súvisí s:** P1 a P5. Pri ŽoNFP ide nepokrytá časť podmienky kontrolórovi (`nalezyInventara`).
- **Návrh:** stav „mimo podkladov“ alebo „na preverenie“ s vetou, že limit softvér neoveruje. Potom doplniť limity ďalších postupov z príručky VO.

### N3. VO berie za rozhodný dátum vytvorenie záznamu v ITMS21+
- **Kde:** `src/moduly/vo/modul.ts:25` (`v.vytvorene >= '2024-08-01'`).
- **Dôkaz:** 23 obstarávaní vytvorených v ITMS21+ od 1. 8. 2024 má zmluvu účinnú pred 1. 8. 2024. Napríklad VO06388883 je vytvorené 13. 2. 2025 a zmluva je zo 17. 8. 2023. Osem z nich V01 posúdi podľa limitov príručky VO v2 ako overené.
- **Súvisí s:** rovnaký typ chyby ako dátum nahratia namiesto dátumu predloženia (`67eb649`), ďalej P5.
- **Návrh:** rozhodný deň vziať z dokumentácie VO (vyhlásenie, oslovenie, zmluva). Ak chýba alebo nesedí so zmluvou, bod ide kontrolórovi.

### N4. Zmeny: zatriedenie podľa kľúčových slov dá „splnené“ aj pri čiastočnej zhode
- **Kde:** `src/moduly/zmeny/modul.ts:50-55` (zatriedenie), `:76` (Z01), `:84` (Z02).
- **Dôkaz:** text „Zmena e-mailovej adresy štatutára a zníženie rozsahu zateplenia na polovicu plochy.“ dostane zatriedenie formálna zmena (typy štatutár a kontakty). Pri predložení ako OoZ spustená kontrola vráti Z01 „splnené“ a Z02 „splnené“, teda bez znakov podstatnej zmeny. Zníženie rozsahu sa nerozpoznalo.
- **Súvisí s:** P1 a P5. Pri ŽoNFP zaradenie odhadnuté podľa slov nestačí na „splnené“ (`src/core/typy.ts:19-21`) a kontrolór zaradenie príloh potvrdzuje.
- **Návrh:** zatriedenie brať ako návrh. „Splnené“ až keď typy potvrdí kontrolór, inak „na preverenie“. Vzory doplniť napríklad o zníženie rozsahu.

### N5. ŽoP a zmeny uznajú povinnú prílohu, keď je jej miesto obsadené
- **Kde:** `src/moduly/zop/modul.ts:200-202` (P10), `src/moduly/zmeny/modul.ts:162-164` (Z07: „splnené … (obsah neoverený)“).
- **Dôkaz:** podmienka je len `!v.prilohy[p.cislo]?.text?.trim()`. Prázdna šablóna súpisu prác alebo iný dokument na tom mieste stačí na „splnené“.
- **Súvisí s:** nález astry pri ŽoNFP, kde prílohy P03, P05 až P07 a P09 dostali obsahové znaky z balíka (`39b7aa0`).
- **Návrh:** obsahové znaky každej prílohy v balíku, napríklad pri súpise prác názov dokumentu, položky, množstvá a ceny. Bez nich stav „na preverenie“.

### N6. ŽoP P09: jeden údaj o hotovosti stačí na „splnené“ pre všetky tri limity
- **Kde:** `src/moduly/zop/modul.ts:166-173`.
- **Dôkaz:** pri zadanej len najvyššej platbe 100 EUR spustená kontrola vráti „splnené: Hotovostné platby sú v limitoch (jednotlivo do 500 EUR, mesačne do 1 500 EUR, nie za dlhodobý majetok)“. Mesačná suma ani dlhodobý majetok zadané neboli.
- **Súvisí s:** P1.
- **Návrh:** „splnené“ len pri všetkých troch údajoch, inak „mimo podkladov“ s menom chýbajúceho údaja.

### N7. Výzvy: stav a verzia výzvy zo 7 dní starých dát bez upozornenia, posun plánu z dvoch snímok
- **Kde:**
  - `src/moduly/vyzvy/modul.ts:12` načíta `data/odvodene/vyzvy.json`, stiahnuté 15. 11. 2026 o 13:57 UTC;
  - `:63-69` je pravidlo C04;
  - `:79` je C05, ktoré vráti „splnené“ aj pri menej ako dvoch snímkach.
- **Dôkaz:** C04 povie, že žiadateľ čítal dokumentáciu po poslednej zmene, ale vychádza zo snímky, takže zmenu výzvy po 15. 11. nevidí. Snímky plánovaných výziev sú len dve, zo 14. a 15. 11.
- **Súvisí s:** P5. Pri ŽoNFP dáva neaktuálna kontrola zmien bod VER-KONTROLA (`src/core/posud.ts:87-88`).
- **Návrh:** uviesť vek dát v náleze a pri veku nad 7 dní stav „na preverenie“. C05 pri menej ako dvoch snímkach „mimo podkladov“.

## B. Medzery voči pripomienkam, ktoré jadro rieši len pre ŽoNFP

### N8. Inventár podmienok je len pri ŽoNFP
- **Kde:** `src/moduly/zonfp/modul.ts:50`; `src/core/posud.ts:289-294`.
- **Dôsledok:** VO, ŽoP, zmeny a ukazovatele môžu skončiť výrokom „bez zistení“, hoci kontrolujú len časť podmienok.
- **Nepokryté podmienky, príklady:**
  - ŽoP: súlad výdavku s rozpočtom projektu a jeho položkou, hospodárnosť, súpis prác voči faktúre;
  - VO: oprávnenosť výnimky, nadlimitné postupy, konflikt záujmov len podľa zhody mien štatutárov (V06, aktuálny stav registra, `src/moduly/vo/modul.ts:96`).

### N9. Doklady sú len v podateľni
- **Kde:** pravidlo, že splnený bod bez dokladu ide človeku, je v `src/podatelna/doklady.ts:31-36`. Moduly volajú `posudPodlaKola` bez dokladov (`src/server/server.ts:247`).
- **Dôsledok:** v moduloch „splnené“ neukazuje súbor ani pole, z ktorého vychádza.
- **Súvisí s:** P4.

### N10. Jedno znenie pravidiel pre všetky projekty
- **Balíky:** ŽoP, zmeny aj ukazovatele uvádzajú VZP verziu 2.2, Príručku pre prijímateľa DOP verziu 3.2 z 1. 6. 2026 a platnosť od 1. 6. 2026 (`packs/PSK-SIEA-002-2023-DV-EFRR/zop.json:7-8`, `zmeny.json:7-8`, `ukazovatele.json:7-8`). VZP je súčasťou zmluvy každého projektu a staršie zmluvy môžu mať inú verziu [otázka: koľko verzií VZP SIEA použila].
- **Kód:** sadzby DPH nemajú dátum (`src/moduly/zop/modul.ts:113`). Limity VO sú priamo v kóde (`src/moduly/vo/modul.ts:23-32`), zmena príručky si teda vyžiada zmenu kódu.
- **V poriadku:** lehota 24 mesiacov v Z04 je rovnaká v Zmene č. 2 aj č. 3, v oboch ako PPP č. 14.

### N11. Porovnanie s ostatnými ŽoP a VO len zo snímky
- **Kde:** P03 (`src/moduly/zop/modul.ts:73`) a V05 (`src/moduly/vo/modul.ts:77`).
- **Problém:** porovnávajú len so snímkou z 15. 11. 2026 a len v rámci výzvy. „Splnené“ pri P03 to neuvádza.
- **Dôsledok:** dvojité nárokovanie v ŽoP podanej po snímke alebo v inej výzve nevidno.

### N12. Podpisy
- **Stav:** okrem L01 nie je v balíkoch žiadna formálna náležitosť. Záznam VO má jednu položku „meno, funkcia, dátum a podpis zodpovednej osoby“ (`packs/PSK-SIEA-002-2023-DV-EFRR/vo.json:156-160`).
- **Dôsledok:** pri zapnutom prepínači sa podpisy OoZ, ŽoZZ, ŽoP a monitorovacej správy nekontrolujú vôbec. Pri vypnutom výrok neuvedie, že sa nekontrolovali.

### N13. Súlad dokumentu so štruktúrovanými údajmi, obdoba P08b
- **ŽoP:**
  - P11 kontroluje náležitosti faktúry, ale nie číslo, sumu, dodávateľa a odberateľa voči dokladu v ITMS21+;
  - P12 neviaže bankový výpis na sumu, dátum a účet dodávateľa (`src/moduly/zop/modul.ts:206-221`).
- **VO:** V07 neporovná PHZ a cenu v zázname VO s údajmi z ITMS21+.
- **Ukazovatele:** hodnoty MU sa zadávajú ručne bez monitorovacej správy.

### N14. Postup kontrolóra pri VO, ŽoP, monitorovacích správach a zmenách
- **Oficiálny postup:** Príručka pre prijímateľa DOP 3.2, s. 74 a 75 (`data/zdroje/SIEA-prirucka-DOP-3.2/txt/prirucka.txt:3963-3983`). Pri finančnej kontrole VO/O, ŽoP, ZtM a OoZ/ŽoZ poskytovateľ:
  - vyzve prijímateľa na doplnenie alebo zmenu;
  - preruší lehotu kontroly;
  - určí lehotu na doplnenie najmenej 5 dní od doručenia výzvy, podľa zmluvy pracovných [otázka: príručka to výslovne nehovorí]; deň doručenia určuje čl. 19 VZP.

  Je to obdoba MD č. 21, kap. 2.4 pri ŽoNFP. Moduly nemajú spis, rozhodnutie, návrh výzvy ani lehotu.
- **Lehoty zo zmluvy, ktoré žiadny modul neoveruje:**
  - zúčtovanie predfinancovania do 10 dní (VZP, riadok 319);
  - záverečná monitorovacia správa do 30 dní od ukončenia realizácie aktivít (riadok 188);
  - začatie nového VO do 45 dní od zrušenia predchádzajúceho, od ukončenia zmluvy s dodávateľom alebo od správy z kontroly s oznámením podľa čl. 3 ods. 7 písm. b) VZP (riadok 546);
  - „Bezodkladne“ znamená do 7 pracovných dní (riadok 33).
- **U03:** počíta predložené správy, nie ich včasnosť (`src/moduly/ukazovatele/modul.ts:93-94`).

### N15. Typy odvodené zo slov alebo pevného zoznamu
- **Klesajúce MU** (`src/moduly/ukazovatele/modul.ts:19-20`): pevný zoznam 4 kódov a pravidlo cieľ < východisko. V dátach výzvy je 7 kódov MU a žiadny podozrivý.
- **Stavebné práce:** rozhodujú o povinných prílohách podľa slov v názve výdavku (`src/moduly/zop/modul.ts:31-32` a `:180`). ITMS21+ uvádza len druh výdavku (KAPITALOVY, BEZNY) a typ (Iné, Vlastné náklady, Odpisy a podobne).
- **Postupy VO:** určené podľa textu (N2).

### N16. Testy a demo
- **Stav:** ostatné moduly nemajú sadu nových podaní ani cvičný prípad.
- **Oficiálne vzory** sú v `data/zdroje/SIEA-prirucka-DOP-3.2/`: príloha 2 OoZ, 3 ŽoZZ, 4 formulár monitorovacej správy, 5a a 5b hlásenia o začatí a ukončení realizácie hlavných aktivít, 6 čestné vyhlásenie k sankciám, 9 monitorovacie údaje, 11 vyhlásenie k ZtM-Z, 12 sankčná kalkulačka.
- **Test 08:** zasadzuje chyby, na ktoré pravidlá existujú (`scripts/08-test-moduly.ts`). Cesty N1 až N7 nezasadzuje.

## C. Skryté cesty: v dnešných dátach 0 prípadov, pri nových podaniach by nastali

- **N17. ŽoP P04:** neznámy status platiteľa DPH sa berie ako „nie je platiteľ“ (`src/moduly/zop/modul.ts:98`). Spustená kontrola vráti „splnené: Prijímateľ nie je platiteľ DPH; doklady s DPH vystavili platitelia DPH.“ (`:110`). V dátach je to 0 z 1 362 ŽoP s výdavkami. Obdobou je F01, kde sa neznámy kraj odmieta (`39b7aa0`).
- **N18. ŽoP P07:** VO bez PHZ sa počíta ako 0 a VO, ktoré v dátach nie je, sa vynechá (`src/moduly/zop/modul.ts:142-146`). V dátach je 0 VO bez PHZ a 2 chýbajúce ID VO.
- **N19. Neznáme sumy ako 0 alebo vynechané bez upozornenia:**
  - P03 vynechá doklad bez sumy (`src/moduly/zop/modul.ts:78`);
  - V03 a V04 počítajú neznámu sumu ako 0 (`src/moduly/vo/modul.ts:20` a `:67`);
  - V05 berie neznámu PHZ ako ZMR (`:72`).

  V dátach 0 prípadov.
- **N20. `dnes()` v UTC** (`src/moduly/spolocne.ts:30`): medzi polnocou a 1:00, v lete do 2:00, moduly počítajú so včerajškom. U03 vtedy ešte nepočíta termín, ktorý práve uplynul. `src/podatelna/lehoty.ts` používa časové pásmo Europe/Bratislava.
- **N21. Výzvy:** prázdny dátum predloženia sa nahradí dneškom (`src/moduly/vyzvy/modul.ts:20`). C01 potom potvrdí otvorenú výzvu k dnešku, nie ku dňu, keď chce žiadateľ podať.

## Čo sa už prenieslo cez jadro

- Výrok „bez zistení“ len pri úplnom overení (`src/core/posud.ts:307-316`) platí pre všetky moduly.
- Poistky nad modelom (doslovný úryvok, vzory, zákazy) platia pre všetky pravidlá `llm_text` (`src/core/posud.ts:146-157` a `:229-248`), teda aj pre ŽoP P11, VO V07 a zmeny Z08.
- Prepínač podpisov je aj na stránke modulov (`src/server/server.ts:247`). Chýbajú len položky v balíkoch (N12).
- Odvodené dáta neobsahujú e-maily ani telefóny (`src/moduly/spolocne.ts:23-27`). Mená štatutárov z RPO sa neukladajú (`src/moduly/vo/modul.ts:129`, `src/server/server.ts:179-182`).
- Test 08 počíta „neuplatňuje sa“ pri zasadenej chybe ako falošné OK (`scripts/08-test-moduly.ts:53`).

## Návrh poradia

1. **Rýchle opravy falošných OK:** N1, N2, N6, N7 a N17 až N21. Pri N3, N4 a N5 zatiaľ stav „na preverenie“, kým ich riadne neopravia balíky 3 a 4. Sú to malé zmeny v moduloch a testoch.
2. **Jadro pre všetky moduly:** doklady a pravidlo „splnené bez dokladu ide človeku“ (N9), inventár podmienok pre VO, ŽoP, zmeny a ukazovatele (N8), formálne položky (N12).
3. **Rozhodný deň a čerstvosť dát:** N3, N10, N11.
4. **Obsah a súlad dokumentov:** N4, N5, N13.
5. **Postup kontrolóra pre ŽoP, VO, zmeny a monitorovacie správy:** spis, výzva na doplnenie alebo zmenu, lehoty (N14).
6. **Sady z oficiálnych vzorov SIEA a cvičné prípady:** N16.

Balík 1 odstráni všetky konkrétne falošné OK z častí A a C. Cenou je viac bodov pre kontrolóra. Balík 2 zabráni výroku „bez zistení“ v moduloch, ktoré časť podmienok nekontrolujú. Balík 5 je najväčší, lebo vyžaduje podateľňu aj pre ďalšie procesy.

## Obmedzenia

- Analýza vychádza z čítania kódu a textov. Spustil som len kontroly pri N2, N4, N6 a N17 a výpočet príkladu pri N1. Ostatné nálezy vychádzajú z kódu.
- Počty sú zo snímok z 13. až 21. 11. 2026, nie zo živého ITMS21+.
- Výklad „dni sú pracovné dni“ stojí na čl. 1 ods. 1.3 písm. h) vzoru zmluvy 2.2. Zmluvy jednotlivých projektov môžu mať inú verziu [otázka]. Hraničný deň pri N1 sa môže líšiť o jeden deň podľa toho, či sa deň ŽoP započítava.
