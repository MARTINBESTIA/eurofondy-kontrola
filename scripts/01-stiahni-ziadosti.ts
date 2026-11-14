// Stiahne z verejného API ITMS21+ všetky žiadosti o NFP jednej výzvy (zoznam + detaily).
// Použitie: node scripts/01-stiahni-ziadosti.ts [kodVyzvy]
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const API = 'https://api.itms21.sk/public/v1';
const kodVyzvy = process.argv[2] ?? 'PSK-SIEA-002-2023-DV-EFRR';
const outDir = path.join(import.meta.dirname, '..', 'data', 'raw', 'itms21', kodVyzvy);
fs.mkdirSync(path.join(outDir, 'zonfp'), { recursive: true });

async function getJson(url: string, pokusy = 4): Promise<any> {
  for (let i = 1; ; i++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(90_000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) {
      if (i >= pokusy) throw new Error(`${url}: ${(e as Error).message}`);
      await new Promise((ok) => setTimeout(ok, 1500 * i));
    }
  }
}

// 1. zoznam všetkých ŽoNFP (API nevie filtrovať podľa výzvy, filtrujeme lokálne)
const ids: number[] = [];
let vyzvaId: number | undefined;
for (let offset = 0, limit = 500; ; offset += limit) {
  const j = await getJson(`${API}/zonfp?limit=${limit}&offset=${offset}`);
  for (const z of j.results) if (z.vyzva?.kod === kodVyzvy) { ids.push(z.id); vyzvaId = z.vyzva.id; }
  process.stdout.write(`\rzoznam ${Math.min(offset + limit, j.size)}/${j.size}, výzva: ${ids.length}`);
  if (j.results.length < limit) break;
}
console.log();
if (!vyzvaId) throw new Error(`Výzva ${kodVyzvy} nemá v ITMS21+ žiadne zverejnené ŽoNFP.`);

// 2. detail výzvy (podmienky, verzie, dokumenty)
const vyzva = await getJson(`${API}/vyzva/id/${vyzvaId}`);
fs.writeFileSync(path.join(outDir, 'vyzva.json.gz'), zlib.gzipSync(JSON.stringify(vyzva)));

// 3. detaily žiadostí, 6 paralelne, už stiahnuté preskočí
let hotovo = 0;
const fronta = [...ids];
async function pracuj() {
  for (let id; (id = fronta.pop()) !== undefined; ) {
    const f = path.join(outDir, 'zonfp', `${id}.json.gz`);
    if (!fs.existsSync(f)) fs.writeFileSync(f, zlib.gzipSync(JSON.stringify(await getJson(`${API}/zonfp/id/${id}`))));
    process.stdout.write(`\rdetaily ${++hotovo}/${ids.length}`);
  }
}
await Promise.all(Array.from({ length: 6 }, pracuj));
fs.writeFileSync(path.join(outDir, 'meta.json'), JSON.stringify({ kodVyzvy, vyzvaId, pocet: ids.length, stiahnute: new Date().toISOString(), zdroj: API }, null, 2));
console.log(`\nhotovo: ${outDir}`);
