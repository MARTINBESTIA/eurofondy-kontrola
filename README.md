# eurofondy-kontrola

Predkontrola dokumentov k eurofondom podľa verejných pravidiel výzvy. Softvér je v roli hodnotiteľa:
prejde podmienky poskytnutia príspevku (PPP) tak, ako ich určuje výzva, a ku každej povie, či je
splnená, nesplnená, či chýba podklad, alebo či sa z podkladov overiť nedá. Každé tvrdenie má citáciu
zdrojového odseku výzvy.

Softvér navrhuje, rozhoduje človek. Najhorší omyl je označiť chybný dokument za dobrý, preto: chýbajúci údaj
nikdy nevedie k „splnené“, nejasný prípad ide človeku a výrok „bez zistení“ padne len vtedy, keď sa overilo
všetko, čo pravidlá žiadajú. Inak je výrok „čiastočne overené“ s počtom neoverených bodov.

Šesť modulov podľa procesu eurofondov (pilotná výzva `PSK-SIEA-002-2023-DV-EFRR`, SIEA, energetická
efektívnosť a OZE vo verejných budovách):

| # | Modul | Pre koho | Prípady (verejné dáta ITMS21+) | Pravidlá | Čo kontroluje |
|---|---|---|---|---|---|
| 1 | Plánovanie výziev | žiadateľ, konzultant | 182 výziev + 4 plánované | 5 | otvorenosť výzvy, najbližšia uzávierka, stihne sa príprava, práca s poslednou verziou výzvy, posun plánovanej výzvy |
| 2 | Žiadosť a prílohy | hodnotiteľ, žiadateľ | 799 žiadostí | 23 | PPP výzvy v znení Zmeny č. 3 (21. 8. 2025): údaje formulára, povinné prílohy, obsah príloh |
| 3 | Verejné obstarávanie | prijímateľ, ÚVO | 659 VO prijímateľov výzvy | 7 | limit postupu, počet ponúk, cena voči PHZ, faktúry nad zmluvu, delenie zákazky, štatutári (RPO), záznam zo zadania |
| 4 | Zmeny projektu | prijímateľ, projektový manažér | 2 336 zmien | 8 | druh zmeny a formulár (OoZ/ŽoZZ), podstatná zmena, NFP, 24-mesačný limit, lehoty, zníženie MU, prílohy, odôvodnenie |
| 5 | Žiadosť o platbu | finančný manažér | 1 362 ŽoP (8 650 výdavkov) | 12 | obdobie oprávnenosti, sumy voči dokladom, dvojité nárokovanie, DPH, väzba na VO, hotovosť, prílohy, faktúra (§ 74 ZDPH), výpis |
| 6 | Merateľné ukazovatele | prijímateľ, monitorovanie | 242 projektov | 3 | plnenie MU a krátenie NFP podľa sankčnej kalkulačky SIEA, termíny monitorovacích správ |

Zdroje pravidiel: výzva (Zmena č. 3), VZP verzia 2.2, Príručka pre prijímateľa DOP 3.2 (1. 6. 2026) a jej
príloha č. 12 (sankčná kalkulačka MU), Príručka k procesu a kontrole VO/O verzia 2 (1. 8. 2024). Pri
plánovaní výziev sú pravidlami údaje ITMS21+, nie právny text, a citácie to tak aj uvádzajú.

## Spustenie

Treba Node 24 (beží TypeScript priamo, bez kompilácie a bez `npm install`), voliteľne Ollama s modelom
`qwen3.5:9b` a `pdftotext` (poppler) na čítanie PDF.

```bash
npm run data:stiahni      # 799 žiadostí výzvy z verejného API ITMS21+ (asi 2 min)
npm run data:normalizuj   # spojí ich s dôvodmi z verejných zoznamov rozhodnutí SIEA
npm run data:projekty     # projekty výzvy (zmluvy, ukazovatele, zmeny), zoznam výziev, snímka plánovaných výziev
npm run data:zop-vo       # ŽoP, výdavky, účtovné doklady a VO prijímateľov (asi 10 min, cache v data/raw)
npm run data:vyzvy        # detaily výziev: kolá, verzie, počty žiadostí
npm run test:pravidla     # test 1: pravidlá žiadostí voči skutočnému rozhodnutiu (0,3 s)
npm run test:llm          # test 2: lokálny model pri žiadostiach (asi 30 min; --iba=CD spustí len časti C a D)
npm run test:moduly       # test 3: všetky moduly na reálnych dátach + zasadené chyby (asi 30 s)
npm run test:llm-moduly   # test 4: lokálny model na syntetických faktúrach, výpisoch, záznamoch VO, odôvodneniach
npm run test:podatelna    # test 5: podateľňa na demo podaniach, bez modelu (asi 3 s)
npm run test:inventar     # inventár podmienok, poistky, verzie podľa kola a zmeny výzvy (bez siete)
npm run test:sada         # test 6: 15 nových podaní z demo/testovacia-sada cez API podateľne, bez modelu (asi 6 s)
npm run test:nova         # test 6 na novej skúšobnej žiadosti z demo/nova-ziadost (asi 3 s)
npm run zmeny             # kontrola zmien výzvy v ITMS21+ oproti posúdenému základu (len čítanie verejného API)
npm run demo:podania      # vymyslené podania žiadostí (PDF, DOCX, JSON, ZIP) do demo/podania
npm run demo:sada         # testovacia sada podľa oficiálnych vzorov do demo/testovacia-sada (Windows, Excel, Edge; asi 3 min)
npm run demo:nova         # nová skúšobná žiadosť pre kontrolóra do demo/nova-ziadost (Windows, Excel, Edge; asi 15 s)
npm start                 # demo na http://127.0.0.1:5177
```

