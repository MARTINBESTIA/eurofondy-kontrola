// Stiahne projekty výzvy (tie, ktoré vznikli zo schválených ŽoNFP), zoznam všetkých výziev a plánované výzvy.
// Výstup: data/odvodene/<vyzva>/projekty.json, data/odvodene/vyzvy.json
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { bezKontaktov } from '../src/moduly/spolocne.ts';
import { htmlNaText } from '../src/moduly/zonfp/normalizuj.ts';
import type { Projekt } from '../src/core/typy.ts';

const API = 'https://api.itms21.sk/public/v1';
const kodVyzvy = process.argv[2] ?? 'PSK-SIEA-002-2023-DV-EFRR';
const koren = path.join(import.meta.dirname, '..');
const rawZonfp = path.join(koren, 'data', 'raw', 'itms21', kodVyzvy, 'zonfp');
const rawProjekt = path.join(koren, 'data', 'raw', 'itms21', kodVyzvy, 'projekt');
fs.mkdirSync(rawProjekt, { recursive: true });

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
const datum = (ms: number | null | undefined) => (ms ? new Date(ms + 3 * 3600_000).toISOString().slice(0, 10) : null);

// 1. projekty: id z detailov ŽoNFP
const zoZonfp = new Map<number, { kod: string; schvalenie: string | null; predlozenie: string | null }>();
for (const f of fs.readdirSync(rawZonfp)) {
  const d = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(rawZonfp, f))).toString('utf8'));
  if (d.projekt?.id) zoZonfp.set(d.projekt.id, { kod: d.kod, schvalenie: datum(d.datumSchvalenia), predlozenie: datum(d.datumPredlozenia) });
}
const fronta = [...zoZonfp.keys()]; let hotovo = 0;
async function pracuj() {
  for (let id; (id = fronta.pop()) !== undefined; ) {
    const f = path.join(rawProjekt, `${id}.json.gz`);
    if (!fs.existsSync(f)) fs.writeFileSync(f, zlib.gzipSync(JSON.stringify(await getJson(`${API}/projekt/id/${id}`))));
    process.stdout.write(`\rprojekty ${++hotovo}/${zoZonfp.size}`);
  }
}
await Promise.all(Array.from({ length: 5 }, pracuj));
console.log();

const projekty: Projekt[] = [];
for (const f of fs.readdirSync(rawProjekt)) {
  const p = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(rawProjekt, f))).toString('utf8'));
  const z = zoZonfp.get(p.id);
  const uk = (zoznam: any[], typ: 'vystup' | 'vysledok') => (zoznam ?? []).map((u: any) => {
    const x = u.ukazovatelProjektovySC?.ukazovatelProjektovy ?? {};
    return { kod: x.kod ?? '', nazov: x.nazovSk ?? '', typ, jednotka: x.mernaJednotka?.nazovSk ?? '', vychodisko: u.vychodiskovaHodnotaSpolu ?? null, ciel: u.cielovaHodnotaSpolu ?? null };
  });
  projekty.push({
    id: p.id, kod: p.kod, nazov: p.nazov, vyzvaKod: p.vyzva?.kod ?? kodVyzvy, stav: p.stav, ukonceny: !!p.ukonceny,
    prijimatel: { nazov: p.prijimatel?.nazov ?? '', ico: p.prijimatel?.ico ?? '', pravnaFormaKod: p.prijimatel?.pravnaForma?.kodZdroj ?? '', pravnaForma: p.prijimatel?.pravnaForma?.nazovSk ?? '' },
    zmluva: { cislo: p.zmluvaProjekt?.cislo ?? '', ucinnost: datum(p.zmluvaProjekt?.datumUcinnosti), url: p.zmluvaProjekt?.url ?? null },
    zonfpKod: z?.kod ?? '', zonfpPredlozenie: z?.predlozenie ?? null, zonfpSchvalenie: z?.schvalenie ?? null,
    cov: p.celkovaZazmluvnenaSuma ?? 0, nfp: p.zazmluvnenaSumaNfp ?? 0, poskytnute: p.poskytnuteProstriedky ?? 0,
    planZaciatok: datum(p.datumZaciatkuHlavnychAktivit), planKoniec: datum(p.datumKoncaHlavnychAktivit),
    skutZaciatok: datum(p.skutocnaRealizaciaZaciatok), skutKoniec: datum(p.skutocnaRealizaciaKoniec),
    popis: htmlNaText(p.popis),
    ukazovatele: [...uk(p.ukazovatelVystupu, 'vystup'), ...uk(p.ukazovatelVysledku, 'vysledok')],
    terminy: (p.monitorovacieTerminy ?? []).map((t: any) => ({ typ: t.typMonitorovania, poradie: t.poradoveCislo, termin: datum(t.terminMonitorovania), najneskor: datum(t.datumPredlozeniaNajneskorsi) })).sort((a: any, b: any) => (a.najneskor ?? '').localeCompare(b.najneskor ?? '')),
    zmeny: (p.zmenaProjekt ?? []).map((x: any) => ({ id: x.id, predmet: htmlNaText(x.predmet), dodatok: x.cisloDodatku ?? null, ucinnost: datum(x.datumUcinnosti), dokumenty: (x.dokument ?? []).map((d: any) => d.nazov ?? '') })),
    dodavatelia: (p.dodavatel ?? []).map((d: any) => ({ nazov: d.nazov ?? '', ico: d.ico ?? '' })),
  });
}
projekty.sort((a, b) => a.kod.localeCompare(b.kod));
const out = path.join(koren, 'data', 'odvodene', kodVyzvy);
fs.writeFileSync(path.join(out, 'projekty.json'), bezKontaktov(projekty));

