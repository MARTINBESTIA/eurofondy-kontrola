// Spoločné pomocné funkcie rozhrania. Všetok text ide cez textContent, nič z dát sa nevkladá ako HTML.
export const $ = (s, koren = document) => koren.querySelector(s);
export const el = (tag, attrs = {}, ...deti) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) { if (k === 'class') e.className = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (v !== false && v != null) e.setAttribute(k, v); }
  for (const d of deti.flat()) if (d != null && d !== false) e.append(d.nodeType ? d : document.createTextNode(String(d)));
  return e;
};
export const api = async (cesta, telo) => {
  const r = await fetch(cesta, telo ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(telo) } : undefined);
  const j = await r.json();
  if (!r.ok) throw new Error(j.chyba ?? `HTTP ${r.status}`);
  return j;
};
export const cislo = (n, d = 1) => (n == null ? '–' : Number(n).toLocaleString('sk-SK', { maximumFractionDigits: d }));
export const pct = (a, b) => (b ? `${cislo((a / b) * 100)} %` : '–');
export const datum = (iso) => (iso ? new Date(iso).toLocaleString('sk-SK', { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '–');
/** Súbor na base64 cez FileReader (rýchlejšie a bez limitu argumentov oproti String.fromCharCode). */
export const naBase64 = (f) => new Promise((ok, zle) => { const r = new FileReader(); r.onload = () => ok(String(r.result).replace(/^data:[^,]*,/, '')); r.onerror = () => zle(r.error); r.readAsDataURL(f); });

export const STAVY = {
  nesplnene: 'Nesplnené', chyba_podklad: 'Chýba podklad', na_preverenie: 'Na preverenie',
  splnene: 'Splnené', mimo_podkladov: 'Neoverené', neuplatnuje_sa: 'Neuplatňuje sa',
};
export const NADPISY = {
  nesplnene: 'Nesplnené', chyba_podklad: 'Chýbajúce podklady (výzva na doplnenie)', na_preverenie: 'Musí posúdiť človek',
  splnene: 'Overené a splnené', mimo_podkladov: 'Softvér neoveril: chýbajú údaje alebo dokumenty', neuplatnuje_sa: 'Neuplatňuje sa',
};
export const VERDIKTY = {
  nesplnene_podmienky: 'Zistené porušenie pravidiel', vyzva_na_doplnenie: 'Chýbajú podklady',
  na_preverenie: 'Treba posúdenie človekom', ciastocne_overene: 'Čiastočne overené: v overených bodoch bez zistení',
  bez_zisteni: 'Všetky pravidlá overené, bez zistení',
};
/** Krátke názvy návrhov pre štítky v zoznamoch. */
export const NAVRHY_KRATKO = {
  nesplnene_podmienky: 'porušenie', vyzva_na_doplnenie: 'chýbajú podklady', na_preverenie: 'na preverenie', ciastocne_overene: 'čiastočne overené', bez_zisteni: 'bez zistení',
};
export const DRUHY = { data: 'výpočet z údajov', priloha: 'prítomnosť dokumentu', llm: 'text číta lokálny model', register: 'register (voliteľný online dopyt alebo overuje poskytovateľ)' };

/** Rámik s výrokom posudku: návrh, zhrnutie, pokrytie overenými pravidlami a pôvod (verzia pravidiel, model). */
export function kresliVerdikt(v, p) {
  v.className = `verdikt ${p.navrh}`;
  const overitelne = p.nalezy.length - p.pocty.neuplatnuje_sa;
  v.replaceChildren(el('strong', {}, VERDIKTY[p.navrh]), el('span', {}, p.zhrnutie),
    el('div', { class: 'pokrytie', title: 'Podiel pravidiel, ktoré softvér z podkladov naozaj overil' },
      el('div', { class: 'pruh' }, el('span', { style: `width:${overitelne ? ((p.pocty.splnene + p.pocty.nesplnene) / overitelne) * 100 : 0}%` })),
      el('span', { class: 'male' }, `Overené ${p.pocty.splnene + p.pocty.nesplnene} z ${overitelne} pravidiel, ktoré sa na prípad vzťahujú`)),
    el('div', { class: 'tlmene male' }, `Pravidlá: ${p.verziaBalika} · ${p.model ? `model ${p.model}` : 'bez modelu'} · ${(p.trvanieMs / 1000).toFixed(1)} s · softvér navrhuje, rozhoduje človek`));
}

/** Zistenia zoskupené podľa stavu; nesplnené, chýbajúce a na preverenie sú rozbalené. */
export function kresliNalezy(k, nalezy) {
  k.replaceChildren();
  for (const s of Object.keys(NADPISY)) {
    const cast = nalezy.filter((n) => n.stav === s); if (!cast.length) continue;
    k.append(el('div', { class: 'sk-nadpis' }, `${NADPISY[s]} (${cast.length})`));
    for (const n of cast) k.append(el('details', { class: 'nalez', open: ['nesplnene', 'chyba_podklad', 'na_preverenie'].includes(s) ? '' : false },
      el('summary', {}, el('span', { class: `stitok s-${n.stav}` }, STAVY[n.stav]),
        el('span', {}, el('span', { class: 'nz' }, `${n.ppp ? `PPP č. ${n.ppp} · ` : ''}${n.nazov}`), el('br'), el('span', { class: 'zd' }, n.zdovodnenie))),
      el('div', { class: 'vnutro' },
        n.dokaz ? el('div', {}, el('span', { class: 'tlmene' }, 'Úryvok z dokumentu:'), el('blockquote', { class: 'dokaz' }, n.dokaz)) : null,
        el('span', { class: 'tlmene' }, `Pravidlo ${n.pravidlo} · ${n.citacia.dokument}, ${n.citacia.cast}:`), el('blockquote', {}, n.citacia.znenie),
        n.overenieZdroj ? el('div', { class: 'tlmene' }, n.overenieZdroj) : null)));
  }
}
