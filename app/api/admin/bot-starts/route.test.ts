import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  currentUserId: vi.fn(),
  isFeedbackAdmin: vi.fn(),
  findMany: vi.fn(),
  count: vi.fn(),
  userFindMany: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ currentUserId: mocks.currentUserId }));
vi.mock("@/lib/feedback", () => ({ isFeedbackAdmin: mocks.isFeedbackAdmin }));
vi.mock("@/lib/prisma", () => ({ prisma: {
  telegramStartEvent: { findMany: mocks.findMany, count: mocks.count },
  user: { findMany: mocks.userFindMany },
} }));

import { GET } from "./route";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.currentUserId.mockReturnValue("admin");
  mocks.isFeedbackAdmin.mockReturnValue(true);
  mocks.findMany.mockResolvedValue([]);
  mocks.count.mockResolvedValue(0);
  mocks.userFindMany.mockResolvedValue([]);
});

it("requires an authenticated configured admin", async () => {
  mocks.currentUserId.mockReturnValue(null);
  expect((await GET(new Request("https://example.test/api/admin/bot-starts"))).status).toBe(401);
  mocks.currentUserId.mockReturnValue("not-admin");
  mocks.isFeedbackAdmin.mockReturnValue(false);
  expect((await GET(new Request("https://example.test/api/admin/bot-starts"))).status).toBe(403);
  expect(mocks.findMany).not.toHaveBeenCalled();
});

it("lists recorded starts in a default 24-hour window and hides opted-out usernames", async () => {
  mocks.findMany.mockResolvedValue([{
    telegramUserId: "123",
    username: "old_username",
    firstName: "نام نمایشی",
    lastName: null,
    payloadKind: "PLAIN",
    messageAt: new Date("2026-10-23T10:00:00Z"),
    receivedAt: new Date("2026-10-23T10:00:02Z"),
    updateId: 12n,
  }]);
  mocks.count.mockResolvedValue(1);
  mocks.userFindMany.mockResolvedValue([{ id: "123", firstName: "نام نمایشی", lastName: null, username: "old_username", showUsername: false }]);

  const response = await GET(new Request("https://example.test/api/admin/bot-starts"));
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.total).toBe(1);
  expect(body.events[0]).toMatchObject({ telegramUserId: "123", name: "نام نمایشی", username: null, payloadKind: "PLAIN" });
  expect(JSON.stringify(body)).not.toContain("old_username");
  expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 50, skip: 0, where: expect.objectContaining({ messageAt: expect.any(Object) }) }));
});

it("validates date ranges and pagination", async () => {
  expect((await GET(new Request("https://example.test/api/admin/bot-starts?page=0"))).status).toBe(400);
  expect((await GET(new Request("https://example.test/api/admin/bot-starts?from=not-a-date"))).status).toBe(400);
  expect((await GET(new Request("https://example.test/api/admin/bot-starts?from=2026-10-24T00:00:00Z&to=2026-10-23T00:00:00Z"))).status).toBe(400);
});
