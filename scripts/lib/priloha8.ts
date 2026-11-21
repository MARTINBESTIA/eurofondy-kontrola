// Vyplnenie záväzného zošita Prílohy č. 8 ŽoNFP (výzva PSK-SIEA-002-2023, vzor akt. 3) pre demo, cez MS Excel (COM, Windows).
// Zošit vypĺňa a prepočíta skutočný Excel, takže uložené hodnoty vzorcov (úspora PE, súčty sekcií, kontrolné hlášky)
// sú tie, ktoré uvidí hodnotiteľ aj kontrola P08. Makrá vzoru sa nespúšťajú (AutomationSecurity = vynútene vypnuté)
// a jeho externé odkazy sa neaktualizujú. Banner „Makrá sú vypnuté“ (Rozpočet B1!A6, MU Budova 1!B7) preto po prepočte
// ostane viditeľný; pri otvorení zošita s povolenými makrami zmizne.
// Hodnoty z číselníkov (áno/nie, opatrenia, kategória budovy, triedy, spôsob stanovenia výdavku) sa overujú voči
// skrytému hárku Číselníky priamo vo vzore, nie voči ručne prepísanému zoznamu.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { xlsxBunky } from '../../src/ingest/dokument.ts';

export const VZOR_PRILOHY_8 = path.resolve(import.meta.dirname, '../../data/zdroje/PSK-SIEA-002-2023/akt3/PSK-SIEA-002-2023-DV-EFRR_bez_SZ/Prilohy/Priloha_8_ZoNFP_Dokument._k_OV_akt.3.xlsm');

/** sposob = riadok číselníka „Spôsob stanovenia výšky výdavku“: 1 prieskum trhu, 2 znalecký/odborný posudok, 3 zmluva z ukončeného VO, 4 podrobný rozpočet. */
export interface Polozka8 { nazov: string; mj: string; pocet: number; jednotkovaCenaBezDph: number; sposob: 1 | 2 | 3 | 4; opis: string; skupina?: string }
export interface Priloha8Spec {
  ziadatel: string; projekt: string;                    // B9, B10: presne ako vo formulári ŽoNFP (P08 ich porovnáva)
  platcaDph: boolean; sadzbaDph?: number;               // B11, F11 (predvolene 0,23)
  opatrenia: string;                                    // B12: '2.1.2 - Budovy' | '2.2.2 - OZE' | 'Budovy a OZE'
  schvalenyRadou?: boolean;                             // O9: projekt schválený Radou partnerstva / Kooperačnou radou UMR
  budova: {
    katastralneUzemie: string; lv: string; supisneCislo: string;   // D13, F13, G13
    pravnyVztah: string;                                // O12, text z číselníka
    kategoria: string;                                  // MU!C44, text z číselníka
    triedaPred: string; triedaPo: string;               // MU!F47, F48 (A0 … G)
    guPePredKwhM2: number; plochaPredM2: number;        // MU!F49, F50
    guPePoKwhM2: number; plochaPoM2: number;            // MU!F51, F52
    prevadzka: { hodinDenne: number; dniTyzdenne: number; tyzdnovRocne: number }; // MU!F30, G30, H30
    ozeElMW?: number; ozeTepMW?: number;                // MU!I75, I76 (PSKPRCO22a/b, cieľ)
    /** Emisie skleníkových plynov t CO2 ekv./rok (PSKPRCR29): MU!M51, N51. Bez nich hárok nezapočíta výdavky na budovu (M209 = 0). */
    emisieCO2T?: { vych: number; plan: number };
    /** Vyrobená energia z OZE MWh/rok (PSKPRCR31a/b): MU!H77, I77 (elektrina), H78, I78 (teplo). Bez nich M269 = 0. */
    ozeVyrobaMWh?: { elVych: number; elPlan: number; tepVych: number; tepPlan: number };
    /** Odpovede na podmienky oprávnenosti v MU Budova 1; predvolene „áno“, L60 len pri projekte s OZE. */
    podmienky?: Partial<Record<'H17' | 'N17' | 'H18' | 'N18' | 'H60' | 'L60', boolean>>;
  };
  /** sekcia = presný nadpis sekcie v stĺpci A hárku Rozpočet B1 (= názov aktivity v ITMS21+); parameter = bunka C(riadok+1). */
  sekcie: { sekcia: string; parameter?: number; opatrenie?: '2.1.2' | '2.2.2'; polozky: Polozka8[] }[];
  poznamka?: string;                                    // do hlavičky oboch hárkov (Rozpočet B1!A4, MU Budova 1!B4)
}
export interface Priloha8Vysledok {
  usporaPercent: number | null; peVychMWh: number | null; pePlanMWh: number | null;    // MU!J44, M50, N50
  vydavkyBudova: number | null; poHodnoteZaPeniaze: number | null;                     // B1!M209, M210
  vydavkyOze: number | null; ozePoHodnoteZaPeniaze: number | null;                     // B1!M269, M270
  sekcie: { sekcia: string; riadok: number; bezDph: number | null; vydavok: number | null }[]; // F a H riadku „Spolu“
  hlasky: string[];                                     // neprázdne kontrolné hlášky zošita po prepočte
}

