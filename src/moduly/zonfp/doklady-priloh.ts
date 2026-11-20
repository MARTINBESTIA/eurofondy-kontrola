import { isDeepStrictEqual } from 'node:util';
import type { Doklad, Nalez, Pravidlo, Priloha, Ziadost } from '../../core/typy.ts';
import { suladPrilohy8, zavaznyFormular, type ZavaznyFormular } from './kontroly.ts';
import { textBunky } from '../../ingest/dokument.ts';

type Subor = NonNullable<Priloha['subory']>[number] & { suborId: number };
type CitatPrilohy = Doklad & { suborId: number };
const cislaPriloh: Record<string, string> = { P03: '3', P05: '5', P06: '6', P07: '7', P08: '8', P08b: '8', L01: '1', L05: '5' };

// Čísla sa vzťahujú na nemenný text extrahovaný pri príjme. Staršie PDF v úložisku
// môžu mať po trim() odstránené úvodné prázdne strany, preto neodhadujeme čísla fyzických strán.
const koniecRiadka = /\r\n|[\n\r\f]/;
const literalnyVzor = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const nadpisPrilohy: Record<string, RegExp> = {
  '3': /uznesen|územn.{0,4} plán|schválen.{0,20}program/i,
  '5': /energetick.{0,3} audit/i,
  '6': /energetick.{0,3} certifikát/i,
  '7': /technická správa|projektová dokumentácia|výkres/i,
};
const dalsieRiadkyPrilohy: Record<string, RegExp[]> = {
  '3': [/schválil.{0,60}program|program.{0,60}schválil/i, /územn.{0,4} plán.{0,80}schválil|schválil.{0,80}územn.{0,4} plán/i],
  '5': [/energetick.{0,4} audítor|odborne spôsobil/i],
  '6': [/^(?:posudzovaná\s+)?(?:budova|objekt|adresa)\s*[ :–-]+\S/i],
  '7': [/technick.{0,3} správa|výkresov.{0,3} časť/i],
};

function referenciaNaText(s: Subor, citat: string, riadokOd: number, riadokDo = riadokOd): CitatPrilohy {
  const rozsah = riadokOd === riadokDo ? `riadok ${riadokOd}` : `riadky ${riadokOd}–${riadokDo}`;
  return { suborId: s.suborId, nazov: s.nazov, miesto: `${rozsah} extrahovaného textu`, citat, riadokOd, riadokDo };
}

/** Prítomnosť preukazuje samotný čitateľný obsah súboru v potvrdenom slote.
 * Nadpis pomôže kontrolórovi identifikovať doklad, nevydávame ho za posúdenie vecnej správnosti. */
function dokladPritomnosti(s: Subor, cislo: string): CitatPrilohy[] {
  const riadky = s.text.split(koniecRiadka);
  const vzor = nadpisPrilohy[cislo];
  let index = riadky.findIndex(r => vzor?.test(r));
  if (index < 0) index = riadky.findIndex(r => r.trim().length > 0);
  if (index < 0) return [];
  const indexy = new Map<number, RegExp>([[index, vzor]]);
  for (const doplnok of dalsieRiadkyPrilohy[cislo] ?? []) {
    const i = riadky.findIndex(r => doplnok.test(r.trim()));
    if (i >= 0 && !indexy.has(i)) indexy.set(i, doplnok);
  }
  return [...indexy].map(([i, hladane]) => {
    const riadok = riadky[i].trim();
    return referenciaNaText(s, vyrezRiadka(riadok, Math.max(0, riadok.search(hladane))), i + 1);
  });
}

/** Výrez dlhého riadka okolo zhody. Hranice sa posúvajú len smerom von na najbližšiu medzeru,
 * takže citát nezačína ani nekončí uprostred slova a zhodu nikdy neodreže. */
function vyrezRiadka(riadok: string, zhoda: number, pred = 50, dlzka = 350): string {
  let od = Math.max(0, zhoda - pred);
  if (od > 0) od = riadok.lastIndexOf(' ', od) + 1;
  let po = Math.min(riadok.length, od + dlzka);
  if (po < riadok.length) { const medzera = riadok.indexOf(' ', po); po = medzera < 0 ? riadok.length : medzera; }
  return riadok.slice(od, po).trim();
}

function dokladRozpoctu(z: Ziadost, n: Nalez, pr: Priloha, config: ZavaznyFormular): CitatPrilohy[] {
  const doklady: CitatPrilohy[] = [];
  const kontrola = zavaznyFormular(z, '8', pr, config, (s, riadky) => {
    const suborId = s.suborId;
    if (suborId == null) return;
    const h = s.bunky![config.harok];
    const pridaj = (adresa: string) => doklady.push({ suborId, nazov: s.nazov,
      miesto: `Hárok „${config.harok}“, bunka ${adresa}`, citat: textBunky(h[adresa]) });
    if (config.ziadatel) pridaj(config.ziadatel);
    if (config.projekt) pridaj(config.projekt);
    if (config.polozka) {
      const { pocet, cena, suma } = config.polozka;
      for (const i of riadky) for (const stlpec of [pocet, cena, suma]) pridaj(stlpec + i);
    }
  });
  if (kontrola.stav !== 'splnene' || kontrola.hodnoty?.polozky !== n.hodnoty?.polozky ||
      kontrola.hodnoty?.sumaPoloziek !== n.hodnoty?.sumaPoloziek) return [];
  return doklady;
}

