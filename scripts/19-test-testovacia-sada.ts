// Automatická skúška testovacej sady (demo/testovacia-sada): každý ZIP prejde podateľňou ako nové podanie cez HTTP,
// posúdi sa bez modelu a výsledok sa porovná s ocakavane.json: návrh, znenie výzvy, body o znení (VER-*), stavy
// určujúcich pravidiel a zaradenie súborov k prílohám. Prípady s doplnením nahrajú doplnenie do toho istého spisu,
// prípad so súbormi bez čísla prílohy potvrdí zaradenie ako kontrolór. Body VER-ITMS a VER-KONTROLA závisia od kontroly
// zmien výzvy v prostredí, preto sa neporovnávajú.
// Vlastný server: port 0, databáza v pamäti, dočasné úložisko spisov. Spustenie: node scripts/19-test-testovacia-sada.ts
// Iná sada v rovnakom formáte: node scripts/19-test-testovacia-sada.ts demo/nova-ziadost (ocakavane.json v koreni sady
// alebo v podpriečinku riesenie, kde ho kontrolór pri skúške neuvidí).
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline';

const root = path.join(import.meta.dirname, '..');
const SADA = process.argv[2] ? path.resolve(process.argv[2]) : path.join(root, 'demo', 'testovacia-sada');
/** obsahuje: časť zdôvodnenia, ktorú musí mať nález daného pravidla. */
interface Ocakavane { navrh: string; verzia: string; ver: string[]; nalezy: Record<string, string>; obsahuje?: Record<string, string> }
interface SuborVZipe { nazov: string; typ: string; priloha: string | null; istota: string }
interface Pripad { cislo: string; titul: string; zip: string; subory: SuborVZipe[]; ocakavane: Ocakavane;
  doplnenie?: { zip: string; subory: SuborVZipe[]; ocakavane: Ocakavane }; potvrdenie?: { ocakavane: Ocakavane } }
const OCAKAVANE = [path.join(SADA, 'ocakavane.json'), path.join(SADA, 'riesenie', 'ocakavane.json')].find((x) => fs.existsSync(x));
if (!OCAKAVANE) throw new Error(`V ${SADA} chýba ocakavane.json (ani v podpriečinku riesenie).`);
const { vyzva, pripady } = JSON.parse(fs.readFileSync(OCAKAVANE, 'utf8')) as { vyzva: string; pripady: Pripad[] };
const PROSTREDIE = new Set(['VER-ITMS', 'VER-KONTROLA']);
/** Závažnosť návrhu: mäkší výsledok, než sa čaká, je riziko falošného OK. */
const ZAVAZNOST: Record<string, number> = { bez_zisteni: 0, ciastocne_overene: 1, na_preverenie: 2, vyzva_na_doplnenie: 3, nesplnene_podmienky: 4 };

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'testovacia-sada-test-'));
const server = spawn(process.execPath, [path.join(root, 'src/server/server.ts')], {
  cwd: root, stdio: ['ignore', 'pipe', 'inherit'], windowsHide: true,
  env: { ...process.env, PORT: '0', PODATELNA_DB: ':memory:', SPISY_DIR: dir },
});
const skoncil = once(server, 'close');
const riadky = createInterface({ input: server.stdout });
const timeout = setTimeout(() => server.kill(), 300_000);
const zabal = (meno: string) => ({ nazov: meno, base64: fs.readFileSync(path.join(SADA, meno)).toString('base64') });

