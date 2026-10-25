import { createCodeLoginRequest } from "@/lib/code-login";
import { codeFailure, codeReply } from "@/lib/code-login-response";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  const bot = (process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || "").replace(/^@/, "");
  if (!/^[a-zA-Z0-9_]{5,32}$/.test(bot)) return codeReply({ error: "ورود با کد موقتاً در دسترس نیست." }, 503);
  try {
    const address = request.headers.get("x-real-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const data = await createCodeLoginRequest(address.slice(0, 200));
    return codeReply({ ...data, botUrl: `https://t.me/${bot}?start=login_${data.id}` });
  } catch (error) { return codeFailure(error); }
}
