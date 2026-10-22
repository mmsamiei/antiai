import { beforeEach, describe, expect, it, vi } from "vitest";

const { currentUserId, findUnique, groupBy, findMany } = vi.hoisted(() => ({
  currentUserId: vi.fn(),
  findUnique: vi.fn(),
  groupBy: vi.fn(),
  findMany: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ currentUserId }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique },
    gameSession: { groupBy, findMany },
  },
}));

import { GET } from "./route";

const context = { params: { userId: "telegram-user-42" } };

describe("GET /api/users/[userId]/profile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findUnique.mockResolvedValue({
      id: "telegram-user-42",
      firstName: "سارا",
      lastName: "",
      username: "sara_test",
      photoUrl: "https://example.test/avatar.jpg",
      guesses: [{ itemId: "hidden-answer" }],
      sessions: [{ semantrisState: { targetWord: "secret" } }],
    });
    groupBy.mockResolvedValue([]);
    findMany.mockResolvedValue([]);
  });

  it("hides username and Telegram links for another viewer while preserving the person's name", async () => {
    currentUserId.mockReturnValue("viewer");
    findUnique.mockResolvedValue({ id: "telegram-user-42", firstName: "سارا", lastName: "", username: "secret_handle", showUsername: false, photoUrl: null });
    const response = await GET(new Request("https://example.test/api"), context);
    const body = await response.json();
    expect(body.user.displayName).toBe("سارا"); expect(body.user.username).toBeNull();
    expect(JSON.stringify(body)).not.toContain("secret_handle"); expect(body.user).not.toHaveProperty("showUsername");
  });

  it("requires authentication before looking up a user", async () => {
    currentUserId.mockReturnValue(null);

    const response = await GET(new Request("https://example.test/api"), context);

    expect(response.status).toBe(401);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown user", async () => {
    currentUserId.mockReturnValue("viewer");
    findUnique.mockResolvedValue(null);

    const response = await GET(new Request("https://example.test/api"), context);

    expect(response.status).toBe(404);
    expect(groupBy).not.toHaveBeenCalled();
  });

  it("returns only public identity and aggregate statistics", async () => {
    currentUserId.mockReturnValue("viewer");
    groupBy
      .mockResolvedValueOnce([
        {
          type: "IRAN_CITY",
          status: "WON",
          _count: { _all: 2 },
          _avg: { guessesCount: 4 },
          _min: { guessesCount: 2 },
        },
      ])
      .mockResolvedValueOnce([
        { status: "WON", _count: { _all: 3 } },
        { status: "LOST", _count: { _all: 1 } },
      ]);

    const response = await GET(new Request("https://example.test/api"), context);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.user).toEqual({
      id: "telegram-user-42",
      displayName: "سارا",
      username: "sara_test",
      photoUrl: "https://example.test/avatar.jpg",
      isMe: false,
    });
    expect(body.stats.geography.IRAN_CITY).toEqual({
      total: 2,
      wins: 2,
      surrendered: 0,
      averageGuesses: 4,
      bestGame: 2,
    });
    expect(body.stats.letterDuel).toMatchObject({ rounds: 4, wins: 3, losses: 1 });
    expect(JSON.stringify(body)).not.toContain("hidden-answer");
    expect(JSON.stringify(body)).not.toContain("targetWord");
    expect(Object.keys(body)).toEqual(["user", "stats"]);
  });
});
