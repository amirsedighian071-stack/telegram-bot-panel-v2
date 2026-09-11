// Adding a button in the default (custom) workspace must never stop the bot from
// answering /start. Telegram limits callback_data to 64 *bytes*, so a long
// Persian value used to make it reject the whole keyboard with a 400 — the user
// saw a dead bot until the button was deleted again.
import test from "node:test";
import assert from "node:assert/strict";
import { setup, telegramMock, MemoryKV } from "./helpers.mjs";

const realFetch = globalThis.fetch;
const bytes = (s) => new TextEncoder().encode(String(s ?? "")).length;

// A realistic Persian callback value: 39 characters, but 76 UTF-8 bytes.
const FA_VALUE = "پشتیبانی و پاسخ به سوالات متداول کاربران";

function hookTelegram(mock) {
  globalThis.fetch = (u, o) => (String(u).startsWith("https://api.telegram.org/") ? mock.fetcher(u, o) : realFetch(u, o));
}
function unhookTelegram() {
  globalThis.fetch = realFetch;
}

// Everything Telegram refuses about an inline keyboard button.
function assertValidKeyboard(markup) {
  const kb = markup && markup.inline_keyboard;
  assert.ok(Array.isArray(kb), "reply_markup.inline_keyboard must be an array");
  for (const row of kb) {
    assert.ok(Array.isArray(row) && row.length, "every row must hold at least one button");
    assert.ok(row.length <= 8, "a row holds at most 8 buttons");
    for (const b of row) {
      assert.ok(typeof b.text === "string" && b.text.length >= 1 && b.text.length <= 64, `bad button text: ${JSON.stringify(b.text)}`);
      const fields = ["callback_data", "url", "web_app", "switch_inline_query"].filter((k) => b[k] !== undefined);
      assert.equal(fields.length, 1, "a button carries exactly one action");
      if (b.callback_data !== undefined) {
        assert.ok(bytes(b.callback_data) >= 1 && bytes(b.callback_data) <= 64, `callback_data over 64 bytes: ${b.callback_data} (${bytes(b.callback_data)} bytes)`);
      }
      if (b.url !== undefined) assert.ok(/^https?:|^tg:/.test(b.url) && b.url.length <= 512, "bad url button");
      if (b.web_app !== undefined) assert.ok(/^https:/.test(b.web_app.url), "web_app buttons require https");
    }
  }
}

const startKeyboard = (mock) => mock.sent().map((c) => c.payload.reply_markup).find(Boolean);

test("an over-long Persian callback value is stored safely and /start still answers", async () => {
  assert.ok(bytes(FA_VALUE) > 64, "the sample value must exceed 64 bytes to be a regression test");
  const mock = telegramMock();
  hookTelegram(mock);
  try {
    const { api, msg } = await setup();
    await api("PUT", "/settings", { botPurpose: "custom", customModules: ["menu"] });

    const menu = (await api("GET", "/menu")).data.menu;
    const body = JSON.parse(JSON.stringify(menu));
    body.inlineButtons = [[{ text: "پشتیبانی", type: "callback", value: FA_VALUE }]];
    const saved = await api("PUT", "/menu", body);
    assert.equal(saved.ok, true);
    const stored = saved.data.menu.inlineButtons[0][0].value;
    assert.ok(bytes(stored) <= 64, `stored callback_data must fit in 64 bytes, got ${bytes(stored)}`);
    assert.ok(stored.startsWith("پشتیبانی"), "the value is trimmed, not silently dropped");

    mock.clear();
    await msg(7001, "/start");
    const reply = mock.sent().find((c) => c.method === "sendMessage");
    assert.ok(reply, "the bot must reply to /start");
    assertValidKeyboard(reply.payload.reply_markup);
    assert.equal(reply.payload.reply_markup.inline_keyboard.length, 1, "the admin's button survives");
  } finally {
    unhookTelegram();
  }
});

test("a legacy over-long button already in storage cannot silence /start", async () => {
  const mock = telegramMock();
  hookTelegram(mock);
  try {
    const { env, api, msg } = await setup();
    await api("PUT", "/settings", { botPurpose: "custom", customModules: ["menu"] });
    // Written behind the API's back, the way an old install would look.
    await env.BOT_KV.put("menu", JSON.stringify({
      welcome: { fa: "سلام", en: "hi" }, help: { fa: "h", en: "h" },
      inlineButtons: [
        [{ text: "دکمه خراب", type: "callback", value: FA_VALUE }],
        [{ text: "سایت", type: "url", value: "https://example.com" }],
      ],
      submenus: {},
    }));

    mock.clear();
    await msg(7002, "/start");
    const reply = mock.sent().find((c) => c.method === "sendMessage");
    assert.ok(reply, "the bot must reply to /start");
    assertValidKeyboard(reply.payload.reply_markup);
    assert.equal(reply.payload.reply_markup.inline_keyboard.length, 2);
  } finally {
    unhookTelegram();
  }
});

