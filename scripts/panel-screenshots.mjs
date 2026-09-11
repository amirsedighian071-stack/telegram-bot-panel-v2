#!/usr/bin/env node
/**
 * panel-screenshots.mjs — regenerate every README screenshot from a live local build.
 *
 * Usage:
 *   npm run screenshots
 *
 * What it does:
 *   1. Builds the panel assets (tailwind, vendor libs).
 *   2. Starts `wrangler dev` on 127.0.0.1:<port> (fresh local KV/D1/DO state).
 *   3. Walks the real panel: login → first-login password setup → each route,
 *      in Persian and English, desktop and mobile viewports.
 *   4. Writes the new images over the old ones in assets/readme/ and assets/screens/.
 *
 * Requires: Node >= 22, `npm install`, a Playwright browser (`npx playwright install chromium`)
 * and a working `npx wrangler dev` (Cloudflare local emulation).
 *
 * Optional environment:
 *   SCREENSHOT_CHROMIUM  absolute path to a chromium binary to drive instead of the
 *                        one Playwright downloaded (sandboxes/CI without a browser
 *                        download). Combine with LD_LIBRARY_PATH when the binary
 *                        needs bundled shared libraries.
 *   SCREENSHOT_HOST      host for `wrangler dev` (default 127.0.0.1; use 0.0.0.0 to
 *                        expose the panel for a live preview while shooting).
 *   SCREENSHOT_PORT      port for `wrangler dev` (default 8799).
 */
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORT = Number(process.env.SCREENSHOT_PORT || 8799);
const HOST = process.env.SCREENSHOT_HOST || '127.0.0.1';
const BASE = `http://127.0.0.1:${PORT}`;
const INITIAL_PASSWORD = 'botpanel123';
const NEW_PASSWORD = 'screenshot12345';

process.chdir(ROOT);
const out = p => path.join(ROOT, p);
const sleep = ms => new Promise(r => setTimeout(r, ms));

function fail(msg) { console.error(`\n✗ ${msg}`); process.exit(1); }

async function waitForHttp(url, timeoutMs = 240000) {
  const start = Date.now();
  for (;;) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
      if (res.status < 500) return;
    } catch (e) { /* not up yet */ }
    if (Date.now() - start > timeoutMs) throw new Error(`timed out waiting for ${url}`);
    await sleep(1500);
  }
}

console.log('→ building panel assets…');
execFileSync('node', ['scripts/build-panel.mjs'], { stdio: 'inherit' });

// Local state from an earlier run would keep the previous password, so every
// pass starts from a genuinely fresh install (the login shot depends on it).
fs.rmSync(path.join(ROOT, '.wrangler', 'state'), { recursive: true, force: true });

console.log(`→ starting wrangler dev on port ${PORT}…`);
// Spawn wrangler directly: killing the `npx` wrapper can leave workerd behind
// holding the log pipe open.
const wrangler = spawn(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'dev', '--ip', HOST, '--port', String(PORT)], { stdio: ['ignore', 'inherit', 'inherit'] });
const stop = () => {
  try { wrangler.kill('SIGTERM'); } catch (e) {}
  setTimeout(() => { try { wrangler.kill('SIGKILL'); } catch (e) {} }, 4000).unref();
};
process.on('exit', stop);
process.on('SIGINT', () => { stop(); process.exit(130); });

