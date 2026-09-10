import { Hono } from "hono";
import {
  requireAuth,
  createSession,
  deleteSession,
  deleteAllSessions,
  loginAllowed,
  loginFailed,
  loginSucceeded,
  verifyAdminPassword,
  setAdminPassword,
  isDefaultPasswordActive,
  bootstrapRequired,
  DEFAULT_ADMIN_PASSWORD,
  safeEqual,
  upgradeSetupSession,
} from "../auth.js";
import { getSettings } from "../kv.js";
import { resolveToken } from "../bot-api.js";
import { validateInitData } from "../services/customer-auth.js";
import { readJson } from "../body.js";

const r = new Hono();

r.post("/login", async (c) => {
  const env = c.env;

  const ip = c.req.header("cf-connecting-ip") || "local-dev";
  const rl = await loginAllowed(env, ip);
  if (!rl.allowed) {
    return c.json({ ok: false, error: "rate_limited" }, 429);
  }

  // A malformed or missing body is not a server fault: treat it as "no password"
  // so the caller gets the normal 401 instead of an unhandled 500.
  let password = "";
  try {
    ({ password = "" } = await readJson(c));
  } catch {}

  if (String(password).length > 256)
    return c.json({ ok: false, error: "invalid_credentials" }, 401);
  const valid = await verifyAdminPassword(env, String(password));
  if (!valid) {
    await loginFailed(env, ip);
    return c.json({ ok: false, error: "invalid_credentials" }, 401);
  }

  await loginSucceeded(env, ip);
  const session = await createSession(
    env,
    await safeEqual(password, DEFAULT_ADMIN_PASSWORD),
  );
  return c.json({ ok: true, data: session });
});

r.post("/telegram-admin", async (c) => {
  const env = c.env;
  const ip = c.req.header("cf-connecting-ip") || "local-dev";
  const rl = await loginAllowed(env, ip);
  if (!rl.allowed) return c.json({ ok: false, error: "rate_limited" }, 429);

  const body = await readJson(c);
  const initData = String(body.initData || "");
  if (!initData) return c.json({ ok: false, error: "init_data_required" }, 400);

  const token = await resolveToken(env);
  if (!token) return c.json({ ok: false, error: "bot_token_missing" }, 503);

  let tgUser;
  try {
    tgUser = await validateInitData(initData, token);
  } catch (e) {
    await loginFailed(env, ip);
    return c.json({ ok: false, error: e.message || "invalid_telegram_signature" }, 401);
  }

  const settings = await getSettings(env);
  const adminId = String(settings.adminId || env.ADMIN_ID || "").trim();
  if (!adminId || String(tgUser.id) !== adminId) {
    await loginFailed(env, ip);
    return c.json({ ok: false, error: "admin_id_mismatch" }, 403);
  }

  await loginSucceeded(env, ip);
  const session = await createSession(env, false);
  return c.json({
    ok: true,
    data: {
      ...session,
      adminUser: {
        id: tgUser.id,
        firstName: tgUser.first_name,
        username: tgUser.username,
      },
    },
  });
});

r.get("/default-status", async (c) =>
  c.json({
    ok: true,
    data: {
      defaultActive: await isDefaultPasswordActive(c.env),
      setupRequired: await bootstrapRequired(c.env),
    },
  }),
);

r.get("/session", requireAuth, (c) =>
  c.json({
    ok: true,
    data: {
      valid: true,
      expiresAt: c.get("session").expiresAt,
      requiresPasswordChange: !!c.get("session").setupOnly,
    },
  }),
);

r.post("/logout", requireAuth, async (c) => {
  await deleteSession(c.env, c.get("token"));
  return c.json({ ok: true, data: { loggedOut: true } });
});

r.post("/change-password", requireAuth, async (c) => {
  const env = c.env;
  const body = await readJson(c);
  const currentPassword = String(body.currentPassword || "");
  const newPassword = String(body.newPassword || "");

  if (newPassword.length < 10 || newPassword.length > 256) {
    return c.json({ ok: false, error: "invalid_password" }, 400);
  }

  if (await safeEqual(newPassword, DEFAULT_ADMIN_PASSWORD))
    return c.json({ ok: false, error: "default_password_not_allowed" }, 400);
  const ok = await verifyAdminPassword(env, currentPassword);
  if (!ok) {
    return c.json({ ok: false, error: "wrong_password" }, 401);
  }

  await setAdminPassword(env, newPassword);
  await deleteAllSessions(env, c.get("token"));
  await upgradeSetupSession(env, c.get("token"));

  return c.json({ ok: true, data: { changed: true } });
});

export default r;
