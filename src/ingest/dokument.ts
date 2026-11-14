// Prevod nahratého dokumentu na text. DOCX čítame priamo (ZIP + XML), PDF cez pdftotext (poppler), TXT bez zmeny.
// Skenované PDF bez textovej vrstvy vrátia prázdny text: OCR je mimo rozsahu dema.
import zlib from 'node:zlib';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

/** Vytiahne jeden súbor zo ZIP archívu (stačí na DOCX). */
function zZipu(buf: Buffer, meno: string): Buffer | null {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) return null;
  const pocet = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let i = 0; i < pocet && buf.readUInt32LE(p) === 0x02014b50; i++) {
    const metoda = buf.readUInt16LE(p + 10), velkost = buf.readUInt32LE(p + 20);
    const dlzkaMena = buf.readUInt16LE(p + 28), extra = buf.readUInt16LE(p + 30), koment = buf.readUInt16LE(p + 32), lokalna = buf.readUInt32LE(p + 42);
    const nazov = buf.toString('utf8', p + 46, p + 46 + dlzkaMena);
    if (nazov === meno) {
      const zaciatok = lokalna + 30 + buf.readUInt16LE(lokalna + 26) + buf.readUInt16LE(lokalna + 28);
      const data = buf.subarray(zaciatok, zaciatok + velkost);
      return metoda === 0 ? data : zlib.inflateRawSync(data);
    }
    p += 46 + dlzkaMena + extra + koment;
  }
  return null;
}

export function docxNaText(buf: Buffer): string {
  const xml = zZipu(buf, 'word/document.xml')?.toString('utf8');
  if (!xml) throw new Error('Súbor nie je platný DOCX.');
  return xml
    .replace(/<w:tab\/>/g, '\t').replace(/<w:br\/>/g, '\n').replace(/<\/w:p>/g, '\n').replace(/<\/w:tc>/g, ' | ').replace(/<\/w:tr>/g, '\n')
    .replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function pdfNaText(buf: Buffer): string {
  const tmp = path.join(os.tmpdir(), `kontrola-${process.pid}-${Date.now()}.pdf`);
  fs.writeFileSync(tmp, buf);
  try { return execFileSync('pdftotext', ['-enc', 'UTF-8', '-layout', tmp, '-'], { maxBuffer: 64 << 20 }).toString('utf8').trim(); }
  catch (e) { throw new Error(`PDF sa nepodarilo prečítať (pdftotext): ${(e as Error).message.slice(0, 120)}`); }
  finally { fs.rmSync(tmp, { force: true }); }
}

export function dokumentNaText(nazov: string, buf: Buffer): string {
  const pripona = path.extname(nazov).toLowerCase();
  if (pripona === '.docx') return docxNaText(buf);
  if (pripona === '.pdf') return pdfNaText(buf);
  if (['.txt', '.md', '.csv'].includes(pripona)) return buf.toString('utf8');
  throw new Error(`Nepodporovaný formát ${pripona}. Podporované: .docx, .pdf, .txt.`);
}
