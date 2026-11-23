// Jadro: prejde pravidlá balíka, spustí kontroly modulu a zloží posudok. Nevie nič o výzve ani o type vstupu.
import fs from 'node:fs';
import path from 'node:path';
import type { BalikPravidiel, Citacia, Doklad, HarmonogramKol, Modul, Nalez, Navrh, Podmienka, Posudok, Pravidlo, Stav, VyberVerzie, VysledokKontroly } from './typy.ts';
import { posudText, dokazJeVTexte, MODEL } from '../llm/ollama.ts';
import { nacitajKontroluZmien, nacitajZakladZmien, nalezyZmienVyzvy, type KontrolaZmien } from './zmeny.ts';

const KOREN = path.join(import.meta.dirname, '..', '..');

export function nacitajBalik(vyzvaKod: string, modul = 'zonfp'): BalikPravidiel {
  return JSON.parse(fs.readFileSync(path.join(KOREN, 'packs', vyzvaKod, `${modul}.json`), 'utf8'));
}

/** Všetky verzie balíka: platná (packs/<výzva>/<modul>.json) a archívne (packs/<výzva>/verzie/<id>/<modul>.json), od najstaršej. */
export function verzieBalika(vyzvaKod: string, modul = 'zonfp'): BalikPravidiel[] {
  const archiv = path.join(KOREN, 'packs', vyzvaKod, 'verzie');
  const starsie = fs.existsSync(archiv) ? fs.readdirSync(archiv, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(archiv, d.name, `${modul}.json`)))
    .map((d) => JSON.parse(fs.readFileSync(path.join(archiv, d.name, `${modul}.json`), 'utf8')) as BalikPravidiel) : [];
  return [...starsie, nacitajBalik(vyzvaKod, modul)].sort((a, b) => (a.verziaBalika?.odKola ?? 0) - (b.verziaBalika?.odKola ?? 0));
}

/** Kolo žiadosti predloženej v daný deň: prvé kolo, ktoré sa uzatvára v ten deň alebo neskôr. */
export function koloPodlaDatumu(datum: string, h: HarmonogramKol): number {
  const d = datum.slice(0, 10);
  if (d <= h.kolo1) return 1;
  if (d <= h.kolo2) return 2;
  return 2 + Math.ceil((Date.parse(d) - Date.parse(h.kolo2)) / 86_400_000 / h.krokDni);
}

const dalsiDen = (d: string) => new Date(Date.parse(d.slice(0, 10)) + 86_400_000).toISOString().slice(0, 10);
const datumSk = (d: string) => d.slice(0, 10).split('-').reverse().join('. ');

/**
 * Vyberie znenie výzvy (verziu balíka) podľa posudzovaného obdobia žiadosti. Zmena výzvy platí pre aktuálne posudzované
 * obdobie a nasledujúce (§ 14 ods. 4 zákona č. 121/2022 Z. z.), preto rozhoduje kolo: z ITMS21+, inak podľa dátumu
 * predloženia a harmonogramu kôl. Bod pre kontrolóra (druh verzia, na preverenie) vznikne, keď kolo chýba, keď kolo
 * z ITMS21+ a kolo z dátumu patria pod rôzne znenia, keď žiadosť prišla v deň uzavretia kola na hranici znení, keď bola
 * predložená pred účinnosťou zmeny, ktorá sa na ňu už vzťahuje (§ 14 ods. 5), a keď znenie ešte neschválil človek.
 * Modul bez okamihPodania alebo balík bez verzií: platný balík, bez výberu.
 */
