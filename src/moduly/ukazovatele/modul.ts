// Modul: merateľné ukazovatele projektu (MU) a monitorovacie správy.
// Vstup: projekt z ITMS21+ (cieľové hodnoty, termíny monitorovania) + skutočné hodnoty, ktoré zadá používateľ
// (verejné API skutočné hodnoty MU nezverejňuje). Krátenie NFP sa počíta prepisom sankčnej kalkulačky SIEA.
import type { Doklad, Modul, Nalez, Pole, Pravidlo, Projekt, Ukazovatel, VysledokKontroly } from '../../core/typy.ts';
import { cislo, dnes, dokladyVstupov, eur, num, projekty, projektPodlaKodu, skDatum, ZADANE } from '../spolocne.ts';
import { kalkulacka, type RiadokMU } from './kalkulacka.ts';

export interface VstupUkazovatele {
  projekt: Projekt;
  skutocne: Record<string, number | null>;
  podmienenost: Record<string, boolean>;
  prahVystup: number | null; prahVysledok: number | null; maxVystup: number | null; maxVysledok: number | null;
  cov: number | null;
  externe: '' | 'ano' | 'nie';
  predlozene: number | null;
}

/** Ukazovatele, pri ktorých je cieľom pokles (spotreba energie, emisie). Kalkulačka SIEA ich priamo nevie. */
const ZNIZUJUCE = new Set(['PSKPRCR26b', 'PSKPRCR29', 'PSKPRCR26a', 'PSKPRCR26']);
export const jeZnizujuci = (u: Ukazovatel) => ZNIZUJUCE.has(u.kod) || (u.vychodisko != null && u.ciel != null && u.ciel < u.vychodisko);

/** Ukazovateľ s cieľom 0 (napr. kapacita OZE v projekte bez OZE) nie je zazmluvnený a do výpočtu nevstupuje. */
export const nezazmluvneny = (u: Ukazovatel) => u.ciel === 0 && !((u.vychodisko ?? 0) > 0);

/** Percento naplnenia jedného MU (ohraničené na 100). Pri klesajúcom MU podiel dosiahnutého poklesu. */
export function naplnenie(u: Ukazovatel, skut: number | null): number | null {
  if (skut == null || u.ciel == null) return null;
  if (jeZnizujuci(u)) {
    if (u.vychodisko == null || u.vychodisko === u.ciel) return null;
    return Math.min(100, ((u.vychodisko - skut) / (u.vychodisko - u.ciel)) * 100);
  }
  if (u.ciel <= 0) return null;
  return Math.min(100, (skut / u.ciel) * 100);
}

function riadky(v: VstupUkazovatele): RiadokMU[] {
  // Klesajúce MU sa do kalkulačky vložia ako už prepočítané percento (cieľ 100, stav = naplnenie).
  return v.projekt.ukazovatele.filter((u) => !nezazmluvneny(u)).flatMap((u) => {
    const s = v.skutocne[u.kod]; const n = naplnenie(u, s ?? null);
    if (s == null || u.ciel == null) return [];
    const typ = u.typ === 'vystup' ? 'výstup' as const : 'výsledok' as const;
    return jeZnizujuci(u) ? (n == null ? [] : [{ kod: u.kod, typ, ciel: 100, skutocnost: n, podmienenost: v.podmienenost[u.kod] }])
      : [{ kod: u.kod, typ, ciel: u.ciel, skutocnost: s, podmienenost: v.podmienenost[u.kod] }];
  });
}
export const vypocet = (v: VstupUkazovatele) => kalkulacka({ A: v.cov ?? v.projekt.cov, C: v.prahVystup, D: v.prahVysledok, E: v.maxVystup, F: v.maxVysledok, riadky: riadky(v) });

const zoznamMU = (us: Ukazovatel[], v: VstupUkazovatele) => us.map((u) => `${u.kod} ${cislo(naplnenie(u, v.skutocne[u.kod] ?? null), 1)} %`).join(', ');

