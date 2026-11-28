// Modul: verejné obstarávanie (VO). Vstup: VO z ITMS21+ (postup, PHZ, počet ponúk, zmluvy, doklady).
// Overenie štatutárov v registri RPO je voliteľné a ide online; mená sa neukladajú (neukladatDokazy).
import type { Doklad, Modul, Nalez, Pravidlo, Priloha, VysledokKontroly } from '../../core/typy.ts';
import { denZDatumu } from '../../core/datum.ts';
import { bezDiakritiky, cislo, dnes, dokladyVstupov, eur, nacitajData, skDatum, uctovneDoklady, ZADANE, type VstupDokladu } from '../spolocne.ts';

export interface VoPlny {
  id: number; kod: string; nazov: string; stav: string; vytvorene: string | null;
  obstaravatel: { nazov: string; ico: string }; zadavatel: { nazov: string; ico: string } | null;
  druhObstaravatela: string; druhZakazky: string; postup: string; metoda: string; phz: number | null;
  ponuky: number | null; vylucene: number | null; kriterium: string; cpv: string; cpvNazov: string;
  vestnikEU: boolean | null; rozdelena: boolean | null; projekty: string[]; vVyzve: boolean;
  zmluvy: { id: number; kod: string; cislo: string; ucinnost: string | null; suma: number | null; dodavatel: { nazov: string; ico: string | null; ine?: string | null } | null }[];
  doklady: { id: number; cislo: string; celkom: number | null; datum: string | null }[];
  /**
   * Deň začatia VO z dokumentácie: odoslanie výzvy alebo oznámenia, pri postupe podľa § 108 ZVO odoslanie výzvy
   * osloveným subjektom. ITMS21+ ho neuvádza, zadáva ho kontrolór vo formulári. Určuje limit V01 (MD č. 26, Určenie PHZ).
   */
  zaciatok?: string | null;
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
/** Od tohto dňa platia zjednodušené postupy po novele ZVO (prechodné ustanovenie § 187q ZVO) a príručka CKO VO v2. */
const OD_2024 = '2024-08-01';
/** Zmluva účinná pred 1. 8. 2024: VO prebehlo pred novelou ZVO, aj keď je záznam v ITMS21+ vytvorený neskôr. */
const zmluvaPred2024 = (v: VoPlny) => v.zmluvy.find((z) => z.ucinnost && z.ucinnost < OD_2024);
/** Najskoršia účinnosť zmluvy z VO: VO sa začalo pred ňou. */
const prvaUcinnost = (v: VoPlny) => v.zmluvy.map((z) => z.ucinnost).filter((d): d is string => !!d).sort()[0] ?? null;

/** Obdobie začatia VO a limit postupu v ňom. Dva limity znamenajú, že zdroje sa rozchádzajú a rozhodne človek. */
interface ObdobieLimitu { od: string; do: string | null; limity: number[]; zdroj: string }
const LIMIT_ZMR: ObdobieLimitu[] = [{ od: OD_2024, do: null, limity: [50_000], zdroj: '§ 1 ods. 14 ZVO, MD č. 26' }];
const LIMIT_PRACE: ObdobieLimitu[] = [{ od: OD_2024, do: null, limity: [360_000], zdroj: 'príručka CKO VO v2 aj MD č. 26' }];
/**
 * Tovary a služby. ZVO postup s oslovením sumou neobmedzuje (§ 108 ods. 2; verejnú výzvu žiada § 110 ods. 1 len pri
 * stavebných prácach od 800 000 EUR). Prísnejší limit dáva príručka a rovná sa limitu pre nadlimitnú zákazku ústredného
 * orgánu (§ 1 písm. a) vyhlášky ÚVO), ktorý sa mení s prahmi EÚ. Vyhláška ÚVO č. 421/2025 Z. z. ho od 1. 1. 2026 znížila
 * na 140 000 EUR (§ 4: postupy začaté do 31. 12. 2025 podľa predošlých limitov). Vtedy platná príručka CKO VO v2 uvádzala
 * 143 000 EUR a zmeny vyhlášky ÚVO káže zohľadniť (r. 131); či sa tým zmenil aj jej limit, softvér nerozhodne. Od 31. 7.
 * 2026 platí MD č. 26 so 140 000 EUR (r. 246). Prahy EÚ sa menia každé dva roky, limit po 31. 12. 2027 softvér nepozná.
 */
const LIMIT_TOVARY: ObdobieLimitu[] = [
  { od: OD_2024, do: '2025-12-31', limity: [143_000], zdroj: 'príručka CKO VO v2, vyhláška ÚVO č. 481/2023 Z. z.' },
  { od: '2026-01-01', do: '2026-07-30', limity: [140_000, 143_000], zdroj: 'vyhláška ÚVO č. 421/2025 Z. z. uvádza 140 000 EUR, vtedy platná príručka CKO VO v2 143 000 EUR' },
  { od: '2026-07-31', do: '2027-12-31', limity: [140_000], zdroj: 'MD č. 26' },
];
const eurLimit = (n: number) => `${cislo(n, 0)} EUR`;
const textObdobia = (o: ObdobieLimitu) => `pod ${o.limity.map(eurLimit).join(' alebo ')} bez DPH pri VO začatom ${o.do ? `${skDatum(o.od)} až ${skDatum(o.do)}` : `od ${skDatum(o.od)}`} (${o.zdroj})`;

/**
 * Rozsah dní, v ktorých sa VO mohlo začať. Rozhodný je deň odoslania výzvy alebo oznámenia, inak deň začatia postupu
 * (MD č. 26, Určenie PHZ). ITMS21+ ho neuvádza. Deň zo formulára má prednosť; inak od 1. 8. 2024, ak to postup alebo
 * dátum vytvorenia v ITMS21+ potvrdzuje a skoršia zmluva nevyvracia, po účinnosť prvej zmluvy, bez zmluvy po dnešok.
 * Dátum vytvorenia záznamu nie je dňom začatia VO, preto obdobie po 1. 8. 2024 nezužuje.
 */
function obdobieVo(v: VoPlny): { od: string; do: string; dovod?: string } {
  const ucinnost = prvaUcinnost(v);
  // Rozsah bez známeho dňa začatia; pri neoverenom limite určuje aj to, ktoré limity sa uvedú pre informáciu.
  const rozsah = { od: OD_2024, do: ucinnost ? (ucinnost > OD_2024 ? ucinnost : OD_2024) : dnes() };
  if (v.zaciatok) {
    if (v.zaciatok < OD_2024) return { ...rozsah, dovod: `VO je podľa formulára začaté ${skDatum(v.zaciatok)}, pred 1. 8. 2024, keď platili iné limity.` };
    if (ucinnost && v.zaciatok > ucinnost) return { ...rozsah, dovod: `Deň začatia VO z formulára (${skDatum(v.zaciatok)}) je neskorší ako účinnosť zmluvy (${skDatum(ucinnost)}), jeden z dátumov je chybný.` };
    return { od: v.zaciatok, do: v.zaciatok };
  }
  const od2024 = ((v.vytvorene ?? '') >= OD_2024 || /od 1\.8\.2024/.test(v.postup)) && !zmluvaPred2024(v);
  return od2024 ? rozsah : { ...rozsah, dovod: preco2024(v) };
}

/** Limit postupu pre V01. Pri neznámom dni začatia VO môže platiť viac limitov; `limit` je najnižší z nich (pre V03). */
export interface LimitPostupu { limit: number; limity: number[]; popis: string; overeny: boolean; dovod?: string }

/** Limit zjednodušeného postupu podľa dňa začatia VO, alebo null pri postupe, ktorého limit softvér neoveruje. */
export function limitPostupu(v: VoPlny): LimitPostupu | null {
  const p = v.postup;
  const druh = /malého rozsahu podľa § 1 ods\. 14/.test(p) && !/učebnic/.test(p) ? { nazov: 'zákazka malého rozsahu podľa § 1 ods. 14 ZVO', obdobia: LIMIT_ZMR }
    : !/§ 108/.test(p) ? null
      : /stavebn/i.test(v.druhZakazky) ? { nazov: 'podlimitná zákazka s oslovením min. 3 hospodárskych subjektov na stavebné práce', obdobia: LIMIT_PRACE }
        : { nazov: 'podlimitná zákazka s oslovením min. 3 hospodárskych subjektov na tovary a služby', obdobia: LIMIT_TOVARY };
  if (!druh) return null;
  const o = obdobieVo(v);
  const posledne = druh.obdobia[druh.obdobia.length - 1];
  const prekryv = druh.obdobia.filter((x) => x.od <= o.do && (x.do == null || x.do >= o.od));
  // VO po poslednom známom období: uvedie sa posledné obdobie, len pre informáciu.
  const pouzite = prekryv.length ? prekryv : [posledne];
  const dovod = o.dovod ?? (posledne.do && o.do > posledne.do ? `Limit pre VO začaté po ${skDatum(posledne.do)} softvér nepozná: prahy EÚ a s nimi vyhláška ÚVO sa menia každé dva roky.` : undefined);
  const limity = [...new Set(pouzite.flatMap((x) => x.limity))].sort((a, b) => a - b);
  return { limit: limity[0], limity, popis: `${druh.nazov}: ${pouzite.map(textObdobia).join('; ')}`, overeny: !dovod, ...(dovod ? { dovod } : {}) };
}

/** Prečo limit platný od 1. 8. 2024 nemusí platiť pre toto VO. */
function preco2024(v: VoPlny): string {
  const z = zmluvaPred2024(v);
  if (z) return `Zmluva ${nazovZmluvy(z)} je účinná od ${skDatum(z.ucinnost)}, VO teda prebehlo pred 1. 8. 2024, keď mohli platiť iné limity.`;
  if (!v.vytvorene) return 'Dátum VO nie je v ITMS21+ uvedený, VO mohlo prebehnúť pred 1. 8. 2024, keď mohli platiť iné limity.';
  return `VO je v ITMS21+ vytvorené ${skDatum(v.vytvorene)}, mohlo teda prebehnúť pred 1. 8. 2024, keď mohli platiť iné limity.`;
}

function postup(v: VstupVo): VysledokKontroly {
  const l = limitPostupu(v.vo);
  // Neoverený limit nesmie dať „neuplatňuje sa“ ani „splnené“: výrok by bol „bez zistení“, hoci postup nikto neoveril.
  if (!l) return { stav: 'na_preverenie', zdovodnenie: `Pre postup „${v.vo.postup}“ softvér finančný limit neoveruje (overené sú len zákazky malého rozsahu a podlimitné zákazky s oslovením min. 3 subjektov). Či je postup${v.vo.phz != null ? ` pri PHZ ${eur(v.vo.phz)}` : ''} prípustný, posúdi kontrolór podľa príručky VO platnej v čase zadávania zákazky (od 31. 7. 2026 MD č. 26, predtým príručka CKO VO v2).` };
  const phz = v.vo.phz;
  if (phz == null) return { stav: 'mimo_podkladov', zdovodnenie: 'Chýba predpokladaná hodnota zákazky.' };
  const min = l.limity[0]; const max = l.limity[l.limity.length - 1];
  const hodnoty = { phz, limit: min, ...(max > min ? { limitVyssi: max } : {}) };
  const voci = phz < min ? 'je v limite' : phz >= max ? 'prevyšuje limit' : `je pod limitom ${eurLimit(max)}, ale dosahuje limit ${eurLimit(min)}`;
  if (!l.overeny) return { stav: 'na_preverenie', zdovodnenie: `PHZ ${eur(phz)} ${voci} postupu (${l.popis}). ${l.dovod} Limit platný v čase VO softvér neoveril.`, hodnoty };
  if (phz < min) return { stav: 'splnene', zdovodnenie: `PHZ ${eur(phz)} je v limite postupu (${l.popis}).`, hodnoty };
  // Medzi limitmi: deň začatia VO nie je známy, alebo sa zdroje pre jeho obdobie rozchádzajú. „Splnené“ by mohlo byť falošné OK.
  if (phz < max) return { stav: 'na_preverenie', zdovodnenie: `PHZ ${eur(phz)} ${voci} (${l.popis}). ${v.vo.zaciatok
    ? 'Pre obdobie, keď sa VO začalo, sa zdroje rozchádzajú; ktorý limit uplatní ÚVO, posúdi kontrolór.'
    : 'Ktorý limit platí, určuje deň začatia VO (pri postupe podľa § 108 ZVO odoslanie výzvy osloveným subjektom; MD č. 26, Určenie PHZ). ITMS21+ ho neuvádza, kontrolór ho zadá vo formulári podľa dokumentácie VO.'}`, hodnoty };
  const pozn = (v.vo.vytvorene ?? '') < OD_2024 && !v.vo.zaciatok ? ` VO je v ITMS21+ vytvorené ${skDatum(v.vo.vytvorene)}, postup je však evidovaný v režime od 1. 8. 2024.` : '';
  return { stav: 'nesplnene', zdovodnenie: `PHZ ${eur(phz)} prevyšuje limit zvoleného postupu (${l.popis}).${pozn} Ak ide o chybne zaevidovaný postup v ITMS21+, treba ho opraviť; inak je to porušenie pravidiel VO.`, hodnoty };
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

/** Položky účtovného dokladu z ITMS21+ (doklady.json), z ktorých sa dá určiť základ bez DPH. */
interface UctovnyDoklad { celkom: number | null; polozky: { bezDph: number | null; dph: number | null }[] }
const UCTOVNE = uctovneDoklady<UctovnyDoklad>();
/**
 * Základ dokladu bez DPH z jeho položiek. Známy je len vtedy, keď majú všetky položky sumu bez DPH a položky spolu
 * s DPH vysvetlia celkovú sumu dokladu (inak môžu položky chýbať). Pri neznámom základe vráti null.
 */
export function zakladDokladu(d: VoPlny['doklady'][number]): number | null {
  const u = UCTOVNE[String(d.id)];
  if (!u?.polozky.length || d.celkom == null || u.polozky.some((p) => p.bezDph == null)) return null;
  const bez = u.polozky.reduce((s, p) => s + p.bezDph!, 0); const s = u.polozky.reduce((a, p) => a + p.bezDph! + (p.dph ?? 0), 0);
  return Math.abs(s - d.celkom) <= 0.05 ? bez : null;
}
const r2 = (x: number) => Math.round(x * 100) / 100;

function faktury(v: VstupVo): VysledokKontroly {
  if (!maZmluvu(v.vo)) return { stav: 'mimo_podkladov', zdovodnenie: 'VO nemá zmluvu so sumou.' };
  if (!v.vo.doklady.length) return { stav: 'neuplatnuje_sa', zdovodnenie: 'K VO zatiaľ nie sú evidované účtovné doklady.' };
  const s = sumaZmluv(v.vo); const f = v.vo.doklady.reduce((a, d) => a + (d.celkom ?? 0), 0);
  const bezZmluvy = zmluvyBezSumy(v.vo); const bezDokladu = v.vo.doklady.filter((d) => d.celkom == null);
  // Základ bez DPH z položiek dokladov (všetkých so sumou); null, ak ho niektorý doklad nemá.
  const zaklady = v.vo.doklady.filter((d) => d.celkom != null).map(zakladDokladu);
  const zaklad = zaklady.every((x) => x != null) ? zaklady.reduce((a: number, x) => a + x!, 0) : null;
  const hodnoty = { zmluvy: s, doklady: r2(f), ...(zaklad != null ? { dokladyBezDph: r2(zaklad) } : {}) };
  const pozn = bezZmluvy.length ? ` Zmluva ${bezZmluvy.map(nazovZmluvy).join(', ')} nemá v ITMS21+ sumu, súčet zmlúv môže byť vyšší.` : '';
  // ITMS21+ neuvádza, či suma zmluvy zahŕňa DPH, sumy dokladov ju zahŕňajú (ak ju doklad má). „Neprevyšujú“ platí
  // v oboch prípadoch len vtedy, keď doklady s DPH nie sú vyššie ako zmluvy; inak ide výsledok kontrolórovi (audit A07).
  if (f > s + 0.01) {
    const zakladText = zaklad == null ? 'Základ bez DPH sa z položiek dokladov nedá určiť pri všetkých dokladoch' : `Základ dokladov bez DPH (z ich položiek) je ${eur(r2(zaklad))}`;
    if (zaklad != null && zaklad > s + 0.01) return { stav: 'na_preverenie', zdovodnenie: `Doklady spolu ${eur(r2(f))} s DPH prevyšujú zmluvy ${eur(s)}, a to aj bez DPH (${eur(r2(zaklad))}). Overiť dodatky (podliehajú kontrole VO).${pozn}`, hodnoty };
    return { stav: 'na_preverenie', zdovodnenie: `Doklady spolu ${eur(r2(f))} (celkové sumy dokladov, s DPH, ak ju doklad má) prevyšujú zmluvy ${eur(s)}. ${zakladText}${zaklad != null ? ', zmluvy neprevyšuje' : ''}. ITMS21+ neuvádza, či suma zmluvy zahŕňa DPH, preto treba overiť zmluvu a dodatky (dodatky podliehajú kontrole VO).${pozn}`, hodnoty };
  }
  if (bezDokladu.length) return { stav: 'mimo_podkladov', zdovodnenie: `Doklady so známou sumou spolu ${eur(r2(f))} (s DPH) neprevyšujú zmluvy ${eur(s)}. Doklad ${bezDokladu.map((d) => d.cislo || `id ${d.id}`).join(', ')} nemá v ITMS21+ sumu, fakturácia spolu sa preto neoverila.`, hodnoty };
  return { stav: 'splnene', zdovodnenie: `Doklady spolu ${eur(r2(f))} (celkové sumy dokladov, s DPH, ak ju doklad má) neprevyšujú zmluvy ${eur(s)}; platí to, aj keby suma zmluvy bola bez DPH.`, hodnoty };
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
    case 'vo_postup': return dokladyVstupov(n, zdroj, [postup, phz], [vytvorene, u('Účinnosť zmlúv', (x) => x.zmluvy.filter((y) => y.ucinnost).map((y) => `${nazovZmluvy(y)}: ${skDatum(y.ucinnost)}`)),
      ['Deň začatia VO (z dokumentácie VO)', v.vo.zaciatok ? skDatum(v.vo.zaciatok) : null, ZADANE]]);
    case 'vo_ponuky': return n.stav === 'neuplatnuje_sa' ? dokladyVstupov(n, zdroj, [postup], [u('Stav VO', (x) => x.stav)])
      : dokladyVstupov(n, zdroj, [u('Počet prijatých ponúk', (x) => x.ponuky)], [u('Počet vylúčených ponúk', (x) => x.vylucene), postup]);
    case 'vo_cena': return dokladyVstupov(n, zdroj, [phz, zmluvy], [postup]);
    case 'vo_faktury': return dokladyVstupov(n, zdroj, [
      u('Zmluvy so sumou (ITMS21+ neuvádza, či suma zahŕňa DPH)', (x) => x.zmluvy.filter((y) => y.suma != null).map((y) => `${nazovZmluvy(y)}: ${eur(y.suma)}`)),
      u('Účtovné doklady k VO: celková suma (s DPH, ak ju doklad má)', (x) => x.doklady.map((d) => `${d.cislo || `id ${d.id}`}: ${eur(d.celkom)}`))],
    [u('Účtovné doklady k VO: základ bez DPH z položiek dokladu v ITMS21+', (x) => x.doklady.map((d) => { const b = zakladDokladu(d); return `${d.cislo || `id ${d.id}`}: ${b == null ? 'položky nevysvetlia celkovú sumu, základ neznámy' : eur(r2(b))}`; }))]);
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
    { kluc: 'zaciatok', nazov: 'Deň začatia VO (odoslanie výzvy, pri § 108 ZVO osloveným subjektom)', typ: 'datum', napoveda: 'Z dokumentácie VO, ITMS21+ ho neuvádza. Určuje limit postupu (V01): pri tovaroch a službách 143 000 EUR pri VO začatom do 31. 12. 2025, 140 000 EUR od 31. 7. 2026 (MD č. 26).' },
    { kluc: 'ponuky', nazov: 'Počet prijatých ponúk', typ: 'cislo' },
    { kluc: 'vylucene', nazov: 'Počet vylúčených ponúk', typ: 'cislo' },
    { kluc: 'zmluva', nazov: 'Suma zmlúv spolu (EUR)', typ: 'cislo' },
    { kluc: 'rpo', nazov: 'Overiť štatutárov online v registri RPO', typ: 'vyber', moznosti: [{ hodnota: '', nazov: 'nie' }, { hodnota: 'ano', nazov: 'áno (pošle IČO do RPO)' }], napoveda: 'Odošle IČO obstarávateľa a dodávateľov do verejného API Štatistického úradu. Mená sa neukladajú.' },
  ],
  prilohy: () => [{ cislo: 'zaznam', nazov: 'Záznam zo zadania zákazky' }],
  doFormulara: (v) => ({ phz: v.vo.phz, zaciatok: v.vo.zaciatok ?? null, ponuky: v.vo.ponuky, vylucene: v.vo.vylucene, zmluva: maZmluvu(v.vo) ? Math.round(sumaZmluv(v.vo) * 100) / 100 : null, rpo: v.rpo }),
  zFormulara(v, f) {
    const n: VstupVo = structuredClone(v);
    const c = (x: any) => (x == null || x === '' ? null : Number(x));
    n.vo.phz = c(f.phz); n.vo.ponuky = c(f.ponuky); n.vo.vylucene = c(f.vylucene);
    // Neplatný deň sa nepoužije: VO sa potom posudzuje, akoby deň začatia nebol známy.
    n.vo.zaciatok = denZDatumu(f.zaciatok == null ? null : String(f.zaciatok).trim());
    const z = c(f.zmluva);
    // Úprava súčtu nesmie zmazať zmluvy: ich účinnosť ohraničuje deň začatia VO pre limit V01 (aj režim pred 1. 8. 2024)
    // a dodávatelia slúžia RPO (audit A06). Jedinej zmluve sa zmení suma; pri viacerých pribudne riadok s rozdielom súčtu.
    if (z != null && Math.abs(z - sumaZmluv(v.vo)) > 0.005) {
      const sSumou = n.vo.zmluvy.filter((y) => y.suma != null);
      const jedina = sSumou.length === 1 ? sSumou[0] : n.vo.zmluvy.length === 1 ? n.vo.zmluvy[0] : null;
      if (jedina) jedina.suma = z;
      else n.vo.zmluvy.push({ id: -1, kod: 'úprava súčtu', cislo: 'úprava súčtu zmlúv z formulára', ucinnost: null, suma: r2(z - sumaZmluv(v.vo)), dodavatel: null });
    }
    n.rpo = f.rpo === 'ano' ? 'ano' : '';
    return n;
  },
  doklady: dokladyVo,
  inventarPodmienok: true,
  kontroly: { vo_postup: postup, vo_ponuky: ponuky, vo_cena: cena, vo_faktury: faktury, vo_delenie: delenie, vo_rpo: rpo },
  hlavnyText: (v) => v.prilohy?.zaznam?.text ?? '',
  kontext: (v) => `Zákazka ${v.vo.kod}: ${v.vo.nazov}; obstarávateľ ${v.vo.obstaravatel.nazov}`,
  titulok: (v) => ({ kod: v.vo.kod, nazov: v.vo.nazov || v.vo.kod, podnazov: `${v.vo.obstaravatel.nazov} · ${v.vo.druhZakazky} · ${v.vo.postup}` }),
  suhrn: (v) => `PHZ ${eur(v.vo.phz)} · zmluvy ${v.vo.zmluvy.map((z) => `${z.dodavatel?.nazov ?? '?'} ${eur(z.suma)} (${skDatum(z.ucinnost)})`).join('; ') || '–'} · ponuky ${v.vo.ponuky ?? '–'} · CPV ${v.vo.cpv} ${v.vo.cpvNazov} · projekty ${v.vo.projekty.join(', ')}`,
  vystupy(v) {
    const nazov = 'Kontrola VO podľa MD č. 26';
    if (v.vo.phz == null) return [{ nazov, text: 'PHZ nie je v ITMS21+ uvedená, druh kontroly podľa tabuľky v MD č. 26 sa preto nedá určiť.' }];
    // Tabuľka druhov kontrol v MD č. 26: pri nadlimitných stavebných prácach bunka uvádza kontrolu rizikovej zákazky aj „Povinná“.
    return [{ nazov, text: v.vo.phz >= 50_000
      ? `PHZ ${eur(v.vo.phz)} je od 50 000 EUR. Podľa tabuľky druhov kontrol v MD č. 26 vykoná ÚVO ako SO kontrolu po uzavretí zmluvy, ak zákazku poskytovateľ na základe svojej rizikovej analýzy vyhodnotí ako rizikovú (podnet podáva poskytovateľ), a to pred predložením výdavkov v ŽoP. Pri nadlimitných stavebných prácach tabuľka uvádza aj „Povinná“. Dokumentácia sa predkladá cez ITMS21+.`
      : `PHZ ${eur(v.vo.phz)} je pod 50 000 EUR, tabuľka druhov kontrol v MD č. 26 začína od 50 000 EUR. Pri zákazke malého rozsahu prijímateľ preukazuje hospodárnosť prieskumom trhu a ÚVO ako SO predkladá s dokumentáciou aj vyhlásenie, že v kalendárnom roku neobstará rovnaký predmet nad 50 000 EUR bez DPH.` }];
  },
};
