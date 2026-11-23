// Test lehoty na doplnenie ŽoNFP (src/podatelna/lehoty.ts): kalendár dní pracovného pokoja, koniec lehoty a stav.
// Hlavná poistka: softvér nikdy nepovie „včas“, ak by doplnenie pri niektorom možnom dni doručenia, niektorom
// výklade neistého sviatku alebo predĺženia prišlo po lehote. „Po lehote“ povie len vtedy, ak je to isté.
// Spustenie: node scripts/22-test-lehoty.ts
import { isDeepStrictEqual } from 'node:util';
import { dnesSk, jeDen, koniecLehoty, pracovnyDenPred, pridajDni, stavLehoty, typDna, velkonocnaNedela, ULOZNA_LEHOTA, type Den, type UdajeLehoty } from '../src/podatelna/lehoty.ts';

let chyb = 0;
const over = (nazov: string, skutocne: unknown, ocakavane: unknown = true) => {
  const ok = isDeepStrictEqual(skutocne, ocakavane);
  if (!ok) chyb++;
  console.log(`${ok ? '✓' : '✗'} ${nazov}${ok ? '' : `\n    čakané: ${JSON.stringify(ocakavane)}\n    je:     ${JSON.stringify(skutocne)}`}`);
};

// ---------- kalendár
over('Veľkonočná nedeľa 2000, 2019, 2024 až 2028', [2000, 2019, 2024, 2025, 2026, 2027, 2028].map(velkonocnaNedela),
  ['2000-04-23', '2019-04-21', '2024-03-31', '2025-04-20', '2026-04-05', '2027-03-28', '2028-04-16']);
const dni: [Den, string, string][] = [
  ['2026-05-08', 'pracovny', '8. máj 2026 (piatok) je pracovný deň podľa § 4b'],
  ['2026-09-15', 'pracovny', '15. september 2026 (utorok) je pracovný deň podľa § 4b'],
  ['2025-05-08', 'pokoj', '8. máj 2025 (štvrtok) bol deň pracovného pokoja'],
  ['2025-09-15', 'pokoj', '15. september 2025 (pondelok) bol deň pracovného pokoja'],
  ['2027-09-15', 'pokoj', '15. september 2027 (streda) je znova deň pracovného pokoja'],
  ['2025-09-01', 'pracovny', '1. september 2025 (Deň Ústavy, pondelok) bol pracovný deň'],
  ['2026-09-01', 'pracovny', '1. september 2026 je pracovný deň'],
  ['2025-11-17', 'pracovny', '17. november 2025 (pondelok) bol pracovný deň (zákon č. 261/2025 Z. z.)'],
  ['2026-11-17', 'pracovny', '17. november 2026 je pracovný deň'],
  ['2026-10-28', 'pracovny', '28. október nie je deň pracovného pokoja'],
  ['2026-04-03', 'pokoj', 'Veľký piatok 2026'],
  ['2026-04-06', 'pokoj', 'Veľkonočný pondelok 2026'],
  ['2026-04-02', 'pracovny', 'Zelený štvrtok 2026 je pracovný deň'],
  ['2026-01-06', 'pokoj', '6. január 2026'],
  ['2026-12-24', 'pokoj', 'Štedrý deň 2026'],
  ['2026-07-06', 'pracovny', 'Sviatok v nedeľu (5. 7. 2026) sa nenahrádza'],
  ['2026-11-21', 'pokoj', 'sobota'],
  ['2028-05-08', 'neisty', '8. máj 2028 je mimo overeného kalendára'],
  ['2023-09-01', 'neisty', '1. september 2023 je mimo overeného kalendára'],
  ['2028-05-09', 'pracovny', 'bežný utorok mimo overeného kalendára nie je neistý'],
];
for (const [d, typ, popis] of dni) over(popis, typDna(d), typ);

