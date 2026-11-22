// Lehota na doplnenie ŽoNFP v pracovných dňoch a kalendár dní pracovného pokoja v SR.
// Pravidlá podľa MD č. 21:
// - kap. 2.4 ods. 5: lehota najmenej 5 pracovných dní od doručenia výzvy; prvým dňom je najbližší pracovný deň
//   po doručení; doplnenie je včas, ak je v posledný deň lehoty odoslané do neverejnej časti ITMS21+;
// - kap. 2.4 ods. 8: predĺženie na odôvodnenú žiadosť počas lehoty; zmeškanie nemožno odpustiť;
// - kap. 2.2 ods. 5: výzva sa doručuje do e-schránky do vlastných rúk s fikciou doručenia; doručená je potvrdením
//   doručenky alebo uplynutím 15-dňovej úložnej lehoty, podľa toho, čo nastane skôr.
// Výsledok je zámerne opatrný. „Včas“ platí pri každom možnom dni doručenia aj pri každom neistom sviatku.
// „Po lehote“ softvér povie len pri známom dni doručenia. Všetko medzi tým ide kontrolórovi na preverenie.

/** Kalendárny deň v SR v tvare RRRR-MM-DD, bez času. */
export type Den = string;

/**
 * Overený rozsah kalendára: zákon č. 241/1993 Z. z. v znení k 29. 10. 2026 (posledná zmena č. 256/2026 Z. z.),
 * overené 22. 11. 2026. Mimo rozsahu sú neisté dni, ktorých postavenie sa v posledných rokoch menilo.
 */
export const KALENDAR = { od: 2024, do: 2027, overene: '2026-11-22' } as const;
/** Úložná lehota e-schránky v kalendárnych dňoch od dňa nasledujúceho po uložení správy (MD č. 21, kap. 2.2 ods. 5). */
export const ULOZNA_LEHOTA = 15;

const MS_DEN = 86_400_000;
const naMs = (d: Den) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)));
const zMs = (t: number): Den => new Date(t).toISOString().slice(0, 10);
export const pridajDni = (d: Den, n: number): Den => zMs(naMs(d) + n * MS_DEN);
/** Platný kalendárny deň RRRR-MM-DD (odmietne napr. 2026-02-30). */
export const jeDen = (s: unknown): s is Den => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && zMs(naMs(s)) === s;
/** Dnešný deň v SR (časové pásmo Europe/Bratislava). Podľa UTC by po polnoci ešte platil včerajšok. */
export const dnesSk = (cas = new Date()): Den => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Bratislava' }).format(cas);
export const skDen = (d: Den) => `${Number(d.slice(8, 10))}. ${Number(d.slice(5, 7))}. ${d.slice(0, 4)}`;
const kratkyDen = (d: Den) => `${Number(d.slice(8, 10))}. ${Number(d.slice(5, 7))}.`;
const zostavaText = (n: number) => (n === 1 ? 'zostáva 1 pracovný deň' : n >= 2 && n <= 4 ? `zostávajú ${n} pracovné dni` : `zostáva ${n} pracovných dní`);
const max = (a: Den, b: Den) => (a > b ? a : b);

/** Veľkonočná nedeľa v gregoriánskom kalendári (anonymný gregoriánsky algoritmus). */
export function velkonocnaNedela(rok: number): Den {
  const a = rok % 19, b = Math.floor(rok / 100), c = rok % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mesiac = Math.floor((h + l - 7 * m + 114) / 31), den = ((h + l - 7 * m + 114) % 31) + 1;
  return `${rok}-${String(mesiac).padStart(2, '0')}-${String(den).padStart(2, '0')}`;
}

// Dni pracovného pokoja, ktoré sa nemenili: § 1 písm. a) až c) a § 2 ods. 2 zákona č. 241/1993 Z. z.
const PEVNE = new Set(['01-01', '01-06', '05-01', '07-05', '08-29', '11-01', '12-24', '12-25', '12-26']);
// Dni, ktorých postavenie sa menilo. V overených rokoch platí pravidlo, mimo nich je deň neistý.
const MENIACE_SA: Record<string, (rok: number) => boolean> = {
  '05-08': (r) => r !== 2026, // § 2 ods. 2 písm. j) a § 4b: v roku 2026 nie je dňom pracovného pokoja
  '09-15': (r) => r !== 2026, // § 2 ods. 2 písm. e) a § 4b
  '09-01': (r) => r < 2024, // § 2 ods. 3: Deň Ústavy nie je dňom pracovného pokoja (1. 9. 2024 bola nedeľa)
  '11-17': (r) => r < 2025, // § 2 ods. 3 v znení zákona č. 261/2025 Z. z., účinného od 1. 11. 2025
};

