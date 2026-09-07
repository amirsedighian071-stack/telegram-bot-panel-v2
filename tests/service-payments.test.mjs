import test, { beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { setup, telegramMock } from "./helpers.mjs";
import {
  saveGateway,
  createPayment,
  verifyPayment,
  handleServicePayment,
} from "../src/services/payments.js";
import { saveServiceSettings } from "../src/services/settings.js";
import { get, hash, hmac, hex } from "../src/services/common.js";
import { account } from "../src/services/wallet.js";
import { verifyCrypto } from "../src/services/crypto-pay.js";
let h, tg;
const realFetch = globalThis.fetch;
beforeEach(async () => {
  tg = telegramMock();
  globalThis.fetch = tg.fetcher;
  h = await setup();
  h.env.VAULT_KEY = "test-payment-vault-key-at-least-32-characters";
  h.env.PUBLIC_BASE_URL = "https://panel.example.com";
  await h.msg(42, "/start");
  await saveServiceSettings(h.env, { usdToman: 100000 });
});
afterEach(() => (globalThis.fetch = realFetch));
async function gateway(type) {
  return saveGateway(h.env, {
    title: type,
    type,
    enabled: true,
    currency: "TRX",
    secret: {
      apiKey: "api-key",
      merchant: "merchant",
      ipnSecret: "ipn-secret",
    },
  });
}
const canonical = (o) =>
  Array.isArray(o)
    ? o.map(canonical)
    : o && typeof o === "object"
      ? Object.fromEntries(
          Object.keys(o)
            .sort()
            .map((k) => [k, canonical(o[k])]),
        )
      : o;

test("service Zarinpal validates server amount and credits the wallet only once", async () => {
  const g = await gateway("zarinpal");
  let amount;
  tg.setOverride((url, m, p) => {
    if (url.includes("/request.json"))
      return { data: { code: 100, authority: "AUTH123" } };
    if (url.includes("/verify.json")) {
      amount = p.amount;
      return { data: { code: 100, ref_id: "123456" } };
    }
  });
  const view = await createPayment(h.env, 42, {
    amount: 10000,
    gatewayId: g.id,
    requestId: "wallet_zarin_1",
  });
  let p = await get(h.env, "payment", view.id);
  await verifyPayment(h.env, p, { Authority: "AUTH123" });
  await verifyPayment(h.env, p, { Authority: "AUTH123" });
  assert.equal(amount, 100000);
  assert.equal((await account(h.env, 42)).balance, 10000);
});
test("service Aqaye gateway uses toman and the stored transaction ID", async () => {
  const g = await gateway("aqaye");
  let verify;
  tg.setOverride((url, m, p) => {
    if (url.endsWith("/api/v2/create")) return { code: 1, transid: "trans123" };
    if (url.endsWith("/api/v2/verify")) {
      verify = p;
      return { code: 1 };
    }
  });
  const view = await createPayment(h.env, 42, {
    amount: 10000,
    gatewayId: g.id,
    requestId: "wallet_aqaye_1",
  });
  await verifyPayment(h.env, await get(h.env, "payment", view.id), {
    transid: "trans123",
  });
  assert.equal(verify.amount, 10000);
  assert.equal(verify.transid, "trans123");
  assert.equal((await account(h.env, 42)).balance, 10000);
});
test("service Zarinpay gateway verifies the immutable order ID and rial amount", async () => {
  const g = await gateway("zarinpay");
  let verify;
  tg.setOverride((url, m, p) => {
    if (url.endsWith("create-payment"))
      return {
        success: true,
        data: {
          authority: "ZP123",
          payment_link: "https://zarinpay.me/pay/ZP123",
        },
      };
    if (url.endsWith("verify-payment")) {
      verify = p;
      return { success: true, data: { code: 100 } };
    }
  });
  const view = await createPayment(h.env, 42, {
    amount: 10000,
    gatewayId: g.id,
    requestId: "wallet_zp_0001",
  });
  await verifyPayment(h.env, await get(h.env, "payment", view.id), {
    authority: "ZP123",
  });
  assert.equal(verify.amount, 100000);
  assert.equal(verify.order_id, view.id);
});
test("NOWPayments rejects a mismatching invoice, insufficient funds and unfinished status", async () => {
  const g = await gateway("nowpayments");
  let inv,
    mode = "wrong";
  tg.setOverride((url, m, p) => {
    if (url.endsWith("/v1/invoice")) {
      inv = p;
      return { id: 1234, invoice_url: "https://nowpayments.io/invoice/1234" };
    }
    if (url.endsWith("/payment/99"))
      return {
        invoice_id: mode === "wrong" ? 888 : 1234,
        order_id: inv.order_id,
        price_amount: 0.1,
        price_currency: "usd",
        payment_status: mode === "pending" ? "confirmed" : "finished",
        actually_paid: mode === "under" ? 0.00000001 : 0.0000001,
        pay_amount: 0.0000001,
      };
  });
  const view = await createPayment(h.env, 42, {
    amount: 10000,
    gatewayId: g.id,
    requestId: "nowpay_invoice_1",
  });
  const p = await get(h.env, "payment", view.id);
  await assert.rejects(
    () => verifyPayment(h.env, p, { payment_id: "99" }),
    /invoice_mismatch/,
  );
  mode = "under";
  await assert.rejects(
    () => verifyPayment(h.env, p, { payment_id: "99" }),
    /underpayment/,
  );
  mode = "pending";
  await assert.rejects(
    () => verifyPayment(h.env, p, { payment_id: "99" }),
    /not_finished/,
  );
  mode = "ok";
  await verifyPayment(h.env, p, { payment_id: "99" });
  assert.equal((await account(h.env, 42)).balance, 10000);
});
test("NOWPayments webhook requires a valid HMAC then independently verifies provider data", async () => {
  const g = await gateway("nowpayments");
  let orderId;
  tg.setOverride((url, m, p) => {
    if (url.endsWith("/v1/invoice")) {
      orderId = p.order_id;
      return { id: 5678, invoice_url: "https://nowpayments.io/invoice/5678" };
    }
    if (url.endsWith("/payment/88"))
      return {
        invoice_id: 5678,
        order_id: orderId,
        price_currency: "usd",
        price_amount: "0.10",
        payment_status: "finished",
        actually_paid: "1",
        pay_amount: "1",
      };
  });
  const view = await createPayment(h.env, 42, {
      amount: 10000,
      gatewayId: g.id,
      requestId: "nowpay_hmac_1",
    }),
    p = await get(h.env, "payment", view.id);
  const body = {
    payment_id: 88,
    invoice_id: 5678,
    order_id: orderId,
    payment_status: "finished",
  };
  const url = `https://panel.example.com/service-pay/notify/${p.id}?key=${p.nonce}`;
  let r = await handleServicePayment(
    new Request(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-nowpayments-sig": "bad",
      },
      body: JSON.stringify(body),
    }),
    h.env,
  );
  assert.equal(r.status, 403);
  assert.equal((await account(h.env, 42)).balance, 0);
  const signature = hex(
    await hmac("ipn-secret", JSON.stringify(canonical(body)), "SHA-512"),
  );
  r = await handleServicePayment(
    new Request(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-nowpayments-sig": signature,
      },
      body: JSON.stringify(body),
    }),
    h.env,
  );
  assert.equal(r.status, 200);
  assert.equal((await account(h.env, 42)).balance, 10000);
});
test("Plisio checks the exact operation ID, order number and USD source amount", async () => {
  const g = await gateway("plisio");
  let orderId,
    bad = true;
  tg.setOverride((url) => {
    const u = new URL(url);
    if (u.pathname.endsWith("/invoices/new")) {
      orderId = u.searchParams.get("order_number");
      return {
        status: "success",
        data: {
          txn_id: "p-100",
          invoice_url: "https://plisio.net/invoice/p-100",
        },
      };
    }
    if (u.pathname.endsWith("/operations"))
      return {
        status: "success",
        data: {
          operations: [
            {
              txn_id: "p-100",
              order_number: orderId,
              status: "completed",
              source_currency: "USD",
              source_amount: bad ? "0.01" : "0.10",
            },
          ],
        },
      };
  });
  const view = await createPayment(h.env, 42, {
      amount: 10000,
      gatewayId: g.id,
      requestId: "plisio_invoice_1",
    }),
    p = await get(h.env, "payment", view.id);
  await assert.rejects(() => verifyPayment(h.env, p), /amount_mismatch/);
  bad = false;
  await verifyPayment(h.env, p);
  assert.equal((await account(h.env, 42)).balance, 10000);
});
test("TRON verification binds the transfer to this invoice memo, not merely a public hash", async () => {
  const tx = "a".repeat(64),
    address = "41" + "1".repeat(40),
    memo = "invoice001",
    created = Date.now() - 60000;
  let txMemo = "other";
  tg.setOverride((url, m, p) => {
    if (url.endsWith("/gettransactionbyid"))
      return {
        txID: tx,
        ret: [{ contractRet: "SUCCESS" }],
        raw_data: {
          data: Buffer.from(txMemo).toString("hex"),
          contract: [
            {
              type: "TransferContract",
              parameter: { value: { to_address: address, amount: 1000000 } },
            },
          ],
        },
      };
    if (url.endsWith("/gettransactioninfobyid"))
      return {
        blockNumber: 100,
        blockTimeStamp: Date.now(),
        receipt: { result: "SUCCESS" },
      };
    if (url.endsWith("/getnowblock"))
      return { block_header: { raw_data: { number: 130 } } };
  });
  const invoice = {
    txHash: tx,
    currency: "TRX",
    address,
    cryptoAmount: "1.000000",
    memo,
    createdAt: created,
    expiresAt: Date.now() + 60000,
  };
  await assert.rejects(
    () => verifyCrypto(invoice, { confirmations: 20 }, {}),
    /memo_mismatch/,
  );
  txMemo = memo;
  assert.equal(
    (await verifyCrypto(invoice, { confirmations: 20 }, {})).reference,
    "TRON:" + tx,
  );
});
