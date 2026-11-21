// Deterministické kontroly modulu "žiadosť o NFP a prílohy".
// Každá kontrola je čistá funkcia (žiadosť, pravidlo) -> výsledok. Prahy a kódy sú v balíku pravidiel, nie tu.
import type { Ziadost, Pravidlo, Stav } from '../../core/typy.ts';

export interface VysledokKontroly { stav: Stav; zdovodnenie: string; hodnoty?: Record<string, number | string | null>; dokaz?: string }
type Kontrola = (z: Ziadost, p: Pravidlo) => VysledokKontroly;

const eur = (n: number) => n.toLocaleString('sk-SK', { maximumFractionDigits: 0 }) + ' EUR';
const cislo = (n: number, d = 1) => n.toLocaleString('sk-SK', { maximumFractionDigits: d });
const uk = (z: Ziadost, kod: string) => z.ukazovatele.find((u) => u.kod === kod);
const maHlavnu = (z: Ziadost, opatrenie: string) => z.aktivity.some((a) => a.hlavna && a.opatrenie === opatrenie) || z.rozpocet.some((r) => r.hlavna && r.opatrenie === opatrenie && r.suma > 0);
const covHlavnych = (z: Ziadost, opatrenie: string) => z.rozpocet.filter((r) => r.hlavna && r.opatrenie === opatrenie).reduce((s, r) => s + r.suma, 0);
const mesiace = (od: string, po: string) => (new Date(po).getTime() - new Date(od).getTime()) / 86400_000 / 30.44;

/**
 * Príloha so záväzným formulárom (napr. Príloha č. 8: zošit MS Excel podľa vzoru výzvy). Nestačí, že slot má text:
 * prázdny vzor má tisíce znakov popiskov a PDF či DOCX v tom istom slote nie sú záväzný formulár.
 * Vyplnenosť sa overuje na konkrétnych bunkách hárku `harok` (adresy sú v balíku pravidiel), nie hľadaním v texte:
 * v texte sa stratí poloha stĺpcov a ručne vpísané nuly by sa nedali odlíšiť od sumy.
 * „Splnené“ znamená iba toto: je priložený identifikovateľný, vyplnený vzor patriaci k tejto žiadosti. Vecnú správnosť
 * rozpočtu (oprávnenosť, hospodárnosť) to neoveruje: to je odborná časť administratívneho overenia.
 */
export interface ZavaznyFormular {
  popis: string; pripona: string; harok: string;
  /** Adresy buniek s názvom žiadateľa a projektu, napr. "B9", "B10". */
  ziadatel?: string; projekt?: string;
  /**
   * Položka rozpočtu = riadok, kde stĺpce `pocet` a `cena` majú čísla a stĺpec `suma` (vzorec počet × cena) kladné číslo.
   * Podľa stĺpca skupiny výdavkov sa nedá: vo vzore ju sekcie „Ostatné“ nemajú predvyplnenú.
   */
  polozka?: { pocet: string; cena: string; suma: string; nazovSumy: string };
}
const normNazov = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
/**
 * Rovnaký názov = zhoda po normalizácii (diakritika, veľkosť písmen, interpunkcia; čísla a etapy ostávajú). Nič voľnejšie:
 * „Obnova budovy OcÚ I“ a „… II“ či „Obec Nová Ves“ a „Obec Nová Ves nad Žitavou“ sú rôzne. Radšej planý poplach
 * (na preverenie) ako nesprávne „splnené“.
 */
