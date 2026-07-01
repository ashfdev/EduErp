import { getBrowser } from './browser.js';

export async function renderHtmlToPdf(html: string): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    // All assets (font, QR image) are embedded as data URIs, so 'load' is sufficient —
    // there's no external network fetch to wait on.
    await page.setContent(html, { waitUntil: 'load' });
    const pdf = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '12mm', bottom: '12mm', left: '12mm', right: '12mm' } });
    return Buffer.from(pdf);
  } finally {
    await page.close();
  }
}
