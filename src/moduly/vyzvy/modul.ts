// Modul: plánovanie výziev. Vstup: výzvy a plánované výzvy Programu Slovensko z ITMS21+ (stav, kolá, verzie)
// + plán žiadateľa (kedy chce predložiť, koľko dní potrebuje na prípravu, kedy naposledy čítal dokumentáciu).
import fs from 'node:fs';
import path from 'node:path';
import type { Doklad, Modul, Nalez, Pravidlo, VysledokKontroly } from '../../core/typy.ts';
import { MAX_VEK_KONTROLY_DNI } from '../../core/zmeny.ts';
import { dnesSk } from '../../podatelna/lehoty.ts';
import { KOREN, dnes, dokladDnaPosudenia, dokladyVstupov, eur, num, rozdielDni, skDatum, ZADANE, type VstupDokladu } from '../spolocne.ts';

export interface Vyzva { kod: string; nazov: string; program: string; vyhlasovatel: string; druh: string; typ: string; zameranie: string; vyhlasena: string | null; ukoncena: string | null; uzavreta: boolean; zrusena: boolean; pozastavena: boolean; sumaEu: number | null; predlozenych: number | null; schvalenych: number | null; neschvalenych: number | null; kola: { cislo: number; uzavierka: string | null }[]; verzie: { cislo: number; datum: string | null; dovod: string }[] }
export interface Planovana { kod: string; nazov: string; program: string; vyhlasovatel: string; zameranie: string; planVyhlasenia: string | null; sumaEu: number | null; vyhlasena: boolean; zrusena: boolean }
export interface VstupVyzva { vyzva?: Vyzva; planovana?: Planovana; datumPredlozenia: string | null; dniPripravy: number | null; rezerva: number | null; datumOboznamenia: string | null }

const DATA = (() => { const p = path.join(KOREN, 'data', 'odvodene', 'vyzvy.json'); return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : { vyzvy: [], planovane: [] }; })();
const VYZVY: Vyzva[] = DATA.vyzvy; const PLANOVANE: Planovana[] = DATA.planovane;
/** Snímky plánovaných výziev (jedna za deň stiahnutia) na zistenie posunov termínu vyhlásenia. */
function snimky(): { datum: string; planovane: Planovana[] }[] {
  const dir = path.join(KOREN, 'data', 'odvodene', 'snimky-planovanych-vyziev');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort().map((f) => { const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); return { datum: f.slice(0, 10), planovane: Array.isArray(j) ? j : j.planovane ?? [] }; });
}
/** Deň, ku ktorému sa výzva posudzuje: plánované predloženie, inak dnešok (vtedy C01 a C02 nedajú „splnené“). */
const ref = (v: VstupVyzva) => v.datumPredlozenia ?? dnes();
const BEZ_DATUMU = 'Plánovaný dátum predloženia nie je zadaný';

/** Kedy sa údaje výziev stiahli z ITMS21+ (čas ISO). Exportované kvôli testu so zasadenými chybami. */
export const STIAHNUTE: { vyzvy: string | null; detaily: string | null } = { vyzvy: DATA.stiahnute ?? null, detaily: DATA.detailyStiahnute ?? null };
const denStiahnutia = (iso: string | null) => { const t = Date.parse(iso ?? ''); return Number.isFinite(t) ? dnesSk(new Date(t)) : null; };
/** Deň v SR staršieho z oboch stiahnutí (zoznam výziev a detaily s kolami a verziami); null = nedá sa určiť. */
export function stiahnuteDna(): string | null {
  const a = denStiahnutia(STIAHNUTE.vyzvy), b = denStiahnutia(STIAHNUTE.detaily);
  return a && b ? (a < b ? a : b) : null;
}
const predDnami = (n: number) => (n <= 0 ? 'dnes' : n === 1 ? 'včera' : `pred ${n} dňami`);
/**
 * Výsledok z údajov ITMS21+ uvádza ich vek. Údaje staršie ako MAX_VEK_KONTROLY_DNI alebo neznámeho veku nedajú
 * „splnené“: výzva sa medzitým mohla zmeniť, pozastaviť alebo zrušiť (obdoba bodu VER-KONTROLA pri ŽoNFP).
 */
