// HTTP server dema: API + statické súbory. Bez frameworku, iba node:http a node:sqlite.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { nacitajBalik, posud, zoznamBalikov } from '../core/posud.ts';
import { dostupny, MODEL } from '../llm/ollama.ts';
import { dokumentNaText } from '../ingest/dokument.ts';
import { hzpEE, hzpOZE, uspora } from '../moduly/zonfp/kontroly.ts';
import type { Ziadost } from '../core/typy.ts';

const KOREN = path.join(import.meta.dirname, '..', '..');
const PORT = Number(process.env.PORT ?? 5177);
const VYZVA = process.env.VYZVA ?? 'PSK-SIEA-002-2023-DV-EFRR';

const balik = nacitajBalik(VYZVA);
const suborZiadosti = path.join(KOREN, 'data', 'odvodene', VYZVA, 'ziadosti.json');
const ziadosti: Ziadost[] = fs.existsSync(suborZiadosti) ? JSON.parse(fs.readFileSync(suborZiadosti, 'utf8')) : [];
const podlaKodu = new Map(ziadosti.map((z) => [z.kod, z]));

// Auditná stopa: každý posudok sa uloží aj s verziou pravidiel, ktorou vznikol.
const db = new DatabaseSync(path.join(KOREN, 'data', 'app.db'));
db.exec(`CREATE TABLE IF NOT EXISTS posudky (
  id INTEGER PRIMARY KEY, cas TEXT NOT NULL, ziadost_kod TEXT NOT NULL, balik TEXT NOT NULL, verzia TEXT NOT NULL,
  model TEXT, navrh TEXT NOT NULL, upravena INTEGER NOT NULL, trvanie_ms INTEGER NOT NULL, posudok_json TEXT NOT NULL)`);
const vloz = db.prepare('INSERT INTO posudky (cas, ziadost_kod, balik, verzia, model, navrh, upravena, trvanie_ms, posudok_json) VALUES (?,?,?,?,?,?,?,?,?)');

const skupina = (z: Ziadost) => z.vysledok === 'schvalena' ? 'schvalena' : z.dovod === 'nedostatok_prostriedkov' ? 'nedostatok' : z.vysledok === 'neschvalena' ? 'neschvalena' : z.vysledok === 'zastavene' ? 'zastavene' : 'ina';
const riadok = (z: Ziadost) => ({ kod: z.kod, nazov: z.nazov, ziadatel: z.ziadatel.nazov, skupina: skupina(z), stav: z.stav, dovod: z.dovod, nfp: z.sumaZiadanaNFP });
const metriky = (z: Ziadost) => ({ usporaPercent: uspora(z, 'PSKPRCR26b')?.percent ?? null, hzpEE: hzpEE(z), hzpOZE: hzpOZE(z) });

const MIME: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml' };
const json = (res: http.ServerResponse, kod: number, telo: unknown) => { res.writeHead(kod, { 'content-type': MIME['.json'], 'cache-control': 'no-store' }); res.end(JSON.stringify(telo)); };
async function telo(req: http.IncomingMessage, limit = 40 << 20): Promise<any> {
  const casti: Buffer[] = []; let n = 0;
  for await (const c of req) { n += c.length; if (n > limit) throw new Error('Požiadavka je príliš veľká.'); casti.push(c); }
  return casti.length ? JSON.parse(Buffer.concat(casti).toString('utf8')) : {};
}
const citajEval = (f: string) => { const p = path.join(KOREN, 'eval', f); return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null; };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
  try {
    if (url.pathname === '/api/stav') {
      return json(res, 200, {
        balik: { id: balik.id, vyzvaKod: balik.vyzvaKod, vyzvaNazov: balik.vyzvaNazov, poskytovatel: balik.poskytovatel, verzia: balik.verzia, zdroje: balik.zdroje, proces: balik.proces,
          pravidla: balik.pravidla.map((p) => ({ id: p.id, ppp: p.ppp, nazov: p.nazov, druh: p.druh })) },
        baliky: zoznamBalikov(), model: MODEL, modelDostupny: await dostupny(), pocetZiadosti: ziadosti.length,
        posudkov: (db.prepare('SELECT COUNT(*) AS n FROM posudky').get() as { n: number }).n,
      });
    }
    if (url.pathname === '/api/ziadosti') {
      const q = (url.searchParams.get('q') ?? '').toLowerCase(); const s = url.searchParams.get('skupina') ?? '';
      const vyber = ziadosti.filter((z) => (!s || skupina(z) === s) && (!q || `${z.kod} ${z.nazov} ${z.ziadatel.nazov}`.toLowerCase().includes(q)));
      return json(res, 200, { spolu: vyber.length, ziadosti: vyber.slice(0, 80).map(riadok) });
    }
    if (url.pathname.startsWith('/api/ziadost/')) {
      const z = podlaKodu.get(decodeURIComponent(url.pathname.slice('/api/ziadost/'.length)));
      return z ? json(res, 200, { ziadost: z, metriky: metriky(z), skupina: skupina(z) }) : json(res, 404, { chyba: 'Žiadosť sa nenašla.' });
    }
    if (url.pathname === '/api/text' && req.method === 'POST') {
      const b = await telo(req);
      const text = dokumentNaText(String(b.nazov), Buffer.from(String(b.base64), 'base64'));
      return json(res, 200, { nazov: b.nazov, text, znakov: text.length });
    }
    if (url.pathname === '/api/posud' && req.method === 'POST') {
      const b = await telo(req);
      const zaklad = podlaKodu.get(b.kod);
      if (!zaklad && !b.ziadost) return json(res, 400, { chyba: 'Chýba kód žiadosti alebo samotná žiadosť.' });
      // Úpravy z rozhrania (simulácia chýb) sa aplikujú na kópiu, pôvodné dáta sa nemenia.
      const z: Ziadost = structuredClone(b.ziadost ?? zaklad);
      if (b.prilohy !== undefined) z.prilohy = b.prilohy;
      const p = await posud(z, balik, { llm: b.llm !== false });
      vloz.run(p.cas, z.kod, p.balik, p.verziaBalika, p.model, p.navrh, b.ziadost ? 1 : 0, p.trvanieMs, JSON.stringify(p));
      return json(res, 200, { posudok: p, metriky: metriky(z), skutocnost: zaklad && !b.ziadost ? { stav: zaklad.stav, dovod: zaklad.dovod, skupina: skupina(zaklad) } : null });
    }
    if (url.pathname === '/api/eval') return json(res, 200, { pravidla: citajEval('test-pravidla.json'), llm: citajEval('test-llm.json') });

    // statické súbory
    const cesta = path.normalize(path.join(KOREN, 'web', url.pathname === '/' ? 'index.html' : url.pathname));
    if (!cesta.startsWith(path.join(KOREN, 'web')) || !fs.existsSync(cesta) || fs.statSync(cesta).isDirectory()) { res.writeHead(404); return res.end('Nenájdené'); }
    res.writeHead(200, { 'content-type': MIME[path.extname(cesta)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    fs.createReadStream(cesta).pipe(res);
  } catch (e) {
    json(res, 500, { chyba: (e as Error).message });
  }
});
server.listen(PORT, '127.0.0.1', () => console.log(`Eurofondy kontrola beží na http://127.0.0.1:${PORT} (výzva ${VYZVA}, ${ziadosti.length} žiadostí, pravidlá: ${balik.verzia})`));
