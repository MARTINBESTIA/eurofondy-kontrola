// Test modulov na reálnych dátach ITMS21+ bez modelu.
// 1. Všetky reálne prípady: aké výroky a stavy pravidiel softvér dáva.
// 2. Zasadené chyby: do reálnych prípadov sa vloží známa chyba a meria sa, či ju softvér zachytí.
//    Najhorší omyl je „falošne OK“: chyba je, ale pravidlo vyšlo splnené alebo celý výrok bez zistení.
// 3. Ručne overené príklady (kalkulačka MU, klasifikátor zmien voči dodatkom).
// Výstup: eval/test-moduly.json (zobrazuje ho karta „Test na reálnych dátach“).
import fs from 'node:fs';
import path from 'node:path';
import { BEZ_DOKLADU, dokladyTextu, nacitajBalik, posud } from '../src/core/posud.ts';
import type { BalikPravidiel, Modul, Posudok, Stav } from '../src/core/typy.ts';
import { dnes, pridajDni, pridajMesiace, projekty, rozdielDni } from '../src/moduly/spolocne.ts';
import { zonfp } from '../src/moduly/zonfp/modul.ts';
import { vyzvy, uzavierka, STIAHNUTE, type VstupVyzva } from '../src/moduly/vyzvy/modul.ts';
import { vo, VSETKY as VSETKY_VO, limitPostupu, type VstupVo } from '../src/moduly/vo/modul.ts';
import { zmeny, zatried, limitHA, NAZOV_KAT, povinnePrilohy as prilohyZmeny, type VstupZmena } from '../src/moduly/zmeny/modul.ts';
import { zop, DOKLADY, VSETKY_ZOP, doklad, povinnePrilohy as prilohyZop, type VstupZop } from '../src/moduly/zop/modul.ts';
import { ukazovatele, jeZnizujuci, klucTerminu, type VstupUkazovatele } from '../src/moduly/ukazovatele/modul.ts';
import { kalkulacka } from '../src/moduly/ukazovatele/kalkulacka.ts';

const KOREN = path.join(import.meta.dirname, '..');
const VYZVA = process.env.VYZVA ?? 'PSK-SIEA-002-2023-DV-EFRR';
const balik = (m: Modul) => nacitajBalik(m.balikVyzva ?? VYZVA, m.id);
const ZAVAZNOST: Record<Stav, number> = { nesplnene: 3, chyba_podklad: 2, na_preverenie: 1, mimo_podkladov: 0, splnene: 0, neuplatnuje_sa: 0 };
const okVyrok = (p: Posudok) => p.navrh === 'bez_zisteni' || p.navrh === 'ciastocne_overene';
const t0 = Date.now();
const vystup: any = { cas: new Date().toISOString(), dnes: dnes(), vyzva: VYZVA, moduly: {} };

async function realne(m: Modul, b: BalikPravidiel) {
  const t = Date.now();
  const ids = m.pripady('', '', 1e9).pripady.map((p) => p.id);
  const navrhy: Record<string, number> = {}; const pravidla = new Map(b.pravidla.map((p) => [p.id, { id: p.id, nazov: p.nazov, pocty: {} as Record<string, number> }]));
  // Doklady (N9): každé „splnené“ cituje vstupy; presunuté = „splnené“, ktoré pre chýbajúcu citáciu išlo človeku.
  const doklady = { splnene: 0, bezDokladu: 0, presunute: 0 };
  for (const id of ids) {
    const p = await posud(m.nacitaj(id), b, m, { llm: false });
    navrhy[p.navrh] = (navrhy[p.navrh] ?? 0) + 1;
    // Body z inventára podmienok (druh rucne) nie sú pravidlá balíka, pridajú sa pri prvom výskyte.
    for (const n of p.nalezy) {
      if (!pravidla.has(n.pravidlo)) pravidla.set(n.pravidlo, { id: n.pravidlo, nazov: n.nazov, pocty: {} });
      const r = pravidla.get(n.pravidlo)!; r.pocty[n.stav] = (r.pocty[n.stav] ?? 0) + 1;
      if (n.stav === 'splnene') { doklady.splnene++; if (!n.doklady?.length) doklady.bezDokladu++; }
      if (n.zdovodnenie.startsWith(BEZ_DOKLADU)) doklady.presunute++;
    }
  }
  return { pripadov: ids.length, trvanieMs: Date.now() - t, navrhy, pravidla: [...pravidla.values()], ...(m.doklady ? { doklady } : {}) };
}

/** Spustí posudok na prípadoch so zasadenou chybou a vyhodnotí cieľové pravidlo. */
async function zasad(m: Modul, b: BalikPravidiel, nazov: string, pravidlo: string, ocakavane: Stav, vstupy: any[]) {
  let zachytene = 0, presne = 0, falosneOk = 0; const priklady: string[] = []; const stavy: Record<string, number> = {};
  for (const v of vstupy) {
    const p = await posud(v, b, m, { llm: false, });
    const n = p.nalezy.find((x) => x.pravidlo === pravidlo)!;
    stavy[n.stav] = (stavy[n.stav] ?? 0) + 1;
    if (ZAVAZNOST[n.stav] >= 1) zachytene++;
    if (n.stav === ocakavane) presne++;
    if (n.stav === 'splnene' || n.stav === 'neuplatnuje_sa' || okVyrok(p)) { falosneOk++; if (priklady.length < 3) priklady.push(`${p.ziadostKod}: ${n.stav} / ${p.navrh}: ${n.zdovodnenie.slice(0, 200)}`); }
  }
  const r = { nazov, pravidlo, ocakavane, n: vstupy.length, zachytene, presne, falosneOk, stavy, priklady };
  console.log(`  [${pravidlo}] ${nazov}: zachytené ${zachytene}/${vstupy.length}, presne ${presne}, falošne OK ${falosneOk}${priklady.length ? `\n     napr. ${priklady[0]}` : ''}`);
  return r;
}
const nacitaj = <V>(m: Modul<V>, id: string) => structuredClone(m.nacitaj(id)!) as V;
const vsetkyId = (m: Modul) => m.pripady('', '', 1e9).pripady.map((p) => p.id);

// ---------------------------------------------------------------- plánovanie výziev
{
  const m = vyzvy; const b = balik(m); console.log(`\n== ${m.nazov}`);
  const r: any = await realne(m, b);
  const ids = vsetkyId(m); const vs = ids.map((id) => nacitaj<VstupVyzva>(m, id));
  const otvorene = vs.filter((v) => v.vyzva && !v.vyzva.zrusena && !v.vyzva.uzavreta && uzavierka(v.vyzva, dnes()));
  const s_koncom = vs.filter((v) => v.vyzva?.ukoncena);
  const s_verziami = vs.filter((v) => (v.vyzva?.verzie.filter((x) => x.datum).length ?? 0) > 1);
  const planovane = vs.filter((v) => v.planovana);
  r.zasadene = [
    await zasad(m, b, 'Výzva zrušená', 'C01', 'nesplnene', otvorene.map((v) => { const x = structuredClone(v); x.vyzva!.zrusena = true; return x; })),
    await zasad(m, b, 'Predloženie po skončení výzvy', 'C01', 'nesplnene', s_koncom.map((v) => ({ ...structuredClone(v), datumPredlozenia: pridajDni(v.vyzva!.ukoncena!, 10) }))),
    await zasad(m, b, 'Príprava trvá dlhšie, ako ostáva do uzávierky', 'C03', 'nesplnene', otvorene.map((v) => ({ ...structuredClone(v), dniPripravy: rozdielDni(dnes(), uzavierka(v.vyzva!, dnes())!.datum) + 30, rezerva: 0 }))),
    await zasad(m, b, 'Žiadateľ čítal starú verziu výzvy', 'C04', 'nesplnene', s_verziami.map((v) => { const d = [...v.vyzva!.verzie].filter((x) => x.datum).sort((a, c) => c.datum!.localeCompare(a.datum!))[0].datum!; return { ...structuredClone(v), datumOboznamenia: pridajDni(d, -1) }; })),
    await zasad(m, b, 'Plánovaná výzva po termíne nevyhlásená', 'C05', 'na_preverenie', planovane.map((v) => { const x = structuredClone(v); x.planovana!.planVyhlasenia = '2026-01-15'; x.planovana!.vyhlasena = false; return x; })),
    // Bez dátumu predloženia je dnešný stav len informácia, nie „splnené“ (N21).
    await zasad(m, b, 'Otvorená výzva, plánovaný dátum predloženia nezadaný', 'C01', 'mimo_podkladov', otvorene.map((v) => ({ ...structuredClone(v), datumPredlozenia: null }))),
    // Plánovaná výzva, ktorá ešte nie je v žiadnej snímke plánu: posun termínu sa nedá zistiť (N7).
    await zasad(m, b, 'Plánovaná výzva bez dvoch snímok plánu', 'C05', 'mimo_podkladov', planovane.map((v) => { const x = structuredClone(v); x.planovana!.kod = `${x.planovana!.kod}-NOVA`; x.planovana!.planVyhlasenia = pridajDni(dnes(), 60); x.planovana!.vyhlasena = false; x.planovana!.zrusena = false; return x; })),
  ];
  // Údaje výzvy staršie ako 7 dní nedajú „splnené“ (N7): stiahnutie sa posunie o 10 dní dozadu a potom vráti.
  const stiahnute = { ...STIAHNUTE };
  STIAHNUTE.vyzvy = STIAHNUTE.detaily = `${pridajDni(dnes(), -10)}T10:00:00Z`;
  r.zasadene.push(await zasad(m, b, 'Údaje výzvy z ITMS21+ staršie ako 7 dní', 'C01', 'na_preverenie', otvorene.map((v) => ({ ...structuredClone(v), datumPredlozenia: dnes() }))));
  STIAHNUTE.vyzvy = STIAHNUTE.detaily = null;
  r.zasadene.push(await zasad(m, b, 'Neznámy dátum stiahnutia údajov výzvy', 'C04', 'na_preverenie', s_verziami.map((v) => ({ ...structuredClone(v), datumOboznamenia: dnes() }))));
  Object.assign(STIAHNUTE, stiahnute);
  const meskajuce = planovane.filter((v) => v.planovana!.planVyhlasenia && v.planovana!.planVyhlasenia < dnes());
  r.poznamky = [
    `Z ${vs.filter((v) => v.vyzva).length} výziev má ${s_verziami.length} aspoň dve datované verzie (zmenu po vyhlásení); žiadateľ, ktorý pracuje so starou verziou, je reálne riziko.`,
    `Plánované výzvy: ${planovane.length}, z toho po plánovanom termíne vyhlásenia a nevyhlásené k ${dnes()}: ${meskajuce.length}${meskajuce.length ? ` (${meskajuce.map((v) => `${v.planovana!.kod} plán ${v.planovana!.planVyhlasenia}`).join(', ')})` : ''}.`,
    'Bez zadaného plánu žiadateľa (dni prípravy, dátum oboznámenia) ostávajú pravidlá C03 a C04 neoverené, preto väčšina reálnych výrokov je „čiastočne overené“.',
  ];
  vystup.moduly[m.id] = r;
}