function sVekomUdajov(r: VysledokKontroly): VysledokKontroly {
  const d = stiahnuteDna(); const vek = d ? rozdielDni(d, dnes()) : null;
  const veta = d && vek != null ? ` Údaje výzvy sú z ITMS21+ stiahnuté ${skDatum(d)} (${predDnami(vek)}).` : ' Kedy sa údaje výzvy stiahli z ITMS21+, sa nedá určiť.';
  if (r.stav === 'splnene' && (vek == null || vek > MAX_VEK_KONTROLY_DNI)) return { ...r, stav: 'na_preverenie', zdovodnenie: `${r.zdovodnenie}${veta}${vek != null ? ` Sú staršie ako ${MAX_VEK_KONTROLY_DNI} dní.` : ''} Výzva sa medzitým mohla zmeniť; overte ju v ITMS21+ alebo obnovte údaje (npm run data:vyzvy).` };
  return { ...r, zdovodnenie: `${r.zdovodnenie}${veta}` };
}

/** Najbližšia uzávierka po dátume: uzávierka kola, inak koniec výzvy. */
export function uzavierka(vz: Vyzva, od: string): { datum: string; popis: string } | null {
  const kolo = vz.kola.filter((k) => k.uzavierka && k.uzavierka >= od).sort((a, b) => a.uzavierka!.localeCompare(b.uzavierka!))[0];
  if (kolo) return { datum: kolo.uzavierka!, popis: `uzávierka ${kolo.cislo}. kola` };
  if (vz.ukoncena && vz.ukoncena >= od) return { datum: vz.ukoncena, popis: 'ukončenie výzvy' };
  return null;
}

function stav(v: VstupVyzva): VysledokKontroly {
  const vz = v.vyzva; if (!vz) return { stav: 'neuplatnuje_sa', zdovodnenie: 'Plánovaná výzva ešte nie je vyhlásená.' };
  const d = ref(v);
  if (vz.zrusena) return { stav: 'nesplnene', zdovodnenie: 'Výzva je zrušená.' };
  if (vz.pozastavena) return { stav: 'nesplnene', zdovodnenie: 'Predkladanie žiadostí do výzvy je pozastavené.' };
  if (vz.uzavreta) return { stav: 'nesplnene', zdovodnenie: 'Výzva je uzavretá.' };
  if (vz.ukoncena && vz.ukoncena < d) return { stav: 'nesplnene', zdovodnenie: `Výzva skončila ${skDatum(vz.ukoncena)}, ${v.datumPredlozenia ? `pred plánovaným predložením ${skDatum(d)}` : 'žiadosť do nej už nemožno predložiť'}.` };
  if (vz.vyhlasena && vz.vyhlasena > d) return { stav: 'na_preverenie', zdovodnenie: `Výzva bude vyhlásená až ${skDatum(vz.vyhlasena)}.` };
  const otvorena = `Výzva je ${v.datumPredlozenia ? `k plánovanému predloženiu ${skDatum(d)}` : `dnes (${skDatum(d)})`} otvorená (vyhlásená ${skDatum(vz.vyhlasena)}${vz.ukoncena ? `, do ${skDatum(vz.ukoncena)}` : ', bez dátumu ukončenia'}).`;
  // Dnešný stav nie je stavom v deň predloženia: bez dátumu nie je „splnené“.
  if (!v.datumPredlozenia) return { stav: 'mimo_podkladov', zdovodnenie: `${otvorena} ${BEZ_DATUMU}, preto sa neoverilo, či bude výzva otvorená v deň predloženia.` };
  return { stav: 'splnene', zdovodnenie: otvorena };
}

