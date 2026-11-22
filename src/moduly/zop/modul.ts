// Modul: žiadosť o platbu (ŽoP). Vstup: ŽoP z ITMS21+ s výdavkami a účtovnými dokladmi; prílohy (faktúra,
// výpis z účtu, súpis prác...) nahrá používateľ, lebo verejné API ich nezverejňuje.
import type { Modul, Pravidlo, Priloha, Projekt, VysledokKontroly } from '../../core/typy.ts';
import { najdiVTexte, type Nalezitost } from '../../core/posud.ts';
import { cislo, eur, nacitajData, num, pridajMesiace, projektPodlaId, skDatum } from '../spolocne.ts';

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
export const DOKLADY = nacitajData<Record<string, Doklad>>('doklady.json', {});
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
  return { stav: 'splnene', zdovodnenie: `Všetkých ${v.zop.vydavky.length} výdavkov má doklad z obdobia realizácie hlavných aktivít a úhradu do 31. 12. 2029.`, hodnoty };
}

function sumy(v: VstupZop): VysledokKontroly {
  const zle: string[] = []; const naDoklad = new Map<number, number>(); let bez = 0;
  // Neznáma suma sa nepočíta ako nula ani sa ticho nevynechá: taký výdavok alebo doklad ostane neoverený.
  const neovereny: string[] = [];
  for (const x of v.zop.vydavky) {
    if (x.ziadana == null) { neovereny.push(`výdavok č. ${x.poradie} bez žiadanej sumy`); continue; }
    if (x.bezDph == null) neovereny.push(`výdavok č. ${x.poradie} bez výšky výdavku`);
    else if (x.ziadana > x.bezDph + (x.dph ?? 0) + 0.01) zle.push(`č. ${x.poradie}: žiadané ${eur(x.ziadana)} > výška výdavku ${eur(x.bezDph + (x.dph ?? 0))}`);
    if (x.dokladId != null) naDoklad.set(x.dokladId, (naDoklad.get(x.dokladId) ?? 0) + x.ziadana); else bez++;
  }
  for (const [id, s] of naDoklad) {
    const d = doklad(id);
    if (d?.celkom == null) neovereny.push(`doklad ${d?.cislo ?? `id ${id}`} bez sumy v dátach`);
    else if (s > d.celkom + 0.01) zle.push(`doklad ${d.cislo}: v tejto ŽoP žiadané ${eur(r2(s))} > suma dokladu ${eur(d.celkom)}`);
  }
  if (zle.length) return { stav: 'nesplnene', zdovodnenie: zle.slice(0, 10).join('; ') };
  if (!v.zop.vydavky.length) return { stav: 'neuplatnuje_sa', zdovodnenie: 'ŽoP nemá výdavky.' };
  if (bez) return { stav: 'na_preverenie', zdovodnenie: `${bez} výdavkov nemá priradený účtovný doklad.${neovereny.length ? ` Neoverené: ${neovereny.slice(0, 8).join('; ')}.` : ''}` };
  if (neovereny.length) return { stav: 'mimo_podkladov', zdovodnenie: `Ostatné žiadané sumy neprevyšujú výšku výdavkov ani sumy dokladov. Neoverené pre chýbajúcu sumu: ${neovereny.slice(0, 8).join('; ')}${neovereny.length > 8 ? ` a ďalších ${neovereny.length - 8}` : ''}.` };
  return { stav: 'splnene', zdovodnenie: `Žiadané sumy neprevyšujú výšku výdavkov ani sumy ${naDoklad.size} dokladov.` };
}

