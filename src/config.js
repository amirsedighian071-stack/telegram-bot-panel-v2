export const MODULES = ['catalog', 'shop', 'channel', 'moderation', 'relay', 'crm', 'faq', 'learning', 'broadcast', 'support', 'menu', 'services'];

export const PURPOSES = {
  vpn: { fa: 'فروش و مدیریت سرویس VPN', en: 'VPN services & customer portal', icon: 'network', modules: ['services', 'crm', 'broadcast', 'support', 'menu'], desc: 'مینی‌اپ، پنل‌های VPN، کیف پول، نمایندگی و انبار کانفیگ' },
  custom: { fa: 'پیش‌فرض / سفارشی', en: 'Custom workspace', icon: 'sliders-horizontal', modules: MODULES, desc: 'همه ابزارها؛ انتخاب و شخصی‌سازی آزاد' },
  channel: { fa: 'مدیریت کانال', en: 'Channel manager', icon: 'radio', modules: ['catalog', 'channel', 'moderation', 'crm', 'broadcast', 'support', 'menu'], desc: 'انتشار، زمان‌بندی، محصولات، دسته‌بندی و تعامل' },
  shop: { fa: 'فروشگاه', en: 'Store', icon: 'shopping-bag', modules: ['catalog', 'shop', 'crm', 'broadcast', 'support', 'menu'], desc: 'محصول، سبد خرید، پرداخت، سفارش، رهگیری و تحویل' },
  group: { fa: 'مدیریت گروه', en: 'Group manager', icon: 'shield-check', modules: ['moderation', 'broadcast'], desc: 'مدیریت پیشرفته گروه، قفل محتوا، خوش‌آمدگویی، ضداسپم، اد اجباری، فیلتر کلمات، اخطار، خاموشی و قرعه‌کشی' },
  relay: { fa: 'حذف فوروارد / بی‌نام‌ساز', en: 'Anonymous relay', icon: 'copy', modules: ['relay', 'support'], desc: 'کپی بدون برچسب فوروارد به مقصدهای مدیر' },
  library: { fa: 'کتابخانه و دانلود', en: 'File library', icon: 'library', modules: ['catalog', 'crm', 'broadcast', 'support', 'menu'], desc: 'فایل‌های دسته‌بندی‌شده با لینک اختصاصی و قفل عضویت' },
  education: { fa: 'آموزش و دوره', en: 'Learning bot', icon: 'graduation-cap', modules: ['catalog', 'shop', 'learning', 'channel', 'broadcast', 'support', 'menu'], desc: 'درس و فایل، دوره پولی یا رایگان و ثبت پیشرفت' },
  support: { fa: 'پشتیبانی مشتریان', en: 'Customer support', icon: 'headset', modules: ['support', 'faq', 'menu'], desc: 'گفتگوی دوطرفه و پاسخ‌های متداول' },
  faq: { fa: 'راهنما و پرسش‌وپاسخ', en: 'FAQ assistant', icon: 'messages-square', modules: ['faq', 'support', 'menu'], desc: 'پاسخ‌های آماده دو زبانه با دکمه شیشه‌ای' },
  contest: { fa: 'مسابقه و باشگاه اعضا', en: 'Community contests', icon: 'trophy', modules: ['crm', 'broadcast', 'channel', 'support', 'menu'], desc: 'کوییز، نظرسنجی، امتیاز و معرفی دوستان' },
  rates: { fa: 'قیمت طلا، دلار و تتر', en: 'Gold, USD & crypto rates', icon: 'trending-up', modules: ['catalog', 'crm', 'broadcast', 'support', 'menu'], desc: 'قیمت لحظه‌ای طلا، سکه، دلار، تتر، ارزها و رمزارزها با نوسانات، سود و زیان و ارسال زمان‌بندی‌شده' },
  news: { fa: 'خبر مهم کشور ایران', en: 'Iran news publisher', icon: 'newspaper', modules: ['channel', 'broadcast', 'menu', 'support'], desc: 'جمع‌آوری و ارسال خودکار اخبار فوری و مهم کشور از معتبرترین خبرگزاری‌ها به کانال یا پی‌وی' },
  membership: { fa: 'باشگاه محتوای قفل‌دار', en: 'Members library', icon: 'key-round', modules: ['catalog', 'crm', 'broadcast', 'support', 'menu'], desc: 'محتوای ویژه اعضا با چند قفل کانال و گروه' },
};

export const validPurpose = key => typeof key === 'string' && Object.hasOwn(PURPOSES, key);

