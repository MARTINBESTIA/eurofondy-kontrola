import type { DatabaseSync } from 'node:sqlite';
import { isDeepStrictEqual } from 'node:util';
import { vyrokPosudku } from '../core/posud.ts';
import type { BalikPravidiel, Doklad, Nalez, Posudok, Ziadost } from '../core/typy.ts';
import { pripravDokladyFormulara } from '../moduly/zonfp/doklady-formular.ts';
import { dokladyPriloh } from '../moduly/zonfp/doklady-priloh.ts';
import { KONTROLY } from '../moduly/zonfp/kontroly.ts';
import { historickePodklady, spisRiadok, type ZdrojFormulara } from './podatelna.ts';

/** Vstupy vrátane identifikátorov súborov sú tie, ktoré dostala samotná kontrola pred prvým await. */
function citovanie(z: Ziadost, formular: ZdrojFormulara | undefined, balik: BalikPravidiel) {
  const zFormulara = formular && pripravDokladyFormulara(formular.text, z);
  return (n: Nalez): Doklad[] => {
    const pravidlo = balik.pravidla.find(p => p.id === n.pravidlo);
    if (!pravidlo) return [];
    const jeZFormulara = n.druh === 'data' || n.pravidlo === 'L07';
    const citacie = (jeZFormulara || n.pravidlo === 'P08' || n.pravidlo === 'P08b') && formular && zFormulara
      ? zFormulara(n).map(d => ({ ...d, nazov: formular.nazov, suborId: formular.suborId })) : [];
    if (jeZFormulara) return citacie;
    const prilohy = dokladyPriloh(z, n, pravidlo);
    if (n.pravidlo === 'P08' && n.stav === 'splnene') return prilohy.length && citacie.length ? [...prilohy, ...citacie] : [];
    // Porovnanie má dve strany: bez buniek zošita alebo bez položiek formulára nie je doložené ani jedno.
    if (n.pravidlo === 'P08b') return prilohy.length && citacie.length ? [...prilohy, ...citacie] : [];
    return prilohy;
  };
}

export function dolozPosudok(p: Posudok, z: Ziadost, formular: ZdrojFormulara | undefined, balik: BalikPravidiel) {
  const cituj = citovanie(z, formular, balik);
  for (const n of p.nalezy) {
    const doklady = cituj(n);
    n.povodDokladov = doklady.length ? 'archiv' : 'nedostupne';
    if (doklady.length) n.doklady = doklady;
    else if (n.stav === 'splnene') {
      n.stav = 'na_preverenie';
      n.zdovodnenie = 'K výsledku sa nepodarilo doložiť všetky vstupy s presným miestom v zdroji. Overte ich v podaní. ' + n.zdovodnenie;
    }
  }
  if (formular && !formular.suborId) p.formularItms = { nazov: formular.nazov, text: formular.text };
  Object.assign(p, vyrokPosudku(p.nalezy));
  return p;
}

/** Zobrazovacia kópia. Archívny JSON, výsledok a čas starého posudku zostávajú v databáze. */
export async function precitajPosudok(db: DatabaseSync, spisId: number, posudokId: number, balik: BalikPravidiel): Promise<Posudok | undefined> {
  const r = db.prepare('SELECT posudok_json FROM posudky WHERE id = ? AND spis_id = ?').get(posudokId, spisId) as { posudok_json: string } | undefined;
  if (!r) return;
  const p = JSON.parse(r.posudok_json) as Posudok;
  if (p.nalezy.some(n => n.povodDokladov !== undefined)) return p;
  const s = spisRiadok(db, spisId);
  const zaciatok = Date.parse(p.cas) - p.trvanieMs;
  const podklady = s && Number.isFinite(zaciatok) && p.balik === balik.id && p.verziaBalika === balik.verzia
    ? historickePodklady(db, s, new Date(zaciatok).toISOString()) : undefined;
  const cituj = podklady && podklady.z.kod === p.ziadostKod && citovanie(podklady.z, podklady.formular, balik);
  for (const n of p.nalezy) {
    n.povodDokladov = 'nedostupne';
    const pravidlo = balik.pravidla.find(r => r.id === n.pravidlo && r.druh === n.druh && isDeepStrictEqual(r.citacia, n.citacia));
    if (!cituj || !podklady || !pravidlo || (n.stav !== 'splnene' && !n.dokaz)) continue;
    if (n.druh !== 'llm') {
      const kontrola = KONTROLY[pravidlo.kontrola];
      if (!kontrola) continue;
      const dnes = await kontrola(podklady.z, pravidlo);
      if (dnes.stav !== n.stav || dnes.zdovodnenie !== n.zdovodnenie || !isDeepStrictEqual(dnes.hodnoty, n.hodnoty)) continue;
    }
    const doklady = cituj(n);
    if (doklady.length) { n.doklady = doklady; n.povodDokladov = 'rekonstrukcia'; }
  }
  return p;
}
