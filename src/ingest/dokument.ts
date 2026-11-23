// Prevod nahratého dokumentu na text. DOCX a XLSX/XLSM čítame priamo (ZIP + XML), PDF cez pdftotext (poppler), TXT bez zmeny.
// Skenované PDF bez textovej vrstvy vrátia prázdny text: OCR je mimo rozsahu dema.
import zlib from 'node:zlib';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ChybaVstupu } from '../core/chyby.ts';

/** Poškodený alebo nepodporovaný archív ZIP. Správa je len dôvod; o aký súbor ide, doplní volajúci. */
class ChybaZipu extends ChybaVstupu {}
/** Chybu archívu vnútri DOCX alebo XLSX ohlási ako chybu toho formátu („Súbor nie je platný DOCX: …“). */
function vFormate<T>(format: string, f: () => T): T {
  try { return f(); } catch (e) { if (e instanceof ChybaZipu) throw new ChybaVstupu(`Súbor nie je platný ${format}: ${e.message}.`); throw e; }
}

/**
 * Položky ZIP archívu z centrálneho adresára; obsah sa rozbalí až na požiadanie. Poškodený archív vyhodí ChybaZipu
 * s dôvodom, nikdy nevráti menej položiek, než archív uvádza: orezaný súbor sa predtým tváril ako prázdny archív
 * („Podanie neobsahuje žiadne súbory“) a adresár mimo súboru skončil anglickým RangeError a chybou 500. Obsah položky
 * sa overí veľkosťou a súčtom CRC-32 z adresára: bez toho by sa poškodené dáta uložené bez kompresie prijali ako
 * platná príloha. ZIP64, šifrovanie a iná kompresia než deflate sa odmietnu výslovne.
 */
function zipPolozky(buf: Buffer): { nazov: string; data: () => Buffer }[] {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0 || eocd + 22 > buf.length) throw new ChybaZipu('chýba koncový záznam archívu (súbor je orezaný alebo nejde o ZIP)');
  const pocet = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  if (pocet === 0xffff || p === 0xffffffff) throw new ChybaZipu('archív vo formáte ZIP64 nie je podporovaný');
  const out: { nazov: string; data: () => Buffer }[] = [];
  for (let i = 0; i < pocet; i++) {
    const poskodeny = () => new ChybaZipu(`centrálny adresár archívu je poškodený (položka ${i + 1} z ${pocet})`);
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) throw poskodeny();
    const priznaky = buf.readUInt16LE(p + 8), metoda = buf.readUInt16LE(p + 10), crc = buf.readUInt32LE(p + 16);
    const velkost = buf.readUInt32LE(p + 20), rozbalena = buf.readUInt32LE(p + 24);
    const dlzkaMena = buf.readUInt16LE(p + 28), extra = buf.readUInt16LE(p + 30), koment = buf.readUInt16LE(p + 32), lokalna = buf.readUInt32LE(p + 42);
    if (p + 46 + dlzkaMena + extra + koment > buf.length) throw poskodeny();
    // bit 11 = názov v UTF-8; staršie archívy majú kódovú stránku DOS, tu približne latin1
    const nazov = buf.toString(priznaky & 0x800 ? 'utf8' : 'latin1', p + 46, p + 46 + dlzkaMena);
    out.push({ nazov, data: () => {
      if (priznaky & 1) throw new ChybaZipu(`položka „${nazov}“ je zašifrovaná`);
      if (metoda !== 0 && metoda !== 8) throw new ChybaZipu(`položka „${nazov}“ je komprimovaná nepodporovanou metódou (${metoda}), podporované sú len bez kompresie a deflate`);
      if (lokalna + 30 > buf.length || buf.readUInt32LE(lokalna) !== 0x04034b50) throw new ChybaZipu(`položka „${nazov}“ má poškodenú hlavičku`);
      const zaciatok = lokalna + 30 + buf.readUInt16LE(lokalna + 26) + buf.readUInt16LE(lokalna + 28);
      if (zaciatok + velkost > buf.length) throw new ChybaZipu(`položka „${nazov}“ je orezaná`);
      const d = buf.subarray(zaciatok, zaciatok + velkost);
      let data: Buffer;
      // maxOutputLength: poškodený prúd nesmie narásť nad veľkosť uvedenú v adresári.
      try { data = metoda === 0 ? d : zlib.inflateRawSync(d, { maxOutputLength: Math.max(rozbalena, 1) }); }
      catch { throw new ChybaZipu(`položka „${nazov}“ má poškodené komprimované dáta`); }
      if (data.length !== rozbalena || zlib.crc32(data) !== crc) throw new ChybaZipu(`položka „${nazov}“ je poškodená (nesedí veľkosť alebo kontrolný súčet CRC-32)`);
      return data;
    } });
    p += 46 + dlzkaMena + extra + koment;
  }
  return out;
}
/** Vytiahne jeden súbor zo ZIP archívu (stačí na DOCX). */
function zZipu(buf: Buffer, meno: string): Buffer | null {
  return zipPolozky(buf).find((x) => x.nazov === meno)?.data() ?? null;
}
/**
 * Rozbalí podanie zabalené do ZIP (napr. prílohy e-mailu); priečinky a systémové súbory vynechá. Poškodený archív
 * alebo archív bez jediného súboru vyhodí ChybaVstupu s dôvodom (bez mena archívu, to doplní volajúci).
 */
