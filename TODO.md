# TODO

Evidencia otvorených úloh projektu. Vedie ju Claude, dopisovať môže aj astra (Codex). Každá položka
má dátum zápisu, kto ju zadal, čo presne treba urobiť a kedy je hotová. Stav: `[ ]` otvorené,
`[~]` rozpracované, `[x]` hotové (hotové položky zostávajú dole s dátumom a commitom).

Prehľad všetkých využití softvéru v procese verejného obstarávania (hotové aj návrhy, so stavom a zdrojmi)
je v `VYUZITIA-VO.md`.

## Otvorené

### [ ] T1. Dohľadať a overiť čo najviac údajov z verejných zdrojov (web search, API, scrapery)

- **Zadal:** používateľ, 24. 11. 2026.
- **Cieľ:** pri každom bode, ktorý dnes končí ako „Softvér neoveril“ alebo „na preverenie“, prejsť
  všetky dostupné verejné zdroje (API, verejné vyhľadávania, otvorené dáta, web search). Kde sa dá,
  údaj dohľadať a skontrolovať automaticky. Kde sa nedá, zapísať prečo.
- **Prvý krok:** pri každom zdroji zistiť, či je dostupný, akou cestou (API, otvorené dáta, webové
  vyhľadávanie), za akých podmienok použitia a či vyhľadávanie stojí peniaze. Až potom implementovať.
- **Kandidáti** (všetko označené [overiť] je zatiaľ neoverený predpoklad):

| Bod dnes | Zdroj | Čo by sa overilo |
|---|---|---|
| G02 konkurz (iné subjekty ako obce a VÚC) | Register úpadcov (ru.justice.sk), Obchodný vestník, RPO | konkurz, reštrukturalizácia, likvidácia |
| G03 exekúcie | Centrálny register exekúcií (cre.sk) [overiť: verejné a bezplatné vyhľadávanie] | vedie sa exekúcia nad 500 EUR |
| G05 tresty právnickej osoby | Zoznam odsúdených právnických osôb (esluzby.genpro.gov.sk), podľa výzvy verejne dostupný | trest zákazu dotácií alebo pomoci z fondov EÚ |
| G10, DS1 vlastníctvo | kataster (katasterportal.sk, oversi.gov.sk) [overiť: otvorené dáta ÚGKK a podmienky použitia] | vlastník budovy, ťarchy a záložné právo |
| G10 nájom a súhlasy | weby obcí, Centrálny register zmlúv [overiť] | zverejnená nájomná zmluva, jej doba |
| G15 EDES | verejne zverejnené vylúčenia EK [overiť]; neverejná časť je nedostupná | aspoň zverejnené vylúčenia |
| PPP 6, P03 uznesenie | web obce (úradná tabuľa, uznesenia zastupiteľstva), web search | či odkaz v popise projektu vedie na uznesenie o programe rozvoja |
| Prílohy 5 a 6 | zoznam energetických audítorov, register energetických certifikátov [overiť] | audítor a certifikát existujú a sedia s budovou |
| Príloha 7 | zoznam autorizovaných stavebných inžinierov (SKSI) [overiť] | autorizácia projektanta |
| VO: konflikt záujmov | RPO (už voliteľne pri V06), Register partnerov verejného sektora, obchodný register, ÚVO (vestník, zoznam hospodárskych subjektov, zákazy účasti) [overiť] | prepojenia obstarávateľa a uchádzačov, aj historické |
| VO, ŽoP: dodávatelia | zoznamy daňových a poistných dlžníkov (Finančná správa, Sociálna poisťovňa, zdravotné poisťovne) [overiť] | dlhy dodávateľa, rizikové indikátory |
| R1 bezúhonnosť | register trestov: **nedostupný** (osobné údaje, len oprávnený orgán) | nič, zostáva na poskytovateľovi |

- **Pravidlá, ktoré platia stále:**
  - Len čítanie verejných zdrojov (GET): bez prihlásenia, bez CAPTCHA, v súlade s podmienkami stránky
    a robots.txt, s obmedzenou rýchlosťou dopytov.
  - Používateľ určil: „Nikomu nič neposielaj!“. Za používateľa sa nič neodosiela ani nevypĺňa.
  - Dopyt pošle tretej strane IČO žiadateľa alebo dodávateľa. Každý zdroj sa preto zapne až po výslovnom
    súhlase používateľa a v spise bude len voliteľným prepínačom, rovnako ako online RPO pri VO.
  - Testy bežia bez siete, na uložených vzorkách odpovedí.
  - Osobné údaje (napr. mená štatutárov) sa neukladajú do auditu, KB ani AIs-interface; vzorom je
    `naAudit` v `src/server/server.ts`.
  - Nález z registra cituje zdroj a čas dopytu. Ak je zdroj nedostupný alebo nejednoznačný, bod zostáva
    „Softvér neoveril“ alebo „na preverenie“, nikdy nie „splnené“.
  - Cvičné podania majú vymyslených žiadateľov. Pre ne treba vzorové odpovede, inak by register
    hlásil „nenájdené“.
