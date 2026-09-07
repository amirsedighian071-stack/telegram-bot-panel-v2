import {
  get,
  put,
  key,
  list,
  commitJson,
  assert,
  integer,
  MAX_MONEY,
  audit,
} from "./common.js";
import { account, available, walletWrites } from "./wallet.js";
import { serviceSettings } from "./settings.js";
import { tgApi, resolveToken, sendToUser } from "../bot-api.js";
import { getUser } from "../kv.js";
import { ratesTick } from "./rates.js";
const dateKey = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran" }).format(
    new Date(),
  );
export async function playDice(env, userId, requestId) {
  assert(
    /^[A-Za-z0-9_-]{8,80}$/.test(requestId || ""),
    "idempotency_key_required",
  );
  const gameId = String(userId) + ":" + requestId,
    old = await get(env, "dice", gameId);
  if (old) return old;
  const cfg = (await serviceSettings(env)).dice,
    a = await account(env, userId);
  assert(cfg.enabled, "dice_disabled");
  assert(cfg.agentsAllowed || a.role === "customer", "dice_role_not_allowed");
  assert(!cfg.newUsersOnly || a.spentTotal === 0, "dice_new_users_only");
  assert(a.balance + cfg.prize <= MAX_MONEY, "wallet_amount_limit");
  const cooldown = await get(env, "dice-user", userId, { nextAt: 0 });
  assert(cooldown.nextAt <= Date.now(), "dice_cooldown");
  const day = dateKey(),
    budget = await get(env, "dice-budget", day, { spent: 0, reserved: 0 });
  assert(
    budget.spent + budget.reserved + cfg.prize <= cfg.budget,
    "dice_budget_exhausted",
  );
  const game = {
    id: gameId,
    userId: String(userId),
    status: "rolling",
    emoji: cfg.emoji,
    prize: cfg.prize,
    day,
    createdAt: Date.now(),
    budgetReserved: cfg.prize,
  };
  budget.reserved += cfg.prize;
  await commitJson(env, [
    [key("dice", gameId), game],
    [
      key("dice-user", userId),
      { nextAt: Date.now() + cfg.intervalHours * 3600000, gameId },
    ],
    [key("dice-budget", day), budget],
  ]);
  const response = await tgApi(await resolveToken(env), "sendDice", {
    chat_id: Number(userId),
    emoji: cfg.emoji,
  });
  const value = response.result?.dice?.value;
  if (
    !response.ok ||
    response.result?.dice?.emoji !== cfg.emoji ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > (cfg.emoji === "🎲" ? 6 : 64)
  ) {
    game.status = response.uncertain ? "review" : "failed";
    game.error = response.description || "dice_result_unconfirmed";
    const current = await get(env, "dice-budget", day, {
      spent: 0,
      reserved: 0,
    });
    current.reserved = Math.max(0, current.reserved - game.budgetReserved);
    game.budgetReserved = 0;
    const writes = [
      [key("dice", gameId), game],
      [key("dice-budget", day), current],
    ];
    // A confirmed rejection means no roll happened. An uncertain response keeps the cooldown.
    if (!response.ok && response.error_code >= 400 && response.error_code < 500)
      writes.push([key("dice-user", userId), cooldown]);
    await commitJson(env, writes);
    return game;
  }
  const won =
    cfg.emoji === "🎲" ? value === 6 : [1, 22, 43, 64].includes(value);
  const amount = won ? cfg.prize : 0;
  const change = await walletWrites(env, userId, {
    delta: amount,
    eventId: "dice:" + gameId,
    reason: "dice_reward",
    details: { value, emoji: cfg.emoji, messageId: response.result.message_id },
  });
  const current = await get(env, "dice-budget", day, { spent: 0, reserved: 0 });
  current.reserved = Math.max(0, current.reserved - game.budgetReserved);
  current.spent += amount;
  Object.assign(game, {
    status: "done",
    value,
    won,
    amount,
    messageId: response.result.message_id,
    budgetReserved: 0,
    finishedAt: Date.now(),
  });
  await commitJson(env, [
    ...change.writes,
    [key("dice", gameId), game],
    [key("dice-budget", day), current],
  ]);
  await sendToUser(
    await resolveToken(env),
    userId,
    won
      ? `🎁 نتیجه تأییدشده تلگرام: ${value}\n${amount.toLocaleString("fa-IR")} تومان به کیف پول اضافه شد.`
      : `🎲 نتیجه تأییدشده تلگرام: ${value}\nاین نوبت برنده نشدید.`,
  );
  return game;
}
export async function cleanupDice(env) {
  for (const game of (await list(env, "dice")).filter(
    (g) => g.status === "rolling" && Date.now() - g.createdAt > 120000,
  )) {
    const budget = await get(env, "dice-budget", game.day, {
      spent: 0,
      reserved: 0,
    });
    budget.reserved = Math.max(0, budget.reserved - (game.budgetReserved || 0));
    game.budgetReserved = 0;
    game.status = "review";
    game.error = "dice_result_unconfirmed";
    await commitJson(env, [
      [key("dice", game.id), game],
      [key("dice-budget", game.day), budget],
    ]);
  }
}
export async function dailyReportTick(env) {
  const cfg = await serviceSettings(env);
  if (!cfg.dailyReport.enabled || !cfg.reportChat) return;
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Tehran",
      hour: "2-digit",
      hourCycle: "h23",
    }).format(new Date()),
  );
  if (hour !== cfg.dailyReport.hour) return;
  const day = dateKey();
  if (await get(env, "daily-report", day)) return;
  const since = Date.now() - 86400000;
  const payments = (await list(env, "payment")).filter(
    (p) => p.status === "paid" && p.paidAt >= since,
  );
  const orders = (await list(env, "operation")).filter(
    (o) => o.status === "done" && o.finishedAt >= since,
  );
  const inReview = (await list(env, "operation")).filter(
    (o) => o.status === "review",
  ).length;
  const msg = `📊 گزارش خدمات ۲۴ ساعت اخیر\n${day} · Asia/Tehran\n\nواریزهای تأییدشده: ${payments.length}\nجمع واریز: ${payments.reduce((n, p) => n + p.amount, 0).toLocaleString("fa-IR")} تومان\nعملیات تکمیل‌شده: ${orders.length}\nمبلغ فروش: ${orders.reduce((n, o) => n + o.amount, 0).toLocaleString("fa-IR")} تومان\nعملیات نیازمند بررسی: ${inReview}`;
  await put(
    env,
    "daily-report",
    day,
    { status: "sending", at: Date.now() },
    { ttl: 90 * 86400 },
  );
  const sent = await sendToUser(await resolveToken(env), cfg.reportChat, msg);
  await put(
    env,
    "daily-report",
    day,
    {
      status: sent.ok ? "sent" : sent.uncertain ? "review" : "failed",
      error: sent.description || "",
      at: Date.now(),
    },
    { ttl: 90 * 86400 },
  );
}
export async function serviceEngagementTick(env) {
  await ratesTick(env);
  await cleanupDice(env);
  await dailyReportTick(env);
}