function kontrolaVystup(v: VstupUkazovatele): VysledokKontroly {
  const vsetky = v.projekt.ukazovatele.filter((u) => u.typ === 'vystup'); const us = vsetky.filter((u) => !nezazmluvneny(u));
  if (!us.length) return { stav: 'neuplatnuje_sa', zdovodnenie: vsetky.length ? `MU výstupu majú cieľovú hodnotu 0 (${vsetky.map((u) => u.kod).join(', ')}), nie sú zazmluvnené.` : 'Projekt nemá merateľný ukazovateľ výstupu.' };
  const chyba = us.filter((u) => v.skutocne[u.kod] == null);
  if (chyba.length) return { stav: 'mimo_podkladov', zdovodnenie: `Chýba skutočný alebo plánovaný stav pre ${chyba.map((u) => u.kod).join(', ')}. Verejné dáta ITMS21+ skutočné hodnoty MU neobsahujú, treba ich zadať z monitorovacej správy.` };
  const zle = us.filter((u) => naplnenie(u, v.skutocne[u.kod]!) == null);
  if (zle.length) return { stav: 'na_preverenie', zdovodnenie: `Naplnenie sa nedá vypočítať pre ${zle.map((u) => u.kod).join(', ')} (chýba alebo je nulová cieľová či východisková hodnota).` };
  const k = vypocet(v);
  const pod95 = us.filter((u) => naplnenie(u, v.skutocne[u.kod]!)! < 95);
  const hodnoty = { naplnenieVystupov: k.E32 == null ? null : Math.round(k.E32 * 100) / 100, kratenieEUR: typeof k.E35 === 'number' ? Math.round(k.E35 * 100) / 100 : null };
  if (!pod95.length) return { stav: 'splnene', zdovodnenie: `Všetky MU výstupu dosiahli aspoň 95 % cieľovej hodnoty (${zoznamMU(us, v)}). Podľa kalkulačky bez krátenia.`, hodnoty };
  if (v.prahVystup == null) return { stav: 'nesplnene', zdovodnenie: `MU výstupu pod 95 % cieľa: ${zoznamMU(pod95, v)}. NFP sa kráti automaticky (sankčný mechanizmus). Výšku krátenia nevieme určiť, chýba percento z čl. 4.3 zmluvy a maximálne zníženie COV.`, hodnoty };
  if (typeof k.E35 === 'string') return { stav: 'nesplnene', zdovodnenie: `MU výstupu pod hranicou ${cislo(v.prahVystup)} % z čl. 4.3 zmluvy alebo priemer pod ňou (${zoznamMU(us, v)}). Kalkulačka: „${k.E35}“.`, hodnoty };
  if (k.E34 === 0) return { stav: 'na_preverenie', zdovodnenie: `Priemerné naplnenie MU výstupu je ${cislo(k.E32, 2)} %, kalkulačka preto krátenie nepočíta. Jednotlivo však pod 95 % cieľa: ${zoznamMU(pod95, v)}. Čl. 18 ods. 1 písm. h) VZP hovorí o odchýlke ukazovateľa nad 5 %, treba overiť postup poskytovateľa.`, hodnoty };
  return { stav: 'nesplnene', zdovodnenie: `Priemerné naplnenie MU výstupu ${cislo(k.E32, 2)} % je pod 95 %. Zníženie COV ${typeof k.E34 === 'number' ? cislo(k.E34, 3) + ' %' : '–'}, krátenie ${typeof k.E35 === 'number' ? eur(k.E35) : 'nevieme vypočítať (chýba maximálne zníženie COV)'}.`, hodnoty };
}

