import {loginAdmin} from './browser-auth.mjs';
// Isolated local Workerd end-to-end test. Never run against a production account.
import { chromium } from "@playwright/test";
import { createHmac } from "node:crypto";
import fs from "node:fs";
import assert from "node:assert/strict";
const base = process.env.E2E_BASE_URL || "http://127.0.0.1:8787";
const run = Date.now(),
  userId = 800000000 + Math.floor(run % 10000000);
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox"],
});
const admin = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  }),
  customer = await browser.newPage({ viewport: { width: 420, height: 900 } });
const errors = [];
for (const p of [admin, customer])
  p.on("pageerror", (e) => errors.push(e.message));
let token, original, provider, plan, shelf;
const log = (s) => console.log("✓ " + s);
async function api(method, path, body) {
  const r = await admin.request.fetch(base + "/api" + path, {
    method,
    headers: { authorization: "Bearer " + token },
    ...(body === undefined ? {} : { data: body }),
  });
  const data = await r.json();
  assert(r.ok(), JSON.stringify(data));
  return data.data;
}
async function subtab(tab) {
  await admin.locator(`.sv-tabs [data-tab="${tab}"]`).click();
  await admin.waitForFunction(
    () => !document.querySelector("#sv-body .v-skeleton"),
  );
}
async function select(page, id, value) {
  await page
    .locator("#" + id)
    .locator("..")
    .locator('[data-act="ddToggle"]')
    .click();
  await page.locator(`#dd-panel [data-v="${value}"]`).click();
}
async function submit(page) {
  await page.locator("#v-form [type=submit]").click();
  await page.waitForSelector("#modal-wrap.hidden", { state: "attached" });
}
try {
  await loginAdmin(admin,base);
  token = await admin.evaluate(() => S.token);
  original = (await api("GET", "/settings")).settings;
  await api("PUT", "/settings", {
    botPurpose: "vpn",
    botToken: "123:TEST_TOKEN",
    requiredChats: { enabled: false, targets: [] },
  });
  await admin.reload();
  await admin.waitForSelector("#view");
  await admin.locator('aside [data-to="studio"]').click();
  await admin.locator('.v-tabs [data-id="services"]').click();
  await admin.waitForSelector(".sv-tabs");
  log("Native Worker admin service workspace opens");
  await subtab("stock");
  await admin.locator('[data-act="svShelfNew"]').click();
  await admin.locator("#ss-title").fill("انبار آزمایشی " + run);
  await submit(admin);
  shelf = (await api("GET", "/services/shelves")).rows.find(
    (s) => s.title === "انبار آزمایشی " + run,
  );
  await subtab("panels");
  await admin.locator('[data-act="svPanelEdit"]:not([data-id])').click();
  await admin.locator("#sv-title").fill("موقعیت آزمایشی " + run);
  await admin.locator("#sv-location").fill("موقعیت نمایشی");
  await admin.locator("#sv-country").fill("NL");
  await select(admin, "sv-shelf", shelf.id);
  await submit(admin);
  provider = (await api("GET", "/services/panels")).rows.find(
    (p) => p.title === "موقعیت آزمایشی " + run,
  );
  assert.equal(provider.type, "stock");
  await subtab("plans");
  await admin.locator('[data-act="svPlanEdit"]:not([data-id])').click();
  await admin.locator("#sp-title").fill("پلن نمونه " + run);
  await admin.locator("#sp-title-en").fill("Example plan");
  await select(admin, "sp-panel", provider.id);
  await admin.locator("#sp-category").fill("طرح آزمایشی");
  await admin.locator("#sp-price").fill("25000");
  await admin
    .locator("#sp-description")
    .fill("داده آزمایشی برای بررسی رابط؛ کانفیگ واقعی اتصال نیست.");
  await submit(admin);
  plan = (await api("GET", "/services/plans")).rows.find(
    (p) => p.title === "پلن نمونه " + run,
  );
  await subtab("stock");
  await admin.locator('[data-act="svStockImport"]').click();
  await select(admin, "ss-shelf", shelf.id);
  await admin
    .locator("#ss-content")
    .fill(
      `vless://00000000-0000-4000-8000-000000000001@demo.example.org:443#sample-${run}\nvless://00000000-0000-4000-8000-000000000002@demo.example.org:443#sample-${run}`,
    );
  await submit(admin);
  assert.equal(
    (await api("GET", "/services/stock?shelf=" + shelf.id)).rows.length,
    2,
  );
  log(
    "Provider, plan and encrypted configuration stock created through real admin forms",
  );
  for (const tab of [
    "services",
    "operations",
    "accounts",
    "payments",
    "requests",
    "coupons",
    "campaigns",
    "settings",
    "backup",
  ]) {
    await subtab(tab);
    assert((await admin.locator("#sv-body").innerText()).length > 20);
  }
  log("All admin feature tabs render without errors");
  await api("PUT", "/services/settings", {
    publicUrl: "https://panel.example.com",
    enabled: true,
    maintenance: false,
    phoneRequired: false,
    rules: "",
    brand: {
      name: "آزمایش خدمات بومی",
      nameEn: "Native service demo",
      mark: "S",
      accent: "#38bdf8",
      logo: "",
    },
  });
  const params = new URLSearchParams({
    auth_date: String(Math.floor(Date.now() / 1000)),
    user: JSON.stringify({
      id: userId,
      first_name: "مشتری آزمایشی",
      language_code: "fa",
    }),
    query_id: "local-test",
  });
  const secret = createHmac("sha256", "WebAppData")
    .update("123:TEST_TOKEN")
    .digest();
  const check = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, v]) => k + "=" + v)
    .join("\n");
  params.set("hash", createHmac("sha256", secret).update(check).digest("hex"));
  const login = await admin.request.post(base + "/api/portal/login", {
    data: { initData: params.toString() },
  });
  assert.equal(login.status(), 200, await login.text());
  await api("POST", "/services/accounts/" + userId + "/adjust", {
    amount: 50000,
    reason: "Isolated browser test credit",
    requestId: "seed_" + run,
  });
  const ticket = (await api("POST", "/services/customer-link/" + userId))
    .ticket;
  await customer.goto(base + "/portal/#ticket=" + ticket);
  await customer.waitForSelector('[data-action="buy"]');
  assert(
    (await customer.locator("#portal-view").innerText()).includes("پلن نمونه"),
  );
  await customer.locator(`[data-action="buy"][data-id="${plan.id}"]`).click();
  await customer.locator('[data-form="quote"] [type=submit]').click();
  await customer.waitForSelector('[data-action="confirmQuote"]');
  assert(
    (await customer.locator(".modal-card").innerText()).includes("۲۵٬۰۰۰"),
  );
  await customer.locator('[data-action="confirmQuote"]').click();
  await customer.waitForSelector('.bottom-nav [data-tab="services"].active');
  const op = (await api("GET", "/services/operations")).rows.find(
    (o) => o.userId === String(userId),
  );
  assert(op);
  await api("POST", "/services/operations/" + op.id + "/run");
  await customer.locator('[data-action="refresh"]').click();
  await customer.waitForSelector('[data-action="content"]');
  const wallet = (await api("GET", "/services/accounts/" + userId)).account;
  assert.equal(wallet.balance, 25000);
  assert.equal(wallet.held, 0);
  log(
    "Real customer sign-in, server quote, atomic wallet reservation and stock purchase",
  );
  await customer.locator('[data-action="content"]').first().click();
  await customer.waitForSelector('[data-action="showQR"]');
  assert(
    (await customer.locator(".modal-card").innerText()).includes(
      "demo.example.org",
    ),
  );
  await customer.locator('[data-action="showQR"]').click();
  await customer.waitForSelector(".qr");
  await customer.locator('[data-action="showCard"]').click();
  await customer.waitForSelector(".infocard");
  const contents = await customer.evaluate(async () => {
    const r = await fetch(
      "/api/portal/services/" + P.services[0].id + "/content",
      { headers: { authorization: "Bearer " + P.token } },
    );
    return (await r.json()).data;
  });
  const path = new URL(contents.proxyUrl).pathname;
  const sub = await admin.request.get(base + path);
  assert.equal(sub.status(), 200);
  assert(
    Buffer.from(await sub.text(), "base64")
      .toString()
      .includes("demo.example.org"),
  );
  log(
    "Private configs, QR, usage card and authenticated membership-aware subscription proxy",
  );
  await customer.locator('.modal-head [data-action="closeModal"]').click();
  for (const tab of ["wallet", "rewards", "help", "store"]) {
    await customer.locator(`.bottom-nav [data-tab="${tab}"]`).click();
    await customer.waitForFunction(
      () => !document.querySelector("#portal-view .loading"),
    );
    assert((await customer.locator("#portal-view").innerText()).length > 20);
  }
  assert(
    await customer.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  fs.mkdirSync("assets/screens", { recursive: true });
  await customer.bringToFront();
  await customer
    .locator("#portal-toast")
    .evaluate((node) => node.replaceChildren());
  await customer.screenshot({
    path: "assets/screens/v3-customer-portal-fa.png",
    animations: "disabled",
  });
  await customer.emulateMedia({ reducedMotion: "reduce" });
  assert(
    await customer.evaluate(
      () =>
        getComputedStyle(document.getElementById("portal-view"))
          .animationName === "none",
    ),
  );
  await customer.locator('[data-action="language"]').click();
  await customer.waitForFunction(() => document.documentElement.dir === "ltr");
  await subtab("overview");
  await admin.bringToFront();
  await admin.locator("#toasts").evaluate((node) => node.replaceChildren());
  await admin.screenshot({
    path: "assets/screens/v3-services-admin-fa.png",
    animations: "disabled",
  });
  assert.deepEqual(errors, []);
  log("Mobile, English/LTR, reduced motion and all customer tabs");
} finally {
  if (token && original)
    await api("PUT", "/settings", original).catch(() => {});
  await browser.close();
}
