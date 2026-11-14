// Deterministické kontroly modulu "žiadosť o NFP a prílohy".
// Každá kontrola je čistá funkcia (žiadosť, pravidlo) -> výsledok. Prahy a kódy sú v balíku pravidiel, nie tu.
import type { Ziadost, Pravidlo, Stav } from '../../core/typy.ts';

export interface VysledokKontroly { stav: Stav; zdovodnenie: string; hodnoty?: Record<string, number | string | null>; dokaz?: string }
type Kontrola = (z: Ziadost, p: Pravidlo) => VysledokKontroly;

const eur = (n: number) => n.toLocaleString('sk-SK', { maximumFractionDigits: 0 }) + ' EUR';
const cislo = (n: number, d = 1) => n.toLocaleString('sk-SK', { maximumFractionDigits: d });
const uk = (z: Ziadost, kod: string) => z.ukazovatele.find((u) => u.kod === kod);
const maHlavnu = (z: Ziadost, opatrenie: string) => z.aktivity.some((a) => a.hlavna && a.opatrenie === opatrenie) || z.rozpocet.some((r) => r.hlavna && r.opatrenie === opatrenie && r.suma > 0);
const covHlavnych = (z: Ziadost, opatrenie: string) => z.rozpocet.filter((r) => r.hlavna && r.opatrenie === opatrenie).reduce((s, r) => s + r.suma, 0);
const mesiace = (od: string, po: string) => (new Date(po).getTime() - new Date(od).getTime()) / 86400_000 / 30.44;

/** Úspora primárnej energie z ukazovateľa (východisková - cieľová hodnota). */
export function uspora(z: Ziadost, kod: string): { vych: number; ciel: number; mwh: number; percent: number } | null {
  const u = uk(z, kod);
  if (!u || u.vychodisko == null || u.ciel == null || u.vychodisko <= 0) return null;
  return { vych: u.vychodisko, ciel: u.ciel, mwh: u.vychodisko - u.ciel, percent: ((u.vychodisko - u.ciel) / u.vychodisko) * 100 };
}

/** Hodnota za peniaze: COV hlavných aktivít opatrenia / prínos. Vracia null, ak sa nedá vypočítať. */
export function hzpEE(z: Ziadost): number | null {
  const u = uspora(z, 'PSKPRCR26b'); const cov = covHlavnych(z, '2.1.2');
  return u && u.mwh > 0 && cov > 0 ? cov / u.mwh : null;
}
export function hzpOZE(z: Ziadost): number | null {
  const mw = (uk(z, 'PSKPRCO22a')?.ciel ?? 0) + (uk(z, 'PSKPRCO22b')?.ciel ?? 0); const cov = covHlavnych(z, '2.2.2');
  return mw > 0 && cov > 0 ? cov / mw : null;
}

function trojpasmo(hodnota: number, max: number, rezerva: number, jednotka: string, hodnoty: Record<string, number | string | null>): VysledokKontroly {
  const h = `${cislo(hodnota, 0)} ${jednotka}`;
  if (hodnota <= max) return { stav: 'splnene', zdovodnenie: `Hodnota za peniaze je ${h}, limit je ${cislo(max, 0)}.`, hodnoty };
  if (hodnota <= max * rezerva) return { stav: 'na_preverenie', zdovodnenie: `Hodnota za peniaze vychádza ${h}, teda nad limitom ${cislo(max, 0)}, ale v pásme, ktoré môže vysvetliť DPH v rozpočte formulára alebo výdavky, ktoré sa do výpočtu nerátajú. Treba prepočítať podľa Prílohy č. 8 ŽoNFP.`, hodnoty };
  return { stav: 'nesplnene', zdovodnenie: `Hodnota za peniaze je ${h}. Limit ${cislo(max, 0)} je prekročený aj po odrátaní DPH.`, hodnoty };
}

