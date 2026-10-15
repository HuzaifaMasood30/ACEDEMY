import { chromium } from '@playwright/test';

const B = process.env.BASE ?? 'http://127.0.0.1:12000';
const PW = 'Academy@123';

const ACCOUNTS = [
  ['Administrator (owner)', 'owner@wisdom-academy.example', '/admin'],
  ['Administrator (registrar)', 'registrar@wisdom-academy.example', '/admin'],
  ['Teacher', 'ayesha.siddiqui@wisdom-academy.example', '/teacher'],
  ['Teacher', 'fatima.noor@wisdom-academy.example', '/teacher'],
  ['Student', 'hamza.hashmi1@student.wisdom-academy.example', '/student'],
  ['Parent', 'tariq.mahmood1@parent.wisdom-academy.example', '/parent'],
];

const browser = await chromium.launch();
let fails = 0;

for (const [label, email, expected] of ACCOUNTS) {
  // Fresh context each time: no leftover session, which is what a real
  // first-time visitor has.
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(700);
  await page.locator('input[type="email"], input[name="email"]').first().fill(email);
  await page.locator('input[type="password"]').first().fill(PW);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForTimeout(3000);

  const path = new URL(page.url()).pathname;
  const text = ((await page.textContent('body')) ?? '').replace(/\s+/g, ' ');
  const ok = path === expected;
  if (!ok) fails += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label.padEnd(24)} ${email}`);
  console.log(`      landed ${path} (expected ${expected}) | page ${text.length} chars`);
  await ctx.close();
}

await browser.close();
console.log(fails === 0 ? '\nAll documented accounts sign in.' : `\n${fails} FAILED.`);
process.exit(fails === 0 ? 0 : 1);
