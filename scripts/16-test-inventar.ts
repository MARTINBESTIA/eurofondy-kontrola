// Inventár podmienok výzvy a poistky úplnosti. Bez modelu a bez siete.
// 1. Každý balík žiadosti o NFP vymenúva všetky podmienky výzvy a každé pravidlo patrí k niektorej z nich.
// 2. Citácie podmienok aj pravidiel sú doslovne v zdrojovom texte: zmenené znenie výzvy test zachytí.
// 3. Posudok pridá bod pre kontrolóra ku každej podmienke, ktorú pravidlá nepokrývajú celú.
// 4. Zasadené chyby na všetkých stiahnutých žiadostiach: iná výzva, neskoré predloženie, MRR po uzavretí,
//    opatrenie mimo výzvy. Najhorší omyl je „falošne OK“ (pravidlo splnené alebo výrok OK), nesmie nastať ani raz.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { nacitajBalik, nalezyInventara, posud } from '../src/core/posud.ts';
import type { BalikPravidiel, Citacia, Posudok, Stav, Ziadost } from '../src/core/typy.ts';
import { pripravDokladyFormulara } from '../src/moduly/zonfp/doklady-formular.ts';
import { zonfp } from '../src/moduly/zonfp/modul.ts';
import { normalizujItms21 } from '../src/moduly/zonfp/normalizuj.ts';
import { formularZJson } from '../src/podatelna/podatelna.ts';

