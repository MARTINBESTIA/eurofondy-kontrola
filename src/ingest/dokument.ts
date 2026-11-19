// Prevod nahratého dokumentu na text. DOCX čítame priamo (ZIP + XML), PDF cez pdftotext (poppler), TXT bez zmeny.
// Skenované PDF bez textovej vrstvy vrátia prázdny text: OCR je mimo rozsahu dema.
import zlib from 'node:zlib';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

/** Položky ZIP archívu z centrálneho adresára; obsah sa rozbalí až na požiadanie. */
function zipPolozky(buf: Buffer): { nazov: string; data: () => Buffer }[] {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) return [];
  const pocet = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out: { nazov: string; data: () => Buffer }[] = [];
  for (let i = 0; i < pocet && buf.readUInt32LE(p) === 0x02014b50; i++) {
    const priznaky = buf.readUInt16LE(p + 8), metoda = buf.readUInt16LE(p + 10), velkost = buf.readUInt32LE(p + 20);
    const dlzkaMena = buf.readUInt16LE(p + 28), extra = buf.readUInt16LE(p + 30), koment = buf.readUInt16LE(p + 32), lokalna = buf.readUInt32LE(p + 42);
    // bit 11 = názov v UTF-8; staršie archívy majú kódovú stránku DOS, tu približne latin1
    const nazov = buf.toString(priznaky & 0x800 ? 'utf8' : 'latin1', p + 46, p + 46 + dlzkaMena);
    out.push({ nazov, data: () => {
      const zaciatok = lokalna + 30 + buf.readUInt16LE(lokalna + 26) + buf.readUInt16LE(lokalna + 28);
      const d = buf.subarray(zaciatok, zaciatok + velkost);
      return metoda === 0 ? d : zlib.inflateRawSync(d);
    } });
    p += 46 + dlzkaMena + extra + koment;
  }
  return out;
}
/** Vytiahne jeden súbor zo ZIP archívu (stačí na DOCX). */
function zZipu(buf: Buffer, meno: string): Buffer | null {
  return zipPolozky(buf).find((x) => x.nazov === meno)?.data() ?? null;
}
/** Rozbalí podanie zabalené do ZIP (napr. prílohy e-mailu); priečinky a systémové súbory vynechá. */
export function rozbalZip(buf: Buffer): { nazov: string; data: Buffer }[] {
  return zipPolozky(buf).filter((x) => !x.nazov.endsWith('/') && !/(^|\/)(__MACOSX|\.DS_Store|Thumbs\.db)/i.test(x.nazov))
    .map((x) => ({ nazov: x.nazov.split('/').pop()!, data: x.data() }));
}

export function docxNaText(buf: Buffer): string {
  const xml = zZipu(buf, 'word/document.xml')?.toString('utf8');
  if (!xml) throw new Error('Súbor nie je platný DOCX.');
  return xml
    .replace(/<w:tab\/>/g, '\t').replace(/<w:br\/>/g, '\n').replace(/<\/w:p>/g, '\n').replace(/<\/w:tc>/g, ' | ').replace(/<\/w:tr>/g, '\n')
    .replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Cesta k pdftotext (poppler). Na Windows často nie je na PATH: server spustený z PowerShellu ho nevidí, hoci
 * Git for Windows ho má v mingw64\bin. Poradie: premenná PDFTOTEXT, PATH, známe miesta inštalácie Gitu.
 */
const PDFTOTEXT: string | null = (() => {
  if (process.env.PDFTOTEXT) return process.env.PDFTOTEXT;
  const meno = process.platform === 'win32' ? 'pdftotext.exe' : 'pdftotext';
  const naPath = (process.env.PATH ?? '').split(path.delimiter).filter(Boolean).map((d) => path.join(d, meno));
  const git = process.platform === 'win32' ? [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs')]
    .filter(Boolean).map((d) => path.join(d!, 'Git', 'mingw64', 'bin', meno)) : [];
  return [...naPath, ...git].find((p) => fs.existsSync(p)) ?? null;
})();
export const pdfDostupny = () => PDFTOTEXT !== null;

export function pdfNaText(buf: Buffer): string {
  if (!PDFTOTEXT) throw new Error('PDF sa nedá prečítať: chýba program pdftotext (poppler). Nainštalujte ho alebo nastavte premennú PDFTOTEXT.');
  const tmp = path.join(os.tmpdir(), `kontrola-${process.pid}-${Date.now()}.pdf`);
  fs.writeFileSync(tmp, buf);
  // stderr zachytíme: hlášky poškodeného PDF patria do chyby súboru, nie do konzoly servera.
  try { return execFileSync(PDFTOTEXT, ['-enc', 'UTF-8', '-layout', tmp, '-'], { maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', 'pipe'] }).toString('utf8').trim(); }
  catch (e) { const err = e as Error & { stderr?: Buffer }; throw new Error(`PDF sa nepodarilo prečítať (pdftotext): ${(err.stderr?.toString('utf8').trim().split('\n')[0] || err.message).slice(0, 120)}`); }
  finally { fs.rmSync(tmp, { force: true }); }
}

export function dokumentNaText(nazov: string, buf: Buffer): string {
  const pripona = path.extname(nazov).toLowerCase();
  if (pripona === '.docx') return docxNaText(buf);
  if (pripona === '.pdf') return pdfNaText(buf);
  if (['.txt', '.md', '.csv', '.json'].includes(pripona)) return buf.toString('utf8').replace(/^﻿/, '');
  throw new Error(`Nepodporovaný formát ${pripona}. Podporované: .docx, .pdf, .txt, .json.`);
}
