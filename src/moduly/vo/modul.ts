// Modul: verejné obstarávanie (VO). Vstup: VO z ITMS21+ (postup, PHZ, počet ponúk, zmluvy, doklady).
// Overenie štatutárov v registri RPO je voliteľné a ide online; mená sa neukladajú (neukladatDokazy).
import type { Doklad, Modul, Nalez, Pravidlo, Priloha, VysledokKontroly } from '../../core/typy.ts';
import { bezDiakritiky, dokladyVstupov, eur, nacitajData, skDatum, type VstupDokladu } from '../spolocne.ts';

export interface VoPlny {
  id: number; kod: string; nazov: string; stav: string; vytvorene: string | null;
  obstaravatel: { nazov: string; ico: string }; zadavatel: { nazov: string; ico: string } | null;
  druhObstaravatela: string; druhZakazky: string; postup: string; metoda: string; phz: number | null;
  ponuky: number | null; vylucene: number | null; kriterium: string; cpv: string; cpvNazov: string;
  vestnikEU: boolean | null; rozdelena: boolean | null; projekty: string[]; vVyzve: boolean;
  zmluvy: { id: number; kod: string; cislo: string; ucinnost: string | null; suma: number | null; dodavatel: { nazov: string; ico: string | null; ine?: string | null } | null }[];
  doklady: { id: number; cislo: string; celkom: number | null; datum: string | null }[];
}
export interface VstupVo { vo: VoPlny; rpo: '' | 'ano'; prilohy?: Record<string, Priloha>; __bezModelu?: boolean }

/** Exportované kvôli testu so zasadenými chybami. */
export const VSETKY = nacitajData<VoPlny[]>('vo.json', []);
const podlaKodu = new Map(VSETKY.map((v) => [v.kod, v]));
/** Súčet zmlúv so známou sumou. Zmluvy bez sumy vracia zmluvyBezSumy, pravidlá ich nesmú brať ako nulu. */
const sumaZmluv = (v: VoPlny) => v.zmluvy.reduce((s, z) => s + (z.suma ?? 0), 0);
const maZmluvu = (v: VoPlny) => v.zmluvy.some((z) => z.suma != null);
const zmluvyBezSumy = (v: VoPlny) => v.zmluvy.filter((z) => z.suma == null);
const nazovZmluvy = (z: VoPlny['zmluvy'][number]) => z.cislo || z.kod || `id ${z.id}`;
/** Zmluva účinná pred 1. 8. 2024: VO prebehlo pred príručkou VO v2, aj keď je záznam v ITMS21+ vytvorený neskôr. */
const zmluvaPred2024 = (v: VoPlny) => v.zmluvy.find((z) => z.ucinnost && z.ucinnost < '2024-08-01');

/**
 * Limity zjednodušených postupov overené v príručke VO v2 (1. 8. 2024). Overený je limit len pri VO po 1. 8. 2024:
 * podľa postupu evidovaného „od 1.8.2024“ alebo dátumu vytvorenia v ITMS21+, ak tomu neodporuje skoršia zmluva.
 * Dátum vytvorenia záznamu nie je dňom začatia VO; presný rozhodný deň z dokumentácie VO je ďalší krok (balík 3).
 */
export function limitPostupu(v: VoPlny): { limit: number; popis: string; overeny: boolean } | null {
  const p = v.postup; const od2024 = ((v.vytvorene ?? '') >= '2024-08-01' || /od 1\.8\.2024/.test(p)) && !zmluvaPred2024(v);
  if (/malého rozsahu podľa § 1 ods\. 14/.test(p) && !/učebnic/.test(p)) return { limit: 50_000, popis: 'zákazka malého rozsahu podľa § 1 ods. 14 ZVO: do 50 000 EUR bez DPH', overeny: od2024 };
  if (/§ 108/.test(p)) {
    if (/stavebn/i.test(v.druhZakazky)) return { limit: 360_000, popis: 'podlimitná zákazka s oslovením min. 3 hospodárskych subjektov na stavebné práce: pod 360 000 EUR bez DPH', overeny: od2024 };
    return { limit: 143_000, popis: 'podlimitná zákazka s oslovením min. 3 hospodárskych subjektov na tovary a služby: pod 143 000 EUR bez DPH', overeny: od2024 };
  }
  return null;
}

