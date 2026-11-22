// Text zdrojových dokumentov balíkov. Ku každému stiahnutému súboru (DOCX, PDF) patrí text v najbližšom priečinku txt/
// smerom nahor (scripts/00-zdroje-na-text.ts). Archívna verzia výzvy má vlastný txt/, aby sa rovnako pomenované
// prílohy rôznych znení neprepísali.
import fs from 'node:fs';
import path from 'node:path';

const KOREN = path.join(import.meta.dirname, '..', '..');
const ZDROJE = path.join(KOREN, 'data', 'zdroje');

/** Absolútna cesta k textu zdrojového súboru (cesta relatívna ku koreňu projektu), alebo null, ak text nie je. */
export function cestaTextuZdroja(subor: string): string | null {
  const meno = path.basename(subor).replace(/\.[a-z0-9]+$/i, '.txt');
  for (let dir = path.dirname(path.join(KOREN, subor)); dir.startsWith(ZDROJE); dir = path.dirname(dir)) {
    const t = path.join(dir, 'txt', meno);
    if (fs.existsSync(t)) return t;
    if (dir === ZDROJE) break;
  }
  return null;
}

/** Normalizácia na porovnanie citácie so zdrojom: úvodzovky, pomlčky a medzery (aj oddeľovače tabuliek „|“). */
export const normCitacie = (s: string) => s.replace(/[„“”"]/g, '"').replace(/[–—]/g, '-').replace(/[\s|•]+/g, ' ').trim();

/**
 * Časti citácie, ktoré musia byť v zdroji doslovne: „[...]“ a „…“ oddeľujú vynechané miesta. Poznámky pod čiarou
 * („[Pozn. N:] …“) extrakcia textu nezachytí, preto sa vynechajú.
 */
export const castiCitacie = (znenie: string) => znenie.replace(/\[Pozn\. \d+:\](?:(?!\[Pozn\.)[\s\S])*/g, ' [...] ')
  .split(/\[\s*(?:\.{3}|…)\s*\]|…/).map(normCitacie).filter(Boolean);

/** Zdroj citácie podľa celého názvu alebo skratky (balíky modulov citujú skrátene, napr. „VZP verzia 2.2“). */
export const zdrojCitacie = <Z extends { nazov: string; skratka?: string }>(zdroje: Z[], dokument: string): Z | undefined =>
  zdroje.find((z) => z.nazov === dokument || z.skratka === dokument);
