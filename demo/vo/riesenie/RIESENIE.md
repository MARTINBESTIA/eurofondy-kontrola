# Riešenie: záznamy VO Obce Dolné Posudzovce

Otvor až po vlastnom posúdení. Pravidlo V07 žiada v zázname zo zadania zákazky 10 náležitostí
(zdroj: MD č. 26, Príručka k procesu a kontrole VO/O verzia 1.0; ostatné náležitosti záznamu V07 neoveruje);
podpis je formálna náležitosť a kontroluje sa len pri zapnutom prepínači „Kontrolovať aj podpisy“.

| Súbor | Čo v ňom chýba | Čo má softvér urobiť (model zapnutý) |
|---|---|---|
| `Zaznam_1_stavebne_prace.docx` | nič, záznam je úplný | ideálne „splnené“; „na preverenie“ alebo zamietnutie je falošný poplach (známa slabina poistiek, README test 4) |
| `Zaznam_2_stavebny_dozor.docx` | zoznam oslovených hospodárskych subjektov a dátum ich oslovenia | V07 nesmie byť „splnené“; správne je „nesplnené“ s náležitosťou „zoznam oslovených hospodárskych subjektov a dátum ich oslovenia“ medzi nenájdenými |
| `Zaznam_3_fotovoltika.docx` | skutočnosti o prepojení zainteresovanej osoby a uchádzača podľa § 23 ZVO (konflikt záujmov) | V07 nesmie byť „splnené“; správne je „nesplnené“ s náležitosťou „skutočnosti o prepojení zainteresovanej osoby a uchádzača podľa § 23 ZVO (konflikt záujmov)“ medzi nenájdenými |
| `Zaznam_4_energeticky_certifikat.docx` | predpokladaná hodnota zákazky v eurách | V07 nesmie byť „splnené“; správne je „nesplnené“ s náležitosťou „predpokladaná hodnota zákazky v eurách“ medzi nenájdenými |

Prečo sú niektoré prípady zradné:
- Záznam 2 nemá zoznam oslovených ani dátum oslovenia, ale má zoznam doručených ponúk s dátumom. Model môže
  zoznam ponúk vydávať za zoznam oslovených.
- Záznam 4 nemá predpokladanú hodnotu zákazky, ale má sumy ponúk a objednávky. Model môže sumu objednávky
  vydávať za predpokladanú hodnotu.
- Záznam 3 nemá vyhlásenie o konflikte záujmov; ostatné náležitosti sú úplné.

Ako dopadol posledný beh s modelom, je v `beh-s-modelom.md` v tomto priečinku; súbor zapíše
`npm run test:demo-vo -- --model`. Sadu znova vytvorí `npm run demo:vo`, test bez modelu je `npm run test:demo-vo`.