// ---------------------------------------------------------------- žiadosť o NFP (zasadené chyby testuje 03-test-pravidla)
{
  const m = zonfp; const b = balik(m); console.log(`\n== ${m.nazov}`);
  const r: any = await realne(m, b);
  r.poznamky = ['Porovnanie so skutočným rozhodnutím poskytovateľa (falošné poplachy a zachytené zamietnutia) je v časti nižšie, test 03-test-pravidla.', 'Prílohy ŽoNFP nie sú verejné, preto pravidlá o prílohách na reálnych dátach ostávajú neoverené.'];
  vystup.moduly[m.id] = r;
}

// ---------------------------------------------------------------- verejné obstarávanie
{
  const m = vo; const b = balik(m); console.log(`\n== ${m.nazov}`);
  const r: any = await realne(m, b);
  const vs = vsetkyId(m).map((id) => nacitaj<VstupVo>(m, id));
  const zmr = vs.filter((v) => /malého rozsahu podľa § 1 ods\. 14/.test(v.vo.postup) && !/učebnic/.test(v.vo.postup));
  const sutaz = vs.filter((v) => !/výnimk|in-house|nerelevantné|čiastková zmluva|koncesi/i.test(v.vo.postup) && !/stiahnut|pripravovan/i.test(v.vo.stav));
  const sPhz = vs.filter((v) => (v.vo.phz ?? 0) > 0);
  const sZmluvou = vs.filter((v) => v.vo.zmluvy.some((z) => z.suma != null) && v.vo.doklady.length);
  const bezLimitu = vs.filter((v) => !limitPostupu(v.vo));
  r.zasadene = [
    await zasad(m, b, 'Zákazka malého rozsahu s PHZ 60 000 EUR (po 1. 8. 2024)', 'V01', 'nesplnene', zmr.map((v) => { const x = structuredClone(v); x.vo.phz = 60_000; x.vo.vytvorene = '2025-03-01'; x.vo.zmluvy = x.vo.zmluvy.map((z) => ({ ...z, ucinnost: '2025-04-01' })); return x; })),
    // N2: postup, ktorého limit softvér nepozná, nesmie dať „neuplatňuje sa“.
    await zasad(m, b, 'PHZ 10 mil. EUR pri postupe, ktorého limit softvér neoveruje', 'V01', 'na_preverenie', bezLimitu.map((v) => { const x = structuredClone(v); x.vo.phz = 10_000_000; return x; })),
    // N3: záznam vytvorený v ITMS21+ po 1. 8. 2024, zmluva však skoršia; limit v čase VO nie je overený.
    await zasad(m, b, 'Zákazka malého rozsahu 45 000 EUR so zmluvou z 2023, v ITMS21+ vytvorená 2025', 'V01', 'na_preverenie', zmr.map((v) => { const x = structuredClone(v); x.vo.phz = 45_000; x.vo.vytvorene = '2025-02-13'; x.vo.zmluvy = [{ id: -1, kod: 'T', cislo: 'T', ucinnost: '2023-08-17', suma: 50_000, dodavatel: null }]; return x; })),
    await zasad(m, b, 'Súťaž s jedinou ponukou', 'V02', 'na_preverenie', sutaz.map((v) => { const x = structuredClone(v); x.vo.ponuky = 1; x.vo.vylucene = 0; return x; })),
    await zasad(m, b, 'Zmluva o 60 % nad PHZ (s DPH)', 'V03', 'na_preverenie', sPhz.map((v) => { const x = structuredClone(v); x.vo.zmluvy = [{ id: -1, kod: 'T', cislo: 'T', ucinnost: null, suma: Math.round(x.vo.phz! * 1.23 * 1.6), dodavatel: null }]; return x; })),
    await zasad(m, b, 'Faktúry o 50 % nad zmluvy (s DPH)', 'V04', 'na_preverenie', sZmluvou.map((v) => { const x = structuredClone(v); const s = x.vo.zmluvy.reduce((a, z) => a + (z.suma ?? 0), 0); x.vo.doklady = [{ id: -1, cislo: 'T', celkom: s * 1.23 * 1.5, datum: null }]; return x; })),
    // N19: neznáma suma nie je nula.
    await zasad(m, b, 'Druhá zmluva bez sumy, prvá zodpovedá PHZ', 'V03', 'mimo_podkladov', sPhz.map((v) => { const x = structuredClone(v); x.vo.zmluvy = [{ id: -1, kod: 'T1', cislo: 'T1', ucinnost: null, suma: x.vo.phz, dodavatel: null }, { id: -2, kod: 'T2', cislo: 'T2', ucinnost: null, suma: null, dodavatel: null }]; return x; })),
    await zasad(m, b, 'Účtovný doklad bez sumy', 'V04', 'mimo_podkladov', sZmluvou.map((v) => { const x = structuredClone(v); x.vo.doklady = [{ id: -1, cislo: 'T', celkom: null, datum: null }]; return x; })),
  ];
  // Delenie zákazky: k zákazke malého rozsahu sa do dát pridajú dve ďalšie s rovnakým obstarávateľom, CPV a rokom.
  const delit = zmr.filter((v) => v.vo.cpv && v.vo.vytvorene && (v.vo.phz ?? 0) < 50_000).slice(0, 150);
  const pridane: any[] = [];
  const vstupyDelenie = delit.map((v, i) => {
    const x = structuredClone(v); x.vo.phz = 30_000;
    for (const k of [1, 2]) pridane.push({ ...structuredClone(v.vo), id: -(i * 10 + k), kod: `${v.vo.kod}-T${k}`, phz: 30_000, stav: 'Ukončené' });
    return x;
  });
  VSETKY_VO.push(...pridane);
  r.zasadene.push(await zasad(m, b, 'Tri zákazky malého rozsahu po 30 000 EUR na rovnaký predmet v jednom roku', 'V05', 'na_preverenie', vstupyDelenie));
  // N19: ďalšie dve zákazky bez PHZ sa nesmú započítať ako nula.
  for (const x of pridane) x.phz = null;
  r.zasadene.push(await zasad(m, b, 'Zákazka 30 000 EUR a dve ďalšie na rovnaký predmet bez uvedenej PHZ', 'V05', 'mimo_podkladov', vstupyDelenie));
  VSETKY_VO.splice(VSETKY_VO.length - pridane.length, pridane.length);
  // Audit A07: doklady s DPH nad sumou zmlúv nie sú „neprevyšujú“, aj keď sú pod 123 % zmlúv.
  r.zasadene.push(await zasad(m, b, 'Faktúry o 10 % nad súčet zmlúv', 'V04', 'na_preverenie', sZmluvou.map((v) => { const x = structuredClone(v); const s = x.vo.zmluvy.reduce((a, z) => a + (z.suma ?? 0), 0); x.vo.doklady = [{ id: -1, cislo: 'T', celkom: s * 1.1, datum: null }]; return x; })));
  // T4: limit podlimitnej zákazky s oslovením na tovary a služby podľa dňa začatia VO: 143 000 EUR do 31. 12. 2025,
  // vyhláška ÚVO č. 421/2025 Z. z. 140 000 EUR od 1. 1. 2026, MD č. 26 od 31. 7. 2026. PHZ 141 000 EUR je medzi nimi.
  const tovary108 = vs.filter((v) => /§ 108/.test(v.vo.postup) && !/stavebn/i.test(v.vo.druhZakazky));
  const pasmo = (zaciatok: string | null, ucinnost: string) => tovary108.map((v) => { const x = structuredClone(v); x.vo.phz = 141_000; x.vo.vytvorene = '2026-03-02'; x.vo.zaciatok = zaciatok; x.vo.zmluvy = x.vo.zmluvy.map((z) => ({ ...z, ucinnost })); return x; });
  r.zasadene.push(
    await zasad(m, b, 'Tovary a služby s oslovením, PHZ 141 000 EUR, VO začaté 15. 9. 2026 (MD č. 26: pod 140 000 EUR)', 'V01', 'nesplnene', pasmo('2026-09-15', '2026-11-02')),
    await zasad(m, b, 'Tovary a služby s oslovením, PHZ 141 000 EUR, zmluva z 20. 4. 2026, deň začatia VO neznámy', 'V01', 'na_preverenie', pasmo(null, '2026-04-20')),
    await zasad(m, b, 'Tovary a služby s oslovením, PHZ 141 000 EUR, VO začaté 2. 3. 2026 (vyhláška 140 000 EUR, príručka v2 143 000 EUR)', 'V01', 'na_preverenie', pasmo('2026-03-02', '2026-04-20')),
    await zasad(m, b, 'Tovary a služby s oslovením, PHZ 141 000 EUR, VO začaté 1. 2. 2028 (nové prahy EÚ softvér nemá)', 'V01', 'na_preverenie', pasmo('2028-02-01', '2028-03-01')),
  );
  // Audit A06: úprava súčtu zmlúv o 1 EUR nesmie zmeniť režim V01 (účinnosť zmluvy pred 1. 8. 2024).
  const sumou = vs.filter((v) => v.vo.zmluvy.some((z) => z.suma != null));
  const v01 = async (x: VstupVo) => (await posud(x, b, m, { llm: false, iba: ['V01'] })).nalezy[0];
  const zmenene: string[] = [];
  for (const v of sumou) { const f = m.doFormulara!(v); const [a, c] = [await v01(v), await v01(m.zFormulara!(v, { ...f, zmluva: (f.zmluva as number) + 1 }))]; if (a.stav !== c.stav) zmenene.push(`${v.vo.kod}: ${a.stav} → ${c.stav}`); }
  const v1851 = nacitaj<VstupVo>(m, 'VO01851095'); const d1851 = await v01(m.zFormulara!(v1851, { ...m.doFormulara!(v1851), zmluva: 19_381 }));
  const ucinnost = d1851.doklady?.find((d) => d.miesto === 'Účinnosť zmlúv');
  const f405 = (await posud(nacitaj<VstupVo>(m, 'VO00064405'), b, m, { llm: false, iba: ['V04'] })).nalezy[0];
  // T4: skutočné VO v pásme 140 000 až 142 999 EUR so zmluvou z roku 2025 a deň začatia z formulára kontrolóra.
  const v7195 = nacitaj<VstupVo>(m, 'VO17195877'); const f7195 = m.doFormulara!(v7195);
  const [t4, t4den, t4zly] = [await v01(v7195), await v01(m.zFormulara!(v7195, { ...f7195, zaciatok: '2025-02-02' })), await v01(m.zFormulara!(v7195, { ...f7195, zaciatok: '2025-06-01' }))];
  const denDoklad = t4den.doklady?.find((d) => d.miesto.startsWith('Deň začatia VO'));
  r.overenia = [
    { nazov: `A06: súčet zmlúv o 1 EUR vyšší nezmení V01 pri žiadnom z ${sumou.length} VO so zmluvou`, vysledok: zmenene.length ? zmenene.slice(0, 5).join('; ') : 'bez zmeny', ok: sumou.length > 0 && !zmenene.length },
    { nazov: 'A06: VO01851095 so súčtom 19 381 EUR ostane na preverenie a doloží účinnosť 26. 3. 2024 z ITMS21+', vysledok: `${d1851.stav}; ${ucinnost ? `${ucinnost.nazov.split(',')[0]}: ${ucinnost.citat}` : 'bez dokladu účinnosti'}`, ok: d1851.stav === 'na_preverenie' && !!ucinnost?.nazov.startsWith('ITMS21+') && /26\. 3\. 2024/.test(ucinnost.citat) },
    { nazov: 'A07: VO00064405 (doklady 1 723 377,98 EUR, zmluvy 1 526 945,44 EUR) → V04 na preverenie, prevyšujú aj bez DPH', vysledok: `${f405.stav}: ${f405.zdovodnenie.slice(0, 150)}`, ok: f405.stav === 'na_preverenie' && /aj bez DPH \(1\s641\s312,35 EUR\)/.test(f405.zdovodnenie) && !!f405.doklady?.some((d) => /s DPH/.test(d.miesto)) },
    { nazov: 'T4: VO17195877 (PHZ 142 000 EUR, zmluva účinná 25. 3. 2025) ostane v limite 143 000 EUR', vysledok: `${t4.stav}: ${t4.zdovodnenie.slice(0, 120)}`, ok: t4.stav === 'splnene' && /143\s000 EUR/.test(t4.zdovodnenie) && !/140\s000/.test(t4.zdovodnenie) },
    { nazov: 'T4: rovnaké VO s dňom začatia 2. 2. 2025 z formulára je splnené a deň doloží formulár kontrolóra', vysledok: `${t4den.stav}; ${denDoklad ? `${denDoklad.nazov.split(',')[0]}: ${denDoklad.citat}` : 'bez dokladu dňa'}`, ok: t4den.stav === 'splnene' && !!denDoklad?.nazov.startsWith('Formulár kontrolóra') && denDoklad.citat === '2. 2. 2025' },
    { nazov: 'T4: deň začatia 1. 6. 2025 je po účinnosti zmluvy 25. 3. 2025, V01 ide na preverenie', vysledok: `${t4zly.stav}: ${t4zly.zdovodnenie.slice(-110)}`, ok: t4zly.stav === 'na_preverenie' && /neskorší ako účinnosť zmluvy/.test(t4zly.zdovodnenie) },
  ];
  for (const o of r.overenia) console.log(`  ${o.ok ? '✓' : '✗'} ${o.nazov} → ${o.vysledok}`);
  r.poznamky = [
    'V06 (štatutári v RPO) je online dopyt a je predvolene vypnutý; test ho nespúšťa, aby sa nič neodosielalo.',
    'V07 (záznam zo zadania zákazky) číta lokálny model, testuje ho 09-test-llm-moduly na syntetických záznamoch.',
    'Limit postupu sa overuje len pri zákazkách malého rozsahu a podlimitných s oslovením 3 subjektov; pred 1. 8. 2024 len „na preverenie“, lebo staršie limity neboli overené.',
  ];
  vystup.moduly[m.id] = r;
}

