# Cvičná sada: verejné obstarávanie (modul VO)

Modul VO nie je v Podateľni. Je na karte **Kontrola**, v kroku procesu **Verejné obstarávanie**.

- Pracuje s 659 reálnymi VO prijímateľov výzvy `PSK-SIEA-002-2023-DV-EFRR` z verejných údajov ITMS21+.
- Z dokumentov číta len jeden: záznam zo zadania zákazky (pravidlo V07).
- Úpravy v boxe **Údaje** platia len pre jedno posúdenie. Reálne dáta sa nemenia.

| Pravidlo | Čo kontroluje | Odkiaľ |
|---|---|---|
| V01 | PHZ nepresahuje limit postupu (malý rozsah do 50 000 EUR, podlimitná s oslovením troch subjektov pod 143 000 / 360 000 EUR) | údaje VO z ITMS21+ |
| V02 | VO nemá len 1 až 2 ponuky alebo jedinú platnú | údaje VO |
| V03 | cena zmlúv zodpovedá PHZ | údaje VO |
| V04 | faktúry neprevyšujú zmluvy | údaje VO a účtovné doklady |
| V05 | zákazka malého rozsahu nie je časťou rozdeleného predmetu | všetky VO obstarávateľa |
| V06 | štatutári obstarávateľa a dodávateľa nie sú tie isté osoby | online dopyt do RPO, predvolene vypnutý |
| V07 | záznam zo zadania zákazky má minimálne náležitosti | priložený dokument, číta ho lokálny model |

## 1. Záznamy zo zadania zákazky naslepo (Obec Dolné Posudzovce)

Príbeh nadväzuje na cvičnú žiadosť `demo/nova-ziadost`: obec po schválení obstarala štyri zákazky. Záznamy sú
v priečinku `zaznamy`. Niektoré sú úplné, v niektorých niečo chýba. Najprv každý posúď sám podľa zoznamu
náležitostí nižšie, potom ho daj softvéru a až nakoniec otvor `riesenie/RIESENIE.md`.

Náležitosti záznamu podľa Príručky k procesu a kontrole VO/O v2:
1. predmet zákazky;
2. predpokladaná hodnota zákazky v eurách;
3. kritérium na vyhodnotenie ponúk;
4. zoznam oslovených hospodárskych subjektov a dátum ich oslovenia;
5. zoznam uchádzačov, ktorí predložili ponuku;
6. identifikácia úspešného uchádzača;
7. konečná zmluvná cena ponuky úspešného uchádzača;
8. skutočnosti o prepojení zainteresovanej osoby a uchádzača podľa § 23 ZVO (konflikt záujmov);
9. meno, funkcia a dátum zodpovednej osoby;
10. podpis zodpovednej osoby (formálna náležitosť, kontroluje sa len s prepínačom **Kontrolovať aj podpisy**).

Postup:
1. Na karte **Kontrola** klikni v riadku krokov procesu na **Verejné obstarávanie**.
2. Do poľa „Hľadať kód, názov, subjekt“ napíš `VO06961964` a vyber ho. Je to reálne VO inej obce a slúži
   len ako nosič dokumentu. V07 posudzuje iba náležitosti záznamu, ostatné pravidlá posudzujú údaje nosiča.
3. V boxe **Dokumenty** vyber pri „Záznam zo zadania zákazky“ súbor `zaznamy\Zaznam_1_stavebne_prace.docx`.
   Políčko **Hodnotiť aj priložené dokumenty** sa zaškrtne samo.
4. Prepínač **Čítať text lokálnym modelom** nechaj zapnutý, bez neho zostane V07 „neoverené“.
   **Kontrolovať aj podpisy** nechaj vypnuté.
5. Stlač **Skontrolovať**. Posúdenie s modelom trvá rádovo minútu.
6. Pri náleze V07 si pozri, ktoré náležitosti softvér našiel (s úryvkom z textu) a ktoré nie.
7. Zopakuj kroky 3 až 6 so záznamami 2, 3 a 4. Stačí vybrať iný súbor v tom istom boxe.
8. Až potom otvor `riesenie\RIESENIE.md`; výsledok posledného behu s modelom je v `riesenie\beh-s-modelom.md`.

Na čo sa pozerať:
- Najhoršia chyba je „splnené“ pri zázname, v ktorom náležitosť chýba.
- Pri úplnom zázname je „na preverenie“ falošný poplach. Poistky modelu sú prísne a na nových dokumentoch
  odmietajú aj správne úryvky (README, test 4). Je to menšie zlo, ale stojí to čas kontrolóra.