Premenné prostredia: `PORT`, `VYZVA`, `KONTROLA_MODEL` (predvolene `qwen3.5:9b`), `OLLAMA_URL`,
`KONTROLA_DNES` (referenčný dátum pre termíny, predvolene dnes), `PDFTOTEXT` (cesta k pdftotext; inak sa
hľadá na PATH a v Git for Windows), `SPISY_DIR` (úložisko súborov podateľne, predvolene `data/spisy`).

Softvér nič neodosiela. Jediný voliteľný online dopyt je overenie štatutárov v registri RPO v module VO
(pošle IČO obstarávateľa a dodávateľa); je predvolene vypnutý a mená sa do auditnej tabuľky neukladajú.

## Podateľňa: simulácia práce kontrolóra

Karta **Podateľňa** simuluje prácu kontrolóra, ktorý posudzuje žiadosti o NFP. Kontrolór prijme podanie
(ZIP alebo súbory, prípadne kód historickej žiadosti z ITMS21+), skontroluje zaradenie príloh, spustí
posúdenie a zapíše rozhodnutie. Spisy sú rozdelené podľa výziev. Pri každej výzve je úspešnosť
v podateľni (rozhodnutia kontrolóra) a v ITMS21+ (skutočné žiadosti). Postup krok za krokom
s ukážkovými podaniami je v [demo/podania/README.md](demo/podania/README.md). Testovacia sada 15 úplne nových
podaní podľa oficiálnych vzorov, s očakávaným výsledkom pri každom, je v
[demo/testovacia-sada/README.md](demo/testovacia-sada/README.md). Novú žiadosť na samostatnú skúšku kontrolóra,
s riešením v osobitnom priečinku, nájdete v [demo/nova-ziadost/README.md](demo/nova-ziadost/README.md).

- **Odkiaľ podanie prichádza (lokálna simulácia).** V skutočnosti žiadateľ vypĺňa ŽoNFP v ITMS21+:
  štruktúrovaný formulár a prílohy nahraté k jednotlivým podmienkam, potom žiadosť odošle a formálne podá
  elektronicky do e-schránky poskytovateľa (alebo listinne). Poskytovateľ ju administruje tiež v ITMS21+.
  Tento softvér **nie je napojený na ITMS21+**. Verejné API vracia iba formulár, prílohy nie. Spis
  v podateľni preto predstavuje lokálny export žiadosti a jej príloh, ktorý kontrolór nahrá ručne alebo
  skriptom `npm run podanie -- <priečinok|zip> [--posud]`.
- **Príjem.** `POST /api/podatelna/spisy` prijme súbory v base64 a ZIP rozbalí. Text vytiahne z PDF, DOCX,
  XLSX/XLSM a TXT a súbory uloží do `data/spisy/<spis>/` (mimo gitu). Formulár žiadosti je JSON: buď
  štruktúrovaný tvar, alebo surový detail z API ITMS21+, alebo `{"kodItms": "NFP…"}`.
- **Záväzný zošit Prílohy č. 8.** Príloha č. 8 sa predkladá ako zošit MS Excel podľa vzoru výzvy. P08 preto
  nestačí, že príloha má text, ani PDF či DOCX v tom istom slote. Overuje sa po bunkách originálu
  (hárok „Rozpočet B1 - Value for Money“): žiadateľ B9 a projekt B10 sa musia po normalizácii zhodovať
  s formulárom a aspoň jeden riadok musí mať počet, cenu a kladnú „Cenu celkom bez DPH“. Inak výsledok je
  chýba podklad (prázdny vzor) alebo na preverenie (cudzí zošit). „Splnené“ znamená len prítomnosť
  vyplneného vzoru tejto žiadosti, nie vecnú správnosť rozpočtu. Demo zošity vypĺňa a prepočíta skutočný
  Excel (`scripts/lib/priloha8.ts`, makrá vypnuté), aby uložené hodnoty vzorcov boli tie, ktoré vidí hodnotiteľ.
- **Súlad Prílohy č. 8 s formulárom (P08b).** Zošit sám vypočíta oprávnené výdavky po krátení podľa pásma
  úspory (PPP č. 13) a podmienok Hodnoty za peniaze: budova M210 (+ M207 ďalších budov podľa B13), OZE M270.
  P08b ich porovná so súčtom položiek formulára za opatrenie 2.1.2 a 2.2.2. Tolerancia je pol centa na položku
  (formulár zaokrúhľuje položky na centy). Pri zhode = splnené. Rozdiel, hlásenie zošita (D17, D212, A17,
  A202, A262, hárok MU Budova B13 a I13), neprečítaná budova alebo výdavok mimo oboch opatrení = na preverenie.
  Pri zhode formulára so sumou pred krátením (M208) to zdôvodnenie povie. Hlásenie MU Budova B13 (neoprávnená
  kategória, nesplnená podmienka budovy) alebo I13 (úspora primárnej energie pod 30 %, nezlepšená trieda)
  vzorcom M208 vynuluje výdavky budovy. Zošit je vtedy vyplnený, len budova nespĺňa podmienku. Zošit, ktorý nič
  nevypočítal bez hlásenia (nevyplnený hárok MU Budova), = chýba podklad („absencia výpočtu výdavkov“ podľa
  Prílohy č. 2). Nesúlad nikdy nevedie
  k „nesplnené“, rozhoduje človek. Skryté hárky (B2–B7) sa nečítajú, preto viac budov bez čitateľného
  hárku = na preverenie.
- **Viac vyplnených zošitov Prílohy č. 8.** Doplnenie sa pridáva k pôvodnému podaniu, takže v slote môže byť
  pôvodný aj opravený zošit. Ak majú vyplnené zošity rozdielny rozpočet (P08) alebo im porovnanie s formulárom
  vychádza inak (P08b), výsledok je na preverenie a zdôvodnenie vypíše každý zošit. Kontrolór má určiť záväzný
  zošit a ostatné vyradiť zo zaradenia prílohy. Výsledok tak nezávisí od poradia súborov. Rovnaké zošity
  (napr. nahraté dvakrát) dajú bežný výsledok.
