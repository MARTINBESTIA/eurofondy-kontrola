// Jadro: prejde pravidlá balíka, spustí kontroly a zloží posudok. Nezávislé od výzvy aj od modulu.
import fs from 'node:fs';
import path from 'node:path';
import type { BalikPravidiel, Nalez, Navrh, Posudok, Pravidlo, Stav, Ziadost } from './typy.ts';
import { KONTROLY, type VysledokKontroly } from '../moduly/zonfp/kontroly.ts';
import { posudText, dokazJeVTexte, MODEL } from '../llm/ollama.ts';

const KOREN = path.join(import.meta.dirname, '..', '..');

export function nacitajBalik(vyzvaKod: string, modul = 'zonfp'): BalikPravidiel {
  return JSON.parse(fs.readFileSync(path.join(KOREN, 'packs', vyzvaKod, `${modul}.json`), 'utf8'));
}

export function zoznamBalikov(): { vyzvaKod: string; modul: string; verzia: string; nazov: string }[] {
  const dir = path.join(KOREN, 'packs');
  return fs.readdirSync(dir).flatMap((v) => fs.readdirSync(path.join(dir, v)).filter((f) => f.endsWith('.json')).map((f) => {
    const b: BalikPravidiel = JSON.parse(fs.readFileSync(path.join(dir, v, f), 'utf8'));
    return { vyzvaKod: b.vyzvaKod, modul: b.modul, verzia: b.verzia, nazov: b.vyzvaNazov };
  }));
}

async function kontrolaLlm(z: Ziadost, p: Pravidlo): Promise<VysledokKontroly> {
  const par = p.parametre ?? {};
  let text = ''; let zdroj = 'popis projektu vo formulári';
  if (par.zdroj === 'priloha') {
    const pr = z.prilohy?.[par.cislo];
    if (!pr) return { stav: (par.akChyba as Stav) ?? 'chyba_podklad', zdovodnenie: `Príloha č. ${par.cislo} nie je priložená, obsah sa nekontroluje.` };
    text = pr.text; zdroj = `príloha č. ${par.cislo} (${pr.nazov})`;
  } else text = [z.popis, z.ucel].filter(Boolean).join('\n');
  if (text.trim().length < 80) return { stav: 'chyba_podklad', zdovodnenie: `Text na posúdenie chýba alebo je príliš krátky (${zdroj}).` };
  const kontext = `Názov projektu: ${z.nazov}\nŽiadateľ: ${z.ziadatel.nazov} (${z.ziadatel.pravnaForma})`;

  // Povinné náležitosti sa overujú po jednej: model musí ku každej nájsť doslovný úryvok.
  // Hľadať jednu vec je pre malý model spoľahlivejšie než jednou otázkou zisťovať, čo z viacerých vecí chýba.
  // Úryvok musí prejsť tromi poistkami: model povie "nájdené", úryvok je v texte doslovne a zodpovedá vzoru náležitosti.
  // Tretia poistka je nutná, lebo model pri chýbajúcej náležitosti rád ponúkne iný, skutočný, ale nesúvisiaci úryvok.
  // vizualne = z textu sa dá overiť len to, že dokument s náležitosťou počíta (napr. riadok na podpis), nie že tam naozaj je.
  const nalezitosti = par.nalezitosti as { nazov: string; vzor?: string; nesmie?: string; vizualne?: boolean }[] | undefined;
  if (nalezitosti?.length) {
    const najdene: string[] = []; const chybajuce: string[] = []; const vizualne: string[] = []; let ms = 0;
    for (const n of nalezitosti) {
      const o = await posudText(`Nájdi v dokumente túto náležitosť: ${n.nazov}.\nAk v dokumente je, stav je "splnene" a do poľa "dokaz" skopíruj doslovný úryvok, v ktorom sa nachádza.\nAk v dokumente nie je, stav je "nesplnene" a pole "dokaz" nechaj prázdne. Nezamieňaj ju s inými údajmi v dokumente.`, text);
      ms += o.ms;
      const sedi = o.stav === 'splnene' && dokazJeVTexte(o.dokaz, text)
        && (!n.vzor || new RegExp(n.vzor, 'i').test(o.dokaz)) && !(n.nesmie && new RegExp(n.nesmie, 'i').test(o.dokaz));
      if (!sedi) chybajuce.push(n.nazov);
      else { najdene.push(`${n.nazov}: „${o.dokaz}“`); if (n.vizualne) vizualne.push(n.nazov); }
    }
    const hodnoty = { ms, najdene: najdene.length, chybajuce: chybajuce.length };
    if (chybajuce.length) return { stav: 'nesplnene', zdovodnenie: `V dokumente sa nenašlo: ${chybajuce.join('; ')}. (zdroj: ${zdroj})`, dokaz: najdene.join('\n') || undefined, hodnoty };
    if (vizualne.length) return { stav: 'na_preverenie', zdovodnenie: `Všetkých ${nalezitosti.length} náležitostí sa v texte našlo. Z textu sa však nedá overiť, či je dokument naozaj podpísaný: ${vizualne.join('; ')}. Treba pozrieť sken. (zdroj: ${zdroj})`, dokaz: najdene.join('\n'), hodnoty };
    return { stav: 'splnene', zdovodnenie: `Všetkých ${nalezitosti.length} náležitostí sa v dokumente našlo. (zdroj: ${zdroj})`, dokaz: najdene.join('\n'), hodnoty };
  }

  const o = await posudText(p.otazka!, text, kontext);
  const dolozene = dokazJeVTexte(o.dokaz, text);
  // Poistka proti vymyslenému dôkazu: verdikt bez doslovného úryvku z textu ide človeku.
  if (o.stav !== 'neda_sa_urcit' && !dolozene) return { stav: 'na_preverenie', zdovodnenie: `Model navrhol „${o.stav}“, ale neuviedol doslovný úryvok z textu. ${o.zdovodnenie}`, dokaz: o.dokaz, hodnoty: { ms: o.ms } };
  const stav: Stav = o.stav === 'splnene' ? 'splnene' : o.stav === 'nesplnene' ? 'nesplnene' : 'na_preverenie';
  return { stav, zdovodnenie: `${o.zdovodnenie} (zdroj: ${zdroj})`, dokaz: dolozene ? o.dokaz : undefined, hodnoty: { ms: o.ms } };
}