/** Prečo limit príručky VO v2 nemusí platiť pre toto VO. */
function preco2024(v: VoPlny): string {
  const z = zmluvaPred2024(v);
  if (z) return `Zmluva ${nazovZmluvy(z)} je účinná od ${skDatum(z.ucinnost)}, VO teda prebehlo pred 1. 8. 2024, keď mohli platiť iné limity.`;
  if (!v.vytvorene) return 'Dátum VO nie je v ITMS21+ uvedený, VO mohlo prebehnúť pred 1. 8. 2024, keď mohli platiť iné limity.';
  return `VO je v ITMS21+ vytvorené ${skDatum(v.vytvorene)}, mohlo teda prebehnúť pred 1. 8. 2024, keď mohli platiť iné limity.`;
}

function postup(v: VstupVo): VysledokKontroly {
  const l = limitPostupu(v.vo);
  // Neoverený limit nesmie dať „neuplatňuje sa“ ani „splnené“: výrok by bol „bez zistení“, hoci postup nikto neoveril.
  if (!l) return { stav: 'na_preverenie', zdovodnenie: `Pre postup „${v.vo.postup}“ softvér finančný limit neoveruje (overené sú len zákazky malého rozsahu a podlimitné zákazky s oslovením min. 3 subjektov). Či je postup${v.vo.phz != null ? ` pri PHZ ${eur(v.vo.phz)}` : ''} prípustný, posúdi kontrolór podľa príručky VO.` };
  if (v.vo.phz == null) return { stav: 'mimo_podkladov', zdovodnenie: 'Chýba predpokladaná hodnota zákazky.' };
  const hodnoty = { phz: v.vo.phz, limit: l.limit };
  if (!l.overeny) return { stav: 'na_preverenie', zdovodnenie: `PHZ ${eur(v.vo.phz)} ${v.vo.phz < l.limit ? 'je v limite' : 'prevyšuje limit'} podľa príručky VO v2 (${l.popis}). ${preco2024(v.vo)} Limit platný v čase VO softvér neoveril.`, hodnoty };
  if (v.vo.phz < l.limit) return { stav: 'splnene', zdovodnenie: `PHZ ${eur(v.vo.phz)} je v limite postupu (${l.popis}).`, hodnoty };
  const pozn = (v.vo.vytvorene ?? '') < '2024-08-01' ? ` VO je v ITMS21+ vytvorené ${skDatum(v.vo.vytvorene)}, postup je však evidovaný v režime od 1. 8. 2024.` : '';
  return { stav: 'nesplnene', zdovodnenie: `PHZ ${eur(v.vo.phz)} prevyšuje limit zvoleného postupu (${l.popis}).${pozn} Ak ide o chybne zaevidovaný postup v ITMS21+, treba ho opraviť; inak je to porušenie pravidiel VO.`, hodnoty };
}

const BEZ_SUTAZE = /výnimk|in-house|nerelevantné|čiastková zmluva|koncesi/i;
function ponuky(v: VstupVo): VysledokKontroly {
  if (BEZ_SUTAZE.test(v.vo.postup)) return { stav: 'neuplatnuje_sa', zdovodnenie: `Postup „${v.vo.postup}“ nie je súťažou ponúk.` };
  if (/stiahnut|pripravovan/i.test(v.vo.stav)) return { stav: 'neuplatnuje_sa', zdovodnenie: `VO je v stave „${v.vo.stav}“.` };
  if (v.vo.ponuky == null) return { stav: 'mimo_podkladov', zdovodnenie: 'Počet prijatých ponúk nie je v ITMS21+ uvedený.' };
  const platne = v.vo.ponuky - (v.vo.vylucene ?? 0);
  if (v.vo.ponuky <= 2 || platne <= 1) return { stav: 'na_preverenie', zdovodnenie: `Prijaté ponuky: ${v.vo.ponuky}, vylúčené: ${v.vo.vylucene ?? 0}. Nízky počet ponúk (1 až 2) je rizikový indikátor možného porušenia hospodárskej súťaže.`, hodnoty: { ponuky: v.vo.ponuky, vylucene: v.vo.vylucene ?? 0 } };
  return { stav: 'splnene', zdovodnenie: `Prijatých ${v.vo.ponuky} ponúk (vylúčených ${v.vo.vylucene ?? 0}).`, hodnoty: { ponuky: v.vo.ponuky } };
}

