// Stiahne žiadosti o platbu (ŽoP) projektov výzvy, ich účtovné doklady a verejné obstarávania (VO) prijímateľov.
// Zdroj: verejné API ITMS21+. Surové odpovede sa ukladajú do data/raw (gzip), opakované spustenie nesťahuje znova.
// Výstup: data/odvodene/<vyzva>/zop.json, doklady.json, vo.json
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { bezKontaktov } from '../src/moduly/spolocne.ts';
import type { Projekt } from '../src/core/typy.ts';

const API = 'https://api.itms21.sk/public/v1';
const kodVyzvy = process.argv[2] ?? 'PSK-SIEA-002-2023-DV-EFRR';
const koren = path.join(import.meta.dirname, '..');
const raw = (d: string) => { const p = path.join(koren, 'data', 'raw', 'itms21', kodVyzvy, d); fs.mkdirSync(p, { recursive: true }); return p; };
const out = path.join(koren, 'data', 'odvodene', kodVyzvy);
const projekty: Projekt[] = JSON.parse(fs.readFileSync(path.join(out, 'projekty.json'), 'utf8'));
const idProjektov = new Set(projekty.map((p) => p.id));
const icoPrijimatelov = new Set(projekty.map((p) => p.prijimatel.ico).filter(Boolean));

async function getJson(url: string, pokusy = 5): Promise<any> {
  for (let i = 1; ; i++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(120_000) });
      if (r.status === 404) return null; // záznam nie je verejný
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) {
      if (i >= pokusy) throw new Error(`${url}: ${(e as Error).message}`);
      await new Promise((ok) => setTimeout(ok, 2000 * i));
    }
  }
}
const datum = (ms: number | null | undefined) => (ms ? new Date(ms + 3 * 3600_000).toISOString().slice(0, 10) : null);
const cislo = (x: any) => (x == null || x === '' ? null : Math.round(Number(x) * 100) / 100);

/** Stiahne detaily so zadanými id do priečinka (cache) a vráti ich. */
async function detaily(ids: number[], cesta: string, adr: string, nazov: string): Promise<Map<number, any>> {
  const dir = raw(adr); const fronta = [...new Set(ids)]; const spolu = fronta.length; let hotovo = 0;
  const vysledok = new Map<number, any>();
  async function pracuj() {
    for (let id; (id = fronta.pop()) !== undefined; ) {
      const f = path.join(dir, `${id}.json.gz`);
      let d: any;
      if (fs.existsSync(f)) d = JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString('utf8'));
      else { d = (await getJson(`${API}${cesta}${id}`)) ?? { __nedostupne: true }; fs.writeFileSync(f, zlib.gzipSync(JSON.stringify(d))); }
      if (d && !d.__nedostupne) vysledok.set(id, d);
      if (++hotovo % 20 === 0 || hotovo === spolu) process.stdout.write(`\r${nazov} ${hotovo}/${spolu}`);
    }
  }
  await Promise.all(Array.from({ length: 5 }, pracuj));
  if (spolu) console.log();
  return vysledok;
}

/** Prejde celý stránkovaný zoznam (zoznamy sa menia, preto sa necachujú). */
async function zoznam(cesta: string, kluc: 'results' | 'result'): Promise<any[]> {
  const vsetko: any[] = [];
  for (let offset = 0, limit = 1000; ; offset += limit) {
    const j = await getJson(`${API}${cesta}?limit=${limit}&offset=${offset}`);
    const r = j[kluc] ?? j.results ?? j.result ?? [];
    vsetko.push(...r);
    process.stdout.write(`\r${cesta} ${vsetko.length}/${j.size}`);
    if (r.length < limit) break;
  }
  console.log();
  return vsetko;
}

// 1. ŽoP projektov výzvy
const zopZoznam = (await zoznam('/zop', 'results')).filter((z) => idProjektov.has(z.projekt?.id));
const zopDet = await detaily(zopZoznam.map((z) => z.id), '/zop/id/', 'zop', 'ŽoP');