function kolo(v: VstupVyzva): VysledokKontroly {
  const vz = v.vyzva; if (!vz) return { stav: 'neuplatnuje_sa', zdovodnenie: 'Plánovaná výzva nemá uzávierky.' };
  const d = ref(v); const u = uzavierka(vz, d);
  if (!u) {
    if (!vz.ukoncena && !vz.kola.length) return { stav: 'na_preverenie', zdovodnenie: 'Výzva nemá v ITMS21+ uzávierky kôl ani dátum ukončenia (otvorená výzva); žiadosti sa posudzujú priebežne do vyčerpania alokácie.' };
    return { stav: 'nesplnene', zdovodnenie: `Po ${skDatum(d)} už nie je žiadna uzávierka.` };
  }
  const hodnoty = { uzavierka: u.datum, dni: rozdielDni(dnes(), u.datum) };
  if (!v.datumPredlozenia) return { stav: 'mimo_podkladov', zdovodnenie: `Najbližšia je ${u.popis} ${skDatum(u.datum)}, o ${hodnoty.dni} dní. ${BEZ_DATUMU}, preto sa neoverilo, do ktorej uzávierky žiadosť patrí.`, hodnoty };
  return { stav: 'splnene', zdovodnenie: `Pri predložení ${skDatum(d)} je najbližšia ${u.popis} ${skDatum(u.datum)}, o ${hodnoty.dni} dní.`, hodnoty };
}

function rezerva(v: VstupVyzva): VysledokKontroly {
  const vz = v.vyzva; if (!vz) return { stav: 'neuplatnuje_sa', zdovodnenie: 'Plánovaná výzva nemá uzávierku.' };
  if (v.dniPripravy == null) return { stav: 'mimo_podkladov', zdovodnenie: 'Nie je zadané, koľko dní potrebuje žiadateľ na prípravu žiadosti a príloh.' };
  const u = uzavierka(vz, dnes());
  if (!u) return { stav: 'mimo_podkladov', zdovodnenie: 'Výzva nemá budúcu uzávierku.' };
  const potrebne = v.dniPripravy + (v.rezerva ?? 0); const ostava = rozdielDni(dnes(), u.datum); const naviac = ostava - potrebne;
  const hodnoty = { ostava, potrebne, naviac };
  if (naviac < 0) return { stav: 'nesplnene', zdovodnenie: `Do ${u.popis} (${skDatum(u.datum)}) ostáva ${ostava} dní, príprava s rezervou potrebuje ${potrebne}. Chýba ${-naviac} dní.`, hodnoty };
  if (naviac < 7) return { stav: 'na_preverenie', zdovodnenie: `Stihne sa len tesne: rezerva ${naviac} dní do ${skDatum(u.datum)}.`, hodnoty };
  return { stav: 'splnene', zdovodnenie: `Do ${u.popis} (${skDatum(u.datum)}) ostáva ${ostava} dní, potrebných ${potrebne}, rezerva ${naviac} dní.`, hodnoty };
}

function verzia(v: VstupVyzva): VysledokKontroly {
  const vz = v.vyzva; if (!vz) return { stav: 'neuplatnuje_sa', zdovodnenie: 'Plánovaná výzva nemá verzie.' };
  const posledna = [...vz.verzie].filter((x) => x.datum).sort((a, b) => b.datum!.localeCompare(a.datum!))[0];
  const popis = posledna ? `Posledná verzia č. ${posledna.cislo} zo ${skDatum(posledna.datum)}${posledna.dovod ? ` (${posledna.dovod.slice(0, 160)})` : ''}.` : 'Výzva nemá v ITMS21+ zaznamenané zmeny.';
  if (!v.datumOboznamenia) return { stav: 'mimo_podkladov', zdovodnenie: `${popis} Nie je zadané, kedy žiadateľ naposledy čítal dokumentáciu výzvy.` };
  if (posledna && posledna.datum! > v.datumOboznamenia) return { stav: 'nesplnene', zdovodnenie: `${popis} Žiadateľ čítal dokumentáciu ${skDatum(v.datumOboznamenia)}, teda starú verziu. Treba prejsť zmeny.`, hodnoty: { posledna: posledna.datum } };
  return { stav: 'splnene', zdovodnenie: `${popis} Žiadateľ čítal dokumentáciu ${skDatum(v.datumOboznamenia)}, po poslednej zmene.` };
}