function cena(v: VstupVo): VysledokKontroly {
  if (!maZmluvu(v.vo)) return { stav: 'mimo_podkladov', zdovodnenie: 'VO nemá v ITMS21+ zmluvu so sumou.' };
  if (v.vo.phz == null || v.vo.phz <= 0) return { stav: 'mimo_podkladov', zdovodnenie: 'Chýba predpokladaná hodnota zákazky.' };
  const s = sumaZmluv(v.vo); const l = limitPostupu(v.vo); const bez = zmluvyBezSumy(v.vo);
  // Súčet zmlúv so známou sumou je dolná hranica ceny: prekročenie platí aj s ostatnými zmluvami, súlad nie.
  const pozn = bez.length ? ` Zmluva ${bez.map(nazovZmluvy).join(', ')} nemá v ITMS21+ sumu; súčet je len zo zmlúv so sumou.` : '';
  // PHZ je bez DPH; pri zmluve nevieme, či je suma s DPH, preto tolerancia 23 % DPH + 10 %.
  if (l && s / 1.23 >= l.limit) return { stav: 'na_preverenie', zdovodnenie: `Zmluvy spolu ${eur(s)}: aj po odpočítaní 23 % DPH (${eur(Math.round(s / 1.23))}) cena dosahuje limit postupu (${l.popis}). PHZ mohla byť určená nesprávne.${pozn}`, hodnoty: { phz: v.vo.phz, zmluvy: s } };
  if (s > v.vo.phz * 1.23 * 1.1) return { stav: 'na_preverenie', zdovodnenie: `Zmluvy spolu ${eur(s)} prevyšujú PHZ ${eur(v.vo.phz)} o viac ako 10 % aj pri pripočítaní DPH. Overiť určenie PHZ a prípadné dodatky.${pozn}`, hodnoty: { phz: v.vo.phz, zmluvy: s } };
  if (bez.length) return { stav: 'mimo_podkladov', zdovodnenie: `Zmluvy so známou sumou spolu ${eur(s)} zodpovedajú PHZ ${eur(v.vo.phz)}.${pozn} Celková cena voči PHZ sa preto neoverila.`, hodnoty: { phz: v.vo.phz, zmluvy: s, bezSumy: bez.length } };
  return { stav: 'splnene', zdovodnenie: `Zmluvy spolu ${eur(s)} zodpovedajú PHZ ${eur(v.vo.phz)} (bez DPH).`, hodnoty: { phz: v.vo.phz, zmluvy: s } };
}

function faktury(v: VstupVo): VysledokKontroly {
  if (!maZmluvu(v.vo)) return { stav: 'mimo_podkladov', zdovodnenie: 'VO nemá zmluvu so sumou.' };
  if (!v.vo.doklady.length) return { stav: 'neuplatnuje_sa', zdovodnenie: 'K VO zatiaľ nie sú evidované účtovné doklady.' };
  const s = sumaZmluv(v.vo); const f = v.vo.doklady.reduce((a, d) => a + (d.celkom ?? 0), 0);
  const bezZmluvy = zmluvyBezSumy(v.vo); const bezDokladu = v.vo.doklady.filter((d) => d.celkom == null);
  const hodnoty = { zmluvy: s, doklady: f };
  // Doklady so známou sumou sú dolná hranica fakturácie, zmluvy so známou sumou dolná hranica zmluvnej ceny.
  if (f > s * 1.23 + 1) return { stav: 'na_preverenie', zdovodnenie: `Doklady spolu ${eur(Math.round(f * 100) / 100)} prevyšujú zmluvy ${eur(s)} aj pri pripočítaní DPH. Overiť dodatky (podliehajú kontrole VO).${bezZmluvy.length ? ` Zmluva ${bezZmluvy.map(nazovZmluvy).join(', ')} nemá v ITMS21+ sumu, súčet zmlúv môže byť vyšší.` : ''}`, hodnoty };
  if (bezDokladu.length) return { stav: 'mimo_podkladov', zdovodnenie: `Doklady so známou sumou spolu ${eur(Math.round(f * 100) / 100)} neprevyšujú zmluvy ${eur(s)}. Doklad ${bezDokladu.map((d) => d.cislo || `id ${d.id}`).join(', ')} nemá v ITMS21+ sumu, fakturácia spolu sa preto neoverila.`, hodnoty };
  return { stav: 'splnene', zdovodnenie: `Doklady spolu ${eur(Math.round(f * 100) / 100)} neprevyšujú zmluvy ${eur(s)}.`, hodnoty };
}