// 2. účtovné doklady z výdavkov
const idDokladov = [...zopDet.values()].flatMap((z) => (z.vydavky ?? []).map((v: any) => v.uctovnyDoklad?.id)).filter(Boolean);
const dokDet = await detaily(idDokladov, '/uctovnydoklad/id/', 'uctovnydoklad', 'doklady');

// 3. VO: všetky VO prijímateľov výzvy (aj z iných projektov, potrebné na delenie zákaziek a opakovaných víťazov)
//    plus VO, na ktoré odkazujú výdavky v ŽoP
const idVoZVydavkov = [...zopDet.values()].flatMap((z) => (z.vydavky ?? []).flatMap((v: any) => (v.verejneObstaravanie ?? []).map((x: any) => x.id)));
const voZoznam = (await zoznam('/verejneobstaravanie', 'result')).filter((v) => icoPrijimatelov.has(v.obstaravatelSubjekt?.ico));
const voDet = await detaily([...voZoznam.map((v) => v.id), ...idVoZVydavkov], '/verejneobstaravanie/id/', 'vo', 'VO');

// 4. dodávatelia zo zmlúv VO (zmluva obsahuje len odkaz)
const idDod = [...voDet.values()].flatMap((v) => (v.zmluvyVO ?? []).map((z: any) => z.hlavnyDodavatelDodavatelObstaravatel?.id)).filter(Boolean);
const dodDet = await detaily(idDod, '/dodavatelobstaravatel/id/', 'dodavatel', 'dodávatelia');
const dodavatel = (id: number | undefined) => {
  const d = id ? dodDet.get(id) : null;
  return d ? { nazov: d.nazov ?? '', ico: d.ico ?? null, ine: d.ico ? null : d.ineIdentifikacneCislo ?? null, platitelDph: d.platitelDph ?? null } : null;
};

// --- normalizácia
const kodProjektu = new Map(projekty.map((p) => [p.id, p.kod]));
const zop = [...zopDet.values()].map((z) => ({
  id: z.id, kod: z.kod, typ: z.typ, zaverecna: !!z.zopJeZaverecna, narokovana: cislo(z.narokovanaSuma), neuhradena: z.neuhradena ?? null,
  vytvorena: datum(z.createdAt), projektId: z.projekt?.id, projektKod: kodProjektu.get(z.projekt?.id) ?? z.projekt?.kod,
  prijimatel: { nazov: z.prijimatel?.nazov ?? '', ico: z.prijimatel?.ico ?? '', platitelDph: z.prijimatel?.platitelDph ?? null },
  vydavky: (z.vydavky ?? []).map((v: any) => ({
    id: v.id, poradie: v.poradoveCislo, nazov: v.nazov ?? '', druh: v.druhVydavku ?? '', typ: v.typVydavku?.nazovSk ?? '',
    datumUhrady: datum(v.datumUhrady), bezDph: cislo(v.vyskaBezDph), dph: cislo(v.dph), ziadana: cislo(v.sumaZiadanaNaPreplatenie),
    neziadana: (v.sumaNeziadanaNaPreplatenie ?? []).reduce((s: number, x: any) => s + Number(x.suma ?? x.sumaNeziadana ?? 0), 0),
    polozkaRozpoctuId: v.polozkaRozpoctu?.id ?? null, dokladId: v.uctovnyDoklad?.id ?? null,
    voIds: (v.verejneObstaravanie ?? []).map((x: any) => x.id), zmluvaVoIds: (v.zmluvaVerejneObstaravanie ?? []).map((x: any) => x.id),
  })),
})).sort((a, b) => a.kod.localeCompare(b.kod));

