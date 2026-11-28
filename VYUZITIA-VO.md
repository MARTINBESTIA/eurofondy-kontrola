# Využitia softvéru vo verejnom obstarávaní (VO)

Stav k 28. 11. 2026. Tabuľka prechádza proces VO od prípravy zákazky po audit. Pri každom probléme uvádza:

- ako s ním softvér pomáha alebo by mohol pomáhať,
- či je to už spravené,
- kde to je v kóde,
- z akého predpisu problém vyplýva.

Používateľ určil, že softvér má pokryť čo najviac funkcií. Preto tu nie je kategória „nepatrí do produktu“.
Čo zatiaľ chýba, je zapísané ako návrh. Tabuľku vedie Claude. Pri zmene stavu sa riadok aktualizuje v tom istom
commite ako kód, rovnako ako `TODO.md`.

Kto čo robí: VO vykonáva prijímateľ. Poskytovateľ (v pilotnej výzve SIEA ako sprostredkovateľský orgán) robí
vecnú a finančnú kontrolu projektu. Samotnú kontrolu VO vykonáva ÚVO ako sprostredkovateľský orgán (MD 26 r. 316).
Softvér pripravuje podklady pre človeka. Nikdy sám nerozhoduje a nič nikomu neposiela.

## Ako čítať tabuľku

- **Stav**
  - **Hotové**: pravidlo beží v softvéri. Pri dôkaze sú testy so zasadenou chybou, ak existujú.
  - **Čiastočne**: pravidlo beží, ale pokrýva len časť problému. Čo chýba, je v texte riadku.
  - **Nie**: zatiaľ nespravené, riadok je návrh. V zátvorke je hrubý odhad rozsahu (len odhad, neoverený):
    - **S**: nové pravidlo v balíku nad existujúcim jadrom,
    - **M**: nový druh vstupu alebo čítanie dokumentu lokálnym modelom,
    - **L**: nový modul alebo nový zdroj dát.
- **Vstup**
  - `ITMS`: verejné údaje ITMS21+, ktoré softvér už sťahuje (polia `VoPlny` v `src/moduly/vo/modul.ts:7-20`).
  - `dok`: dokument zo spisu VO. Číta ho lokálny model s poistkami ako pri V07.
  - `reg`: verejný register mimo ITMS21+. Zapína sa až so súhlasom používateľa, pravidlá sú v `TODO.md` T1.
  - `ručne`: údaj zadá kontrolór.
- **Priorita používateľa** platí pre každý návrh: horšie je označiť zlý dokument za dobrý. Návrh preto nikdy
  nevráti „splnené“ len preto, že model nič nenašiel. Vtedy vráti „na preverenie“ alebo „mimo podkladov“.
- Údaj označený **[overiť]** zatiaľ nie je overený v zdroji.

| Skratka | Dokument | Súbor v repozitári |
|---|---|---|
| MD 26 | Príručka k procesu a kontrole VO, metodický dokument RO pre Program Slovensko č. 26, v1.0. Na eurofondy.gov.sk zverejnená 30. 7. 2026 s účinnosťou 31. 7. 2026. Jej text v r. 101 uvádza účinnosť 1. 7. 2026 [rozpor, overiť]. | `data/zdroje/MIRRI-MD26-prirucka-VO/txt/MU_RO_PSK_26_Prirucka_k_procesu_a_kontrole_VO_v_1_0.txt` |
| P4 | Príloha č. 4 výzvy PSK-SIEA-002-2023: finančné opravy za porušenie pravidiel VO | `data/zdroje/PSK-SIEA-002-2023/txt/Financne_opravy_VO.txt` |
| CKO VO v2 | Príručka CKO k procesu a kontrole VO v2.0 (1. 8. 2024). Pre Program Slovensko ju nahradila MD 26. Balík pravidiel ju už necituje, V01 z nej berie limit 143 000 EUR pre VO začaté pred 31. 7. 2026 (U67). | `data/zdroje/CKO-prirucka-VO/txt/prirucka_vo.txt` |
| SP | Metodické usmernenie CKO k sledovaným príznakom v1.0 (12. 11. 2026) | `data/zdroje/CKO-MU-sledovane-priznaky/txt/0_usmernenie_SP.txt` |
| KZ | Metodické usmernenie CKO k predchádzaniu a overovaniu konfliktu záujmov v1.0 (18. 5. 2026) | `data/zdroje/CKO-MU-konflikt-zaujmov/txt/MU CKO k predchádzaniu a overovaniu konfliktu záujmov.txt` |
| ZVO | zákon č. 343/2015 Z. z., znenie účinné od 2. 8. 2026. Novela č. 100/2026 Z. z. je účinná od 21. 5. 2026. | slov-lex.sk, čítané 28. 11. 2026 |

## Súhrn

| Stav | Počet |
|---|---|
| Hotové | 7 |
| Čiastočne | 6 |
| Nie (návrh) | 55 |
| Spolu | 68 |

