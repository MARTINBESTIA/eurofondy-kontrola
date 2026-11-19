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
 */
export interface Nalezitost { nazov: string; vzor?: string; nesmie?: string; nesmieRiadok?: string; vizualne?: boolean }

/** Riadky zdrojového textu, z ktorých pochádza úryvok (porovnanie bez medzier a interpunkcie). */
export function riadkyUryvku(dokaz: string, text: string): string[] {
  const n = (x: string) => x.toLowerCase().replace(/[\s"„“”'’‚‘.,;:()–-]+/g, '');
  const kusy = dokaz.split(/\.{3,}|…/).map(n).filter((k) => k.length >= 4);
  return text.split(/\r?\n/).filter((r) => { const nr = n(r); return nr.length > 0 && kusy.some((k) => nr.includes(k) || (nr.length >= 6 && k.includes(nr))); });
}

/**
 * Hľadanie jednej veci v texte s poistkami: model povie "nájdené", úryvok je v texte doslovne,
 * zodpovedá vzoru a nezodpovedá zakázanému vzoru (ani on, ani jeho riadok). Vzory sú nutné, lebo model
 * pri chýbajúcej veci rád ponúkne iný, skutočný, ale nesúvisiaci úryvok (základ dane namiesto DPH,
 * IBAN protistrany namiesto vlastného účtu).
 */
export async function najdiVTexte(n: Nalezitost, text: string): Promise<{ najdene: boolean; dokaz: string; ms: number }> {
  const o = await posudText(`Nájdi v dokumente túto náležitosť: ${n.nazov}.\nAk v dokumente je, stav je "splnene" a do poľa "dokaz" skopíruj doslovný úryvok, v ktorom sa nachádza.\nAk v dokumente nie je, stav je "nesplnene" a pole "dokaz" nechaj prázdne. Nezamieňaj ju s inými údajmi v dokumente.`, text);
  const sedi = o.stav === 'splnene' && dokazJeVTexte(o.dokaz, text)
    && (!n.vzor || new RegExp(n.vzor, 'i').test(o.dokaz)) && !(n.nesmie && new RegExp(n.nesmie, 'i').test(o.dokaz))
    && !(n.nesmieRiadok && riadkyUryvku(o.dokaz, text).some((r) => new RegExp(n.nesmieRiadok!, 'i').test(r)));
  return { najdene: sedi, dokaz: o.dokaz, ms: o.ms };
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
    const najdene: string[] = []; const chybajuce: string[] = []; const vizualne: string[] = []; let ms = 0;
    for (const n of nalezitosti) {
      const r = await najdiVTexte(n, text); ms += r.ms;
      if (!r.najdene) chybajuce.push(n.nazov);
      else { najdene.push(`${n.nazov}: „${r.dokaz}“`); if (n.vizualne) vizualne.push(n.nazov); }
    }
    const hodnoty = { ms, najdene: najdene.length, chybajuce: chybajuce.length };
    if (chybajuce.length) return { stav: 'nesplnene', zdovodnenie: `V dokumente sa nenašlo: ${chybajuce.join('; ')}. (zdroj: ${zdroj})`, dokaz: najdene.join('\n') || undefined, hodnoty };
    if (vizualne.length) return { stav: 'na_preverenie', zdovodnenie: `Všetkých ${nalezitosti.length} náležitostí sa v texte našlo. Z textu sa však nedá overiť, či je dokument naozaj podpísaný: ${vizualne.join('; ')}. Treba pozrieť sken. (zdroj: ${zdroj})`, dokaz: najdene.join('\n'), hodnoty };
    return { stav: 'splnene', zdovodnenie: `Všetkých ${nalezitosti.length} náležitostí sa v dokumente našlo. (zdroj: ${zdroj})`, dokaz: najdene.join('\n'), hodnoty };
  }

  const o = await posudText(p.otazka!, text, modul.kontext(v));
  const dolozene = dokazJeVTexte(o.dokaz, text);
  // Poistka proti vymyslenému dôkazu: verdikt bez doslovného úryvku z textu ide človeku.
  if (o.stav !== 'neda_sa_urcit' && !dolozene) return { stav: 'na_preverenie', zdovodnenie: `Model navrhol „${o.stav}“, ale neuviedol doslovný úryvok z textu. ${o.zdovodnenie}`, dokaz: o.dokaz, hodnoty: { ms: o.ms } };
  const stav: Stav = o.stav === 'splnene' ? 'splnene' : o.stav === 'nesplnene' ? 'nesplnene' : 'na_preverenie';
  return { stav, zdovodnenie: `${o.zdovodnenie} (zdroj: ${zdroj})`, dokaz: dolozene ? o.dokaz : undefined, hodnoty: { ms: o.ms } };
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
    na_preverenie: pocty.na_preverenie ? `Bez jasného porušenia, ale ${pocty.na_preverenie} bodov musí posúdiť človek.` : 'Z dostupných podkladov sa nedalo overiť žiadne pravidlo, treba doplniť údaje.',
    ciastocne_overene: `V ${pocty.splnene} overených bodoch bez zistení, ale ${pocty.mimo_podkladov} bodov sa z podkladov overiť nedá (${nalezy.filter((n) => n.stav === 'mimo_podkladov').map((n) => n.pravidlo).join(', ')}). Nie je to súhlas s celým prípadom.`,
    bez_zisteni: 'Všetky pravidlá overené, bez zistení.',
  };
  const zhrnutie = `${vety[navrh]} Overené z podkladov: ${pocty.splnene + pocty.nesplnene} pravidiel. Neoverené, lebo to z podkladov nejde: ${pocty.mimo_podkladov}.`;
  return { ziadostKod: modul.titulok(v).kod, balik: balik.id, verziaBalika: balik.verzia, cas: new Date().toISOString(), trvanieMs: Date.now() - t0, model: m.llm === false ? null : MODEL, nalezy, navrh, zhrnutie, pocty };
}
