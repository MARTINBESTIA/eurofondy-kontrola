// Modul: žiadosť o platbu (ŽoP). Vstup: ŽoP z ITMS21+ s výdavkami a účtovnými dokladmi; prílohy (faktúra,
// výpis z účtu, súpis prác...) nahrá používateľ, lebo verejné API ich nezverejňuje.
import type { Doklad as Podklad, Modul, Nalez, Pravidlo, Priloha, Projekt, VysledokKontroly } from '../../core/typy.ts';
import { dokladyUryvkov, najdiVTexte, type Nalezitost } from '../../core/posud.ts';
import { cislo, dokladyPriloh, dokladyVstupov, eur, nacitajData, num, pridajMesiace, projektPodlaId, skDatum, uctovneDoklady, ZADANE, type VstupDokladu } from '../spolocne.ts';

export interface Vydavok { id: number; poradie: number; nazov: string; druh: string; typ: string; datumUhrady: string | null; bezDph: number | null; dph: number | null; ziadana: number | null; neziadana: number; polozkaRozpoctuId: number | null; dokladId: number | null; voIds: number[]; zmluvaVoIds: number[] }
export interface ZopZaznam { id: number; kod: string; typ: string; zaverecna: boolean; narokovana: number | null; neuhradena: boolean | null; vytvorena: string | null; projektId: number; projektKod: string; prijimatel: { nazov: string; ico: string; platitelDph: boolean | null }; vydavky: Vydavok[] }
export interface Doklad { id: number; cislo: string; nazov: string; typ: string; celkom: number | null; datumVyhotovenia: string | null; datumUhrady: string | null; vlastnik: { nazov: string; ico: string; platitelDph: boolean | null }; dodavatel: { nazov: string; ico: string | null; platitelDph: boolean | null } | null; polozky: { bezDph: number | null; dph: number | null; sadzba: number | null; spolu: number | null }[] }
export interface VoZaznam { id: number; kod: string; nazov: string; stav: string; phz: number | null; postup: string; zmluvy: { id: number; suma: number | null; dodavatel: { nazov: string; ico: string | null } | null }[] }

export interface VstupZop {
  zop: ZopZaznam; projekt: Projekt | undefined;
  hotovostMax: number | null; hotovostMesiac: number | null; hotovostMajetok: '' | 'ano' | 'nie';
  voKontrola: '' | 'ano' | 'nie';
  prilohy?: Record<string, Priloha>;
  __bezModelu?: boolean;
}

export const VSETKY_ZOP = nacitajData<ZopZaznam[]>('zop.json', []);
/** Exportované kvôli testu so zasadenými chybami (vkladá syntetické doklady so zápornými id). */
export const DOKLADY = uctovneDoklady<Doklad>();
const VO = new Map(nacitajData<VoZaznam[]>('vo.json', []).map((v) => [v.id, v]));
const ZMLUVY = new Map([...VO.values()].flatMap((v) => v.zmluvy.map((z) => [z.id, { ...z, vo: v }] as const)));
const podlaKodu = new Map(VSETKY_ZOP.map((z) => [z.kod, z]));
export const doklad = (id: number | null) => (id == null ? undefined : DOKLADY[String(id)]);

/** Nárok na peniaze vzniká refundáciou a predfinancovaním; zúčtovanie predfinancovania ten istý doklad len vyúčtuje. */
const rodina = (typ: string) => (typ.startsWith('ZUCTOVANIE') ? 'zuctovanie' : 'narok');
const ZNENIE_ROD: Record<string, string> = { narok: 'refundácia alebo predfinancovanie', zuctovanie: 'zúčtovanie' };
const STAVEBNE = /stavebn|zateplen|výmen|vykur|osvetlen|strech|plášť|obnov|rekonštruk|debarier|vetran|fotovolt|tepeln|kotol|okn|konštrukci/i;
const jeStavebny = (v: Vydavok) => STAVEBNE.test(v.nazov) || STAVEBNE.test(doklad(v.dokladId)?.nazov ?? '');
const datumVzniku = (v: Vydavok) => doklad(v.dokladId)?.datumVyhotovenia ?? null;
const datumPlatby = (v: Vydavok) => v.datumUhrady ?? doklad(v.dokladId)?.datumUhrady ?? null;
const r2 = (x: number) => Math.round(x * 100) / 100;
/** „výdavku č. 1“ alebo „výdavkoch č. 1, č. 2“ (najviac 10 a počet ďalších). */
const priVydavkoch = (z: string[]) => `${z.length === 1 ? 'výdavku' : 'výdavkoch'} ${z.slice(0, 10).join(', ')}${z.length > 10 ? ` a ďalších ${z.length - 10}` : ''}`;
/** Súčet žiadaných súm výdavkov do dokladu; nezadanú sumu uvedie výslovne (nie je nula). */
const sumaNaroku = (ys: Vydavok[]) => {
  const bez = ys.filter((y) => y.ziadana == null).length;
  const s = eur(r2(ys.reduce((a, y) => a + (y.ziadana ?? 0), 0)));
  return bez === ys.length ? 'žiadaná suma nezadaná' : bez ? `${s} a ${bez}× žiadaná suma nezadaná` : s;
};

function obdobie(v: VstupZop): VysledokKontroly {
  // Hranice programu (vznik od 1. 1. 2021, úhrada do 31. 12. 2029) sa kontrolujú vždy; okno hlavných aktivít len ak ho projekt má.
  const p = v.projekt; const ha = !!(p?.planZaciatok && p.planKoniec);
  const koniecPodpornych = ha ? pridajMesiace(p!.planKoniec!, 3) : null;
  const zle: string[] = []; const mimoHA: string[] = []; let neznamy = 0;
  for (const x of v.zop.vydavky) {
    const vznik = datumVzniku(x); const platba = datumPlatby(x);
    if (platba && platba > '2029-12-31') { zle.push(`č. ${x.poradie} uhradený ${skDatum(platba)} po 31. 12. 2029`); continue; }
    if (!vznik) { neznamy++; continue; }
    if (vznik < '2021-01-01') zle.push(`č. ${x.poradie} vznik ${skDatum(vznik)} pred 1. 1. 2021`);
    else if (ha && (vznik < p!.planZaciatok! || vznik > koniecPodpornych!)) mimoHA.push(`č. ${x.poradie} (${x.nazov}) doklad z ${skDatum(vznik)}`);
  }
  const hodnoty = { vydavkov: v.zop.vydavky.length, mimoHA: mimoHA.length, bezDatumu: neznamy };
  if (zle.length) return { stav: 'nesplnene', zdovodnenie: `Výdavky mimo oprávneného obdobia: ${zle.join('; ')}.`, hodnoty };
  if (mimoHA.length) return { stav: 'na_preverenie', zdovodnenie: `Doklad vystavený mimo realizácie hlavných aktivít (${skDatum(p!.planZaciatok)} – ${skDatum(p!.planKoniec)}, pre podporné aktivity + 3 mesiace): ${mimoHA.slice(0, 8).join('; ')}${mimoHA.length > 8 ? ` a ďalších ${mimoHA.length - 8}` : ''}. Oprávnené len ako podporná aktivita alebo po schválenej zmene harmonogramu.`, hodnoty };
  if (!v.zop.vydavky.length) return { stav: 'neuplatnuje_sa', zdovodnenie: 'ŽoP nemá výdavky (napr. zálohová platba).' };
  if (neznamy) return { stav: 'na_preverenie', zdovodnenie: `${neznamy} výdavkov nemá dátum dokladu, ostatné sú v oprávnenom období.`, hodnoty };
  if (!ha) return { stav: 'mimo_podkladov', zdovodnenie: 'Výdavky sú v období programu (od 1. 1. 2021, úhrada do 31. 12. 2029), projekt však nemá v dátach termíny hlavných aktivít, okno realizácie sa neoverilo.', hodnoty };
  // Dátum úhrady, ktorý v dátach chýba, sa netvrdí: overené je len to, že žiadna známa úhrada nie je po 31. 12. 2029.
  const bezUhrady = v.zop.vydavky.filter((x) => !datumPlatby(x)).length;
  return { stav: 'splnene', zdovodnenie: `Všetkých ${v.zop.vydavky.length} výdavkov má doklad z obdobia realizácie hlavných aktivít${bezUhrady ? ` a žiadna známa úhrada nie je po 31. 12. 2029 (dátum úhrady v dátach chýba pri ${bezUhrady} výdavkoch)` : ' a úhradu do 31. 12. 2029'}.`, hodnoty };
}

