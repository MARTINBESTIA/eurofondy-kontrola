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
npm start                 # demo na http://127.0.0.1:5177
```

Premenné prostredia: `PORT`, `VYZVA`, `KONTROLA_MODEL` (predvolene `qwen3.5:9b`), `OLLAMA_URL`,
`KONTROLA_DNES` (referenčný dátum pre termíny, predvolene dnes).

Softvér nič neodosiela. Jediný voliteľný online dopyt je overenie štatutárov v registri RPO v module VO
(pošle IČO obstarávateľa a dodávateľa); je predvolene vypnutý a mená sa do auditnej tabuľky neukladajú.

## Architektúra

```
packs/<výzva>/<modul>.json     balík pravidiel: verzia, zdroje, proces, pravidlá s citáciami a prahmi
packs/PSK/vyzvy.json           balík pre plánovanie výziev (celý Program Slovensko)
src/core/typy.ts               spoločné typy (Modul, Pravidlo, Nalez, Posudok, Pole, Projekt)
src/core/posud.ts              jadro: prejde pravidlá, spustí kontroly, zloží posudok a výrok
src/moduly/spolocne.ts         načítanie dát, dátumy, formátovanie
src/moduly/zonfp/              žiadosť a prílohy (normalizuj.ts, kontroly.ts, modul.ts)
src/moduly/vyzvy/              plánovanie výziev
src/moduly/vo/                 verejné obstarávanie (+ voliteľný dopyt do RPO)
src/moduly/zmeny/              zmeny projektu (pravidlový klasifikátor druhu zmeny, návrh OoZ/ŽoZZ)
src/moduly/zop/                žiadosť o platbu
src/moduly/ukazovatele/        merateľné ukazovatele (kalkulacka.ts = prepis sankčnej kalkulačky SIEA)
src/llm/ollama.ts              lokálny model: hľadá dôkaz v texte, vracia JSON
src/ingest/dokument.ts         DOCX / PDF / TXT -> text
src/server/server.ts           HTTP API + statické rozhranie (node:http, node:sqlite)
web/                           rozhranie (HTML + JS bez frameworku)
scripts/                       stiahnutie dát, normalizácia, testy
data/zdroje/                   stiahnuté dokumenty výzvy a zoznamy rozhodnutí (zdroj pravdy pre pravidlá)
data/odvodene/                 normalizované žiadosti s výsledkom a dôvodom
eval/                          výsledky testov (JSON)
```

Tri vrstvy, ktoré sa dajú meniť nezávisle:

1. **Dátová vrstva pravidiel** (`packs/`). Jeden súbor na výzvu, modul a verziu. Pravidlo má identifikátor,
   číslo PPP, druh, prahy a doslovnú citáciu s názvom dokumentu a časti. Nová verzia výzvy je nový súbor,
   kód sa nemení.
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
| `priloha` | prítomnosť povinnej prílohy podľa typu žiadateľa a aktivít | energetický certifikát pri opatrení 2.1.2 |
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
| Chybné plnomocenstvá, jedna otázka na dokument | 20 | 2 správne, 18 nesprávne „splnené“ |
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

## Obmedzenia

- Prílohy žiadostí nie sú verejné. Kontrola obsahu príloh je preto overená len na vymyslených textoch.
- Podpis sa z textu overiť nedá. Pravidlo o plnomocenstve preto nikdy neskončí ako „splnené“, najlepší výsledok
  je „na preverenie“.
- Východisková spotreba energie je vo verejných dátach vyplnená len pri 208 zo 783 žiadostí, takže úspora
  a hodnota za peniaze pri energetickej efektívnosti sa dajú spočítať len pri nich.
- Rozpočet vo formulári môže obsahovať DPH. Hodnota za peniaze má preto tri pásma: do limitu splnené,
  do limitu × 1,23 na preverenie, nad tým nesplnené.
- Podmienky „na budovu“ (úspora, hodnota za peniaze) sa počítajú za celý projekt, lebo verejné dáta budovy
  nerozlišujú.
- Pravidlá sú v znení Zmeny č. 3. Žiadosti z rokov 2024 a 2025 sa posudzovali podľa vtedy platnej verzie.
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