/** Zákazka malého rozsahu pod 50 000 EUR; bez PHZ sa za ňu berie tiež, aby sa nevynechala z delenia zákazky. */
const jeZmr = (v: VoPlny) => /malého rozsahu|nízkou hodnotou/i.test(v.postup) && (v.phz == null || v.phz < 50_000);
/** Ďalšie zákazky malého rozsahu obstarávateľa s rovnakou skupinou CPV v tom istom roku (v dátach výzvy). */
const podobneZakazky = (vo: VoPlny) => VSETKY.filter((x) => x.obstaravatel.ico === vo.obstaravatel.ico && x.kod !== vo.kod && !/stiahnut/i.test(x.stav)
  && x.cpv.slice(0, 3) === vo.cpv.slice(0, 3) && (x.vytvorene ?? '').slice(0, 4) === (vo.vytvorene ?? '').slice(0, 4) && jeZmr(x));
function delenie(v: VstupVo): VysledokKontroly {
  if (!jeZmr(v.vo)) return { stav: 'neuplatnuje_sa', zdovodnenie: 'Nejde o zákazku malého rozsahu pod 50 000 EUR.' };
  if (v.vo.phz == null) return { stav: 'mimo_podkladov', zdovodnenie: 'Chýba predpokladaná hodnota zákazky, súčet s podobnými zákazkami sa nedá overiť.' };
  if (!v.vo.cpv || !v.vo.vytvorene) return { stav: 'mimo_podkladov', zdovodnenie: 'Chýba CPV kód alebo dátum VO.' };
  const rok = v.vo.vytvorene.slice(0, 4); const skupina = v.vo.cpv.slice(0, 3);
  const podobne = podobneZakazky(v.vo);
  const bezPhz = podobne.filter((x) => x.phz == null);
  const spolu = v.vo.phz + podobne.reduce((s, x) => s + (x.phz ?? 0), 0);
  const pozn = bezPhz.length ? ` Bez uvedenej PHZ: ${bezPhz.slice(0, 6).map((x) => x.kod).join(', ')}${bezPhz.length > 6 ? ` a ďalších ${bezPhz.length - 6}` : ''}.` : '';
  if (podobne.length && spolu >= 50_000) return { stav: 'na_preverenie', zdovodnenie: `Obstarávateľ v roku ${rok} zadal ďalších ${podobne.length} zákaziek malého rozsahu s rovnakou skupinou CPV ${skupina}…: ${podobne.slice(0, 6).map((x) => `${x.kod} ${eur(x.phz)}`).join('; ')}. Spolu PHZ ${eur(spolu)} ≥ 50 000 EUR; overiť, či nejde o nedovolené rozdelenie predmetu zákazky.${pozn}`, hodnoty: { podobnych: podobne.length, spolu } };
  if (bezPhz.length) return { stav: 'mimo_podkladov', zdovodnenie: `Obstarávateľ v roku ${rok} zadal aj ďalšie zákazky malého rozsahu so skupinou CPV ${skupina}…; so známymi PHZ je súčet ${eur(spolu)}.${pozn} Či spolu nedosahujú 50 000 EUR, sa nedá overiť.`, hodnoty: { podobnych: podobne.length, spolu } };
  return { stav: 'splnene', zdovodnenie: `V roku ${rok} nemá obstarávateľ (v dátach výzvy) iné zákazky malého rozsahu so skupinou CPV ${skupina}…, ktoré by spolu dosiahli 50 000 EUR.` };
}