function sumy(v: VstupZop): VysledokKontroly {
  const zle: string[] = []; const naDoklad = new Map<number, number>(); let bez = 0;
  // Neznáma suma sa nepočíta ako nula ani sa ticho nevynechá: taký výdavok alebo doklad ostane neoverený.
  // Nezadaná žiadaná suma (prázdne pole formulára, nie výslovná nula) ide kontrolórovi: bez nej sa nárok neoveril.
  const neovereny: string[] = []; const nezadane: string[] = [];
  for (const x of v.zop.vydavky) {
    if (x.ziadana == null) { nezadane.push(`č. ${x.poradie}`); continue; }
    if (x.bezDph == null) neovereny.push(`výdavok č. ${x.poradie} bez výšky výdavku`);
    else if (x.ziadana > x.bezDph + (x.dph ?? 0) + 0.01) zle.push(`č. ${x.poradie}: žiadané ${eur(x.ziadana)} > výška výdavku ${eur(x.bezDph + (x.dph ?? 0))}`);
    if (x.dokladId != null) naDoklad.set(x.dokladId, (naDoklad.get(x.dokladId) ?? 0) + x.ziadana); else bez++;
  }
  for (const [id, s] of naDoklad) {
    const d = doklad(id);
    if (d?.celkom == null) neovereny.push(`doklad ${d?.cislo ?? `id ${id}`} bez sumy v dátach`);
    else if (s > d.celkom + 0.01) zle.push(`doklad ${d.cislo}: v tejto ŽoP žiadané ${eur(r2(s))} > suma dokladu ${eur(d.celkom)}`);
  }
  const nezadaneText = nezadane.length ? ` Žiadaná suma nie je zadaná pri ${priVydavkoch(nezadane)}; tie sa neoverili.` : '';
  if (zle.length) return { stav: 'nesplnene', zdovodnenie: `${zle.slice(0, 10).join('; ')}.${nezadaneText}` };
  if (!v.zop.vydavky.length) return { stav: 'neuplatnuje_sa', zdovodnenie: 'ŽoP nemá výdavky.' };
  if (nezadane.length) return { stav: 'na_preverenie', zdovodnenie: `Žiadaná suma nie je zadaná pri ${priVydavkoch(nezadane)}, preto sa nedá overiť, či neprevyšuje výšku výdavku a sumu dokladu. Nezadaná suma nie je nula; ak sa výdavok nežiada, zadajte 0.${bez ? ` ${bez} výdavkov nemá priradený účtovný doklad.` : ''}${neovereny.length ? ` Neoverené aj: ${neovereny.slice(0, 6).join('; ')}.` : ''}` };
  if (bez) return { stav: 'na_preverenie', zdovodnenie: `${bez} výdavkov nemá priradený účtovný doklad.${neovereny.length ? ` Neoverené: ${neovereny.slice(0, 8).join('; ')}.` : ''}` };
  if (neovereny.length) return { stav: 'mimo_podkladov', zdovodnenie: `Ostatné žiadané sumy neprevyšujú výšku výdavkov ani sumy dokladov. Neoverené pre chýbajúcu sumu: ${neovereny.slice(0, 8).join('; ')}${neovereny.length > 8 ? ` a ďalších ${neovereny.length - 8}` : ''}.` };
  return { stav: 'splnene', zdovodnenie: `Žiadané sumy neprevyšujú výšku výdavkov ani sumy ${naDoklad.size} dokladov.` };
}