function plan(v: VstupVyzva): VysledokKontroly {
  const p = v.planovana; if (!p) return { stav: 'neuplatnuje_sa', zdovodnenie: 'Výzva je už vyhlásená.' };
  const hist = snimky().map((s) => ({ datum: s.datum, plan: s.planovane.find((x) => x.kod === p.kod)?.planVyhlasenia ?? null })).filter((x) => x.plan);
  const posuny = hist.filter((x, i) => i > 0 && x.plan !== hist[i - 1].plan).map((x, i) => `${skDatum(hist[hist.indexOf(x) - 1].plan)} → ${skDatum(x.plan)} (zistené ${skDatum(x.datum)})`);
  if (p.zrusena) return { stav: 'nesplnene', zdovodnenie: 'Plánovaná výzva je zrušená.' };
  if (p.planVyhlasenia && p.planVyhlasenia < dnes() && !p.vyhlasena) return { stav: 'na_preverenie', zdovodnenie: `Plánované vyhlásenie ${skDatum(p.planVyhlasenia)} uplynulo a výzva nie je vyhlásená.${posuny.length ? ` Posuny: ${posuny.join('; ')}.` : ''}` };
  if (posuny.length) return { stav: 'na_preverenie', zdovodnenie: `Termín vyhlásenia sa posunul: ${posuny.join('; ')}.` };
  // Z jednej snímky posun nevidno: bez porovnania nie je „splnené“.
  if (hist.length < 2) return { stav: 'mimo_podkladov', zdovodnenie: `Plánované vyhlásenie ${skDatum(p.planVyhlasenia)}. Na zistenie posunu termínu treba aspoň dve snímky plánu, výzva je ${hist.length ? 'len v jednej' : 'v žiadnej'}.`, hodnoty: { snimok: hist.length } };
  return { stav: 'splnene', zdovodnenie: `Plánované vyhlásenie ${skDatum(p.planVyhlasenia)}; v ${hist.length} snímkach plánu (${skDatum(hist[0].datum)} až ${skDatum(hist[hist.length - 1].datum)}) bez posunu.`, hodnoty: { snimok: hist.length } };
}

const FILTRE: Record<string, (v: { vyzva?: Vyzva; planovana?: Planovana }) => boolean> = {
  otvorene: (x) => !!x.vyzva && !x.vyzva.uzavreta && !x.vyzva.zrusena && (!x.vyzva.ukoncena || x.vyzva.ukoncena >= dnes()),
  planovane: (x) => !!x.planovana, zmenene: (x) => (x.vyzva?.verzie.length ?? 0) > 1,
};
const vsetky = () => [...VYZVY.map((vyzva) => ({ vyzva })), ...PLANOVANE.filter((p) => !p.vyhlasena).map((planovana) => ({ planovana }))] as { vyzva?: Vyzva; planovana?: Planovana }[];

