<div align="center">

<img src="assets/readme/botpanel-logo.svg" alt="BotPanel — Telegram bot workspace" width="760">

**یک پنل، چند نوع ربات، یک زیرساخت بومی Cloudflare**<br>
**One workspace. Multiple bot types. Native Cloudflare infrastructure.**

`Release 3.1.0` · `Workers + SQLite Durable Objects` · `فارسی / English`

[راهنمای فارسی](#fa-guide) · [English guide](#en-guide) · [تصاویر دسکتاپ / Desktop gallery](#desktop-gallery) · [سازنده / Creator](#creator)

</div>

> **رمز ورود اولیه / Initial password: `botpanel123`**<br>
> در نصب تازه، متغیر ورود لازم نیست؛ پس از ورود اولیه، رمز خصوصی را در خود پنل تعیین می‌کنید.<br>
> A fresh installation needs no login environment variable. After the first login, set a private password inside the panel.

---

<a id="desktop-gallery"></a>
## تصاویر دسکتاپ · Desktop gallery

تصاویر زیر از **رابط واقعی نسخه ۳٫۱ در محیط محلی با داده‌های نمایشی** گرفته شده‌اند و در **قاب تزئینی مرورگر به سبک macOS** قرار دارند. هیچ تصویر موبایلی در این README استفاده نشده است. آدرس‌ها، پلن‌ها و اعتبارهای نمونه، سرویس VPN یا پرداخت واقعی نیستند. رابط روی مرورگر دسکتاپ Windows و macOS قابل استفاده است؛ قاب تصویر، ادعای اجرای آزمون روی سیستم‌عامل مک نیست.

The screenshots show the **actual v3.1 UI running locally with demonstration data**, placed in a **macOS-style browser frame**. This README contains **desktop screenshots only**. Sample addresses, plans and balances are not live VPN services or real payments. The UI is usable from desktop browsers on Windows/macOS; the decorative frame is not a claim that testing ran on macOS.

<details open>
<summary><strong>فارسی — داشبورد، نوع ربات و آپلود مستقیم</strong></summary>

**داشبورد مدیریت · Admin dashboard**

![داشبورد فارسی در قاب مرورگر مک](assets/readme/mac-dashboard-fa.webp)

**ربات برای چه کاری باشد؟ · Bot purpose selection**

![انتخاب نوع ربات در نمای دسکتاپ فارسی](assets/readme/mac-purposes-fa.webp)

**آپلود مستقیم عکس و فایل · Direct photo/file upload**

![آپلود مستقیم عکس و فایل بدون لینک در دسکتاپ](assets/readme/mac-upload-fa.webp)

</details>

<details>
<summary><strong>ورود اولیه و تعیین رمز خصوصی — Initial login & private password</strong></summary>

![صفحه ورود اولیه فارسی در قاب مک](assets/readme/mac-login-fa.webp)

![تعیین رمز خصوصی بدون متغیر محیطی](assets/readme/mac-setup-fa.webp)

</details>

<details>
<summary><strong>English — service administration & settings</strong></summary>

![English service administration in a macOS-style frame](assets/readme/mac-services-en.webp)

![English service settings on desktop](assets/readme/mac-settings-en.webp)

</details>

<details>
<summary><strong>مینی‌اپ مشتری در دسکتاپ — Customer portal, Persian & English</strong></summary>

![Customer portal in English on desktop](assets/readme/mac-portal-en.webp)

![مینی‌اپ مشتری به فارسی در نمای دسکتاپ](assets/readme/mac-portal-fa.webp)

</details>

---

<a id="fa-guide"></a>
<div dir="rtl">

# راهنمای کامل فارسی

## فهرست

[معرفی](#fa-intro) · [معماری و فایل‌ها](#fa-architecture) · [همه قابلیت‌ها](#fa-features) · [محدودیت‌ها](#fa-limits) · [نصب با Fork و GitHub](#fa-install) · [ویرایش wrangler.toml](#fa-config) · [اتصال Cloudflare](#fa-connect) · [متغیرها و Secretها](#fa-secrets) · [راه‌اندازی ربات](#fa-first-run) · [چند ربات](#fa-multi) · [Windows و macOS](#fa-local) · [به‌روزرسانی و پشتیبان](#fa-maintenance) · [عیب‌یابی](#fa-troubleshooting)

<a id="fa-intro"></a>
## ۱. این پروژه چیست؟

**BotPanel v2** نام مخزن و نسل این پنل است؛ **۳٫۱٫۰** نسخهٔ نرم‌افزار فعلی است. این پروژه یک پنل وب فارسی/انگلیسی برای مدیریت ربات تلگرام است که روی **Cloudflare Workers** اجرا می‌شود. با انتخاب نوع ربات، ابزارهای مرتبط نمایش داده می‌شوند و بخش‌های نامرتبط پنهان می‌مانند؛ اطلاعات قبلی پاک نمی‌شوند.

سه رابط اصلی وجود دارد:

1. **پنل مدیر:** کاربران، پیام‌ها، تنظیمات، فروشگاه، کانال/گروه، خدمات و ربات‌های مستقل.
2. **ربات تلگرام:** منوها، قفل عضویت، خرید، دریافت محتوا، پشتیبانی و مدیریت سرویس.
3. **مینی‌اپ مشتری:** مشاهده پلن، کیف پول، سفارش سرویس، کانفیگ، QR، پرداخت و پیگیری درخواست.

دو گردش فروش مستقل را اشتباه نگیرید:

| بخش | کاربرد | کد اصلی |
|---|---|---|
| فروشگاه عمومی | فروش فایل، محصول آماده/دستی و کالای فیزیکی؛ سبد خرید، آدرس و سفارش | `src/commerce.js` |
| خدمات / VPN | پلن زمان/حجم، پنل‌های سرویس، انبار کانفیگ، کیف پول و نمایندگی | `src/services/` |

کاربران هر ربات مشترک‌اند، اما **محصول، سفارش و تخفیف فروشگاه عمومی با پلن، کیف پول و فاکتور خدمات یکی نیست**. امتیاز وفاداری نیز با پول کیف پول تفاوت دارد.

بخشی از قابلیت‌های خدمات با مطالعهٔ [Faoxima](https://github.com/Mmd-Amir/Faoxima) بازپیاده‌سازی شده است. این مخزن، اجرای PHP داخل Workers یا نسخهٔ صددرصد یکسان همه گزینه‌های آن پروژه نیست. [مرز دقیق انتقال](docs/FAOXIMA-CLOUDFLARE.fa.md) و [ادامهٔ آن در ۳٫۱](docs/RELEASE-3.1.fa.md) مستند است.

<a id="fa-architecture"></a>
## ۲. معماری و ساختار فایل‌ها

<div dir="ltr">

```text
Admin browser / Customer Mini App / Telegram
                       │ HTTPS
                       ▼
            Cloudflare Worker + Hono
              │                   │
              │                   └── ASSETS → HTML / CSS / JS / fonts
              ▼
        BOT_STATE: BotCoordinator
              │
              ├── SQLite: users, settings, orders, wallets, jobs
              ├── Ordered financial mutations + per-group queues
              ├── Cron Triggers + Durable Object alarms
              ├── HTTPS → Telegram / VPN providers / payment providers
              ├── optional BOT_KV → read-only v1 import
              └── optional BACKUPS → encrypted R2 archives

Managed bot A → its own BotCoordinator / SQLite / wallet
Managed bot B → its own BotCoordinator / SQLite / wallet
```

</div>

- **Workers:** ورودی HTTP، API و وب‌هوک را دریافت می‌کند؛ فایل‌های PHP یا daemon سرویس VPN اجرا نمی‌کند.
- **Hono:** مسیرهای API، احراز هویت، محدودیت اندازه درخواست و پاسخ‌ها را مدیریت می‌کند.
- **Durable Objects SQLite:** منبع اصلی داده و هماهنگی عملیات مالی است. این پروژه **به D1 نیاز ندارد**.
- **BOT_KV:** فقط برای خواندن و واردکردن داده‌های قدیمی v1؛ در نصب تازه اختیاری است و پول/موجودی v3 داخل آن ذخیره نمی‌شود.
- **Cron و Alarm:** ارسال‌ها، ساخت سرویس، بررسی پرداخت، هشدار، نرخ ارز و گزارش را بدون بازماندن مرورگر جلو می‌برند.
- **سرویس بیرونی:** خود Telegram، پنل VPN، درگاه و پردازشگر ویدیو بیرون از Worker هستند؛ این پنل آنها را به‌وجود نمی‌آورد.

<div dir="ltr">

```text
telegram-bot-panel-v2/
├── README.md                       # This bilingual guide
├── wrangler.toml                   # Worker, assets, bindings, migrations, cron
├── package.json / package-lock.json
├── .dev.vars.example               # Local-only configuration example
├── public/
│   ├── index.html                  # Admin application entry
│   ├── panel.js / panel.css         # Main admin interface
│   ├── studio.js / studio.css       # Purpose presets and general tools
│   ├── services.js                 # Services/VPN admin workspace
│   ├── portal/                     # Customer Mini App: HTML/CSS/JS
│   └── vendor/                     # Local fonts, icons, Telegram SDK
├── src/
│   ├── index.js                    # Worker entry + BotCoordinator
│   ├── auth.js                     # Admin sessions and password setup
│   ├── storage.js / kv.js           # SQLite adapter, models, legacy import
│   ├── telegram.js / bot-api.js      # Telegram updates and API calls
│   ├── config.js / gate.js          # Purpose presets and membership checks
│   ├── media.js / broadcast.js      # Uploads and durable delivery jobs
│   ├── commerce.js / payments.js    # General store and its payment flow
│   ├── groups.js / automation.js    # Moderation, feeds and relaying
│   ├── crm.js / engagement.js       # Points, polls and reactions
│   ├── routes/                     # General admin API modules
│   └── services/
│       ├── routes.js / bot.js       # Services admin/customer/bot APIs
│       ├── customer-auth.js         # Telegram initData and customer sessions
│       ├── engine.js / providers.js # Provisioning and provider adapters
│       ├── wallet.js / payments.js  # Financial ledger and funding
│       ├── crypto-pay.js / rates.js # Chain verification and FX quotes
│       ├── managed-bots.js          # Isolated managed bot instances
│       ├── subscriptions.js        # Private and combined subscriptions
│       ├── reports.js               # CSV/XLSX and encrypted backups
│       └── engagement.js           # Dice, scheduled reports, maintenance
├── scripts/                        # Frontend build and regression checks
├── tests/                          # Unit, SQLite and browser tests
├── styles/ / tailwind.config.cjs    # CSS build inputs
├── assets/readme/                  # Desktop-only README gallery and logo
└── docs/                           # Detailed migration and release guides
```

</div>

**برای نصب عادی لازم نیست `src/index.js` یا سورس‌های دیگر را ویرایش کنید.** فایل اصلی تنظیم استقرار `wrangler.toml` است. اطلاعات خصوصی را در سورس یا README قرار ندهید.

<a id="fa-features"></a>
## ۳. فهرست قابلیت‌های نسخهٔ فعلی

### ۳٫۱. سیزده نوع ربات

| حالت | کاربرد |
|---|---|
| پیش‌فرض / سفارشی | تمام ابزارهای قابل انتخاب؛ ترکیب و شخصی‌سازی ماژول‌ها |
| مدیریت کانال | محتوا، دسته‌بندی، دیپ‌لینک، زمان‌بندی، تعامل و گروه نظرات |
| فروشگاه | محصول، سبد خرید، پرداخت، سفارش و تحویل |
| نگهبان گروه | چند گروه، ضداسپم، کپچا، قوانین، اخطار و حالت شب |
| حذف فوروارد / بی‌نام‌ساز | دریافت پیام و آلبوم و کپی به مقصدهای مدیر |
| کتابخانه و دانلود | فایل‌های دسته‌بندی‌شده، دریافت رایگان و قفل عضویت |
| آموزش و دوره | درس/فایل رایگان یا پولی و ثبت پیشرفت مطالعه |
| پشتیبانی مشتریان | گفتگو و تیکت دوطرفه همراه FAQ |
| راهنما و پرسش‌وپاسخ | پرسش‌های متداول با دکمه شیشه‌ای و پاسخ دو زبانه |
| مسابقه و باشگاه اعضا | کوییز، نظرسنجی، امتیاز و معرفی دوستان |
| خبرخوان خودکار | RSS/Atom، اعلان یوتیوب و بازنشر کانال‌های مجاز |
| باشگاه محتوای قفل‌دار | محتوای قابل دریافت برای اعضای مقصدهای تعیین‌شده؛ نه اشتراک پولی زمان‌دار |
| فروش و مدیریت سرویس VPN | پلن، پنل سرویس، کیف پول، نمایندگی، انبار و مینی‌اپ |

انتخاب نوع، هم رابط و هم دسترسی به مسیرهای تخصصی ربات/API را تغییر می‌دهد. **انتخاب حالت، ربات جدیدی در BotFather نمی‌سازد.** برای ترکیب فروشگاه و کانال، حالت سفارشی را انتخاب کنید.

### ۳٫۲. مدیریت، ظاهر و منو

- داشبورد آمار، کاربران اخیر و وضعیت وب‌هوک؛ جستجو و صفحه‌بندی کاربران، مسدود/آزادکردن و پیام مستقیم.
- منو و دکمه‌های چندلایه، لینک URL، callback، متن کوتاه و زیرمنو؛ متن شروع/راهنما با متغیرهای نام، نام کاربری و شناسه.
- دکمه پشتیبانی قابل تنظیم، تیکت دوطرفه، وضعیت خوانده‌نشده و بستن گفتگو.
- زبان مستقل پنل و حالت فارسی، انگلیسی یا دو زبانه برای ربات؛ جهت RTL/LTR.
- شش تم: تیره، روشن، اقیانوسی، بنفش، جنگل و غروب؛ انیمیشن سبک و رعایت کاهش حرکت دستگاه.
- فایل‌های فونت، آیکون و CSS محلی؛ برای استایل پنل CDN زمان اجرا لازم نیست.
- تغییر رمز، نشست مدیر، محدودیت تلاش ورود و نمایش‌ندادن توکن کامل در خروجی تنظیمات.

### ۳٫۳. ارسال همگانی و رسانه

- دو دکمهٔ مستقل **افزودن عکس** و **افزودن فایل**، انتخاب از دستگاه، drag-and-drop، پیشرفت آپلود و پیش‌نمایش.
- متن، عکس، فایل اصلی، MP4، GIF/انیمیشن و MP3/M4A؛ استفاده مجدد از فایل‌های قبلی با `file_id` تلگرام.
- کپشن، دکمه‌های URL، لایک/دیس‌لایک و بازخورد متنی اختیاری روی رسانه.
- ارسال به همه، فعال‌های ۷/۳۰ روز، آیدی‌های مشخص، چند کانال/گروه یا خریداران یک محصول فروشگاه عمومی.
- زمان‌بندی، تکرار و حذف خودکار؛ توقف/ادامه صف، تاریخچه، شمارنده موفق/ناموفق و رعایت `retry_after` تلگرام.
- ادامه ارسال سمت سرور با بسته‌شدن مرورگر؛ ارسال نامشخص برای بررسی متوقف می‌شود، نه اینکه کورکورانه تکرار شود.
- واترمارک متن/لوگو روی **عکس‌های تازه آپلودشده از پنل** در مرورگر؛ نه خودکار روی همه محتوای بازنشرشده.
- تبدیل، فشرده‌سازی و واترمارک ویدیو از طریق قرارداد پردازشگر خارجی؛ **خود FFmpeg/سرویس پردازشگر در این مخزن مستقر نمی‌شود**.

### ۳٫۴. کانال، تعامل و قفل عضویت

- محصول/فایل با دیپ‌لینک ثابت و دسته‌بندی با دکمه شیشه‌ای.
- RSS/Atom، عنوان و لینک ویدیوهای جدید یوتیوب و کپی پست کانال‌هایی که ربات به آنها دسترسی دارد.
- اسکن اول فید، خط مبنا می‌سازد و مطالب قدیمی را یک‌باره نمی‌فرستد؛ تکرار و حلقه بازنشر کنترل می‌شود.
- نظرسنجی تک‌گزینه‌ای، چندگزینه‌ای، کوییز با پاسخ صحیح/امتیاز/مهلت و محدودیت عضویت رأی‌دهندگان.
- چند قفل کانال/گروه، دامنهٔ سراسری یا مخصوص یک نوع ربات، لینک دعوت خصوصی و دکمه بررسی مجدد.
- بررسی عضویت در درخواست‌ها؛ خطای Telegram دسترسی را باز نمی‌کند. وضعیت restricted فقط همراه `is_member=true` عضو محسوب می‌شود.
- دیپ‌لینک پس از عضویت ادامه پیدا می‌کند؛ پرداخت، قفل عضویتِ دریافت محتوا را دور نمی‌زند.

### ۳٫۵. نگهبان گروه

- تنظیم مستقل چند گروه/سوپرگروه و گروه نظرات متصل به کانال؛ گروه کشف‌شده تا فعال‌سازی مدیر خاموش می‌ماند.
- کنترل لینک، فوروارد، متن طولانی، ایموجی/هشتگ زیاد، flood، کلمات ممنوعه و انواع رسانه.
- جلوگیری از ورود حساب‌های ربات، کپچای دکمه‌ای یا جمع ساده، پذیرش قوانین و خوش‌آمد متن/عکس.
- حذف، اخطار، سکوت مدت‌دار و بن؛ سقف اخطار و جریمه بعدی قابل تنظیم.
- دستورهای مدیریتی با بررسی نقش واقعی Telegram، گزارش اعضا و ثبت رویداد/خطا در پنل.
- حالت شب با منطقه زمانی IANA، پاکسازی پیام ورود/خروج و بازگردانی دسترسی‌های موقت بعد از غیرفعال‌سازی.
- ادمین ناشناس خود گروه و پست ریشه خودکار کانال متصل معاف‌اند؛ ارسال تبلیغ به نام کانال دیگر، راه دورزدن فیلتر نیست.

### ۳٫۶. فروشگاه عمومی

- عنوان/توضیح فارسی و انگلیسی، عکس، دسته، قیمت تومان، موجودی، مخفی‌کردن و ویرایش محصول.
- تحویل **آماده** با متن/فایل خصوصی، **دستی** توسط مدیر یا **فیزیکی** با اطلاعات تحویل.
- افزودن/کم‌کردن/حذف در سبد؛ مبلغ نهایی، تخفیف درصدی/مبلغی و استفاده از امتیاز.
- نام گیرنده، تلفن، آدرس و بازهٔ ارسال؛ ثبت snapshot قیمت و محتوای سفارش.
- کارت‌به‌کارت با بررسی دستی رسید و اتصال اختیاری زرین‌پال؛ رزرو موجودی و آزادسازی در رد/لغو/انقضا.
- اعلان مدیر، بررسی فیش، مراحل آماده‌سازی/ارسال/تحویل، رهگیری و اعلان وضعیت مشتری.
- هدیه ثبت‌نام، امتیاز خرید/معرفی، سقف تبدیل امتیاز به تخفیف و هدف‌گیری خریداران محصول.

### ۳٫۷. خدمات، کیف پول و انبار VPN

- مینی‌اپ با Telegram initData امضاشده یا لینک یک‌بارمصرف؛ نشست مشتری مستقل از مدیر و کنترل مالکیت هر سرویس.
- پلن زمان/حجم، کشور و موقعیت، دسته، قیمت کاربر/نماینده، خرید چندتایی، نام دلخواه و تعرفه حجم/روز دلخواه.
- حساب مشتری، نماینده و نماینده اعتباری؛ تخفیف اختصاصی، سقف بدهی، انقضا و درخواست نمایندگی.
- دفترکل کیف پول، رزرو پیش از ساخت، کسر بعد از نتیجه موفق، آزادسازی شکست قطعی و ثبت ضدتکرار.
- قفسه و رکورد مستقل هر کانفیگ، import گروهی و تشخیص تکراری، رمزگذاری محتوا، تحویل یکتا و فروش دستی عمده.
- پنل اضطراری/جایگزین برای فروش جدید، سهمیه تست و محدودیت تعداد سرویس و عملیات باز.
- ساخت، تمدید، GB/روز اضافه، بروزرسانی مصرف، فعال/متوقف‌کردن، reset و revoke در APIهای پشتیبان.
- درخواست گزارش مشکل، انتقال مالکیت، تغییر موقعیت و استرداد با بررسی مدیر؛ تطبیق نتیجه‌های نامشخص.
- کانفیگ، لینک خصوصی، QR، کارت مصرف SVG/PNG و لینک تجمیعی URIهای فعال؛ WireGuard جدا دریافت می‌شود.
- تخفیف دامنه‌دار خرید/تمدید/حجم/زمان، هدیه کیف پول، کش‌بک و پورسانت.
- گردونه بودجه‌دار، تاس/اسلات رایگان با نتیجه واقعی `sendDice`، قرعه‌کشی رایگان زمان‌دار و گزارش مالی روزانه.
- نرخ دستی یا خودکار SwapWallet، کنترل تازگی نرخ و ثابت‌ماندن نرخ فاکتورهای صادرشده.
- سلامت پنل، هشدار کمبود حجم/زمان، مشاهده/اتصال مجدد نودهای پشتیبان، خروجی CSV/XLSX و پشتیبان رمزگذاری‌شده.

**روش‌های اتصال سرویس:**

| نوع | قرارداد / محدودیت مهم |
|---|---|
| انبار دستی | بدون API بیرونی؛ تمدید یعنی کانفیگ جایگزین، نه افزایش خودکار سهمیهٔ کانفیگ قبلی؛ مصرف آنلاین ندارد. |
| Marzban کلاسیک | `/api/user`، proxies و inbounds |
| Marzban 1.x | proxy_settings/group_ids و تاریخ ISO |
| Marzneshin | `/api/users`، service_ids و expire_strategy |
| 3x-ui / x-ui | ورود cookie و API کلاینت داخل inbound |
| 3x-ui Token API | نسخه دارای مسیرهای clients/add، traffic، links، update، del و resetTraffic |
| Alireza single | کلاینت داخل inbound با `/xui/API/inbounds` |
| Alireza inbound مستقل | یک inbound برای هر سرویس؛ پورت آزاد در بازه تعیین‌شده |
| S-UI v2 | Token و `/apiv2/save` |
| Hiddify v2 | API key، مدل حجم GB و روز؛ جزئیات زمان بر اساس قرارداد پنل |
| WGDashboard | peer، interface و jobهای محدودیت؛ زمان سرور UTC باشد؛ job ناشناخته نیازمند بررسی است. |
| MikroTik | User Manager REST با HTTPS؛ محدودیت‌ها از profile سرور، نه SSH یا API دودویی |
| IBSng | رابط وب کلاسیک HTTPS؛ شناسه تخصیص‌یافته برای ساخت دومرحله‌ای حفظ می‌شود؛ تغییر قالب HTML نیازمند تطبیق است. |
| Guard | X-API-Key و `/api/subscriptions` |

نام یک خانواده به معنی پشتیبانی تمام forkها یا تمام عملیات آن نیست. API، مجوز، inbound، profile، گواهی TLS و **آدرس واقعی اتصال مشتری** باید درست باشند. سلامت API به‌تنهایی اثبات کارکرد مسیر VPN نیست.

**روش‌های پرداخت خدمات:**

| روش | مبنای تأیید |
|---|---|
| کارت‌به‌کارت | بررسی واقعی مدیر؛ تصویر/OCR به‌تنهایی اثبات پرداخت نیست. |
| زرین‌پال | Authority و verify سمت سرور با مبلغ ذخیره‌شده |
| آقای پرداخت | شناسه تراکنش و استعلام API |
| زرین‌پی | order/authority و verify سمت سرور |
| TetraPay / IRanpay 1 | create_order و verify؛ نام تنظیم قدیمی FloyPay به همین اتصال اشاره دارد. |
| IRanpay 3 / Factor | فاکتور TRX و status احراز هویت‌شده |
| NOWPayments | HMAC اعلان و استعلام مستقل وضعیت نهایی، شناسه‌ها و مبلغ |
| Plisio | تطبیق operation/order و مبلغ پایه USD؛ تسویه TRX در این پیاده‌سازی |
| Telegram Stars | pre-checkout و successful_payment معتبر، مبلغ XTR و مالک فاکتور |
| TRON / TON مستقیم | TRX، TON، USDT-TRC20 و USDT-TON؛ مقصد، قرارداد توکن، مبلغ، زمان، تأیید، Memo فاکتور و هش یکتا |

در پرداخت مستقیم زنجیره‌ای، **Memo فاکتور برای هر دو شبکه لازم است**. کیف پول/صرافی بدون Memo با تأیید خودکار این مسیر سازگار نیست. عبارت بازیابی و کلید خصوصی کیف پول را هرگز وارد نکنید. استرداد سرویس به کیف پول داخلی پرداخت‌کننده است؛ برگشت خودکار به همه منابع پرداخت پیاده‌سازی نشده است.

### ۳٫۸. چند ربات مستقل

- از نوار **ربات‌های من** تا ۲۰ ربات متفاوت ثبت کنید؛ getMe توکن را بررسی می‌کند.
- هر ربات SQLite، کاربر، کیف پول، فایل و تنظیمات خودش را دارد؛ اطلاعات مالی والد کپی نمی‌شود.
- نوار مدیریت، ربات جاری را نشان می‌دهد؛ قبل از تغییر قیمت یا موجودی آن را بررسی کنید.
- وب‌هوک هر ربات جدا و با تأیید مدیر ثبت می‌شود؛ تغییر توکن فقط برای همان bot ID است.
- ربات‌ساز تو در تو غیرفعال است. پشتیبان داده هر ربات جداست؛ snapshot والد، همه SQLiteهای فرزندان را یکجا جمع نمی‌کند.

<a id="fa-limits"></a>
## ۴. حدود، وابستگی‌ها و قابلیت‌های تکمیل‌نشده

| مورد | حد فعلی / نکته |
|---|---|
| آپلود عکس | JPEG/PNG تا ۱۰ MiB |
| فایل/ویدیو/صوت/انیمیشن | تا ۲۰ MiB؛ فرمت مجاز هر روش را رعایت کنید. |
| کپشن رسانه | حداکثر ۱۰۲۴ کاراکتر |
| لوگوی واترمارک | تا ۲۰۰ KB؛ خروجی عکس حداکثر ضلع ۲۵۶۰ پیکسل |
| قفل عضویت | تا ۲۰ مقصد مرتبط؛ عضویت در همه لازم است. |
| ارسال جمعی | تا ۲۰ هزار مخاطب، ۲۰ چت یا ۵۰ آیدی مستقیم |
| زمان‌بندی | حداکثر یک سال جلوتر؛ تکرار حداقل ۵ دقیقه؛ حذف خودکار حداکثر ۴۷ ساعت |
| فید خودکار | بررسی حداقل هر ۵ دقیقه؛ اسکن اول فقط خط مبنا |
| سبد فروشگاه عمومی | ۲۰ نوع محصول، ۹۹ عدد هر نوع؛ حداکثر ۳ سفارش پرداخت‌نشده |
| رزرو فروشگاه عمومی | ۵ تا ۱۴۴۰ دقیقه، پیش‌فرض ۳۰؛ بررسی رسید تا ۴۸ ساعت |
| ورود مشتری | initData تازه تا ۵ دقیقه، لینک یک‌بارمصرف تا ۲ دقیقه، نشست تا ۱ ساعت |
| انبار خدمات | هر import تا ۲۰۰ کانفیگ؛ فروش دستی عمده تا ۱۰۰ مورد |
| گزارش مالی خدمات | تا ۱۰ هزار ردیف هر خروجی؛ برای بیشتر، بازه تاریخ را محدود کنید. |
| پشتیبان خدمات | حداکثر داده JSON قبل از رمزگذاری ۱۲ MiB؛ بازیابی فقط در ماژول خالی |
| پاسخ‌گویی و هزینه | وابسته به شبکه، Telegram، پنل‌ها و سهمیه Cloudflare؛ تضمین بدون‌قطعی یا ترافیک نامحدود نیست. |

**مرزهای روشن:**

- تمام گزینه‌های قدیمی Faoxima معادل کامل ندارند؛ IRanpay 2/Tronado و بعضی مسیرهای ووچر/Perfect Money همچنان نیازمند قرارداد تأیید امن و کامل‌اند.
- PHP/MySQL dump خام، نصب Ubuntu، دستور shell و تعویض فایل PHP داخل Worker اجرا نمی‌شوند؛ deploy، Cron/Alarm و پشتیبان ساختاریافته جای آنها را گرفته‌اند.
- پردازشگر ویدیو، خود سرور VPN، حساب درگاه و BotFather بیرونی‌اند. ثبت یک گزینه، آنها را ایجاد یا متصل نمی‌کند.
- تشخیص قطعی «انسان یکتا/اکانت مخرب»، جلوگیری صددرصد از کپی و exactly-once سراسری شبکه ادعا نمی‌شود.
- در قطع ارتباط، ممکن است پول رزرو بماند تا مدیر نتیجه را با پنل مقصد تطبیق دهد. **برای رفع ابهام، دوباره خرید نزنید یا دستی دوباره مبلغ کم نکنید.**
- کپی بدون فوروارد فقط برچسب Telegram را حذف می‌کند؛ متن، کپشن، واترمارک و مشخصات داخل فایل را پاک نمی‌کند و هویت نزد مدیر محفوظ می‌ماند.

<a id="fa-install"></a>
## ۵. راه‌اندازی از صفر با Fork — بدون ترمینال

این مسیر با مرورگر Windows یا macOS انجام می‌شود. برای آن نصب PHP، MySQL یا Node روی کامپیوترتان لازم نیست؛ Cloudflare وابستگی‌ها را در محیط build نصب می‌کند.

### قدم ۱ — حساب‌ها و دسترسی

- یک حساب GitHub و یک حساب Cloudflare داشته باشید.
- به مخزن دسترسی داشته باشید. این مخزن ممکن است خصوصی باشد؛ Fork و اتصال Git به مجوزهای مخزن/سازمان وابسته است.
- اگر **مالک همین مخزن هستید، Fork لازم نیست**؛ می‌توانید همان را مستقیم وصل کنید.
- برای ربات واقعی، از `@BotFather` توکن بگیرید. برای خدمات/VPN، حساب و API پنل مقصد هم لازم است.

### قدم ۲ — Fork در GitHub

1. [صفحه مخزن](https://github.com/amirsedighian071-stack/telegram-bot-panel-v2) را باز کنید.
2. **Fork** را بزنید؛ حساب مقصد و نام دلخواه مخزن را انتخاب کنید.
3. برای نصب عادی، **Copy the main branch only** کافی است.
4. **Create fork** را بزنید و از اینجا به بعد **Fork خودتان** را ویرایش کنید.
5. اگر Fork در دسترس نیست، دسترسی/سیاست مخزن را بررسی کنید؛ ناموجودبودن دکمه را با خطای Cloudflare اشتباه نگیرید.

راهنمای رسمی: [GitHub — Fork a repository][gh-fork].

<a id="fa-config"></a>
### قدم ۳ — فایل ضروری: `wrangler.toml`

در Fork خودتان فایل را باز کنید، آیکون مداد **Edit** را بزنید و تغییر را با **Commit changes** روی `main` ذخیره کنید.

**الف) نصب تازه، بدون داده v1 — پیشنهاد برای شروع**

- مقدار `name` را به یک نام دلخواه مثل `my-botpanel` تغییر دهید. بعداً در Cloudflare همین نام را انتخاب کنید.
- تمام بخش `[[kv_namespaces]]` شامل `binding = "BOT_KV"` و `id = "..."` را **حذف کنید**. آن binding فقط برای ورود داده قدیمی است؛ کد در نبودش از SQLite اصلی استفاده می‌کند.
- **شناسه KV موجود در مخزن را به‌عنوان شناسه حساب خودتان استفاده نکنید.**
- بقیه نام bindingها، کلاس و migration را تغییر ندهید.

نمونهٔ کامل مناسب نصب تازه:

</div>

```toml
name = "my-botpanel"
main = "src/index.js"
compatibility_date = "2025-09-01"
workers_dev = true

[assets]
directory = "./public"
binding = "ASSETS"
not_found_handling = "single-page-application"
run_worker_first = ["/api/*", "/telegram/*", "/pay/*", "/internal/*", "/service-pay/*", "/sub/*", "/sub-all/*", "/bots/*"]

[vars]
APP_VERSION = "3.1.0"

[[durable_objects.bindings]]
name = "BOT_STATE"
class_name = "BotCoordinator"

[[migrations]]
tag = "v2-durable-state"
new_sqlite_classes = ["BotCoordinator"]

[triggers]
crons = ["* * * * *"]
```

<div dir="rtl">

این نمونه با مسیرها و ساختار فعلی سازگار است. در به‌روزرسانی‌های آینده، نسخه و تغییرات جدید `wrangler.toml` را بررسی کنید؛ نمونهٔ README جای تاریخچه migration جدید را نمی‌گیرد.

**ب) اگر داده v1 خودتان را وارد می‌کنید**

بخش KV را نگه دارید و `id` را با شناسهٔ **namespace متعلق به حساب خودتان و حاوی دادهٔ قبلی** جایگزین کنید. در Cloudflare، صفحه **Workers KV** شناسه namespace را نشان می‌دهد. namespace خالی، داده‌ای برای واردکردن ندارد.

</div>

```toml
[[kv_namespaces]]
binding = "BOT_KV"
id = "YOUR_OWN_KV_NAMESPACE_ID"
```

<div dir="rtl">

داده قدیمی به‌تدریج خوانده و در SQLite ذخیره می‌شود. v2/v3 به KV قدیمی نمی‌نویسد؛ تغییر بعدی v1 هم همگام‌سازی دوطرفه نیست. نشست‌ها وارد نمی‌شوند و ارسال‌های ناتمام قدیمی متوقف/نیازمند بررسی وارد می‌شوند. [راهنمای KV][cf-kv]

**فایل‌هایی که برای نصب عادی دست نزنید:**

| فایل/بخش | چرا؟ |
|---|---|
| `main = "src/index.js"` | ورودی Worker، نه فایل HTML |
| `BOT_STATE` و `BotCoordinator` | برنامه به همین نام‌ها وابسته است. |
| `new_sqlite_classes` و migration منتشرشده | تغییر بی‌برنامه می‌تواند دسترسی به داده/استقرار را مختل کند. |
| `[assets]` و `run_worker_first` | مسیرهای API/وب‌هوک نباید به SPA یا فایل ثابت تبدیل شوند. |
| `package.json` و lockfile | وابستگی‌ها و نسخه ابزار build باید حفظ شوند. |
| سورس PHP پروژه مرجع | نباید وارد پوشه `public/` شود؛ Worker آن را به backend PHP تبدیل نمی‌کند. |

<a id="fa-connect"></a>
### قدم ۴ — اتصال GitHub به Cloudflare Workers

طبق [راهنمای رسمی Workers Builds][cf-builds]:

1. در Cloudflare وارد **Workers & Pages** شوید.
2. **Create application** را بزنید.
3. کنار **Import a repository**، گزینه **Get started** را انتخاب کنید.
4. حساب GitHub را متصل و نصب برنامه رسمی Cloudflare را تأیید کنید. دسترسی **فقط به مخزن لازم** کافی است.
5. Fork خودتان و شاخه `main` را انتخاب کنید.
6. تنظیمات زیر را وارد و **Save and Deploy** را بزنید.

| تنظیم | مقدار برای این پروژه |
|---|---|
| Worker / Project name | همان `name` داخل `wrangler.toml`؛ مثال `my-botpanel` |
| Git repository | Fork خودتان، نه مخزن مرجع شخص دیگر |
| Production branch | `main` |
| Root directory | ریشه مخزن؛ خالی یا `/`، **نه `public`** |
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` |
| Node.js | نسخهٔ 22.16+؛ برای بازتولید محیط آزمون می‌توان `22.23.2` را pin کرد. |
| Output directory | در این روش Worker تعیین نمی‌شود؛ `[assets]` مسیر `public` را دارد. |

اگر صفحه از شما **Pages build output directory** می‌خواهد، روش **Pages** را انتخاب کرده‌اید؛ برگردید و **Worker / Import a repository** را انتخاب کنید. آپلود تنها `index.html` یا چسباندن تنها `src/index.js` در Quick Edit، نصب این پروژه نیست.

**نسخه Node:** در صورت نیاز در **Settings → Builds/Build → Build variables** مقدار `NODE_VERSION=22.23.2` قرار دهید؛ یا در ریشه Fork فایل `.node-version` با محتوای زیر بسازید. این تنظیم مربوط به build است، نه رمز ورود پنل. اگر Node پیش‌فرض Cloudflare با شرط پروژه سازگار است، override الزامی نیست. [تصویر build رسمی][cf-build-image]

</div>

```text
22.23.2
```

<div dir="rtl">

Cloudflare به‌طور معمول نصب وابستگی‌ها را انجام می‌دهد. `SKIP_DEPENDENCY_INSTALL` را بی‌دلیل فعال نکنید. تنظیم پیشنهادی بالا build را یک‌بار انجام می‌دهد؛ `npm run deploy` در این مخزن خودش دوباره build می‌کند، پس هم‌زمان با Build command مجزا ضروری نیست.

### قدم ۵ — انتشار اول را بررسی کنید

- در **Deployments / Build history** لاگ build و deploy را ببینید.
- آدرس تولیدشده مانند `https://my-botpanel.YOUR-SUBDOMAIN.workers.dev` را باز کنید.
- `https://.../api/health` باید JSON با `ok: true` برگرداند.
- از `botpanel123` وارد شوید و **بلافاصله** رمز خصوصی تعیین کنید. حساب دارای رمز قبلی، با همان رمز وارد می‌شود.
- موفقیت build با فعال‌شدن bot webhook یا درگاه یکسان نیست؛ مراحل بعد را انجام دهید.

**امنیت ورود اول:** تا انتخاب رمز خصوصی، نشست اولیه به داده‌های حساس دسترسی ندارد؛ بااین‌حال هرکس زودتر رمز عمومی را استفاده کند می‌تواند نخستین رمز خصوصی را تعیین کند. مخزن خصوصی به معنی سایت خصوصی نیست. برای انتشار اولیه، دسترسی را محدود کنید یا در صورت تمایل از `ADMIN_PASSWORD` خصوصیِ اختیاری استفاده کنید.

### اگر Worker از قبل دارید

**Workers & Pages → Worker → Settings → Builds → Connect** را انتخاب کنید و مخزن/شاخه/فرمان‌ها را تعیین کنید. برای تعویض مخزن متصل، اتصال قبلی را طبق رابط Cloudflare جدا و دوباره وصل کنید. نام Worker و `wrangler.toml` را هماهنگ نگه دارید.

انتخاب `npx wrangler versions upload` به‌جای deploy، **نسخه/preview** می‌سازد ولی لزوماً آن را نسخهٔ فعال تولید نمی‌کند. برای مسیر سادهٔ این راهنما، Production deploy command همان `npx wrangler deploy` باشد. [تنظیمات رسمی build][cf-build-config]

<a id="fa-secrets"></a>
## ۶. متغیرهای runtime و Secretها

در Worker خودتان: **Settings → Variables and Secrets → Add → Type: Secret → نام و مقدار → Deploy**. نام‌ها به بزرگی/کوچکی حروف حساس‌اند. [راهنمای رسمی Secret][cf-secrets]

**Build variables با Runtime variables فرق دارند.** قرار دادن `BOT_TOKEN` فقط در تنظیمات Build، آن را در دسترس Worker زمان اجرا قرار نمی‌دهد.

| نام | نیاز | کجا و برای چه؟ |
|---|---|---|
| `ADMIN_PASSWORD` | **اختیاری** | فقط جایگزین ورود اولیه؛ رمز ذخیره‌شده در پنل اولویت دارد. برای ورود پیش‌فرض لازم نیست. |
| `BOT_TOKEN` | برای ربات واقعی، یا ثبت توکن در پنل | Secret توکن BotFather ربات اصلی؛ توکن ذخیره‌شده از پنل بر آن اولویت دارد. |
| `WEBHOOK_SECRET` | برای وب‌هوک ربات اصلی | Secret تصادفی؛ ترجیحاً ۶۴ کاراکتر hex، حروف/عدد/زیرخط/خط تیره، حداکثر ۲۵۶ کاراکتر |
| `VAULT_KEY` | برای اتصال پنل خدمات، انبار رمزگذاری‌شده و چندرباتی | Secret خصوصی حداقل ۳۲ کاراکتر؛ از دست‌رفتن یا تغییر بدون مهاجرت، خواندن داده رمزگذاری‌شده را مختل می‌کند. |
| `PUBLIC_BASE_URL` | توصیه‌شده؛ در بعضی گردش‌ها تنظیم پنل جایگزین دارد | متن runtime: نشانی HTTPS عمومی ربات اصلی، بدون مسیر اضافی؛ مانند `https://my-botpanel.example.workers.dev` |
| `ZARINPAL_MERCHANT_ID` | فقط زرین‌پال **فروشگاه عمومی** | Secret؛ درگاه‌های **خدمات** از فرم خودشان در Vault تنظیم می‌شوند. |
| `ZARINPAL_SANDBOX` | اختیاری | متن `true` برای آزمایش گردش عمومی زرین‌پال؛ در تولید فعال نماند. درگاه خدمات checkbox جدا دارد. |
| `MEDIA_PROCESSOR_URL` | فقط پردازش خارجی رسانه | URL سرویس HTTPS مورد اعتماد؛ برای آپلود عادی لازم نیست. |
| `MEDIA_PROCESSOR_SECRET` | همراه پردازشگر | Secret مشترک احراز هویت همان سرویس |
| `BACKUP_PASSWORD` | فقط پشتیبان شبانه R2 | Secret حداقل ۱۲ کاراکتر؛ همراه binding اختیاری `BACKUPS` |
| `APP_VERSION` | از قبل در فایل | متن عمومی نسخه؛ رمز یا توکن نیست. |

از `ALLOW_DEFAULT_PASSWORD` برای فعال‌کردن ورود استفاده نکنید؛ دیگر لازم نیست. متغیرهای داخلی مانند `TEST_MODE`، `TRUSTED_PARENT_ADMIN` و `MANAGED_*` را در تولید دستی تنظیم نکنید.

**ساخت مقدار تصادفی، در صورت نیاز:**

</div>

**Windows PowerShell**

```powershell
$bytes = New-Object byte[] 32
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($bytes)
([BitConverter]::ToString($bytes)).Replace("-", "").ToLowerInvariant()
$rng.Dispose()
```

**macOS Terminal**

```bash
openssl rand -hex 32
```

<div dir="rtl">

برای secretهای متفاوت، مقادیر مستقل بسازید. توکن GitHub، رمز پایگاه داده، API key، `.dev.vars`، seed یا کلید خصوصی کیف پول را به GitHub/README اضافه نکنید.

<a id="fa-first-run"></a>
## ۷. راه‌اندازی داخل پنل

### ربات و وب‌هوک

1. ابتدا رمز خصوصی را ثبت کنید.
2. در **تنظیمات عمومی ربات** توکن را وارد کنید یا `BOT_TOKEN` runtime را تنظیم کرده باشید.
3. زبان ربات و دکمه پشتیبانی را انتخاب کنید.
4. در **فایل و رسانه**، «آزمایش اتصال و دریافت یوزرنیم» را بزنید؛ یوزرنیم برای دیپ‌لینک لازم است.
5. پس از تنظیم `WEBHOOK_SECRET`، در بخش وب‌هوک **ثبت وب‌هوک** را بزنید.
6. از حساب آزمایشی Telegram، `/start` را بفرستید.

**هر توکن یک وب‌هوک فعال دارد.** ثبت آن روی این Worker، دریافت update در استقرار قبلی همان توکن را جابه‌جا می‌کند. صرف deploy کد، وب‌هوک را خودکار عوض نمی‌کند. ثبت از پنل، updateهای لازم مانند `pre_checkout_query` را هم اعلام می‌کند.

### آپلود مستقیم

در **فایل و رسانه → چت موقت ذخیره‌سازی** یکی از اینها را ثبت کنید:

- آیدی عددی مدیر که قبلاً ربات را شروع کرده؛ یا
- کانال/گروه اختصاصی رسانه با مجوز ارسال و ترجیحاً حذف پیام برای ربات.

فایل یک‌بار به Telegram فرستاده، `file_id` ذخیره و پیام موقت در صورت داشتن مجوز حذف می‌شود. اگر حذف مجاز نباشد، فایل در همان چت می‌ماند؛ آن را خصوصی نگه دارید. سپس در **ارسال همگانی → عکس و فایل** انتخاب کنید، پایان آپلود را منتظر بمانید و ارسال کنید. لینک عمومی فایل لازم نیست. فایل ربات دیگر باید دوباره آپلود شود.

### قفل عضویت و گروه

ربات را ادمین همه مقصدهای لازم کنید. آیدی `@name` یا آیدی عددی و برای مقصد خصوصی، لینک دعوت معتبر بدهید. در گروه، برای کپچا/سکوت supergroup و مجوز محدودسازی لازم است؛ دسترسی دریافت پیام‌ها و Privacy Mode در BotFather را بررسی کنید. یک عضو غیرادمین آزمایشی را برای تست قوانین به کار ببرید.

### فروشگاه عمومی

دسته و محصول بسازید؛ قیمت تومان، موجودی و روش تحویل را مشخص کنید. محتوا/فایل خصوصی را در فیلد تحویل بگذارید، نه توضیحات عمومی. شماره کارت یا زرین‌پال، چت اعلان مدیر، مهلت رزرو و اطلاعات تحویل را تنظیم و با سفارش آزمایشی کامل امتحان کنید.

### خدمات و مینی‌اپ

1. حالت **VPN** یا ماژول خدمات در حالت سفارشی را فعال کنید.
2. `VAULT_KEY` را تنظیم کنید و در **کارگاه → سرویس/VPN → تنظیمات** نشانی عمومی، برند، قوانین، شماره و سقف‌ها را ثبت کنید.
3. پنل یا انبار بسازید؛ از «آزمایش اتصال» و «منابع» برای شناخت API/inbound استفاده کنید.
4. پلن، قیمت رده‌ها، قفسه و سهمیه تست را تعریف کنید. به `publicHost` و `subscriptionBase` واقعی توجه کنید.
5. در تب پرداخت، درگاه را بسازید و اطلاعات همان حساب را وارد کنید. انتخاب حالت Sandbox، پرداخت واقعی نیست.
6. مشتری از `/vpnportal` یا دکمه مینی‌اپ وارد `/portal/` می‌شود. بازکردن URL خالی در مرورگر، جای ورود معتبر Telegram نیست.
7. خرید، رزرو/تحویل، تمدید، خطای شبکه و پیگیری پرداخت را با حساب و سرویس کم‌ریسک آزمایش کنید.

رعایت مقررات Telegram Stars، درگاه‌ها و فروش کالای دیجیتال مستقل از نصب نرم‌افزار است. رمز ورود مدیر، کلید Vault و کلیدهای درگاه وظایف متفاوت دارند.

<a id="fa-multi"></a>
## ۸. ربات‌های فرزند، دامنه و مسیرها

از نوار **ربات‌های من** توکن متفاوت را ثبت، ربات را انتخاب و تنظیمات خودش را انجام دهید. ثبت وب‌هوک آن یک عمل جداگانه است. برای چندرباتی در همان Worker لازم نیست کد را چندبار Fork کنید.

| مسیر | کاربرد |
|---|---|
| `/` | پنل مدیر |
| `/api/health` | بررسی سلامت عمومی Worker |
| `/telegram/webhook` | وب‌هوک ربات اصلی |
| `/portal/` | رابط مشتری ربات اصلی |
| `/api/portal/*` | API مشتری با نشست خودش |
| `/api/services/*` | API مدیریت خدمات با نشست مدیر |
| `/pay/*` | پرداخت فروشگاه عمومی |
| `/service-pay/*` | callback/اعلان پرداخت خدمات |
| `/sub/<token>` و `/sub-all/<token>` | اشتراک خصوصی و تجمیعی؛ توکن لینک محرمانه است. |
| `/bots/<id>/portal/` و مسیرهای همان ربات | مینی‌اپ و دادهٔ مجزای فرزند |
| `/bots/<id>/telegram/webhook` | وب‌هوک فرزند |
| `/internal/*` | داخلی؛ نباید از اینترنت قابل فراخوانی باشد. |

دامنه سفارشی اختیاری است؛ `workers.dev` برای شروع کافی است. بعد از تغییر دامنه، URL عمومی و وب‌هوک و callbackهای لازم را بررسی کنید. Cloudflare Access را بی‌برنامه روی کل میزبان نبندید: Telegram، درگاه، مینی‌اپ و کلاینت اشتراک باید مسیرهای لازم را با احراز هویت داخلی برنامه ببینند. محافظت مدیریتی و مسیرهای عمومیِ پروتکلی را جدا طراحی و آزمایش کنید.

<a id="fa-local"></a>
## ۹. توسعه یا استقرار دستی از Windows / macOS — اختیاری

برای مسیر GitHub → Workers Builds، این بخش الزامی نیست. برای اجرای محلی، Git و Node.js **22.16+** لازم است.

</div>

**Windows PowerShell**

```powershell
git clone https://github.com/YOUR-ACCOUNT/YOUR-FORK.git
Set-Location YOUR-FORK
npm ci
Copy-Item .dev.vars.example .dev.vars
notepad .dev.vars
npm run dev
```

**macOS Terminal**

```bash
git clone https://github.com/YOUR-ACCOUNT/YOUR-FORK.git
cd YOUR-FORK
npm ci
cp .dev.vars.example .dev.vars
nano .dev.vars
npm run dev
```

<div dir="rtl">

در مرورگر، نشانی نمایش‌داده‌شدهٔ Wrangler، معمولاً `http://localhost:8787` را باز کنید. `.dev.vars` فقط تنظیم محلی است و به‌طور خودکار Secret تولید نمی‌شود. آن را کامیت نکنید. وب‌هوک Telegram به URL عمومی HTTPS نیاز دارد؛ localhost مقصد وب‌هوک واقعی نیست.

فرمان‌های مشترک در PowerShell و Terminal:

</div>

```bash
npm test
npm run smoke
npm run build
npx wrangler deploy --dry-run

# Optional direct deployment instead of Workers Builds:
npx wrangler login
npm run deploy
```

<div dir="rtl">

آزمون مرورگر، فقط در محیط محلی مجزا، پس از اجرای `npm run dev` در یک ترمینال:

</div>

```bash
npx playwright install chromium
npm run test:ui
npm run test:services-ui
```

<div dir="rtl">

این تست‌ها رمز محیط آزمایشی را از فرم داخلی تنظیم و دادهٔ نمونهٔ مشتری/محصول/کیف پول ایجاد می‌کنند؛ **روی تولید اجرا نشوند**. APIهای بیرونی در تست‌های قرارداد شبیه‌سازی می‌شوند. ساخت dry-run نه استقرار است، نه تأیید اتصال واقعی سرورهای شما.

<a id="fa-maintenance"></a>
## ۱۰. به‌روزرسانی، نسخه‌ها و پشتیبان

### دریافت آپدیت در Fork

1. تغییرات نسخه جدید را در مخزن مرجع بررسی کنید.
2. در Fork از **Sync fork / Update branch** استفاده کنید؛ اگر تعارض وجود دارد، آن را آگاهانه حل کنید.
3. قبل از commit/merge، `name`، KV خودتان، R2 و migrationها را بازبینی کنید؛ تنظیم حساب شخص دیگری جایگزین تنظیم شما نشود.
4. push به `main` متصل، build جدید ایجاد می‌کند. در Cloudflare بررسی کنید deploy موفق و نسخه جدید **Active** شده باشد.
5. بارگذاری مجدد مرورگر، شماره نسخه و `/api/health` را کنترل و یک مسیر کم‌ریسک را امتحان کنید.

Rollback کد، rollback داده مالی نیست. نسخه قدیمی ممکن است با schema یا منطق نسخه جدید ناسازگار باشد؛ برای رفع ابهام تراکنش، صرفاً کد را عقب نبرید یا عملیات را تکرار نکنید.

### پشتیبان خدمات و R2 اختیاری

از **خدمات → گزارش و پشتیبان** فایل رمزگذاری‌شده بگیرید. این پشتیبان مخصوص ماژول خدمات است، نه همه اجزای عمومی قدیمی. رمز فایل و `VAULT_KEY` را حفظ کنید. بازیابی فقط در ماژول خالی مجاز است و فروش را در حالت نگهداری می‌گذارد؛ پرداخت/عملیات باز بعد از آن نیازمند تطبیق‌اند.

برای پشتیبان شبانه:

1. در R2 یک bucket خصوصی در حساب خودتان بسازید.
2. بخش زیر را به `wrangler.toml` اضافه یا بخش نمونه انتهای فایل را از حالت comment خارج کنید.
3. Secret با نام `BACKUP_PASSWORD` را در runtime ثبت کنید.
4. deploy و سپس زمان پشتیبان را از تنظیمات خدمات فعال کنید. نام bucket نمونه را با نام واقعی خودتان جایگزین کنید.

</div>

```toml
[[r2_buckets]]
binding = "BACKUPS"
bucket_name = "YOUR_PRIVATE_BACKUP_BUCKET"
```

<div dir="rtl">

R2 و Durable Objects سهمیه/هزینه دارند؛ **آزادی از PHP به معنی رایگان یا نامحدودبودن نیست**. SQLite-backed Durable Objects در Free نیز ارائه می‌شود، اما ردشدن سهمیه می‌تواند عملیات را متوقف کند. ظرفیت مناسب، پایش و شرایط حساب را از [مستندات رسمی قیمت/حدود][cf-do-pricing] بررسی کنید.

<a id="fa-troubleshooting"></a>
## ۱۱. عیب‌یابی سریع

| نشانه / خطا | بررسی |
|---|---|
| Fork یا مخزن در Cloudflare نیست | دسترسی private/org و نصب GitHub App روی همان Fork؛ از Settings → Builds → Manage دسترسی مخزن را بازبینی کنید. |
| پروژه فقط HTML نشان می‌دهد یا API کار نمی‌کند | به‌جای Worker از Pages/static upload استفاده نشده باشد؛ Root directory و `main` و `run_worker_first` درست باشند. |
| خطای نام Worker | نام پروژه Cloudflare و `name` در `wrangler.toml` را یکسان کنید. |
| KV namespace پیدا نشد | نصب تازه: KV قدیمی را حذف کنید. مهاجرت: شناسه namespace حساب خودتان را قرار دهید. |
| `durable_object_binding_required` | binding `BOT_STATE` و migration/class `BotCoordinator` را کامل deploy کنید؛ D1 جایگزین آن نیست. |
| خطای Node یا Wrangler | Node نسخه 22.16+، lockfile و وابستگی‌ها؛ Node build را pin و build را دوباره اجرا کنید. |
| خطای `npm.ps1` در PowerShell | از `npm.cmd` و `npx.cmd` یا Command Prompt استفاده کنید؛ برای این پروژه نیازی به بازکردن عمومی Execution Policy نیست. |
| `password_change_required` | ورود اولیه انجام شده؛ رمز خصوصی را از فرم داخلی تعیین کنید. |
| `botpanel123` پذیرفته نمی‌شود | ممکن است رمز خصوصی یا `ADMIN_PASSWORD` اختیاری قبلاً تنظیم شده باشد؛ رمز جدید آن را بازنشانی نمی‌کند. |
| `token_missing` | توکن BotFather از پنل یا runtime تنظیم شود. توکن ذخیره‌شدهٔ پنل بر متغیر اولویت دارد. |
| `webhook_secret_missing` | Secret وب‌هوک در **runtime**، نه فقط Build variables، ثبت و deploy شود. |
| ربات پیامی نمی‌گیرد | وب‌هوک واقعی، secret، URL عمومی، Access/WAF و `getWebhookInfo` در داشبورد پنل را بررسی کنید. |
| `upload_chat_required` | چت موقت رسانه را تنظیم کنید؛ مدیر باید قبلاً ربات را شروع کرده یا ربات در مقصد مجوز ارسال داشته باشد. |
| `media_belongs_to_another_bot` | فایل برای توکن/ربات دیگری است؛ در زمینهٔ درست دوباره آپلود کنید. |
| عضویت تأیید نمی‌شود | مجوز ادمین، آیدی و لینک دعوت همه مقصدها؛ خطای Telegram عمداً دسترسی را باز نمی‌کند. |
| `vault_key_required` / `vault_decryption_failed` | `VAULT_KEY` درست و پایدار؛ کلید جدید بدون مهاجرت، ciphertext قبلی را باز نمی‌کند. |
| `provider_auth_failed` یا خطای HTTP | نسخه API، credential، دامنه عمومی HTTPS، گواهی، مسیر پنل، Cloudflare Access و inbound/profile واقعی. |
| `review` در عملیات | پول/منبع را دوباره تخصیص ندهید؛ نتیجه واقعی را با پنل تطبیق دهید. |
| پرداخت هنوز pending است | لینک بازگشت دلیل موفقیت نیست؛ webhook، secret، status نهایی، amount، order/authority و هش یکتا بررسی شوند. |
| `market_rates_stale` / unavailable | منبع نرخ، اینترنت و عمر cache؛ یا آگاهانه به نرخ دستی بازگردید. |
| UI قدیمی است | آخرین commitِ Fork، نتیجه build، نسخه Active و cache مرورگر؛ push تنها، اثبات deploy موفق نیست. |
| تنظیم ربات دیگری تغییر کرده | نوار «در حال مدیریت» را کنترل کنید و به ربات اصلی یا فرزند درست برگردید. |

</div>

---

<a id="en-guide"></a>
# Complete English guide

## Contents

[Overview](#en-intro) · [Architecture](#en-architecture) · [Features](#en-features) · [Limits](#en-limits) · [Fork & install](#en-install) · [Edit configuration](#en-config) · [Connect Cloudflare](#en-connect) · [Runtime secrets](#en-secrets) · [First run](#en-first-run) · [Multiple bots](#en-multi) · [Windows/macOS](#en-local) · [Updates & backups](#en-maintenance) · [Troubleshooting](#en-troubleshooting)

<a id="en-intro"></a>
## 1. What this project is

**BotPanel v2** is the repository/generation name; **3.1.0** is the current application release. It is a Persian/English Telegram bot administration workspace built for **Cloudflare Workers**. Selecting a bot purpose changes the available tools and runtime behavior without deleting previous data.

There are three interfaces:

1. **Administrator panel:** users, messaging, menus, stores, channels/groups, services and managed bots.
2. **Telegram bot:** gated access, menus, purchases, content delivery, support and service management.
3. **Customer Mini App:** plans, wallet, service orders, configurations, QR codes, payments and requests.

Two separate commerce flows exist:

| Flow | Use case | Main implementation |
|---|---|---|
| General store | Digital files, prepared/manual delivery and physical products; cart, delivery details and orders | `src/commerce.js` |
| Services / VPN | Quota/duration plans, service providers, configuration stock, wallets and resellers | `src/services/` |

Users belong to the selected bot, but **general products/orders/coupons are not the same records as service plans/wallets/funding invoices**. Loyalty points are also separate from monetary wallet credit.

Service functionality was informed by a review of [Faoxima](https://github.com/Mmd-Amir/Faoxima). This is neither PHP running inside Workers nor a claim of complete parity with every historical option in that project. See the [compatibility guide](docs/FAOXIMA-CLOUDFLARE.fa.md) and [3.1 release notes](docs/RELEASE-3.1.fa.md) for the precise boundary.

<a id="en-architecture"></a>
## 2. Architecture and source layout

```text
Admin browser / Customer Mini App / Telegram
                       │ HTTPS
                       ▼
            Cloudflare Worker + Hono
              │                   └── ASSETS → public frontend
              ▼
        BOT_STATE: BotCoordinator
              ├── SQLite application state
              ├── Coordinated financial writes + per-group queues
              ├── Cron Triggers + Durable Object alarms
              ├── HTTPS → Telegram, VPN providers, payment providers
              ├── optional BOT_KV → read-only legacy import
              └── optional BACKUPS → encrypted R2 archives

Each managed bot has an independent Durable Object / SQLite database.
```

- **Worker:** handles HTTP, APIs and webhooks. It does not run PHP or host a VPN daemon.
- **Hono:** routes requests, authenticates access and enforces request limits.
- **SQLite Durable Objects:** authoritative state and coordinated financial operations. **A D1 database is not required.**
- **BOT_KV:** optional read-only input for old v1 data; not the active v3 wallet/inventory database.
- **Cron/alarms:** advance delivery, provisioning, payment checks, monitoring, rates and reports without an open browser.
- **External services:** Telegram, VPN servers, payment accounts and video processors remain external. Adding a setting does not provision those services.

| File / directory | Responsibility |
|---|---|
| `wrangler.toml` | Worker name/entry, static assets, bindings, migrations and cron |
| `package.json`, `package-lock.json` | Commands and dependency versions; Node 22.16+ |
| `public/index.html`, `panel.js`, `panel.css` | Main administrator application |
| `public/studio.js`, `studio.css` | Purpose presets and general workspace tools |
| `public/services.js` | Service/VPN administration |
| `public/portal/` | Customer Mini App HTML/CSS/JavaScript |
| `public/vendor/` | Self-hosted fonts, icons and Telegram SDK |
| `src/index.js` | Worker entry and `BotCoordinator` |
| `src/auth.js`, `src/services/customer-auth.js` | Separate administrator and customer authentication |
| `src/storage.js`, `src/kv.js` | SQLite adapter, data models and legacy import |
| `src/telegram.js`, `src/bot-api.js` | Telegram updates and API calls |
| `src/config.js`, `src/gate.js` | Purpose presets and membership gating |
| `src/media.js`, `src/broadcast.js` | Multipart media uploads and durable delivery queues |
| `src/commerce.js`, `src/payments.js` | General store and its payment flow |
| `src/groups.js`, `src/automation.js` | Moderation, feeds and relaying |
| `src/crm.js`, `src/engagement.js` | Loyalty points, polls and reactions |
| `src/services/engine.js`, `providers.js` | Provisioning workflow and provider adapters |
| `src/services/wallet.js`, `payments.js` | Financial ledger and funding |
| `src/services/crypto-pay.js`, `rates.js` | On-chain verification and rate quotes |
| `src/services/managed-bots.js` | Managed bot isolation and routing |
| `src/services/subscriptions.js`, `reports.js` | Private/combined subscriptions, exports and backups |
| `src/services/engagement.js` | Dice and scheduled financial summaries |
| `scripts/`, `tests/` | Build, regression, SQLite and browser tests |
| `assets/readme/`, `docs/` | Desktop gallery, branding and detailed guides |

**Normal installation does not require editing application source code.** The main deployment file is `wrangler.toml`. Keep credentials out of source files and the README.

<a id="en-features"></a>
## 3. Complete feature inventory for this release

### 3.1. Thirteen bot purposes

| Purpose | Main tools |
|---|---|
| Custom workspace | Select and combine available modules |
| Channel manager | Content, categories, deep links, schedules, engagement and linked discussions |
| General store | Products, cart, payment, orders and delivery |
| Group guardian | Multi-group moderation, captcha, rules, warnings and night mode |
| Anonymous relay | Receive messages/albums and copy to administrator-selected destinations |
| File library | Categorized downloads, free delivery and membership gates |
| Education | Free/paid lessons and files with study-progress tracking |
| Customer support | Two-way tickets and FAQ |
| FAQ assistant | Inline questions and bilingual prepared answers |
| Community contests | Quizzes, polls, points and referrals |
| News publisher | RSS/Atom, YouTube announcements and authorized channel reposts |
| Members library | Content gated by required chat membership; not a timed paid membership product |
| VPN services | Providers, quota/duration plans, wallets, resellers, stock and customer portal |

The selection affects UI and applicable bot/API behavior. **It does not create a new BotFather bot.** Use Custom mode when combining workflows, such as a store and a channel publisher.

### 3.2. Administration, appearance and menus

- Dashboard statistics, recent users and webhook state; search, pagination, bans/unbans and direct messages.
- Multi-level inline menus: URL, callback, short text and submenus; configurable start/help templates with user placeholders.
- Configurable support buttons, two-way tickets, unread state and conversation closure.
- Independent panel language; Persian-only, English-only or bilingual bot behavior; RTL/LTR support.
- Six themes: dark, light, ocean, violet, forest and sunset; lightweight transitions and reduced-motion support.
- Local CSS, fonts and icons; no runtime styling CDN is required.
- Password changes, administrator sessions, login-attempt limits and masked bot-token output.

### 3.3. Broadcast and media

- Separate **Add photo** and **Add file** buttons, native file selection, drag-and-drop, upload progress and preview.
- Text, images, original documents, MP4, GIF/animation and MP3/M4A; reuse of Telegram `file_id` records.
- Captions, URL keyboards, optional like/dislike reactions and textual feedback on media posts.
- Target all users, 7/30-day active users, selected IDs, multiple chats or buyers of a general-store product.
- Schedule, repeat and auto-delete; pause/resume, history, success/failure counts and Telegram `retry_after` handling.
- Server-side continuation after the browser closes; uncertain sends pause for review instead of blind retries.
- Text/logo watermarks on **new images uploaded through the panel**, applied in the browser—not every reposted asset.
- External processor contract for video conversion, compression and video watermarks. **The FFmpeg/backend processor itself is not deployed by this repository.**

### 3.4. Channel tools, engagement and membership

- Fixed product/file deep links and inline category navigation.
- RSS/Atom items, new YouTube video titles/links and authorized Telegram channel reposts.
- First feed scan establishes a baseline without flooding old posts; duplicate and loop controls.
- Single-choice, multiple-choice and quiz polls; correct answers, points, deadlines and voter-membership rules.
- Multiple required channels/groups; global or purpose-scoped rules; private invite URLs and a recheck button.
- Membership is rechecked for access. Telegram API errors keep access closed; restricted users count as members only when `is_member=true`.
- Product deep links resume after successful membership checks; payment does not bypass gated content delivery.

### 3.5. Group guardian

- Independent settings for multiple groups/supergroups and linked channel discussions. Auto-discovered groups stay disabled until an administrator enables them.
- Links, forwards, long text, excessive emojis/hashtags, flooding, forbidden words and media-type restrictions.
- Bot-account entry restrictions, button/math captcha, rules acceptance and text/photo welcomes.
- Delete, warn, timed mute and ban; configurable warning threshold and escalation.
- Commands check actual Telegram administrator privileges; member reports and auditable errors/events.
- IANA-timezone night mode, join/leave service-message cleanup and restoration of temporary captcha/night restrictions after disabling the group.
- Anonymous administrators of the group and automatic linked-channel root posts are exempt; posting as an external channel does not bypass link filtering.

### 3.6. General store

- Persian/English title and description, photo, category, toman price, inventory, editing and hiding products.
- **Ready** private text/file delivery, **manual** administrator delivery or **physical** fulfillment.
- Dynamic cart quantities/removal, final totals, percentage/fixed coupons and loyalty-point discounts.
- Recipient name, phone, address and delivery windows; order snapshots preserve the purchased price/content.
- Manually reviewed bank receipts and optional Zarinpal; inventory reservation and release on rejection/cancellation/expiry.
- Administrator notifications, receipt review, preparing/shipped/delivered states, tracking and customer notifications.
- Signup/purchase/referral points, configurable redemption limits and product-buyer targeting.

### 3.7. Services, wallet and VPN stock

- Signed Telegram initData or single-use portal login; separate customer sessions and service ownership checks.
- Duration/quota plans, countries/locations, categories, role-based prices, bulk quantities, custom names and custom GB/day pricing.
- Customer, reseller and credit-reseller roles; personal discount, debt limit, expiry and reviewed applications.
- Audited wallet ledger, reservation before provisioning, settlement after success, release after definite failure and idempotent references.
- Shelves and individual configuration stock, bulk import/deduplication, encrypted contents, unique allocation and manual bulk sales.
- Emergency/fallback routing for new sales, trial allowances, service-count and pending-operation limits.
- Create, renew, buy extra GB/days, synchronize, enable/disable, reset and revoke where the provider API supports them.
- Reviewed problem, ownership-transfer, location-migration and refund requests; reconciliation of uncertain results.
- Configurations, private subscription links, QR codes, SVG/PNG usage cards and combined active URI subscriptions; WireGuard profiles remain separate.
- Scoped service coupons, wallet gifts, purchase/funding cashback and referral commissions.
- Budgeted wheel, free Telegram-verified dice/slots, scheduled free raffles and daily financial summaries.
- Manual or automatic SwapWallet rates, freshness enforcement and immutable issued-invoice quotes.
- Provider health, quota/expiry warnings, supported node inspection/reconnect, CSV/XLSX export and encrypted backups.

**Provider modes:**

| Mode | Contract / important boundary |
|---|---|
| Manual stock | No upstream API; stock renewal delivers a replacement configuration, not an automatic extension of the old one. No live metering. |
| Classic Marzban | `/api/user`, proxies and inbounds |
| Marzban 1.x | proxy_settings/group_ids and ISO dates |
| Marzneshin | `/api/users`, service_ids and expire_strategy |
| 3x-ui / x-ui | Cookie login, clients inside a selected inbound |
| 3x-ui Token API | Installations providing clients/add, traffic, links, update, del and resetTraffic |
| Alireza single | Client operations under `/xui/API/inbounds` |
| Alireza separate inbound | One inbound per service; free ports within a configured range |
| S-UI v2 | Token and `/apiv2/save` |
| Hiddify v2 | API key, GB quota and day-based package model |
| WGDashboard | Peer/interface and quota jobs; server time should be UTC. Unmanaged limiting jobs require review. |
| MikroTik | HTTPS User Manager REST; limits come from the server profile, not SSH or the binary API |
| IBSng | Classic HTTPS web interface; preserves allocated IDs in two-step creation. Different HTML templates may require adaptation. |
| Guard | X-API-Key and `/api/subscriptions` |

A listed family is not a guarantee for every fork/version or action. Configure its API, privileges, inbound/profile, certificate and **actual client connection address**. A healthy management API is not proof that a VPN client can connect through the data path.

**Service funding methods:**

| Method | Verification basis |
|---|---|
| Bank transfer | Real administrator review; an image/OCR result is not proof by itself. |
| Zarinpal | Stored Authority and amount checked server-side |
| Aqaye Pardakht | Stored transaction ID and provider API verification |
| Zarinpay | Order/authority and server verification |
| TetraPay / IRanpay 1 | create_order/verify; the old FloyPay setting name refers to this integration. |
| IRanpay 3 / Factor | TRX-based invoice and authenticated status lookup |
| NOWPayments | Notification HMAC plus independent final-status, ID and amount verification |
| Plisio | Matching operation/order and USD source amount; TRX settlement in this implementation |
| Telegram Stars | Validated pre-checkout/successful_payment, XTR amount and invoice owner |
| Direct TRON / TON | TRX, TON, USDT-TRC20 and USDT-TON; destination, token contract, amount, time, confirmations, invoice memo and unique hash |

Direct on-chain verification requires the **invoice memo on both networks**. A wallet/exchange without memo support is not compatible with automatic verification through that route. Never supply seed phrases or private wallet keys. Service refunds credit the original payer’s internal wallet; universal automatic refunds to the original payment source are not implemented.

### 3.8. Independent managed bots

- Register up to 20 different bots using **My bots**; getMe validates each token.
- Each bot has separate SQLite state, users, wallets, files and configuration. Parent finances are not copied.
- The management bar identifies the current bot. Check it before changing balances, prices or settings.
- Webhooks are registered separately with explicit confirmation. Token rotation must retain the same Telegram bot ID.
- Nested bot factories are disabled. Back up each bot separately; a parent archive is not an atomic snapshot of all child databases.

<a id="en-limits"></a>
## 4. Limits and unfinished functionality

| Area | Current limit / behavior |
|---|---|
| Photo upload | JPEG/PNG, up to 10 MiB |
| Document/video/audio/animation | Up to 20 MiB; use a Telegram-compatible format for the selected method |
| Media caption | Up to 1,024 characters |
| Watermark logo | Up to 200 KB; generated image longest side up to 2,560 px |
| Membership gates | Up to 20 matching destinations; all must be joined |
| Broadcast | Up to 20,000 recipients, 20 chats or 50 explicit user IDs |
| Scheduling | Up to one year ahead; repeat at least every 5 minutes; auto-delete within 47 hours |
| Feeds | At least 5 minutes between scans; first scan is a baseline |
| General cart | 20 distinct products, 99 of each; up to 3 unpaid orders |
| General reservation | 5–1,440 minutes, default 30; receipt review up to 48 hours |
| Customer login | initData up to 5 minutes old; single-use links up to 2 minutes; sessions up to 1 hour |
| Stock import / manual bulk sale | Up to 200 imported configs / 100 sold items per request |
| Service finance export | Up to 10,000 rows; narrow the date window for more |
| Service backup | Up to 12 MiB of pre-encryption JSON; restore into an empty module only |
| Availability / cost | Depends on networking, Telegram, providers and Cloudflare quotas; no unlimited-traffic or zero-downtime guarantee |

**Explicit boundaries:**

- Not every historical Faoxima option has complete parity. IRanpay 2/Tronado and certain older voucher/Perfect Money flows still require a complete, safe verification contract.
- Raw MySQL dumps, Ubuntu installers, shell commands and PHP file updates do not run inside this Worker. Deployment, Cron/Alarms and structured archives replace those mechanisms.
- Video processing, VPN servers, payment accounts and BotFather remain external. Merely adding a setting does not connect or provision them.
- No guaranteed unique-human detection, perfect malicious-account detection, copy prevention or end-to-end network exactly-once guarantee is claimed.
- Uncertain provisioning may keep a wallet hold until an administrator reconciles the upstream result. **Do not retry the purchase or charge the customer again to resolve uncertainty.**
- Clean-copy relaying removes Telegram forward attribution, not text/captions/watermarks/metadata inside the file. Sender identity remains visible to the administrator.

<a id="en-install"></a>
## 5. Install from a fork — browser-only path

Use a browser on Windows or macOS. This path does not require PHP, MySQL or Node on your computer; Cloudflare installs dependencies in its build environment.

### Step 1 — accounts and access

- Have GitHub and Cloudflare accounts.
- You must be able to access the repository. Private/organization repositories may restrict forks or Git App installation.
- **If you own this repository, a fork is unnecessary**; you can connect it directly.
- Obtain a BotFather token for the real bot. Service/VPN functionality also requires your own provider/API accounts.

### Step 2 — fork on GitHub

1. Open [the repository](https://github.com/amirsedighian071-stack/telegram-bot-panel-v2).
2. Select **Fork**, choose the owner and a repository name.
3. **Copy the main branch only** is enough for a normal installation.
4. Select **Create fork**. Edit **your fork** from this point onward.
5. If forking is unavailable, check repository/organization permissions; it is not a Cloudflare build failure.

Official instructions: [GitHub — Fork a repository][gh-fork].

<a id="en-config"></a>
### Step 3 — edit the required file: `wrangler.toml`

Open the file in your fork, select the pencil **Edit** button and **Commit changes** to `main`.

**A. Fresh installation with no v1 data — recommended**

- Change `name` to something such as `my-botpanel`. Use the same name in Cloudflare.
- **Remove the entire `[[kv_namespaces]]` block** containing `binding = "BOT_KV"` and its `id`. It is only used for old data import; the application works with its primary SQLite state when that legacy binding is absent.
- **Do not reuse the repository’s existing KV ID as if it belonged to your Cloudflare account.**
- Preserve the remaining binding names, class and migration.

Complete fresh-install configuration:

```toml
name = "my-botpanel"
main = "src/index.js"
compatibility_date = "2025-09-01"
workers_dev = true

[assets]
directory = "./public"
binding = "ASSETS"
not_found_handling = "single-page-application"
run_worker_first = ["/api/*", "/telegram/*", "/pay/*", "/internal/*", "/service-pay/*", "/sub/*", "/sub-all/*", "/bots/*"]

[vars]
APP_VERSION = "3.1.0"

[[durable_objects.bindings]]
name = "BOT_STATE"
class_name = "BotCoordinator"

[[migrations]]
tag = "v2-durable-state"
new_sqlite_classes = ["BotCoordinator"]

[triggers]
crons = ["* * * * *"]
```

This matches the current source and routes. Future releases may add migrations/configuration: review their changes instead of replacing a newer history with an older README example.

**B. Importing your own v1 data**

Keep the KV block, but replace the ID with the namespace **in your own Cloudflare account containing the old data**. The **Workers KV** page shows its namespace ID. A newly created empty namespace contains nothing to import.

```toml
[[kv_namespaces]]
binding = "BOT_KV"
id = "YOUR_OWN_KV_NAMESPACE_ID"
```

Old data is read progressively into SQLite. v2/v3 does not write back to old KV; this is not two-way synchronization. Sessions are excluded, and unfinished legacy broadcasts import paused/under review. [Official KV guide][cf-kv]

**Do not change these for an ordinary install:**

| File/setting | Reason |
|---|---|
| `main = "src/index.js"` | Worker entry point, not the HTML page |
| `BOT_STATE` / `BotCoordinator` | Required binding/class names used by code |
| `new_sqlite_classes` and published migrations | Unplanned changes can break deployment or access to existing state. |
| `[assets]` and `run_worker_first` | API/webhook requests must not be replaced by SPA/static responses. |
| `package.json` and lockfile | Preserve dependency/build tooling definitions. |
| Upstream PHP source | Never copy it into `public/` expecting a PHP backend; it may become a public source download. |

<a id="en-connect"></a>
### Step 4 — connect GitHub to Cloudflare Workers

Following the [official Workers Builds flow][cf-builds]:

1. Open **Workers & Pages** in Cloudflare.
2. Select **Create application**.
3. Choose **Get started** beside **Import a repository**.
4. Connect your GitHub account and authorize the official Cloudflare Git integration. Access to only the required repository is sufficient.
5. Select your fork and the `main` branch.
6. Use the following settings, then **Save and Deploy**.

| Setting | Value |
|---|---|
| Worker/project name | Same as `name` in `wrangler.toml`, e.g. `my-botpanel` |
| Git repository | Your fork, not another owner’s reference repository |
| Production branch | `main` |
| Root directory | Repository root: blank or `/`, **not `public`** |
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` |
| Node.js | 22.16+; pin `22.23.2` to reproduce the tested Node generation |
| Output directory | Not a Pages output setting; `[assets]` already points to `public`. |

If the wizard asks for a **Pages build output directory**, you selected the Pages/static workflow. Go back and choose a **Worker / Import a repository**. Uploading only `index.html`, or pasting only `src/index.js` into Quick Edit, is not an installation of this multi-file project.

**Node pinning:** if needed, add `NODE_VERSION=22.23.2` under **Settings → Builds/Build → Build variables**, or create a root `.node-version` file containing the line below. This controls the build runtime, not the panel login. An override is optional when the platform default satisfies the project requirement. [Official build image][cf-build-image]

```text
22.23.2
```

Workers Builds normally installs dependencies automatically. Do not enable `SKIP_DEPENDENCY_INSTALL` without providing your own install step. The recommended commands build once; this repository’s `npm run deploy` already builds again, so it is unnecessary alongside a separate build command.

### Step 5 — verify the first deployment

- Inspect **Deployments / Build history** for successful build and deployment logs.
- Open the generated URL, such as `https://my-botpanel.YOUR-SUBDOMAIN.workers.dev`.
- `/api/health` should return JSON with `ok: true`.
- Sign in with `botpanel123` and **immediately choose a private password**. An existing custom password is preserved.
- A successful build does not mean the Telegram webhook or payment providers are connected. Continue below.

**Initial-login security:** setup sessions cannot access sensitive data before password replacement, but whoever first uses the public initial password can claim the initial setup. A private GitHub repository does not make the deployed website private. Restrict access during setup or optionally use a private `ADMIN_PASSWORD` override.

### Connecting an existing Worker

Open **Workers & Pages → your Worker → Settings → Builds → Connect** and select the repository, branch and commands. To switch repositories, disconnect/reconnect using Cloudflare’s interface. Keep the Worker name and configuration aligned.

`npx wrangler versions upload` creates a **version/preview** and does not necessarily promote it to active production. For this straightforward guide, keep `npx wrangler deploy` as the production deploy command. [Official build configuration][cf-build-config]

<a id="en-secrets"></a>
## 6. Runtime variables and secrets

In your Worker: **Settings → Variables and Secrets → Add → Type: Secret → name/value → Deploy**. Names are case-sensitive. [Official secrets documentation][cf-secrets]

**Build variables are not runtime variables.** A `BOT_TOKEN` placed only in Build settings is not available to the running application.

| Name | Required when | Purpose |
|---|---|---|
| `ADMIN_PASSWORD` | **Optional** | Alternative initial password; a stored panel password takes precedence. Not needed for default onboarding. |
| `BOT_TOKEN` | For the real bot, unless entered in the panel | Primary BotFather token; a token saved through the panel takes precedence. |
| `WEBHOOK_SECRET` | Primary bot webhook | Random secret; preferably 64 hex characters, permitted letters/digits/underscore/hyphen, up to 256 characters |
| `VAULT_KEY` | Encrypted service credentials/stock and managed bots | Private secret, at least 32 characters. Losing/changing it without migration prevents decryption of existing data. |
| `PUBLIC_BASE_URL` | Recommended; panel configuration can supply a fallback | Runtime text: primary public HTTPS origin without an extra path |
| `ZARINPAL_MERCHANT_ID` | Zarinpal in the **general store** | Secret. **Service funding gateways** are configured through their own Vault-backed forms. |
| `ZARINPAL_SANDBOX` | Optional | Text `true` for the general-store Zarinpal test flow; keep off in production. Service gateways have a separate sandbox checkbox. |
| `MEDIA_PROCESSOR_URL` | External media processing only | Trusted HTTPS processor URL; not required for normal uploads |
| `MEDIA_PROCESSOR_SECRET` | With the processor | Shared authentication secret |
| `BACKUP_PASSWORD` | Optional nightly R2 service backups | Secret of at least 12 characters; used with the `BACKUPS` binding |
| `APP_VERSION` | Already in configuration | Public version label, not a credential |

`ALLOW_DEFAULT_PASSWORD` is no longer needed. Do not manually set internal flags such as `TEST_MODE`, `TRUSTED_PARENT_ADMIN` or `MANAGED_*` in production.

**Generate random values if needed:**

Windows PowerShell:

```powershell
$bytes = New-Object byte[] 32
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($bytes)
([BitConverter]::ToString($bytes)).Replace("-", "").ToLowerInvariant()
$rng.Dispose()
```

macOS Terminal:

```bash
openssl rand -hex 32
```

Generate separate values for separate purposes. Never commit GitHub access tokens, `.dev.vars`, provider keys, database passwords, recovery phrases or wallet private keys.

<a id="en-first-run"></a>
## 7. Configure the application

### Bot and webhook

1. Finish private-password setup first.
2. Enter the token in **Bot settings**, or configure the `BOT_TOKEN` runtime secret.
3. Choose bot language and support-button settings.
4. In **Media**, use **Test connection & get username**. Deep links need the bot username.
5. Configure `WEBHOOK_SECRET`, then use **Set webhook** in the panel.
6. Send `/start` from a test Telegram account.

**Each Telegram token has one active webhook.** Registering this Worker moves update delivery away from the token’s previous deployment. Deploying code alone does not automatically change the webhook. Registration through the panel includes required update types such as `pre_checkout_query`.

### Direct uploads

Set **Media → staging chat** to either:

- An administrator’s numeric ID; that administrator must have started the bot; or
- A dedicated channel/group where the bot can send and preferably delete messages.

The file is uploaded once to Telegram, its `file_id` is stored, and the staging message is deleted when permissions allow. Without deletion permission, it remains in that chat—keep the chat private. Then choose a file in **Broadcast → Photos & files**, wait for upload completion and send. No public hosting URL is required. Files belonging to another bot must be re-uploaded in the correct bot context.

### Membership and moderation

Grant administrator access in every required destination. Configure `@name` or numeric IDs; private targets also need valid invite links. Captchas/mutes require a supergroup and restriction privileges. Check message delivery and BotFather Privacy Mode. Test using a non-administrator member.

### General store

Create categories/products, toman prices, stock and delivery methods. Put private content/files in delivery fields, not public descriptions. Configure the card or Zarinpal, administrator notification chat, reservation window and delivery information. Exercise the complete flow with a test order.

### Services and Mini App

1. Select **VPN services** or enable Services in Custom mode.
2. Configure `VAULT_KEY`; in **Bot studio → Services/VPN → Settings**, set the public URL, brand, rules, contact policy and limits.
3. Add a provider or stock location; use **Test** and **Resources** to verify API/inbound details.
4. Create plans, tier prices, shelves and the trial allowance. Check real `publicHost`/`subscriptionBase` values.
5. Add funding gateways with their own account credentials. Sandbox mode is not a real payment.
6. Customers use `/vpnportal` or the Mini App button to enter `/portal/`. A plain browser URL is not a substitute for a valid Telegram login.
7. Test purchase, reservation/delivery, renewal, network failures and payment status with a low-risk account/service.

Compliance with Telegram Stars, payment-provider rules and digital-goods requirements is separate from software installation. The administrator password, Vault key and provider credentials serve different purposes.

<a id="en-multi"></a>
## 8. Managed bots, domains and routes

Use **My bots** to register another token, select its context and configure its own data. Register its webhook separately. You do not need another fork to host an isolated managed bot in the same Worker.

| Route | Purpose |
|---|---|
| `/` | Administrator panel |
| `/api/health` | Public Worker health check |
| `/telegram/webhook` | Primary bot webhook |
| `/portal/` | Primary customer Mini App |
| `/api/portal/*` | Customer API using customer sessions |
| `/api/services/*` | Administrator service API |
| `/pay/*` | General-store payment flow |
| `/service-pay/*` | Service-funding callbacks/notifications |
| `/sub/<token>`, `/sub-all/<token>` | Private/combined subscription links; treat tokens as secrets |
| `/bots/<id>/portal/` and that bot’s routes | Isolated managed-bot portal/data |
| `/bots/<id>/telegram/webhook` | Managed-bot webhook |
| `/internal/*` | Internal only; not publicly callable |

A custom domain is optional; `workers.dev` is sufficient to begin. After changing domains, review public URLs, webhooks and callbacks. Do not blindly place the whole hostname behind Cloudflare Access: Telegram, gateways, Mini App clients and subscription clients must reach their required routes using the application’s authentication. Design/test management protection separately from protocol-facing paths.

<a id="en-local"></a>
## 9. Optional local development/deployment on Windows or macOS

The GitHub → Workers Builds installation above does not require this. Local development needs Git and **Node.js 22.16+**.

Windows PowerShell:

```powershell
git clone https://github.com/YOUR-ACCOUNT/YOUR-FORK.git
Set-Location YOUR-FORK
npm ci
Copy-Item .dev.vars.example .dev.vars
notepad .dev.vars
npm run dev
```

macOS Terminal:

```bash
git clone https://github.com/YOUR-ACCOUNT/YOUR-FORK.git
cd YOUR-FORK
npm ci
cp .dev.vars.example .dev.vars
nano .dev.vars
npm run dev
```

Open the URL printed by Wrangler, usually `http://localhost:8787`. `.dev.vars` is local configuration; it does not automatically create production secrets. Do not commit it. Telegram requires a public HTTPS webhook; localhost is not a live webhook destination.

Shared commands:

```bash
npm test
npm run smoke
npm run build
npx wrangler deploy --dry-run

# Optional direct deployment instead of Workers Builds:
npx wrangler login
npm run deploy
```

Browser testing in a separate local environment, with `npm run dev` in another terminal:

```bash
npx playwright install chromium
npm run test:ui
npm run test:services-ui
```

The tests set a local private password and create synthetic customers/products/wallet data. **Never run them against production data.** External provider APIs are mocked in contract tests. A dry run is neither a deployment nor proof of live provider connectivity.

<a id="en-maintenance"></a>
## 10. Updates, versions and backups

### Update your fork

1. Review the new upstream release and changes.
2. Use **Sync fork / Update branch** in your fork; resolve conflicts deliberately.
3. Recheck your Worker name, KV ID, R2 and migrations before committing/merging. Do not replace your account configuration with someone else’s.
4. A push to the connected production branch triggers a build. Confirm successful deployment and that the new version is **Active**.
5. Refresh the browser, check the version and `/api/health`, then exercise a low-risk flow.

Code rollback is not a financial-data rollback. An old version may not understand new data or logic. Do not use repeated purchases or blind rollbacks to resolve uncertain transactions.

### Service backups and optional R2

Use **Services → Reports & backup** to download an encrypted archive. It covers the service module, not every legacy/general module. Retain the archive password and `VAULT_KEY`. Restore is allowed only into an empty service module and enables maintenance mode; pending payments/operations require reconciliation.

For nightly backups:

1. Create a private R2 bucket in your account.
2. Add the following block to `wrangler.toml`, or uncomment its existing example.
3. Add the runtime `BACKUP_PASSWORD` secret.
4. Deploy, then enable scheduling in service settings. Replace the example with your real bucket name.

```toml
[[r2_buckets]]
binding = "BACKUPS"
bucket_name = "YOUR_PRIVATE_BACKUP_BUCKET"
```

R2 and Durable Objects have quotas/costs. **No PHP requirement does not mean free or unlimited hosting.** SQLite-backed Durable Objects are available on Free, but exceeding limits can fail operations. Review capacity, monitoring and your account’s current [official pricing/limits][cf-do-pricing].

<a id="en-troubleshooting"></a>
## 11. Troubleshooting

| Symptom / error | Check |
|---|---|
| Fork/repository is missing in Cloudflare | Private/org permissions and GitHub App access to your fork; review Settings → Builds → Manage. |
| Only HTML works / API does not | Do not use Pages/static-only upload. Check root directory, Worker entry and `run_worker_first`. |
| Worker-name mismatch | Align the Cloudflare project name and `wrangler.toml` `name`. |
| KV namespace not found | Fresh install: remove the legacy block. Migration: use your own namespace ID. |
| `durable_object_binding_required` | Deploy `BOT_STATE` and the `BotCoordinator` class/migration. D1 is not a substitute. |
| Node/Wrangler failure | Use Node 22.16+, preserve lockfile/dependencies and retry after pinning the build version. |
| PowerShell blocks `npm.ps1` | Use `npm.cmd` / `npx.cmd` or Command Prompt instead of broadly disabling execution-policy protection. |
| `password_change_required` | Finish the in-panel initial private-password setup. |
| `botpanel123` does not work | A custom stored password or optional `ADMIN_PASSWORD` may already exist; updates do not reset it. |
| `token_missing` | Set BotFather token in the panel or runtime. A token saved in the panel takes precedence. |
| `webhook_secret_missing` | Add/deploy the runtime secret, not merely a build variable. |
| Bot receives no messages | Check the actual webhook, secret, public URL, Access/WAF and webhook information shown in the panel. |
| `upload_chat_required` | Configure the staging chat. Start the bot for an admin ID or grant destination send permissions. |
| `media_belongs_to_another_bot` | Re-upload the file in the intended bot context. |
| Membership never passes | Verify administrator permissions, IDs and invite URLs for every required chat. API errors intentionally keep access closed. |
| `vault_key_required` / `vault_decryption_failed` | Configure/retain the correct Vault key. A replacement key cannot decrypt old ciphertext without migration. |
| Provider auth / HTTP errors | API version, credentials, HTTPS/certificate, base path, Access headers and actual inbound/profile configuration. |
| Operation is in `review` | Reconcile the real upstream result. Do not allocate or charge again blindly. |
| Payment remains pending | Browser return is not proof. Inspect webhook/secret, final status, amount, order/authority and unique hash. |
| Market quote is stale/unavailable | Check provider reachability and quote age, or deliberately select manual rates. |
| Old UI remains visible | Check fork commit, build outcome, Active deployment and browser cache; a push alone is not proof of deployment success. |
| Wrong bot’s settings changed | Check the “Managing” bar and select the correct primary/managed bot. |

---

## Documentation, tests and provenance · اسناد و منابع

- [General v2 feature guide / راهنمای عمومی](V2_GUIDE.fa.md)
- [Cloudflare deployment guide / راهنمای تکمیلی استقرار](DEPLOY.fa.md)
- [Faoxima service compatibility / سازگاری خدمات](docs/FAOXIMA-CLOUDFLARE.fa.md)
- [3.1 release notes / تغییرات ۳٫۱](docs/RELEASE-3.1.fa.md)
- [Third-party notices / حقوق و اجزای ثالث](THIRD_PARTY_NOTICES.md)

**Validation:** the v3.1 baseline passed 131 automated tests, 67 regression checks and both browser suites. Tests cover local SQLite/Workerd and mocked provider contracts; they do not certify your bank account, VPN data path or production deployment.<br>
**اعتبارسنجی:** مبنای نسخه ۳٫۱، ۱۳۱ تست خودکار، ۶۷ بررسی سازگاری و هر دو مجموعه آزمون مرورگر را گذرانده است؛ این آزمون‌ها تأیید حساب بانکی، مسیر واقعی VPN یا انتشار شما نیستند.

Official setup references, checked **2026-09-07**. Dashboard wording and platform limits may change; use the official pages when labels differ.<br>
منابع رسمی راه‌اندازی، بررسی‌شده در **۲۰۲۶/۰۹/۰۷**؛ عنوان‌های داشبورد و حدود سرویس ممکن است تغییر کنند.

1. [GitHub: Fork a repository][gh-fork]
2. [GitHub: About forks][gh-about-forks]
3. [Cloudflare: Workers Builds][cf-builds]
4. [Cloudflare: Build configuration][cf-build-config]
5. [Cloudflare: Build image and Node version][cf-build-image]
6. [Cloudflare: Git integration][cf-git]
7. [Cloudflare: Runtime secrets][cf-secrets]
8. [Cloudflare: Workers KV][cf-kv]
9. [Cloudflare: Durable Objects pricing and quotas][cf-do-pricing]

[gh-fork]: https://docs.github.com/en/pull-requests/how-tos/work-with-forks/fork-a-repo
[gh-about-forks]: https://docs.github.com/en/pull-requests/get-started/about-forks
[cf-builds]: https://developers.cloudflare.com/workers/ci-cd/builds/
[cf-build-config]: https://developers.cloudflare.com/workers/ci-cd/builds/configuration/
[cf-build-image]: https://developers.cloudflare.com/workers/ci-cd/builds/build-image/
[cf-git]: https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/
[cf-secrets]: https://developers.cloudflare.com/workers/configuration/secrets/
[cf-kv]: https://developers.cloudflare.com/kv/get-started/
[cf-do-pricing]: https://developers.cloudflare.com/durable-objects/platform/pricing/

---

<a id="creator"></a>
## سازنده · Creator

<div align="center">

<img src="assets/readme/botpanel-logo.svg" alt="BotPanel creator section" width="380">

<!-- CREATOR_CONTACTS_START: replace only after the owner provides confirmed details. -->

**سازنده / Creator**<br>
نام نمایشی پس از تأیید صاحب پروژه درج می‌شود.<br>
The display name will be added after the project owner confirms it.

**Telegram / تلگرام:** در انتظار آیدی تأییدشده · Awaiting the confirmed handle<br>
**Instagram / اینستاگرام:** در انتظار آیدی تأییدشده · Awaiting the confirmed handle

<!-- CREATOR_CONTACTS_END -->

</div>