function duplicita(v: VstupZop): VysledokKontroly {
  const ostatne = VSETKY_ZOP.filter((z) => z.kod !== v.zop.kod);
  const zle: string[] = []; const preverit: string[] = []; const bezSumy: string[] = []; const nezadane: string[] = [];
  const mojeDoklady = new Set(v.zop.vydavky.map((x) => x.dokladId).filter((x): x is number => x != null));
  const rod = rodina(v.zop.typ);
  for (const id of mojeDoklady) {
    const d = doklad(id);
    const mojeX = v.zop.vydavky.filter((x) => x.dokladId === id);
    const ine = ostatne.filter((z) => rodina(z.typ) === rod).flatMap((z) => z.vydavky.filter((x) => x.dokladId === id).map((x) => ({ z, x })));
    if (!ine.length) continue;
    // Nezadaná žiadaná suma nie je nula: známe sumy sa sčítajú (prekročenie platí aj tak), súlad sa však nepotvrdí.
    const chybaSuma = [...mojeX.filter((x) => x.ziadana == null).map((x) => `výdavok č. ${x.poradie} tejto ŽoP`), ...ine.filter((a) => a.x.ziadana == null).map((a) => `výdavok č. ${a.x.poradie} ŽoP ${a.z.kod}`)];
    const moje = mojeX.reduce((s, x) => s + (x.ziadana ?? 0), 0);
    const spolu = moje + ine.reduce((s, a) => s + (a.x.ziadana ?? 0), 0);
    const kde = [...new Set(ine.map((a) => `${a.z.kod}${a.z.neuhradena === false ? ' (uhradená)' : a.z.neuhradena ? ' (neuhradená)' : ''}`))].join(', ');
    const spoluText = `${eur(r2(spolu))}${chybaSuma.length ? ' bez nezadaných súm' : ''}`;
    // Doklad bez sumy sa nevynechá: je nárokovaný aj inde a či spolu neprevyšuje jeho hodnotu, sa nedá overiť.
    if (d?.celkom == null) { bezSumy.push(`doklad ${d?.cislo ?? `id ${id}`} (suma nie je v dátach): spolu žiadané ${spoluText}, aj v ŽoP ${kde}`); continue; }
    const veta = `doklad ${d.cislo} (${eur(d.celkom)}): spolu žiadané ${spoluText}, aj v ŽoP ${kde}`;
    if (spolu <= d.celkom + 0.01) { if (chybaSuma.length) nezadane.push(`${veta}; žiadaná suma nie je zadaná: ${chybaSuma.join(', ')}`); continue; }
    const uhradene = (v.zop.neuhradena === false ? moje : 0) + ine.filter((a) => a.z.neuhradena === false).reduce((s, a) => s + (a.x.ziadana ?? 0), 0);
    if (uhradene > d.celkom + 0.01) zle.push(veta); else preverit.push(veta);
  }
  const hodnoty = { dokladov: mojeDoklady.size, viacnasobne: zle.length + preverit.length + bezSumy.length + nezadane.length };
  if (zle.length) return { stav: 'nesplnene', zdovodnenie: `Ten istý doklad je v uhradených ŽoP (${ZNENIE_ROD[rod]}) nárokovaný nad svoju hodnotu: ${zle.slice(0, 6).join('; ')}.`, hodnoty };
  if (preverit.length || bezSumy.length || nezadane.length) return { stav: 'na_preverenie', zdovodnenie: [
    preverit.length ? `Doklad je nárokovaný aj v inej ŽoP (${ZNENIE_ROD[rod]}) a spolu prevyšuje svoju hodnotu: ${preverit.slice(0, 6).join('; ')}. Ak predchádzajúca ŽoP nebola zamietnutá alebo stiahnutá, ide o dvojité nárokovanie.` : '',
    bezSumy.length ? `Doklad bez sumy je nárokovaný aj v inej ŽoP (${ZNENIE_ROD[rod]}), či spolu neprevyšuje svoju hodnotu, sa nedá overiť: ${bezSumy.slice(0, 6).join('; ')}.` : '',
    nezadane.length ? `Doklad je nárokovaný aj v inej ŽoP (${ZNENIE_ROD[rod]}) a pri niektorom jeho výdavku nie je zadaná žiadaná suma, preto sa nedá overiť, či spolu neprevyšuje hodnotu dokladu: ${nezadane.slice(0, 6).join('; ')}. Nezadaná suma nie je nula; ak sa výdavok nežiada, zadajte 0.` : '',
  ].filter(Boolean).join(' '), hodnoty };
  if (!mojeDoklady.size) return { stav: 'neuplatnuje_sa', zdovodnenie: 'ŽoP nemá účtovné doklady.' };
  return { stav: 'splnene', zdovodnenie: `Žiadny z ${mojeDoklady.size} dokladov nie je spolu s ostatnými ŽoP projektu nárokovaný nad svoju hodnotu.`, hodnoty };
}

function dph(v: VstupZop): VysledokKontroly {
  const dodavatel: string[] = []; const dodavatelNeznamy: string[] = []; const prijimatel: string[] = []; const bezDokladu: string[] = [];
  // Status platiteľa DPH: true / false z ITMS21+, null = neznámy. Neznámy status sa neberie ako „nie je platiteľ“.
  const platitel = v.zop.prijimatel.platitelDph;
  for (const x of v.zop.vydavky) if (x.dokladId == null || !doklad(x.dokladId)) bezDokladu.push(`č. ${x.poradie}`);
  for (const id of new Set(v.zop.vydavky.map((x) => x.dokladId))) {
    const d = doklad(id); if (!d) continue;
    const dphSpolu = d.polozky.reduce((s, p) => s + (p.dph ?? 0), 0);
    if (dphSpolu <= 0.01) continue;
    if (d.dodavatel?.platitelDph === false) dodavatel.push(`${d.cislo} (${d.dodavatel.nazov}, DPH ${eur(r2(dphSpolu))})`);
    else if (d.dodavatel?.platitelDph == null) dodavatelNeznamy.push(`${d.cislo} (${d.dodavatel?.nazov ?? 'dodávateľ neuvedený'}, DPH ${eur(r2(dphSpolu))})`);
  }
  const zDph = v.zop.vydavky.filter((x) => x.ziadana != null && x.bezDph != null && x.ziadana > x.bezDph + 0.01).map((x) => `č. ${x.poradie}`);
  if (platitel === true) prijimatel.push(...zDph);
  // Bez žiadanej sumy (prázdne pole formulára) alebo bez sumy bez DPH sa nedá určiť, či prijímateľ žiada aj DPH;
  // pri neplatiteľovi DPH na tom nezáleží (DPH môže byť oprávnená).
  const nezadane = platitel === false ? [] : v.zop.vydavky.filter((x) => x.ziadana == null).map((x) => `č. ${x.poradie}`);
  const bezZakladu = platitel === false ? [] : v.zop.vydavky.filter((x) => x.ziadana != null && x.bezDph == null).map((x) => `č. ${x.poradie}`);
  const casti: string[] = [];
  if (nezadane.length) casti.push(`Pri ${priVydavkoch(nezadane)} nie je zadaná žiadaná suma, preto sa nedá určiť, či prijímateľ${platitel === true ? ' (platiteľ DPH)' : ''} žiada aj DPH. Nezadaná suma nie je nula; ak sa výdavok nežiada, zadajte 0.`);
  if (dodavatel.length) casti.push(`Dodávateľ podľa ITMS21+ nie je platiteľ DPH, doklad však DPH obsahuje: ${dodavatel.slice(0, 5).join('; ')}.`);
  if (dodavatelNeznamy.length) casti.push(`Doklad obsahuje DPH, status platiteľa DPH dodávateľa však ITMS21+ neuvádza: ${dodavatelNeznamy.slice(0, 5).join('; ')}.`);
  if (prijimatel.length) casti.push(`Prijímateľ je platiteľ DPH a žiada aj DPH pri výdavkoch ${prijimatel.slice(0, 10).join(', ')}; DPH je oprávnená len bez nároku na odpočet.`);
  if (platitel == null && zDph.length) casti.push(`Prijímateľ žiada aj DPH pri výdavkoch ${zDph.slice(0, 10).join(', ')}, jeho status platiteľa DPH však ITMS21+ neuvádza; DPH je oprávnená len bez nároku na odpočet.`);
  if (casti.length) return { stav: 'na_preverenie', zdovodnenie: casti.join(' ') };
  if (!v.zop.vydavky.length) return { stav: 'neuplatnuje_sa', zdovodnenie: 'ŽoP nemá výdavky.' };
  if (bezZakladu.length || bezDokladu.length) return { stav: 'mimo_podkladov', zdovodnenie: [
    bezZakladu.length ? `Výdavky ${bezZakladu.slice(0, 10).join(', ')} nemajú v dátach sumu bez DPH, či prijímateľ žiada aj DPH, sa pri nich neoverilo.` : '',
    bezDokladu.length ? `Výdavky ${bezDokladu.slice(0, 10).join(', ')} nemajú v dátach účtovný doklad, DPH dodávateľa sa pri nich neoverila.` : '',
    'Pri ostatných doklady s DPH vystavili platitelia DPH.'].filter(Boolean).join(' ') };
  return { stav: 'splnene', zdovodnenie: platitel === true ? 'Prijímateľ je platiteľ DPH a žiada len sumy bez DPH; dodávatelia s DPH sú platitelia.'
    : platitel === false ? 'Prijímateľ nie je platiteľ DPH; doklady s DPH vystavili platitelia DPH.'
      : 'Prijímateľ nežiada DPH (status platiteľa DPH ITMS21+ neuvádza); doklady s DPH vystavili platitelia DPH.' };
}

