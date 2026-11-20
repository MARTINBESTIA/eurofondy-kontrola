# Vernosť demo podkladov G856 voči reálnemu spisu

Nezávislý audit sady `demo/itms/` k historickej žiadosti NFP401201G856 (Obec Chorvátsky Grob). Podklady pripravila astra (Codex), audit napísal Claude, 20. 11. 2026. Porovnávali sme ich s textom výzvy v znení zmeny č. 3 (`data/zdroje/PSK-SIEA-002-2023/txt/`), s verejným detailom žiadosti v ITMS21+ (`data/odvodene/PSK-SIEA-002-2023-DV-EFRR/ziadosti.json`) a s verejnými dokumentmi obce. Ku každému tvrdeniu je uvedený zdroj. Čo sa z verejných údajov overiť nedá, je označené slovom **neoverené**.

## Čo je PPP

PPP sú **podmienky poskytnutia príspevku**. Výzva ich definuje ako súbor podmienok, ktorých splnenie je predpokladom schválenia ŽoNFP, uzavretia zmluvy aj vyplatenia príspevku (`Vyzva_PSK_2P1_SIEA_zmena_3.txt:116`). Poskytovateľ ich overuje v konaní o žiadosti a potom počas realizácie a udržateľnosti projektu (`:118`). Výzva ich má 15:

| PPP | Názov (skrátene) | Riadok vo výzve |
|---|---|---|
| 1 | Právna forma | 128 |
| 2 | Žiadateľ nie je v konkurze, reštrukturalizácii ani likvidácii | 160 |
| 3 | Zákaz vedenia výkonu rozhodnutia | 176 |
| 4 | Zákaz výkonu rozhodnutia podľa čl. 65 NSU | 193 |
| 5 | Právnická osoba nemá uložený trest zákazu prijímať pomoc | 206 |
| 6 | Schválený program rozvoja a územnoplánovacia dokumentácia | 223 |
| 7 | Oprávnenosť aktivít projektu | 239 |
| 8 | Splnenie kritérií pre výber projektov | 299 |
| 9 | Realizácia na oprávnenom území | 401 |
| 10 | Vysporiadané majetkovo-právne vzťahy | 411 |
| 11 | Štátna pomoc | 441 |
| 12 | Výška príspevku | 463 |
| 13 | Oprávnenosť výdavkov | 474 |
| 14 | Časová oprávnenosť realizácie | 499 |
| 15 | Žiadateľ nie je v systéme EDES | 510 |

Jedna PPP sa v aplikácii zvyčajne rozkladá na viac pravidiel. Napríklad PPP 7 overuje 9 pravidiel balíka (`packs/PSK-SIEA-002-2023-DV-EFRR/zonfp.json`, pole `ppp`). Pri náleze sa preto zobrazuje číslo PPP aj kód pravidla (napr. L07). Citácia pod nálezom je znenie **výzvy**, teda požiadavka. Nie je to dôkaz z podania.

## Verdikt

Údaje formulára sú prevzaté z verejného detailu ITMS21+ a zhodujú sa s ním. Prílohy sú rekonštrukcie, ktoré obsahom nadväzujú na verejné údaje. Formou a rozsahom sa však od toho, čo by kontrolór dostal od obce, líšia výrazne. Demo preto ukazuje, ako podateľňa pracuje. Nedokazuje, že softvér zvládne reálne prílohy.

| Rozmer | Zhoda | Prečo |
|---|---|---|
| Identita žiadateľa, projekt, sumy, aktivity, ukazovatele | vysoká | prevzaté z verejného formulára (`ziadosti.json`, `Formular_NFP401201G856.json`) |
| Údaje o budove (adresa, parcela 247/1, kolaudácia 1942) | vysoká | z verejného popisu projektu |
| Uznesenie o programe rozvoja | vysoká v údajoch, nízka vo forme | č. 44/2025 a hlasovanie 8 : 0 : 1 sú overené vo verejnom PDF obce; demo je však prepis na jednu stranu, nie výpis s podpismi |
| Štruktúra príloh (sloty 1, 3, 6, 7, 8) | stredná až vysoká | podľa Prílohy 2 výzvy; vynechanie príloh 2, 4 a 5 je zdôvodnené v `README.md` |
| Forma príloh (sken, podpis, pečiatka, osvedčenie) | nízka | demo má generované textové PDF; skutočný obrázkový sken je len v `04-sken.zip` |
| Rozsah príloh 6 a 7 | veľmi nízka | 1–2 strany namiesto certifikátu oprávnenej osoby a projektovej dokumentácie stavby s energetickým hodnotením |
| Rozpočet (Príloha 8) | stredná | oficiálny vzor a 9 skutočných súm aktivít; výmery a jednotkové ceny sú modelové |
| Kanál doručenia | nízka | kontrolór reálne pracuje v neverejnej časti ITMS21+, nie so ZIP súborom |

## Po dokumentoch

