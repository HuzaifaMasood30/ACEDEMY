import { chromium } from '@playwright/test';

const B = process.env.BASE ?? 'http://127.0.0.1:12000';
const PW = 'Academy@123';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
let fails = 0;

function check(label, ok, extra = '') {
  if (!ok) fails += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${extra ? '  ' + extra : ''}`);
}

async function signIn(email) {
  await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(700);
  if ((await page.locator('input[type="password"]').count()) === 0) {
    return { blocked: true, path: new URL(page.url()).pathname };
  }
  await page.locator('input[type="email"], input[name="email"]').first().fill(email);
  await page.locator('input[type="password"]').first().fill(PW);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForTimeout(3000);
  return { blocked: false, path: new URL(page.url()).pathname };
}

// 1. Sign out via the header menu must actually clear the session.
console.log('--- sign out from the header menu ---');
let r = await signIn('hamza.hashmi1@student.wisdom-academy.example');
check('student signs in', r.path === '/student', r.path);

const trigger = page.locator('header button:has(svg.lucide-chevron-down)').first();
await trigger.click();
await page.waitForTimeout(600);
const menuCount = await page.locator('[role="menu"]').count();
check('user menu opens', menuCount > 0);

await page.locator('form button[role="menuitem"]').last().click();
await page.waitForTimeout(3500);
const url = new URL(page.url());
check('lands on /login', url.pathname === '/login', url.pathname + url.search);
check('no MissingCSRF error', !/MissingCSRF/i.test(url.search), url.search);

const cookies = await ctx.cookies();
const sessionCookie = cookies.find((c) => c.name.includes('session-token'));
check('session cookie cleared', !sessionCookie, sessionCookie ? 'still present' : '');

// 2. After signing out, a different account must be reachable.
console.log('--- switch to a different account ---');
r = await signIn('owner@wisdom-academy.example');
check('admin reachable after sign-out', r.path === '/admin', r.path);

// 3. Visiting /login while signed in must now offer a choice, not bounce.
console.log('--- /login while signed in ---');
await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1200);
const body = (await page.textContent('body')) ?? '';
check('stays on /login', new URL(page.url()).pathname === '/login');
check('shows "already signed in as"', /already signed in as/i.test(body));
check('offers switch control', /different user/i.test(body));

// 4. The switch control must work and reveal a fresh form.
console.log('--- use the switch control ---');
await page.getByRole('button', { name: /different user/i }).click();
await page.waitForTimeout(3500);
check('login form appears after switching', (await page.locator('input[type="password"]').count()) > 0);

r = await signIn('tariq.mahmood1@parent.wisdom-academy.example');
check('parent reachable after switching', r.path === '/parent', r.path);

await browser.close();
console.log(fails === 0 ? '\nAll checks passed.' : `\n${fails} check(s) FAILED.`);
process.exit(fails === 0 ? 0 : 1);
