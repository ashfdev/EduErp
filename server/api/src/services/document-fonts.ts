import { readFile } from "node:fs/promises";
import { join } from "node:path";

const FONTS_DIR = join(__dirname, "..", "templates", "fonts");

// Hind Siliguri for text, Noto Sans for Latin digits only. Only weights 500+ are
// shipped, so "normal"/400 text renders at 500; lighter weights look too thin in print.
export const DOCUMENT_FONT_STACK = "'ERP Digits', 'Hind Siliguri', 'Noto Sans Bengali', Arial, sans-serif";

const DIGITS_RANGE = "U+0030-0039";
// Copied from Google Fonts' own @font-face rules for Hind Siliguri's subsets.
const BENGALI_RANGE = "U+0951-0952, U+0964-0965, U+0980-09FE, U+1CD0, U+1CD2, U+1CD5-1CD6, U+1CD8, U+1CE1, U+1CEA, U+1CED, U+1CF2, U+1CF5-1CF7, U+200C-200D, U+20B9, U+25CC, U+A8F1, U+11DF0-11DF1";
const LATIN_RANGE = "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD";

let cachedCss: Promise<string> | null = null;

async function fontFace(family: string, file: string, weight: string, range: string): Promise<string> {
  const base64 = (await readFile(join(FONTS_DIR, file))).toString("base64");
  return `@font-face{font-family:'${family}';font-style:normal;font-weight:${weight};font-display:block;src:url(data:font/woff2;base64,${base64}) format('woff2');unicode-range:${range};}`;
}

async function buildCss(): Promise<string> {
  const faces = [fontFace("ERP Digits", "noto-sans-digits.woff2", "500 700", DIGITS_RANGE)];
  for (const weight of ["500", "600", "700"]) {
    faces.push(fontFace("Hind Siliguri", `hind-siliguri-bengali-${weight}.woff2`, weight, BENGALI_RANGE));
    faces.push(fontFace("Hind Siliguri", `hind-siliguri-latin-${weight}.woff2`, weight, LATIN_RANGE));
  }
  return (await Promise.all(faces)).join("\n");
}

// Embedded as data URLs so PDF rendering never waits on (or fails without) Google Fonts.
export function getDocumentFontCss(): Promise<string> {
  cachedCss ??= buildCss().catch((err: unknown) => {
    cachedCss = null;
    throw err;
  });
  return cachedCss;
}
