import {
  get,
  put,
  assert,
  integer,
  str,
  publicHTTPS,
  MAX_MONEY,
} from "./common.js";
export const DEFAULTS = {
  enabled: true,
  maintenance: false,
  brand: {
    name: "فروشگاه خدمات",
    nameEn: "Service store",
    mark: "S",
    accent: "#38bdf8",
    logo: "",
  },
  publicUrl: "",
  reportChat: "",
  rules: "",
  rulesEn: "",
  rulesVersion: 1,
  phoneRequired: false,
  iranPhonesOnly: false,
  testPlanId: "",
  testsPerUser: 1,
  customNames: true,
  maxOpenOperations: 3,
  maxServices: 100,
  lowVolumeGB: 1,
  lowDays: 3,
  syncMinutes: 10,
  deleteExpiredDays: 0,
  giftSignup: 0,
  agentRequests: true,
  agentMinPaid: 0,
  referralPercent: 0,
  purchaseCashback: 0,
  topupMin: 10000,
  topupMax: 100000000,
  topupMinutes: 30,
  usdToman: 0,
  rates: { mode: "manual", refreshMinutes: 3, maxAgeMinutes: 10 },
  dice: {
    enabled: false,
    emoji: "🎲",
    prize: 10000,
    intervalHours: 24,
    newUsersOnly: true,
    agentsAllowed: false,
    budget: 100000,
  },
  dailyReport: { enabled: false, hour: 9 },
  starToman: 0,
  clientApps: [],
  wheel: { enabled: false, dailySpins: 1, fee: 0, budget: 0, prizes: [] },
  retentionDays: 90,
  backup: { enabled: false, hour: 3 },
  buttonStyle: "",
  premiumEmojiId: "",
};
export async function serviceSettings(env) {
  const s = await get(env, "config", "main", {});
  return {
    ...structuredClone(DEFAULTS),
    ...s,
    brand: { ...DEFAULTS.brand, ...s.brand },
    wheel: { ...DEFAULTS.wheel, ...s.wheel },
    backup: { ...DEFAULTS.backup, ...s.backup },
    rates: { ...DEFAULTS.rates, ...s.rates },
    dice: { ...DEFAULTS.dice, ...s.dice },
    dailyReport: { ...DEFAULTS.dailyReport, ...s.dailyReport },
  };
}
export async function saveServiceSettings(env, body) {
  const s = await serviceSettings(env);
  for (const k of [
    "enabled",
    "maintenance",
    "phoneRequired",
    "iranPhonesOnly",
    "customNames",
    "agentRequests",
  ])
    if (k in body) s[k] = !!body[k];
  for (const [k, min, max] of [
    ["testsPerUser", 0, 20],
    ["maxOpenOperations", 1, 10],
    ["maxServices", 1, 10000],
    ["lowDays", 0, 365],
    ["syncMinutes", 1, 1440],
    ["deleteExpiredDays", 0, 365],
    ["giftSignup", 0, 1000000],
    ["agentMinPaid", 0, MAX_MONEY],
    ["referralPercent", 0, 100],
    ["purchaseCashback", 0, 100],
    ["topupMin", 1, MAX_MONEY],
    ["topupMax", 1, MAX_MONEY],
    ["topupMinutes", 5, 1440],
    ["usdToman", 0, 1000000000],
    ["starToman", 0, 10000000],
  ])
    if (k in body) s[k] = integer(body[k], min, max);
  if ("lowVolumeGB" in body) {
    const n = Number(body.lowVolumeGB);
    assert(Number.isFinite(n) && n >= 0 && n <= 10000, "invalid_low_volume");
    s.lowVolumeGB = n;
  }
  assert(s.topupMax >= s.topupMin, "invalid_topup_bounds");
  for (const k of [
    "publicUrl",
    "reportChat",
    "rules",
    "rulesEn",
    "testPlanId",
    "premiumEmojiId",
  ])
    if (k in body) s[k] = str(body[k], k.startsWith("rules") ? 3000 : 512);
  assert(!s.publicUrl || publicHTTPS(s.publicUrl), "public_url_must_be_https");
  assert(
    !s.reportChat ||
      /^(@[A-Za-z][A-Za-z0-9_]{4,31}|-?[1-9]\d{0,15})$/.test(s.reportChat),
    "invalid_chat_id",
  );
  if (
    ("rules" in body && s.rules !== (await serviceSettings(env)).rules) ||
    ("rulesEn" in body && s.rulesEn !== (await serviceSettings(env)).rulesEn)
  )
    s.rulesVersion++;
  if (body.brand) {
    s.brand = {
      name: str(body.brand.name, 80) || DEFAULTS.brand.name,
      nameEn: str(body.brand.nameEn, 80) || DEFAULTS.brand.nameEn,
      mark: str(body.brand.mark, 3) || "S",
      accent: str(body.brand.accent, 7),
      logo: str(body.brand.logo, 250000),
    };
    assert(/^#[0-9a-fA-F]{6}$/.test(s.brand.accent), "invalid_accent");
    assert(
      !s.brand.logo ||
        /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(
          s.brand.logo,
        ),
      "invalid_logo",
    );
  }
  if ("clientApps" in body) {
    assert(
      Array.isArray(body.clientApps) && body.clientApps.length <= 30,
      "invalid_apps",
    );
    s.clientApps = body.clientApps.map((a) => {
      let u;
      try {
        u = new URL(a.url);
      } catch {}
      assert(
        u && !u.username && !u.password && publicHTTPS(u.origin + u.pathname),
        "invalid_app_url",
      );
      return {
        title: str(a.title, 64),
        os: str(a.os, 32),
        url: a.url,
        help: str(a.help, 2000),
      };
    });
  }
  if ("buttonStyle" in body) {
    assert(
      ["", "primary", "success", "danger"].includes(body.buttonStyle),
      "invalid_button_style",
    );
    s.buttonStyle = body.buttonStyle;
  }
  assert(
    !s.premiumEmojiId || /^\d{5,30}$/.test(s.premiumEmojiId),
    "invalid_emoji_id",
  );
  if (body.wheel) {
    const w = body.wheel;
    s.wheel = {
      enabled: !!w.enabled,
      dailySpins: integer(w.dailySpins, 1, 10),
      fee: integer(w.fee || 0, 0, 1000000),
      budget: integer(w.budget || 0, 0, MAX_MONEY),
      prizes: (Array.isArray(w.prizes) ? w.prizes : [])
        .slice(0, 20)
        .map((p) => ({
          title: str(p.title, 50),
          amount: integer(p.amount, 0, 10000000),
          weight: integer(p.weight, 1, 100000),
        })),
    };
    assert(
      !s.wheel.enabled || s.wheel.prizes.length >= 2,
      "wheel_prizes_required",
    );
  }
  if (body.rates) {
    const r = body.rates;
    assert(["manual", "swapwallet"].includes(r.mode), "invalid_rate_mode");
    s.rates = {
      mode: r.mode,
      refreshMinutes: integer(r.refreshMinutes || 3, 1, 60),
      maxAgeMinutes: integer(r.maxAgeMinutes || 10, 1, 1440),
    };
    assert(
      s.rates.maxAgeMinutes >= s.rates.refreshMinutes,
      "invalid_rate_intervals",
    );
  }
  if (body.dice) {
    const d = body.dice;
    assert(["🎲", "🎰"].includes(d.emoji), "invalid_dice_emoji");
    s.dice = {
      enabled: !!d.enabled,
      emoji: d.emoji,
      prize: integer(d.prize, 0, 10000000),
      intervalHours: integer(d.intervalHours, 1, 168),
      newUsersOnly: !!d.newUsersOnly,
      agentsAllowed: !!d.agentsAllowed,
      budget: integer(d.budget, 0, MAX_MONEY),
    };
  }
  if (body.dailyReport) {
    s.dailyReport = {
      enabled: !!body.dailyReport.enabled,
      hour: integer(body.dailyReport.hour, 0, 23),
    };
    assert(!s.dailyReport.enabled || s.reportChat, "report_chat_required");
  }
  if (body.backup)
    s.backup = {
      enabled: !!body.backup.enabled,
      hour: integer(body.backup.hour, 0, 23),
    };
  if (env.MANAGED_BASE_URL) s.publicUrl = env.MANAGED_BASE_URL;
  await put(env, "config", "main", s);
  return s;
}
export function publicSettings(s) {
  return {
    brand: s.brand,
    rules: s.rules,
    rulesEn: s.rulesEn,
    rulesVersion: s.rulesVersion,
    phoneRequired: s.phoneRequired,
    iranPhonesOnly: s.iranPhonesOnly,
    maintenance: s.maintenance,
    enabled: s.enabled,
    customNames: s.customNames,
    topupMin: s.topupMin,
    topupMax: s.topupMax,
    testPlanId: s.testPlanId,
    clientApps: s.clientApps,
    agentRequests: s.agentRequests,
    dice: {
      enabled: s.dice.enabled,
      emoji: s.dice.emoji,
      prize: s.dice.prize,
      intervalHours: s.dice.intervalHours,
      newUsersOnly: s.dice.newUsersOnly,
    },
    wheel: {
      enabled: s.wheel.enabled,
      fee: s.wheel.fee,
      dailySpins: s.wheel.dailySpins,
      prizes: s.wheel.prizes.map((p) => ({ title: p.title, amount: p.amount })),
    },
  };
}
