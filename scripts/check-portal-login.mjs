import { chromium } from '@playwright/test';

const B = process.env.BASE ?? 'http://127.0.0.1:12000';
const PASSWORD = process.env.SEED_DEFAULT_PASSWORD ?? 'Academy@123';

const accounts = [
  ['ADMIN', 'owner@wisdom-academy.example', '/admin'],
  ['TEACHER', 'ayesha.siddiqui@wisdom-academy.example', '/teacher'],
  ['STUDENT', 'hamza.hashmi1@student.wisdom-academy.example', '/student'],
  ['PARENT', 'tariq.mahmood1@parent.wisdom-academy.example', '/parent'],
];

const browser = await chromium.launch();
let failures = 0;

for (const [role, email, expected] of accounts) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  try {
    await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);

    // Fill by input type so this does not depend on placeholder wording.
    const emailInput = page.locator('input[type="email"], input[name="email"]').first();
    const passInput = page.locator('input[type="password"]').first();
    await emailInput.fill(email);
    await passInput.fill(PASSWORD);

    await page.locator('button[type="submit"]').first().click();
    await page.waitForTimeout(3500);

    const url = page.url();
    const path = new URL(url).pathname;
    const landed = path.startsWith(expected);

    // Check the page did not bounce back to login with an error.
    const onLogin = path.startsWith('/login');
    const bodyText = (await page.textContent('body'))?.slice(0, 3000) ?? '';
    const errMatch = bodyText.match(/(invalid|incorrect|wrong|failed|error)[^\n.]{0,80}/i);

    const ok = landed && !onLogin;
    if (!ok) failures += 1;

    console.log(
      `${ok ? 'PASS' : 'FAIL'} ${role.padEnd(8)} expected ${expected.padEnd(9)} -> ${path}` +
        (errMatch && !ok ? `  | page said: "${errMatch[0].trim()}"` : ''),
    );
    if (errors.length) console.log(`      js errors: ${errors.slice(0, 2).join(' | ')}`);
  } catch (e) {
    failures += 1;
    console.log(`FAIL ${role.padEnd(8)} threw: ${e.message.split('\n')[0]}`);
  }

  await page.close();
}

await browser.close();
console.log(failures === 0 ? '\nAll four portals signed in.' : `\n${failures} portal(s) FAILED.`);

// ---------------------------------------------------------------------------
// Regression and security cases around the same code path.
// ---------------------------------------------------------------------------
const browser2 = await chromium.launch();
let extra = 0;

async function attempt({ label, email, password, next, expectPath, expectHost }) {
  const page = await browser2.newPage({ viewport: { width: 1280, height: 900 } });
  try {
    const url = next ? `${B}/login?next=${encodeURIComponent(next)}` : `${B}/login`;
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(700);
    await page.locator('input[type="email"], input[name="email"]').first().fill(email);
    await page.locator('input[type="password"]').first().fill(password);
    await page.locator('button[type="submit"]').first().click();
    await page.waitForTimeout(3200);

    const landed = new URL(page.url());
    const pathOk = landed.pathname.startsWith(expectPath);
    const hostOk = expectHost ? landed.host === expectHost : true;
    const ok = pathOk && hostOk;
    if (!ok) extra += 1;
    console.log(
      `${ok ? 'PASS' : 'FAIL'} ${label.padEnd(34)} -> ${landed.pathname}`,
    );
  } catch (e) {
    extra += 1;
    console.log(`FAIL ${label.padEnd(34)} threw: ${e.message.split('\n')[0]}`);
  }
  await page.close();
}

await attempt({
  label: 'wrong password stays on /login',
  email: 'owner@wisdom-academy.example',
  password: 'definitely-not-the-password',
  expectPath: '/login',
});

await attempt({
  label: 'next param honoured (student fees)',
  email: 'hamza.hashmi1@student.wisdom-academy.example',
  password: PASSWORD,
  next: '/student/fees',
  expectPath: '/student/fees',
});

await attempt({
  label: 'protocol-relative next blocked',
  email: 'owner@wisdom-academy.example',
  password: PASSWORD,
  next: '//example.com/evil',
  expectPath: '/admin',
  expectHost: new URL(B).host,
});

await browser2.close();
console.log(extra === 0 ? 'Regression cases passed.' : `${extra} regression case(s) FAILED.`);

process.exit(failures === 0 && extra === 0 ? 0 : 1);
