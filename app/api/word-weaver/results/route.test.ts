import { describe, expect, it, vi } from "vitest";
import { GET } from "./route";

vi.mock("@/lib/auth", () => ({ currentUserId: () => null }));

describe("word-weaver result endpoint", () => {
  it("requires an authenticated session", async () => {
    const response = await GET(new Request("https://example.test/api/word-weaver/results?round=missing"));
    expect(response.status).toBe(401);
  });
});
