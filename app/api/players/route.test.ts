import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ currentUserId: vi.fn(), queryRaw: vi.fn() }));
vi.mock("@/lib/auth", () => ({ currentUserId: mocks.currentUserId }));
vi.mock("@/lib/prisma", () => ({ prisma: { $queryRaw: mocks.queryRaw } }));
import { GET } from "./route";
beforeEach(() => { vi.clearAllMocks(); mocks.currentUserId.mockReturnValue("me"); mocks.queryRaw.mockResolvedValue([]); });
describe("players search", () => {
  it("requires authentication", async () => { mocks.currentUserId.mockReturnValue(null); expect((await GET(new Request("https://test/api/players"))).status).toBe(401); expect(mocks.queryRaw).not.toHaveBeenCalled(); });
  it.each(["page=-1", "page=1.5", "page=10001", "page=abc", "q=" + "x".repeat(81)])("rejects invalid search parameters %s", async params => { expect((await GET(new Request("https://test/api/players?"+params))).status).toBe(400); expect(mocks.queryRaw).not.toHaveBeenCalled(); });
  it("returns one bounded page and excludes the current player via a query parameter", async () => {
    mocks.queryRaw.mockResolvedValue(Array.from({length:31},(_,i)=>({id:String(i),online:true})));
    const response = await GET(new Request("https://test/api/players?page=2&q=%40test"));
    const data = await response.json(); expect(data.players).toHaveLength(30); expect(data.hasMore).toBe(true);
    const query = mocks.queryRaw.mock.calls[0][0]; expect(query.values).toContain("me"); expect(query.values).toContain("test"); expect(query.values).toContain(60);
    expect(query.sql).toContain('ORDER BY "online" DESC');
  });
  it("preserves underscores in username searches while normalizing Persian name input", async () => {
    await GET(new Request("https://test/api/players?q=%40yasaman_invite_test"));
    expect(mocks.queryRaw.mock.calls[0][0].values).toContain("yasaman_invite_test");
    await GET(new Request("https://test/api/players?q="+encodeURIComponent("علي كريمي")));
    expect(mocks.queryRaw.mock.calls[1][0].values).toContain("علی کریمی");
  });
  it("filters hidden usernames from search and redacts them in SQL projection", async () => {
    await GET(new Request("https://test/api/players?q=hidden_handle"));
    const sql = mocks.queryRaw.mock.calls[0][0].sql;
    expect(sql).toContain('u."showUsername" AND strpos');
    expect(sql).toContain('CASE WHEN u."showUsername" THEN u."username" ELSE NULL END');
  });
  it("parameterizes user-entered SQL-looking text", async () => {
    const q = "'; DROP TABLE User; --";
    await GET(new Request("https://test/api/players?q="+encodeURIComponent(q)));
    const query = mocks.queryRaw.mock.calls[0][0]; expect(query.sql).not.toContain("DROP TABLE");
  });
});
