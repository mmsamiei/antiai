import { codeLoginReference } from "../lib/code-login-reference";
import { CodeLoginError, REQUEST_ID, codeLoginRequestAvailable, invalidateUndeliveredCode, issueLoginCode, type LoginSender } from "../lib/code-login";
type Call = (method: string, payload: Record<string, unknown>) => Promise<unknown>;
type Update = { message?: { text?: string; chat?: { id: number; type: string }; from?: LoginSender }; callback_query?: { id: string; data?: string; from: LoginSender; message?: { chat: { id: number; type: string } } } };
export async function handleCodeLoginUpdate(call: Call, update: Update) {
  const message = update.message;
  const text = message?.text?.trim() || "";
  const isGuide = /^\/login(?:@\w+)?$/.test(text) || /^(?:درخواست ورود مال من است(?:؛ دریافت کد)?|دریافت کد ورود)$/.test(text);
  if (isGuide) {
    if (message?.chat?.type !== "private" || message.from?.id !== message.chat.id) return true;
    const appUrl = process.env.MINI_APP_URL;
    await call("sendMessage", {
      chat_id: message.chat.id,
      text: "🔐 دریافت کد ورود\n\n۱. صفحهٔ بازی را باز کن و «ورود با کد تلگرام» را بزن.\n۲. از همان صفحه، لینک دریافت کد از بات را باز کن. اگر تلگرام دکمهٔ Start / شروع نشان داد، آن را بزن.\n۳. شناسهٔ درخواست در بات را با صفحهٔ بازی مقایسه کن؛ فقط اگر یکسان بود و خودت درخواست را ساخته‌ای، دکمهٔ تأیید زیر همان پیام را بزن.\n\nجملهٔ «درخواست ورود مال من است» را تایپ نکن؛ باید دکمهٔ زیر پیام مربوط به همان درخواست را بزنی. کد فقط برای همان صفحه است. از لینک ارسالی دیگران درخواست ورود را تأیید نکن.",
      ...(appUrl ? { reply_markup: { inline_keyboard: [[{ text: "باز کردن صفحهٔ بازی", url: appUrl }]] } } : {})
    });
    return true;
  }
  const start = message?.text?.match(/^\/start(?:@\w+)?\s+login_([a-f0-9]{32})\s*$/);
  if (start) {
    if (message?.chat?.type !== "private" || message.from?.id !== message.chat.id) return true;
    const available = await codeLoginRequestAvailable(start[1]);
    await call("sendMessage", { chat_id: message.chat.id, parse_mode: "HTML", text: available ? `🔐 تأیید درخواست ورود به Anti AI\n\nشناسهٔ درخواست: <code>${codeLoginReference(start[1])}</code>\n\nاین شناسه باید با شناسهٔ صفحهٔ ورودت یکسان باشد. فقط اگر خودت درخواست را از صفحهٔ بازی ساخته‌ای و شناسه‌ها یکی هستند، دکمهٔ زیر را بزن؛ متن دکمه را تایپ نکن.\n\nاگر لینک را شخص دیگری فرستاده یا شناسه متفاوت است، تأیید نکن. کد را فقط در صفحهٔ رسمی بازی وارد کن و برای کسی نفرست.\n\nپس از ورود، همان دستگاه ۱۲ ساعت وارد می‌ماند.` : "این درخواست منقضی شده یا استفاده شده است. به صفحهٔ بازی برگرد و درخواست تازه بساز.", ...(available ? { reply_markup: { inline_keyboard: [[{ text: "درخواست ورود مال من است؛ دریافت کد", callback_data: `login:confirm:${start[1]}` }]] } } : {}) });
    return true;
  }
  const query = update.callback_query;
  if (!query?.data?.startsWith("login:confirm:")) return false;
  const id = query.data.slice("login:confirm:".length);
  if (!REQUEST_ID.test(id) || query.message?.chat.type !== "private" || query.from.id !== query.message.chat.id) {
    await call("answerCallbackQuery", { callback_query_id: query.id, text: "درخواست ورود معتبر نیست." });
    return true;
  }
  await call("answerCallbackQuery", { callback_query_id: query.id, text: "در حال بررسی درخواست ورود…" });
  let issued: { code: string; codeHash: string };
  try { issued = await issueLoginCode(id, query.from); }
  catch (error) {
    if (!(error instanceof CodeLoginError)) throw error;
    await call("sendMessage", { chat_id: query.from.id, text: error.message });
    return true;
  }
  try {
    await call("sendMessage", { chat_id: query.from.id, text: `🔐 کد ورود به Anti AI: <code>${issued.code}</code>\nشناسهٔ درخواست: <code>${codeLoginReference(id)}</code>\n\nاین کد یک‌بارمصرف است و حداکثر ۲ دقیقه اعتبار دارد. آن را فقط در همان صفحهٔ بازی که درخواست را ساختی وارد کن.\n\n⚠️ کد را برای هیچ‌کس نفرست. اگر خودت درخواست ورود نداده‌ای، از این کد استفاده نکن.`, parse_mode: "HTML", protect_content: true });
  } catch (error) { await invalidateUndeliveredCode(id, issued.codeHash); throw error; }
  return true;
}
