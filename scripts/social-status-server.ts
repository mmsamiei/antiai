import "dotenv/config";
import { createSocialStatusServer } from "../lib/social-status-server";
import { prisma } from "../lib/prisma";
const port = Number(process.env.SOCIAL_STATUS_PORT || 3003);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Invalid social status port");
const server = createSocialStatusServer(process.env.TELEGRAM_BOT_TOKEN || "", process.env.NEXT_PUBLIC_BASE_PATH || "");
server.requestTimeout = 15000;
server.headersTimeout = 10000;
server.listen(port, "127.0.0.1", () => console.info("social status server started", port));
let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => {
  if (stopping) return; stopping = true;
  server.close(() => { void prisma.$disconnect().finally(() => process.exit(0)); });
  server.closeIdleConnections();
});
