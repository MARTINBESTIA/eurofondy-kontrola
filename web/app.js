// Rozhranie dema. Bez frameworku; všetok text ide cez textContent, nič z dát sa nevkladá ako HTML.
const $ = (s) => document.querySelector(s);
const el = (tag, attrs = {}, ...deti) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) { if (k === 'class') e.className = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (v !== false && v != null) e.setAttribute(k, v); }
  for (const d of deti.flat()) if (d != null && d !== false) e.append(d.nodeType ? d : document.createTextNode(String(d)));
  return e;
};
const api = async (cesta, telo) => {
  const r = await fetch(cesta, telo ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(telo) } : undefined);
  const j = await r.json();
  if (!r.ok) throw new Error(j.chyba ?? `HTTP ${r.status}`);
  return j;
};
const eur = (n) => Number(n).toLocaleString('sk-SK', { maximumFractionDigits: 0 }) + ' EUR';
const cislo = (n, d = 1) => (n == null ? '–' : Number(n).toLocaleString('sk-SK', { maximumFractionDigits: d }));

const STAVY = {
  nesplnene: 'Nesplnené', chyba_podklad: 'Chýba podklad', na_preverenie: 'Na preverenie',
  splnene: 'Splnené', mimo_podkladov: 'Mimo podkladov', neuplatnuje_sa: 'Neuplatňuje sa',
};
const NADPISY = {
  nesplnene: 'Nesplnené podmienky', chyba_podklad: 'Chýbajúce podklady (výzva na doplnenie)', na_preverenie: 'Musí posúdiť človek',
  splnene: 'Overené a splnené', mimo_podkladov: 'Softvér neoveril: poskytovateľ to overuje inde', neuplatnuje_sa: 'Neuplatňuje sa',
};
const VERDIKTY = {
  nesplnene_podmienky: 'Žiadosť nespĺňa podmienky výzvy', vyzva_na_doplnenie: 'Žiadosť je neúplná',
  na_preverenie: 'Bez jasného porušenia, niektoré body treba preveriť', bez_zisteni: 'V overených bodoch bez zistení',
};
const SKUPINY = { schvalena: 'schválená', nedostatok: 'neschválená: nedostatok peňazí', neschvalena: 'neschválená', zastavene: 'zastavené konanie', ina: 'iný stav' };
const PRILOHY = [
  ['1', 'Plnomocenstvo / poverenie'], ['3', 'Uznesenie o programe rozvoja a územnom pláne'], ['5', 'Energetický audit'],
  ['6', 'Energetický certifikát'], ['7', 'Projektová dokumentácia'], ['8', 'Dokumentácia k oprávnenosti výdavkov'],
];

let stav = null, vybrana = null, povodna = null, prilohy = {};

// ---------- karty
for (const k of document.querySelectorAll('.karta')) k.addEventListener('click', () => {
  document.querySelectorAll('.karta').forEach((x) => x.classList.toggle('aktivna', x === k));
  document.querySelectorAll('main.panel').forEach((p) => (p.hidden = p.id !== k.dataset.karta));
  if (k.dataset.karta === 'test') nacitajTest();
});

// ---------- zoznam žiadostí
async function nacitajZoznam() {
  const j = await api(`/api/ziadosti?q=${encodeURIComponent($('#hladaj').value)}&skupina=${$('#skupina').value}`);
  $('#pocet').textContent = `${j.spolu} žiadostí${j.spolu > j.ziadosti.length ? `, zobrazených prvých ${j.ziadosti.length}` : ''}`;
  $('#ziadosti').replaceChildren(...j.ziadosti.map((z) => el('li', { 'data-kod': z.kod, class: vybrana?.kod === z.kod ? 'vybrana' : '', onclick: () => vyber(z.kod) },
    el('span', { class: 'n' }, z.nazov), el('span', { class: 'm' }, el('span', {}, z.ziadatel), el('span', {}, SKUPINY[z.skupina])))));
}
let casovac; $('#hladaj').addEventListener('input', () => { clearTimeout(casovac); casovac = setTimeout(nacitajZoznam, 200); });
$('#skupina').addEventListener('change', nacitajZoznam);

