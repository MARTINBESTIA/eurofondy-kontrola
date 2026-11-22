// Modul: zmeny projektu (oznámenie o zmene OoZ / žiadosť o zmenu zmluvy ŽoZZ).
// Zatriedenie zmeny je pravidlové (vzory v texte), nie modelom: je opakovateľné a dá sa skontrolovať.
// Pri pochybnosti sa vyberá prísnejší druh zmeny, nezaradená zmena ide človeku.
import type { Modul, Priloha, Projekt, VysledokKontroly } from '../../core/typy.ts';
import { pracovnyDenPred } from '../../podatelna/lehoty.ts';
import { bezDiakritiky, cislo, dnes, eur, num, pridajMesiace, projekty, skDatum } from '../spolocne.ts';

export type Kategoria = 'vyznamnejsia_ex_ante' | 'vyznamnejsia_ex_post' | 'menej_alebo_vyznamnejsia' | 'menej_vyznamna' | 'formalna' | 'technicka' | 'nezaradena';
export const PORADIE: Kategoria[] = ['vyznamnejsia_ex_ante', 'vyznamnejsia_ex_post', 'menej_alebo_vyznamnejsia', 'menej_vyznamna', 'formalna', 'technicka', 'nezaradena'];
export const NAZOV_KAT: Record<Kategoria, string> = {
  vyznamnejsia_ex_ante: 'významnejšia zmena ex ante', vyznamnejsia_ex_post: 'významnejšia zmena ex post', menej_alebo_vyznamnejsia: 'menej významná alebo významnejšia (podľa dopadu)',
  menej_vyznamna: 'menej významná zmena', formalna: 'formálna zmena', technicka: 'technická zmena (z iniciatívy poskytovateľa)', nezaradena: 'nezaradená',
};
const FORMULAR: Record<Kategoria, string> = {
  vyznamnejsia_ex_ante: 'ŽoZZ (príloha č. 3) pred vykonaním zmeny', vyznamnejsia_ex_post: 'ŽoZZ (príloha č. 3) najneskôr 30 dní pred ŽoP s dotknutými výdavkami',
  menej_alebo_vyznamnejsia: 'OoZ (príloha č. 2), alebo ŽoZZ, ak zmena zásadne ovplyvňuje projekt', menej_vyznamna: 'OoZ (príloha č. 2)', formalna: 'OoZ (príloha č. 2)',
  technicka: 'bez formulára prijímateľa (oznámenie poskytovateľa)', nezaradena: 'treba určiť',
};

