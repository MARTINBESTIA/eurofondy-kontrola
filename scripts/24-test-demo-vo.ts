// Automatická skúška cvičnej sady VO (demo/vo) cez HTTP tak, ako ju robí rozhranie (karta Kontrola, modul VO):
// 1. scenáre na reálnych VO z ITMS21+ (demo/vo/scenare.json): úprava polí, posúdenie bez modelu, porovnanie stavov;
// 2. záznamy zo zadania zákazky (demo/vo/zaznamy): text z DOCX má mať práve tie náležitosti, ktoré sada uvádza,
//    a bez modelu musí V07 zostať neoverené (nikdy splnené);
// 3. s prepínačom --model aj posúdenie záznamov lokálnym modelom: záznam s chýbajúcou náležitosťou nesmie byť splnený.
// Vlastný server: port 0, databáza v pamäti, dočasné úložisko. Spustenie: node scripts/24-test-demo-vo.ts [--model]
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline';

const root = path.join(import.meta.dirname, '..');
const SADA = path.join(root, 'demo', 'vo');
const S_MODELOM = process.argv.includes('--model');
interface Ocakavane { navrh: string; nalezy: Record<string, string> }
interface Scenar { id: string; kod: string; titul: string; formular?: Record<string, number | null>; ocakavane: Ocakavane }
interface Zaznam { subor: string; chyba: string | null; pritomne: string[]; chybajuci: string | null }
const { nosic, scenare } = JSON.parse(fs.readFileSync(path.join(SADA, 'scenare.json'), 'utf8')) as { nosic: string; scenare: Scenar[] };
const { zaznamy } = JSON.parse(fs.readFileSync(path.join(SADA, 'riesenie', 'ocakavane.json'), 'utf8')) as { zaznamy: Zaznam[] };
/** Závažnosť návrhu: mäkší výsledok, než sa čaká, je riziko falošného OK. */
const ZAVAZNOST: Record<string, number> = { bez_zisteni: 0, ciastocne_overene: 1, na_preverenie: 2, vyzva_na_doplnenie: 3, nesplnene_podmienky: 4 };

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-vo-test-'));
const server = spawn(process.execPath, [path.join(root, 'src/server/server.ts')], {
  cwd: root, stdio: ['ignore', 'pipe', 'inherit'], windowsHide: true,
  env: { ...process.env, PORT: '0', PODATELNA_DB: ':memory:', SPISY_DIR: dir },
});
const skoncil = once(server, 'close');
const riadky = createInterface({ input: server.stdout });
const timeout = setTimeout(() => server.kill(), S_MODELOM ? 1_800_000 : 300_000);

