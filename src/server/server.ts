// HTTP server dema: API pre všetky moduly + statické súbory. Bez frameworku, iba node:http a node:sqlite.
// Modul = jeden úsek procesu eurofondov (žiadosť, VO, ŽoP, ...). Server o module nič nevie, volá len rozhranie Modul.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { nacitajBalik, posud } from '../core/posud.ts';
import { dostupny, MODEL } from '../llm/ollama.ts';
import { dokumentNaText, pdfDostupny } from '../ingest/dokument.ts';
import type { BalikPravidiel, Modul, Posudok } from '../core/typy.ts';
import { zonfp } from '../moduly/zonfp/modul.ts';
import { vyzvy } from '../moduly/vyzvy/modul.ts';
import { vo } from '../moduly/vo/modul.ts';
import { zmeny } from '../moduly/zmeny/modul.ts';
import { zop } from '../moduly/zop/modul.ts';
import { ukazovatele } from '../moduly/ukazovatele/modul.ts';
import * as pod from '../podatelna/podatelna.ts';

const KOREN = path.join(import.meta.dirname, '..', '..');
const PORT = Number(process.env.PORT ?? 5177);
const VYZVA = process.env.VYZVA ?? 'PSK-SIEA-002-2023-DV-EFRR';

// Poradie podľa procesu: plánovanie → žiadosť → obstarávanie → zmeny → platby → ukazovatele.
const MODULY: Modul[] = [vyzvy, zonfp, vo, zmeny, zop, ukazovatele];
const podlaId = new Map(MODULY.map((m) => [m.id, m]));
const baliky = new Map<string, BalikPravidiel | Error>();
function balik(m: Modul): BalikPravidiel {
  if (!baliky.has(m.id)) { try { baliky.set(m.id, nacitajBalik(m.balikVyzva ?? VYZVA, m.id)); } catch (e) { baliky.set(m.id, e as Error); } }
  const b = baliky.get(m.id)!;
  if (b instanceof Error) throw new Error(`Modul ${m.id} nemá balík pravidiel packs/${m.balikVyzva ?? VYZVA}/${m.id}.json: ${b.message}`);
  return b;
}

// Auditná stopa: každý posudok sa uloží aj s modulom a verziou pravidiel, ktorou vznikol.
const db = new DatabaseSync(path.join(KOREN, 'data', 'app.db'));
db.exec(`CREATE TABLE IF NOT EXISTS posudky (
  id INTEGER PRIMARY KEY, cas TEXT NOT NULL, ziadost_kod TEXT NOT NULL, balik TEXT NOT NULL, verzia TEXT NOT NULL,
  model TEXT, navrh TEXT NOT NULL, upravena INTEGER NOT NULL, trvanie_ms INTEGER NOT NULL, posudok_json TEXT NOT NULL)`);
if (!(db.prepare('PRAGMA table_info(posudky)').all() as { name: string }[]).some((c) => c.name === 'modul')) db.exec(`ALTER TABLE posudky ADD COLUMN modul TEXT NOT NULL DEFAULT 'zonfp'`);
const vloz = db.prepare('INSERT INTO posudky (cas, modul, ziadost_kod, balik, verzia, model, navrh, upravena, trvanie_ms, posudok_json) VALUES (?,?,?,?,?,?,?,?,?,?)');
pod.pripravDb(db);
const vlozSpisovy = db.prepare('INSERT INTO posudky (cas, modul, ziadost_kod, balik, verzia, model, navrh, upravena, trvanie_ms, posudok_json, spis_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)');

// Podateľňa posudzuje žiadosti o NFP pravidlami tej výzvy, do ktorej podanie patrí.
const balikyZiadosti = new Map<string, BalikPravidiel>();
const balikVyzvy = (vyzva: string) => { if (!balikyZiadosti.has(vyzva)) balikyZiadosti.set(vyzva, nacitajBalik(vyzva, 'zonfp')); return balikyZiadosti.get(vyzva)!; };
const SLOTY = zonfp.prilohy(undefined as never);
const zItms = (kod: string) => zonfp.nacitaj(kod);
const PRAVIDLA_PRILOH = (b: BalikPravidiel) => b.pravidla.filter((p) => p.druh === 'priloha').map((p) => p.id);
const subory = (b: any): pod.Subor[] => (Array.isArray(b.subory) ? b.subory : []).map((s: any) => ({ nazov: String(s.nazov), data: Buffer.from(String(s.base64), 'base64') }));

/** Ktoré prílohy žiadosť vyžaduje a či sú priložené: pravidlá príloh z balíka, bez modelu (milisekundy). */
async function stavPriloh(spisId: number, vyzva: string) {
  try {
    const p = await posud(pod.ziadostSpisu(db, spisId), balikVyzvy(vyzva), zonfp, { llm: false, iba: PRAVIDLA_PRILOH(balikVyzvy(vyzva)) });
    return p.nalezy.map((n) => ({ cislo: String((balikVyzvy(vyzva).pravidla.find((r) => r.id === n.pravidlo)?.parametre as any)?.cislo ?? ''), pravidlo: n.pravidlo, stav: n.stav, zdovodnenie: n.zdovodnenie }));
  } catch { return null; }
}