const rovnakyNazov = (a: string, b: string) => normNazov(a) === normNazov(b);
/** Riadky položiek rozpočtu s kladnou sumou v hárku (podľa adries buniek). */
function polozkyRozpoctu(h: Record<string, string>, p: NonNullable<ZavaznyFormular['polozka']>): { riadok: number; suma: number }[] {
  const cislo = (a: string) => (h[a] !== undefined && h[a].trim() !== '' ? Number(h[a]) : NaN);
  return Object.keys(h).map((a) => a.match(/^([A-Z]+)(\d+)$/)).filter((m): m is RegExpMatchArray => !!m && m[1] === p.suma)
    .map((m) => ({ riadok: Number(m[2]), suma: cislo(m[0]) }))
    .filter((x) => x.suma > 0 && Number.isFinite(cislo(`${p.pocet}${x.riadok}`)) && Number.isFinite(cislo(`${p.cena}${x.riadok}`)));
}
type PrilozenySubor = NonNullable<NonNullable<Ziadost['prilohy']>[string]['subory']>[number];
export function zavaznyFormular(z: Ziadost, c: string, pr: NonNullable<Ziadost['prilohy']>[string], zf: ZavaznyFormular,
  priZhode?: (subor: PrilozenySubor, riadky: number[]) => void): VysledokKontroly {
  if (!pr.subory) return pr.text.trim().length > 40
    ? { stav: 'na_preverenie', zdovodnenie: `Príloha č. ${c} je priložená (${pr.nazov}), ale z podkladov sa nedá overiť, či ide o ${zf.popis}.` }
    : { stav: 'chyba_podklad', zdovodnenie: `Príloha č. ${c} sa vyžaduje a chýba (súbor je prázdny alebo nečitateľný).` };
  const zosity = pr.subory.filter((s) => new RegExp(zf.pripona, 'i').test(s.nazov));
  const ine = pr.subory.filter((s) => !zosity.includes(s)).map((s) => s.nazov);
  const aj = ine.length ? ` Ďalšie súbory v prílohe: ${ine.join(', ')}.` : '';
  if (!zosity.length) return { stav: 'chyba_podklad', zdovodnenie: `Príloha č. ${c} sa predkladá ako ${zf.popis}. V prílohe je len ${ine.join(', ')}, záväzný zošit chýba.` };
  const citatelne = zosity.filter((s) => s.citatelny);
  if (!citatelne.length) return { stav: 'chyba_podklad', zdovodnenie: `Príloha č. ${c}: zošit ${zosity.map((s) => s.nazov).join(', ')} je priložený, ale nečitateľný.${aj}` };
  const vzorove = citatelne.filter((s) => s.text.includes(`=== Hárok: ${zf.harok} ===`));
  if (!vzorove.length) return { stav: 'na_preverenie', zdovodnenie: `Príloha č. ${c}: zošit ${citatelne.map((s) => s.nazov).join(', ')} nemá hárok „${zf.harok}“ zo vzoru výzvy. Treba overiť, či ide o ${zf.popis}.${aj}` };
  // Každý zošit sa posudzuje zvlášť: prázdny vzor a vyplnená kópia v jednom slote = rozhoduje vyplnená.
  const udaje = vzorove.map((s) => {
    const h = s.bunky?.[zf.harok];
    if (!h) return { subor: s, nazov: s.nazov, overitelny: false, chyba: [] as string[], polozky: [] as { riadok: number; suma: number }[] };
    const ziadatel = zf.ziadatel ? h[zf.ziadatel]?.trim() || undefined : undefined;
    const projekt = zf.projekt ? h[zf.projekt]?.trim() || undefined : undefined;
    const polozky = zf.polozka ? polozkyRozpoctu(h, zf.polozka) : [];
    const chyba = [zf.ziadatel && !ziadatel && `názov žiadateľa (${zf.ziadatel})`, zf.projekt && !projekt && `názov projektu (${zf.projekt})`,
      zf.polozka && !polozky.length && `aspoň jedna položka rozpočtu s kladnou sumou (stĺpec ${zf.polozka.suma}, ${zf.polozka.nazovSumy})`].filter((x): x is string => !!x);
    return { subor: s, nazov: s.nazov, overitelny: true, ziadatel, projekt, polozky, chyba };
  });
  const vyplnene = udaje.filter((u) => u.overitelny && !u.chyba.length);
  if (!vyplnene.length) {
    const neoverene = udaje.filter((u) => !u.overitelny);
    if (neoverene.length) return { stav: 'na_preverenie', zdovodnenie: `Príloha č. ${c}: zošit ${neoverene.map((u) => u.nazov).join(', ')} má hárok zo vzoru, ale jeho bunky sa nedali prečítať z originálu. Vyplnenosť treba overiť ručne.${aj}` };
    const naj = [...udaje].sort((a, b) => a.chyba.length - b.chyba.length)[0];
    return { stav: 'chyba_podklad', zdovodnenie: `Príloha č. ${c}: priložený zošit ${naj.nazov} je nevyplnený vzor. Chýba: ${naj.chyba.join(', ')}.${aj}` };
  }
  const nesedi = (u: (typeof udaje)[number]) => [
    u.ziadatel && !rovnakyNazov(u.ziadatel, z.ziadatel.nazov) && `žiadateľ „${u.ziadatel}“ (vo formulári „${z.ziadatel.nazov}“)`,
    u.projekt && !rovnakyNazov(u.projekt, z.nazov) && `projekt „${u.projekt}“ (vo formulári „${z.nazov}“)`,
  ].filter((x): x is string => !!x);
  const cudzie = vyplnene.filter((u) => nesedi(u).length);
  if (cudzie.length) return { stav: 'na_preverenie', zdovodnenie: `Príloha č. ${c}: v zošite ${cudzie[0].nazov} je uvedený ${nesedi(cudzie[0]).join(' a ')}. Treba overiť, či zošit patrí k tejto žiadosti.${aj}` };
  const u = vyplnene[0];
  const suma = u.polozky.reduce((s, p) => s + p.suma, 0);
  // Dôkaz sa viaže na ten istý zošit a riadky, z ktorých pochádza počet a súčet vo výsledku.
  priZhode?.(u.subor, u.polozky.map(p => p.riadok));
  return { stav: 'splnene', hodnoty: zf.polozka ? { polozky: u.polozky.length, sumaPoloziek: Math.round(suma * 100) / 100 } : undefined,
    zdovodnenie: `Príloha č. ${c} je priložená ako ${zf.popis}: ${vyplnene.map((v) => v.nazov).join(', ')}${u.ziadatel ? ` (žiadateľ: ${u.ziadatel}${u.projekt ? `, projekt: ${u.projekt}` : ''})` : ''}.${zf.polozka ? ` Položky s kladnou sumou: ${u.polozky.length}, spolu ${eur(suma)} (${zf.polozka.nazovSumy}).` : ''} Overená je len prítomnosť vyplneného vzoru, nie vecná správnosť rozpočtu.${aj}` };
}

/**
 * Súlad Prílohy č. 8 s rozpočtom formulára (tabuľka č. 11). Zošit vzorcami určí oprávnené výdavky po krátení podľa pásma
 * úspory (PPP 13) a podmienok Hodnoty za peniaze; formulár ITMS ich uvádza po položkách. Porovnáva sa každé opatrenie zvlášť.
 * Adresy buniek sú v balíku pravidiel (vzor výzvy), tu je len logika.
 */
