export function announcementKeyboard(enabled) {
  return { inline_keyboard: [[{ text: enabled ? "🔕 قطع اعلان‌ها" : "🔔 روشن‌کردن اعلان‌ها", callback_data: enabled ? "announcements:off" : "announcements:on" }]] };
}

export async function handleAnnouncementUpdate(prisma, call, update) {
  const query = update.callback_query;
  if (query && ["announcements:on", "announcements:off"].includes(query.data)) {
    if (!query.from?.id || query.message?.chat?.type !== "private" || String(query.message.chat.id) !== String(query.from.id)) {
      await call("answerCallbackQuery", { callback_query_id: query.id, text: "این تنظیم را در گفت‌وگوی خصوصی بات تغییر بده." });
      return true;
    }
    const enabled = query.data === "announcements:on";
    const id = String(query.from.id);
    await prisma.user.upsert({ where: { id }, create: { id, announcementsEnabled: enabled }, update: { announcementsEnabled: enabled } });
    await call("answerCallbackQuery", { callback_query_id: query.id, text: enabled ? "اعلان‌ها روشن شد." : "اعلان‌ها خاموش شد." });
    await call("sendMessage", { chat_id: id, text: enabled ? "🔔 اعلان چالش‌ها و خبرهای بازی روشن شد." : "🔕 اعلان چالش‌ها و خبرهای بازی خاموش شد. هر وقت خواستی می‌توانی دوباره روشنش کنی.", reply_markup: announcementKeyboard(enabled) });
    return true;
  }
  const message = update.message;
  if (message?.chat?.type === "private" && /^\/notifications(?:@\w+)?(?:\s|$)/.test(message.text || "")) {
    const user = await prisma.user.findUnique({ where: { id: String(message.from.id) }, select: { announcementsEnabled: true } });
    const enabled = user?.announcementsEnabled === true;
    await call("sendMessage", { chat_id: message.chat.id, text: enabled ? "اعلان چالش‌ها و خبرهای بازی روشن است." : "اعلان چالش‌ها و خبرهای بازی خاموش است.", reply_markup: announcementKeyboard(enabled) });
    return true;
  }
  return false;
}
