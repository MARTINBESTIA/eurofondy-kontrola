// Prevod nahratého dokumentu na text. DOCX a XLSX/XLSM čítame priamo (ZIP + XML), PDF cez pdftotext (poppler), TXT bez zmeny.
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

const xmlText = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&amp;/g, '&');
/**
 * XLSX/XLSM (napr. záväzný zošit Prílohy č. 8 ŽoNFP) -> text: viditeľné hárky v poradí zošita, riadok po riadku,
 * bunky oddelené " | ". Pri vzorcoch sa berie hodnota, ktorú Excel uložil pri poslednom prepočte; vzorce s výsledkom
 * 0 alebo prázdnym sa vynechajú (zošit ich má stovky a text by bol len šum). Makrá sa nespúšťajú, čítame len XML.
 */
type BunkaXlsx = { adresa: string; hodnota: string; vzorec: boolean };
/** Hárky zošita v poradí zošita (skryté len na požiadanie): riadky buniek s adresou (A1), uloženou hodnotou a príznakom vzorca. */
function xlsxHarky(buf: Buffer, ajSkryte = false): { meno: string; riadky: BunkaXlsx[][] }[] {
  const polozky = zipPolozky(buf);
  const subor = (meno: string) => polozky.find((x) => x.nazov === meno)?.data().toString('utf8') ?? null;
  const wb = subor('xl/workbook.xml');
  if (!wb) throw new Error('Súbor nie je platný zošit XLSX/XLSM.');
  const rels = new Map([...(subor('xl/_rels/workbook.xml.rels') ?? '').matchAll(/<Relationship\b[^>]*>/g)]
    .map((m) => [m[0].match(/Id="([^"]+)"/)?.[1], m[0].match(/Target="([^"]+)"/)?.[1]] as const));
  const zdielane = [...(subor('xl/sharedStrings.xml') ?? '').matchAll(/<si>([\s\S]*?)<\/si>/g)]
    .map((m) => xmlText([...m[1].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join('')));
  const harky: { meno: string; riadky: BunkaXlsx[][] }[] = [];
  for (const h of wb.matchAll(/<sheet\b[^>]*>/g)) {
    if (!ajSkryte && /state="(hidden|veryHidden)"/.test(h[0])) continue;
    const meno = xmlText(h[0].match(/name="([^"]*)"/)?.[1] ?? '');
    const ciel = rels.get(h[0].match(/r:id="([^"]+)"/)?.[1]);
    const xml = ciel ? subor(`xl/${ciel.replace(/^\/?xl\//, '')}`) : null;
    if (!xml) continue;
    const riadky: BunkaXlsx[][] = [];
    for (const r of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      const bunky: BunkaXlsx[] = [];
      for (const c of r[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const typ = c[1].match(/t="(\w+)"/)?.[1]; const vnutro = c[2] ?? '';
        const v = vnutro.match(/<v>([\s\S]*?)<\/v>/)?.[1];
        const hodnota = typ === 's' ? zdielane[Number(v)] ?? '' : typ === 'inlineStr' ? xmlText(vnutro.replace(/<[^>]+>/g, '')) : typ === 'b' ? (v === '1' ? 'PRAVDA' : 'NEPRAVDA') : v !== undefined ? xmlText(v) : '';
        const t = hodnota.replace(/\s+/g, ' ').trim();
        if (t) bunky.push({ adresa: c[1].match(/\br="([A-Z]+\d+)"/)?.[1] ?? '', hodnota: t, vzorec: vnutro.includes('<f') });
      }
      if (bunky.length) riadky.push(bunky);
    }
    harky.push({ meno, riadky });
  }
  return harky;
}
export function xlsxNaText(buf: Buffer): string {
  const cislo = (v: string) => { const n = Number(v); return Number.isFinite(n) && !Number.isInteger(n) ? String(Math.round(n * 1e6) / 1e6) : v; };
  return xlsxHarky(buf).map(({ meno, riadky }) => {
    const text = riadky.map((r) => r.filter((b) => !(b.vzorec && b.hodnota === '0')).map((b) => cislo(b.hodnota)).join(' | ')).filter(Boolean);
    return text.length ? `=== Hárok: ${meno} ===\n${text.join('\n')}` : '';
  }).filter(Boolean).join('\n\n');
}
/**
 * Bunky viditeľných hárkov: hárok -> adresa (A1) -> uložená hodnota (pri vzorci výsledok posledného prepočtu, aj 0).
 * Pre deterministické kontroly záväzných formulárov: v texte sa stratí poloha stĺpcov, tu nie. ajSkryte: aj skryté hárky (číselníky vzoru).
 */
export function xlsxBunky(buf: Buffer, ajSkryte = false): Record<string, Record<string, string>> {
  return Object.fromEntries(xlsxHarky(buf, ajSkryte).map(({ meno, riadky }) => [meno, Object.fromEntries(riadky.flat().filter((b) => b.adresa).map((b) => [b.adresa, b.hodnota]))]));
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
  if (pripona === '.xlsx' || pripona === '.xlsm') return xlsxNaText(buf);
  if (['.txt', '.md', '.csv', '.json'].includes(pripona)) return buf.toString('utf8').replace(/^﻿/, '');
  throw new Error(`Nepodporovaný formát ${pripona}. Podporované: .docx, .pdf, .xlsx, .xlsm, .txt, .json.`);
}