function kontrolaVysledok(v: VstupUkazovatele): VysledokKontroly {
  const vsetky = v.projekt.ukazovatele.filter((u) => u.typ === 'vysledok'); const us = vsetky.filter((u) => !nezazmluvneny(u));
  if (!us.length) return { stav: 'neuplatnuje_sa', zdovodnenie: vsetky.length ? `MU výsledku majú cieľovú hodnotu 0 (${vsetky.map((u) => u.kod).join(', ')}), nie sú zazmluvnené.` : 'Projekt nemá merateľný ukazovateľ výsledku.' };
  const chyba = us.filter((u) => v.skutocne[u.kod] == null);
  if (chyba.length) return { stav: 'mimo_podkladov', zdovodnenie: `Chýba skutočný alebo plánovaný stav pre ${chyba.map((u) => u.kod).join(', ')}. Verejné dáta ITMS21+ skutočné hodnoty MU neobsahujú.` };
  const zle = us.filter((u) => naplnenie(u, v.skutocne[u.kod]!) == null);
  if (zle.length) return { stav: 'na_preverenie', zdovodnenie: `Naplnenie sa nedá vypočítať pre ${zle.map((u) => u.kod).join(', ')} (pri klesajúcom ukazovateli chýba východisková hodnota).` };
  const klesajuce = us.filter(jeZnizujuci);
  const pozn = klesajuce.length ? ` Klesajúce ukazovatele (${klesajuce.map((u) => u.kod).join(', ')}) kalkulačka SIEA priamo nepodporuje (počíta skutočnosť / cieľ); softvér ich prepočítal ako podiel dosiahnutého poklesu.` : '';
  const k = vypocet(v);
  const pod95 = us.filter((u) => naplnenie(u, v.skutocne[u.kod]!)! < 95);
  const hodnoty = { naplnenieVysledkov: k.F32 == null ? null : Math.round(k.F32 * 100) / 100, kratenieEUR: typeof k.F35 === 'number' ? Math.round(k.F35 * 100) / 100 : null };
  if (!pod95.length) return { stav: 'splnene', zdovodnenie: `Všetky MU výsledku dosiahli aspoň 95 % (${zoznamMU(us, v)}).${pozn}`, hodnoty };
  if (v.prahVysledok != null && k.F32 != null && k.F32 < v.prahVysledok) return { stav: 'nesplnene', zdovodnenie: `Naplnenie MU výsledku ${cislo(k.F32, 2)} % je pod hranicou ${cislo(v.prahVysledok)} % z čl. 4.3 zmluvy. Kalkulačka: „${k.F35}“.${pozn}`, hodnoty };
  const suma = typeof k.F35 === 'number' ? eur(k.F35) : 'nevieme vypočítať (chýba % z čl. 4.3 alebo maximálne zníženie COV)';
  if (v.externe === 'nie') return { stav: 'nesplnene', zdovodnenie: `MU výsledku pod 95 %: ${zoznamMU(pod95, v)}. Externé faktory neboli preukázané, krátenie podľa kalkulačky: ${suma}.${pozn}`, hodnoty };
  return { stav: 'na_preverenie', zdovodnenie: `MU výsledku pod 95 %: ${zoznamMU(pod95, v)}. Bez sankcie len vtedy, ak nedosiahnutie spôsobili externé faktory mimo vplyvu prijímateľa; to posúdi človek. Krátenie bez tejto výnimky: ${suma}.${pozn}`, hodnoty };
}

