// Inventár podmienok výzvy a poistky úplnosti. Bez modelu a bez siete.
// 1. Každý balík žiadosti o NFP vymenúva všetky podmienky výzvy a každé pravidlo patrí k niektorej z nich.
// 2. Citácie podmienok aj pravidiel sú doslovne v zdrojovom texte: zmenené znenie výzvy test zachytí.
// 3. Posudok pridá bod pre kontrolóra ku každej podmienke, ktorú pravidlá nepokrývajú celú.
// 4. Zasadené chyby na všetkých stiahnutých žiadostiach: iná výzva, neskoré predloženie, MRR po uzavretí,
//    opatrenie mimo výzvy. Najhorší omyl je „falošne OK“ (pravidlo splnené alebo výrok OK), nesmie nastať ani raz.
// 5. Verzie: znenie výzvy sa vyberá podľa kola žiadosti (§ 14 ods. 4 zákona č. 121/2022 Z. z.), pochybnosti idú človeku.
// 6. Zmeny výzvy v ITMS21+: každá zmena oproti stavu, ktorý posúdil človek, aj chýbajúca či stará kontrola dajú bod na preverenie.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { koloPodlaDatumu, nacitajBalik, nalezyInventara, posud, posudPodlaKola, verzieBalika, vyberVerziu, vyrokPosudku } from '../src/core/posud.ts';
import { castiCitacie, cestaTextuZdroja, normCitacie } from '../src/core/zdroje.ts';
import { MAX_VEK_KONTROLY_DNI, nacitajZakladZmien, nalezyZmienVyzvy, nepokryteVerzie, porovnajStav, prevezmiStav, stavZItms, type KontrolaZmien, type StavVyzvyItms, type ZmenaVyzvy } from '../src/core/zmeny.ts';
import type { BalikPravidiel, Citacia, Nalez, Posudok, Stav, Ziadost } from '../src/core/typy.ts';
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
// Každá verzia balíka (platná aj archívne znenia výzvy) musí byť úplná a doslovná.
const vyzvy = fs.readdirSync(path.join(KOREN, 'packs'), { withFileTypes: true })
  .filter((d) => d.isDirectory() && fs.existsSync(path.join(KOREN, 'packs', d.name, 'zonfp.json'))).map((d) => d.name);
