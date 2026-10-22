import { createServer, type IncomingMessage } from "node:http";
import { sessionUserId } from "./session-signature";
import { isAccountSuspended } from "./account-suspensions";
import { readSocialStatus } from "./social-status";

export function authenticate(request: IncomingMessage, key: string) {
  let token: string | undefined;
  if (request.headers.authorization !== undefined) {
    if (!request.headers.authorization.startsWith("Bearer ")) return null;
    token = request.headers.authorization.slice(7).trim();
  } else {
    const cookie = request.headers.cookie?.split(";").map(v => v.trim()).find(v => v.startsWith("anti_ai_user_id="));
    try { token = cookie ? decodeURIComponent(cookie.slice("anti_ai_user_id=".length)) : undefined; } catch { return null; }
  }
  const userId = sessionUserId(token, key);
  return userId && !isAccountSuspended(userId) ? userId : null;
}

export function createSocialStatusServer(key: string, basePath: string, read: (userId: string) => Promise<unknown> = readSocialStatus) {
  if (!key) throw new Error("Session signing key is required");
  let lastErrorAt = 0;
  return createServer({ maxHeaderSize: 16384 }, async (request, response) => {
    const reply = (status: number, data: unknown) => {
      const body = JSON.stringify(data);
      response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "Content-Length": Buffer.byteLength(body), "X-AntiAI-Social": "fast" });
      response.end(body);
    };
    if ((request.url || "/").split("?", 1)[0] !== basePath + "/api/social") return reply(404, { error: "Not found" });
    if (request.method !== "GET") return reply(405, { error: "Method not allowed" });
    try {
      const userId = authenticate(request, key);
      if (!userId) return reply(401, { error: "ابتدا وارد شو" });
      reply(200, await read(userId));
    } catch (error) {
      if (Date.now() - lastErrorAt > 10000) { lastErrorAt = Date.now(); console.error("social status request failed", error instanceof Error ? error.name : "unknown"); }
      reply(503, { error: "دریافت وضعیت بازی ممکن نشد" });
    }
  });
}