Softvér dnes pokrýva najmä čísla z ITMS21+ (postup, ponuky, cena, faktúry, delenie, ŽoP) a jeden dokument
(záznam zo zadania zákazky). Väčšina návrhov potrebuje čítať ďalšie dokumenty VO alebo verejné registre.

## 1. Príprava zákazky

| ID | Problém | Využitie softvéru | Stav | Vstup | Dôkaz v kóde | Zdroj pravidla |
|---|---|---|---|---|---|---|
| U01 | PHZ nie je zdokumentovaná alebo podklady sú staršie ako 6 mesiacov ku dňu vyhlásenia | Model z dokumentu o určení PHZ vytiahne zdroje (ponuky, zmluvy, katalógy) a ich dátumy. Pravidlo porovná dátumy s dňom vyhlásenia a sumu s PHZ v ITMS21+. | Nie (M) | dok, ITMS | podmienka VK2 `packs/PSK-SIEA-002-2023-DV-EFRR/vo.json:213` má pokrytie „ziadne“ | MD 26 r. 166–202 (6 mesiacov r. 180), r. 418; Príloha 10 r. 2424–2429 |
| U02 | Zvolený postup nezodpovedá PHZ a finančným limitom | V01 porovná PHZ s limitom postupu podľa dňa začatia VO: zákazka malého rozsahu 50 000 EUR, podlimitná s oslovením na stavebné práce 360 000 EUR, na tovary a služby 143 000 EUR pri VO začatom do 31. 12. 2025 a 140 000 EUR od 31. 7. 2026 (MD 26 r. 246). Medzi tým sa vyhláška ÚVO č. 421/2025 (140 000) a príručka CKO VO v2 (143 000) rozchádzajú. Deň začatia ITMS21+ neuvádza, zadáva ho kontrolór; bez neho PHZ medzi limitmi možných období dá „na preverenie“. Chýbajú nadlimitné postupy, koncesie a limity podľa druhu obstarávateľa. | Čiastočne | ITMS, ručne | V01 `src/moduly/vo/modul.ts:31-123`, `vo.json:53`; testy `scripts/08-test-moduly.ts:149-157`, `:167-177`; VK1 `vo.json:195` | MD 26 r. 203–279 (limity r. 246), tabuľka r. 321–389 |
| U03 | Zákazka rozdelená, aby sa obišli limity | V05 hľadá zákazky toho istého obstarávateľa s rovnakými prvými tromi číslicami CPV v jednom roku, ktoré spolu dosiahnu 50 000 EUR. Chýbajú zákazky mimo stiahnutých dát a zákazky bez PHZ (VK4). Chýba aj porovnanie so zoznamom obdobných zákaziek a s vyhlásením pri zákazke malého rozsahu, ktoré prijímateľ predkladá. | Čiastočne | ITMS, dok | V05 `modul.ts:185-200`, `vo.json:102`; testy `08-test-moduly.ts:142,145`; VK4 `vo.json:245` | MD 26 r. 306, 398, 463; Príloha 10 r. 2431–2434; P4 r. 16–24 |
| U04 | Zákazka nerozdelená na časti bez odôvodnenia | ITMS21+ má pole „rozdelená“. Pri nerozdelenej zákazke model hľadá v podkladoch odôvodnenie. Bez neho dá „na preverenie“. | Nie (S) | ITMS, dok | pole `rozdelena` `modul.ts:12` | MD 26 r. 158; P4 r. 25–27 |
| U05 | Predbežné zapojenie alebo prípravné trhové konzultácie narušili súťaž | Model porovná účastníkov konzultácií (Príloha 12b) s uchádzačmi. Ak sa účastník stal úspešným uchádzačom a opatrenia nie sú opísané, nález ide kontrolórovi. | Nie (M) | dok | — | MD 26 r. 681–693; Príloha 10 r. 2436–2438; P4 r. 121–123 |
| U06 | Výnimka zo ZVO použitá na obídenie postupu | Pri postupe „výnimka“ alebo „in-house“ vyžiadať citované ustanovenie § 1 ZVO a porovnať ho so zoznamom výnimiek. Zoznam treba udržiavať. Napríklad novela č. 130/2026 pridala výnimku pre licencie AI na vysokých školách (§ 1 ods. 13 písm. af). Dnes softvér tieto zákazky len vynechá z V02. | Nie (M) | ITMS, dok | vynechanie vo V02 `modul.ts:125`; VK5 `vo.json:262` má pokrytie „ziadne“ | MD 26 r. 280–312 |
| U07 | Zákazka malého rozsahu (mimo ZVO) bez prieskumu trhu na overenie hospodárnosti | Pri zákazkách do 50 000 EUR overiť, že je v spise prieskum trhu alebo iné preukázanie hospodárnosti a že zmluvu dostal ten, koho prieskum určil. | Nie (M) | ITMS, dok | — | ZVO § 1 ods. 14; MD 26 r. 285–289 |

