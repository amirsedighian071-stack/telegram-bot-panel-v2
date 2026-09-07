import { assert } from './config.js';

export function safePublicUrl(value) {
  try {
    const u = new URL(value);
    const h = u.hostname.toLowerCase();
    return u.protocol === 'https:' && !u.username && !u.password && (!u.port || u.port === '443') &&
      h.includes('.') && !/^[\d.]+$/.test(h) && !h.includes(':') &&
      !/(^|\.)(localhost|local|internal|test|invalid|example)$/.test(h) &&
      !/\.(localhost|local|internal)$/.test(h) && !['metadata.google.internal', 'metadata.google.com'].includes(h);
  } catch { return false; }
}
export async function boundedBytes(res, max) {
  assert(res.ok, `upstream_http_${res.status}`, 502);
  assert(Number(res.headers.get('content-length') || 0) <= max, 'response_too_large', 413);
  const reader = res.body.getReader(), chunks = []; let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      total += value.byteLength;
      assert(total <= max, 'response_too_large', 413); chunks.push(value);
    }
  } catch (e) { await reader.cancel().catch(() => {}); throw e; }
  const result = new Uint8Array(total); let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
  return result;
}
export async function publicFeed(value) {
  let url = value;
  for (let i = 0; i < 4; i++) {
    assert(safePublicUrl(url), 'unsafe_feed_url');
    const res = await fetch(url, { redirect: 'manual', headers: { accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml' }, signal: AbortSignal.timeout(10000) });
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      url = new URL(res.headers.get('location'), url).href; continue;
    }
    return new TextDecoder().decode(await boundedBytes(res, 1024 * 1024));
  }
  throw new Error('too_many_redirects');
}