/** Doklady k nálezom výzvy: údaje výzvy z ITMS21+ s dňom stiahnutia a plán žiadateľa z formulára. */
function dokladyVyzvy(v: VstupVyzva, n: Nalez, p: Pravidlo): Doklad[] {
  const vz = v.vyzva; const pl = v.planovana; const den = stiahnuteDna();
  const zdroj = { itms: `ITMS21+ (${den ? `stiahnuté ${skDatum(den)}` : 'deň stiahnutia neznámy'}), výzva ${(vz ?? pl)?.kod ?? ''}`, formular: 'Plán žiadateľa (formulár)' };
  const itms = (miesto: string, h: unknown): VstupDokladu => [miesto, h, h];
  const datum: VstupDokladu = ['Plánovaný dátum predloženia', v.datumPredlozenia, ZADANE];
  const uzavierkaText = (d: string) => { const u = vz && uzavierka(vz, d); return u ? `${u.popis} ${skDatum(u.datum)}` : null; };
  switch (p.kontrola) {
    case 'vyzva_stav': return vz ? dokladyVstupov(n, zdroj, [itms('Vyhlásená', vz.vyhlasena), itms('Ukončenie', vz.ukoncena ?? 'bez dátumu ukončenia'),
      itms('Zrušená, pozastavená alebo uzavretá', [vz.zrusena && 'zrušená', vz.pozastavena && 'pozastavená', vz.uzavreta && 'uzavretá'].filter(Boolean).join(', ') || 'nie'), datum]) : [];
    case 'vyzva_kolo': return vz ? dokladyVstupov(n, zdroj, [itms('Najbližšia uzávierka podľa ITMS21+', uzavierkaText(ref(v))), datum]) : [];
    case 'vyzva_rezerva': {
      if (!vz) return [];
      // Deň kontroly je z hodín počítača, nie z ITMS21+ (rovnaká chyba ako pri U03, audit A13).
      const d = dokladyVstupov(n, zdroj, [itms('Najbližšia uzávierka podľa ITMS21+', uzavierkaText(dnes())), ['Dni na prípravu žiadosti', v.dniPripravy, ZADANE]], [['Rezerva (dni)', v.rezerva, ZADANE]]);
      return d.length ? [...d, dokladDnaPosudenia()] : [];
    }
    case 'vyzva_verzia': {
      if (!vz) return [];
      const posledna = [...vz.verzie].filter((x) => x.datum).sort((a, b) => b.datum!.localeCompare(a.datum!))[0];
      return dokladyVstupov(n, zdroj, [itms('Posledná verzia výzvy', posledna ? `č. ${posledna.cislo} zo ${skDatum(posledna.datum)}` : 'bez zaznamenaných zmien'), ['Kedy žiadateľ naposledy čítal dokumentáciu', v.datumOboznamenia, ZADANE]]);
    }
    case 'vyzva_plan': {
      if (!pl) return [];
      const hist = snimky().flatMap((s) => { const d = s.planovane.find((x) => x.kod === pl.kod)?.planVyhlasenia; return d ? [`snímka ${skDatum(s.datum)}: vyhlásenie ${skDatum(d)}`] : []; });
      return dokladyVstupov(n, zdroj, [itms('Plánované vyhlásenie', pl.planVyhlasenia), itms('Snímky plánu výziev', hist)]);
    }
    default: return [];
  }
}

