import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ available: vi.fn(), issue: vi.fn(), invalidate: vi.fn() }));
vi.mock("../lib/code-login", () => ({ REQUEST_ID: /^[a-f0-9]{32}$/, CodeLoginError: class extends Error { constructor(public status: number, message: string) { super(message); } }, codeLoginRequestAvailable: mocks.available, issueLoginCode: mocks.issue, invalidateUndeliveredCode: mocks.invalidate }));
import { handleCodeLoginUpdate } from "./bot-code-login";
const id = "a".repeat(32);
beforeEach(() => { vi.clearAllMocks(); mocks.available.mockResolvedValue(true); mocks.issue.mockResolvedValue({ code: "123456", codeHash: "hash" }); });
it("requires explicit confirmation before issuing a code", async () => {
  const call = vi.fn();
  await handleCodeLoginUpdate(call, { message: { text: `/start login_${id}`, from: { id: 42 }, chat: { id: 42, type: "private" } } });
  expect(mocks.issue).not.toHaveBeenCalled();
  expect(call).toHaveBeenCalledWith("sendMessage", expect.objectContaining({ reply_markup: { inline_keyboard: [[expect.objectContaining({ callback_data: `login:confirm:${id}` })]] } }));
});
it("sends codes only to the Telegram actor in a private chat", async () => {
  const call = vi.fn();
  await handleCodeLoginUpdate(call, { callback_query: { id: "q", data: `login:confirm:${id}`, from: { id: 42 }, message: { chat: { id: 42, type: "private" } } } });
  expect(mocks.issue).toHaveBeenCalledWith(id, { id: 42 });
  expect(call).toHaveBeenCalledWith("sendMessage", expect.objectContaining({ chat_id: 42, protect_content: true, text: expect.stringContaining("123456") }));
});
it("rejects forwarded or group confirmations", async () => {
  await handleCodeLoginUpdate(vi.fn(), { callback_query: { id: "q", data: `login:confirm:${id}`, from: { id: 42 }, message: { chat: { id: -1, type: "group" } } } });
  expect(mocks.issue).not.toHaveBeenCalled();
});
it("invalidates a code if delivery fails", async () => {
  const call = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(Error("network"));
  await expect(handleCodeLoginUpdate(call, { callback_query: { id: "q", data: `login:confirm:${id}`, from: { id: 42 }, message: { chat: { id: 42, type: "private" } } } })).rejects.toThrow("network");
  expect(mocks.invalidate).toHaveBeenCalledWith(id, "hash");
});
it.each(["/login", "/login@AntiAiBot", "درخواست ورود مال من است", "درخواست ورود مال من است؛ دریافت کد", "دریافت کد ورود"])("guides %s without guessing a device or issuing a code", async text => {
  const call = vi.fn();
  await handleCodeLoginUpdate(call, { message: { text, from: { id: 42 }, chat: { id: 42, type: "private" } } });
  expect(mocks.issue).not.toHaveBeenCalled(); expect(mocks.available).not.toHaveBeenCalled();
  expect(call).toHaveBeenCalledWith("sendMessage", expect.objectContaining({ chat_id: 42, text: expect.stringContaining("شناسهٔ درخواست") }));
});
it("includes a matching reference in the confirmation prompt without issuing a code", async () => {
  const call = vi.fn();
  await handleCodeLoginUpdate(call, { message: { text: `/start login_${id}`, from: { id: 42 }, chat: { id: 42, type: "private" } } });
  expect(call).toHaveBeenCalledWith("sendMessage", expect.objectContaining({ parse_mode: "HTML", text: expect.stringContaining("AAAA-AAAA-AAAA") }));
  expect(mocks.issue).not.toHaveBeenCalled();
});
it("does not guide or issue codes for commands in groups", async () => {
  const call = vi.fn();
  await handleCodeLoginUpdate(call, { message: { text: "/login", from: { id: 42 }, chat: { id: -1, type: "group" } } });
  expect(call).not.toHaveBeenCalled(); expect(mocks.issue).not.toHaveBeenCalled();
});
