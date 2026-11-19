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
/**
 * zaradenie: „potvrdene“ = číslo prílohy uviedol žiadateľ (slot v ITMS21+, číslo v názve súboru) alebo ho potvrdil kontrolór;
 * „odhad“ = softvér prílohu zaradil podľa kľúčových slov. Odhad nestačí na „splnené“. Bez údaja = potvrdené.
 */
export interface Priloha {
  nazov: string; text: string; zaradenie?: 'potvrdene' | 'odhad';
  /**
   * Jednotlivé súbory prílohy (z podateľne). Treba ich pri záväznom formulári: text slotu je zlúčený zo všetkých súborov.
   * bunky = pri zošite XLSX/XLSM hárok -> adresa (A1) -> uložená hodnota; chýba, ak sa originál nedal prečítať.
   */
  subory?: { nazov: string; text: string; citatelny: boolean; bunky?: Record<string, Record<string, string>> }[];
}

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

/** Projekt po uzavretí zmluvy (verejné API ITMS21+). Vstup modulov ukazovatele, zmeny a verejné obstarávanie. */
export interface Projekt {
  id: number; kod: string; nazov: string; vyzvaKod: string; stav: string; ukonceny: boolean;
  prijimatel: { nazov: string; ico: string; pravnaFormaKod: string; pravnaForma: string };
  zmluva: { cislo: string; ucinnost: string | null; url: string | null };
  zonfpKod: string; zonfpPredlozenie: string | null; zonfpSchvalenie: string | null;
  cov: number; nfp: number; poskytnute: number;
  planZaciatok: string | null; planKoniec: string | null; skutZaciatok: string | null; skutKoniec: string | null;
  popis: string;
  ukazovatele: Ukazovatel[];
  terminy: { typ: string; poradie: number; termin: string | null; najneskor: string | null }[];
  zmeny: { id: number; predmet: string; dodatok: string | null; ucinnost: string | null; dokumenty?: string[] }[];
  dodavatelia: { nazov: string; ico: string }[];
}

/** Pole formulára v rozhraní. Rozhranie je všeobecné: modul povie, aké polia a prílohy chce. */
export interface Pole {
  kluc: string; nazov: string; typ: 'cislo' | 'text' | 'datum' | 'vyber' | 'dlhy_text' | 'anone';
  moznosti?: { hodnota: string; nazov: string }[]; napoveda?: string;
}
export interface Pripad { id: string; nazov: string; podnazov: string; stitok?: string }
export interface VysledokKontroly { stav: Stav; zdovodnenie: string; hodnoty?: Record<string, number | string | null>; dokaz?: string }

/** Modul = jeden krok procesu (žiadosť, obstarávanie, platba, ukazovatele, zmena, plánovanie). */
export interface Modul<V = any> {
  id: string; nazov: string; popis: string;
  /** Balík pravidiel: packs/<balikVyzva>/<id>.json. Predvolene výzva z premennej VYZVA. */
  balikVyzva?: string;
  filtre?: { hodnota: string; nazov: string }[];
  pripady(q: string, filter: string, limit?: number): { spolu: number; pripady: Pripad[] };
  nacitaj(id: string): V | undefined;
  polia(v: V): Pole[];
  prilohy(v: V): { cislo: string; nazov: string }[];
  doFormulara(v: V): Record<string, any>;
  zFormulara(v: V, f: Record<string, any>): V;
  kontroly: Record<string, (v: V, p: Pravidlo) => VysledokKontroly | Promise<VysledokKontroly>>;
  hlavnyText(v: V): string;
  kontext(v: V): string;
  titulok(v: V): { kod: string; nazov: string; podnazov: string };
  suhrn?(v: V): string;
  skutocnost?(v: V): string | null;
  /** Návrhy dokumentov, ktoré modul vie predvyplniť (napr. oznámenie o zmene). */
  vystupy?(v: V, nalezy: Nalez[]): { nazov: string; text: string }[];
  /** Osobné údaje z registrov sa do auditnej tabuľky neukladajú. */
  neukladatDokazy?: boolean;
}

/** bez_zisteni len ak sa overilo všetko, čo pravidlá žiadajú; ak niečo z podkladov overiť nejde, výrok je ciastocne_overene. */
export type Navrh = 'bez_zisteni' | 'ciastocne_overene' | 'vyzva_na_doplnenie' | 'nesplnene_podmienky' | 'na_preverenie';

export interface Posudok {
  ziadostKod: string; balik: string; verziaBalika: string; cas: string; trvanieMs: number; model: string | null;
  nalezy: Nalez[]; navrh: Navrh; zhrnutie: string; pocty: Record<Stav, number>;
}
