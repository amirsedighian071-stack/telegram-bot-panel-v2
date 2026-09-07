import { Hono } from "hono";
import { requireAuth } from "../auth.js";
import { getSettings } from "../kv.js";
import { tgApi, resolveToken } from "../bot-api.js";
import {
  key,
  get,
  put,
  list,
  id,
  assert,
  str,
  seal,
  unseal,
  randomToken,
  constantEqual,
  publicHTTPS,
} from "./common.js";

export const TENANT_KEY = key("tenant", "main");
export function childStub(env, botId) {
  assert(env.BOT_STATE, "durable_object_binding_required", 503);
  return env.BOT_STATE.get(env.BOT_STATE.idFromName("managed-bot:" + botId));
}
export const botView = (bot) => ({
  id: bot.id,
  title: bot.title,
  username: bot.username,
  telegramId: bot.telegramId,
  baseUrl: bot.baseUrl,
  createdAt: bot.createdAt,
  webhookSet: !!bot.webhookSet,
});
export async function initializeChild(env, bot) {
  const url = new URL(bot.baseUrl);
  url.pathname = "/internal/managed/init";
  url.search = "";
  return childStub(env, bot.id).fetch(
    new Request(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(bot),
    }),
  );
}
async function requireChild(env, id) {
  const bot = await get(env, "bot", id);
  assert(bot, "managed_bot_not_found", 404);
  return bot;
}
async function forward(env, bot, request, route, admin = false) {
  assert(
    route.startsWith("/") && !route.startsWith("//") && !/[\r\n]/.test(route),
    "invalid_managed_route",
  );
  const headers = new Headers(request.headers);
  headers.set("x-managed-route", route);
  headers.set("x-managed-admin", admin ? "1" : "0");
  headers.delete("host");
  const url = new URL(bot.baseUrl);
  url.pathname = "/internal/managed/dispatch";
  url.search = "";
  return childStub(env, bot.id).fetch(
    new Request(url, {
      method: request.method,
      headers,
      ...(["GET", "HEAD"].includes(request.method)
        ? {}
        : { body: request.body, duplex: "half" }),
    }),
  );
}
export async function managedPublic(request, env) {
  const url = new URL(request.url),
    match = /^\/bots\/([a-f0-9]{16})(\/.*)?$/.exec(url.pathname);
  assert(match, "managed_bot_not_found", 404);
  const bot = await requireChild(env, match[1]),
    path = match[2] || "/";
  const allowed =
    /^\/api\/portal(?:\/[A-Za-z0-9_-]+)*\/?$/.test(path) ||
    /^\/(?:sub|sub-all|pay|service-pay)\/[A-Za-z0-9_/-]+\/?$/.test(path) ||
    path === "/telegram/webhook";
  assert(allowed, "not_found", 404);
  if (path === "/telegram/webhook") {
    const secrets = await unseal(env, bot.credentials);
    assert(
      request.method === "POST" &&
        constantEqual(
          request.headers.get("x-telegram-bot-api-secret-token") || "",
          secrets.webhookSecret,
        ),
      "unauthorized",
      401,
    );
  }
  return forward(env, bot, request, path + url.search);
}
const routes = new Hono();
routes.use("*", requireAuth);
routes.use("*", async (c, next) => {
  assert(!c.env.MANAGED_BOT_ID, "nested_managed_bots_disabled", 403);
  await next();
});
routes.get("/", async (c) =>
  c.json({ ok: true, data: { bots: (await list(c.env, "bot")).map(botView) } }),
);
routes.post("/", async (c) => {
  const body = await c.req.json();
  const token = str(body.token, 256);
  assert(/^\d+:[A-Za-z0-9_-]+$/.test(token), "invalid_bot_token");
  assert((await list(c.env, "bot")).length < 20, "managed_bot_limit");
  const me = await tgApi(token, "getMe");
  assert(me.ok && me.result?.is_bot, "telegram_connection_failed");
  const primary = await resolveToken(c.env);
  assert(
    String(me.result.id) !== primary?.split(":")[0],
    "cannot_manage_primary_bot",
  );
  assert(
    !(await list(c.env, "bot")).some(
      (b) => b.telegramId === String(me.result.id),
    ),
    "bot_already_registered",
  );
  const s = await getSettings(c.env);
  const base = str(
    body.baseUrl ||
      c.env.PUBLIC_BASE_URL ||
      s.publicBaseUrl ||
      new URL(c.req.url).origin,
    1000,
  ).replace(/\/$/, "");
  assert(publicHTTPS(base), "public_url_required");
  const bot = {
    id: id(),
    telegramId: String(me.result.id),
    username: me.result.username,
    title: str(body.title, 100) || me.result.first_name || me.result.username,
    createdAt: Date.now(),
    webhookSet: false,
  };
  bot.baseUrl = base + "/bots/" + bot.id;
  bot.credentials = await seal(c.env, { token, webhookSecret: randomToken() });
  await put(c.env, "bot", bot.id, bot);
  const initialized = await initializeChild(c.env, bot);
  assert(initialized.ok, "managed_bot_initialization_failed", 503);
  return c.json({ ok: true, data: { bot: botView(bot) } });
});
routes.post("/:id/webhook", async (c) => {
  const bot = await requireChild(c.env, c.req.param("id"));
  const secrets = await unseal(c.env, bot.credentials);
  const response = await tgApi(secrets.token, "setWebhook", {
    url: bot.baseUrl + "/telegram/webhook",
    secret_token: secrets.webhookSecret,
    allowed_updates: [
      "message",
      "edited_message",
      "callback_query",
      "channel_post",
      "my_chat_member",
      "chat_member",
      "pre_checkout_query",
    ],
    drop_pending_updates: false,
  });
  assert(response.ok, response.description || "telegram_error");
  bot.webhookSet = true;
  await put(c.env, "bot", bot.id, bot);
  return c.json({ ok: true, data: { bot: botView(bot) } });
});
routes.post("/:id/initialize", async (c) => {
  const bot = await requireChild(c.env, c.req.param("id"));
  const response = await initializeChild(c.env, bot);
  assert(response.ok, "managed_bot_initialization_failed", 503);
  return c.json({ ok: true, data: { initialized: true } });
});
routes.put("/:id/token", async (c) => {
  const bot = await requireChild(c.env, c.req.param("id")),
    body = await c.req.json(),
    token = str(body.token, 256);
  const me = await tgApi(token, "getMe");
  assert(
    me.ok && String(me.result.id) === bot.telegramId,
    "managed_bot_identity_mismatch",
  );
  const old = await unseal(c.env, bot.credentials);
  bot.credentials = await seal(c.env, { ...old, token });
  bot.username = me.result.username;
  await put(c.env, "bot", bot.id, bot);
  await initializeChild(c.env, bot);
  return c.json({ ok: true, data: { bot: botView(bot) } });
});
routes.all("/:id/admin/*", async (c) => {
  const bot = await requireChild(c.env, c.req.param("id"));
  const path = c.req.path.slice(c.req.path.indexOf("/admin/") + 6);
  assert(
    /^\/api\/[A-Za-z0-9_./:@-]+$/.test(path) && !path.includes(".."),
    "invalid_managed_route",
  );
  return forward(c.env, bot, c.req.raw, path + new URL(c.req.url).search, true);
});
export default routes;
