# TODO

Evidencia otvorených úloh projektu. Vedie ju Claude, dopisovať môže aj astra (Codex). Každá položka
má dátum zápisu, kto ju zadal, čo presne treba urobiť a kedy je hotová. Stav: `[ ]` otvorené,
`[~]` rozpracované, `[x]` hotové (hotové položky zostávajú dole s dátumom a commitom).

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

(zatiaľ nič)
