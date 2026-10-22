import { describe, expect, it } from "vitest";
import { publicDisplayName, publicIdentity } from "./public-identity";
import { wordWeaverActor } from "./word-weaver-personas";
const user = { id: "u", firstName: "سارا", lastName: "آزمایشی", username: "secret_handle", photoUrl: null, showUsername: false };
describe("public username visibility", () => {
  it("defaults to showing usernames unless explicitly disabled", () => {
    expect(publicDisplayName({ username: "visible" }, true)).toBe("@visible");
    expect(publicDisplayName({ ...user, showUsername: true }, true)).toBe("@secret_handle");
  });
  it("hides usernames in payloads and name fallbacks", () => {
    expect(publicDisplayName(user, true)).toBe("سارا آزمایشی");
    expect(publicIdentity(user)).toMatchObject({ username: null, firstName: "سارا" });
    expect(publicIdentity(user)).not.toHaveProperty("showUsername");
    expect(publicDisplayName({ username: "secret_handle", showUsername: false })).toBe("بازیکن ناشناس");
  });
  it("redacts the actor of live writing and past results", () => {
    expect(wordWeaverActor({ user })).toMatchObject({ username: null, displayName: "سارا آزمایشی" });
    expect(JSON.stringify(wordWeaverActor({ user }))).not.toContain("secret_handle");
  });
});
