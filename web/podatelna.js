// Podateľňa: kontrolór prijme podanie (súbory žiadosti alebo kód z ITMS21+), skontroluje zaradenie príloh,
// spustí posúdenie a zapíše rozhodnutie. Výsledky sa ukladajú do spisu (SQLite) a sčítavajú za výzvu.
// V prevádzke by podanie prišlo automaticky (e-mailový hook) cez to isté API: POST /api/podatelna/spisy.
import { $, el, api, cislo, pct, datum, naBase64, STAVY, NAVRHY_KRATKO, kresliVerdikt, kresliNalezy } from './ui.js';

const ROZHODNUTIA = { splnila: 'Splnila podmienky', doplnenie: 'Výzva na doplnenie', nesplnila: 'Nesplnila podmienky' };
const STAV_SPISU = { prijata: 'prijatá, neposúdená', posudena: 'posúdená, čaká na rozhodnutie', caka_na_doplnenie: 'čaká na doplnenie', doplnena: 'doplnená, treba posúdiť znova', rozhodnuta: 'rozhodnutá' };
const ISTOTA = { cislo: 'číslo prílohy v názve súboru', rucne: 'potvrdil kontrolór', nazov: 'odhad podľa názvu súboru', obsah: 'odhad podľa obsahu', ziadna: '' };
/** Farba štítku návrhu a rozhodnutia: rovnaké farby ako stavy pravidiel. */
const FARBA_NAVRHU = { nesplnene_podmienky: 'nesplnene', vyzva_na_doplnenie: 'chyba_podklad', na_preverenie: 'na_preverenie', ciastocne_overene: 'mimo_podkladov', bez_zisteni: 'splnene' };
const FARBA_ROZH = { splnila: 'splnene', doplnenie: 'chyba_podklad', nesplnila: 'nesplnene' };

let stavApp = null, vyzvy = [], spisy = [], aktualny = null, inicializovane = false;
const detail = () => $('#podatelna-detail');
const nav = (h) => { if (location.hash === h) podlaHash(); else location.hash = h; };
const stitokSpisu = (s) => s.rozhodnutie ? el('span', { class: `stitok s-${FARBA_ROZH[s.rozhodnutie]}` }, ROZHODNUTIA[s.rozhodnutie])
  : s.navrh ? el('span', { class: `stitok s-${FARBA_NAVRHU[s.navrh]}`, title: 'Návrh softvéru' }, NAVRHY_KRATKO[s.navrh])
    : el('span', { class: 'stitok s-neuplatnuje_sa' }, 'neposúdená');

export async function zobrazPodatelnu(stav) {
  stavApp = stav;
  if (!inicializovane) {
    inicializovane = true;
    $('#pod-nova').addEventListener('click', () => nav('#p/nova'));
    $('#pod-prehlad').addEventListener('click', () => nav('#p/prehlad'));
    $('#pod-hladaj').addEventListener('input', kresliZoznam);
    window.addEventListener('hashchange', () => { if (!$('#podatelna').hidden) podlaHash(); });
  }
  await obnovZoznam();
  await podlaHash();
}