export function rozbalZip(buf: Buffer): { nazov: string; data: Buffer }[] {
  const subory = zipPolozky(buf).filter((x) => !x.nazov.endsWith('/') && !/(^|\/)(__MACOSX|\.DS_Store|Thumbs\.db)/i.test(x.nazov))
    .map((x) => ({ nazov: x.nazov.split('/').pop()!, data: x.data() }));
  if (!subory.length) throw new ChybaZipu('archív neobsahuje žiadne súbory');
  return subory;
}

export function docxNaText(buf: Buffer): string {
  const xml = vFormate('DOCX', () => zZipu(buf, 'word/document.xml'))?.toString('utf8');
  if (!xml) throw new ChybaVstupu('Súbor nie je platný DOCX.');
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
  const polozky = vFormate('zošit XLSX/XLSM', () => zipPolozky(buf));
  const subor = (meno: string) => vFormate('zošit XLSX/XLSM', () => polozky.find((x) => x.nazov === meno)?.data().toString('utf8') ?? null);
  const wb = subor('xl/workbook.xml');
  if (!wb) throw new ChybaVstupu('Súbor nie je platný zošit XLSX/XLSM.');
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
        if (hodnota.trim()) bunky.push({ adresa: c[1].match(/\br="([A-Z]+\d+)"/)?.[1] ?? '', hodnota, vzorec: vnutro.includes('<f') });
      }
      if (bunky.length) riadky.push(bunky);
    }
    harky.push({ meno, riadky });
  }
  return harky;
}
/** Hodnota bunky tak, ako je v texte zošita (xlsxNaText): zlúčené medzery, desatinné čísla na 6 miest.
 * Citát z bunky sa musí formátovať rovnako, inak ho kontrolór v náhľade „Text“ nenájde. */
export function textBunky(hodnota: string): string {
  const v = hodnota.replace(/\s+/g, ' ').trim(); const n = Number(v);
  return v && Number.isFinite(n) && !Number.isInteger(n) ? String(Math.round(n * 1e6) / 1e6) : v;
}
export function xlsxNaText(buf: Buffer): string {
  return xlsxHarky(buf).map(({ meno, riadky }) => {
    const text = riadky.map((r) => r.filter((b) => !(b.vzorec && b.hodnota.trim() === '0')).map((b) => textBunky(b.hodnota)).join(' | ')).filter(Boolean);
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
  catch (e) { const err = e as Error & { stderr?: Buffer }; throw new ChybaVstupu(`PDF sa nepodarilo prečítať (pdftotext): ${(err.stderr?.toString('utf8').trim().split('\n')[0] || err.message).slice(0, 120)}`); }
  finally { fs.rmSync(tmp, { force: true }); }
}

export function dokumentNaText(nazov: string, buf: Buffer): string {
  const pripona = path.extname(nazov).toLowerCase();
  if (pripona === '.docx') return docxNaText(buf);
  if (pripona === '.pdf') return pdfNaText(buf);
  if (pripona === '.xlsx' || pripona === '.xlsm') return xlsxNaText(buf);
  if (['.txt', '.md', '.csv', '.json'].includes(pripona)) return buf.toString('utf8').replace(/^﻿/, '');
  throw new ChybaVstupu(`Nepodporovaný formát ${pripona}. Podporované: .docx, .pdf, .xlsx, .xlsm, .txt, .json.`);
}