// ---------------------------------------------------------------- zmeny projektu
{
  const m = zmeny; const b = balik(m); console.log(`\n== ${m.nazov}`);
  const r: any = await realne(m, b);
  const vs = vsetkyId(m).map((id) => nacitaj<VstupZmena>(m, id));
  const sUcinnostou = vs.filter((v) => v.projekt.zmluva.ucinnost);
  const sMU = vs.filter((v) => v.projekt.ukazovatele.some((u) => (u.ciel ?? 0) > 0 && !jeZnizujuci(u)));
  const vzorka = (a: VstupZmena[], n = 200) => a.filter((_, i) => i % Math.max(1, Math.floor(a.length / n)) === 0).slice(0, n);
  const s = vzorka(vs);
  const ciastocnaZhoda = (v: VstupZmena): VstupZmena => ({ ...structuredClone(v), zmena: { ...v.zmena, predmet: 'Zmena e-mailovej adresy štatutára a zníženie rozsahu zateplenia na polovicu plochy.' }, formular: 'OoZ' });
  r.zasadene = [
    await zasad(m, b, 'Zmena miesta realizácie predložená ako OoZ', 'Z01', 'nesplnene', s.map((v) => ({ ...structuredClone(v), zmena: { ...v.zmena, predmet: 'Zmena miesta realizácie projektu: rozšírenie o susednú parcelu.' }, formular: 'OoZ' as const }))),
    await zasad(m, b, 'Nová výška NFP o 5 % vyššia', 'Z03', 'nesplnene', s.map((v) => ({ ...structuredClone(v), novaNfp: Math.round(v.projekt.nfp * 1.05) }))),
    await zasad(m, b, 'Koniec hlavných aktivít mesiac po limite 24 mesiacov', 'Z04', 'nesplnene', vzorka(sUcinnostou).map((v) => ({ ...structuredClone(v), novyKoniecHA: pridajMesiace(limitHA(v.projekt)!, 1) }))),
    await zasad(m, b, 'Ex ante zmena vykonaná pred podaním ŽoZZ', 'Z05', 'nesplnene', s.map((v) => ({ ...structuredClone(v), zmena: { ...v.zmena, predmet: 'Zmena miesta realizácie projektu.' }, formular: 'ZoZZ' as const, datumPodania: '2026-05-10', datumZmeny: '2026-04-01' }))),
    await zasad(m, b, 'Ex post zmena (prečerpanie 20 %) podaná 11 dní pred ŽoP', 'Z05', 'nesplnene', s.map((v) => ({ ...structuredClone(v), zmena: { ...v.zmena, predmet: 'Presun prostriedkov medzi položkami rozpočtu.' }, precerpanie: 20, formular: 'ZoZZ' as const, datumPodania: '2026-06-20', datumZop: '2026-07-01' }))),
    await zasad(m, b, 'MU znížený na 50 % pri hranici 70 %', 'Z06', 'nesplnene', vzorka(sMU).map((v) => { const u = v.projekt.ukazovatele.find((x) => (x.ciel ?? 0) > 0 && !jeZnizujuci(x))!; return { ...structuredClone(v), muKod: u.kod, muNova: u.ciel! * 0.5, prahPercent: 70 }; })),
    await zasad(m, b, 'Zmena štatutára: priložený doklad, chýba formulár OoZ', 'Z07', 'chyba_podklad', s.map((v) => ({ ...structuredClone(v), zmena: { ...v.zmena, predmet: 'Zmena štatutárneho orgánu, nový starosta obce.' }, prilohy: { statutar_1: { nazov: 'osvedcenie.pdf', text: 'Osvedčenie o zvolení za starostu obce.' } } }))),
    // N1: zmluva počíta 30 pracovných dní. Pri ŽoP 15. 12. 2026 je 30. pracovný deň pred ňou 3. 11. 2026.
    await zasad(m, b, 'Ex post ŽoZZ 35 kalendárnych, ale len 25 pracovných dní pred ŽoP', 'Z05', 'nesplnene', s.map((v) => ({ ...structuredClone(v), zmena: { ...v.zmena, predmet: 'Presun prostriedkov medzi položkami rozpočtu.' }, precerpanie: 20, formular: 'ZoZZ' as const, datumPodania: '2026-11-10', datumZop: '2026-12-15' }))),
    await zasad(m, b, 'Ex post ŽoZZ na 30. pracovný deň pred ŽoP (hraničný deň)', 'Z05', 'na_preverenie', s.map((v) => ({ ...structuredClone(v), zmena: { ...v.zmena, predmet: 'Presun prostriedkov medzi položkami rozpočtu.' }, precerpanie: 20, formular: 'ZoZZ' as const, datumPodania: '2026-11-03', datumZop: '2026-12-15' }))),
    // N4: kľúčové slová zachytia len formálnu časť zmeny, zníženie rozsahu nie.
    await zasad(m, b, 'OoZ: e-mail štatutára a zníženie rozsahu zateplenia na polovicu (zatriedené ako formálna)', 'Z01', 'na_preverenie', s.map(ciastocnaZhoda)),
    await zasad(m, b, 'OoZ: e-mail štatutára a zníženie rozsahu zateplenia na polovicu (zatriedené ako formálna)', 'Z02', 'na_preverenie', s.map(ciastocnaZhoda)),
    await zasad(m, b, 'OoZ: e-mail štatutára a zníženie rozsahu zateplenia na polovicu (zatriedené ako formálna)', 'Z05', 'na_preverenie', s.map(ciastocnaZhoda)),
    // N5: obsadené miesto prílohy nie je správny dokument.
    await zasad(m, b, 'Zmena štatutára: na každom mieste prílohy je len prázdna šablóna', 'Z07', 'na_preverenie', s.map((v) => { const x: VstupZmena = { ...structuredClone(v), zmena: { ...v.zmena, predmet: 'Zmena štatutárneho orgánu, nový starosta obce.' } }; x.prilohy = Object.fromEntries(prilohyZmeny(x).map((p) => [p.cislo, { nazov: `${p.cislo}.pdf`, text: 'Šablóna – nevyplnené' }])); return x; })),
  ];
  // Klasifikátor voči skutočnosti: zmena s dodatkom k zmluve mala ísť cez ŽoZZ (alebo bola technická).
  const kat: Record<string, { s: number; bez: number }> = {};
  const podozrive: string[] = [];
  for (const v of vs) {
    const z = zatried(v.zmena.predmet); const d = !!v.zmena.dodatok;
    (kat[z.kategoria] ??= { s: 0, bez: 0 })[d ? 's' : 'bez']++;
    if (d && (z.kategoria === 'formalna' || z.kategoria === 'menej_vyznamna') && podozrive.length < 6) podozrive.push(`${v.zmena.id} (${NAZOV_KAT[z.kategoria]}, dodatok ${v.zmena.dodatok}): ${v.zmena.predmet.replace(/\s+/g, ' ').slice(0, 140)}`);
  }
  const sDodatkom = Object.values(kat).reduce((a, x) => a + x.s, 0);
  const lahke = (kat.formalna?.s ?? 0) + (kat.menej_vyznamna?.s ?? 0);
  r.overenia = Object.entries(kat).sort((a, c) => c[1].s + c[1].bez - a[1].s - a[1].bez).map(([k, x]) => ({ ok: true, nazov: `Zatriedenie „${NAZOV_KAT[k as keyof typeof NAZOV_KAT]}“`, vysledok: `${x.s + x.bez} zmien, z toho ${x.s} s dodatkom k zmluve (${Math.round((x.s / (x.s + x.bez)) * 100)} %)` }));
  // Projekty: koniec hlavných aktivít po limite 24 mesiacov od účinnosti zmluvy (údaj ITMS21+, už po schválených zmenách).
  const ps = projekty(); const poLimite = ps.filter((p) => p.planKoniec && limitHA(p) && p.planKoniec > limitHA(p)!);
  r.poznamky = [
    `Klasifikátor voči dodatkom: ${sDodatkom} zmien má dodatok k zmluve. Ako formálne alebo menej významné (OoZ bez dodatku) softvér zatriedil ${lahke} z nich (${Math.round((lahke / Math.max(1, sDodatkom)) * 100)} %). Sú to kandidáti na „falošne ľahkú“ zmenu; dodatok však môže zahŕňať aj menej významné zmeny zapracované neskôr, preto to nie je presná chybovosť.${podozrive.length ? ` Príklady na ručnú kontrolu: ${podozrive.join(' | ')}` : ''}`,
    `Projekty s koncom hlavných aktivít po 24 mesiacoch od účinnosti zmluvy (PPP č. 14) podľa ITMS21+: ${poLimite.length} z ${ps.length}${poLimite.length ? ` (napr. ${poLimite.slice(0, 5).map((p) => `${p.kod}: koniec ${p.planKoniec}, limit ${limitHA(p)}`).join('; ')})` : ''}. Pravdepodobne ide o predĺženie z dôvodu okolnosti vylučujúcej zodpovednosť alebo o zmenu výzvy; overiť.`,
  ];
  vystup.moduly[m.id] = r;
}

