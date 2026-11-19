// Rozhranie dema. Bez frameworku; všetok text ide cez textContent, nič z dát sa nevkladá ako HTML.
// Rozhranie je všeobecné: modul cez API povie, aké má prípady, polia, dokumenty a pravidlá.
import { $, el, api, cislo, pct, naBase64, STAVY, VERDIKTY, DRUHY, kresliVerdikt, kresliNalezy } from './ui.js';
import { zobrazPodatelnu } from './podatelna.js';

let stav = null, modul = null, vybrane = null, povodny = null, prilohy = {};
let karta = location.hash.startsWith('#p/') ? 'podatelna' : (() => { try { return localStorage.getItem('karta') ?? 'podatelna'; } catch { return 'podatelna'; } })();

// ---------- karty a moduly
for (const k of document.querySelectorAll('.karta')) k.addEventListener('click', () => { karta = k.dataset.karta; kresliKartu(); });
function kresliKartu() {
  try { localStorage.setItem('karta', karta); } catch {}
  document.querySelectorAll('.karta').forEach((x) => x.classList.toggle('aktivna', x.dataset.karta === karta));
  document.querySelectorAll('main.panel').forEach((p) => (p.hidden = p.id !== karta));
  // Podateľňa pracuje so žiadosťami o NFP vo všetkých výzvach s pravidlami; výber kroku procesu (modulu) tam nemá zmysel.
  $('#moduly').hidden = karta === 'podatelna';
  if (karta === 'podatelna') zobrazPodatelnu(stav).catch((e) => $('#podatelna-detail').replaceChildren(el('p', {}, `Chyba: ${e.message}`)));
  else if (location.hash.startsWith('#p/')) history.replaceState(null, '', location.pathname);
  if (karta === 'test') nacitajTest().catch((e) => $('#test-obsah').replaceChildren(el('p', {}, `Chyba: ${e.message}`)));
  if (karta === 'pravidla') nacitajPravidla().catch((e) => $('#pravidla-obsah').replaceChildren(el('p', {}, `Chyba: ${e.message}`)));
}
function vyberModul(id, prepni = true) {
  modul = stav.moduly.find((m) => m.id === id) ?? stav.moduly[0];
  try { localStorage.setItem('modul', modul.id); } catch {}
  document.querySelectorAll('.modul').forEach((b) => b.classList.toggle('aktivny', b.dataset.modul === modul.id));
  $('#filter').replaceChildren(el('option', { value: '' }, 'Všetky'), ...modul.filtre.map((f) => el('option', { value: f.hodnota }, f.nazov)));
  $('#hladaj').value = ''; vybrane = null;
  $('#prazdne').hidden = false; $('#obsah').hidden = true;
  $('#prazdne-nazov').textContent = modul.nazov; $('#prazdne-popis').textContent = modul.popis;
  nacitajZoznam();
  // Klik na krok procesu prepne z Podateľne na kontrolu daného modulu; pri štarte aplikácie sa karta nemení.
  if (!prepni) return;
  if (karta === 'podatelna') karta = 'kontrola';
  kresliKartu();
}

// ---------- zoznam prípadov
async function nacitajZoznam() {
  const m = modul.id;
  const j = await api(`/api/${m}/pripady?q=${encodeURIComponent($('#hladaj').value)}&filter=${encodeURIComponent($('#filter').value)}`);
  if (m !== modul.id) return;
  $('#pocet').textContent = `${j.spolu} prípadov${j.spolu > j.pripady.length ? `, zobrazených prvých ${j.pripady.length}` : ''}`;
  $('#pripady').replaceChildren(...j.pripady.map((p) => el('li', { 'data-id': p.id, class: vybrane?.id === p.id ? 'vybrana' : '', onclick: () => vyber(p.id) },
    el('span', { class: 'n' }, p.nazov), el('span', { class: 'm' }, el('span', {}, p.podnazov), el('span', {}, p.stitok ?? '')))));
}
let casovac; $('#hladaj').addEventListener('input', () => { clearTimeout(casovac); casovac = setTimeout(nacitajZoznam, 200); });
$('#filter').addEventListener('change', nacitajZoznam);