// ---------- koniec lehoty (MD č. 21, kap. 2.4 ods. 5)
const konce: [Den, number, Den, string][] = [
  ['2026-11-03', 5, '2026-11-10', 'doručené v utorok, 5 dní cez víkend'],
  ['2026-11-07', 5, '2026-11-13', 'doručené v sobotu: prvým dňom je pondelok'],
  ['2026-12-18', 5, '2026-12-29', 'cez Vianoce 24. až 26. 12.'],
  ['2026-04-02', 5, '2026-04-13', 'cez Veľkú noc'],
  ['2026-05-07', 5, '2026-05-14', '8. 5. 2026 sa počíta ako pracovný deň'],
  ['2025-05-07', 5, '2025-05-15', '8. 5. 2025 sa nepočíta'],
  ['2026-09-14', 5, '2026-09-21', '15. 9. 2026 sa počíta'],
  ['2027-09-14', 5, '2027-09-22', '15. 9. 2027 sa nepočíta'],
  ['2025-08-28', 5, '2025-09-05', '29. 8. sa nepočíta, 1. 9. 2025 áno'],
  ['2026-11-03', 10, '2026-11-17', '10 pracovných dní, 17. 11. 2026 sa počíta'],
];
for (const [dor, n, koniec, popis] of konce) over(`Koniec lehoty: ${popis}`, koniecLehoty(dor, n), koniec);
over('Neistý 8. máj 2028: skorší koniec, ak je pracovný', koniecLehoty('2028-05-05', 5, 'pracovny'), '2028-05-12');
over('Neistý 8. máj 2028: neskorší koniec, ak je voľný', koniecLehoty('2028-05-05', 5, 'volny'), '2028-05-15');
// Lehota späť, napr. ex post zmena „najneskôr 30 dní pred ŽoP“ (modul zmeny, Z05). 17. 11. už nie je voľno (od 2025).
over('30. pracovný deň pred 15. 12. 2026 je 3. 11. 2026', pracovnyDenPred('2026-12-15', 30), '2026-11-03');
over('31. pracovný deň pred 15. 12. 2026 je 2. 11. 2026', pracovnyDenPred('2026-12-15', 31), '2026-11-02');
over('Lehota späť preskočí Veľkú noc: 2. pracovný deň pred 7. 4. 2026 je 1. 4.', pracovnyDenPred('2026-04-07', 2), '2026-04-01');
over('Neistý 17. 11. 2028 ako pracovný: 1. pracovný deň pred 20. 11. 2028 je 17. 11.', pracovnyDenPred('2028-11-20', 1, 'pracovny'), '2028-11-17');
over('Neistý 17. 11. 2028 ako voľný: 1. pracovný deň pred 20. 11. 2028 je 16. 11.', pracovnyDenPred('2028-11-20', 1, 'volny'), '2028-11-16');

// ---------- pomocné funkcie
over('jeDen odmietne neplatné dátumy', [jeDen('2026-02-28'), jeDen('2026-02-30'), jeDen('2026-2-3'), jeDen(20261122), jeDen('')], [true, false, false, false, false]);
over('Dnešok v SR: po polnoci SEČ (UTC+1) je už ďalší deň', dnesSk(new Date('2026-11-21T23:30:00Z')), '2026-11-22');
over('Dnešok v SR: po polnoci SELČ (UTC+2) je už ďalší deň', dnesSk(new Date('2026-07-01T22:30:00Z')), '2026-07-02');

// ---------- stav lehoty
const V: UdajeLehoty = { odoslana: '2026-11-02', dorucena: '2026-11-03', lehotaDni: 5, predlzeneDo: null };
const bez = { ...V, dorucena: null };
const st = (v: UdajeLehoty, odoslane: (Den | null)[], dnes = '2026-11-30') => stavLehoty(v, odoslane.map((o, i) => ({ davka: i + 2, odoslane: o })), dnes);

let s = st(V, ['2026-11-10']);
over('Známe doručenie, doplnenie v posledný deň: včas', [s.kod, s.uroven, s.koniec], ['doplnene_vcas', 'ok', '2026-11-10']);
s = st(V, ['2026-11-11']);
over('Známe doručenie, doplnenie deň po lehote: po lehote', [s.kod, s.uroven, s.doplnenia[0].vysledok], ['doplnene_po_lehote', 'chyba', 'po_lehote']);
over('Text pri zmeškaní cituje ods. 8 a ods. 14', /nemožno odpustiť \(MD č\. 21, kap\. 2\.4 ods\. 8\).*ods\. 14/.test(s.sprava));
s = st(V, ['2026-11-09', '2026-11-12']);
over('Dve dávky, druhá po lehote: celkovo po lehote, prvá včas', [s.kod, s.doplnenia.map((d) => d.vysledok)], ['doplnene_po_lehote', ['vcas', 'po_lehote']]);
over('Text vymenuje aj včasnú dávku', /Včas prišlo doplnenie odoslané 9\. 11\. 2026/.test(s.sprava));