// ---------------------------------------------------------------- žiadosť o platbu
{
  const m = zop; const b = balik(m); console.log(`\n== ${m.nazov}`);
  const r: any = await realne(m, b);
  const vs = vsetkyId(m).map((id) => nacitaj<VstupZop>(m, id));
  const sDokladom = vs.filter((v) => { const x = v.zop.vydavky[0]; const d = doklad(x?.dokladId ?? null); return x && x.bezDph != null && d?.celkom != null; });
  const vz = sDokladom.filter((_, i) => i % Math.max(1, Math.floor(sDokladom.length / 250)) === 0).slice(0, 250);
  let novyId = -1;
  /** Syntetický doklad: kópia dokladu prvého výdavku so zmenou; vloží sa do dát pod záporným id. */
  const sDokladom2 = (v: VstupZop, uprav: (d: any) => void) => { const x = structuredClone(v); const d = structuredClone(doklad(x.zop.vydavky[0].dokladId)!); d.id = novyId--; uprav(d); DOKLADY[String(d.id)] = d; x.zop.vydavky[0].dokladId = d.id; return x; };
  r.zasadene = [
    await zasad(m, b, 'Žiadaná suma o 100 EUR vyššia ako výdavok', 'P02', 'nesplnene', vz.map((v) => { const x = structuredClone(v); const y = x.zop.vydavky[0]; y.ziadana = y.bezDph! + (y.dph ?? 0) + 100; return x; })),
    await zasad(m, b, 'Ten istý doklad nárokovaný druhýkrát v tej istej ŽoP', 'P02', 'nesplnene', vz.map((v) => { const x = structuredClone(v); const y = x.zop.vydavky[0]; x.zop.vydavky.push({ ...structuredClone(y), id: -1, poradie: 999, ziadana: doklad(y.dokladId)!.celkom }); return x; })),
    await zasad(m, b, 'Doklad vystavený pred 1. 1. 2021', 'P01', 'nesplnene', vz.map((v) => sDokladom2(v, (d) => { d.datumVyhotovenia = '2020-06-15'; }))),
    await zasad(m, b, 'Výdavok uhradený po 31. 12. 2029', 'P01', 'nesplnene', vz.map((v) => { const x = structuredClone(v); x.zop.vydavky[0].datumUhrady = '2030-02-01'; return x; })),
    await zasad(m, b, 'Dodávateľ neplatiteľ DPH fakturuje DPH', 'P04', 'na_preverenie', vz.map((v) => sDokladom2(v, (d) => { d.dodavatel = { ...(d.dodavatel ?? { nazov: 'Test s.r.o.', ico: '12345678' }), platitelDph: false }; d.polozky = [{ bezDph: 1000, dph: 230, sadzba: 23, spolu: 1230 }]; }))),
    await zasad(m, b, 'Chybne vypočítaná DPH v položke dokladu', 'P05', 'na_preverenie', vz.map((v) => sDokladom2(v, (d) => { d.polozky = [{ bezDph: 1000, dph: 280, sadzba: 23, spolu: 1280 }]; }))),
    await zasad(m, b, 'Hotovostná platba 800 EUR', 'P09', 'nesplnene', vz.map((v) => ({ ...structuredClone(v), hotovostMax: 800 }))),
    await zasad(m, b, 'Priložená len faktúra, chýba výpis a ďalšie dokumenty', 'P10', 'chyba_podklad', vz.filter((v) => v.zop.typ !== 'PREDFINANCOVANIE').map((v) => ({ ...structuredClone(v), prilohy: { faktura: { nazov: 'faktura.pdf', text: 'Faktúra č. 2026001' } } }))),
    await zasad(m, b, 'Doklad o úhrade je výstup z internet bankingu', 'P12', 'nesplnene', vz.map((v) => ({ ...structuredClone(v), prilohy: { uhrada: { nazov: 'platba.pdf', text: 'Internet banking – detail transakcie\nSuma: 12 450,00 EUR\nDátum: 14.03.2026\nZ účtu SK31 1200 0000 1987 4263 7541' } } }))),
    await zasad(m, b, 'Výpis z účtu bez čísla účtu (bez modelu)', 'P12', 'nesplnene', vz.map((v) => ({ ...structuredClone(v), prilohy: { uhrada: { nazov: 'vypis.pdf', text: 'Výpis z bankového účtu č. 3/2026\nDátum zaúčtovania 14.03.2026\nOdpísaná suma 12 450,00 EUR\nPríjemca: Stavby s.r.o.' } } }))),
    // N6: jeden údaj o hotovosti nehovorí nič o ostatných dvoch limitoch.
    await zasad(m, b, 'Zadaná len najvyššia hotovostná platba 100 EUR', 'P09', 'mimo_podkladov', vz.map((v) => ({ ...structuredClone(v), hotovostMax: 100 }))),
    // N17: neznámy status platiteľa DPH nie je „nie je platiteľ“.
    await zasad(m, b, 'Prijímateľ s neznámym statusom platiteľa DPH žiada aj DPH', 'P04', 'na_preverenie', vz.map((v) => { const x = structuredClone(v); x.zop.prijimatel.platitelDph = null; const y = x.zop.vydavky[0]; y.dph = Math.round(y.bezDph! * 23) / 100; y.ziadana = y.bezDph! + y.dph; return x; })),
    await zasad(m, b, 'Doklad s DPH od dodávateľa s neznámym statusom platiteľa DPH', 'P04', 'na_preverenie', vz.map((v) => sDokladom2(v, (d) => { d.dodavatel = { ...(d.dodavatel ?? { nazov: 'Test s.r.o.', ico: '12345678' }), platitelDph: null }; d.polozky = [{ bezDph: 1000, dph: 230, sadzba: 23, spolu: 1230 }]; }))),
    // N18: VO, ktoré v dátach chýba, nemá PHZ 0.
    await zasad(m, b, 'Výdavok viazaný na VO, ktoré v dátach chýba', 'P07', 'mimo_podkladov', vz.map((v) => { const x = structuredClone(v); x.zop.vydavky[0].voIds = [...x.zop.vydavky[0].voIds, -999_999]; return x; })),
    // N19 a obdobné cesty: neznáma suma nie je nula ani sa ticho nevynechá.
    await zasad(m, b, 'Účtovný doklad výdavku bez sumy', 'P02', 'mimo_podkladov', vz.map((v) => sDokladom2(v, (d) => { d.celkom = null; }))),
    await zasad(m, b, 'Položka dokladu bez sadzby a DPH', 'P05', 'mimo_podkladov', vz.map((v) => sDokladom2(v, (d) => { d.polozky = [{ bezDph: 1000, dph: 230, sadzba: 23, spolu: 1230 }, { bezDph: 500, dph: null, sadzba: null, spolu: 500 }]; }))),
    await zasad(m, b, 'Výdavok so zmluvou z VO, ktorá v dátach chýba', 'P08', 'mimo_podkladov', vz.map((v) => { const x = structuredClone(v); x.zop.vydavky[0].zmluvaVoIds = [...x.zop.vydavky[0].zmluvaVoIds, -999_999]; return x; })),
    // N5: obsadené miesto prílohy nie je správny dokument.
    await zasad(m, b, 'Na každom mieste povinnej prílohy je len prázdna šablóna', 'P10', 'na_preverenie', vz.map((v) => { const x = structuredClone(v); x.prilohy = Object.fromEntries(prilohyZop(x).map((p) => [p.cislo, { nazov: `${p.cislo}.pdf`, text: 'Šablóna – nevyplnené' }])); return x; })),
  ];
  // Opätovné predloženie uhradenej ŽoP: tie isté doklady, tá istá rodina nárokov, obe uhradené.
  const uhradene = VSETKY_ZOP.filter((z) => z.neuhradena === false && !z.typ.startsWith('ZUCTOVANIE') && z.vydavky.some((x) => { const d = doklad(x.dokladId); return d?.celkom && (x.ziadana ?? 0) >= d.celkom * 0.5; })).slice(0, 200);
  r.zasadene.push(await zasad(m, b, 'Uhradená ŽoP predložená druhýkrát (rovnaké doklady)', 'P03', 'nesplnene', uhradene.map((z) => { const v = nacitaj<VstupZop>(m, z.kod); v.zop.kod = `${z.kod}-T`; return v; })));
  // N19: doklady opakovanej ŽoP bez sumy v dátach sa nesmú vynechať. Sumy sa dočasne zmažú a potom vrátia.
  const sumy = new Map<string, number | null>();
  for (const z of uhradene) for (const x of z.vydavky) { const k = String(x.dokladId); if (DOKLADY[k] && !sumy.has(k)) { sumy.set(k, DOKLADY[k].celkom); DOKLADY[k].celkom = null; } }
  r.zasadene.push(await zasad(m, b, 'Uhradená ŽoP predložená druhýkrát, doklady bez sumy v dátach', 'P03', 'na_preverenie', uhradene.map((z) => { const v = nacitaj<VstupZop>(m, z.kod); v.zop.kod = `${z.kod}-T`; return v; })));
  for (const [k, c] of sumy) DOKLADY[k].celkom = c;
  // Audit A05: prázdne pole žiadanej sumy vo formulári nie je nula. Neúplný vstup nesmie odstrániť upozornenie.
  const vymaz = (v: VstupZop, ids: number[]) => zop.zFormulara(v, { ...zop.doFormulara(v), ...Object.fromEntries(ids.map((id) => [`ziadana_${id}`, ''])) });
  const doDvanast = uhradene.filter((z) => z.vydavky.length <= 12);
  // Zmluvy z VO so známou kladnou sumou (pri neznámej sume je P08 neoverené už bez zásahu).
  const sumaZmluvy = new Map(VSETKY_VO.flatMap((o) => o.zmluvy.map((z) => [z.id, z.suma] as const)));
  const znamaZmluva = (x: VstupZop['zop']['vydavky'][number]) => x.zmluvaVoIds.length > 0 && x.zmluvaVoIds.every((id) => (sumaZmluvy.get(id) ?? 0) > 0);
  r.zasadene.push(
    await zasad(m, b, 'Uhradená ŽoP predložená druhýkrát, žiadané sumy vo formulári vymazané', 'P03', 'na_preverenie', doDvanast.map((z) => { const v = nacitaj<VstupZop>(m, z.kod); v.zop.kod = `${z.kod}-T`; return vymaz(v, v.zop.vydavky.map((x) => x.id)); })),
    await zasad(m, b, 'Žiadaná suma výdavku vo formulári vymazaná', 'P02', 'na_preverenie', vz.map((v) => vymaz(v, [v.zop.vydavky[0].id]))),
    await zasad(m, b, 'Platiteľ DPH žiada aj DPH, žiadaná suma vo formulári vymazaná', 'P04', 'na_preverenie', vz.map((v) => { const x = structuredClone(v); x.zop.prijimatel.platitelDph = true; const y = x.zop.vydavky[0]; y.dph = Math.round(y.bezDph! * 23) / 100; y.ziadana = y.bezDph! + y.dph; return vymaz(x, [y.id]); })),
    // Zúčtovanie predfinancovania nový nárok nevytvára (P08 počíta nároky z refundácie a predfinancovania), preto sa vynechá.
    await zasad(m, b, 'Žiadaná suma výdavku so zmluvou z VO vo formulári vymazaná', 'P08', 'na_preverenie', vs.filter((v) => !v.zop.typ.startsWith('ZUCTOVANIE') && v.zop.vydavky.some(znamaZmluva) && v.zop.vydavky.every((x) => !x.zmluvaVoIds.length || znamaZmluva(x)) && v.zop.vydavky.slice(0, 12).some(znamaZmluva)).slice(0, 250).map((v) => vymaz(v, v.zop.vydavky.slice(0, 12).filter(znamaZmluva).map((x) => x.id)))),
    // Audit A07 v P08: nárok s DPH nad sumou zmluvy nie je „neprevyšuje“, aj keď je pod 123 % zmluvy.
    await zasad(m, b, 'Nárok k zmluve z VO o 10 % vyšší ako suma zmluvy', 'P08', 'na_preverenie', vs.filter((v) => !v.zop.typ.startsWith('ZUCTOVANIE') && v.zop.vydavky.some((x) => x.zmluvaVoIds.length === 1 && znamaZmluva(x))).slice(0, 250).map((v) => {
      const x = structuredClone(v); const y = x.zop.vydavky.find((q) => q.zmluvaVoIds.length === 1 && znamaZmluva(q))!; const id = y.zmluvaVoIds[0];
      const ine = VSETKY_ZOP.filter((z) => z.kod !== x.zop.kod && !z.typ.startsWith('ZUCTOVANIE')).flatMap((z) => z.vydavky).filter((q) => q.zmluvaVoIds.includes(id)).reduce((s, q) => s + (q.ziadana ?? 0), 0);
      const moje = x.zop.vydavky.filter((q) => q !== y && q.zmluvaVoIds.includes(id)).reduce((s, q) => s + (q.ziadana ?? 0), 0);
      const suma = sumaZmluvy.get(id)!;
      y.ziadana = Math.max(0, suma * 1.1 - ine - moje); y.bezDph = y.ziadana; y.dph = 0; return x;
    })),
    // Audit A12: tolerancia P05 nerastie so sumou.
    await zasad(m, b, 'DPH položky o 100 EUR vyššia pri základe 100 000 EUR a sadzbe 23 %', 'P05', 'na_preverenie', vz.map((v) => sDokladom2(v, (d) => { d.polozky = [{ bezDph: 100_000, dph: 23_100, sadzba: 23, spolu: 123_100 }]; }))),
  );
  // Tri prípady z auditu A05 cez formulár: prázdne pole ide na preverenie, výslovná nula je hodnota.
  const pripadA05 = async (kod: string, pravidlo: string) => {
    const v = nacitaj<VstupZop>(m, kod); const id = v.zop.vydavky[0].id;
    const st = async (x: VstupZop) => (await posud(x, b, m, { llm: false, iba: [pravidlo] })).nalezy[0];
    return { pred: await st(v), prazdne: await st(vymaz(v, [id])), nula: await st(zop.zFormulara(v, { ...zop.doFormulara(v), [`ziadana_${id}`]: '0' })) };
  };
  const a03 = await pripadA05('401201DYI3500401', 'P03'), a04 = await pripadA05('401201A186300101', 'P04'), a08 = await pripadA05('401201FCU3500301', 'P08');
  const dokladP03 = a03.pred.doklady?.find((d) => d.miesto.startsWith('Doklady nárokované aj v iných ŽoP'))?.citat ?? '';
  // Audit A12: hranica zaokrúhlenia DPH je 2 centy na položku.
  const p05 = async (bezDph: number, dph: number) => { const x = sDokladom2(vz[0], (d) => { d.polozky = [{ bezDph, dph, sadzba: 23, spolu: bezDph + dph }]; }); x.zop.vydavky = [x.zop.vydavky[0]]; return (await posud(x, b, m, { llm: false, iba: ['P05'] })).nalezy[0]; };
  const [h2, h3, h100] = [await p05(100, 23.02), await p05(100, 23.03), await p05(100_000, 23_100)];
  r.overenia = [
    { nazov: 'A05: ŽoP 401201DYI3500401, vymazaných 7 175 EUR pri doklade nárokovanom aj v uhradenej ŽoP → P03 na preverenie; výslovná 0 → splnené', vysledok: `${a03.pred.stav} → prázdne ${a03.prazdne.stav}, nula ${a03.nula.stav}`, ok: a03.prazdne.stav === 'na_preverenie' && a03.nula.stav === 'splnene' },
    { nazov: 'A05: doklad P03 uvádza doklad, oba nároky a kódy oboch ŽoP', vysledok: dokladP03, ok: /doklad 2025047 \(7\s175 EUR\): ŽoP 401201DYI3500401 \(posudzovaná\) 7\s175 EUR; ŽoP 401201DYI3500301 \(uhradená\) 7\s175 EUR/.test(dokladP03) },
    { nazov: 'A05: ŽoP 401201A186300101 (platiteľ DPH), vymazaná suma výdavku s DPH → P04 na preverenie; výslovná 0 → splnené', vysledok: `${a04.pred.stav} → prázdne ${a04.prazdne.stav}, nula ${a04.nula.stav}`, ok: a04.prazdne.stav === 'na_preverenie' && a04.nula.stav === 'splnene' },
    { nazov: 'A05: ŽoP 401201FCU3500301, vymazaných 5 965,50 EUR → P08 na preverenie; výslovná 0 → splnené', vysledok: `${a08.pred.stav} → prázdne ${a08.prazdne.stav}, nula ${a08.nula.stav}`, ok: a08.prazdne.stav === 'na_preverenie' && a08.nula.stav === 'splnene' },
    { nazov: 'A12: 100 EUR × 23 % = 23 EUR, doklad 23,02 EUR (2 centy) je zaokrúhlenie → P05 splnené', vysledok: h2.stav, ok: h2.stav === 'splnene' },
    { nazov: 'A12: rozdiel 3 centy → P05 na preverenie', vysledok: h3.stav, ok: h3.stav === 'na_preverenie' },
    { nazov: 'A12: základ 100 000 EUR, 23 %, DPH 23 100 EUR → na preverenie s očakávanou DPH 23 000 EUR', vysledok: `${h100.stav}: ${h100.zdovodnenie.slice(0, 170)}`, ok: h100.stav === 'na_preverenie' && /= 23\s000 EUR, doklad uvádza DPH 23\s100 EUR \(rozdiel 100 EUR\)/.test(h100.zdovodnenie) },
  ];
  for (const o of r.overenia) console.log(`  ${o.ok ? '✓' : '✗'} ${o.nazov} → ${o.vysledok}`);
  r.poznamky = [
    'Doklady ŽoP (faktúry, výpisy) nie sú verejné; na reálnych dátach sa overujú len údaje ITMS21+ (sumy, dátumy, DPH, väzba na VO a zmluvy).',
    'Zasadené chyby v dokladoch používajú syntetické kópie reálnych dokladov; reálne dáta sa nemenia.',
    'Pravidlo P03 považuje za dvojité nárokovanie len súčet nad hodnotu dokladu v uhradených ŽoP; neuhradené (zamietnuté alebo stiahnuté) opakovania dáva na preverenie.',
  ];
  vystup.moduly[m.id] = r;
}

