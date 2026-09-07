import {
  get,
  put,
  assert,
  fetchLimited,
  expectResponse,
  decimalUnits,
} from "./common.js";
import { serviceSettings } from "./settings.js";
export const MARKET_ENDPOINT = "https://swapwallet.app/api/v1/market/prices";
export function parseMarketPrices(payload) {
  assert(
    payload?.status === "OK" &&
      payload.result &&
      typeof payload.result === "object",
    "market_response_invalid",
    502,
  );
  const map = {};
  for (const [pair, raw] of Object.entries(payload.result)) {
    const name = String(pair).toUpperCase();
    if (!["USDT/IRT", "TRX/IRT", "TON/IRT"].includes(name)) continue;
    const value = typeof raw === "string" ? raw.replace(/,/g, "").trim() : raw;
    const units = decimalUnits(value, 6);
    assert(
      units > 0n && units <= 1000000000000000n,
      "market_rate_invalid",
      502,
    );
    const rounded = Number(units / 1000000n);
    assert(
      Number.isSafeInteger(rounded) && rounded > 0,
      "market_rate_invalid",
      502,
    );
    map[name === "USDT/IRT" ? "USD" : name.split("/")[0]] = rounded;
  }
  assert(
    ["USD", "TRX", "TON"].every((k) => map[k] > 0),
    "market_pair_missing",
    502,
  );
  return map;
}
export async function refreshMarketRates(env) {
  const old = await get(env, "market", "latest", {});
  try {
    const response = await fetchLimited(
      MARKET_ENDPOINT,
      { method: "GET", headers: { accept: "application/json" } },
      512 * 1024,
    );
    const rates = parseMarketPrices(expectResponse(response));
    const snapshot = {
      source: "swapwallet",
      at: Date.now(),
      rates,
      lastAttempt: Date.now(),
      error: "",
    };
    await put(env, "market", "latest", snapshot);
    return snapshot;
  } catch (e) {
    await put(env, "market", "latest", {
      ...old,
      lastAttempt: Date.now(),
      error: e.message,
      retryAt: Date.now() + 60000,
    });
    throw e;
  }
}
export async function quoteRates(env, gateway) {
  const cfg = await serviceSettings(env);
  if (cfg.rates.mode !== "swapwallet")
    return {
      source: "manual",
      at: Date.now(),
      usdToman: cfg.usdToman,
      coinToman: gateway.coinToman || 0,
    };
  let snapshot = await get(env, "market", "latest");
  if (
    !snapshot?.at ||
    Date.now() - snapshot.at > cfg.rates.maxAgeMinutes * 60000
  ) {
    assert(
      !snapshot?.retryAt || snapshot.retryAt <= Date.now(),
      "market_rates_unavailable",
      503,
    );
    snapshot = await refreshMarketRates(env);
  }
  assert(
    snapshot?.at && Date.now() - snapshot.at <= cfg.rates.maxAgeMinutes * 60000,
    "market_rates_stale",
    503,
  );
  const currency = gateway.type === "iranpay3" ? "TRX" : gateway.currency;
  return {
    source: snapshot.source,
    at: snapshot.at,
    usdToman: snapshot.rates.USD,
    coinToman:
      currency === "TRX"
        ? snapshot.rates.TRX
        : currency === "TON"
          ? snapshot.rates.TON
          : snapshot.rates.USD,
  };
}
export async function ratesTick(env) {
  const cfg = await serviceSettings(env);
  if (cfg.rates.mode !== "swapwallet") return;
  const snapshot = await get(env, "market", "latest", {});
  if (
    snapshot.retryAt > Date.now() ||
    Date.now() - (snapshot.lastAttempt || 0) < cfg.rates.refreshMinutes * 60000
  )
    return;
  try {
    await refreshMarketRates(env);
  } catch {}
}