export const V2_DEFAULTS = {
  adminId: '',
  botPurpose: 'custom', customModules: MODULES, botUsername: '', publicBaseUrl: '',
  requiredChats: { enabled: false, targets: [] },
  uploads: { chatId: '', watermark: { enabled: false, text: '', logo: '', opacity: 0.65 } },
  shop: { cardNumber: '', cardHolder: '', notifyChatId: '', payment: 'manual', requireAddress: false, deliverySlots: [], reservationMinutes: 30, currency: 'IRT', protectContent: true },
  relay: { enabled: false, approval: true, destinations: [], echoToUser: false },
  loyalty: { enabled: true, referralPoints: 10, signupPoints: 0, purchaseUnit: 100000, pointValue: 100, maxDiscountPercent: 20 },
  news: { autoSend: { enabled: false, category: 'all', intervalMinutes: 60, destinations: [] } },
};

export function activeModules(settings) {
  const purpose = validPurpose(settings?.botPurpose) ? settings.botPurpose : 'custom';
  return purpose === 'custom'
    ? (Array.isArray(settings.customModules) ? settings.customModules.filter(m => MODULES.includes(m)) : MODULES)
    : PURPOSES[purpose].modules;
}
export const enabled = (settings, module) => activeModules(settings).includes(module);
export const text = (fa, en, lang) => lang === 'en' ? en : fa;
export const isChatId = id => /^-?[1-9]\d{0,15}$/.test(String(id)) || /^@[a-zA-Z][a-zA-Z0-9_]{4,31}$/.test(String(id));
export const isGroupId = id => /^-[1-9]\d{3,15}$/.test(String(id));
export const id = () => crypto.randomUUID().replace(/-/g, '').slice(0, 16);
export const str = (v, max = 500) => String(v ?? '').trim().slice(0, max);
export function int(v, min, max, fallback) {
  const n = Number(v);
  return Number.isSafeInteger(n) && n >= min && n <= max ? n : fallback;
}
export function assert(condition, message, status = 400) {
  if (!condition) { const e = new Error(message); e.status = status; throw e; }
}
export function httpsUrl(value, telegram = false) {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && !u.username && !u.password && (!telegram || ['t.me', 'telegram.me'].includes(u.hostname));
  } catch { return false; }
}
export function urlButtons(input) {
  if (!Array.isArray(input)) return [];
  return input.slice(0, 8).filter(Array.isArray).map(row => row.slice(0, 8).filter(b => b && str(b.text, 64) && httpsUrl(b.url)).map(b => ({ text: str(b.text, 64), url: str(b.url, 1024) }))).filter(r => r.length);
}

export function mergeV2Settings(s) {
  const d = structuredClone(V2_DEFAULTS);
  const oldModules = MODULES.filter(m => m !== 'services');
  if ((!s.schemaVersion || s.schemaVersion < 3) && Array.isArray(s.customModules) && oldModules.every(m => s.customModules.includes(m))) s.customModules = [...new Set([...s.customModules, 'services'])];
  const legacy = s.requiredChannel?.enabled && s.requiredChannel?.chatId;
  return {
    ...d, ...s, schemaVersion: 3,
    adminId: str(s.adminId || d.adminId, 32),
    botPurpose: validPurpose(s.botPurpose) ? s.botPurpose : 'custom',
    requiredChats: s.requiredChats || (legacy ? { enabled: true, targets: [{ chatId: s.requiredChannel.chatId, url: s.requiredChannel.url || '', title: '', scope: 'all' }] } : d.requiredChats),
    uploads: { ...d.uploads, ...s.uploads, watermark: { ...d.uploads.watermark, ...s.uploads?.watermark } },
    shop: { ...d.shop, ...s.shop }, relay: { ...d.relay, ...s.relay }, loyalty: { ...d.loyalty, ...s.loyalty },
    news: { autoSend: { ...d.news.autoSend, ...(s.news?.autoSend || {}) } },
  };
}