export interface SuladPrilohy8 {
  /** Oprávnené výdavky budovy B1 po krátení (M210), pred krátením (M208), OZE po krátení (M270), počet budov (B13). */
  budova: string; budovaPredKratenim: string; oze: string; pocetBudov: string;
  /** Ďalšie budovy: hárok s {n} (2..maxBudov), bunka oprávnených výdavkov po krátení a bunka hlásenia. */
  dalsieBudovy: { harok: string; bunka: string; hlaska: string; maxBudov: number };
  /** Bunky, v ktorých vzor vypíše upozornenie (nesplnená HzP, výška NFP, percentuálny limit). */
  hlasky: string[];
  opatrenieBudova: string; opatrenieOze: string;
}
const eur2 = (n: number) => n.toLocaleString('sk-SK', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' EUR';
const centy = (n: number) => Math.round(n * 100) / 100;
export type BunkaZositu = { harok: string; adresa: string };
export function suladPrilohy8(z: Ziadost, p: Pravidlo, priPorovnani?: (subor: PrilozenySubor, bunky: BunkaZositu[]) => void): VysledokKontroly {
  const { cislo: c, zavaznyFormular: zf, sulad: s } = p.parametre as { cislo: string; zavaznyFormular: ZavaznyFormular; sulad: SuladPrilohy8 };
  if (z.prilohy === undefined) return { stav: 'mimo_podkladov', zdovodnenie: `Prílohy nie sú súčasťou podkladov (verejné API ich neobsahuje), súlad Prílohy č. ${c} s rozpočtom formulára sa nedá overiť.` };
  const pr = z.prilohy[c];
  if (!pr || pr.text.trim().length <= 40) return { stav: 'chyba_podklad', zdovodnenie: `Príloha č. ${c} chýba, preto sa oprávnené výdavky z nej nedajú porovnať s rozpočtom formulára.` };
  if (pr.zaradenie === 'odhad') return { stav: 'na_preverenie', zdovodnenie: `Príloha č. ${c}: ${pr.nazov} je zaradená len odhadom podľa kľúčových slov. Najprv treba potvrdiť, že ide o túto prílohu.` };
  let zosit: PrilozenySubor | undefined;
  const f = zavaznyFormular(z, c, pr, zf, (sub) => { zosit = sub; });
  if (f.stav !== 'splnene' || !zosit?.bunky?.[zf.harok]) return { stav: f.stav === 'splnene' ? 'na_preverenie' : f.stav, zdovodnenie: `Súlad s rozpočtom formulára sa nedá overiť, kým nie je v poriadku samotný zošit (bod P08): ${f.zdovodnenie}` };
  const sub = zosit, bunky = sub.bunky!, h = bunky[zf.harok];
  const num = (harok: Record<string, string> | undefined, a: string) => { const v = harok?.[a]?.trim(); return v ? (Number.isFinite(Number(v)) ? Number(v) : NaN) : undefined; };
  const citovane: BunkaZositu[] = [];
  const bunka = (harok: string, adresa: string) => { citovane.push({ harok, adresa }); return `„${harok}“!${adresa}`; };

  const wB1 = num(h, s.budova), wO = num(h, s.oze);
  const chyba = [[s.budova, wB1], [s.oze, wO]].filter(([, v]) => v === undefined || Number.isNaN(v)).map(([a]) => a);
  if (chyba.length) return { stav: 'na_preverenie', zdovodnenie: `V zošite ${sub.nazov} chýba vypočítaná suma v bunke ${chyba.join(', ')} (hárok „${zf.harok}“). Vzorce zošita zrejme nemajú uložené výsledky (súbor nebol uložený v MS Excel) alebo bol vzor zmenený. Zošit treba otvoriť v MS Excel a sumy porovnať s rozpočtom formulára ručne.` };
  const pocet = num(h, s.pocetBudov);
  const n = pocet !== undefined && Number.isInteger(pocet) && pocet > 1 ? pocet : 1;
  if (n > s.dalsieBudovy.maxBudov) return { stav: 'na_preverenie', zdovodnenie: `Zošit ${sub.nazov} uvádza ${n} budov (bunka ${s.pocetBudov}), vzor má hárky len pre ${s.dalsieBudovy.maxBudov}. Súlad treba overiť ručne.` };
  // Ďalšie budovy: povinné do počtu z B13; hárok so sumou nad tento počet je rozpor v zošite, nie dôvod ho ignorovať.
  const dalsie: { harok: string; suma: number }[] = [], neprecitane: string[] = [], navyse: string[] = [], hlasky: string[] = [];
  for (let i = 2; i <= s.dalsieBudovy.maxBudov; i++) {
    const harok = s.dalsieBudovy.harok.replace('{n}', String(i)), v = num(bunky[harok], s.dalsieBudovy.bunka);
    if (i <= n && (v === undefined || Number.isNaN(v))) { neprecitane.push(harok); continue; }
    if (v === undefined || Number.isNaN(v) || (i > n && v === 0)) continue;
    if (i > n) navyse.push(harok);
    dalsie.push({ harok, suma: v });
    const t = bunky[harok]?.[s.dalsieBudovy.hlaska]?.trim();
    if (t) hlasky.push(`„${t}“ (${bunka(harok, s.dalsieBudovy.hlaska)})`);
  }
  if (neprecitane.length) return { stav: 'na_preverenie', zdovodnenie: `Zošit ${sub.nazov} uvádza ${n} budov (bunka ${s.pocetBudov}), ale z hárkov ${neprecitane.map((x) => `„${x}“`).join(', ')} sa nedala prečítať vypočítaná suma (bunka ${s.dalsieBudovy.bunka}). Skryté hárky sa nenačítavajú. Súlad treba overiť ručne.` };
  for (const a of s.hlasky) { const t = h[a]?.trim(); if (t) hlasky.push(`„${t}“ (${bunka(zf.harok, a)})`); }

  const wB = (wB1 as number) + dalsie.reduce((x, d) => x + d.suma, 0), wOze = wO as number;
  const rB = z.rozpocet.filter((r) => r.opatrenie === s.opatrenieBudova), rO = z.rozpocet.filter((r) => r.opatrenie === s.opatrenieOze);
  const ine = z.rozpocet.filter((r) => r.opatrenie !== s.opatrenieBudova && r.opatrenie !== s.opatrenieOze && r.suma !== 0);
  if (!z.rozpocet.length) return { stav: 'chyba_podklad', zdovodnenie: `Vo formulári chýba rozpočet projektu (tabuľka č. 11), s ktorým by sa dali porovnať oprávnené výdavky zo zošita ${sub.nazov}.` };
  const fB = rB.reduce((x, r) => x + r.suma, 0), fO = rO.reduce((x, r) => x + r.suma, 0);
  const riadkyZositu = Number(f.hodnoty?.polozky ?? 0);
  // Formulár zaokrúhľuje každú položku na centy, zošit počíta presne: pol centa na každú položku, nič viac.
  const tolB = 0.005 * (rB.length + riadkyZositu) + 0.005, tolO = 0.005 * (rO.length + riadkyZositu) + 0.005;
  const hodnoty = { budovaZosit: centy(wB), budovaFormular: centy(fB), ozeZosit: centy(wOze), ozeFormular: centy(fO) };
  const zdrojB = [bunka(zf.harok, s.budova), ...dalsie.map((d) => bunka(d.harok, s.dalsieBudovy.bunka))].join(' + ');
  const zdrojO = bunka(zf.harok, s.oze);
  const opis = `opatrenie ${s.opatrenieBudova}: zošit ${eur2(wB)} (${zdrojB}), formulár ${eur2(fB)}; opatrenie ${s.opatrenieOze}: zošit ${eur2(wOze)} (${zdrojO}), formulár ${eur2(fO)}`;
  const vysledok = (stav: VysledokKontroly['stav'], zdovodnenie: string): VysledokKontroly => { priPorovnani?.(sub, citovane); return { stav, zdovodnenie, hodnoty }; };

  const okB = Math.abs(fB - wB) <= tolB, okO = Math.abs(fO - wOze) <= tolO;
  const sumaRozpoctu = z.rozpocet.reduce((x, r) => x + r.suma, 0);
  const vady: string[] = [];
  if (navyse.length) vady.push(`Zošit uvádza ${n} budov (bunka ${s.pocetBudov}), ale sumu majú aj hárky ${navyse.map((x) => `„${x}“`).join(', ')}.`);
  if (hlasky.length) vady.push(`Zošit hlási ${hlasky.join(', ')}.`);
  if (ine.length) vady.push(`Formulár má aj výdavky mimo opatrení ${s.opatrenieBudova} a ${s.opatrenieOze} (${ine.map((r) => `${r.opatrenie ?? 'bez opatrenia'}: ${eur2(r.suma)}`).join(', ')}), zošit ich nepočíta.`);
  if (Math.abs(sumaRozpoctu - z.sumaZiadanaCelkova) > 0.005 * (z.rozpocet.length + 1)) vady.push(`Súčet položiek rozpočtu formulára (${eur2(sumaRozpoctu)}) sa nerovná celkovým oprávneným výdavkom formulára (${eur2(z.sumaZiadanaCelkova)}).`);
  if (okB && okO && !vady.length) return vysledok('splnene', `Oprávnené výdavky vypočítané v záväznom zošite ${sub.nazov} sa zhodujú s rozpočtom formulára (${opis}). Rozdiel je najviac zaokrúhlenie položiek na centy. Kontrola porovnáva sumy, oprávnenosť a hospodárnosť jednotlivých výdavkov neposudzuje.`);

  // Opatrenie, pre ktoré zošit nič nevypočítal, hoci formulár výdavky žiada: bez hlásenia ide o neúplne vyplnený zošit.
  const nulove = [[s.opatrenieBudova, wB, fB], [s.opatrenieOze, wOze, fO]].filter(([, w, fx]) => (w as number) === 0 && (fx as number) > 0).map(([o]) => o);
  if (nulove.length && !hlasky.length) return vysledok('chyba_podklad', `Zošit ${sub.nazov} pri opatrení ${nulove.join(' a ')} nevypočítal žiadne oprávnené výdavky, hoci formulár ich žiada (${opis}). Podľa Prílohy č. 2 výzvy má nevyplnenie žlto podfarbených buniek v hárkoch Rozpočet a MU Budova „za následok absenciu výpočtu výdavkov“. Treba doplniť úplne vyplnený zošit.${vady.length ? ' ' + vady.join(' ') : ''}`);

  const pricina: string[] = [];
  const smer = (o: string, fx: number, w: number) => `pri opatrení ${o} formulár žiada o ${eur2(Math.abs(fx - w))} ${fx > w ? 'viac' : 'menej'}, než vypočítal zošit`;
  if (!okB) pricina.push(smer(s.opatrenieBudova, fB, wB));
  if (!okO) pricina.push(smer(s.opatrenieOze, fO, wOze));
  const pred = num(h, s.budovaPredKratenim);
  if (!okB && pred !== undefined && !Number.isNaN(pred) && pred > wB1! && !dalsie.length && Math.abs(fB - pred) <= tolB)
    pricina.push(`suma formulára pri opatrení ${s.opatrenieBudova} sa rovná výdavkom budovy pred krátením podľa pásma úspory (${bunka(zf.harok, s.budovaPredKratenim)} = ${eur2(pred)}). Podľa PPP č. 13 sa oprávnené výdavky krátia, zošit po krátení uvádza ${eur2(wB1!)}`);
  if (!okB && !okO && Math.abs(fB + fO - wB - wOze) <= tolB + tolO) pricina.push('celková suma sedí, ale rozdelenie medzi opatrenia nie');
  const prvy = pricina.length ? pricina[0][0].toUpperCase() + pricina.join('; ').slice(1) + '.' : '';
  const zaver = pricina.length ? 'Treba overiť, ktorá suma platí, a zosúladiť formulár so zošitom.' : 'Sumy opatrení sa zhodujú, ale uvedený rozpor treba posúdiť.';
  return vysledok('na_preverenie', `Oprávnené výdavky zo zošita ${sub.nazov} a rozpočet formulára: ${opis}. ${[prvy, ...vady].filter(Boolean).join(' ')} ${zaver}`);
}

/** Úspora primárnej energie z ukazovateľa (východisková - cieľová hodnota). */
export function uspora(z: Ziadost, kod: string): { vych: number; ciel: number; mwh: number; percent: number } | null {
  const u = uk(z, kod);
  if (!u || u.vychodisko == null || u.ciel == null || u.vychodisko <= 0) return null;
  return { vych: u.vychodisko, ciel: u.ciel, mwh: u.vychodisko - u.ciel, percent: ((u.vychodisko - u.ciel) / u.vychodisko) * 100 };
}

/** Hodnota za peniaze: COV hlavných aktivít opatrenia / prínos. Vracia null, ak sa nedá vypočítať. */
export function hzpEE(z: Ziadost): number | null {
  const u = uspora(z, 'PSKPRCR26b'); const cov = covHlavnych(z, '2.1.2');
  return u && u.mwh > 0 && cov > 0 ? cov / u.mwh : null;
}
export function hzpOZE(z: Ziadost): number | null {
  const mw = (uk(z, 'PSKPRCO22a')?.ciel ?? 0) + (uk(z, 'PSKPRCO22b')?.ciel ?? 0); const cov = covHlavnych(z, '2.2.2');
  return mw > 0 && cov > 0 ? cov / mw : null;
}

function trojpasmo(hodnota: number, max: number, rezerva: number, jednotka: string, hodnoty: Record<string, number | string | null>): VysledokKontroly {
  const h = `${cislo(hodnota, 0)} ${jednotka}`;
  if (hodnota <= max) return { stav: 'splnene', zdovodnenie: `Hodnota za peniaze je ${h}, limit je ${cislo(max, 0)}.`, hodnoty };
  if (hodnota <= max * rezerva) return { stav: 'na_preverenie', zdovodnenie: `Hodnota za peniaze vychádza ${h}, teda nad limitom ${cislo(max, 0)}, ale v pásme, ktoré môže vysvetliť DPH v rozpočte formulára alebo výdavky, ktoré sa do výpočtu nerátajú. Treba prepočítať podľa Prílohy č. 8 ŽoNFP.`, hodnoty };
  return { stav: 'nesplnene', zdovodnenie: `Hodnota za peniaze je ${h}. Limit ${cislo(max, 0)} je prekročený aj po odrátaní DPH.`, hodnoty };
}

const dmr = (d: string) => d.split('-').reverse().join('.');

/** Kategórie regiónov projektu z formulára; odvodene = podľa kraja miesta realizácie (null, ak niektorý kraj chýba). */
export function kategorieRegionu(z: Ziadost, krajeVRR: string[]): { kategorie: string[]; zdroj: 'formular' | 'kraj' | null; odvodene: string[] | null } {
  const odvodene = z.miesta.length && z.miesta.every((m) => m.kraj) ? [...new Set(z.miesta.map((m) => (krajeVRR.includes(m.kraj) ? 'VRR' : 'MRR')))].sort() : null;
  if (z.kategoriaRegionov.length) return { kategorie: [...new Set(z.kategoriaRegionov)].sort(), zdroj: 'formular', odvodene };
  return { kategorie: odvodene ?? [], zdroj: odvodene ? 'kraj' : null, odvodene };
}

/**
 * Predloženie včas (§ 16 ods. 4 zákona č. 121/2022 Z. z.): po vyhlásení výzvy a pred jej uzavretím; ak bola výzva uzavretá
 * len pre niektorú kategóriu regiónov (MRR), aj pred týmto uzavretím. V deň uzavretia nepoznáme hodinu, rozhodne človek.
 * Kategória vo formulári, ktorá nezodpovedá kraju miesta realizácie, ide človeku: v dátach výzvy mali takýto nesúlad
 * 2 žiadosti z 799 a obe skončili zastavením konania.
 */
function predlozenieVcas(z: Ziadost, p: Pravidlo): VysledokKontroly {
  const { vyhlasenie, uzavretie, uzavretieKategorie = {}, krajeVRR = [] } = p.parametre as
    { vyhlasenie: string; uzavretie?: string; uzavretieKategorie?: Record<string, string>; krajeVRR?: string[] };
  const d = z.datumPredlozenia?.slice(0, 10);
  if (!d) return { stav: 'na_preverenie', zdovodnenie: 'Vo formulári chýba dátum predloženia. Kontrolór ho overí v ITMS21+ alebo podľa doručenia do e-schránky poskytovateľa.' };
  const k = kategorieRegionu(z, krajeVRR);
  const hodnoty = { datumPredlozenia: d, kategoria: k.kategorie.join('+') || null, kategoriaZ: k.zdroj, kraj: k.odvodene ? 'pouzity' : null };
  const kat = k.kategorie.join(', ');
  if (d < vyhlasenie) return { stav: 'na_preverenie', zdovodnenie: `Dátum predloženia ${dmr(d)} je pred vyhlásením výzvy (${dmr(vyhlasenie)}). Údaj je pravdepodobne chybný, treba ho overiť.`, hodnoty };
  if (uzavretie && d > uzavretie) return { stav: 'nesplnene', zdovodnenie: `Žiadosť je predložená ${dmr(d)}, po uzavretí výzvy ${dmr(uzavretie)}. Po uzavretí výzvy nie je možné predkladať žiadosti.`, hodnoty };
  if (uzavretie && d === uzavretie) return { stav: 'na_preverenie', zdovodnenie: `Žiadosť je predložená v deň uzavretia výzvy (${dmr(uzavretie)}). Rozhoduje čas doručenia, treba ho overiť.`, hodnoty };
  if (k.zdroj === 'formular' && k.odvodene && k.odvodene.join() !== k.kategorie.join())
    return { stav: 'na_preverenie', zdovodnenie: `Kategória regiónu vo formulári (${kat}) nezodpovedá miestu realizácie (${[...new Set(z.miesta.map((m) => m.kraj))].join(', ')}, teda ${k.odvodene.join(', ')}). Od kategórie závisí alokácia aj uzavretie výzvy, treba to preveriť.`, hodnoty };
  for (const [kategoria, od] of Object.entries(uzavretieKategorie)) {
    if (d < od) continue;
    if (!k.kategorie.length) return { stav: 'na_preverenie', zdovodnenie: `Od ${dmr(od)} je výzva pre ${kategoria} uzavretá a kategória regiónu sa z formulára nedá určiť (chýba kategória aj kraj miesta realizácie). Treba ju overiť.`, hodnoty };
    if (!k.kategorie.includes(kategoria)) continue;
    if (d === od) return { stav: 'na_preverenie', zdovodnenie: `Žiadosť pre ${kategoria} je predložená v deň, keď sa výzva pre ${kategoria} uzavrela (${dmr(od)}). Rozhoduje čas, treba ho overiť.`, hodnoty };
    if (k.kategorie.length > 1) return { stav: 'na_preverenie', zdovodnenie: `Projekt patrí do viacerých kategórií regiónov (${kat}) a od ${dmr(od)} je výzva pre ${kategoria} uzavretá. Treba overiť, ktorá časť projektu je ešte oprávnená.`, hodnoty };
    return { stav: 'nesplnene', zdovodnenie: `Žiadosť pre ${kategoria}${k.zdroj === 'kraj' ? ' (kategória odvodená z kraja miesta realizácie)' : ''} je predložená ${dmr(d)}, ale od ${dmr(od)} je výzva pre ${kategoria} uzavretá.`, hodnoty };
  }
  return { stav: 'splnene', zdovodnenie: `Žiadosť je predložená ${dmr(d)}, keď bola výzva otvorená${kat ? ` pre kategóriu regiónu ${kat}${k.zdroj === 'kraj' ? ' (odvodenú z kraja miesta realizácie)' : ''}` : ''}.`, hodnoty };
}

export const KONTROLY: Record<string, Kontrola> = {
  pravna_forma(z, p) {
    const kod = z.ziadatel.pravnaFormaKod;
    if (!kod) return { stav: 'chyba_podklad', zdovodnenie: 'Vo formulári chýba právna forma žiadateľa.' };
    const ok = (p.parametre?.povolene as string[]).includes(kod);
    const zaklad = `Právna forma žiadateľa: ${z.ziadatel.pravnaForma} (kód ${kod}).`;
    if (!ok) return { stav: 'nesplnene', zdovodnenie: `${zaklad} Nie je medzi oprávnenými žiadateľmi výzvy.`, hodnoty: { kod } };
    // Pri niektorých právnych formách výzva pridáva podmienky, ktoré kód formy nepreukáže (napr. oprávnenosť na činnosti podľa zákona).
    const doplnok = p.parametre?.doplnkovePodmienky as { formy: string[]; text: string } | undefined;
    if (doplnok?.formy.includes(kod)) return { stav: 'na_preverenie', zdovodnenie: `${zaklad} Forma je oprávnená, ale výzva pri nej vyžaduje aj: ${doplnok.text} Z kódu právnej formy sa to overiť nedá.`, hodnoty: { kod } };
    return { stav: 'splnene', zdovodnenie: `${zaklad} Je medzi oprávnenými.`, hodnoty: { kod } };
  },

  hlavna_aktivita(z, p) {
    const hlavne = z.aktivity.filter((a) => a.hlavna);
    if (!hlavne.length) return { stav: 'nesplnene', zdovodnenie: 'Projekt nemá žiadnu hlavnú aktivitu.' };
    const opatrenia = [...new Set(hlavne.map((a) => a.opatrenie ?? 'neuvedené'))].join(', ');
    const hodnoty = { pocet: hlavne.length, opatrenia };
    // Opatrenia výzvy: hlavná aktivita z iného opatrenia nie je oprávnená, bez opatrenia sa to nedá posúdiť.
    const povolene = p.parametre?.opatrenia as string[] | undefined;
    if (povolene) {
      const mimo = hlavne.filter((a) => a.opatrenie && !povolene.includes(a.opatrenie));
      if (mimo.length) return { stav: 'nesplnene', zdovodnenie: `Hlavné aktivity mimo opatrení výzvy (${povolene.join(', ')}): ${mimo.map((a) => `${a.nazov || a.kod} (opatrenie ${a.opatrenie})`).join('; ')}.`, hodnoty };
      const bez = hlavne.filter((a) => !a.opatrenie);
      if (bez.length) return { stav: 'na_preverenie', zdovodnenie: `Pri hlavných aktivitách ${bez.map((a) => a.nazov || a.kod).join('; ')} chýba opatrenie, nedá sa overiť, či patria do opatrení výzvy (${povolene.join(', ')}).`, hodnoty };
    }
    return { stav: 'splnene', zdovodnenie: `Projekt má ${hlavne.length} hlavných aktivít v opatreniach ${opatrenia}${povolene ? ', všetky patria do opatrení výzvy' : ''}.`, hodnoty };
  },

  /** Formulár patrí do výzvy, ktorej pravidlami sa posudzuje. Pravidlá inej výzvy by dali nezmyselný výsledok. */
  vyzva_formulara(z, p) {
    const vyzva = p.parametre!.vyzva as string;
    if (!z.vyzvaKod) return { stav: 'na_preverenie', zdovodnenie: `Vo formulári chýba kód výzvy. Žiadosť sa posudzuje pravidlami výzvy ${vyzva}; kontrolór overí, že bola predložená do nej.` };
    return z.vyzvaKod === vyzva ? { stav: 'splnene', zdovodnenie: `Formulár je predložený do výzvy ${vyzva}.`, hodnoty: { vyzvaKod: z.vyzvaKod } }
      : { stav: 'nesplnene', zdovodnenie: `Formulár je predložený do výzvy ${z.vyzvaKod}, nie do výzvy ${vyzva}. Pravidlá výzvy ${vyzva} sa naň nevzťahujú a ostatné výsledky tohto posudku neplatia.`, hodnoty: { vyzvaKod: z.vyzvaKod } };
  },

  predlozenie_vcas: (z, p) => predlozenieVcas(z, p),

  uspora_min(z, p) {
    if (!maHlavnu(z, '2.1.2')) return { stav: 'neuplatnuje_sa', zdovodnenie: 'Projekt nerealizuje opatrenie 2.1.2.' };
    const u = uk(z, p.parametre!.ukazovatel);
    if (!u || u.vychodisko == null || u.ciel == null) return { stav: 'mimo_podkladov', zdovodnenie: `Ukazovateľ ${p.parametre!.ukazovatel} nemá v podkladoch východiskovú alebo cieľovú hodnotu (vo verejnom registri býva nevyplnená). Úsporu treba overiť z energetického certifikátu a Prílohy č. 8 ŽoNFP.` };
    if (u.vychodisko <= 0) return { stav: 'na_preverenie', zdovodnenie: `Východisková spotreba primárnej energie je ${u.vychodisko} MWh/rok, čo nedáva zmysel.` };
    const percent = ((u.vychodisko - u.ciel) / u.vychodisko) * 100; const hodnoty = { vychodisko: u.vychodisko, ciel: u.ciel, percent: +percent.toFixed(1) };
    if (percent < 0) return { stav: 'nesplnene', zdovodnenie: `Cieľová spotreba (${cislo(u.ciel)} MWh/rok) je vyššia než východisková (${cislo(u.vychodisko)} MWh/rok). Pravdepodobne chyba v jednotkách (kWh namiesto MWh).`, hodnoty };
    const min = p.parametre!.minPercent as number;
    return percent < min ? { stav: 'nesplnene', zdovodnenie: `Plánovaná úspora je ${cislo(percent)} %, minimum je ${min} %.`, hodnoty }
      : { stav: 'splnene', zdovodnenie: `Plánovaná úspora za celý projekt je ${cislo(percent)} % (z ${cislo(u.vychodisko)} na ${cislo(u.ciel)} MWh/rok). Podmienka platí pre každú budovu zvlášť, pri viacerých budovách ju treba overiť v Prílohe č. 8 ŽoNFP.`, hodnoty };
  },

  hzp_ee(z, p) {
    if (!maHlavnu(z, '2.1.2')) return { stav: 'neuplatnuje_sa', zdovodnenie: 'Projekt nerealizuje opatrenie 2.1.2.' };
    const u = uspora(z, p.parametre!.ukazovatel); const cov = covHlavnych(z, '2.1.2');
    if (!u || u.mwh <= 0) return { stav: 'mimo_podkladov', zdovodnenie: 'Úspora primárnej energie sa z podkladov nedá vypočítať, preto ani hodnota za peniaze. Treba ju overiť v Prílohe č. 8 ŽoNFP.' };
    return trojpasmo(cov / u.mwh, p.parametre!.max, p.parametre!.rezervaDph, 'EUR/MWh/rok', { cov: Math.round(cov), usporaMWh: +u.mwh.toFixed(2), hzp: Math.round(cov / u.mwh) });
  },

  hzp_oze(z, p) {
    if (!maHlavnu(z, '2.2.2')) return { stav: 'neuplatnuje_sa', zdovodnenie: 'Projekt nerealizuje opatrenie 2.2.2.' };
    const mw = (p.parametre!.ukazovatele as string[]).reduce((s, k) => s + (uk(z, k)?.ciel ?? 0), 0); const cov = covHlavnych(z, '2.2.2');
    if (mw <= 0) return { stav: 'chyba_podklad', zdovodnenie: 'Ukazovatele PSKPRCO22a/b (dodatočná kapacita OZE v MW) nemajú cieľovú hodnotu.' };
    if (cov <= 0) return { stav: 'chyba_podklad', zdovodnenie: 'V rozpočte nie sú výdavky na hlavné aktivity opatrenia 2.2.2.' };
    return trojpasmo(cov / mw, p.parametre!.max, p.parametre!.rezervaDph, 'EUR/MW', { cov: Math.round(cov), kapacitaMW: +mw.toFixed(4), hzp: Math.round(cov / mw) });
  },

  miesto_sr(z) {
    if (!z.miesta.length) return { stav: 'chyba_podklad', zdovodnenie: 'Vo formulári chýba miesto realizácie.' };
    const mimo = z.miesta.filter((m) => m.lokalita !== 'SLOVENSKA_REPUBLIKA');
    return mimo.length ? { stav: 'nesplnene', zdovodnenie: `Miesto realizácie mimo SR: ${mimo.map((m) => m.obec || m.kraj).join(', ')}.` }
      : { stav: 'splnene', zdovodnenie: `Miesto realizácie: ${[...new Set(z.miesta.map((m) => m.obec || m.okres || m.kraj))].slice(0, 4).join(', ')}.` };
  },

  vyska_nfp(z, p) {
    const { min, max } = p.parametre as { min: number; max: number }; const n = z.sumaZiadanaNFP; const hodnoty = { nfp: n };
    if (n < min) return { stav: 'nesplnene', zdovodnenie: `Žiadaný NFP ${eur(n)} je pod minimom ${eur(min)}.`, hodnoty };
    if (n > max) return { stav: 'nesplnene', zdovodnenie: `Žiadaný NFP ${eur(n)} je nad maximom ${eur(max)}.`, hodnoty };
    return { stav: 'splnene', zdovodnenie: `Žiadaný NFP ${eur(n)} je v povolenom rozmedzí.`, hodnoty };
  },

  pasmo_ov(z, p) {
    if (!maHlavnu(z, '2.1.2')) return { stav: 'neuplatnuje_sa', zdovodnenie: 'Projekt nerealizuje opatrenie 2.1.2, pásma sa neuplatnia.' };
    const u = uspora(z, p.parametre!.ukazovatel);
    if (!u) return { stav: 'mimo_podkladov', zdovodnenie: 'Úspora sa z podkladov nedá vypočítať, pásmo oprávnených výdavkov sa nedá určiť.' };
    if (u.percent < 30) return { stav: 'nesplnene', zdovodnenie: `Úspora ${cislo(u.percent)} % je pod 30 %, budova nemôže byť podporená.` };
    const zaklad = u.percent > 60 ? 100 : u.percent > 50 ? 95 : u.percent > 40 ? 90 : 85;
    const maOZE = z.aktivity.some((a) => a.hlavna && a.opatrenie === '2.2.2');
    const vysledne = maOZE ? zaklad : zaklad - 5;
    return { stav: 'splnene', zdovodnenie: `Pri úspore ${cislo(u.percent)} % je základ oprávnených výdavkov ${zaklad} %. ${maOZE ? 'Projekt má aj aktivitu OZE, ďalšie zníženie o 5 p. b. sa neuplatní, ak OZE kryje spotrebu všetkých budov.' : 'Projekt nemá aktivitu OZE opatrenia 2.2.2, uplatní sa ďalšie zníženie o 5 p. b.'} Očakávaná výška: ${vysledne} %.`, hodnoty: { usporaPercent: +u.percent.toFixed(1), opravneneVydavkyPercent: vysledne } };
  },

  harmonogram(z, p) {
    if (!z.koniecHlavnychAktivit || !z.datumPredlozenia) return { stav: 'chyba_podklad', zdovodnenie: 'Vo formulári chýba harmonogram hlavných aktivít alebo dátum predloženia.' };
    const m = mesiace(z.datumPredlozenia, z.koniecHlavnychAktivit); const limit = (p.parametre!.maxMesiacov as number) + (p.parametre!.rezervaNaKonanieMesiacov as number);
    const hodnoty = { koniecHlavnychAktivit: z.koniecHlavnychAktivit, mesiacovOdPredlozenia: +m.toFixed(1) };
    return m > limit ? { stav: 'na_preverenie', zdovodnenie: `Hlavné aktivity končia ${z.koniecHlavnychAktivit}, teda ${cislo(m)} mesiaca po predložení žiadosti. Lehota 24 mesiacov beží až od účinnosti zmluvy, ale harmonogram je dlhý, treba ho preveriť.`, hodnoty }
      : { stav: 'splnene', zdovodnenie: `Hlavné aktivity končia ${z.koniecHlavnychAktivit}, ${cislo(Math.max(m, 0))} mesiaca po predložení žiadosti. Je to orientačná kontrola: lehota beží od účinnosti zmluvy.`, hodnoty };
  },

  priloha_povinna(z, p) {
    const { cislo: c, podmienka, nahrada } = p.parametre as { cislo: string; podmienka: string; nahrada?: string };
    const plati = podmienka === 'vzdy' || (podmienka === 'opatrenie_212' && maHlavnu(z, '2.1.2'))
      || (podmienka === 'aktivita_audit' && z.aktivity.some((a) => a.hlavna && /energetick\S* audit|vypracovanie EA\b/i.test(a.nazov)))
      || (podmienka === 'obec_vuc' && ['801', '803'].includes(z.ziadatel.pravnaFormaKod));
    if (!plati) return { stav: 'neuplatnuje_sa', zdovodnenie: 'Pre túto žiadosť sa príloha nevyžaduje.' };
    if (z.prilohy === undefined) return { stav: 'mimo_podkladov', zdovodnenie: `Príloha č. ${c} sa vyžaduje, ale prílohy nie sú súčasťou podkladov (verejné API ich neobsahuje).` };
    const pr = z.prilohy[c];
    // Odhad zaradenia (podľa kľúčových slov) môže byť omyl, napr. sprievodný list so zoznamom príloh: rozhodne človek.
    if (pr && pr.text.trim().length > 40 && pr.zaradenie === 'odhad') return { stav: 'na_preverenie', zdovodnenie: `Príloha č. ${c}: ${pr.nazov}. Súbor označený „odhad“ softvér zaradil podľa kľúčových slov, nie podľa čísla prílohy. Treba potvrdiť, že ide naozaj o túto prílohu, alebo ho vyradiť.` };
    const zf = p.parametre!.zavaznyFormular as ZavaznyFormular | undefined;
    if (pr && zf) return zavaznyFormular(z, c, pr, zf);
    if (pr && pr.text.trim().length > 40) return { stav: 'splnene', zdovodnenie: `Príloha č. ${c} je priložená: ${pr.nazov}.` };
    if (nahrada && /https?:\/\/|www\./i.test(z.popis)) return { stav: 'na_preverenie', zdovodnenie: `Príloha č. ${c} chýba. Výzva pripúšťa náhradu: ${nahrada}. V popise projektu je webový odkaz, treba overiť, či vedie na uznesenie.` };
    return { stav: 'chyba_podklad', zdovodnenie: `Príloha č. ${c} sa vyžaduje a chýba${pr ? ' (súbor je prázdny alebo nečitateľný)' : ''}.${nahrada ? ` Náhrada: ${nahrada}.` : ''}` };
  },

  priloha8_sulad: (z, p) => suladPrilohy8(z, p),

  register(z, p) {
    const vynimka = p.parametre?.nevztahujeSaNa as string[] | undefined;
    if (vynimka?.includes(z.ziadatel.pravnaFormaKod)) return { stav: 'neuplatnuje_sa', zdovodnenie: `Podmienka sa na právnu formu „${z.ziadatel.pravnaForma}“ nevzťahuje.` };
    return { stav: 'mimo_podkladov', zdovodnenie: `Z podkladov žiadosti sa nedá overiť. Poskytovateľ overuje: ${p.overenieZdroj}.` };
  },
};