// ---------- detail prípadu
async function vyber(id) {
  const j = await api(`/api/${modul.id}/pripad/${encodeURIComponent(id)}`);
  vybrane = { id, ...j }; povodny = JSON.stringify(j.formular); prilohy = {};
  document.querySelectorAll('#pripady li').forEach((li) => li.classList.toggle('vybrana', li.dataset.id === id));
  $('#prazdne').hidden = true; $('#obsah').hidden = false; $('#vysledok').hidden = true;
  $('#kod').textContent = j.titulok.kod; $('#nazov').textContent = j.titulok.nazov; $('#podnazov').textContent = j.titulok.podnazov;
  $('#suhrn').textContent = j.suhrn; $('#suhrn').hidden = !j.suhrn;
  kresliPolia(j.polia, j.formular);
  $('#mamPrilohy').checked = false; kresliPrilohy(j.prilohy);
}

function kresliPolia(polia, f) {
  $('#polia').replaceChildren(...polia.map((p) => {
    const hodnota = f[p.kluc] ?? '';
    let vstup;
    if (p.typ === 'dlhy_text') vstup = el('textarea', { rows: 6, 'data-kluc': p.kluc });
    else if (p.typ === 'vyber' || p.typ === 'anone') {
      const moz = p.moznosti ?? [{ hodnota: 'ano', nazov: 'áno' }, { hodnota: 'nie', nazov: 'nie' }];
      if (!moz.some((m) => m.hodnota === String(hodnota))) moz.push({ hodnota: String(hodnota), nazov: String(hodnota) });
      vstup = el('select', { 'data-kluc': p.kluc }, moz.map((m) => el('option', { value: m.hodnota }, m.nazov)));
    } else vstup = el('input', { 'data-kluc': p.kluc, type: p.typ === 'cislo' ? 'number' : p.typ === 'datum' ? 'date' : 'text', step: p.typ === 'cislo' ? 'any' : null });
    vstup.value = hodnota == null ? '' : String(hodnota);
    return el('label', { class: p.typ === 'dlhy_text' ? 'siroke' : '', title: p.napoveda ?? '' }, p.nazov, vstup, p.napoveda ? el('span', { class: 'napoveda' }, p.napoveda) : null);
  }));
}
function formular() {
  const f = {};
  for (const e of document.querySelectorAll('#polia [data-kluc]')) {
    const p = vybrane.polia.find((x) => x.kluc === e.dataset.kluc);
    f[e.dataset.kluc] = p?.typ === 'cislo' ? (e.value === '' ? null : Number(e.value)) : e.value;
  }
  // Porovnanie s pôvodnými hodnotami: posiela sa len vtedy, keď používateľ niečo zmenil.
  const zaklad = JSON.parse(povodny);
  const zmenene = Object.keys(f).some((k) => String(f[k] ?? '') !== String(zaklad[k] ?? ''));
  return zmenene ? { ...zaklad, ...f } : null;
}

function kresliPrilohy(sloty) {
  $('#box-prilohy').hidden = !sloty.length;
  $('#prilohy').replaceChildren(...sloty.map(({ cislo: c, nazov }) => {
    const info = el('span', { class: 'stav' }, prilohy[c] ? `${prilohy[c].nazov} · ${prilohy[c].text.length.toLocaleString('sk-SK')} znakov textu` : 'nepriložený');
    const vstup = el('input', { type: 'file', accept: '.docx,.pdf,.txt', 'aria-label': nazov, onchange: async (e) => {
      const f = e.target.files[0]; if (!f) return;
      info.textContent = 'čítam…';
      try {
        const j = await api('/api/text', { nazov: f.name, base64: await naBase64(f) });
        prilohy[c] = { nazov: f.name, text: j.text }; $('#mamPrilohy').checked = true;
        info.textContent = `${f.name} · ${j.znakov.toLocaleString('sk-SK')} znakov textu${j.znakov < 40 ? ' (bez textovej vrstvy?)' : ''}`;
      } catch (err) { info.textContent = `chyba: ${err.message}`; }
    } });
    return el('div', { class: 'pril' }, el('span', {}, /^\d+$/.test(c) ? `č. ${c} – ${nazov}` : nazov), vstup, info);
  }));
}