- **Zaradenie príloh.** Číslo v názve súboru (`Priloha_3_…`) sa berie ako vyhlásenie žiadateľa, rovnako ako
  slot v ITMS21+. Súbor bez čísla softvér zaradí podľa kľúčových slov, najprv z názvu, potom z obsahu. Je to
  len **odhad**: kým ho kontrolór nepotvrdí, pravidlo prílohy je „na preverenie“. Stačí jeden odhadnutý súbor
  v prílohe a na preverenie ide celá príloha, lebo napr. sprievodný list, ktorý uznesenie len spomína, by
  inak mohol modelu „dodať“ náležitosť uznesenia. Nečitateľný súbor (sken, poškodené PDF) je „priložený,
  ale nečitateľný“, nikdy „splnený“.
- **Dátum predloženia.** Berie sa z formulára. Ak tam chýba, nedopĺňa sa dátumom nahratia do podateľne:
  včasnosť sa posudzuje podľa odoslania do e-schránky poskytovateľa (MD č. 21) a neskorší dátum by vybral
  neskoršie kolo, teda iné znenie výzvy (pri Zmene č. 3 napr. bez povinnej Prílohy č. 9). Včasnosť (F01),
  harmonogram (D14) aj výber znenia (VER-KOLO) vtedy idú na preverenie kontrolórovi.
- **Výsledky sa ukladajú.** Každý posudok ide do auditnej tabuľky `posudky` s väzbou na spis. Rozhodnutie
  kontrolóra (splnila / výzva na doplnenie / nesplnila) sa ukladá s poznámkou. Rozhodnutie proti návrhu
  softvéru vyžaduje poznámku a v prehľade výzvy sa počíta zvlášť. Čísla spisov `POD-RRRR-NNNN` sa po
  vymazaní spisu znova nepridelia.
- **Úspešnosť.** V podateľni sa počíta ako splnila / (splnila + nesplnila); doplnenie a nerozhodnuté spisy
  sa nepočítajú. V ITMS21+ ako schválené / predložené a zvlášť „splnilo podmienky“ (schválené + zásobník).
  Pri pilotnej výzve je to 244 z 799 (30,5 %) a 481 z 799 (60,2 %).

## Architektúra

```
packs/<výzva>/<modul>.json     balík pravidiel: verzia, zdroje, proces, pravidlá s citáciami a prahmi
packs/<výzva>/verzie/<id>/     archívne znenia výzvy (napr. akt2 = Zmena č. 2 pre kolá 1–78) s vlastným stavom schválenia
packs/<výzva>/itms/stav-vyzvy.json  stav výzvy v ITMS21+, ktorý posúdil človek (základ kontroly zmien)
packs/PSK/vyzvy.json           balík pre plánovanie výziev (celý Program Slovensko)
src/core/typy.ts               spoločné typy (Modul, Pravidlo, Nalez, Posudok, Pole, Projekt)
src/core/posud.ts              jadro: prejde pravidlá, spustí kontroly, zloží posudok a výrok; vyberie znenie podľa kola
src/core/zmeny.ts              kontrola zmien výzvy v ITMS21+ oproti základu (body VER-ITMS, VER-KONTROLA)
src/moduly/spolocne.ts         načítanie dát, dátumy, formátovanie
src/moduly/zonfp/              žiadosť a prílohy (normalizuj.ts, kontroly.ts, modul.ts)
src/moduly/vyzvy/              plánovanie výziev
src/moduly/vo/                 verejné obstarávanie (+ voliteľný dopyt do RPO)
src/moduly/zmeny/              zmeny projektu (pravidlový klasifikátor druhu zmeny, návrh OoZ/ŽoZZ)
src/moduly/zop/                žiadosť o platbu
src/moduly/ukazovatele/        merateľné ukazovatele (kalkulacka.ts = prepis sankčnej kalkulačky SIEA)
src/llm/ollama.ts              lokálny model: hľadá dôkaz v texte, vracia JSON
src/ingest/dokument.ts         DOCX / PDF / TXT / ZIP -> text
src/podatelna/podatelna.ts     podateľňa: spisy, súbory, zaradenie príloh, rozhodnutia, štatistika výziev
src/server/server.ts           HTTP API + statické rozhranie (node:http, node:sqlite)
web/                           rozhranie (HTML + JS bez frameworku; podatelna.js, ui.js = spoločné vykreslenie)
scripts/                       stiahnutie dát, normalizácia, testy, demo podania (10), lokálny príjem podania (11), testovacia sada (18), jej test (19) a nová skúšobná žiadosť (20)
scripts/lib/                   Príloha 8 cez Excel (priloha8.ts); ZIP, DOCX a PDF cez Edge pre vymyslené doklady (dokumenty.ts)
demo/podania/                  ukážkové podania žiadostí a postup pre demo
demo/testovacia-sada/          15 nových podaní podľa oficiálnych vzorov, očakávané výsledky (ocakavane.json) a postup
demo/nova-ziadost/             nová skúšobná žiadosť pre kontrolóra, riešenie oddelene v riesenie/
data/zdroje/                   stiahnuté dokumenty výzvy a zoznamy rozhodnutí (zdroj pravdy pre pravidlá)
data/odvodene/                 normalizované žiadosti s výsledkom a dôvodom
eval/                          výsledky testov (JSON)
```

Tri vrstvy, ktoré sa dajú meniť nezávisle:

1. **Dátová vrstva pravidiel** (`packs/`). Jeden súbor na výzvu, modul a verziu. Pravidlo má identifikátor,
   číslo PPP, druh, prahy a doslovnú citáciu s názvom dokumentu a časti. Nová verzia výzvy je nový súbor,
   kód sa nemení.
   - Zmena výzvy platí pre kolo, v ktorom vyšla, a pre nasledujúce kolá (§ 14 ods. 4 zákona č. 121/2022 Z. z.). Posudok preto vyberie znenie podľa kola žiadosti, ktoré berie z ITMS21+, inak ho odvodí z dátumu predloženia. Nejasné kolo a znenie, ktoré ešte neschválil človek, dávajú bod na preverenie.
   - `npm run zmeny` porovná verzie, dokumenty, PPP, termíny a aktuality výzvy v ITMS21+ so stavom, ktorý naposledy posúdil človek. Kým človek zistenú zmenu neposúdi, posudky dostanú bod VER-ITMS. Bod VER-KONTROLA dostane posudok, keď údaje výzvy, s ktorými kontrola porovnávala, boli z ITMS21+ stiahnuté pred viac ako 7 dňami alebo sa ich vek nedá určiť. Vek sa ráta od dátumu stiahnutia, nie od behu kontroly, takže offline beh nad starým uloženým detailom bod nezruší.
   - Človek zistenú zmenu posúdi a podľa potreby upraví balík. Novú verziu výzvy doplní do `itmsVerzie`. Zmenu potom prevezme príkazom `npm run zmeny -- --prevzat --poznamka "…"`.
2. **Jadro a moduly** (`src/core`, `src/moduly`). Jadro nevie nič o konkrétnej výzve ani o type vstupu.
   Modul implementuje rozhranie `Modul`: zoznam prípadov, načítanie, polia formulára, sloty na dokumenty,
   kontroly, súhrn, porovnanie so skutočnosťou a predvyplnené výstupy (napr. návrh OoZ). Server a rozhranie
   sú všeobecné, nový modul = nový priečinok + balík pravidiel + jeden riadok v registri `server.ts`.
3. **Vrstva modelu** (`src/llm`). Model nikdy nerozhoduje sám. Dostane jednu podmienku a text, vráti stav
   a doslovný úryvok. Ak úryvok v texte nie je, verdikt sa zahodí a bod ide človeku. Povinné náležitosti
   dokumentu sa overujú po jednej a úryvok musí navyše zodpovedať vzoru náležitosti z balíka pravidiel.

Štyri druhy pravidiel:

| Druh | Ako sa overuje | Príklad |
|---|---|---|
| `data` | výpočet z údajov formulára | NFP 200 000 až 5 000 000 EUR, úspora energie ≥ 30 %, hodnota za peniaze |
| `priloha` | prítomnosť povinnej prílohy podľa typu žiadateľa a aktivít a znaky jej obsahu (nadpis typu dokumentu na začiatku, typický údaj v ďalšom riadku) | energetický certifikát pri opatrení 2.1.2 |
| `llm` | lokálny model hľadá dôkaz v texte | plnomocenstvo má všetky štyri náležitosti |
| `register` | overuje poskytovateľ v registri, alebo voliteľný online dopyt | exekúcie, EDES, kataster; RPO pri VO |

Šesť stavov nálezu: splnené, nesplnené, chýba podklad, na preverenie, mimo podkladov (neoverené),
neuplatňuje sa. Päť výrokov: zistené porušenie, chýbajú podklady, treba posúdenie človekom, čiastočne
overené (v overených bodoch bez zistení, ale niečo sa overiť nedalo) a bez zistení (overené všetko).
Rozhranie ukazuje aj pruh pokrytia: koľko pravidiel z tých, ktoré sa na prípad vzťahujú, sa naozaj overilo.

Ako sa bráni „falošne OK“:

- chýbajúci údaj alebo dokument je „neoverené“ alebo „chýba podklad“, nikdy „splnené“;
- pravidlá sú pomenované úzko („Doklady s DPH vystavili platitelia DPH“), aby „splnené“ tvrdilo len to, čo sa overilo;
- dvojznačné prípady (DPH v zmluve, staršie limity VO, klasifikátor zmien „podľa dopadu“) sú „na preverenie“;
- pravidlo prítomnosti prílohy (P03, P05, P06, P07, P09) uzná súbor, len ak má v prvých 15 neprázdnych riadkoch
  nadpis typu dokumentu a v inom riadku aspoň jeden typický údaj (`parametre.obsah` v balíku). Doklad cituje
  oba riadky. Cestovný plán ani sprievodný list s číslom prílohy v názve preto neprejdú ako energetický
  certifikát, ale idú na preverenie; pravidlo bez znakov obsahu dá vždy na preverenie;
- včasnosť (F01) určí kategóriu regiónu z krajov miesta realizácie podľa mapy `kraje` v balíku (bez ohľadu na
  medzery a veľkosť písmen). Neznámy kraj alebo kategória mimo VRR a MRR dá na preverenie, lebo od kategórie
  závisí alokácia aj deň uzavretia výzvy;
- úryvok od modelu musí byť v texte doslovne, zodpovedať vzoru a nesmie zodpovedať zakázanému vzoru
  (napr. dátum splatnosti nesmie prejsť ako dátum vyhotovenia, zostatok nie ako suma platby);
- pri niektorých náležitostiach sa kontroluje aj celý riadok, z ktorého úryvok pochádza (IBAN z riadku
  „Protistrana“ nesmie prejsť ako číslo účtu prijímateľa); pozri Test 4;
- zatriedenie zmeny berie najprísnejší rozpoznaný druh a nerozpoznanú zmenu dáva človeku.

### Prečo TypeScript na Node a nie Python

