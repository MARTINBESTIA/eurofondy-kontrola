// Jadro: prejde pravidlá balíka, spustí kontroly modulu a zloží posudok. Nevie nič o výzve ani o type vstupu.
import fs from 'node:fs';
import path from 'node:path';
import type { BalikPravidiel, Modul, Nalez, Navrh, Posudok, Pravidlo, Stav, VysledokKontroly } from './typy.ts';
import { posudText, dokazJeVTexte, MODEL } from '../llm/ollama.ts';

const KOREN = path.join(import.meta.dirname, '..', '..');

export function nacitajBalik(vyzvaKod: string, modul = 'zonfp'): BalikPravidiel {
  return JSON.parse(fs.readFileSync(path.join(KOREN, 'packs', vyzvaKod, `${modul}.json`), 'utf8'));
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
 */
export interface Nalezitost { nazov: string; vzor?: string; nesmie?: string; nesmieRiadok?: string; vizualne?: boolean; vzorOkolie?: number }

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
 * Výsledok kontroly náležitostí z výsledkov hľadania po jednej (bez volania modelu, testovateľné samostatne).
 * „Nesplnené“ len vtedy, keď náležitosť nenašiel model ani vzor v texte. Ostatné prípady idú človeku:
 * - vizuálna náležitosť (podpis): z textu sa nedá overiť, či tam je, ani že chýba (prázdna čiara aj podpis dajú rovnaký text);
 * - model nenašiel, ale text obsahuje riadok zodpovedajúci vzoru: malý model niekedy prehliadne aj dvakrát uvedený dátum.
 */
export function vyhodnotNalezitosti(nalezitosti: Nalezitost[], vysledky: { najdene: boolean; dokaz: string }[], text: string, zdroj: string, ms = 0): VysledokKontroly {
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
  const aj = [sporne.length ? ` Sporné: ${sporne.join('; ')}.` : '', vizualne.length ? ` Treba pozrieť sken (podpisy sa z textu overiť nedajú): ${vizualne.join('; ')}.` : ''].join('');
  if (chybajuce.length) return { stav: 'nesplnene', zdovodnenie: `V dokumente sa nenašlo: ${chybajuce.join('; ')}.${aj} (zdroj: ${zdroj})`, dokaz, hodnoty };
  if (sporne.length || vizualne.length) return { stav: 'na_preverenie', zdovodnenie: `Nájdené náležitosti: ${najdene.length} z ${nalezitosti.length}.${aj} (zdroj: ${zdroj})`, dokaz, hodnoty };
  return { stav: 'splnene', zdovodnenie: `Všetkých ${nalezitosti.length} náležitostí sa v dokumente našlo. (zdroj: ${zdroj})`, dokaz, hodnoty };
}

async function kontrolaLlm(v: any, p: Pravidlo, modul: Modul): Promise<VysledokKontroly> {
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
  const nalezitosti = par.nalezitosti as Nalezitost[] | undefined;
  if (nalezitosti?.length) {
    const vysledky: { najdene: boolean; dokaz: string }[] = []; let ms = 0;
    for (const n of nalezitosti) { const r = await najdiVTexte(n, text); ms += r.ms; vysledky.push(r); }
    return vyhodnotNalezitosti(nalezitosti, vysledky, text, zdroj, ms);
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

export interface MoznostiPosudku { llm?: boolean; iba?: string[] }

export async function posud(v: any, balik: BalikPravidiel, modul: Modul, m: MoznostiPosudku = {}): Promise<Posudok> {
  const t0 = Date.now();
  const nalezy: Nalez[] = [];
  for (const p of balik.pravidla) {
    if (m.iba && !m.iba.includes(p.id)) continue;
    let r: VysledokKontroly;
    try {
      if (p.druh === 'llm' && p.kontrola === 'llm_text') r = m.llm === false ? { stav: 'mimo_podkladov', zdovodnenie: 'Kontrola textu modelom je vypnutá.' } : await kontrolaLlm(v, p, modul);
      else {
        const k = modul.kontroly[p.kontrola];
        // Kontroly druhu llm s vlastnou implementáciou dostanú príznak, či smú volať model.
        r = k ? await k(m.llm === false ? { ...v, __bezModelu: true } : v, p) : { stav: 'na_preverenie', zdovodnenie: `Kontrola „${p.kontrola}“ nie je implementovaná.` };
      }
    } catch (e) { r = { stav: 'na_preverenie', zdovodnenie: `Kontrola zlyhala: ${(e as Error).message}` }; }
    nalezy.push({ pravidlo: p.id, ppp: p.ppp, nazov: p.nazov, druh: p.druh, ...r, citacia: p.citacia, overenieZdroj: p.overenieZdroj });
  }
  return { ziadostKod: modul.titulok(v).kod, balik: balik.id, verziaBalika: balik.verzia, cas: new Date().toISOString(), trvanieMs: Date.now() - t0, model: m.llm === false ? null : MODEL, nalezy, ...vyrokPosudku(nalezy) };
}

export function vyrokPosudku(nalezy: Nalez[]): Pick<Posudok, 'navrh' | 'zhrnutie' | 'pocty'> {
  const pocty = { splnene: 0, nesplnene: 0, chyba_podklad: 0, na_preverenie: 0, mimo_podkladov: 0, neuplatnuje_sa: 0 } as Record<Stav, number>;
  for (const n of nalezy) pocty[n.stav]++;
  // Poradie závažnosti: nesplnené pravidlo, potom chýbajúci podklad, potom bod pre človeka.
  // Keď sa z podkladov neoverilo nič, výsledok nesmie vyzerať ako „v poriadku“.
  // Ak časť pravidiel z podkladov overiť nejde, výsledok nesmie znieť ako úplné „bez zistení“.
  const navrh: Navrh = pocty.nesplnene ? 'nesplnene_podmienky' : pocty.chyba_podklad ? 'vyzva_na_doplnenie' : pocty.na_preverenie || !pocty.splnene ? 'na_preverenie' : pocty.mimo_podkladov ? 'ciastocne_overene' : 'bez_zisteni';
  const id = (n: Nalez) => (n.ppp ? `PPP č. ${n.ppp} (${n.pravidlo})` : n.pravidlo);
  const vety: Record<Navrh, string> = {
    nesplnene_podmienky: `Nesplnené: ${nalezy.filter((n) => n.stav === 'nesplnene').map(id).join(', ')}.`,
    vyzva_na_doplnenie: `Chýbajú podklady: ${nalezy.filter((n) => n.stav === 'chyba_podklad').map((n) => n.pravidlo).join(', ')}.`,
    na_preverenie: pocty.na_preverenie ? `Bez jasného porušenia, ale ${pocty.na_preverenie} ${pocty.na_preverenie === 1 ? 'bod musí' : pocty.na_preverenie < 5 ? 'body musia' : 'bodov musí'} posúdiť človek.` : 'Z dostupných podkladov sa nedalo overiť žiadne pravidlo, treba doplniť údaje.',
    ciastocne_overene: `V ${pocty.splnene} overených bodoch bez zistení, ale ${pocty.mimo_podkladov} bodov sa z podkladov overiť nedá (${nalezy.filter((n) => n.stav === 'mimo_podkladov').map((n) => n.pravidlo).join(', ')}). Nie je to súhlas s celým prípadom.`,
    bez_zisteni: 'Všetky pravidlá overené, bez zistení.',
  };
  const zhrnutie = `${vety[navrh]} Overené z podkladov: ${pocty.splnene + pocty.nesplnene} pravidiel. Neoverené, lebo to z podkladov nejde: ${pocty.mimo_podkladov}.`;
  return { navrh, zhrnutie, pocty };
}
