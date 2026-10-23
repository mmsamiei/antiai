export function parseStartCommand(text) {
  if (typeof text !== "string") return null;
  const match = text.trim().match(/^\/start(?:@[A-Za-z0-9_]+)?(?:\s+(.+))?$/);
  if (!match) return null;

  const payload = match[1]?.trim() || "";
  const payloadKind = payload === "phrase_hunt"
    ? "PHRASE_HUNT"
    : payload.startsWith("duel_")
      ? "DUEL_INVITE"
      : payload
        ? "OTHER"
        : "PLAIN";
  return { payload, payloadKind };
}

export async function recordStartCommand(prisma, update) {
  const parsed = parseStartCommand(update?.message?.text);
  const sender = update?.message?.from;
  if (!parsed || !sender || sender.is_bot || !Number.isSafeInteger(update.update_id) || !Number.isSafeInteger(sender.id)) return false;

  const messageSeconds = update.message.date;
  if (!Number.isSafeInteger(messageSeconds) || messageSeconds <= 0) throw new Error("Invalid Telegram message timestamp");

  await prisma.telegramStartEvent.upsert({
    where: { updateId: BigInt(update.update_id) },
    create: {
      updateId: BigInt(update.update_id),
      telegramUserId: String(sender.id),
      username: sender.username || null,
      firstName: sender.first_name || null,
      lastName: sender.last_name || null,
      payloadKind: parsed.payloadKind,
      messageAt: new Date(messageSeconds * 1000),
    },
    update: {},
  });
  return true;
}
