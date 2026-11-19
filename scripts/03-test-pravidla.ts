// Test 1: deterministické pravidlá na všetkých reálnych žiadostiach výzvy, porovnané so skutočným rozhodnutím poskytovateľa.
// Otázky: (a) hlási softvér porušenie pri žiadostiach, ktoré podmienky podľa poskytovateľa splnili? (falošný poplach)
//         (b) koľko žiadostí neschválených pre nesplnenie PPP softvér z verejných údajov zachytí?
import fs from 'node:fs';
import path from 'node:path';
import { nacitajBalik, posud } from '../src/core/posud.ts';
import { zonfp } from '../src/moduly/zonfp/modul.ts';
import type { Ziadost, Stav } from '../src/core/typy.ts';

const kodVyzvy = process.argv[2] ?? 'PSK-SIEA-002-2023-DV-EFRR';
const koren = path.join(import.meta.dirname, '..');
const ziadosti: Ziadost[] = JSON.parse(fs.readFileSync(path.join(koren, 'data', 'odvodene', kodVyzvy, 'ziadosti.json'), 'utf8'));
const balik = nacitajBalik(kodVyzvy);

export function skupina(z: Ziadost): string {
  if (z.vysledok === 'schvalena' || z.dovod === 'nedostatok_prostriedkov') return 'presli';       // podmienky podľa poskytovateľa splnené
  if (z.vysledok === 'neschvalena' && z.dovod === 'nesplnenie_ppp') return 'nesplnili';            // neschválené pre nesplnenie PPP
  if (z.vysledok === 'zastavene') return 'zastavene';
  return 'ostatne';
}
const SKUPINY = ['presli', 'nesplnili', 'zastavene', 'ostatne'];
const pocetSkupin = Object.fromEntries(SKUPINY.map((s) => [s, 0]));
const poPravidlach: Record<string, Record<string, Record<Stav, number>>> = {};
const sNalezom = Object.fromEntries(SKUPINY.map((s) => [s, 0]));
const priklady: { kod: string; skupina: string; pravidlo: string; zdovodnenie: string }[] = [];

const t0 = Date.now();
for (const z of ziadosti) {
  const g = skupina(z); pocetSkupin[g]++;
  const p = await posud(z, balik, zonfp, { llm: false });
  let nesplnene = false;
  for (const n of p.nalezy.filter((x) => x.druh === 'data')) {
    ((poPravidlach[n.pravidlo] ??= {})[g] ??= {} as Record<Stav, number>)[n.stav] = (poPravidlach[n.pravidlo][g][n.stav] ?? 0) + 1;
    if (n.stav === 'nesplnene') { nesplnene = true; priklady.push({ kod: z.kod, skupina: g, pravidlo: n.pravidlo, zdovodnenie: n.zdovodnenie }); }
  }
  if (nesplnene) sNalezom[g]++;
}
const ms = Date.now() - t0;

const vysledok = {
  vyzva: kodVyzvy, balik: balik.verzia, datum: new Date().toISOString(), pocetZiadosti: ziadosti.length, trvanieMs: ms,
  skupiny: pocetSkupin, ziadostiSNesplnenymPravidlom: sNalezom, poPravidlach,
  falosnePoplachy: priklady.filter((x) => x.skupina === 'presli'), zachytene: priklady.filter((x) => x.skupina === 'nesplnili'),
  zastaveneSNalezom: priklady.filter((x) => x.skupina === 'zastavene'),
};
fs.mkdirSync(path.join(koren, 'eval'), { recursive: true });
fs.writeFileSync(path.join(koren, 'eval', 'test-pravidla.json'), JSON.stringify(vysledok, null, 1));

console.log(`${ziadosti.length} žiadostí, ${balik.pravidla.filter((p) => p.druh === 'data').length} dátových pravidiel, ${ms} ms (${(ms / ziadosti.length).toFixed(2)} ms na žiadosť)`);
console.log('skupiny:', JSON.stringify(pocetSkupin));
console.log('žiadosti s aspoň jedným „nesplnené“:', JSON.stringify(sNalezom));
console.log('\npravidlo  skupina     splnene nesplnene preverit   neoverene neuplatn');
for (const [id, sk] of Object.entries(poPravidlach)) for (const g of SKUPINY) {
  const s = sk[g] ?? {} as Record<Stav, number>;
  console.log(id.padEnd(9), g.padEnd(10), String(s.splnene ?? 0).padStart(8), String(s.nesplnene ?? 0).padStart(9), String(s.na_preverenie ?? 0).padStart(8), String((s.chyba_podklad ?? 0) + (s.mimo_podkladov ?? 0)).padStart(11), String(s.neuplatnuje_sa ?? 0).padStart(8));
}
console.log('\nfalošné poplachy (softvér: nesplnené, poskytovateľ: podmienky splnené):');
for (const x of vysledok.falosnePoplachy) console.log(' ', x.kod, x.pravidlo, x.zdovodnenie.slice(0, 150));
console.log('\nzachytené (softvér: nesplnené, poskytovateľ: neschválené pre nesplnenie PPP):');
for (const x of vysledok.zachytene) console.log(' ', x.kod, x.pravidlo, x.zdovodnenie.slice(0, 150));
