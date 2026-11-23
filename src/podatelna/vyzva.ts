// Návrh výzvy na doplnenie ŽoNFP z nálezov posledného posudku. Softvér len zostaví text, nič neukladá ani neodosiela:
// kontrolór ho skontroluje, upraví a odošle sám do elektronickej schránky žiadateľa.
// Obsah podľa Metodického usmernenia MIRRI č. 21 ku konaniu o ŽoNFP (v1.0), kap. 2.4:
//  ods. 3  výzva uvádza konkrétnu overovanú PPP;
//  ods. 4  pri chýbajúcej prílohe sa žiada príloha, nie vysvetlenie jej obsahu;
//  ods. 5  lehota najmenej päť pracovných dní odo dňa doručenia výzvy;
//  ods. 6  výzva má byť úplná, aby nebola potrebná ďalšia;
//  ods. 7 až 11  spôsob doplnenia (ITMS21+, označenie „doplnenie“, úprava formulára, doplnenie nad rámec výzvy);
//  ods. 14 a § 17 ods. 2 zákona č. 121/2022 Z. z.  konanie možno zastaviť, len ak bol žiadateľ o tom poučený;
//  ods. 16 výzva sa nevyžaduje, ak sa nedostatok nedá napraviť (rozhoduje a odôvodňuje kontrolór).
import type { BalikPravidiel, Nalez, Posudok, Pravidlo, Stav } from '../core/typy.ts';

export const MIN_LEHOTA = 5;

/**
 * Lehoty, ktoré text výzvy stanovuje vetou „do N pracovných dní“ (aj s číslom slovom v zátvorke, napr. „do 10 (desiatich)
 * pracovných dní“). Iné spomenuté lehoty, napr. „v lehote najmenej 10 pracovných dní“ pri zmene výzvy, nie sú lehotou
 * tejto výzvy. Text bez takej vety vráti prázdny zoznam.
 */
export function lehotyVTexte(text: string): number[] {
  return [...new Set([...text.matchAll(/(?<![\p{L}\p{N}])do\s+(\d{1,3})\s*(?:\([^)]{0,40}\)\s*)?pracovn\p{L}*\s+d[nň]/giu)].map((m) => Number(m[1])))];
}

export interface PolozkaVyzvy {
  /** Kľúč výberu: pravidlá spojené „+“ (napr. P08+P08b, keď oba body čakajú na tú istú prílohu). */
  id: string;
  pravidla: string[];
  ppp: number[];
  /** Nadpis položky vo výzve: číslo a názov PPP z inventára balíka. */
  podmienka: string;
  stav: Stav;
  /** Názov kontrolného bodu pre kontrolóra. */
  nazov: string;
  zistenie: string;
  poziadavka: string;
  /** Kde je podmienka vo výzve (citácia pravidla). */
  zdroj: string;
  /** Nesplnené a chýbajúce podklady áno, body na preverenie najprv posúdi kontrolór. */
  predvolene: boolean;
  /** Len pre kontrolóra, do textu výzvy nejde. */
  upozornenie: string | null;
}

export interface UdajeVyzvy {
  posudok: Posudok;
  /** Verzia balíka, ktorou posudok vznikol (názvy PPP, prílohy, podmienky doručenia). */
  balik: BalikPravidiel;
  spis: { cislo: string; kod: string | null; nazov: string | null; ziadatel: string | null; ico: string | null };
  sloty: { cislo: string; nazov: string }[];
}

export interface NavrhVyzvy {
  polozky: PolozkaVyzvy[];
  vybrane: string[];
  lehota: number;
  /** Text výzvy z vybraných položiek; prázdny, keď nie je vybraná žiadna. */
  text: string;
  /** Krátky zápis do poznámky rozhodnutia kontrolóra. */
  poznamka: string;
  /** Čo v návrhu nie je a prečo (pre kontrolóra). */
  upozornenia: string[];
}

