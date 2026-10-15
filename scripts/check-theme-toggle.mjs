import { chromium } from '@playwright/test';

const B = 'http://127.0.0.1:12000';
const browser = await chromium.launch();

for (const path of ['/', '/login']) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(B + path, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);

  const toggle = page.locator('button[aria-label^="Theme:"]').first();
  const count = await toggle.count();
  if (count === 0) {
    console.log(`FAIL ${path}: no theme toggle rendered after hydration`);
    await page.close();
    continue;
  }

  const label = await toggle.getAttribute('aria-label');
  const before = await page.evaluate(() => document.documentElement.className);

  // Cycle System -> Light -> Dark so the resolved theme must change.
  const labels = [label];
  let sawDark = false;
  for (let i = 0; i < 2; i += 1) {
    await toggle.click();
    await page.waitForTimeout(450);
    labels.push(await toggle.getAttribute('aria-label'));
    const cls = await page.evaluate(() => document.documentElement.className);
    if (cls.includes('dark')) sawDark = true;
  }

  const after = await page.evaluate(() => document.documentElement.className);
  console.log(
    `${sawDark ? 'PASS' : 'FAIL'} ${path}: html class "${before}" -> "${after}" ${sawDark ? '(reached dark)' : '(never reached dark)'}`,
  );
  console.log(`      labels: ${labels.join(' | ')}`);

  await page.close();
}

await browser.close();
