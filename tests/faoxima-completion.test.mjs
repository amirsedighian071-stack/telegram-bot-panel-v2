import test, { beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { setup, telegramMock } from "./helpers.mjs";
import { get, put, list } from "../src/services/common.js";
import {
  serviceSettings,
  saveServiceSettings,
} from "../src/services/settings.js";
import {
  parseMarketPrices,
  refreshMarketRates,
  quoteRates,
  MARKET_ENDPOINT,
} from "../src/services/rates.js";
import {
  saveGateway,
  createPayment,
  verifyPayment,
} from "../src/services/payments.js";
import { playDice, dailyReportTick } from "../src/services/engagement.js";
import { account, updateAccount } from "../src/services/wallet.js";
let h, tg;
const oldFetch = globalThis.fetch;
beforeEach(async () => {
  tg = telegramMock();
  globalThis.fetch = tg.fetcher;
  h = await setup();
  h.env.VAULT_KEY = "completion-test-vault-key-with-over-32-characters";
  h.env.PUBLIC_BASE_URL = "https://panel.example.com";
  await h.msg(42, "/start");
});
afterEach(() => (globalThis.fetch = oldFetch));
const payload = (usd = 100000) => ({
  status: "OK",
  result: { "TRX/IRT": "20,000.99", "TON/IRT": 200000, "USDT/IRT": usd },
});
test("reference market parser enforces IRT pairs, positive values and strict decimal data", () => {
  assert.deepEqual(parseMarketPrices(payload()), {
    TRX: 20000,
    TON: 200000,
    USD: 100000,
  });
  assert.throws(
    () =>
      parseMarketPrices({
        status: "OK",
        result: { "TRX/IRR": 20000, "USDT/IRT": 100000, "TON/IRT": 200000 },
      }),
    /missing/,
  );
  assert.throws(() => parseMarketPrices(payload(-1)));
  assert.throws(() =>
    parseMarketPrices({
      status: "OK",
      result: { ...payload().result, "TRX/IRT": "20oops" },
    }),
  );
});
test("automatic rates are cached and unavailable stale prices cannot create new invoices", async () => {
  await saveServiceSettings(h.env, {
    rates: { mode: "swapwallet", refreshMinutes: 1, maxAgeMinutes: 3 },
  });
  let requests = 0;
  tg.setOverride((u) => {
    if (u === MARKET_ENDPOINT) {
      requests++;
      return payload();
    }
  });
  await quoteRates(h.env, { type: "crypto", currency: "TRX" });
  await quoteRates(h.env, { type: "crypto", currency: "TRX" });
  assert.equal(requests, 1);
  const cache = await get(h.env, "market", "latest");
  cache.at = Date.now() - 10 * 60000;
  await put(h.env, "market", "latest", cache);
  tg.setOverride((u) => {
    if (u === MARKET_ENDPOINT) throw new Error("offline");
  });
  await assert.rejects(() =>
    quoteRates(h.env, { type: "crypto", currency: "TRX" }),
  );
  const old = await get(h.env, "market", "latest");
  assert.equal(old.rates.TRX, 20000);
  assert(old.error);
});
test("a funding invoice retains its quote when market rates change", async () => {
  await saveServiceSettings(h.env, {
    rates: { mode: "swapwallet", refreshMinutes: 1, maxAgeMinutes: 3 },
  });
  let rate = 100000;
  tg.setOverride((u) => (u === MARKET_ENDPOINT ? payload(rate) : undefined));
  const g = await saveGateway(h.env, {
    type: "crypto",
    title: "TRON",
    currency: "TRX",
    address: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
    coinToman: 0,
    enabled: true,
  });
  const a = await createPayment(h.env, 42, {
    amount: 10000,
    gatewayId: g.id,
    requestId: "quote_lock_001",
  });
  const saved = await get(h.env, "payment", a.id);
  assert.equal(saved.cryptoAmount, "0.500000");
  rate = 200000;
  await refreshMarketRates(h.env);
  assert.equal(
    (await get(h.env, "payment", a.id)).rateSnapshot.usdToman,
    100000,
  );
  assert.equal((await get(h.env, "payment", a.id)).cryptoAmount, "0.500000");
});
test("TetraPay creates a rial invoice and verifies stored authority/hash before wallet credit", async () => {
  let created, verified;
  tg.setOverride((u, m, p) => {
    if (u.endsWith("/api/create_order")) {
      created = p;
      return {
        Authority: "tetra-auth-1",
        payment_url_bot: "https://t.me/tetra_test?start=abc",
      };
    }
    if (u === "https://tetra98.com/api/verify") {
      verified = p;
      return {
        status: 100,
        authority: "tetra-auth-1",
        hashid: created.Hash_id,
        Amount: "100000",
      };
    }
  });
  const g = await saveGateway(h.env, {
    type: "tetrapay",
    title: "Tetra",
    secret: { apiKey: "tetra-key" },
    enabled: true,
  });
  const v = await createPayment(h.env, 42, {
    amount: 10000,
    gatewayId: g.id,
    requestId: "tetra_order_1",
  });
  assert.equal(created.Amount, "100000");
  assert(created.CallbackURL.includes("/service-pay/callback/"));
  const p = await get(h.env, "payment", v.id);
  await assert.rejects(
    () => verifyPayment(h.env, p, { authority: "forged" }),
    /authority/,
  );
  await verifyPayment(h.env, p, { authority: "tetra-auth-1", hashid: p.id });
  assert.equal(verified.hashid, p.id);
  assert.equal((await account(h.env, 42)).balance, 10000);
  await verifyPayment(h.env, p, {});
  assert.equal((await account(h.env, 42)).balance, 10000);
});
test("Factor API freezes TRX amount and rejects a different factor before settling", async () => {
  let factorAmount,
    bad = true;
  tg.setOverride((u, m, p) => {
    if (u.endsWith("/api/factor/create")) {
      factorAmount = p.amount;
      assert.equal(p.base, "trx");
      return { success: true, data: { id: "factor-1" } };
    }
    if (u.includes("/api/factor/status"))
      return {
        success: true,
        data: {
          id: bad ? "different" : "factor-1",
          status: "approved",
          amount: factorAmount,
          base: "trx",
        },
      };
  });
  const g = await saveGateway(h.env, {
    type: "iranpay3",
    title: "Factor",
    secret: { apiKey: "factor-key" },
    coinToman: 20000,
    address: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
  });
  const v = await createPayment(h.env, 42, {
    amount: 10000,
    gatewayId: g.id,
    requestId: "factor_order_1",
  });
  assert.equal(factorAmount, "0.50");
  const p = await get(h.env, "payment", v.id);
  await assert.rejects(() => verifyPayment(h.env, p), /invoice_mismatch/);
  bad = false;
  await verifyPayment(h.env, p);
  assert.equal((await account(h.env, 42)).balance, 10000);
});
test("dice uses Telegram result only and awards once while respecting cooldown", async () => {
  await saveServiceSettings(h.env, {
    dice: {
      enabled: true,
      emoji: "🎲",
      prize: 1000,
      intervalHours: 24,
      newUsersOnly: true,
      agentsAllowed: false,
      budget: 5000,
    },
  });
  tg.setOverride((u, m) =>
    m === "sendDice"
      ? {
          ok: true,
          result: { message_id: 123, dice: { emoji: "🎲", value: 6 } },
        }
      : undefined,
  );
  const r = await playDice(h.env, 42, "dice_once_001");
  assert.equal(r.won, true);
  await playDice(h.env, 42, "dice_once_001");
  assert.equal((await account(h.env, 42)).balance, 1000);
  assert.equal(tg.calls.filter((c) => c.method === "sendDice").length, 1);
  await assert.rejects(() => playDice(h.env, 42, "dice_again_002"), /cooldown/);
});
test("slot results have the reference winning outcomes; fabricated or failed replies do not award", async () => {
  await saveServiceSettings(h.env, {
    dice: {
      enabled: true,
      emoji: "🎰",
      prize: 2000,
      intervalHours: 1,
      newUsersOnly: false,
      agentsAllowed: true,
      budget: 10000,
    },
  });
  tg.setOverride((u, m) =>
    m === "sendDice"
      ? { ok: true, result: { dice: { emoji: "🎲", value: 64 } } }
      : undefined,
  );
  const r = await playDice(h.env, 42, "slots_bad_001");
  assert.equal(r.status, "failed");
  assert.equal((await account(h.env, 42)).balance, 0);
  assert.equal((await list(h.env, "dice-budget"))[0].reserved, 0);
});
test("daily summary sends only once within its Tehran report hour", async () => {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Tehran",
      hour: "2-digit",
      hourCycle: "h23",
    }).format(new Date()),
  );
  await saveServiceSettings(h.env, {
    reportChat: "@reports",
    dailyReport: { enabled: true, hour },
  });
  await dailyReportTick(h.env);
  await dailyReportTick(h.env);
  assert.equal(
    tg.calls.filter(
      (c) => c.method === "sendMessage" && c.payload.chat_id === "@reports",
    ).length,
    1,
  );
});
