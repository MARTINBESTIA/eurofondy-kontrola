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

export const VYSVETLENIE_PPP = 'PPP je podmienka poskytnutia príspevku. Číslo odkazuje na podmienku vo výzve. Jednu podmienku môže overovať viac kontrolných bodov.';

/** Súbor sa uvádza raz. Každá citácia má vlastnú polohu aj pri opakujúcich sa hodnotách. */
export function kresliDoklady(doklady, formularItms) {
  const podklady = el('div', { class: 'doklady' });
  for (const skupina of Map.groupBy(doklady, d => d.suborId ?? d.nazov).values()) {
    const { suborId, nazov } = skupina[0];
    const maSubor = Number.isSafeInteger(suborId) && suborId > 0;
    const zdroj = maSubor
      ? el('a', { href: `/api/podatelna/subory/${suborId}/stiahni`, download: nazov, title: 'Stiahnuť pôvodný súbor' }, nazov)
      : el('span', {}, nazov);
    let textSuboru;
    const nacitajText = maSubor ? async () => {
      textSuboru ??= api(`/api/podatelna/subory/${suborId}/text`).then(r => r.text).catch(e => { textSuboru = undefined; throw e; });
      return textSuboru;
    } : nazov === formularItms?.nazov ? () => formularItms.text : null;
    const citacia = d => el('figure', { class: 'citacia-podkladu' },
      el('figcaption', { class: 'tlmene male' }, d.miesto), el('blockquote', { class: 'dokaz' }, d.citat),
      Number.isInteger(d.riadokOd) && nacitajText ? nahladRiadkov(d, nacitajText) : null);
    let dalsie = null;
    if (skupina.length > 3) {
      const zoznam = el('div');
      dalsie = el('details', { class: 'dalsie-citacie', ontoggle: e => {
        if (e.currentTarget.open && !zoznam.hasChildNodes()) zoznam.append(...skupina.slice(3).map(citacia));
      } }, el('summary', {}, `Ďalšie citácie (${skupina.length - 3})`), zoznam);
    }
    podklady.append(el('div', { class: 'doklad' }, el('strong', { class: 'zdroj-dokladu' }, zdroj),
      ...skupina.slice(0, 3).map(citacia),
      dalsie));
  }
  return podklady;
}