export type TypDna = 'pracovny' | 'pokoj' | 'neisty';
export function typDna(d: Den): TypDna {
  const tyzden = new Date(naMs(d)).getUTCDay();
  if (tyzden === 0 || tyzden === 6) return 'pokoj';
  const rok = Number(d.slice(0, 4)), md = d.slice(5);
  if (PEVNE.has(md)) return 'pokoj';
  const nedela = velkonocnaNedela(rok);
  if (d === pridajDni(nedela, -2) || d === pridajDni(nedela, 1)) return 'pokoj'; // Veľký piatok, Veľkonočný pondelok
  const pravidlo = MENIACE_SA[md];
  if (!pravidlo) return 'pracovny';
  if (rok < KALENDAR.od || rok > KALENDAR.do) return 'neisty';
  return pravidlo(rok) ? 'pokoj' : 'pracovny';
}

/** Neistý deň sa počíta ako pracovný (skorší koniec lehoty) alebo ako voľný (neskorší koniec). */
type Neisty = 'pracovny' | 'volny';
const jePracovny = (d: Den, neisty: Neisty) => { const t = typDna(d); return t === 'pracovny' || (t === 'neisty' && neisty === 'pracovny'); };

/** Posledný deň lehoty: N-tý pracovný deň po dni doručenia (prvým dňom je najbližší pracovný deň po doručení). */
export function koniecLehoty(dorucenie: Den, dni: number, neisty: Neisty = 'volny'): Den {
  let d = dorucenie;
  for (let n = 0; n < dni;) { d = pridajDni(d, 1); if (jePracovny(d, neisty)) n++; }
  return d;
}

/**
 * N-tý pracovný deň pred dňom d (deň d sa nepočíta), napr. lehota „najneskôr 30 dní pred predložením ŽoP“,
 * keď zmluva o NFP za dni považuje pracovné dni. Neistý deň sa počíta ako pracovný (neskorší výsledok) alebo voľný.
 */
export function pracovnyDenPred(d: Den, dni: number, neisty: Neisty = 'volny'): Den {
  let x = d;
  for (let n = 0; n < dni;) { x = pridajDni(x, -1); if (jePracovny(x, neisty)) n++; }
  return x;
}

/** Neisté dni v intervale (od, do]. */
export function neisteDni(od: Den, po: Den): Den[] {
  const out: Den[] = [];
  for (let d = pridajDni(od, 1); d <= po; d = pridajDni(d, 1)) if (typDna(d) === 'neisty') out.push(d);
  return out;
}

export interface UdajeLehoty {
  /** Deň uloženia výzvy do elektronickej schránky žiadateľa. */
  odoslana: Den;
  /** Deň doručenia z elektronickej doručenky; null = zatiaľ nezadaný. */
  dorucena: Den | null;
  lehotaDni: number;
  /** Posledný deň lehoty po predĺžení (ods. 8); null = lehota nebola predĺžená. */
  predlzeneDo: Den | null;
}
/** Dávka podkladov doručená po výzve a deň jej odoslania do ITMS21+ (null = kontrolór ho nezadal). */
export interface Doplnenie { davka: number; odoslane: Den | null }
export type VysledokDoplnenia = 'vcas' | 'neiste' | 'po_lehote';
export type KodLehoty = 'plynie' | 'mozno_uplynula' | 'uplynula' | 'doplnene_vcas' | 'doplnene_neiste' | 'doplnene_po_lehote';
export type Uroven = 'ok' | 'info' | 'pozor' | 'chyba';
export interface StavLehoty {
  kod: KodLehoty;
  uroven: Uroven;
  /** Krátky štítok do zoznamu spisov. */
  kratko: string;
  sprava: string;
  /** Posledný deň lehoty, ak je istý (známe doručenie a overený kalendár). */
  koniec: Den | null;
  /** Najskorší a najneskorší možný posledný deň lehoty. */
  koniecNajskor: Den;
  koniecNajneskor: Den;
  /** Deň, keď uplynie úložná lehota: najneskorší možný deň doručenia. */
  fikcia: Den;
  /** Pracovné dni lehoty od dneška vrátane, ak lehota plynie a jej koniec je istý. */
  zostava: number | null;
  doplnenia: (Doplnenie & { vysledok: VysledokDoplnenia })[];
  upozornenia: string[];
}