s = st(bez, ['2026-11-09']);
over('Bez doručenky, doplnenie do konca lehoty pri doručení v deň odoslania: včas', [s.kod, s.koniec, s.koniecNajskor], ['doplnene_vcas', null, '2026-11-09']);
s = st(bez, ['2026-11-10']);
over('Bez doručenky, doplnenie neskôr: na preverenie, nie včas', [s.kod, s.uroven], ['doplnene_neiste', 'pozor']);
over('Bez doručenky: najneskorší koniec počíta s fikciou doručenia', [s.fikcia, s.koniecNajneskor], [pridajDni('2026-11-02', ULOZNA_LEHOTA), '2026-11-24']);
over('Text žiada dátum z elektronickej doručenky', /chýba dátum doručenia z elektronickej doručenky/.test(s.sprava));
s = st(bez, ['2026-11-25']);
over('Bez doručenky ani doplnenie po najneskoršom konci nie je „po lehote“', s.kod, 'doplnene_neiste');
s = st(V, [null]);
over('Doplnenie bez dňa odoslania: na preverenie s upozornením', [s.kod, s.upozornenia], ['doplnene_neiste', ['Pri doplnení č. 1 chýba deň odoslania do ITMS21+. Bez neho sa nedá určiť, či prišlo včas.']]);

s = st(V, [], '2026-11-04');
over('Lehota plynie, zostáva 5 pracovných dní vrátane dneška', [s.kod, s.uroven, s.zostava, s.kratko], ['plynie', 'info', 5, 'lehota do 10. 11.']);
over('Text: plynie do dňa vrátane', s.sprava, 'Lehota plynie do 10. 11. 2026 vrátane, zostáva 5 pracovných dní.');
s = st(V, [], '2026-11-03');
over('V deň doručenia zostáva celá lehota', s.zostava, 5);
s = st(V, [], '2026-11-07');
over('Cez víkend sa rátajú len pracovné dni (a sloveso sa zhoduje s číslom)', [s.zostava, s.sprava], [2, 'Lehota plynie do 10. 11. 2026 vrátane, zostávajú 2 pracovné dni.']);
over('V nedeľu pred posledným dňom zostáva jeden deň', st({ ...V, dorucena: '2026-11-02' }, [], '2026-11-08').sprava, 'Lehota plynie do 9. 11. 2026 vrátane, zostáva 1 pracovný deň.');
s = st(V, [], '2026-11-10');
over('Posledný deň lehoty', [s.kod, s.sprava], ['plynie', 'Dnes je posledný deň lehoty (10. 11. 2026).']);
s = st(V, [], '2026-11-11');
over('Lehota uplynula bez doplnenia (známe doručenie)', [s.kod, /Overte v ITMS21\+/.test(s.sprava), /§ 17 ods\. 2/.test(s.sprava)], ['uplynula', true, true]);
s = st(bez, [], '2026-11-05');
over('Bez doručenky lehota plynie bez presného konca', [s.kod, s.koniec, s.zostava, s.kratko], ['plynie', null, null, 'lehota plynie']);
s = st(bez, [], '2026-11-11');
over('Bez doručenky po najskoršom konci: lehota možno uplynula', s.kod, 'mozno_uplynula');
s = st(bez, [], '2026-11-25');
over('Bez doručenky po najneskoršom konci: stále len „možno“, s vysvetlením', [s.kod, /pravdepodobne uplynula/.test(s.sprava)], ['mozno_uplynula', true]);

