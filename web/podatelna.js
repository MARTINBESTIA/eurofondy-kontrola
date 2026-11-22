// Podateľňa: kontrolór prijme podanie (súbory žiadosti alebo kód z ITMS21+), skontroluje zaradenie príloh,
// spustí posúdenie a zapíše rozhodnutie. Výsledky sa ukladajú do spisu (SQLite) a sčítavajú za výzvu.
// Lokálna simulácia importu podania z ITMS21+ používa POST /api/podatelna/spisy.
import { $, el, api, cislo, pct, datum, naBase64, STAVY, NAVRHY_KRATKO, TIP_FORMALNE, kresliVerdikt, kresliNalezy, kresliDoklady } from './ui.js';

const FORMATY_PODANIA = '.zip,.pdf,.xlsx,.xlsm,.docx,.txt,.json';

const ROZHODNUTIA = { splnila: 'Splnila podmienky', doplnenie: 'Výzva na doplnenie', nesplnila: 'Nesplnila podmienky' };
const STAV_SPISU = { prijata: 'prijatá, neposúdená', posudena: 'posúdená, čaká na rozhodnutie', caka_na_doplnenie: 'čaká na doplnenie', doplnena: 'doplnená, treba posúdiť znova', rozhodnuta: 'rozhodnutá' };
const ISTOTA = { cislo: 'číslo prílohy v názve súboru', rucne: 'potvrdil kontrolór', nazov: 'odhad podľa názvu súboru', obsah: 'odhad podľa obsahu', ziadna: '' };
/** Farba štítku návrhu a rozhodnutia: rovnaké farby ako stavy pravidiel. */
const FARBA_NAVRHU = { nesplnene_podmienky: 'nesplnene', vyzva_na_doplnenie: 'chyba_podklad', na_preverenie: 'na_preverenie', ciastocne_overene: 'mimo_podkladov', bez_zisteni: 'splnene' };
const FARBA_ROZH = { splnila: 'splnene', doplnenie: 'chyba_podklad', nesplnila: 'nesplnene' };
/** Lehota na doplnenie: úroveň stavu (src/podatelna/lehoty.ts) a výsledok doplnenia na farby štítkov. */
const FARBA_LEHOTY = { ok: 'splnene', info: 'mimo_podkladov', pozor: 'na_preverenie', chyba: 'nesplnene' };
const DOPLNENIE = { vcas: ['včas', 'splnene'], neiste: ['nedá sa isto určiť', 'na_preverenie'], po_lehote: ['po lehote', 'nesplnene'] };
/** Dnešný deň v SR (RRRR-MM-DD) a deň v slovenskom zápise. */
const dnesSk = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Bratislava' }).format(new Date());
const skDen = (d) => (d ? `${Number(d.slice(8, 10))}. ${Number(d.slice(5, 7))}. ${d.slice(0, 4)}` : '–');

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
      el('span', { class: 'm' }, el('span', {}, `${s.cislo} · ${s.suborov} súb.`), stitokSpisu(s)),
      s.lehota ? el('span', { class: `lehota-riadok l-${s.lehota.uroven}`, title: s.lehota.sprava }, s.lehota.kratko) : null));
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
  const vstup = el('input', { type: 'file', multiple: '', accept: FORMATY_PODANIA, onchange: (e) => { pridaj([...e.target.files]); e.target.value = ''; } });
  const zona = el('div', { class: 'dropzona', tabindex: '0', role: 'button', onclick: () => vstup.click(), onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); vstup.click(); } },
    ondragover: (e) => { e.preventDefault(); zona.classList.add('nad'); }, ondragleave: () => zona.classList.remove('nad'),
    ondrop: (e) => { e.preventDefault(); zona.classList.remove('nad'); pridaj([...e.dataTransfer.files]); } },
  el('b', {}, 'Pretiahnite sem ZIP alebo súbory podania'), el('span', { class: 'tlmene male' }, 'alebo vyberte formulár JSON a prílohy PDF, Excel, DOCX či TXT naraz'));
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
    el('p', { class: 'tlmene' }, 'Lokálna ukážka príjmu podkladov z ITMS21+. Nahraté súbory sa uložia do jedného spisu na tomto počítači.'),
    form,
    el('div', { class: 'pozn' }, el('b', {}, 'Ako softvér zaradí súbory. '),
      'Formulár žiadosti je súbor .json. Príloha s číslom v názve súboru (napr. Priloha_3_Uznesenie.pdf) sa zaradí podľa čísla, ako keby ju žiadateľ nahral do slotu v ITMS21+. Súbor bez čísla softvér zaradí podľa kľúčových slov; je to len odhad a kým ho kontrolór nepotvrdí, pravidlo prílohy nebude „splnené“. ZIP sa rozbalí.'),
    el('p', {}, el('a', { href: '/demo/01-komplet.zip', download: '01-komplet.zip' }, 'Stiahnuť ukážkové podanie (ZIP)'),
      ' · Chorvátsky Grob, verejný formulár a modelové prílohy.')));
}

