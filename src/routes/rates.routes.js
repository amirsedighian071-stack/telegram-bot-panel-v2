import { Hono } from 'hono';
import { requireAuth } from '../auth.js';
import { getSettings, saveSettings, getJson } from '../kv.js';
import { patchV2Settings, enabled, assert } from '../config.js';
import { RATES_SEND_CATS, RATES_CATEGORIES, liveRatesDigestText, sendRatesNow, ratesDestinations, getLiveRates, IRAN_MARKET_SOURCES } from '../rates.js';
import { readJson } from '../body.js';

const r = new Hono();
r.use('*', requireAuth);

const result = (c, data) => c.json({ ok: true, data });
// The rates tables belong to the rates-purpose bot and to every custom bot.
const allowed = (settings) => enabled(settings, 'catalog') || settings.botPurpose === 'rates' || settings.botPurpose === 'custom';

r.get('/', async (c) => {
  const settings = await getSettings(c.env);
  const state = await getJson(c.env, 'v2:rates:state', {});
  return result(c, {
    categories: RATES_CATEGORIES,
    keys: RATES_SEND_CATS,
    rates: settings.rates,
    moduleEnabled: allowed(settings),
    lastAt: state.lastAt || 0,
    lastError: state.lastError || '',
  });
});

r.put('/settings', async (c) => {
  const settings = await getSettings(c.env);
  assert(allowed(settings), 'module_disabled', 403);
  patchV2Settings(settings, { rates: await readJson(c) });
  await saveSettings(c.env, settings);
  return result(c, { rates: settings.rates });
});

r.get('/preview', async (c) => {
  const category = RATES_SEND_CATS.includes(c.req.query('category')) ? c.req.query('category') : 'all';
  return result(c, { category, text: await liveRatesDigestText(c.env, category) });
});

// Structured live table so the panel can show the same Iran-market numbers
// the bot publishes, together with their source and freshness.
r.get('/live', async (c) => {
  const rates = await getLiveRates(c.env);
  return result(c, {
    updatedAt: rates.updatedAt,
    source: rates.source,
    stale: !!rates.stale,
    offline: !!rates.offline,
    sources: IRAN_MARKET_SOURCES,
    gold: rates.gold,
    fiat: rates.fiat,
    crypto: rates.crypto,
  });
});

r.post('/send', async (c) => {
  const settings = await getSettings(c.env);
  assert(allowed(settings), 'module_disabled', 403);
  const body = await readJson(c);
  const category = RATES_SEND_CATS.includes(body.category) ? body.category : 'all';
  const destinations = await ratesDestinations(c.env, Array.isArray(body.destinations) ? body.destinations : []);
  assert(destinations.length, 'invalid_destinations');
  const out = await sendRatesNow(c.env, { category, destinations });
  return result(c, out);
});

export default r;