test("Telegram rejecting a keyboard still delivers the message text", async () => {
  const mock = telegramMock();
  hookTelegram(mock);
  try {
    const { env, api, msg } = await setup();
    await api("PUT", "/settings", { botPurpose: "custom", customModules: ["menu"] });
    // Simulate a keyboard Telegram refuses for a reason the renderer cannot
    // detect (its own 400) — the reply must not be swallowed with it.
    mock.setOverride((url, method, payload) => {
      const kb = payload.reply_markup && payload.reply_markup.inline_keyboard;
      const bad = kb && kb.flat().some((b) => b.callback_data === "legacy:reject");
      if (bad) return { ok: false, error_code: 400, description: "Bad Request: BUTTON_DATA_INVALID" };
      return undefined;
    });
    const { saveMenu } = await import("../src/kv.js");
    await saveMenu(env, {
      welcome: { fa: "سلام", en: "hi" }, help: { fa: "h", en: "h" },
      inlineButtons: [[{ text: "دکمه", type: "callback", value: "legacy:reject" }]], submenus: {},
    });
    await msg(7003, "/start");
    const rejected = mock.calls.find((c) => c.method === "sendMessage" && c.payload.reply_markup);
    assert.ok(rejected, "the first attempt carries the keyboard");
    const reply = mock.sent().find((c) => c.method === "sendMessage" && !c.payload.reply_markup);
    assert.ok(reply, "the welcome text must still reach the user when the keyboard is refused");
    assert.match(reply.payload.text, /سلام/);
  } finally {
    unhookTelegram();
  }
});

test("text popups and submenus built from the panel still work", async () => {
  const mock = telegramMock();
  hookTelegram(mock);
  try {
    const { api, msg, cb } = await setup();
    await api("PUT", "/settings", { botPurpose: "custom", customModules: ["menu"] });
    const menu = (await api("GET", "/menu")).data.menu;
    const body = JSON.parse(JSON.stringify(menu));
    body.submenus = { shop: { title: "فروشگاه", text: "یک گزینه را انتخاب کنید", buttons: [[{ text: "لیست قیمت", type: "text", value: "قیمت‌ها به‌زودی!" }]] } };
    body.inlineButtons = [[{ text: "فروشگاه", type: "submenu", value: "shop" }, { text: "درباره ما", type: "text", value: "ما یک تیم کوچک هستیم." }]];
    assert.equal((await api("PUT", "/menu", body)).ok, true);

    mock.clear();
    await msg(7004, "/start");
    assertValidKeyboard(startKeyboard(mock));

    // Tap the text popup on the home screen.
    mock.clear();
    await cb(7004, "txt:root:0:1");
    const answer = mock.calls.find((c) => c.method === "answerCallbackQuery");
    assert.ok(answer, "the popup button must answer the callback");
    assert.equal(answer.payload.text, "ما یک تیم کوچک هستیم.");

    // Open the submenu and tap the popup inside it.
    mock.clear();
    await cb(7004, "sub:shop");
    const edit = mock.calls.find((c) => c.method === "editMessageText");
    assert.ok(edit, "a submenu opens by editing the home message");
    assertValidKeyboard(edit.payload.reply_markup);
    assert.equal(edit.payload.reply_markup.inline_keyboard.at(-1)[0].callback_data, "sub:root", "a back button is appended");

    mock.clear();
    await cb(7004, "txt:shop:0:0");
    const popup = mock.calls.find((c) => c.method === "answerCallbackQuery");
    assert.equal(popup.payload.text, "قیمت‌ها به‌زودی!");
  } finally {
    unhookTelegram();
  }
});

test("junk rows in a stored menu are skipped instead of throwing", async () => {
  const { inlineMarkup, rootInlineRows } = await import("../src/telegram.js");
  const settings = { botPurpose: "custom", customModules: ["menu"], supportButton: { enabled: false } };
  const menu = {
    explicitInlineButtons: [null, { text: "not a row" }, [null], [], [{ text: "سالم", type: "callback", value: "ok" }]],
    submenus: {},
  };
  const markup = inlineMarkup(menu, settings, "fa");
  assertValidKeyboard(markup);
  assert.equal(markup.inline_keyboard.length, 1, "only the usable button is rendered");
  // Row positions stay the source of truth for `txt:` popups, so the row list is
  // only filtered at row level — and every entry in it is still a real array.
  const rows = rootInlineRows(menu, settings, "fa");
  assert.ok(rows.every(Array.isArray), "no non-array rows leak into the renderer");
  assert.ok(!rows.some((row) => row.some((b) => b && typeof b !== "object")), "no stray button objects");
});

test("the menu editor in MemoryKV round-trips an empty button list", async () => {
  const kv = new MemoryKV();
  await kv.put("menu", JSON.stringify({ welcome: { fa: "w", en: "w" }, help: { fa: "h", en: "h" }, inlineButtons: [], submenus: {} }));
  const { withMenuDefaults } = await import("../src/kv.js");
  const menu = withMenuDefaults(JSON.parse(await kv.get("menu")));
  assert.deepEqual(menu.explicitInlineButtons, [], "an explicitly empty list stays empty for a default bot");
});