let chyb = 0;
const vada = (s: string) => { chyb++; console.log(`  CHYBA ${s}`); };
try {
  let base = '';
  for await (const riadok of riadky) {
    const m = riadok.match(/http:\/\/127\.0\.0\.1:\d+/);
    if (m) { base = m[0]; break; }
  }
  if (!base) throw new Error('Testovací server sa nespustil.');
  async function api(cesta: string, telo?: object) {
    const r = await fetch(`${base}/api/${cesta}`, telo && { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(telo) });
    const j = await r.json();
    if (!r.ok) throw new Error(`${cesta}: ${JSON.stringify(j)}`);
    return j;
  }

  console.log('Scenáre na reálnych VO (bez modelu):');
  for (const s of scenare) {
    const pripad = await api(`vo/pripad/${encodeURIComponent(s.kod)}`);
    const formular = s.formular ? { ...pripad.formular, ...s.formular } : undefined;
    const { posudok: p } = await api('vo/posud', { id: s.kod, formular, llm: false });
    const pred = chyb;
    if (p.navrh !== s.ocakavane.navrh) {
      vada(`${s.id}: návrh ${p.navrh}, čaká sa ${s.ocakavane.navrh}`);
      if ((ZAVAZNOST[p.navrh] ?? 0) < (ZAVAZNOST[s.ocakavane.navrh] ?? 0)) vada(`${s.id}: MÄKŠÍ VÝSLEDOK, NEŽ SA ČAKÁ (riziko falošného OK)`);
    }
    for (const [k, stav] of Object.entries(s.ocakavane.nalezy)) {
      const n = p.nalezy.find((x: { pravidlo: string }) => x.pravidlo === k);
      if (!n) vada(`${s.id}: ${k} chýba v posudku`);
      else if (n.stav !== stav) vada(`${s.id}: ${k} ${n.stav}, čaká sa ${stav} (${String(n.zdovodnenie).slice(0, 200)})`);
    }
    console.log(`  ${chyb === pred ? 'OK ' : 'ZLE'} ${s.id} ${s.titul}: ${p.navrh}`);
  }

  console.log('Záznamy zo zadania zákazky:');
  const texty: Record<string, string> = {};
  for (const z of zaznamy) {
    const subor = path.join(SADA, 'zaznamy', z.subor);
    const { text } = await api('text', { nazov: z.subor, base64: fs.readFileSync(subor).toString('base64') });
    texty[z.subor] = text;
    const pred = chyb;
    for (const u of z.pritomne) if (!text.includes(u)) vada(`${z.subor}: v texte chýba „${u}“`);
    if (z.chybajuci && text.includes(z.chybajuci)) vada(`${z.subor}: text obsahuje vynechanú náležitosť „${z.chybajuci}“`);
    const { posudok: p } = await api('vo/posud', { id: nosic, prilohy: { zaznam: { nazov: z.subor, text } }, llm: false });
    const v07 = p.nalezy.find((x: { pravidlo: string }) => x.pravidlo === 'V07');
    if (v07?.stav !== 'mimo_podkladov') vada(`${z.subor}: bez modelu je V07 ${v07?.stav}, čaká sa mimo_podkladov`);
    console.log(`  ${chyb === pred ? 'OK ' : 'ZLE'} ${z.subor}: text ${text.length} znakov, bez modelu V07 ${v07?.stav}`);
  }

  if (S_MODELOM) {
    console.log('Záznamy s lokálnym modelom (V07):');
    const md: string[] = [];
    let model = '–';
    for (const z of zaznamy) {
      const t0 = Date.now();
      const { posudok: p } = await api('vo/posud', { id: nosic, prilohy: { zaznam: { nazov: z.subor, text: texty[z.subor] } }, llm: true });
      const v07 = p.nalezy.find((x: { pravidlo: string }) => x.pravidlo === 'V07');
      const s = Math.round((Date.now() - t0) / 1000);
      model = p.model ?? model;
      if (z.chyba && v07?.stav === 'splnene') vada(`${z.subor}: FALOŠNE OK, chýba „${z.chyba}“ a V07 je splnené`);
      const presne = z.chyba ? v07?.stav === 'nesplnene' && String(v07.zdovodnenie).includes(z.chyba) : v07?.stav === 'splnene';
      console.log(`  ${z.chyba ? (v07?.stav === 'splnene' ? 'ZLE' : 'OK ') : 'INFO'} ${z.subor}: V07 ${v07?.stav}${presne ? ' (presne)' : ''}, ${s} s, model ${p.model ?? '–'}`);
      console.log(`       ${String(v07?.zdovodnenie ?? '').slice(0, 400)}`);
      // Úryvky, ktoré model uviedol pri jednotlivých náležitostiach (dôkaz sa v teste neukladá, len vypíše).
      for (const r of String(v07?.dokaz ?? '').split('\n').filter(Boolean)) console.log(`         · ${r.slice(0, 220)}`);
      md.push(`| \`${z.subor}\` | ${z.chyba ?? 'nič'} | ${v07?.stav ?? '–'} | ${presne ? 'áno' : 'nie'} | ${s} s | ${String(v07?.zdovodnenie ?? '').replace(/\|/g, '/').replace(/\s+/g, ' ').slice(0, 600)} |`);
    }
    // Výsledok behu patrí k riešeniu: README sady ho neuvádza, aby neprezradilo, čo v ktorom zázname chýba.
    fs.writeFileSync(path.join(SADA, 'riesenie', 'beh-s-modelom.md'), `# Beh s lokálnym modelom (V07)

Beh ${new Date().toISOString().slice(0, 10)}, model ${model}, nosič ${nosic}, podpisy sa nekontrolovali. Vytvorené
príkazom \`npm run test:demo-vo -- --model\`. Výsledok modelu sa medzi behmi môže líšiť.

| Súbor | Čo chýba | V07 | Presne | Čas | Zdôvodnenie softvéru (skrátené) |
|---|---|---|---|---|---|
${md.join('\n')}
`);
  }
} catch (e) {
  vada((e as Error).message);
} finally {
  clearTimeout(timeout);
  server.kill();
  await skoncil;
  fs.rmSync(dir, { recursive: true, force: true });
}
console.log(chyb ? `${chyb} chýb.` : 'Všetko sedí.');
process.exit(chyb ? 1 : 0);