export function vyberVerziu(vyzvaKod: string, modul: Modul, v: unknown): { balik: BalikPravidiel; vyber: VyberVerzie | null; nalezy: Nalez[] } {
  const verzie = verzieBalika(vyzvaKod, modul.id);
  const platna = verzie.find((b) => b.verziaBalika?.stav === 'platna') ?? verzie[verzie.length - 1];
  if (!platna.verziaBalika || !modul.okamihPodania) return { balik: platna, vyber: null, nalezy: [] };
  const h = platna.harmonogramKol;
  const { kolo: koloItms, datum } = modul.okamihPodania(v);
  const koloDatum = datum && h ? koloPodlaDatumu(datum, h) : null;
  const kolo = koloItms ?? koloDatum;
  const pre = (k: number) => [...verzie].reverse().find((b) => (b.verziaBalika?.odKola ?? 1) <= k);
  const balik = (kolo != null ? pre(kolo) : undefined) ?? platna;
  const vb = balik.verziaBalika!;
  const dalsia = verzie.find((b) => (b.verziaBalika?.odKola ?? 0) > vb.odKola);
  const doKola = dalsia ? dalsia.verziaBalika!.odKola - 1 : null;
  const rozsah = doKola ? `kolá ${vb.odKola}–${doKola}` : `kolá od ${vb.odKola}`;
  const nalezy: Nalez[] = [];
  const bod = (pravidlo: string, nazov: string, zdovodnenie: string, citacia: Citacia) =>
    nalezy.push({ pravidlo, ppp: null, nazov, druh: 'verzia', stav: 'na_preverenie', okamih: 'konanie', zdovodnenie, citacia });
  const citKol = h?.citacia ?? vb.citacia;
  if (kolo == null) bod('VER-KOLO', 'Posudzované obdobie (kolo) žiadosti', `Žiadosť nemá kolo z ITMS21+ ani dátum predloženia, preto sa nedá určiť, ktoré znenie výzvy sa na ňu vzťahuje (§ 14 ods. 4 zákona č. 121/2022 Z. z.). Použité je najnovšie znenie (${platna.verzia}). Kontrolór určí kolo a znenie.`, citKol);
  else if (!pre(kolo)) bod('VER-KOLO', 'Posudzované obdobie (kolo) žiadosti', `Kolo ${kolo} je skôr než prvé znenie výzvy v softvéri (od kola ${verzie[0].verziaBalika?.odKola}). Použité je znenie ${balik.verzia}. Kontrolór overí, ktoré znenie platí.`, citKol);
  if (koloItms != null && koloDatum != null && pre(koloItms) !== pre(koloDatum))
    bod('VER-KOLO', 'Posudzované obdobie (kolo) žiadosti', `Kolo z ITMS21+ (${koloItms}) a kolo podľa dátumu predloženia ${datumSk(datum!)} (${koloDatum}) patria pod rôzne znenia výzvy: ${pre(koloItms)?.verzia ?? '?'} a ${pre(koloDatum)?.verzia ?? '?'}. Použité je znenie podľa kola z ITMS21+. Kontrolór overí zaradenie žiadosti do kola.`, citKol);
  if (koloItms == null && datum && h && koloDatum != null && pre(koloDatum) !== pre(koloPodlaDatumu(dalsiDen(datum), h)))
    bod('VER-KOLO', 'Posudzované obdobie (kolo) žiadosti', `Žiadosť je predložená ${datumSk(datum)}, v deň uzavretia kola ${koloDatum}. Ak prišla po termíne uzavretia, patrí do kola ${koloDatum + 1}, na ktoré sa vzťahuje iné znenie výzvy (${pre(koloDatum + 1)?.verzia ?? '?'}). Kontrolór overí čas predloženia.`, citKol);
  if (datum && kolo != null && datum.slice(0, 10) < balik.platnaOd)
    bod('VER-ZMENA', 'Žiadosť predložená pred zmenou výzvy', `Žiadosť je predložená ${datumSk(datum)}, pred účinnosťou znenia ${balik.verzia} (${datumSk(balik.platnaOd)}), ale v kole ${kolo}, na ktoré sa toto znenie už vzťahuje. Posudzuje sa podľa neho. Žiadateľ musí dostať možnosť zosúladiť žiadosť so zmenou v lehote najmenej 10 pracovných dní (§ 14 ods. 5 zákona č. 121/2022 Z. z.). Kontrolór overí, že bol vyzvaný, a nedostatky vyplývajúce zo zmeny rieši výzvou na doplnenie, nie neschválením.`, vb.citacia);
  if (vb.schvalenie.stav !== 'schvalene')
    bod('VER-SCHVALENIE', 'Pravidlá pre toto znenie výzvy čakajú na schválenie', `Pravidlá pre znenie ${balik.verzia} (${rozsah}) sú návrh, ktorý ešte neschválil človek. ${vb.schvalenie.poznamka} Kým ich neschváli, výsledok je len predbežný.`, vb.citacia);
  const zdroj = koloItms != null ? `Kolo ${koloItms} z ITMS21+` : koloDatum != null ? `Kolo ${koloDatum} podľa dátumu predloženia ${datumSk(datum!)}` : 'Kolo sa nedá určiť';
  return { balik, nalezy, vyber: {
    verziaId: vb.id, verzia: balik.verzia, odKola: vb.odKola, doKola, kolo,
    zdrojKola: koloItms != null ? 'itms' : koloDatum != null ? 'datum' : null, datumPredlozenia: datum ? datum.slice(0, 10) : null,
    zdovodnenie: `${zdroj} → znenie výzvy ${balik.verzia} (${rozsah}).`,
  } };
}

/**
 * Posudok podľa znenia výzvy pre kolo žiadosti (vyberVerziu). Vráti aj použitý balík, ktorý treba na doklady.
 * Výzva so základom zmien v ITMS21+ dostane aj body z kontroly zmien (nalezyZmienVyzvy): neposúdená zmena alebo
 * chýbajúca či stará kontrola znamená, že pravidlá nemusia zodpovedať platnému zneniu výzvy.
 */