export const vyzvy: Modul<VstupVyzva> = {
  id: 'vyzvy', nazov: 'Plánovanie výziev', balikVyzva: 'PSK',
  popis: 'Pre žiadateľa a konzultanta: je výzva otvorená, kedy je najbližšia uzávierka, stihne sa príprava, pracuje sa s aktuálnou verziou výzvy, posunul sa termín plánovanej výzvy.',
  filtre: [{ hodnota: 'otvorene', nazov: 'Otvorené' }, { hodnota: 'planovane', nazov: 'Plánované' }, { hodnota: 'zmenene', nazov: 'Menené po vyhlásení' }],
  pripady(q, filter, limit = 80) {
    const s = q.toLowerCase();
    const v = vsetky().filter((x) => (!filter || FILTRE[filter]?.(x)) && (!s || `${(x.vyzva ?? x.planovana)!.kod} ${(x.vyzva ?? x.planovana)!.nazov} ${(x.vyzva ?? x.planovana)!.vyhlasovatel}`.toLowerCase().includes(s)));
    return { spolu: v.length, pripady: v.slice(0, limit).map((x) => { const y = (x.vyzva ?? x.planovana)!; return { id: y.kod, nazov: y.nazov, podnazov: y.vyhlasovatel, stitok: x.planovana ? `plánovaná na ${skDatum(x.planovana.planVyhlasenia)}` : x.vyzva!.zrusena ? 'zrušená' : x.vyzva!.uzavreta ? 'uzavretá' : `do ${skDatum(x.vyzva!.ukoncena)}` }; }) };
  },
  nacitaj(id) {
    const x = vsetky().find((y) => (y.vyzva ?? y.planovana)!.kod === id);
    return x ? { ...x, datumPredlozenia: null, dniPripravy: null, rezerva: null, datumOboznamenia: null } : undefined;
  },
  polia: () => [
    { kluc: 'datumPredlozenia', nazov: 'Plánovaný dátum predloženia žiadosti', typ: 'datum', napoveda: 'Bez dátumu softvér ukáže len dnešný stav výzvy a pravidlá C01 a C02 ostanú neoverené.' },
    { kluc: 'dniPripravy', nazov: 'Dni potrebné na prípravu žiadosti a príloh', typ: 'cislo', napoveda: 'Napr. energetický audit, projektová dokumentácia, uznesenie zastupiteľstva.' },
    { kluc: 'rezerva', nazov: 'Rezerva (dni), napr. na kontrolu konzultantom', typ: 'cislo' },
    { kluc: 'datumOboznamenia', nazov: 'Kedy žiadateľ naposledy čítal dokumentáciu výzvy', typ: 'datum' },
  ],
  prilohy: () => [],
  doFormulara: (v) => ({ datumPredlozenia: v.datumPredlozenia, dniPripravy: v.dniPripravy, rezerva: v.rezerva, datumOboznamenia: v.datumOboznamenia }),
  zFormulara(v, f) {
    const d = (x: any) => (typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) ? x : null);
    return { ...v, datumPredlozenia: d(f.datumPredlozenia), dniPripravy: num(f.dniPripravy), rezerva: num(f.rezerva), datumOboznamenia: d(f.datumOboznamenia) };
  },
  doklady: dokladyVyzvy,
  kontroly: {
    vyzva_stav: (v) => sVekomUdajov(stav(v)), vyzva_kolo: (v) => sVekomUdajov(kolo(v)), vyzva_rezerva: (v) => sVekomUdajov(rezerva(v)),
    vyzva_verzia: (v) => sVekomUdajov(verzia(v)), vyzva_plan: (v) => sVekomUdajov(plan(v)),
  },
  hlavnyText: () => '',
  kontext: (v) => (v.vyzva ?? v.planovana)!.nazov,
  titulok: (v) => { const y = (v.vyzva ?? v.planovana)!; return { kod: y.kod, nazov: y.nazov, podnazov: `${y.vyhlasovatel}${v.vyzva ? ` · ${v.vyzva.typ === 'UZAVRETA' ? 'uzavretá výzva (kolá)' : 'otvorená výzva'}` : ' · plánovaná výzva'}` }; },
  suhrn: (v) => v.vyzva ? `Alokácia EÚ ${eur(v.vyzva.sumaEu)} · vyhlásená ${skDatum(v.vyzva.vyhlasena)} · kolá: ${v.vyzva.kola.map((k) => `${k.cislo}. do ${skDatum(k.uzavierka)}`).join(', ') || '–'} · zmien výzvy po vyhlásení ${Math.max(0, v.vyzva.verzie.length - 1)}${v.vyzva.predlozenych != null ? ` · predložených žiadostí ${v.vyzva.predlozenych}, schválených ${v.vyzva.schvalenych ?? '–'}` : ''}`
    : `Plánované vyhlásenie ${skDatum(v.planovana!.planVyhlasenia)} · alokácia EÚ ${eur(v.planovana!.sumaEu)}`,
  vystupy(v) {
    if (!v.vyzva) return [];
    const u = uzavierka(v.vyzva, dnes());
    if (!u || v.dniPripravy == null) return [];
    const zaciatok = new Date(Date.parse(`${u.datum}T12:00:00Z`) - (v.dniPripravy + (v.rezerva ?? 0)) * 86_400_000).toISOString().slice(0, 10);
    return [{ nazov: 'Spätný plán prípravy', text: `Uzávierka: ${skDatum(u.datum)} (${u.popis})\nZačať najneskôr: ${skDatum(zaciatok)}\nRezerva pred uzávierkou: ${v.rezerva ?? 0} dní\nPred predložením skontrolovať poslednú verziu výzvy${v.vyzva.verzie.length ? ` (č. ${Math.max(...v.vyzva.verzie.map((x) => x.cislo))})` : ''}.` }];
  },
};
