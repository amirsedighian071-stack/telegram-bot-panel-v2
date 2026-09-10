// The menu/button editor must always target the currently selected bot: switching
// the managed bot invalidates the cached editor and reloads that bot's buttons.
import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { bootPanel } from "./panel-dom.mjs";

let panel;
afterEach(() => {
  panel?.close();
  panel = null;
});

const MENU_A = {
  welcome: { fa: "A", en: "A" }, help: { fa: "h", en: "h" },
  inlineButtons: [[{ text: "ربات الف", type: "callback", value: "a:1" }]],
  submenus: {},
};
const MENU_B = {
  welcome: { fa: "B", en: "B" }, help: { fa: "h", en: "h" },
  inlineButtons: [[{ text: "ربات ب", type: "url", value: "https://b.example" }]],
  submenus: {},
};

function bootWithMenus(menus) {
  panel = bootPanel();
  const { win, inject } = panel;
  const menusJson = JSON.stringify(menus).replace(/</g, "\\u003c");
  inject(`
    const MENUS = ${menusJson};
    window.fetch = async (input) => {
      const raw = String(input);
      const path = raw.startsWith('/') ? raw.split('?')[0] : new URL(raw).pathname;
      (window.__served = window.__served || []).push(path);
      if (path === '/api/menu') {
        const menu = MENUS[window.localStorage.getItem('bp_managed_bot') || 'primary'];
        return { ok: true, status: 200, json: async () => ({ ok: true, data: { menu, defaults: MENUS.primary } }) };
      }
      return { ok: true, status: 200, json: async () => ({ ok: true, data: {} }) };
    };
    location.hash = '#/menu';
    render();
  `);
  return panel;
}

test("the button editor loads, adds, moves and deletes for the selected bot", async () => {
  const { doc, inject, tap } = bootWithMenus({ primary: MENU_A });
  await new Promise((r) => setTimeout(r, 20));

  const firstText = () => doc.querySelector("#btn-editor .ib-t")?.value;
  assert.equal(firstText(), "ربات الف");

  // Add a second button to the same row through the modal.
  tap(doc.querySelector('[data-act="btnAddOpen"]'));
  doc.getElementById("bm-text").value = "دکمه تازه";
  doc.getElementById("bm-value").value = "my:action";
  doc.getElementById("bm-type").value = "callback";
  tap(doc.querySelector('[data-act="btnModalAdd"]'));
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(doc.querySelectorAll("#btn-editor .ib-card").length, 2);

  // Move the new button backwards (swap with the first).
  tap(doc.querySelector('[data-act="btnMove"][data-r="0"][data-b="1"][data-dir="l"]'));
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(firstText(), "دکمه تازه");

  // Delete it again.
  tap(doc.querySelector('[data-act="ibDelBtn"][data-r="0"][data-b="0"]'));
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(doc.querySelectorAll("#btn-editor .ib-card").length, 1);
  assert.equal(firstText(), "ربات الف");
});

test("switching the selected bot reloads the editor with that bot's buttons", async () => {
  const { win, doc, inject } = bootWithMenus({ primary: MENU_A, abc123: MENU_B });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(doc.querySelector("#btn-editor .ib-t")?.value, "ربات الف");

  // Select a managed bot the way "My bots" does, then re-enter the menu route.
  inject(`
    localStorage.setItem('bp_managed_bot', 'abc123');
    localStorage.setItem('bp_managed_bot_title', 'Bot B');
    MU.menu = null; MU.sub = null; MU.bot = undefined;
    location.hash = '#/menu';
    render();
  `);
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(doc.querySelector("#btn-editor .ib-t")?.value, "ربات ب", "editor must show bot B's buttons");

  // The route menu API was fetched again after the switch (fresh per-bot data).
  const served = win.__served.filter((p) => p === "/api/menu");
  assert.ok(served.length >= 2, "menu must be refetched for the other bot");
});

test("the mobile More sheet always offers the menu & buttons section", () => {
  const { doc, inject, tap } = bootWithMenus({ primary: MENU_A });
  inject("ACTIONS.vMoreNav();");
  const labels = [...doc.querySelectorAll("#modal-box button")].map((b) => b.textContent);
  assert(labels.some((l) => l.includes("منو")), "More sheet must list the menu builder");
  assert(labels.some((l) => l.includes("کاربران")), "More sheet must list users");
  tap(doc.querySelector('[data-act="modalClose"]'));
});
