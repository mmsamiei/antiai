import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  findConfig: vi.fn(),
  findEnded: vi.fn(),
  findUsers: vi.fn(),
  createAnnouncement: vi.fn(),
  createDeliveries: vi.fn(),
  queryRaw: vi.fn(),
  updateDelivery: vi.fn(),
  updateConfig: vi.fn(),
  countDeliveries: vi.fn(),
  updateAnnouncement: vi.fn(),
  transaction: vi.fn(),
}));
vi.mock("./prisma", () => ({ prisma: {
  phraseHuntNotificationConfig: { findUnique: mocks.findConfig, update: mocks.updateConfig },
  phraseHuntChallenge: { findMany: mocks.findEnded },
  user: { findMany: mocks.findUsers },
  phraseHuntAnnouncementDelivery: { update: mocks.updateDelivery, count: mocks.countDeliveries, createMany: mocks.createDeliveries },
  phraseHuntAnnouncement: { updateMany: mocks.updateAnnouncement, create: mocks.createAnnouncement },
  $queryRaw: mocks.queryRaw,
  $transaction: mocks.transaction,
} }));
import {
  refreshAnnouncementNames,
  classifyTelegramResponse,
  escapeTelegramHtml,
  phraseHuntChallengeStartsToEnsure,
  queueEndedPhraseHuntAnnouncements,
  renderPhraseHuntAnnouncement,
  phraseHuntOct18Postscript,
  retryDelayMs,
  processPhraseHuntAnnouncementDelivery,
  selectTopPhraseHuntWinners,
  type PhraseHuntWinnerCandidate,
} from "./phrase-hunt-announcements";

function candidate(id: string, userId: string, score: number, createdAt: string, phrase = `حدس ${id}`): PhraseHuntWinnerCandidate {
  return {
    id, userId, username: null, firstName: userId, lastName: null, phrase, score, createdAt: new Date(createdAt),
  };
}

describe("Phrase Hunt announcement ranking and formatting", () => {
  it("keeps each user's best score and resolves guess and player ties deterministically", () => {
    const winners = selectTopPhraseHuntWinners([
      candidate("a-late", "a", 90, "2026-10-16T12:00:02Z", "حدس دیرتر"),
      candidate("a-early", "a", 90, "2026-10-16T12:00:01Z", "حدس زودتر"),
      candidate("b", "b", 90, "2026-10-16T12:00:01Z"),
      candidate("c", "c", 88, "2026-10-16T12:00:00Z"),
      candidate("d", "d", 87, "2026-10-16T12:00:00Z"),
    ]);

    expect(winners.map(({ userId, id }) => [userId, id])).toEqual([
      ["a", "a-early"], ["b", "b"], ["c", "c"],
    ]);
  });

  it("uses a username when present and only shows the available winners", () => {
    const winners = selectTopPhraseHuntWinners([
      { ...candidate("one", "one", 80.5, "2026-10-16T12:00:00Z", "باران"), username: "baran" },
    ]);
    const message = renderPhraseHuntAnnouncement("هوای پاک", winners);
    expect(message).toContain("@baran");
    expect(message).toContain("۸۰٫۵۰ از ۱۰۰");
    expect(message).not.toContain("🥈");
  });

  it("appends the requested one-time postscript without revealing the next answer", () => {
    const text = renderPhraseHuntAnnouncement("راز باغ انار", [], [], phraseHuntOct18Postscript);
    expect(text).toContain("امید موروثی");
    expect(text).toContain("مجتبی پاک‌سرشت");
    expect(text).toContain("نسخهٔ جدید داوری از همین چالش فعال شده");
    expect(text).toContain("دوکلمه‌ای");
    expect(text).not.toContain("جنگ روانی");
    expect(renderPhraseHuntAnnouncement("راز باغ انار", [])).not.toContain("پی‌نوشت");
  });

  it("redacts a moderated phrase while retaining the player's rank and score", () => {
    const winners = selectTopPhraseHuntWinners([
      { ...candidate("one", "one", 80.5, "2026-10-16T12:00:00Z", "عبارت حساس"), username: "baran" },
    ]);
    const message = renderPhraseHuntAnnouncement("هوای پاک", winners, [false]);
    expect(message).toContain("@baran");
    expect(message).toContain("حدس نمایش داده نشد");
    expect(message).toContain("۸۰٫۵۰ از ۱۰۰");
    expect(message).not.toContain("عبارت حساس");
  });

  it("escapes all dynamic HTML and omits the ranking section when there are no guesses", () => {
    const escaped = escapeTelegramHtml(`<answer & "name">`);
    expect(escaped).toBe("&lt;answer &amp; &quot;name&quot;&gt;");
    const message = renderPhraseHuntAnnouncement("<جواب>", []);
    expect(message).toContain("پاسخ این نوبت: <b>«&lt;جواب&gt;»</b>");
    expect(message).toContain("این نوبت هنوز حدسی ثبت نشده بود");
    expect(message).not.toContain("نزدیک‌ترین حدس‌ها");
  });
});

