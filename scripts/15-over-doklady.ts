// Nezávislý akceptačný test dokladov pri nálezoch podateľne. Bez zápisu: číta len cez lokálne API a databázu otvára iba na čítanie.
// Pre každý posudok spisu overí:
//  1. každý splnený nález má aspoň jeden doklad;
//  2. citát dokladu je doslovne v texte súboru, ktorý kontrolór vidí v náhľade „Text“ (rovnaký reťazec);
//  3. riadky riadokOd–riadokDo v tom texte obsahujú presne citát (číslovanie ako v UI: koniec riadka aj zalomenie strany);
//  4. súbor dokladu patrí do toho istého spisu; doklad bez súboru smie citovať len uložený výpis formulára;
//  5. čítanie cez API nezmenilo uložené posudky (odtlačok posudok_json pred čítaním a po ňom).
// Voliteľne --posud vytvorí nový posudok bez modelu (zapisuje, preto len proti izolovanej kópii databázy).
// Použitie: node scripts/15-over-doklady.ts [spisId=5] [--server=http://127.0.0.1:5177] [--db=data/app.db] [--posud]
import crypto from 'node:crypto';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const volby = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => { const [k, ...v] = a.slice(2).split('='); return [k, v.length ? v.join('=') : true]; }));
const SPIS = Number(process.argv.slice(2).find((a) => !a.startsWith('--')) ?? 5);
const SERVER = String(volby.server ?? 'http://127.0.0.1:5177');
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(SERVER)) { console.error('Server musí byť lokálny.'); process.exit(2); }
const DB = String(volby.db ?? process.env.PODATELNA_DB ?? path.join(import.meta.dirname, '..', 'data', 'app.db'));

type Doklad = { suborId?: number; nazov: string; miesto: string; citat: string; riadokOd?: number; riadokDo?: number };
type Nalez = { pravidlo: string; druh: string; stav: string; zdovodnenie: string; doklady?: Doklad[]; povodDokladov?: string };
type Posudok = { id?: number; cas: string; nalezy: Nalez[]; formularItms?: { nazov: string; text: string } };

const get = async (cesta: string) => { const r = await fetch(SERVER + cesta); const j = await r.json() as any; if (!r.ok) throw new Error(`${cesta}: ${j.chyba ?? r.status}`); return j; };
const odtlacky = () => {
  const db = new DatabaseSync(DB, { readOnly: true });
  try { return new Map((db.prepare('SELECT id, posudok_json FROM posudky WHERE spis_id = ?').all(SPIS) as { id: number; posudok_json: string }[])
    .map((r) => [r.id, crypto.createHash('sha256').update(r.posudok_json).digest('hex')])); } finally { db.close(); }
};
const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
// Rovnaké delenie riadkov ako náhľad v UI (web/ui.js nahladRiadkov) a doklady-priloh.ts.
const riadky = (t: string) => t.split(/\r\n|[\r\n\f]/);

const pred = odtlacky();
const zle: string[] = []; const varovania: string[] = [];
const texty = new Map<number, { spisId: number; text: string }>();
async function textSuboru(id: number) {
  if (!texty.has(id)) { const t = await get(`/api/podatelna/subory/${id}/text`); texty.set(id, { spisId: t.spisId, text: t.text ?? '' }); }
  return texty.get(id)!;
}