const H1 = 'Rozpočet B1 - Value for Money', MU = 'MU Budova 1', CIS = 'Číselníky';
/** Poradie hárkov v zošite vzoru (Worksheets.Item počíta aj skryté hárky); overí sa po otvorení podľa názvu. */
const INDEX: Record<string, number> = { [H1]: 1, [MU]: 9 };
const POZNAMKA = 'DEMO – hodnoty odhadnuté z verejných údajov ITMS21+, nejde o skutočnú prílohu žiadateľa.';
/** Bunky s kontrolnými hláškami vzoru (vzorce, ktoré pri nesplnení podmienky vypíšu text). */
const HLASKY: [string, string][] = [[H1, 'A17'], [H1, 'D17'], [H1, 'H11'], [H1, 'I13'], [H1, 'O10'], [H1, 'A202'], [H1, 'A262'], [H1, 'D212'], [H1, 'O261'],
  [MU, 'B13'], [MU, 'I13'], [MU, 'J76'], [MU, 'G21'], [MU, 'G22'], [MU, 'G23']];

// Skript pre Windows PowerShell 5.1: len ASCII (súbor bez BOM by inak pokazil diakritiku), údaje idú cez JSON v UTF-8.
const SKRIPT = String.raw`param([string]$Vzor, [string]$Vystup, [string]$Ulohy, [string]$Vysledok)
$ErrorActionPreference = 'Stop'
$u = [IO.File]::ReadAllText($Ulohy, [Text.Encoding]::UTF8) | ConvertFrom-Json
$xl = New-Object -ComObject Excel.Application
$wb = $null
try {
  $xl.Visible = $false; $xl.DisplayAlerts = $false; $xl.ScreenUpdating = $false; $xl.EnableEvents = $false
  $xl.AutomationSecurity = 3
  $wb = $xl.Workbooks.Open($Vzor, 0, $true)
  $xl.Calculation = -4135
  foreach ($w in $u.zapis) {
    $r = $wb.Worksheets.Item([int]$w.s).Range([string]$w.a)
    if ($w.v -is [string]) { $r.Value2 = [string]$w.v } else { $r.Value2 = [double]$w.v }
  }
  foreach ($f in $u.zvyrazni) { $r = $wb.Worksheets.Item([int]$f.s).Range([string]$f.a); $r.Font.Bold = $true; $r.Font.Color = 255 }
  $xl.CalculateFull()
  $harky = @(); foreach ($i in $u.harky) { $harky += [string]$wb.Worksheets.Item([int]$i).Name }
  $bunky = @{}
  foreach ($c in $u.citaj) {
    $r = $wb.Worksheets.Item([int]$c.s).Range([string]$c.a)
    $bunky[[string]$c.s + '!' + [string]$c.a] = @{ v = $r.Value2; t = [string]$r.Text }
  }
  $xl.Calculation = -4105
  $wb.SaveAs($Vystup, 52)
  [IO.File]::WriteAllText($Vysledok, (ConvertTo-Json @{ harky = $harky; bunky = $bunky } -Depth 5 -Compress), (New-Object Text.UTF8Encoding $false))
} finally {
  if ($wb) { $wb.Close($false) }
  $xl.Quit()
  [void][Runtime.InteropServices.Marshal]::ReleaseComObject($xl)
}
`;

const norm = (s: string | undefined) => (s ?? '').replace(/\s+/g, ' ').trim().toLowerCase();

