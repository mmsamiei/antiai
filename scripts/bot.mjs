import "dotenv/config";
import { announcementKeyboard, handleAnnouncementUpdate } from "./bot-notifications.mjs";
import { prisma } from "../lib/prisma.ts";
import { handleCodeLoginUpdate } from "./bot-code-login.ts";
import { parseStartCommand, recordStartCommand } from "./bot-starts.mjs";

const token = process.env.TELEGRAM_BOT_TOKEN;
const appUrl = process.env.MINI_APP_URL;
if (!token || !appUrl) throw new Error("TELEGRAM_BOT_TOKEN and MINI_APP_URL are required");

const api = `https://api.telegram.org/bot${token}`;
let offset = 0;

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => { void prisma.$disconnect().finally(() => process.exit(0)); });
}

async function call(method, payload = {}) {
  const response = await fetch(`${api}/${method}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
  });
  const data = await response.json();
  if (!data.ok) throw new Error(`${method}: ${data.description}`);
  return data.result;
}

await call("setMyCommands", { commands: [{ command: "start", description: "شروع بازی" }, { command: "play", description: "باز کردن Anti AI Games" }, { command: "login", description: "دریافت کد ورود" }, { command: "notifications", description: "تنظیم اعلان‌ها" }] });
await call("setChatMenuButton", { menu_button: { type: "web_app", text: "شروع بازی", web_app: { url: appUrl } } });

while (true) {
  try {
    const updates = await call("getUpdates", { offset, timeout: 30, allowed_updates: ["message", "callback_query"] });
    for (const update of updates) {
      if (await handleCodeLoginUpdate(call, update)) {
        offset = update.update_id + 1;
        continue;
      }
      if (await handleAnnouncementUpdate(prisma, call, update)) {
        offset = update.update_id + 1;
        continue;
      }
      const message = update.message;
      if (!message?.chat?.id) {
        offset = update.update_id + 1;
        continue;
      }
      const parsedStart = parseStartCommand(message.text);
      if (parsedStart) await recordStartCommand(prisma, update);
      if (["/start", "/play"].some((command) => message.text?.startsWith(command))) {
        const startPayload = parsedStart?.payload || (message.text?.startsWith("/start ") ? message.text.slice(7).trim() : "");
        const inviteToken = startPayload.startsWith("duel_") ? startPayload.slice(5) : "";
        const isPhraseHunt = startPayload === "phrase_hunt";
        const destinationUrl = new URL(appUrl);
        if (inviteToken) destinationUrl.searchParams.set("duel", inviteToken);
        if (isPhraseHunt) {
          destinationUrl.searchParams.delete("duel");
          destinationUrl.searchParams.set("game", "phrase_hunt");
        }
        const destination = destinationUrl.toString();
        const preferences = await prisma.user.findUnique({ where: { id: String(message.chat.id) }, select: { announcementsEnabled: true } });
        await call("sendMessage", {
          chat_id: message.chat.id,
          text: isPhraseHunt ? "🎯 *به معناجو خوش آمدی!*\n\nعبارت پنهان را حدس بزن؛ هر حدس یک امتیاز نزدیکی معنایی می‌گیرد و کمکت می‌کند به جواب نزدیک‌تر شوی.\n\n🌅 هر روز ساعت ۱۰ صبح و ۱۰ شب به وقت تهران، یک چالش تازه داریم.\n\n👇 برای ورود به چالش فعلی، روی معناجو بزن." : inviteToken ? "🎮 *دعوت به بازی دوحرف*\n\nدوستت منتظر است؛ روی دکمه بزن و وارد اتاق شو." : "🧠 *Anti AI Games*\n\nبازی‌هایی برای مغزی که هنوز خودش فکر می‌کند.",
          parse_mode: "Markdown",
          reply_markup: { inline_keyboard: [[{ text: isPhraseHunt ? "🎯 معناجو" : inviteToken ? "🔤 ورود به اتاق دوحرف" : "🎮 شروع بازی", web_app: { url: destination } }], ...announcementKeyboard(preferences?.announcementsEnabled === true).inline_keyboard] }
        });
      }
      offset = update.update_id + 1;
    }
  } catch (error) {
    console.error(error);
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}
