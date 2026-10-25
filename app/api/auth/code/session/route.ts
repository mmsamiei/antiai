import { cookies } from "next/headers";
import { sessionUserId } from "@/lib/session-signature";
import { isAccountSuspended } from "@/lib/account-suspensions";
import { prisma } from "@/lib/prisma";
import { loginUser } from "@/lib/code-login";
import { CODE_SESSION_COOKIE, codeFailure, codeReply, codeSessionReply } from "@/lib/code-login-response";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const authorization = request.headers.get("authorization");
  const token = authorization !== null ? (authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "") : cookies().get(CODE_SESSION_COOKIE)?.value;
  const key = process.env.TELEGRAM_BOT_TOKEN;
  if (!key) return codeReply({ error: "ورود موقتاً در دسترس نیست." }, 503);
  const id = token?.startsWith("otp:") ? sessionUserId(token, key) : null;
  if (!id || !token || isAccountSuspended(id)) return codeReply({ error: "مهلت ورود تمام شده؛ دوباره کد بگیر." }, 401);
  try {
    const user = await prisma.user.findUnique({ where: { id }, select: { id: true, firstName: true, lastName: true, username: true, photoUrl: true } });
    if (!user) return codeReply({ error: "دوباره وارد شو." }, 401);
    return codeSessionReply({ user: loginUser(user), session: token, expiresAt: Number(token.split(":")[2]) });
  } catch (error) { return codeFailure(error); }
}