## 2. Súťažné podklady

| ID | Problém | Využitie softvéru | Stav | Vstup | Dôkaz v kóde | Zdroj pravidla |
|---|---|---|---|---|---|---|
| U08 | Diskriminačný opis predmetu, napríklad značka bez pripustenia ekvivalentu | Vyhľadať v opise predmetu názvy značiek a typové označenia bez slov „alebo ekvivalentný“. Model posúdi, či ide o značku. Nález je vždy len „na preverenie“. | Nie (M) | dok | — | MD 26 Príloha 10 r. 2441–2444 (r. 2442); P4 r. 78–98 |
| U09 | Neprimerané podmienky účasti | Model vytiahne požadovaný obrat, referencie a doklady (§ 32 až 34 ZVO) a porovná ich s PHZ a predmetom. Prah neprimeranosti treba stanoviť z MD 26. Dovtedy je to len prehľad pre kontrolóra. | Nie (M) | dok, ITMS | VK3 `vo.json:228` (V02 je len indikátor) | MD 26 Príloha 10 r. 2459–2483; P4 r. 66–98 |
| U10 | Kritérium na vyhodnotenie chýba, je nezákonné alebo sa líši od ITMS21+ | Porovnať kritérium zo súťažných podkladov, zo záznamu a z poľa `kriterium` v ITMS21+. V07 dnes overuje len to, že záznam kritérium uvádza. | Nie (S) | dok, ITMS | náležitosť V07 `vo.json:147`; pole `kriterium` `modul.ts:11` | MD 26 Príloha 10 r. 2454–2457; P4 r. 66–77 |
| U11 | Návrh zmluvy nemá povinnosť dodávateľa strpieť kontrolu a audit | Model hľadá v návrhu zmluvy toto ustanovenie. Ak ho nenájde, dá „na preverenie“. | Nie (S) | dok | — | MD 26 Príloha 10 r. 2446–2449 (r. 2449) |
| U12 | Neprimeraná zábezpeka | Vytiahnuť výšku zábezpeky a porovnať ju s PHZ podľa pravidla MD 26 [prah overiť]. | Nie (S) | dok, ITMS | — | MD 26 Príloha 10 r. 2451–2452 |
| U13 | Obmedzenie subdodávateľov | Model hľadá v podkladoch ustanovenia, ktoré subdodávky zakazujú alebo obmedzujú. | Nie (M) | dok | — | P4 r. 99–100 |
| U14 | Podmienky zmenené po otvorení ponúk | Zostaviť časovú os verzií podkladov, vysvetlení a otvárania ponúk. Zmena po otvorení ide kontrolórovi. | Nie (L) | dok | — | P4 r. 101–113 |

## 3. Vyhlásenie, lehoty a komunikácia

| ID | Problém | Využitie softvéru | Stav | Vstup | Dôkaz v kóde | Zdroj pravidla |
|---|---|---|---|---|---|---|
| U15 | Zákazka nebola zverejnená alebo bolo neoprávnene použité priame rokovacie konanie | Pri nadlimitnej zákazke overiť pole `vestnikEU` v ITMS21+. Pri priamom rokovacom konaní vyžiadať odôvodnenie. Vyhlásenie dohľadať vo Vestníku ÚVO. | Nie (S) | ITMS, reg | pole `vestnikEU` `modul.ts:12` | P4 r. 5–15 |
| U16 | Lehota na predkladanie ponúk je kratšia ako zákonné minimum | Vytiahnuť deň vyhlásenia a koniec lehoty, vypočítať dĺžku a porovnať ju s minimom pre postup [tabuľku miním doplniť zo ZVO]. Výpočet pracovných dní so sviatkami už softvér má. | Nie (M) | dok, reg | `src/podatelna/lehoty.ts:73` (`koniecLehoty`), `:25` (`pridajDni`) | P4 r. 28–38; ZVO § 21 ods. 1 |
| U17 | Obmedzený prístup k súťažným podkladom | Overiť, že oznámenie odkazuje na úplné podklady dostupné odo dňa vyhlásenia. | Nie (M) | dok, reg | — | P4 r. 39–47 |
| U18 | Vysvetlenie neskoro alebo lehota nepredĺžená | Časová os žiadostí o vysvetlenie, odpovedí a opráv oznámenia voči lehote na ponuky. Vysvetlenie treba poskytnúť najneskôr 6 dní pred koncom lehoty pri nadlimitných zákazkách a 3 pracovné dni pri podlimitných. | Nie (M) | dok | `lehoty.ts:73` | P4 r. 48–56 (r. 54) |
| U19 | Nedodržaná elektronická komunikácia | Overiť, že VO prebehlo v elektronickom prostriedku a že kontrolór dostal prístup k nemu aj k auditným záznamom. | Nie (S) | dok | — | P4 r. 60–65; MD 26 r. 474 |
| U20 | Neoprávnené rokovacie konanie so zverejnením alebo súťažný dialóg | Pri týchto postupoch (pole `postup`) vyžiadať odôvodnenie. Model ho zhrnie pre kontrolóra. | Nie (M) | ITMS, dok | pole `postup` `modul.ts:10` | P4 r. 57–59, 124–125 |

