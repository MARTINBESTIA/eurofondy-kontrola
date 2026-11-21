// Výroba ukážkových dokumentov bez knižníc: ZIP, DOCX a PDF (z HTML cez Edge alebo Chrome v režime bez okna).
// Používajú ju generátory demo podaní (scripts/10) a testovacej sady (scripts/18). Každý dokument má v päte
// upozornenie, že ide o ukážku (text päty dodá volajúci). PDF má textovú vrstvu, ktorú prečíta pdftotext.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';

/** ZIP bez kompresie (metóda 0), mená v UTF-8 (príznak 0x800). */
export function zip(subory: { nazov: string; data: Buffer }[]): Buffer {
  const lokalne: Buffer[] = []; const centralne: Buffer[] = []; let offset = 0;
  for (const s of subory) {
    const meno = Buffer.from(s.nazov, 'utf8'); const crc = zlib.crc32(s.data);
    const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x800, 6); h.writeUInt16LE(0, 8);
    h.writeUInt32LE(0, 10); h.writeUInt32LE(crc, 14); h.writeUInt32LE(s.data.length, 18); h.writeUInt32LE(s.data.length, 22); h.writeUInt16LE(meno.length, 26); h.writeUInt16LE(0, 28);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x800, 8); c.writeUInt16LE(0, 10);
    c.writeUInt32LE(0, 12); c.writeUInt32LE(crc, 16); c.writeUInt32LE(s.data.length, 20); c.writeUInt32LE(s.data.length, 24); c.writeUInt16LE(meno.length, 28);
    c.writeUInt16LE(0, 30); c.writeUInt16LE(0, 32); c.writeUInt16LE(0, 34); c.writeUInt16LE(0, 36); c.writeUInt32LE(0, 38); c.writeUInt32LE(offset, 42);
    lokalne.push(h, meno, s.data); centralne.push(c, meno); offset += 30 + meno.length + s.data.length;
  }
  const cd = Buffer.concat(centralne);
  const e = Buffer.alloc(22); e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(subory.length, 8); e.writeUInt16LE(subory.length, 10); e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(offset, 16);
  return Buffer.concat([...lokalne, cd, e]);
}

/** Odsek dokumentu: text, nadpis {b} alebo tabuľka {tab} (prvý riadok je hlavička). */
export type Odsek = string | { b: string } | { tab: string[][] };
const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function docx(odseky: Odsek[], pata: string): Buffer {
  const beh = (t: string, tucne = false) => `<w:r>${tucne ? '<w:rPr><w:b/></w:rPr>' : ''}<w:t xml:space="preserve">${xml(t)}</w:t></w:r>`;
  const telo = odseky.map((o) => {
    if (typeof o === 'string') return `<w:p>${beh(o)}</w:p>`;
    if ('b' in o) return `<w:p>${beh(o.b, true)}</w:p>`;
    const okraj = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map((k) => `<w:${k} w:val="single" w:sz="4" w:space="0" w:color="999999"/>`).join('');
    return `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders>${okraj}</w:tblBorders></w:tblPr>${o.tab.map((r, i) => `<w:tr>${r.map((b) => `<w:tc><w:p>${beh(b, i === 0)}</w:p></w:tc>`).join('')}</w:tr>`).join('')}</w:tbl><w:p/>`;
  }).join('');
  const dokument = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${telo}<w:p>${beh(pata)}</w:p><w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="0" w:footer="0" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  return zip([
    { nazov: '[Content_Types].xml', data: Buffer.from('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>') },
    { nazov: '_rels/.rels', data: Buffer.from('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>') },
    { nazov: 'word/document.xml', data: Buffer.from(dokument) },
  ]);
}

