// Prevod detailu ŽoNFP z verejného API ITMS21+ na typ Ziadost.
import type { Ziadost, Vysledok, Aktivita, PolozkaRozpoctu, Ukazovatel } from '../../core/typy.ts';

const ZNACKY: Record<string, string> = { acute: '́', caron: '̌', uml: '̈', circ: '̂', grave: '̀', tilde: '̃', ring: '̊', cedil: '̧' };
const ENTITY: Record<string, string> = {
  nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", bdquo: '„', ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’', sbquo: '‚',
  ndash: '–', mdash: '—', hellip: '…', euro: '€', sup2: '²', sup3: '³', deg: '°', times: '×', sect: '§', laquo: '«', raquo: '»',
  middot: '·', bull: '•', plusmn: '±', frac12: '½', szlig: 'ß', micro: 'µ', shy: '',
};

/** HTML z formulára -> čistý text (zachová odseky). */
export function htmlNaText(html: string | null | undefined): string {
  if (!html) return '';
  return html
    .replace(/<\s*(br|\/p|\/div|\/li|\/tr|\/h\d)\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&([A-Za-z])(acute|caron|uml|circ|grave|tilde|ring|cedil);/g, (_, p, z) => (p + ZNACKY[z]).normalize('NFC'))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z0-9]+);/gi, (m, n) => ENTITY[n] ?? m)
    .replace(/[ \t ]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{2,}/g, '\n').trim();
}

// API dáva polnoc slovenského času ako UTC milisekundy, preto posun pred orezaním na deň.
const datum = (ms: number | null | undefined) => (ms ? new Date(ms + 3 * 3600_000).toISOString().slice(0, 10) : null);

function vysledok(stav: string): Vysledok {
  if (/^(Zmluva uzavretá|Schválená|Zmluva neakceptovaná)$/.test(stav)) return 'schvalena';
  if (/zásobník/i.test(stav)) return 'zasobnik';
  if (/^Neschválená/.test(stav)) return 'neschvalena';
  if (/^Zastavené konanie/.test(stav)) return 'zastavene';
  if (/^Stiahnutá/.test(stav)) return 'stiahnuta';
  return 'ina';
}

// Skrátený kód opatrenia: "401201R20102" -> "2.1.2", "401201R20202" -> "2.2.2"
function opatrenie(kod: string | undefined): string | null {
  const m = kod?.match(/R(\d)(\d{2})(\d{2})$/);
  return m ? `${m[1]}.${Number(m[2])}.${Number(m[3])}` : null;
}

export function normalizujItms21(d: any): Ziadost {
  const jeHlavna = (a: any) => !/^Podporné aktivity/i.test(a?.nazov ?? '');
  const aktivity: Aktivita[] = (d.aktivity ?? []).map((a: any) => ({
    kod: a.kod, nazov: a.nazov, hlavna: jeHlavna(a), opatrenie: opatrenie(a.typAkcieProgramu?.opatrenie?.kod),
    zaciatok: datum(a.datumZaciatkuPlanovany), koniec: datum(a.datumKoncaPlanovany),
  }));
  const rozpocet: PolozkaRozpoctu[] = (d.polozkyRozpoctu ?? []).map((p: any) => ({
    aktivita: p.aktivita?.nazov ?? '', hlavna: jeHlavna(p.aktivita), opatrenie: opatrenie(p.aktivita?.typAkcieProgramu?.opatrenie?.kod),
    skupinaVydavkov: p.skupinaVydavkov?.nazovSk ?? '', suma: p.sumaOpravnenehoVydavku ?? 0,
  }));
  const uk = (zoznam: any[], typ: 'vystup' | 'vysledok'): Ukazovatel[] => (zoznam ?? []).map((u: any) => {
    const p = u.ukazovatelProjektovySC?.ukazovatelProjektovy ?? {};
    return { kod: p.kod ?? '', nazov: p.nazovSk ?? '', typ, jednotka: p.mernaJednotka?.nazovSk ?? '', vychodisko: u.vychodiskovaHodnotaSpolu ?? null, ciel: u.cielovaHodnotaSpolu ?? null };
  });
  return {
    id: d.id, kod: d.kod, nazov: d.nazov, vyzvaKod: d.vyzva?.kod ?? '',
    stav: d.stav, vysledok: vysledok(d.stav), dovod: null, kolo: d.posudzovaneObdobie?.poradoveCislo ?? null,
    datumPredlozenia: datum(d.datumPredlozenia), datumRozhodnutia: datum(d.datumSchvalenia ?? d.datumZamietnutia),
    ziadatel: { nazov: d.ziadatel?.nazov ?? '', ico: d.ziadatel?.ico ?? '', pravnaFormaKod: d.ziadatel?.pravnaForma?.kodZdroj ?? '', pravnaForma: d.ziadatel?.pravnaForma?.nazovSk ?? '' },
    miesta: (d.miestoRealizacieFull ?? []).map((m: any) => ({ kraj: m.nuts3?.nazovSk ?? '', okres: m.nuts4?.nazovSk ?? '', obec: m.nuts5?.nazovSk ?? '', lokalita: m.lokalita ?? '' })),
    kategoriaRegionov: (d.kategoriaRegionov ?? []).map((k: any) => k.kodZdroj),
    sumaZiadanaNFP: d.sumaZiadanaNFP ?? 0, sumaZiadanaCelkova: d.sumaZiadanaCelkova ?? 0, sumaZiadanaVZ: d.sumaZiadanaVZ ?? 0, percentoZiadane: d.percetnoZiadane ?? null,
    dlzkaHlavnychAktivitMes: d.dlzkaZiadanaCelkovaHlavnychAktivit ?? null,
    zaciatokHlavnychAktivit: datum(d.datumZiadanyZaciatkuHlavnychAktivit), koniecHlavnychAktivit: datum(d.datumZiadanyKoncaHlavnychAktivit),
    popis: htmlNaText(d.popis), ucel: htmlNaText(d.ucel),
    opatrenia: (d.opatrenie ?? []).map((o: any) => opatrenie(o.kod)).filter(Boolean) as string[],
    aktivity, rozpocet,
    ukazovatele: [...uk(d.ukazovatelZiadanyVystupu, 'vystup'), ...uk(d.ukazovatelZiadanyVysledku, 'vysledok')],
  };
}