describe("Telegram announcement delivery classification", () => {
  it("recognizes success, permanent recipient failures, and 429 retry_after", () => {
    expect(classifyTelegramResponse(200, { ok: true })).toEqual({ kind: "sent" });
    expect(classifyTelegramResponse(403, { ok: false, error_code: 403, description: "bot blocked" })).toMatchObject({ kind: "permanent" });
    expect(classifyTelegramResponse(429, { ok: false, error_code: 429, description: "slow down", parameters: { retry_after: 12 } }))
      .toEqual({ kind: "retry", error: "slow down", retryAfterMs: 12_000 });
  });

  it("backs off temporary failures and honors Telegram retry_after", () => {
    expect(retryDelayMs(1)).toBe(5_000);
    expect(retryDelayMs(4)).toBe(40_000);
    expect(retryDelayMs(20)).toBe(30 * 60_000);
    expect(retryDelayMs(3, 8_000)).toBe(8_000);
    expect(retryDelayMs(3, 60 * 60_000)).toBe(60 * 60_000);
  });
});

describe("Phrase Hunt announcement schedule recovery", () => {
  it("ensures the active and next Tehran slots, then catches up missed boundaries once", () => {
    const enabledAt = new Date("2026-10-16T07:00:00.000Z"); // 10:30 Tehran
    const justBeforeNoon = new Date("2026-10-16T08:29:59.000Z"); // 11:59:59 Tehran
    const first = phraseHuntChallengeStartsToEnsure(justBeforeNoon, enabledAt, null);
    expect(first.starts.map((date) => date.toISOString())).toEqual([
      "2026-10-15T20:30:00.000Z",
      "2026-10-16T08:30:00.000Z",
    ]);

    const afterNoon = new Date("2026-10-17T09:00:00.000Z");
    const recovered = phraseHuntChallengeStartsToEnsure(afterNoon, enabledAt, first.through);
    expect(recovered.starts.map((date) => date.toISOString())).toEqual([
      "2026-10-16T20:30:00.000Z",
      "2026-10-17T08:30:00.000Z",
      "2026-10-17T18:30:00.000Z",
    ]);
  });

  it("recovers across the schedule change and never ensures the obsolete midnight slot", () => {
    const enabledAt = new Date("2026-10-16T20:52:00Z");
    const before = phraseHuntChallengeStartsToEnsure(new Date("2026-10-17T12:00:00Z"), enabledAt, null);
    expect(before.through.toISOString()).toBe("2026-10-17T18:30:00.000Z");
    const recovered = phraseHuntChallengeStartsToEnsure(new Date("2026-10-18T19:30:00Z"), enabledAt, before.through);
    expect(recovered.starts.map(date => date.toISOString())).toEqual([
      "2026-10-18T06:30:00.000Z", "2026-10-18T19:30:00.000Z", "2026-10-19T06:30:00.000Z",
    ]);
    expect(phraseHuntChallengeStartsToEnsure(new Date("2026-10-18T19:31:00Z"), enabledAt, recovered.through).starts).toEqual([]);
    const restarted = phraseHuntChallengeStartsToEnsure(new Date("2026-10-18T19:30:00Z"), enabledAt, null);
    expect(restarted.starts.some(date => date.toISOString() === "2026-10-17T20:30:00.000Z")).toBe(false);
  });
});