function html(hlavicka: string, nadpis: string, odseky: Odsek[], pata: string): string {
  const telo = odseky.map((o) => typeof o === 'string' ? `<p>${xml(o).replace(/\n/g, '<br>')}</p>` : 'b' in o ? `<h2>${xml(o.b)}</h2>`
    : `<table>${o.tab.map((r, i) => `<tr>${r.map((b) => (i === 0 ? `<th>${xml(b)}</th>` : `<td>${xml(b)}</td>`)).join('')}</tr>`).join('')}</table>`).join('\n');
  return `<!doctype html><html lang="sk"><head><meta charset="utf-8"><style>
@page { size: A4; margin: 18mm 18mm 22mm; } body { font-family: "Segoe UI", Arial, sans-serif; font-size: 10.5pt; line-height: 1.45; color: #1c1b19; }
.hl { border-bottom: 2px solid #1f4e79; padding-bottom: 6px; margin-bottom: 18px; font-size: 9.5pt; color: #444; white-space: pre-line; }
h1 { font-size: 15pt; margin: 0 0 12px; } h2 { font-size: 11.5pt; margin: 16px 0 6px; } p { margin: 0 0 8px; }
table { border-collapse: collapse; margin: 6px 0 12px; font-size: 9.5pt; } th, td { border: 1px solid #999; padding: 4px 6px; text-align: left; } th { background: #eef2f6; }
/* Bez width: 100 %: pri roztiahnutej tabuľke pdftotext -layout číta prvý stĺpec ako samostatný blok a riadky sa posunú. */
.pata { position: fixed; bottom: -12mm; left: 0; right: 0; font-size: 8pt; color: #777; border-top: 1px solid #ccc; padding-top: 3px; }
</style></head><body><div class="hl">${xml(hlavicka)}</div><h1>${xml(nadpis)}</h1>${telo}<div class="pata">${xml(pata)}</div></body></html>`;
}

/**
 * Tlačiareň PDF cez prehliadač bez okna. Bez Edge/Chrome vznikne vedľa cieľa HTML súbor (prehliadac = undefined).
 * uprac() zmaže dočasný profil prehliadača (ak ho proces ešte drží, ostane na údržbu priečinka TEMP).
 */
export function tlaciarenPdf(pata: string) {
  const prehliadac = [process.env.PREHLIADAC, 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/chromium', '/usr/bin/google-chrome']
    .find((p) => p && fs.existsSync(p));
  const profil = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-dokumenty-'));
  function pdf(cesta: string, hlavicka: string, nadpis: string, odseky: Odsek[]) {
    const h = path.join(profil, `${path.basename(cesta)}.html`);
    fs.writeFileSync(h, html(hlavicka, nadpis, odseky, pata));
    if (!prehliadac) { fs.copyFileSync(h, cesta.replace(/\.pdf$/, '.html')); return; }
    fs.rmSync(cesta, { force: true });
    execFileSync(prehliadac, ['--headless=new', '--disable-gpu', '--no-first-run', `--user-data-dir=${path.join(profil, 'profil')}`, '--no-pdf-header-footer', `--print-to-pdf=${cesta}`, `file:///${h.replace(/\\/g, '/')}`], { stdio: 'ignore', timeout: 60_000 });
    // Spúšťač prehliadača skončí skôr, než proces prehliadača dopíše PDF: čakáme, kým súbor existuje a jeho veľkosť sa ustáli.
    const spi = (ms: number) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
    let predtym = -1;
    for (let k = 0; k < 120; k++) {
      const velkost = fs.existsSync(cesta) ? fs.statSync(cesta).size : -1;
      if (velkost > 0 && velkost === predtym) return;
      predtym = velkost; spi(250);
    }
    throw new Error(`PDF sa nevytvorilo: ${cesta}`);
  }
  const uprac = () => { try { fs.rmSync(profil, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 }); } catch { /* profil ešte drží proces prehliadača */ } };
  return { pdf, prehliadac, uprac };
}

/** IČO s platnou kontrolnou číslicou (váhy 8..2, modulo 11). */
export const ico = (zaklad: string) => { const s = [...zaklad].reduce((a, c, i) => a + Number(c) * (8 - i), 0); return zaklad + ((11 - (s % 11)) % 10); };
