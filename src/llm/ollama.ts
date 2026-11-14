// Klient lokálneho modelu (Ollama). Model nikdy nerozhoduje sám: hľadá dôkaz v texte a vracia štruktúrovaný JSON.
// Poznámky k 8 GB VRAM: kontext treba nastaviť explicitne (inak Ollama potichu oreže na 4096),
// Qwen potrebuje vypnuté uvažovanie (inak prázdny obsah) a model treba občas vyložiť, lebo cache promptov rastie.

const URL = process.env.OLLAMA_URL ?? 'http://127.0.0.1:11434';
export const MODEL = process.env.KONTROLA_MODEL ?? 'qwen3.5:9b';

export interface OdpovedModelu { stav: 'splnene' | 'nesplnene' | 'neda_sa_urcit'; dokaz: string; zdovodnenie: string }

const SCHEMA = {
  type: 'object',
  properties: {
    zdovodnenie: { type: 'string' },
    dokaz: { type: 'string' },
    stav: { type: 'string', enum: ['splnene', 'nesplnene', 'neda_sa_urcit'] },
  },
  required: ['zdovodnenie', 'dokaz', 'stav'],
};

const SYSTEM = `Si kontrolór žiadostí o eurofondy. Dostaneš jednu podmienku a text dokumentu.
Postup: nájdi v texte pasáž, ktorá podmienku potvrdzuje alebo vyvracia, a rozhodni.
- "splnene": text podmienku jasne potvrdzuje.
- "nesplnene": text podmienku jasne vyvracia, alebo v ňom chýba povinná náležitosť.
- "neda_sa_urcit": text o veci nehovorí alebo je nejednoznačný. Nehádaj.
Pole "dokaz" musí byť doslovný úryvok z textu dokumentu (najviac 200 znakov), nič nepridávaj ani neupravuj. Ak dôkaz nie je, nechaj ho prázdny.
Pole "zdovodnenie" je jedna až dve vety po slovensky. Odpovedz iba JSON.`;

let volani = 0;

export async function dostupny(): Promise<boolean> {
  try { return (await fetch(`${URL}/api/version`, { signal: AbortSignal.timeout(2000) })).ok; } catch { return false; }
}

export async function vyloz(model = MODEL): Promise<void> {
  try { await fetch(`${URL}/api/generate`, { method: 'POST', body: JSON.stringify({ model, keep_alive: 0 }) }); } catch { /* nevadí */ }
}

export async function posudText(otazka: string, text: string, kontext = '', model = MODEL): Promise<OdpovedModelu & { ms: number }> {
  if (++volani % 40 === 0) await vyloz(model);
  const t0 = Date.now();
  const r = await fetch(`${URL}/api/chat`, {
    method: 'POST',
    signal: AbortSignal.timeout(180_000),
    body: JSON.stringify({
      model, stream: false, think: false, format: SCHEMA, keep_alive: '10m',
      // num_gpu 99 = celý model na grafickú kartu; pri automatickom rozdelení zostane časť na CPU a beh je niekoľkonásobne pomalší
      options: { temperature: 0, num_ctx: 8192, num_predict: 400, num_gpu: Number(process.env.KONTROLA_NUM_GPU ?? 99) },
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: `PODMIENKA:\n${otazka}\n${kontext ? `\nÚDAJE ZO ŽIADOSTI:\n${kontext}\n` : ''}\nTEXT DOKUMENTU:\n"""\n${text.slice(0, 12000)}\n"""` },
      ],
    }),
  });
  if (!r.ok) throw new Error(`Ollama HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  const obsah = (j.message?.content ?? '').trim();
  let o: OdpovedModelu;
  try { o = JSON.parse(obsah); } catch { o = { stav: 'neda_sa_urcit', dokaz: '', zdovodnenie: 'Model nevrátil platný JSON.' }; }
  if (!['splnene', 'nesplnene', 'neda_sa_urcit'].includes(o.stav)) o.stav = 'neda_sa_urcit';
  return { ...o, dokaz: String(o.dokaz ?? ''), zdovodnenie: String(o.zdovodnenie ?? ''), ms: Date.now() - t0 };
}

/** Je úryvok naozaj v texte? Porovnanie bez ohľadu na medzery, úvodzovky a veľkosť písmen. */
export function dokazJeVTexte(dokaz: string, text: string): boolean {
  const n = (s: string) => s.toLowerCase().replace(/[\s"„“”'’‚‘.,;:()–-]+/g, '');
  const t = n(text);
  // Model často spojí dva úryvky výpustkou („A... B“). Každý kus musí byť v texte doslovne, inak dôkaz neplatí.
  const kusy = dokaz.split(/\.{3,}|…|\[\s*\.{3}\s*\]/).map(n).filter((k) => k.length > 0);
  return kusy.some((k) => k.length >= 12) && kusy.every((k) => (k.length < 12 ? true : t.includes(k)));
}
