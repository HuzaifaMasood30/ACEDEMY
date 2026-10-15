import { chromium } from '@playwright/test';

const B = 'http://127.0.0.1:12000';
const browser = await chromium.launch();

const shots = [
  ['home-desktop', '/', 1440, 1100, false, 'light'],
  ['home-full', '/', 1440, 3600, true, 'light'],
  ['login-desktop', '/login', 1440, 900, false, 'light'],
  ['home-mobile', '/', 390, 1400, true, 'light'],
  ['courses-desktop', '/courses', 1440, 1200, false, 'light'],
  ['home-dark', '/', 1440, 1100, false, 'dark'],
  ['login-dark', '/login', 1440, 900, false, 'dark'],
];

for (const [name, path, w, h, full, scheme] of shots) {
  const page = await browser.newPage({
    viewport: { width: w, height: h },
    colorScheme: scheme === 'dark' ? 'dark' : 'light',
  });
  await page.goto(B + path, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForLoadState('load').catch(() => {});
  await page.waitForTimeout(900);
  // Scroll through so IntersectionObserver reveals fire, then return to top.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(1200);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(600);
  await page.screenshot({ path: `.agent_tmp/shots/${name}.png`, fullPage: full });
  console.log('shot:', name);
  await page.close();
}

await browser.close();
