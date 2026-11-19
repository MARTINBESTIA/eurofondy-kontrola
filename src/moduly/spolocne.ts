// Spoločné pomôcky modulov: načítanie odvodených dát, dátumy, čísla, normalizácia textu.
import fs from 'node:fs';
import path from 'node:path';
import type { Projekt } from '../core/typy.ts';

export const KOREN = path.join(import.meta.dirname, '..', '..');
export const VYZVA = process.env.VYZVA ?? 'PSK-SIEA-002-2023-DV-EFRR';

export function nacitajData<T>(subor: string, predvolene: T, vyzva = VYZVA): T {
  const p = path.join(KOREN, 'data', 'odvodene', vyzva, subor);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : predvolene;
}

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

/** Dnešný dátum; v testoch sa dá prepísať premennou KONTROLA_DNES (YYYY-MM-DD). */
export const dnes = () => process.env.KONTROLA_DNES ?? new Date().toISOString().slice(0, 10);
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
