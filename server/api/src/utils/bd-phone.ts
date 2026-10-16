const BD_MOBILE = /^01\d{9}$/;

// Accepts what people and spreadsheets actually produce: Bangla digits, spaces,
// dashes, a +88/88 country code, and Excel's dropped leading zero (1712345678).
export function normalizeBdPhone(raw: string | number | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  let digits = String(raw)
    .replace(/[০-৯]/g, (d) => String(d.charCodeAt(0) - 0x09e6))
    .replace(/[\s\-().]/g, "")
    .replace(/^\+/, "");
  if (!/^\d+$/.test(digits)) return null;
  if (digits.startsWith("880") && digits.length === 13) digits = digits.slice(2);
  if (digits.length === 10 && digits.startsWith("1")) digits = `0${digits}`;
  return BD_MOBILE.test(digits) ? digits : null;
}
