"use client";
import { useEffect, useState } from "react";
import { sessionRequest } from "@/lib/client-session";
import type { MatchState } from "./country-matchmaking";
import { matchGameConfig } from "@/lib/match-game-config";
const base=process.env.NEXT_PUBLIC_BASE_PATH||"";
type Round={id:string;letters:string[];acceptedWord:string|null};
export function LetterDuelMode({state,busy,onBack,onPractice,onFind,onCancel,onInvite}:{state:MatchState|null;busy:boolean;onBack:()=>void;onPractice:()=>void;onFind:()=>void;onCancel:()=>void;onInvite:()=>void}) {
 const active=state?.search?.status==="ACTIVE";
 return <section className="country-mode-screen">
  <div className="section-heading"><button className="icon-button" aria-label="بازگشت" onClick={onBack}>→</button><div><small>دوحرف</small><h1>یک حالت انتخاب کن</h1></div><span>🔤</span></div>
  <button className="game-card world" onClick={onPractice}><span className="game-icon">🧩</span><span className="game-copy"><b>تمرین آزاد</b><small>دو حرف تصادفی بگیر و یک واژهٔ سه‌حرفی یا بلندتر بساز</small></span><span className="game-arrow">←</span></button>
  <section className="country-mode-duel"><div className="country-mode-duel-heading"><span className="game-icon">⚔️</span><div className="game-copy"><b>رقابت دونفره</b><small>اولین نفر با ۱۰ برد، برندهٔ مسابقه است</small></div></div>
   {active?<div className="country-mode-searching"><span>در حال پیدا کردن حریف {matchGameConfig[state.search!.gameType].name}…</span><button className="secondary" disabled={busy} onClick={onCancel}>لغو جست‌وجو</button></div>:<div className="country-mode-actions"><button className="primary" disabled={busy} onClick={onFind}>پیدا کردن حریف</button><button className="secondary" onClick={onInvite}>دعوت از بازیکن آنلاین</button></div>}
  </section>
 </section>;
}
export default function LetterDuelPractice({onBack,setError}:{onBack:()=>void;setError:(message:string)=>void}) {
 const [round,setRound]=useState<Round|null>(null),[word,setWord]=useState(""),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
 useEffect(()=>{let stopped=false;void fetch(base+"/api/letter-duel/practice",sessionRequest()).then(async response=>{const data=await response.json();if(!response.ok)throw new Error(data.error);if(!stopped)setRound(data.round);}).catch(e=>{if(!stopped)setError(e instanceof Error?e.message:"تمرین بارگذاری نشد");});return()=>{stopped=true;};},[setError]);
 const act=async(action:"guess"|"new")=>{if(busy||!round)return;setBusy(true);try{const response=await fetch(base+"/api/letter-duel/practice",sessionRequest({method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,roundId:round.id,...(action==="guess"?{word}:{})})}));const data=await response.json();if(!response.ok)throw new Error(data.error);setRound(data.round);setMessage(data.verdict?.reason||"");if(action==="new"||data.verdict?.accepted)setWord("");}catch(e){setError(e instanceof Error?e.message:"پاسخ ثبت نشد");}finally{setBusy(false);}};
 return <section className="play-screen">
  <div className="play-heading"><button className="icon-button" aria-label="بازگشت" onClick={onBack}>→</button><div><small>تمرین آزاد</small><h1>🔤 دوحرف</h1></div></div>
  {!round?<div className="empty-state">در حال آماده‌کردن حروف…</div>:<>
   <div className="duel-stage"><small>بدون محدودیت زمان</small><div className="duel-letters"><b>{round.letters[0]}</b><b>{round.letters[1]}</b></div><p>یک واژهٔ فارسی با حداقل سه حرف بنویس که هر دو حرف را داشته باشد.{round.letters[0]===round.letters[1]?" این حرف باید دو بار در واژه باشد.":""}</p></div>
   {round.acceptedWord?<div className="finish-card won"><span className="finish-icon">🎯</span><h2>واژه‌ات درست بود!</h2><strong>{round.acceptedWord}</strong><div className="finish-actions"><button className="primary" disabled={busy} onClick={()=>void act("new")}>دو حرف تازه</button></div></div>:<><div className="search-box"><div className="search-row"><input aria-label="واژهٔ تمرین" value={word} maxLength={80} placeholder="یک واژهٔ حداقل سه‌حرفی…" onChange={e=>{setWord(e.target.value);setMessage("");}} onKeyDown={e=>{if(e.key==="Enter"&&!e.nativeEvent.isComposing){e.preventDefault();void act("guess");}}}/><button disabled={busy||!word.trim()} onClick={()=>void act("guess")}>{busy?"…":"ثبت"}</button></div></div>{message&&<p className="players-hint" role="status">{message}</p>}<div className="guess-head"><span/><button disabled={busy} onClick={()=>void act("new")}>دو حرف تازه می‌خواهم</button></div></>}
  </>}
 </section>;
}