// ---------- detail spisu
async function kresliSpis(id) {
  aktualny = id; kresliZoznam();
  const d = await api(`/api/podatelna/spisy/${id}`);
  if (aktualny !== id) return;
  const { spis: s, subory, posudky, posledny, sloty, prilohyStav } = d;
  const vyzvy = d.vyzvy ?? [], dnes = d.dnes ?? dnesSk();
  // Výzva uložená k poslednému posudku: návrh výzvy ukáže jej text a opätovné uloženie rozhodnutia ju opraví.
  const ulozena = vyzvy[0] && vyzvy[0].posudokId === posudky[0]?.id ? vyzvy[0] : null;
  const llm = el('input', { type: 'checkbox', checked: stavApp?.modelDostupny ? '' : false, disabled: stavApp?.modelDostupny ? false : '' });
  // Predvolene vypnuté: kontroluje sa obsah podľa požiadaviek výzvy, podpisy nie (výrok potom nebude „bez zistení“).
  const formalne = el('input', { type: 'checkbox' });
  const posud = el('button', { class: 'hlavne', disabled: s.maFormular ? false : '', onclick: async () => {
    posud.disabled = true; posud.textContent = llm.checked ? 'Posudzujem (model číta prílohy, asi minútu)…' : 'Posudzujem…';
    try { await api(`/api/podatelna/spisy/${id}/posud`, { llm: llm.checked, formalne: formalne.checked }); await obnovZoznam(); await kresliSpis(id); $('#pod-vysledok')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    catch (e) { alert(`Posúdenie zlyhalo: ${e.message}`); posud.disabled = false; posud.textContent = 'Posúdiť žiadosť'; }
  } }, 'Posúdiť žiadosť');
  const poslednaZmena = subory.reduce((m, f) => (f.nahrate > m ? f.nahrate : m), '');
  const zastaraly = posledny && poslednaZmena > posledny.cas;
  const vyzva = posledny ? boxVyzva(id, s, zastaraly, ulozena) : null;

  detail().replaceChildren(el('div', { class: 'sirka-detail' },
    el('div', { class: 'titul' },
      el('div', {}, el('p', { class: 'tlmene male' }, `${s.cislo} · výzva ${s.vyzva} · `, el('b', {}, STAV_SPISU[s.stav] ?? s.stav)),
        el('h2', {}, s.nazov ?? 'Bez názvu'),
        el('p', { class: 'tlmene' }, `${s.ziadatel ?? 'žiadateľ neznámy'}${s.ico ? `, IČO ${s.ico}` : ''} · prijaté ${datum(s.prijate)} · ${s.zdroj}${s.formularZdroj ? ` · formulár: ${s.formularZdroj}` : ''}`)),
      el('div', { class: 'akcie' }, el('label', { class: 'prepinac', title: stavApp?.modelDostupny ? '' : 'Lokálny model nebeží' }, llm, 'Čítať prílohy lokálnym modelom'),
        el('label', { class: 'prepinac', title: TIP_FORMALNE }, formalne, 'Kontrolovať aj podpisy'), posud)),
    d.suhrn ? el('p', { class: 'suhrn' }, d.suhrn) : null,
    s.maFormular ? null : el('div', { class: 'pozn' }, 'Spis nemá údaje formulára žiadosti. Doplňte formulár (.json) alebo založte podanie s kódom žiadosti z ITMS21+. Bez formulára sa žiadosť nedá posúdiť.'),
    boxLehota(id, s, vyzvy, dnes),
    el('div', { class: 'mriezka spis' }, boxPodklady(id, subory, sloty, dnes), boxPrilohy(prilohyStav, sloty)),
    el('div', { id: 'pod-vysledok' }, posledny ? vysledok(posledny, d.skutocnost, zastaraly) : el('p', { class: 'tlmene prazdne-vysledok' }, 'Žiadosť ešte nebola posúdená. Skontrolujte zaradenie súborov a stlačte „Posúdiť žiadosť“.')),
    vyzva?.prvok ?? null,
    boxRozhodnutie(id, s, posledny, subory, vyzva, { vyzvy, ulozena, dnes }),
    boxHistoria(id, s, posudky)));
}

// ---------- lehota na doplnenie (MD č. 21, kap. 2.4 ods. 5 a 8): stav počíta server, kontrolór dopĺňa dátumy
function boxLehota(id, s, vyzvy, dnes) {
  if (!vyzvy.length) {
    return s.rozhodnutie === 'doplnenie' ? el('div', { class: 'pozn' }, 'Výzva na doplnenie v tomto spise bola uložená skôr, ako aplikácia sledovala lehoty. Ak chcete lehotu sledovať, uložte rozhodnutie „Výzva na doplnenie“ znova a zadajte deň odoslania výzvy.') : null;
  }
  const [v, ...starsie] = vyzvy;
  const st = v.stav;
  const pole = (hodnota, attrs = {}) => el('input', { type: 'date', value: hodnota ?? '', ...attrs });
  const odoslana = pole(v.odoslana, { max: dnes, required: '' });
  const dorucena = pole(v.dorucena, { min: v.odoslana, max: dnes });
  const predlzene = pole(v.predlzeneDo, { min: v.odoslana });
  const dovod = el('input', { type: 'text', value: v.predlzeniePozn ?? '', maxlength: '500', placeholder: 'napr. žiadosť zo 12. 11. 2026' });
  const stav = el('span', { class: 'tlmene male', role: 'status' });
  const uloz = el('button', { class: 'vedlajsie', type: 'submit' }, 'Uložiť údaje o lehote');
  const form = el('form', { class: 'lehota-udaje', onsubmit: async (e) => {
    e.preventDefault();
    uloz.disabled = true; stav.textContent = 'Ukladám…';
    try {
      await api(`/api/podatelna/spisy/${id}/lehota`, { vyzva: v.id, odoslana: odoslana.value, dorucena: dorucena.value || null, predlzeneDo: predlzene.value || null, predlzeniePozn: dovod.value.trim() || null });
      await obnovZoznam(); await kresliSpis(id);
    } catch (err) { stav.textContent = `Neuložené: ${err.message}`; uloz.disabled = false; }
  } },
  el('label', {}, 'Výzva odoslaná (uložená do e-schránky) dňa', odoslana),
  el('label', {}, 'Doručená dňa (podľa elektronickej doručenky)', dorucena),
  el('label', {}, 'Lehota predĺžená do', predlzene),
  el('label', {}, 'Na základe čoho bola predĺžená', dovod),
  el('div', { class: 'akcie' }, uloz, stav));
  const koniec = st.koniec ? skDen(st.koniec) : `najskôr ${skDen(st.koniecNajskor)}, najneskôr ${skDen(st.koniecNajneskor)}`;
  const stitok = (x) => el('span', { class: `stitok s-${FARBA_LEHOTY[x.uroven]}` }, x.kratko);
  return el('details', { class: 'box lehota', open: s.rozhodnutie === 'doplnenie' ? '' : false },
    el('summary', {}, el('span', {}, vyzvy.length > 1 ? `Lehota na doplnenie (výzva č. ${v.poradie})` : 'Lehota na doplnenie'), stitok(st)),
    el('p', { class: `sprava-lehoty l-${st.uroven}`, role: 'status' }, st.sprava),
    el('ul', { class: 'fakty-lehoty tlmene male' },
      el('li', {}, `Lehota ${v.lehotaDni} pracovných dní od doručenia výzvy odoslanej ${skDen(v.odoslana)}. Posledný deň lehoty: ${koniec}.`),
      v.dorucena ? null : el('li', {}, `Ak žiadateľ výzvu neprevezme, považuje sa za doručenú uplynutím úložnej lehoty dňa ${skDen(st.fikcia)}.`),
      v.predlzeneDo ? el('li', {}, `Predĺžená do ${skDen(v.predlzeneDo)}${v.predlzeniePozn ? `: ${v.predlzeniePozn}` : ''}.`) : null,
      st.doplnenia.map((x) => el('li', {}, `Doplnenie č. ${x.davka - 1} odoslané do ITMS21+ ${x.odoslane ? skDen(x.odoslane) : '(deň nezadaný)'}: `,
        el('span', { class: `stitok s-${DOPLNENIE[x.vysledok][1]}` }, DOPLNENIE[x.vysledok][0])))),
    st.upozornenia.length ? el('ul', { class: 'upozornenia-vyzvy tlmene male' }, st.upozornenia.map((u) => el('li', {}, u))) : null,
    form,
    v.text ? el('details', { class: 'odoslany-text' }, el('summary', {}, 'Text odoslanej výzvy'), el('pre', { class: 'vystup' }, v.text)) : null,
    starsie.length ? el('details', { class: 'starsie-vyzvy' }, el('summary', {}, `Predchádzajúce výzvy (${starsie.length})`),
      el('ul', { class: 'tlmene male' }, starsie.map((x) => el('li', {}, `Výzva č. ${x.poradie} odoslaná ${skDen(x.odoslana)}: `, stitok(x.stav), ` ${x.stav.sprava}`)))) : null,
    el('p', { class: 'tlmene male' }, 'Prvým dňom lehoty je najbližší pracovný deň po doručení a za deň doplnenia sa považuje deň odoslania do neverejnej časti ITMS21+ (MD č. 21, kap. 2.4 ods. 5). Zmeškanie lehoty nemožno odpustiť (ods. 8). Výzva je doručená potvrdením doručenky alebo uplynutím 15-dňovej úložnej lehoty (kap. 2.2 ods. 5). Dni pracovného pokoja podľa zákona č. 241/1993 Z. z. „Včas“ softvér uvedie len vtedy, keď je to isté pri každom možnom dni doručenia.'));
}

function boxPodklady(id, subory, sloty, dnes) {
  const moznosti = [['', 'Nezaradený (nehodnotí sa)'], ['formular', 'Formulár žiadosti (JSON)'], ...sloty.map((x) => [x.cislo, `Príloha č. ${x.cislo} – ${x.nazov}`])];
  const zarad = async (sid, ciel) => { try { await api(`/api/podatelna/subory/${sid}/zaradenie`, { ciel }); await obnovZoznam(); await kresliSpis(id); } catch (e) { alert(e.message); } };
  const tbody = el('tbody');
  for (const f of subory) {
    const ciel = f.typ === 'formular' ? 'formular' : f.typ === 'priloha' ? f.priloha : '';
    const odhad = f.typ === 'priloha' && (f.istota === 'nazov' || f.istota === 'obsah');
    const nahlad = el('tr', { class: 'nahlad', hidden: '' }, el('td', { colspan: '3' }, el('pre', { class: 'vystup' }, 'Načítavam…')));
    tbody.append(el('tr', {},
      el('td', {}, el('a', { href: `/api/podatelna/subory/${f.id}/stiahni`, title: 'Stiahnuť pôvodný súbor' }, f.nazov), el('br'),
        el('span', { class: 'tlmene male' }, `${f.davka === 1 ? 'podanie' : `doplnenie ${f.davka - 1}${f.odoslane ? ` odoslané ${skDen(f.odoslane)}` : ''}`} · ${cislo(f.velkost / 1024, 0)} kB · ${cislo(f.znakov, 0)} znakov textu`),
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
  const vstup = el('input', { type: 'file', multiple: '', accept: FORMATY_PODANIA, 'aria-label': 'Súbory doplnenia' });
  // Predvolene dnes: zabudnutý dátum tak môže doplnenie len oneskoriť (falošný poplach), nikdy ho neurobí včasným.
  const odoslane = el('input', { type: 'date', value: dnes, max: dnes, 'aria-label': 'Deň odoslania doplnenia do ITMS21+' });
  const stav = el('span', { class: 'tlmene male', role: 'status' });
  return el('div', { class: 'box' },
    el('h3', {}, `Podklady v spise (${subory.length})`),
    el('p', { class: 'tlmene male' }, 'Zaradenie môžete zmeniť. Súbor zaradený len odhadom (podľa názvu alebo obsahu) treba potvrdiť, inak pravidlo prílohy ostane „na preverenie“.'),
    el('table', { class: 'subory' }, el('thead', {}, el('tr', {}, el('th', {}, 'Súbor'), el('th', {}, 'Zaradenie'), el('th', {}, ''))), tbody),
    el('div', { class: 'doplnenie' }, el('span', { class: 'popis' }, 'Doplniť podklady (napr. po výzve na doplnenie):'), vstup,
      el('label', { class: 'odoslane-doplnenie', title: 'Za deň doplnenia sa považuje deň odoslania do neverejnej časti ITMS21+ (MD č. 21, kap. 2.4 ods. 5).' }, 'odoslané do ITMS21+ dňa', odoslane),
      el('button', { class: 'vedlajsie', onclick: async () => {
        if (!vstup.files.length) { stav.textContent = 'Vyberte súbory.'; return; }
        stav.textContent = 'Nahrávam…';
        try { await api(`/api/podatelna/spisy/${id}/subory`, { odoslane: odoslane.value || null, subory: await Promise.all([...vstup.files].map(async (f) => ({ nazov: f.name, base64: await naBase64(f) }))) }); await obnovZoznam(); await kresliSpis(id); }
        catch (e) { stav.textContent = `Chyba: ${e.message}`; }
      } }, 'Nahrať doplnenie'), stav));
}

function boxPrilohy(prilohyStav, sloty) {
  const meno = (c) => sloty.find((x) => x.cislo === c)?.nazov ?? '';
  return el('div', { class: 'box' },
    el('h3', {}, 'Povinné prílohy podľa výzvy'),
    prilohyStav ? el('ul', { class: 'prilohy-stav' }, prilohyStav.filter((p) => p.stav !== 'neuplatnuje_sa').map((p, i, vsetky) => el('li', {},
      el('span', { class: `stitok s-${p.stav}` }, STAVY[p.stav]), el('div', {},
        // Druhé pravidlo k tej istej prílohe (napr. súlad zošita s formulárom) sa označí svojím názvom, nie znova názvom slotu.
        vsetky.slice(0, i).some((x) => x.cislo === p.cislo) && p.nazov ? el('b', {}, p.nazov) : [el('b', {}, `Príloha č. ${p.cislo}`), ` ${meno(p.cislo)}`],
        el('br'), el('span', { class: 'tlmene male' }, p.zdovodnenie),
        p.doklady?.length ? el('details', { class: 'priloha-doklady' }, el('summary', {}, 'Podklady kontroly'), kresliDoklady(p.doklady)) : null))))
      : el('p', { class: 'tlmene' }, 'Bez formulára žiadosti sa nedá určiť, ktoré prílohy sú povinné.'),
    prilohyStav?.some((p) => p.stav === 'neuplatnuje_sa') ? el('p', { class: 'tlmene male' }, `Na túto žiadosť sa nevzťahujú: ${prilohyStav.filter((p) => p.stav === 'neuplatnuje_sa').map((p) => `č. ${p.cislo}`).join(', ')}.`) : null,
    el('p', { class: 'tlmene male' }, 'Tento prehľad kontroluje priradenie a čitateľnosť príloh. Pri rozpočte kontroluje aj identifikáciu žiadosti, vyplnenie položiek v záväznom zošite a zhodu ním vypočítaných oprávnených výdavkov s rozpočtom formulára.'));
}

function vysledok(p, skutocnost, zastaraly, nazov = 'Posledný posudok') {
  const v = el('div'); kresliVerdikt(v, p);
  const n = el('div'); kresliNalezy(n, p.nalezy, true, p.formularItms);
  return el('div', {},
    el('div', { class: 'sk-nadpis' }, `${nazov} · ${datum(p.cas)}`),
    zastaraly ? el('div', { class: 'pozn' }, 'Po tomto posudku pribudli do spisu nové podklady. Posúďte žiadosť znova.') : null,
    v,
    skutocnost ? el('div', { class: 'skutocnost' }, `Historická žiadosť z ITMS21+, pre porovnanie: ${skutocnost}`) : null,
    n);
}

// ---------- návrh výzvy na doplnenie (MD č. 21, kap. 2.4): softvér zostaví text, kontrolór ho upraví a odošle sám
// `ulozena` = výzva už uložená k tomuto posudku: box ukáže jej body, lehotu a text, aby opätovné uloženie nič neprepísalo.
function boxVyzva(id, s, zastaraly, ulozena) {
  const st = { vyber: ulozena?.polozky ?? null, lehota: ulozena?.lehotaDni ?? 5, upravene: false, navrh: null };
  const zmeny = []; // poslucháči zmeny návrhu (rozhodnutie preberá lehotu, body a text)
  const zoznam = el('ul', { class: 'polozky-vyzvy' });
  const upozornenia = el('ul', { class: 'upozornenia-vyzvy tlmene male' });
  const pocet = el('span', { class: 'tlmene male' });
  const stav = el('span', { class: 'tlmene male', role: 'status' });
  const text = el('textarea', { rows: 18, class: 'text-vyzvy', spellcheck: 'false', 'aria-label': 'Text návrhu výzvy na doplnenie', oninput: () => { st.upravene = true; } });
  const lehota = el('input', { type: 'number', min: '5', step: '1', value: String(st.lehota), onchange: () => {
    const n = Number(lehota.value);
    if (!Number.isInteger(n) || n < 5) { stav.textContent = 'Lehota musí byť celý počet pracovných dní, najmenej 5.'; return; }
    st.lehota = n; nacitaj();
  } });
  const zaskrtavacie = new Map();
  const kresliPolozky = (polozky) => zoznam.replaceChildren(...polozky.map((x) => {
    const cb = el('input', { type: 'checkbox', onchange: () => { st.vyber = polozky.filter((p) => zaskrtavacie.get(p.id).checked).map((p) => p.id); nacitaj(); } });
    zaskrtavacie.set(x.id, cb);
    return el('li', {}, el('label', { class: 'polozka-vyzvy' }, cb, el('div', {},
      el('span', { class: `stitok s-${x.stav}` }, STAVY[x.stav]), ' ', el('b', {}, x.podmienka),
      el('div', {}, el('span', { class: 'tlmene' }, 'Zistenie: '), x.zistenie),
      el('div', {}, el('span', { class: 'tlmene' }, 'Požadujeme: '), x.poziadavka),
      el('div', { class: 'tlmene male' }, `Bod ${x.pravidla.join(', ')} · ${x.nazov}`),
      x.upozornenie ? el('div', { class: 'varovanie' }, x.upozornenie) : null)));
  }));
  const nacitaj = async (prepisat = false) => {
    try {
      const j = await api(`/api/podatelna/spisy/${id}/vyzva`, { vyber: st.vyber ?? undefined, lehota: st.lehota });
      const prvy = !st.navrh;
      if (prvy) {
        if (!j.polozky.length) return; // posudok nemá čo doplniť: box ostane skrytý
        kresliPolozky(j.polozky);
        upozornenia.replaceChildren(...j.upozornenia.map((u) => el('li', {}, u)));
        box.hidden = false; box.open = j.vybrane.length > 0;
      }
      st.navrh = j; st.vyber = j.vybrane;
      for (const [k, cb] of zaskrtavacie) cb.checked = j.vybrane.includes(k);
      pocet.textContent = ` · zaradené ${j.vybrane.length} z ${j.polozky.length}`;
      if (prvy && ulozena?.text) { text.value = ulozena.text; st.upravene = true; stav.textContent = 'Zobrazený je text výzvy uloženej pri rozhodnutí. Tlačidlo „Zostaviť znova“ ho nahradí novým návrhom z nálezov.'; }
      else if (!st.upravene || prepisat) { text.value = j.text || 'Vyberte aspoň jeden bod.'; st.upravene = false; stav.textContent = ''; }
      else stav.textContent = 'Text ste upravili ručne, preto ho zmena výberu neprepísala. Tlačidlo „Zostaviť znova“ ho prepíše.';
      zmeny.forEach((f) => f());
    } catch (e) { stav.textContent = `Návrh sa nepodarilo zostaviť: ${e.message}`; }
  };
  const stiahni = () => {
    const a = el('a', { href: URL.createObjectURL(new Blob(['﻿' + text.value.replace(/\r?\n/g, '\r\n')], { type: 'text/plain;charset=utf-8' })), download: `Vyzva_na_doplnenie_${s.cislo}.txt` });
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const box = el('details', { class: 'box vyzva-navrh', hidden: '' },
    el('summary', {}, 'Návrh výzvy na doplnenie', pocet),
    el('p', { class: 'tlmene male' }, 'Softvér zostaví návrh z nálezov posledného posudku podľa metodického usmernenia MIRRI č. 21, kap. 2.4: pri každom bode uvedie PPP, zistenie a požiadavku, pridá lehotu a poučenie o možnosti zastaviť konanie. Body vyberte, text skontrolujte a upravte. Nič sa neodosiela.'),
    zastaraly ? el('div', { class: 'pozn' }, 'Po poslednom posudku pribudli do spisu nové podklady. Posúďte žiadosť znova, inak návrh nezodpovedá spisu.') : null,
    zoznam, upozornenia,
    el('label', { class: 'lehota-vyzvy' }, 'Lehota na doplnenie v pracovných dňoch od doručenia výzvy (najmenej 5)', lehota),
    text,
    el('div', { class: 'akcie' },
      el('button', { class: 'vedlajsie', onclick: async (e) => { try { await navigator.clipboard.writeText(text.value); e.target.textContent = 'Skopírované'; } catch { e.target.textContent = 'Nedá sa kopírovať'; } } }, 'Kopírovať'),
      el('button', { class: 'vedlajsie', onclick: stiahni }, 'Stiahnuť ako .txt'),
      el('button', { class: 'vedlajsie', onclick: () => nacitaj(true) }, 'Zostaviť znova'), stav),
    el('p', { class: 'tlmene male' }, 'Výzvu odošlite do elektronickej schránky žiadateľa do vlastných rúk a informáciu o nej aj na jeho e-mail alebo cez modul Komunikácia v ITMS21+. Potom v rozhodnutí vyberte „Výzva na doplnenie“ a zadajte deň odoslania. Poznámka sa predvyplní zoznamom zaradených bodov a aplikácia začne sledovať lehotu.'));
  nacitaj();
  return {
    prvok: box,
    poznamka: () => st.navrh?.poznamka || null,
    maNavrh: () => !!st.navrh?.polozky.length,
    lehota: () => st.lehota,
    vybrane: () => st.navrh?.vybrane ?? [],
    // Bez vybraného bodu a bez ručnej úpravy je v poli len pokyn „Vyberte aspoň jeden bod“, nie text výzvy.
    text: () => (st.navrh?.vybrane.length || st.upravene ? text.value : null),
    priZmene: (f) => zmeny.push(f),
  };
}

function boxRozhodnutie(id, s, posledny, subory, vyzva, { vyzvy, ulozena, dnes }) {
  let volba = s.rozhodnutie ?? null; let auto = '';
  const pozn = el('textarea', { rows: 4, placeholder: 'Odôvodnenie alebo text výzvy na doplnenie', 'aria-label': 'Poznámka k rozhodnutiu' });
  pozn.value = s.rozhodnutiePozn ?? '';
  const varovanie = el('p', { class: 'varovanie', role: 'status' });
  // Pred neschválením má žiadateľ dostať aspoň jednu výzvu na doplnenie (MD č. 21, kap. 2.4 ods. 12), okrem neodstrániteľného nedostatku (ods. 16).
  const vyzvaUz = vyzvy.length > 0 || s.rozhodnutie === 'doplnenie' || subory.some((f) => f.davka > 1);
  // Odoslanie výzvy: deň odoslania a lehota, od ktorých aplikácia sleduje lehotu na doplnenie.
  // Lehotu preberá z návrhu výzvy (tam je aj v texte), vlastné pole je len pri spise bez návrhu.
  const odoslana = el('input', { type: 'date', value: ulozena?.odoslana ?? dnes, max: dnes, 'aria-label': 'Deň odoslania výzvy' });
  const lehotaVlastna = el('input', { type: 'number', min: '5', step: '1', value: String(ulozena?.lehotaDni ?? 5), 'aria-label': 'Lehota na doplnenie v pracovných dňoch' });
  const lehotaPole = el('label', {}, 'Lehota v pracovných dňoch od doručenia (najmenej 5)', lehotaVlastna);
  const lehotaZNavrhu = el('p', { class: 'tlmene male', hidden: '' });
  const zNavrhu = () => !!vyzva?.maNavrh();
  const obnovLehotu = () => {
    lehotaPole.hidden = zNavrhu(); lehotaZNavrhu.hidden = !zNavrhu();
    if (zNavrhu()) lehotaZNavrhu.textContent = `Lehota ${vyzva.lehota()} pracovných dní od doručenia, ako v návrhu výzvy vyššie.`;
  };
  // Pri výzve na doplnenie predvyplníme body zaradené v návrhu výzvy (bez návrhu chýbajúce podklady). Kým kontrolór
  // poznámku neupraví, sleduje návrh: zmena bodov alebo lehoty v návrhu ju prepíše.
  const obnovPoznamku = () => {
    if (volba !== 'doplnenie' || (pozn.value.trim() && pozn.value !== auto)) return;
    const chyby = posledny?.nalezy.filter((n) => n.stav === 'chyba_podklad') ?? [];
    auto = vyzva?.poznamka() ?? (chyby.length ? `Výzva na doplnenie. Chýbajúce alebo neúplné podklady:\n${chyby.map((n, i) => `${i + 1}. ${n.nazov}: ${n.zdovodnenie}`).join('\n')}` : '');
    pozn.value = auto;
  };
  vyzva?.priZmene(() => { obnovLehotu(); obnovPoznamku(); });
  const odoslanie = el('div', { class: 'odoslanie-vyzvy', hidden: volba === 'doplnenie' ? false : '' },
    el('label', {}, 'Výzva odoslaná do elektronickej schránky žiadateľa dňa', odoslana), lehotaPole, lehotaZNavrhu,
    el('p', { class: 'tlmene male' }, 'Po uložení aplikácia sleduje lehotu. Deň doručenia z elektronickej doručenky doplníte v boxe „Lehota na doplnenie“ hore v spise.'));
  obnovLehotu();
  const proti = (r) => !posledny ? 'Žiadosť ešte nebola posúdená softvérom.'
    : r === 'splnila' && ['nesplnene_podmienky', 'vyzva_na_doplnenie'].includes(posledny.navrh) ? 'Rozhodnutie je proti návrhu softvéru (zistené porušenie alebo chýbajúce podklady). Uveďte dôvod do poznámky.'
      : r === 'nesplnila' && ['bez_zisteni', 'ciastocne_overene'].includes(posledny.navrh) ? 'Softvér nenašiel porušenie. Uveďte, ktorú podmienku žiadosť nespĺňa.'
        : r === 'splnila' && posledny.navrh === 'na_preverenie' ? 'Softvér označil body na preverenie. Rozhodnite až po ich posúdení.'
          : r === 'nesplnila' && !vyzvaUz ? 'V spise nie je výzva na doplnenie. Metodika ju pred neschválením vyžaduje aspoň raz (MD č. 21, kap. 2.4 ods. 12). Bez nej len vtedy, ak sa nedostatok nedá napraviť; dôvod uveďte do poznámky (ods. 16).' : '';
  const povinnaPoznamka = (r) => !!posledny && ((r === 'splnila' && ['nesplnene_podmienky', 'vyzva_na_doplnenie'].includes(posledny.navrh)) || (r === 'nesplnila' && ['bez_zisteni', 'ciastocne_overene'].includes(posledny.navrh)) || (r === 'nesplnila' && !vyzvaUz) || r === 'doplnenie');
  const tlacidla = Object.entries(ROZHODNUTIA).map(([k, n]) => el('button', { type: 'button', class: `volba v-${FARBA_ROZH[k]}`, 'aria-pressed': String(volba === k), onclick: () => vyber(k) }, n));
  const vyber = (k) => {
    volba = k; tlacidla.forEach((t, i) => t.setAttribute('aria-pressed', String(Object.keys(ROZHODNUTIA)[i] === k)));
    varovanie.textContent = proti(k);
    odoslanie.hidden = k !== 'doplnenie'; obnovLehotu(); obnovPoznamku();
  };
  const stav = el('span', { class: 'tlmene male', role: 'status' });
  return el('div', { class: 'box rozhodnutie' },
    el('h3', {}, 'Rozhodnutie kontrolóra'),
    el('p', { class: 'tlmene male' }, 'Softvér len navrhuje, rozhoduje kontrolór. Rozhodnutie sa uloží do spisu a započíta do úspešnosti výzvy. Nič sa žiadateľovi automaticky neposiela.'),
    s.rozhodnutie ? el('p', {}, 'Uložené: ', el('span', { class: `stitok s-${FARBA_ROZH[s.rozhodnutie]}` }, ROZHODNUTIA[s.rozhodnutie]), el('span', { class: 'tlmene male' }, ` ${datum(s.rozhodnutieCas)}`)) : null,
    el('div', { class: 'volby', role: 'group', 'aria-label': 'Rozhodnutie' }, tlacidla),
    varovanie, odoslanie, pozn,
    el('div', { class: 'akcie' }, el('button', { class: 'hlavne', onclick: async () => {
      if (!volba) { stav.textContent = 'Vyberte rozhodnutie.'; return; }
      if (povinnaPoznamka(volba) && !pozn.value.trim()) { stav.textContent = 'Pri tomto rozhodnutí je poznámka povinná.'; pozn.focus(); return; }
      const telo = { rozhodnutie: volba, poznamka: pozn.value };
      if (volba === 'doplnenie') {
        const lehota = zNavrhu() ? vyzva.lehota() : Number(lehotaVlastna.value);
        if (!odoslana.value) { stav.textContent = 'Zadajte deň odoslania výzvy.'; odoslana.focus(); return; }
        if (!Number.isInteger(lehota) || lehota < 5) { stav.textContent = 'Lehota musí byť celý počet pracovných dní, najmenej 5.'; return; }
        telo.vyzva = { odoslana: odoslana.value, lehota, polozky: zNavrhu() ? vyzva.vybrane() : null, text: zNavrhu() ? vyzva.text() : null };
      }
      try { await api(`/api/podatelna/spisy/${id}/rozhodnutie`, telo); await obnovZoznam(); await kresliSpis(id); }
      catch (e) { stav.textContent = `Chyba: ${e.message}`; }
    } }, 'Uložiť rozhodnutie'), stav));
}

function boxHistoria(id, s, posudky) {
  const ciel = `historia-posudku-${id}`;
  const zaznam = el('div', { id: ciel, class: 'historia-zaznam', hidden: '' });
  let otvoreny = null;
  const riadok = (p) => {
    const volba = el('button', { type: 'button', class: 'odkaz-posudku', 'aria-controls': ciel, 'aria-expanded': 'false',
      'aria-label': `Otvoriť posudok č. ${p.id} z ${datum(p.cas)}`, onclick: async () => {
        if (otvoreny) otvoreny.setAttribute('aria-expanded', 'false');
        if (otvoreny === volba) { otvoreny = null; zaznam.hidden = true; return; }
        otvoreny = volba;
        volba.setAttribute('aria-expanded', 'true');
        zaznam.hidden = false;
        zaznam.replaceChildren(el('p', { role: 'status' }, 'Načítavam posudok…'));
        try {
          const { posudok } = await api(`/api/podatelna/spisy/${id}/posudky/${p.id}`);
          if (otvoreny === volba && zaznam.isConnected) {
            zaznam.replaceChildren(vysledok(posudok, null, false, `Posudok č. ${p.id} z histórie`));
            zaznam.scrollIntoView({ block: 'start' });
          }
        } catch (e) {
          if (otvoreny === volba) zaznam.replaceChildren(el('p', { role: 'alert', class: 'chyba' }, `Posudok sa nepodarilo načítať. ${e.message}`));
        }
      } }, datum(p.cas));
    return el('tr', { onclick: e => { if (!e.target.closest('button')) volba.click(); } },
      el('td', {}, volba), el('td', {}, el('span', { class: `stitok s-${FARBA_NAVRHU[p.navrh]}` }, NAVRHY_KRATKO[p.navrh] ?? p.navrh)),
      el('td', {}, p.model ?? 'bez modelu'), el('td', { class: 'c' }, `${(p.trvanieMs / 1000).toFixed(1)} s`));
  };
  return el('div', { class: 'box historia' },
    el('h3', {}, 'História posudkov (auditná stopa)'),
    posudky.length ? el('table', {}, el('thead', {}, el('tr', {}, ['Čas', 'Návrh softvéru', 'Model', 'Trvanie'].map((h, k) => el('th', { class: k === 3 ? 'c' : '' }, h)))),
      el('tbody', {}, posudky.map(riadok)))
      : el('p', { class: 'tlmene' }, 'Zatiaľ žiadny posudok.'),
    zaznam, el('div', { class: 'akcie' }, el('button', { class: 'vedlajsie nebezpecne', onclick: async () => {
      if (!confirm(`Vymazať spis ${s.cislo} aj s nahratými súbormi? Posudky ostanú v auditnej stope bez väzby na spis.`)) return;
      try { await api(`/api/podatelna/spisy/${id}/vymaz`, {}); await obnovZoznam(); nav('#p/prehlad'); } catch (e) { alert(e.message); }
    } }, 'Vymazať spis')));
}
