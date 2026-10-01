import "dotenv/config";

const token = process.env.TELEGRAM_BOT_TOKEN;
const appUrl = process.env.MINI_APP_URL;
if (!token || !appUrl) throw new Error("TELEGRAM_BOT_TOKEN and MINI_APP_URL are required");

const api = `https://api.telegram.org/bot${token}`;
let offset = 0;

async function call(method, payload = {}) {
  const response = await fetch(`${api}/${method}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
  });
  const data = await response.json();
  if (!data.ok) throw new Error(`${method}: ${data.description}`);
  return data.result;
}

await call("setMyCommands", { commands: [{ command: "start", description: "شروع بازی" }, { command: "play", description: "باز کردن Anti AI Games" }] });
await call("setChatMenuButton", { menu_button: { type: "web_app", text: "شروع بازی", web_app: { url: appUrl } } });

while (true) {
  try {
    const updates = await call("getUpdates", { offset, timeout: 30, allowed_updates: ["message"] });
    for (const update of updates) {
      offset = update.update_id + 1;
      const message = update.message;
      if (!message?.chat?.id) continue;
      if (["/start", "/play"].some((command) => message.text?.startsWith(command))) {
        await call("sendMessage", {
          chat_id: message.chat.id,
          text: "🧠 *Anti AI Games*\n\nبازی‌هایی برای مغزی که هنوز خودش فکر می‌کند.\nشهرجو یا کشورجو را انتخاب کن و هرچقدر خواستی بازی کن.",
          parse_mode: "Markdown",
          reply_markup: { inline_keyboard: [[{ text: "🎮 شروع بازی", web_app: { url: appUrl } }]] }
        });
      }
    }
  } catch (error) {
    console.error(error);
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}