// 2. výzvy a plánované výzvy (štíhly zoznam)
const vyzvy: any[] = [];
for (let offset = 0, limit = 100; ; offset += limit) {
  const j = await getJson(`${API}/vyzva?limit=${limit}&offset=${offset}`);
  for (const v of j.results) vyzvy.push({
    kod: v.kod, nazov: v.nazovSk, program: v.program?.skratka ?? '', vyhlasovatel: v.vyhlasovatel?.nazov ?? '', druh: v.druh, typ: v.typ, zameranie: v.zameranieProjektu,
    vyhlasena: datum(v.datumVyhlasenia), ukoncena: datum(v.datumUkoncenia), uzavreta: !!v.uzavreta, zrusena: !!v.zrusena, pozastavena: !!v.pozastavenePredkladanieZonfp, sumaEu: v.sumaEu ?? null,
    predlozenych: v.pocetPredlozenychZiadosti ?? null, schvalenych: v.pocetSchvalenychZiadosti ?? null, neschvalenych: v.pocetNeschvalenychZiadosti ?? null,
    kola: (v.posudzovaneObdobie ?? []).map((k: any) => ({ cislo: k.poradoveCislo, uzavierka: datum(k.datumUzavierky) })).sort((a: any, b: any) => a.cislo - b.cislo),
    verzie: (v.verzia ?? []).map((x: any) => ({ cislo: x.cislo, datum: datum(x.datumVykonaniaZmeny), dovod: htmlNaText(x.dovodVznikuVerzie).slice(0, 600) })).sort((a: any, b: any) => a.cislo - b.cislo),
  });
  process.stdout.write(`\rvýzvy ${vyzvy.length}/${j.size}`);
  if (j.results.length < limit) break;
}
const plan = (await getJson(`${API}/planovanavyzva?limit=200&offset=0`)).results.map((v: any) => ({ kod: v.kod, nazov: v.nazovSk, program: v.programSkratka, vyhlasovatel: v.vyhlasovatel?.nazov ?? '', zameranie: v.zameranieProjektu, planVyhlasenia: datum(v.datumVyhlasenia1Kolo), sumaEu: v.sumaEu ?? null, vyhlasena: !!v.vyhlasena, zrusena: !!v.zrusena }));
// snímka plánovaných výziev s dátumom: porovnaním snímok sa dajú sledovať posuny harmonogramu
const snimky = path.join(koren, 'data', 'odvodene', 'snimky-planovanych-vyziev');
fs.mkdirSync(snimky, { recursive: true });
fs.writeFileSync(path.join(snimky, `${new Date().toISOString().slice(0, 10)}.json`), bezKontaktov(plan));
fs.writeFileSync(path.join(koren, 'data', 'odvodene', 'vyzvy.json'), bezKontaktov({ stiahnute: new Date().toISOString(), vyzvy, planovane: plan }));
console.log(`\nprojektov: ${projekty.length}, výziev: ${vyzvy.length}, plánovaných výziev: ${plan.length}`);
const s: Record<string, number> = {}; for (const p of projekty) s[p.stav] = (s[p.stav] ?? 0) + 1;
console.log('stavy projektov:', JSON.stringify(s));
console.log('zmien spolu:', projekty.reduce((n, p) => n + p.zmeny.length, 0), '| s dodatkom:', projekty.reduce((n, p) => n + p.zmeny.filter((z) => z.dodatok).length, 0), '| dodávateľov:', projekty.reduce((n, p) => n + p.dodavatelia.length, 0));
