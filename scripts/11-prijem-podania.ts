// Simulácia automatického príjmu podania (napr. e-mailový hook: príloha správy → podateľňa).
// Robí presne to, čo by robil hook: zoberie prílohy (priečinok, ZIP alebo jednotlivé súbory) a pošle ich
// na lokálne API podateľne. Voliteľne hneď spustí posúdenie. Nič neposiela mimo tohto počítača.
//
// Použitie:
//   node scripts/11-prijem-podania.ts demo/podania/A-Obec-Vzorova.zip
//   node scripts/11-prijem-podania.ts demo/podania/C-Obec-Skusobna --posud
//   node scripts/11-prijem-podania.ts --itms=NFP401201A973 --posud --bez-modelu
//   node scripts/11-prijem-podania.ts demo/podania/B-Mesto-Ukazkovo-doplnenie.zip --spis=2   (doplnenie do existujúceho spisu)
// Voľby: --vyzva=KOD (predvolene PSK-SIEA-002-2023-DV-EFRR), --server=http://127.0.0.1:5177
import fs from 'node:fs';
import path from 'node:path';

const volby = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => { const [k, ...v] = a.slice(2).split('='); return [k, v.length ? v.join('=') : true]; }));
const cesty = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const SERVER = String(volby.server ?? `http://127.0.0.1:${process.env.PORT ?? 5177}`);
// Hook smie hovoriť len s lokálnou podateľňou: žiadne podklady nesmú odísť na iný server.
if (!/^http:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(SERVER)) { console.error(`Server musí byť lokálny (127.0.0.1/localhost), nie ${SERVER}.`); process.exit(2); }
const VYZVA = String(volby.vyzva ?? 'PSK-SIEA-002-2023-DV-EFRR');

const subory = cesty.flatMap((c) => {
  if (!fs.existsSync(c)) { console.error(`Neexistuje: ${c}`); process.exit(2); }
  return fs.statSync(c).isDirectory() ? fs.readdirSync(c).filter((f) => fs.statSync(path.join(c, f)).isFile()).sort().map((f) => path.join(c, f)) : [c];
}).map((c) => ({ nazov: path.basename(c), base64: fs.readFileSync(c).toString('base64') }));
if (!subory.length && !volby.itms) { console.error('Zadajte priečinok, ZIP alebo súbory podania, prípadne --itms=KOD.'); process.exit(2); }

async function post(cesta: string, telo: unknown) {
  const r = await fetch(`${SERVER}${cesta}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(telo) });
  const j = await r.json() as any;
  if (!r.ok) throw new Error(j.chyba ?? `HTTP ${r.status}`);
  return j;
}
async function get(cesta: string) { const r = await fetch(`${SERVER}${cesta}`); const j = await r.json() as any; if (!r.ok) throw new Error(j.chyba ?? `HTTP ${r.status}`); return j; }

try {
  let id: number;
  if (volby.spis) {
    id = Number(volby.spis);
    await post(`/api/podatelna/spisy/${id}/subory`, { subory });
    console.log(`Doplnenie poslané do spisu ${id} (${subory.map((s) => s.nazov).join(', ')}).`);
  } else {
    ({ id } = await post('/api/podatelna/spisy', { vyzva: VYZVA, zdroj: 'e-mail (simulácia hooku)', kodItms: volby.itms ? String(volby.itms) : undefined, subory }));
    console.log(`Prijaté ako spis ${id} vo výzve ${VYZVA}.`);
  }
  const d = await get(`/api/podatelna/spisy/${id}`);
  console.log(`${d.spis.cislo} · ${d.spis.ziadatel ?? 'bez formulára'} · ${d.spis.nazov}`);
  for (const f of d.subory) console.log(`  ${f.typ === 'priloha' ? `príloha č. ${f.priloha}`.padEnd(14) : f.typ.padEnd(14)} ${f.istota.padEnd(6)} ${f.nazov}${f.chyba ? `  ! ${f.chyba}` : ''}`);
  const odhady = d.subory.filter((f: any) => f.typ === 'priloha' && ['nazov', 'obsah'].includes(f.istota));
  if (odhady.length) console.log(`  ${odhady.length} súbor(y) zaradené len odhadom: kontrolór ich musí potvrdiť v podateľni.`);
  if (volby.posud) {
    console.log(`Posudzujem${volby['bez-modelu'] ? ' (bez modelu)' : ' (lokálny model číta prílohy, asi minútu)'}…`);
    const { posudok: p } = await post(`/api/podatelna/spisy/${id}/posud`, { llm: !volby['bez-modelu'] });
    console.log(`Návrh: ${p.navrh} – ${p.zhrnutie}`);
    for (const n of p.nalezy.filter((x: any) => ['nesplnene', 'chyba_podklad', 'na_preverenie'].includes(x.stav))) console.log(`  [${n.stav}] ${n.pravidlo} ${n.nazov}: ${n.zdovodnenie}`);
  }
  console.log(`Otvorte ${SERVER}/#p/spis/${id}`);
} catch (e) { console.error(`Chyba: ${(e as Error).message}. Beží server (npm start)?`); process.exit(1); }