| Dokument v sade | Z verejných zdrojov | Modelové alebo rekonštruované | Čím sa líši od reálneho podania |
|---|---|---|---|
| `Formular_NFP401201G856.json` | polia verejného detailu ITMS21+ v štruktúre API | výber polí, bez historického rozhodnutia | Kontrolór vidí formulár ako štruktúrované údaje v ITMS21+ (časti 1–15), nie ako súbor JSON. Súčasťou spisu sú aj výpisy z registrov z integrácií (PPP 2–5, 15), tie v sade nie sú. |
| `Ziadost_o_NFP_NFP401201G856.pdf` | hodnoty z formulára | výber častí, vlastná úprava | Reálny tlačový výstup ITMS21+ má všetky časti formulára a podáva sa podpísaný kvalifikovaným elektronickým podpisom (KB `2026-11-20-real-templates-and-itms-submission`). |
| `Priloha_1a_Plnomocenstvo.pdf` | údaje obce, kód výzvy, názov projektu | starostka bez mena, splnomocnenec „Eva Modelová (fiktívna osoba)“, osobné údaje „[anonymizované]“, dátum 18. 9. 2025 | Výzva vyžaduje sken originálu s úradne osvedčeným podpisom štatutára (`Priloha_2_Zoznam_Priloh_akt._3.txt:33`, `:35`). Demo má prázdne miesta pre podpisy a osvedčovaciu doložku. Pravidlo L01 preto podpisy správne posiela človeku. |
| `Priloha_3_Uznesenia.pdf` | č. 44/2025 z 9. 9. 2025, hlasovanie 8 : 0 : 1 (overené vo verejnom PDF obce, uznesenie na str. 7), územný plán 6/OZ-2001 (**neoverené**, podľa `README.md` zo ZaD č. 14/2019) | jednostranový prepis | Reálne ide o sken výpisu z uznesenia s podpisom (`Priloha_2…:108–115`). Verejné PDF obce obsahuje aj mená poslancov; demo ich nepreberá. |
| `Priloha_6_Predrealizacny_certifikat.pdf` | primárna energia 119,0248 MWh/rok, emisie 19,6398 t, adresa, parcela | číslo „EC-DEMO-G856“, trieda B, hodnoty 115,4 a 90,1 kWh/(m².rok) (vo verejnom formulári nie sú) | Výzva chce predrealizačný energetický certifikát podľa § 7 zákona 555/2005 Z. z., vydaný oprávnenou osobou, ako sken originálu (`Priloha_2…:184–203`). **Vnútorný nesúlad:** 115,4 kWh/m² × 1 059,55 m² ≈ 122,3 MWh, ale ten istý list uvádza 119,0248 MWh (rozdiel 2,7 %). Ak certifikát počíta s inou referenčnou plochou, list ju neuvádza. |
| `Priloha_7_Projektova_dokumentacia.pdf` | ukazovatele pred a po obnove, úspora 53,92 %, kapacity OZE 0,0033 / 0,0231 MW | technická správa na 2 strany a schéma bez mierky | Výzva chce sken projektovej dokumentácie autorizovanej projektantom a overenej povoľovacím orgánom, ktorej súčasťou je energetické hodnotenie (súčinitele U, potreba tepla, hygienické kritérium, vetranie…) (`Priloha_2…:225–262`). Reálne ide o desiatky až stovky strán s výkresmi. Demo má 2 strany a podateľňa z nich prečíta 2 649 znakov. |
| `Priloha_8_Rozpocet.xlsm` | oficiálny vzor SIEA, sumy 9 aktivít (spolu 250 825,77 € s DPH), emisie, výroba z OZE | výmery, jednotkové ceny, ponuky, prevádzkové údaje, LV, „schválené radou: nie“ | Vzor pri úspore 53,92 % znižuje výdavky na budovu o 5 % (`MU Budova 1!N44`), zošit preto vychádza na 240 105,45 € oproti žiadaným 250 825,77 €. V reálnom podaní by sa rozpočet formulára a zošit mali zhodovať a takýto rozdiel by kontrolór riešil. Aplikácia ho nehlási, lebo P08 overuje len prítomnosť vyplneného vzoru. Schválená suma 248 453,79 € (oznámenie obce) naznačuje, že reálny zošit sa od modelu líši; v čom, je **neoverené**. |
| `Priloha_8_Podklad_k_oceneniu.pdf` | súčet 250 825,77 € | celá kalkulácia | Jednotkové ceny majú štyri desatinné miesta (napr. 14 259,1789 €), sú teda spätne dopočítané zo súm. Skutočný výkaz výmer alebo cenová ponuka uvádza ceny na centy. |

## Čo demo dokazuje a čo nie

Dokazuje:
- príjem podania, rozbalenie ZIP a zaradenie súborov do slotov podľa Prílohy 2;
- čítanie záväzného Excelu po bunkách (žiadateľ B9, projekt B10, položky D/E/F);
- výpočtové pravidlá nad skutočnými číslami formulára (úspora primárnej energie, hodnota za peniaze, limity);
- že neisté body (podpisy, vlastníctvo, registre) idú človeku, nie na „splnené“.

Nedokazuje:
- čítanie reálnych príloh: sú to väčšinou skeny bez textovej vrstvy a softvér nemá OCR, takže by ich označil za nečitateľné (v `04-sken.zip` to vidno na uznesení);
- presnosť modelu na reálnych textoch príloh: model sa skúšal na krátkych rekonštrukciách a syntetických textoch;
- overenie podpisov, pečiatok a osvedčovacej doložky;
- vecnú správnosť rozpočtu a súlad Prílohy 8 s formulárom.

## Odporúčaná veta na prezentáciu

„Údaje žiadosti sú skutočné z ITMS21+, prílohy sú rekonštrukcie na oficiálnych vzoroch výzvy. Skutočné prílohy sú skeny podpísaných originálov. Tie dnes softvér bez OCR neprečíta a pošle ich na preverenie človeku.“

## Otvorené

- Reálne prílohy nie sú verejné: verejné API ITMS21+ nemá endpoint pre prílohy žiadosti (KB `2026-11-20-real-templates-and-itms-submission`). Vernosť príloh 6 až 8 sa dá zlepšiť len so súhlasom obce alebo poskytovateľa.
- Nesúlad 115,4 kWh/m² a 119,0248 MWh v Prílohe 6 treba opraviť, alebo na liste uviesť referenčnú plochu.
- Kontrola súladu Prílohy 8 s formulárom (súčet oprávnených výdavkov voči žiadanej sume) zatiaľ v pravidlách chýba.
