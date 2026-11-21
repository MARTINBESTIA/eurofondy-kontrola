// Presnosť citácií nezávisí od modelu, dostupnosti registra ani od koncov riadkov v checkoute.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import type { Nalez } from '../src/core/typy.ts';
import { pripravDokladyFormulara } from '../src/moduly/zonfp/doklady-formular.ts';
import { normalizujItms21 } from '../src/moduly/zonfp/normalizuj.ts';

const surovina = fs.readFileSync(new URL('../demo/itms/subory/Formular_NFP401201G856.json', import.meta.url), 'utf8');
const data = JSON.parse(surovina);
const z = normalizujItms21(data);
const nalez = (pravidlo: string, dokaz?: string): Nalez => ({
  pravidlo, dokaz, druh: 'data', stav: 'splnene', nazov: '', zdovodnenie: '', ppp: null,
  citacia: { dokument: '', cast: '', znenie: '' },
});
const doklad = nalez('L07', 'Hlavným zámerom a cieľom projektu je znížiť energetickú náročnosť objektu obecného úradu v obci Chorvátsky Grob...');
for (const text of [surovina.replace(/\r?\n/g, '\r\n'), JSON.stringify(data), JSON.stringify(z, null, 2)]) {
  const najdi = pripravDokladyFormulara(text, z);
  const riadky = text.split(/\r\n|\r|\n/);
  for (const id of ['V01', 'F01', 'D01', 'D07a', 'D07b', 'D07c', 'D07d', 'D09', 'D12', 'D13', 'D14', 'P08', 'P08b', 'L07']) {
    const refs = najdi(id === 'L07' ? doklad : nalez(id));
    assert(refs.length, id);
    for (const r of refs) {
      const usek = riadky.slice(r.riadokOd - 1, r.riadokDo).join('\n');
      assert(usek.includes(r.citat.replace(/\r\n|\r/g, '\n')), r.miesto);
    }
  }
  assert.equal(najdi(doklad)[0].citat, doklad.dokaz!.slice(0, -3));
  assert.deepEqual(najdi(nalez('L07', 'úplne vymyslená veta o materskej škole')), []);
  assert.deepEqual(najdi(nalez('L07', 'obecného úradu ... tento následný úryvok v žiadosti nie je')), []);
  assert.equal(najdi(nalez('D07c')).filter(r => /\.(sumaOpravnenehoVydavku|suma) ·/.test(r.miesto)).length, 7);
  assert.equal(najdi(nalez('D07d')).filter(r => /\.(sumaOpravnenehoVydavku|suma) ·/.test(r.miesto)).length, 2);
  assert.equal(najdi(nalez('P08b')).filter(r => /\.(sumaOpravnenehoVydavku|suma) ·/.test(r.miesto)).length, 9);
  assert(najdi(nalez('P08b')).some(r => r.miesto.startsWith('$.sumaZiadanaCelkova ')));
}

const duplicitne = surovina.replace('"sumaZiadanaNFP":', '"sumaZiadanaNFP": 11, "sumaZiadanaNFP":');
assert.deepEqual(pripravDokladyFormulara(duplicitne, z)(nalez('D12')), []);
assert.deepEqual(pripravDokladyFormulara('{"kodItms":"NFP401201G856"}', z)(nalez('D01')), []);
const bezPoli = { ...z, datumPredlozenia: null, rozpocet: [], ukazovatele: z.ukazovatele.filter(u => u.kod !== 'PSKPRCO22b') };
const neuplny = pripravDokladyFormulara(JSON.stringify(bezPoli), bezPoli);
for (const id of ['D07c', 'D07d', 'D14', 'P08b']) assert.deepEqual(neuplny(nalez(id)), [], id);

// D07d pri jednom druhu OZE: neuvedený ukazovateľ (ráta sa 0 MW) doloží úplný zoznam kódov, v ktorom naozaj nie je.
const kodB = (u: any) => u.ukazovatelProjektovySC?.ukazovatelProjektovy?.kod;
const bezB = { ...data, ukazovatelZiadanyVystupu: data.ukazovatelZiadanyVystupu.filter((u: any) => kodB(u) !== 'PSKPRCO22b') };
const zBezB = normalizujItms21(bezB);
const interny = { ...z, ukazovatele: z.ukazovatele.filter(u => u.kod !== 'PSKPRCO22b') };
for (const [text, zz] of [[JSON.stringify(bezB, null, 2), zBezB], [JSON.stringify(interny, null, 2), interny]] as const) {
  const refs = pripravDokladyFormulara(text, zz)(nalez('D07d'));
  const riadky = text.split('\n');
  assert(refs.length, 'D07d s jedným ukazovateľom OZE');
  assert.equal(refs.filter(r => /\.kod ·/.test(r.miesto) && /ukazovatel/.test(r.miesto)).length, zz.ukazovatele.length);
  assert(!refs.some(r => r.citat.includes('PSKPRCO22b')));
  for (const r of refs) assert(riadky.slice(r.riadokOd - 1, r.riadokDo).join('\n').includes(r.citat), r.miesto);
}
// Hodnotu, ktorú doplnil kontrolór, ani ukazovateľ, ktorý z podania odstránil, zoznam formulára nedoloží.
const doplneny = { ...zBezB, ukazovatele: [...zBezB.ukazovatele, { kod: 'PSKPRCO22b', nazov: '', typ: 'vystup' as const, jednotka: 'MW', vychodisko: null, ciel: 0.02 }] };
assert.deepEqual(pripravDokladyFormulara(JSON.stringify(bezB), doplneny)(nalez('D07d')), []);
assert.deepEqual(pripravDokladyFormulara(surovina, { ...z, ukazovatele: z.ukazovatele.filter(u => u.kod !== 'PSKPRCO22b') })(nalez('D07d')), []);
const popis = { ...data, popis: '<p title="Úryvok iba z HTML atribútu">Energetická obnova <b>obecného úradu</b>.</p>' };
const sHtml = pripravDokladyFormulara(JSON.stringify(popis), normalizujItms21(popis));
assert.deepEqual(sHtml(nalez('L07', 'Úryvok iba z HTML atribútu')), []);
assert(sHtml(nalez('L07', 'Energetická obnova obecného úradu.'))[0].citat.includes('<b>obecného úradu</b>'));
const sEscapom = JSON.stringify({ ...z, popis: 'Iný text.\nObnova budovy obecného úradu.' }).replace('Obnova budovy', '\\u004fbnova budovy');
const esc = pripravDokladyFormulara(sEscapom, JSON.parse(sEscapom))(nalez('L07', 'obnova budovy obecného úradu'));
assert.equal(esc[0].citat, '\\u004fbnova budovy obecného úradu');
console.log('Doklady formulára: oba formáty, všetky výpočty, presné riadky, rozpočtové vstupy a hraničné prípady prešli.');