export function patchV2Settings(s, body) {
  if ('adminId' in body) {
    const aid = str(body.adminId, 32);
    assert(!aid || isChatId(aid) || /^\d+$/.test(aid), 'invalid_admin_id');
    s.adminId = aid;
  }
  if ('botPurpose' in body) { assert(validPurpose(body.botPurpose), 'invalid_purpose'); s.botPurpose = body.botPurpose; }
  if ('customModules' in body) { assert(Array.isArray(body.customModules), 'invalid_modules'); s.customModules = [...new Set(body.customModules.filter(m => MODULES.includes(m)))]; }
  if ('botUsername' in body) {
    const name = str(body.botUsername, 32).replace(/^@/, '');
    assert(!name || /^[a-zA-Z][a-zA-Z0-9_]{4,31}$/.test(name), 'invalid_bot_username'); s.botUsername = name;
  }
  if (body.requiredChats) {
    const rc = body.requiredChats;
    assert(Array.isArray(rc.targets) && rc.targets.length <= 20, 'invalid_required_chats');
    const targets = rc.targets.map(c => {
      const chatId = str(c.chatId, 64), url = str(c.url, 512);
      assert(isChatId(chatId), 'invalid_chat_id');
      assert(!url || httpsUrl(url, true), 'invalid_join_url');
      assert(chatId.startsWith('@') || url, 'private_chat_invite_required');
      assert(c.scope === 'all' || validPurpose(c.scope), 'invalid_lock_scope');
      return { chatId, url, title: str(c.title, 64), scope: c.scope };
    });
    assert(!rc.enabled || targets.length, 'lock_needs_targets');
    s.requiredChats = { enabled: !!rc.enabled, targets };
    s.requiredChannel = { enabled: false, chatId: '', url: '' };
  }
  if (body.uploads) {
    const b = body.uploads;
    if ('chatId' in b) { assert(!b.chatId || isChatId(b.chatId), 'invalid_upload_chat'); s.uploads.chatId = str(b.chatId, 64); }
    if (b.watermark) {
      const w = b.watermark;
      const logo = typeof w.logo === 'string' ? w.logo : s.uploads.watermark.logo;
      assert(!logo || (/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(logo) && logo.length < 300000), 'invalid_watermark_logo');
      s.uploads.watermark = { enabled: !!w.enabled, text: str(w.text, 100), logo, opacity: Number(w.opacity) >= 0.1 && Number(w.opacity) <= 1 ? Number(w.opacity) : 0.65 };
      assert(!w.enabled || s.uploads.watermark.text || logo, 'watermark_content_required');
    }
  }
  if (body.shop) {
    const b = body.shop, p = s.shop;
    for (const k of ['notifyChatId']) if (k in b) { assert(!b[k] || isChatId(b[k]), 'invalid_chat_id'); p[k] = str(b[k], 64); }
    if ('cardNumber' in b) {
      const card = str(b.cardNumber, 40).replace(/[\s-]/g, '');
      assert(!card || /^\d{16}$/.test(card), 'invalid_card_number'); p.cardNumber = card;
    }
    if ('cardHolder' in b) p.cardHolder = str(b.cardHolder, 100);
    if ('payment' in b) { assert(['manual', 'zarinpal'].includes(b.payment), 'invalid_payment_method'); p.payment = b.payment; }
    if ('requireAddress' in b) p.requireAddress = !!b.requireAddress;
    if ('protectContent' in b) p.protectContent = !!b.protectContent;
    if ('deliverySlots' in b) p.deliverySlots = (Array.isArray(b.deliverySlots) ? b.deliverySlots : []).map(v => str(v, 80)).filter(Boolean).slice(0, 12);
    if ('reservationMinutes' in b) { assert(int(b.reservationMinutes, 5, 1440) !== undefined, 'invalid_reservation_time'); p.reservationMinutes = Number(b.reservationMinutes); }
  }
  if (body.relay) {
    const b = body.relay;
    const dest = Array.isArray(b.destinations) ? b.destinations : s.relay.destinations;
    assert(dest.length <= 10 && dest.every(d => isChatId(d.chatId)), 'invalid_destinations');
    s.relay = { enabled: !!b.enabled, approval: b.approval !== false, echoToUser: !!b.echoToUser, destinations: dest.map(d => ({ chatId: str(d.chatId, 64), title: str(d.title, 64) })) };
    assert(!s.relay.enabled || dest.length || s.relay.echoToUser || s.relay.approval, 'relay_needs_destination');
  }
  if (body.news) {
    const a = body.news.autoSend || body.news;
    const dest = Array.isArray(a.destinations) ? a.destinations : s.news.autoSend.destinations;
    assert(dest.length <= 10 && dest.every(d => isChatId(typeof d === 'string' ? d : d.chatId)), 'invalid_destinations');
    const category = ['all', 'breaking', 'politics', 'economy', 'sports', 'tech'].includes(a.category) ? a.category : 'all';
    const interval = int(a.intervalMinutes, 10, 1440, 60);
    assert(interval !== undefined, 'invalid_news_interval');
    s.news = { autoSend: { enabled: !!a.enabled, category, intervalMinutes: Number(interval), destinations: dest.map(d => typeof d === 'string' ? { chatId: str(d, 64), title: '' } : { chatId: str(d.chatId, 64), title: str(d.title, 64) }) } };
  }
  if (body.loyalty) {
    const b = body.loyalty;
    if ('enabled' in b) s.loyalty.enabled = !!b.enabled;
    for (const [k, max] of Object.entries({ referralPoints: 10000, signupPoints: 10000, purchaseUnit: 1000000000, pointValue: 1000000, maxDiscountPercent: 100 })) {
      if (k in b) { assert(int(b[k], k === 'purchaseUnit' ? 1 : 0, max) !== undefined, 'invalid_loyalty'); s.loyalty[k] = Number(b[k]); }
    }
  }
  return s;
}