// --- RPO: štatutári obstarávateľa a dodávateľa (online, len na požiadanie)
const RPO = 'https://api.statistics.sk/rpo/v1';
const cacheRpo = new Map<string, Promise<string[] | null>>();
let poslednyDopyt = 0;
async function statutari(ico: string): Promise<string[] | null> {
  if (!cacheRpo.has(ico)) cacheRpo.set(ico, (async () => {
    const pockaj = Math.max(0, poslednyDopyt + 400 - Date.now()); poslednyDopyt = Date.now() + pockaj;
    if (pockaj) await new Promise((ok) => setTimeout(ok, pockaj));
    try {
      const h = await fetch(`${RPO}/search?identifier=${encodeURIComponent(ico)}`, { signal: AbortSignal.timeout(20_000) });
      if (!h.ok) return null;
      const id = (await h.json()).results?.[0]?.id; if (id == null) return null;
      const e = await fetch(`${RPO}/entity/${id}?showHistoricalData=false&showOrganizationUnits=false`, { signal: AbortSignal.timeout(20_000) });
      if (!e.ok) return null;
      const j = await e.json();
      return (j.statutoryBodies ?? []).map((s: any) => [...(s.personName?.givenNames ?? []), ...(s.personName?.familyNames ?? [])].join(' ').trim()).filter(Boolean);
    } catch { return null; }
  })());
  return cacheRpo.get(ico)!;
}
const meno = (s: string) => bezDiakritiky(s).replace(/[^a-z ]/g, ' ').split(/\s+/).filter((w) => w.length > 1).sort().join(' ');

async function rpo(v: VstupVo): Promise<VysledokKontroly> {
  if (v.rpo !== 'ano') return { stav: 'mimo_podkladov', zdovodnenie: 'Online overenie štatutárov v registri RPO je vypnuté (zapína sa vo formulári).' };
  const dod = v.vo.zmluvy.map((z) => z.dodavatel).filter((d) => d?.ico) as { nazov: string; ico: string }[];
  if (!v.vo.obstaravatel.ico || !dod.length) return { stav: 'mimo_podkladov', zdovodnenie: 'Chýba IČO obstarávateľa alebo slovenského dodávateľa.' };
  const obst = await statutari(v.vo.obstaravatel.ico);
  if (!obst?.length) return { stav: 'mimo_podkladov', zdovodnenie: 'Register RPO nevrátil štatutárov obstarávateľa.' };
  const zhody: string[] = []; let overenych = 0;
  for (const d of dod) {
    const s = await statutari(d.ico); if (!s) continue; overenych++;
    for (const a of obst) for (const b of s) if (meno(a) === meno(b)) zhody.push(`${a} (${v.vo.obstaravatel.nazov} aj ${d.nazov})`);
  }
  if (!overenych) return { stav: 'mimo_podkladov', zdovodnenie: 'Register RPO nevrátil údaje o dodávateľoch.' };
  if (zhody.length) return { stav: 'na_preverenie', zdovodnenie: `Zhoda mena štatutára obstarávateľa a dodávateľa: ${[...new Set(zhody)].join('; ')}. Môže ísť o menovca; ak nie, ide o možný konflikt záujmov podľa § 23 ZVO.` };
  return { stav: 'splnene', zdovodnenie: `Štatutári obstarávateľa a ${overenych} dodávateľov (RPO, aktuálny stav) sa menom nezhodujú. Príbuzenské a iné vzťahy sa takto overiť nedajú.` };
}

/**
 * Doklady k nálezom VO: polia záznamu VO z ITMS21+, alebo z formulára, ak ich kontrolór zmenil. Pri RPO len IČO,
 * na ktoré sa register pýtal; mená štatutárov sa neukladajú (neukladatDokazy).
 */
