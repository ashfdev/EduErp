import puppeteer, { type Browser } from 'puppeteer';

let cachedBrowser: Browser | null = null;

export async function getBrowser(): Promise<Browser> {
  if (cachedBrowser?.connected) return cachedBrowser;
  cachedBrowser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  return cachedBrowser;
}

export async function closeBrowser(): Promise<void> {
  if (cachedBrowser) {
    await cachedBrowser.close();
    cachedBrowser = null;
  }
}
