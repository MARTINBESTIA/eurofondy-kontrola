// Prevedie stiahnuté zdrojové dokumenty (DOCX, PDF) na text do data/zdroje/<priečinok>/txt/, aby sa v nich dalo hľadať
// a aby citácie v balíkoch pravidiel boli overiteľné oproti textu.
// Použitie: node scripts/00-zdroje-na-text.ts [priečinok pod data/zdroje]
// Archívna verzia výzvy má vlastný priečinok s vlastným txt/ (napr. PSK-SIEA-002-2023/akt2): spracuje sa samostatne
// (node scripts/00-zdroje-na-text.ts PSK-SIEA-002-2023/akt2) a pri prechode celej výzvy sa preskočí, aby rovnako
// pomenované prílohy rôznych verzií neprepísali jedna druhú.
import fs from 'node:fs';
import path from 'node:path';
import { dokumentNaText } from '../src/ingest/dokument.ts';

const koren = path.join(import.meta.dirname, '..', 'data', 'zdroje', process.argv[2] ?? 'PSK-SIEA-002-2023');
const out = path.join(koren, 'txt');
fs.mkdirSync(out, { recursive: true });

const sZmenami = (meno: string) => /(?<!_bez)_SZ$/.test(meno);
function prejdi(dir: string) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    // _SZ = verzia so sledovanými zmenami (duplikát), preskočí sa; _bez_SZ je čistá verzia a spracovať sa musí.
    if (f.isDirectory()) { if (!['txt', 'rozhodnutia'].includes(f.name) && !sZmenami(f.name) && !fs.existsSync(path.join(p, 'txt'))) prejdi(p); continue; }
    if (!/\.(docx|pdf)$/i.test(f.name) || sZmenami(f.name.replace(/\.[^.]+$/, ''))) continue;
    try {
      // Odvodené texty nenesú kontakty (e-maily, telefóny), ani keď ich zverejnený dokument obsahuje.
      const text = dokumentNaText(f.name, fs.readFileSync(p))
        .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}/g, '[e-mail vynechaný]')
        // \s aj pre nedeliteľné medzery, ktoré pdftotext v číslach necháva
        .replace(/\+421(?:\s*\d){8,10}(?:\s*\/\s*\d{2,4})?/g, '[telefón vynechaný]')
        .replace(/\b09\d{2}[\s/]?\d{3}\s?\d{3}\b/g, '[telefón vynechaný]');
      const meno = f.name.replace(/\.(docx|pdf)$/i, '.txt');
      fs.writeFileSync(path.join(out, meno), text);
      console.log(String(text.length).padStart(8), meno);
    } catch (e) { console.log('   CHYBA', f.name, (e as Error).message.slice(0, 80)); }
  }
}
prejdi(koren);
