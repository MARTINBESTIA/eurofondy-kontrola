import type { Nalez, Ziadost } from '../../core/typy.ts';
import { normalizujItms21 } from './normalizuj.ts';

type Cesta = (string | number)[];
type Odkaz = { miesto: string; citat: string; riadokOd: number; riadokDo: number };
type Rozsah = { od: number; po: number; hodnotaOd: number };
const kluc = (cesta: Cesta) => JSON.stringify(cesta);

/** JSON.parse overí syntax. Druhý prechod uchová polohu kľúčov a hodnôt presne v prijatom texte. */
function indexJson(text: string) {
  const data = JSON.parse(text);
  const rozsahy = new Map<string, Rozsah>();
  const tokeny = text.matchAll(/"(?:\\[\s\S]|[^"\\])*"|[\[\]{},:]|[^\s\[\]{},:"]+/g);
  const dalsi = () => tokeny.next().value!;
  function prejdi(cesta: Cesta, token: RegExpExecArray, od = token.index) {
    const hodnotaOd = token.index;
    if (token[0] === '{' || token[0] === '[') {
      const objekt = token[0] === '{';
      token = dalsi();
      let i = 0;
      while (token[0] !== (objekt ? '}' : ']')) {
        if (objekt) {
          const meno = JSON.parse(token[0]);
          const zaciatok = token.index;
          dalsi(); // dvojbodka
          prejdi([...cesta, meno], dalsi(), zaciatok);
        } else {
          prejdi([...cesta, i++], token);
        }
        token = dalsi();
        if (token[0] === ',') token = dalsi();
      }
    }
    const k = kluc(cesta);
    if (rozsahy.has(k)) throw new Error('Nejednoznačný duplicitný kľúč vo formulári.');
    rozsahy.set(k, { od, hodnotaOd, po: token.index + token[0].length });
  }
  prejdi([], dalsi());
  const konce = [...text.matchAll(/\r\n|\r|\n/g)].map(m => m.index + m[0].length);
  function riadok(i: number) {
    let od = 0, po = konce.length;
    while (od < po) {
      const stred = Math.floor((od + po) / 2);
      if (konce[stred] <= i) od = stred + 1;
      else po = stred;
    }
    return od + 1;
  }
  function odkaz(cesta: Cesta, od: number, po: number): Odkaz {
    const a = riadok(od), b = riadok(po - 1);
    const pole = cesta.map(k => typeof k === 'number' ? `[${k}]` : `.${k}`).join('');
    return { miesto: `$${pole} · ${a === b ? `riadok ${a}` : `riadky ${a}–${b}`}`, citat: text.slice(od, po), riadokOd: a, riadokDo: b };
  }
  return { data, rozsahy, odkaz };
}