const SADZBY = new Set([0, 5, 10, 19, 20, 23]);
/**
 * Najväčší rozdiel medzi DPH položky a základom × sadzbou, ktorý sa ešte pripíše zaokrúhleniu: 2 centy na položku
 * (DPH zaokrúhlená po riadkoch alebo spätne z ceny s DPH). Tolerancia nerastie so sumou: pri DPH 23 100 EUR
 * by 0,5 % pripustilo chybu vyše 100 EUR. Z 2 557 položiek dokladov výzvy so základom, sadzbou a DPH prekročia
 * 2 centy 4 položky (meranie 23. 11. 2026, audit A12).
 */
export const TOLERANCIA_DPH = 0.02;
function dphVypocet(v: VstupZop): VysledokKontroly {
  const zle: string[] = []; let poloziek = 0;
  // Položky bez základu, sadzby alebo DPH a doklady, ktoré v dátach chýbajú, ostanú neoverené; nevynechajú sa ticho.
  const neuplne = new Map<string, number>(); const chybaDoklad: string[] = [];
  for (const id of new Set(v.zop.vydavky.map((x) => x.dokladId))) {
    const d = doklad(id); if (!d) { if (id != null) chybaDoklad.push(`id ${id}`); continue; }
    for (const p of d.polozky) {
      if (p.bezDph == null || p.dph == null || p.sadzba == null) { neuplne.set(d.cislo, (neuplne.get(d.cislo) ?? 0) + 1); continue; }
      poloziek++;
      if (!SADZBY.has(p.sadzba)) zle.push(`${d.cislo}: neobvyklá sadzba ${cislo(p.sadzba)} %`);
      else {
        const ocakavana = p.bezDph * p.sadzba / 100; const rozdiel = Math.abs(ocakavana - p.dph);
        // 1e-6 pohltí chybu desatinných čísel, aby rozdiel presne 2 centy prešiel.
        if (rozdiel > TOLERANCIA_DPH + 1e-6) zle.push(`${d.cislo}: ${eur(p.bezDph)} × ${cislo(p.sadzba)} % = ${eur(r2(ocakavana))}, doklad uvádza DPH ${eur(p.dph)} (rozdiel ${cislo(rozdiel, 4)} EUR)`);
      }
    }
  }
  const neovereneText = [
    neuplne.size ? `položky bez základu, sadzby alebo DPH v dokladoch ${[...neuplne].slice(0, 6).map(([c, n]) => `${c} (${n})`).join(', ')}` : '',
    chybaDoklad.length ? `doklady chýbajúce v dátach (${chybaDoklad.slice(0, 6).join(', ')})` : '',
  ].filter(Boolean).join('; ');
  if (zle.length) return { stav: 'na_preverenie', zdovodnenie: `Nesedí výpočet DPH v položkách dokladov: ${zle.slice(0, 8).join('; ')}.${neovereneText ? ` Neoverené: ${neovereneText}.` : ''}`, hodnoty: { poloziek, chyb: zle.length } };
  if (!poloziek) return { stav: 'mimo_podkladov', zdovodnenie: 'Doklady nemajú položky so základom, sadzbou a DPH.' };
  if (neovereneText) return { stav: 'mimo_podkladov', zdovodnenie: `Základ dane × sadzba sedí s DPH v ${poloziek} položkách so všetkými údajmi. Neoverené: ${neovereneText}.`, hodnoty: { poloziek, neuplnych: [...neuplne.values()].reduce((a, b) => a + b, 0) } };
  return { stav: 'splnene', zdovodnenie: `Základ dane × sadzba sedí s DPH vo všetkých ${poloziek} položkách dokladov (rozdiel najviac 2 centy na položku).`, hodnoty: { poloziek } };
}

function voVazba(v: VstupZop): VysledokKontroly {
  const bez = v.zop.vydavky.filter((x) => x.typ === 'Iné' && !x.voIds.length);
  const stiahnute = [...new Set(v.zop.vydavky.flatMap((x) => x.voIds))].map((id) => VO.get(id)).filter((x) => x && /stiahnut/i.test(x.stav));
  const casti: string[] = [];
  if (bez.length) casti.push(`Výdavky z externých dokladov bez priradeného VO: ${bez.slice(0, 10).map((x) => `č. ${x.poradie} ${x.nazov} ${eur(x.ziadana)}`).join('; ')}.`);
  if (stiahnute.length) casti.push(`Výdavky sa viažu na VO v stave „Stiahnuté“: ${stiahnute.map((x) => x!.kod).join(', ')}.`);
  if (casti.length) return { stav: 'na_preverenie', zdovodnenie: casti.join(' ') };
  if (!v.zop.vydavky.length) return { stav: 'neuplatnuje_sa', zdovodnenie: 'ŽoP nemá výdavky.' };
  return { stav: 'splnene', zdovodnenie: 'Každý výdavok z externého dokladu má priradené verejné obstarávanie.' };
}

function voKontrola(v: VstupZop): VysledokKontroly {
  const ids = [...new Set(v.zop.vydavky.flatMap((x) => x.voIds))];
  const vos = ids.map((id) => VO.get(id)).filter((x): x is VoZaznam => !!x);
  // VO, ktoré v dátach chýba, a VO bez PHZ sa nepočítajú ako PHZ 0: pri nich sa nedá určiť, či je kontrola VO potrebná.
  const chybaVo = ids.filter((id) => !VO.has(id)); const bezPhz = vos.filter((x) => x.phz == null);
  const velke = vos.filter((x) => x.phz != null && x.phz >= 50_000);
  if (v.voKontrola === 'nie') return { stav: 'nesplnene', zdovodnenie: 'Podľa zadania posúdenie VO (analýza rizík, pri rizikovej zákazke kontrola ÚVO ako SO) pred zahrnutím výdavkov do ŽoP neprebehlo alebo nebolo ukončené.' };
  if (v.voKontrola === 'ano') return { stav: 'splnene', zdovodnenie: 'Podľa zadania bolo posúdenie VO (analýza rizík, pri rizikovej zákazke kontrola ÚVO ako SO) ukončené pred zahrnutím výdavkov do ŽoP.' };
  const velkeText = velke.length ? `VO s PHZ od 50 000 EUR: ${velke.map((x) => `${x.kod} (${eur(x.phz)}, ${x.postup.slice(0, 60)})`).join('; ')}. Podľa MD č. 26 ich poskytovateľ formálne posúdi a analýzou rizík určí, či sa kontrola vykoná; zákazky vyhodnotené ako rizikové kontroluje ÚVO ako SO po uzavretí zmluvy a pred predložením výdavkov v ŽoP (pri nadlimitných stavebných prácach tabuľka uvádza aj „Povinná“). Výsledok posúdenia ani kontroly nie je vo verejných dátach.` : '';
  if (chybaVo.length || bezPhz.length) return { stav: 'mimo_podkladov', zdovodnenie: [velkeText, `PHZ nie je známa pri ${[...bezPhz.map((x) => x.kod), ...chybaVo.map((id) => `VO id ${id} (chýba v dátach)`)].join(', ')}, preto sa nedá určiť, či VO patrí do posúdenia a kontroly po uzavretí zmluvy.`].filter(Boolean).join(' ') };
  if (!velke.length) return { stav: 'neuplatnuje_sa', zdovodnenie: vos.length ? 'Všetky priradené VO majú PHZ pod 50 000 EUR; tabuľka kontrol VO v MD č. 26 sa začína od 50 000 EUR, kontrola po uzavretí zmluvy sa preto nevyžaduje.' : 'ŽoP nemá priradené VO.' };
  return { stav: 'mimo_podkladov', zdovodnenie: velkeText };
}

