// Skúška bežného HTTP rozhrania podateľne. Vlastný port, databáza v pamäti a dočasné úložisko.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { rozbalZip, xlsxBunky } from '../src/ingest/dokument.ts';

const root = path.join(import.meta.dirname, '..');
const demo = path.join(root, 'demo', 'itms');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'itms-demo-test-'));
const server = spawn(process.execPath, [path.join(root, 'src/server/server.ts')], {
  cwd: root, stdio: ['ignore', 'pipe', 'inherit'], windowsHide: true,
  env: { ...process.env, PORT: '0', PODATELNA_DB: ':memory:', SPISY_DIR: dir },
});
const skoncil = once(server, 'close');
const riadky = createInterface({ input: server.stdout });
const timeout = setTimeout(() => server.kill(), 60_000);
const zabal = (nazov: string, data: Buffer) => ({ nazov, base64: data.toString('base64') });
const zip = (meno: string) => zabal(meno, fs.readFileSync(path.join(demo, meno)));

try {
  let base = '';
  for await (const riadok of riadky) {
    const match = riadok.match(/http:\/\/127\.0\.0\.1:\d+/);
    if (match) { base = match[0]; break; }
  }
  assert(base, 'Testovací server sa nespustil.');
  async function api(cesta: string, telo?: object) {
    const r = await fetch(base + '/api/podatelna/' + cesta, telo && {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(telo),
    });
    const j = await r.json();
    assert(r.ok, `${cesta}: ${JSON.stringify(j)}`);
    return j;
  }
  const prijmi = async (subory: ReturnType<typeof zip>[]) =>
    (await api('spisy', { vyzva: 'PSK-SIEA-002-2023-DV-EFRR', subory })).id as number;
  const posud = async (id: number) => (await api(`spisy/${id}/posud`, { llm: false })).posudok;
  const stav = (nalezy: { pravidlo: string; stav: string }[], id: string) => nalezy.find((n) => n.pravidlo === id)?.stav;
  const komplet = fs.readFileSync(path.join(demo, '01-komplet.zip'));
  const odkaz = await fetch(base + '/demo/01-komplet.zip');
  assert.equal(odkaz.status, 200);
  assert.deepEqual(Buffer.from(await odkaz.arrayBuffer()), komplet);
  const subory = fs.readdirSync(path.join(demo, 'subory')).map((meno) => zabal(meno, fs.readFileSync(path.join(demo, 'subory', meno))));
  assert.equal(subory.length, 8);
  const archiv = rozbalZip(komplet);
  assert.deepEqual(archiv.map(s => s.nazov).sort(), subory.map(s => s.nazov).sort());
  for (const { nazov, data } of archiv) {
    const samostatny = fs.readFileSync(path.join(demo, 'subory', nazov));
    // Git môže pri načítaní projektu zmeniť konce riadkov samostatného formulára.
    if (nazov.endsWith('.json')) assert.deepEqual(JSON.parse(data.toString('utf8')), JSON.parse(samostatny.toString('utf8')));
    else assert.deepEqual(data, samostatny);
  }
  const xlsm = archiv.find(s => s.nazov === 'Priloha_8_Rozpocet.xlsm');
  assert(xlsm);
  const harky = xlsxBunky(xlsm.data);
  const rozpocet = harky['Rozpočet B1 - Value for Money'];
  const ukazovatele = harky['MU Budova 1'];
  assert.equal(Number(ukazovatele.N44), 5);
  const naCenty = (hodnota: string) => Math.round(Number(hodnota) * 100);
  assert.deepEqual(['M209', 'M210', 'M269', 'M270'].map(k => naCenty(rozpocet[k])),
    [21440649, 21440649, 3641928, 3641928], 'Excel musí mať prepočítané výdavky budovy aj OZE.');
  // Po krátení na 95 % (PPP 13) sa oprávnené výdavky zošita rovnajú sume žiadanej vo formulári ŽoNFP.
  assert.equal(naCenty(String(Number(rozpocet.M210) + Number(rozpocet.M270))), 25082577,
    'Oprávnené výdavky zošita sa musia rovnať žiadanej sume formulára.');
  assert.deepEqual([ukazovatele.F47, ukazovatele.F48], ['A1', 'A0'], 'Triedy podľa škály pre administratívne budovy.');
  const indikatory = ['M51', 'N51', 'H77', 'I77', 'H78', 'I78'];
  assert.deepEqual(indikatory.map(k => Number(Number(ukazovatele[k]).toFixed(4))),
    [19.6398, 4.1322, 0, 3.337, 0, 32.25]);

  for (const [nazov, vstup] of [['ZIP', [zabal('01-komplet.zip', komplet)]], ['viac súborov', subory]] as const) {
    const zaciatok = performance.now();
    const id = await prijmi([...vstup]);
    const d = await api(`spisy/${id}`);
    const ms = Math.round(performance.now() - zaciatok);
    assert.equal(d.spis.kod, 'NFP401201G856');
    assert.equal(d.spis.formularZdroj, 'detail z API ITMS21+');
    assert.equal(d.ziadost.sumaZiadanaNFP, 250825.77);
    assert.equal(d.ziadost.rozpocet.length, 9);
    assert.equal(d.subory.find((s: any) => s.nazov === 'Ziadost_o_NFP_NFP401201G856.pdf')?.typ, 'nezaradeny');
    assert.deepEqual(d.subory.map((s: any) => s.nazov).sort(), subory.map((s) => s.nazov).sort());
    assert(d.subory.every((s: any) => !s.chyba && s.znakov > 40));
    assert.deepEqual(['P03', 'P06', 'P07', 'P08'].map(k => stav(d.prilohyStav, k)), Array(4).fill('splnene'));
    assert.equal(stav(d.prilohyStav, 'P05'), 'neuplatnuje_sa');
    const hodnotenie = await posud(id);
    assert.equal(stav(hodnotenie.nalezy, 'D07b'), 'splnene');
    assert.equal(hodnotenie.navrh, 'ciastocne_overene');
    console.log(`${nazov}: otvorenie spisu s kontrolou prítomnosti, ${subory.length} súborov, ${ms} ms; návrh bez modelu: ${hodnotenie.navrh}`);
  }
  const bezExcelu = await prijmi(subory.filter((s) => !s.nazov.endsWith('.xlsm')));
  assert.equal(stav((await api(`spisy/${bezExcelu}`)).prilohyStav, 'P08'), 'chyba_podklad',
    'Samostatný PDF podklad k oceneniu nesmie nahradiť záväzný zošit.');

  const b = await prijmi([zip('02-pred-doplnenim.zip')]);
  const pred = await posud(b);
  assert.equal(pred.navrh, 'vyzva_na_doplnenie');
  for (const k of ['P06', 'P08']) assert.equal(stav(pred.nalezy, k), 'chyba_podklad');
  await api(`spisy/${b}/rozhodnutie`, { rozhodnutie: 'doplnenie', poznamka: 'Doplňte certifikát a dokumentáciu k rozpočtu.' });
  await api(`spisy/${b}/subory`, { subory: [zip('03-doplnenie.zip')] });
  const po = await posud(b);
  assert.equal(po.navrh, 'ciastocne_overene');
  for (const k of ['P06', 'P08']) assert.equal(stav(po.nalezy, k), 'splnene');
  const doplnene = await api(`spisy/${b}`);
  assert.equal(doplnene.posudky.length, 2);
  assert.equal(doplnene.subory.length, subory.length);
  assert.equal(doplnene.subory.filter((s: any) => s.davka === 2).length, 3);
  console.log('Doplnenie: prílohy 6 a 8 sa doplnili v druhom kole, oba posudky sú v tom istom spise.');

  const sken = await prijmi([zip('04-sken.zip')]);
  const d = await api(`spisy/${sken}`);
  const uznesenie = d.subory.find((s: any) => s.priloha === '3');
  assert.equal(uznesenie.znakov, 0);
  assert.equal(stav(d.prilohyStav, 'P03'), 'chyba_podklad');
  console.log('Sken: PDF je v spise, príloha 3 ostáva nečitateľná.');

  const c = await prijmi([zip('05-historicky-nalez.zip')]);
  const nalez = await posud(c);
  assert.equal(nalez.ziadostKod, 'NFP401201A973');
  assert.equal(stav(nalez.nalezy, 'D12'), 'nesplnene');
  assert.equal(nalez.navrh, 'nesplnene_podmienky');
  console.log('Miloslavov: D12 zachytil žiadaný NFP pod minimom. Všetky scenáre prešli.');
} finally {
  clearTimeout(timeout);
  riadky.close();
  server.kill();
  await skoncil;
  fs.rmSync(dir, { recursive: true, force: true });
}
