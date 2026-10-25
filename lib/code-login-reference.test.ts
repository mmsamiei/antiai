import { expect, it } from "vitest";
import { codeLoginReference } from "./code-login-reference";
it("shows the same public reference in the browser and bot without the browser secret", () => {
  expect(codeLoginReference("abcdef1234567890abcdef1234567890")).toBe("ABCD-EF12-3456");
});
it.each(["", "not-an-id", "a".repeat(31), "a".repeat(33)])("rejects malformed request labels %s", id => {
  expect(() => codeLoginReference(id)).toThrow();
});
