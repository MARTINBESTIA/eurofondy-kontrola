# Vernosť demo podkladov G856 voči reálnemu spisu

Nezávislý audit sady `demo/itms/` k historickej žiadosti NFP401201G856 (Obec Chorvátsky Grob). Podklady pripravila astra (Codex), audit napísal Claude, 20. 11. 2026. Vnútorné nesúlady, ktoré audit našiel, Claude v ten istý deň opravil (pozri časť Opravy). Porovnávali sme ich s textom výzvy v znení zmeny č. 3 (`data/zdroje/PSK-SIEA-002-2023/txt/`), s verejným detailom žiadosti v ITMS21+ (`data/odvodene/PSK-SIEA-002-2023-DV-EFRR/ziadosti.json`) a s verejnými dokumentmi obce. Ku každému tvrdeniu je uvedený zdroj. Čo sa z verejných údajov overiť nedá, je označené slovom **neoverené**.

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
| Energetické údaje v prílohách 6 a 7 | vysoká v číslach, nízka v rozsahu | primárna energia, emisie a plocha sú z formulára, merný ukazovateľ a trieda sú z nich dopočítané podľa vyhlášky; chýbajú ostatné časti certifikátu |
| Rozpočet (Príloha 8) | stredná | oficiálny vzor, 9 skutočných súm aktivít a súlad s formulárom po krátení podľa PPP 13; výmery a jednotkové ceny sú modelové |
| Kanál doručenia | nízka | kontrolór reálne pracuje v neverejnej časti ITMS21+, nie so ZIP súborom |

## Po dokumentoch

| Dokument v sade | Z verejných zdrojov | Modelové alebo rekonštruované | Čím sa líši od reálneho podania |
|---|---|---|---|
| `Formular_NFP401201G856.json` | polia verejného detailu ITMS21+ v štruktúre API | výber polí, bez historického rozhodnutia | Kontrolór vidí formulár ako štruktúrované údaje v ITMS21+ (časti 1–15), nie ako súbor JSON. Súčasťou spisu sú aj výpisy z registrov z integrácií (PPP 2–5, 15), tie v sade nie sú. |
| `Ziadost_o_NFP_NFP401201G856.pdf` | hodnoty z formulára | výber častí, vlastná úprava | Reálny tlačový výstup ITMS21+ má všetky časti formulára a podáva sa podpísaný kvalifikovaným elektronickým podpisom (KB `2026-11-20-real-templates-and-itms-submission`). |
| `Priloha_1a_Plnomocenstvo.pdf` | údaje obce, kód výzvy, názov projektu | starostka bez mena, splnomocnenec „Eva Modelová (fiktívna osoba)“, osobné údaje „[anonymizované]“, dátum 18. 9. 2025 | Výzva vyžaduje sken originálu s úradne osvedčeným podpisom štatutára (`Priloha_2_Zoznam_Priloh_akt._3.txt:33`, `:35`). Demo má prázdne miesta pre podpisy a osvedčovaciu doložku. Pravidlo L01 preto podpisy správne posiela človeku. |
| `Priloha_3_Uznesenia.pdf` | č. 44/2025 z 9. 9. 2025, hlasovanie 8 : 0 : 1 (overené vo verejnom PDF obce, uznesenie na str. 7), územný plán 6/OZ-2001 (**neoverené**, podľa `README.md` zo ZaD č. 14/2019) | jednostranový prepis | Reálne ide o sken výpisu z uznesenia s podpisom (`Priloha_2…:108–115`). Verejné PDF obce obsahuje aj mená poslancov; demo ich nepreberá. |
| `Priloha_6_Predrealizacny_certifikat.pdf` | primárna energia 119,0248 MWh/rok, emisie 19,6398 t, celková podlahová plocha 1 059,55 m² (PSKPRCO19), adresa, parcela; z nich globálny ukazovateľ 112,3 kWh/(m².rok) a trieda A1 | číslo „EC-DEMO-G856“; predpoklad, že vzťažná plocha certifikátu je celková podlahová plocha z ukazovateľa (Príloha 5 výzvy ju tak definuje, `Priloha_5_MU_akt_3.txt:198`) | Výzva chce predrealizačný energetický certifikát podľa § 7 zákona 555/2005 Z. z., vydaný oprávnenou osobou, ako sken originálu (`Priloha_2…:184–203`). Reálny certifikát má aj dodanú energiu, potrebu tepla a hodnotenie miest spotreby. Demo ich neuvádza, lebo sa nedajú odvodiť z verejných údajov. |
| `Priloha_7_Projektova_dokumentacia.pdf` | ukazovatele pred a po obnove, úspora 53,92 %, globálny ukazovateľ 112,3 → 51,8 kWh/(m².rok), triedy A1 → A0, kapacity OZE 0,0033 / 0,0231 MW | technická správa na 2 strany a schéma bez mierky | Výzva chce sken projektovej dokumentácie autorizovanej projektantom a overenej povoľovacím orgánom, ktorej súčasťou je energetické hodnotenie (súčinitele U, potreba tepla, hygienické kritérium, vetranie…) (`Priloha_2…:225–262`). Reálne ide o desiatky až stovky strán s výkresmi. Demo má 2 strany a podateľňa z nich prečíta 2 767 znakov. |
| `Priloha_8_Rozpocet.xlsm` | oficiálny vzor SIEA, sumy 9 aktivít (spolu 250 825,77 € oprávnených výdavkov), emisie, výroba z OZE, triedy a merné ukazovatele z Prílohy 6 | výmery, jednotkové ceny, ponuky, prevádzkové údaje, LV, „schválené radou: nie“ | Zošit obsahuje plné náklady 262 110,32 € s DPH. Pri úspore 53,92 % ich pre opatrenie 2.1.2 sám kráti na 95 % (`MU Budova 1!N44`, PPP 13 výzvy `:479`). Po krátení dáva M210 + M270 = 250 825,77 €, teda presne žiadanú sumu formulára; jednotlivé aktivity sa líšia najviac o 1 cent. Prečo formulár uvádza sumy už po krátení, vyplýva z troch faktov: projektová dokumentácia 10 663,75 € je presne 95 % z 11 225,00 €, ostatné výdavky 3 465,22 € presne 95 % z 3 647,60 € a schválená suma 248 453,79 € je vyššia ako 240 105,45 €, ktoré by zostali po krátení súm formulára. Čím sa reálny zošit líši od schválenej sumy, je **neoverené**. |
| `Priloha_8_Podklad_k_oceneniu.pdf` | sumy aktivít z formulára, krátenie podľa PPP 13 | celá kalkulácia, tri ponuky prieskumu trhu | Ceny bez DPH sú na centy. Tri sekcie majú druhú položku výkazu (lešenie, demontáž, rozvody), aby súčet sekcie vyšiel na cent. Skutočný výkaz výmer má desiatky až stovky položiek a ponuky sú samostatné doklady dodávateľov. |

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
- vecnú správnosť rozpočtu. Demo je so formulárom zosúladené, no aplikácia súlad Prílohy 8 s formulárom nekontroluje.