async function apiPodatelne(req: http.IncomingMessage, res: http.ServerResponse, url: URL): Promise<void> {
  const c = url.pathname.replace(/^\/api\/podatelna\/?/, '').split('/');
  const id = Number(c[1]);
  if (c[0] === 'vyzvy') {
    const st = pod.statistikaSpisov(db);
    return json(res, 200, pod.registerVyziev().map((v) => ({ ...v, spisy: st.get(v.kod) ?? null })));
  }
  if (c[0] === 'spisy' && !c[1]) {
    if (req.method === 'POST') {
      const b = await telo(req, 120 << 20);
      const vyzva = String(b.vyzva ?? '');
      if (!pod.vyzvySPravidlami().includes(vyzva)) return json(res, 400, { chyba: `Pre výzvu „${vyzva}“ nie sú pripravené pravidlá žiadosti o NFP.` });
      const nove = pod.prijmiPodanie(db, { vyzva, zdroj: String(b.zdroj ?? 'nahraté v rozhraní'), kodItms: b.kodItms ? String(b.kodItms) : undefined, subory: subory(b), sloty: SLOTY, zItms });
      return json(res, 200, { id: nove });
    }
    return json(res, 200, pod.zoznamSpisov(db, url.searchParams.get('vyzva') ?? undefined));
  }
  if (c[0] === 'spisy' && id) {
    const s = pod.spisRiadok(db, id);
    if (!s) return json(res, 404, { chyba: 'Spis neexistuje.' });
    if (!c[2]) {
      const d = pod.detailSpisu(db, id)!;
      const zIts = d.spis.formularZdroj?.startsWith('ITMS21+') && d.ziadost ? zonfp.skutocnost?.(d.ziadost) ?? null : null;
      return json(res, 200, { ...d, sloty: SLOTY, prilohyStav: await stavPriloh(id, s.vyzva), skutocnost: zIts, titulok: d.ziadost ? zonfp.titulok(d.ziadost) : null, suhrn: d.ziadost ? zonfp.suhrn?.(d.ziadost) ?? '' : '' });
    }
    if (req.method !== 'POST') return json(res, 405, { chyba: 'Použite POST.' });
    const b = await telo(req, 120 << 20);
    if (c[2] === 'subory') { pod.doplnPodklady(db, id, subory(b), SLOTY, zItms); return json(res, 200, { ok: true }); }
    if (c[2] === 'posud') {
      const v = pod.ziadostSpisu(db, id);
      const p = await posud(v, balikVyzvy(s.vyzva), zonfp, { llm: b.llm !== false });
      const r = vlozSpisovy.run(p.cas, zonfp.id, p.ziadostKod, p.balik, p.verziaBalika, p.model, p.navrh, 0, p.trvanieMs, JSON.stringify(naAudit(zonfp, p)), id);
      pod.ulozPosudok(db, id, Number(r.lastInsertRowid), p.navrh);
      return json(res, 200, { posudok: p });
    }
    if (c[2] === 'rozhodnutie') { pod.rozhodni(db, id, b.rozhodnutie, String(b.poznamka ?? '')); return json(res, 200, { ok: true }); }
    if (c[2] === 'vymaz') { pod.vymazSpis(db, id); return json(res, 200, { ok: true }); }
  }
  if (c[0] === 'subory' && id) {
    if (c[2] === 'zaradenie' && req.method === 'POST') { const b = await telo(req); return json(res, 200, { spis: pod.zmenZaradenie(db, id, String(b.ciel ?? ''), zItms) }); }
    if (c[2] === 'text') { const t = pod.textSuboru(db, id); return t ? json(res, 200, t) : json(res, 404, { chyba: 'Súbor neexistuje.' }); }
    if (c[2] === 'stiahni') {
      const f = pod.suborNaStiahnutie(db, id);
      if (!f) return json(res, 404, { chyba: 'Súbor neexistuje.' });
      res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(f.nazov)}` });
      return void res.end(f.data);
    }
  }
  return json(res, 404, { chyba: 'Neznáma adresa API podateľne.' });
}

/** Do auditu nejdú osobné údaje z registrov (mená štatutárov) ani úryvky z dokumentov modulov, ktoré to žiadajú. */
function naAudit(m: Modul, p: Posudok): Posudok {
  if (!m.neukladatDokazy) return p;
  return { ...p, nalezy: p.nalezy.map(({ dokaz: _d, ...n }) => (n.druh === 'register' ? { ...n, zdovodnenie: `[osobné údaje z registra sa neukladajú] stav: ${n.stav}` } : n)) };
}

const MIME: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml' };
const json = (res: http.ServerResponse, kod: number, telo: unknown) => { res.writeHead(kod, { 'content-type': MIME['.json'], 'cache-control': 'no-store' }); res.end(JSON.stringify(telo)); };
async function telo(req: http.IncomingMessage, limit = 40 << 20): Promise<any> {
  const casti: Buffer[] = []; let n = 0;
  for await (const c of req) { n += c.length; if (n > limit) throw new Error('Požiadavka je príliš veľká.'); casti.push(c); }
  return casti.length ? JSON.parse(Buffer.concat(casti).toString('utf8')) : {};
}
const citajEval = (f: string) => { const p = path.join(KOREN, 'eval', f); return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null; };
const infoBalika = (m: Modul) => { try { const b = balik(m); return { id: b.id, vyzvaKod: b.vyzvaKod, vyzvaNazov: b.vyzvaNazov, poskytovatel: b.poskytovatel, verzia: b.verzia, platnaOd: b.platnaOd, pravidiel: b.pravidla.length }; } catch (e) { return { chyba: (e as Error).message }; } };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
  try {
    if (url.pathname === '/api/stav') {
      return json(res, 200, {
        vyzva: VYZVA, model: MODEL, modelDostupny: await dostupny(), pdf: pdfDostupny(),
        posudkov: (db.prepare('SELECT COUNT(*) AS n FROM posudky').get() as { n: number }).n,
        moduly: MODULY.map((m) => ({ id: m.id, nazov: m.nazov, popis: m.popis, filtre: m.filtre ?? [], balik: infoBalika(m) })),
      });
    }
    if (url.pathname === '/api/text' && req.method === 'POST') {
      const b = await telo(req);
      const text = dokumentNaText(String(b.nazov), Buffer.from(String(b.base64), 'base64'));
      return json(res, 200, { nazov: b.nazov, text, znakov: text.length });
    }
    if (url.pathname.startsWith('/api/podatelna/')) return await apiPodatelne(req, res, url);
    if (url.pathname === '/api/eval') return json(res, 200, { pravidla: citajEval('test-pravidla.json'), llm: citajEval('test-llm.json'), moduly: citajEval('test-moduly.json'), llmModuly: citajEval('test-llm-moduly.json') });

    const cesta = url.pathname.match(/^\/api\/([a-z]+)\/(pripady|pripad|posud|pravidla)(?:\/(.+))?$/);
    if (cesta) {
      const m = podlaId.get(cesta[1]);
      if (!m) return json(res, 404, { chyba: `Neznámy modul ${cesta[1]}.` });
      if (cesta[2] === 'pripady') return json(res, 200, m.pripady(url.searchParams.get('q') ?? '', url.searchParams.get('filter') ?? ''));
      if (cesta[2] === 'pravidla') return json(res, 200, balik(m));
      if (cesta[2] === 'pripad') {
        const v = m.nacitaj(decodeURIComponent(cesta[3] ?? ''));
        if (!v) return json(res, 404, { chyba: 'Prípad sa nenašiel.' });
        return json(res, 200, { titulok: m.titulok(v), suhrn: m.suhrn?.(v) ?? '', polia: m.polia(v), formular: m.doFormulara(v), prilohy: m.prilohy(v), skutocnost: m.skutocnost?.(v) ?? null });
      }
      if (cesta[2] === 'posud' && req.method === 'POST') {
        const b = await telo(req);
        const zaklad = m.nacitaj(String(b.id ?? ''));
        if (!zaklad) return json(res, 404, { chyba: 'Prípad sa nenašiel.' });
        // Úpravy z rozhrania (vlastné údaje, simulácia chýb) sa aplikujú na kópiu, pôvodné dáta sa nemenia.
        let v = structuredClone(zaklad);
        const upravena = !!b.formular;
        if (b.formular) v = m.zFormulara(v, b.formular);
        if (b.prilohy !== undefined) (v as any).prilohy = b.prilohy;
        const p = await posud(v, balik(m), m, { llm: b.llm !== false });
        vloz.run(p.cas, m.id, p.ziadostKod, p.balik, p.verziaBalika, p.model, p.navrh, upravena ? 1 : 0, p.trvanieMs, JSON.stringify(naAudit(m, p)));
        return json(res, 200, { posudok: p, titulok: m.titulok(v), suhrn: m.suhrn?.(v) ?? '', prilohy: m.prilohy(v), vystupy: m.vystupy?.(v, p.nalezy) ?? [], skutocnost: upravena ? null : m.skutocnost?.(zaklad) ?? null });
      }
    }
    if (url.pathname.startsWith('/api/')) return json(res, 404, { chyba: 'Neznáma adresa API.' });

    // statické súbory
    const subor = path.normalize(path.join(KOREN, 'web', url.pathname === '/' ? 'index.html' : url.pathname));
    if (!subor.startsWith(path.join(KOREN, 'web')) || !fs.existsSync(subor) || fs.statSync(subor).isDirectory()) { res.writeHead(404); return res.end('Nenájdené'); }
    res.writeHead(200, { 'content-type': MIME[path.extname(subor)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    fs.createReadStream(subor).pipe(res);
  } catch (e) {
    json(res, 500, { chyba: (e as Error).message });
  }
});
server.listen(PORT, '127.0.0.1', () => console.log(`Eurofondy kontrola beží na http://127.0.0.1:${PORT} (výzva ${VYZVA}; moduly: ${MODULY.map((m) => m.id).join(', ')})`));
