// Test 2: lokálny model ako čitateľ textu. Tri časti:
//  A) reálne popisy projektov (pravidlo L07): žiadosti, ktoré podľa poskytovateľa podmienky splnili -> model nesmie hlásiť "nesplnené"
//  B) riadené chyby v popise (L07): popisy neoprávnených budov, vyrobené zo šablón -> model má hlásiť "nesplnené"
//  C) riadené chyby v prílohe (L01): syntetické plnomocenstvá, úplné a s jednou vynechanou náležitosťou
// B a C sú syntetické texty (reálne prílohy žiadostí nie sú verejné), preto sú len dolným odhadom náročnosti.
import fs from 'node:fs';
import path from 'node:path';
import { nacitajBalik, posud } from '../src/core/posud.ts';
import { MODEL, dostupny, vyloz } from '../src/llm/ollama.ts';
import type { Ziadost } from '../src/core/typy.ts';

const N_REAL = Number(process.argv.find((a) => /^d+$/.test(a)) ?? 60);
// --iba=BC spustí len vybrané časti a ostatné prevezme z posledného behu
const IBA = process.argv.find((a) => a.startsWith('--iba='))?.slice(6) ?? 'ABCD';
const koren = path.join(import.meta.dirname, '..');
const kodVyzvy = 'PSK-SIEA-002-2023-DV-EFRR';
const vsetky: Ziadost[] = JSON.parse(fs.readFileSync(path.join(koren, 'data', 'odvodene', kodVyzvy, 'ziadosti.json'), 'utf8'));
const balik = nacitajBalik(kodVyzvy);
if (!(await dostupny())) { console.error('Ollama nebeží na 127.0.0.1:11434.'); process.exit(1); }

// deterministický výber (každá k-tá), aby bol test opakovateľný
const kazda = <T>(a: T[], n: number) => a.filter((_, i) => i % Math.max(1, Math.floor(a.length / n)) === 0).slice(0, n);
const maText = (z: Ziadost) => z.popis.length > 400 && z.aktivity.some((a) => a.hlavna && a.opatrenie === '2.1.2');
const presli = kazda(vsetky.filter((z) => (z.vysledok === 'schvalena' || z.dovod === 'nedostatok_prostriedkov') && maText(z)), N_REAL);
const nesplnili = kazda(vsetky.filter((z) => z.vysledok === 'neschvalena' && z.dovod === 'nesplnenie_ppp' && maText(z)), Math.round(N_REAL / 2));

type Riadok = { cast: string; id: string; ocakavane: string; stav: string; ms: number; zdovodnenie: string; dokaz?: string };
const predosle = path.join(koren, 'eval', 'test-llm.json');
const riadky: Riadok[] = IBA !== 'ABCD' && fs.existsSync(predosle) ? (JSON.parse(fs.readFileSync(predosle, 'utf8')).riadky as Riadok[]).filter((r) => !IBA.includes(r.cast[0])) : [];
async function spusti(cast: string, id: string, z: Ziadost, pravidlo: string, ocakavane: string, b = balik) {
  const p = await posud(z, b, { iba: [pravidlo] });
  const n = p.nalezy[0];
  riadky.push({ cast, id, ocakavane, stav: n.stav, ms: Number(n.hodnoty?.ms ?? p.trvanieMs), zdovodnenie: n.zdovodnenie, dokaz: n.dokaz });
  fs.writeFileSync(path.join(koren, 'eval', 'test-llm.priebeh.json'), JSON.stringify(riadky)); // priebežne, aby sa prerušený beh nestratil
  process.stdout.write(`\r${cast} ${riadky.filter((r) => r.cast === cast).length}   `);
}

// A) reálne popisy
if (IBA.includes('A')) {
  for (const z of presli) await spusti('A_presli', z.kod, z, 'L07', 'nie_nesplnene');
  for (const z of nesplnili) await spusti('A_nesplnili', z.kod, z, 'L07', 'neznamy_dovod');
}