/** Bunky zošita, z ktorých P08b vzala sumy, len ak opakovaná kontrola dá presne ten istý výsledok ako nález. */
function dokladSuladu(z: Ziadost, n: Nalez, pravidlo: Pravidlo): CitatPrilohy[] {
  const doklady: CitatPrilohy[] = [];
  let uplne = true;
  const kontrola = suladPrilohy8(z, pravidlo, (s, bunky) => {
    const suborId = s.suborId;
    if (suborId == null) { uplne = false; return; }
    for (const { harok, adresa } of bunky) {
      const v = s.bunky?.[harok]?.[adresa];
      if (v === undefined) { uplne = false; return; }
      doklady.push({ suborId, nazov: s.nazov, miesto: `Hárok „${harok}“, bunka ${adresa}`, citat: textBunky(v) });
    }
  });
  if (!uplne || kontrola.stav !== n.stav || kontrola.zdovodnenie !== n.zdovodnenie || !isDeepStrictEqual(kontrola.hodnoty, n.hodnoty)) return [];
  return doklady;
}

/** Model často zmení rozostupy alebo zalomenia. Hľadáme jeho slová v poradí,
 * ale do výsledku vraciame výlučne skutočný podreťazec pôvodného súboru. */
function najdiCitat(s: Subor, hladany: string): CitatPrilohy | undefined {
  const slova = hladany.trim().split(/\s+/);
  if (slova.join('').length < 4) return undefined;
  const vzor = slova.map(literalnyVzor).join('\\s+');
  const zhoda = new RegExp(vzor, 'iu').exec(s.text);
  if (!zhoda) return undefined;
  const riadokOd = s.text.slice(0, zhoda.index).split(koniecRiadka).length;
  const pocetRiadkov = zhoda[0].split(koniecRiadka).length;
  return referenciaNaText(s, zhoda[0], riadokOd, riadokOd + pocetRiadkov - 1);
}

function dokladyModelu(z: Ziadost, n: Nalez, subory: Subor[]): CitatPrilohy[] {
  if (!n.dokaz) return [];
  const kladny = n.stav === 'splnene';
  const texty = n.pravidlo === 'L01'
    ? n.dokaz.split(/\r?\n(?=[^\r\n]+?: „)/).flatMap(r => {
      const text = r.match(/^[^\r\n]+?: „([\s\S]+)“$/)?.[1];
      return text ? [text] : [];
    })
    : [n.dokaz];
  if (!texty.length || (kladny && n.pravidlo === 'L01' && texty.length !== n.hodnoty?.najdene)) return [];
  const fragmenty = texty.flatMap(t => t.split(/\[\s*(?:…|\.{3,})\s*\]|\.{3,}|…/).map(k => k.trim()).filter(Boolean));
  if (kladny && n.pravidlo === 'L05') {
    const text = fragmenty.join(' ').replace(/\s+/g, ' ');
    const projekt = [z.kod, z.nazov].filter(Boolean).some(s =>
      new RegExp(`(?<![\\p{L}\\p{N}])${literalnyVzor(s.trim().replace(/\s+/g, ' '))}(?![\\p{L}\\p{N}])`, 'iu').test(text));
    const odbornik = /energetick.{0,4} audítor|odborne spôsobil|oprávnen.{0,4} audítor/iu.test(text);
    const popretie = /bez (?:platného )?osvedčenia|nie je (?:energetick|odborne spôsobil|oprávnen)|nevypracoval|nepokrýva|nevzťahuje sa/iu.test(text);
    if (!projekt || !odbornik || popretie) return [];
  }
  // Vynechané vety sa nikdy nespoja do jedného súvislého citátu. Úplný kladný
  // dôkaz musí patriť jednému dokumentu, aj keď model čítal zlúčený text slotu.
  const ciastkove: CitatPrilohy[] = [];
  for (const s of subory) {
    const doklady = fragmenty.map(f => najdiCitat(s, f)).filter((c): c is CitatPrilohy => !!c);
    if (doklady.length === fragmenty.length && doklady.length) return doklady;
    if (!kladny) ciastkove.push(...doklady);
  }
  return ciastkove;
}

/** Podklady konkrétneho nálezu v podateľni; pri P08 musí ísť o nastavenie pôvodného pravidla. */
export function dokladyPriloh(z: Ziadost, n: Nalez, pravidlo?: Pravidlo): CitatPrilohy[] {
  const c = cislaPriloh[n.pravidlo];
  const pr = z.prilohy?.[c];
  if (!pr || pr.zaradenie !== 'potvrdene') return [];
  const subory = (pr.subory ?? []).filter((s): s is Subor => s.suborId != null && s.citatelny && s.text.trim().length > 0);
  if (n.pravidlo === 'L01' || n.pravidlo === 'L05') return dokladyModelu(z, n, subory);
  // Pri nesúlade súm sú bunky zošita podkladom pre kontrolóra rovnako ako pri zhode.
  if (n.pravidlo === 'P08b') return pravidlo?.id === n.pravidlo ? dokladSuladu(z, n, pravidlo) : [];
  if (n.stav !== 'splnene') return [];
  if (n.pravidlo === 'P08') {
    const config = pravidlo?.id === n.pravidlo ? pravidlo.parametre?.zavaznyFormular : undefined;
    return config ? dokladRozpoctu(z, n, pr, config) : [];
  }
  return subory.flatMap(s => dokladPritomnosti(s, c));
}