interface TypZmeny { id: string; nazov: string; kat: Kategoria | ((t: string, v?: VstupZmena) => Kategoria); vzor: RegExp; zdroj: string; dokumenty: string[] }
const T = (id: string, nazov: string, kat: TypZmeny['kat'], vzor: RegExp, zdroj: string, dokumenty: string[] = []): TypZmeny => ({ id, nazov, kat, vzor, zdroj, dokumenty });
// Vzory sa porovnávajú s textom bez diakritiky a malými písmenami.
export const TYPY: TypZmeny[] = [
  T('statutar', 'Zmena štatutárneho orgánu', 'formalna', /statutar|starost[a-z]* |primator|konatel/, 'kap. 4.13.1 písm. c); 4.13.5 formálne písm. a)', ['Doklad o zmene štatutára (rozhodnutie príslušného orgánu alebo zápis v registri)', 'Údaje na vyžiadanie výpisu z registra trestov (príloha č. 7) alebo výpis z registra trestov']),
  T('zastupca', 'Zmena splnomocneného zástupcu', 'formalna', /splnomocn/, '4.13.5 formálne písm. b)', ['Odvolanie pôvodného plnomocenstva a nové plnomocenstvo']),
  T('nazov_sidlo', 'Zmena názvu alebo sídla', 'formalna', /zmena (nazvu|sidla|adresy)|\bpsc\b|nazov prijimatela/, 'kap. 4.13.1 písm. a), b); 4.13.5 formálne písm. c)', ['Odkaz na zápis v registri alebo doklad o zmene názvu či sídla']),
  T('kontakty', 'Zmena kontaktných údajov', 'formalna', /kontakt|telefon|e-?mail/, 'kap. 4.13.1 písm. d); 4.13.5 formálne písm. d)', ['Písomný popis zmeny kontaktných údajov']),
  T('chyby', 'Oprava chyby v písaní alebo počítaní', 'formalna', /chyb[a-z]* v (pisani|pocitani)|preklep|zrejm[a-z]* chyb/, 'kap. 4.13.1 písm. e)'),
  T('ucet', 'Zmena čísla účtu', 'menej_vyznamna', /cisl[a-z]* uct|bankov[a-z]* uct|\biban\b/, '4.13.5 písm. a), b)', ['Zmluva o zriadení účtu alebo potvrdenie banky o vedení účtu']),
  T('opis_zakazky', 'Zmena opisu predmetu zákazky / technickej špecifikácie', 'menej_alebo_vyznamnejsia', /technick[a-z]* specifik|opis[a-z]* predmetu|zmena (materialu|vyrobcu|typu|technologi)|uchyteni|nahrad[a-z]* (vyrobk|material|zariaden)/, '4.13.5 písm. c)', ['Odôvodnenie zmeny opisu predmetu zákazky', 'Pôvodný opis predmetu zákazky (zhodný so schváleným v ŽoNFP)', 'Nový navrhovaný opis predmetu zákazky', 'Porovnávacia tabuľka pôvodných a nových parametrov s odôvodnením', 'Prieskum trhu alebo VO s novým opisom']),
  T('miesto', 'Zmena miesta realizácie projektu', 'vyznamnejsia_ex_ante', /miest[a-z]* realizaci|rozsireni[a-z]* miesta|parcel|katastr/, 'VZP čl. 16 ods. 12 písm. a); 4.13.5 písm. d)', ['Odôvodnenie oprávnenosti nového miesta realizácie', 'Dokumentácia majetkovo-právneho vzťahu k novému miestu realizácie', 'Povolenia na realizáciu aktivít na novom mieste']),
  T('harmonogram', 'Zmena harmonogramu realizácie aktivít', 'menej_vyznamna', /harmonogram|predlzeni[a-z]* (realizaci|terminu|doby)|posun[a-z]* (terminu|realizaci|zaciatku|ukoncenia)|termin[a-z]* (ukoncenia|zaciatku) realizaci|ukoncenia realizacie/, 'VZP čl. 16 ods. 19; 4.13.5 písm. e)', ['Odôvodnenie a popis okolností zmeny harmonogramu', 'Zmluva alebo dodatok s dodávateľom, ktorý určuje nový začiatok alebo koniec realizácie']),
  T('ovz', 'Predĺženie harmonogramu pre okolnosť vylučujúcu zodpovednosť', 'menej_vyznamna', /okolnost[a-z]* vylucujuc|\bovz\b|vyssia moc/, 'VZP čl. 8; 4.13.5 písm. f)'),
  T('monitorovanie', 'Zmena termínu monitorovacej správy', 'menej_vyznamna', /monitorovac[a-z]* sprav|vyrocn[a-z]* ms|\bms\b|\bztm/, 'VZP čl. 4 (monitorovanie)'),
  T('vypustenie', 'Vypustenie rozpočtovej položky', 'menej_alebo_vyznamnejsia', /vypusteni|vyradeni[a-z]* polozk|zruseni[a-z]* polozk/, 'VZP čl. 16 ods. 18 písm. b); 4.13.5 písm. g)'),
  T('vymena_polozky', 'Zmena alebo výmena rozpočtovej položky', 'menej_alebo_vyznamnejsia', /zmena nazvu polozk|vymena polozk|nov[a-z]* polozk|doplneni[a-z]* polozk/, '4.13.5 písm. h)'),
  T('presun', 'Presun prostriedkov medzi položkami rozpočtu', (_t, v) => (v?.precerpanie == null ? 'menej_alebo_vyznamnejsia' : v.precerpanie > 15 ? 'vyznamnejsia_ex_post' : 'menej_vyznamna'), /presun|prerozdel|realokaci|uprava rozpoct|zmen[a-z]* (polozi?e?k )?rozpoct|precerpan|prekrocen/, 'VZP čl. 16 ods. 18 písm. a); 4.13.5 písm. i)'),
  T('skupina', 'Zmena alebo doplnenie skupiny výdavkov či aktivity', 'vyznamnejsia_ex_post', /skupin[a-z]* vydavk|nov[a-z]* aktivit|doplneni[a-z]* aktivit/, 'VZP čl. 16 ods. 18 písm. c); 4.13.5 písm. j)'),
  T('financovanie', 'Zmena systému financovania', 'vyznamnejsia_ex_ante', /system[a-z]* financovani/, 'VZP čl. 16 ods. 12 písm. i)'),
  T('vz_cz', 'Zmena financovania z vlastných na cudzie zdroje', 'menej_alebo_vyznamnejsia', /vlastn[a-z]* zdroj|cudz[a-z]* zdroj|\buver/, '4.13.5 písm. k)'),
  T('mu', 'Zmena merateľných ukazovateľov', (t) => (/znizen|nizsi|pokles|nedosiahn/.test(t) && !/vychodisk/.test(t) ? 'vyznamnejsia_ex_ante' : /vychodisk|oprava/.test(t) ? 'menej_vyznamna' : 'menej_alebo_vyznamnejsia'), /merateln|ukazovatel|\bmu\b|cielov[a-z]* hodnot/, 'VZP čl. 16 ods. 12 písm. e) a ods. 16; 4.13.5 písm. l)'),
  T('majetok', 'Zmena majetkovo-právnych pomerov', 'vyznamnejsia_ex_ante', /majetkov|vlastnick|najom|prenaj|vecn[a-z]* bremen|zalozn|predaj|prevod (vlastn|majet)/, 'VZP čl. 16 ods. 12 písm. g); 4.13.5 písm. m)'),
  T('prijimatel', 'Zmena prijímateľa alebo partnera', 'vyznamnejsia_ex_ante', /zmena prijimatela|nov[a-z]* prijimatel|pravn[a-z]* nastupc|partner|zluceni|splynuti/, 'VZP čl. 16 ods. 12 písm. c), d) a ods. 14'),
  T('aktivity', 'Zmena počtu alebo charakteru hlavných aktivít', 'vyznamnejsia_ex_ante', /zmena (charakteru|poctu|povahy) hlavn|zrusen[a-z]* (hlavn[a-z]* )?aktivit|vypusten[a-z]* (hlavn[a-z]* )?aktivit/, 'VZP čl. 16 ods. 12 písm. f)'),
  T('ppp', 'Zmena spôsobu splnenia podmienky poskytnutia príspevku', 'vyznamnejsia_ex_ante', /podmienk[a-z]* poskytnuti/, 'VZP čl. 16 ods. 12 písm. h)'),
  T('technicka', 'Technická zmena po výsledku VO alebo kontroly', 'technicka', /po ukoncen[a-z]* vo|vysledk[a-z]* (vo|verejn|kontrol)|vysutazen|obnoveni[a-z]* polozk|technick[a-z]* zmen|oprava technick|funkcionalit|\bitms\b/, 'VZP čl. 16 ods. 4 písm. b) a ods. 7; kap. 4.13.4.2 a 4.13.4.3'),
];
const RIZIKO_PODSTATNA = /zmena ucelu|in[yu] ucel|predaj|prevod vlastnictv|mimo opravnen|nedosiahn|neda sa dosiahnut|zruseni[a-z]* projektu|ukonceni[a-z]* cinnosti|presun vyrob/;