// ---------- posudok
$('#posud').addEventListener('click', async () => {
  const t = $('#posud'); t.disabled = true; t.textContent = $('#llm').checked ? 'Kontrolujem (model číta text)…' : 'Kontrolujem…';
  try {
    const f = formular();
    const j = await api(`/api/${modul.id}/posud`, { id: vybrane.id, formular: f ?? undefined, llm: $('#llm').checked, prilohy: $('#mamPrilohy').checked ? prilohy : undefined });
    $('#suhrn').textContent = j.suhrn;
    // Zoznam povinných dokumentov môže závisieť od údajov (napr. typ zmeny, druh výdavku).
    if (JSON.stringify(j.prilohy) !== JSON.stringify(vybrane.prilohy)) { vybrane.prilohy = j.prilohy; kresliPrilohy(j.prilohy); }
    kresliPosudok(j, !!f || $('#mamPrilohy').checked);
  } catch (e) { alert(`Kontrola zlyhala: ${e.message}`); }
  t.disabled = false; t.textContent = 'Skontrolovať';
});

function kresliPosudok({ posudok: p, skutocnost, vystupy }, upravene) {
  $('#vysledok').hidden = false;
  const v = $('#verdikt'); kresliVerdikt(v, p);
  $('#skutocnost').hidden = !(upravene || skutocnost);
  $('#skutocnost').textContent = upravene ? 'Údaje alebo dokumenty ste zmenili, preto sa výsledok neporovnáva so skutočným stavom v registri.' : skutocnost ?? '';
  kresliNalezy($('#nalezy'), p.nalezy);
  $('#vystupy').replaceChildren(...(vystupy ?? []).map((o) => {
    const pre = el('pre', { class: 'vystup' }, o.text);
    return el('div', { class: 'box vystup-box' }, el('div', { class: 'vystup-hlava' }, el('h3', {}, o.nazov),
      el('button', { class: 'vedlajsie', onclick: async (e) => { try { await navigator.clipboard.writeText(o.text); e.target.textContent = 'Skopírované'; } catch { e.target.textContent = 'Nedá sa kopírovať'; } } }, 'Kopírovať')), pre);
  }));
  v.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ---------- test na reálnych dátach
async function nacitajTest() {
  const e = await api('/api/eval'); const o = $('#test-obsah'); o.replaceChildren(el('h2', {}, `Test: ${modul.nazov}`));
  const t = e.moduly?.moduly?.[modul.id];
  if (t) kresliTestModulu(o, t, e.moduly);
  else o.append(el('p', {}, 'Test modulov ešte nebol spustený: npm run test:moduly'));
  if (modul.id === 'zonfp') kresliTestZonfp(o, e.pravidla, e.llm);
  const lm = e.llmModuly?.casti?.filter((c) => c.modul === modul.id);
  if (lm?.length) {
    o.append(el('h3', {}, 'Lokálny model na syntetických dokumentoch'), el('p', { class: 'tlmene' }, `Model ${e.llmModuly.model}. Reálne dokumenty nie sú verejné, preto sú to vymyslené dokumenty: úplné a s vynechanou náležitosťou. Kľúčové číslo je „falošne OK“: chybný dokument označený ako splnený. „Presne“ = dokument zamietnutý a v zdôvodnení je práve vynechaná náležitosť.`),
      el('p', { class: 'tlmene male' }, 'Pôvodné dokumenty slúžili aj na ladenie pravidiel, výsledok je na nich optimistický. Nové dokumenty vznikli až po oprave, s inými formuláciami a firmami, a po behu sa nemenili. Férovejšie číslo je pri nových.'));
    const predtym = (c) => { const h = c.historia?.at(-1); return h && h.falosneOk != null && h.falosneOk !== c.falosneOk ? ` (predtým ${h.falosneOk})` : ''; };
    o.append(el('table', {}, el('thead', {}, el('tr', {}, ['Časť', 'Dokumenty', 'Prípadov', 'Splnené', 'Nesplnené', 'Na preverenie', 'Falošne OK', 'Presne', 's na prípad'].map((h, i) => el('th', { class: i > 1 ? 'c' : '' }, h)))),
      el('tbody', {}, lm.map((c) => el('tr', {}, el('td', {}, c.nazov), el('td', {}, c.nove ? 'nové' : 'pôvodné'),
        ...[c.n, c.splnene, c.nesplnene, c.na_preverenie, c.falosneOk == null ? '–' : `${c.falosneOk}${predtym(c)}`, c.presne == null ? '–' : `${c.presne} z ${c.n}`, (c.msPriemer / 1000).toFixed(1)].map((x) => el('td', { class: 'c' }, x)))))));
    for (const c of lm.filter((x) => x.nezachytene?.length)) o.append(el('details', {}, el('summary', {}, `${c.nazov}: vynechaná náležitosť neoznačená v ${c.nezachytene.length} z ${c.n}`), el('ul', {}, c.nezachytene.map((x) => el('li', {}, x)))));
  }
}
function kresliTestModulu(o, t, cely) {
  o.append(el('p', { class: 'tlmene' }, `${t.pripadov} reálnych prípadov z ITMS21+, bez modelu, ${t.trvanieMs} ms. Spustené ${new Date(cely.cas).toLocaleString('sk-SK')}${cely.dnes ? `, referenčný dátum ${cely.dnes}` : ''}.`));
  if (t.zasadene?.length) {
    o.append(el('h3', {}, 'Zasadené chyby: zachytí ich softvér?'), el('p', { class: 'tlmene male' }, 'Do reálnych prípadov sa umelo vloží známa chyba. Falošne OK = chyba je, ale pravidlo vyšlo „splnené“ alebo celý výrok „bez zistení“. To je najhorší možný omyl, cieľ je 0.'));
    o.append(el('div', { class: 'dlazdice' }, t.zasadene.map((z) => el('div', { class: `dlazdica ${z.falosneOk ? 'zla' : ''}` },
      el('b', {}, `${z.zachytene} z ${z.n}`), el('span', {}, `${z.nazov} → očakáva sa ${STAVY[z.ocakavane] ?? z.ocakavane} (${z.pravidlo}). Falošne OK: ${z.falosneOk}.`)))));
  }
  if (t.overenia?.length) o.append(el('h3', {}, 'Ručne overené príklady'), el('table', {}, el('tbody', {}, t.overenia.map((x) => el('tr', {}, el('td', {}, x.ok ? '✓' : '✗'), el('td', {}, x.nazov), el('td', {}, x.vysledok))))));
  const nav = Object.entries(t.navrhy ?? {});
  if (nav.length) o.append(el('h3', {}, 'Výroky na reálnych dátach'), el('table', {}, el('tbody', {}, nav.map(([k, n]) => el('tr', {}, el('td', {}, VERDIKTY[k] ?? k), el('td', { class: 'c' }, n), el('td', { class: 'c' }, pct(n, t.pripadov)))))));
  if (t.pravidla?.length) {
    const st = Object.keys(STAVY);
    o.append(el('h3', {}, 'Pravidlá na reálnych dátach'), el('table', {}, el('thead', {}, el('tr', {}, el('th', {}, 'Pravidlo'), st.map((s) => el('th', { class: 'c' }, STAVY[s])))),
      el('tbody', {}, t.pravidla.map((r) => el('tr', {}, el('td', {}, `${r.id} ${r.nazov}`), st.map((s) => el('td', { class: 'c' }, r.pocty[s] ?? 0)))))));
  }
  if (t.poznamky?.length) o.append(el('div', { class: 'pozn' }, el('ul', {}, t.poznamky.map((p) => el('li', {}, p)))));
}
function kresliTestZonfp(o, t, llm) {
  if (!t) return;
  const fp = t.ziadostiSNesplnenymPravidlom, sk = t.skupiny;
  o.append(el('h3', {}, 'Porovnanie so skutočným rozhodnutím poskytovateľa'),
    el('p', { class: 'tlmene' }, `${t.pocetZiadosti} žiadostí výzvy ${t.vyzva}, pravidlá „${t.balik}“, bez modelu.`),
    el('div', { class: 'dlazdice' },
      el('div', { class: 'dlazdica' }, el('b', {}, `${fp.presli} z ${sk.presli}`), el('span', {}, `falošných poplachov: nesplnená podmienka pri žiadosti, ktorá podľa poskytovateľa podmienky splnila (${pct(fp.presli, sk.presli)})`)),
      el('div', { class: 'dlazdica' }, el('b', {}, `${fp.nesplnili} z ${sk.nesplnili}`), el('span', {}, `zachytených: neschválené pre nesplnenie podmienok, porušenie nájdené už z formulára (${pct(fp.nesplnili, sk.nesplnili)})`)),
      el('div', { class: 'dlazdica' }, el('b', {}, `${fp.zastavene} z ${sk.zastavene}`), el('span', {}, 'žiadostí so zastaveným konaním, kde softvér našiel porušenie'))),
    el('div', { class: 'pozn' }, 'Väčšina zamietnutí vzniká v prílohách a registroch, ktoré nie sú verejné. Tento test meria len pravidlá overiteľné z formulára.'));
  if (!llm) return;
  const t2 = el('table', {}, el('thead', {}, el('tr', {}, ['Časť testu', 'Prípadov', 'Splnené', 'Nesplnené', 'Na preverenie', 's na prípad'].map((h, i) => el('th', { class: i ? 'c' : '' }, h)))));
  t2.append(el('tbody', {}, Object.entries(llm.suhrn).map(([k, s]) => el('tr', {}, el('td', {}, k.replaceAll('_', ' ')), ...[s.n, s.splnene, s.nesplnene, s.na_preverenie, (s.msPriemer / 1000).toFixed(1)].map((x) => el('td', { class: 'c' }, x))))));
  o.append(el('h3', {}, `Lokálny model ${llm.model} ako čitateľ textu`), t2);
}

// ---------- pravidlá a zdroje
async function nacitajPravidla() {
  const b = await api(`/api/${modul.id}/pravidla`); const o = $('#pravidla-obsah');
  o.replaceChildren(el('h2', {}, `${modul.nazov}: ${b.vyzvaNazov}`), el('p', { class: 'tlmene' }, `${b.vyzvaKod} · ${b.poskytovatel} · ${b.verzia}`),
    el('h3', {}, 'Proces'), el('ol', {}, b.proces.map((k) => el('li', {}, k))),
    el('h3', {}, `Pravidlá (${b.pravidla.length})`),
    ...b.pravidla.map((p) => el('details', { class: 'nalez' },
      el('summary', {}, el('span', { class: 'stitok s-neuplatnuje_sa' }, p.id), el('span', {}, el('span', { class: 'nz' }, `${p.ppp ? `PPP č. ${p.ppp} · ` : ''}${p.nazov}`), el('br'), el('span', { class: 'zd' }, DRUHY[p.druh] ?? p.druh))),
      el('div', { class: 'vnutro' }, el('span', { class: 'tlmene' }, `${p.citacia.dokument}, ${p.citacia.cast}:`), el('blockquote', {}, p.citacia.znenie), p.overenieZdroj ? el('div', { class: 'tlmene' }, p.overenieZdroj) : null))),
    el('h3', {}, 'Zdrojové dokumenty'), el('ul', {}, b.zdroje.map((z) => el('li', {}, z.url ? el('a', { href: z.url, target: '_blank', rel: 'noreferrer' }, z.nazov) : z.nazov, z.subor ? el('span', { class: 'tlmene male' }, ` · ${z.subor}`) : null))));
}

// ---------- štart
stav = await api('/api/stav');
$('#stav').textContent = `Výzva ${stav.vyzva} · model ${stav.model} ${stav.modelDostupny ? 'beží lokálne' : 'nedostupný'} · ${stav.posudkov} posudkov v auditnej stope · nič sa neodosiela von${stav.pdf === false ? ' · POZOR: PDF sa nedajú čítať (chýba pdftotext)' : ''}`;
if (!stav.modelDostupny) $('#llm').checked = false;
$('#moduly').replaceChildren(...stav.moduly.map((m, i) => el('button', { class: 'modul', 'data-modul': m.id, title: m.popis, onclick: () => vyberModul(m.id) },
  el('span', { class: 'krok' }, i + 1), m.nazov, m.balik?.pravidiel ? el('span', { class: 'pocet' }, m.balik.pravidiel) : null)));
let ulozeny = null; try { ulozeny = localStorage.getItem('modul'); } catch {}
vyberModul(ulozeny ?? 'zonfp', false);
kresliKartu();