Kontroly sú čisté funkcie nad JSON, 799 žiadostí prejde za 0,3 s. Čas určuje model v Ollame (natívny kód),
nie jazyk okolo neho. Node 24 spúšťa TypeScript bez kompilácie a má vstavané HTTP, SQLite a zlib, takže
projekt nemá žiadnu závislosť. Python by dával zmysel až pri OCR skenovaných príloh a pri čítaní tabuliek
z XLSM (Príloha č. 8 ŽoNFP), kde má lepšie knižnice.

### Škálovanie

- Nová výzva: nový balík pravidiel a prípadne pár nových kontrol. Normalizácia ITMS21+ je spoločná.
- Nový krok procesu: nový modul s vlastným typom vstupu.
- Viac používateľov: server je bezstavový okrem auditnej tabuľky `posudky` v SQLite, tú možno vymeniť za Postgres.
- Viac dokumentov: volania modelu sú nezávislé, dajú sa radiť do frontu a rozdeliť na viac strojov.

## Dáta

- **Žiadosti:** verejné API ITMS21+ (`https://api.itms21.sk/public/v1/zonfp`), 9 411 žiadostí obdobia
  2021–2027, z toho 799 v tejto výzve. Obsahuje údaje formulára (popis, aktivity, rozpočet, ukazovatele,
  žiadateľ), nie prílohy.
- **Výsledok a dôvod:** stav z ITMS21+ a zoznamy schválených, neschválených a zastavených žiadostí po
  hodnotiacich kolách zo stránky SIEA (94 PDF). Pri neschválených je dôvod: nedostatok finančných
  prostriedkov alebo nesplnenie podmienok poskytnutia príspevku. Ktorá podmienka, zverejnené nie je.
- **Pravidlá:** balík výzvy z ITMS21+ (`/dokument/<uuid>`), text výzvy, zoznam príloh, kritériá výberu,
  merateľné ukazovatele; VZP 2.2, príručka DOP 3.2 s prílohou č. 12, príručka VO v2 (`data/zdroje/`).
- **Projekty** (`/projekt`): 242 projektov výzvy so zmluvou, ukazovateľmi, harmonogramom monitorovania
  a 2 336 zmenami (predmet, číslo dodatku, názvy príloh).
- **ŽoP a VO** (`/zop`, `/uctovnydoklad`, `/verejneobstaravanie`, `/dodavatelobstaravatel`): 1 367 ŽoP,
  8 650 výdavkov, 1 308 dokladov s položkami, 2 144 VO prijímateľov (659 viazaných na projekty výzvy).
  Niektoré záznamy API nevracia (HTTP 404), tie sa preskočia.
- **Výzvy** (`/vyzva`, `/planovanavyzva`): 182 výziev Programu Slovensko s kolami a verziami a denné
  snímky plánovaných výziev na sledovanie posunov.
- Verejné dáta neobsahujú: dokumenty ŽoP, skutočné hodnoty MU, výsledky kontroly VO, schválenie ŽoP.
  Tieto vstupy zadáva používateľ; bez nich sú príslušné pravidlá „neoverené“.

## Výsledky testov

Testy 1 a 2 sú z 13. 11. 2026 (test 1 zopakovaný 15. 11. 2026 s rovnakým výsledkom), testy 3 a 4 z 15. 11. 2026.

### Test 1: pravidlá z údajov formulára na 799 reálnych žiadostiach

Skutočný výsledok je z ITMS21+ a zo zoznamov rozhodnutí SIEA. Celý beh trvá 0,3 s, bez modelu.

| Skupina podľa poskytovateľa | Žiadostí | Softvér hlási nesplnenú podmienku |
|---|---|---|
| Podmienky splnili (schválené alebo neschválené len pre nedostatok peňazí) | 480 | 9 (1,9 %, falošný poplach) |
| Neschválené pre nesplnenie podmienok | 108 | 19 (17,6 %) |
| Zastavené konanie | 179 | 22 |

Najviac rozlišuje hodnota za peniaze pri OZE (16 z 86 neschválených oproti 7 z 373 vyhovujúcich) a minimálna
výška NFP (2 neschválené, 3 zastavené, 0 vyhovujúcich). Väčšinu zamietnutí z verejných údajov vidieť nie je.

### Test 2: lokálny model qwen3.5:9b ako čitateľ textu

| Časť | Prípadov | Výsledok |
|---|---|---|
| Reálne popisy žiadostí, ktoré podmienky splnili (pravidlo L07) | 60 | 45 splnené, 3 nesprávne „nesplnené“, 12 na preverenie |
| Reálne popisy žiadostí neschválených pre nesplnenie podmienok | 30 | 24 splnené, 1 nesplnené, 5 na preverenie |
| Vymyslené popisy neoprávnených budov | 20 | 20 správne „nesplnené“ |
| Chybné plnomocenstvá, jedna otázka na dokument | 20 | 1 až 2 správne, 18 až 19 nesprávne „splnené“ (dva behy) |
| Chybné plnomocenstvá, každá náležitosť zvlášť so vzorom | 20 | 20 správne, vždy presne vynechaná náležitosť |
| Úplné plnomocenstvá, každá náležitosť zvlášť | 5 | 5 „na preverenie“ (podpis treba pozrieť), ako má byť |
| Chybné plnomocenstvá s inými formuláciami | 8 | 8 „nesplnené“, ale pri 5 softvér hlási aj náležitosti, ktoré v dokumente sú |
| Úplné plnomocenstvá s inými formuláciami | 2 | 1 správne, 1 nesprávne „nesplnené“ |

Čo z toho plynie:

- Jedna otázka na celý dokument je na hľadanie chýbajúcej náležitosti nepoužiteľná.
- Overovanie po náležitostiach nepustilo ani jeden z 28 chybných dokumentov ako „splnené“. Cenou sú falošné
  poplachy pri formuláciách, ktoré model nepozná: v úplnom dokumente nenašiel dátum v tvare
  „V Starej Turej, 3. marca 2025“ ani podpis bez slova „podpis“.