## 4. Vyhodnotenie ponúk

| ID | Problém | Využitie softvéru | Stav | Vstup | Dôkaz v kóde | Zdroj pravidla |
|---|---|---|---|---|---|---|
| U21 | Komisia má menej ako 3 členov alebo chýbajú doklady o odbornosti | Model zo zápisnice spočíta členov komisie a overí, či ku každému je doklad o odbornosti (životopis). Mená spracuje len lokálne v spise, nikam ich neukladá. | Nie (S) | dok | — | MD 26 r. 432; Príloha 10 r. 2497–2500 (r. 2498) |
| U22 | Konflikt záujmov | V06 porovná mená štatutárov obstarávateľa a uchádzača v aktuálnom RPO. Dopyt je online, preto je predvolene vypnutý. V07 overuje, že záznam uvádza skutočnosti o konflikte záujmov. Chýbajú ďalšie zainteresované osoby, stav k dátumu zadania, Prílohy 12a a 12b, čestné vyhlásenia a koneční užívatelia výhod v RPVS. | Čiastočne | reg, dok | V06 `modul.ts:204-238`, `vo.json:115`; náležitosť V07 `vo.json:168`; VK6 `vo.json:277` | MD 26 r. 643–680; ZVO § 23; KZ r. 482–491 |
| U23 | Príloha 12a alebo 12b chýba alebo nie je vyplnená | Overiť, že tabuľky pre konflikt záujmov a predbežné zapojenie sú v spise a vyplnené. | Nie (S) | dok | — | MD 26 r. 461, 680 |
| U24 | Úspešný uchádzač nespĺňa podmienky účasti (osobné postavenie, oprávnenie) | Overiť oprávnenie podnikať a zákaz účasti v registroch a podmienky § 32 ods. 1 písm. e) a f) ZVO v dokumentoch. | Nie (M) | reg, dok | VK7 `vo.json:294` má pokrytie „ziadne“; kandidáti registrov v `TODO.md` T1 | MD 26 r. 224; Príloha 10 r. 2485–2491 |
| U25 | Mimoriadne nízka ponuka nevyhodnotená | Model zo zápisnice vytiahne ceny všetkých ponúk. Ak je najnižšia výrazne pod ostatnými alebo pod PHZ a v spise chýba žiadosť o vysvetlenie, dá „na preverenie“ [zákonný prah doplniť zo ZVO]. | Nie (M) | dok, ITMS | — | MD 26 r. 447; Príloha 10 r. 2493–2495 (r. 2494); P4 r. 126–127 |
| U26 | Víťaz nezodpovedá kritériu | Pri kritériu najnižšej ceny prepočítať poradie z vytiahnutých cien a porovnať víťaza s dodávateľom zmluvy v ITMS21+. | Nie (M) | dok, ITMS | dodávateľ v poli `zmluvy` `modul.ts:13` | MD 26 Príloha 10 r. 2493–2495 |
| U27 | Zmluvná cena sa líši od víťaznej ponuky (rokovanie alebo zmena ponuky) | V07 už v zázname hľadá konečnú zmluvnú cenu. Stačí ju porovnať so sumou zmluvy v ITMS21+. | Nie (S) | dok, ITMS | náležitosť V07 `vo.json:163`; suma zmluvy `modul.ts:13` | P4 r. 117–120 |
| U28 | Elektronická aukcia bez dokumentácie | Ak podklady ohlasujú e-aukciu, overiť, že je v spise jej záznam. | Nie (S) | dok | — | MD 26 Príloha 10 r. 2502–2507 |
| U29 | Nízky počet ponúk | V02 hlási 1 až 2 ponuky ako rizikový indikátor („na preverenie“). | Hotové | ITMS | V02 `modul.ts:126`, `vo.json:66`; test `08-test-moduly.ts:126` | MD 26 r. 746–747 |
| U30 | Postup nezrušený pri jedinej ponuke bez zdôvodnenia | Keď V02 nájde jednu ponuku, softvér vyžiada zdôvodnenie, prečo postup nebol zrušený, a overí, že je v spise. | Nie (S) | ITMS, dok | nadväzuje na V02 `modul.ts:126` | MD 26 r. 454 |

## 5. Rizikové indikátory kartelu