/** Časť žiadanej sumy bez DPH: čo je nad sumou výdavku bez DPH, je DPH. Bez sumy bez DPH sa berie celá žiadaná suma. */
const ziadanaBezDph = (x: Vydavok) => Math.min(x.ziadana ?? 0, x.bezDph ?? x.ziadana ?? 0);

function voZmluva(v: VstupZop): VysledokKontroly {
  // ITMS21+ neuvádza, či suma zmluvy zahŕňa DPH. „Neprevyšujú“ sa preto tvrdí len vtedy, keď nárok s DPH nie je
  // vyšší ako suma zmluvy; nárok nad sumou zmluvy ide vždy kontrolórovi (audit A07, rovnaký rozpor ako pri V04).
  const zle: string[] = []; const sDph: string[] = []; const nezadane: string[] = []; let zmluv = 0; const neznamych: string[] = [];
  for (const id of new Set(v.zop.vydavky.flatMap((x) => x.zmluvaVoIds))) {
    const z = ZMLUVY.get(id);
    if (z?.suma == null) { neznamych.push(z ? `zmluva k ${z.vo.kod} bez sumy` : `zmluva id ${id} (VO chýba v dátach)`); continue; }
    zmluv++;
    const ine = VSETKY_ZOP.filter((x) => x.kod !== v.zop.kod && rodina(x.typ) === 'narok').flatMap((x) => x.vydavky).filter((x) => x.zmluvaVoIds.includes(id));
    const moje = rodina(v.zop.typ) === 'narok' ? v.zop.vydavky.filter((x) => x.zmluvaVoIds.includes(id)) : [];
    const vsetky = [...ine, ...moje];
    const spolu = vsetky.reduce((s, x) => s + (x.ziadana ?? 0), 0);
    const bezDph = vsetky.reduce((s, x) => s + ziadanaBezDph(x), 0);
    // Nezadaná žiadaná suma (prázdne pole formulára) nie je nula: so známymi sumami sa porovná, súlad sa však nepotvrdí.
    const bezSumy = vsetky.filter((x) => x.ziadana == null).length;
    const veta = `zmluva k ${z.vo.kod} na ${eur(z.suma)}: nárokované spolu ${eur(r2(spolu))}, z toho bez DPH ${eur(r2(bezDph))}${bezSumy ? `, pri ${bezSumy} ${bezSumy === 1 ? 'výdavku' : 'výdavkoch'} žiadaná suma nie je zadaná` : ''}`;
    if (bezDph > z.suma + 0.01) zle.push(veta);
    else if (spolu > z.suma + 0.01) sDph.push(veta);
    else if (bezSumy) nezadane.push(veta);
  }
  const neznameText = neznamych.length ? ` Neoverené pre chýbajúcu sumu zmluvy: ${neznamych.slice(0, 6).join('; ')}${neznamych.length > 6 ? ` a ďalších ${neznamych.length - 6}` : ''}.` : '';
  if (zle.length || sDph.length || nezadane.length) return { stav: 'na_preverenie', zdovodnenie: [
    zle.length ? `Nárokované výdavky prevyšujú sumu zmluvy z VO aj bez DPH: ${zle.join('; ')}. Overiť dodatky k zmluve.` : '',
    sDph.length ? `Nárokované výdavky s DPH prevyšujú sumu zmluvy z VO, bez DPH nie: ${sDph.join('; ')}. ITMS21+ neuvádza, či suma zmluvy zahŕňa DPH; overiť v zmluve a dodatkoch.` : '',
    nezadane.length ? `Pri výdavkoch so zmluvou z VO nie je zadaná žiadaná suma, preto sa nedá overiť, či nárokované neprevyšujú sumu zmluvy: ${nezadane.join('; ')}. Nezadaná suma nie je nula; ak sa výdavok nežiada, zadajte 0.` : '',
  ].filter(Boolean).join(' ') + neznameText };
  if (!zmluv) return { stav: 'mimo_podkladov', zdovodnenie: `Výdavky nemajú priradenú zmluvu z VO so sumou.${neznameText}` };
  if (neznamych.length) return { stav: 'mimo_podkladov', zdovodnenie: `Nárokované výdavky ani s DPH neprevyšujú sumy ${zmluv} zmlúv z VO so známou sumou.${neznameText}` };
  return { stav: 'splnene', zdovodnenie: `Nárokované výdavky ani s DPH neprevyšujú sumy ${zmluv} zmlúv z VO (ITMS21+ neuvádza, či suma zmluvy zahŕňa DPH; súlad platí v oboch prípadoch).` };
}

function hotovost(v: VstupZop): VysledokKontroly {
  if (v.hotovostMax == null && v.hotovostMesiac == null && v.hotovostMajetok === '') return { stav: 'mimo_podkladov', zdovodnenie: 'Údaje o hotovostných platbách nie sú zadané (nie sú vo verejných dátach).' };
  const zle: string[] = [];
  if (v.hotovostMajetok === 'ano') zle.push('hotovosťou je hradený dlhodobý majetok');
  if ((v.hotovostMax ?? 0) > 5000) zle.push(`platba v hotovosti ${eur(v.hotovostMax)} nad 5 000 EUR`);
  else if ((v.hotovostMax ?? 0) > 500) zle.push(`jednotlivá platba v hotovosti ${eur(v.hotovostMax)} nad 500 EUR`);
  if ((v.hotovostMesiac ?? 0) > 1500) zle.push(`hotovosť v mesiaci ${eur(v.hotovostMesiac)} nad 1 500 EUR`);
  if (zle.length) return { stav: 'nesplnene', zdovodnenie: `Hotovostné výdavky nie sú oprávnené: ${zle.join('; ')}.` };
  // „Splnené“ až pri všetkých troch údajoch: jeden zadaný údaj nič nehovorí o ostatných dvoch limitoch.
  const chyba = [v.hotovostMax == null ? 'najvyššia jednotlivá platba' : '', v.hotovostMesiac == null ? 'najvyššia suma za mesiac' : '', v.hotovostMajetok === '' ? 'či sa hotovosťou platil dlhodobý majetok' : ''].filter(Boolean);
  if (chyba.length) return { stav: 'mimo_podkladov', zdovodnenie: `Zadané údaje o hotovosti sú v limitoch, nie je však zadané: ${chyba.join('; ')}. Limity hotovosti sa preto neoverili celé.` };
  return { stav: 'splnene', zdovodnenie: 'Hotovostné platby sú v limitoch (jednotlivo do 500 EUR, mesačne do 1 500 EUR, nie za dlhodobý majetok).' };
}

