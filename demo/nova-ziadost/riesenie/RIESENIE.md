# Riešenie: Obec Dolné Posudzovce

Otvorte až po vlastnom posúdení žiadosti. Žiadateľ, osoby, IČO aj všetky čísla sú vymyslené.

## Čo je v žiadosti zle

Formulár ŽoNFP žiada pri opatrení 2.1.2 (obnova budovy) výdavky v plnej výške: **476 428,20 EUR**. Plánovaná úspora primárnej energie je 48,3 % (266,8 → 138 MWh/rok). Pri úspore nad 40 % a najviac 50 % sú podľa PPP č. 13 oprávnené výdavky len 90 % (`data/zdroje/PSK-SIEA-002-2023/txt/Vyzva_PSK_2P1_SIEA_zmena_3.txt:480`). Projekt má aj inštaláciu zariadení OZE (opatrenie 2.2.2), preto sa ďalších 5 percentuálnych bodov neodpočítava (`:483`).

Záväzný zošit Prílohy č. 8 krátenie počíta sám: po krátení uvádza **428 785,38 EUR** (hárok „Rozpočet B1 - Value for Money“, bunka M210). Formulár tak pri budove žiada o **47 642,82 EUR** viac. Žiadaný NFP je 580 978,20 EUR, so správnym krátením by bol 533 335,38 EUR. Výdavky na OZE (104 550,00 EUR, bunka M270) sú vo formulári aj v zošite rovnaké.

Takáto chyba vznikne, keď žiadateľ prepíše do formulára sumy z rozpočtu stavby a krátenie podľa pásma úspory vynechá. Úspora (minimum 30 %) aj hodnota za peniaze sú v limitoch výzvy, sporná je len výška oprávnených výdavkov.

## Čo má softvér navrhnúť

Posudok bez lokálneho modelu (prepínač **Čítať prílohy lokálnym modelom** vypnutý):

- Návrh **na preverenie** (v aplikácii „Treba posúdenie človekom“).
- **P08b na preverenie** ako prvý bod v skupine **Musí posúdiť človek**. Softvér porovná oprávnené výdavky zo zošita s rozpočtom formulára po opatreniach. Pri opatrení 2.1.2 napíše, že suma formulára sa rovná výdavkom budovy pred krátením podľa pásma úspory (bunka M208), a cituje bunky zošita aj položky formulára. Rovnaký text je už pred posúdením v boxe **Povinné prílohy podľa výzvy**.
- **D13 splnené** s textom „Očakávaná výška: 90 %“. Spolu s P08b ukazuje, o koľko mal žiadateľ výdavky krátiť.
- V skupine **Overené a splnené** sú aj V01, F01, D01, D07a, D07b, D07c, D07d, D09, D12, D14, P03, P06, P07 a P08. P05 sa neuplatňuje.
- V skupine **Musí posúdiť človek** sú okrem P08b podmienky výzvy, ktoré softvér nekontroluje celé: predloženie riadne a včas a PPP č. 4, 6, 7, 8 a 13. Preto ani úplne správna žiadosť nedostane návrh „bez zistení“.
- V skupine **Softvér neoveril** sú registre (napríklad výkon rozhodnutia, EDES, majetkovo-právne vzťahy) a pri posudku bez modelu aj plnomocenstvo, kategória budovy a energetický audit (L01, L07, L05).

Automaticky to overuje `npm run test:nova`.

## Čo má urobiť kontrolór

Softvér rozhodnutie nevyberá. Kontrolór porovná sumy v náleze P08b so zošitom a s formulárom. Potom podľa postupu poskytovateľa vyzve žiadateľa na zosúladenie rozpočtu formulára so zošitom alebo zníži oprávnené výdavky na výšku zo zošita. Pri rozhodnutí v aplikácii treba doplniť poznámku, napríklad sumu 428 785,38 EUR pri opatrení 2.1.2.

## Čo táto skúška neoveruje

- Či obsah certifikátu a projektovej dokumentácie zodpovedá formuláru. Pri prílohách 3, 6 a 7 softvér overuje prítomnosť a typické znaky dokumentu, nie každý údaj.
- Podpisy, pečiatky a osvedčovaciu doložku, ktoré v skutočnom podaní overuje človek na skene originálu.
- Posudok s lokálnym modelom, ktorý číta plnomocenstvo a kategóriu budovy; jeho výsledok sa môže líšiť podľa modelu.
