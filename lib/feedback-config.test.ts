import { describe, expect, it } from "vitest";
import { feedbackInput, feedbackPoints, feedbackReview } from "./feedback-config";
describe("feedback validation and rewards", () => {
 it("rewards useful participation once regardless of implementation", () => {
  expect(feedbackPoints("PENDING")).toBe(0); expect(feedbackPoints("REVIEWED")).toBe(0);
  expect(feedbackPoints("ACCEPTED")).toBe(10); expect(feedbackPoints("IMPLEMENTED")).toBe(10);
 });
 it("validates content and idempotency keys", () => {
  const valid={requestId:"e6659ed8-6771-45d6-a495-644ab947c43b",kind:"BUG",title:"مشکل نمایش",body:"دکمهٔ بازگشت کار نمی‌کند."};
  expect(feedbackInput.safeParse(valid).success).toBe(true);
  for(const bad of [{...valid,body:" "},{...valid,kind:"OTHER"},{...valid,requestId:"x"},{...valid,title:"x"},{...valid,body:"x".repeat(3001)}])expect(feedbackInput.safeParse(bad).success).toBe(false);
 });
 it("requires a readable review and a known status", () => {
  expect(feedbackReview.safeParse({id:"item",status:"ACCEPTED",reply:"تأیید شد"}).success).toBe(true);
  expect(feedbackReview.safeParse({id:"item",status:"ACCEPTED",reply:" "}).success).toBe(false);
  expect(feedbackReview.safeParse({id:"item",status:"WINNER",reply:"تأیید شد"}).success).toBe(false);
 });
});
