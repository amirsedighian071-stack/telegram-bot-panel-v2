import assert from "node:assert/strict";
import fs from "node:fs";
export const LOCAL_PRIVATE_PASSWORD =
  process.env.E2E_ADMIN_PASSWORD || "e2e-local-private-password-2026";
export async function loginAdmin(page, base) {
  await page.goto(base);
  const response = await page.request.get(base + "/api/auth/default-status");
  const status = await response.json();
  const password = status.data.defaultActive
    ? "botpanel123"
    : LOCAL_PRIVATE_PASSWORD;
  await page.locator("#pw").fill(password);
  await page.locator("#login-btn").click();
  await page.waitForFunction(
    () =>
      !!document.getElementById("view") ||
      !!document.getElementById("setup-new"),
  );
  if (await page.locator("#setup-new").count()) {
    const token = await page.evaluate(() => S.token);
    const denied = await page.request.get(base + "/api/settings", {
      headers: { authorization: "Bearer " + token },
    });
    assert.equal(denied.status(), 403);
    fs.mkdirSync("assets/screens", { recursive: true });
    await page.screenshot({
      path: "assets/screens/first-login-no-env-fa.png",
      animations: "disabled",
    });
    await page.locator("#setup-new").fill(LOCAL_PRIVATE_PASSWORD);
    await page.locator("#setup-repeat").fill(LOCAL_PRIVATE_PASSWORD);
    await page.locator("#setup-submit").click();
    await page.waitForSelector("#view");
  }
}
