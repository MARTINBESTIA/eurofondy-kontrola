# Nová žiadosť na skúšku kontrolóra

Žiadosť o NFP, ktorú ste v aplikácii ešte nevideli: **Obec Dolné Posudzovce**, obnova budovy obecného úradu, výzva **PSK-SIEA-002-2023-DV-EFRR**. Podanie obsahuje všetky povinné prílohy. Či je aj v poriadku, máte zistiť vy spolu so softvérom.

> Žiadateľ, osoby, IČO aj všetky čísla sú vymyslené a každý dokument to má v päte. Súbory sa nikam neposielajú, spis sa uloží len na tomto počítači.

## Čo je v podaní

| Súbor | Obsah |
|---|---|
| `Formular_ZoNFP_NFP401201DP01.json` | formulár ŽoNFP v štruktúre verejného API ITMS21+: žiadateľ, aktivity, rozpočet a ukazovatele |
| `Priloha_1a_Plnomocenstvo.pdf` | plnomocenstvo podľa vzoru 1a výzvy |
| `Priloha_3_Uznesenie_Dolne_Posudzovce.pdf` | výpis uznesení o programe rozvoja, územnom pláne a predložení žiadosti |
| `Priloha_6_Energeticky_certifikat.pdf` | energetický certifikát budovy pred obnovou |
| `Priloha_7_Projektova_dokumentacia.pdf` | projektová dokumentácia s energetickým hodnotením |
| `Priloha_8_Dokumentacia_k_OV.xlsm` | záväzný zošit Prílohy č. 8, vyplnený a prepočítaný v MS Excel |

Jednotlivé súbory sú v priečinku [subory](subory/), všetky spolu v [ZoNFP_Dolne_Posudzovce.zip](ZoNFP_Dolne_Posudzovce.zip).

## Postup kontrolóra

1. Spustite aplikáciu príkazom `npm start` v koreni projektu, ak ešte nebeží, a otvorte [Novú žiadosť v podateľni](http://127.0.0.1:5177/#p/nova).
2. V poli **Výzva, do ktorej žiadosť patrí** nechajte PSK-SIEA-002-2023-DV-EFRR.
3. Do poľa **Súbory podania** pretiahnite `ZoNFP_Dolne_Posudzovce.zip`. Môžete tiež kliknúť do poľa a vybrať naraz všetkých šesť súborov z priečinka `subory`. Pole **Kód žiadosti z ITMS21+** nechajte prázdne a stlačte **Prijať podanie**.
4. Aplikácia otvorí nový spis s číslom POD-2026-NNNN. Skontrolujte obec, názov projektu a šesť súborov v časti **Podklady v spise**. Každý súbor má byť zaradený k prílohe podľa čísla v názve. Box **Povinné prílohy podľa výzvy** ukazuje kontrolu príloh vrátane zošita Prílohy č. 8 ešte pred posúdením. Tlačidlo **Text** pri súbore ukáže, čo softvér zo súboru prečítal, pri zošite aj hodnoty buniek.
5. Pre opakovateľný výsledok vypnite **Čítať prílohy lokálnym modelom**. S modelom posudok trvá približne minútu a výsledok bodov, ktoré číta model, závisí od neho. Prepínač **Kontrolovať aj podpisy** nechajte vypnutý: skúšobné PDF podpisy nemajú a softvér tak kontroluje len obsah podľa požiadaviek výzvy. Stlačte **Posúdiť žiadosť**.
6. Prečítajte návrh, pruh pokrytia a nálezy v skupinách **Musí posúdiť človek**, **Overené a splnené**, **Softvér neoveril** a **Neuplatňuje sa**. Pri každom náleze je citácia výzvy a doklad zo spisu, teda súbor a riadok, pole formulára alebo bunka zošita. Čísla si overte v prílohách, najmä v zošite Prílohy č. 8.
7. V časti **Rozhodnutie kontrolóra** vyberte **Splnila podmienky**, **Výzva na doplnenie** alebo **Nesplnila podmienky**, napíšte poznámku a stlačte **Uložiť rozhodnutie**. Pri výzve na doplnenie je poznámka povinná. Ak zvolíte „splnila“ pri bodoch na preverenie, aplikácia vás upozorní.
8. Svoje zistenia porovnajte s riešením v [riesenie/RIESENIE.md](riesenie/RIESENIE.md). Otvorte ho až po vlastnom posúdení.

## Pre vývojára

- `npm run demo:nova` vytvorí podanie nanovo (`scripts/20-nova-ziadost.ts`, Windows s MS Excel a prehliadačom Edge alebo Chrome). Stavebné bloky zdieľa s testovacou sadou (`scripts/18-testovacia-sada.ts`).
- `npm run test:nova` prijme podanie cez HTTP na vlastnom serveri s databázou v pamäti, posúdi ho bez modelu a porovná výsledok s `riesenie/ocakavane.json`.