const OTVORENE: Stav[] = ['nesplnene', 'chyba_podklad', 'na_preverenie'];
const PORADIE: Partial<Record<Stav, number>> = { nesplnene: 0, chyba_podklad: 1, na_preverenie: 2 };
const ZAKON = 'zákona č. 121/2022 Z. z. o príspevkoch z fondov Európskej únie a o zmene a doplnení niektorých zákonov v znení neskorších predpisov';
const skDatum = (iso: string) => new Date(iso).toLocaleDateString('sk-SK');

/** Zdôvodnenie nálezu bez poznámok pre kontrolóra (sporné miesta, sken, vypnuté podpisy, zdroj textu, náhrada prílohy). */
export const zistenieDoVyzvy = (z: string) => z.split(/ (?=Sporné:|Treba pozrieť sken|Formálne náležitosti sa nekontrolovali|Náhrada:|\(zdroj:)/)[0].trim();

/** Položky výzvy z otvorených nálezov a upozornenia, čo do návrhu nepatrí. Každý otvorený nález je v jednej položke alebo v upozornení. */
export function polozkyVyzvy(d: UdajeVyzvy): { polozky: PolozkaVyzvy[]; upozornenia: string[] } {
  const { posudok: p, balik } = d;
  const pravidlo = (id: string): Pravidlo | undefined => balik.pravidla.find((r) => r.id === id);
  const cisloPrilohy = (n: Nalez) => { const c = pravidlo(n.pravidlo)?.parametre?.cislo; return c == null ? null : String(c); };
  const pritomnost = (n: Nalez) => pravidlo(n.pravidlo)?.kontrola === 'priloha_povinna';
  // Doručenie riadne a včas sa nerieši výzvou na doplnenie, ale osobitným oznámením (MD č. 21, kap. 2.3 ods. 9).
  const dorucenie = new Set((balik.podmienky ?? []).filter((x) => x.typ === 'dorucenie').flatMap((x) => x.pravidla));
  const otvorene = p.nalezy.filter((n) => OTVORENE.includes(n.stav));
  const kandidati = otvorene.filter((n) => n.druh !== 'rucne' && n.druh !== 'verzia' && !dorucenie.has(n.pravidlo));

  // Bod, ktorý čaká na tú istú prílohu ako bod jej prítomnosti (napr. súlad zošita s rozpočtom), ide do jednej položky:
  // žiadateľ má doložiť prílohu, vysvetlenie jej obsahu sa pri chýbajúcej prílohe žiadať nemá (kap. 2.4 ods. 4).
  const hlavne = new Map<string, Nalez>();
  for (const n of kandidati) if (pritomnost(n) && cisloPrilohy(n)) hlavne.set(`${n.stav}|${cisloPrilohy(n)}`, n);
  const skupiny = new Map<Nalez, Nalez[]>();
  for (const n of kandidati) {
    const h = !pritomnost(n) && cisloPrilohy(n) ? hlavne.get(`${n.stav}|${cisloPrilohy(n)}`) : undefined;
    if (h) skupiny.set(h, [...(skupiny.get(h) ?? []), n]);
    else if (!skupiny.has(n)) skupiny.set(n, []);
  }

  const nazovPpp = (c: number) => { const x = balik.podmienky?.find((m) => m.typ === 'ppp' && m.ppp === c); return x ? `PPP č. ${c} – ${x.nazov}` : `PPP č. ${c}`; };
  const prilohu = (cislo: string) => {
    const r = balik.pravidla.find((x) => x.kontrola === 'priloha_povinna' && String(x.parametre?.cislo) === cislo);
    const slot = d.sloty.find((s) => s.cislo === cislo);
    const nazov = r ? r.nazov.replace(/\s+je priložená$/, '') : slot ? `Príloha č. ${cislo} ŽoNFP – ${slot.nazov}` : `Príloha č. ${cislo} ŽoNFP`;
    return nazov.replace(/\s*\([^()]*\)$/, '').replace(/^Príloha/, 'Prílohu');
  };

  const polozky = [...skupiny].map(([n, pridruzene]): PolozkaVyzvy => {
    const vsetky = [n, ...pridruzene];
    const ppp = [...new Set(vsetky.map((x) => x.ppp).filter((x): x is number => x != null))].sort((a, b) => a - b);
    const cislo = cisloPrilohy(n);
    const upozornenie = [
      n.stav === 'nesplnene' ? 'Výzva má zmysel, len ak sa nedostatok dá odstrániť doplnením alebo vysvetlením. Ak sa napraviť nedá (napr. podmienka mala byť splnená k dňu v minulosti), položku vynechajte a nesplnenie odôvodnite v rozhodnutí (MD č. 21, kap. 2.4 ods. 16).' : '',
      n.stav === 'na_preverenie' ? 'Bod najprv posúďte sami. Do výzvy ho zaraďte, len ak pochybnosť o úplnosti alebo pravdivosti žiadosti trvá.' : '',
      pridruzene.length ? `Zahŕňa aj ${pridruzene.length === 1 ? 'bod, ktorý závisí' : 'body, ktoré závisia'} od tej istej prílohy: ${pridruzene.map((x) => `${x.pravidlo} „${x.nazov}“`).join('; ')}.` : '',
    ].filter(Boolean).join(' ');
    return {
      id: vsetky.map((x) => x.pravidlo).join('+'), pravidla: vsetky.map((x) => x.pravidlo), ppp,
      podmienka: ppp.length ? ppp.map(nazovPpp).join('; ') : n.nazov,
      stav: n.stav, nazov: n.nazov, zistenie: zistenieDoVyzvy(n.zdovodnenie),
      poziadavka: poziadavka(n, pravidlo(n.pravidlo), cislo ? prilohu(cislo) : null),
      zdroj: `${n.citacia.dokument}, ${n.citacia.cast}`,
      predvolene: n.stav !== 'na_preverenie', upozornenie: upozornenie || null,
    };
  });
  const prvaPpp = (x: PolozkaVyzvy) => x.ppp[0] ?? Infinity;
  polozky.sort((a, b) => prvaPpp(a) - prvaPpp(b) || (PORADIE[a.stav] ?? 9) - (PORADIE[b.stav] ?? 9));

  const upozornenia: string[] = [];
  const zDorucenia = otvorene.filter((n) => dorucenie.has(n.pravidlo)).map((n) => n.pravidlo);
  if (zDorucenia.length) upozornenia.push(`Zistenie k doručeniu žiadosti (${zDorucenia.join(', ')}) do výzvy na doplnenie nepatrí. Pochybnosti o predložení riadne a včas poskytovateľ oznámi osobitne, najviac raz a s lehotou najmenej 5 pracovných dní; ak ich žiadateľ neodstráni, konanie zastaví podľa § 17 ods. 1 písm. c) (MD č. 21, kap. 2.3 ods. 9 a 11).`);
  const verzia = otvorene.filter((n) => n.druh === 'verzia').map((n) => n.pravidlo);
  if (verzia.length) upozornenia.push(`Posudok má bod k zneniu výzvy (${verzia.join(', ')}). Pred odoslaním overte, že požiadavky vychádzajú zo znenia, ktoré sa na žiadosť vzťahuje.`);
  // Podmienky overované až pred zmluvou alebo počas realizácie (okamih) do výzvy v konaní o ŽoNFP nepatria.
  const sami = p.nalezy.filter((n) => (n.okamih ?? 'konanie') === 'konanie' && ((n.druh === 'rucne' && OTVORENE.includes(n.stav)) || n.stav === 'mimo_podkladov')).map((n) => n.pravidlo);
  if (sami.length) upozornenia.push(`Body, ktoré overujete sami alebo ktoré softvér neoveril, v návrhu nie sú (${sami.join(', ')}). Ak pri ich overení zistíte pochybnosť, doplňte ich do textu: výzva má byť úplná (MD č. 21, kap. 2.4 ods. 6).`);
  if (!p.model) upozornenia.push('Posudok vznikol bez lokálneho modelu, obsah príloh (napr. náležitosti plnomocenstva) sa nečítal.');
  if (p.formalne === false) upozornenia.push('Podpisy sa pri posúdení nekontrolovali. Ak niektorý dokument nie je riadne podpísaný, doplňte to do výzvy.');
  return { polozky, upozornenia };
}

/** Čo má žiadateľ urobiť. priloha = názov prílohy v 4. páde („Prílohu č. 6 ŽoNFP – …“), ak sa bod týka prílohy. */
function poziadavka(n: Nalez, r: Pravidlo | undefined, priloha: string | null): string {
  const zavazny = r?.parametre?.zavaznyFormular?.popis as string | undefined;
  const nahrada = r?.parametre?.nahrada as string | undefined;
  if (n.stav === 'chyba_podklad') {
    if (r?.kontrola === 'priloha_povinna' && priloha) return zavazny
      ? `Predložte ${priloha} ako ${zavazny} a vyplňte v ňom všetky povinné údaje.`
      : `Predložte ${priloha} v úplnej a čitateľnej podobe.${nahrada ? ` Namiesto nej môžete uviesť ${nahrada}.` : ''}`;
    if (n.druh === 'llm' && priloha) return `Predložte ${priloha} v úplnej a čitateľnej podobe.`;
    if (n.druh === 'data') return 'Doplňte chýbajúce údaje vo formulári ŽoNFP.';
    return 'Doplňte podklady uvedené v zistení.';
  }
  if (n.stav === 'nesplnene') {
    if (n.druh === 'llm' && priloha) return `Predložte ${priloha} upravenú tak, aby obsahovala uvedené náležitosti.`;
    if (n.druh === 'data') return 'Vysvetlite zistený nesúlad. Ak sú údaje vo formulári ŽoNFP chybné, opravte ich a doložte podklady, z ktorých vychádzajú.';
    return 'Odstráňte zistený nedostatok alebo vysvetlite, ako je podmienka splnená, a doložte podklady.';
  }
  if (priloha) return `Vysvetlite skutočnosť uvedenú v zistení, prípadne predložte ${priloha} v upravenej podobe.`;
  if (n.druh === 'data') return 'Vysvetlite skutočnosť uvedenú v zistení, prípadne opravte údaje vo formulári ŽoNFP a doložte podklady.';
  return 'Vysvetlite skutočnosť uvedenú v zistení a doložte podklady, ktoré ju preukazujú.';
}

/** Text výzvy. Údaje, ktoré softvér nepozná (číslo listu, adresa, podpis), ostanú v hranatých zátvorkách. */
export function textVyzvy(d: UdajeVyzvy, polozky: PolozkaVyzvy[], lehota: number): string {
  if (!polozky.length) return '';
  const { posudok: p, balik, spis: s } = d;
  return [
    `[NÁVRH – zostavil ho softvér predkontroly z posudku zo dňa ${skDatum(p.cas)} (spis ${s.cislo}). Pred odoslaním ho skontrolujte, doplňte údaje v hranatých zátvorkách a tento riadok odstráňte.]`, '',
    balik.poskytovatel, 'Naše číslo: [doplniť]', 'Dátum: [doplniť]', '',
    `Žiadateľ: ${s.ziadatel ?? '[názov žiadateľa]'}${s.ico ? `, IČO ${s.ico}` : ''}`, '[adresa sídla žiadateľa]', '',
    'Vec: Výzva na doplnenie žiadosti o nenávratný finančný príspevok', '',
    `Kód žiadosti: ${s.kod ?? '[kód ŽoNFP]'}`, `Názov projektu: ${s.nazov ?? '[názov projektu]'}`, `Výzva: ${balik.vyzvaKod} – ${balik.vyzvaNazov}`, '',
    'Poskytovateľ pri administratívnom overovaní žiadosti o nenávratný finančný príspevok (ďalej len „ŽoNFP“) zistil pochybnosti o úplnosti alebo pravdivosti ŽoNFP, pre ktoré nemožno overiť splnenie alebo určiť nesplnenie podmienok poskytnutia príspevku (ďalej len „PPP“) uvedených nižšie. Preto Vás vyzýva na doplnenie ŽoNFP v tomto rozsahu:', '',
    ...polozky.flatMap((x, i) => [`${i + 1}. ${x.podmienka}`, `   Zistenie: ${x.zistenie}`, `   Požadujeme: ${x.poziadavka}`, `   Podmienka vo výzve: ${x.zdroj}`, '']),
    'Lehota a spôsob doplnenia',
    `Doplnenie predložte do ${lehota} pracovných dní odo dňa doručenia tejto výzvy. Prvým dňom lehoty je najbližší pracovný deň nasledujúci po dni doručenia.`,
    'Doplnené náležitosti zašlite prostredníctvom ITMS21+. Za deň ich doručenia sa považuje deň odoslania do neverejnej časti ITMS21+.',
    'Doplnené alebo upravené prílohy označte v názve slovom „doplnenie“.',
    'Ak meníte alebo dopĺňate údaje vo formulári ŽoNFP, urobte zmeny vo verejnej časti ITMS21+ a upravenú ŽoNFP predložte znova cez ITMS21+ a zároveň do elektronickej schránky poskytovateľa, rovnako ako pri riadnom predložení ŽoNFP.',
    'Ak ŽoNFP doplníte aj nad rámec tejto výzvy, v odpovedi uveďte, aké úpravy ste urobili, z akých dôvodov a ktorých častí ŽoNFP sa týkajú.',
    'O predĺženie lehoty môžete požiadať odôvodnenou žiadosťou počas jej plynutia. Zmeškanie lehoty nemožno odpustiť.', '',
    'Poučenie',
    `Ak v určenej lehote nedoplníte žiadne náležitosti, doplnenie doručíte po lehote alebo ak aj po doplnení budú pretrvávať pochybnosti o pravdivosti alebo úplnosti ŽoNFP, poskytovateľ môže konanie o ŽoNFP zastaviť podľa § 17 ods. 2 ${ZAKON}. Ak poskytovateľ po doplnení zistí nesplnenie niektorej z PPP, vydá rozhodnutie o neschválení ŽoNFP.`,
    'Lehota na vydanie rozhodnutia sa zaslaním tejto výzvy prerušuje a znova plynie odo dňa nasledujúceho po dni doručenia doplnenia.', '',
    '[meno, priezvisko a funkcia oprávnenej osoby poskytovateľa]', '[podpis]',
  ].join('\n');
}

/** Návrh výzvy pre rozhranie. vyber = id položiek (bez neho predvolené), lehota v pracovných dňoch (najmenej 5). */
export function navrhVyzvy(d: UdajeVyzvy, volby: { vyber?: string[]; lehota?: number } = {}): NavrhVyzvy {
  const lehota = volby.lehota ?? MIN_LEHOTA;
  if (!Number.isInteger(lehota) || lehota < MIN_LEHOTA) throw new Error(`Lehota na doplnenie musí byť celý počet pracovných dní, najmenej ${MIN_LEHOTA} (MD č. 21, kap. 2.4 ods. 5).`);
  const { polozky, upozornenia } = polozkyVyzvy(d);
  const vybrane = polozky.filter((x) => (volby.vyber ? volby.vyber.includes(x.id) : x.predvolene));
  const poznamka = vybrane.length ? [`Výzva na doplnenie, lehota ${lehota} pracovných dní od doručenia:`,
    ...vybrane.map((x, i) => `${i + 1}. ${x.ppp.length ? x.ppp.map((c) => `PPP č. ${c}`).join(', ') : x.nazov}: ${x.poziadavka}`)].join('\n') : '';
  return { polozky, vybrane: vybrane.map((x) => x.id), lehota, text: textVyzvy(d, vybrane, lehota), poznamka, upozornenia };
}