export interface Zatriedenie { typy: { id: string; nazov: string; kategoria: Kategoria; zdroj: string; dokumenty: string[] }[]; kategoria: Kategoria; riziko: string | null }
export function zatried(text: string, v?: VstupZmena): Zatriedenie {
  const t = bezDiakritiky(text);
  const typy = TYPY.filter((x) => x.vzor.test(t)).map((x) => ({ id: x.id, nazov: x.nazov, kategoria: typeof x.kat === 'function' ? x.kat(t, v) : x.kat, zdroj: x.zdroj, dokumenty: x.dokumenty }));
  const kategoria = typy.length ? typy.map((x) => x.kategoria).sort((a, b) => PORADIE.indexOf(a) - PORADIE.indexOf(b))[0] : 'nezaradena';
  return { typy, kategoria, riziko: t.match(RIZIKO_PODSTATNA)?.[0] ?? null };
}

export interface ZmenaZaznam { id: number; predmet: string; dodatok: string | null; ucinnost: string | null; dokumenty?: string[] }
export interface VstupZmena {
  zmena: ZmenaZaznam; projekt: Projekt;
  formular: '' | 'OoZ' | 'ZoZZ'; datumPodania: string | null; datumZmeny: string | null; datumZop: string | null;
  novaNfp: number | null; novyKoniecHA: string | null; muKod: string; muNova: number | null; prahPercent: number | null; precerpanie: number | null;
  odovodnenie: string; prilohy?: Record<string, Priloha>;
}
const text = (v: VstupZmena) => `${v.zmena.predmet}\n${v.odovodnenie}`;

/**
 * Zatriedenie podľa kľúčových slov je len návrh: text „zmena e-mailu štatutára a zníženie rozsahu zateplenia“ vyzerá
 * ako formálna zmena. Výsledok, ktorý platí len pri správnom zatriedení, preto nie je „splnené“ ani „neuplatňuje sa“,
 * kým zatriedenie nepotvrdí kontrolór (potvrdenie vo formulári je ďalší krok, balík 4).
 */
const ODHAD_ZATRIEDENIA = ' Zatriedenie je odhad podľa kľúčových slov v texte zmeny; druh zmeny potvrdí kontrolór.';
const lenPriZatriedeni = (r: VysledokKontroly): VysledokKontroly => (r.stav === 'splnene' || r.stav === 'neuplatnuje_sa'
  ? { ...r, stav: 'na_preverenie', zdovodnenie: `${r.zdovodnenie}${ODHAD_ZATRIEDENIA}` } : r);