/** Číslovanie podľa uloženého textu. Zalomenie strany v PDF tiež ukončuje riadok. */
function nahladRiadkov(d, nacitajText) {
  const ukazka = el('div', { class: 'nahlad-riadkov', role: 'status' });
  let zacate = false;
  return el('details', { class: 'okolie-citacie', ontoggle: async e => {
    if (!e.currentTarget.open || zacate) return;
    zacate = true;
    ukazka.textContent = 'Načítavam riadky…';
    try {
      const text = await nacitajText();
      const riadky = (text ?? '').split(/\r\n|[\r\n\f]/);
      const od = d.riadokOd, koniec = d.riadokDo ?? od;
      const blok = riadky.slice(od - 1, koniec).join('\n');
      const citat = d.citat.replace(/\r\n|[\r\f]/g, '\n');
      if (od < 1 || koniec < od || koniec > riadky.length || !citat || !blok.includes(citat)) {
        ukazka.textContent = 'V náhľade sa nepodarilo overiť polohu citácie.';
        return;
      }
      ukazka.replaceChildren();
      for (let r = Math.max(1, od - 2); r <= Math.min(koniec + 2, riadky.length); r++) {
        if (r === od + 4 && koniec - r > 2) {
          ukazka.append(el('div', { class: 'tlmene' }, '…'));
          r = koniec - 1;
        }
        let obsah = riadky[r - 1];
        if (obsah.length > 600) {
          const poloha = Math.max(0, obsah.indexOf(d.citat));
          const zaciatok = Math.max(0, poloha - 80);
          obsah = (zaciatok ? '…' : '') + obsah.slice(zaciatok, zaciatok + 600) + (zaciatok + 600 < obsah.length ? '…' : '');
        }
        const prvok = r >= od && r <= koniec ? 'mark' : 'span';
        ukazka.append(el('div', { class: 'riadok-podkladu' }, el('span', { class: 'cislo-riadku' }, String(r)), el(prvok, {}, obsah || ' ')));
      }
    } catch (e) {
      zacate = false;
      ukazka.textContent = `Text sa nepodarilo načítať. ${e.message}`;
    }
  } }, el('summary', {}, 'Ukázať riadky v kontexte'), ukazka);
}

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
export function kresliNalezy(k, nalezy, zoSpisu = false, formularItms) {
  k.replaceChildren();
  if (nalezy.some(n => n.ppp)) k.append(el('p', { class: 'vysvetlenie-ppp tlmene male' }, VYSVETLENIE_PPP));
  for (const s of Object.keys(NADPISY)) {
    const cast = nalezy.filter((n) => n.stav === s); if (!cast.length) continue;
    k.append(el('div', { class: 'sk-nadpis' }, `${NADPISY[s]} (${cast.length})`));
    for (const n of cast) k.append(el('details', { class: 'nalez', open: ['nesplnene', 'chyba_podklad', 'na_preverenie'].includes(s) ? '' : false },
      el('summary', {}, el('span', { class: `stitok s-${n.stav}` }, STAVY[n.stav]),
        el('span', {}, el('span', { class: 'nz' }, `${n.ppp ? `PPP č. ${n.ppp} · ` : ''}${n.nazov}`), el('br'), el('span', { class: 'zd' }, n.zdovodnenie),
          n.doklady?.length ? el('span', { class: 'prvy-doklad' }, `${n.doklady[0].nazov} · ${n.doklady[0].miesto}`,
            n.doklady.length > 1 ? ` · citácií spolu ${n.doklady.length}` : '') : null)),
      el('div', { class: 'vnutro' },
        n.doklady?.length ? el('section', { class: 'podklad-bodu' },
          el('h4', {}, 'Dôkaz k výsledku kontroly'),
          n.povodDokladov === 'rekonstrukcia' ? el('p', { class: 'tlmene male' }, 'Citácie boli dohľadané dodatočne v podkladoch dostupných v čase posúdenia.') : null,
          n.pravidlo === 'P08b' ? el('p', { class: 'tlmene male' }, 'Kontrola porovnala oprávnené výdavky vypočítané v záväznom zošite so sumami položiek rozpočtu vo formulári. Oprávnenosť jednotlivých výdavkov neposudzuje.')
          : n.druh === 'priloha' && n.stav === 'splnene' ? el('p', { class: 'tlmene male' }, n.pravidlo === 'P08'
            ? 'Kontrola overila vyplnenie záväzného zošita a jeho priradenie k žiadosti.'
            : 'Kontrola overila prítomnosť čitateľnej prílohy priradenej k tomuto bodu.') : null,
          kresliDoklady(n.doklady, formularItms)) : null,
        zoSpisu && n.stav === 'splnene' && !n.doklady?.length ? el('p', { class: 'tlmene male' }, 'K tomuto výsledku chýba overiteľná citácia z podkladu.') : null,
        n.dokaz && !n.doklady?.length ? el('div', {}, el('strong', {}, 'Text zaznamenaný pri posúdení'),
          el('p', { class: 'tlmene male' }, 'Posudok pri ňom neuvádza presné miesto v podklade.'), el('blockquote', {}, n.dokaz)) : null,
        el('h4', {}, 'Znenie pravidla'), el('span', { class: 'tlmene' }, `${n.pravidlo} · ${n.citacia.dokument}, ${n.citacia.cast}`), el('blockquote', {}, n.citacia.znenie),
        n.overenieZdroj ? el('div', { class: 'tlmene' }, n.overenieZdroj) : null)));
  }
}