| ID | Problém | Využitie softvéru | Stav | Vstup | Dôkaz v kóde | Zdroj pravidla |
|---|---|---|---|---|---|---|
| U31 | Rotácia víťazov podľa regiónu alebo predmetu | Nad všetkými VO v ITMS21+ hľadať dodávateľov, ktorí sa pri rovnakom obstarávateľovi alebo CPV striedajú vo víťazstve. | Nie (M) | ITMS | polia `zmluvy[].dodavatel.ico` a `cpv` `modul.ts:11,13` | MD 26 r. 709–710 |
| U32 | Veľa vylúčených alebo nekvalifikovaných ponúk | ITMS21+ uvádza počet vylúčených ponúk. Vysoký podiel ide kontrolórovi. | Nie (S) | ITMS | pole `vylucene` `modul.ts:11` | MD 26 r. 726–727 |
| U33 | Krycie ponuky, stiahnuté ponuky, podozrivé cenové vzory | Zo zápisníc vytiahnuť ceny všetkých ponúk. Hľadať zhodné ceny, okrúhle sumy, stále percentuálne rozdiely a stiahnuté ponuky. | Nie (M) | dok | — | MD 26 r. 735–743, 750–758 |
| U34 | Prepojení uchádzači, neúspešný uchádzač ako subdodávateľ, uchádzači, ktorí nikdy nevyhrajú, zbytočná skupina dodávateľov | Porovnať uchádzačov a subdodávateľov (zápisnica, zmluva, RPVS) a ich osoby a vlastníkov v registroch. Naprieč VO viesť zoznam uchádzačov bez výhry. | Nie (L) | dok, reg | — | MD 26 r. 713–714, 717–719, 722–723, 730–732 |
| U35 | Dohoda obmedzujúca súťaž potvrdená Protimonopolným úradom alebo súdom | Dohľadať rozhodnutia Protimonopolného úradu podľa IČO uchádzačov [dostupnosť overiť]. | Nie (M) | reg | — | P4 r. 130–135 |

## 6. Revízne postupy

| ID | Problém | Využitie softvéru | Stav | Vstup | Dôkaz v kóde | Zdroj pravidla |
|---|---|---|---|---|---|---|
| U36 | Žiadosť o nápravu alebo námietky bez rozhodnutia v spise | Rozpoznať v spise dokumenty o revíznych postupoch. Kým v spise nie je rozhodnutie, VO zostáva „na preverenie“ a softvér upozorní, že zmluvu nemožno uzavrieť [lehoty § 56 a § 170 ZVO overiť]. Doplniť dohľadanie rozhodnutí ÚVO podľa obstarávateľa. V prehľade z 27. 11. 2026 bol tento bod (astra č. 20) „Mimo“, teraz je to návrh. | Nie (M) | dok, reg | — | MD 26 r. 453; novela č. 100/2026 (§ 169 ods. 4, § 177 ods. 2 ZVO) |
| U37 | Kontrola ÚVO podľa § 169 ZVO prebehla a poskytovateľ o nej nevie | Ak je v spise rozhodnutie ÚVO podľa § 169, vytiahnuť výrok a priradiť ho k VO. | Nie (S) | dok | — | MD 26 r. 492 |

## 7. Uzavretie zmluvy

| ID | Problém | Využitie softvéru | Stav | Vstup | Dôkaz v kóde | Zdroj pravidla |
|---|---|---|---|---|---|---|
| U38 | Zmluva uzavretá skôr, ako dovoľuje § 56 ZVO | Porovnať deň podpisu zmluvy (dokument) a účinnosti (ITMS21+) s dňom oznámenia výsledku a lehotami § 56 [lehoty doplniť po načítaní § 56]. | Nie (M) | dok, ITMS | pole `ucinnost` `modul.ts:13`; `lehoty.ts:73` | MD 26 Príloha 10 r. 2509–2524 (r. 2513) |
| U39 | Úspešný uchádzač alebo jeho subdodávateľ nie je v RPVS | Podľa IČO dodávateľa zo zmluvy v ITMS21+ dohľadať zápis v registri partnerov verejného sektora k dátumu zmluvy [verejné API a hranice povinnosti overiť]. | Nie (S) | ITMS, reg | IČO v `zmluvy[].dodavatel` `modul.ts:13`; RPVS v `TODO.md` T1 | ZVO § 11 ods. 1; MD 26 r. 459, 2514 |
| U40 | Zmluvná cena výrazne nad PHZ | V03 porovná sumu zmlúv s PHZ. ITMS21+ neuvádza, či je suma s DPH, preto počíta s rezervou 23 %. | Hotové | ITMS | V03 `modul.ts:135-142`, `vo.json:78`; testy `08-test-moduly.ts:127,130` | CKO VO v2 (VK1 `vo.json:195`) |
| U41 | Rámcová dohoda dlhšia ako 4 roky alebo čiastková zmluva mimo nej | Vytiahnuť trvanie a rozsah rámcovej dohody a porovnať ich so štyrmi rokmi a s čiastkovými zmluvami. | Nie (S) | dok, ITMS | — | MD 26 r. 506–536 (r. 508); Príloha 10 r. 2515 |
| U42 | Plnenie začalo pred výsledkom kontroly VO | Zistiť, či zmluva má odkladaciu podmienku viazanú na kontrolu (je dobrovoľná). Porovnať začiatok plnenia a prvé faktúry s výsledkom kontroly. | Nie (S) | dok, ITMS | dátumy dokladov `modul.ts:14` | MD 26 r. 193 |
| U43 | Oznámenie o výsledku nezverejnené včas | Porovnať dátum zmluvy s dátumom oznámenia vo Vestníku ÚVO (do 30 dní). | Nie (M) | ITMS, reg | — | ZVO § 26 ods. 3 písm. a) |
| U44 | Zmluva nezverejnená v Centrálnom registri zmlúv | Dohľadať zmluvu v CRZ podľa IČO a sumy [právny základ a podmienky použitia CRZ overiť]. | Nie (M) | reg | CRZ v `TODO.md` T1 | [overiť] |

