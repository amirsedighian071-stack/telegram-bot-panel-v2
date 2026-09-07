import { zipSync, strToU8 } from "fflate";
import qrcode from "qrcode-generator";
import {
  get,
  put,
  key,
  list,
  assert,
  str,
  xml,
  b64,
  bytes64,
  utf8,
  hash,
  randomToken,
  commitJson,
} from "./common.js";
import { serviceSettings } from "./settings.js";
const TYPES = [
  "config",
  "bot",
  "panel",
  "plan",
  "shelf",
  "stock",
  "service",
  "operation",
  "account",
  "ledger",
  "payment",
  "payment-ref",
  "payment-request",
  "request",
  "manual-sale",
  "coupon",
  "coupon-use",
  "gift",
  "agent-request",
  "raffle",
  "spin",
  "spin-count",
  "wheel-budget",
  "sub",
  "sub-all",
  "sub-owner",
  "audit",
];
export function qrSVG(value) {
  assert(
    typeof value === "string" && value.length > 0 && value.length <= 2000,
    "qr_content_too_long",
  );
  const qr = qrcode(0, "M");
  qr.addData(value, "Byte");
  qr.make();
  return qr.createSvgTag({ cellSize: 5, margin: 16, scalable: true });
}
export function usageCard(s, brand) {
  const percent = s.dataLimit
    ? Math.min(100, Math.round((s.usedBytes / s.dataLimit) * 100))
    : 0;
  const gb = (n) => (n / 1073741824).toFixed(2);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="400" viewBox="0 0 720 400"><defs><linearGradient id="g"><stop stop-color="#0e2137"/><stop offset="1" stop-color="#15132d"/></linearGradient></defs><rect width="720" height="400" rx="28" fill="url(#g)"/><circle cx="660" cy="30" r="140" fill="${xml(brand.accent)}" opacity=".06"/><g font-family="Tahoma,Arial,sans-serif"><text x="680" y="58" text-anchor="end" fill="${xml(brand.accent)}" font-size="21">${xml(brand.name)}</text><text x="680" y="108" text-anchor="end" fill="#f1f5f9" font-size="26">${xml(s.title)}</text><text x="40" y="156" fill="#94a3b8" font-size="18">${xml(s.username)}</text><text x="40" y="212" fill="#e2e8f0" font-size="22">${s.usageAvailable === false ? "Live usage not available" : gb(s.usedBytes || 0) + " GB / " + (s.dataLimit ? gb(s.dataLimit) + " GB" : "Unlimited")}</text><rect x="40" y="240" width="640" height="14" rx="7" fill="#29374a"/><rect x="40" y="240" width="${(640 * percent) / 100}" height="14" rx="7" fill="${xml(brand.accent)}"/><text x="40" y="298" fill="#94a3b8" font-size="18">${xml(s.status)} · ${s.expiresAt ? new Date(s.expiresAt * 1000).toISOString().slice(0, 10) : "No fixed expiry"}</text><text x="40" y="354" fill="#64748b" font-size="14">${s.usageAvailable === false ? "Record date" : "Last sync"}: ${s.lastSyncAt ? new Date(s.lastSyncAt).toISOString().slice(0, 16) + " UTC" : "Not synced"}</text></g></svg>`;
}
function cells(rows) {
  return rows.map((r) =>
    r.map((v) => (typeof v === "number" ? v : String(v ?? ""))),
  );
}
export function csv(rows) {
  return (
    "\ufeff" +
    cells(rows)
      .map((row) =>
        row
          .map(
            (v) =>
              '"' +
              String(
                typeof v === "string" && /^[=+\-@\t\r]/.test(v) ? "'" + v : v,
              ).replaceAll('"', '""') +
              '"',
          )
          .join(","),
      )
      .join("\r\n")
  );
}
export function xlsx(rows) {
  const data = cells(rows);
  const sheet = `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0" rightToLeft="1"/></sheetViews><sheetData>${data
    .map(
      (row, i) =>
        `<row r="${i + 1}">${row
          .map((v, j) => {
            let n = j + 1,
              col = "";
            while (n) {
              n--;
              col = String.fromCharCode(65 + (n % 26)) + col;
              n = Math.floor(n / 26);
            }
            return typeof v === "number"
              ? `<c r="${col}${i + 1}"><v>${v}</v></c>`
              : `<c r="${col}${i + 1}" t="inlineStr"><is><t xml:space="preserve">${xml(v)}</t></is></c>`;
          })
          .join("")}</row>`,
    )
    .join("")}</sheetData></worksheet>`;
  return zipSync(
    {
      "[Content_Types].xml": strToU8(
        '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
      ),
      "_rels/.rels": strToU8(
        '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
      ),
      "xl/workbook.xml": strToU8(
        '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="گزارش" sheetId="1" r:id="rId1"/></sheets></workbook>',
      ),
      "xl/_rels/workbook.xml.rels": strToU8(
        '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
      ),
      "xl/worksheets/sheet1.xml": strToU8(sheet),
    },
    { level: 4 },
  );
}
export async function financeReport(env, from = 0, to = Date.now()) {
  const ledger = (await list(env, "ledger"))
    .filter((e) => e.at >= from && e.at <= to)
    .sort((a, b) => a.at - b.at);
  assert(ledger.length <= 10000, "export_limit_use_date_filter");
  return [
    [
      "شناسه",
      "کاربر",
      "زمان UTC",
      "تغییر مانده",
      "رزرو",
      "مانده",
      "نوع",
      "عامل",
    ],
    ...ledger.map((e) => [
      e.id,
      e.userId,
      new Date(e.at).toISOString(),
      e.delta,
      e.holdDelta,
      e.after,
      e.reason,
      e.actor,
    ]),
  ];
}
async function archiveKey(password, salt) {
  assert(
    typeof password === "string" && password.length >= 12,
    "backup_password_too_short",
  );
  const base = await crypto.subtle.importKey(
    "raw",
    utf8(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}
export async function exportBackup(env, password) {
  const records = [];
  for (const type of TYPES) {
    let cursor;
    do {
      const page = await env.BOT_KV.list({
        prefix: key(type, ""),
        cursor,
        limit: 1000,
      });
      for (const k of page.keys) {
        const raw = await env.BOT_KV.get(k.name);
        if (raw !== null) records.push([k.name, raw]);
      }
      cursor = page.list_complete ? null : page.cursor;
    } while (cursor);
  }
  const data = JSON.stringify({
    schema: "botpanel-services-1",
    createdAt: Date.now(),
    records,
  });
  assert(utf8(data).length <= 12 * 1024 * 1024, "backup_too_large");
  const salt = crypto.getRandomValues(new Uint8Array(16)),
    iv = crypto.getRandomValues(new Uint8Array(12)),
    k = await archiveKey(password, salt);
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    k,
    utf8(data),
  );
  return {
    format: "BP-SERVICES-AESGCM-1",
    salt: b64(salt),
    iv: b64(iv),
    ciphertext: b64(new Uint8Array(cipher)),
  };
}
export async function restoreBackup(env, backup, password, confirm) {
  assert(confirm === "RESTORE-EMPTY-SERVICES", "restore_confirmation_required");
  for (const type of ["service", "ledger", "stock", "operation", "payment"])
    assert(
      (await list(env, type)).length === 0,
      "restore_requires_empty_services",
    );
  assert(
    backup?.format === "BP-SERVICES-AESGCM-1" &&
      String(backup.ciphertext).length < 18 * 1024 * 1024,
    "invalid_backup",
  );
  let data;
  try {
    const k = await archiveKey(password, bytes64(backup.salt));
    data = JSON.parse(
      new TextDecoder().decode(
        await crypto.subtle.decrypt(
          { name: "AES-GCM", iv: bytes64(backup.iv) },
          k,
          bytes64(backup.ciphertext),
        ),
      ),
    );
  } catch {
    assert(false, "backup_decryption_failed");
  }
  assert(
    data.schema === "botpanel-services-1" &&
      Array.isArray(data.records) &&
      data.records.length <= 100000,
    "invalid_backup",
  );
  const writes = [];
  for (const [name, raw] of data.records) {
    assert(
      TYPES.some((t) => name.startsWith(key(t, ""))) && typeof raw === "string",
      "invalid_backup_record",
    );
    const value = JSON.parse(raw);
    if (
      name.startsWith(key("operation", "")) &&
      ["queued", "sending"].includes(value.status)
    ) {
      value.status = "review";
      value.error = "restored_operation_requires_reconciliation";
    }
    if (
      name.startsWith(key("payment", "")) &&
      ["creating", "pending", "receipt_review"].includes(value.status)
    ) {
      value.status = "review";
      value.lastError = "restored_payment_requires_review";
    }
    writes.push([name, value]);
  }
  const settings = data.records.find(
    ([name]) => name === key("config", "main"),
  );
  const config = settings
    ? JSON.parse(settings[1])
    : await serviceSettings(env);
  config.maintenance = true;
  writes.push([key("config", "main"), config]);
  await commitJson(env, writes);
  return { restored: writes.length, maintenance: true };
}
export async function backupTick(env) {
  const s = await serviceSettings(env);
  if (!s.backup.enabled || !env.BACKUPS || !env.BACKUP_PASSWORD) return;
  const date = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Tehran",
    }).format(new Date()),
    hour = Number(
      new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Tehran",
        hour: "2-digit",
        hourCycle: "h23",
      }).format(new Date()),
    );
  if (hour !== s.backup.hour || (await get(env, "backup-run", date))) return;
  const backup = await exportBackup(env, env.BACKUP_PASSWORD);
  await env.BACKUPS.put(`services/${date}.bpbackup`, JSON.stringify(backup), {
    httpMetadata: { contentType: "application/json" },
  });
  await put(env, "backup-run", date, { at: Date.now() }, { ttl: 90 * 86400 });
}