/** Povinné prílohy podľa typu ŽoP a výdavkov (kap. 4.7 príručky). */
export function povinnePrilohy(v: VstupZop): { cislo: string; nazov: string; dovod: string }[] {
  const out: { cislo: string; nazov: string; dovod: string }[] = [{ cislo: 'faktura', nazov: 'Faktúra alebo rovnocenný účtovný doklad', dovod: 'vždy' }];
  if (v.zop.typ !== 'PREDFINANCOVANIE') out.push({ cislo: 'uhrada', nazov: 'Doklad o úhrade (bankový výpis)', dovod: 'výdavok je uhradený' });
  if (v.zop.vydavky.some(jeStavebny)) out.push(
    { cislo: 'zistovaci', nazov: 'Zisťovací protokol o vykonaných prácach', dovod: 'stavebné práce' },
    { cislo: 'supis', nazov: 'Súpis vykonaných prác a dodávok', dovod: 'stavebné práce' },
    { cislo: 'foto', nazov: 'Fotodokumentácia fakturovaných prác', dovod: 'stavebné práce' });
  if (v.zop.zaverecna && v.zop.vydavky.some(jeStavebny)) out.push(
    { cislo: 'preberaci', nazov: 'Preberací protokol stavby', dovod: 'záverečná ŽoP, ukončené stavebné práce' },
    { cislo: 'kolaudacne', nazov: 'Právoplatné kolaudačné rozhodnutie', dovod: 'záverečná ŽoP, ukončené stavebné práce' });
  if (prviDodavatelia(v).length) out.push({ cislo: 'sankcie', nazov: 'Čestné vyhlásenie dodávateľa k medzinárodným sankciám (príloha č. 6)', dovod: `prvá ŽoP s dodávateľom ${prviDodavatelia(v).join(', ')}` });
  return out;
}
/** Dodávatelia, ktorých výdavok sa v tejto ŽoP objavuje prvýkrát (podľa poradia ŽoP projektu). */
function prviDodavatelia(v: VstupZop): string[] {
  const skor = VSETKY_ZOP.filter((z) => z.projektId === v.zop.projektId && z.kod < v.zop.kod);
  const videne = new Set(skor.flatMap((z) => z.vydavky.map((x) => doklad(x.dokladId)?.dodavatel?.ico)).filter(Boolean));
  return [...new Set(v.zop.vydavky.map((x) => doklad(x.dokladId)?.dodavatel).filter((d) => d?.ico && !videne.has(d.ico)).map((d) => d!.nazov))];
}

function prilohy(v: VstupZop): VysledokKontroly {
  const pov = povinnePrilohy(v);
  if (!v.prilohy) return { stav: 'mimo_podkladov', zdovodnenie: `Dokumenty ŽoP nie sú verejné. Povinné podľa kap. 4.7: ${pov.map((p) => p.nazov).join('; ')}.` };
  const chyba = pov.filter((p) => !v.prilohy![p.cislo]?.text?.trim());
  if (chyba.length) return { stav: 'chyba_podklad', zdovodnenie: `Chýba: ${chyba.map((p) => `${p.nazov} (${p.dovod})`).join('; ')}.` };
  // Obsadené miesto ešte nie je správny dokument (prázdna šablóna súpisu prác stačí na text): kým balík nemá
  // obsahové znaky každej prílohy, ide výsledok človeku.
  return { stav: 'na_preverenie', zdovodnenie: `Na všetkých ${pov.length} miestach pre povinné dokumenty je priložený súbor s textom. Softvér zatiaľ neoveruje, že ide o požadovaný dokument (napr. súpis prác s položkami, množstvami a cenami); obsah overí kontrolór.` };
}

const IB = /internet\s?banking|detail (transakcie|platby|pohybu)|platobn(ý|ého) príkaz|príkaz na úhradu|potvrdenie o (zadaní|prijatí|realizácii) (platby|príkazu)/i;
async function uhrada(v: VstupZop, p: Pravidlo): Promise<VysledokKontroly> {
  const d = v.prilohy?.uhrada;
  if (!d?.text?.trim()) return { stav: v.prilohy ? 'chyba_podklad' : 'mimo_podkladov', zdovodnenie: 'Doklad o úhrade nie je priložený.' };
  const ib = d.text.match(IB);
  if (ib) return { stav: 'nesplnene', zdovodnenie: `Doklad o úhrade vyzerá ako výstup z internet bankingu („${ib[0]}“), ten sa neakceptuje; treba bankový výpis.`, dokaz: ib[0] };
  const nal = (p.parametre?.nalezitosti ?? []) as Nalezitost[];
  if (v.__bezModelu) {
    const chyba = nal.filter((n) => n.vzor && !new RegExp(n.vzor, 'i').test(d.text));
    return chyba.length ? { stav: 'nesplnene', zdovodnenie: `V doklade o úhrade sa nenašlo: ${chyba.map((n) => n.nazov).join('; ')}.` }
      : { stav: 'na_preverenie', zdovodnenie: 'Vzory náležitostí sa v texte našli, bez modelu však nie je overené, že patria k sebe.' };
  }
  const chyba: string[] = []; const najdene: string[] = [];
  for (const n of nal) { const r = await najdiVTexte(n, d.text); if (r.najdene) najdene.push(`${n.nazov}: „${r.dokaz}“`); else chyba.push(n.nazov); }
  if (chyba.length) return { stav: 'nesplnene', zdovodnenie: `V doklade o úhrade sa nenašlo: ${chyba.join('; ')}.`, dokaz: najdene.join('\n') || undefined };
  return { stav: 'splnene', zdovodnenie: `Bankový výpis obsahuje všetkých ${nal.length} náležitostí a nevyzerá ako výstup z internet bankingu.`, dokaz: najdene.join('\n') };
}

