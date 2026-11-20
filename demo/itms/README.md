# Demo podateľne na žiadosti obce Chorvátsky Grob

Kontrolór prijme osem súborov jedným nahratím. Na obrazovke vidí, ktorému projektu patria, čo je priložené a čo musí preveriť. Súčasťou sady je aj rovnaká žiadosť rozdelená na prvé podanie a následné doplnenie.

## Prvá ukážka

1. Spustite `npm start` z koreňa projektu s Node.js 24 a dostupným programom `pdftotext`. Otvorte [Novú žiadosť v podateľni](http://127.0.0.1:5177/#p/nova).
2. Stlačte **Stiahnuť ukážkové podanie (ZIP)** alebo použite [01-komplet.zip](01-komplet.zip). Pretiahnite ZIP do formulára a stlačte **Prijať podanie**. Alternatívne otvorte [priečinok subory](subory/) a vyberte všetkých osem súborov naraz. Pole pre kód ITMS nechajte prázdne.
3. V novom spise skontrolujte obec, názov projektu a osem súborov. Pri prílohách 3, 6, 7 a 8 má byť zelený výsledok kontroly prítomnosti. Cez **Text** pri rozpočte možno otvoriť prečítaný hárok a porovnať ho s kalkuláciou cien.
4. Na opakovateľnú skúšku vypnite **Čítať prílohy lokálnym modelom** a stlačte **Posúdiť žiadosť**. Pozrite výpočet úspory z 119,0248 na 54,8423 MWh/rok. Pomocou nálezov vidíte aj body, ktoré vyžadujú kontrolu človekom. Pri podpise treba prezrieť originál a jeho osvedčenie.

Pri samostatnej skúške obsahových pravidiel 20. 11. 2026 model `qwen3.5:9b` rozpoznal administratívnu budovu (L07). Vlastníctvo ostalo na overenie v katastri (G10). Plnomocenstvo (L01) posunul kontrolórovi na preverenie rozsahu a podpisov. Tieto kontroly na skúšobnom počítači trvali 18 sekúnd. Nahratie dokumentov a prvý prehľad ich prítomnosti fungujú aj pri vypnutom modeli.

## Čo vyskúšať

| Vstup | Úkon kontrolóra | Čo očakávať |
|---|---|---|
| [02-pred-doplnenim.zip](02-pred-doplnenim.zip) | Prijať ako **novú** žiadosť a posúdiť. | Chýba energetický certifikát (6) a podklady k rozpočtu (8). Vybrať **Výzva na doplnenie** a uložiť rozhodnutie. |
| [03-doplnenie.zip](03-doplnenie.zip) | V **tom istom spise** vybrať súbor v časti **Doplniť podklady**, nahrať a znova posúdiť. | Pribudnú tri súbory. Body P06 aj P08 sú splnené v rozsahu kontroly prítomnosti. V histórii sú oba posudky. |
| [04-sken.zip](04-sken.zip) | Prijať ako novú žiadosť. Otvoriť súbor pri prílohe 3. | Uznesenie je vizuálne čitateľné, PDF však má iba obraz. Súbor ostáva v spise a pravidlo P03 hlási nečitateľný podklad. |
| [05-historicky-nalez.zip](05-historicky-nalez.zip) | Prijať ako novú žiadosť a posúdiť. | Miloslavov žiadal 176 316,80 €. Pravidlo D12 zistí sumu pod hranicou 200 000 €. Aplikácia používa pravidlá zmeny č. 3 aj na túto žiadosť z roku 2024. Verejný historický zoznam uvádza všeobecnú kategóriu nesplnených podmienok. Priradenie konkrétneho pravidla je výsledkom našej predkontroly. |

Časy príjmu a kontroly prítomnosti zmeria `npm run test:demo-itms` cez lokálne HTTP rozhranie. Test porovná ZIP s jednotlivými súbormi, overí dve kolá jedného spisu, obrázkový sken aj výpočtový nález. Má vlastný port, databázu v pamäti a dočasný priečinok. Na prezentačnej podateľni môžete potom nahrať svoje vlastné skúšobné podklady.

## Pôvod dokumentov

| Dokument | Pôvod a rozsah |
|---|---|
| Formulár JSON | Výber polí z verejného detailu ITMS21+ v štruktúre API. Zahŕňa žiadateľa, aktivity, rozpočet a ukazovatele. Formulár pre kontrolóra neobsahuje historické rozhodnutie. [Chorvátsky Grob](https://api.itms21.sk/public/v1/zonfp/id/206978) · [Miloslavov](https://api.itms21.sk/public/v1/zonfp/id/202100) |
| Tlačový výpis ŽoNFP (PDF) | Čitateľný výber častí 1, 5, 6.A, 7, 9, 10 a 11.C podľa číslovania formulára výzvy. V spise ostáva medzi sprievodnými podkladmi. Štruktúrované hodnoty sa načítajú z JSON. |
| 1a – plnomocenstvo | Modelové zastúpenie na oficiálnom vzore SIEA. Osoba zástupcu je fiktívna. Miesta podpisov a osvedčenia sú označené pre ľudskú kontrolu. |
| 3 – uznesenia | Modelový výpis z verejných záznamov. Dátum, číslo a výsledok hlasovania o PHRSR sú doložené v uznesení 44/2025, str. 7. Údaje o pôvodnom územnom pláne uvádza obec v dokumentácii k jeho zmenám. [Uznesenia obce](https://www.chorvatskygrob.sk/data/news_files/chorvatskygrob/115290/uznesenia_33-45_ocz_09_09_2025.pdf) · [Územný plán, zmeny a doplnky](https://www.chorvatskygrob.sk/data/news_files/chorvatskygrob/65512/515-5-kb-textova_cast_zad_14_upr-navrh-pdf.pdf) |
| 6 a 7 – certifikát a projektová dokumentácia | Skrátené rekonštrukcie s hodnotami z verejnej žiadosti. Obsahujú energetickú triedu pred obnovou, plán po obnove, kapacity OZE a názornú schému. Technické výpočty, autorizáciu a projektové výkresy by kontrolór overoval na origináloch. |
| 8 – XLSM a podklad k oceneniu | Vyplnený záväzný zošit SIEA s výpočtami Excelu. Sumy deviatich aktivít pochádzajú z ITMS21+. Výmery, jednotkové ceny, porovnávacie ponuky, prevádzkové údaje a údaj o LV sú modelové. PDF umožňuje porovnať ceny a množstvá so zošitom. |

Rozsah príloh vychádza zo zoznamu v zmene č. 3 výzvy. V scenári koná splnomocnenec za obec. Príloha 2 sa na túto právnu formu nevzťahuje. Pri prílohe 4 predpokladáme, že poskytovateľ si nevyžiadal stanovisko k štátnej pomoci. Energetický audit nie je hlavnou aktivitou tohto projektu a projektová dokumentácia uvádza ukazovatele OZE, preto samostatná príloha 5 v balíku nie je. Výberové konania a registre ostávajú samostatnými zdrojmi kontrolóra. [Dokumentácia výzvy SIEA](https://www.siea.sk/zmena-c-3-vyzvy-s-kodom-psk-siea-002-2023-dv-efrr/)

Sada simuluje lokálny import. **Úplný balík** znamená všetky súbory tohto prezentačného scenára. Verejný detail historickej žiadosti sprístupňuje údaje formulára. Prílohy pre túto ukážku sme rekonštruovali.

Pri prezentácii môžete porovnať tri sumy. Obec žiadala **250 825,77 €**. V modelovom Exceli pri úspore primárnej energie 53,92 % vychádza podľa hárka `MU Budova 1`, bunky N44, krátenie výdavkov na obnovu budovy o 5 %. Po prepočte je v bunke M210 suma 203 686,17 € na budovu a v M270 suma 36 419,28 € na OZE, spolu **240 105,45 €**. V položke pre schválenie radou partnerstva používame modelový predpoklad „nie“. Obec zverejnila skutočnú schválenú sumu **248 453,79 €**. Dôvod rozdielu voči žiadanej sume by sa dal doložiť pôvodným rozhodnutím. [Verejná žiadosť](https://api.itms21.sk/public/v1/zonfp/id/206978) · [Oznámenie obce](https://www.chorvatskygrob.sk/novinka/142232/skvela-sprava-ziskali-sme-pol-miliona-eur-z-eurofondov)

## Obnovenie súborov

Hotové ZIP a jednotlivé súbory sa dajú použiť ihneď. Na ich opätovné vytvorenie vo Windows slúži `python scripts/demo-itms/vytvor.py`. Vyžaduje Python s ReportLab, Pillow a pypdfium2, Node.js 24, PowerShell 7, desktopový Word a Excel, vzory v `data/zdroje` a údaje z `npm run data:stiahni` a `npm run data:normalizuj`. Prepínač `--pouzi-office-subory` preberie hotové plnomocenstvo a zošit z priečinka `subory`. Čítanie nahratého Excelu v aplikácii pracuje s uloženými hodnotami bez spúšťania makier.