export const KONTROLY: Record<string, Kontrola> = {
  pravna_forma(z, p) {
    const kod = z.ziadatel.pravnaFormaKod;
    if (!kod) return { stav: 'chyba_podklad', zdovodnenie: 'Vo formulári chýba právna forma žiadateľa.' };
    const ok = (p.parametre?.povolene as string[]).includes(kod);
    return { stav: ok ? 'splnene' : 'nesplnene', zdovodnenie: `Právna forma žiadateľa: ${z.ziadatel.pravnaForma} (kód ${kod}). ${ok ? 'Je medzi oprávnenými.' : 'Nie je medzi oprávnenými žiadateľmi výzvy.'}`, hodnoty: { kod } };
  },

  hlavna_aktivita(z) {
    const n = z.aktivity.filter((a) => a.hlavna).length;
    return n > 0 ? { stav: 'splnene', zdovodnenie: `Projekt má ${n} hlavných aktivít v opatreniach ${[...new Set(z.aktivity.filter((a) => a.hlavna).map((a) => a.opatrenie))].join(', ')}.`, hodnoty: { pocet: n } }
      : { stav: 'nesplnene', zdovodnenie: 'Projekt nemá žiadnu hlavnú aktivitu.' };
  },

  uspora_min(z, p) {
    if (!maHlavnu(z, '2.1.2')) return { stav: 'neuplatnuje_sa', zdovodnenie: 'Projekt nerealizuje opatrenie 2.1.2.' };
    const u = uk(z, p.parametre!.ukazovatel);
    if (!u || u.vychodisko == null || u.ciel == null) return { stav: 'mimo_podkladov', zdovodnenie: `Ukazovateľ ${p.parametre!.ukazovatel} nemá v podkladoch východiskovú alebo cieľovú hodnotu (vo verejnom registri býva nevyplnená). Úsporu treba overiť z energetického certifikátu a Prílohy č. 8 ŽoNFP.` };
    if (u.vychodisko <= 0) return { stav: 'na_preverenie', zdovodnenie: `Východisková spotreba primárnej energie je ${u.vychodisko} MWh/rok, čo nedáva zmysel.` };
    const percent = ((u.vychodisko - u.ciel) / u.vychodisko) * 100; const hodnoty = { vychodisko: u.vychodisko, ciel: u.ciel, percent: +percent.toFixed(1) };
    if (percent < 0) return { stav: 'nesplnene', zdovodnenie: `Cieľová spotreba (${cislo(u.ciel)} MWh/rok) je vyššia než východisková (${cislo(u.vychodisko)} MWh/rok). Pravdepodobne chyba v jednotkách (kWh namiesto MWh).`, hodnoty };
    const min = p.parametre!.minPercent as number;
    return percent < min ? { stav: 'nesplnene', zdovodnenie: `Plánovaná úspora je ${cislo(percent)} %, minimum je ${min} %.`, hodnoty }
      : { stav: 'splnene', zdovodnenie: `Plánovaná úspora za celý projekt je ${cislo(percent)} % (z ${cislo(u.vychodisko)} na ${cislo(u.ciel)} MWh/rok). Podmienka platí pre každú budovu zvlášť, pri viacerých budovách ju treba overiť v Prílohe č. 8 ŽoNFP.`, hodnoty };
  },

  hzp_ee(z, p) {
    if (!maHlavnu(z, '2.1.2')) return { stav: 'neuplatnuje_sa', zdovodnenie: 'Projekt nerealizuje opatrenie 2.1.2.' };
    const u = uspora(z, p.parametre!.ukazovatel); const cov = covHlavnych(z, '2.1.2');
    if (!u || u.mwh <= 0) return { stav: 'mimo_podkladov', zdovodnenie: 'Úspora primárnej energie sa z podkladov nedá vypočítať, preto ani hodnota za peniaze. Treba ju overiť v Prílohe č. 8 ŽoNFP.' };
    return trojpasmo(cov / u.mwh, p.parametre!.max, p.parametre!.rezervaDph, 'EUR/MWh/rok', { cov: Math.round(cov), usporaMWh: +u.mwh.toFixed(2), hzp: Math.round(cov / u.mwh) });
  },

  hzp_oze(z, p) {
    if (!maHlavnu(z, '2.2.2')) return { stav: 'neuplatnuje_sa', zdovodnenie: 'Projekt nerealizuje opatrenie 2.2.2.' };
    const mw = (p.parametre!.ukazovatele as string[]).reduce((s, k) => s + (uk(z, k)?.ciel ?? 0), 0); const cov = covHlavnych(z, '2.2.2');
    if (mw <= 0) return { stav: 'chyba_podklad', zdovodnenie: 'Ukazovatele PSKPRCO22a/b (dodatočná kapacita OZE v MW) nemajú cieľovú hodnotu.' };
    if (cov <= 0) return { stav: 'chyba_podklad', zdovodnenie: 'V rozpočte nie sú výdavky na hlavné aktivity opatrenia 2.2.2.' };
    return trojpasmo(cov / mw, p.parametre!.max, p.parametre!.rezervaDph, 'EUR/MW', { cov: Math.round(cov), kapacitaMW: +mw.toFixed(4), hzp: Math.round(cov / mw) });
  },

  miesto_sr(z) {
    if (!z.miesta.length) return { stav: 'chyba_podklad', zdovodnenie: 'Vo formulári chýba miesto realizácie.' };
    const mimo = z.miesta.filter((m) => m.lokalita !== 'SLOVENSKA_REPUBLIKA');
    return mimo.length ? { stav: 'nesplnene', zdovodnenie: `Miesto realizácie mimo SR: ${mimo.map((m) => m.obec || m.kraj).join(', ')}.` }
      : { stav: 'splnene', zdovodnenie: `Miesto realizácie: ${[...new Set(z.miesta.map((m) => m.obec || m.okres || m.kraj))].slice(0, 4).join(', ')}.` };
  },

  vyska_nfp(z, p) {
    const { min, max } = p.parametre as { min: number; max: number }; const n = z.sumaZiadanaNFP; const hodnoty = { nfp: n };
    if (n < min) return { stav: 'nesplnene', zdovodnenie: `Žiadaný NFP ${eur(n)} je pod minimom ${eur(min)}.`, hodnoty };
    if (n > max) return { stav: 'nesplnene', zdovodnenie: `Žiadaný NFP ${eur(n)} je nad maximom ${eur(max)}.`, hodnoty };
    return { stav: 'splnene', zdovodnenie: `Žiadaný NFP ${eur(n)} je v povolenom rozmedzí.`, hodnoty };
  },

  pasmo_ov(z, p) {
    if (!maHlavnu(z, '2.1.2')) return { stav: 'neuplatnuje_sa', zdovodnenie: 'Projekt nerealizuje opatrenie 2.1.2, pásma sa neuplatnia.' };
    const u = uspora(z, p.parametre!.ukazovatel);
    if (!u) return { stav: 'mimo_podkladov', zdovodnenie: 'Úspora sa z podkladov nedá vypočítať, pásmo oprávnených výdavkov sa nedá určiť.' };
    if (u.percent < 30) return { stav: 'nesplnene', zdovodnenie: `Úspora ${cislo(u.percent)} % je pod 30 %, budova nemôže byť podporená.` };
    const zaklad = u.percent > 60 ? 100 : u.percent > 50 ? 95 : u.percent > 40 ? 90 : 85;
    const maOZE = z.aktivity.some((a) => a.hlavna && a.opatrenie === '2.2.2');
    const vysledne = maOZE ? zaklad : zaklad - 5;
    return { stav: 'splnene', zdovodnenie: `Pri úspore ${cislo(u.percent)} % je základ oprávnených výdavkov ${zaklad} %. ${maOZE ? 'Projekt má aj aktivitu OZE, ďalšie zníženie o 5 p. b. sa neuplatní, ak OZE kryje spotrebu všetkých budov.' : 'Projekt nemá aktivitu OZE opatrenia 2.2.2, uplatní sa ďalšie zníženie o 5 p. b.'} Očakávaná výška: ${vysledne} %.`, hodnoty: { usporaPercent: +u.percent.toFixed(1), opravneneVydavkyPercent: vysledne } };
  },

  harmonogram(z, p) {
    if (!z.koniecHlavnychAktivit || !z.datumPredlozenia) return { stav: 'chyba_podklad', zdovodnenie: 'Vo formulári chýba harmonogram hlavných aktivít alebo dátum predloženia.' };
    const m = mesiace(z.datumPredlozenia, z.koniecHlavnychAktivit); const limit = (p.parametre!.maxMesiacov as number) + (p.parametre!.rezervaNaKonanieMesiacov as number);
    const hodnoty = { koniecHlavnychAktivit: z.koniecHlavnychAktivit, mesiacovOdPredlozenia: +m.toFixed(1) };
    return m > limit ? { stav: 'na_preverenie', zdovodnenie: `Hlavné aktivity končia ${z.koniecHlavnychAktivit}, teda ${cislo(m)} mesiaca po predložení žiadosti. Lehota 24 mesiacov beží až od účinnosti zmluvy, ale harmonogram je dlhý, treba ho preveriť.`, hodnoty }
      : { stav: 'splnene', zdovodnenie: `Hlavné aktivity končia ${z.koniecHlavnychAktivit}, ${cislo(Math.max(m, 0))} mesiaca po predložení žiadosti. Je to orientačná kontrola: lehota beží od účinnosti zmluvy.`, hodnoty };
  },

  priloha_povinna(z, p) {
    const { cislo: c, podmienka, nahrada } = p.parametre as { cislo: string; podmienka: string; nahrada?: string };
    const plati = podmienka === 'vzdy' || (podmienka === 'opatrenie_212' && maHlavnu(z, '2.1.2'))
      || (podmienka === 'aktivita_audit' && z.aktivity.some((a) => a.hlavna && /energetick\S* audit|vypracovanie EA\b/i.test(a.nazov)))
      || (podmienka === 'obec_vuc' && ['801', '803'].includes(z.ziadatel.pravnaFormaKod));
    if (!plati) return { stav: 'neuplatnuje_sa', zdovodnenie: 'Pre túto žiadosť sa príloha nevyžaduje.' };
    if (z.prilohy === undefined) return { stav: 'mimo_podkladov', zdovodnenie: `Príloha č. ${c} sa vyžaduje, ale prílohy nie sú súčasťou podkladov (verejné API ich neobsahuje).` };
    const pr = z.prilohy[c];
    if (pr && pr.text.trim().length > 40) return { stav: 'splnene', zdovodnenie: `Príloha č. ${c} je priložená: ${pr.nazov}.` };
    if (nahrada && /https?:\/\/|www\./i.test(z.popis)) return { stav: 'na_preverenie', zdovodnenie: `Príloha č. ${c} chýba. Výzva pripúšťa náhradu: ${nahrada}. V popise projektu je webový odkaz, treba overiť, či vedie na uznesenie.` };
    return { stav: 'chyba_podklad', zdovodnenie: `Príloha č. ${c} sa vyžaduje a chýba${pr ? ' (súbor je prázdny alebo nečitateľný)' : ''}.${nahrada ? ` Náhrada: ${nahrada}.` : ''}` };
  },

  register(z, p) {
    const vynimka = p.parametre?.nevztahujeSaNa as string[] | undefined;
    if (vynimka?.includes(z.ziadatel.pravnaFormaKod)) return { stav: 'neuplatnuje_sa', zdovodnenie: `Podmienka sa na právnu formu „${z.ziadatel.pravnaForma}“ nevzťahuje.` };
    return { stav: 'mimo_podkladov', zdovodnenie: `Z podkladov žiadosti sa nedá overiť. Poskytovateľ overuje: ${p.overenieZdroj}.` };
  },
};