async function overPosudok(p: Posudok, meno: string) {
  let splnene = 0, sDokladom = 0, dokladov = 0;
  for (const n of p.nalezy) {
    const k = `${meno} ${n.pravidlo} [${n.stav}]`;
    // Starší posudok, ktorého pravidlo sa odvtedy zmenilo, doklad mať nemôže: je to upozornenie, nie chyba dokladov.
    if (n.stav === 'splnene') { splnene++; if (n.doklady?.length) sDokladom++; else if (n.povodDokladov === 'pravidlo_zmenene') varovania.push(`${k}: bez dokladu, pravidlo sa od posudku zmenilo`); else zle.push(`${k}: splnený bez dokladu`); }
    for (const d of n.doklady ?? []) {
      dokladov++;
      if (!d.citat?.trim()) { zle.push(`${k}: prázdny citát (${d.nazov} · ${d.miesto})`); continue; }
      let text: string;
      if (d.suborId) {
        const t = await textSuboru(d.suborId);
        if (t.spisId !== SPIS) { zle.push(`${k}: súbor ${d.suborId} patrí spisu ${t.spisId}`); continue; }
        text = t.text;
      } else if (p.formularItms && d.nazov === p.formularItms.nazov) text = p.formularItms.text;
      else { zle.push(`${k}: doklad bez súboru aj bez uloženého výpisu (${d.nazov})`); continue; }
      if (!norm(text).includes(norm(d.citat))) { zle.push(`${k}: citát nie je v texte ${d.nazov}: „${d.citat.slice(0, 80)}“`); continue; }
      if (d.riadokOd !== undefined) {
        const r = riadky(text); const od = d.riadokOd, po = d.riadokDo ?? od;
        const blok = r.slice(od - 1, po).join('\n');
        if (od < 1 || po < od || po > r.length) zle.push(`${k}: riadky ${od}–${po} mimo textu (${r.length} riadkov) v ${d.nazov}`);
        else if (!norm(blok).includes(norm(d.citat))) zle.push(`${k}: riadky ${od}–${po} v ${d.nazov} neobsahujú citát „${d.citat.slice(0, 60)}“ (je tam „${norm(blok).slice(0, 60)}“)`);
        else if (norm(blok).length > norm(d.citat).length * 3 + 200) varovania.push(`${k}: riadky ${od}–${po} sú oveľa dlhšie ako citát`);
      } else if (!/bunka|hárok/i.test(d.miesto)) varovania.push(`${k}: doklad bez čísla riadka ani bunky (${d.miesto})`);
    }
    // Pri prítomnosti prílohy nesmie zdôvodnenie tvrdiť vecné overenie obsahu.
    if (n.druh === 'priloha' && n.stav === 'splnene' && /vecne overen|obsah (je|bol) overen|správnosť (je|bola) overen/i.test(n.zdovodnenie))
      zle.push(`${k}: prílohový bod tvrdí vecné overenie`);
  }
  console.log(`${meno}: splnených ${splnene}, s dokladom ${sDokladom}, dokladov spolu ${dokladov}, pôvod ${[...new Set(p.nalezy.map((n) => n.povodDokladov ?? '–'))].join('/')}`);
}

try {
  const d = await get(`/api/podatelna/spisy/${SPIS}`);
  const ids: number[] = (d.posudky ?? []).map((p: { id: number }) => p.id);
  if (!ids.length) throw new Error(`Spis ${SPIS} nemá posudky.`);
  for (const id of ids) await overPosudok((await get(`/api/podatelna/spisy/${SPIS}/posudky/${id}`)).posudok, `posudok #${id}`);
  if (d.prilohyStav) await overPosudok({ cas: '', nalezy: d.prilohyStav.map((x: any) => ({ ...x, druh: 'priloha' })) }, 'prehľad príloh');
  if (volby.posud) {
    const r = await fetch(`${SERVER}/api/podatelna/spisy/${SPIS}/posud`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ llm: false }) });
    const j = await r.json() as any; if (!r.ok) throw new Error(j.chyba);
    await overPosudok(j.posudok, 'nový posudok bez modelu');
  }
  const po = odtlacky();
  for (const [id, h] of pred) if (po.get(id) !== h) zle.push(`posudok #${id} sa v databáze zmenil pri čítaní`);
} catch (e) { zle.push(`chyba: ${(e as Error).message}`); }

for (const v of varovania) console.log(`  ! ${v}`);
for (const z of zle) console.log(`  ✗ ${z}`);
console.log(zle.length ? `\n${zle.length} problémov.` : '\nVšetky doklady sedia s textom súborov a uložené posudky sa čítaním nezmenili.');
process.exit(zle.length ? 1 : 0);
