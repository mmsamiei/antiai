# Anti AI Games

Telegram Mini App فارسی با چهار بازی فعال:

نسخه production: `https://play.out-of-distribution.me/anti-ai`

- **شهرجو:** حدس یک شهر پنهان از میان ۱۴۶۱ شهر رسمی ایران
- **کشورجو:** حدس یک کشور پنهان از میان ۱۹۵ کشور؛ نزدیکی بر اساس موقعیت پایتخت‌ها
- **معناتریس:** با سرنخ‌های معنایی، واژه‌ها را پایین بیاور و امتیاز بگیر.
- **دوحرف:** دو بازیکن با لینک دعوت یا صف تصادفی به هم وصل می‌شوند، مخفیانه حرف انتخاب می‌کنند و برای ساخت اولین واژهٔ معتبر رقابت می‌کنند.

بازیکن فقط رتبهٔ نزدیکی هر حدس را می‌بیند. هر کاربر در هر بازی یک session فعال دارد و پس از برد یا تسلیم می‌تواند فوراً بازی بعدی را شروع کند.

واژه‌جو (`ADJECTIVE_RAIN` و نسخهٔ قدیمی `ADJECTIVE`) غیرفعال است؛ شروع و ادامهٔ بازی مسدود شده، اما کد، داده‌ها، سوابق و آمار قبلی حفظ شده‌اند.

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
3. `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` را بدون `@` تنظیم کنید تا لینک دعوت دوحرف با `startapp` باز شود.
4. `npm run bot` را اجرا کنید؛ بات فرمان‌ها و Menu Button را تنظیم می‌کند.
4. امضای `Telegram.WebApp.initData` در سرور بررسی می‌شود و شناسه کاربر از کلاینت پذیرفته نمی‌شود.

## بررسی

```bash
npm run typecheck
npm test
npm run build
```

## داده‌ها

فهرست شهرهای بازی «شهرجو» از snapshot نسخهٔ **v3.1.2** مخزن
[لیست شهرها و استان‌های ایران](https://github.com/sajaddp/list-of-cities-in-Iran)
و تقسیمات کشوری تا پایان ۱۴۰۴ ساخته می‌شود. از ۱۴۸۱ رکورد `cities-filtered`،
۲۰ ناحیهٔ شهری شماره‌دار مانند `شیراز6` و `اسلام‌شهر2` کنار گذاشته شده‌اند؛
بنابراین دیتاست runtime دقیقاً **۱۴۶۱ شهر رسمی** دارد.

snapshot و مجوز GPL-3.0 منبع در `scripts/data/iran-admin-v3.1.2/` نگهداری
می‌شود. مختصات با GeoNames، داده‌های قبلی بازبینی‌شده، مجموعهٔ MIT
`iran-city-coordinates` و برای overrideهای محدود OpenStreetMap تطبیق داده شده‌اند.
منبع و روش هر تطبیق در `coordinate-audit.json` ثبت است؛ fallbackهای مرکز شهرستان
نیز صریحاً با `county-center-fallback` مشخص شده‌اند. استفاده از GeoNames تابع
CC BY 4.0 و داده‌های OpenStreetMap تابع ODbL است.

مولد روی تعداد غیرمنتظرهٔ شهر/ناحیه، شناسه یا مختصات تکراری، مختصات نامعتبر و
رکورد بدون تطبیق خطا می‌دهد. برای بازتولید کامل کشورها نیز فایل‌های GeoNames و
`mledoze/countries` مانند قبل در مسیرهای `/tmp/anti-ai-geonames` و
`/tmp/anti-ai-countries.json` لازم‌اند:

```bash
node scripts/generate-datasets.mjs
```
