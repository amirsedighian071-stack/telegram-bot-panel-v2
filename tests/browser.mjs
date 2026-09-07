// Run against an isolated local Worker: npm run dev, then npm run test:ui.
// Telegram upload/delivery HTTP endpoints are mocked only in the browser test.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const runId = Date.now();
const couponCode = 'UITEST' + runId;
const categoryTitle = 'دسته آزمایش رابط ' + runId;
const productTitle = 'محصول آزمایش رابط ' + runId;
const faqQuestion = 'پرسش آزمایشی ' + runId;
const base = process.env.E2E_BASE_URL || 'http://127.0.0.1:8787';
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1080 } });
const errors = [], foreignRequests = [];
page.on('pageerror', e => errors.push(e.message));
page.on('request', r => { if (!r.url().startsWith(base) && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) foreignRequests.push(r.url()); });
let token, original, categoryId, productId, couponId, faqId;
const success = label => console.log('✓ ' + label);
async function api(method, path, body) {
  const res = await page.request.fetch(base + '/api' + path, { method, headers: { authorization: 'Bearer ' + token }, ...(body === undefined ? {} : { data: body }) });
  const value = await res.json(); assert(res.ok(), JSON.stringify(value)); return value.data;
}
async function navigate(route) {
  await page.locator(`aside [data-to="${route}"]`).click();
  await page.waitForFunction(r => S.route === r, route);
}
async function tab(id) {
  await page.locator(`.v-tabs [data-id="${id}"]`).click();
  await page.waitForFunction(() => !!document.getElementById('v-studio-body') && !document.querySelector('#v-studio-body .v-skeleton'));
}
async function select(id, value) {
  await page.locator('#' + id).locator('..').locator('[data-act="ddToggle"]').click();
  await page.locator(`#dd-panel [data-v="${value}"]`).click();
}
async function submit() {
  await page.locator('#v-form [type="submit"]').click();
  await page.waitForSelector('#modal-wrap.hidden', { state: 'attached' });
}
try {
  await page.goto(base);
  await page.locator('#pw').fill(process.env.E2E_ADMIN_PASSWORD || 'botpanel123');
  await page.locator('#login-btn').click();
  await page.waitForSelector('#view');
  token = await page.evaluate(() => S.token);
  original = (await api('GET', '/settings')).settings;
  await api('PUT', '/settings', { botPurpose: 'custom', customModules: Object.keys(await page.evaluate(() => MODULE_LABELS)) });
  await page.reload(); await page.waitForSelector('#view');
  success('Login and SQLite-backed API');

  await navigate('settings'); await page.waitForSelector('#v-profile-cards');
  assert.equal(await page.locator('.v-profile').count(), 12);
  assert.equal(await page.locator('html').getAttribute('data-panel-version'), '2.0.1');
  await page.locator('.v-profile[data-id="channel"]').click();
  assert((await page.locator('#v-purpose-preview').innerText()).includes('دیپ‌لینک'));
  assert.equal(await page.locator('.v-profile[data-id="channel"]').getAttribute('aria-pressed'), 'true');
  success('Channel preset has an explicit feature preview and lightweight selection feedback');
  await page.locator('.v-profile[data-id="shop"]').click();
  await page.locator('[data-act="vSavePurpose"]').click();
  await page.locator('[data-act="confirmYes"]').click();
  await page.waitForFunction(() => V2.settings.botPurpose === 'shop');
  await navigate('studio');
  assert.equal(await page.locator('.v-tabs [data-id="orders"]').count(), 1);
  assert.equal(await page.locator('.v-tabs [data-id="groups"]').count(), 0);
  assert.equal(await page.locator('.v-tabs [data-id="relay"]').count(), 0);
  success('Profile changes hide unrelated tools without deleting state');
  await api('PUT', '/settings', { botPurpose: 'custom' }); await page.reload(); await page.waitForSelector('.v-tabs');

  await tab('catalog'); await page.locator('[data-act="vCategoryEdit"]:not([data-id])').click();
  await page.locator('#v-cat-title').fill(categoryTitle); await submit();
  categoryId = (await api('GET', '/studio/categories')).rows.find(c => c.title === categoryTitle).id;
  await page.locator('[data-act="vProductEdit"]').first().click();
  await page.locator('#vp-title').fill(productTitle); await page.locator('#vp-price').fill('25000');
  await page.locator('#vp-stock').fill('7'); await page.locator('#vp-desc').fill('توضیحات تست محصول');
  await page.locator('#vp-delivery-text').fill('محتوای خصوصی تست');
  await select('vp-category', categoryId); await submit();
  productId = (await api('GET', '/studio/products')).rows.find(p => p.title === productTitle).id;
  await page.locator(`[data-act="vProductEdit"][data-id="${productId}"]`).click();
  await page.locator('#vp-price').fill('30000'); await submit();
  assert.equal((await api('GET', '/studio/products')).rows.find(p => p.id === productId).price, 30000);
  success('Real category/product create, dropdown selection, edit and persistence');

  await tab('coupons'); await page.locator('[data-act="vCouponEdit"]:not([data-id])').click();
  await page.locator('#vc-code').fill(couponCode); await page.locator('#vc-value').fill('15'); await submit();
  couponId = (await api('GET', '/studio/coupons')).rows.find(c => c.code === couponCode).id;
  await tab('faq'); await page.locator('[data-act="vFAQEdit"]:not([data-id])').click();
  await page.locator('#vq-question').fill(faqQuestion); await page.locator('#vq-answer').fill('پاسخ آزمایشی'); await submit();
  faqId = (await api('GET', '/studio/faq')).rows.find(f => f.question === faqQuestion).id;
  success('Discount and bilingual FAQ forms');

  await tab('groups'); await page.locator('[data-act="vGroupEdit"]:not([data-id])').click();
  assert.equal(await page.locator('#vg-blockLinks').count(), 1);
  assert.equal(await page.locator('#vg-captchaMode').count(), 1);
  assert.equal(await page.locator('#vg-night-zone').inputValue(), 'Asia/Tehran');
  await page.locator('#v-form [data-act="modalClose"]').click();
  for (const id of ['orders', 'channel', 'relay', 'crm', 'media']) { await tab(id); assert((await page.locator('#v-studio-body').innerText()).length > 20); }
  success('All studio tabs and moderation form render without JavaScript errors');

  await api('PUT', '/settings', { uploads: { chatId: '@ui_test_storage' } });
  await page.evaluate(async () => { await initV2(); });
  await navigate('broadcast');
  if ((await page.locator('[data-acc="bc:photo"]').getAttribute('class')).includes(' open') === false) await page.locator('[data-act="accToggle"][data-id="photo"]').click();
  assert.equal(await page.locator('#ph-url').count(), 0);
  let uploaded = false, delivered, failUpload = false, deliveryCount = 0;
  await page.route('**/api/media', async route => {
    if (route.request().method() !== 'POST') return route.continue();
    assert(route.request().headers()['content-type'].includes('multipart/form-data'));
    if (failUpload) return route.fulfill({ status: 502, json: { ok: false, error: 'telegram_network_error' } });
    const isPhoto = route.request().postDataBuffer().includes(Buffer.from('direct-photo.png'));
    assert(isPhoto || route.request().postDataBuffer().includes(Buffer.from('direct-file.txt')));
    uploaded = true;
    await route.fulfill({ json: { ok: true, data: { media: { id: isPhoto ? 'fedcba9876543210' : 'abcdef1234567890', kind: isPhoto ? 'photo' : 'document', name: isPhoto ? 'direct-photo.png' : 'direct-file.txt', size: 7, fileId: 'TEST-FILE-ID' } } } });
  });
  await page.route('**/api/broadcast', async route => {
    if (route.request().method() !== 'POST') return route.continue();
    delivered = route.request().postDataJSON(); deliveryCount++;
    await route.fulfill({ json: { ok: true, data: { mode: 'direct', sent: 1, failed: 0, results: [{ id: 42, ok: true }] } } });
  });
  const [fileChooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('[data-act="vAddMedia"][data-kind="document"]').click()]);
  await fileChooser.setFiles({ name: 'direct-file.txt', mimeType: 'text/plain', buffer: Buffer.from('payload') });
  await page.waitForFunction(() => document.getElementById('ph-media')?.value === 'abcdef1234567890');
  await page.locator('#ph-cap').fill('کپشن فایل');
  await page.locator('[data-act="bcSend"][data-kind="photo"]').click();
  await page.waitForFunction(() => !document.querySelector('[data-act="bcSend"][data-kind="photo"]').disabled);
  assert(uploaded); assert.equal(delivered.kind, 'document'); assert.equal(delivered.mediaId, 'abcdef1234567890'); assert.equal(delivered.caption, 'کپشن فایل'); assert.equal(delivered.photo, undefined);
  success('Direct multipart file upload + broadcast payload; no URL field');
  failUpload = true;
  const [failedChooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('[data-act="vAddMedia"][data-kind="document"]').click()]);
  await failedChooser.setFiles({ name: 'failed-replacement.txt', mimeType: 'text/plain', buffer: Buffer.from('replacement') });
  await page.waitForFunction(() => V2.uploads === 0 && !document.getElementById('ph-media').value);
  await page.locator('[data-act="bcSend"][data-kind="photo"]').click();
  assert.equal(deliveryCount, 1);
  success('Failed replacement upload cannot accidentally send the previous file');
  failUpload = false;
  const [photoChooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('[data-act="vAddMedia"][data-kind="photo"]').click()]);
  await photoChooser.setFiles({ name: 'direct-photo.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a0x8AAAAASUVORK5CYII=', 'base64') });
  await page.waitForFunction(() => document.getElementById('ph-media')?.value === 'fedcba9876543210');
  await page.locator('[data-act="bcSend"][data-kind="photo"]').click();
  await page.waitForFunction(() => !document.querySelector('[data-act="bcSend"][data-kind="photo"]').disabled);
  assert.equal(delivered.kind, 'photo'); assert.equal(delivered.mediaId, 'fedcba9876543210');
  success('Dedicated Add photo button opens the picker and sends a photo, not a link');
  await page.locator('#v-media-options > summary').click();
  await select('ph-kind', 'document'); assert.equal(await page.locator('#ph-media').inputValue(), '');
  success('Advanced controls stay available; incompatible previous uploads are cleared');
  await page.reload(); await page.waitForSelector('[data-act="vAddMedia"]');
  fs.mkdirSync('assets/screens', { recursive: true });
  await page.locator('[data-acc="bc:photo"]').screenshot({ path: 'assets/screens/v2-direct-upload-fa-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.locator('[data-acc="bc:photo"]').evaluate(el => scrollTo({ top: scrollY + el.getBoundingClientRect().top - 66, behavior: 'instant' }));
  await page.screenshot({ path: 'assets/screens/v2-direct-upload-fa-mobile.png' });
  await page.setViewportSize({ width: 1440, height: 1080 });
  success('Direct-upload controls render on desktop and mobile');

  await navigate('settings'); await page.waitForSelector('#v-profile-cards');
  await page.locator('[data-act="vLockAdd"]').click();
  await page.locator('#vl-title-0').fill('کانال آزمایش'); await page.locator('#vl-chat-0').fill('@ui_test_channel');
  await page.locator('#v-lock-on').check(); await page.locator('[data-act="vSaveLocks"]').click();
  await page.waitForFunction(() => V2.settings.requiredChats.enabled === true);
  assert.equal((await api('GET', '/settings')).settings.requiredChats.targets[0].chatId, '@ui_test_channel');
  success('Multi-chat membership form saves through the real API');

  fs.mkdirSync('assets/screens', { recursive: true });
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: 'assets/screens/v2-settings-fa-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'assets/screens/v2-settings-fa-mobile.png' });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert(await page.evaluate(() => parseFloat(getComputedStyle(document.getElementById('view')).animationDuration) < .001));
  success('390px mobile layout and reduced-motion support');
  await page.locator('[data-act="toggleLang"]').click();
  await page.waitForFunction(() => document.documentElement.dir === 'ltr');
  await page.waitForSelector('#v-profile-cards');
  assert((await page.locator('#v-profile-settings').innerText()).includes('What should your bot do?'));
  success('English / LTR interface');
  assert.deepEqual(errors, []); assert.deepEqual(foreignRequests, []);
  success('No runtime page errors or external CDN/font requests');
} finally {
  if (token) {
    for (const [type, id] of [['products', productId], ['categories', categoryId], ['coupons', couponId], ['faq', faqId]]) if (id) await api('DELETE', '/studio/' + type + '/' + id).catch(() => {});
    if (original) await api('PUT', '/settings', original).catch(() => {});
  }
  await browser.close();
}
