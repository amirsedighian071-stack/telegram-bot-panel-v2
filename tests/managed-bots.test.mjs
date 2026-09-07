import test, { beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import worker, { BotCoordinator } from "../src/index.js";
import { MemoryKV, telegramMock } from "./helpers.mjs";
import { get, put, hash, hmac, hex } from "../src/services/common.js";
import { account } from "../src/services/wallet.js";
let env, instances, databases, tg, token;
const realFetch = globalThis.fetch;
function storage() {
  const db = new DatabaseSync(":memory:");
  databases.push(db);
  let alarm = null;
  return {
    sql: {
      exec(sql, ...args) {
        const rows = db.prepare(sql).all(...args);
        return { toArray: () => rows };
      },
    },
    transactionSync(fn) {
      db.exec("BEGIN IMMEDIATE");
      try {
        const r = fn();
        db.exec("COMMIT");
        return r;
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
    async getAlarm() {
      return alarm;
    },
    async setAlarm(v) {
      alarm = v;
    },
  };
}
beforeEach(async () => {
  instances = new Map();
  databases = [];
  tg = telegramMock();
  globalThis.fetch = tg.fetcher;
  tg.setOverride((u, m) =>
    m === "getMe" && u.includes("777:CHILD_TOKEN")
      ? {
          ok: true,
          result: {
            id: 777,
            is_bot: true,
            username: "child_bot",
            first_name: "Child",
          },
        }
      : undefined,
  );
  env = {
    BOT_KV: new MemoryKV(),
    BOT_TOKEN: "123:TEST_TOKEN",
    WEBHOOK_SECRET: "root-secret",
    VAULT_KEY: "a-long-root-vault-key-over-32-characters",
    TEST_MODE: true,
    APP_VERSION: "test",
  };
  env.BOT_STATE = {
    idFromName: (name) => name,
    get(name) {
      if (!instances.has(name))
        instances.set(
          name,
          new BotCoordinator(
            {
              storage: storage(),
              waitUntil(p) {
                return p;
              },
            },
            env,
          ),
        );
      return instances.get(name);
    },
  };
  const r = await call(
    "POST",
    "/api/auth/login",
    { password: "botpanel123" },
    false,
  );
  token = r.body.data.token;
});
afterEach(() => {
  globalThis.fetch = realFetch;
  for (const db of databases) db.close();
});
async function raw(method, path, body, auth = true, extraHeaders = {}) {
  return worker.fetch(
    new Request("https://panel.example.com" + path, {
      method,
      headers: {
        "content-type": "application/json",
        ...(auth ? { authorization: "Bearer " + token } : {}),
        ...extraHeaders,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    env,
    {
      waitUntil(p) {
        return p;
      },
    },
  );
}
async function call(method, path, body, auth = true, headers = {}) {
  const r = await raw(method, path, body, auth, headers);
  return { status: r.status, body: await r.json() };
}
async function create() {
  const r = await call("POST", "/api/bots", {
    title: "Child instance",
    token: "777:CHILD_TOKEN",
  });
  assert.equal(r.status, 200, JSON.stringify(r));
  return r.body.data.bot;
}
async function signed(id, botToken) {
  const p = new URLSearchParams({
    auth_date: String(Math.floor(Date.now() / 1000)),
    user: JSON.stringify({ id, first_name: "Child customer" }),
  });
  const check = [...p.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, v]) => k + "=" + v)
    .join("\n");
  p.set("hash", hex(await hmac(await hmac("WebAppData", botToken), check)));
  return p.toString();
}

test("managed bots initialize isolated state without copying root credentials or legacy data", async () => {
  await env.BOT_KV.put(
    "user:900",
    JSON.stringify({ id: 900, firstName: "Root legacy" }),
  );
  const bot = await create();
  assert.equal(bot.telegramId, "777");
  assert(!JSON.stringify(bot).includes("CHILD_TOKEN"));
  const child = instances.get("managed-bot:" + bot.id);
  assert.equal(await child.kv.get("user:900"), null);
  const r = await call("GET", `/api/bots/${bot.id}/admin/api/settings`);
  assert.equal(r.status, 200);
  assert.equal(r.body.data.settings.botUsername, "child_bot");
  assert.equal(r.body.data.settings.botPurpose, "vpn");
  assert.equal((await child.environment()).BOT_TOKEN, "777:CHILD_TOKEN");
  assert.equal((await child.environment()).ZARINPAL_MERCHANT_ID, undefined);
});
test("public child paths cannot impersonate an administrator or reach parent APIs", async () => {
  const b = await create();
  let r = await raw(
    "GET",
    `/bots/${b.id}/api/services/accounts`,
    undefined,
    false,
    { "x-managed-admin": "1", "x-managed-route": "/api/services/accounts" },
  );
  assert.equal(r.status, 404);
  r = await raw("GET", `/bots/${b.id}/api/portal/wallet`, undefined, false, {
    "x-managed-admin": "1",
  });
  assert.equal(r.status, 401);
  r = await raw("GET", "/internal/managed/dispatch", undefined, true, {
    "x-managed-admin": "1",
  });
  assert.equal(r.status, 404);
});
test("child customer login uses its own bot secret and wallet namespace", async () => {
  const b = await create();
  let r = await call(
    "POST",
    `/bots/${b.id}/api/portal/login`,
    { initData: await signed(42, "123:TEST_TOKEN") },
    false,
  );
  assert.equal(r.status, 401);
  r = await call(
    "POST",
    `/bots/${b.id}/api/portal/login`,
    { initData: await signed(42, "777:CHILD_TOKEN") },
    false,
  );
  assert.equal(r.status, 200, JSON.stringify(r));
  const ct = r.body.data.token;
  const child = instances.get("managed-bot:" + b.id);
  await call(
    "POST",
    `/api/bots/${b.id}/admin/api/services/accounts/42/adjust`,
    {
      amount: 1000,
      reason: "Child only credit",
      requestId: "child-test-credit",
    },
  );
  const own = await call(
    "GET",
    `/bots/${b.id}/api/portal/wallet`,
    undefined,
    false,
    { authorization: "Bearer " + ct },
  );
  assert.equal(own.body.data.account.balance, 1000);
  const root = instances.get("telegram-bot-panel-v2");
  assert.equal((await account(root.env, 42)).balance, 0);
  assert.equal((await account(await child.environment(), 42)).balance, 1000);
});
test("child webhook registration has its own route and secret", async () => {
  const b = await create();
  const r = await call("POST", `/api/bots/${b.id}/webhook`);
  assert.equal(r.status, 200);
  const sent = tg.calls.find((c) => c.method === "setWebhook");
  assert.equal(
    sent.payload.url,
    `https://panel.example.com/bots/${b.id}/telegram/webhook`,
  );
  assert.notEqual(sent.payload.secret_token, "root-secret");
  const bad = await call(
    "POST",
    `/bots/${b.id}/telegram/webhook`,
    { update_id: 1 },
    false,
    { "x-telegram-bot-api-secret-token": "root-secret" },
  );
  assert.equal(bad.status, 401);
});
test("child admin proxy cannot create nested bots or replace its identity through general settings", async () => {
  const b = await create();
  let r = await call("POST", `/api/bots/${b.id}/admin/api/bots`, {
    title: "Nested",
    token: "777:CHILD_TOKEN",
  });
  assert.equal(r.status, 403);
  r = await call("PUT", `/api/bots/${b.id}/admin/api/settings`, {
    botToken: "123:ROOT_OTHER",
  });
  assert.equal(r.status, 400);
  assert.equal(r.body.error, "managed_token_change_use_manager");
});