export function vyplnPrilohu8(spec: Priloha8Spec, vystup: string, vzor = VZOR_PRILOHY_8): Priloha8Vysledok {
  if (process.platform !== 'win32') throw new Error('Generátor Prílohy č. 8 potrebuje Windows s MS Excel (COM).');
  const b = xlsxBunky(fs.readFileSync(vzor), true);
  const h1 = b[H1], cis = b[CIS];
  if (!h1 || !b[MU] || !cis) throw new Error('Vzor nemá hárky Rozpočet B1, MU Budova 1 a Číselníky.');
  const zoznam = (stlpec: string, od: number, po: number) => Array.from({ length: po - od + 1 }, (_, i) => cis[`${stlpec}${od + i}`]).filter(Boolean);
  const zCiselnika = (hodnota: string, moznosti: string[], pole: string) => {
    if (!moznosti.includes(hodnota)) throw new Error(`${pole}: „${hodnota}“ nie je v číselníku vzoru (${moznosti.join(' | ')}).`);
    return hodnota;
  };
  const [ANO, NIE] = [cis.A2, cis.A3];
  const anoNie = (x: boolean) => (x ? ANO : NIE);
  const sposoby = zoznam('G', 33, 36);
  if (sposoby.length !== 4) throw new Error('Vzor nemá 4 spôsoby stanovenia výšky výdavku (Číselníky!G33:G36).');

  const zapis: { s: number; a: string; v: string | number }[] = [];
  const z = (harok: string, a: string, v: string | number) => zapis.push({ s: INDEX[harok], a, v });
  const hlasky: string[] = [];
  const bu = spec.budova;
  const dph = spec.sadzbaDph ?? 0.23;

  // Hlavička hárku Rozpočet B1
  z(H1, 'B9', spec.ziadatel); z(H1, 'B10', spec.projekt);
  z(H1, 'B11', anoNie(spec.platcaDph)); z(H1, 'F11', dph);
  if (spec.schvalenyRadou !== undefined) z(H1, 'O9', anoNie(spec.schvalenyRadou));
  z(H1, 'B12', zCiselnika(spec.opatrenia, zoznam('C', 23, 25), 'opatrenia (B12)'));
  z(H1, 'B13', 1);
  z(H1, 'D13', bu.katastralneUzemie); z(H1, 'F13', bu.lv); z(H1, 'G13', bu.supisneCislo);
  z(H1, 'O12', zCiselnika(bu.pravnyVztah, zoznam('G', 14, 17), 'právny vzťah (O12)'));

  // MU Budova 1: kategória, energetické údaje, prevádzka, podmienky oprávnenosti
  z(MU, 'C44', zCiselnika(bu.kategoria, zoznam('G', 3, 11), 'kategória budovy (C44)'));
  const triedy = zoznam('G', 19, 26);
  z(MU, 'F47', zCiselnika(bu.triedaPred, triedy, 'trieda pred (F47)')); z(MU, 'F48', zCiselnika(bu.triedaPo, triedy, 'trieda po (F48)'));
  z(MU, 'F49', bu.guPePredKwhM2); z(MU, 'F50', bu.plochaPredM2); z(MU, 'F51', bu.guPePoKwhM2); z(MU, 'F52', bu.plochaPoM2);
  z(MU, 'F30', bu.prevadzka.hodinDenne); z(MU, 'G30', bu.prevadzka.dniTyzdenne); z(MU, 'H30', bu.prevadzka.tyzdnovRocne);
  // L60 „Bude energia zásobovať všetky budovy?“ (pri jednej budove áno práve vtedy, keď má projekt OZE): „nie“ zníži
  // oprávnené výdavky budovy o 5 p. b. (vzorec N60), ako PPP č. 13 pri projekte bez OZE.
  const predvolene: Partial<Record<string, boolean>> = { L60: /OZE/.test(spec.opatrenia) };
  for (const a of ['H17', 'N17', 'H18', 'N18', 'H60', 'L60'] as const) z(MU, a, anoNie(bu.podmienky?.[a] ?? predvolene[a] ?? true));
  // Bez hospodárskej činnosti: tabuľky SHČ a HČiaS (riadky 32–34, 36–38) nulami, OZE bez dodávky do siete a bez HČ mimo zmiešaného využitia.
  for (const r of [32, 33, 34, 36, 37, 38]) for (const s of ['G', 'J', 'K', 'L']) z(MU, `${s}${r}`, 0);
  z(MU, 'G64', 0); z(MU, 'G65', NIE);
  const oze = /OZE/.test(spec.opatrenia);
  // Vzorec H268 (výdavky OZE) dá 0, ak je prázdna ktorákoľvek z kapacít I75 a I76: pri jednom druhu OZE patrí do druhej 0.
  if (bu.ozeElMW != null || oze) z(MU, 'I75', bu.ozeElMW ?? 0);
  if (bu.ozeTepMW != null || oze) z(MU, 'I76', bu.ozeTepMW ?? 0);
  if (bu.emisieCO2T) { z(MU, 'M51', bu.emisieCO2T.vych); z(MU, 'N51', bu.emisieCO2T.plan); }
  else hlasky.push('Chýba budova.emisieCO2T (MU Budova 1!M51, N51): hárok bez nich nezapočíta výdavky na budovu (M209 = 0).');
  if (bu.ozeVyrobaMWh) { const v = bu.ozeVyrobaMWh; z(MU, 'H77', v.elVych); z(MU, 'I77', v.elPlan); z(MU, 'H78', v.tepVych); z(MU, 'I78', v.tepPlan); }
  else if (oze) hlasky.push('Chýba budova.ozeVyrobaMWh (MU Budova 1!H77, I77, H78, I78): hárok bez nich nezapočíta výdavky na OZE (M269 = 0).');

  // Sekcie rozpočtu: nadpis v stĺpci A, o dva riadky nižšie hlavička „Názov výdavku“, potom riadky položiek po „Spolu …“.
  const zaciatokOze = Number(Object.keys(h1).find((a) => /^A\d+$/.test(a) && /^Podpora využívania OZE/.test(h1[a]))?.slice(1) ?? Infinity);
  const sekcieVzoru = Object.keys(h1).filter((a) => /^A\d+$/.test(a) && h1[`A${Number(a.slice(1)) + 2}`] === 'Názov výdavku').map((a) => Number(a.slice(1)));
  const sekcie: { sekcia: string; riadok: number; sucet: number }[] = [];
  const citaj: [string, string][] = [[MU, 'J44'], [MU, 'M50'], [MU, 'N50'], [H1, 'M209'], [H1, 'M210'], [H1, 'M269'], [H1, 'M270'], ...HLASKY];
  for (const s of spec.sekcie) {
    let riadky = sekcieVzoru.filter((r) => norm(h1[`A${r}`]) === norm(s.sekcia));
    if (s.opatrenie) riadky = riadky.filter((r) => (r >= zaciatokOze) === (s.opatrenie === '2.2.2'));
    if (riadky.length !== 1) throw new Error(`Sekcia „${s.sekcia}“: vo vzore ${riadky.length ? `je ${riadky.length}× (riadky ${riadky.join(', ')}), doplňte opatrenie` : 'neexistuje'}.`);
    const r = riadky[0];
    const polozky: number[] = [];
    for (let i = r + 3; i < r + 15 && !/^spolu/i.test(h1[`A${i}`] ?? ''); i++) polozky.push(i);
    const sucet = r + 3 + polozky.length;
    if (s.polozky.length > polozky.length) throw new Error(`Sekcia „${s.sekcia}“ má vo vzore ${polozky.length} riadky položiek, spec ich má ${s.polozky.length}.`);
    z(H1, `B${r}`, ANO);
    const popisParametra = (h1[`A${r + 1}`] ?? '').trim();
    if (popisParametra && h1[`C${r + 1}`] === undefined) {
      if (s.parameter == null) hlasky.push(`Sekcia „${s.sekcia}“: chýba parameter „${popisParametra}“ (C${r + 1}).`);
      else z(H1, `C${r + 1}`, s.parameter);
    }
    if (/Sadzba DPH/i.test(h1[`E${r + 1}`] ?? '')) z(H1, `G${r + 1}`, dph);
    if (/Identifikujte/i.test(h1[`I${r + 1}`] ?? '')) z(H1, `O${r + 1}`, `KÚ ${bu.katastralneUzemie}, LV ${bu.lv}, súp. č. ${bu.supisneCislo}`);
    s.polozky.forEach((p, i) => {
      const q = polozky[i];
      if (!(p.pocet > 0 && p.jednotkovaCenaBezDph > 0)) throw new Error(`Sekcia „${s.sekcia}“, položka „${p.nazov}“: počet aj cena musia byť kladné.`);
      z(H1, `A${q}`, p.nazov); if (p.skupina) z(H1, `B${q}`, p.skupina);
      z(H1, `C${q}`, p.mj); z(H1, `D${q}`, p.pocet); z(H1, `E${q}`, p.jednotkovaCenaBezDph);
      z(H1, `I${q}`, sposoby[p.sposob - 1] ?? (() => { throw new Error(`Položka „${p.nazov}“: spôsob ${p.sposob} nie je 1 až 4.`); })());
      z(H1, `O${q}`, `${p.opis} (odhad pre demo)`);
      citaj.push([H1, `J${q}`]);
    });
    sekcie.push({ sekcia: s.sekcia, riadok: r, sucet });
    citaj.push([H1, `F${sucet}`], [H1, `H${sucet}`]);
  }
  const poznamka = spec.poznamka ?? POZNAMKA;
  z(H1, 'A4', poznamka); z(MU, 'B4', poznamka);

  // Excel cez PowerShell: úlohy a výsledok v JSON (UTF-8), skript len ASCII.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'priloha8-'));
  const subor = (meno: string) => path.join(tmp, meno);
  const cielova = path.resolve(vystup);
  fs.mkdirSync(path.dirname(cielova), { recursive: true });
  fs.writeFileSync(subor('skript.ps1'), SKRIPT, 'ascii');
  fs.writeFileSync(subor('ulohy.json'), JSON.stringify({
    zapis, zvyrazni: [{ s: INDEX[H1], a: 'A4' }, { s: INDEX[MU], a: 'B4' }], harky: Object.values(INDEX),
    citaj: citaj.map(([h, a]) => ({ s: INDEX[h], a })),
  }));
  let vysledok: { harky: string[]; bunky: Record<string, { v: unknown; t: string }> };
  try {
    execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', subor('skript.ps1'), path.resolve(vzor), cielova, subor('ulohy.json'), subor('vysledok.json')],
      { stdio: ['ignore', 'pipe', 'pipe'], timeout: 240_000 });
    vysledok = JSON.parse(fs.readFileSync(subor('vysledok.json'), 'utf8').replace(/^﻿/, ''));
  } catch (e) {
    const err = e as Error & { stderr?: Buffer };
    throw new Error(`Excel (COM) zlyhal: ${(err.stderr?.toString('utf8').trim() || err.message).slice(0, 600)}`);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  if (vysledok.harky[0] !== H1 || vysledok.harky[1] !== MU) throw new Error(`Poradie hárkov vzoru nesedí: ${vysledok.harky.join(', ')}.`);

  const bunka = (h: string, a: string) => vysledok.bunky[`${INDEX[h]}!${a}`];
  const cislo = (h: string, a: string) => { const x = bunka(h, a); return typeof x?.v === 'number' && !x.t.startsWith('#') ? x.v : null; };
  for (const [h, a] of [...HLASKY, ...citaj.filter(([, a]) => a.startsWith('J'))]) {
    const x = bunka(h, a);
    if (x?.t && !(typeof x.v === 'number' && !x.t.startsWith('#'))) hlasky.push(`${h}!${a}: ${x.t}`);
  }
  const vysledkySekcii = sekcie.map((s) => ({ sekcia: s.sekcia, riadok: s.riadok, bezDph: cislo(H1, `F${s.sucet}`), vydavok: cislo(H1, `H${s.sucet}`) }));
  for (const s of vysledkySekcii) if ((s.bezDph ?? 0) > 0 && !s.vydavok) hlasky.push(`Sekcia „${s.sekcia}“: položky majú ${s.bezDph} EUR bez DPH, ale Celkový výdavok riadku Spolu je 0 (hárok sekciu nezapočítal).`);
  return {
    usporaPercent: cislo(MU, 'J44'), peVychMWh: cislo(MU, 'M50'), pePlanMWh: cislo(MU, 'N50'),
    vydavkyBudova: cislo(H1, 'M209'), poHodnoteZaPeniaze: cislo(H1, 'M210'), vydavkyOze: cislo(H1, 'M269'), ozePoHodnoteZaPeniaze: cislo(H1, 'M270'),
    sekcie: vysledkySekcii, hlasky,
  };
}