/** Doklady k nálezom ŽoP: údaje ŽoP, výdavkov a účtovných dokladov z ITMS21+, údaje z formulára a priložené dokumenty. */
function dokladyZop(v: VstupZop, n: Nalez, p: Pravidlo): Podklad[] {
  const z = podlaKodu.get(v.zop.kod);
  const zdroj = { itms: `ITMS21+, ŽoP ${v.zop.kod}`, formular: `Formulár kontrolóra, ŽoP ${v.zop.kod}` };
  const u = (miesto: string, f: (x: ZopZaznam) => unknown): VstupDokladu => [miesto, f(v.zop), z ? f(z) : undefined];
  const uctovne = (x: ZopZaznam) => [...new Set(x.vydavky.map((y) => y.dokladId))].map(doklad).filter((d): d is Doklad => !!d);
  const sumyDokladov = u('Účtovné doklady: suma', (x) => uctovne(x).map((d) => `${d.cislo}: ${eur(d.celkom)}`));
  const dphDokladu = (d: Doklad) => r2(d.polozky.reduce((s, q) => s + (q.dph ?? 0), 0));
  const platitel = (b: boolean | null | undefined) => (b == null ? 'neuvedené' : b ? 'áno' : 'nie');
  switch (p.kontrola) {
    case 'zop_obdobie': {
      const ha = (pr?: Projekt) => (pr?.planZaciatok && pr.planKoniec ? `${skDatum(pr.planZaciatok)} – ${skDatum(pr.planKoniec)}` : null);
      return dokladyVstupov(n, zdroj, [u('Výdavky: dátum dokladu a úhrady', (x) => x.vydavky.map((y) => `č. ${y.poradie}: doklad z ${skDatum(datumVzniku(y))}, úhrada ${skDatum(datumPlatby(y))}`)),
        ['Hlavné aktivity projektu (plán)', ha(v.projekt), z ? ha(projektPodlaId(z.projektId)) : undefined]]);
    }
    case 'zop_sumy': return dokladyVstupov(n, zdroj, [u('Výdavky: žiadaná suma a výška výdavku', (x) => x.vydavky.map((y) => `č. ${y.poradie}: žiadané ${eur(y.ziadana)}, výdavok ${eur(y.bezDph)} + DPH ${eur(y.dph)}`)), sumyDokladov]);
    case 'zop_duplicita': {
      // Pri každom doklade nárokovanom aj inde: suma dokladu, nárok v tejto ŽoP a v každej ďalšej ŽoP s jej kódom.
      const ine = `${VSETKY_ZOP.length - 1} ďalších ŽoP`;
      const naroky = (x: ZopZaznam) => {
        const druh = VSETKY_ZOP.filter((z) => z.kod !== x.kod && rodina(z.typ) === rodina(x.typ));
        const riadky = [...new Set(x.vydavky.map((y) => y.dokladId))].flatMap((id) => {
          const d = doklad(id); if (!d) return [];
          const inde = druh.map((z) => ({ z, ys: z.vydavky.filter((y) => y.dokladId === id) })).filter((a) => a.ys.length);
          if (!inde.length) return [];
          return [`doklad ${d.cislo} (${eur(d.celkom)}): ŽoP ${x.kod} (posudzovaná) ${sumaNaroku(x.vydavky.filter((y) => y.dokladId === id))}; ${inde.map((a) => `ŽoP ${a.z.kod}${a.z.neuhradena === false ? ' (uhradená)' : a.z.neuhradena ? ' (neuhradená)' : ''} ${sumaNaroku(a.ys)}`).join('; ')}`];
        });
        return riadky.length ? riadky : `žiadny doklad nie je nárokovaný v inej ŽoP rovnakého druhu (${ZNENIE_ROD[rodina(x.typ)]})`;
      };
      return dokladyVstupov(n, zdroj, [sumyDokladov, u('Doklady nárokované aj v iných ŽoP: žiadané sumy podľa ŽoP', naroky)], [['Porovnané ŽoP v dátach výzvy', ine, ine]]);
    }
    case 'zop_dph': return dokladyVstupov(n, zdroj, [
      u('Prijímateľ: platiteľ DPH', (x) => platitel(x.prijimatel.platitelDph)),
      u('Doklady s DPH: dodávateľ a jeho status platiteľa DPH', (x) => {
        const s = uctovne(x).filter((d) => dphDokladu(d) > 0.01).map((d) => `${d.cislo}: DPH ${eur(dphDokladu(d))}, ${d.dodavatel?.nazov ?? 'dodávateľ neuvedený'} (IČO ${d.dodavatel?.ico ?? '–'}), platiteľ DPH: ${platitel(d.dodavatel?.platitelDph)}`);
        return s.length ? s : 'žiadny doklad ŽoP nemá DPH';
      }),
      u('Výdavky: žiadaná suma a suma bez DPH', (x) => x.vydavky.map((y) => `č. ${y.poradie}: žiadané ${eur(y.ziadana)}, bez DPH ${eur(y.bezDph)}`))]);
    case 'zop_dph_vypocet': return dokladyVstupov(n, zdroj, [u('Položky dokladov: základ × sadzba = DPH', (x) => uctovne(x).flatMap((d) => d.polozky.map((q) => `${d.cislo}: ${eur(q.bezDph)} × ${q.sadzba == null ? '–' : `${cislo(q.sadzba)} %`} = ${eur(q.dph)}`)))]);
    case 'zop_vo_vazba': return dokladyVstupov(n, zdroj, [u('Výdavky a priradené VO', (x) => x.vydavky.map((y) => `č. ${y.poradie} (${y.typ}): ${y.voIds.length ? y.voIds.map((id) => VO.get(id)?.kod ?? `VO id ${id}`).join(', ') : 'bez VO'}`))]);
    case 'zop_vo_kontrola': return v.voKontrola
      ? dokladyVstupov(n, zdroj, [['Posúdenie VO ukončené pred predložením ŽoP', v.voKontrola === 'ano' ? 'áno' : 'nie', ZADANE]])
      : dokladyVstupov(n, zdroj, [u('Priradené VO a ich PHZ', (x) => [...new Set(x.vydavky.flatMap((y) => y.voIds))].map((id) => { const o = VO.get(id); return o ? `${o.kod}: PHZ ${eur(o.phz)}` : `VO id ${id}: chýba v dátach`; }))]);
    case 'zop_vo_zmluva': return dokladyVstupov(n, zdroj, [u('Zmluvy z VO priradené výdavkom: suma (ITMS21+ neuvádza, či s DPH)', (x) => [...new Set(x.vydavky.flatMap((y) => y.zmluvaVoIds))].map((id) => { const s = ZMLUVY.get(id); return s ? `zmluva k ${s.vo.kod}: ${eur(s.suma)}` : `zmluva id ${id}: chýba v dátach`; }))],
      [u('Výdavky so zmluvou z VO: žiadaná suma a z nej bez DPH', (x) => x.vydavky.filter((y) => y.zmluvaVoIds.length).map((y) => `č. ${y.poradie}: ${y.ziadana == null ? 'žiadaná suma nezadaná' : `${eur(y.ziadana)}, bez DPH ${eur(r2(ziadanaBezDph(y)))}`}`)),
        u('Nárokované k tým istým zmluvám v iných ŽoP (refundácia, predfinancovanie)', (x) => [...new Set(x.vydavky.flatMap((y) => y.zmluvaVoIds))].flatMap((id) => {
          const s = ZMLUVY.get(id); if (!s) return [];
          const inde = VSETKY_ZOP.filter((z) => z.kod !== x.kod && rodina(z.typ) === 'narok').map((z) => ({ z, ys: z.vydavky.filter((y) => y.zmluvaVoIds.includes(id)) })).filter((a) => a.ys.length);
          return inde.length ? [`zmluva k ${s.vo.kod}: ${inde.map((a) => `ŽoP ${a.z.kod} ${sumaNaroku(a.ys)}`).join('; ')}`] : [];
        }))]);
    case 'zop_hotovost': return dokladyVstupov(n, zdroj, [
      ['Najvyššia jednotlivá platba v hotovosti', v.hotovostMax == null ? null : eur(v.hotovostMax), ZADANE],
      ['Najvyššia suma hotovostných platieb za mesiac', v.hotovostMesiac == null ? null : eur(v.hotovostMesiac), ZADANE],
      ['Hotovosťou sa platil dlhodobý majetok', v.hotovostMajetok === 'ano' ? 'áno' : v.hotovostMajetok === 'nie' ? 'nie' : null, ZADANE]]);
    case 'zop_prilohy': return dokladyPriloh(v.prilohy, povinnePrilohy(v));
    case 'zop_uhrada': return dokladyUryvkov(n.dokaz, v.prilohy?.uhrada?.text ?? '', v.prilohy?.uhrada?.nazov ?? 'doklad o úhrade', ((p.parametre?.nalezitosti ?? []) as Nalezitost[]).map((x) => x.nazov));
    default: return [];
  }
}