// ---------------------------------------------------------------- merateľné ukazovatele
{
  const m = ukazovatele; const b = balik(m); console.log(`\n== ${m.nazov}`);
  const r: any = await realne(m, b);
  const vs = vsetkyId(m).map((id) => nacitaj<VstupUkazovatele>(m, id)).filter((v) => v.projekt.ukazovatele.some((u) => (u.ciel ?? 0) > 0));
  /** Skutočná hodnota pri naplnení k (pri klesajúcom MU podiel dosiahnutého poklesu). */
  const pri = (v: VstupUkazovatele, k: number, len?: 'vystup' | 'vysledok') => {
    const x = structuredClone(v);
    for (const u of x.projekt.ukazovatele) {
      if (u.ciel == null) continue;
      const ciel = len && u.typ !== len ? 1 : k; // druhý typ ukazovateľov ostane splnený
      x.skutocne[u.kod] = jeZnizujuci(u) ? (u.vychodisko == null ? null : u.vychodisko - ciel * (u.vychodisko - u.ciel)) : u.ciel * ciel;
    }
    return x;
  };
  r.zasadene = [];
  const prehlad: string[] = [];
  for (const k of [1, 0.97, 0.94, 0.8, 0.5, 0]) {
    const sVystupom = vs.filter((v) => v.projekt.ukazovatele.some((u) => u.typ === 'vystup' && (u.ciel ?? 0) > 0));
    const sVysledkom = vs.filter((v) => v.projekt.ukazovatele.some((u) => u.typ === 'vysledok' && (u.ciel ?? 0) > 0));
    if (k < 0.95) {
      r.zasadene.push(await zasad(m, b, `MU výstupu naplnené na ${Math.round(k * 100)} %, prahy zo zmluvy nezadané`, 'U01', 'nesplnene', sVystupom.map((v) => pri(v, k, 'vystup'))));
      r.zasadene.push(await zasad(m, b, `MU výstupu na ${Math.round(k * 100)} %, testovacie prahy C=D=65 %, max. zníženie 30 %`, 'U01', 'nesplnene', sVystupom.map((v) => ({ ...pri(v, k, 'vystup'), prahVystup: 65, prahVysledok: 65, maxVystup: 30, maxVysledok: 30 }))));
      r.zasadene.push(await zasad(m, b, `MU výsledku naplnené na ${Math.round(k * 100)} %`, 'U02', 'na_preverenie', sVysledkom.map((v) => pri(v, k, 'vysledok'))));
    } else {
      // Pri naplnení ≥ 95 % má byť splnené; tu sa meria opak: zbytočné poplachy.
      let u1 = 0, u2 = 0;
      for (const v of sVystupom) if ((await posud(pri(v, k), b, m, { llm: false })).nalezy.find((n) => n.pravidlo === 'U01')!.stav === 'splnene') u1++;
      for (const v of sVysledkom) if ((await posud(pri(v, k), b, m, { llm: false })).nalezy.find((n) => n.pravidlo === 'U02')!.stav === 'splnene') u2++;
      prehlad.push(`Pri naplnení ${Math.round(k * 100)} %: U01 splnené v ${u1} z ${sVystupom.length}, U02 v ${u2} z ${sVysledkom.length} projektov.`);
    }
  }
  const s3 = vs.filter((v) => v.projekt.terminy.some((t) => t.najneskor && t.najneskor < dnes()));
  r.zasadene.push(await zasad(m, b, 'Uplynul termín monitorovacej správy, žiadna nepredložená', 'U03', 'nesplnene', s3.map((v) => ({ ...structuredClone(v), predlozene: 0 }))));
  // Audit A13: samotný počet včasnosť nepotvrdí, neplatný počet ani deň sa nepoužijú, neskoré predloženie je porušenie.
  const uplynule = (v: VstupUkazovatele) => v.projekt.terminy.filter((t) => t.najneskor && t.najneskor < dnes());
  const sDnami = (v: VstupUkazovatele, den: (t: VstupUkazovatele['projekt']['terminy'][number], i: number, n: number) => string | null) =>
    ({ ...structuredClone(v), predlozeneDni: Object.fromEntries(uplynule(v).map((t, i, a) => [klucTerminu(t), den(t, i, a.length)])) });
  r.zasadene.push(await zasad(m, b, 'Počet správ sedí, deň predloženia nezadaný', 'U03', 'na_preverenie', s3.map((v) => ({ ...structuredClone(v), predlozene: uplynule(v).length }))));
  r.zasadene.push(await zasad(m, b, 'Počet 1,5 správy', 'U03', 'na_preverenie', s3.map((v) => ({ ...structuredClone(v), predlozene: 1.5 }))));
  r.zasadene.push(await zasad(m, b, 'Záporný počet správ', 'U03', 'na_preverenie', s3.map((v) => ({ ...structuredClone(v), predlozene: -1 }))));
  r.zasadene.push(await zasad(m, b, 'Prvá správa predložená deň po termíne, ostatné v posledný deň', 'U03', 'nesplnene', s3.map((v) => sDnami(v, (t, i) => (i === 0 ? pridajDni(t.najneskor!, 1) : t.najneskor)))));
  r.zasadene.push(await zasad(m, b, 'Deň predloženia 31. 9. 2025 (neexistuje)', 'U03', 'na_preverenie', s3.map((v) => sDnami(v, (t, i) => (i === 0 ? '2025-09-31' : t.najneskor)))));
  r.zasadene.push(await zasad(m, b, 'Deň predloženia po dni posúdenia', 'U03', 'na_preverenie', s3.map((v) => sDnami(v, (t, i) => (i === 0 ? pridajDni(dnes(), 3) : t.najneskor)))));
  r.zasadene.push(await zasad(m, b, 'Pri poslednej uplynulej správe chýba deň predloženia', 'U03', 'na_preverenie', s3.map((v) => sDnami(v, (t, i, n) => (i === n - 1 ? null : t.najneskor)))));
  // Bez falošného poplachu: všetky správy v posledný deň termínu sú včas; deň posúdenia je v dokladoch systémový údaj.
  let u3Vcas = 0, u3Doklady = 0;
  for (const v of s3) {
    const n = (await posud(sDnami(v, (t) => t.najneskor), b, m, { llm: false })).nalezy.find((x) => x.pravidlo === 'U03')!;
    if (n.stav === 'splnene') u3Vcas++;
    const d = n.doklady ?? [];
    if (d.some((x) => x.nazov === 'Systémový údaj aplikácie') && d.some((x) => x.nazov.startsWith('ITMS21+') && x.miesto === 'Termíny monitorovacích správ')
      && d.some((x) => x.nazov.startsWith('Formulár kontrolóra') && x.miesto.startsWith('Deň predloženia')) && !d.some((x) => x.nazov.startsWith('ITMS21+') && /deň/i.test(x.miesto))) u3Doklady++;
  }
  // Prípad z auditu: projekt 401201A012 k 23. 11. 2026 (jeden uplynulý termín, výročná správa č. 1 najneskôr 31. 1. 2026).
  const predDnes = process.env.KONTROLA_DNES; process.env.KONTROLA_DNES = '2026-11-23';
  const a012 = nacitaj<VstupUkazovatele>(m, '401201A012');
  const u03 = async (x: Partial<VstupUkazovatele>) => (await posud({ ...structuredClone(a012), ...x }, b, m, { llm: false, iba: ['U03'] })).nalezy[0];
  const a1 = await u03({ predlozene: 1 }), a15 = await u03({ predlozene: 1.5 });
  const aVcas = await u03({ predlozene: 1, predlozeneDni: { VYROCNE_1: '2026-01-30' } }), aNeskoro = await u03({ predlozeneDni: { VYROCNE_1: '2026-02-02' } });
  if (predDnes === undefined) delete process.env.KONTROLA_DNES; else process.env.KONTROLA_DNES = predDnes;

  // N20: dnešok v SR, nie v UTC. 22. 11. 2026 o 23:30 UTC je v Bratislave už 23. 11.
  const prepisanyDnes = process.env.KONTROLA_DNES; delete process.env.KONTROLA_DNES;
  const poPolnoci = dnes(new Date('2026-11-22T23:30:00Z')); const leto = dnes(new Date('2026-07-01T22:30:00Z'));
  if (prepisanyDnes !== undefined) process.env.KONTROLA_DNES = prepisanyDnes;

  // Ručne prepočítané príklady sankčnej kalkulačky (príloha č. 12 príručky).
  const tol = (a: unknown, e: number) => typeof a === 'number' && Math.abs(a - e) < 0.01;
  const k1 = kalkulacka({ A: 1_000_000, C: 70, D: 60, E: 25, F: 25, riadky: [{ kod: 'O1', typ: 'výstup', ciel: 100, skutocnost: 90 }, { kod: 'R1', typ: 'výsledok', ciel: 100, skutocnost: 80 }] });
  const k2 = kalkulacka({ A: 1_000_000, C: 70, D: 60, E: 25, F: 25, riadky: [{ kod: 'O1', typ: 'výstup', ciel: 100, skutocnost: 60 }] });
  const k3 = kalkulacka({ A: 1_000_000, C: 70, D: 60, E: 25, F: 25, riadky: [{ kod: 'O1', typ: 'výstup', ciel: 100, skutocnost: 60 }, { kod: 'O2', typ: 'výstup', ciel: 10, skutocnost: 10 }] });
  const k4 = kalkulacka({ A: 1_000_000, C: 70, D: 60, E: 25, F: 25, riadky: [{ kod: 'O1', typ: 'výstup', ciel: 100, skutocnost: 97 }, { kod: 'R1', typ: 'výsledok', ciel: 100, skutocnost: 50 }] });
  r.overenia = [
    { nazov: 'Výstup 90/100, C=70, E=25, COV 1 000 000: zníženie 25/(95−70)×(95−90) = 5 %, krátenie 50 000 EUR', vysledok: `E34 ${k1.E34}, E35 ${k1.E35}`, ok: tol(k1.E34, 5) && tol(k1.E35, 50_000) },
    { nazov: 'Výsledok 80/100, D=60, F=25: zníženie 25/35×15 = 10,714 %, krátenie 107 142,86 EUR', vysledok: `F34 ${k1.F34}, F35 ${k1.F35}`, ok: tol(k1.F34, 10.7142857) && tol(k1.F35, 107_142.857) },
    { nazov: 'Jediný výstup 60/100 pod hranicou C=70: odstúpenie od zmluvy', vysledok: String(k2.E35), ok: /^odstúpenie/.test(String(k2.E35)) },
    { nazov: 'Jeden z dvoch výstupov 60/100 pod C=70: možnosť odstúpiť alebo maximálna sankcia', vysledok: String(k3.E35), ok: /^možnosť odstúpiť/.test(String(k3.E35)) },
    { nazov: 'Výsledok 50/100 pod D=60: možnosť odstúpiť od zmluvy', vysledok: String(k4.F35), ok: /^možnosť odstúpiť/.test(String(k4.F35)) },
    { nazov: 'Výstup 97/100 (nad 95 %): bez krátenia', vysledok: `E34 ${k4.E34}, E35 ${k4.E35}`, ok: k4.E34 === 0 && k4.E35 === 0 },
    { nazov: 'Dnešok v SR: 22. 11. 2026 23:30 UTC je 23. 11., 1. 7. 2026 22:30 UTC je 2. 7. (letný čas)', vysledok: `${poPolnoci}, ${leto}`, ok: poPolnoci === '2026-11-23' && leto === '2026-07-02' },
    { nazov: 'U03: všetky správy predložené v posledný deň termínu sú včas a doklady uvádzajú deň posúdenia ako systémový údaj', vysledok: `${u3Vcas}/${s3.length} splnené, ${u3Doklady} s úplnými dokladmi`, ok: s3.length > 0 && u3Vcas === s3.length && u3Doklady === s3.length },
    { nazov: 'A13: 401201A012 k 23. 11. 2026, počet 1 bez dňa predloženia: na preverenie, včasnosť neoverená', vysledok: `${a1.stav}: ${a1.zdovodnenie.slice(0, 150)}`, ok: a1.stav === 'na_preverenie' && /včasnosť však nie je overená/.test(a1.zdovodnenie) },
    { nazov: 'A13: počet 1,5 správy sa odmietne', vysledok: `${a15.stav}: ${a15.zdovodnenie.slice(0, 110)}`, ok: a15.stav === 'na_preverenie' && /nie je nezáporné celé číslo/.test(a15.zdovodnenie) },
    { nazov: 'A13: výročná správa č. 1 predložená 30. 1. 2026 (najneskôr 31. 1.): splnené, deň posúdenia je systémový údaj, nie ITMS21+', vysledok: `${aVcas.stav}; doklady: ${(aVcas.doklady ?? []).map((d) => `${d.nazov.split(',')[0]} · ${d.miesto} = ${d.citat}`).join(' | ')}`,
      ok: aVcas.stav === 'splnene' && !!aVcas.doklady?.some((d) => d.nazov === 'Systémový údaj aplikácie' && d.citat === '23. 11. 2026') && !aVcas.doklady.some((d) => d.nazov.startsWith('ITMS21+') && /deň/i.test(d.miesto)) },
    { nazov: 'A13: výročná správa č. 1 predložená 2. 2. 2026: nesplnené (po termíne)', vysledok: `${aNeskoro.stav}: ${aNeskoro.zdovodnenie}`, ok: aNeskoro.stav === 'nesplnene' && /po termíne/i.test(aNeskoro.zdovodnenie) },
  ];
  for (const o of r.overenia) console.log(`  ${o.ok ? '✓' : '✗'} ${o.nazov} → ${o.vysledok}`);
  r.poznamky = [
    ...prehlad,
    'Skutočné hodnoty MU nie sú vo verejných dátach; reálne výroky sú preto „na preverenie“ (chýbajú hodnoty). Zasadené chyby simulujú hodnoty z monitorovacej správy.',
    'Klesajúce ukazovatele (spotreba energie, emisie) kalkulačka SIEA priamo nevie; softvér počíta podiel dosiahnutého poklesu.',
    'Prahy z čl. 4.3 zmluvy (C, D) a maximálne zníženie COV (E, F) v teste sú testovacie hodnoty, nie hodnoty z konkrétnych zmlúv.',
  ];
  vystup.moduly[m.id] = r;
}