async function podlaHash() {
  let m;
  if ((m = location.hash.match(/^#p\/spis\/(\d+)/))) return kresliSpis(Number(m[1]));
  aktualny = null; kresliZoznam();
  if ((m = location.hash.match(/^#p\/nova(?:\?vyzva=(.+))?/))) return kresliNovu(m[1] ? decodeURIComponent(m[1]) : null);
  return kresliPrehlad();
}

// ---------- zoznam spisov vľavo, zoskupený podľa výziev
async function obnovZoznam() {
  [vyzvy, spisy] = await Promise.all([api('/api/podatelna/vyzvy'), api('/api/podatelna/spisy')]);
  kresliZoznam();
}
function kresliZoznam() {
  const q = $('#pod-hladaj').value.trim().toLowerCase();
  const vyber = spisy.filter((s) => !q || [s.cislo, s.ziadatel, s.nazov, s.kod, s.ico].some((x) => x && String(x).toLowerCase().includes(q)));
  const poVyzvach = Map.groupBy(vyber, (s) => s.vyzva);
  const ul = $('#pod-spisy'); ul.replaceChildren();
  if (!spisy.length) ul.append(el('li', { class: 'prazdny' }, 'Zatiaľ žiadne podania. Začnite tlačidlom „Nová žiadosť“.'));
  else if (!vyber.length) ul.append(el('li', { class: 'prazdny' }, 'Nič sa nenašlo.'));
  for (const [kod, zoz] of poVyzvach) {
    const st = vyzvy.find((v) => v.kod === kod)?.spisy;
    ul.append(el('li', { class: 'skupina', title: vyzvy.find((v) => v.kod === kod)?.nazov ?? '' }, el('span', {}, kod),
      st ? el('span', { class: 'tlmene' }, `${st.spolu} · úspešnosť ${pct(st.splnila, st.splnila + st.nesplnila)}`) : null));
    for (const s of zoz) ul.append(el('li', { class: `spis ${aktualny === s.id ? 'vybrana' : ''}`, onclick: () => nav(`#p/spis/${s.id}`) },
      el('span', { class: 'n' }, s.ziadatel ?? 'neznámy žiadateľ'), el('span', { class: 'p' }, s.nazov ?? ''),
      el('span', { class: 'm' }, el('span', {}, `${s.cislo} · ${s.suborov} súb.`), stitokSpisu(s))));
  }
}

// ---------- prehľad výziev a úspešnosti
function kresliPrehlad() {
  const sPravidlami = vyzvy.filter((v) => v.maPravidla);
  const d = detail();
  d.replaceChildren(el('div', { class: 'sirka-detail' },
    el('h2', {}, 'Prehľad výziev'),
    el('p', { class: 'tlmene' }, 'Žiadosti sú rozdelené podľa výziev. Posúdiť sa dajú len výzvy, pre ktoré sú pripravené pravidlá (balík packs/<výzva>/zonfp.json). Úspešnosť v podateľni počíta rozhodnutia kontrolórov v tomto softvéri, úspešnosť v ITMS21+ je z verejných dát o skutočne predložených žiadostiach.'),
    ...sPravidlami.map(kartaVyzvy),
    tabulkaVsetkych()));
}
function kartaVyzvy(v) {
  const s = v.spisy ?? { spolu: 0, posudene: 0, navrhy: {}, splnila: 0, nesplnila: 0, doplnenie: 0, nerozhodnute: 0, odlisne: 0 };
  const i = v.itms;
  const dl = (hodnota, popis, zla) => el('div', { class: `dlazdica ${zla ? 'zla' : ''}` }, el('b', {}, hodnota), el('span', {}, popis));
  return el('section', { class: 'box vyzva-karta' },
    el('div', { class: 'vyzva-hlava' },
      el('div', {}, el('p', { class: 'tlmene male' }, `${v.kod} · ${v.vyhlasovatel} · ${v.stav}`), el('h3', {}, v.nazov)),
      el('button', { class: 'vedlajsie', onclick: () => nav(`#p/nova?vyzva=${encodeURIComponent(v.kod)}`) }, '+ Žiadosť do tejto výzvy')),
    el('div', { class: 'sk-nadpis' }, 'Podateľňa (rozhodnutia kontrolórov v tomto softvéri)'),
    el('div', { class: 'dlazdice' },
      dl(`${s.spolu}`, `spisov, z toho ${s.posudene} posúdených softvérom`),
      dl(pct(s.splnila, s.splnila + s.nesplnila), `úspešnosť: splnila ${s.splnila} z ${s.splnila + s.nesplnila} rozhodnutých (doplnenie ${s.doplnenie} a nerozhodnuté ${s.nerozhodnute} sa nepočítajú)`),
      dl(`${s.odlisne}`, 'rozhodnutí proti návrhu softvéru (schválené napriek porušeniu alebo zamietnuté bez zistení)', s.odlisne > 0)),
    Object.keys(s.navrhy).length ? el('p', { class: 'tlmene male' }, 'Návrhy softvéru: ', Object.entries(s.navrhy).map(([k, n]) => `${NAVRHY_KRATKO[k] ?? k} ${n}`).join(' · ')) : null,
    i ? [el('div', { class: 'sk-nadpis' }, 'ITMS21+ (skutočné žiadosti tejto výzvy, verejné dáta)'),
      el('div', { class: 'dlazdice' },
        dl(cislo(i.predlozenych, 0), `predložených žiadostí${i.vKonani ? `, ${i.vKonani} ešte v konaní` : ''}`),
        dl(pct(i.schvalenych, i.predlozenych), `schválených: ${i.schvalenych} z ${i.predlozenych}`),
        i.zasobnik != null ? dl(pct(i.schvalenych + i.zasobnik, i.predlozenych), `splnilo podmienky: schválené ${i.schvalenych} + zásobník ${i.zasobnik} (splnili, chýbali peniaze)`) : null,
        i.nesplnili != null ? dl(cislo(i.nesplnili, 0), `neschválených pre nesplnenie podmienok${i.zastavenych ? `, ${i.zastavenych} zastavených alebo stiahnutých` : ''}`) : null)] : null);
}
function tabulkaVsetkych() {
  const riadky = [...vyzvy].sort((a, b) => (b.maPravidla - a.maPravidla) || ((b.itms?.predlozenych ?? -1) - (a.itms?.predlozenych ?? -1)));
  const tbody = el('tbody');
  const kresli = (q) => tbody.replaceChildren(...riadky.filter((v) => !q || `${v.kod} ${v.nazov} ${v.vyhlasovatel}`.toLowerCase().includes(q)).map((v) => el('tr', {},
    el('td', {}, el('span', { class: 'male' }, v.kod), el('br'), v.nazov), el('td', {}, v.stav),
    el('td', { class: 'c' }, v.itms ? cislo(v.itms.predlozenych, 0) : '–'), el('td', { class: 'c' }, v.itms ? cislo(v.itms.schvalenych, 0) : '–'),
    el('td', { class: 'c' }, v.itms ? pct(v.itms.schvalenych, v.itms.predlozenych) : '–'),
    el('td', {}, v.maPravidla ? 'áno' : 'nie'), el('td', { class: 'c' }, v.spisy?.spolu ?? 0))));
  kresli('');
  return el('details', { class: 'box vsetky-vyzvy' }, el('summary', {}, `Všetky výzvy programu Slovensko v ITMS21+ (${vyzvy.length})`),
    el('p', { class: 'tlmene male' }, 'Úspešnosť = schválené / predložené podľa verejného zoznamu výziev. Pravidlá zatiaľ existujú len pre označené výzvy; pre ostatné by sa balík pravidiel pripravil z textu výzvy.'),
    el('input', { type: 'search', placeholder: 'Hľadať výzvu', 'aria-label': 'Hľadať výzvu', oninput: (e) => kresli(e.target.value.trim().toLowerCase()) }),
    el('table', {}, el('thead', {}, el('tr', {}, ['Výzva', 'Stav', 'Predložené', 'Schválené', 'Úspešnosť', 'Pravidlá', 'Spisov'].map((h, k) => el('th', { class: [2, 3, 4, 6].includes(k) ? 'c' : '' }, h)))), tbody));
}

// ---------- nová žiadosť (simulácia príjmu podania)
function kresliNovu(vyzvaPredvolena) {
  const sPravidlami = vyzvy.filter((v) => v.maPravidla);
  let vybrane = [];
  const zoznam = el('ul', { class: 'vybrane-subory' });
  const kresliVybrane = () => zoznam.replaceChildren(...vybrane.map((f, k) => el('li', {}, el('span', {}, f.name), el('span', { class: 'tlmene male' }, `${cislo(f.size / 1024, 0)} kB`),
    el('button', { class: 'odober', type: 'button', 'aria-label': `Odobrať ${f.name}`, onclick: () => { vybrane.splice(k, 1); kresliVybrane(); } }, '×'))));
  const pridaj = (subory) => { vybrane.push(...subory); kresliVybrane(); };
  const vstup = el('input', { type: 'file', multiple: '', accept: '.zip,.pdf,.docx,.txt,.json', onchange: (e) => { pridaj([...e.target.files]); e.target.value = ''; } });
  const zona = el('div', { class: 'dropzona', tabindex: '0', role: 'button', onclick: () => vstup.click(), onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); vstup.click(); } },
    ondragover: (e) => { e.preventDefault(); zona.classList.add('nad'); }, ondragleave: () => zona.classList.remove('nad'),
    ondrop: (e) => { e.preventDefault(); zona.classList.remove('nad'); pridaj([...e.dataTransfer.files]); } },
  el('b', {}, 'Pretiahnite sem ZIP alebo súbory podania'), el('span', { class: 'tlmene male' }, 'alebo kliknite a vyberte (.zip, .pdf, .docx, .txt, .json formulára)'));
  const vyzva = el('select', { 'aria-label': 'Výzva' }, sPravidlami.map((v) => el('option', { value: v.kod }, `${v.kod} – ${v.nazov}`)));
  if (vyzvaPredvolena) vyzva.value = vyzvaPredvolena;
  const kod = el('input', { type: 'text', placeholder: 'napr. NFP401201A973', 'aria-label': 'Kód žiadosti z ITMS21+' });
  const stav = el('p', { class: 'tlmene', role: 'status' });
  const tlacidlo = el('button', { class: 'hlavne', type: 'submit' }, 'Prijať podanie');
  const form = el('form', { class: 'box nova', onsubmit: async (e) => {
    e.preventDefault();
    if (!vybrane.length && !kod.value.trim()) { stav.textContent = 'Priložte súbory podania alebo zadajte kód žiadosti z ITMS21+.'; return; }
    tlacidlo.disabled = true; stav.textContent = 'Prijímam podanie, čítam text dokumentov…';
    try {
      const subory = await Promise.all(vybrane.map(async (f) => ({ nazov: f.name, base64: await naBase64(f) })));
      const j = await api('/api/podatelna/spisy', { vyzva: vyzva.value, kodItms: kod.value.trim() || undefined, zdroj: 'nahraté v rozhraní', subory });
      await obnovZoznam(); nav(`#p/spis/${j.id}`);
    } catch (err) { stav.textContent = `Podanie sa nepodarilo prijať: ${err.message}`; tlacidlo.disabled = false; }
  } },
  el('label', {}, 'Výzva, do ktorej žiadosť patrí', vyzva),
  el('div', { class: 'pole' }, el('span', { class: 'popis' }, 'Súbory podania'), zona, vstup, zoznam),
  el('label', {}, 'Kód žiadosti z ITMS21+ (voliteľné: historická žiadosť, údaje formulára sa načítajú z verejných dát)', kod),
  el('div', { class: 'akcie' }, tlacidlo), stav);
  vstup.hidden = true;
  detail().replaceChildren(el('div', { class: 'sirka-detail' },
    el('h2', {}, 'Nová žiadosť o NFP'),
    el('p', { class: 'tlmene' }, 'Simulácia príjmu podania. V prevádzke by sem podanie prišlo samo, napríklad z e-mailovej schránky alebo z ITMS21+, cez to isté rozhranie (POST /api/podatelna/spisy). Súbory sa uložia do spisu na tomto počítači; nič sa nikam neodosiela.'),
    form,
    el('div', { class: 'pozn' }, el('b', {}, 'Ako softvér zaradí súbory. '),
      'Formulár žiadosti je súbor .json. Príloha s číslom v názve súboru (napr. Priloha_3_Uznesenie.pdf) sa zaradí podľa čísla, ako keby ju žiadateľ nahral do slotu v ITMS21+. Súbor bez čísla softvér zaradí podľa kľúčových slov; je to len odhad a kým ho kontrolór nepotvrdí, pravidlo prílohy nebude „splnené“. ZIP sa rozbalí.'),
    el('p', { class: 'tlmene male' }, 'Ukážkové podania sú v priečinku demo/podania/ (postup v demo/podania/README.md).')));
}

// ---------- detail spisu
async function kresliSpis(id) {
  aktualny = id; kresliZoznam();
  const d = await api(`/api/podatelna/spisy/${id}`);
  if (aktualny !== id) return;
  const { spis: s, subory, posudky, posledny, sloty, prilohyStav } = d;
  const llm = el('input', { type: 'checkbox', checked: stavApp?.modelDostupny ? '' : false, disabled: stavApp?.modelDostupny ? false : '' });
  const posud = el('button', { class: 'hlavne', disabled: s.maFormular ? false : '', onclick: async () => {
    posud.disabled = true; posud.textContent = llm.checked ? 'Posudzujem (model číta prílohy, asi minútu)…' : 'Posudzujem…';
    try { await api(`/api/podatelna/spisy/${id}/posud`, { llm: llm.checked }); await obnovZoznam(); await kresliSpis(id); $('#pod-vysledok')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    catch (e) { alert(`Posúdenie zlyhalo: ${e.message}`); posud.disabled = false; posud.textContent = 'Posúdiť žiadosť'; }
  } }, 'Posúdiť žiadosť');
  const poslednaZmena = subory.reduce((m, f) => (f.nahrate > m ? f.nahrate : m), '');
  const zastaraly = posledny && poslednaZmena > posledny.cas;

  detail().replaceChildren(el('div', { class: 'sirka-detail' },
    el('div', { class: 'titul' },
      el('div', {}, el('p', { class: 'tlmene male' }, `${s.cislo} · výzva ${s.vyzva} · `, el('b', {}, STAV_SPISU[s.stav] ?? s.stav)),
        el('h2', {}, s.nazov ?? 'Bez názvu'),
        el('p', { class: 'tlmene' }, `${s.ziadatel ?? 'žiadateľ neznámy'}${s.ico ? `, IČO ${s.ico}` : ''} · prijaté ${datum(s.prijate)} · ${s.zdroj}${s.formularZdroj ? ` · formulár: ${s.formularZdroj}` : ''}`)),
      el('div', { class: 'akcie' }, el('label', { class: 'prepinac', title: stavApp?.modelDostupny ? '' : 'Lokálny model nebeží' }, llm, 'Čítať prílohy lokálnym modelom'), posud)),
    d.suhrn ? el('p', { class: 'suhrn' }, d.suhrn) : null,
    s.maFormular ? null : el('div', { class: 'pozn' }, 'Spis nemá údaje formulára žiadosti. Doplňte formulár (.json) alebo založte podanie s kódom žiadosti z ITMS21+. Bez formulára sa žiadosť nedá posúdiť.'),
    el('div', { class: 'mriezka spis' }, boxPodklady(id, subory, sloty), boxPrilohy(prilohyStav, sloty)),
    el('div', { id: 'pod-vysledok' }, posledny ? vysledok(posledny, d.skutocnost, zastaraly) : el('p', { class: 'tlmene prazdne-vysledok' }, 'Žiadosť ešte nebola posúdená. Skontrolujte zaradenie súborov a stlačte „Posúdiť žiadosť“.')),
    boxRozhodnutie(id, s, posledny),
    boxHistoria(id, s, posudky)));
}

function boxPodklady(id, subory, sloty) {
  const moznosti = [['', 'Nezaradený (nehodnotí sa)'], ['formular', 'Formulár žiadosti (JSON)'], ...sloty.map((x) => [x.cislo, `Príloha č. ${x.cislo} – ${x.nazov}`])];
  const zarad = async (sid, ciel) => { try { await api(`/api/podatelna/subory/${sid}/zaradenie`, { ciel }); await obnovZoznam(); await kresliSpis(id); } catch (e) { alert(e.message); } };
  const tbody = el('tbody');
  for (const f of subory) {
    const ciel = f.typ === 'formular' ? 'formular' : f.typ === 'priloha' ? f.priloha : '';
    const odhad = f.typ === 'priloha' && (f.istota === 'nazov' || f.istota === 'obsah');
    const nahlad = el('tr', { class: 'nahlad', hidden: '' }, el('td', { colspan: '3' }, el('pre', { class: 'vystup' }, 'Načítavam…')));
    tbody.append(el('tr', {},
      el('td', {}, el('a', { href: `/api/podatelna/subory/${f.id}/stiahni`, title: 'Stiahnuť pôvodný súbor' }, f.nazov), el('br'),
        el('span', { class: 'tlmene male' }, `${f.davka === 1 ? 'podanie' : `doplnenie ${f.davka - 1}`} · ${cislo(f.velkost / 1024, 0)} kB · ${cislo(f.znakov, 0)} znakov textu`),
        f.chyba ? el('div', { class: 'chyba' }, f.chyba) : null),
      el('td', {}, el('select', { 'aria-label': `Zaradenie súboru ${f.nazov}`, onchange: (e) => zarad(f.id, e.target.value) },
        moznosti.map(([h, n]) => el('option', { value: h, selected: h === ciel ? '' : false }, n))),
      f.typ === 'priloha' && ISTOTA[f.istota] ? el('div', { class: `istota ${odhad ? 'odhad' : ''}` }, ISTOTA[f.istota]) : null),
      el('td', { class: 'akcie-suboru' },
        odhad ? el('button', { class: 'vedlajsie potvrd', onclick: () => zarad(f.id, ciel), title: 'Potvrdiť, že súbor je naozaj táto príloha' }, 'Potvrdiť') : null,
        el('button', { class: 'vedlajsie', onclick: async (e) => {
          nahlad.hidden = !nahlad.hidden; e.target.textContent = nahlad.hidden ? 'Text' : 'Skryť';
          if (!nahlad.hidden && !nahlad.dataset.nacitane) {
            const t = await api(`/api/podatelna/subory/${f.id}/text`); nahlad.dataset.nacitane = '1';
            nahlad.querySelector('pre').textContent = (t.text || t.chyba || '(prázdny text)').slice(0, 30000);
          }
        } }, 'Text'))), nahlad);
  }
  const vstup = el('input', { type: 'file', multiple: '', accept: '.zip,.pdf,.docx,.txt,.json', 'aria-label': 'Súbory doplnenia' });
  const stav = el('span', { class: 'tlmene male', role: 'status' });
  return el('div', { class: 'box' },
    el('h3', {}, `Podklady v spise (${subory.length})`),
    el('p', { class: 'tlmene male' }, 'Zaradenie môžete zmeniť. Súbor zaradený len odhadom (podľa názvu alebo obsahu) treba potvrdiť, inak pravidlo prílohy ostane „na preverenie“.'),
    el('table', { class: 'subory' }, el('thead', {}, el('tr', {}, el('th', {}, 'Súbor'), el('th', {}, 'Zaradenie'), el('th', {}, ''))), tbody),
    el('div', { class: 'doplnenie' }, el('span', { class: 'popis' }, 'Doplniť podklady (napr. po výzve na doplnenie):'), vstup,
      el('button', { class: 'vedlajsie', onclick: async () => {
        if (!vstup.files.length) { stav.textContent = 'Vyberte súbory.'; return; }
        stav.textContent = 'Nahrávam…';
        try { await api(`/api/podatelna/spisy/${id}/subory`, { subory: await Promise.all([...vstup.files].map(async (f) => ({ nazov: f.name, base64: await naBase64(f) }))) }); await obnovZoznam(); await kresliSpis(id); }
        catch (e) { stav.textContent = `Chyba: ${e.message}`; }
      } }, 'Nahrať doplnenie'), stav));
}

function boxPrilohy(prilohyStav, sloty) {
  const meno = (c) => sloty.find((x) => x.cislo === c)?.nazov ?? '';
  return el('div', { class: 'box' },
    el('h3', {}, 'Povinné prílohy podľa výzvy'),
    prilohyStav ? el('ul', { class: 'prilohy-stav' }, prilohyStav.filter((p) => p.stav !== 'neuplatnuje_sa').map((p) => el('li', {},
      el('span', { class: `stitok s-${p.stav}` }, STAVY[p.stav]), el('span', {}, el('b', {}, `Príloha č. ${p.cislo}`), ` ${meno(p.cislo)}`, el('br'), el('span', { class: 'tlmene male' }, p.zdovodnenie)))))
      : el('p', { class: 'tlmene' }, 'Bez formulára žiadosti sa nedá určiť, ktoré prílohy sú povinné.'),
    prilohyStav?.some((p) => p.stav === 'neuplatnuje_sa') ? el('p', { class: 'tlmene male' }, `Na túto žiadosť sa nevzťahujú: ${prilohyStav.filter((p) => p.stav === 'neuplatnuje_sa').map((p) => `č. ${p.cislo}`).join(', ')}.`) : null,
    el('p', { class: 'tlmene male' }, 'Tu sa kontroluje len prítomnosť príloh (okamžite, bez modelu). Obsah príloh overí až posúdenie.'));
}

function vysledok(p, skutocnost, zastaraly) {
  const v = el('div'); kresliVerdikt(v, p);
  const n = el('div'); kresliNalezy(n, p.nalezy);
  return el('div', {},
    el('div', { class: 'sk-nadpis' }, `Posledný posudok · ${datum(p.cas)}`),
    zastaraly ? el('div', { class: 'pozn' }, 'Po tomto posudku pribudli do spisu nové podklady. Posúďte žiadosť znova.') : null,
    v,
    skutocnost ? el('div', { class: 'skutocnost' }, `Historická žiadosť z ITMS21+, pre porovnanie: ${skutocnost}`) : null,
    n);
}

function boxRozhodnutie(id, s, posledny) {
  let volba = s.rozhodnutie ?? null; let auto = '';
  const pozn = el('textarea', { rows: 4, placeholder: 'Odôvodnenie alebo text výzvy na doplnenie', 'aria-label': 'Poznámka k rozhodnutiu' });
  pozn.value = s.rozhodnutiePozn ?? '';
  const varovanie = el('p', { class: 'varovanie', role: 'status' });
  const proti = (r) => !posledny ? 'Žiadosť ešte nebola posúdená softvérom.'
    : r === 'splnila' && ['nesplnene_podmienky', 'vyzva_na_doplnenie'].includes(posledny.navrh) ? 'Rozhodnutie je proti návrhu softvéru (zistené porušenie alebo chýbajúce podklady). Uveďte dôvod do poznámky.'
      : r === 'nesplnila' && ['bez_zisteni', 'ciastocne_overene'].includes(posledny.navrh) ? 'Softvér nenašiel porušenie. Uveďte, ktorú podmienku žiadosť nespĺňa.'
        : r === 'splnila' && posledny.navrh === 'na_preverenie' ? 'Softvér označil body na preverenie. Rozhodnite až po ich posúdení.' : '';
  const povinnaPoznamka = (r) => !!posledny && ((r === 'splnila' && ['nesplnene_podmienky', 'vyzva_na_doplnenie'].includes(posledny.navrh)) || (r === 'nesplnila' && ['bez_zisteni', 'ciastocne_overene'].includes(posledny.navrh)) || r === 'doplnenie');
  const tlacidla = Object.entries(ROZHODNUTIA).map(([k, n]) => el('button', { type: 'button', class: `volba v-${FARBA_ROZH[k]}`, 'aria-pressed': String(volba === k), onclick: () => vyber(k) }, n));
  const vyber = (k) => {
    volba = k; tlacidla.forEach((t, i) => t.setAttribute('aria-pressed', String(Object.keys(ROZHODNUTIA)[i] === k)));
    varovanie.textContent = proti(k);
    // Pri výzve na doplnenie predvyplníme zoznam chýbajúcich podkladov z posudku; kontrolór ho upraví.
    if (k === 'doplnenie' && (!pozn.value.trim() || pozn.value === auto)) {
      const chyby = posledny?.nalezy.filter((n) => n.stav === 'chyba_podklad') ?? [];
      auto = chyby.length ? `Výzva na doplnenie. Chýbajúce alebo neúplné podklady:\n${chyby.map((n, i) => `${i + 1}. ${n.nazov}: ${n.zdovodnenie}`).join('\n')}` : '';
      pozn.value = auto;
    }
  };
  const stav = el('span', { class: 'tlmene male', role: 'status' });
  return el('div', { class: 'box rozhodnutie' },
    el('h3', {}, 'Rozhodnutie kontrolóra'),
    el('p', { class: 'tlmene male' }, 'Softvér len navrhuje, rozhoduje kontrolór. Rozhodnutie sa uloží do spisu a započíta do úspešnosti výzvy. Nič sa žiadateľovi automaticky neposiela.'),
    s.rozhodnutie ? el('p', {}, 'Uložené: ', el('span', { class: `stitok s-${FARBA_ROZH[s.rozhodnutie]}` }, ROZHODNUTIA[s.rozhodnutie]), el('span', { class: 'tlmene male' }, ` ${datum(s.rozhodnutieCas)}`)) : null,
    el('div', { class: 'volby', role: 'group', 'aria-label': 'Rozhodnutie' }, tlacidla),
    varovanie, pozn,
    el('div', { class: 'akcie' }, el('button', { class: 'hlavne', onclick: async () => {
      if (!volba) { stav.textContent = 'Vyberte rozhodnutie.'; return; }
      if (povinnaPoznamka(volba) && !pozn.value.trim()) { stav.textContent = 'Pri tomto rozhodnutí je poznámka povinná.'; pozn.focus(); return; }
      try { await api(`/api/podatelna/spisy/${id}/rozhodnutie`, { rozhodnutie: volba, poznamka: pozn.value }); await obnovZoznam(); await kresliSpis(id); }
      catch (e) { stav.textContent = `Chyba: ${e.message}`; }
    } }, 'Uložiť rozhodnutie'), stav));
}

function boxHistoria(id, s, posudky) {
  return el('div', { class: 'box historia' },
    el('h3', {}, 'História posudkov (auditná stopa)'),
    posudky.length ? el('table', {}, el('thead', {}, el('tr', {}, ['Čas', 'Návrh softvéru', 'Model', 'Trvanie'].map((h, k) => el('th', { class: k === 3 ? 'c' : '' }, h)))),
      el('tbody', {}, posudky.map((p) => el('tr', {}, el('td', {}, datum(p.cas)), el('td', {}, el('span', { class: `stitok s-${FARBA_NAVRHU[p.navrh]}` }, NAVRHY_KRATKO[p.navrh] ?? p.navrh)),
        el('td', {}, p.model ?? 'bez modelu'), el('td', { class: 'c' }, `${(p.trvanieMs / 1000).toFixed(1)} s`)))))
      : el('p', { class: 'tlmene' }, 'Zatiaľ žiadny posudok.'),
    el('div', { class: 'akcie' }, el('button', { class: 'vedlajsie nebezpecne', onclick: async () => {
      if (!confirm(`Vymazať spis ${s.cislo} aj s nahratými súbormi? Posudky ostanú v auditnej stope bez väzby na spis.`)) return;
      try { await api(`/api/podatelna/spisy/${id}/vymaz`, {}); await obnovZoznam(); nav('#p/prehlad'); } catch (e) { alert(e.message); }
    } }, 'Vymazať spis')));
}
