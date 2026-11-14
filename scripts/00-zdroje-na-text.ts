// Prevedie stiahnuté zdrojové dokumenty (DOCX, PDF) na text do data/zdroje/<priečinok>/txt/, aby sa v nich dalo hľadať
// a aby citácie v balíkoch pravidiel boli overiteľné oproti textu.
// Použitie: node scripts/00-zdroje-na-text.ts [priečinok pod data/zdroje]
import fs from 'node:fs';
import path from 'node:path';
import { dokumentNaText } from '../src/ingest/dokument.ts';

const koren = path.join(import.meta.dirname, '..', 'data', 'zdroje', process.argv[2] ?? 'PSK-SIEA-002-2023');
const out = path.join(koren, 'txt');
fs.mkdirSync(out, { recursive: true });

function prejdi(dir: string) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) { if (!['txt', 'rozhodnutia'].includes(f.name) && !f.name.endsWith('_SZ')) prejdi(p); continue; }
    if (!/\.(docx|pdf)$/i.test(f.name) || /_SZ\./.test(f.name)) continue;
    try {
      const text = dokumentNaText(f.name, fs.readFileSync(p));
      const meno = f.name.replace(/\.(docx|pdf)$/i, '.txt');
      fs.writeFileSync(path.join(out, meno), text);
      console.log(String(text.length).padStart(8), meno);
    } catch (e) { console.log('   CHYBA', f.name, (e as Error).message.slice(0, 80)); }
  }
}
prejdi(koren);
