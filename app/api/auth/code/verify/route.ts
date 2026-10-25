import { z } from "zod";
import { BROWSER_SECRET, REQUEST_ID, normalizeLoginCode, verifyLoginCode } from "@/lib/code-login";
import { codeFailure, codeReply, codeSessionReply } from "@/lib/code-login-response";
export const dynamic = "force-dynamic";
const input = z.object({ id: z.string().regex(REQUEST_ID), secret: z.string().regex(BROWSER_SECRET), code: z.string().max(20).transform(normalizeLoginCode).pipe(z.string().regex(/^\d{6}$/)) }).strict();
export async function POST(request: Request) {
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return codeReply({ error: "کد شش‌رقمی و درخواست ورود معتبر وارد کن." }, 400);
  try { return codeSessionReply(await verifyLoginCode(parsed.data.id, parsed.data.secret, parsed.data.code)); }
  catch (error) { return codeFailure(error); }
}