- **Hotovo, keď:**
  - Pri každom kandidátovi je zapísané, či je dostupný, akou cestou a za akých podmienok.
  - Vybrané zdroje sú voliteľné kontroly s testami na vzorových odpovediach.
  - Používateľ ich zapnutie odsúhlasil.

### [ ] T2. Opraviť zavádzajúce označenie neoverených bodov v module žiadostí

- **Zistil:** Claude, 24. 11. 2026. Čaká na rozhodnutie používateľa.
- **G11 (štátna pomoc):** údaje o využití kapacity uvádza žiadateľ v Prílohe 8 a poskytovateľ ich overuje
  z predložených dokumentov (výzva Zmena č. 3, txt r. 456–459). Text „Z podkladov žiadosti sa nedá overiť“
  preto nie je pravdivý. Správny stav je `na_preverenie` s odkazom na strop 20 % v Prílohe 8.
- **G10:** text má spomenúť aj nájomné zmluvy a súhlasy vlastníka či spoluvlastníkov v Prílohe 8
  (txt r. 416–428, 433).
- **Názov skupiny** „Softvér neoveril: chýbajú údaje alebo dokumenty“ (`web/ui.js:27`) nemá naznačovať,
  že žiadateľ niečo vynechal. Údaje sú v registri inej inštitúcie alebo sa overujú až po schválení.
- **Hotovo, keď:** stavy a texty sú opravené, testy `test:sada`, `test:nova` a `test:moduly` prechádzajú
  a README zodpovedá novým stavom.
- **Podrobnosti:** KB `projects/eurofondy-kontrola/2026-11-24-unverified-points-categories.md`.

### [ ] T3. Spresniť poistky pravidla V07 (záznam zo zadania zákazky)

- **Zistil:** Claude, 24. 11. 2026, na cvičnej sade `demo/vo` (dva behy s qwen3.5:9b, rovnaký výsledok).
- **Falošné OK nevzniklo.** Ukázali sa však dve slabiny, podrobnosti sú v `demo/vo/riesenie/beh-s-modelom.md`
  (kontrolór ho má čítať až po cvičení):
  - Keď model náležitosť nenájde, náhradný vzor ju označí za spornú aj podľa nesúvisiaceho čísla alebo dátumu.
    Vzor pre predpokladanú hodnotu zachytí ľubovoľné číslo (aj číslo paragrafu) a vzor pre oslovenie ľubovoľný
    dátum (aj dátum doručenia ponúk). Správne zamietnutie sa tak zmäkčí na „na preverenie“.
  - Úplný záznam dostal „nesplnené“, lebo model pri zozname uchádzačov neuviedol úryvok a táto náležitosť
    nemá náhradný vzor. Je to falošný poplach a podľa priority používateľa menšie zlo, ale stojí čas kontrolóra.
- **Návrh:**
  - Náhradný vzor pre hodnotu nech žiada sumu v eurách.
  - Vzor pre oslovenie nech vynechá riadky o doručených alebo predložených ponukách.
  - Úryvok už použitý pri inej náležitosti nech sa nepočíta.
  - Zoznam uchádzačov nech dostane vlastný vzor.
- **Hotovo, keď:** nové poistky sú overené bez modelu na presných úryvkoch a test 09 aj
  `npm run test:demo-vo -- --model` nemajú falošné OK.

## Hotové

### [x] T4. Aktualizovať balík pravidiel VO na príručku MD č. 26

- **Zistil:** Claude, 28. 11. 2026, pri zostavovaní `VYUZITIA-VO.md` (riadky U02, U58, U67).
- **Vyriešil:** Claude, 28. 11. 2026, commit „Fix V01 limit by VO start date and re-source VO pack to MD 26“.
- **Rozhodný deň:** deň začatia VO, teda odoslanie výzvy alebo oznámenia, inak začatie postupu (MD 26 r. 168;
  vyhláška ÚVO č. 421/2025 Z. z. § 4). ITMS21+ ho neuvádza, preto je vo formulári VO nové voliteľné pole
  „Deň začatia VO“ (`src/moduly/vo/modul.ts:297`). Deň pred 1. 8. 2024 alebo po účinnosti zmluvy dá „na preverenie“.