function kontrolaMonitorovanie(v: VstupUkazovatele): VysledokKontroly {
  const d = dnes();
  const uplynule = v.projekt.terminy.filter((t) => t.najneskor && t.najneskor < d);
  const zoznam = (ts: typeof uplynule) => ts.map((t) => `${t.typ.toLowerCase()} č. ${t.poradie} (najneskôr ${skDatum(t.najneskor)})`).join('; ');
  if (!v.projekt.terminy.length) return { stav: 'mimo_podkladov', zdovodnenie: 'Projekt nemá v ITMS21+ harmonogram monitorovania.' };
  if (!uplynule.length) return { stav: 'neuplatnuje_sa', zdovodnenie: `Zatiaľ neuplynul žiadny termín. Najbližší: ${zoznam(v.projekt.terminy.slice(0, 1))}.` };
  if (v.predlozene == null) return { stav: 'na_preverenie', zdovodnenie: `Uplynulo ${uplynule.length} termínov: ${zoznam(uplynule)}. Z verejných dát nevidno, či boli správy predložené; zadajte počet predložených správ.`, hodnoty: { uplynulo: uplynule.length } };
  if (v.predlozene < uplynule.length) return { stav: 'nesplnene', zdovodnenie: `Predložených ${v.predlozene} správ, uplynulo ${uplynule.length} termínov. Chýba: ${zoznam(uplynule.slice(v.predlozene))}.`, hodnoty: { uplynulo: uplynule.length, predlozene: v.predlozene } };
  return { stav: 'splnene', zdovodnenie: `Predložených ${v.predlozene} správ na ${uplynule.length} uplynulých termínov.`, hodnoty: { uplynulo: uplynule.length, predlozene: v.predlozene } };
}

const zakladny = (p: Projekt): VstupUkazovatele => ({
  projekt: p, skutocne: Object.fromEntries(p.ukazovatele.map((u) => [u.kod, null])), podmienenost: {},
  prahVystup: null, prahVysledok: null, maxVystup: null, maxVysledok: null, cov: p.cov, externe: '', predlozene: null,
});

const FILTRE: Record<string, (p: Projekt) => boolean> = {
  bezi: (p) => !p.ukonceny, ukonceny: (p) => p.ukonceny && /riadne/i.test(p.stav), mimoriadne: (p) => /mimoriadne/i.test(p.stav),
};

/** Doklady k nálezom MU: cieľové hodnoty a termíny z ITMS21+, dosiahnuté hodnoty a počet správ zo zadania kontrolóra. */
function dokladyMu(v: VstupUkazovatele, n: Nalez, p: Pravidlo): Doklad[] {
  const z = projektPodlaKodu(v.projekt.kod);
  const zdroj = { itms: `ITMS21+, projekt ${v.projekt.kod}`, formular: `Formulár kontrolóra, projekt ${v.projekt.kod} (údaje z monitorovacej správy)` };
  if (p.kontrola === 'monitorovanie') {
    const terminy = (pr?: Projekt) => pr?.terminy.map((t) => `${t.typ.toLowerCase()} č. ${t.poradie}: najneskôr ${skDatum(t.najneskor)}`);
    return dokladyVstupov(n, zdroj, [['Termíny monitorovacích správ', terminy(v.projekt), terminy(z)], ['Počet predložených správ', v.predlozene, ZADANE]], [['Deň kontroly', dnes(), dnes()]]);
  }
  const typ = p.kontrola === 'mu_vystup' ? 'vystup' : p.kontrola === 'mu_vysledok' ? 'vysledok' : null;
  if (!typ) return [];
  const ciele = (pr?: Projekt) => pr?.ukazovatele.filter((u) => u.typ === typ).map((u) => `${u.kod}: cieľ ${cislo(u.ciel, 4)}${u.vychodisko != null ? `, východisko ${cislo(u.vychodisko, 4)}` : ''} ${u.jednotka}`);
  const us = v.projekt.ukazovatele.filter((u) => u.typ === typ && !nezazmluvneny(u));
  const dosiahnute = us.length && us.every((u) => v.skutocne[u.kod] != null) ? us.map((u) => `${u.kod}: ${cislo(v.skutocne[u.kod], 4)} ${u.jednotka}`) : null;
  return dokladyVstupov(n, zdroj, [['Cieľové hodnoty MU podľa zmluvy', ciele(v.projekt), ciele(z)], ['Dosiahnuté hodnoty MU', dosiahnute, ZADANE]]);
}