## 8. Kontrola VO poskytovateľom a ÚVO

| ID | Problém | Využitie softvéru | Stav | Vstup | Dôkaz v kóde | Zdroj pravidla |
|---|---|---|---|---|---|---|
| U45 | Záznam zo zadania zákazky nemá minimálne náležitosti | V07: lokálny model hľadá 10 náležitostí (predmet, PHZ, kritérium, oslovení, uchádzači, úspešný uchádzač, cena, konflikt záujmov, zodpovedná osoba, podpis), teda 9 z 15 náležitostí MD 26. Neoveruje identifikáciu prijímateľa, spôsob zadania, overenie oprávnenosti oslovených, dátum predloženia ponúk, vyhodnotenie podmienok účasti a spôsob vzniku záväzku. Bez modelu náhradné vzory nikdy nevrátia „splnené“. Zlepšenie poistiek je v `TODO.md` T3. | Hotové | dok | `vo.json:128-191`; testy `scripts/09-test-llm-moduly.ts:280-282`, `scripts/24-test-demo-vo.ts`; cvičná sada `demo/vo` | MD 26 r. 227–242; VK8 `vo.json:309` |
| U46 | Dokumentácia VO predložená na kontrolu je neúplná | Kontrolný zoznam dokumentov podľa postupu: PHZ, komisia, ponuky, mimoriadne nízka ponuka, revízne postupy, zdôvodnenie pri jednej ponuke, čestné vyhlásenia, RPVS, Príloha 12, zoznam obdobných zákaziek. Model zaradí súbory spisu a vypíše, čo chýba. Podateľňa to už robí pre prílohy ŽoNFP. | Nie (M) | dok | vzor: `src/moduly/zonfp/doklady-priloh.ts`, test `scripts/12-test-podatelna.ts:73` | MD 26 r. 392–399, 417–463 |
| U47 | Dokumentácia nahratá v nesprávnej forme | Pri nahratí do spisu overiť, že je každá časť dokumentácie samostatný súbor podľa pravidiel ITMS [limit veľkosti prílohy overiť v MD 26]. | Nie (S) | dok | — | MD 26 r. 392–393 |
| U48 | VO vecne nesúhlasí so schválenou ŽoNFP a projektom | Porovnať predmet, CPV a sumy VO s rozpočtom a aktivitami schváleného projektu. Údaje o projekte už má modul ŽoNFP. | Nie (M) | ITMS, dok | pole `projekty` `modul.ts:12`; modul `src/moduly/zonfp` | MD 26 r. 401–402 |
| U49 | Rozhodnutie o predbežnej kontrole a jej lehota | Podľa druhu zákazky, postupu a PHZ určiť, či je predbežná kontrola možná. Je dobrovoľná, žiada o ňu prijímateľ, po vyhodnotení ponúk a pred uzavretím zmluvy. Pri rizikových zákazkách ju odporučiť. Sledovať lehotu 40 dní na oznámenie ÚVO [spôsob počítania dní overiť]. | Nie (S) | ITMS, ručne | `lehoty.ts:25` (`pridajDni`) | MD 26 r. 403–416, tabuľka r. 321–389; ZVO § 184r (novela č. 100/2026) |
| U50 | Riziková analýza a podnet na kontrolu po uzavretí zmluvy | Zhrnúť nálezy pravidiel VO do podkladu pre rizikovú analýzu poskytovateľa, každý faktor s citáciou. Označiť zákazky, pri ktorých tabuľka MD 26 uvádza povinnú kontrolu (r. 381). V DOCX je „Povinná“ v tej istej bunke ako kontrola rizikovej zákazky, len v riadku nadlimitných stavebných prác; výklad je nejednoznačný. Rozhoduje poskytovateľ. | Nie (M) | ITMS, dok | — | MD 26 r. 105, 346–389, 464–467; ZVO § 184s ods. 1 (novela č. 100/2026) |
| U51 | Zmeškané lehoty kontroly po uzavretí zmluvy | Kalendár lehôt v spise VO: ÚVO oznámi začatie do 7 pracovných dní od podnetu, prijímateľ doručí dokumentáciu do 4 pracovných dní, prerušenie najmenej na 5 pracovných dní, odborné stanovisko najviac 30 dní, vyjadrenie najmenej 7 pracovných dní, protokol do 45 dní (do 20 dní po predbežnej kontrole), poskytovateľ premietne výsledok do 5 pracovných dní. Výpočet pracovných dní so sviatkami na roky 2024 až 2027 už softvér má. | Nie (S) | ručne, ITMS | `lehoty.ts:18` (kalendár), `:73` (`koniecLehoty`) | MD 26 r. 102, 473, 476, 478, 479, 481, 493 |
| U52 | Opätovná kontrola podľa § 184y ZVO | Evidovať, kto môže podať podnet (poskytovateľ, orgán auditu, orgán kontroly, nie prijímateľ). Pri nových zisteniach z auditu ponúknuť poskytovateľovi podklad. | Nie (S) | ručne, dok | — | MD 26 r. 468, 485–490 |
| U53 | Výsledok kontroly ÚVO sa nepremietne do finančnej kontroly poskytovateľa | Model z protokolu ÚVO vytiahne zistenia a navrhovanú opravu. Softvér pripraví koncept výstupu poskytovateľa s citáciami a sleduje lehotu 5 pracovných dní. | Nie (M) | dok | — | MD 26 r. 493–498 |

