// Overenie dátumov zo vstupov (formulár žiadosti, formuláre modulov). Bez závislostí, používa jadro aj kontroly modulov.

/**
 * Deň RRRR-MM-DD na začiatku údaja (napr. „2025-09-19“ alebo „2025-09-19T10:21:00“), ak je to skutočný kalendárny deň;
 * inak null. JavaScript „2025-09-31“ ticho posunie na 1. 10., preto sa deň overí spätným prevodom.
 */
export function denZDatumu(s: string | null | undefined): string | null {
  const m = typeof s === 'string' ? /^(\d{4}-\d{2}-\d{2})(?:$|[T ])/.exec(s) : null;
  if (!m) return null;
  const t = Date.parse(`${m[1]}T00:00:00Z`);
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === m[1] ? m[1] : null;
}