const KOREN = path.join(import.meta.dirname, '..');
const VYZVA = 'PSK-SIEA-002-2023-DV-EFRR';
let chyb = 0;
const over = (ok: boolean, sprava: string) => { if (!ok) chyb++; console.log(`${ok ? '✓' : '✗'} ${sprava}`); };
const rovnake = (a: unknown[], b: unknown[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join();

// ---------------------------------------------------------------- 1. úplnosť a súdržnosť inventára
const baliky: BalikPravidiel[] = fs.readdirSync(path.join(KOREN, 'packs'), { withFileTypes: true })
  .filter((d) => d.isDirectory() && fs.existsSync(path.join(KOREN, 'packs', d.name, 'zonfp.json'))).map((d) => nacitajBalik(d.name, 'zonfp'));
over(baliky.length > 0, `balíky žiadosti o NFP: ${baliky.map((b) => b.vyzvaKod).join(', ')}`);
for (const b of baliky) {
  const pod = b.podmienky ?? [];
  console.log(`\n== ${b.vyzvaKod}: ${b.pravidla.length} pravidiel, ${pod.length} podmienok`);
  over(pod.length > 0, 'balík má inventár podmienok (modul ho vyžaduje)');
  over(new Set(pod.map((p) => p.id)).size === pod.length, 'id podmienok sú jedinečné');
  const surove = path.join(KOREN, 'data/raw/itms21', b.vyzvaKod, 'vyzva.json.gz');
  const pppInv = pod.filter((p) => p.typ === 'ppp').map((p) => p.ppp);
  if (fs.existsSync(surove)) {
    const pppItms = JSON.parse(zlib.gunzipSync(fs.readFileSync(surove)).toString()).podmienkaPoskytnutiaPrispevku.map((p: any) => p.poradoveCislo);
    over(rovnake(pppItms, pppInv), `všetkých ${pppItms.length} PPP z ITMS21+ je v inventári a žiadna navyše`);
  } else console.log(`  (detail výzvy z ITMS21+ nie je stiahnutý, PPP sa porovnajú len s pravidlami)`);
  const pppPravidiel = [...new Set(b.pravidla.map((r) => r.ppp).filter((n) => n != null))];
  over(pppPravidiel.every((n) => pppInv.includes(n)), 'každá PPP, na ktorú odkazuje pravidlo, je v inventári');
  const vInventari = new Set(pod.flatMap((p) => p.pravidla));
  const siroty = b.pravidla.filter((r) => !vInventari.has(r.id)).map((r) => r.id);
  over(!siroty.length, `každé pravidlo patrí k podmienke${siroty.length ? ` (bez podmienky: ${siroty.join(', ')})` : ''}`);
  const nezname = [...vInventari].filter((id) => !b.pravidla.some((r) => r.id === id));
  over(!nezname.length, `inventár odkazuje len na existujúce pravidlá${nezname.length ? ` (neznáme: ${nezname.join(', ')})` : ''}`);
  const zlaPpp = pod.filter((p) => p.typ === 'ppp').flatMap((p) => p.pravidla.flatMap((id) => {
    const r = b.pravidla.find((x) => x.id === id); return r && r.ppp !== p.ppp ? [`${id} (PPP ${r.ppp}) pri ${p.id}`] : [];
  }));
  over(!zlaPpp.length, `pravidlá pri PPP majú to isté číslo PPP${zlaPpp.length ? `: ${zlaPpp.join('; ')}` : ''}`);
  const zlePokrytie = pod.filter((p) => !(p.pokrytie === 'uplne' ? p.pravidla.length > 0 && !p.neoverene
    : p.pokrytie === 'ciastocne' ? p.pravidla.length > 0 && !!p.neoverene?.trim()
      : p.pokrytie === 'ziadne' ? p.pravidla.length === 0 && !!p.neoverene?.trim() : false)).map((p) => p.id);
  over(!zlePokrytie.length, `pokrytie zodpovedá pravidlám a popisu neovereného${zlePokrytie.length ? ` (zle: ${zlePokrytie.join(', ')})` : ''}`);
  over(pod.every((p) => ['konanie', 'pred_zmluvou', 'realizacia'].includes(p.okamih) && ['ppp', 'dorucenie', 'dalsia_skutocnost', 'podmienka_rozhodnutia'].includes(p.typ)), 'okamih a typ podmienok sú platné');
  over(pod.some((p) => p.typ === 'dorucenie'), 'inventár obsahuje podmienku predloženia riadne a včas (§ 16 ods. 4 zákona č. 121/2022 Z. z.)');

  // ---------------------------------------------------------------- 2. citácie sú doslovne v zdroji
  // Časti oddelené „[...]“ musia byť v texte zdroja každá zvlášť. Poznámky pod čiarou extrakcia textu nezachytí,
  // preto sa preskočia a len spočítajú.
  const norm = (s: string) => s.replace(/[„“”"]/g, '"').replace(/[–—]/g, '-').replace(/[\s|•]+/g, ' ').trim();
  const texty = new Map<string, string | null>();
  const textDokumentu = (dokument: string) => {
    if (texty.has(dokument)) return texty.get(dokument)!;
    const z = b.zdroje.find((x) => x.nazov === dokument); const m = z?.subor.match(/^data\/zdroje\/([^/]+)\//);
    const txt = z && m ? path.join(KOREN, 'data/zdroje', m[1], 'txt', path.basename(z.subor).replace(/\.[a-z]+$/i, '.txt')) : null;
    const t = txt && fs.existsSync(txt) ? norm(fs.readFileSync(txt, 'utf8')) : null;
    texty.set(dokument, t); return t;
  };
  let poznamok = 0; const nedoslovne: string[] = []; const bezTextu: string[] = [];
  const skontroluj = (id: string, c: Citacia) => {
    const t = textDokumentu(c.dokument);
    if (!t) { bezTextu.push(`${id} (${c.dokument})`); return; }
    poznamok += (c.znenie.match(/\[Pozn\. \d+:\]/g) ?? []).length;
    // Poznámka pod čiarou siaha po ďalšiu poznámku alebo koniec citácie (môže obsahovať aj vlastné „[...]“).
    const casti = c.znenie.replace(/\[Pozn\. \d+:\](?:(?!\[Pozn\.)[\s\S])*/g, ' [...] ').split(/\[\s*(?:\.{3}|…)\s*\]|…/).map(norm).filter(Boolean);
    const chyba = casti.filter((x) => !t.includes(x));
    if (!casti.length || chyba.length) nedoslovne.push(`${id}: „${(chyba[0] ?? '').slice(0, 90)}“`);
  };
  for (const r of b.pravidla) skontroluj(r.id, r.citacia);
  for (const p of pod) skontroluj(p.id, p.citacia);
  over(!bezTextu.length, `každá citácia má zdrojový text na overenie${bezTextu.length ? ` (chýba: ${bezTextu.join(', ')})` : ''}`);
  over(!nedoslovne.length, `citácie pravidiel a podmienok sú doslovne v zdroji (preskočené poznámky pod čiarou: ${poznamok})${nedoslovne.length ? `\n    ${nedoslovne.join('\n    ')}` : ''}`);
}

// ---------------------------------------------------------------- 3. body pre kontrolóra v posudku
console.log('\n== Poistka úplnosti v posudku');
const b = nacitajBalik(VYZVA);
const surovina = fs.readFileSync(path.join(KOREN, 'demo/itms/subory/Formular_NFP401201G856.json'), 'utf8');
const g856 = normalizujItms21(JSON.parse(surovina));
const p856 = await posud(g856, b, zonfp, { llm: false });
const rucne = p856.nalezy.filter((n) => n.druh === 'rucne');
const nepokryte = b.podmienky!.filter((x) => x.pokrytie !== 'uplne');
over(rovnake(rucne.map((n) => n.pravidlo), nepokryte.map((x) => x.id)), `posudok má bod pre kontrolóra ku každej z ${nepokryte.length} podmienok, ktoré pravidlá nepokrývajú celé (${nepokryte.map((x) => x.id).join(', ')})`);
over(rucne.every((n) => n.stav === (b.podmienky!.find((x) => x.id === n.pravidlo)!.okamih === 'konanie' ? 'na_preverenie' : 'mimo_podkladov')),
  'v konaní ide bod na preverenie, pri overení až pred zmluvou alebo v realizácii je mimo podkladov');
over(p856.navrh === 'na_preverenie', `kým PPP č. 4 a 8 nemajú pravidlá, výrok nie je OK (je ${p856.navrh})`);
over(/softvér nekontroluje vôbec alebo len sčasti: \d+/.test(p856.zhrnutie), 'zhrnutie uvádza počet podmienok, ktoré softvér nekontroluje celé');
over(!(await posud(g856, b, zonfp, { llm: false, iba: ['D12'] })).nalezy.some((n) => n.druh === 'rucne'), 'čiastková kontrola (iba) nepridáva body inventára');
const bezInventara = { ...b, podmienky: undefined };
const inv = nalezyInventara(bezInventara, zonfp);
over(inv.length === 1 && inv[0].pravidlo === 'INV' && inv[0].stav === 'na_preverenie', 'balík žiadosti bez inventára: celá úplnosť ide človeku');
over(nalezyInventara(bezInventara, { inventarPodmienok: false }).length === 0, 'modul bez povinného inventára nepridá nič');
const bezPokrytia = { ...b, podmienky: b.podmienky!.map((x) => (x.id === 'PPP12' ? { ...x, pokrytie: undefined as never } : x)) };
over(nalezyInventara(bezPokrytia, zonfp).some((n) => n.pravidlo === 'PPP12'), 'podmienka bez uvedeného pokrytia sa berie ako nepokrytá');

// Dôkaz k F01 cituje dátum aj kategóriu regiónu a kraj, ktoré kontrola použila.
const f01 = p856.nalezy.find((n) => n.pravidlo === 'F01')!;
const doklady = pripravDokladyFormulara(surovina, g856)(f01).map((d) => d.miesto);
over(f01.stav === 'splnene' && ['$.datumPredlozenia', '$.kategoriaRegionov[0].kodZdroj', '$.miestoRealizacieFull[0].nuts3.nazovSk'].every((m) => doklady.some((d) => d.startsWith(m))),
  `F01 na G856: ${f01.stav}, citácie ${doklady.map((d) => d.split(' ')[0]).join(', ')}`);

// Štruktúrovaný formulár bez kódu výzvy: kód sa nedoplní zo spisu, aby V01 neprešlo bez dôkazu.
const strukt = { ziadatel: { nazov: 'Obec Test', pravnaFormaKod: '801' } };
over(formularZJson(JSON.stringify(strukt), VYZVA, () => undefined).ziadost.vyzvaKod === '', 'formulár bez kódu výzvy ostane bez kódu (nedoplní sa zo spisu)');
over(formularZJson(JSON.stringify({ ...strukt, vyzvaKod: 'X-1' }), VYZVA, () => undefined).ziadost.vyzvaKod === 'X-1', 'kód výzvy z formulára sa zachová');

// ---------------------------------------------------------------- 4. zasadené chyby na všetkých žiadostiach
console.log('\n== Zasadené chyby (všetky stiahnuté žiadosti)');
const vsetky: Ziadost[] = zonfp.pripady('', '', 1e9).pripady.map((x) => zonfp.nacitaj(x.id)!);
const okVyrok = (p: Posudok) => p.navrh === 'bez_zisteni' || p.navrh === 'ciastocne_overene';
const kopia = (z: Ziadost, zmena: (x: Ziadost) => void) => { const x = structuredClone(z); zmena(x); return x; };
async function zasad(nazov: string, pravidlo: string, ocakavane: Stav, vstupy: Ziadost[]) {
  let presne = 0, falosneOk = 0; const stavy: Record<string, number> = {}; let priklad = '';
  for (const v of vstupy) {
    const p = await posud(v, b, zonfp, { llm: false });
    const n = p.nalezy.find((x) => x.pravidlo === pravidlo)!;
    stavy[n.stav] = (stavy[n.stav] ?? 0) + 1;
    if (n.stav === ocakavane) presne++; else if (!priklad) priklad = `${v.kod}: ${n.stav}: ${n.zdovodnenie.slice(0, 160)}`;
    if (n.stav === 'splnene' || n.stav === 'neuplatnuje_sa' || okVyrok(p)) falosneOk++;
  }
  over(vstupy.length > 0 && presne === vstupy.length && falosneOk === 0,
    `[${pravidlo}] ${nazov}: ${presne}/${vstupy.length} ${ocakavane}, falošne OK ${falosneOk} ${JSON.stringify(stavy)}${priklad ? `\n    napr. ${priklad}` : ''}`);
}
const sDatumom = vsetky.filter((z) => z.datumPredlozenia);
const mrr = sDatumom.filter((z) => z.kategoriaRegionov.join() === 'MRR' && z.miesta.length && z.miesta.every((m) => m.kraj && m.kraj !== 'Bratislavský kraj'));
const vrr = sDatumom.filter((z) => z.kategoriaRegionov.join() === 'VRR' && z.miesta.length && z.miesta.every((m) => m.kraj === 'Bratislavský kraj'));
const sHlavnou = vsetky.filter((z) => z.aktivity.some((a) => a.hlavna));
const prvaHlavna = (x: Ziadost) => x.aktivity.find((a) => a.hlavna)!;
console.log(`  žiadostí ${vsetky.length}, s dátumom ${sDatumom.length}, MRR ${mrr.length}, VRR ${vrr.length}, s hlavnou aktivitou ${sHlavnou.length}`);

await zasad('formulár je z inej výzvy', 'V01', 'nesplnene', vsetky.map((z) => kopia(z, (x) => { x.vyzvaKod = 'PSK-MZP-020-2024-ITI-EFRR'; })));
await zasad('formulár nemá kód výzvy', 'V01', 'na_preverenie', vsetky.map((z) => kopia(z, (x) => { x.vyzvaKod = ''; })));
await zasad('predložená po uzavretí výzvy (2. 2. 2026)', 'F01', 'nesplnene', vsetky.map((z) => kopia(z, (x) => { x.datumPredlozenia = '2026-02-02'; })));
await zasad('predložená v deň uzavretia výzvy', 'F01', 'na_preverenie', vsetky.map((z) => kopia(z, (x) => { x.datumPredlozenia = '2026-01-09'; })));
await zasad('MRR predložená po uzavretí pre MRR (14. 3. 2025)', 'F01', 'nesplnene', mrr.map((z) => kopia(z, (x) => { x.datumPredlozenia = '2025-03-14'; })));
await zasad('MRR predložená v deň uzavretia pre MRR', 'F01', 'na_preverenie', mrr.map((z) => kopia(z, (x) => { x.datumPredlozenia = '2025-01-09'; })));
await zasad('MRR po uzavretí, kategória chýba a odvodí sa z kraja', 'F01', 'nesplnene', mrr.map((z) => kopia(z, (x) => { x.datumPredlozenia = '2025-03-14'; x.kategoriaRegionov = []; })));
await zasad('po uzavretí pre MRR, chýba kategória aj kraj', 'F01', 'na_preverenie', mrr.map((z) => kopia(z, (x) => { x.datumPredlozenia = '2025-03-14'; x.kategoriaRegionov = []; x.miesta = x.miesta.map((m) => ({ ...m, kraj: '' })); })));
await zasad('kategória VRR, ale miesto v MRR', 'F01', 'na_preverenie', mrr.map((z) => kopia(z, (x) => { x.kategoriaRegionov = ['VRR']; })));
await zasad('chýba dátum predloženia', 'F01', 'na_preverenie', vsetky.map((z) => kopia(z, (x) => { x.datumPredlozenia = null; })));
await zasad('hlavná aktivita z opatrenia mimo výzvy (2.5.1)', 'D07a', 'nesplnene', sHlavnou.map((z) => kopia(z, (x) => { prvaHlavna(x).opatrenie = '2.5.1'; })));
await zasad('hlavná aktivita bez opatrenia', 'D07a', 'na_preverenie', sHlavnou.map((z) => kopia(z, (x) => { prvaHlavna(x).opatrenie = null; })));
await zasad('občianske združenie (doplnkové podmienky PPP č. 1)', 'D01', 'na_preverenie', vsetky.map((z) => kopia(z, (x) => { x.ziadatel = { ...x.ziadatel, pravnaFormaKod: '701', pravnaForma: 'Združenie (zväz, spolok, spoločnosť, klub ai.)' }; })));

// Bez falošného poplachu: VRR po uzavretí pre MRR je včas; nezmenené skutočné žiadosti nové pravidlá nezamietnu.
let vrrOk = 0;
for (const z of vrr) { const p = await posud(kopia(z, (x) => { x.datumPredlozenia = '2025-06-06'; }), b, zonfp, { llm: false, iba: ['F01'] }); if (p.nalezy[0].stav === 'splnene') vrrOk++; }
over(vrr.length > 0 && vrrOk === vrr.length, `[F01] VRR predložená po uzavretí pre MRR je včas: ${vrrOk}/${vrr.length} splnené`);
const zamietnute: string[] = [];
for (const z of vsetky.filter((x) => x.vysledok === 'schvalena')) {
  const p = await posud(z, b, zonfp, { llm: false, iba: ['V01', 'F01', 'D01', 'D07a'] });
  for (const n of p.nalezy) if (n.stav === 'nesplnene') zamietnute.push(`${z.kod} ${n.pravidlo}`);
}
over(!zamietnute.length, `nové pravidlá neoznačia ako nesplnenú žiadnu schválenú žiadosť${zamietnute.length ? `: ${zamietnute.slice(0, 5).join(', ')}` : ''}`);

console.log(chyb ? `\n${chyb} kontrol zlyhalo.` : '\nVšetky kontroly prešli.');
process.exit(chyb ? 1 : 0);