/** Pripraví index raz pre celý posudok. Bez jednoznačného pôvodu všetkých vstupov nevráti čiastočný dôkaz. */
export function pripravDokladyFormulara(text: string, z: Ziadost): (n: Nalez) => Odkaz[] {
  let index: ReturnType<typeof indexJson>;
  let formaItms: boolean;
  let povodne: Ziadost;
  try {
    index = indexJson(text);
    if (!index.data?.ziadatel || index.data.kodItms) return () => [];
    formaItms = !!index.data.polozkyRozpoctu || typeof index.data.ziadatel.pravnaForma === 'object';
    povodne = formaItms ? normalizujItms21(index.data) : index.data;
  } catch { return () => []; }

  const { data, rozsahy, odkaz } = index;
  // Rovnako ako normalizácia registruje výstupové ukazovatele pred výsledkovými.
  const pocetVystupov = data.ukazovatelZiadanyVystupu?.length ?? 0;
  return (n) => {
    const citacie = new Map<string, Odkaz>();
    let uplne = true;
    function pridaj(cesta: Cesta) {
      const r = rozsahy.get(kluc(cesta));
      if (!r || text.slice(r.hodnotaOd, r.po) === 'null') { uplne = false; return; }
      citacie.set(kluc(cesta), odkaz(cesta, r.od, r.po));
    }
    function ukazovatel(kod: string, ajVychodisko: boolean) {
      const i = z.ukazovatele.findIndex(u => u.kod === kod);
      const u = povodne.ukazovatele?.[i];
      if (!u || u.kod !== kod || u.ciel == null || u.ciel !== z.ukazovatele[i].ciel ||
          (ajVychodisko && (u.vychodisko == null || u.vychodisko !== z.ukazovatele[i].vychodisko))) { uplne = false; return; }
      const cesta = formaItms
        ? (i < pocetVystupov ? ['ukazovatelZiadanyVystupu', i] : ['ukazovatelZiadanyVysledku', i - pocetVystupov])
        : ['ukazovatele', i];
      pridaj([...cesta, ...(formaItms ? ['ukazovatelProjektovySC', 'ukazovatelProjektovy', 'kod'] : ['kod'])]);
      if (ajVychodisko) pridaj([...cesta, formaItms ? 'vychodiskovaHodnotaSpolu' : 'vychodisko']);
      pridaj([...cesta, formaItms ? 'cielovaHodnotaSpolu' : 'ciel']);
    }
    function aktivita(i: number) {
      const a = z.aktivity[i], p = povodne.aktivity?.[i];
      if (!p || p.hlavna !== a.hlavna || p.opatrenie !== a.opatrenie || !a.opatrenie ||
          (formaItms && !p.nazov?.trim())) { uplne = false; return; }
      const cesta = ['aktivity', i];
      pridaj([...cesta, formaItms ? 'nazov' : 'hlavna']);
      pridaj([...cesta, ...(formaItms ? ['typAkcieProgramu', 'opatrenie', 'kod'] : ['opatrenie'])]);
    }
    function vydavok(i: number) {
      const r = z.rozpocet[i], p = povodne.rozpocet?.[i];
      if (!p || p.hlavna !== r.hlavna || p.opatrenie !== r.opatrenie || p.suma !== r.suma ||
          !Number.isFinite(p.suma) || (formaItms && !p.aktivita?.trim())) { uplne = false; return; }
      const cesta = [formaItms ? 'polozkyRozpoctu' : 'rozpocet', i];
      pridaj([...cesta, formaItms ? 'sumaOpravnenehoVydavku' : 'suma']);
      pridaj([...cesta, ...(formaItms ? ['aktivita', 'nazov'] : ['hlavna'])]);
      pridaj([...cesta, ...(formaItms ? ['aktivita', 'typAkcieProgramu', 'opatrenie', 'kod'] : ['opatrenie'])]);
    }
    function hlavnaAktivitaAleboVydavok(opatrenie: string) {
      const i = z.aktivity.findIndex(a => a.hlavna && a.opatrenie === opatrenie);
      if (i >= 0) { aktivita(i); return; }
      const j = z.rozpocet.findIndex(p => p.hlavna && p.opatrenie === opatrenie && p.suma > 0);
      if (j >= 0) vydavok(j);
      else uplne = false;
    }
    function vydavky(opatrenie: string) {
      if (povodne.rozpocet?.length !== z.rozpocet.length) { uplne = false; return; }
      if (povodne.rozpocet.some((p, i) => p.hlavna !== z.rozpocet[i].hlavna || p.opatrenie !== z.rozpocet[i].opatrenie)) {
        uplne = false; return;
      }
      const riadky = z.rozpocet.map((r, i) => ({ r, i })).filter(({ r }) => r.hlavna && r.opatrenie === opatrenie);
      if (!riadky.some(({ r }) => r.suma > 0)) { uplne = false; return; }
      for (const { i } of riadky) vydavok(i);
    }
    switch (n.pravidlo) {
      case 'P08':
        if (!z.nazov || !z.ziadatel.nazov || povodne.nazov !== z.nazov || povodne.ziadatel.nazov !== z.ziadatel.nazov) return [];
        pridaj(['ziadatel', 'nazov']);
        pridaj(['nazov']);
        break;
      case 'P08b':
        // Súčty opatrení, výdavky mimo nich aj kontrola celkovej sumy idú zo všetkých položiek, nielen z hlavných aktivít.
        if (!z.rozpocet.length || povodne.rozpocet?.length !== z.rozpocet.length || Number(povodne.sumaZiadanaCelkova) !== z.sumaZiadanaCelkova) return [];
        z.rozpocet.forEach((_, i) => vydavok(i));
        pridaj(['sumaZiadanaCelkova']);
        break;
      case 'D01':
        if (String(povodne.ziadatel.pravnaFormaKod) !== z.ziadatel.pravnaFormaKod) return [];
        pridaj(['ziadatel', ...(formaItms ? ['pravnaForma', 'kodZdroj'] : ['pravnaFormaKod'])]);
        if (povodne.ziadatel.pravnaForma) pridaj(['ziadatel', ...(formaItms ? ['pravnaForma', 'nazovSk'] : ['pravnaForma'])]);
        break;
      case 'D07a':
        if (povodne.aktivity?.length !== z.aktivity.length) return [];
        if (povodne.aktivity.some((p, i) => p.hlavna !== z.aktivity[i].hlavna)) return [];
        z.aktivity.forEach((a, i) => { if (a.hlavna) aktivita(i); });
        break;
      case 'D07b':
        ukazovatel('PSKPRCR26b', true);
        hlavnaAktivitaAleboVydavok('2.1.2');
        break;
      case 'D07c':
        ukazovatel('PSKPRCR26b', true);
        vydavky('2.1.2');
        break;
      case 'D07d':
        ukazovatel('PSKPRCO22a', false);
        ukazovatel('PSKPRCO22b', false);
        vydavky('2.2.2');
        break;
      case 'D09':
        if (povodne.miesta?.length !== z.miesta.length) return [];
        z.miesta.forEach((m, i) => {
          if (povodne.miesta[i].lokalita !== m.lokalita) uplne = false;
          pridaj([formaItms ? 'miestoRealizacieFull' : 'miesta', i, 'lokalita']);
          const mesto = m.obec ? ['obec', 'nuts5'] : m.okres ? ['okres', 'nuts4'] : m.kraj ? ['kraj', 'nuts3'] : null;
          if (mesto) pridaj([formaItms ? 'miestoRealizacieFull' : 'miesta', i, ...(formaItms ? [mesto[1], 'nazovSk'] : [mesto[0]])]);
        });
        break;
      case 'D12':
        if (Number(povodne.sumaZiadanaNFP) !== z.sumaZiadanaNFP) return [];
        pridaj(['sumaZiadanaNFP']);
        break;
      case 'D13': {
        ukazovatel('PSKPRCR26b', true);
        hlavnaAktivitaAleboVydavok('2.1.2');
        const oze = z.aktivity.findIndex(a => a.hlavna && a.opatrenie === '2.2.2');
        if (oze >= 0) aktivita(oze);
        else {
          // Zníženie pre neprítomnú aktivitu OZE vyžaduje úplný zoznam, vrátane explicitného [].
          if (povodne.aktivity?.length !== z.aktivity.length) return [];
          if (!z.aktivity.length) pridaj(['aktivity']);
          else z.aktivity.forEach((_, i) => aktivita(i));
        }
        break;
      }
      case 'D14':
        if (povodne.datumPredlozenia !== z.datumPredlozenia || povodne.koniecHlavnychAktivit !== z.koniecHlavnychAktivit) return [];
        pridaj(['datumPredlozenia']);
        pridaj([formaItms ? 'datumZiadanyKoncaHlavnychAktivit' : 'koniecHlavnychAktivit']);
        break;
      case 'L07': {
        // Tri bodky môže pridať model. Každá citovaná časť musí existovať v tom istom poli a poradí.
        const casti = n.dokaz?.split(/\[\s*(?:\.{3}|…)\s*\]|\.{3,}|…/).map(s => s.trim()).filter(Boolean);
        if (!casti?.some(s => s.length >= 12)) return [];
        for (const pole of ['popis', 'ucel'] as const) {
          const r = rozsahy.get(kluc([pole]));
          if (!r || typeof data[pole] !== 'string' || povodne[pole] !== z[pole]) continue;
          const useky: { od: number; po: number }[] = [];
          for (const cast of casti) {
            const vzor = new RegExp(cast.split(/\s+/).map(s => RegExp.escape(s)).join('\\s+'), 'giu');
            vzor.lastIndex = useky.at(-1)?.po ?? 0;
            const m = vzor.exec(z[pole]);
            if (!m) break;
            useky.push({ od: m.index, po: vzor.lastIndex });
          }
          if (useky.length !== casti.length) continue;
          // Pri transformovanom HTML zachováme celé pole. Rovnaké slová môžu byť aj v neviditeľnom atribúte.
          if (data[pole] !== z[pole]) return [odkaz([pole], r.od, r.po)];
          // Priraď začiatky dekódovaných UTF-16 jednotiek k pôvodným offsetom (\\n, \\", \\uXXXX).
          const offsety = [r.hodnotaOd + 1];
          for (let i = r.hodnotaOd + 1; i < r.po - 1;) {
            i += text[i] !== '\\' ? 1 : text[i + 1] === 'u' ? 6 : 2;
            offsety.push(i);
          }
          return useky.map(u => odkaz([pole], offsety[u.od], offsety[u.po]));
        }
        return [];
      }
      default: return [];
    }
    return uplne ? [...citacie.values()] : [];
  };
}

export function dokladyFormulara(text: string, z: Ziadost, n: Nalez): Odkaz[] {
  return pripravDokladyFormulara(text, z)(n);
}