// ---------------------------------------------------------------- doklady k nálezom modulov (N9)
// „Splnené“ musí citovať vstupy s miestom v zdroji, inak ide človeku; pôvod údaja je ITMS21+ alebo formulár kontrolóra.
{
  console.log('\n== Doklady k nálezom modulov');
  const ov: { nazov: string; vysledok: string; ok: boolean }[] = [];
  const realneDoklady = Object.values(vystup.moduly).map((x: any) => x.doklady).filter(Boolean);
  const sucet = (k: string) => realneDoklady.reduce((s: number, d: any) => s + d[k], 0);
  ov.push({ nazov: `Skutočné dáta (${realneDoklady.length} moduly): každé „splnené“ má doklad, žiadne nešlo človeku pre chýbajúcu citáciu`, vysledok: `splnených ${sucet('splnene')}, bez dokladu ${sucet('bezDokladu')}, presunutých ${sucet('presunute')}`, ok: realneDoklady.length === 5 && sucet('splnene') > 0 && sucet('bezDokladu') === 0 && sucet('presunute') === 0 });

  // Modul, ktorý doklad nevie dať: „splnené“ ide človeku a výrok nie je OK.
  const bV = balik(vo); const sV02 = [];
  for (const id of vsetkyId(vo)) { const v = nacitaj(vo, id); if ((await posud(v, bV, vo, { llm: false, iba: ['V02'] })).nalezy[0].stav === 'splnene') sV02.push(v); if (sV02.length >= 20) break; }
  const bezDokl = { ...vo, doklady: () => [] } as Modul<VstupVo>;
  let presunute = 0, okVyroky = 0;
  for (const v of sV02) { const p = await posud(v, bV, bezDokl, { llm: false }); const n = p.nalezy.find((x) => x.pravidlo === 'V02')!; if (n.stav === 'na_preverenie' && n.zdovodnenie.startsWith(BEZ_DOKLADU)) presunute++; if (okVyrok(p)) okVyroky++; }
  ov.push({ nazov: 'Modul bez dokladu: „splnené“ V02 ide na preverenie a výrok nie je OK', vysledok: `${presunute}/${sV02.length} presunutých, OK výrokov ${okVyroky}`, ok: sV02.length > 0 && presunute === sV02.length && okVyroky === 0 });

  // Pôvod údaja: PHZ zmenená vo formulári je z formulára kontrolóra, postup ostáva z ITMS21+.
  const v0 = sV02.find((x) => x.vo.phz != null && x.vo.postup)!;
  const upraveny = vo.zFormulara(v0, { ...vo.doFormulara(v0), phz: v0.vo.phz! + 1 });
  const d01 = (await posud(upraveny, bV, vo, { llm: false, iba: ['V01'] })).nalezy[0].doklady ?? [];
  const zdrojPola = (m: string) => d01.find((d) => d.miesto === m)?.nazov ?? '';
  ov.push({ nazov: 'PHZ zmenená vo formulári má zdroj „Formulár kontrolóra“, postup „ITMS21+“', vysledok: `PHZ: ${zdrojPola('PHZ bez DPH')}; postup: ${zdrojPola('Postup')}`, ok: zdrojPola('PHZ bez DPH').startsWith('Formulár kontrolóra') && zdrojPola('Postup').startsWith('ITMS21+') });

  // Údaje, ktoré ITMS21+ nemá (hotovosť), sú vždy z formulára; pri chýbajúcom povinnom údaji „splnené“ doklad nemá.
  const bZ = balik(zop); const z0 = nacitaj(zop, vsetkyId(zop)[0]);
  const hot = (await posud({ ...z0, hotovostMax: 100, hotovostMesiac: 300, hotovostMajetok: 'nie' as const }, bZ, zop, { llm: false, iba: ['P09'] })).nalezy[0];
  ov.push({ nazov: 'P09 so všetkými údajmi o hotovosti: splnené s tromi dokladmi z formulára kontrolóra', vysledok: `${hot.stav}, doklady ${hot.doklady?.map((d) => d.nazov.split(',')[0]).join('; ')}`, ok: hot.stav === 'splnene' && hot.doklady?.length === 3 && hot.doklady.every((d) => d.nazov.startsWith('Formulár kontrolóra')) });

  // Úryvky modelu: každá náležitosť dostane vlastné miesto s číslom riadku prílohy.
  const pravidloV07 = bV.pravidla.find((p) => p.id === 'V07')!;
  const text = 'Záznam zo zadania zákazky\nPredmet zákazky: oprava strechy obecného úradu\nPredpokladaná hodnota zákazky: 41 500,00 EUR bez DPH\nKritérium: najnižšia cena';
  const nalez = { pravidlo: 'V07', ppp: null, nazov: 'V07', druh: 'llm' as const, stav: 'splnene' as const, zdovodnenie: '', citacia: pravidloV07.citacia,
    dokaz: 'predmet zákazky: „Predmet zákazky: oprava strechy obecného úradu“\npredpokladaná hodnota zákazky v eurách: „41 500,00 EUR bez DPH“' };
  const dl = dokladyTextu({ ...v0, prilohy: { zaznam: { nazov: 'zaznam.pdf', text } } }, nalez, pravidloV07, vo);
  ov.push({ nazov: 'Úryvky modelu z prílohy: dve náležitosti, riadky 2 a 3 súboru zaznam.pdf', vysledok: dl.map((d) => `${d.nazov} › ${d.miesto}`).join(' | '), ok: dl.length === 2 && dl[0].riadokOd === 2 && dl[1].riadokOd === 3 && dl.every((d) => d.nazov === 'zaznam.pdf') });

  for (const o of ov) { console.log(`  ${o.ok ? '✓' : '✗'} ${o.nazov} → ${o.vysledok}`); if (!o.ok) process.exitCode = 1; }
  vystup.doklady = ov;
}

