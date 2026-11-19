// Prepis sankčnej kalkulačky SIEA (Príloha č. 12 Príručky pre prijímateľa DOP, verzia 3.2, hárok „Kalkulačka“).
// Bunky sú pomenované podľa tabuľky, aby sa výpočet dal porovnať riadok po riadku:
//   A = D11 zazmluvnené COV, C = D12 % z čl. 4.3 pre MU výstupu, D = D13 % z čl. 4.3 pre MU výsledku,
//   E = D14 max. % zníženia COV (výstup), F = D15 max. % zníženia COV (výsledok)
//   riadok MU: typ (stĺpec D), cieľová hodnota (E), skutočný/plánovaný stav (F), vecná podmienenosť (G)
// Poznámka k LibreOffice: ak je E34 prázdny text "", porovnanie "" > 0 je PRAVDA (text je väčší ako číslo).
// Kalkulačka počíta pomer skutočnosť / cieľ, teda predpokladá rastúci ukazovateľ.

export interface RiadokMU { kod: string; typ: 'výstup' | 'výsledok'; ciel: number; skutocnost: number; podmienenost?: boolean }
export interface VstupKalkulacky { A: number; C: number | null; D: number | null; E: number | null; F: number | null; riadky: RiadokMU[] }
export interface VysledokKalkulacky {
  H: (number | null)[]; I: (number | null)[]; J: (number | null)[];
  E32: number | null; F32: number | null; E33: number | null; F33: number | null;
  E34: number | '' | null; F34: number | '' | null; E35: number | string | null; F35: number | string | null;
}

const ODSTUPENIE = 'odstúpenie od Zmluvy o poskytnutý NFP';
const MOZNOST_MAX = 'možnosť odstúpiť od Zmluvy o poskytnutí NFP, resp. udelenie maximálnej sankcie';
const MOZNOST = 'možnosť odstúpiť od Zmluvy o poskytnutí NFP';

const priemer = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function kalkulacka(v: VstupKalkulacky): VysledokKalkulacky {
  const r = v.riadky;
  const pomer = (x: RiadokMU) => x.skutocnost / x.ciel;
  // H: percento naplnenia MU
  const H = r.map((x) => (pomer(x) > 1 ? 100 : x.podmienenost ? 100 : pomer(x) * 100));
  // I: percento naplnenia MU výsledku bez vplyvu podmienenosti
  const I = r.map((x) => (pomer(x) > 1 ? 100 : x.typ === 'výsledok' ? pomer(x) * 100 : null));
  const vystupy = r.map((x, i) => [x, i] as const).filter(([x]) => x.typ === 'výstup');
  const E32 = priemer(vystupy.map(([, i]) => H[i]));
  const E33 = v.C == null || v.E == null ? null : v.E / (95 - v.C);
  // E34: percento zníženia COV pre výstupy
  let E34: number | '' | null;
  if (E32 == null || v.C == null) E34 = null;
  else if (vystupy.some(([, i]) => H[i] > 0 && H[i] < v.C!)) E34 = '';
  else if (E32 < v.C) E34 = '';
  else if (E32 >= 95) E34 = 0;
  else E34 = E33 == null ? null : E33 * (95 - E32);
  // J: výsledné percento naplnenia MU (pre výsledky zohľadní podmienenosť od výstupu)
  const vysledkyI = r.map((x, i) => [x, i] as const).filter(([x]) => x.typ === 'výsledok').map(([, i]) => I[i] as number);
  const priemerI = priemer(vysledkyI);
  const J = r.map((x) => {
    if (pomer(x) > 1) return 100;
    if (priemerI != null && v.D != null && priemerI < v.D) return pomer(x) * 100;
    const e34Kladne = E34 === '' || (typeof E34 === 'number' && E34 > 0); // "" > 0 je v LibreOffice pravda
    if (x.podmienenost && e34Kladne) return 100;
    return pomer(x) * 100;
  });
  const vysledky = r.map((x, i) => [x, i] as const).filter(([x]) => x.typ === 'výsledok');
  const F32 = priemer(vysledky.map(([, i]) => J[i]));
  const F33 = v.D == null || v.F == null ? null : v.F / (95 - v.D);
  let F34: number | '' | null;
  if (F32 == null || v.D == null) F34 = null;
  else if (F32 < v.D) F34 = '';
  else if (F32 >= 95) F34 = 0;
  else F34 = F33 == null ? null : F33 * (95 - F32);
  // E35/F35: finančné krátenie COV
  let E35: number | string | null = null;
  if (E32 != null && v.C != null) {
    const podPrahom = vystupy.filter(([, i]) => H[i] < v.C!).length;
    if (vystupy.length && podPrahom === vystupy.length) E35 = ODSTUPENIE;
    else if (vystupy.some(([, i]) => H[i] > 0 && H[i] < v.C!)) E35 = MOZNOST_MAX;
    else if (E32 < v.C) E35 = MOZNOST_MAX;
    else E35 = typeof E34 === 'number' ? (E34 * v.A) / 100 : null;
  }
  let F35: number | string | null = null;
  if (F32 != null && v.D != null) F35 = F32 < v.D ? MOZNOST : typeof F34 === 'number' ? (F34 * v.A) / 100 : null;
  return { H, I, J, E32, F32, E33, F33, E34, F34, E35, F35 };
}