function duplicita(v: VstupZop): VysledokKontroly {
  const ostatne = VSETKY_ZOP.filter((z) => z.kod !== v.zop.kod);
  const zle: string[] = []; const preverit: string[] = []; const bezSumy: string[] = [];
  const mojeDoklady = new Set(v.zop.vydavky.map((x) => x.dokladId).filter((x): x is number => x != null));
  const rod = rodina(v.zop.typ);
  for (const id of mojeDoklady) {
    const d = doklad(id);
    const moje = v.zop.vydavky.filter((x) => x.dokladId === id).reduce((s, x) => s + (x.ziadana ?? 0), 0);
    const ine = ostatne.filter((z) => rodina(z.typ) === rod).flatMap((z) => z.vydavky.filter((x) => x.dokladId === id).map((x) => ({ z, x })));
    if (!ine.length) continue;
    const spolu = moje + ine.reduce((s, a) => s + (a.x.ziadana ?? 0), 0);
    const kde = [...new Set(ine.map((a) => `${a.z.kod}${a.z.neuhradena === false ? ' (uhradená)' : a.z.neuhradena ? ' (neuhradená)' : ''}`))].join(', ');
    // Doklad bez sumy sa nevynechá: je nárokovaný aj inde a či spolu neprevyšuje jeho hodnotu, sa nedá overiť.
    if (d?.celkom == null) { bezSumy.push(`doklad ${d?.cislo ?? `id ${id}`} (suma nie je v dátach): spolu žiadané ${eur(r2(spolu))}, aj v ŽoP ${kde}`); continue; }
    if (spolu <= d.celkom + 0.01) continue;
    const uhradene = (v.zop.neuhradena === false ? moje : 0) + ine.filter((a) => a.z.neuhradena === false).reduce((s, a) => s + (a.x.ziadana ?? 0), 0);
    const veta = `doklad ${d.cislo} (${eur(d.celkom)}): spolu žiadané ${eur(r2(spolu))}, aj v ŽoP ${kde}`;
    if (uhradene > d.celkom + 0.01) zle.push(veta); else preverit.push(veta);
  }
  const hodnoty = { dokladov: mojeDoklady.size, viacnasobne: zle.length + preverit.length + bezSumy.length };
  if (zle.length) return { stav: 'nesplnene', zdovodnenie: `Ten istý doklad je v uhradených ŽoP (${ZNENIE_ROD[rod]}) nárokovaný nad svoju hodnotu: ${zle.slice(0, 6).join('; ')}.`, hodnoty };
  if (preverit.length || bezSumy.length) return { stav: 'na_preverenie', zdovodnenie: [
    preverit.length ? `Doklad je nárokovaný aj v inej ŽoP (${ZNENIE_ROD[rod]}) a spolu prevyšuje svoju hodnotu: ${preverit.slice(0, 6).join('; ')}. Ak predchádzajúca ŽoP nebola zamietnutá alebo stiahnutá, ide o dvojité nárokovanie.` : '',
    bezSumy.length ? `Doklad bez sumy je nárokovaný aj v inej ŽoP (${ZNENIE_ROD[rod]}), či spolu neprevyšuje svoju hodnotu, sa nedá overiť: ${bezSumy.slice(0, 6).join('; ')}.` : '',
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
  const casti: string[] = [];
  if (dodavatel.length) casti.push(`Dodávateľ podľa ITMS21+ nie je platiteľ DPH, doklad však DPH obsahuje: ${dodavatel.slice(0, 5).join('; ')}.`);
  if (dodavatelNeznamy.length) casti.push(`Doklad obsahuje DPH, status platiteľa DPH dodávateľa však ITMS21+ neuvádza: ${dodavatelNeznamy.slice(0, 5).join('; ')}.`);
  if (prijimatel.length) casti.push(`Prijímateľ je platiteľ DPH a žiada aj DPH pri výdavkoch ${prijimatel.slice(0, 10).join(', ')}; DPH je oprávnená len bez nároku na odpočet.`);
  if (platitel == null && zDph.length) casti.push(`Prijímateľ žiada aj DPH pri výdavkoch ${zDph.slice(0, 10).join(', ')}, jeho status platiteľa DPH však ITMS21+ neuvádza; DPH je oprávnená len bez nároku na odpočet.`);
  if (casti.length) return { stav: 'na_preverenie', zdovodnenie: casti.join(' ') };
  if (!v.zop.vydavky.length) return { stav: 'neuplatnuje_sa', zdovodnenie: 'ŽoP nemá výdavky.' };
  if (bezDokladu.length) return { stav: 'mimo_podkladov', zdovodnenie: `Výdavky ${bezDokladu.slice(0, 10).join(', ')} nemajú v dátach účtovný doklad, DPH dodávateľa sa pri nich neoverila. Pri ostatných doklady s DPH vystavili platitelia DPH.` };
  return { stav: 'splnene', zdovodnenie: platitel === true ? 'Prijímateľ je platiteľ DPH a žiada len sumy bez DPH; dodávatelia s DPH sú platitelia.'
    : platitel === false ? 'Prijímateľ nie je platiteľ DPH; doklady s DPH vystavili platitelia DPH.'
      : 'Prijímateľ nežiada DPH (status platiteľa DPH ITMS21+ neuvádza); doklady s DPH vystavili platitelia DPH.' };
}

const SADZBY = new Set([0, 5, 10, 19, 20, 23]);
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
      else if (Math.abs(p.bezDph * p.sadzba / 100 - p.dph) > 0.02 + 0.005 * Math.abs(p.dph)) zle.push(`${d.cislo}: ${eur(p.bezDph)} × ${p.sadzba} % ≠ DPH ${eur(p.dph)}`);
    }
  }
  const neovereneText = [
    neuplne.size ? `položky bez základu, sadzby alebo DPH v dokladoch ${[...neuplne].slice(0, 6).map(([c, n]) => `${c} (${n})`).join(', ')}` : '',
    chybaDoklad.length ? `doklady chýbajúce v dátach (${chybaDoklad.slice(0, 6).join(', ')})` : '',
  ].filter(Boolean).join('; ');
  if (zle.length) return { stav: 'na_preverenie', zdovodnenie: `Nesedí výpočet DPH v položkách dokladov: ${zle.slice(0, 8).join('; ')}.${neovereneText ? ` Neoverené: ${neovereneText}.` : ''}`, hodnoty: { poloziek, chyb: zle.length } };
  if (!poloziek) return { stav: 'mimo_podkladov', zdovodnenie: 'Doklady nemajú položky so základom, sadzbou a DPH.' };
  if (neovereneText) return { stav: 'mimo_podkladov', zdovodnenie: `Základ dane × sadzba sedí s DPH v ${poloziek} položkách so všetkými údajmi. Neoverené: ${neovereneText}.`, hodnoty: { poloziek, neuplnych: [...neuplne.values()].reduce((a, b) => a + b, 0) } };
  return { stav: 'splnene', zdovodnenie: `Základ dane × sadzba sedí s DPH vo všetkých ${poloziek} položkách dokladov.`, hodnoty: { poloziek } };
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
  if (v.voKontrola === 'nie') return { stav: 'nesplnene', zdovodnenie: 'Podľa zadania kontrola VO pred zahrnutím výdavkov do ŽoP neprebehla alebo nebola ukončená.' };
  if (v.voKontrola === 'ano') return { stav: 'splnene', zdovodnenie: 'Podľa zadania bola kontrola VO ukončená pred zahrnutím výdavkov do ŽoP.' };
  const velkeText = velke.length ? `VO s PHZ od 50 000 EUR: ${velke.map((x) => `${x.kod} (${eur(x.phz)}, ${x.postup.slice(0, 60)})`).join('; ')}. Pri týchto postupoch môže byť kontrola po uzavretí zmluvy povinná; jej výsledok verejné dáta neobsahujú.` : '';
  if (chybaVo.length || bezPhz.length) return { stav: 'mimo_podkladov', zdovodnenie: [velkeText, `PHZ nie je známa pri ${[...bezPhz.map((x) => x.kod), ...chybaVo.map((id) => `VO id ${id} (chýba v dátach)`)].join(', ')}, preto sa nedá určiť, či bola potrebná kontrola VO po uzavretí zmluvy.`].filter(Boolean).join(' ') };
  if (!velke.length) return { stav: 'neuplatnuje_sa', zdovodnenie: vos.length ? 'Všetky priradené VO majú PHZ pod 50 000 EUR; kontrola po uzavretí zmluvy sa podľa tabuľky príručky VO nevyžaduje.' : 'ŽoP nemá priradené VO.' };
  return { stav: 'mimo_podkladov', zdovodnenie: velkeText };
}