/** Stav lehoty k dňu `dnes`. Neistota (doručenie, sviatky, predĺženie) rozširuje interval konca lehoty. */
export function stavLehoty(v: UdajeLehoty, doplnenia: Doplnenie[], dnes: Den): StavLehoty {
  const upozornenia: string[] = [];
  const dovody: string[] = [];
  const fikcia = pridajDni(v.odoslana, ULOZNA_LEHOTA);
  // Interval možných dní doručenia: bez doručenky od dňa uloženia po uplynutie úložnej lehoty.
  let dorOd = v.odoslana, dorDo = fikcia;
  if (v.dorucena && v.dorucena < v.odoslana) {
    upozornenia.push(`Dátum doručenia ${skDen(v.dorucena)} je skôr ako odoslanie výzvy ${skDen(v.odoslana)}, preto sa nepoužil. Opravte ho podľa elektronickej doručenky.`);
  } else if (v.dorucena && v.dorucena > fikcia) {
    upozornenia.push(`Dátum doručenia ${skDen(v.dorucena)} je neskôr ako uplynutie úložnej lehoty ${skDen(fikcia)}. Výzva sa považuje za doručenú najneskôr v tento deň (MD č. 21, kap. 2.2 ods. 5). Overte dátum odoslania aj doručenky.`);
    dorOd = fikcia; dorDo = v.dorucena;
  } else if (v.dorucena) dorOd = dorDo = v.dorucena;
  const znameDorucenie = dorOd === dorDo;
  if (!znameDorucenie) dovody.push(v.dorucena ? 'dátum doručenia nesedí s odoslaním výzvy' : 'chýba dátum doručenia z elektronickej doručenky');

  let najskor = koniecLehoty(dorOd, v.lehotaDni, 'pracovny');
  let najneskor = koniecLehoty(dorDo, v.lehotaDni, 'volny');
  if (v.predlzeneDo) {
    if (v.predlzeneDo <= najskor) upozornenia.push(`Predĺženie do ${skDen(v.predlzeneDo)} nekončí neskôr ako pôvodná lehota, preto ju nemení.`);
    najskor = max(najskor, v.predlzeneDo);
    let posun = v.predlzeneDo;
    while (!jePracovny(posun, 'volny')) posun = pridajDni(posun, 1);
    if (posun !== v.predlzeneDo) {
      upozornenia.push(`Predĺžená lehota končí v deň pracovného pokoja ${skDen(v.predlzeneDo)}. Či sa koniec posúva na ${skDen(posun)}, závisí od znenia predĺženia. Softvér počíta s oboma dňami.`);
      dovody.push('predĺžená lehota končí v deň pracovného pokoja');
    }
    najneskor = max(najneskor, posun);
  }
  const neiste = neisteDni(dorOd, najneskor);
  if (neiste.length) {
    upozornenia.push(`Kalendár dní pracovného pokoja je overený pre roky ${KALENDAR.od} až ${KALENDAR.do} (stav k ${skDen(KALENDAR.overene)}). Či sú pracovnými dňami ${neiste.map(skDen).join(', ')}, overte v zákone č. 241/1993 Z. z.`);
    dovody.push('kalendár sviatkov pre tento rok nie je overený');
  }
  const koniec = najskor === najneskor ? najskor : null;
  const lehotaText = koniec ? `do ${skDen(koniec)}` : `najskôr do ${skDen(najskor)}, najneskôr do ${skDen(najneskor)}`;
  const preco = dovody.length ? ` Dôvod: ${dovody.join('; ')}.` : '';

  const vysledok = (d: Doplnenie): VysledokDoplnenia => !d.odoslane ? 'neiste'
    : d.odoslane <= najskor ? 'vcas' : znameDorucenie && d.odoslane > najneskor ? 'po_lehote' : 'neiste';
  const stavy = doplnenia.map((d) => ({ ...d, vysledok: vysledok(d) }));
  // Dávka 1 je podanie, dávka N je doplnenie č. N − 1 (rovnako ako v zozname podkladov spisu).
  for (const d of stavy) {
    if (!d.odoslane) upozornenia.push(`Pri doplnení č. ${d.davka - 1} chýba deň odoslania do ITMS21+. Bez neho sa nedá určiť, či prišlo včas.`);
    else if (d.odoslane < v.odoslana) upozornenia.push(`Doplnenie č. ${d.davka - 1} má deň odoslania ${skDen(d.odoslane)} skôr ako výzva. Overte dátum.`);
  }
  const dni = (zoz: typeof stavy) => zoz.map((d) => (d.odoslane ? skDen(d.odoslane) : 'bez dátumu')).join(', ');
  const zaklad = { koniec, koniecNajskor: najskor, koniecNajneskor: najneskor, fikcia, doplnenia: stavy, upozornenia };

  if (stavy.length) {
    const neskoro = stavy.filter((d) => d.vysledok === 'po_lehote'), vcas = stavy.filter((d) => d.vysledok === 'vcas');
    if (vcas.length === stavy.length) return { ...zaklad, kod: 'doplnene_vcas', uroven: 'ok', kratko: 'doplnené včas', zostava: null,
      sprava: `Doplnenie prišlo včas: odoslané do ITMS21+ ${dni(stavy)}, lehota trvala ${koniec ? `do ${skDen(koniec)}` : `najmenej do ${skDen(najskor)}`}.` };
    if (neskoro.length) return { ...zaklad, kod: 'doplnene_po_lehote', uroven: 'chyba', kratko: 'doplnené po lehote', zostava: null,
      sprava: `Doplnenie odoslané ${dni(neskoro)} prišlo po lehote, ktorá uplynula ${koniec ? skDen(koniec) : `najneskôr ${skDen(najneskor)}`}. Zmeškanie lehoty nemožno odpustiť (MD č. 21, kap. 2.4 ods. 8).`
        + (vcas.length ? ` Včas prišlo doplnenie odoslané ${dni(vcas)}.` : '')
        + ' Ak bez včas doplnených podkladov nemožno overiť splnenie niektorej PPP, poskytovateľ môže konanie zastaviť (ods. 14).' };
    return { ...zaklad, kod: 'doplnene_neiste', uroven: 'pozor', kratko: 'doplnenie: overte lehotu', zostava: null,
      sprava: `Nedá sa isto určiť, či doplnenie prišlo včas. Odoslané do ITMS21+ ${dni(stavy)}, lehota trvala ${lehotaText}.${preco}` };
  }
  if (dnes <= najskor) {
    let zostava: number | null = null;
    if (koniec) { zostava = 0; for (let d = max(dnes, pridajDni(dorOd, 1)); d <= koniec; d = pridajDni(d, 1)) if (jePracovny(d, 'volny')) zostava++; }
    return { ...zaklad, kod: 'plynie', uroven: 'info', kratko: koniec ? `lehota do ${kratkyDen(koniec)}` : 'lehota plynie', zostava,
      sprava: koniec ? (dnes === koniec ? `Dnes je posledný deň lehoty (${skDen(koniec)}).` : `Lehota plynie do ${skDen(koniec)} vrátane, ${zostavaText(zostava!)}.`)
        : `Lehota plynie. Pri doručení v deň odoslania je posledným dňom ${skDen(najskor)}, pri neskoršom doručení neskôr, najneskôr ${skDen(najneskor)}.${preco}` };
  }
  if (dnes > najneskor && znameDorucenie) return { ...zaklad, kod: 'uplynula', uroven: 'pozor', kratko: 'lehota uplynula', zostava: null,
    sprava: `Lehota uplynula ${koniec ? skDen(koniec) : `najneskôr ${skDen(najneskor)}`} a v spise nie je doplnenie. Overte v ITMS21+, či ho žiadateľ neodoslal. Ak nie a bez doplnenia nemožno overiť splnenie niektorej PPP, poskytovateľ môže konanie zastaviť podľa § 17 ods. 2 zákona č. 121/2022 Z. z. (MD č. 21, kap. 2.4 ods. 14).` };
  return { ...zaklad, kod: 'mozno_uplynula', uroven: 'pozor', kratko: 'lehota možno uplynula', zostava: null,
    sprava: (dnes > najneskor
      ? `Lehota pravdepodobne uplynula: aj pri doručení ${dorDo === fikcia ? `posledným dňom úložnej lehoty (${skDen(fikcia)})` : skDen(dorDo)} by skončila ${skDen(najneskor)}.`
      : `Lehota mohla uplynúť. Trvá ${lehotaText}.`) + `${preco} V spise zatiaľ nie je doplnenie.` };
}