export async function posudPodlaKola(v: any, vyzvaKod: string, modul: Modul, m: MoznostiPosudku = {}): Promise<{ balik: BalikPravidiel; posudok: Posudok }> {
  const { balik, vyber, nalezy } = vyberVerziu(vyzvaKod, modul, v);
  const posudok = await posud(v, balik, modul, m);
  if (vyber) posudok.vyberVerzie = vyber;
  const zaklad = vyber ? nacitajZakladZmien(vyzvaKod) : null;
  if (zaklad) nalezy.push(...nalezyZmienVyzvy(m.zmenyVyzvy !== undefined ? m.zmenyVyzvy : nacitajKontroluZmien(vyzvaKod), zaklad.citacia, m.dnes));
  // Ako inventár: čiastková kontrola (iba) body o znení nepridáva.
  if (!m.iba && nalezy.length) { posudok.nalezy.unshift(...nalezy); Object.assign(posudok, vyrokPosudku(posudok.nalezy)); }
  return { balik, posudok };
}

export function zoznamBalikov(): { vyzvaKod: string; modul: string; verzia: string; nazov: string }[] {
  const dir = path.join(KOREN, 'packs');
  return fs.readdirSync(dir, { withFileTypes: true }).filter((v) => v.isDirectory()).flatMap((v) => {
    const subory = fs.readdirSync(path.join(dir, v.name), { withFileTypes: true });
    return subory.filter((f) => f.isFile() && f.name.endsWith('.json')).map((f) => {
      const b = nacitajBalik(v.name, path.basename(f.name, '.json'));
      return { vyzvaKod: b.vyzvaKod, modul: b.modul, verzia: b.verzia, nazov: b.vyzvaNazov };
    });
  });
}

/**
 * vzor: úryvok mu musí zodpovedať; nesmie: úryvok mu nesmie zodpovedať (zámena s podobným údajom);
 * nesmieRiadok: celý riadok textu, z ktorého úryvok pochádza, mu nesmie zodpovedať (napr. IBAN z riadku „Protistrana“).
 * vzorOkolie: ak úryvok vzoru nezodpovedá, vzor aj zákaz sa skúsia na úryvku spolu s toľkými susednými riadkami.
 *   Len pre podpisy: model cituje meno pod čiarou („Ing. X, starosta“), slovo „podpis“ je o riadok vyššie.
 *   Nezapínať pri sumách a údajoch, kde susedný riadok nesie iný údaj (popisok tabuľky by „potvrdil“ zlé číslo).
 * formalna: formálna náležitosť (podpis, pečiatka), nie údaj z obsahu dokumentu. Kontroluje sa len pri zapnutej
 *   kontrole formálnych náležitostí; inak sa vynechá a nález aj výrok posudku ju uvedú ako nekontrolovanú.
 */
export interface Nalezitost { nazov: string; vzor?: string; nesmie?: string; nesmieRiadok?: string; vizualne?: boolean; vzorOkolie?: number; formalna?: boolean }

