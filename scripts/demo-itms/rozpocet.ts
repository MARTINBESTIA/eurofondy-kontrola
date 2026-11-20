import fs from 'node:fs';
import { vyplnPrilohu8 } from '../lib/priloha8.ts';

const [vstup, vystup] = process.argv.slice(2);
const kontroly = vyplnPrilohu8(JSON.parse(fs.readFileSync(vstup, 'utf8')), vystup);
console.log(JSON.stringify(kontroly, null, 2));
if (!(kontroly.poHodnoteZaPeniaze && kontroly.poHodnoteZaPeniaze > 0 &&
      kontroly.ozePoHodnoteZaPeniaze && kontroly.ozePoHodnoteZaPeniaze > 0)) {
  throw new Error('Modelový spis obsahuje obnovu budovy aj OZE. Obe časti rozpočtu musia byť po prepočte kladné.');
}