const doklady: Record<number, any> = {};
for (const [id, d] of dokDet) doklady[id] = {
  id, cislo: d.cisloDokladu ?? '', nazov: d.nazov ?? '', typ: d.typ ?? '', celkom: cislo(d.celkovaVyskaDokladu),
  datumVyhotovenia: datum(d.datumVyhotovenia), datumUhrady: datum(d.datumUhrady),
  vlastnik: { nazov: d.vlastnikDokladu?.nazov ?? '', ico: d.vlastnikDokladu?.ico ?? '', platitelDph: d.vlastnikDokladu?.platitelDph ?? null },
  dodavatel: d.dodavatelDodavatelObstaravatel ? { nazov: d.dodavatelDodavatelObstaravatel.nazov ?? '', ico: d.dodavatelDodavatelObstaravatel.ico ?? null, platitelDph: d.dodavatelDodavatelObstaravatel.platitelDph ?? null } : null,
  polozky: (d.polozkyDokladu ?? []).map((p: any) => ({ id: p.id, nazov: p.nazov ?? '', jednotkova: cislo(p.jednotkovaCena), mnozstvo: cislo(p.mnozstvo), bezDph: cislo(p.sumaBezDph), dph: cislo(p.dph), sadzba: cislo(p.sadzbaDph), spolu: cislo(p.sumaSpolu), opravnena: cislo(p.sumaOpravnena), ziadana: cislo(p.sumaZiadana) })),
};

const vVyzve = new Set(idVoZVydavkov);
const vo = [...voDet.values()].map((v) => {
  const proj = (v.projekty ?? []).map((p: any) => p.kod);
  return {
    id: v.id, kod: v.kod, nazov: v.nazov ?? '', stav: v.stav ?? '', vytvorene: datum(v.createdAt),
    obstaravatel: { nazov: v.obstaravatelSubjekt?.nazov ?? '', ico: v.obstaravatelSubjekt?.ico ?? '' },
    zadavatel: v.zadavatel ? { nazov: v.zadavatel.nazov ?? '', ico: v.zadavatel.ico ?? '' } : null,
    druhObstaravatela: v.druhObstaravatelaVO?.nazovSk ?? '', druhZakazky: v.druhZakazky?.nazovSk ?? '',
    postup: v.postupObstaravania?.nazovSk ?? '', metoda: v.metodaVO?.nazovSk ?? '', phz: cislo(v.predpokladanaHodnotaZakazky),
    ponuky: v.pocetPrijatychPonuk ?? null, vylucene: v.pocetVylucenychPonuk ?? null, kriterium: v.kriteriumNaVyhodnoteniePonuk ?? '',
    cpv: v.hlavnyPredmetHlavnySlovnik?.kodZdroj ?? '', cpvNazov: v.hlavnyPredmetHlavnySlovnik?.nazovSk ?? '',
    vestnikEU: v.zverejneneVoVestnikuEU ?? null, rozdelena: v.zakazkaRozdelenaNaViacCasti ?? null,
    projekty: proj, vVyzve: vVyzve.has(v.id) || proj.some((k: string) => projekty.some((p) => p.kod === k)),
    zmluvy: (v.zmluvyVO ?? []).map((z: any) => ({ id: z.id, kod: z.kod, cislo: z.cisloZmluvy ?? '', ucinnost: datum(z.datumUcinnosti), suma: cislo(z.celkovaSumaZmluvy), dodavatel: dodavatel(z.hlavnyDodavatelDodavatelObstaravatel?.id) })),
    doklady: (v.uctovneDoklady ?? []).map((d: any) => ({ id: d.id, cislo: d.cisloDokladu ?? '', celkom: cislo(d.celkovaVyskaDokladu), datum: datum(d.createdAt) })),
  };
}).sort((a, b) => a.kod.localeCompare(b.kod));

fs.writeFileSync(path.join(out, 'zop.json'), bezKontaktov(zop));
fs.writeFileSync(path.join(out, 'doklady.json'), bezKontaktov(doklady));
fs.writeFileSync(path.join(out, 'vo.json'), bezKontaktov(vo));
console.log(`ŽoP ${zop.length} (výdavkov ${zop.reduce((s, z) => s + z.vydavky.length, 0)}), dokladov ${Object.keys(doklady).length}, VO ${vo.length} (z toho vo výzve ${vo.filter((v) => v.vVyzve).length})`);