function druh(v: VstupZmena): VysledokKontroly {
  const z = zatried(text(v), v);
  const hodnoty = { kategoria: z.kategoria, typy: z.typy.map((x) => x.id).join(',') };
  const typy = z.typy.map((x) => `${x.nazov} (${NAZOV_KAT[x.kategoria]})`).join('; ');
  if (z.kategoria === 'nezaradena') return { stav: 'na_preverenie', zdovodnenie: 'Text zmeny nezodpovedá žiadnemu známemu typu zmeny; druh a postup musí určiť človek.', hodnoty };
  const potrebny = z.kategoria === 'vyznamnejsia_ex_ante' || z.kategoria === 'vyznamnejsia_ex_post' ? 'ZoZZ' : z.kategoria === 'technicka' ? '' : 'OoZ';
  const veta = `Zatriedenie: ${NAZOV_KAT[z.kategoria]}. Rozpoznané typy: ${typy}. Postup: ${FORMULAR[z.kategoria]}.`;
  if (!v.formular) return { stav: z.kategoria === 'menej_alebo_vyznamnejsia' ? 'na_preverenie' : 'mimo_podkladov', zdovodnenie: `${veta} Predložený formulár nie je zadaný.`, hodnoty };
  if (potrebny === 'ZoZZ' && v.formular !== 'ZoZZ') return { stav: 'nesplnene', zdovodnenie: `${veta} Predložené ako OoZ, pre významnejšiu zmenu treba ŽoZZ a dodatok k zmluve.`, hodnoty };
  if (z.kategoria === 'menej_alebo_vyznamnejsia' && v.formular === 'OoZ') return { stav: 'na_preverenie', zdovodnenie: `${veta} Predložené ako OoZ; poskytovateľ môže zmenu preklasifikovať na významnejšiu, ak zásadne ovplyvňuje projekt.`, hodnoty };
  const r: VysledokKontroly = { stav: 'splnene', zdovodnenie: `${veta} Predložený formulár (${v.formular === 'ZoZZ' ? 'ŽoZZ' : 'OoZ'}) zodpovedá druhu zmeny.`, hodnoty };
  // ŽoZZ je prísnejší formulár a obstojí pri každom druhu zmeny; OoZ len pri správnom zatriedení.
  return v.formular === 'ZoZZ' ? r : lenPriZatriedeni(r);
}

function podstatna(v: VstupZmena): VysledokKontroly {
  const z = zatried(text(v), v);
  if (z.riziko) return { stav: 'na_preverenie', zdovodnenie: `V texte je znak možnej podstatnej zmeny („${z.riziko}“). Podstatnú zmenu nemožno schváliť a zakladá povinnosť vrátiť NFP.` };
  if (z.kategoria === 'vyznamnejsia_ex_ante') return { stav: 'na_preverenie', zdovodnenie: `Zmena typu ${z.typy.filter((x) => x.kategoria === 'vyznamnejsia_ex_ante').map((x) => x.nazov.toLowerCase()).join(', ')} môže byť podstatnou zmenou (povaha, ciele alebo podmienky realizácie); posúdi človek.` };
  if (z.kategoria === 'nezaradena') return { stav: 'na_preverenie', zdovodnenie: 'Nezaradená zmena: riziko podstatnej zmeny musí posúdiť človek.' };
  return lenPriZatriedeni({ stav: 'splnene', zdovodnenie: `V texte nie sú znaky podstatnej zmeny podľa vzorov softvéru a druh zmeny (${NAZOV_KAT[z.kategoria]}) ňou spravidla nie je.` });
}

function nfp(v: VstupZmena): VysledokKontroly {
  const t = bezDiakritiky(text(v));
  if (v.novaNfp == null) return /navys|zvysen[a-z]* (nfp|prispevk|rozpoct)/.test(t) ? { stav: 'na_preverenie', zdovodnenie: 'Text naznačuje navýšenie NFP alebo rozpočtu, nová výška NFP však nie je zadaná.' } : { stav: 'neuplatnuje_sa', zdovodnenie: 'Zmena nemení výšku NFP (nová výška nie je zadaná).' };
  const limit = v.projekt.nfp * 1.0001;
  if (v.novaNfp > limit) return { stav: 'nesplnene', zdovodnenie: `Nová výška NFP ${eur(v.novaNfp)} prevyšuje NFP podľa zmluvy ${eur(v.projekt.nfp)}. NFP nemožno zmenou navýšiť (tolerancia 0,01 %).`, hodnoty: { nfp: v.projekt.nfp, nova: v.novaNfp } };
  return { stav: 'splnene', zdovodnenie: `Nová výška NFP ${eur(v.novaNfp)} neprevyšuje NFP podľa zmluvy ${eur(v.projekt.nfp)}.`, hodnoty: { nfp: v.projekt.nfp, nova: v.novaNfp } };
}