export const ukazovatele: Modul<VstupUkazovatele> = {
  id: 'ukazovatele', nazov: 'Merateľné ukazovatele',
  popis: 'Plnenie merateľných ukazovateľov projektu, krátenie NFP podľa sankčnej kalkulačky SIEA a termíny monitorovacích správ.',
  filtre: [{ hodnota: 'bezi', nazov: 'V realizácii' }, { hodnota: 'ukonceny', nazov: 'Riadne ukončené' }, { hodnota: 'mimoriadne', nazov: 'Mimoriadne ukončené' }],
  pripady(q, filter, limit = 80) {
    const s = q.toLowerCase();
    const v = projekty().filter((p) => (!filter || FILTRE[filter]?.(p)) && (!s || `${p.kod} ${p.nazov} ${p.prijimatel.nazov}`.toLowerCase().includes(s)));
    return { spolu: v.length, pripady: v.slice(0, limit).map((p) => ({ id: p.kod, nazov: p.nazov, podnazov: p.prijimatel.nazov, stitok: p.stav })) };
  },
  nacitaj: (id) => { const p = projektPodlaKodu(id); return p ? zakladny(p) : undefined; },
  polia(v) {
    const p: Pole[] = v.projekt.ukazovatele.map((u) => ({
      kluc: `skut_${u.kod}`, typ: 'cislo' as const, nazov: `${u.typ === 'vystup' ? 'Výstup' : 'Výsledok'} ${u.kod}: skutočný stav (${u.jednotka})`,
      napoveda: `${u.nazov}. Cieľ ${cislo(u.ciel, 4)}${u.vychodisko != null ? `, východisko ${cislo(u.vychodisko, 4)}` : ''}${jeZnizujuci(u) ? ', cieľom je pokles' : ''}${nezazmluvneny(u) ? '. Cieľ 0: ukazovateľ nie je zazmluvnený, do výpočtu nevstupuje' : ''}.`,
    }));
    for (const u of v.projekt.ukazovatele.filter((x) => x.typ === 'vysledok')) p.push({ kluc: `pod_${u.kod}`, typ: 'anone', nazov: `${u.kod} je vecne podmienený MU výstupu`, napoveda: 'Stĺpec G kalkulačky: ak áno, pri krátení za výstup sa výsledok nekráti druhýkrát.' });
    p.push(
      { kluc: 'prahVystup', typ: 'cislo', nazov: 'Percento z čl. 4.3 zmluvy pre MU výstupu', napoveda: 'Vo vzore zmluvy je prázdne, doplní sa zo zmluvy projektu.' },
      { kluc: 'prahVysledok', typ: 'cislo', nazov: 'Percento z čl. 4.3 zmluvy pre MU výsledku' },
      { kluc: 'maxVystup', typ: 'cislo', nazov: 'Maximálne % zníženia COV za MU výstupu' },
      { kluc: 'maxVysledok', typ: 'cislo', nazov: 'Maximálne % zníženia COV za MU výsledku' },
      { kluc: 'cov', typ: 'cislo', nazov: 'Zazmluvnené COV (EUR)' },
      { kluc: 'externe', typ: 'vyber', nazov: 'Nedosiahnutie MU výsledku spôsobili externé faktory', moznosti: [{ hodnota: '', nazov: 'neposúdené' }, { hodnota: 'ano', nazov: 'áno, preukázané' }, { hodnota: 'nie', nazov: 'nie' }] },
      { kluc: 'predlozene', typ: 'cislo', nazov: 'Počet predložených monitorovacích správ' },
    );
    return p;
  },
  prilohy: () => [],
  doFormulara(v) {
    const f: Record<string, any> = { prahVystup: v.prahVystup, prahVysledok: v.prahVysledok, maxVystup: v.maxVystup, maxVysledok: v.maxVysledok, cov: v.cov, externe: v.externe, predlozene: v.predlozene };
    for (const u of v.projekt.ukazovatele) { f[`skut_${u.kod}`] = v.skutocne[u.kod] ?? null; if (u.typ === 'vysledok') f[`pod_${u.kod}`] = v.podmienenost[u.kod] ? 'ano' : 'nie'; }
    return f;
  },
  zFormulara(v, f) {
    const n: VstupUkazovatele = structuredClone(v);
    for (const u of n.projekt.ukazovatele) { n.skutocne[u.kod] = num(f[`skut_${u.kod}`]); if (u.typ === 'vysledok') n.podmienenost[u.kod] = f[`pod_${u.kod}`] === 'ano'; }
    n.prahVystup = num(f.prahVystup); n.prahVysledok = num(f.prahVysledok); n.maxVystup = num(f.maxVystup); n.maxVysledok = num(f.maxVysledok);
    n.cov = num(f.cov) ?? v.projekt.cov; n.externe = f.externe === 'ano' || f.externe === 'nie' ? f.externe : ''; n.predlozene = num(f.predlozene);
    return n;
  },
  doklady: dokladyMu,
  inventarPodmienok: true,
  kontroly: { mu_vystup: kontrolaVystup, mu_vysledok: kontrolaVysledok, monitorovanie: kontrolaMonitorovanie },
  hlavnyText: (v) => v.projekt.popis,
  kontext: (v) => `Projekt ${v.projekt.kod}: ${v.projekt.nazov}`,
  titulok: (v) => ({ kod: v.projekt.kod, nazov: v.projekt.nazov, podnazov: `${v.projekt.prijimatel.nazov} · ${v.projekt.stav} · hlavné aktivity ${skDatum(v.projekt.planZaciatok)} – ${skDatum(v.projekt.planKoniec)}` }),
  suhrn: (v) => `COV ${eur(v.projekt.cov)} · ukazovatele: ${v.projekt.ukazovatele.map((u) => `${u.kod} cieľ ${cislo(u.ciel, 2)} ${u.jednotka}`).join('; ')}`,
  vystupy(v: VstupUkazovatele, _n: Nalez[]) {
    const k = vypocet(v);
    const riadkyText = v.projekt.ukazovatele.map((u) => `${u.kod} (${u.typ === 'vystup' ? 'výstup' : 'výsledok'}${jeZnizujuci(u) ? ', klesajúci' : ''}): cieľ ${cislo(u.ciel, 4)}, stav ${cislo(v.skutocne[u.kod], 4)}, naplnenie ${cislo(naplnenie(u, v.skutocne[u.kod] ?? null), 2)} %`).join('\n');
    const bunka = (x: any, d = 3) => (x === '' ? '(prázdne)' : typeof x === 'number' ? cislo(x, d) : x ?? '–');
    const d = dnes(); const buduce = v.projekt.terminy.filter((t) => t.najneskor && t.najneskor >= d).slice(0, 3);
    return [
      { nazov: 'Výpočet podľa sankčnej kalkulačky (príloha č. 12)', text: `${riadkyText}\n\nA (COV) ${eur(v.cov ?? v.projekt.cov)} · C ${bunka(v.prahVystup)} % · D ${bunka(v.prahVysledok)} % · E ${bunka(v.maxVystup)} % · F ${bunka(v.maxVysledok)} %\nG percento naplnenia: výstup ${bunka(k.E32, 2)} %, výsledok ${bunka(k.F32, 2)} %\nH zníženie COV na 1 % nedodržania: výstup ${bunka(k.E33, 4)}, výsledok ${bunka(k.F33, 4)}\nI percento zníženia COV: výstup ${bunka(k.E34)}, výsledok ${bunka(k.F34)}\nKrátenie COV: výstup ${typeof k.E35 === 'number' ? eur(k.E35) : bunka(k.E35)}, výsledok ${typeof k.F35 === 'number' ? eur(k.F35) : bunka(k.F35)}` },
      { nazov: 'Najbližšie termíny monitorovacích správ', text: buduce.length ? buduce.map((t) => `${t.typ.toLowerCase()} č. ${t.poradie}: monitorované obdobie do ${skDatum(t.termin)}, predložiť najneskôr ${skDatum(t.najneskor)}`).join('\n') : 'Žiadny budúci termín v ITMS21+.' },
    ];
  },
};
