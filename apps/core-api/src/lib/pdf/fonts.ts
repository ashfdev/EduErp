import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

let cachedFontBase64: string | null = null;

/**
 * Noto Sans Bengali, embedded as a base64 @font-face so Puppeteer renders Bangla
 * text correctly regardless of what fonts are installed on the host (PRD §15
 * "Noto Sans Bengali embedded in Puppeteer PDF renderer"). Reads whichever
 * bengali-subset 400-weight woff2 the @fontsource package ships, rather than
 * hardcoding a filename that could change between package versions.
 */
export function getNotoSansBengaliBase64(): string {
  if (cachedFontBase64) return cachedFontBase64;

  const require = createRequire(import.meta.url);
  const packageJsonPath = require.resolve('@fontsource/noto-sans-bengali/package.json');
  const filesDir = join(dirname(packageJsonPath), 'files');

  // Every file in this dir is prefixed "noto-sans-bengali-", so matching on
  // the subset requires the dash-delimited segment, not a bare substring
  // check (e.g. "noto-sans-bengali-latin-400-normal.woff2" also contains the
  // substring "bengali" — it's the *package* name, not the *subset*).
  const fileName = readdirSync(filesDir).find((f) => f === 'noto-sans-bengali-bengali-400-normal.woff2');
  if (!fileName) throw new Error('Could not locate noto-sans-bengali-bengali-400-normal.woff2 in @fontsource/noto-sans-bengali — package layout may have changed');

  const buffer = readFileSync(join(filesDir, fileName));
  cachedFontBase64 = buffer.toString('base64');
  return cachedFontBase64;
}

export function fontFaceCss(): string {
  const base64 = getNotoSansBengaliBase64();
  return `
    @font-face {
      font-family: 'Noto Sans Bengali';
      src: url(data:font/woff2;base64,${base64}) format('woff2');
      font-weight: 400;
      font-style: normal;
    }
  `;
}