export function limitHA(p: Projekt, maxMesiacov = 24): string | null {
  if (!p.zmluva.ucinnost) return null;
  const l = pridajMesiace(p.zmluva.ucinnost, maxMesiacov);
  return l < '2029-12-31' ? l : '2029-12-31';
}
function harmonogram(v: VstupZmena, p: { parametre?: Record<string, any> }): VysledokKontroly {
  const z = zatried(text(v), v);
  const limit = limitHA(v.projekt, p.parametre?.maxMesiacov ?? 24);
  if (!v.novyKoniecHA) return z.typy.some((x) => x.id === 'harmonogram' || x.id === 'ovz') ? { stav: 'mimo_podkladov', zdovodnenie: `Zmena harmonogramu bez zadaného nového konca hlavných aktivít. Limit: ${skDatum(limit)}.` } : { stav: 'neuplatnuje_sa', zdovodnenie: 'Zmena nemení koniec hlavných aktivít.' };
  if (!limit) return { stav: 'mimo_podkladov', zdovodnenie: 'Chýba dátum účinnosti zmluvy, limit sa nedá určiť.' };
  if (v.novyKoniecHA > limit) return { stav: 'nesplnene', zdovodnenie: `Nový koniec hlavných aktivít ${skDatum(v.novyKoniecHA)} je po limite ${skDatum(limit)} (24 mesiacov od účinnosti zmluvy ${skDatum(v.projekt.zmluva.ucinnost)}, najneskôr 31. 12. 2029).`, hodnoty: { limit } };
  return { stav: 'splnene', zdovodnenie: `Nový koniec hlavných aktivít ${skDatum(v.novyKoniecHA)} je v limite ${skDatum(limit)}.`, hodnoty: { limit } };
}

function lehota(v: VstupZmena): VysledokKontroly {
  const k = zatried(text(v), v).kategoria;
  if (k === 'vyznamnejsia_ex_ante') {
    if (!v.datumPodania || !v.datumZmeny) return { stav: 'mimo_podkladov', zdovodnenie: 'Pre ex ante zmenu treba dátum podania ŽoZZ a dátum, keď zmena nastane.' };
    if (v.datumZmeny < v.datumPodania) return { stav: 'nesplnene', zdovodnenie: `Zmena nastala ${skDatum(v.datumZmeny)}, pred podaním žiadosti ${skDatum(v.datumPodania)}. Ex ante zmena je účinná najskôr dňom odoslania žiadosti; výdavky pred ním nie sú oprávnené.` };
    return { stav: 'splnene', zdovodnenie: `Žiadosť podaná ${skDatum(v.datumPodania)}, zmena nastane ${skDatum(v.datumZmeny)}.` };
  }
  if (k === 'vyznamnejsia_ex_post') {
    if (!v.datumPodania || !v.datumZop) return { stav: 'mimo_podkladov', zdovodnenie: 'Pre ex post zmenu treba dátum podania ŽoZZ a dátum ŽoP, ktorá ako prvá obsahuje dotknuté výdavky.' };
    // „Najneskôr 30 dní pred predložením ŽoP“ (VZP 2.2, čl. 16): zmluva o NFP za dni považuje pracovné dni
    // (čl. 1 ods. 1.3 písm. h) vzoru zmluvy 2.2). Či sa deň predloženia ŽoP započítava, zmluva výslovne neurčuje:
    // isto včas je podanie do 31. pracovného dňa pred ŽoP, neskoro až po 30. pracovnom dni; deň medzi nimi ide
    // kontrolórovi. Neisté sviatky mimo overeného kalendára sa berú v neprospech záveru.
    const istoVcas = pracovnyDenPred(v.datumZop, 31, 'volny');
    const najneskor = pracovnyDenPred(v.datumZop, 30, 'pracovny');
    const hodnoty = { istoVcas, najneskor };
    if (v.datumPodania > najneskor) return { stav: 'nesplnene', zdovodnenie: `ŽoZZ podaná ${skDatum(v.datumPodania)}, ŽoP ${skDatum(v.datumZop)}: treba najneskôr 30 pracovných dní pred ŽoP (najneskôr ${skDatum(najneskor)}), inak môže poskytovateľ zamietnuť všetky dotknuté výdavky.`, hodnoty };
    if (v.datumPodania > istoVcas) return { stav: 'na_preverenie', zdovodnenie: `ŽoZZ podaná ${skDatum(v.datumPodania)} je na hranici lehoty 30 pracovných dní pred ŽoP ${skDatum(v.datumZop)}. Isto včas je podanie do ${skDatum(istoVcas)}; či sa deň predloženia ŽoP do lehoty započítava, zmluva výslovne neurčuje.`, hodnoty };
    return { stav: 'splnene', zdovodnenie: `ŽoZZ podaná ${skDatum(v.datumPodania)}, aspoň 30 pracovných dní pred ŽoP ${skDatum(v.datumZop)} (isto včas pri podaní do ${skDatum(istoVcas)}).`, hodnoty };
  }
  return { stav: 'neuplatnuje_sa', zdovodnenie: `Pre druh „${NAZOV_KAT[k]}“ osobitná lehota pred zmenou neplatí.` };
}

