// Spoločné pomôcky modulov: načítanie odvodených dát, dátumy, čísla, normalizácia textu.
import fs from 'node:fs';
import path from 'node:path';
import type { Doklad, Nalez, Priloha, Projekt } from '../core/typy.ts';

export const KOREN = path.join(import.meta.dirname, '..', '..');
export const VYZVA = process.env.VYZVA ?? 'PSK-SIEA-002-2023-DV-EFRR';

export function nacitajData<T>(subor: string, predvolene: T, vyzva = VYZVA): T {
  const p = path.join(KOREN, 'data', 'odvodene', vyzva, subor);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : predvolene;
}

let dokladyCache: Record<string, unknown> | null = null;
/** Účtovné doklady z ITMS21+ (doklady.json) podľa id: jeden objekt pre moduly ŽoP aj VO, načíta sa raz. */
export function uctovneDoklady<T>(): Record<string, T> { return (dokladyCache ??= nacitajData<Record<string, unknown>>('doklady.json', {})) as Record<string, T>; }

let projektyCache: Projekt[] | null = null;
export function projekty(): Projekt[] { return (projektyCache ??= nacitajData<Projekt[]>('projekty.json', [])); }
export function projektPodlaKodu(kod: string): Projekt | undefined { return projekty().find((p) => p.kod === kod); }
export function projektPodlaId(id: number): Projekt | undefined { return projekty().find((p) => p.id === id); }

/**
 * Odvodené dáta neukladajú e-mailové adresy ani telefónne čísla, ktoré sa objavia vo voľných textoch registra
 * (napr. adresa pracovníka ministerstva v popise projektu). Minimalizácia osobných údajov; pravidlá ich nepotrebujú.
 */
export const cistiKontakty = (text: string) => text
  .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[e-mail odstránený]')
  .replace(/\+421[ \d]{8,13}\d|\b09\d{2} ?\d{3} ?\d{3}\b/g, '[telefón odstránený]');
/** JSON bez kontaktov. Čistí sa každá textová hodnota zvlášť, nie surový JSON (tam by regex zjedol „n“ z „\n“). */
export const bezKontaktov = (data: unknown) => JSON.stringify(data, (_k, v) => (typeof v === 'string' ? cistiKontakty(v) : v));

/**
 * Dnešný dátum v SR (časové pásmo Europe/Bratislava; podľa UTC by po polnoci ešte platil včerajšok).
 * V testoch sa dá prepísať premennou KONTROLA_DNES (YYYY-MM-DD).
 */
export const dnes = (cas = new Date()) => process.env.KONTROLA_DNES ?? new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Bratislava' }).format(cas);
export function pridajMesiace(datum: string, mesiace: number): string {
  const d = new Date(`${datum}T12:00:00Z`); const den = d.getUTCDate();
  d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + mesiace);
  const posledny = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(den, posledny));
  return d.toISOString().slice(0, 10);
}
export function pridajDni(datum: string, dni: number): string {
  const d = new Date(`${datum}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + dni); return d.toISOString().slice(0, 10);
}
export const rozdielDni = (od: string, do_: string) => Math.round((Date.parse(`${do_}T12:00:00Z`) - Date.parse(`${od}T12:00:00Z`)) / 86_400_000);
export const skDatum = (d: string | null | undefined) => (d ? d.split('-').reverse().join('. ').replace(/^0/, '').replace(/\. 0/, '. ') : '–');

export const cislo = (n: number | null | undefined, d = 2) => (n == null || Number.isNaN(n) ? '–' : n.toLocaleString('sk-SK', { maximumFractionDigits: d }));
export const eur = (n: number | null | undefined) => (n == null ? '–' : `${cislo(n, 2)} EUR`);
export const num = (x: any): number | null => (x == null || x === '' || Number.isNaN(Number(x)) ? null : Number(x));

/** Malé písmená bez diakritiky, na hľadanie vzorov v slovenských textoch. */
export const bezDiakritiky = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Hodnota v doklade: dátum po slovensky, číslo so slovenskými oddeľovačmi, áno/nie, zoznam oddelený bodkočiarkou. */
export function textHodnoty(x: unknown): string {
  if (typeof x === 'number') return cislo(x, 4);
  if (typeof x === 'boolean') return x ? 'áno' : 'nie';
  if (typeof x === 'string') return /^\d{4}-\d{2}-\d{2}$/.test(x) ? skDatum(x) : x;
  if (Array.isArray(x)) return x.map(textHodnoty).join('; ');
  return JSON.stringify(x);
}
/** Údaj, ktorý v ITMS21+ nie je a zadal ho kontrolór vo formulári modulu. */
export const ZADANE = Symbol('zadané vo formulári');
/** Vstup kontroly: názov údaja, hodnota, s ktorou kontrola počítala, a hodnota v zázname z ITMS21+ (alebo ZADANE). */
export type VstupDokladu = [miesto: string, hodnota: unknown, povodna: unknown];
/**
 * Doklady k vstupom kontroly v moduloch. Údaj je z ITMS21+, ak sa zhoduje so záznamom z odvodených dát, inak
 * z formulára kontrolóra (zmenený alebo zadaný údaj). Pri „splnené“ musí mať doklad každý povinný vstup, inak sa
 * nevráti nič a posudok bod pošle človeku (dolozNalez); pri inom stave sú doklady informácia, uvedú sa tie, ktoré sú.
 */
export function dokladyVstupov(n: Nalez, zdroj: { itms: string; formular: string }, povinne: VstupDokladu[], volitelne: VstupDokladu[] = []): Doklad[] {
  const prazdne = (x: unknown) => x == null || x === '' || (Array.isArray(x) && !x.length);
  if (n.stav === 'splnene' && povinne.some(([, h]) => prazdne(h))) return [];
  return [...povinne, ...volitelne].filter(([, h]) => !prazdne(h)).map(([miesto, h, povodna]) => ({
    nazov: povodna !== ZADANE && JSON.stringify(h) === JSON.stringify(povodna) ? zdroj.itms : zdroj.formular, miesto, citat: textHodnoty(h) }));
}
/**
 * Deň posúdenia je údaj z hodín počítača, nie z ITMS21+ ani z formulára (audit A13). Uvádza sa len popri ostatných
 * dokladoch: sám osebe výsledok nedokladá.
 */
export const dokladDnaPosudenia = (): Doklad => ({ nazov: 'Systémový údaj aplikácie', miesto: 'Deň posúdenia (hodiny počítača, čas v SR)', citat: skDatum(dnes()) });
/** Priložené dokumenty na miestach, ktoré kontrola prešla: názov súboru a začiatok textu (prítomnosť, nie obsah). */
export function dokladyPriloh(prilohy: Record<string, Priloha> | undefined, miesta: { cislo: string; nazov: string }[]): Doklad[] {
  return miesta.flatMap((m) => {
    const pr = prilohy?.[m.cislo]; const t = pr?.text?.trim();
    return t ? [{ nazov: pr!.nazov, miesto: `miesto „${m.nazov}“, začiatok textu`, citat: t.replace(/\s+/g, ' ').slice(0, 200) }] : [];
  });
}