## 9. Finančné opravy

| ID | Problém | Využitie softvéru | Stav | Vstup | Dôkaz v kóde | Zdroj pravidla |
|---|---|---|---|---|---|---|
| U54 | Výška finančnej opravy podľa druhu porušenia | Po potvrdení nálezu kontrolórom navrhnúť kategóriu a rozpätie sadzby z Prílohy 11 MD 26 alebo z Prílohy č. 4 výzvy, s citáciou. Sadzbu softvér nikdy neuplatní sám. Pri kontrole ÚVO sa sadzba určí podľa zmluvy o NFP. | Nie (M) | ručne | — | MD 26 r. 578–641, Príloha 11 r. 2529–2935; P4 r. 5–152; ZVO § 184z ods. 3 (novela č. 100/2026) |
| U55 | Oprava ex ante alebo ex post | Podľa toho, či výdavky už boli preplatené (údaje ŽoP), určiť postup ex ante alebo ex post. | Nie (S) | ITMS | údaje ŽoP `src/moduly/zop/modul.ts` | MD 26 r. 588–627 |

## 10. Plnenie zmluvy, dodatky a platby

| ID | Problém | Využitie softvéru | Stav | Vstup | Dôkaz v kóde | Zdroj pravidla |
|---|---|---|---|---|---|---|
| U56 | Faktúry nad sumu zmluvy | V04 porovná účtovné doklady k VO so sumou zmlúv. | Hotové | ITMS | V04 `modul.ts:163`, `vo.json:90`; testy `08-test-moduly.ts:128,131,148` | VK9 `vo.json:326` |
| U57 | Výdavok v ŽoP bez priradeného VO | P06: každý výdavok z externého dokladu musí mať priradené VO. VO v stave „Stiahnuté“ ide kontrolórovi. | Hotové | ITMS | P06 `src/moduly/zop/modul.ts:197-206`, `packs/PSK-SIEA-002-2023-DV-EFRR/zop.json:100` [test so zasadenou chybou som nenašiel] | VZP v2.2 čl. 15 ods. 1 |
| U58 | Výdavky z VO zaradené do ŽoP pred ukončením kontroly VO | P07: či bolo posúdenie VO (analýza rizík, pri rizikovej zákazke kontrola ÚVO ako SO) ukončené pred zahrnutím výdavkov do ŽoP, zadá kontrolór. Bez toho dá pri VO od 50 000 EUR „mimo podkladov“. Text a citácia sú podľa MD 26. | Čiastočne | ITMS, ručne | P07 `zop/modul.ts:208-220`, `zop.json:112`; test `08-test-moduly.ts:263` | MD 26 r. 346–393, 465–467 |
| U59 | Nárok v ŽoP nad sumu zmluvy z VO | P08 sčíta nárokované výdavky ku každej zmluve naprieč ŽoP. Nárok nad sumou zmluvy ide kontrolórovi. | Hotové | ITMS | P08 `zop/modul.ts:225`, `zop.json:125`; testy `08-test-moduly.ts:267,290,292` | VK9 `vo.json:326` |
| U60 | Dodatok nepredložený na kontrolu | V04 a P08 zachytia len fakturáciu nad sumu zmluvy. Dodatky bez zmeny ceny (predĺženie lehoty, zmena predmetu) softvér nevidí. | Čiastočne | ITMS | VK9 `vo.json:326` | MD 26 r. 500–505 |
| U61 | Dodatok v rozpore s § 18 ZVO | Model z dodatku vytiahne zmenu ceny, predmetu a lehoty a citovaný dôvod. Pravidlo sčíta zmeny voči pôvodnej cene. Kontrolórovi pošle zmenu nad hranice § 18: pod finančným limitom nadlimitnej zákazky do 10 % pri tovaroch a službách a do 15 % pri stavebných prácach, pri dôvodoch písm. b) a c) najviac 50 %. | Nie (M) | dok, ITMS | VK10 `vo.json:343` má pokrytie „ziadne“ | ZVO § 18; MD 26 r. 500–505, Príloha 10 r. 2526–2527; P4 r. 136–152 |
| U62 | Faktúru vystavil iný subjekt ako úspešný uchádzač | Porovnať IČO vystaviteľa faktúry s dodávateľom zmluvy. Dnešné údaje dokladu dodávateľa nemajú [overiť, či ho ITMS21+ uvádza]. | Nie (S) | ITMS | `UctovnyDoklad` `modul.ts:149` | citácia o obstaraní na základe výsledku VO `zop.json:444` |

