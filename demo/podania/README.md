# Demo: kontrolór posudzuje žiadosti o NFP

Ukážkové podania do výzvy **PSK-SIEA-002-2023-DV-EFRR**. Výzvu vyhlásila SIEA a týka sa energetickej
efektívnosti a OZE vo verejných budovách. Podania A, B a C sú **vymyslené**: fiktívne obce, fiktívne
osoby a v päte každého dokumentu je upozornenie, že ide o ukážku. Podanie D je **skutočná historická
žiadosť** z verejného API ITMS21+. Jej prílohy ITMS nezverejňuje, preto obsahuje len odkaz na kód
žiadosti a údaje formulára sa načítajú z verejných dát.

Súbory znova vytvorí `npm run demo:podania` (PDF cez Edge alebo Chrome v režime bez okna, DOCX a ZIP bez
knižníc).

## Čo je v podaniach

| Podanie | Súbory | Čo je v ňom schválne | Čo má softvér navrhnúť |
|---|---|---|---|
| **A-Obec-Vzorova** (ZIP alebo priečinok) | formulár JSON, sprievodný list, prílohy č. 3, 7, 8 s číslom v názve, energetický certifikát **bez čísla** v názve | Žiadosť je úplná. Dva súbory nemajú číslo prílohy: certifikát a sprievodný list. Sprievodný list softvér podľa obsahu omylom odhadne ako Prílohu č. 3. | Pred potvrdením: **na preverenie** (P03 a P06 sú len odhad). Keď kontrolór sprievodný list vyradí a certifikát potvrdí: **čiastočne overené** (registre sa z podkladov overiť nedajú). |
| **B-Mesto-Ukazkovo** | formulár, plnomocenstvo (1), uznesenie (3), energetický audit (5), projektová dokumentácia (7) | Chýba energetický certifikát (6) a dokumentácia k oprávnenosti výdavkov (8). | **Chýbajú podklady**, výzva na doplnenie P06 a P08. |
| **B-Mesto-Ukazkovo-doplnenie** | Priloha_6, Priloha_8 | Doplnenie po výzve. | Po doplnení: **na preverenie**. Plnomocenstvo má všetky náležitosti, ale podpis sa z textu overiť nedá, treba pozrieť sken. |
| **C-Obec-Skusobna** | formulár, prílohy 1, 3, 6, 7, 8 | Bytový dom (neoprávnená kategória budovy), úspora len 27,4 % (minimum je 30 %), hodnota za peniaze 7 615 EUR/MWh/rok (limit 5 500), plnomocenstvo bez rozsahu úkonov. | **Zistené porušenie**: D07b, D07c, D13, L07 (model) a L01 (model, chýba rozsah). |
| **D-ITMS-historia** | dva odkazy `{"kodItms": …}` | NFP401201A973 Obec Miloslavov: skutočne neschválená pre nesplnenie podmienok. NFP401201A012 Obec Dunajská Lužná: skutočne schválená. | Miloslavov: **zistené porušenie** D12 (NFP 176 317 EUR je pod minimom 200 000). Pri oboch chýbajú prílohy, lebo ITMS ich nezverejňuje. |

## Postup v aplikácii

Aplikácia beží na **http://127.0.0.1:5177**. Ak nebeží, spustite `npm start` v priečinku projektu.
Nič sa nikam neodosiela; súbory spisov sa ukladajú do `data/spisy/` na tomto počítači.

1. **Podateľňa → + Nová žiadosť.** Vyberte výzvu PSK-SIEA-002-2023-DV-EFRR.
2. **Priložte podanie.** Pretiahnite `A-Obec-Vzorova.zip`, prípadne všetky súbory z priečinka
   `A-Obec-Vzorova`, a stlačte **Prijať podanie**. Softvér rozbalí ZIP, prečíta text, načíta formulár
   a otvorí nový spis (číslo `POD-2026-NNNN`).
3. **Skontrolujte zaradenie súborov** (tabuľka *Podklady v spise*):
   - súbory s číslom v názve sú zaradené podľa čísla;
   - `Energeticky_certifikat_ZS_Vzorova.pdf` je **odhad podľa názvu súboru**: overte ho tlačidlom *Text*
     a stlačte **Potvrdiť**;
   - `Sprievodny_list.pdf` je **odhad podľa obsahu** ako Príloha č. 3, čo je omyl. V rozbaľovacom zozname
     ho nastavte na **Nezaradený**.

   Box *Povinné prílohy podľa výzvy* sa prepočíta hneď, bez modelu.