// ---------- detail
const uk = (z, kod) => z.ukazovatele.find((u) => u.kod === kod);
async function vyber(kod) {
  const j = await api(`/api/ziadost/${encodeURIComponent(kod)}`);
  vybrana = j.ziadost; povodna = structuredClone(j.ziadost); prilohy = {};
  document.querySelectorAll('#ziadosti li').forEach((li) => li.classList.toggle('vybrana', li.dataset.kod === kod));
  $('#prazdne').hidden = true; $('#obsah').hidden = false; $('#vysledok').hidden = true;
  $('#kod').textContent = `${vybrana.kod} · predložená ${vybrana.datumPredlozenia ?? '–'}`;
  $('#nazov').textContent = vybrana.nazov;
  $('#ziadatel').textContent = `${vybrana.ziadatel.nazov} · ${vybrana.ziadatel.pravnaForma} · opatrenia ${vybrana.opatrenia.join(', ') || '–'}`;
  $('#f-nfp').value = vybrana.sumaZiadanaNFP; $('#f-forma').value = vybrana.ziadatel.pravnaFormaKod;
  $('#f-vych').value = uk(vybrana, 'PSKPRCR26b')?.vychodisko ?? ''; $('#f-ciel').value = uk(vybrana, 'PSKPRCR26b')?.ciel ?? '';
  $('#f-mwa').value = uk(vybrana, 'PSKPRCO22a')?.ciel ?? ''; $('#f-mwb').value = uk(vybrana, 'PSKPRCO22b')?.ciel ?? '';
  $('#f-popis').value = vybrana.popis;
  ukazMetriky(j.metriky);
  $('#mamPrilohy').checked = false; kresliPrilohy();
}
function ukazMetriky(m) {
  $('#metriky').textContent = `Úspora primárnej energie: ${m.usporaPercent == null ? 'nedá sa vypočítať' : cislo(m.usporaPercent) + ' %'} · hodnota za peniaze EE: ${m.hzpEE == null ? '–' : cislo(m.hzpEE, 0) + ' EUR/MWh'} · OZE: ${m.hzpOZE == null ? '–' : cislo(m.hzpOZE, 0) + ' EUR/MW'}`;
}
function kresliPrilohy() {
  $('#prilohy').replaceChildren(...PRILOHY.map(([c, nazov]) => {
    const info = el('span', { class: 'stav' }, prilohy[c] ? `${prilohy[c].nazov} · ${prilohy[c].text.length.toLocaleString('sk-SK')} znakov textu` : 'nepriložená');
    const vstup = el('input', { type: 'file', accept: '.docx,.pdf,.txt', 'aria-label': `Príloha č. ${c}`, onchange: async (e) => {
      const f = e.target.files[0]; if (!f) return;
      info.textContent = 'čítam…';
      try {
        const base64 = btoa(Array.from(new Uint8Array(await f.arrayBuffer()), (b) => String.fromCharCode(b)).join(''));
        const j = await api('/api/text', { nazov: f.name, base64 });
        prilohy[c] = { nazov: f.name, text: j.text }; $('#mamPrilohy').checked = true;
        info.textContent = `${f.name} · ${j.znakov.toLocaleString('sk-SK')} znakov textu${j.znakov < 40 ? ' (bez textovej vrstvy?)' : ''}`;
      } catch (err) { info.textContent = `chyba: ${err.message}`; }
    } });
    return el('div', { class: 'pril' }, el('span', {}, `č. ${c} – ${nazov}`), vstup, info);
  }));
}