function dokladyVo(v: VstupVo, n: Nalez, p: Pravidlo): Doklad[] {
  const z = podlaKodu.get(v.vo.kod);
  const zdroj = { itms: `ITMS21+, verejné obstarávanie ${v.vo.kod}`, formular: `Formulár kontrolóra, verejné obstarávanie ${v.vo.kod}` };
  const u = (miesto: string, f: (x: VoPlny) => unknown): VstupDokladu => [miesto, f(v.vo), z ? f(z) : undefined];
  const postup = u('Postup', (x) => x.postup);
  const phz = u('PHZ bez DPH', (x) => (x.phz == null ? null : eur(x.phz)));
  const zmluvy = u('Zmluvy so sumou', (x) => x.zmluvy.filter((y) => y.suma != null).map((y) => `${nazovZmluvy(y)}: ${eur(y.suma)}`));
  const vytvorene = u('Vytvorené v ITMS21+', (x) => x.vytvorene);
  switch (p.kontrola) {
    case 'vo_postup': return dokladyVstupov(n, zdroj, [postup, phz], [vytvorene, u('Účinnosť zmlúv', (x) => x.zmluvy.filter((y) => y.ucinnost).map((y) => `${nazovZmluvy(y)}: ${skDatum(y.ucinnost)}`))]);
    case 'vo_ponuky': return n.stav === 'neuplatnuje_sa' ? dokladyVstupov(n, zdroj, [postup], [u('Stav VO', (x) => x.stav)])
      : dokladyVstupov(n, zdroj, [u('Počet prijatých ponúk', (x) => x.ponuky)], [u('Počet vylúčených ponúk', (x) => x.vylucene), postup]);
    case 'vo_cena': return dokladyVstupov(n, zdroj, [phz, zmluvy], [postup]);
    case 'vo_faktury': return dokladyVstupov(n, zdroj, [zmluvy, u('Účtovné doklady k VO', (x) => x.doklady.map((d) => `${d.cislo || `id ${d.id}`}: ${eur(d.celkom)}`))]);
    case 'vo_delenie': {
      if (n.stav === 'neuplatnuje_sa' || !v.vo.cpv || !v.vo.vytvorene) return dokladyVstupov(n, zdroj, [postup], [phz]);
      const pod = podobneZakazky(v.vo).map((x) => `${x.kod}: PHZ ${eur(x.phz)}`);
      const porovnanie = pod.length ? pod : 'v dátach výzvy žiadne ďalšie';
      return dokladyVstupov(n, zdroj, [postup, phz, u('CPV', (x) => `${x.cpv} ${x.cpvNazov}`.trim()), vytvorene,
        [`Zákazky malého rozsahu obstarávateľa (IČO ${v.vo.obstaravatel.ico}) so skupinou CPV ${v.vo.cpv.slice(0, 3)}… v roku ${v.vo.vytvorene.slice(0, 4)}`, porovnanie, porovnanie]]);
    }
    case 'vo_rpo': {
      if (v.rpo !== 'ano') return [];
      const ica = (x: VoPlny) => [...new Set(x.zmluvy.map((y) => y.dodavatel?.ico).filter(Boolean))];
      const d = dokladyVstupov(n, zdroj, [u('IČO obstarávateľa', (x) => x.obstaravatel.ico), u('IČO dodávateľov zo zmlúv', ica)]);
      return d.length ? [...d, { nazov: 'Register právnických osôb (RPO), online dopyt', miesto: 'štatutári obstarávateľa a dodávateľov, aktuálny stav', citat: 'Mená sa porovnali a neukladajú sa.' }] : [];
    }
    default: return [];
  }
}

const FILTRE: Record<string, (v: VoPlny) => boolean> = {
  jedna: (v) => v.ponuky != null && v.ponuky <= 2, zmr: (v) => /malého rozsahu|nízkou hodnotou/i.test(v.postup), podlimit: (v) => /podlimitn/i.test(v.postup), nadlimit: (v) => /nadlimitn|verejná súťaž/i.test(v.postup),
};

