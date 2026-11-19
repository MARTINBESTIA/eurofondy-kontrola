// Surové detaily z ITMS21+ -> data/odvodene/<vyzva>/ziadosti.json
// Dôvod neschválenia sa doplní z verejných zoznamov rozhodnutí poskytovateľa (PDF prevedené na text cez pdftotext -raw).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { bezKontaktov } from '../src/moduly/spolocne.ts';
import { normalizujItms21 } from '../src/moduly/zonfp/normalizuj.ts';
import type { Dovod, Ziadost } from '../src/core/typy.ts';

const kodVyzvy = process.argv[2] ?? 'PSK-SIEA-002-2023-DV-EFRR';
const koren = path.join(import.meta.dirname, '..');
const raw = path.join(koren, 'data', 'raw', 'itms21', kodVyzvy, 'zonfp');
const rozhodnutia = process.argv[3] ?? path.join(koren, 'data', 'zdroje', 'PSK-SIEA-002-2023', 'rozhodnutia');

// 1. zoznamy rozhodnutí: kód žiadosti -> { kolo, typ zoznamu, dôvod }
const zoZoznamu = new Map<string, { kolo: number | null; zoznam: string; dovod: Dovod }>();
if (fs.existsSync(rozhodnutia)) {
  for (const f of fs.readdirSync(rozhodnutia).filter((x) => x.endsWith('.txt') && x !== 'urls.txt')) {
    const zoznam = /nesch/i.test(f) ? 'neschvalene' : /ZK|zastav/i.test(f) ? 'zastavene' : 'schvalene';
    const kolo = Number(f.match(/^(\d+)/)?.[1] ?? NaN) || null;
    const text = fs.readFileSync(path.join(rozhodnutia, f), 'utf8');
    for (const cast of text.split(/(?=NFP\d{6}[A-Z0-9]{4})/)) {
      const kod = cast.match(/^NFP\d{6}[A-Z0-9]{4}/)?.[0];
      if (!kod) continue;
      const plocho = cast.replace(/\s+/g, ' ');
      let dovod: Dovod = null;
      if (zoznam === 'zastavene') dovod = 'zastavenie_konania';
      else if (zoznam === 'neschvalene') dovod = /nedostatku/i.test(plocho) ? 'nedostatok_prostriedkov' : /Nesplnen/i.test(plocho) ? 'nesplnenie_ppp' : null;
      zoZoznamu.set(kod, { kolo, zoznam, dovod });
    }
  }
}

// 2. normalizácia
const ziadosti: Ziadost[] = [];
for (const f of fs.readdirSync(raw)) {
  const z = normalizujItms21(JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(raw, f))).toString('utf8')));
  const r = zoZoznamu.get(z.kod);
  if (r) { z.dovod = r.dovod; z.kolo ??= r.kolo; }
  // zásobník = neschválená len pre nedostatok prostriedkov (§ 18 zákona č. 121/2022 Z. z.)
  if (z.vysledok === 'zasobnik' && !z.dovod) z.dovod = 'nedostatok_prostriedkov';
  ziadosti.push(z);
}
ziadosti.sort((a, b) => a.kod.localeCompare(b.kod));
const out = path.join(koren, 'data', 'odvodene', kodVyzvy);
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'ziadosti.json'), bezKontaktov(ziadosti));

const tab: Record<string, number> = {};
for (const z of ziadosti) { const k = `${z.vysledok} / ${z.dovod ?? 'dôvod nezverejnený'}`; tab[k] = (tab[k] ?? 0) + 1; }
console.log(`žiadostí: ${ziadosti.length}, kódov v zoznamoch rozhodnutí: ${zoZoznamu.size}`);
for (const [k, n] of Object.entries(tab).sort()) console.log(String(n).padStart(5), k);
const subor = path.join(out, 'ziadosti.json');
console.log('->', subor, (fs.statSync(subor).size / 1e6).toFixed(1), 'MB');
