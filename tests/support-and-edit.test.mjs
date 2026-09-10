import test, { beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { setup, telegramMock } from "./helpers.mjs";
import { hash, hex, hmac } from "../src/services/common.js";
import { getTicket } from "../src/kv.js";

let h, tg;
const oldFetch = globalThis.fetch;
beforeEach(async () => {
  tg = telegramMock();
  globalThis.fetch = tg.fetcher;
  h = await setup();
  h.env.VAULT_KEY = "test-encryption-key-32-characters-long";
  h.env.PUBLIC_BASE_URL = "https://panel.example.com";
});
afterEach(() => (globalThis.fetch = oldFetch));

async function initData(id) {
  const data = new URLSearchParams({
    user: JSON.stringify({ id, first_name: "Customer", language_code: "fa" }),
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: "query-" + id,
  });
  const check = [...data.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, v]) => k + "=" + v)
    .join("\n");
  data.set(
    "hash",
    hex(await hmac(await hmac("WebAppData", "123:TEST_TOKEN"), check)),
  );
  return data.toString();
}
async function customer(id) {
  await h.msg(id, "/start");
  const res = await h.raw("POST", "/api/portal/login", {
    body: { initData: await initData(id) },
  });
  const body = await res.json();
  assert.equal(res.status, 200, JSON.stringify(body));
  return body.data.token;
}
const portal = async (token, method, path, body) => {
  const r = await h.raw(method, "/api/portal" + path, { token, body });
  return { status: r.status, ...(await r.json()) };
};

test("mini app support messages reach the panel inbox and the reply returns to the customer", async () => {
  await h.settings({ botPurpose: "vpn" });
  const token = await customer(51);

  const sent = await portal(token, "POST", "/support", {
    text: "سرویس من وصل نمی‌شود",
  });
  assert.equal(sent.status, 200, JSON.stringify(sent));
  assert.equal(sent.data.support.messages.at(-1).from, "customer");

  // The panel sees the very same ticket the bot conversation would create.
  const inbox = await h.api("GET", "/support/tickets");
  const row = inbox.data.tickets.find((t) => t.id === "51");
  assert(row, "ticket is missing from the panel inbox");
  assert.equal(row.unread, 1);

  tg.clear();
  const reply = await h.api("POST", "/support/tickets/51/reply", {
    text: "پیکربندی جدید ارسال شد",
  });
  assert.equal(reply.status, 200, JSON.stringify(reply));
  assert.equal(reply.data.delivered, true);
  const delivered = tg.sent().find((c) => String(c.payload.chat_id) === "51");
  assert(
    delivered.payload.text.includes("پیکربندی جدید ارسال شد"),
    "the reply is not delivered in Telegram",
  );

  // ... and the same answer is readable inside the Mini App.
  const thread = await portal(token, "GET", "/support");
  assert.equal(thread.status, 200);
  assert.equal(thread.data.support.messages.at(-1).from, "support");
  assert.equal(
    thread.data.support.messages.at(-1).text,
    "پیکربندی جدید ارسال شد",
  );

  // Reading the thread clears the Mini App unread badge.
  const boot = await portal(token, "GET", "/bootstrap");
  assert.equal(boot.data.support.unread, 0);
  assert.equal((await getTicket(h.env, 51)).messages.length, 2);
});

test("mini app support rejects empty text and respects the support module switch", async () => {
  await h.settings({ botPurpose: "vpn" });
  const token = await customer(52);
  assert.equal((await portal(token, "POST", "/support", { text: " " })).status, 400);

  await h.settings({ botPurpose: "custom", customModules: ["services"] });
  const blocked = await portal(token, "POST", "/support", { text: "سلام" });
  assert.equal(blocked.status, 400);
  assert.equal(blocked.error, "support_disabled");
});

test("tapping an inline button edits the open message instead of sending a new one", async () => {
  await h.settings({ botPurpose: "custom", customModules: ["menu", "faq"] });
  // The default menu has no buttons; the admin adds one (submenu type) first.
  const savedMenu = await h.api("PUT", "/menu", {
    inlineButtons: [[{ text: "فروشگاه", type: "submenu", value: "shop" }]],
    submenus: { shop: { title: "فروشگاه", text: "یکی را انتخاب کنید", buttons: [] } },
  });
  assert.equal(savedMenu.ok, true, JSON.stringify(savedMenu));
  await h.msg(70, "/start");
  tg.clear();

  await h.cb(70, "sub:shop");
  const afterSubmenu = tg.calls.filter((c) => c.method === "sendMessage");
  assert.equal(afterSubmenu.length, 0, "a submenu must not post a new message");
  assert.equal(
    tg.calls.filter((c) => c.method === "editMessageText").length,
    1,
  );

  const faq = await h.api("POST", "/studio/faq", {
    question: "پرسش",
    answer: "پاسخ",
  });
  tg.clear();
  await h.cb(70, "faq:list");
  assert.equal(
    tg.calls.filter((c) => c.method === "sendMessage").length,
    0,
    "the FAQ list must replace the message it was opened from",
  );
  const edit = tg.calls.find((c) => c.method === "editMessageText");
  assert.equal(edit.payload.message_id, 10);
  assert.equal(String(edit.payload.chat_id), "70");

  // Screens without buttons (plain answers or delivered content) stay separate messages.
  tg.clear();
  await h.cb(70, "faq:" + faq.data.faq.id);
  assert.equal(
    tg.calls.filter((c) => c.method === "editMessageText").length,
    1,
    "an answer with a back button replaces the list",
  );
});

test("a message that cannot be edited still reaches the user, and typed commands always answer with a new message", async () => {
  await h.settings({ botPurpose: "custom", customModules: ["menu"] });
  await h.msg(71, "/start");
  tg.clear();
  tg.setOverride(async (url, method) => {
    if (method !== "editMessageText") return undefined;
    return { ok: false, error_code: 400, description: "message to edit not found" };
  });
  await h.cb(71, "setlang:en");
  assert.equal(
    tg.calls.filter((c) => c.method === "sendMessage").length,
    1,
    "the fallback message was not delivered",
  );

  tg.setOverride(null);
  tg.clear();
  await h.msg(71, "/ping");
  assert.equal(tg.calls.filter((c) => c.method === "sendMessage").length, 1);
  assert.equal(tg.calls.filter((c) => c.method === "editMessageText").length, 0);
});