// ---------- posudok
function upravena() {
  const z = structuredClone(vybrana);
  const num = (id) => ($(id).value === '' ? null : Number($(id).value));
  z.sumaZiadanaNFP = num('#f-nfp') ?? 0; z.ziadatel.pravnaFormaKod = $('#f-forma').value.trim(); z.popis = $('#f-popis').value;
  const nastav = (kod, pole, v) => { let u = uk(z, kod); if (!u && v != null) { u = { kod, nazov: kod, typ: 'vysledok', jednotka: '', vychodisko: null, ciel: null }; z.ukazovatele.push(u); } if (u) u[pole] = v; };
  nastav('PSKPRCR26b', 'vychodisko', num('#f-vych')); nastav('PSKPRCR26b', 'ciel', num('#f-ciel'));
  nastav('PSKPRCO22a', 'ciel', num('#f-mwa')); nastav('PSKPRCO22b', 'ciel', num('#f-mwb'));
  if (z.ziadatel.pravnaFormaKod !== povodna.ziadatel.pravnaFormaKod) z.ziadatel.pravnaForma = `kód ${z.ziadatel.pravnaFormaKod} (zmenené v rozhraní)`;
  return JSON.stringify(z) === JSON.stringify(povodna) ? null : z;
}
$('#posud').addEventListener('click', async () => {
  const tlacidlo = $('#posud'); tlacidlo.disabled = true; tlacidlo.textContent = $('#llm').checked ? 'Kontrolujem (model číta text)…' : 'Kontrolujem…';
  try {
    const z = upravena();
    const j = await api('/api/posud', { kod: vybrana.kod, ziadost: z ?? undefined, llm: $('#llm').checked, prilohy: $('#mamPrilohy').checked ? prilohy : undefined });
    kresliPosudok(j, !!z || $('#mamPrilohy').checked); ukazMetriky(j.metriky);
  } catch (e) { alert(`Kontrola zlyhala: ${e.message}`); }
  tlacidlo.disabled = false; tlacidlo.textContent = 'Skontrolovať';
});