- Vzory náležitostí boli ladené na dokumentoch z piateho riadku tabuľky, preto je ten výsledok optimistický.
  Skutočnú mieru ukážu až reálne dokumenty.
- Opakovaný beh plnomocenstiev 19. 11. 2026 po pridaní `vzorOkolie` (pri podpise smie vzor sedieť aj o riadok
  vedľa citovaného úryvku) dal rovnaké čísla v riadkoch 4 až 8:
  - žiadny nový falošný OK;
  - falošné poplachy pri iných formuláciách sa nezmenili (5 z 8 chybných, 1 z 2 úplných), lebo ich príčina je
    iná: meno splnomocnenca a dátum v nezvyčajnej formulácii.

  `vzorOkolie` odstránilo falošný poplach v demo podaní B z Podateľne, kde model citoval meno pod čiarou na
  podpis namiesto riadku s podpisom.
- Jedna kontrola textu trvá asi 5 s, plnomocenstvo so šiestimi náležitosťami asi 25 s. Platí to s celým
  modelom na grafickej karte (`num_gpu: 99`); pri automatickom rozdelení to bolo 17 až 20 s na kontrolu.

### Test 3: moduly na reálnych dátach a zasadené chyby

Do reálnych prípadov z ITMS21+ sa umelo vloží známa chyba (kópia prípadu, reálne dáta sa nemenia) a meria sa,
či ju softvér zachytí. Falošne OK = chyba je, ale cieľové pravidlo vyšlo „splnené“ alebo celý výrok
„bez zistení“ či „čiastočne overené“. Beh trvá asi 27 s, bez modelu.

| Modul | Zasadené chyby (príklady) | Prípadov | Zachytené | Falošne OK |
|---|---|---|---|---|
| Plánovanie výziev | zrušená výzva, predloženie po skončení, príprava dlhšia ako čas do uzávierky, stará verzia výzvy, plánovaná výzva po termíne | 290 | 290 | 0 |
| Verejné obstarávanie | ZMR s PHZ 60 000 EUR, jediná ponuka, zmluva nad PHZ, faktúry nad zmluvu, tri ZMR na rovnaký predmet v roku | 1 654 | 1 654 | 0 |
| Zmeny projektu | zmena miesta realizácie ako OoZ, vyššie NFP, koniec HA po 24 mesiacoch, ex ante po zmene, ex post 11 dní pred ŽoP, MU pod hranicou, chýba formulár | 1 400 | 1 400 | 0 |
| Žiadosť o platbu | suma nad výdavok, doklad dvakrát, doklad pred 2021, úhrada po 2029, DPH od neplatiteľa, zlý výpočet DPH, hotovosť 800 EUR, chýbajú prílohy, internet banking, výpis bez účtu, uhradená ŽoP druhýkrát | 2 593 | 2 593 | 0 |
| Merateľné ukazovatele | MU výstupu a výsledku na 94, 80, 50 a 0 % (aj s prahmi zmluvy), nepredložená monitorovacia správa | 3 125 | 3 113 | 0 |

Počet zasadených chýb závisí od referenčného dátumu (`KONTROLA_DNES`), lebo časť chýb sa viaže na termíny:
9 062 pri behu 15. 11. 2026, 9 058 pri behu 19. 11. 2026. Falošne OK bolo v oboch behoch 0.

12 nezachytených pri ukazovateľoch: projekty, kde jeden MU výsledku nemá v ITMS21+ cieľovú hodnotu; pravidlo je
„neoverené“, nie „splnené“. Pri naplnení 100 % a 97 % vyšlo pravidlo MU výstupu splnené pri 242 z 242
projektov a MU výsledku pri 239 z 242 (zbytočné poplachy len pri chýbajúcom cieli).

Sankčná kalkulačka: šesť ručne prepočítaných príkladov (krátenie 5 % = 50 000 EUR pri výstupe 90/100,
10,714 % pri výsledku 80/100, odstúpenie a „možnosť odstúpiť“ pod hranicou čl. 4.3, bez krátenia nad 95 %)
sedí s výstupom prepisu.

Pozor na výklad: zasadené chyby navrhol ten istý autor ako pravidlá. Test dokazuje, že pravidlá robia, čo
majú, a že chýbajúce údaje nevedú k „splnené“. Nedokazuje, že pravidlá pokrývajú všetky chyby, ktoré sa
v praxi vyskytujú. Na to treba skutočné výsledky kontrol (napr. zistenia SIEA a ÚVO).

Čo test našiel a čo sa opravilo:

- Pravidlo obdobia ŽoP preskočilo úhradu po 31. 12. 2029, keď doklad nemal dátum vyhotovenia, a pri projekte
  bez termínov hlavných aktivít nekontrolovalo ani hranice programu. Opravené: hranice programu sa kontrolujú vždy.
- Ukazovateľ s cieľom 0 (OZE v projekte bez OZE, 92 projektov) blokoval výpočet: pri 100 % bol zbytočný poplach,
  pri 50 % len „na preverenie“ namiesto „nesplnené“. Opravené: nezazmluvnený ukazovateľ do výpočtu nevstupuje.
- Výrok „bez zistení“ pri ŽoP bez dokladov znel ako súhlas, hoci faktúry sa nečítali. Pribudol výrok
  „čiastočne overené“.

Zistenia na reálnych dátach (treba overiť človekom, nie sú to obvinenia):

- ŽoP 401201FFF3300101: nárokovaných 264 889,48 EUR na doklad s hodnotou 49 303,25 EUR (ŽoP je v ITMS21+
  neuhradená).
- VO61189849: stavebné práce evidované ako zákazka malého rozsahu s PHZ 270 193 EUR (limit 50 000 EUR);
  prišli 3 ponuky, pravdepodobne chybne zaevidovaný postup.