function ukazovatel(v: VstupZmena): VysledokKontroly {
  if (!v.muKod || v.muNova == null) {
    const z = zatried(text(v), v);
    return z.typy.some((x) => x.id === 'mu' && x.kategoria === 'vyznamnejsia_ex_ante') ? { stav: 'mimo_podkladov', zdovodnenie: 'Zmena znižuje MU, ale nie je zadaný ukazovateľ a nová cieľová hodnota.' } : { stav: 'neuplatnuje_sa', zdovodnenie: 'Zmena nemení cieľovú hodnotu MU.' };
  }
  const u = v.projekt.ukazovatele.find((x) => x.kod === v.muKod);
  if (!u?.ciel) return { stav: 'mimo_podkladov', zdovodnenie: `Ukazovateľ ${v.muKod} nemá v projekte cieľovú hodnotu.` };
  const znizujuci = u.vychodisko != null && u.ciel < u.vychodisko;
  const horsie = znizujuci ? v.muNova > u.ciel : v.muNova < u.ciel;
  if (!horsie) return { stav: 'splnene', zdovodnenie: `Nová cieľová hodnota ${cislo(v.muNova, 4)} nie je horšia ako ${cislo(u.ciel, 4)}.` };
  const podiel = znizujuci ? (u.vychodisko! - v.muNova) / (u.vychodisko! - u.ciel) * 100 : v.muNova / u.ciel * 100;
  const hodnoty = { povodna: u.ciel, nova: v.muNova, percent: Math.round(podiel * 100) / 100 };
  if (v.prahPercent == null) return { stav: 'na_preverenie', zdovodnenie: `Zníženie ${u.kod} na ${cislo(podiel, 2)} % pôvodnej hodnoty. Chýba percento z čl. 4.3 zmluvy, hranica sa nedá overiť.`, hodnoty };
  if (podiel < v.prahPercent) return { stav: 'nesplnene', zdovodnenie: `Nová hodnota ${u.kod} je ${cislo(podiel, 2)} % pôvodnej, pod hranicou ${cislo(v.prahPercent)} % z čl. 4.3 zmluvy; takéto zníženie nemožno schváliť.`, hodnoty };
  return { stav: 'na_preverenie', zdovodnenie: u.typ === 'vystup' ? `Zníženie MU výstupu ${u.kod} na ${cislo(podiel, 2)} %: schválenie neruší sankčný mechanizmus, NFP sa aj tak kráti.` : `Zníženie MU výsledku ${u.kod} na ${cislo(podiel, 2)} %: bez vplyvu na NFP len pri faktoroch mimo vplyvu prijímateľa a primeranej novej hodnote.`, hodnoty };
}

export const formularNazov = (k: Kategoria) => (k === 'vyznamnejsia_ex_ante' || k === 'vyznamnejsia_ex_post' ? 'Žiadosť o zmenu zmluvy (ŽoZZ, príloha č. 3)' : 'Oznámenie o zmene (OoZ, príloha č. 2)');
export function povinnePrilohy(v: VstupZmena): { cislo: string; nazov: string }[] {
  const z = zatried(text(v), v);
  if (z.kategoria === 'technicka') return [];
  const out = [{ cislo: 'formular', nazov: formularNazov(z.kategoria) }];
  for (const t of z.typy) {
    if (t.kategoria === 'technicka') continue;
    if (t.dokumenty.length) t.dokumenty.forEach((d, i) => out.push({ cislo: `${t.id}_${i + 1}`, nazov: d }));
    else out.push({ cislo: `${t.id}_1`, nazov: `Podporná dokumentácia: ${t.nazov.toLowerCase()} (${t.zdroj})` });
  }
  return out;
}
function prilohy(v: VstupZmena): VysledokKontroly {
  const pov = povinnePrilohy(v);
  if (!pov.length) return { stav: 'neuplatnuje_sa', zdovodnenie: 'Technickú zmenu iniciuje poskytovateľ, prílohy prijímateľa sa nevyžadujú.' };
  if (!v.prilohy) {
    const itms = v.zmena.dokumenty?.filter(Boolean) ?? [];
    return itms.length ? { stav: 'na_preverenie', zdovodnenie: `Požadované: ${pov.map((p) => p.nazov).join('; ')}. V ITMS21+ sú k zmene priložené súbory: ${itms.slice(0, 12).join(', ')}. Zhodu priradí človek alebo nahrajte dokumenty.` }
      : { stav: 'mimo_podkladov', zdovodnenie: `Prílohy nie sú k dispozícii. Požadované: ${pov.map((p) => p.nazov).join('; ')}.` };
  }
  const chyba = pov.filter((p) => !v.prilohy![p.cislo]?.text?.trim());
  if (chyba.length) return { stav: 'chyba_podklad', zdovodnenie: `Chýba: ${chyba.map((p) => p.nazov).join('; ')}.` };
  // Obsadené miesto ešte nie je správny dokument: obsahové znaky príloh v balíku sú ďalší krok (balík 4).
  return { stav: 'na_preverenie', zdovodnenie: `Na všetkých ${pov.length} miestach pre požadované dokumenty je priložený súbor s textom. Softvér zatiaľ neoveruje, že ide o požadovaný dokument; obsah overí kontrolór.` };
}

