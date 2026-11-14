// Spoločné typy. Jadro nevie nič o konkrétnej výzve ani o type dokumentu:
// všetko špecifické je v balíku pravidiel (packs/) a v module (src/moduly/).

export type Vysledok =
  | 'schvalena' // rozhodnutie o schválení (aj zmluva uzavretá)
  | 'zasobnik' // splnila podmienky, neschválená len pre nedostatok prostriedkov, je v zásobníku
  | 'neschvalena' // rozhodnutie o neschválení
  | 'zastavene' // rozhodnutie o zastavení konania
  | 'stiahnuta'
  | 'ina';

/** Dôvod z verejného zoznamu rozhodnutí poskytovateľa (ak je známy). */
export type Dovod = 'nedostatok_prostriedkov' | 'nesplnenie_ppp' | 'zastavenie_konania' | null;

export interface Ukazovatel { kod: string; nazov: string; typ: 'vystup' | 'vysledok'; jednotka: string; vychodisko: number | null; ciel: number | null }
export interface Aktivita { kod: string; nazov: string; hlavna: boolean; opatrenie: string | null; zaciatok: string | null; koniec: string | null }
export interface PolozkaRozpoctu { aktivita: string; hlavna: boolean; opatrenie: string | null; skupinaVydavkov: string; suma: number }
export interface Priloha { nazov: string; text: string }

/** Žiadosť o NFP v tvare, s ktorým pracujú pravidlá. Zdroj: formulár ŽoNFP (verejné API ITMS21+ alebo nahratý súbor). */
export interface Ziadost {
  id: number; kod: string; nazov: string; vyzvaKod: string;
  stav: string; vysledok: Vysledok; dovod: Dovod; kolo: number | null;
  datumPredlozenia: string | null; datumRozhodnutia: string | null;
  ziadatel: { nazov: string; ico: string; pravnaFormaKod: string; pravnaForma: string };
  miesta: { kraj: string; okres: string; obec: string; lokalita: string }[];
  kategoriaRegionov: string[];
  sumaZiadanaNFP: number; sumaZiadanaCelkova: number; sumaZiadanaVZ: number; percentoZiadane: number | null;
  dlzkaHlavnychAktivitMes: number | null; zaciatokHlavnychAktivit: string | null; koniecHlavnychAktivit: string | null;
  popis: string; ucel: string;
  opatrenia: string[];
  aktivity: Aktivita[]; rozpocet: PolozkaRozpoctu[]; ukazovatele: Ukazovatel[];
  /** Priložené prílohy: číslo prílohy ŽoNFP -> dokument. Verejné API prílohy neobsahuje, undefined = nevieme. */
  prilohy?: Record<string, Priloha>;
}

export type Stav =
  | 'splnene' // overené z podkladov, splnené
  | 'nesplnene' // overené z podkladov, nesplnené
  | 'chyba_podklad' // podklad na overenie chýba alebo je neúplný -> výzva na doplnenie
  | 'na_preverenie' // hraničný alebo nejednoznačný prípad, musí posúdiť človek
  | 'mimo_podkladov' // overuje poskytovateľ v registri alebo inom systéme, z podkladov sa nedá
  | 'neuplatnuje_sa';

export interface Citacia { dokument: string; cast: string; znenie: string }

export interface Pravidlo {
  id: string; ppp: number | null; nazov: string;
  /** data = výpočet z údajov formulára, priloha = prítomnosť prílohy, llm = dôkaz v texte hľadá model, register = mimo podkladov */
  druh: 'data' | 'priloha' | 'llm' | 'register';
  kontrola: string; // kľúč implementácie v src/moduly/<modul>/kontroly.ts
  parametre?: Record<string, any>;
  otazka?: string; // zadanie pre model (druh llm)
  citacia: Citacia;
  overenieZdroj?: string; // kde to overuje poskytovateľ (druh register)
}

export interface Nalez {
  pravidlo: string; ppp: number | null; nazov: string; druh: Pravidlo['druh']; stav: Stav;
  zdovodnenie: string; dokaz?: string; hodnoty?: Record<string, number | string | null>;
  citacia: Citacia; overenieZdroj?: string;
}

export interface BalikPravidiel {
  id: string; modul: string; vyzvaKod: string; vyzvaNazov: string; poskytovatel: string;
  verzia: string; platnaOd: string;
  zdroje: { nazov: string; subor: string; url: string; sha256?: string }[];
  proces: string[]; pravidla: Pravidlo[];
}

export type Navrh = 'bez_zisteni' | 'vyzva_na_doplnenie' | 'nesplnene_podmienky' | 'na_preverenie';

export interface Posudok {
  ziadostKod: string; balik: string; verziaBalika: string; cas: string; trvanieMs: number; model: string | null;
  nalezy: Nalez[]; navrh: Navrh; zhrnutie: string; pocty: Record<Stav, number>;
}
