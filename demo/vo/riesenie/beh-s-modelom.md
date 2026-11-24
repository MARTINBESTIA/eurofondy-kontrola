# Beh s lokálnym modelom (V07)

Beh 2026-11-24, model qwen3.5:9b, nosič VO06961964, podpisy sa nekontrolovali. Vytvorené
príkazom `npm run test:demo-vo -- --model`. Výsledok modelu sa medzi behmi môže líšiť.

| Súbor | Čo chýba | V07 | Presne | Čas | Zdôvodnenie softvéru (skrátené) |
|---|---|---|---|---|---|
| `Zaznam_1_stavebne_prace.docx` | nič | nesplnene | nie | 29 s | V dokumente sa nenašlo: zoznam uchádzačov, ktorí predložili ponuku. Formálne náležitosti sa nekontrolovali (kontrola je vypnutá): podpis zodpovednej osoby. (zdroj: príloha č. zaznam (Zaznam_1_stavebne_prace.docx)) |
| `Zaznam_2_stavebny_dozor.docx` | zoznam oslovených hospodárskych subjektov a dátum ich oslovenia | na_preverenie | nie | 27 s | Nájdené náležitosti: 8 z 9. Sporné: zoznam oslovených hospodárskych subjektov a dátum ich oslovenia: model ju nenašiel, ale text obsahuje „Cenové ponuky doručené do 20.02.2026: DOZOR-TECH s.r.o. (8 940,00 EUR), STAVDOZOR Senica s.r.o. (9 360,00 EUR) a PROJEKT-DOZOR, s.r.o. (9 900,00 EUR). Ceny sú k“. Formálne náležitosti sa nekontrolovali (kontrola je vypnutá): podpis zodpovednej osoby. (zdroj: príloha č. zaznam (Zaznam_2_stavebny_dozor.docx)) |
| `Zaznam_3_fotovoltika.docx` | skutočnosti o prepojení zainteresovanej osoby a uchádzača podľa § 23 ZVO (konflikt záujmov) | nesplnene | áno | 24 s | V dokumente sa nenašlo: skutočnosti o prepojení zainteresovanej osoby a uchádzača podľa § 23 ZVO (konflikt záujmov). Formálne náležitosti sa nekontrolovali (kontrola je vypnutá): podpis zodpovednej osoby. (zdroj: príloha č. zaznam (Zaznam_3_fotovoltika.docx)) |
| `Zaznam_4_energeticky_certifikat.docx` | predpokladaná hodnota zákazky v eurách | na_preverenie | nie | 26 s | Nájdené náležitosti: 8 z 9. Sporné: predpokladaná hodnota zákazky v eurách: model ju nenašiel, ale text obsahuje „Zákazka malého rozsahu podľa § 1 ods. 14 ZVO, číslo zákazky DP-VO-04/2026“. Formálne náležitosti sa nekontrolovali (kontrola je vypnutá): podpis zodpovednej osoby. (zdroj: príloha č. zaznam (Zaznam_4_energeticky_certifikat.docx)) |