vystup.trvanieMs = Date.now() - t0;
fs.mkdirSync(path.join(KOREN, 'eval'), { recursive: true });
fs.writeFileSync(path.join(KOREN, 'eval', 'test-moduly.json'), JSON.stringify(vystup, null, 1));
const fok = Object.values(vystup.moduly).flatMap((x: any) => x.zasadene ?? []).reduce((s: number, z: any) => s + z.falosneOk, 0);
const spolu = Object.values(vystup.moduly).flatMap((x: any) => x.zasadene ?? []).reduce((s: number, z: any) => s + z.n, 0);
console.log(`\nZasadených chýb spolu ${spolu}, falošne OK ${fok}. Hotovo za ${(vystup.trvanieMs / 1000).toFixed(1)} s → eval/test-moduly.json`);
// Falošné OK (splnené pravidlo alebo OK výrok pri zasadenej chybe) je najhorší omyl. Od inventára podmienok v moduloch nesmie nastať.
if (fok) { console.log(`✗ falošne OK pri zasadených chybách: ${fok}`); process.exitCode = 1; }
// Ručne overené príklady modulov (kalkulačka MU, prípady z auditu) musia všetky prejsť.
const zleOverenia = Object.values(vystup.moduly).flatMap((x: any) => x.overenia ?? []).filter((o: any) => !o.ok);
if (zleOverenia.length) { console.log(`✗ neprešli overenia: ${zleOverenia.map((o: any) => o.nazov).join(' | ')}`); process.exitCode = 1; }
