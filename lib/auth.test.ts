import { beforeEach, describe, expect, it, vi } from "vitest";

const request = vi.hoisted(() => ({ cookie: undefined as string | undefined, authorization: null as string | null }));
vi.mock("next/headers", () => ({
  cookies: () => ({ get: () => request.cookie ? { value: request.cookie } : undefined }),
  headers: () => ({ get: () => request.authorization }),
}));

import { createSessionValue, currentUserId } from "./auth";

describe("account identity in Telegram windows sharing cookies", () => {
  beforeEach(() => {
    request.cookie = undefined;
    request.authorization = null;
  });

  it("uses each window's signed token even when another account overwrites the shared cookie", () => {
    request.cookie = createSessionValue("mojtaba");
    request.authorization = `Bearer ${createSessionValue("mahdi")}`;
    expect(currentUserId()).toBe("mahdi");

    request.cookie = createSessionValue("mahdi");
    request.authorization = `Bearer ${createSessionValue("mojtaba")}`;
    expect(currentUserId()).toBe("mojtaba");
  });

  it("does not fall back to another account for invalid or malformed authorization", () => {
    request.cookie = createSessionValue("mojtaba");
    for (const token of ["Bearer mahdi.invalid", "Bearer ", "Basic invalid"]) {
      request.authorization = token;
      expect(currentUserId()).toBeNull();
    }
  });

  it("retains signed cookie authentication for requests without an explicit token", () => {
    request.cookie = createSessionValue("mahdi");
    expect(currentUserId()).toBe("mahdi");
    request.cookie = "mahdi.invalid";
    expect(currentUserId()).toBeNull();
    request.cookie = undefined;
    expect(currentUserId()).toBeNull();
  });
});
