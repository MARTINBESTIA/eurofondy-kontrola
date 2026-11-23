// HTTP server dema: API pre všetky moduly + statické súbory. Bez frameworku, iba node:http a node:sqlite.
// Modul = jeden úsek procesu eurofondov (žiadosť, VO, ŽoP, ...). Server o module nič nevie, volá len rozhranie Modul.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { nacitajBalik, posud, posudPodlaKola, verzieBalika, vyberVerziu } from '../core/posud.ts';
import { dostupny, MODEL } from '../llm/ollama.ts';
import { dokumentNaText, pdfDostupny } from '../ingest/dokument.ts';
import type { BalikPravidiel, Modul, Nalez, Posudok } from '../core/typy.ts';
import { zonfp } from '../moduly/zonfp/modul.ts';
import { vyzvy } from '../moduly/vyzvy/modul.ts';
import { vo } from '../moduly/vo/modul.ts';
import { zmeny } from '../moduly/zmeny/modul.ts';
import { zop } from '../moduly/zop/modul.ts';
import { ukazovatele } from '../moduly/ukazovatele/modul.ts';
import * as pod from '../podatelna/podatelna.ts';
import { dolozPosudok, precitajPosudok } from '../podatelna/doklady.ts';
import { MIN_LEHOTA, navrhVyzvy } from '../podatelna/vyzva.ts';
import { dnesSk, jeDen } from '../podatelna/lehoty.ts';
import { MAX_VEK_KONTROLY_DNI, nacitajKontroluZmien, nacitajZakladZmien, skontrolujZmeny, vekUdajovDni } from '../core/zmeny.ts';

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
/** Stav kontroly zmien výzvy v ITMS21+ pre stránku Pravidlá: základ, ktorý posúdil človek, a posledná kontrola. */
function stavZmien(vyzva: string) {
  const zaklad = nacitajZakladZmien(vyzva);
  if (!zaklad) return null;
  const kontrola = nacitajKontroluZmien(vyzva);
  // Vek údajov od stiahnutia z ITMS21+ (ako bod VER-KONTROLA), nie od behu kontroly; null = nedá sa určiť.
  const vekDni = kontrola ? vekUdajovDni(kontrola) : null;
  return { zaklad: { prevzate: zaklad.prevzate, verzie: zaklad.verzie, bezBalika: zaklad.bezBalika }, kontrola, vekDni, maxVekDni: MAX_VEK_KONTROLY_DNI };
}

const db = new DatabaseSync(process.env.PODATELNA_DB ?? path.join(KOREN, 'data', 'app.db'));
db.exec(`CREATE TABLE IF NOT EXISTS posudky (
  id INTEGER PRIMARY KEY, cas TEXT NOT NULL, ziadost_kod TEXT NOT NULL, balik TEXT NOT NULL, verzia TEXT NOT NULL,
  model TEXT, navrh TEXT NOT NULL, upravena INTEGER NOT NULL, trvanie_ms INTEGER NOT NULL, posudok_json TEXT NOT NULL)`);
if (!(db.prepare('PRAGMA table_info(posudky)').all() as { name: string }[]).some((c) => c.name === 'modul')) db.exec(`ALTER TABLE posudky ADD COLUMN modul TEXT NOT NULL DEFAULT 'zonfp'`);
const vloz = db.prepare('INSERT INTO posudky (cas, modul, ziadost_kod, balik, verzia, model, navrh, upravena, trvanie_ms, posudok_json) VALUES (?,?,?,?,?,?,?,?,?,?)');
pod.pripravDb(db);
const vlozSpisovy = db.prepare('INSERT INTO posudky (cas, modul, ziadost_kod, balik, verzia, model, navrh, upravena, trvanie_ms, posudok_json, spis_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)');

// Podateľňa posudzuje žiadosti o NFP pravidlami tej výzvy, do ktorej podanie patrí.
// Znenie výzvy (verzia balíka) sa vyberá podľa kola žiadosti; staré posudky sa čítajú s verziou, ktorou vznikli.
const verzieVyzvy = (vyzva: string) => verzieBalika(vyzva, 'zonfp');
const SLOTY = zonfp.prilohy(undefined as never);
const zItms = (kod: string) => zonfp.nacitaj(kod);
const PRAVIDLA_PRILOH = (b: BalikPravidiel) => b.pravidla.filter((p) => p.druh === 'priloha').map((p) => p.id);
const subory = (b: any): pod.Subor[] => (Array.isArray(b.subory) ? b.subory : []).map((s: any) => ({ nazov: String(s.nazov), data: Buffer.from(String(s.base64), 'base64') }));

