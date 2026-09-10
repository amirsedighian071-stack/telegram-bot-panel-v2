
import { Hono } from 'hono';
import { requireAuth } from '../auth.js';
import { creatorState, markRead, dismiss, panelBase, ensureCreatorLink, sendSupport } from '../creator.js';
import { readJson } from '../body.js';

const r = new Hono();
r.use('*', requireAuth);

const fail = (c, error, status = 400) => c.json({ ok: false, error }, status);

r.get('/state', async (c) => {
  const base = panelBase(c, c.env);
  try { await ensureCreatorLink(c.env, base); } catch {}
  return c.json({ ok: true, data: await creatorState(c.env) });
});

r.post('/support', async (c) => {
  const body = await readJson(c);
  const text = String(body.text || '').trim();
  if (!text || text.length > 4000) return fail(c, 'invalid_text');
  return c.json({ ok: true, data: await sendSupport(c.env, panelBase(c, c.env), text) });
});

r.post('/dismiss', async (c) => {
  const body = await readJson(c);
  if (!['update', 'notice'].includes(body.kind)) return fail(c, 'invalid_kind');
  return c.json({ ok: true, data: await dismiss(c.env, body.kind, body.id) });
});

r.post('/read', async (c) => c.json({ ok: true, data: await markRead(c.env) }));

export default r;