- **Limit V01 pre tovary a služby** (`src/moduly/vo/modul.ts:31-56`):
  - VO začaté 1. 8. 2024 až 31. 12. 2025: 143 000 EUR (príručka CKO VO v2, vyhláška ÚVO č. 481/2023 Z. z.);
  - 1. 1. až 30. 7. 2026: vyhláška č. 421/2025 uvádza 140 000 EUR, vtedy platná príručka v2 143 000 EUR;
    PHZ medzi nimi dá „na preverenie“;
  - od 31. 7. 2026: 140 000 EUR (MD 26 r. 246);
  - po 31. 12. 2027 limit softvér nepozná (nové prahy EÚ), dá „na preverenie“.
  - Stavebné práce 360 000 EUR, zákazky malého rozsahu 50 000 EUR. Limity príručky sú prísnejšie ako ZVO
    (§ 108 sumu nemá, § 110 ods. 1 žiada verejnú výzvu len pri stavebných prácach od 800 000 EUR).
- **Bez dňa začatia** berie softvér rozsah od 1. 8. 2024 po prvú účinnosť zmluvy (bez zmluvy po dnešok). Ak rozsah
  pripúšťa dva limity, PHZ medzi nimi dá „na preverenie“.
- **Spresnenie kritéria:** PHZ 141 000 EUR dá „nesplnené“, keď je zadaný deň začatia od 31. 7. 2026. Pri VO
  z 1. 1. až 30. 7. 2026 alebo bez dňa začatia dá „na preverenie“, lebo limit sa nedá určiť jednoznačne.
  Falošný poplach je tu menšie zlo ako falošné „splnené“.
- **Skôr začaté VO:** MD 26 nemá prechodné ustanovenie. Prijímateľ postupuje podľa aktuálnej verzie príručky
  (r. 100) so zohľadnením zmien vyhlášky ÚVO (r. 103). Softvér preto limit určuje podľa predpisov a príručky
  platných v deň začatia VO [výklad r. 100, overiť s ÚVO ako SO].
- **Účinnosť MD 26:** hlavička uvádza 31. 7. 2026, text r. 101 uvádza 1. 7. 2026. Pre deň v tomto medziobdobí
  dá softvér pri PHZ medzi 140 000 a 143 000 EUR „na preverenie“, takže rozpor falošné „splnené“ nespôsobí.
- **Tabuľka kontrol VO** (MD 26 r. 321–389, overené v DOCX): pri PHZ od 50 000 EUR kontroluje ÚVO ako SO
  zákazku po uzavretí zmluvy, ak ju poskytovateľ rizikovou analýzou vyhodnotí ako rizikovú. V riadku nadlimitných
  stavebných prác je „Povinná“ v tej istej bunke ako text o rizikovej zákazke; výklad je nejednoznačný.
- **Citácie:** V01 až V03, V05 až V07, VK1 až VK8, VK10 (`packs/PSK-SIEA-002-2023-DV-EFRR/vo.json`) a P07
  (`zop.json:112`) citujú MD 26, test 16 ich overil doslovne. V04 a VK9 citujú príručku DOP 3.2. VK7 cituje
  MD 26 r. 147 a 224, lebo samostatnú vetu CKO v2 o § 32 ods. 1 písm. e) a f) MD 26 nemá.
- **P07** teraz hovorí o posúdení VO: formálne posúdenie a analýza rizík poskytovateľa, pri rizikovej zákazke
  kontrola ÚVO ako SO (MD 26 r. 393, 465–467).
- **V07** overuje 9 z 15 náležitostí záznamu podľa MD 26 r. 228–242. Zvyšných 6 je v podmienke VK8 ako neoverené.
- **Overenie:** test 08 má 4 zasadené prípady V01 (každý 29/29, falošne OK 0) a 3 overenia na VO17195877.
  Štyri reálne VO na tovary a služby v pásme 140 000 až 142 999 EUR výsledok nezmenili: VO67174000 (zmluva
  účinná 29. 12. 2024) a VO17195877 (25. 3. 2025) sú „splnené“, VO65857751 a VO91012895 (v ITMS21+ vytvorené
  v máji 2024) „na preverenie“ ako predtým.