export interface MoznostiPosudku { llm?: boolean; iba?: string[] }

export async function posud(z: Ziadost, balik: BalikPravidiel, m: MoznostiPosudku = {}): Promise<Posudok> {
  const t0 = Date.now();
  const nalezy: Nalez[] = [];
  for (const p of balik.pravidla) {
    if (m.iba && !m.iba.includes(p.id)) continue;
    let v: VysledokKontroly;
    try {
      if (p.druh === 'llm') v = m.llm === false ? { stav: 'mimo_podkladov', zdovodnenie: 'Kontrola textu modelom je vypnutá.' } : await kontrolaLlm(z, p);
      else {
        const k = KONTROLY[p.kontrola];
        v = k ? k(z, p) : { stav: 'na_preverenie', zdovodnenie: `Kontrola „${p.kontrola}“ nie je implementovaná.` };
      }
    } catch (e) { v = { stav: 'na_preverenie', zdovodnenie: `Kontrola zlyhala: ${(e as Error).message}` }; }
    nalezy.push({ pravidlo: p.id, ppp: p.ppp, nazov: p.nazov, druh: p.druh, ...v, citacia: p.citacia, overenieZdroj: p.overenieZdroj });
  }
  const pocty = { splnene: 0, nesplnene: 0, chyba_podklad: 0, na_preverenie: 0, mimo_podkladov: 0, neuplatnuje_sa: 0 } as Record<Stav, number>;
  for (const n of nalezy) pocty[n.stav]++;
  // Poradie závažnosti zodpovedá konaniu: nesplnená PPP -> neschválenie; chýbajúci podklad -> výzva na doplnenie.
  const navrh: Navrh = pocty.nesplnene ? 'nesplnene_podmienky' : pocty.chyba_podklad ? 'vyzva_na_doplnenie' : pocty.na_preverenie ? 'na_preverenie' : 'bez_zisteni';
  const vety: Record<Navrh, string> = {
    nesplnene_podmienky: `Nesplnené podmienky: ${nalezy.filter((n) => n.stav === 'nesplnene').map((n) => `PPP č. ${n.ppp} (${n.pravidlo})`).join(', ')}.`,
    vyzva_na_doplnenie: `Chýbajú podklady: ${nalezy.filter((n) => n.stav === 'chyba_podklad').map((n) => n.pravidlo).join(', ')}. Poskytovateľ by žiadateľa vyzval na doplnenie.`,
    na_preverenie: `Bez jasného porušenia, ale ${pocty.na_preverenie} bodov musí posúdiť človek.`,
    bez_zisteni: 'V overených bodoch bez zistení.',
  };
  const zhrnutie = `${vety[navrh]} Overené z podkladov: ${pocty.splnene + pocty.nesplnene} pravidiel. Neoverené, lebo to z podkladov nejde: ${pocty.mimo_podkladov}.`;
  return { ziadostKod: z.kod, balik: balik.id, verziaBalika: balik.verzia, cas: new Date().toISOString(), trvanieMs: Date.now() - t0, model: m.llm === false ? null : MODEL, nalezy, navrh, zhrnutie, pocty };
}
