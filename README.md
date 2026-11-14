# eurofondy-kontrola

Predkontrola dokumentov k eurofondom podľa verejných pravidiel výzvy. Softvér je v roli hodnotiteľa:
prejde podmienky poskytnutia príspevku (PPP) tak, ako ich určuje výzva, a ku každej povie, či je
splnená, nesplnená, či chýba podklad, alebo či sa z podkladov overiť nedá. Každé tvrdenie má citáciu
zdrojového odseku výzvy.

Prvý modul: **žiadosť o NFP a prílohy** pre výzvu `PSK-SIEA-002-2023-DV-EFRR` (SIEA, energetická
efektívnosť a OZE vo verejných budovách), pravidlá v znení **Zmeny č. 3 z 21. 8. 2025**.

## Spustenie

Treba Node 24 (beží TypeScript priamo, bez kompilácie a bez `npm install`), voliteľne Ollama s modelom
`qwen3.5:9b` a `pdftotext` (poppler) na čítanie PDF.

```bash
npm run data:stiahni      # 799 žiadostí výzvy z verejného API ITMS21+ (asi 2 min)
npm run data:normalizuj   # spojí ich s dôvodmi z verejných zoznamov rozhodnutí SIEA
npm run test:pravidla     # test 1: pravidlá na reálnych žiadostiach (0,3 s)
npm run test:llm          # test 2: lokálny model na reálnych a vymyslených textoch (asi 30 min; --iba=CD spustí len časti C a D)
npm start                 # demo na http://127.0.0.1:5177
```

Premenné prostredia: `PORT`, `VYZVA`, `KONTROLA_MODEL` (predvolene `qwen3.5:9b`), `OLLAMA_URL`.

## Architektúra

```
packs/<výzva>/<modul>.json     balík pravidiel: verzia výzvy, zdroje, pravidlá s citáciami a prahmi
src/core/typy.ts               spoločné typy (Ziadost, Pravidlo, Nalez, Posudok)
src/core/posud.ts              jadro: prejde pravidlá, spustí kontroly, zloží posudok a návrh
src/moduly/zonfp/              modul „žiadosť a prílohy“
    normalizuj.ts              ITMS21+ JSON -> Ziadost
    kontroly.ts                deterministické kontroly (čisté funkcie)
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
2. **Jadro a moduly** (`src/core`, `src/moduly`). Jadro nevie nič o konkrétnej výzve. Modul dodáva
   normalizáciu vstupu a kontroly. Ďalšie moduly (verejné obstarávanie, žiadosť o platbu, ukazovatele,
   zmeny projektu) pribudnú ako `src/moduly/<modul>/` s vlastnými balíkmi pravidiel.
3. **Vrstva modelu** (`src/llm`). Model nikdy nerozhoduje sám. Dostane jednu podmienku a text, vráti stav
   a doslovný úryvok. Ak úryvok v texte nie je, verdikt sa zahodí a bod ide človeku. Povinné náležitosti
   dokumentu sa overujú po jednej a úryvok musí navyše zodpovedať vzoru náležitosti z balíka pravidiel.

Štyri druhy pravidiel:

| Druh | Ako sa overuje | Príklad |
|---|---|---|
| `data` | výpočet z údajov formulára | NFP 200 000 až 5 000 000 EUR, úspora energie ≥ 30 %, hodnota za peniaze |
| `priloha` | prítomnosť povinnej prílohy podľa typu žiadateľa a aktivít | energetický certifikát pri opatrení 2.1.2 |
| `llm` | lokálny model hľadá dôkaz v texte | plnomocenstvo má všetky štyri náležitosti |
| `register` | softvér neoveruje, len povie, kde to overuje poskytovateľ | exekúcie, EDES, kataster |

Šesť stavov nálezu: splnené, nesplnené, chýba podklad, na preverenie, mimo podkladov, neuplatňuje sa.
Softvér nikdy nepovie „všetko je v poriadku“: vždy uvedie, koľko pravidiel overil a koľko nie.

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
  merateľné ukazovatele.

## Výsledky testov (13. 11. 2026)

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