- 47 z 242 projektov má koniec hlavných aktivít po 24 mesiacoch od účinnosti zmluvy (PPP č. 14); pravdepodobne
  predĺženie pre okolnosť vylučujúcu zodpovednosť alebo zmena výzvy, overiť.
- 91 zo 182 výziev bolo po vyhlásení zmenených; 3 zo 4 plánovaných výziev sú po plánovanom termíne nevyhlásené.
- Klasifikátor zmien: 345 zmien má dodatok k zmluve; 82 z nich (24 %) softvér zatriedil ako formálne alebo
  menej významné. Časť sú záznamy poskytovateľa o zapracovaní viacerých zmien do dodatku, preto to nie je
  presná chybovosť; skutočný formulár (OoZ alebo ŽoZZ) verejné dáta neuvádzajú.

### Test 4: lokálny model na syntetických dokumentoch ostatných modulov

Faktúry (P11), výpisy z účtu (P12), záznamy zo zadania zákazky (V07) a odôvodnenia zmien (Z08), každý
úplný a s jednou vynechanou náležitosťou. „Presne“ = dokument zamietnutý a v zdôvodnení je práve vynechaná
náležitosť. **Pôvodné** dokumenty slúžili aj na ladenie poistiek. **Nové** vznikli až po oprave,
s inými formuláciami a firmami (`scripts/09-test-llm-moduly.ts`, beh 19. 11. 2026, qwen3.5:9b).

| Časť | Chybné: falošne OK | Chybné: presne | Úplné: falošný poplach |
|---|---|---|---|
| P11 faktúra, pôvodné | 0 z 30 | – | 0 z 3 |
| P11 faktúra, nové | 1 z 20 (*) | 18 z 20 | 2 z 2 |
| P12 výpis, pôvodné | 0 z 12 (predtým 6) | 12 z 12 | 0 z 3 |
| P12 výpis, nové | 0 z 12 | 12 z 12 | 3 z 3 |
| V07 záznam VO, pôvodné | 0 z 18 | 18 z 18 (predtým 14) | 0 z 3 (3 na preverenie: podpis) |
| V07 záznam VO, nové | 0 z 18 | 15 z 18 (**) | 2 z 2 |
| Z08 odôvodnenie, pôvodné | 0 z 6 (predtým 2) | 6 z 6 | 1 z 3 |
| Z08 odôvodnenie, nové | 0 z 8 | 8 z 8 | 2 z 4 |

(*) Model uviedol hlavičku tabuľky položiek ako základ dane. Pribudla poistka na riadok úryvku: riadok
s „za MJ“, „množstvo“ alebo „jednotk“ nesmie byť základom dane a úryvok musí mať popisok aj sumu. Overená
je bez modelu na presnom úryvku (`scripts/overenie-poistiek.ts`), s modelom sa časť P11 nové chybné
znova nespustila.
(**) V troch prípadoch poistky nechali prejsť nesprávny úryvok (uzavretá zmluva ako PHZ, zoznam oslovených
ako uchádzači, zoznam ponúk ako zmluvná cena). Dokument bol aj tak zamietnutý pre inú náležitosť. Poistky
sú doplnené a overené bez modelu na presných úryvkoch.

Čo z toho plynie:

- Na nových dokumentoch je falošne OK 1 z 58. Jediný prípad sa vyriešil poistkou, ktorá sa doplnila až
  po behu. Presne pomenovaná náležitosť: 53 z 58.
- Cenou sú falošné poplachy na nových úplných dokumentoch: 9 z 11. Poistky odmietajú aj správne úryvky
  v nečakanej forme. Podľa zadania je to menšie zlo ako falošné OK, pre prax je to však hlavná slabina.
- Tri nové poistky V07 vznikli z nových dokumentov, ktoré tým prestali byť nezávislé. Férové číslo
  po tejto zmene by si vyžiadalo ďalšiu sadu nových dokumentov.

### Test 5: podateľňa na demo podaniach

`npm run test:podatelna`, bez modelu, 15 kontrol na podaniach z `demo/podania`:
- odhad zaradenia (sprievodný list, certifikát bez čísla) nevedie k „splnené“, kým ho kontrolór nepotvrdí;
- doplnenie spisu dodá chýbajúce prílohy;
- výpočtové pravidlá zachytia úsporu 27,4 % a hodnotu za peniaze 7 615 EUR/MWh;
- historická žiadosť z ITMS21+ zachytí NFP pod minimom;
- nečitateľné PDF je „chýba podklad“ s dôvodom;
- nečitateľný súbor s číslom prílohy „nepotvrdí“ text iného súboru zaradeného odhadom;
- sedí štatistika výzvy.

Všetkých 15 prešlo. Test zapisuje do dočasného priečinka, nie do `data/spisy`. Prvá verzia testu
zapisovala tam a pri upratovaní zmazala súbory spisov bežiaceho servera s rovnakým číslom.

### Test 6: testovacia sada nových podaní

`npm run test:sada`, bez modelu. Pätnásť nových podaní z `demo/testovacia-sada` prejde podateľňou cez HTTP ako
nové spisy (vlastný server, databáza v pamäti). Formulár má tvar detailu z API ITMS21+, prílohy idú podľa
oficiálnych vzorov a Príloha č. 8 je vzor výzvy vyplnený a prepočítaný Excelom. Pri každom podaní test porovná
zaradenie súborov, návrh, vybrané znenie výzvy, body o znení (bez VER-ITMS a VER-KONTROLA, ktoré závisia
od prostredia) a stavy určujúcich pravidiel. Dve podania sa doplnia, v jednom kontrolór potvrdí zaradenie.
Ten istý test s argumentom priečinka overí aj novú skúšobnú žiadosť (`npm run test:nova`, očakávania
v `demo/nova-ziadost/riesenie/ocakavane.json`), pri nej aj časť zdôvodnenia P08b a D13.
Mäkší návrh, než sa čaká, test hlási zvlášť ako riziko falošného OK.

