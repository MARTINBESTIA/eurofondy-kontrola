// Kontrola zmien výzvy v ITMS21+ (npm run zmeny). Porovná živý detail výzvy so stavom, ktorý naposledy posúdil človek
// (packs/<výzva>/itms/stav-vyzvy.json), a výsledok zapíše do data/odvodene/<výzva>/zmeny-vyzvy.json, odkiaľ ho berie
// posudok (body VER-ITMS a VER-KONTROLA). Z ITMS21+ sa iba číta verejné API.
//   npm run zmeny                                  všetky výzvy so základom
//   npm run zmeny -- --vyzva KOD                   jedna výzva
//   npm run zmeny -- --offline                     bez siete, z posledného uloženého detailu
//   npm run zmeny -- --prevzat --poznamka "…"      človek zmeny posúdil: aktuálny stav sa stane novým základom
// Návratový kód: 0 = pravidlá zodpovedajú ITMS21+, 2 = neposúdené zmeny, 1 = chyba.
import fs from 'node:fs';
import path from 'node:path';
import { verzieBalika } from '../src/core/posud.ts';
import { prevezmiStav, skontrolujZmeny } from '../src/core/zmeny.ts';

const KOREN = path.join(import.meta.dirname, '..');
const arg = (meno: string) => { const i = process.argv.indexOf(meno); return i > 0 ? process.argv[i + 1] ?? '' : null; };
const offline = process.argv.includes('--offline');
const prevzat = process.argv.includes('--prevzat');
const poznamka = arg('--poznamka');
const vyzvy = arg('--vyzva') ? [arg('--vyzva')!] : fs.readdirSync(path.join(KOREN, 'packs'))
  .filter((d) => fs.existsSync(path.join(KOREN, 'packs', d, 'itms', 'stav-vyzvy.json')));
if (!vyzvy.length) { console.log('Žiadna výzva nemá základ zmien (packs/<výzva>/itms/stav-vyzvy.json).'); process.exit(0); }
if (prevzat && poznamka == null) { console.error('--prevzat potrebuje --poznamka "čo ste posúdili a prečo pravidlá stačia"'); process.exit(1); }

let neposudene = 0;
for (const vyzva of vyzvy) {
  const baliky = verzieBalika(vyzva, 'zonfp');
  const { kontrola, teraz } = await skontrolujZmeny(vyzva, baliky, { offline });
  console.log(`${vyzva}: ${kontrola.zdroj === 'itms' ? 'živé ITMS21+' : `uložený detail z ${kontrola.stiahnute.slice(0, 10)}`}, základ z ${kontrola.zakladZ}`);
  console.log(`  verzie výzvy: ${teraz.verzie.map((v) => `${v.cislo} (${v.datum ?? 'bez dátumu'})`).join(', ')}`);
  console.log(`  pokrytie balíkmi: ${baliky.map((b) => `${b.verziaBalika?.id ?? b.verzia} → ${(b.verziaBalika?.itmsVerzie ?? []).join(', ') || '–'}`).join('; ')}`);
  if (!kontrola.zmeny.length) { console.log('  ✓ bez zmien: pravidlá zodpovedajú stavu výzvy v ITMS21+'); continue; }
  for (const z of kontrola.zmeny) console.log(`  ! [${z.druh}] ${z.popis}`);
  if (prevzat) {
    prevezmiStav(vyzva, teraz, baliky, poznamka!, kontrola);
    console.log(`  ✓ prevzaté ako nový základ (${new Date().toLocaleDateString('sv-SE')}): ${poznamka}`);
  } else {
    neposudene += kontrola.zmeny.length;
    console.log(`  → ${kontrola.zmeny.length} neposúdených zmien. Posudky dostanú bod VER-ITMS (na preverenie), kým ich človek neposúdi:`);
    console.log('    1. pozrite zmenu v ITMS21+ (dokumenty, verzia výzvy) a upravte balík pravidiel (packs/<výzva>/…), nová verzia výzvy patrí do itmsVerzie;');
    console.log('    2. npm run zmeny -- --prevzat --poznamka "…"');
  }
}
process.exit(neposudene ? 2 : 0);