// B) riadené chyby v popise: neoprávnený predmet projektu
const obce = ['Dolná Lehota', 'Veľké Kosihy', 'Nová Bystrica', 'Kráľová pri Senci', 'Horné Orešany'];
const sablony: ((o: string) => string)[] = [
  (o) => `Predmetom projektu je komplexná obnova bytového domu na ulici Hlavná 12 v obci ${o}. Bytový dom má 24 bytových jednotiek vo vlastníctve jednotlivých vlastníkov bytov, ktorých zastupuje spoločenstvo vlastníkov bytov. Projekt rieši zateplenie obvodového plášťa, zateplenie strechy, výmenu okien na spoločných priestoroch a vyregulovanie vykurovacej sústavy. Realizáciou sa zníži spotreba primárnej energie o 52 % a bytový dom sa posunie z energetickej triedy D do triedy B.`,
  (o) => `Projekt je zameraný na zníženie energetickej náročnosti rodinného domu v obci ${o}, ktorý je vo vlastníctve fyzickej osoby a slúži na trvalé bývanie štvorčlennej rodiny. Navrhuje sa zateplenie fasády minerálnou vlnou hrúbky 160 mm, výmena otvorových konštrukcií za okná s izolačným trojsklom, inštalácia tepelného čerpadla vzduch-voda a fotovoltického zariadenia s výkonom 5 kWp. Úspora primárnej energie dosiahne 61 %.`,
  (o) => `Predmetom projektu je obnova výrobnej haly spoločnosti KOVOSTROJ ${o}, s.r.o., v ktorej prebieha strojárska výroba a lakovanie dielov. Hala je vo výlučnom vlastníctve obchodnej spoločnosti. Projekt zahŕňa zateplenie obvodového a strešného plášťa haly, výmenu svetlíkov a brán, modernizáciu osvetlenia na LED a inštaláciu rekuperácie. Cieľom je znížiť prevádzkové náklady výroby a spotrebu primárnej energie o 45 %.`,
  (o) => `Projekt rieši energetickú obnovu budovy penziónu a reštaurácie v obci ${o}, ktorú vlastní a prevádzkuje súkromný podnikateľ – fyzická osoba. Budova slúži na komerčné ubytovanie turistov a stravovanie. Navrhované opatrenia: zateplenie obvodového plášťa, výmena okien a dverí, nový zdroj tepla – tepelné čerpadlo, a solárne kolektory na prípravu teplej vody. Očakávaná úspora primárnej energie je 48 %.`,
];
let i = 0;
for (const o of obce) for (const s of sablony) {
  if (!IBA.includes('B')) break;
  const vzor = presli[i % presli.length];
  // žiadateľ v údajoch sedí s obcou v texte, aby model nereagoval na nesúlad, ktorý vyrobil test
  const z: Ziadost = { ...vzor, ziadatel: { ...vzor.ziadatel, nazov: `Obec ${o}` }, kod: `SYN-B${String(++i).padStart(2, '0')}`, nazov: `Zníženie energetickej náročnosti budovy v obci ${o}`, popis: s(o), ucel: '' };
  await spusti('B_neopravnena_budova', z.kod, z, 'L07', 'nesplnene');
}

// C) riadené chyby v prílohe: plnomocenstvo s vynechanou náležitosťou
const casti = {
  statutar: (o: string) => `Splnomocniteľ: Obec ${o}, Obecný úrad ${o} 115, IČO: 00309999, v zastúpení: Ing. Peter Kováč, starosta obce (štatutárny orgán).`,
  splnomocnenec: () => `Splnomocnenec: Mgr. Jana Horváthová, narodená 12. 3. 1985, trvale bytom Lipová 4, Zvolen, projektová manažérka.`,
  rozsah: () => `Splnomocniteľ týmto splnomocňuje splnomocnenca na všetky úkony súvisiace s predložením žiadosti o nenávratný finančný príspevok v rámci výzvy PSK-SIEA-002-2023-DV-EFRR a s konaním o tejto žiadosti, najmä na podanie žiadosti prostredníctvom ITMS, komunikáciu s poskytovateľom a doplnenie chýbajúcich náležitostí.`,
  datum: (o: string) => `V obci ${o} dňa 14. 2. 2025`,
  podpisStatutara: () => `Podpis splnomocniteľa: Ing. Peter Kováč, starosta obce (úradne osvedčený podpis)`,
  podpisSplnomocnenca: () => `Plnomocenstvo prijímam. Podpis splnomocnenca: Mgr. Jana Horváthová`,
};
const zloz = (o: string, vynechaj: string[]) => ['PLNOMOCENSTVO', ...Object.entries(casti).filter(([k]) => !vynechaj.includes(k)).map(([, f]) => f(o))].join('\n\n');
const varianty: [string, string[], string][] = [
  ['uplne', [], 'splnene'],
  ['bez_datumu', ['datum'], 'nesplnene'],
  ['bez_rozsahu', ['rozsah'], 'nesplnene'],
  ['bez_podpisu_splnomocnenca', ['podpisSplnomocnenca'], 'nesplnene'],
  ['bez_podpisu_statutara', ['podpisStatutara'], 'nesplnene'],
];
// Dva postupy na tých istých dokumentoch: C1 = jedna otázka na celý dokument, C2 = každá náležitosť zvlášť (tak je to v balíku pravidiel).
const jednaOtazka = structuredClone(balik);
delete jednaOtazka.pravidla.find((p) => p.id === 'L01')!.parametre!.nalezitosti;
// Pri postupe po náležitostiach je pri úplnom dokumente správny výsledok "na_preverenie": podpis sa z textu overiť nedá.
for (const [postup, b] of [['C1_jedna_otazka', jednaOtazka], ['C2_po_nalezitostiach', balik]] as const) {
  let c = 0;
  for (const o of obce) for (const [nazov, vynechaj, ocakavane] of varianty) {
    if (!IBA.includes('C')) break;
    const vzor = presli[c % presli.length];
    const z: Ziadost = { ...vzor, ziadatel: { ...vzor.ziadatel, nazov: `Obec ${o}` }, kod: `SYN-C${String(++c).padStart(2, '0')}-${nazov}`, prilohy: { '1': { nazov: 'Plnomocenstvo.pdf', text: zloz(o, vynechaj) } } };
    await spusti(`${postup}_${nazov === 'uplne' ? 'uplne' : 'chybne'}`, z.kod, z, 'L01', nazov === 'uplne' && postup.startsWith('C2') ? 'na_preverenie' : ocakavane, b);
  }
}

