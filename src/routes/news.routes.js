import { Hono } from 'hono';
import { requireAuth } from '../auth.js';
import { getSettings, saveSettings, getJson } from '../kv.js';
import { patchV2Settings, enabled, assert } from '../config.js';
import { NEWS_CATEGORIES, NEWS_CATEGORY_KEYS, NEWS_SEND_CATS, fetchLiveNews, sendNewsDigest, newsDestinations } from '../news.js';
import { readJson } from '../body.js';

const r = new Hono();
r.use('*', requireAuth);

const result = (c, data) => c.json({ ok: true, data });

r.get('/', async (c) => {
  const settings = await getSettings(c.env);
  const state = await getJson(c.env, 'v2:news:state', {});
  return result(c, {
    categories: NEWS_CATEGORIES,
    keys: NEWS_CATEGORY_KEYS,
    news: settings.news,
    moduleEnabled: enabled(settings, 'channel') || settings.botPurpose === 'news',
    nextAt: state.nextAt || 0,
    lastAt: state.lastAt || 0,
    lastError: state.lastError || '',
  });
});

r.put('/settings', async (c) => {
  const settings = await getSettings(c.env);
  assert(enabled(settings, 'channel') || settings.botPurpose === 'news', 'module_disabled', 403);
  patchV2Settings(settings, { news: await readJson(c) });
  await saveSettings(c.env, settings);
  return result(c, { news: settings.news });
});

r.get('/latest', async (c) => {
  const category = NEWS_CATEGORY_KEYS.includes(c.req.query('category')) ? c.req.query('category') : 'all';
  let items;
  if (category === 'all') {
    items = [];
    for (const cat of NEWS_SEND_CATS) items.push(...(await fetchLiveNews(c.env, cat)).slice(0, 2));
  } else items = await fetchLiveNews(c.env, category);
  return result(c, { category, items });
});

r.post('/send', async (c) => {
  const settings = await getSettings(c.env);
  assert(enabled(settings, 'channel') || settings.botPurpose === 'news', 'module_disabled', 403);
  const body = await readJson(c);
  const category = NEWS_CATEGORY_KEYS.includes(body.category) ? body.category : 'all';
  const destinations = await newsDestinations(c.env, Array.isArray(body.destinations) ? body.destinations : []);
  assert(destinations.length, 'invalid_destinations');
  const out = await sendNewsDigest(c.env, { category, destinations });
  return result(c, out);
});

export default r;