export const vo: Modul<VstupVo> = {
  id: 'vo', nazov: 'Verejné obstarávanie',
  popis: 'Rizikové indikátory VO prijímateľov: limit postupu, počet ponúk, cena voči PHZ, fakturácia nad zmluvu, delenie zákazky, zhoda štatutárov (RPO) a náležitosti záznamu zo zadania zákazky.',
  neukladatDokazy: true,
  filtre: [{ hodnota: 'jedna', nazov: 'Najviac 2 ponuky' }, { hodnota: 'zmr', nazov: 'Malý rozsah / nízka hodnota' }, { hodnota: 'podlimit', nazov: 'Podlimitné' }, { hodnota: 'nadlimit', nazov: 'Nadlimitné / verejná súťaž' }],
  pripady(q, filter, limit = 80) {
    const s = q.toLowerCase();
    const v = VSETKY.filter((x) => x.vVyzve && (!filter || FILTRE[filter]?.(x)) && (!s || `${x.kod} ${x.nazov} ${x.obstaravatel.nazov} ${x.zmluvy.map((z) => z.dodavatel?.nazov ?? '').join(' ')}`.toLowerCase().includes(s)));
    return { spolu: v.length, pripady: v.slice(0, limit).map((x) => ({ id: x.kod, nazov: x.nazov || x.kod, podnazov: `${x.obstaravatel.nazov} · PHZ ${eur(x.phz)}`, stitok: `${x.stav}${x.ponuky != null ? `, ponúk ${x.ponuky}` : ''}` })) };
  },
  nacitaj: (id) => { const x = podlaKodu.get(id); return x ? { vo: x, rpo: '' } : undefined; },
  polia: () => [
    { kluc: 'phz', nazov: 'Predpokladaná hodnota zákazky bez DPH (EUR)', typ: 'cislo' },
    { kluc: 'ponuky', nazov: 'Počet prijatých ponúk', typ: 'cislo' },
    { kluc: 'vylucene', nazov: 'Počet vylúčených ponúk', typ: 'cislo' },
    { kluc: 'zmluva', nazov: 'Suma zmlúv spolu (EUR)', typ: 'cislo' },
    { kluc: 'rpo', nazov: 'Overiť štatutárov online v registri RPO', typ: 'vyber', moznosti: [{ hodnota: '', nazov: 'nie' }, { hodnota: 'ano', nazov: 'áno (pošle IČO do RPO)' }], napoveda: 'Odošle IČO obstarávateľa a dodávateľov do verejného API Štatistického úradu. Mená sa neukladajú.' },
  ],
  prilohy: () => [{ cislo: 'zaznam', nazov: 'Záznam zo zadania zákazky' }],
  doFormulara: (v) => ({ phz: v.vo.phz, ponuky: v.vo.ponuky, vylucene: v.vo.vylucene, zmluva: maZmluvu(v.vo) ? Math.round(sumaZmluv(v.vo) * 100) / 100 : null, rpo: v.rpo }),
  zFormulara(v, f) {
    const n: VstupVo = structuredClone(v);
    const c = (x: any) => (x == null || x === '' ? null : Number(x));
    n.vo.phz = c(f.phz); n.vo.ponuky = c(f.ponuky); n.vo.vylucene = c(f.vylucene);
    const z = c(f.zmluva);
    if (z != null && Math.abs(z - sumaZmluv(v.vo)) > 0.005) n.vo.zmluvy = [{ id: -1, kod: 'upravené', cislo: '', ucinnost: null, suma: z, dodavatel: v.vo.zmluvy[0]?.dodavatel ?? null }];
    n.rpo = f.rpo === 'ano' ? 'ano' : '';
    return n;
  },
  doklady: dokladyVo,
  kontroly: { vo_postup: postup, vo_ponuky: ponuky, vo_cena: cena, vo_faktury: faktury, vo_delenie: delenie, vo_rpo: rpo },
  hlavnyText: (v) => v.prilohy?.zaznam?.text ?? '',
  kontext: (v) => `Zákazka ${v.vo.kod}: ${v.vo.nazov}; obstarávateľ ${v.vo.obstaravatel.nazov}`,
  titulok: (v) => ({ kod: v.vo.kod, nazov: v.vo.nazov || v.vo.kod, podnazov: `${v.vo.obstaravatel.nazov} · ${v.vo.druhZakazky} · ${v.vo.postup}` }),
  suhrn: (v) => `PHZ ${eur(v.vo.phz)} · zmluvy ${v.vo.zmluvy.map((z) => `${z.dodavatel?.nazov ?? '?'} ${eur(z.suma)} (${skDatum(z.ucinnost)})`).join('; ') || '–'} · ponuky ${v.vo.ponuky ?? '–'} · CPV ${v.vo.cpv} ${v.vo.cpvNazov} · projekty ${v.vo.projekty.join(', ')}`,
  vystupy(v) {
    if (v.vo.phz == null) return [{ nazov: 'Kontrola VO podľa príručky VO v2', text: 'PHZ nie je v ITMS21+ uvedená, druh kontroly podľa tabuľky príručky VO sa preto nedá určiť.' }];
    const velke = v.vo.phz >= 50_000;
    return [{ nazov: 'Kontrola VO podľa príručky VO v2', text: velke
      ? `PHZ ${eur(v.vo.phz)} je od 50 000 EUR. Podľa tabuľky druhov kontrol ide pri tomto postupe o kontrolu po uzavretí zmluvy (povinnú alebo podľa rizikovej analýzy poskytovateľa), a to pred predložením výdavkov v ŽoP. Dokumentácia sa predkladá cez ITMS21+.`
      : `PHZ ${eur(v.vo.phz)} je pod 50 000 EUR. Kontrola ÚVO sa podľa tabuľky nevyžaduje; postup a hospodárnosť (prieskum trhu) overuje poskytovateľ v rámci finančnej kontroly.` }];
  },
};
