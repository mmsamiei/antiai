import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUserId } from "@/lib/auth";
import { readLetterPractice, submitLetterPractice, surrenderLetterPractice } from "@/lib/letter-duel-practice";
export const dynamic = "force-dynamic";
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{"Cache-Control":"no-store"}});
const input=z.discriminatedUnion("action",[
 z.object({action:z.literal("surrender"),roundId:z.string().min(1).max(80)}),
 z.object({action:z.literal("new"),roundId:z.string().min(1).max(80)}),
 z.object({action:z.literal("guess"),roundId:z.string().min(1).max(80),word:z.string().min(1).max(120)}),
]);
function failure(e:unknown){const code=e instanceof Error?e.message:"";return reply({error:code==="PRACTICE_ROUND_CHANGED"?"حروف این تمرین تغییر کرده‌اند؛ صفحه را تازه کن.":code==="JEV_UNAVAILABLE"?"داور موقتاً در دسترس نیست؛ دوباره تلاش کن.":"تمرین بارگذاری نشد؛ دوباره تلاش کن."},code==="PRACTICE_ROUND_CHANGED"?409:503);}
export async function GET(){const userId=currentUserId();if(!userId)return reply({error:"ابتدا وارد بازی شو"},401);try{return reply({round:await readLetterPractice(userId)});}catch(e){return failure(e);}}
export async function POST(request:Request){const userId=currentUserId();if(!userId)return reply({error:"ابتدا وارد بازی شو"},401);const parsed=input.safeParse(await request.json().catch(()=>null));if(!parsed.success)return reply({error:"درخواست معتبر نیست"},400);try{const body=parsed.data;return body.action==="surrender"?reply(await surrenderLetterPractice(userId,body.roundId)):body.action==="new"?reply({round:await readLetterPractice(userId,body.roundId)}):reply(await submitLetterPractice(userId,body.roundId,body.word));}catch(e){return failure(e);}}