describe("durable Telegram delivery processing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "test-token");
    vi.stubEnv("MINI_APP_URL", "https://example.test/anti-ai");
    mocks.findConfig.mockResolvedValue({ sendNotBefore: null });
    mocks.queryRaw.mockResolvedValue([{
      id: "delivery-1", announcementId: "announcement-1", chatId: "telegram-1", attempts: 1,
      messageText: "🧠 <b>معناجو</b>",
    }]);
    mocks.countDeliveries.mockResolvedValue(0);
    mocks.transaction.mockImplementation((operations: Promise<unknown>[]) => Promise.all(operations));
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it("refreshes queued winner identities just before sending without altering scores or guesses", async () => {
    mocks.queryRaw.mockResolvedValue([{ id: "delivery-1", announcementId: "announcement-1", chatId: "telegram-1", attempts: 1, messageText: "🥇 <b>@old_handle</b> — «باران» <code>۹۵ از ۱۰۰</code>", winnerUserIds: ["winner"] }]);
    mocks.findUsers.mockResolvedValue([{ id: "winner", username: "old_handle", showUsername: false, firstName: "سارا", lastName: "آزمایشی" }]);
    const fetchMock = vi.fn().mockResolvedValue({ status: 200, json: async () => ({ ok: true }) });
    vi.stubGlobal("fetch", fetchMock);
    await processPhraseHuntAnnouncementDelivery(new Date());
    const text = JSON.parse(fetchMock.mock.calls[0][1].body).text;
    expect(text).toContain("<b>سارا آزمایشی</b>"); expect(text).not.toContain("old_handle");
    expect(text).toContain("«باران» <code>۹۵ از ۱۰۰</code>");
  });

  it("marks a delivered message sent and completes the announcement after its last recipient", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ status: 200, json: async () => ({ ok: true }) });
    vi.stubGlobal("fetch", fetchMock);
    expect(await processPhraseHuntAnnouncementDelivery(new Date("2026-10-16T12:00:00Z"))).toBe(true);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      chat_id: "telegram-1", parse_mode: "HTML", reply_markup: { inline_keyboard: [[{ text: "🎮 ورود به چالش تازه" }] ] },
    });
    expect(mocks.updateDelivery).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "delivery-1" }, data: expect.objectContaining({ status: "SENT" }) }));
    expect(mocks.updateAnnouncement).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "COMPLETED" }) }));
  });

  it("retries 429 at retry_after and pauses the shared sender queue", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ status: 429, json: async () => ({ ok: false, error_code: 429, description: "slow down", parameters: { retry_after: 12 } }) });
    vi.stubGlobal("fetch", fetchMock);
    mocks.countDeliveries.mockResolvedValue(1);
    const now = new Date("2026-10-16T12:00:00Z");
    await processPhraseHuntAnnouncementDelivery(now);
    const operations = mocks.transaction.mock.calls[0][0] as Promise<unknown>[];
    await Promise.all(operations);
    expect(mocks.updateDelivery).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "PENDING", nextAttemptAt: new Date(now.getTime() + 12_000) }),
    }));
    expect(mocks.updateConfig).toHaveBeenCalledWith(expect.objectContaining({
      data: { sendNotBefore: new Date(now.getTime() + 12_000) },
    }));
  });

  it("records a blocked recipient as a permanent failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status: 403, json: async () => ({ ok: false, error_code: 403, description: "bot blocked" }) }));
    await processPhraseHuntAnnouncementDelivery(new Date());
    expect(mocks.updateDelivery).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "FAILED", lastError: "bot blocked" }) }));
  });
});

describe("announcement outbox creation", () => {
  it("snapshots every registered user and writes the completed challenge result once", async () => {
    const enabledAt = new Date("2026-10-16T00:00:00Z");
    const now = new Date("2026-10-17T08:30:01Z");
    mocks.findEnded.mockResolvedValue([{ id: "challenge-1", targetId: "ph-001" }]);
    mocks.queryRaw.mockResolvedValue([
      candidate("guess-1", "winner", 93.25, "2026-10-17T08:00:00Z", "هوای خوب"),
    ]);
    mocks.findUsers.mockResolvedValue([{ id: "telegram-1" }, { id: "telegram-2" }]);
    mocks.createAnnouncement.mockResolvedValue({ id: "announcement-1" });
    mocks.createDeliveries.mockResolvedValue({ count: 2 });
    mocks.countDeliveries.mockResolvedValue(2);
    mocks.transaction.mockImplementation((work: any) => work({
      user: { findMany: mocks.findUsers },
      phraseHuntAnnouncement: { create: mocks.createAnnouncement, update: mocks.updateAnnouncement },
      phraseHuntAnnouncementDelivery: { createMany: mocks.createDeliveries },
    }));

    await queueEndedPhraseHuntAnnouncements(enabledAt, now);
    expect(mocks.findEnded).toHaveBeenCalledWith(expect.objectContaining({
      where: { endsAt: { gt: enabledAt, lte: now }, announcement: null },
    }));
    expect(mocks.createDeliveries).toHaveBeenCalledWith({ data: [
      { announcementId: "announcement-1", chatId: "telegram-1" },
      { announcementId: "announcement-1", chatId: "telegram-2" },
    ] });
    expect(mocks.createAnnouncement.mock.calls[0][0].data.messageText).toContain("هوای پاک");
  });
});

describe("privacy in result formatting", () => {
  it("uses real names for hidden usernames and safely escapes replacements", () => {
    const winners = selectTopPhraseHuntWinners([{ ...candidate("one", "one", 90, "2026-10-16T12:00:00Z"), username: "hidden", showUsername: false, firstName: "سارا", lastName: null }]);
    expect(renderPhraseHuntAnnouncement("پگاه", winners)).not.toContain("hidden");
    expect(refreshAnnouncementNames("🥇 <b>@old</b> — «حدس»", ["سارا <آزمایش>"])).toBe("🥇 <b>سارا &lt;آزمایش&gt;</b> — «حدس»");
  });
});