## 11. Audit, nezrovnalosti a uchovanie

| ID | Problém | Využitie softvéru | Stav | Vstup | Dôkaz v kóde | Zdroj pravidla |
|---|---|---|---|---|---|---|
| U63 | Pochybnosť alebo zistenie treba evidovať ako sledovaný príznak | Z potvrdených nálezov pripraviť koncept záznamu do modulu Príznaky sledovania v ITMS21+ (projekt, sledovaný objekt, dôvod, citácie). Zapisuje človek, softvér do ITMS21+ nič neposiela. | Nie (M) | ručne | — | SP r. 217, 323–326, 482, 528 |
| U64 | Program, v ktorom ÚVO nie je sprostredkovateľským orgánom | Smerovať kontrolu VO podľa programu. V Programe Rybné hospodárstvo a v Interreg SK-CZ a SK-AT vedie podnet na ÚVO k sledovanému príznaku. | Nie (S) | ručne | — | SP r. 438–440 |
| U65 | Opakované zistenia u toho istého dodávateľa naprieč projektmi | Z nálezov v spisoch viesť históriu dodávateľa podľa IČO a upozorniť na ňu pri novom VO. | Nie (M) | ITMS | IČO v `zmluvy[].dodavatel` `modul.ts:13` | MD 26 r. 467 |
| U66 | Dokumentácia VO sa neuchová 10 rokov | Pri uzavretí spisu zapísať lehotu uchovania. | Nie (S) | — | — | ZVO § 24 ods. 1 |

## 12. Údržba pravidiel

| ID | Problém | Využitie softvéru | Stav | Vstup | Dôkaz v kóde | Zdroj pravidla |
|---|---|---|---|---|---|---|
| U67 | Pravidlá VO citujú prekonanú príručku | Citácie V01 až V03, V05 až V07, VK1 až VK8, VK10 a P07 sú prepísané na MD 26 (V04 a VK9 citujú príručku DOP 3.2). Limit V01 sa určuje podľa dňa začatia VO (U02). MD 26 prechodné ustanovenie nemá: prijímateľ postupuje podľa aktuálnej verzie (r. 100) a zmeny vyhlášky ÚVO zohľadní (r. 103). Hotové v `TODO.md` T4. | Hotové | — | `vo/modul.ts:31-56`, `:64-96`; `vo.json:9-45`, `:53`; `zop.json:112` | MD 26 r. 100–103, 168, 246, 346–389 |
| U68 | ZVO sa mení počas života projektu | Verzovať pravidlá podľa rozhodného dňa VO. Dnes to robí len V01: limit podľa dňa začatia VO s hranicami 1. 8. 2024, 1. 1. 2026, 31. 7. 2026 a 31. 12. 2027. Sledovať novely č. 100/2026, 130/2026 a 385/2025 (tá od 1. 1. 2027 ruší § 154 ods. 5 ZVO). | Čiastočne | ITMS, ručne | `vo/modul.ts:31-96` | ZVO a uvedené novely; vyhlášky ÚVO č. 481/2023 a 421/2025 Z. z. |

## Kde začať

Najmenej práce s najväčším pokrytím majú návrhy, ktoré potrebujú len údaje z ITMS21+, ktoré už softvér
sťahuje: U04, U15, U32, U49, U51. Z dokumentových návrhov je najbližšie U27, lebo V07 už zmluvnú cenu zo záznamu
vyťahuje. Potom U30 a U11, ktoré hľadajú jeden konkrétny dokument alebo ustanovenie. Poradie je návrh,
rozhoduje používateľ.

## Súvisiace

- `TODO.md`: T1 (verejné registre), T3 (poistky V07); T4 (balík VO na MD 26) je hotová.
- `reports/2026-11-27-procesy-a-rozhodovanie/README.md`: posúdenie bodov astry 6.2 a diagramy procesov.
- `reports/2026-11-28-organizacie-a-vo/README.md`: procesy ďalších organizácií a možnosti dema.
