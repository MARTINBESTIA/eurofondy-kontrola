# Vernosť demo podkladov G856 voči reálnemu spisu

Audit modelového podania NFP401201G856 obce Chorvátsky Grob. Pôvodné porovnanie s dokumentáciou výzvy zo zmeny č. 3 a verejnými dokumentmi obce napísal Claude 20. 11. 2026. Doplnenie z 21. 11. 2026 napísala astra (Codex) a Claude jeho čísla v ten istý deň overil. Doplnenie overuje aj úplné pole `ucel` a schválené rozpočtové položky priamo vo verejnom detaile ITMS21+. Lokálna kópia odpovede je v `data/raw/itms21/PSK-SIEA-002-2023-DV-EFRR/zonfp/206978.json.gz`. V ten istý deň demo prevzalo energetické hodnotenie žiadateľa z tohto poľa namiesto vlastného prepočtu. [Verejný detail žiadosti](https://api.itms21.sk/public/v1/zonfp/id/206978)

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

Jedna PPP sa v aplikácii často rozkladá na viac kontrolných bodov. Pri náleze sa preto zobrazí číslo PPP aj kód bodu, napríklad L07. Citácia z výzvy určuje požiadavku. V časti s dôkazmi zo spisu nájdete odkaz na podklad žiadateľa a citovaný riadok, pole alebo bunku.

## Verdikt

Žiadateľ, projekt, sumy a štruktúrované ukazovatele pochádzajú z verejného ITMS21+. Demo JSON vyberá iba niektoré polia. Účel projektu preberá celý, len meno autora energetického hodnotenia je anonymizované. Prílohy 6 až 8 z neho od 21. 11. 2026 preberajú merné hodnoty a triedy žiadateľa. Vernosť rekonštruovaných príloh možno posúdiť voči týmto údajom a vzorom výzvy. Porovnanie s podpísanými originálmi by vyžadovalo prístup k skutočnému spisu obce.

| Rozmer | Zhoda | Prečo |
|---|---|---|
| Identita žiadateľa, projekt, sumy, aktivity, ukazovatele | vysoká | prevzaté z verejného formulára (`ziadosti.json`, `Formular_NFP401201G856.json`) |
| Údaje o budove (adresa, parcela 247/1, kolaudácia 1942) | vysoká | z verejného popisu projektu |
| Uznesenie o programe rozvoja | vysoká v údajoch, nízka vo forme | č. 44/2025 a hlasovanie 8 : 0 : 1 sú overené vo verejnom PDF obce; demo je však prepis na jednu stranu, nie výpis s podpismi |
| Štruktúra príloh (sloty 1, 3, 6, 7, 8) | stredná až vysoká | podľa Prílohy 2 výzvy; vynechanie príloh 2, 4 a 5 je zdôvodnené v `README.md` |
| Forma príloh (sken, podpis, pečiatka, osvedčenie) | nízka | demo má generované textové PDF; skutočný obrázkový sken je len v `04-sken.zip` |
| Rozsah príloh 6 a 7 | veľmi nízka | 1–2 strany namiesto certifikátu oprávnenej osoby a projektovej dokumentácie stavby s energetickým hodnotením |
| Energetické údaje v prílohách 6 a 7 | vysoká v údajoch žiadateľa, nízka v rozsahu | ročná energia, emisie a cieľová plocha sú ukazovatele formulára. Merné hodnoty a triedy (115,4 B → 51,76 A1, dodaná energia 90,1 B, vykurovanie C, teplá voda B) uvádza žiadateľ v poli `ucel`. Plocha pred obnovou 1 031,41 m² je dopočet. Ostatné časti certifikátu a hodnotenia chýbajú. |
| Rozpočet (Príloha 8) | stredná | oficiálny vzor, 9 skutočných súm aktivít a súlad s formulárom po krátení podľa PPP 13; výmery a jednotkové ceny sú modelové |
| Kanál doručenia | nízka | kontrolór reálne pracuje v neverejnej časti ITMS21+, nie so ZIP súborom |

## Po dokumentoch

| Dokument v sade | Z verejných zdrojov | Modelové alebo rekonštruované | Čím sa líši od reálneho podania |
|---|---|---|---|
| `Formular_NFP401201G856.json` | vybrané polia verejného detailu ITMS21+ v štruktúre API vrátane celého účelu projektu | meno autora energetického hodnotenia je „[anonymizované]“; historické rozhodnutie chýba | Kontrolór pracuje so štruktúrovanými údajmi v ITMS21+ a s výpismi z registrov. Do 21. 11. 2026 generátor skracoval `ucel` na prvý odsek, takže v deme chýbalo energetické hodnotenie žiadateľa. |
| `Ziadost_o_NFP_NFP401201G856.pdf` | hodnoty z formulára | výber častí, vlastná úprava | Reálny tlačový výstup ITMS21+ má všetky časti formulára a podáva sa podpísaný kvalifikovaným elektronickým podpisom (KB `2026-11-20-real-templates-and-itms-submission`). |
| `Priloha_1a_Plnomocenstvo.pdf` | údaje obce, kód výzvy, názov projektu | starostka bez mena, splnomocnenec „Eva Modelová (fiktívna osoba)“, osobné údaje „[anonymizované]“, dátum 18. 9. 2025 | Výzva vyžaduje sken originálu s úradne osvedčeným podpisom štatutára (`Priloha_2_Zoznam_Priloh_akt._3.txt:33`, `:35`). Demo má prázdne miesta pre podpisy a osvedčovaciu doložku. Pravidlo L01 preto podpisy správne posiela človeku. |
| `Priloha_3_Uznesenia.pdf` | č. 44/2025 z 9. 9. 2025, hlasovanie 8 : 0 : 1 (overené vo verejnom PDF obce, uznesenie na str. 7), územný plán 6/OZ-2001 (**neoverené**, podľa `README.md` zo ZaD č. 14/2019) | jednostranový prepis | Reálne ide o sken výpisu z uznesenia s podpisom (`Priloha_2…:108–115`). Verejné PDF obce obsahuje aj mená poslancov; demo ich nepreberá. |
| `Priloha_6_Predrealizacny_certifikat.pdf` | triedy a merné hodnoty žiadateľa z poľa `ucel` (vykurovanie C, teplá voda B, dodaná energia 90,1 kWh/(m²·rok) B, primárna energia 115,4 kWh/(m²·rok) B), dátum hodnotenia 12. 11. 2024, východisková primárna energia 119,0248 MWh/rok, emisie 19,6398 t, adresa a parcela | označenie EC-DEMO-G856, vzťažná plocha 1 031,41 m² ako dopočet, chýbajúce hodnoty potreby energie na vykurovanie a teplú vodu | Originál certifikátu vystavený oprávnenou osobou má aj tieto hodnoty a hodnotenie miest spotreby. Umožnil by overiť plochy, kategóriu budovy a zatriedenie (`Priloha_2…:184–203`). Podľa tabuľky F vyhlášky by 115,4 patrilo do triedy A1, nie B. |
| `Priloha_7_Projektova_dokumentacia.pdf` | hodnotenie žiadateľa 115,4 → 51,76 kWh/(m²·rok) a B → A1, ročná primárna energia, úspora 53,9236 % a štruktúrované kapacity OZE 0,0033 / 0,0231 MW | technická správa na dve strany, schéma bez mierky, vzťažná plocha pred obnovou ako dopočet | Výzva vyžaduje sken autorizovanej a overenej projektovej dokumentácie vrátane energetického hodnotenia (`Priloha_2…:225–262`). Reálne ide o desiatky až stovky strán s výkresmi. |
| `Priloha_8_Rozpocet.xlsm` | záväzný vzor SIEA, žiadané výdavky deviatich aktivít, emisie a výroba z OZE, triedy a merné hodnoty žiadateľa (`MU Budova 1`, F47–F49 a F51), cieľová plocha F52 | výmery, ceny, ponuky, prevádzka, LV, údaj o rade partnerstva a plocha pred obnovou F50 (dopočet) | Plné náklady 262 110,32 € s DPH sme odvodili tak, aby po 5 % krátení budovy vyšli žiadané výdavky. P08b overí súčty za opatrenia. Rovnaký výsledok môže vzniknúť aj z iných jednotkových cien a množstiev. |
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
- hospodárnosť a oprávnenosť každej rozpočtovej položky. P08b kontroluje súlad súm za opatrenia 2.1.2 a 2.2.2 medzi vyplneným zošitom a formulárom. Ceny, množstvá a oprávnenosť konkrétnych výdavkov posudzuje kontrolór.

## Odporúčaná veta na prezentáciu

„Údaje žiadosti sú z ITMS21+ vrátane energetického hodnotenia, ktoré uviedol žiadateľ: primárna energia 115,4 kWh/(m²·rok) v triede B. Podľa tabuľky F vyhlášky by táto hodnota pri administratívnej budove patrila do triedy A1. Takýto rozpor overí kontrolór v originálnom certifikáte. Prílohy sú rekonštrukcie; skutočné skeny by softvér bez OCR neprečítal.“

## Porovnanie pôvodného podania a aktuálnej sady

**Energia a podlahová plocha.** V úplnom poli `ucel` žiadateľ odkazuje na projektové hodnotenie z 12. 11. 2024. Uvádza vykurovanie v triede C, teplú vodu v triede B, celkovú dodanú energiu 90,1 kWh/(m²·rok) v triede B a primárnu energiu 115,4 kWh/(m²·rok) v triede B. Po obnove uvádza 51,76 kWh/(m²·rok) v triede A1 a výpočet úspory 53,9236 % z kombinácie plôch. [Verejný formulár, pole ucel](https://api.itms21.sk/public/v1/zonfp/id/206978)

V staršom modelovom zošite v spise č. 5 sú na hárku `MU Budova 1` v bunkách F50 a F52 plochy 1 031,41 a 1 059,55 m². Prvá je dopočet 119,0248 MWh × 1 000 / 115,4 kWh/m². Druhá je cieľová plocha v žiadosti. Príloha 5 výzvy určuje ako podklad pre PSKPRCO19 certifikát **po** realizácii (`Priloha_5_MU_akt_3.txt:198–201`). Pôvodnú výmeru, ktorú použil energetický hodnotiteľ, treba doložiť jeho výpočtom.

Aktuálny modelový zošit (od 21. 11. 2026) preberá hodnotenie žiadateľa: triedy B a A1 v F47 a F48, merné energie 115,4 a 51,76 kWh/(m²·rok) v F49 a F51, plochy 1 031,41 a 1 059,55 m² v F50 a F52. Predtým demo počítalo s plochou 1 059,55 m² aj pred obnovou (112,34 kWh/(m²·rok), triedy A1 → A0). Ročná primárna energia po obnove v N50 teraz vychádza 51,76 × 1 059,55 / 1 000 = 54,842308 MWh/rok, o 0,000008 viac ako ukazovateľ PSKPRCR26b (54,8423), lebo žiadateľ uvádza mernú hodnotu na dve desatinné miesta. Sumy po krátení sa zmenou nemenia, lebo úspora 53,92 % ostáva v pásme 95 %. Podľa poľa `popis` ide o budovu obecného úradu. Tabuľka F pre administratívne budovy zaraďuje 115,4 do A1 a 51,76 do A0, žiadateľ však uvádza B a A1. Hodnota 90,1 kWh/(m²·rok), ktorú žiadateľ uvádza ako celkovú dodanú energiu, patrí v tabuľke E (celková potreba energie budovy) do triedy B, rovnako ako uvádza žiadateľ. Rozpor sa teda týka tried primárnej energie pred obnovou aj po nej. Rozhodujúce sú pôvodný certifikát a projektové hodnotenie. [Vyhláška č. 35/2020 Z. z., tabuľky E a F na s. 13](https://static.slov-lex.sk/pdf/SK/ZZ/2020/35/ZZ_2020_35_20200310.pdf)

**Kapacity OZE.** Pole `ucel` uvádza 3,0 kWp fotovoltiky a 25,0 kW tepelného čerpadla. V poli `popis` sú cieľové ukazovatele 0,00325 a 0,02307 MW, teda 3,25 a 23,07 kW. Žiadané štruktúrované ukazovatele PSKPRCO22a a PSKPRCO22b v ITMS21+ majú 0,0033 a 0,0231 MW (3,3 a 23,1 kW) a tieto hodnoty používajú aj modelové prílohy. Technické parametre zariadení a vzťah k vykazovaným ukazovateľom by kontrolór preveril v projektovej dokumentácii. [Verejný detail žiadosti](https://api.itms21.sk/public/v1/zonfp/id/206978)

**Rozpočet.** Žiadaný NFP aj žiadané celkové oprávnené výdavky sú 250 825,77 €, vlastné zdroje 0 €. Modelový zošit obsahuje 262 110,32 € plných nákladov s DPH. Po uplatnení pásma 95 % na budovu sa M210 (214 406,49 €) a M270 (36 419,28 € na OZE) zhodujú so žiadosťou na cent. Zošit spätne zostavený na túto sumu dokladá výpočet v deme. Pôvodné obstarávacie ceny a spôsob zostavenia rozpočtu obce by doložili jej prílohy.

Schválený NFP aj schválené celkové oprávnené výdavky sú 248 453,79 €, schválené vlastné zdroje 0 €. Verejné polia `polozkyRozpoctu` a `polozkyRozpoctuSchvalene` ukazujú, ktoré čiastky sa zmenili. Odôvodnenie jednotlivých úprav by muselo vyplývať z rozhodnutia alebo posudku. [Verejný detail žiadosti](https://api.itms21.sk/public/v1/zonfp/id/206978)

| Zmenená aktivita | Žiadané (€) | Schválené (€) | Rozdiel (€) |
|---|---:|---:|---:|
| Osvetlenie | 33 385,36 | 31 983,18 | −1 402,18 |
| Systémy chladenia a vetrania | 15 738,10 | 14 768,25 | −969,85 |
| Vykurovací systém | 17 538,79 | 17 538,80 | +0,01 |
| Zateplenie obvodového plášťa | 117 597,18 | 117 597,21 | +0,03 |
| Kvalita vnútorného prostredia | 16 018,09 | 16 018,10 | +0,01 |
| **Rozdiel za všetkých deväť aktivít** | | | **−2 371,98** |

Obe aktivity OZE, projektová dokumentácia a ostatné výdavky majú rovnaké žiadané aj schválené sumy. Mierne sa líšia aj schválené ukazovatele: cieľová ročná primárna energia PSKPRCR26b je 54,8847 namiesto žiadaných 54,8423 MWh/rok a kapacity OZE PSKPRCO22a a PSKPRCO22b sú 0,0032 a 0,023 MW namiesto 0,0033 a 0,0231 MW.

## Otvorené

- Reálne prílohy nie sú verejné: verejné API ITMS21+ nemá endpoint pre prílohy žiadosti (KB `2026-11-20-real-templates-and-itms-submission`). Vernosť príloh 6 až 8 sa dá zlepšiť len so súhlasom obce alebo poskytovateľa.
- **Viac budov.** P08b porovnáva výdavky za jednotlivé opatrenia. Pri viacerých budovách potrebuje aj príslušné čitateľné hárky B2–B7. Skúška s originálnym podaním na viac budov ostáva otvorená. Aktuálna sada G856 má jednu budovu. So starším zošitom zo spisu č. 5 vychádza dnes P08b na preverenie, keďže M210 pre budovu je 203 686,17 € a žiadosť uvádza 214 406,49 €. Výsledok pôvodného posudku treba čítať podľa jeho vtedajšej verzie pravidiel.
- **Podklady pre energetické hodnotenie.** Kategóriu budovy, pôvodnú vzťažnú plochu a dôvod rozdielu v energetických triedach treba porovnať s pôvodným hodnotením. Samotný verejný formulár uvádza, že budova prešla rekonštrukciami, naposledy v roku 2007. [Verejná žiadosť](https://api.itms21.sk/public/v1/zonfp/id/206978)
