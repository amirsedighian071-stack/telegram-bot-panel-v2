import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { bootPanel } from "./panel-dom.mjs";

let panel;
afterEach(() => {
  panel?.close();
  panel = null;
});

function openSelect(extraHtml = "") {
  panel = bootPanel();
  const { doc, inject } = panel;
  inject(`
    openModal('<form id="v-form">' + vSelect('sv-provider', 'Provider', [['stock','Stock'],['marzban','Marzban'],['3xui','3x-ui']], 'stock') + '</form>');
  `);
  if (extraHtml) inject(extraHtml);
  const box = doc.querySelector(".bp-dd");
  return {
    box,
    input: doc.getElementById("sv-provider"),
    label: box.querySelector(".dd-label"),
    toggle: box.querySelector('[data-act="ddToggle"]'),
    ddPanel: doc.getElementById("dd-panel"),
  };
}

test("choosing an option updates the value, the label and the tick", () => {
  const { input, label, toggle, ddPanel, box } = openSelect();
  const { win, tap } = panel;
  let changes = 0;
  input.addEventListener("change", () => changes++);

  tap(toggle);
  assert.equal(ddPanel.classList.contains("hidden"), false, "the list should open");
  assert.equal(ddPanel.querySelectorAll(".dd-opt").length, 3);

  const marzban = [...ddPanel.querySelectorAll(".dd-opt")].find(
    (o) => o.dataset.v === "marzban",
  );
  marzban.dispatchEvent(new win.MouseEvent("click", { bubbles: true }));

  assert.equal(input.value, "marzban");
  assert.equal(label.textContent, "Marzban", "the closed control must show the pick");
  assert.equal(changes, 1, "a change event must fire so forms can react");
  assert.equal(ddPanel.classList.contains("hidden"), true, "the list closes after a pick");

  const src = [...box.querySelectorAll(".dd-src .dd-opt")];
  assert.deepEqual(
    src.filter((o) => o.classList.contains("sel")).map((o) => o.dataset.v),
    ["marzban"],
    "the tick must move to the chosen option",
  );

  // Re-opening shows the tick on the current value.
  tap(toggle);
  assert.equal(
    ddPanel.querySelector(".dd-opt.sel").dataset.v,
    "marzban",
  );
});

test("a touch pick survives the retargeted click that follows it", () => {
  const { input, label, toggle, ddPanel, box } = openSelect();
  const { win, doc } = panel;

  toggle.dispatchEvent(new win.MouseEvent("click", { bubbles: true }));
  const option = [...ddPanel.querySelectorAll(".dd-opt")].find(
    (o) => o.dataset.v === "3xui",
  );
  // Mobile browsers fire pointerdown first; the option is gone by the time the
  // click is delivered, so the click lands on the modal backdrop underneath.
  option.dispatchEvent(new win.Event("pointerdown", { bubbles: true }));
  assert.equal(input.value, "3xui");
  assert.equal(label.textContent, "3x-ui");

  const backdrop = doc.querySelector('#modal-wrap [data-act="modalClose"]');
  backdrop.dispatchEvent(new win.MouseEvent("click", { bubbles: true }));
  assert.equal(
    doc.getElementById("modal-wrap").classList.contains("hidden"),
    false,
    "the ghost click must not close the dialog",
  );
  assert.equal(box.isConnected, true);

  // A deliberate later click on the backdrop still closes the dialog.
  backdrop.dispatchEvent(new win.MouseEvent("click", { bubbles: true }));
  assert.equal(doc.getElementById("modal-wrap").classList.contains("hidden"), true);
});

test("dropdowns outside dialogs (service tabs) select too, and repainting a single box works", () => {
  panel = bootPanel();
  const { doc, win, inject, tap } = panel;
  inject(`
    document.body.insertAdjacentHTML('beforeend', '<div id="test-host"></div>');
    document.getElementById('test-host').innerHTML =
      '<div class="card">' + vSelect('sv-dice-kind', 'Game', [['dice','Dice'],['slot','Slot']], 'dice') + '</div>';
    paintDropdowns();
  `);
  const box = doc.querySelector(".bp-dd");
  const input = doc.getElementById("sv-dice-kind");
  tap(box.querySelector('[data-act="ddToggle"]'));
  const slot = [...doc.getElementById("dd-panel").querySelectorAll(".dd-opt")].find(
    (o) => o.dataset.v === "slot",
  );
  slot.dispatchEvent(new win.MouseEvent("click", { bubbles: true }));
  assert.equal(input.value, "slot");
  assert.equal(box.querySelector(".dd-label").textContent, "Slot");

  // Values set programmatically are shown once the box itself is repainted.
  input.value = "dice";
  inject(`paintDropdowns(document.querySelector('.bp-dd'));`);
  assert.equal(box.querySelector(".dd-label").textContent, "Dice");
});

test("panel sections open and close as accordions and remember their state", () => {
  panel = bootPanel();
  const { doc, inject, tap, win } = panel;
  inject(`
    document.body.insertAdjacentHTML('beforeend', '<div id="test-host"></div>');
    document.getElementById('test-host').innerHTML =
      vSection('Providers', '<p id="sec-content">body</p>', '', { group: 'sv', id: 'panels', open: false });
  `);
  const section = doc.querySelector("section.bp-sec");
  const head = section.querySelector('[data-act="accToggle"]');
  assert.equal(section.classList.contains("open"), false);

  tap(head);
  assert.equal(section.classList.contains("open"), true, "the arrow must expand the section");
  assert.equal(head.getAttribute("aria-expanded"), "true");
  assert.equal(win.localStorage.getItem("bp_acc_sv").includes("panels"), true);

  tap(head);
  assert.equal(section.classList.contains("open"), false, "clicking again collapses it");
});