function kresliPosudok({ posudok: p, skutocnost }, bolaUpravena) {
  $('#vysledok').hidden = false;
  const v = $('#verdikt'); v.className = `verdikt ${p.navrh}`;
  v.replaceChildren(el('strong', {}, VERDIKTY[p.navrh]), el('span', {}, p.zhrnutie),
    el('div', { class: 'tlmene male' }, `Pravidlá: ${p.verziaBalika} · ${p.model ? `model ${p.model}` : 'bez modelu'} · ${(p.trvanieMs / 1000).toFixed(1)} s`));
  $('#skutocnost').textContent = bolaUpravena ? 'Upravili ste údaje alebo ste priložili vlastné prílohy, preto sa výsledok neporovnáva so skutočným rozhodnutím poskytovateľa.'
    : skutocnost ? `Skutočné rozhodnutie poskytovateľa: ${skutocnost.stav}${skutocnost.dovod ? ` (${{ nedostatok_prostriedkov: 'nedostatok finančných prostriedkov', nesplnenie_ppp: 'nesplnenie podmienok poskytnutia príspevku', zastavenie_konania: 'zastavenie konania' }[skutocnost.dovod]})` : ''}.` : '';
  const kontajner = $('#nalezy'); kontajner.replaceChildren();
  for (const s of Object.keys(NADPISY)) {
    const cast = p.nalezy.filter((n) => n.stav === s); if (!cast.length) continue;
    kontajner.append(el('div', { class: 'sk-nadpis' }, `${NADPISY[s]} (${cast.length})`));
    for (const n of cast) kontajner.append(el('details', { class: 'nalez', open: ['nesplnene', 'chyba_podklad', 'na_preverenie'].includes(s) ? '' : false },
      el('summary', {}, el('span', { class: `stitok s-${n.stav}` }, STAVY[n.stav]),
        el('span', {}, el('span', { class: 'nz' }, `${n.ppp ? `PPP č. ${n.ppp} · ` : ''}${n.nazov}`), el('br'), el('span', { class: 'zd' }, n.zdovodnenie))),
      el('div', { class: 'vnutro' },
        n.dokaz ? el('div', {}, el('span', { class: 'tlmene' }, 'Úryvok z dokumentu žiadateľa:'), el('blockquote', { class: 'dokaz' }, n.dokaz)) : null,
        el('span', { class: 'tlmene' }, `Pravidlo ${n.pravidlo} · ${n.citacia.dokument}, ${n.citacia.cast}:`), el('blockquote', {}, n.citacia.znenie),
        n.overenieZdroj ? el('div', { class: 'tlmene' }, `Kde to overuje poskytovateľ: ${n.overenieZdroj}`) : null)));
  }
  v.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ---------- test na reálnych dátach
async function nacitajTest() {
  const { pravidla: t, llm } = await api('/api/eval'); const o = $('#test-obsah'); o.replaceChildren();
  if (!t) { o.append(el('p', {}, 'Test ešte nebol spustený: npm run test:pravidla')); return; }
  const fp = t.ziadostiSNesplnenymPravidlom, sk = t.skupiny;
  o.append(el('h2', {}, 'Test 1: pravidlá na reálnych žiadostiach'),
    el('p', { class: 'tlmene' }, `${t.pocetZiadosti} žiadostí výzvy ${t.vyzva}, pravidlá „${t.balik}“, bez modelu. Porovnanie so skutočným rozhodnutím poskytovateľa z verejných zoznamov. Celý beh trval ${t.trvanieMs} ms.`),
    el('div', { class: 'dlazdice' },
      el('div', { class: 'dlazdica' }, el('b', {}, `${fp.presli} z ${sk.presli}`), el('span', {}, `falošných poplachov: softvér hlási nesplnenú podmienku pri žiadosti, ktorá podľa poskytovateľa podmienky splnila (${cislo(fp.presli / sk.presli * 100)} %)`)),
      el('div', { class: 'dlazdica' }, el('b', {}, `${fp.nesplnili} z ${sk.nesplnili}`), el('span', {}, `zachytených: žiadosti neschválené pre nesplnenie podmienok, kde softvér našiel porušenie už z údajov formulára (${cislo(fp.nesplnili / sk.nesplnili * 100)} %)`)),
      el('div', { class: 'dlazdica' }, el('b', {}, `${fp.zastavene} z ${sk.zastavene}`), el('span', {}, 'žiadostí so zastaveným konaním, kde softvér našiel porušenie'))),
    el('div', { class: 'pozn' }, 'Väčšina zamietnutí vzniká v prílohách a registroch, ktoré nie sú verejné. Preto tento test meria len pravidlá overiteľné z formulára, nie celú kontrolu.'));
  const hlavicka = ['Pravidlo', 'Skupina', 'Splnené', 'Nesplnené', 'Na preverenie', 'Nedá sa overiť', 'Neuplatňuje sa'];
  const nazvy = { presli: 'podmienky splnili', nesplnili: 'nesplnili podmienky', zastavene: 'zastavené konanie', ostatne: 'ostatné' };
  const tab = el('table', {}, el('thead', {}, el('tr', {}, hlavicka.map((h, i) => el('th', { class: i > 1 ? 'c' : '' }, h)))));
  const tb = el('tbody'); tab.append(tb);
  for (const [id, skup] of Object.entries(t.poPravidlach)) for (const g of ['presli', 'nesplnili']) {
    const s = skup[g] ?? {};
    tb.append(el('tr', {}, el('td', {}, g === 'presli' ? id : ''), el('td', {}, nazvy[g]), ...[s.splnene, s.nesplnene, s.na_preverenie, (s.chyba_podklad ?? 0) + (s.mimo_podkladov ?? 0), s.neuplatnuje_sa].map((x) => el('td', { class: 'c' }, x ?? 0))));
  }
  o.append(tab);
  if (!llm) { o.append(el('h2', {}, 'Test 2: lokálny model'), el('p', {}, 'Test ešte nebol spustený alebo stále beží: npm run test:llm')); return; }
  const popisy = {
    A_presli: ['Reálne popisy, žiadosti splnili podmienky', 'nesmie byť „nesplnené“'], A_nesplnili: ['Reálne popisy, žiadosti nesplnili podmienky', 'dôvod neznámy, len pre informáciu'],
    B_neopravnena_budova: ['Syntetické popisy neoprávnených budov', 'má byť „nesplnené“'],
    C1_jedna_otazka_uplne: ['Úplné plnomocenstvá, jedna otázka na dokument', 'má byť „splnené“'], C1_jedna_otazka_chybne: ['Plnomocenstvá s vynechanou náležitosťou, jedna otázka na dokument', 'má byť „nesplnené“'],
    C2_po_nalezitostiach_uplne: ['Úplné plnomocenstvá, každá náležitosť zvlášť', 'má byť „na preverenie“ (podpis treba pozrieť)'], C2_po_nalezitostiach_chybne: ['Plnomocenstvá s vynechanou náležitosťou, každá náležitosť zvlášť', 'má byť „nesplnené“'],
    D_nove_formulacie_uplne: ['Úplné plnomocenstvá s inými formuláciami, každá náležitosť zvlášť', 'má byť „na preverenie“'], D_nove_formulacie_chybne: ['Chybné plnomocenstvá s inými formuláciami, každá náležitosť zvlášť', 'má byť „nesplnené“'],
  };
  const t2 = el('table', {}, el('thead', {}, el('tr', {}, ['Časť testu', 'Očakávanie', 'Prípadov', 'Splnené', 'Nesplnené', 'Na preverenie', 's na prípad'].map((h, i) => el('th', { class: i > 1 ? 'c' : '' }, h)))));
  const tb2 = el('tbody'); t2.append(tb2);
  for (const [k, s] of Object.entries(llm.suhrn)) tb2.append(el('tr', {}, el('td', {}, popisy[k]?.[0] ?? k), el('td', {}, popisy[k]?.[1] ?? ''), ...[s.n, s.splnene, s.nesplnene, s.na_preverenie, (s.msPriemer / 1000).toFixed(1)].map((x) => el('td', { class: 'c' }, x))));
  o.append(el('h2', {}, 'Test 2: lokálny model ako čitateľ textu'), el('p', { class: 'tlmene' }, `Model ${llm.model}, beží lokálne cez Ollama. Časti B, C a D sú vymyslené texty, lebo reálne prílohy žiadostí nie sú verejné.`), t2);
}

// ---------- pravidlá a zdroje
function kresliPravidla() {
  const b = stav.balik; const o = $('#pravidla-obsah');
  const druhy = { data: 'výpočet z údajov formulára', priloha: 'prítomnosť prílohy', llm: 'text číta lokálny model', register: 'overuje poskytovateľ v registri' };
  o.replaceChildren(el('h2', {}, b.vyzvaNazov), el('p', { class: 'tlmene' }, `${b.vyzvaKod} · ${b.poskytovatel} · ${b.verzia}`),
    el('h3', {}, 'Proces konania podľa výzvy'), el('ol', {}, b.proces.map((k) => el('li', {}, k))),
    el('h3', {}, `Pravidlá (${b.pravidla.length})`),
    el('table', {}, el('thead', {}, el('tr', {}, ['ID', 'PPP', 'Pravidlo', 'Ako sa overuje'].map((h) => el('th', {}, h)))), el('tbody', {}, b.pravidla.map((p) => el('tr', {}, el('td', {}, p.id), el('td', {}, p.ppp ?? '–'), el('td', {}, p.nazov), el('td', {}, druhy[p.druh]))))),
    el('h3', {}, 'Zdrojové dokumenty'), el('ul', {}, b.zdroje.map((z) => el('li', {}, el('a', { href: z.url, target: '_blank', rel: 'noreferrer' }, z.nazov), el('span', { class: 'tlmene male' }, ` · ${z.subor}`)))));
}

// ---------- štart
stav = await api('/api/stav');
$('#balik').textContent = `${stav.balik.vyzvaKod} · pravidlá: ${stav.balik.verzia} · ${stav.pocetZiadosti} žiadostí · model ${stav.model} ${stav.modelDostupny ? 'beží' : 'nedostupný'}`;
if (!stav.modelDostupny) $('#llm').checked = false;
kresliPravidla(); nacitajZoznam();