let chyb = 0, mekkych = 0;
try {
  let base = '';
  for await (const riadok of riadky) {
    const m = riadok.match(/http:\/\/127\.0\.0\.1:\d+/);
    if (m) { base = m[0]; break; }
  }
  if (!base) throw new Error('Testovací server sa nespustil.');
  async function api(cesta: string, telo?: object) {
    const r = await fetch(`${base}/api/podatelna/${cesta}`, telo && { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(telo) });
    const j = await r.json();
    if (!r.ok) throw new Error(`${cesta}: ${JSON.stringify(j)}`);
    return j;
  }
  const posud = async (id: number) => (await api(`spisy/${id}/posud`, { llm: false })).posudok;

  function porovnaj(krok: string, p: any, o: Ocakavane): string[] {
    const vady: string[] = [];
    if (p.navrh !== o.navrh) {
      vady.push(`návrh ${p.navrh}, čaká sa ${o.navrh}`);
      if ((ZAVAZNOST[p.navrh] ?? 0) < (ZAVAZNOST[o.navrh] ?? 0)) { mekkych++; vady.push('MÄKŠÍ VÝSLEDOK, NEŽ SA ČAKÁ (riziko falošného OK)'); }
    }
    if (p.vyberVerzie?.verziaId !== o.verzia) vady.push(`znenie ${p.vyberVerzie?.verziaId ?? 'bez výberu'}, čaká sa ${o.verzia}`);
    const ver = p.nalezy.filter((n: any) => n.druh === 'verzia' && !PROSTREDIE.has(n.pravidlo)).map((n: any) => n.pravidlo).sort();
    if (ver.join() !== [...o.ver].sort().join()) vady.push(`body o znení [${ver.join(', ')}], čakajú sa [${[...o.ver].sort().join(', ')}]`);
    for (const [k, s] of Object.entries(o.nalezy)) {
      const n = p.nalezy.find((x: any) => x.pravidlo === k);
      if (!n) vady.push(`${k} chýba v posudku`);
      else if (n.stav !== s) vady.push(`${k} ${n.stav}, čaká sa ${s} (${String(n.zdovodnenie).slice(0, 160)})`);
    }
    for (const [k, text] of Object.entries(o.obsahuje ?? {})) {
      const n = p.nalezy.find((x: any) => x.pravidlo === k);
      if (n && !String(n.zdovodnenie).includes(text)) vady.push(`${k}: zdôvodnenie nemá „${text}“ (${String(n.zdovodnenie).slice(0, 200)})`);
    }
    return vady.map((v) => `${krok}: ${v}`);
  }
  function zaradenie(krok: string, subory: any[], ocak: SuborVZipe[]): string[] {
    return ocak.flatMap((o) => {
      const s = subory.find((x) => x.nazov === o.nazov);
      if (!s) return [`${krok}: súbor ${o.nazov} nie je v spise`];
      const vady = [];
      if (s.typ !== o.typ || (s.priloha ?? null) !== o.priloha) vady.push(`${krok}: ${o.nazov} zaradený ako ${s.typ} ${s.priloha ?? ''}, čaká sa ${o.typ} ${o.priloha ?? ''}`);
      if (s.istota !== o.istota) vady.push(`${krok}: ${o.nazov} istota ${s.istota}, čaká sa ${o.istota}`);
      if (s.chyba) vady.push(`${krok}: ${o.nazov} chyba čítania: ${s.chyba}`);
      return vady;
    });
  }

  for (const c of pripady) {
    const t0 = performance.now();
    const vady: string[] = [];
    const id = (await api('spisy', { vyzva, subory: [zabal(c.zip)] })).id as number;
    let d = await api(`spisy/${id}`);
    vady.push(...zaradenie('príjem', d.subory, c.subory));
    if (d.subory.length !== c.subory.length) vady.push(`príjem: v spise je ${d.subory.length} súborov, v ZIP ${c.subory.length}`);
    const prvy = await posud(id);
    vady.push(...porovnaj('posudok', prvy, c.ocakavane));
    let popis = prvy.navrh;
    if (c.doplnenie) {
      await api(`spisy/${id}/subory`, { subory: [zabal(c.doplnenie.zip)] });
      d = await api(`spisy/${id}`);
      vady.push(...zaradenie('doplnenie', d.subory, c.doplnenie.subory));
      const druhy = await posud(id);
      vady.push(...porovnaj('po doplnení', druhy, c.doplnenie.ocakavane));
      popis += ` → po doplnení ${druhy.navrh}`;
    }
    if (c.potvrdenie) {
      const odhady = d.subory.filter((s: any) => s.typ === 'priloha' && s.istota !== 'cislo' && s.istota !== 'rucne');
      for (const s of odhady) await api(`subory/${s.id}/zaradenie`, { ciel: s.priloha });
      const treti = await posud(id);
      vady.push(...porovnaj(`po potvrdení ${odhady.length} príloh`, treti, c.potvrdenie.ocakavane));
      popis += ` → po potvrdení ${treti.navrh}`;
    }
    chyb += vady.length;
    console.log(`${vady.length ? '✗' : '✓'} ${c.cislo} ${c.titul}: ${popis} (${Math.round(performance.now() - t0)} ms)`);
    for (const v of vady) console.log(`    ${v}`);
  }
  console.log(`\n${pripady.length} prípadov, ${chyb} rozdielov${mekkych ? `, z toho ${mekkych}× mäkší výsledok, než sa čaká` : ''}.`);
} finally {
  clearTimeout(timeout);
  riadky.close();
  server.kill();
  await skoncil;
  fs.rmSync(dir, { recursive: true, force: true });
}
if (chyb) process.exit(1);
