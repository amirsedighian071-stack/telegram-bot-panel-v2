import { getUser, putUser, getSettings } from "../kv.js";
import { resolveToken } from "../bot-api.js";
import { enabled } from "../config.js";
import { membershipGate, joinUrl } from "../gate.js";
import {
  get,
  put,
  key,
  commitJson,
  assert,
  uid,
  str,
  epoch,
  hash,
  hex,
  hmac,
  constantEqual,
  randomToken,
  limited,
} from "./common.js";
import { serviceSettings } from "./settings.js";
import { initializeAccount, account } from "./wallet.js";

export async function validateInitData(initData, token, now = epoch()) {
  assert(
    typeof initData === "string" && initData.length < 16384,
    "telegram_init_data_required",
    401,
  );
  const params = new URLSearchParams(initData);
  const keys = [...params.keys()];
  assert(new Set(keys).size === keys.length, "duplicate_init_data_fields", 401);
  const received = params.get("hash");
  assert(
    /^[a-fA-F0-9]{64}$/.test(received || ""),
    "invalid_telegram_signature",
    401,
  );
  params.delete("hash");
  const date = Number(params.get("auth_date"));
  assert(
    Number.isSafeInteger(date) && date <= now + 30 && now - date <= 300,
    "telegram_login_expired",
    401,
  );
  const check = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => k + "=" + v)
    .join("\n");
  const secret = await hmac("WebAppData", token);
  assert(
    constantEqual(hex(await hmac(secret, check)), received.toLowerCase()),
    "invalid_telegram_signature",
    401,
  );
  let user;
  try {
    user = JSON.parse(params.get("user"));
  } catch {
    assert(false, "invalid_telegram_user", 401);
  }
  assert(
    user && Number.isSafeInteger(user.id) && user.id > 0 && !user.is_bot,
    "invalid_telegram_user",
    401,
  );
  return user;
}
export async function portalTicket(env, userId) {
  const ticket = randomToken();
  await put(
    env,
    "ticket",
    await hash(ticket),
    { userId: uid(userId), expiresAt: Date.now() + 120000 },
    { ttl: 120 },
  );
  return ticket;
}
export async function portalLogin(env, body, ip) {
  await limited(env, "login:" + ip, 15, 60);
  const token = await resolveToken(env);
  assert(token, "token_missing", 503);
  let user;
  if (body.ticket) {
    const keyHash = await hash(String(body.ticket));
    const row = await get(env, "ticket", keyHash);
    assert(row && row.expiresAt > Date.now(), "login_link_expired", 401);
    user = await getUser(env, row.userId);
    assert(user, "user_not_found");
    await put(env, "ticket", keyHash, { expiresAt: 0 }, { ttl: 60 });
  } else {
    const tg = await validateInitData(body.initData, token);
    user = await getUser(env, tg.id);
    if (!user) {
      user = {
        id: tg.id,
        firstName: str(tg.first_name, 100),
        username: str(tg.username, 64),
        lang: tg.language_code === "en" ? "en" : "fa",
        joinedAt: Date.now(),
        lastSeen: Date.now(),
        banned: false,
        privateStarted: false,
      };
      await putUser(env, user);
    }
  }
  assert(!user.banned, "user_banned", 403);
  const settings = await getSettings(env);
  assert(enabled(settings, "services"), "module_disabled", 403);
  await initializeAccount(env, user);
  const session = randomToken();
  await put(
    env,
    "session",
    await hash(session),
    {
      userId: uid(user.id),
      botId: token.split(":")[0],
      expiresAt: Date.now() + 3600000,
    },
    { ttl: 3600 },
  );
  return {
    token: session,
    expiresAt: Date.now() + 3600000,
    user: { id: user.id, name: user.firstName },
  };
}
export async function requireCustomer(c, next) {
  const auth = c.req.header("Authorization") || "",
    raw = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  assert(raw && raw.length <= 256, "customer_unauthorized", 401);
  const s = await get(c.env, "session", await hash(raw));
  assert(s && s.expiresAt > Date.now(), "customer_unauthorized", 401);
  const user = await getUser(c.env, s.userId);
  assert(user && !user.banned, "user_banned", 403);
  const token = await resolveToken(c.env);
  assert(s.botId === token?.split(":")[0], "customer_unauthorized", 401);
  assert(enabled(await getSettings(c.env), "services"), "module_disabled", 403);
  c.set("customer", user);
  c.set("customerSession", raw);
  await next();
}
export async function customerGate(env, user) {
  const config = await serviceSettings(env),
    a = await account(env, user.id),
    settings = await getSettings(env),
    gate = await membershipGate(env, await resolveToken(env), user, settings);
  return {
    ok:
      gate.ok &&
      (!config.phoneRequired || !!a.phoneVerified) &&
      (!config.rules || a.rulesVersion === config.rulesVersion),
    membership: gate.ok,
    unavailable: gate.unavailable,
    requiredChats: gate.missing.map((c) => ({
      title: c.title || c.chatId,
      url: joinUrl(c),
    })),
    phoneRequired: config.phoneRequired && !a.phoneVerified,
    rulesRequired: !!config.rules && a.rulesVersion !== config.rulesVersion,
  };
}
export async function requireAccess(c, next) {
  const gate = await customerGate(c.env, c.get("customer"));
  assert(
    gate.ok,
    gate.phoneRequired
      ? "phone_verification_required"
      : gate.rulesRequired
        ? "rules_acceptance_required"
        : "membership_required",
    403,
  );
  await next();
}
export async function acceptRules(env, userId, version) {
  const settings = await serviceSettings(env);
  assert(Number(version) === settings.rulesVersion, "rules_version_changed");
  const a = await account(env, userId);
  a.rulesVersion = version;
  await put(env, "account", userId, a);
  return a;
}
export async function verifyPhone(env, userId, contact) {
  const s = await serviceSettings(env);
  assert(
    String(contact?.user_id) === String(userId),
    "phone_must_belong_to_user",
  );
  const phone = String(contact.phone_number || "").replace(/\D/g, "");
  assert(/^\d{8,15}$/.test(phone), "invalid_phone");
  assert(!s.iranPhonesOnly || /^989\d{9}$/.test(phone), "iran_phone_required");
  const a = await account(env, userId);
  a.phone = phone;
  a.phoneVerified = true;
  a.phoneVerifiedAt = Date.now();
  await put(env, "account", userId, a);
  return a;
}
