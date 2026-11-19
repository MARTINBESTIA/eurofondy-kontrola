// Doplní do data/odvodene/vyzvy.json údaje, ktoré zoznam výziev v ITMS21+ nevracia: kolá (posudzované obdobia),
// verzie výzvy (zmeny po vyhlásení) a počty žiadostí. Zdroj: detail /vyzva/id/{id}; cache data/raw/itms21/vyzvy/.
// Spúšťať po 05-stiahni-projekty.ts (ten zapíše štíhly zoznam a dennú snímku plánovaných výziev).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { bezKontaktov } from '../src/moduly/spolocne.ts';
import { htmlNaText } from '../src/moduly/zonfp/normalizuj.ts';

const API = 'https://api.itms21.sk/public/v1';
const koren = path.join(import.meta.dirname, '..');
const raw = path.join(koren, 'data', 'raw', 'itms21', 'vyzvy');
fs.mkdirSync(raw, { recursive: true });
const obnov = process.argv.includes('--obnov');

async function getJson(url: string, pokusy = 4): Promise<any> {
  for (let i = 1; ; i++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(90_000) });
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) {
      if (i >= pokusy) throw new Error(`${url}: ${(e as Error).message}`);
      await new Promise((ok) => setTimeout(ok, 1500 * i));
    }
  }
}
const datum = (ms: number | null | undefined) => (ms ? new Date(ms + 3 * 3600_000).toISOString().slice(0, 10) : null);

const idPodlaKodu = new Map<string, number>();
for (let offset = 0, limit = 100; ; offset += limit) {
  const j = await getJson(`${API}/vyzva?limit=${limit}&offset=${offset}`);
  for (const v of j.results) idPodlaKodu.set(v.kod, v.id);
  if (j.results.length < limit) break;
}

const subor = path.join(koren, 'data', 'odvodene', 'vyzvy.json');
const data = JSON.parse(fs.readFileSync(subor, 'utf8'));
let hotovo = 0, chyba = 0, kluceKola = '';
const fronta = [...data.vyzvy];
async function pracuj() {
  for (let v; (v = fronta.pop()) !== undefined; ) {
    const id = idPodlaKodu.get(v.kod);
    if (!id) { chyba++; continue; }
    const f = path.join(raw, `${id}.json.gz`);
    let d: any;
    if (fs.existsSync(f) && !obnov) d = JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString('utf8'));
    else { d = await getJson(`${API}/vyzva/id/${id}`); fs.writeFileSync(f, zlib.gzipSync(JSON.stringify(d ?? { __nedostupne: true }))); }
    if (!d || d.__nedostupne) { chyba++; continue; }
    const obd = d.posudzovaneObdobie ?? [];
    if (obd.length && !kluceKola) kluceKola = Object.keys(obd[0]).join(', ');
    v.id = id;
    v.kola = obd.map((k: any, i: number) => ({ cislo: k.poradoveCislo ?? k.cislo ?? i + 1, uzavierka: datum(k.datumUzavierky ?? k.datumUkoncenia ?? k.datumDo) })).sort((a: any, b: any) => a.cislo - b.cislo);
    v.verzie = (d.verzia ?? []).map((x: any) => ({ cislo: x.cislo, datum: datum(x.datumVykonaniaZmeny), dovod: htmlNaText(x.dovodVznikuVerzie ?? '').slice(0, 600) })).sort((a: any, b: any) => a.cislo - b.cislo);
    v.predlozenych = d.pocetPredlozenychZiadosti ?? null; v.schvalenych = d.pocetSchvalenychZiadosti ?? null;
    v.neschvalenych = d.pocetNeschvalenychZiadosti ?? null; v.vKonani = d.pocetZiadostiVKonani ?? null;
    hotovo++; process.stdout.write(`\rdetaily výziev ${hotovo}/${data.vyzvy.length}`);
  }
}
await Promise.all(Array.from({ length: 4 }, pracuj));
data.detailyStiahnute = new Date().toISOString();
fs.writeFileSync(subor, bezKontaktov(data));
console.log(`\nhotovo ${hotovo}, nedostupné ${chyba}; kľúče kola: ${kluceKola || '(žiadna výzva nemá kolá)'}`);
console.log(`s kolami ${data.vyzvy.filter((v: any) => v.kola.length).length}, s verziami (zmenami) ${data.vyzvy.filter((v: any) => v.verzie.length > 1).length}`);