// D) nové formulácie: dokumenty napísané až po zafixovaní overovacích vzorov, s iným slovníkom a iným tvarom dátumu.
// Merajú, či vzory nie sú len naučené na šablónu z časti C.
const noveSablony: { ziadatel: string; casti: Record<string, string> }[] = [
  { ziadatel: 'Mesto Stará Turá', casti: {
    nadpis: 'POVERENIE',
    statutar: 'Ja, dolupodpísaný Mgr. Ján Novák, primátor mesta Stará Turá, konajúci ako štatutárny orgán mesta,',
    splnomocnenec: 'týmto poverujem pani Ing. Evu Malú, vedúcu oddelenia rozvoja Mestského úradu Stará Turá.',
    rozsah: 'Poverená osoba je oprávnená podať žiadosť o nenávratný finančný príspevok v rámci výzvy PSK-SIEA-002-2023-DV-EFRR, komunikovať s poskytovateľom a dopĺňať chýbajúce náležitosti žiadosti.',
    datum: 'V Starej Turej, 3. marca 2025',
    podpisStatutara: '....................................\nMgr. Ján Novák, primátor mesta (vlastnoručný podpis, úradne osvedčený)',
    podpisSplnomocnenca: 'Poverenie prijímam:\n....................................\nIng. Eva Malá',
  } },
  { ziadatel: 'Stredná odborná škola technická, Hlohovec', casti: {
    nadpis: 'PLNÁ MOC',
    statutar: 'Splnomocniteľ: Stredná odborná škola technická, Hlohovec, zastúpená riaditeľkou PhDr. Máriou Bielikovou.',
    splnomocnenec: 'Splnomocnená osoba: Bc. Tomáš Hrubý, ekonóm školy.',
    rozsah: 'Plná moc sa udeľuje v rozsahu: vypracovanie a podanie žiadosti o NFP cez ITMS21+, preberanie písomností a doplnenie žiadosti na výzvu poskytovateľa.',
    datum: 'Dátum udelenia: 21.01.2025',
    podpisStatutara: 'Za splnomocniteľa: PhDr. Mária Bieliková, riaditeľka – podpis a pečiatka',
    podpisSplnomocnenca: 'Splnomocnenie prijímam v plnom rozsahu. Bc. Tomáš Hrubý, podpis splnomocnenej osoby',
  } },
];
let d = 0;
for (const s of noveSablony) for (const [nazov, vynechaj] of varianty) {
  if (!IBA.includes('D')) break;
  const vzor = presli[d % presli.length];
  const text = Object.entries(s.casti).filter(([k]) => !vynechaj.includes(k)).map(([, v]) => v).join('\n\n');
  const z: Ziadost = { ...vzor, ziadatel: { ...vzor.ziadatel, nazov: s.ziadatel }, kod: `SYN-D${String(++d).padStart(2, '0')}-${nazov}`, prilohy: { '1': { nazov: 'Plnomocenstvo.pdf', text } } };
  await spusti(`D_nove_formulacie_${nazov === 'uplne' ? 'uplne' : 'chybne'}`, z.kod, z, 'L01', nazov === 'uplne' ? 'na_preverenie' : 'nesplnene');
}
await vyloz();

// vyhodnotenie
const suhrn: Record<string, any> = {};
for (const r of riadky) {
  const s = (suhrn[r.cast] ??= { n: 0, splnene: 0, nesplnene: 0, na_preverenie: 0, ine: 0, ms: 0 });
  s.n++; s.ms += r.ms; s[['splnene', 'nesplnene', 'na_preverenie'].includes(r.stav) ? r.stav : 'ine']++;
}
for (const s of Object.values(suhrn)) s.msPriemer = Math.round(s.ms / s.n);
const vysledok = { model: MODEL, datum: new Date().toISOString(), suhrn, riadky };
fs.mkdirSync(path.join(koren, 'eval'), { recursive: true });
fs.writeFileSync(path.join(koren, 'eval', 'test-llm.json'), JSON.stringify(vysledok, null, 1));
console.log(`\nmodel ${MODEL}`);
console.log('časť                       n  splnené nesplnené preveriť  s/prípad');
for (const [k, s] of Object.entries(suhrn)) console.log(k.padEnd(25), String(s.n).padStart(3), String(s.splnene).padStart(8), String(s.nesplnene).padStart(9), String(s.na_preverenie).padStart(8), (s.msPriemer / 1000).toFixed(1).padStart(9));
console.log('\nodchýlky od očakávaného výsledku:');
for (const r of riadky) {
  const zle = r.ocakavane === 'neznamy_dovod' ? false : r.ocakavane === 'nie_nesplnene' ? r.stav === 'nesplnene' : r.stav !== r.ocakavane;
  if (zle) console.log(' ', r.cast, r.id, `-> ${r.stav} (očakávané ${r.ocakavane})`, '|', r.zdovodnenie.slice(0, 160));
}