const P = { ...V, predlzeneDo: '2026-11-17' };
over('Predĺženie: doplnenie pred novým koncom je včas', st(P, ['2026-11-16']).kod, 'doplnene_vcas');
over('Predĺženie: doplnenie po novom konci je po lehote', st(P, ['2026-11-18']).kod, 'doplnene_po_lehote');
const PS = { ...V, predlzeneDo: '2026-11-21' }; // sobota
s = st(PS, ['2026-11-23']);
over('Predĺženie končí v sobotu: doplnenie v pondelok je na preverenie', [s.kod, s.koniecNajskor, s.koniecNajneskor], ['doplnene_neiste', '2026-11-21', '2026-11-23']);
over('Predĺženie končí v sobotu: doplnenie v sobotu je včas, v utorok po lehote', [st(PS, ['2026-11-21']).kod, st(PS, ['2026-11-24']).kod], ['doplnene_vcas', 'doplnene_po_lehote']);
over('Predĺženie kratšie ako lehota ju neskracuje', [st({ ...V, predlzeneDo: '2026-11-05' }, ['2026-11-10']).kod, st({ ...V, predlzeneDo: '2026-11-05' }, []).upozornenia.length], ['doplnene_vcas', 1]);

const N: UdajeLehoty = { odoslana: '2028-05-04', dorucena: '2028-05-05', lehotaDni: 5, predlzeneDo: null };
s = st(N, ['2028-05-15'], '2028-06-01');
over('Neistý sviatok v roku 2028: doplnenie v neskorší možný koniec je na preverenie', [s.kod, s.upozornenia.some((u) => /overený pre roky 2024 až 2027/.test(u))], ['doplnene_neiste', true]);
over('Neistý sviatok v roku 2028: skorší koniec je včas, po neskoršom po lehote', [st(N, ['2028-05-12']).kod, st(N, ['2028-05-16']).kod], ['doplnene_vcas', 'doplnene_po_lehote']);

const F = { ...V, dorucena: '2026-11-20' }; // po uplynutí úložnej lehoty 17. 11.
s = st(F, ['2026-11-30']);
over('Doručenie po úložnej lehote: upozornenie a nikdy nie „po lehote“', [s.kod, s.upozornenia.some((u) => /neskôr ako uplynutie úložnej lehoty 17\. 11\. 2026/.test(u))], ['doplnene_neiste', true]);
over('Doručenie po úložnej lehote: „včas“ len do konca lehoty od fikcie', [st(F, ['2026-11-24']).kod, st(F, ['2026-11-25']).kod], ['doplnene_vcas', 'doplnene_neiste']);
s = st({ ...V, dorucena: '2026-11-01' }, ['2026-11-10']);
over('Doručenie pred odoslaním sa nepoužije', [s.kod, s.upozornenia.some((u) => /skôr ako odoslanie výzvy/.test(u))], ['doplnene_neiste', true]);
// Audit A04: výzva odoslaná a doručená 16. 11. 2026, lehota 5 pracovných dní (17. 11. je od roku 2025 pracovný deň).
const A04: UdajeLehoty = { odoslana: '2026-11-16', dorucena: '2026-11-16', lehotaDni: 5, predlzeneDo: null };
s = st(A04, ['2026-11-13']);
over('A04: dávka odoslaná pred výzvou nie je „včas“, ide na preverenie', [s.kod, s.uroven, s.doplnenia[0].vysledok], ['doplnene_neiste', 'pozor', 'neiste']);
over('A04: upozornenie aj dôvod pomenujú rozpor s výzvou', [s.upozornenia.some((u) => /13\. 11\. 2026 skôr ako výzva \(16\. 11\. 2026\)\. Odpoveďou na túto výzvu byť nemôže/.test(u)), /Dôvod: deň odoslania doplnenia predchádza výzve\./.test(s.sprava)], [true, true]);
over('A04: riadna dávka v posledný deň lehoty (23. 11.) je včas, o deň neskôr po lehote', [st(A04, ['2026-11-23']).kod, st(A04, ['2026-11-23']).koniec, st(A04, ['2026-11-24']).kod], ['doplnene_vcas', '2026-11-23', 'doplnene_po_lehote']);
over('A04: dávka pred výzvou a včasná dávka spolu nie sú „včas“', st(A04, ['2026-11-13', '2026-11-20']).kod, 'doplnene_neiste');