const zakladny = (p: Projekt, z: ZmenaZaznam): VstupZmena => ({ zmena: z, projekt: p, formular: '', datumPodania: null, datumZmeny: null, datumZop: null, novaNfp: null, novyKoniecHA: null, muKod: '', muNova: null, prahPercent: null, precerpanie: null, odovodnenie: '' });
let index: Map<string, { p: Projekt; z: ZmenaZaznam }> | null = null;
const vsetky = () => (index ??= new Map(projekty().flatMap((p) => p.zmeny.map((z) => [String(z.id), { p, z }] as const))));

export const zmeny: Modul<VstupZmena> = {
  id: 'zmeny', nazov: 'Zmeny projektu',
  popis: 'Zatriedenie zmeny (formálna, menej významná, významnejšia ex ante / ex post), správny formulár, lehoty, limity NFP a harmonogramu, zníženie MU a povinné prílohy.',
  filtre: [{ hodnota: 'dodatok', nazov: 'Zmena s dodatkom' }, { hodnota: 'bez', nazov: 'Bez dodatku' }, ...(['vyznamnejsia_ex_ante', 'vyznamnejsia_ex_post', 'menej_alebo_vyznamnejsia', 'menej_vyznamna', 'formalna', 'technicka', 'nezaradena'] as Kategoria[]).map((k) => ({ hodnota: k, nazov: NAZOV_KAT[k] }))],
  pripady(q, filter, limit = 80) {
    const s = q.toLowerCase();
    const v = [...vsetky().values()].filter(({ p, z }) => (!filter || (filter === 'dodatok' ? !!z.dodatok : filter === 'bez' ? !z.dodatok : zatried(z.predmet).kategoria === filter))
      && (!s || `${p.kod} ${p.prijimatel.nazov} ${z.predmet}`.toLowerCase().includes(s)));
    v.sort((a, b) => (b.z.ucinnost ?? '').localeCompare(a.z.ucinnost ?? ''));
    return { spolu: v.length, pripady: v.slice(0, limit).map(({ p, z }) => ({ id: String(z.id), nazov: z.predmet.split('\n')[0].slice(0, 120) || '(bez popisu)', podnazov: `${p.kod} · ${p.prijimatel.nazov} · ${skDatum(z.ucinnost)}`, stitok: `${NAZOV_KAT[zatried(z.predmet).kategoria]}${z.dodatok ? ` · dodatok ${z.dodatok}` : ''}` })) };
  },
  nacitaj: (id) => { const x = vsetky().get(id); return x ? zakladny(x.p, x.z) : undefined; },
  polia: (v) => [
    { kluc: 'predmet', nazov: 'Predmet zmeny', typ: 'dlhy_text' },
    { kluc: 'odovodnenie', nazov: 'Odôvodnenie zmeny (text OoZ / ŽoZZ)', typ: 'dlhy_text', napoveda: 'Popis, dôvody a dopad na ciele, aktivity, MU a rozpočet.' },
    { kluc: 'formular', nazov: 'Predložený formulár', typ: 'vyber', moznosti: [{ hodnota: '', nazov: 'nezadané' }, { hodnota: 'OoZ', nazov: 'Oznámenie o zmene (OoZ)' }, { hodnota: 'ZoZZ', nazov: 'Žiadosť o zmenu zmluvy (ŽoZZ)' }] },
    { kluc: 'datumPodania', nazov: 'Dátum podania OoZ / ŽoZZ', typ: 'datum' },
    { kluc: 'datumZmeny', nazov: 'Dátum, keď zmena nastala / nastane', typ: 'datum' },
    { kluc: 'datumZop', nazov: 'Dátum ŽoP s prvými dotknutými výdavkami', typ: 'datum' },
    { kluc: 'precerpanie', nazov: 'Prečerpanie skupiny výdavkov kumulatívne (%)', typ: 'cislo' },
    { kluc: 'novaNfp', nazov: `Nová výška NFP (EUR), teraz ${eur(v.projekt.nfp)}`, typ: 'cislo' },
    { kluc: 'novyKoniecHA', nazov: `Nový koniec hlavných aktivít, teraz ${skDatum(v.projekt.planKoniec)}`, typ: 'datum' },
    { kluc: 'muKod', nazov: 'Menený ukazovateľ', typ: 'vyber', moznosti: [{ hodnota: '', nazov: '–' }, ...v.projekt.ukazovatele.map((u) => ({ hodnota: u.kod, nazov: `${u.kod} (cieľ ${cislo(u.ciel, 4)} ${u.jednotka})` }))] },
    { kluc: 'muNova', nazov: 'Nová cieľová hodnota ukazovateľa', typ: 'cislo' },
    { kluc: 'prahPercent', nazov: 'Percento z čl. 4.3 zmluvy', typ: 'cislo' },
  ],
  prilohy: povinnePrilohy,
  doFormulara: (v) => ({ predmet: v.zmena.predmet, odovodnenie: v.odovodnenie, formular: v.formular, datumPodania: v.datumPodania, datumZmeny: v.datumZmeny, datumZop: v.datumZop, precerpanie: v.precerpanie, novaNfp: v.novaNfp, novyKoniecHA: v.novyKoniecHA, muKod: v.muKod, muNova: v.muNova, prahPercent: v.prahPercent }),
  zFormulara(v, f) {
    const n: VstupZmena = structuredClone(v);
    const d = (x: any) => (typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) ? x : null);
    n.zmena.predmet = String(f.predmet ?? v.zmena.predmet); n.odovodnenie = String(f.odovodnenie ?? '');
    n.formular = f.formular === 'OoZ' || f.formular === 'ZoZZ' ? f.formular : '';
    n.datumPodania = d(f.datumPodania); n.datumZmeny = d(f.datumZmeny); n.datumZop = d(f.datumZop); n.novyKoniecHA = d(f.novyKoniecHA);
    n.precerpanie = num(f.precerpanie); n.novaNfp = num(f.novaNfp); n.muKod = String(f.muKod ?? ''); n.muNova = num(f.muNova); n.prahPercent = num(f.prahPercent);
    return n;
  },
  kontroly: { zmena_druh: druh, zmena_podstatna: podstatna, zmena_nfp: nfp, zmena_harmonogram: harmonogram, zmena_lehota: (v) => lenPriZatriedeni(lehota(v)), zmena_mu: ukazovatel, zmena_prilohy: prilohy },
  hlavnyText: (v) => v.odovodnenie,
  kontext: (v) => `Projekt ${v.projekt.kod}: ${v.projekt.nazov}. Predmet zmeny: ${v.zmena.predmet.slice(0, 300)}`,
  titulok: (v) => ({ kod: `${v.projekt.kod}/zmena-${v.zmena.id}`, nazov: v.zmena.predmet.split('\n')[0].slice(0, 140) || 'Zmena projektu', podnazov: `${v.projekt.kod} · ${v.projekt.prijimatel.nazov} · účinnosť ${skDatum(v.zmena.ucinnost)}${v.zmena.dodatok ? ` · dodatok ${v.zmena.dodatok}` : ''}` }),
  suhrn: (v) => { const z = zatried(text(v), v); return `Zatriedenie: ${NAZOV_KAT[z.kategoria]} · postup: ${FORMULAR[z.kategoria]} · NFP ${eur(v.projekt.nfp)} · hlavné aktivity do ${skDatum(v.projekt.planKoniec)} (limit ${skDatum(limitHA(v.projekt))})`; },
  skutocnost: (v) => (v.zmena.dodatok ? `V ITMS21+ je zmena premietnutá do dodatku ${v.zmena.dodatok}.` : 'V ITMS21+ zmena nemá číslo dodatku.'),
  vystupy(v) {
    const z = zatried(text(v), v);
    return [{ nazov: `Návrh: ${formularNazov(z.kategoria)}`, text: [
      `Prijímateľ: ${v.projekt.prijimatel.nazov} (IČO ${v.projekt.prijimatel.ico})`, `Projekt: ${v.projekt.kod} ${v.projekt.nazov}`, `Zmluva: ${v.projekt.zmluva.cislo}`,
      `Druh zmeny: ${NAZOV_KAT[z.kategoria]}${z.typy.length ? ` (${z.typy.map((x) => x.nazov.toLowerCase()).join(', ')})` : ''}`,
      `Popis zmeny: ${v.zmena.predmet}`, `Dôvod zmeny: ${v.odovodnenie || '[doplniť dôvod]'}`,
      'Dopad na ciele, aktivity, merateľné ukazovatele a rozpočet: [doplniť]',
      `Navrhovaná účinnosť: ${skDatum(v.datumZmeny) === '–' ? '[doplniť]' : skDatum(v.datumZmeny)}`,
      `Prílohy:\n${povinnePrilohy(v).filter((p) => p.cislo !== 'formular').map((p) => `  • ${p.nazov}`).join('\n') || '  –'}`,
      `Dátum: ${skDatum(dnes())}`,
    ].join('\n') }];
  },
};