function voZmluva(v: VstupZop): VysledokKontroly {
  const zle: string[] = []; let zmluv = 0; const neznamych: string[] = [];
  for (const id of new Set(v.zop.vydavky.flatMap((x) => x.zmluvaVoIds))) {
    const z = ZMLUVY.get(id);
    if (z?.suma == null) { neznamych.push(z ? `zmluva k ${z.vo.kod} bez sumy` : `zmluva id ${id} (VO chýba v dátach)`); continue; }
    zmluv++;
    const ine = VSETKY_ZOP.filter((x) => x.kod !== v.zop.kod && rodina(x.typ) === 'narok').flatMap((x) => x.vydavky).filter((x) => x.zmluvaVoIds.includes(id));
    const moje = rodina(v.zop.typ) === 'narok' ? v.zop.vydavky.filter((x) => x.zmluvaVoIds.includes(id)) : [];
    const spolu = [...ine, ...moje].reduce((s, x) => s + (x.ziadana ?? 0), 0);
    // Suma zmluvy môže byť bez DPH, nárokované sumy s DPH: hlási sa až prekročenie aj pri DPH 23 %.
    if (spolu > z.suma * 1.23 + 1) zle.push(`zmluva k ${z.vo.kod} na ${eur(z.suma)}: nárokované spolu ${eur(r2(spolu))}`);
  }
  const neznameText = neznamych.length ? ` Neoverené pre chýbajúcu sumu zmluvy: ${neznamych.slice(0, 6).join('; ')}${neznamych.length > 6 ? ` a ďalších ${neznamych.length - 6}` : ''}.` : '';
  if (zle.length) return { stav: 'na_preverenie', zdovodnenie: `Nárokované výdavky prevyšujú sumu zmluvy z VO aj pri pripočítaní DPH: ${zle.join('; ')}. Overiť dodatky k zmluve.${neznameText}` };
  if (!zmluv) return { stav: 'mimo_podkladov', zdovodnenie: `Výdavky nemajú priradenú zmluvu z VO so sumou.${neznameText}` };
  if (neznamych.length) return { stav: 'mimo_podkladov', zdovodnenie: `Nárokované výdavky neprevyšujú sumy ${zmluv} zmlúv z VO so známou sumou.${neznameText}` };
  return { stav: 'splnene', zdovodnenie: `Nárokované výdavky neprevyšujú sumy ${zmluv} zmlúv z VO.` };
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
    { kluc: 'voKontrola', typ: 'vyber', nazov: 'Kontrola VO bola ukončená pred predložením ŽoP', moznosti: [{ hodnota: '', nazov: 'nezadané' }, { hodnota: 'ano', nazov: 'áno' }, { hodnota: 'nie', nazov: 'nie' }] },
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
  kontroly: { zop_obdobie: obdobie, zop_sumy: sumy, zop_duplicita: duplicita, zop_dph: dph, zop_dph_vypocet: dphVypocet, zop_vo_vazba: voVazba, zop_vo_kontrola: voKontrola, zop_vo_zmluva: voZmluva, zop_hotovost: hotovost, zop_prilohy: prilohy, zop_uhrada: uhrada },
  hlavnyText: (v) => v.prilohy?.faktura?.text ?? '',
  kontext: (v) => `ŽoP ${v.zop.kod}, prijímateľ ${v.zop.prijimatel.nazov}`,
  titulok: (v) => ({ kod: v.zop.kod, nazov: `ŽoP ${v.zop.kod} (${typZop(v.zop)})`, podnazov: `${v.zop.prijimatel.nazov} · projekt ${v.zop.projektKod} · nárokovaná suma ${eur(v.zop.narokovana)} · ${v.zop.vydavky.length} výdavkov` }),
  suhrn: (v) => `Výdavky spolu žiadané ${eur(r2(v.zop.vydavky.reduce((s, x) => s + (x.ziadana ?? 0), 0)))} · doklady: ${[...new Set(v.zop.vydavky.map((x) => doklad(x.dokladId)?.cislo).filter(Boolean))].slice(0, 6).join(', ')} · hlavné aktivity ${skDatum(v.projekt?.planZaciatok)} – ${skDatum(v.projekt?.planKoniec)}`,
  vystupy: (v) => [{ nazov: 'Zoznam povinných dokumentov k tejto ŽoP', text: povinnePrilohy(v).map((p) => `• ${p.nazov} (${p.dovod})`).join('\n') }],
};
