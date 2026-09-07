import test, { beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import worker, { BotCoordinator } from "../src/index.js";
import { MemoryKV } from "./helpers.mjs";
import { setAdminPassword } from "../src/auth.js";
let env, instance, db;
beforeEach(() => {
  db = new DatabaseSync(":memory:");
  let alarm = null;
  const storage = {
    sql: {
      exec(sql, ...args) {
        const rows = db.prepare(sql).all(...args);
        return { toArray: () => rows };
      },
    },
    transactionSync(fn) {
      db.exec("BEGIN");
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
    async setAlarm(value) {
      alarm = value;
    },
  };
  env = { BOT_KV: new MemoryKV() };
  env.BOT_STATE = { idFromName: () => "root", get: () => instance };
  instance = new BotCoordinator(
    {
      storage,
      waitUntil(p) {
        return p;
      },
    },
    env,
  );
});
afterEach(() => db.close());
async function call(method, path, body, token) {
  const r = await worker.fetch(
    new Request("https://panel.example.com/api" + path, {
      method,
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: "Bearer " + token } : {}),
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
  return { status: r.status, ...(await r.json()) };
}
test("production login has a default password with no environment variables", async () => {
  const status = await call("GET", "/auth/default-status");
  assert.equal(status.data.defaultActive, true);
  assert.equal(status.data.setupRequired, false);
  const login = await call("POST", "/auth/login", { password: "botpanel123" });
  assert.equal(login.status, 200);
  assert.equal(login.data.requiresPasswordChange, true);
});
test("initial sessions cannot read credentials, mutate money or manage child bots", async () => {
  const token = (await call("POST", "/auth/login", { password: "botpanel123" }))
    .data.token;
  for (const [method, path] of [
    ["GET", "/settings"],
    ["GET", "/services/accounts"],
    ["POST", "/bots"],
    ["POST", "/broadcast"],
  ]) {
    const r = await call(
      method,
      path,
      method === "POST" ? {} : undefined,
      token,
    );
    assert.equal(r.status, 403);
    assert.equal(r.error, "password_change_required");
  }
  assert.equal(
    (await call("GET", "/auth/session", undefined, token)).data
      .requiresPasswordChange,
    true,
  );
});
test("in-panel setup persists the new password and revokes all other initial sessions", async () => {
  const token = (await call("POST", "/auth/login", { password: "botpanel123" }))
      .data.token,
    sibling = (await call("POST", "/auth/login", { password: "botpanel123" }))
      .data.token;
  assert.equal(
    (
      await call(
        "POST",
        "/auth/change-password",
        {
          currentPassword: "botpanel123",
          newPassword: "My-private-password-2026",
        },
        token,
      )
    ).status,
    200,
  );
  assert.equal((await call("GET", "/settings", undefined, token)).status, 200);
  assert.equal(
    (await call("GET", "/auth/session", undefined, token)).data
      .requiresPasswordChange,
    false,
  );
  assert.equal(
    (await call("GET", "/auth/session", undefined, sibling)).status,
    401,
  );
  assert.equal(
    (await call("POST", "/auth/login", { password: "botpanel123" })).status,
    401,
  );
  assert.equal(
    (
      await call("POST", "/auth/login", {
        password: "My-private-password-2026",
      })
    ).data.requiresPasswordChange,
    false,
  );
});
test("the public initial password cannot be kept as the private password", async () => {
  const token = (await call("POST", "/auth/login", { password: "botpanel123" }))
    .data.token;
  const r = await call(
    "POST",
    "/auth/change-password",
    { currentPassword: "botpanel123", newPassword: "botpanel123" },
    token,
  );
  assert.equal(r.status, 400);
  assert.equal(r.error, "default_password_not_allowed");
  assert.equal((await call("GET", "/settings", undefined, token)).status, 403);
});
test("an existing custom password is preserved and optional ADMIN_PASSWORD still works", async () => {
  instance.env.ADMIN_PASSWORD = "environment-password";
  assert.equal(
    (await call("POST", "/auth/login", { password: "botpanel123" })).status,
    401,
  );
  assert.equal(
    (await call("POST", "/auth/login", { password: "environment-password" }))
      .status,
    200,
  );
  await setAdminPassword(instance.env, "stored-private-password");
  assert.equal(
    (await call("POST", "/auth/login", { password: "stored-private-password" }))
      .status,
    200,
  );
  assert.equal(
    (await call("POST", "/auth/login", { password: "environment-password" }))
      .status,
    401,
  );
});
