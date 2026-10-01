# Anti AI Games

Telegram Mini App فارسی با دو بازی جغرافیایی نامحدود:

نسخه production: `https://play.out-of-distribution.me/anti-ai`

- **شهرجو:** حدس یک شهر پنهان از میان ۵۰۰ شهر ایران
- **کشورجو:** حدس یک کشور پنهان از میان ۱۹۵ کشور؛ نزدیکی بر اساس موقعیت پایتخت‌ها

بازیکن فقط رتبه نزدیکی هر حدس را می‌بیند. هر کاربر در هر بازی یک session فعال دارد و پس از برد یا تسلیم می‌تواند فوراً بازی بعدی را شروع کند.

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

داده شهرها از GeoNames و داده نام/ترجمه کشورها از `mledoze/countries` تولید شده است. فایل‌های نهایی داخل repository نگهداری می‌شوند. برای بازتولید، فایل‌های منبع را در `/tmp/anti-ai-geonames` و `/tmp/anti-ai-countries.json` قرار داده و اجرا کنید:

```bash
node scripts/generate-datasets.mjs
```
