import {
  assert,
  bytes64,
  hex,
  digest,
  constantEqual,
  decimalUnits,
  fetchLimited,
  expectResponse,
} from "./common.js";
export const CRYPTO = {
  TRX: { network: "TRON", decimals: 6 },
  USDT_TRC20: { network: "TRON", decimals: 6 },
  TON: { network: "TON", decimals: 9 },
  USDT_TON: { network: "TON", decimals: 6 },
};
export const USDT_TRON = "41a614f803b6fd780986a42c78ec9c7f77e6ded13c";
// The official TON USDT Jetton master. Other jettons with the same symbol are not accepted.
export const USDT_TON =
  "0:b113a994b5024a16719f69139328eb759596c38a25f59028b146fecdc3621dfe";
export async function tronAddress(value) {
  let s = String(value);
  if (/^41[0-9a-fA-F]{40}$/.test(s)) return s.toLowerCase();
  assert(/^[1-9A-HJ-NP-Za-km-z]{34}$/.test(s), "invalid_tron_address");
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let n = 0n;
  for (const c of s) n = n * 58n + BigInt(alphabet.indexOf(c));
  let h = n.toString(16).padStart(50, "0");
  const bytes = Uint8Array.from(h.match(/../g), (x) => parseInt(x, 16));
  assert(bytes.length === 25 && bytes[0] === 0x41, "invalid_tron_address");
  const checksum = (await digest(await digest(bytes.slice(0, 21)))).slice(0, 4);
  assert(
    constantEqual(hex(checksum), hex(bytes.slice(21))),
    "invalid_tron_checksum",
  );
  return hex(bytes.slice(0, 21));
}
export function tonAddress(value) {
  const s = String(value);
  if (/^-?\d:[0-9a-fA-F]{64}$/.test(s)) return s.toLowerCase();
  let b;
  try {
    b = bytes64(s);
  } catch {
    assert(false, "invalid_ton_address");
  }
  assert(b.length === 36 && !(b[0] & 0x80), "invalid_ton_address");
  let crc = 0;
  for (const byte of b.slice(0, 34)) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++)
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 65535 : (crc << 1) & 65535;
  }
  assert(crc >> 8 === b[34] && (crc & 255) === b[35], "invalid_ton_checksum");
  return `${b[1] > 127 ? b[1] - 256 : b[1]}:${hex(b.slice(2, 34))}`;
}
export function transactionHash(value) {
  const s = String(value).trim();
  if (/^[0-9a-fA-F]{64}$/.test(s)) return s.toLowerCase();
  let b;
  try {
    b = bytes64(s);
  } catch {
    assert(false, "invalid_transaction_hash");
  }
  assert(b.length === 32, "invalid_transaction_hash");
  return hex(b);
}
async function json(url, options = {}) {
  const r = await fetchLimited(url, { method: "GET", ...options });
  return expectResponse(r);
}
export async function verifyCrypto(invoice, gateway, secret) {
  const code = invoice.currency,
    spec = CRYPTO[code];
  assert(spec, "unsupported_crypto");
  const txid = transactionHash(invoice.txHash);
  const expected = decimalUnits(invoice.cryptoAmount, spec.decimals);
  if (spec.network === "TRON") {
    const headers = {
      "content-type": "application/json",
      ...(secret.apiKey ? { "TRON-PRO-API-KEY": secret.apiKey } : {}),
    };
    const call = (method, data) =>
      json("https://api.trongrid.io/wallet/" + method, {
        method: "POST",
        headers,
        body: JSON.stringify(data),
      });
    const tx = await call("gettransactionbyid", { value: txid });
    assert(
      tx?.txID?.toLowerCase() === txid &&
        tx.ret?.every((r) => r.contractRet === "SUCCESS"),
      "transaction_not_successful",
    );
    const info = await call("gettransactioninfobyid", { value: txid });
    assert(
      info &&
        info.blockNumber > 0 &&
        (!info.receipt?.result || info.receipt.result === "SUCCESS"),
      "transaction_not_confirmed",
    );
    const latest = await call("getnowblock", {});
    assert(
      Number(latest.block_header?.raw_data?.number) -
        Number(info.blockNumber) +
        1 >=
        Number(gateway.confirmations || 20),
      "insufficient_confirmations",
    );
    assert(
      info.blockTimeStamp >= invoice.createdAt - 120000 &&
        info.blockTimeStamp <= invoice.expiresAt,
      "transaction_outside_invoice_window",
    );
    const memoHex = String(tx.raw_data?.data || "");
    let memo = "";
    try {
      assert(/^(?:[a-fA-F0-9]{2})+$/.test(memoHex), "crypto_memo_required");
      memo = new TextDecoder("utf-8", { fatal: true }).decode(
        Uint8Array.from(memoHex.match(/../g), (v) => parseInt(v, 16)),
      );
    } catch {
      assert(false, "crypto_memo_mismatch");
    }
    assert(invoice.memo && memo === invoice.memo, "crypto_memo_mismatch");
    const to = await tronAddress(invoice.address),
      contracts = tx.raw_data?.contract || [];
    let matched = false;
    for (const c of contracts) {
      const v = c.parameter?.value || {};
      if (
        code === "TRX" &&
        c.type === "TransferContract" &&
        String(v.to_address).toLowerCase() === to
      ) {
        assert(
          typeof v.amount !== "number" || Number.isSafeInteger(v.amount),
          "unsafe_crypto_amount",
        );
        assert(BigInt(v.amount) >= expected, "underpayment");
        matched = true;
      }
      if (
        code === "USDT_TRC20" &&
        c.type === "TriggerSmartContract" &&
        String(v.contract_address).toLowerCase() === USDT_TRON
      ) {
        const d = String(v.data || "").toLowerCase();
        if (
          /^a9059cbb[0-9a-f]{128}$/.test(d) &&
          "41" + d.slice(32, 72) === to
        ) {
          assert(BigInt("0x" + d.slice(72)) >= expected, "underpayment");
          matched = true;
        }
      }
    }
    assert(matched, "wrong_crypto_recipient_or_token");
    return {
      reference: "TRON:" + txid,
      verifiedAt: Date.now(),
      network: "TRON",
    };
  }
  const event = await json("https://tonapi.io/v2/events/" + txid, {
    headers: secret.apiKey ? { authorization: "Bearer " + secret.apiKey } : {},
  });
  assert(
    event && !event.in_progress && event.timestamp > 0,
    "transaction_not_confirmed",
  );
  assert(
    event.timestamp * 1000 >= invoice.createdAt - 120000 &&
      event.timestamp * 1000 <= invoice.expiresAt,
    "transaction_outside_invoice_window",
  );
  const to = tonAddress(invoice.address);
  let matched = false;
  for (const action of event.actions || []) {
    if (action.status !== "ok") continue;
    const type = code === "TON" ? "TonTransfer" : "JettonTransfer";
    if (action.type !== type) continue;
    const t = action[type];
    if (!t) continue;
    if (tonAddress(t.recipient?.address || t.recipient || "") !== to) continue;
    if (code === "USDT_TON" && tonAddress(t.jetton?.address || "") !== USDT_TON)
      continue;
    assert(BigInt(t.amount) >= expected, "underpayment");
    assert(
      String(t.comment || t.decoded_body?.text || "") === invoice.memo,
      "crypto_memo_mismatch",
    );
    matched = true;
  }
  assert(matched, "wrong_crypto_recipient_or_token");
  return { reference: "TON:" + txid, verifiedAt: Date.now(), network: "TON" };
}
