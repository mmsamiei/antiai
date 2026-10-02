# Anti AI Games

Telegram Mini App فارسی با سه بازی نامحدود:

نسخه production: `https://play.out-of-distribution.me/anti-ai`

- **شهرجو:** حدس یک شهر پنهان از میان ۱۲۰۹ شهر ایران
- **کشورجو:** حدس یک کشور پنهان از میان ۱۹۵ کشور؛ نزدیکی بر اساس موقعیت پایتخت‌ها
- **واژه‌جو:** یک اسم، صفت یا فعل نمایش داده می‌شود و بازیکن باید در ۳۰ ثانیه سه هم‌معنی یا نزدیک‌معنی واقعی برای آن پیدا کند. JEV پاسخ‌های تازه را داوری و نتیجه را برای دفعات بعد cache می‌کند.

بازیکن فقط رتبهٔ نزدیکی هر حدس را می‌بیند. هر کاربر در هر بازی یک session فعال دارد و پس از برد یا تسلیم می‌تواند فوراً بازی بعدی را شروع کند. در صفت‌جو، رتبهٔ ۱ نزدیک‌ترین صفتِ غیر از پاسخ است.

## اجرای محلی

```bash
cp .env.example .env
docker compose up -d postgres
npm install
npx prisma migrate dev --name init
npm run dev
```

خارج از Telegram، در محیط development یک کاربر آزمایشی محلی ساخته می‌شود. این مسیر در production غیرفعال است.

## اتصال به Telegram

1. بات را در BotFather بسازید.
2. `TELEGRAM_BOT_TOKEN` و آدرس HTTPS برنامه را در `.env` قرار دهید.
3. `npm run bot` را اجرا کنید؛ بات فرمان‌ها و Menu Button را تنظیم می‌کند.
4. امضای `Telegram.WebApp.initData` در سرور بررسی می‌شود و شناسه کاربر از کلاینت پذیرفته نمی‌شود.

## بررسی

```bash
npm run typecheck
npm test
npm run build
```

## داده‌ها

دادهٔ پایهٔ مختصات شهرها از GeoNames می‌آید؛ نام‌های نمایشی و ۷۰۹ شهرِ افزوده از [فهرست شهرهای ایران در ویکی‌پدیای فارسی](https://fa.wikipedia.org/wiki/فهرست_شهرهای_ایران) گرفته شده‌اند. اسنپ‌شاتِ بازبینی‌شده در `scripts/data/iran-cities-canonical.json` نگهداری می‌شود تا تولید دوباره، این اصلاح‌ها را حفظ کند. دادهٔ نام/ترجمهٔ کشورها از `mledoze/countries` است. برای بازتولید، فایل‌های منبع را در `/tmp/anti-ai-geonames` و `/tmp/anti-ai-countries.json` قرار داده و اجرا کنید:

```bash
node scripts/generate-datasets.mjs
```