const baliky: BalikPravidiel[] = vyzvy.flatMap((v) => verzieBalika(v, 'zonfp'));
over(baliky.length > 0, `balíky žiadosti o NFP: ${baliky.map((b) => `${b.vyzvaKod}${b.verziaBalika ? ` (${b.verziaBalika.id})` : ''}`).join(', ')}`);
for (const b of baliky) {
  const pod = b.podmienky ?? [];
  console.log(`\n== ${b.vyzvaKod}${b.verziaBalika ? ` · ${b.verzia} (${b.verziaBalika.id}, ${b.verziaBalika.stav})` : ''}: ${b.pravidla.length} pravidiel, ${pod.length} podmienok`);
  over(pod.length > 0, 'balík má inventár podmienok (modul ho vyžaduje)');
  over(new Set(pod.map((p) => p.id)).size === pod.length, 'id podmienok sú jedinečné');
  const surove = path.join(KOREN, 'data/raw/itms21', b.vyzvaKod, 'vyzva.json.gz');
  const pppInv = pod.filter((p) => p.typ === 'ppp').map((p) => p.ppp);
  if (b.verziaBalika && b.verziaBalika.stav !== 'platna') {
    // Detail výzvy z ITMS21+ opisuje len najnovšiu verziu; staršie znenie musí mať PPP očíslované 1 až N bez medzier.
    const cisla = [...pppInv].sort((x, y) => x! - y!);
    over(cisla.every((n, i) => n === i + 1), `PPP archívneho znenia sú očíslované 1 až ${cisla.length} bez medzier`);
  } else if (fs.existsSync(surove)) {
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
  const texty = new Map<string, string | null>();
  const textDokumentu = (dokument: string) => {
    if (texty.has(dokument)) return texty.get(dokument)!;
    const z = b.zdroje.find((x) => x.nazov === dokument); const txt = z ? cestaTextuZdroja(z.subor) : null;
    const t = txt ? normCitacie(fs.readFileSync(txt, 'utf8')) : null;
    texty.set(dokument, t); return t;
  };
  let poznamok = 0; const nedoslovne: string[] = []; const bezTextu: string[] = [];
  const skontroluj = (id: string, c: Citacia) => {
    const t = textDokumentu(c.dokument);
    if (!t) { bezTextu.push(`${id} (${c.dokument})`); return; }
    poznamok += (c.znenie.match(/\[Pozn\. \d+:\]/g) ?? []).length;
    // Poznámka pod čiarou siaha po ďalšiu poznámku alebo koniec citácie (môže obsahovať aj vlastné „[...]“).
    const casti = castiCitacie(c.znenie);
    const chyba = casti.filter((x) => !t.includes(x));
    if (!casti.length || chyba.length) nedoslovne.push(`${id}: „${(chyba[0] ?? '').slice(0, 90)}“`);
  };
  for (const r of b.pravidla) skontroluj(r.id, r.citacia);
  for (const p of pod) skontroluj(p.id, p.citacia);
  if (b.verziaBalika) skontroluj('verziaBalika', b.verziaBalika.citacia);
  if (b.harmonogramKol) skontroluj('harmonogramKol', b.harmonogramKol.citacia);
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
    // Každá žiadosť podľa znenia výzvy pre jej kolo, ako v podateľni.
    const { posudok: p } = await posudPodlaKola(v, VYZVA, zonfp, { llm: false });
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
for (const z of vrr) { const { posudok: p } = await posudPodlaKola(kopia(z, (x) => { x.datumPredlozenia = '2025-06-06'; }), VYZVA, zonfp, { llm: false, iba: ['F01'] }); if (p.nalezy[0].stav === 'splnene') vrrOk++; }
over(vrr.length > 0 && vrrOk === vrr.length, `[F01] VRR predložená po uzavretí pre MRR je včas: ${vrrOk}/${vrr.length} splnené`);
const zamietnute: string[] = [];
for (const z of vsetky.filter((x) => x.vysledok === 'schvalena')) {
  const { posudok: p } = await posudPodlaKola(z, VYZVA, zonfp, { llm: false, iba: ['V01', 'F01', 'D01', 'D07a', 'G05', 'P09'] });
  for (const n of p.nalezy) if (n.stav === 'nesplnene') zamietnute.push(`${z.kod} ${n.pravidlo}`);
}
over(!zamietnute.length, `nové pravidlá neoznačia ako nesplnenú žiadnu schválenú žiadosť${zamietnute.length ? `: ${zamietnute.slice(0, 5).join(', ')}` : ''}`);

// ---------------------------------------------------------------- 5. znenie výzvy podľa kola
console.log('\n== Znenie výzvy podľa kola (§ 14 ods. 4 a 5 zákona č. 121/2022 Z. z.)');
const verzie = verzieBalika(VYZVA, 'zonfp');
const vb = verzie.map((x) => x.verziaBalika!);
const h = b.harmonogramKol!;
over(verzie.length >= 2 && vb.every(Boolean) && vb.filter((x) => x.stav === 'platna').length === 1 && vb[vb.length - 1].stav === 'platna',
  `verzie: ${verzie.map((x) => `${x.verziaBalika?.id} od kola ${x.verziaBalika?.odKola}`).join(', ')}; práve jedna platná a je najnovšia`);
over(vb[0].odKola === 1 && vb.every((x, i) => i === 0 || x.odKola > vb[i - 1].odKola), 'prvé znenie platí od kola 1 a hranice kôl rastú');
over(verzie.every((x) => koloPodlaDatumu(x.platnaOd, h) === x.verziaBalika!.odKola),
  `hranica znenia = kolo, v ktorom zmena nadobudla účinnosť: ${verzie.map((x) => `${x.platnaOd} → kolo ${koloPodlaDatumu(x.platnaOd, h)}`).join(', ')}`);
over(verzie.every((x) => JSON.stringify({ ...x.harmonogramKol, citacia: 0 }) === JSON.stringify({ ...h, citacia: 0 })), 'harmonogram kôl je vo všetkých zneniach rovnaký');
over(verzie.every((x) => x.verziaBalika!.schvalenie.poznamka.trim().length > 0), 'každé znenie uvádza stav schválenia s poznámkou');
const sKolom = vsetky.filter((z) => z.kolo != null && z.datumPredlozenia);
const zhoda = sKolom.filter((z) => koloPodlaDatumu(z.datumPredlozenia!, h) === z.kolo).length;
over(zhoda / sKolom.length >= 0.98, `kolo z dátumu sa zhoduje s kolom z ITMS21+ v ${zhoda} z ${sKolom.length} žiadostí`);
const podlaVerzie: Record<string, number> = {}; const body: Record<string, number> = {};
for (const z of vsetky) {
  const r = vyberVerziu(VYZVA, zonfp, z);
  podlaVerzie[r.vyber!.verziaId] = (podlaVerzie[r.vyber!.verziaId] ?? 0) + 1;
  for (const n of r.nalezy) body[n.pravidlo] = (body[n.pravidlo] ?? 0) + 1;
}
console.log(`  skutočné žiadosti podľa znenia: ${JSON.stringify(podlaVerzie)}; body pre kontrolóra: ${JSON.stringify(body)}`);

const vzor = vsetky.find((z) => z.opatrenia.includes('2.1.2') && z.aktivity.some((a) => a.hlavna))!;
const sKolomADatumom = (kolo: number | null, datum: string | null) => vyberVerziu(VYZVA, zonfp, kopia(vzor, (x) => { x.kolo = kolo; x.datumPredlozenia = datum; }));
const ids = (r: ReturnType<typeof vyberVerziu>) => r.nalezy.map((n) => n.pravidlo).sort().join(',');
const pripady: [string, number | null, string | null, string, string][] = [
  ['kolo 12 z ITMS21+', 12, '2024-05-20', 'akt2', 'VER-SCHVALENIE'],
  ['len dátum 19. 9. 2025 (kolo 83)', null, '2025-09-19', 'zmena3', ''],
  ['len dátum v deň uzavretia kola 78, posledného pred zmenou č. 3', null, '2025-08-15', 'akt2', 'VER-KOLO,VER-SCHVALENIE'],
  ['len dátum 18. 8. 2025: kolo 79, pred účinnosťou zmeny č. 3 (§ 14 ods. 5)', null, '2025-08-18', 'zmena3', 'VER-ZMENA'],
  ['len dátum 1. 2. 2024: kolo 1, pred účinnosťou zmeny č. 2 (§ 14 ods. 5)', null, '2024-02-01', 'akt2', 'VER-SCHVALENIE,VER-ZMENA'],
  ['bez kola aj dátumu', null, null, 'zmena3', 'VER-KOLO'],
  ['kolo 78 z ITMS21+, ale dátum v kole 79', 78, '2025-08-20', 'akt2', 'VER-KOLO,VER-SCHVALENIE'],
];
for (const [nazov, kolo, datum, verzia, ocak] of pripady) {
  const r = sKolomADatumom(kolo, datum);
  over(r.vyber!.verziaId === verzia && ids(r) === ocak && r.nalezy.every((n) => n.stav === 'na_preverenie' && n.druh === 'verzia'),
    `${nazov}: znenie ${r.vyber!.verziaId}, body ${ids(r) || '–'} · ${r.vyber!.zdovodnenie}`);
}
// Rozdiely znení v posudku: archívne znenie žiada Prílohu č. 9 (súlad s HP) a nemá PPP č. 15 (EDES); platné naopak.
const sPrilohami = (kolo: number, cisla: string[]) => kopia(vzor, (x) => {
  x.kolo = kolo;
  x.prilohy = Object.fromEntries(cisla.map((c) => [c, { nazov: `Príloha č. ${c}`, text: `Príloha č. ${c} `.repeat(10), zaradenie: 'potvrdene' }])) as Ziadost['prilohy'];
});
const p2 = (await posudPodlaKola(sPrilohami(12, ['7', '8']), VYZVA, zonfp, { llm: false })).posudok;
const p2s9 = (await posudPodlaKola(sPrilohami(12, ['7', '8', '9']), VYZVA, zonfp, { llm: false })).posudok;
const p3 = (await posudPodlaKola(sPrilohami(83, ['7', '8']), VYZVA, zonfp, { llm: false })).posudok;
const stavP = (p: Posudok, id: string) => p.nalezy.find((n) => n.pravidlo === id)?.stav ?? 'chýba';
over(stavP(p2, 'P09') === 'chyba_podklad' && stavP(p2s9, 'P09') === 'splnene' && stavP(p2, 'G15') === 'chýba' && stavP(p2, 'PPP15') === 'chýba',
  `kolo 12 (akt. 2): bez Prílohy č. 9 ${stavP(p2, 'P09')}, s ňou ${stavP(p2s9, 'P09')}, PPP č. 15 ${stavP(p2, 'G15')}`);
over(stavP(p3, 'P09') === 'chýba' && stavP(p3, 'G15') !== 'chýba' && p3.vyberVerzie?.verziaId === 'zmena3',
  `kolo 83 (zmena č. 3): Príloha č. 9 ${stavP(p3, 'P09')}, PPP č. 15 ${stavP(p3, 'G15')}`);
over(p2.vyberVerzie?.verziaId === 'akt2' && p2.verziaBalika === verzie[0].verzia && !okVyrok(p2) && !okVyrok(p2s9),
  `posudok zaznamená znenie (${p2.verziaBalika}) a pri neschválenom znení nie je OK (${p2s9.navrh})`);
over(!(await posudPodlaKola(sPrilohami(12, ['7', '8']), VYZVA, zonfp, { llm: false, iba: ['P09'] })).posudok.nalezy.some((n) => n.druh === 'verzia'),
  'čiastková kontrola (iba) nepridáva body o znení');

// ---------------------------------------------------------------- 6. zmeny výzvy v ITMS21+
// Základ (stav výzvy, ktorý posúdil človek) sa porovnáva so živým ITMS21+ (npm run zmeny). Test je bez siete:
// zmeny sa simulujú na kópii základu a výsledok kontroly sa posudku podá priamo.
console.log('\n== Zmeny výzvy v ITMS21+');
const zaklad = nacitajZakladZmien(VYZVA)!;
over(!!zaklad, `výzva má základ zmien prevzatý ${zaklad?.prevzate.kedy}: ${zaklad?.verzie.length} verzií, ${zaklad?.dokumenty.length} dokumentov, ${zaklad?.ppp.length} PPP, ${zaklad?.aktuality.length} aktualít`);
{
  const z = b.zdroje.find((x) => x.nazov === zaklad.citacia.dokument); const txt = z ? cestaTextuZdroja(z.subor) : null;
  const t = txt ? normCitacie(fs.readFileSync(txt, 'utf8')) : '';
  const casti = castiCitacie(zaklad.citacia.znenie);
  over(!!t && casti.length > 0 && casti.every((c) => t.includes(c)), `citácia o zmenách výzvy je doslovne v zdroji (${zaklad.citacia.dokument}, ${zaklad.citacia.cast})`);
}
over(!nepokryteVerzie(zaklad, verzie, zaklad.bezBalika).length && zaklad.bezBalika.every((x) => x.dovod.trim().length > 0),
  `každá verzia výzvy má balík alebo zdôvodnenie, prečo nie: ${zaklad.verzie.map((v) => `${v.cislo}→${verzie.find((x) => x.verziaBalika?.itmsVerzie.includes(v.cislo))?.verziaBalika?.id ?? 'bez balíka'}`).join(', ')}`);
over(!porovnajStav(zaklad, zaklad, verzie).length, 'nezmenený stav nedáva žiadnu zmenu');
const ulozenyDetail = path.join(KOREN, 'data', 'raw', 'itms21', VYZVA, 'vyzva.json.gz');
if (fs.existsSync(ulozenyDetail)) {
  const zmenyUlozeneho = porovnajStav(zaklad, stavZItms(JSON.parse(zlib.gunzipSync(fs.readFileSync(ulozenyDetail)).toString('utf8'))), verzie);
  over(!zmenyUlozeneho.length, `uložený detail výzvy z ITMS21+ zodpovedá základu${zmenyUlozeneho.length ? `: ${zmenyUlozeneho.map((x) => x.popis).join(' ')}` : ''}`);
}
const zmen = (f: (s: StavVyzvyItms) => void) => { const s = structuredClone(zaklad) as StavVyzvyItms; f(s); return porovnajStav(zaklad, s, verzie); };
const druhy = (z: ZmenaVyzvy[]) => [...new Set(z.map((x) => x.druh))].sort().join(',');
const novaVerzia = (s: StavVyzvyItms) => { s.verzie.push({ cislo: 7, id: 99999, datum: '2026-12-04' }); };
const scenareZmien: [string, (s: StavVyzvyItms) => void, string][] = [
  ['nová verzia výzvy bez balíka', novaVerzia, 'nepokryta_verzia,verzia'],
  ['nový dokument výzvy', (s) => { s.dokumenty.push({ uuid: '00000000-0000-0000-0000-000000000000', nazov: 'Usmernenie_c1.docx' }); }, 'dokument'],
  ['odstránený dokument výzvy', (s) => { s.dokumenty.pop(); }, 'dokument'],
  ['zmenený popis alebo prílohy PPP', (s) => { s.ppp[s.ppp.length - 1].odtlacok = 'zmenene'; }, 'ppp'],
  ['posunutý termín ukončenia', (s) => { s.stav.datumUkoncenia = '2026-03-31'; }, 'stav'],
  ['pozastavené predkladanie', (s) => { s.stav.pozastavene = true; }, 'stav'],
  ['nová aktualita', (s) => { s.aktuality.push({ datum: '2026-11-20', nazov: 'Usmernenie k výzve', odtlacok: 'nova' }); }, 'aktualita'],
];
for (const [nazov, f, ocak] of scenareZmien) { const z = zmen(f); over(druhy(z) === ocak, `${nazov} → ${druhy(z) || 'nič'}: ${z.map((x) => x.popis).join(' ')}`); }
// ITMS21+ čísluje PPP podľa abecedy: nová podmienka posunie čísla ďalších, zmena však musí byť jedna.
const novaPpp = zmen((s) => { for (const p of s.ppp) if (p.cislo >= 5) p.cislo++; s.ppp.push({ cislo: 5, nazov: 'Podmienka partnerstva', odtlacok: 'nova' }); });
over(novaPpp.length === 1 && novaPpp[0].druh === 'ppp', `nová PPP, ktorá posunie číslovanie v ITMS21+, je jedna zmena: ${novaPpp.map((x) => x.popis).join(' ')}`);
// Prevzatie zmien je krok človeka: bez poznámky alebo s verziou výzvy bez balíka ho softvér odmietne (nič nezapíše).
const odmietnute = (f: () => unknown) => { try { f(); return false; } catch { return true; } };
const sNovouVerziou = structuredClone(zaklad) as StavVyzvyItms; novaVerzia(sNovouVerziou);
over(odmietnute(() => prevezmiStav(VYZVA, zaklad, verzie, '   ', { stiahnute: zaklad.prevzate.stiahnute, zdroj: 'ulozeny' }))
  && odmietnute(() => prevezmiStav(VYZVA, sNovouVerziou, verzie, 'posúdené', { stiahnute: zaklad.prevzate.stiahnute, zdroj: 'ulozeny' })),
  'prevzatie zmien odmietne prázdnu poznámku aj verziu výzvy bez balíka');
const sNeexistujucou = verzie.map((x, i) => (i === 0 ? { ...x, verziaBalika: { ...x.verziaBalika!, itmsVerzie: [...x.verziaBalika!.itmsVerzie, 9] } } : x));
over(druhy(porovnajStav(zaklad, zaklad, sNeexistujucou)) === 'nepokryta_verzia', 'balík odkazujúci na verziu výzvy, ktorú ITMS21+ nemá, je nezrovnalosť');

const kontrolaZ = (zmeny: ZmenaVyzvy[], zistene = '2026-11-21T10:00:00.000Z'): KontrolaZmien =>
  ({ vyzva: VYZVA, zistene, zdroj: 'itms', stiahnute: zistene, zakladZ: zaklad.prevzate.kedy, zmeny });
const idsZ = (n: Nalez[]) => n.map((x) => x.pravidlo).sort().join(',');
const bodyZmien: [string, KontrolaZmien | null, string, string][] = [
  ['čerstvá kontrola bez zmien', kontrolaZ([]), '2026-11-21', ''],
  [`kontrola stará ${MAX_VEK_KONTROLY_DNI} dní`, kontrolaZ([]), '2026-11-28', ''],
  [`kontrola staršia ako ${MAX_VEK_KONTROLY_DNI} dní`, kontrolaZ([]), '2026-11-29', 'VER-KONTROLA'],
  ['kontrola ešte neprebehla', null, '2026-11-21', 'VER-KONTROLA'],
  ['neposúdená zmena', kontrolaZ(zmen((s) => { s.stav.pozastavene = true; })), '2026-11-21', 'VER-ITMS'],
  ['neposúdená zmena a stará kontrola', kontrolaZ(zmen(novaVerzia)), '2026-12-10', 'VER-ITMS,VER-KONTROLA'],
];
for (const [nazov, k, dnes, ocak] of bodyZmien) {
  const n = nalezyZmienVyzvy(k, zaklad.citacia, dnes);
  over(idsZ(n) === ocak && n.every((x) => x.stav === 'na_preverenie' && x.druh === 'verzia'), `${nazov} (${dnes}) → ${idsZ(n) || 'bez bodu'}`);
}
const bodItms = nalezyZmienVyzvy(kontrolaZ(zmen(novaVerzia)), zaklad.citacia, '2026-11-21')[0];
const inakCisty: Nalez = { pravidlo: 'X01', ppp: null, nazov: 'inak splnené', druh: 'data', stav: 'splnene', okamih: 'konanie', zdovodnenie: '', citacia: zaklad.citacia };
over(vyrokPosudku([inakCisty]).navrh === 'bez_zisteni' && vyrokPosudku([inakCisty, bodItms]).navrh === 'na_preverenie',
  'neposúdená zmena výzvy zmení inak čistý výrok na „na preverenie“');
const pZmena = (await posudPodlaKola(sPrilohami(83, ['7', '8']), VYZVA, zonfp, { llm: false, zmenyVyzvy: kontrolaZ(zmen(novaVerzia)), dnes: '2026-11-21' })).posudok;
const pCisto = (await posudPodlaKola(sPrilohami(83, ['7', '8']), VYZVA, zonfp, { llm: false, zmenyVyzvy: kontrolaZ([]), dnes: '2026-11-21' })).posudok;
over(pZmena.nalezy.some((n) => n.pravidlo === 'VER-ITMS') && !okVyrok(pZmena) && !pCisto.nalezy.some((n) => ['VER-ITMS', 'VER-KONTROLA'].includes(n.pravidlo)),
  `posudok s neposúdenou zmenou má VER-ITMS (${pZmena.navrh}), po posúdení bez bodu`);
over(!(await posudPodlaKola(sPrilohami(83, ['7', '8']), VYZVA, zonfp, { llm: false, iba: ['P08'], zmenyVyzvy: null })).posudok.nalezy.some((n) => n.druh === 'verzia'),
  'čiastková kontrola (iba) nepridáva body o zmenách výzvy');

console.log(chyb ?`\n${chyb} kontrol zlyhalo.` : '\nVšetky kontroly prešli.');
process.exit(chyb ? 1 : 0);