## Odporúčaná veta na prezentáciu

„Údaje žiadosti sú skutočné z ITMS21+, prílohy sú rekonštrukcie na oficiálnych vzoroch výzvy. Skutočné prílohy sú skeny podpísaných originálov. Tie dnes softvér bez OCR neprečíta a pošle ich na preverenie človeku.“

## Opravy (20. 11. 2026)

Generátor `scripts/demo-itms/vytvor.py` teraz počíta tieto údaje z verejných čísel, namiesto toho aby ich mal napevno:

1. **Príloha 6:** pôvodný list uvádzal 115,4 kWh/(m².rok), čo pri ploche 1 059,55 m² dáva 122,3 MWh, kým ten istý list uvádzal 119,0248 MWh. Merný ukazovateľ je teraz podiel ročnej primárnej energie a plochy (112,3) a list plochu uvádza. Vymyslená dodaná energia 90,1 je odstránená.
2. **Trieda:** pri overovaní škály sa ukázal ďalší nesúlad. Pôvodná trieda B nezodpovedala ani pôvodnej hodnote 115,4: podľa vyhlášky č. 364/2012 Z. z. (príloha č. 3, tabuľka F) majú administratívne budovy A0 do 61, A1 od 62 do 122 a B od 123 do 244 kWh/(m².a). Nové triedy sú A1 pred obnovou a A0 po nej, čo spĺňa podmienku výzvy o zlepšení aspoň o jednu triedu (`Vyzva…:274`). Pôvodná veta „trieda pochádza z verejného opisu“ bola nepravdivá a je nahradená skutočným pôvodom.
3. **Podklad k oceneniu:** jednotkové ceny sú na centy, nie na štyri desatinné miesta. V prieskume trhu sa ponuka C už nerovná presne priemeru.
4. **Príloha 8:** zošit vychádzal na 240 105,45 € oproti 250 825,77 € vo formulári. Teraz obsahuje plné náklady a po krátení sa s formulárom zhoduje (pozri tabuľku vyššie). Test `scripts/13-test-demo-itms.ts` to overuje.

## Otvorené

- Reálne prílohy nie sú verejné: verejné API ITMS21+ nemá endpoint pre prílohy žiadosti (KB `2026-11-20-real-templates-and-itms-submission`). Vernosť príloh 6 až 8 sa dá zlepšiť len so súhlasom obce alebo poskytovateľa.
- Kontrola súladu Prílohy 8 s formulárom (M210 + M270 voči žiadanej sume) v pravidlách chýba. Demo je teraz zosúladené, takže na skúšku takého pravidla treba podanie, v ktorom sa sumy líšia.
- **Neoverené:** celková podlahová plocha 1 059,55 m² pri budove z roku 1942 dáva východiskový ukazovateľ 112 kWh/(m².a), čo je na neobnovenú budovu nízka hodnota. Čísla sú z verejného formulára. Vysvetlenie by bolo v originálnom certifikáte.