## 2. Scenáre na reálnych VO so známym výsledkom

Model pri nich vypni, výsledok je potom vždy rovnaký a príde do sekundy. Vyber VO, v boxe **Údaje** zmeň
uvedené pole a stlač **Skontrolovať**. Pred ďalším scenárom vyber VO v zozname znova, tým sa údaje vrátia.

| # | VO | Čo zmeniť v boxe Údaje | Očakávaný výsledok |
|---|---|---|---|
| S0 | `VO06961964` | nič | V01 až V05 splnené, V06 a V07 neoverené, celkovo **na preverenie** |
| S1 | `VO06961964` | PHZ na 60000 | V01 **nesplnené** (limit malého rozsahu 50 000 EUR), celkovo **nesplnené podmienky** |
| S2 | `VO06961964` | počet prijatých ponúk na 1 | V02 **na preverenie** (rizikový indikátor) |
| S3 | `VO06961964` | ponuky 3, vylúčené 2 | V02 **na preverenie** (platná zostala jediná ponuka) |
| S4 | `VO06961964` | suma zmlúv na 30000 | V03 **na preverenie** (cena výrazne nad PHZ), V04 splnené |
| S5 | `VO06961964` | suma zmlúv na 10000 | V04 **na preverenie**: faktúry prevyšujú zmluvu aj bez DPH, rozdiel môžu vysvetliť dodatky, ktoré podliehajú kontrole VO |
| S6 | `VO06961964` | PHZ vymaž | V01 a V03 **neoverené** (chýbajúci údaj nikdy nevedie k „splnené“) |
| S7 | `VO01501526` | nič | podlimitné stavebné práce s PHZ 359 984,85 EUR tesne pod limitom 360 000 EUR, V01 splnené |
| S8 | `VO01501526` | PHZ na 365000 | V01 **nesplnené** |
| R1 | `VO02211653` | nič | reálne VO s jedinou ponukou, V02 **na preverenie** |
| R2 | `VO61189849` | nič | jediné VO výzvy s nesplnenou podmienkou: zákazka malého rozsahu s PHZ 270 193,23 EUR. Softvér nevie, či ide o zle zaevidovaný postup v ITMS21+, alebo o porušenie; to posúdi kontrolór |

Pri každom VO ukazuje box pod nálezmi aj to, aký druh kontroly VO podľa príručky prichádza do úvahy (od 50 000 EUR
kontrola po uzavretí zmluvy, pod touto hranicou overenie hospodárnosti pri finančnej kontrole).

## 3. Voliteľne: konflikt záujmov cez register RPO (V06)

V boxe **Údaje** prepni „Overiť štatutárov online v registri RPO“ na **áno**:
- Aplikácia pošle IČO obstarávateľa a dodávateľov do verejného API Štatistického úradu. Je to jediný online
  dopyt v aplikácii a je predvolene vypnutý.
- Mená štatutárov sa porovnajú a neukladajú sa.
- Porovnáva sa len zhoda mien v aktuálnom stave. Príbuzenské vzťahy ani historických štatutárov softvér neoverí.
- Má zmysel len pri reálnom VO, vymyslené subjekty v registri nie sú.

## Čo modul zatiaľ nerobí

- Z dokumentácie VO číta len záznam zo zadania zákazky. Výzvu na predkladanie ponúk, súťažné podklady, zmluvu,
  čestné vyhlásenia ani zápisnicu z otvárania ponúk nekontroluje.
- Limity postupov overuje len pri zákazkách malého rozsahu a podlimitných s oslovením troch subjektov od 1. 8. 2024.
- Konflikt záujmov preveruje len cez RPO. Ďalšie registre (konečný užívateľ výhod, obchodný register, ÚVO)
  sú v `TODO.md`, úloha T1.

## Overenie

- `npm run test:demo-vo` prejde všetkých 11 scenárov a 4 záznamy bez modelu cez HTTP rozhranie, ako ich robí
  karta Kontrola (vlastný server s databázou v pamäti).
- `npm run test:demo-vo -- --model` posúdi záznamy aj lokálnym modelom a výsledok zapíše do
  `riesenie/beh-s-modelom.md`. Test zlyhá, ak záznam s chýbajúcou náležitosťou vyjde ako splnený.
- `npm run demo:vo` vytvorí záznamy a riešenie znova (`scripts/23-demo-vo.ts`).