const normRiadok = (x: string) => x.toLowerCase().replace(/[\s"„“”'’‚‘.,;:()–-]+/g, '');
/** Indexy riadkov zdrojového textu, z ktorých pochádza úryvok (porovnanie bez medzier a interpunkcie). */
function indexyUryvku(dokaz: string, riadky: string[]): number[] {
  const kusy = dokaz.split(/\.{3,}|…/).map(normRiadok).filter((k) => k.length >= 4);
  return riadky.flatMap((r, i) => { const nr = normRiadok(r); return nr.length > 0 && kusy.some((k) => nr.includes(k) || (nr.length >= 6 && k.includes(nr))) ? [i] : []; });
}
/** Riadky zdrojového textu, z ktorých pochádza úryvok. */
export function riadkyUryvku(dokaz: string, text: string): string[] {
  const riadky = text.split(/\r?\n/);
  return indexyUryvku(dokaz, riadky).map((i) => riadky[i]);
}
/** Úryvok s okolím: pre každý výskyt zvlášť riadky i−n až i+n (nie rozpätie medzi výskytmi, to by bolo príliš voľné). */
export function okoliaUryvku(dokaz: string, text: string, n: number): string[] {
  const riadky = text.split(/\r?\n/);
  return indexyUryvku(dokaz, riadky).map((i) => riadky.slice(Math.max(0, i - n), i + n + 1).join('\n').trim());
}

/**
 * Doklady k nálezom modulov (VO, ŽoP, zmeny, ukazovatele, výzvy): vstupy, z ktorých kontrola rozhodla, s miestom
 * v zdroji. „Splnené“ bez dokladu ide človeku rovnako ako v podateľni (src/podatelna/doklady.ts).
 */
export const BEZ_DOKLADU = 'K výsledku sa nepodarilo doložiť všetky vstupy s presným miestom v zdroji. Overte ich v podkladoch. ';
export function dolozNalez(n: Nalez, doklady: Doklad[]): void {
  n.povodDokladov = doklady.length ? 'archiv' : 'nedostupne';
  if (doklady.length) n.doklady = doklady;
  else if (n.stav === 'splnene') { n.stav = 'na_preverenie'; n.zdovodnenie = BEZ_DOKLADU + n.zdovodnenie; }
}

/**
 * Úryvky, ktoré citoval model, ako doklady s číslami riadkov textu. Pri náležitostiach je dôkaz zložený z častí
 * „názov: „úryvok““ (vyhodnotNalezitosti); nazvy ich oddelia, aby každá náležitosť mala vlastné miesto.
 * Úryvok, ktorý sa v texte nenájde, doklad nemá.
 */
export function dokladyUryvkov(dokaz: string | undefined, text: string, nazov: string, nazvy: string[] = []): Doklad[] {
  if (!dokaz?.trim() || !text.trim()) return [];
  const zaciatky = nazvy.map((nz) => ({ nz, i: dokaz.indexOf(`${nz}: „`) })).filter((x) => x.i >= 0).sort((a, b) => a.i - b.i);
  const casti = zaciatky.length ? zaciatky.map((x, k) => ({ popis: x.nz, uryvok: dokaz.slice(x.i + x.nz.length + 3, k + 1 < zaciatky.length ? zaciatky[k + 1].i : undefined).replace(/“\s*$/, '') }))
    : [{ popis: '', uryvok: dokaz }];
  const riadky = text.split(/\r?\n/);
  return casti.flatMap(({ popis, uryvok }) => {
    const ix = indexyUryvku(uryvok, riadky); if (!ix.length) return [];
    const od = Math.min(...ix) + 1, po = Math.max(...ix) + 1;
    return [{ nazov, miesto: `${popis ? `${popis}: ` : ''}riadok ${od}${po > od ? `–${po}` : ''}`, citat: uryvok.trim(), riadokOd: od, riadokDo: po }];
  });
}

/** Doklady k pravidlu llm_text: úryvky modelu v prílohe, poli alebo hlavnom texte, ktorý pravidlo čítalo. */
export function dokladyTextu(v: any, n: Nalez, p: Pravidlo, modul: Modul): Doklad[] {
  const par = p.parametre ?? {};
  const nazvy = ((par.nalezitosti ?? []) as Nalezitost[]).map((x) => x.nazov);
  if (par.zdroj === 'priloha') { const pr = v.prilohy?.[par.cislo]; return pr ? dokladyUryvkov(n.dokaz, pr.text, pr.nazov, nazvy) : []; }
  if (par.zdroj === 'pole') return dokladyUryvkov(n.dokaz, String(v[par.pole] ?? ''), par.nazovPola ?? `pole ${par.pole}`, nazvy);
  return dokladyUryvkov(n.dokaz, modul.hlavnyText(v), 'text na posúdenie', nazvy);
}

/**
 * Hľadanie jednej veci v texte s poistkami: model povie "nájdené", úryvok je v texte doslovne,
 * zodpovedá vzoru a nezodpovedá zakázanému vzoru (ani on, ani jeho riadok). Vzory sú nutné, lebo model
 * pri chýbajúcej veci rád ponúkne iný, skutočný, ale nesúvisiaci úryvok (základ dane namiesto DPH,
 * IBAN protistrany namiesto vlastného účtu).
 */
export async function najdiVTexte(n: Nalezitost, text: string): Promise<{ najdene: boolean; dokaz: string; ms: number }> {
  const o = await posudText(`Nájdi v dokumente túto náležitosť: ${n.nazov}.\nAk v dokumente je, stav je "splnene" a do poľa "dokaz" skopíruj doslovný úryvok, v ktorom sa nachádza.\nAk v dokumente nie je, stav je "nesplnene" a pole "dokaz" nechaj prázdne. Nezamieňaj ju s inými údajmi v dokumente.`, text);
  if (o.stav !== 'splnene') return { najdene: false, dokaz: o.dokaz, ms: o.ms };
  return { ...overUryvok(n, o.dokaz, text), ms: o.ms };
}

/** Poistky na úryvok, ktorý model uviedol ako nájdenú náležitosť (bez volania modelu, testovateľné samostatne). */
export function overUryvok(n: Nalezitost, dokaz: string, text: string): { najdene: boolean; dokaz: string } {
  const vzorOk = (s: string) => !n.vzor || new RegExp(n.vzor, 'i').test(s);
  const zakazOk = (s: string) => !(n.nesmie && new RegExp(n.nesmie, 'i').test(s));
  const zaklad = dokazJeVTexte(dokaz, text) && zakazOk(dokaz)
    && !(n.nesmieRiadok && riadkyUryvku(dokaz, text).some((r) => new RegExp(n.nesmieRiadok!, 'i').test(r)));
  if (!zaklad) return { najdene: false, dokaz };
  if (vzorOk(dokaz)) return { najdene: true, dokaz };
  // Okolie: celý blok (úryvok aj susedné riadky) musí vzoru zodpovedať a zákazu nie; dôkazom je potom celý blok,
  // aby kontrolór videl, z čoho softvér vychádzal.
  const blok = n.vzorOkolie ? okoliaUryvku(dokaz, text, n.vzorOkolie).find((b) => vzorOk(b) && zakazOk(b)) : undefined;
  return { najdene: !!blok, dokaz: blok ?? dokaz };
}

/** Riadky textu, ktoré zodpovedajú vzoru náležitosti a nie zákazu (pre náležitosť, ktorú model nenašiel). */
function riadkyVzoru(n: Nalezitost, text: string): string[] {
  if (!n.vzor) return [];
  const vzor = new RegExp(n.vzor, 'i'); const zakaz = n.nesmie ? new RegExp(n.nesmie, 'i') : null; const zakazR = n.nesmieRiadok ? new RegExp(n.nesmieRiadok, 'i') : null;
  return text.split(/\r?\n/).map((r) => r.trim()).filter((r) => r && vzor.test(r) && !zakaz?.test(r) && !zakazR?.test(r));
}
/**
 * Náležitosti na kontrolu. Bez kontroly formálnych náležitostí sa formálne (podpisy) vynechajú a vrátia sa ich názvy,
 * aby ich nález aj výrok uviedli ako nekontrolované, nie ako overené.
 */
export function nalezitostiNaKontrolu(vsetky: Nalezitost[], formalne: boolean): { kontrolovane: Nalezitost[]; vynechane: string[] } {
  if (formalne) return { kontrolovane: vsetky, vynechane: [] };
  return { kontrolovane: vsetky.filter((n) => !n.formalna), vynechane: vsetky.filter((n) => n.formalna).map((n) => n.nazov) };
}

/**
 * Výsledok kontroly náležitostí z výsledkov hľadania po jednej (bez volania modelu, testovateľné samostatne).
 * „Nesplnené“ len vtedy, keď náležitosť nenašiel model ani vzor v texte. Ostatné prípady idú človeku:
 * - vizuálna náležitosť (podpis): z textu sa nedá overiť, či tam je, ani že chýba (prázdna čiara aj podpis dajú rovnaký text);
 * - model nenašiel, ale text obsahuje riadok zodpovedajúci vzoru: malý model niekedy prehliadne aj dvakrát uvedený dátum.
 * vynechane: formálne náležitosti vynechané pri vypnutej kontrole; zdôvodnenie ich vymenuje a výsledok ich nesie ďalej.
 */
export function vyhodnotNalezitosti(nalezitosti: Nalezitost[], vysledky: { najdene: boolean; dokaz: string }[], text: string, zdroj: string, ms = 0, vynechane: string[] = []): VysledokKontroly {
  const najdene: string[] = []; const chybajuce: string[] = []; const vizualne: string[] = []; const sporne: string[] = [];
  nalezitosti.forEach((n, i) => {
    const r = vysledky[i];
    if (r.najdene) { najdene.push(`${n.nazov}: „${r.dokaz}“`); if (n.vizualne) vizualne.push(n.nazov); return; }
    if (n.vizualne) { vizualne.push(`${n.nazov} (model ju v texte nenašiel)`); return; }
    const kandidat = riadkyVzoru(n, text)[0];
    if (kandidat) sporne.push(`${n.nazov}: model ju nenašiel, ale text obsahuje „${kandidat.slice(0, 160)}“`);
    else chybajuce.push(n.nazov);
  });
  const hodnoty = { ms, najdene: najdene.length, chybajuce: chybajuce.length, sporne: sporne.length };
  const dokaz = najdene.join('\n') || undefined;
  const nekontrolovane = vynechane.length ? ` Formálne náležitosti sa nekontrolovali (kontrola je vypnutá): ${vynechane.join('; ')}.` : '';
  const aj = [sporne.length ? ` Sporné: ${sporne.join('; ')}.` : '', vizualne.length ? ` Treba pozrieť sken (podpisy sa z textu overiť nedajú): ${vizualne.join('; ')}.` : '', nekontrolovane].join('');
  const vyn = vynechane.length ? { vynechaneFormalne: vynechane } : {};
  if (chybajuce.length) return { stav: 'nesplnene', zdovodnenie: `V dokumente sa nenašlo: ${chybajuce.join('; ')}.${aj} (zdroj: ${zdroj})`, dokaz, hodnoty, ...vyn };
  if (sporne.length || vizualne.length) return { stav: 'na_preverenie', zdovodnenie: `Nájdené náležitosti: ${najdene.length} z ${nalezitosti.length}.${aj} (zdroj: ${zdroj})`, dokaz, hodnoty, ...vyn };
  return { stav: 'splnene', zdovodnenie: `Všetkých ${nalezitosti.length} ${vynechane.length ? 'obsahových ' : ''}náležitostí sa v dokumente našlo.${nekontrolovane} (zdroj: ${zdroj})`, dokaz, hodnoty, ...vyn };
}

async function kontrolaLlm(v: any, p: Pravidlo, modul: Modul, formalne = true): Promise<VysledokKontroly> {
  const par = p.parametre ?? {};
  let text = ''; let zdroj = 'text vo formulári';
  if (par.zdroj === 'priloha') {
    const pr = v.prilohy?.[par.cislo];
    if (!pr) return { stav: (par.akChyba as Stav) ?? 'chyba_podklad', zdovodnenie: `Príloha č. ${par.cislo} nie je priložená, obsah sa nekontroluje.` };
    text = pr.text; zdroj = `príloha č. ${par.cislo} (${pr.nazov})`;
  } else if (par.zdroj === 'pole') { text = String(v[par.pole] ?? ''); zdroj = par.nazovPola ?? `pole ${par.pole}`; }
  else text = modul.hlavnyText(v);
  if (text.trim().length < 80) return { stav: (par.akKratky as Stav) ?? 'chyba_podklad', zdovodnenie: `Text na posúdenie chýba alebo je príliš krátky (${zdroj}).` };

  // Povinné náležitosti sa overujú po jednej: hľadať jednu vec je pre malý model spoľahlivejšie
  // než jednou otázkou zisťovať, čo z viacerých vecí chýba.
  // vizualne = z textu sa dá overiť len to, že dokument s náležitosťou počíta, nie že tam naozaj je (podpis).
  // formalna = pri vypnutej kontrole formálnych náležitostí sa vôbec nehľadá, nález ju uvedie ako nekontrolovanú.
  const vsetky = par.nalezitosti as Nalezitost[] | undefined;
  if (vsetky?.length) {
    const { kontrolovane, vynechane } = nalezitostiNaKontrolu(vsetky, formalne);
    if (!kontrolovane.length) return { stav: 'mimo_podkladov', zdovodnenie: `Pravidlo kontroluje len formálne náležitosti a ich kontrola je vypnutá: ${vynechane.join('; ')}.`, vynechaneFormalne: vynechane };
    const vysledky: { najdene: boolean; dokaz: string }[] = []; let ms = 0;
    for (const n of kontrolovane) { const r = await najdiVTexte(n, text); ms += r.ms; vysledky.push(r); }
    return vyhodnotNalezitosti(kontrolovane, vysledky, text, zdroj, ms, vynechane);
  }

  return overVerdikt(await posudText(p.otazka!, text, modul.kontext(v)), text, par, zdroj);
}

// Deterministické poistky nad verdiktom modelu. Bez volania modelu, aby ich overenie-poistiek vedelo otestovať.
export function overVerdikt(o: { stav: string; zdovodnenie: string; dokaz: string; ms?: number }, text: string, par: Record<string, any>, zdroj: string): VysledokKontroly {
  const dolozene = dokazJeVTexte(o.dokaz, text);
  const hodnoty = { ms: o.ms };
  // poznamka = pevná veta pravidla k výsledku (napr. čo bod NEoveruje), aby ju neprekryla úvaha modelu.
  const pozn = par.poznamka ? ` ${par.poznamka}` : '';
  // Poistka proti vymyslenému dôkazu: verdikt bez doslovného úryvku z textu ide človeku.
  if (o.stav !== 'neda_sa_urcit' && !dolozene) return { stav: 'na_preverenie', zdovodnenie: `Model navrhol „${o.stav}“, ale neuviedol doslovný úryvok z textu. ${o.zdovodnenie}${pozn}`, dokaz: o.dokaz, hodnoty };
  // vzorDokazu: pri „splnené“ musí úryvok obsahovať aj výslovný údaj, o ktorý sa verdikt opiera (inak človek).
  if (o.stav === 'splnene' && par.vzorDokazu && !new RegExp(par.vzorDokazu, 'i').test(o.dokaz)) return { stav: 'na_preverenie', zdovodnenie: `Model navrhol „splnené“, ale úryvok „${o.dokaz}“ neobsahuje výslovný údaj, o ktorý by sa to dalo oprieť. ${o.zdovodnenie}${pozn}`, dokaz: o.dokaz, hodnoty };
  // vzorPodozrenia: text žiadosti sám uvádza okolnosť, ktorú bod neposudzuje, ale ktorá oprávnenosť môže vylúčiť
  // (pri L07 súkromné vlastníctvo, ktoré overuje G10). „Splnené“ vtedy ide človeku aj s citovaným miestom.
  const m = o.stav === 'splnene' && par.vzorPodozrenia ? text.match(new RegExp(par.vzorPodozrenia, 'iu')) : null;
  if (m) {
    const zac = text.lastIndexOf(' ', Math.max(0, m.index! - 40)) + 1, kon = text.indexOf(' ', m.index! + m[0].length + 20);
    const okolie = text.slice(zac, kon < 0 ? undefined : kon).replace(/\s+/g, ' ').trim();
    return { stav: 'na_preverenie', zdovodnenie: `Model navrhol „splnené“, ale text žiadosti uvádza: „…${okolie}…“. ${par.podozrenie ?? 'Treba to overiť.'}${pozn} (zdroj: ${zdroj})`, dokaz: o.dokaz, hodnoty };
  }
  const stav: Stav = o.stav === 'splnene' ? 'splnene' : o.stav === 'nesplnene' ? 'nesplnene' : 'na_preverenie';
  return { stav, zdovodnenie: `${o.zdovodnenie}${pozn} (zdroj: ${zdroj})`, dokaz: dolozene ? o.dokaz : undefined, hodnoty };
}

/**
 * formalne: false = formálne náležitosti (podpisy) sa nekontrolujú, kontroluje sa len obsah; výrok potom nesmie znieť
 * ako úplné „bez zistení“. Predvolene sa kontrolujú (podateľňa posiela false, kým kontrolór prepínač nezapne).
 * zmenyVyzvy a dnes: pevný výsledok kontroly zmien a dátum namiesto súboru a dnešného dňa (testy).
 */
export interface MoznostiPosudku { llm?: boolean; formalne?: boolean; iba?: string[]; zmenyVyzvy?: KontrolaZmien | null; dnes?: string }

export async function posud(v: any, balik: BalikPravidiel, modul: Modul, m: MoznostiPosudku = {}): Promise<Posudok> {
  const t0 = Date.now();
  const nalezy: Nalez[] = [];
  for (const p of balik.pravidla) {
    if (m.iba && !m.iba.includes(p.id)) continue;
    let r: VysledokKontroly;
    try {
      if (p.druh === 'llm' && p.kontrola === 'llm_text') r = m.llm === false ? { stav: 'mimo_podkladov', zdovodnenie: 'Kontrola textu modelom je vypnutá.' } : await kontrolaLlm(v, p, modul, m.formalne !== false);
      else {
        const k = modul.kontroly[p.kontrola];
        // Kontroly druhu llm s vlastnou implementáciou dostanú príznak, či smú volať model.
        r = k ? await k(m.llm === false ? { ...v, __bezModelu: true } : v, p) : { stav: 'na_preverenie', zdovodnenie: `Kontrola „${p.kontrola}“ nie je implementovaná.` };
      }
    } catch (e) { r = { stav: 'na_preverenie', zdovodnenie: `Kontrola zlyhala: ${(e as Error).message}` }; }
    nalezy.push({ pravidlo: p.id, ppp: p.ppp, nazov: p.nazov, druh: p.druh, ...r, citacia: p.citacia, overenieZdroj: p.overenieZdroj });
  }
  // Moduly s dokladmi: každý nález cituje svoje vstupy; text čítaný modelom sa cituje po riadkoch, ak modul neuvedie iné.
  if (modul.doklady) for (const n of nalezy) {
    const p = balik.pravidla.find((x) => x.id === n.pravidlo)!;
    const d = modul.doklady(v, n, p);
    dolozNalez(n, d.length || p.druh !== 'llm' ? d : dokladyTextu(v, n, p, modul));
  }
  // Výber pravidiel (iba) je čiastková kontrola, napr. len prílohy po nahratí; úplnosť sa posudzuje len pri celom posudku.
  if (!m.iba) nalezy.push(...nalezyInventara(balik, modul, m.formalne !== false));
  return { ziadostKod: modul.titulok(v).kod, balik: balik.id, verziaBalika: balik.verzia, cas: new Date().toISOString(), trvanieMs: Date.now() - t0, model: m.llm === false ? null : MODEL, formalne: m.formalne !== false, nalezy, ...vyrokPosudku(nalezy) };
}

const KEDY: Record<Exclude<Podmienka['okamih'], 'konanie'>, string> = {
  pred_zmluvou: 'po schválení žiadosti, pred uzavretím zmluvy o NFP',
  realizacia: 'počas realizácie projektu podľa zmluvy o NFP',
  na_mieste: 'pri finančnej kontrole na mieste, ak ju vykoná',
  udrzatelnost: 'v období udržateľnosti projektu',
};

/**
 * Poistka úplnosti: podmienka z inventára, ktorú pravidlá nepokrývajú celú, ide kontrolórovi ako samostatný bod (druh rucne).
 * Pri posúdení podania (konanie) je to na_preverenie: údaje sú v podaní, softvér ich len nečíta. Podmienka overovaná
 * mimo tohto podania (pred zmluvou, v realizácii, na mieste, v udržateľnosti) je mimo_podkladov: v tomto podaní sa overiť
 * nedá, ale výsledok preto nesmie znieť ako úplné „bez zistení“. Pokrytie, ktoré balík neuvádza, sa berie ako žiadne.
 * Formálna podmienka (podpis) sa pri vypnutej kontrole formálnych náležitostí nekontroluje; výrok to uvedie.
 */
export function nalezyInventara(balik: BalikPravidiel, modul: Pick<Modul, 'inventarPodmienok'>, formalne = true): Nalez[] {
  if (!balik.podmienky) return modul.inventarPodmienok ? [{
    pravidlo: 'INV', ppp: null, nazov: 'Úplnosť kontroly voči podmienkam výzvy', druh: 'rucne', stav: 'na_preverenie', okamih: 'konanie',
    zdovodnenie: 'Balík pravidiel nevymenúva podmienky výzvy, preto softvér nevie, či jeho kontrola pokrýva všetky. Kontrolór musí prejsť všetky podmienky výzvy sám.',
    citacia: { dokument: balik.vyzvaNazov || balik.vyzvaKod, cast: 'celá výzva', znenie: '' },
  }] : [];
  return balik.podmienky.filter((p) => p.pokrytie !== 'uplne').map((p): Nalez => {
    const zvysok = p.neoverene?.trim() || 'celú podmienku podľa jej znenia';
    const zaklad = { pravidlo: p.id, ppp: p.ppp, nazov: p.nazov, druh: 'rucne' as const, okamih: p.okamih, citacia: p.citacia };
    if (p.formalna && !formalne) return { ...zaklad, stav: 'mimo_podkladov', vynechaneFormalne: [p.nazov],
      zdovodnenie: `Formálna náležitosť sa nekontrolovala, kontrola formálnych náležitostí je vypnutá. Týka sa: ${zvysok}.` };
    const zdovodnenie = p.okamih !== 'konanie'
      ? `Z tohto podania sa neoveruje, poskytovateľ ju overuje ${KEDY[p.okamih]}. Týka sa: ${zvysok}.`
      : p.pravidla.length && p.pokrytie === 'ciastocne'
        ? `Pravidlá ${p.pravidla.join(', ')} overujú len časť podmienky. Kontrolór overí: ${zvysok}.`
        : `Softvér túto podmienku nekontroluje. Kontrolór overí: ${zvysok}.`;
    return { ...zaklad, stav: p.okamih === 'konanie' ? 'na_preverenie' : 'mimo_podkladov', zdovodnenie };
  });
}

export function vyrokPosudku(nalezy: Nalez[]): Pick<Posudok, 'navrh' | 'zhrnutie' | 'pocty'> {
  const pocty = { splnene: 0, nesplnene: 0, chyba_podklad: 0, na_preverenie: 0, mimo_podkladov: 0, neuplatnuje_sa: 0 } as Record<Stav, number>;
  for (const n of nalezy) pocty[n.stav]++;
  // Poradie závažnosti: nesplnené pravidlo, potom chýbajúci podklad, potom bod pre človeka.
  // Keď sa z podkladov neoverilo nič, výsledok nesmie vyzerať ako „v poriadku“.
  // Ak časť pravidiel z podkladov overiť nejde, výsledok nesmie znieť ako úplné „bez zistení“.
  // To isté platí, keď sa vypnutím kontroly formálnych náležitostí vynechali podpisy: obsah môže byť v poriadku, podpis nie.
  const mimo = nalezy.filter((n) => n.stav === 'mimo_podkladov').map((n) => n.pravidlo);
  const bezFormalnych = nalezy.filter((n) => n.vynechaneFormalne?.length).map((n) => n.pravidlo);
  const navrh: Navrh = pocty.nesplnene ? 'nesplnene_podmienky' : pocty.chyba_podklad ? 'vyzva_na_doplnenie' : pocty.na_preverenie || !pocty.splnene ? 'na_preverenie' : mimo.length || bezFormalnych.length ? 'ciastocne_overene' : 'bez_zisteni';
  const id = (n: Nalez) => (n.ppp ? `PPP č. ${n.ppp} (${n.pravidlo})` : n.pravidlo);
  const vety: Record<Navrh, string> = {
    nesplnene_podmienky: `Nesplnené: ${nalezy.filter((n) => n.stav === 'nesplnene').map(id).join(', ')}.`,
    vyzva_na_doplnenie: `Chýbajú podklady: ${nalezy.filter((n) => n.stav === 'chyba_podklad').map((n) => n.pravidlo).join(', ')}.`,
    na_preverenie: pocty.na_preverenie ? `Bez jasného porušenia, ale ${pocty.na_preverenie} ${pocty.na_preverenie === 1 ? 'bod musí' : pocty.na_preverenie < 5 ? 'body musia' : 'bodov musí'} posúdiť človek.` : 'Z dostupných podkladov sa nedalo overiť žiadne pravidlo, treba doplniť údaje.',
    ciastocne_overene: `V ${pocty.splnene} overených bodoch bez zistení, ale ${mimo.length ? `${mimo.length} bodov sa z podkladov overiť nedá (${mimo.join(', ')})` : 'formálne náležitosti sa nekontrolovali'}. Nie je to súhlas s celým prípadom.`,
    bez_zisteni: 'Všetky pravidlá overené, bez zistení.',
  };
  const rucne = nalezy.filter((n) => n.druh === 'rucne').length;
  const formalne = bezFormalnych.length ? ` Formálne náležitosti (podpisy) sa nekontrolovali, kontrola je vypnutá: ${bezFormalnych.join(', ')}.` : '';
  const zhrnutie = `${vety[navrh]}${formalne} Overené z podkladov: ${pocty.splnene + pocty.nesplnene} pravidiel. Neoverené, lebo to z podkladov nejde: ${pocty.mimo_podkladov}.${rucne ? ` Podmienky, ktoré softvér nekontroluje vôbec alebo len sčasti: ${rucne}.` : ''}`;
  return { navrh, zhrnutie, pocty };
}
