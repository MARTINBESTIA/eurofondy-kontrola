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
  // Energetické hodnotenie preberá demo od žiadateľa (účel projektu v ŽoNFP), nie z vlastného prepočtu.
  assert.deepEqual([ukazovatele.F47, ukazovatele.F48], ['B', 'A1'], 'Triedy podľa energetického hodnotenia žiadateľa.');
  assert.deepEqual(['F49', 'F50', 'F51', 'F52'].map(k => Number(Number(ukazovatele[k]).toFixed(2))), [115.4, 1031.41, 51.76, 1059.55],
    'Merné hodnoty žiadateľa; plocha pred obnovou je podiel 119,0248 MWh a 115,4 kWh/m², po obnove ukazovateľ PSKPRCO19.');
  const formular = JSON.parse(fs.readFileSync(path.join(demo, 'subory', 'Formular_NFP401201G856.json'), 'utf8'));
  assert.equal(formular.ucel.split('\n').length, 3, 'Formulár má celý účel projektu vrátane energetického hodnotenia.');
  assert(formular.ucel.includes('115,4') && formular.ucel.includes('[anonymizované]')
    && !/\b(?:Ing|Mgr|Bc|PhDr|RNDr|JUDr)\.\s*\p{Lu}/u.test(formular.ucel), 'Meno autora hodnotenia je v účele anonymizované.');
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
    assert.deepEqual(['P03', 'P06', 'P07', 'P08', 'P08b'].map(k => stav(d.prilohyStav, k)), Array(5).fill('splnene'));
    // Súlad zošita s formulárom: doložené obe strany porovnania (bunky zošita aj položky formulára).
    const sulad = d.prilohyStav.find((p: any) => p.pravidlo === 'P08b');
    assert(['bunka M210', 'bunka M270'].every(b => sulad.doklady.some((x: any) => x.miesto.endsWith(b))), 'P08b cituje M210 a M270.');
    assert.equal(sulad.doklady.filter((x: any) => /\.sumaOpravnenehoVydavku · /.test(x.miesto)).length, 9);
    assert.equal(stav(d.prilohyStav, 'P05'), 'neuplatnuje_sa');
    const hodnotenie = await posud(id);
    assert.equal(stav(hodnotenie.nalezy, 'D07b'), 'splnene');
    assert.equal(stav(hodnotenie.nalezy, 'P08b'), 'splnene');
    assert.equal(hodnotenie.navrh, 'na_preverenie'); // podmienky z inventára, ktoré softvér nekontroluje celé, idú kontrolórovi
    assert(['PPP4', 'PPP8'].every((k) => stav(hodnotenie.nalezy, k) === 'na_preverenie'), 'Nepokryté PPP musia byť v posudku.');
    assert.equal(stav(hodnotenie.nalezy, 'V01'), 'splnene');
    assert.equal(stav(hodnotenie.nalezy, 'F01'), 'splnene');
    console.log(`${nazov}: otvorenie spisu s kontrolou prítomnosti, ${subory.length} súborov, ${ms} ms; návrh bez modelu: ${hodnotenie.navrh}`);
  }
  const bezExcelu = await prijmi(subory.filter((s) => !s.nazov.endsWith('.xlsm')));
  const bezZositu = (await api(`spisy/${bezExcelu}`)).prilohyStav;
  assert.deepEqual(['P08', 'P08b'].map(k => stav(bezZositu, k)), ['chyba_podklad', 'chyba_podklad'],
    'Samostatný PDF podklad k oceneniu nesmie nahradiť záväzný zošit.');

  const b = await prijmi([zip('02-pred-doplnenim.zip')]);
  const pred = await posud(b);
  assert.equal(pred.navrh, 'vyzva_na_doplnenie');
  for (const k of ['P06', 'P08', 'P08b']) assert.equal(stav(pred.nalezy, k), 'chyba_podklad');
  // Návrh výzvy na doplnenie: príloha 8 je jedna položka za P08 aj P08b; nič sa neukladá, lehota pod 5 dní sa odmietne.
  const navrh = await api(`spisy/${b}/vyzva`, {});
  assert.deepEqual(navrh.vybrane, ['P06', 'P08+P08b']);
  assert.match(navrh.text, /\n1\. PPP č\. 7 – [^\n]+\n {3}Zistenie: Príloha č\. 6 sa vyžaduje a chýba\.\n {3}Požadujeme: Predložte Prílohu č\. 6 ŽoNFP/);
  assert.match(navrh.text, /\n2\. PPP č\. 13 – [^\n]+\n[^\n]+\n {3}Požadujeme: Predložte Prílohu č\. 8 ŽoNFP/);
  assert.match(navrh.text, /do 5 pracovných dní odo dňa doručenia/);
  assert.match(navrh.text, /zastaviť podľa § 17 ods\. 2 zákona č\. 121\/2022 Z\. z\./);
  const vyzvaHttp = (spis: number, telo: object) => fetch(`${base}/api/podatelna/spisy/${spis}/vyzva`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(telo) });
  assert.equal((await vyzvaHttp(b, { lehota: 4 })).status, 400);
  assert.equal((await vyzvaHttp(bezExcelu, {})).status, 400, 'Spis bez posudku nemá z čoho zostaviť výzvu.');
  assert.equal((await api(`spisy/${b}`)).spis.stav, 'posudena', 'Návrh výzvy nesmie meniť stav spisu.');
  console.log('Návrh výzvy: PPP 7 (príloha 6) a PPP 13 (príloha 8 raz za P08 aj P08b); lehota pod 5 dní a spis bez posudku sa odmietnu.');
  await api(`spisy/${b}/rozhodnutie`, { rozhodnutie: 'doplnenie', poznamka: 'Doplňte certifikát a dokumentáciu k rozpočtu.' });
  await api(`spisy/${b}/subory`, { subory: [zip('03-doplnenie.zip')] });
  const po = await posud(b);
  assert.equal(po.navrh, 'na_preverenie');
  for (const k of ['P06', 'P08', 'P08b']) assert.equal(stav(po.nalezy, k), 'splnene');
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
