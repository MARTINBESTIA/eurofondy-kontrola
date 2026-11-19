// Modul 1: žiadosť o NFP a prílohy.
import fs from 'node:fs';
import path from 'node:path';
import type { Modul, Ziadost } from '../../core/typy.ts';
import { KONTROLY, hzpEE, hzpOZE, uspora } from './kontroly.ts';

const KOREN = path.join(import.meta.dirname, '..', '..', '..');
const VYZVA = process.env.VYZVA ?? 'PSK-SIEA-002-2023-DV-EFRR';
const subor = path.join(KOREN, 'data', 'odvodene', VYZVA, 'ziadosti.json');
const ziadosti: Ziadost[] = fs.existsSync(subor) ? JSON.parse(fs.readFileSync(subor, 'utf8')) : [];
const podlaKodu = new Map(ziadosti.map((z) => [z.kod, z]));

const skupina = (z: Ziadost) => z.vysledok === 'schvalena' ? 'schvalena' : z.dovod === 'nedostatok_prostriedkov' ? 'nedostatok' : z.vysledok === 'neschvalena' ? 'neschvalena' : z.vysledok === 'zastavene' ? 'zastavene' : 'ina';
const NAZVY: Record<string, string> = { schvalena: 'schválená', nedostatok: 'neschválená: nedostatok peňazí', neschvalena: 'neschválená', zastavene: 'zastavené konanie', ina: 'iný stav' };
const DOVODY: Record<string, string> = { nedostatok_prostriedkov: 'nedostatok finančných prostriedkov', nesplnenie_ppp: 'nesplnenie podmienok poskytnutia príspevku', zastavenie_konania: 'zastavenie konania' };
const uk = (z: Ziadost, kod: string) => z.ukazovatele.find((u) => u.kod === kod);
const cislo = (n: number | null, d = 1) => (n == null ? '–' : n.toLocaleString('sk-SK', { maximumFractionDigits: d }));

export const zonfp: Modul<Ziadost> = {
  id: 'zonfp', nazov: 'Žiadosť a prílohy',
  popis: 'Kontrola žiadosti o NFP podľa podmienok poskytnutia príspevku výzvy: údaje formulára, povinné prílohy, obsah príloh.',
  filtre: [{ hodnota: 'schvalena', nazov: 'Schválené' }, { hodnota: 'nedostatok', nazov: 'Neschválené len pre nedostatok peňazí' }, { hodnota: 'neschvalena', nazov: 'Neschválené' }, { hodnota: 'zastavene', nazov: 'Zastavené konanie' }],
  pripady(q, filter, limit = 80) {
    const s = q.toLowerCase();
    const v = ziadosti.filter((z) => (!filter || skupina(z) === filter) && (!s || `${z.kod} ${z.nazov} ${z.ziadatel.nazov}`.toLowerCase().includes(s)));
    return { spolu: v.length, pripady: v.slice(0, limit).map((z) => ({ id: z.kod, nazov: z.nazov, podnazov: z.ziadatel.nazov, stitok: NAZVY[skupina(z)] })) };
  },
  nacitaj: (id) => podlaKodu.get(id),
  polia: () => [
    { kluc: 'nfp', nazov: 'Žiadaný NFP (EUR)', typ: 'cislo' }, { kluc: 'forma', nazov: 'Právna forma (kód)', typ: 'text' },
    { kluc: 'vych', nazov: 'Spotreba energie pred (MWh/rok)', typ: 'cislo' }, { kluc: 'ciel', nazov: 'Spotreba energie po (MWh/rok)', typ: 'cislo' },
    { kluc: 'mwa', nazov: 'Kapacita OZE elektrická (MW)', typ: 'cislo' }, { kluc: 'mwb', nazov: 'Kapacita OZE tepelná (MW)', typ: 'cislo' },
    { kluc: 'popis', nazov: 'Popis projektu', typ: 'dlhy_text' },
  ],
  prilohy: () => [['1', 'Plnomocenstvo / poverenie'], ['3', 'Uznesenie o programe rozvoja a územnom pláne'], ['5', 'Energetický audit'], ['6', 'Energetický certifikát'], ['7', 'Projektová dokumentácia'], ['8', 'Dokumentácia k oprávnenosti výdavkov']].map(([cislo, nazov]) => ({ cislo, nazov })),
  doFormulara: (z) => ({ nfp: z.sumaZiadanaNFP, forma: z.ziadatel.pravnaFormaKod, vych: uk(z, 'PSKPRCR26b')?.vychodisko ?? null, ciel: uk(z, 'PSKPRCR26b')?.ciel ?? null, mwa: uk(z, 'PSKPRCO22a')?.ciel ?? null, mwb: uk(z, 'PSKPRCO22b')?.ciel ?? null, popis: z.popis }),
  zFormulara(povodna, f) {
    const z: Ziadost = structuredClone(povodna);
    z.sumaZiadanaNFP = Number(f.nfp ?? 0); z.popis = String(f.popis ?? '');
    if (String(f.forma) !== z.ziadatel.pravnaFormaKod) { z.ziadatel.pravnaFormaKod = String(f.forma); z.ziadatel.pravnaForma = `kód ${f.forma} (zmenené v rozhraní)`; }
    const nastav = (kod: string, pole: 'vychodisko' | 'ciel', hodnota: any) => {
      let u = uk(z, kod);
      if (!u && hodnota != null) { u = { kod, nazov: kod, typ: 'vysledok', jednotka: '', vychodisko: null, ciel: null }; z.ukazovatele.push(u); }
      if (u) u[pole] = hodnota == null || hodnota === '' ? null : Number(hodnota);
    };
    nastav('PSKPRCR26b', 'vychodisko', f.vych); nastav('PSKPRCR26b', 'ciel', f.ciel); nastav('PSKPRCO22a', 'ciel', f.mwa); nastav('PSKPRCO22b', 'ciel', f.mwb);
    return z;
  },
  kontroly: KONTROLY,
  hlavnyText: (z) => [z.popis, z.ucel].filter(Boolean).join('\n'),
  kontext: (z) => `Názov projektu: ${z.nazov}\nŽiadateľ: ${z.ziadatel.nazov} (${z.ziadatel.pravnaForma})`,
  titulok: (z) => ({ kod: z.kod, nazov: z.nazov, podnazov: `${z.ziadatel.nazov} · ${z.ziadatel.pravnaForma} · opatrenia ${z.opatrenia.join(', ') || '–'} · predložená ${z.datumPredlozenia ?? '–'}` }),
  suhrn: (z) => `Úspora primárnej energie: ${uspora(z, 'PSKPRCR26b') ? cislo(uspora(z, 'PSKPRCR26b')!.percent) + ' %' : 'nedá sa vypočítať'} · hodnota za peniaze EE: ${hzpEE(z) == null ? '–' : cislo(hzpEE(z), 0) + ' EUR/MWh'} · OZE: ${hzpOZE(z) == null ? '–' : cislo(hzpOZE(z), 0) + ' EUR/MW'}`,
  skutocnost: (z) => `Skutočné rozhodnutie poskytovateľa: ${z.stav}${z.dovod ? ` (${DOVODY[z.dovod]})` : ''}.`,
};