Všetkých 15 prešlo (0 rozdielov). Pri tvorbe sada našla päť chýb, všetky sú opravené:
- bez dátumu predloženia podateľňa dopĺňala dátum nahratia, takže žiadosť dostala neskoršie kolo a iné znenie
  výzvy; to je smer k falošnému OK;
- D07d nevedel doložiť neuvedený ukazovateľ OZE (pravidlo ho ráta ako 0 MW) a dával „na preverenie“; v ITMS21+
  uvádza len jeden z ukazovateľov PSKPRCO22a/b 41 zo 618 žiadostí s hlavnou aktivitou 2.2.2;
- P09 (Zmena č. 2) nemal doklad prítomnosti prílohy, preto nikdy nemohol byť „splnený“;
- generátor Prílohy č. 8 nechával prázdnu kapacitu druhého druhu OZE (vzorec H268 potom dá 0 EUR) a pri projekte
  bez OZE odpovedal „áno“ v L60, takže zošit nekrátil o 5 p. b.;
- P08b nečítal hlásenia hárku MU Budova (B13, I13). Pri úspore pod 30 % (prípad 11) preto vyhlásil vyplnený zošit
  za neúplný („absencia výpočtu“, chýba podklad) a radil ho doplniť; teraz dá na preverenie so skutočnou príčinou.

### Audit 21. 11. 2026

Nezávislý audit astry (Codex) našiel štyri ďalšie cesty k falošnému OK. Všetky sú opravené a pokrývajú ich
`npm run test:priloha8`, `npm run test:inventar` a `scripts/overenie-poistiek.ts`:
- pravidlá prítomnosti prílohy uznali akýkoľvek čitateľný text dlhší ako 40 znakov, napr. cestovný plán v slote
  energetického certifikátu;
- pri dvoch vyplnených zošitoch Prílohy č. 8 rozhodlo poradie súborov, takže opravený zošit z doplnenia sa mohol
  prehliadnuť;
- F01 nepoznal kód kategórie regiónu mimo VRR a MRR a kraj s preklepom alebo medzerou navyše bral ako MRR;
- vek údajov pre VER-KONTROLA sa rátal od behu kontroly, takže offline porovnanie so starým uloženým detailom
  vyzeralo čerstvo.

## Obmedzenia

- Prílohy žiadostí nie sú verejné. Kontrola obsahu príloh je preto overená len na vymyslených textoch.
  Aj znaky obsahu príloh (`parametre.obsah`) sú nastavené na rekonštrukciách a vzoroch. Reálny dokument
  s iným nadpisom pôjde na preverenie, nie do „splnené“.
- Podpis sa z textu overiť nedá. Pravidlo o plnomocenstve preto nikdy neskončí ako „splnené“, najlepší výsledok
  je „na preverenie“.
- Východisková spotreba energie je vo verejných dátach vyplnená len pri 208 zo 783 žiadostí, takže úspora
  a hodnota za peniaze pri energetickej efektívnosti sa dajú spočítať len pri nich.
- Rozpočet vo formulári môže obsahovať DPH. Hodnota za peniaze má preto tri pásma: do limitu splnené,
  do limitu × 1,23 na preverenie, nad tým nesplnené.
- Podmienky „na budovu“ (úspora, hodnota za peniaze) sa počítajú za celý projekt, lebo verejné dáta budovy
  nerozlišujú.
- Pravidlá sú v dvoch zneniach: Zmena č. 2 (kolá 1–78, čaká na schválenie človekom) a Zmena č. 3 (od kola 79).
  Testy 03 a 08 posudzujú všetky žiadosti platným znením (Zmena č. 3), výber znenia podľa kola overuje test 16.
- Kategórie budov podľa § 3 ods. 5 zákona č. 555/2005 Z. z. sú v otázke pre model prepísané voľne a treba
  ich overiť oproti aktuálnemu zneniu (novela č. 246/2026 Z. z. nebola preverená).
- Skenované PDF bez textovej vrstvy sa neprečítajú (bez OCR).
- Plánovanie výziev: pravidlá sú údaje ITMS21+, nie právny text. Posun plánovanej výzvy sa zistí až z dvoch a
  viac denných snímok (`npm run data:projekty` treba spúšťať pravidelne).
- VO: limity postupov sú overené len pre zákazky malého rozsahu (50 000 EUR) a podlimitné s oslovením troch
  subjektov (143 000 / 360 000 EUR) od 1. 8. 2024. RPO porovnáva len zhodu mien štatutárov v aktuálnom stave;
  príbuzenské vzťahy a historických štatutárov neoverí.
- Zmeny: zatriedenie je pravidlové podľa textu predmetu zmeny a typov z VZP čl. 16 a kap. 4.13 príručky.
  Presnosť voči skutočnému formuláru sa z verejných dát zmerať nedá.
- ŽoP: suma zmluvy z VO môže byť s DPH alebo bez nej, preto sa prekročenie hlási až nad sumou × 1,23.
  Opakované nárokovanie rozlišuje uhradené a neuhradené ŽoP podľa príznaku ITMS21+ `neuhradena`.
- Ukazovatele: kalkulačka SIEA počíta skutočnosť / cieľ, klesajúce ukazovatele (spotreba energie, emisie)
  priamo nepodporuje; softvér počíta podiel dosiahnutého poklesu a uvádza to v náleze.
- Prahy z čl. 4.3 zmluvy a maximálne zníženie COV sú v každej zmluve iné a verejné nie sú; zadáva ich používateľ.