try {
  await waitForHttp(`${BASE}/`);
  console.log('→ panel is up, launching browser…');

  // SCREENSHOT_CHROMIUM lets a sandbox or CI box drive an existing chromium
  // binary when Playwright's own download is unavailable.
  const browser = await chromium.launch({
    executablePath: process.env.SCREENSHOT_CHROMIUM || undefined,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const shots = [];
  // Keep the container format and the file extension in agreement: a JPEG named
  // .webp renders inconsistently on GitHub's image proxy.
  const format = file => (file.endsWith('.png') ? 'png' : file.endsWith('.webp') ? 'webp' : 'jpeg');
  const take = (page, file, opts = {}) => {
    const type = format(file);
    const shot = { path: out(file), type, ...opts };
    if (type === 'png') delete shot.quality; // PNG has no quality knob
    else shot.quality = 88;
    return page.screenshot(shot)
      .then(() => { shots.push(file); console.log(`  ✓ ${file}`); })
      .catch(e => console.warn(`  ! could not capture ${file}: ${e.message}`));
  };

  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
  page.setDefaultTimeout(30000);

  // ── 1. login screen (fresh install, Persian, dark) ─────────────────────────
  await page.goto(`${BASE}/#dashboard`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#pw');
  await take(page, 'assets/readme/mac-login-fa.webp');
  await take(page, 'assets/screens/login-fa-dark.jpg');

  // ── 2. first login → set private password ──────────────────────────────────
  await page.fill('#pw', INITIAL_PASSWORD);
  await page.click('#login-btn');
  await page.waitForSelector('#setup-new');
  await take(page, 'assets/readme/mac-setup-fa.webp');
  await page.fill('#setup-new', NEW_PASSWORD);
  await page.fill('#setup-repeat', NEW_PASSWORD);
  await page.click('#setup-submit');
  // `S` is a top-level lexical binding of the panel bundle, so it is reachable
  // in page scope but never as `window.S`.
  await page.waitForFunction(() => typeof S !== 'undefined' && S.token && document.querySelector('#view, main .v-card, main'), { timeout: 30000 });
  await sleep(900);

  const go = async (hash, waitMs = 1200) => {
    await page.evaluate(h => { location.hash = h; }, hash);
    await sleep(waitMs);
  };
  const setLang = async lang => {
    await page.evaluate(l => { S.lang = l; localStorage.setItem('bp_lang', l); render(); }, lang);
    await sleep(700);
  };
  const expandAll = async (rootSelector) => {
    const n = await page.evaluate(sel => {
      const box = document.querySelector(sel) || document;
      let i = 0;
      for (const d of box.querySelectorAll('details:not([open])')) { d.setAttribute('open', ''); i++; }
      return i;
    }, rootSelector);
    if (n) await sleep(300);
  };

  // ── 3. dashboard (fa) ───────────────────────────────────────────────────────
  await go('#dashboard', 1600);
  await take(page, 'assets/readme/mac-dashboard-fa.webp');
  await take(page, 'assets/screens/dashboard-fa-dark.jpg');

  // ── 4. studio: purposes (fa) ────────────────────────────────────────────────
  await go('#studio', 1600);
  await take(page, 'assets/readme/mac-purposes-fa.webp', { fullPage: true });

  // ── 5. studio extra settings (news + rates sections, fa) ────────────────────
  await page.evaluate(() => { document.querySelectorAll('#v-extra-settings details').forEach(d => d.setAttribute('open', '')); const el = document.querySelector('#v-extra-settings details:nth-child(3)'); if (el) el.scrollIntoView(); }, 1600);
  await expandAll('#v-extra-settings');
  await sleep(500);
  await page.evaluate(() => { const els = [...document.querySelectorAll('#v-extra-settings details summary')]; const s = els.find(x => x.textContent.includes('خبر')); if (s) s.scrollIntoView({ block: 'start' }); });
  await sleep(400);
  await take(page, 'assets/screens/v2-settings-fa-desktop.png', { fullPage: false });

  // ── 5b. studio media tab (direct uploads) + services tab ───────────────────
  await go('#studio', 1200);
  await page.evaluate(() => { const t = [...document.querySelectorAll('.v-tab')].find(x => /رسانه|Media/.test(x.textContent)); if (t) t.click(); });
  await sleep(1400);
  await take(page, 'assets/readme/mac-upload-fa.webp');
  await page.evaluate(() => { const t = [...document.querySelectorAll('.v-tab')].find(x => /سرویس|Services/.test(x.textContent)); if (t) t.click(); });
  await sleep(1400);
  await take(page, 'assets/screens/v3-services-admin-fa.png');

  // ── 6. users (fa) ───────────────────────────────────────────────────────────
  await go('#users', 1400);
  await take(page, 'assets/screens/users-fa-dark.jpg');

  // ── 7. broadcast (fa) ───────────────────────────────────────────────────────
  await go('#broadcast', 1400);
  await take(page, 'assets/screens/broadcast-poll-fa-dark.jpg');

  // ── 8. menu & buttons (fa) ──────────────────────────────────────────────────
  await go('#menu', 1400);
  await expandAll('#view');
  await take(page, 'assets/screens/menu-buttons-fa-dark.jpg');

  // ── 9. settings (fa) ────────────────────────────────────────────────────────
  await go('#settings', 1400);
  await expandAll('#view');
  await take(page, 'assets/screens/settings-fa-dark.jpg');

  // ── 10. English variants ────────────────────────────────────────────────────
  await setLang('en');
  await go('#dashboard', 1400);
  await take(page, 'assets/screens/dashboard-en-light.jpg', { fullPage: false });
  await go('#studio', 1600);
  await page.evaluate(() => { document.querySelectorAll('#v-extra-settings details').forEach(d => d.setAttribute('open', '')); const el = [...document.querySelectorAll('#v-extra-settings details summary')].find(x => /News/.test(x.textContent)); if (el) el.scrollIntoView({ block: 'start' }); });
  await sleep(400);
  await take(page, 'assets/readme/mac-settings-en.webp');
  await go('#studio', 1200);
  await page.evaluate(() => { const t = [...document.querySelectorAll('.v-tab')].find(x => /Services/.test(x.textContent)); if (t) t.click(); });
  await sleep(1200);
  await take(page, 'assets/readme/mac-services-en.webp');

  // ── 11. portal (customer mini-app) ──────────────────────────────────────────
  await page.evaluate(() => { location.hash = '#dashboard'; });
  await setLang('fa');
  const portalPage = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
  await portalPage.goto(`${BASE}/portal`, { waitUntil: 'networkidle' });
  await sleep(1200);
  await take(portalPage, 'assets/readme/mac-portal-fa.webp');
  await take(portalPage, 'assets/screens/v3-customer-portal-fa.png');
  // portal in English (the portal reads the svc_lang preference)
  await portalPage.evaluate(() => localStorage.setItem('svc_lang', 'en'));
  await portalPage.reload({ waitUntil: 'networkidle' });
  await sleep(1400);
  await take(portalPage, 'assets/readme/mac-portal-en.webp');
  await portalPage.close();

  // ── 12. mobile viewport (fa) ────────────────────────────────────────────────
  const token = await page.evaluate(() => sessionStorage.getItem('bp_token'));
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, colorScheme: 'dark', deviceScaleFactor: 2 });
  await mobile.addInitScript(t => sessionStorage.setItem('bp_token', t || ''), token);
  await mobile.goto(`${BASE}/#users`, { waitUntil: 'networkidle' });
  await sleep(1400);
  await take(mobile, 'assets/screens/users-mobile-fa-dark.jpg');
  await mobile.close();

  await browser.close();

  console.log(`\n✓ done — ${shots.length} screenshots written to assets/readme/ and assets/screens/`);
} catch (e) {
  fail(e.stack || e.message);
} finally {
  stop();
  await sleep(800);
}
