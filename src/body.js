import { assert } from './config.js';

/* Every mutating route in this Worker expects a JSON *object* (or, for uploads, a
 * multipart form). Requests that arrive with no body at all, an empty body,
 * truncated/invalid JSON, or a bare scalar (`null`, `"text"`, `123`) used to reach
 * the handlers anyway:
 *
 *   await c.req.json()                 -> SyntaxError  -> HTTP 500 internal_error
 *   c.req.json().catch(() => ({}))     -> `null` slips through, then `'x' in null`
 *                                         or `body.x.y` -> TypeError -> HTTP 500
 *
 * A dropped body is ordinary on a flaky mobile connection, behind a proxy, or when
 * a browser extension rewrites the request — and the panel turns any 500 into a
 * red "internal_error / HTTP 500" toast, which reads as "the whole panel is down".
 * Reading every body through these helpers makes such a request a clean,
 * actionable 400 instead. */

const PARSED = Symbol.for('botpanel.jsonBody');
const UNPARSEABLE = Symbol.for('botpanel.unparseable');

export function isPlainPayload(value) {
  return value !== null && typeof value === 'object';
}

// Tolerates an absent/empty body ({}), rejects anything that is not readable as
// fields. The parsed value is cached on the context so a handler and its helpers
// can both read the body without consuming the stream twice.
export async function readJson(c) {
  const cached = c.get(PARSED);
  if (cached !== undefined) return cached;
  let value = {};
  try {
    const text = await c.req.text();
    if (text.trim()) value = JSON.parse(text);
  } catch {
    value = UNPARSEABLE;
  }
  assert(value !== UNPARSEABLE && isPlainPayload(value), 'invalid_body');
  c.set(PARSED, value);
  return value;
}

// Same contract for the file-upload routes: a body that claims to be multipart but
// cannot be parsed must not become an unhandled exception.
export async function readForm(c) {
  let form;
  try {
    form = await c.req.raw.formData();
  } catch {
    assert(false, 'invalid_form_body');
  }
  return form;
}

// Defence in depth for helpers that receive an already-parsed value from a caller
// that may not have gone through readJson (settings patches, cron payloads …).
export function requireObject(value, message = 'invalid_body') {
  assert(isPlainPayload(value), message);
  return value;
}
