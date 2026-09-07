import { getUser } from "../kv.js";
import {
  get,
  put,
  key,
  list,
  commitJson,
  assert,
  integer,
  uid,
  MAX_MONEY,
  id,
  epoch,
  randomInt,
  audit,
} from "./common.js";
import { serviceSettings } from "./settings.js";

export async function account(env, userId) {
  return (
    (await get(env, "account", uid(userId))) || {
      userId: uid(userId),
      balance: 0,
      held: 0,
      role: "customer",
      discountPercent: 0,
      creditLimit: 0,
      agentExpiresAt: 0,
      paidTotal: 0,
      spentTotal: 0,
      createdAt: Date.now(),
    }
  );
}
export const credit = (a) =>
  a.role === "credit_agent" &&
  (!a.agentExpiresAt || a.agentExpiresAt > Date.now())
    ? a.creditLimit
    : 0;
export const available = (a) => a.balance - a.held + credit(a);
export async function walletWrites(
  env,
  userId,
  {
    delta = 0,
    holdDelta = 0,
    eventId,
    reason,
    actor = "system",
    paid = 0,
    spent = 0,
    details = {},
  },
) {
  assert(eventId && eventId.length <= 220, "wallet_reference_required");
  assert(
    Number.isSafeInteger(delta) && Number.isSafeInteger(holdDelta),
    "invalid_amount",
  );
  const old = await get(env, "ledger", eventId),
    a = await account(env, userId);
  if (old) {
    assert(
      old.userId === uid(userId) &&
        old.delta === delta &&
        old.holdDelta === holdDelta,
      "wallet_reference_conflict",
      409,
    );
    return { writes: [], account: a, duplicate: true };
  }
  const next = {
    ...a,
    balance: a.balance + delta,
    held: a.held + holdDelta,
    paidTotal: a.paidTotal + paid,
    spentTotal: a.spentTotal + spent,
    updatedAt: Date.now(),
  };
  assert(
    Number.isSafeInteger(next.balance) && Math.abs(next.balance) <= MAX_MONEY,
    "wallet_amount_limit",
  );
  assert(next.held >= 0, "invalid_wallet_hold");
  if (delta - holdDelta < 0)
    assert(
      next.balance - next.held >= -credit(next),
      "insufficient_balance",
      402,
    );
  const ledger = {
    id: eventId,
    userId: uid(userId),
    delta,
    holdDelta,
    reason,
    actor,
    before: a.balance,
    after: next.balance,
    held: next.held,
    at: Date.now(),
    details,
  };
  return {
    writes: [
      [key("account", userId), next],
      [key("ledger", eventId), ledger],
    ],
    account: next,
    duplicate: false,
  };
}
export async function adjustWallet(env, userId, amount, reason, requestId) {
  assert(await getUser(env, userId), "user_not_found", 404);
  assert(String(reason || "").trim().length >= 3, "adjustment_reason_required");
  const delta = integer(amount, -MAX_MONEY, MAX_MONEY);
  const change = await walletWrites(env, userId, {
    delta,
    eventId: "admin:" + uid(userId) + ":" + requestId,
    reason: "admin_adjustment",
    actor: "admin",
    details: { note: String(reason).slice(0, 300) },
  });
  await commitJson(env, change.writes);
  return change.account;
}
export async function updateAccount(env, userId, body) {
  const a = await account(env, userId);
  assert(
    ["customer", "agent", "credit_agent"].includes(body.role || a.role),
    "invalid_agent_role",
  );
  a.role = body.role || a.role;
  a.discountPercent = integer(
    body.discountPercent ?? a.discountPercent,
    0,
    100,
  );
  a.creditLimit = integer(body.creditLimit ?? a.creditLimit, 0, MAX_MONEY);
  a.agentExpiresAt = body.agentExpiresAt
    ? integer(body.agentExpiresAt, Date.now() - 1, Date.now() + 3650 * 86400000)
    : 0;
  await put(env, "account", userId, a);
  await audit(env, "account_permissions", {
    userId,
    role: a.role,
    actor: "admin",
  });
  return a;
}
export async function initializeAccount(env, user) {
  const a = await account(env, user.id);
  if (a.initialized) return a;
  const s = await serviceSettings(env);
  const change = await walletWrites(env, user.id, {
    delta: s.giftSignup,
    eventId: "signup:" + user.id,
    reason: "signup_gift",
  });
  change.account.initialized = true;
  const writes = change.writes.filter(([k]) => k !== key("account", user.id));
  writes.push([key("account", user.id), change.account]);
  await commitJson(env, writes);
  return change.account;
}
export async function requestAgent(env, userId, note) {
  const s = await serviceSettings(env),
    a = await account(env, userId);
  assert(s.agentRequests, "agent_requests_disabled");
  assert(a.paidTotal >= s.agentMinPaid, "agent_minimum_payment_required");
  const old = await get(env, "agent-request", userId);
  if (old?.status === "pending") return old;
  const request = {
    id: uid(userId),
    userId: uid(userId),
    note: String(note || "")
      .trim()
      .slice(0, 1000),
    status: "pending",
    createdAt: Date.now(),
  };
  await put(env, "agent-request", userId, request);
  return request;
}
export async function decideAgent(env, userId, body) {
  const r = await get(env, "agent-request", userId);
  assert(r?.status === "pending", "request_not_pending");
  if (body.approve) await updateAccount(env, userId, body);
  r.status = body.approve ? "approved" : "rejected";
  r.decidedAt = Date.now();
  await put(env, "agent-request", userId, r);
  return r;
}
export async function saveGift(env, b, existing = {}) {
  const code = String(b.code || "")
    .trim()
    .toUpperCase();
  assert(/^[A-Z0-9_-]{3,48}$/.test(code), "invalid_gift_code");
  const gift = {
    id: existing.id || id(),
    code,
    amount: integer(b.amount, 1, MAX_MONEY),
    maxUses: integer(b.maxUses || 1, 1, 100000),
    used: existing.used || 0,
    expiresAt: b.expiresAt
      ? integer(b.expiresAt, Date.now(), Date.now() + 3650 * 86400000)
      : 0,
    enabled: b.enabled !== false,
    createdAt: existing.createdAt || Date.now(),
  };
  assert(
    !(await list(env, "gift")).some((g) => g.code === code && g.id !== gift.id),
    "duplicate_gift_code",
  );
  await put(env, "gift", gift.id, gift);
  return gift;
}
export async function redeemGift(env, userId, code) {
  const g = (await list(env, "gift")).find(
    (g) => g.code === String(code).trim().toUpperCase(),
  );
  assert(
    g &&
      g.enabled &&
      (!g.expiresAt || g.expiresAt > Date.now()) &&
      g.used < g.maxUses,
    "gift_unavailable",
  );
  assert(
    !(await get(env, "ledger", "gift:" + g.id + ":" + userId)),
    "gift_already_used",
  );
  const change = await walletWrites(env, userId, {
    delta: g.amount,
    eventId: "gift:" + g.id + ":" + userId,
    reason: "gift_code",
  });
  g.used++;
  await commitJson(env, [...change.writes, [key("gift", g.id), g]]);
  return change.account;
}
export async function spinWheel(env, userId, requestId, expectedFee) {
  const old = await get(env, "spin", `${userId}:${requestId}`);
  if (old) return old;
  const s = await serviceSettings(env),
    w = s.wheel;
  assert(w.enabled, "wheel_disabled");
  assert(Number(expectedFee) === w.fee, "fee_changed");
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tehran",
  }).format(new Date());
  const count = await get(env, "spin-count", `${userId}:${date}`, 0);
  assert(count < w.dailySpins, "daily_spin_limit");
  const budget = await get(env, "wheel-budget", date, 0);
  const a = await account(env, userId);
  assert(available(a) >= w.fee, "insufficient_balance", 402);
  const prizes = w.prizes.filter((p) => p.amount + budget <= w.budget);
  assert(prizes.length, "wheel_budget_exhausted");
  const sum = prizes.reduce((n, p) => n + p.weight, 0);
  let n = randomInt(sum);
  let prize = prizes[0];
  for (const p of prizes) {
    n -= p.weight;
    if (n < 0) {
      prize = p;
      break;
    }
  }
  const spin = {
    id: `${userId}:${requestId}`,
    userId: uid(userId),
    prize: prize.title,
    amount: prize.amount,
    fee: w.fee,
    at: Date.now(),
  };
  const change = await walletWrites(env, userId, {
    delta: prize.amount - w.fee,
    eventId: "spin:" + spin.id,
    reason: "wheel",
    details: { fee: w.fee, prize: prize.amount },
  });
  await commitJson(env, [
    ...change.writes,
    [key("spin", spin.id), spin],
    [key("spin-count", `${userId}:${date}`), count + 1],
    [key("wheel-budget", date), budget + prize.amount],
  ]);
  return spin;
}
export async function createRaffle(env, b) {
  const raffle = {
    id: id(),
    title: String(b.title || "")
      .trim()
      .slice(0, 100),
    closesAt: integer(
      b.closesAt,
      Date.now() + 60000,
      Date.now() + 365 * 86400000,
    ),
    prizes: (Array.isArray(b.prizes) ? b.prizes : [])
      .map((v) => integer(v, 1, 10000000))
      .slice(0, 10),
    maxEntries: integer(b.maxEntries || 1000, 1, 10000),
    status: "open",
    entries: [],
    winners: [],
    createdAt: Date.now(),
  };
  assert(raffle.title && raffle.prizes.length, "invalid_raffle");
  await put(env, "raffle", raffle.id, raffle);
  return raffle;
}
export async function enterRaffle(env, userId, raffleId) {
  const r = await get(env, "raffle", raffleId);
  assert(r && r.status === "open" && r.closesAt > Date.now(), "raffle_closed");
  if (r.entries.includes(uid(userId))) return r;
  assert(r.entries.length < r.maxEntries, "raffle_full");
  r.entries.push(uid(userId));
  await put(env, "raffle", r.id, r);
  return r;
}
export async function drawRaffles(env) {
  for (const r of (await list(env, "raffle")).filter(
    (r) => r.status === "open" && r.closesAt <= Date.now(),
  )) {
    const pool = [...r.entries],
      writes = [];
    for (const amount of r.prizes) {
      if (!pool.length) break;
      const index = randomInt(pool.length),
        winner = pool.splice(index, 1)[0];
      r.winners.push({ userId: winner, amount });
      writes.push(
        ...(
          await walletWrites(env, winner, {
            delta: amount,
            eventId: `raffle:${r.id}:${winner}`,
            reason: "raffle_prize",
          })
        ).writes,
      );
    }
    r.status = "drawn";
    r.drawnAt = Date.now();
    writes.push([key("raffle", r.id), r]);
    await commitJson(env, writes);
  }
}