4. **Posúdiť žiadosť.** S modelom to trvá asi 15 až 60 s, podľa počtu príloh, ktoré model číta.
   Výsledok:
   - výrok (napr. *Čiastočne overené*);
   - pruh pokrytia: koľko pravidiel sa naozaj overilo;
   - zistenia zoskupené podľa stavu, pri každom citácia výzvy a pri texte aj úryvok z dokumentu.
5. **Rozhodnutie kontrolóra.** Vyberte *Splnila podmienky*, *Výzva na doplnenie* alebo *Nesplnila
   podmienky*, doplňte poznámku a **Uložte rozhodnutie**:
   - pri výzve na doplnenie sa poznámka predvyplní zoznamom chýbajúcich podkladov z posudku;
   - rozhodnutie proti návrhu softvéru vyžaduje poznámku a v prehľade výzvy sa počíta zvlášť.
6. **Podanie B:** prijmite `B-Mesto-Ukazkovo.zip`, posúďte (*Chýbajú podklady*) a rozhodnite *Výzva na
   doplnenie*. Potom v spise v časti *Doplniť podklady* nahrajte `B-Mesto-Ukazkovo-doplnenie.zip` a
   posúďte znova. Prílohy 6 a 8 sú teraz priložené. *História posudkov* ukazuje oba posudky.
7. **Podanie C:** prijmite `C-Obec-Skusobna.zip` a posúďte. Softvér nájde porušenie podmienok
   s konkrétnymi číslami a zdôvodnením.
8. **Podanie D (história z ITMS21+):** *Nová žiadosť* → do poľa *Kód žiadosti z ITMS21+* napíšte
   `NFP401201A973` (bez súborov) → *Prijať podanie* → *Posúdiť*. Pod výrokom je skutočné rozhodnutie
   poskytovateľa na porovnanie.
9. **Prehľad výziev a úspešnosť.** Tlačidlo vľavo hore ukáže pri každej výzve s pravidlami:
   - počty spisov;
   - úspešnosť v podateľni: splnila / (splnila + nesplnila);
   - rozhodnutia proti návrhu softvéru;
   - verejné čísla ITMS21+ (predložené, schválené, splnili podmienky vrátane zásobníka, nesplnili).

   Pod tým je zoznam všetkých 183 výziev programu s úspešnosťou.

Spisy vľavo sú zoskupené podľa výziev, pri každom je štítok návrhu alebo rozhodnutia. Spis sa dá vymazať
(posudky ostanú v auditnej stope).

## Automatický príjem (e-mailový hook)

V prevádzke by podanie neprišlo cez GUI, ale automaticky. Hook prečíta e-mail s prílohami alebo
notifikáciu z ITMS21+ a pošle prílohy na **to isté API**, ktoré používa tlačidlo *Prijať podanie*.
Simulácia z príkazového riadku:

```powershell
npm run podanie -- demo/podania/C-Obec-Skusobna.zip --posud
npm run podanie -- --itms=NFP401201A973 --posud --bez-modelu
npm run podanie -- demo/podania/B-Mesto-Ukazkovo-doplnenie.zip --spis=12
```

Skript posiela len na lokálny server (127.0.0.1); iný server odmietne. Spis sa potom objaví v podateľni
so zdrojom „e-mail (simulácia hooku)“. Automaticky sa **nikomu nič neposiela**: výzvu na doplnenie aj
rozhodnutie odosiela človek mimo tohto softvéru.

## Čo demo nedokazuje

- Dokumenty A až C napísal ten istý autor ako pravidlá. Ukazujú tok práce, nie presnosť na reálnych
  prílohách. Tie nie sú verejné.
- Skeny bez textovej vrstvy softvér neprečíta (bez OCR). Takýto súbor označí ako nečitateľný.
- Podpis sa z textu overiť nedá. Plnomocenstvo preto nikdy nie je „splnené“, najviac „na preverenie“.