/** Ktoré prílohy žiadosť vyžaduje a či sú priložené: pravidlá príloh z balíka, bez modelu (milisekundy). */
async function stavPriloh(spisId: number, vyzva: string) {
  try {
    const z = pod.ziadostSpisu(db, spisId);
    const { balik } = vyberVerziu(vyzva, zonfp, z);
    const formular = pod.zdrojFormulara(db, pod.spisRiadok(db, spisId)!);
    const p = dolozPosudok(await posud(z, balik, zonfp, { llm: false, iba: PRAVIDLA_PRILOH(balik) }), z, formular, balik);
    return p.nalezy.map(n => ({ cislo: String(balik.pravidla.find(r => r.id === n.pravidlo)?.parametre?.cislo ?? ''),
      pravidlo: n.pravidlo, nazov: n.nazov, stav: n.stav, zdovodnenie: n.zdovodnenie, doklady: n.doklady }));
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
    return json(res, 200, pod.zoznamSpisov(db, url.searchParams.get('vyzva') ?? undefined, dnesSk()));
  }
  if (c[0] === 'spisy' && id) {
    const s = pod.spisRiadok(db, id);
    if (!s) return json(res, 404, { chyba: 'Spis neexistuje.' });
    if (!c[2]) {
      const d = pod.detailSpisu(db, id)!;
      if (s.posudok_id && !d.posledny?.nalezy?.some((n: { povodDokladov?: string }) => n.povodDokladov))
        d.posledny = await precitajPosudok(db, id, s.posudok_id, verzieVyzvy(s.vyzva));
      const zIts = d.spis.formularZdroj?.startsWith('ITMS21+') && d.ziadost ? zonfp.skutocnost?.(d.ziadost) ?? null : null;
      return json(res, 200, { ...d, sloty: SLOTY, prilohyStav: await stavPriloh(id, s.vyzva), skutocnost: zIts, titulok: d.ziadost ? zonfp.titulok(d.ziadost) : null, suhrn: d.ziadost ? zonfp.suhrn?.(d.ziadost) ?? '' : '',
        vyzvy: pod.lehotySpisu(db, id, dnesSk()), dnes: dnesSk() });
    }
    if (c[2] === 'posudky' && req.method === 'GET') {
      const p = await precitajPosudok(db, id, Number(c[3]) || 0, verzieVyzvy(s.vyzva));
      return p ? json(res, 200, { posudok: p }) : json(res, 404, { chyba: 'Posudok sa v tomto spise nenašiel.' });
    }
    if (req.method !== 'POST') return json(res, 405, { chyba: 'Použite POST.' });
    const b = await telo(req, 120 << 20);
    // Doplnenie: za deň doplnenia sa považuje deň odoslania do neverejnej časti ITMS21+ (MD č. 21, kap. 2.4 ods. 5).
    if (c[2] === 'subory') {
      const odoslane = b.odoslane ? String(b.odoslane) : null;
      if (odoslane && (!jeDen(odoslane) || odoslane > dnesSk())) return json(res, 400, { chyba: 'Deň odoslania doplnenia do ITMS21+ musí byť platný dátum, nie v budúcnosti.' });
      pod.doplnPodklady(db, id, subory(b), SLOTY, zItms, odoslane);
      return json(res, 200, { ok: true });
    }
    if (c[2] === 'posud') {
      const v = pod.ziadostSpisu(db, id);
      const formular = pod.zdrojFormulara(db, s);
      // Formálne náležitosti (podpisy) len na výslovnú žiadosť kontrolóra; predvolene sa kontroluje obsah.
      const { balik, posudok } = await posudPodlaKola(v, s.vyzva, zonfp, { llm: b.llm !== false, formalne: b.formalne === true });
      const p = dolozPosudok(posudok, v, formular, balik);
      const r = vlozSpisovy.run(p.cas, zonfp.id, p.ziadostKod, p.balik, p.verziaBalika, p.model, p.navrh, 0, p.trvanieMs, JSON.stringify(naAudit(zonfp, p)), id);
      pod.ulozPosudok(db, id, Number(r.lastInsertRowid), p.navrh);
      return json(res, 200, { posudok: p });
    }
    // Návrh výzvy na doplnenie z posledného posudku: len text pre kontrolóra, nič sa neukladá ani neodosiela.
    if (c[2] === 'vyzva') {
      const d = pod.detailSpisu(db, id)!;
      if (!d.posledny) return json(res, 400, { chyba: 'Žiadosť ešte nebola posúdená.' });
      const verzie = verzieVyzvy(s.vyzva);
      const balik = verzie.find((x) => x.id === d.posledny.balik && x.verzia === d.posledny.verziaBalika) ?? verzie.at(-1)!;
      try {
        return json(res, 200, navrhVyzvy({ posudok: d.posledny, balik, spis: d.spis, sloty: SLOTY },
          { vyber: Array.isArray(b.vyber) ? b.vyber.map(String) : undefined, lehota: b.lehota == null ? undefined : Number(b.lehota) }));
      } catch (e) { return json(res, 400, { chyba: (e as Error).message }); }
    }
    if (c[2] === 'rozhodnutie') {
      // Výzva na doplnenie: zapíše sa aj deň odoslania a lehota, od ktorých aplikácia sleduje lehotu na doplnenie.
      let vyzva: pod.OdoslanaVyzva | undefined;
      if (b.rozhodnutie === 'doplnenie') {
        const v = b.vyzva ?? {};
        const odoslana = v.odoslana ? String(v.odoslana) : dnesSk();
        const lehota = v.lehota == null ? MIN_LEHOTA : Number(v.lehota);
        if (!jeDen(odoslana) || odoslana > dnesSk()) return json(res, 400, { chyba: 'Deň odoslania výzvy musí byť platný dátum, nie v budúcnosti.' });
        if (!Number.isInteger(lehota) || lehota < MIN_LEHOTA) return json(res, 400, { chyba: `Lehota na doplnenie musí byť celý počet pracovných dní, najmenej ${MIN_LEHOTA} (MD č. 21, kap. 2.4 ods. 5).` });
        vyzva = { odoslana, lehotaDni: lehota, polozky: Array.isArray(v.polozky) ? v.polozky.map(String) : null, text: typeof v.text === 'string' && v.text.trim() ? v.text.slice(0, 50_000) : null };
      }
      pod.rozhodni(db, id, b.rozhodnutie, String(b.poznamka ?? ''), vyzva);
      return json(res, 200, { ok: true });
    }
    // Údaje o lehote výzvy: deň odoslania, doručenia (elektronická doručenka) a predĺženie.
    if (c[2] === 'lehota') {
      const den = (x: unknown) => (x === undefined ? undefined : x === null || x === '' ? null : String(x));
      try {
        pod.upravLehotu(db, id, Number(b.vyzva), { odoslana: den(b.odoslana) ?? undefined, dorucena: den(b.dorucena), predlzeneDo: den(b.predlzeneDo),
          predlzeniePozn: b.predlzeniePozn === undefined ? undefined : b.predlzeniePozn === null ? null : String(b.predlzeniePozn) }, dnesSk());
      } catch (e) { return json(res, 400, { chyba: (e as Error).message }); }
      return json(res, 200, { vyzvy: pod.lehotySpisu(db, id, dnesSk()) });
    }
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
  // Doklady pravidiel, ktoré číta model, citujú dokument: úryvok môže obsahovať mená, preto sa neukladá ako ani dôkaz.
  const bezUryvkov = (n: Nalez): Nalez => (n.druh === 'llm' && n.doklady ? { ...n, doklady: n.doklady.map((d) => ({ ...d, citat: '[úryvok z dokumentu sa neukladá]' })) } : n);
  return { ...p, nalezy: p.nalezy.map(({ dokaz: _d, ...n }) => bezUryvkov(n.druh === 'register' ? { ...n, zdovodnenie: `[osobné údaje z registra sa neukladajú] stav: ${n.stav}` } : n)) };
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

    const cesta = url.pathname.match(/^\/api\/([a-z]+)\/(pripady|pripad|posud|pravidla|zmeny-vyzvy)(?:\/(.+))?$/);
    if (cesta) {
      const m = podlaId.get(cesta[1]);
      if (!m) return json(res, 404, { chyba: `Neznámy modul ${cesta[1]}.` });
      if (cesta[2] === 'pripady') return json(res, 200, m.pripady(url.searchParams.get('q') ?? '', url.searchParams.get('filter') ?? ''));
      if (cesta[2] === 'pravidla') {
        const b = balik(m);
        // Verzie znenia výzvy: ktoré kolá pokrývajú a či ich pravidlá schválil človek.
        const verzie = b.verziaBalika ? verzieBalika(m.balikVyzva ?? VYZVA, m.id).map((x) => ({
          verzia: x.verzia, platnaOd: x.platnaOd, ...x.verziaBalika!, pravidiel: x.pravidla.length, podmienok: x.podmienky?.length ?? 0,
          pravidlaId: x.pravidla.map((r) => r.id), podmienkyId: (x.podmienky ?? []).map((p) => p.id) })) : [];
        return json(res, 200, { ...b, verzie, zmenyVyzvy: b.verziaBalika ? stavZmien(m.balikVyzva ?? VYZVA) : null });
      }
      // Kontrola zmien výzvy na pokyn používateľa: len čítanie verejného API ITMS21+, nič sa neodosiela.
      if (cesta[2] === 'zmeny-vyzvy' && req.method === 'POST') {
        const vyzva = m.balikVyzva ?? VYZVA;
        if (!nacitajZakladZmien(vyzva)) return json(res, 404, { chyba: 'Výzva nemá základ zmien v ITMS21+.' });
        try { await skontrolujZmeny(vyzva, verzieBalika(vyzva, m.id)); }
        catch (e) { return json(res, 502, { chyba: `Kontrola zmien zlyhala: ${(e as Error).message}` }); }
        return json(res, 200, stavZmien(vyzva));
      }
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
        const { posudok: p } = await posudPodlaKola(v, m.balikVyzva ?? VYZVA, m, { llm: b.llm !== false, formalne: b.formalne === true });
        vloz.run(p.cas, m.id, p.ziadostKod, p.balik, p.verziaBalika, p.model, p.navrh, upravena ? 1 : 0, p.trvanieMs, JSON.stringify(naAudit(m, p)));
        return json(res, 200, { posudok: p, titulok: m.titulok(v), suhrn: m.suhrn?.(v) ?? '', prilohy: m.prilohy(v), vystupy: m.vystupy?.(v, p.nalezy) ?? [], skutocnost: upravena ? null : m.skutocnost?.(zaklad) ?? null });
      }
    }
    if (url.pathname.startsWith('/api/')) return json(res, 404, { chyba: 'Neznáma adresa API.' });

    if (req.method === 'GET' && url.pathname === '/demo/01-komplet.zip') {
      const balik = path.join(KOREN, 'demo', 'itms', '01-komplet.zip');
      if (!fs.existsSync(balik)) return json(res, 404, { chyba: 'Ukážkové podanie nie je dostupné.' });
      res.writeHead(200, { 'content-type': 'application/zip', 'content-disposition': 'attachment; filename="01-komplet.zip"' });
      return void fs.createReadStream(balik).pipe(res);
    }

    // statické súbory
    const subor = path.normalize(path.join(KOREN, 'web', url.pathname === '/' ? 'index.html' : url.pathname));
    if (!subor.startsWith(path.join(KOREN, 'web')) || !fs.existsSync(subor) || fs.statSync(subor).isDirectory()) { res.writeHead(404); return res.end('Nenájdené'); }
    res.writeHead(200, { 'content-type': MIME[path.extname(subor)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    fs.createReadStream(subor).pipe(res);
  } catch (e) {
    json(res, 500, { chyba: (e as Error).message });
  }
});
server.listen(PORT, '127.0.0.1', () => {
  const adresa = server.address();
  if (adresa && typeof adresa !== 'string') console.log(`Eurofondy kontrola beží na http://127.0.0.1:${adresa.port} (výzva ${VYZVA}; moduly: ${MODULY.map((m) => m.id).join(', ')})`);
});