const FILTRE: Record<string, (z: ZopZaznam) => boolean> = {
  refundacia: (z) => z.typ === 'REFUNDACIA', predfinancovanie: (z) => z.typ === 'PREDFINANCOVANIE', zuctovanie: (z) => z.typ.startsWith('ZUCTOVANIE'), zaverecna: (z) => z.zaverecna,
};
const TYPY: Record<string, string> = { REFUNDACIA: 'refundácia', PREDFINANCOVANIE: 'predfinancovanie', ZUCTOVANIE_PREDFINANCOVANIA: 'zúčtovanie predfinancovania', ZUCTOVANIE_ZALOHY: 'zúčtovanie zálohy' };
const typZop = (z: ZopZaznam) => `${TYPY[z.typ] ?? z.typ}${z.zaverecna ? ', záverečná' : ''}`;

export const zop: Modul<VstupZop> = {
  id: 'zop', nazov: 'Žiadosť o platbu',
  popis: 'Kontrola ŽoP: obdobie oprávnenosti, sumy voči dokladom, viacnásobné nárokovanie dokladu, DPH, väzba na VO, hotovosť a povinné prílohy vrátane faktúry podľa § 74 zákona o DPH.',
  neukladatDokazy: false,
  filtre: [{ hodnota: 'refundacia', nazov: 'Refundácia' }, { hodnota: 'predfinancovanie', nazov: 'Predfinancovanie' }, { hodnota: 'zuctovanie', nazov: 'Zúčtovanie' }, { hodnota: 'zaverecna', nazov: 'Záverečné' }],
  pripady(q, filter, limit = 80) {
    const s = q.toLowerCase();
    const v = VSETKY_ZOP.filter((z) => z.vydavky.length && (!filter || FILTRE[filter]?.(z)) && (!s || `${z.kod} ${z.projektKod} ${z.prijimatel.nazov}`.toLowerCase().includes(s)));
    return { spolu: v.length, pripady: v.slice(0, limit).map((z) => ({ id: z.kod, nazov: `${z.kod} · ${eur(z.narokovana)}`, podnazov: z.prijimatel.nazov, stitok: typZop(z) })) };
  },
  nacitaj(id) {
    const z = podlaKodu.get(id); if (!z) return undefined;
    return { zop: z, projekt: projektPodlaId(z.projektId), hotovostMax: null, hotovostMesiac: null, hotovostMajetok: '', voKontrola: '' };
  },
  polia: (v) => [
    ...v.zop.vydavky.slice(0, 12).map((x) => ({ kluc: `ziadana_${x.id}`, typ: 'cislo' as const, nazov: `Výdavok č. ${x.poradie}: žiadaná suma (EUR)`, napoveda: `${x.nazov} · doklad ${doklad(x.dokladId)?.cislo ?? '–'} z ${skDatum(datumVzniku(x))} · bez DPH ${eur(x.bezDph)}, DPH ${eur(x.dph)}` })),
    { kluc: 'hotovostMax', typ: 'cislo', nazov: 'Najvyššia jednotlivá platba v hotovosti (EUR)' },
    { kluc: 'hotovostMesiac', typ: 'cislo', nazov: 'Najvyššia suma hotovostných platieb v jednom mesiaci (EUR)' },
    { kluc: 'hotovostMajetok', typ: 'vyber', nazov: 'Hotovosťou sa platil dlhodobý majetok', moznosti: [{ hodnota: '', nazov: 'nezadané' }, { hodnota: 'nie', nazov: 'nie' }, { hodnota: 'ano', nazov: 'áno' }] },
    { kluc: 'voKontrola', typ: 'vyber', nazov: 'Posúdenie VO (analýza rizík, pri rizikovej zákazke kontrola ÚVO ako SO) bolo ukončené pred predložením ŽoP', moznosti: [{ hodnota: '', nazov: 'nezadané' }, { hodnota: 'ano', nazov: 'áno' }, { hodnota: 'nie', nazov: 'nie' }] },
  ],
  prilohy: (v) => povinnePrilohy(v).map(({ cislo, nazov }) => ({ cislo, nazov })),
  doFormulara: (v) => ({ ...Object.fromEntries(v.zop.vydavky.slice(0, 12).map((x) => [`ziadana_${x.id}`, x.ziadana])), hotovostMax: v.hotovostMax, hotovostMesiac: v.hotovostMesiac, hotovostMajetok: v.hotovostMajetok, voKontrola: v.voKontrola }),
  zFormulara(v, f) {
    const n: VstupZop = structuredClone(v);
    for (const x of n.zop.vydavky.slice(0, 12)) if (f[`ziadana_${x.id}`] !== undefined) x.ziadana = num(f[`ziadana_${x.id}`]);
    n.hotovostMax = num(f.hotovostMax); n.hotovostMesiac = num(f.hotovostMesiac);
    n.hotovostMajetok = f.hotovostMajetok === 'ano' || f.hotovostMajetok === 'nie' ? f.hotovostMajetok : '';
    n.voKontrola = f.voKontrola === 'ano' || f.voKontrola === 'nie' ? f.voKontrola : '';
    return n;
  },
  doklady: dokladyZop,
  inventarPodmienok: true,
  kontroly: { zop_obdobie: obdobie, zop_sumy: sumy, zop_duplicita: duplicita, zop_dph: dph, zop_dph_vypocet: dphVypocet, zop_vo_vazba: voVazba, zop_vo_kontrola: voKontrola, zop_vo_zmluva: voZmluva, zop_hotovost: hotovost, zop_prilohy: prilohy, zop_uhrada: uhrada },
  hlavnyText: (v) => v.prilohy?.faktura?.text ?? '',
  kontext: (v) => `ŽoP ${v.zop.kod}, prijímateľ ${v.zop.prijimatel.nazov}`,
  titulok: (v) => ({ kod: v.zop.kod, nazov: `ŽoP ${v.zop.kod} (${typZop(v.zop)})`, podnazov: `${v.zop.prijimatel.nazov} · projekt ${v.zop.projektKod} · nárokovaná suma ${eur(v.zop.narokovana)} · ${v.zop.vydavky.length} výdavkov` }),
  suhrn: (v) => `Výdavky spolu žiadané ${eur(r2(v.zop.vydavky.reduce((s, x) => s + (x.ziadana ?? 0), 0)))} · doklady: ${[...new Set(v.zop.vydavky.map((x) => doklad(x.dokladId)?.cislo).filter(Boolean))].slice(0, 6).join(', ')} · hlavné aktivity ${skDatum(v.projekt?.planZaciatok)} – ${skDatum(v.projekt?.planKoniec)}`,
  vystupy: (v) => [{ nazov: 'Zoznam povinných dokumentov k tejto ŽoP', text: povinnePrilohy(v).map((p) => `• ${p.nazov} (${p.dovod})`).join('\n') }],
};