// ---------- poistka: náhodné prípady proti nezávislému výpočtu
// Pravdivý koniec leží medzi koncom pri všetkých neistých dňoch pracovných a koncom pri všetkých voľných
// (koniec je monotónny v množine pracovných dní), pri každom možnom dni doručenia a oboch výkladoch predĺženia.
let semeno = 20261122; // mulberry32: opakovateľná postupnosť bez straty presnosti
const nahodne = () => {
  semeno = (semeno + 0x6d2b79f5) | 0;
  let t = Math.imul(semeno ^ (semeno >>> 15), 1 | semeno);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const cele = (od: number, po: number) => od + Math.floor(nahodne() * (po - od + 1));
const koniecNezavisle = (dor: Den, n: number, neisteVolne: boolean) => {
  let d = dor;
  while (n > 0) { d = pridajDni(d, 1); const t = typDna(d); if (t === 'pracovny' || (t === 'neisty' && !neisteVolne)) n--; }
  return d;
};
let falosneVcas = 0, falosnePoLehote = 0, zbytocneNeiste = 0, pripadov = 0;
const vysledky: Record<string, number> = { vcas: 0, neiste: 0, po_lehote: 0, neisty_sviatok: 0, predlzenie: 0 };
for (let i = 0; i < 4000; i++) {
  const odoslana = pridajDni('2023-12-01', cele(0, 5 * 365));
  const lehotaDni = cele(5, 15);
  const znamy = nahodne() < 0.5;
  const dorucena = znamy ? pridajDni(odoslana, cele(0, ULOZNA_LEHOTA)) : null;
  const predlzeneDo = nahodne() < 0.2 ? pridajDni(odoslana, cele(5, 40)) : null;
  const odoslane = pridajDni(odoslana, cele(0, 45));
  const s = stavLehoty({ odoslana, dorucena, lehotaDni, predlzeneDo }, [{ davka: 2, odoslane }], '2030-01-01');
  const dorucenia = dorucena ? [dorucena] : Array.from({ length: ULOZNA_LEHOTA + 1 }, (_, k) => pridajDni(odoslana, k));
  const konce: Den[] = [];
  for (const dor of dorucenia) for (const volne of [false, true]) {
    const k = koniecNezavisle(dor, lehotaDni, volne);
    if (!predlzeneDo) { konce.push(k); continue; }
    let posun = predlzeneDo; while (typDna(posun) === 'pokoj' || (typDna(posun) === 'neisty' && volne)) posun = pridajDni(posun, 1);
    konce.push(k > predlzeneDo ? k : predlzeneDo, k > posun ? k : posun);
  }
  const najskor = konce.reduce((a, b) => (a < b ? a : b)), najneskor = konce.reduce((a, b) => (a > b ? a : b));
  const v = s.doplnenia[0].vysledok;
  if (v === 'vcas' && odoslane > najskor) falosneVcas++;
  if (v === 'po_lehote' && odoslane <= najneskor) falosnePoLehote++;
  // Užitočnosť: pri známom doručení, overenom kalendári a bez predĺženia musí byť výsledok rozhodný.
  if (dorucena && !predlzeneDo && najskor === najneskor && v === 'neiste') zbytocneNeiste++;
  vysledky[v]++;
  if (s.upozornenia.some((u) => /overený pre roky/.test(u))) vysledky.neisty_sviatok++;
  if (predlzeneDo) vysledky.predlzenie++;
  pripadov++;
}
over('Náhodné prípady pokrývajú všetky výsledky, neisté sviatky aj predĺženie (každé aspoň 50-krát)',
  Object.entries(vysledky).filter(([, n]) => n < 50).map(([k, n]) => `${k}: ${n}`), []);
over(`Poistka: žiadne falošné „včas“ (${pripadov} náhodných prípadov)`, falosneVcas, 0);
over('Poistka: žiadne falošné „po lehote“', falosnePoLehote, 0);
over('Pri istom konci lehoty je výsledok vždy rozhodný', zbytocneNeiste, 0);

console.log(chyb ? `\n${chyb} kontrol zlyhalo.` : '\nVšetky kontroly prešli.');
process.exit(chyb ? 1 : 0);
