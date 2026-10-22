import { expect, it } from "vitest";
import { AsyncCapacity } from "./async-capacity";
it("bounds active work, transfers slots and frees them on rejection", async () => {
 const cap = new AsyncCapacity(1, 2, 1000); let release!:()=>void, active=0,peak=0;
 const run=()=>cap.run(async()=>{active++;peak=Math.max(peak,active);await new Promise<void>(r=>release=r);active--;});
 const a=run(),b=run(); expect(peak).toBe(1);release();await a;await new Promise(r=>setTimeout(r,0));release();await b;expect(peak).toBe(1);
 await expect(cap.run(async()=>{throw Error("provider failed");})).rejects.toThrow("provider failed");expect(await cap.run(async()=>7)).toBe(7);
});
it("bounds the waiting queue and expires waiting work without leaking a slot", async()=>{
 const cap=new AsyncCapacity(1,1,10);let release!:()=>void;
 const active=cap.run(()=>new Promise<void>(r=>release=r));const waiting=cap.run(async()=>1);const rejected=expect(waiting).rejects.toThrow("JEV_BUSY");
 await expect(cap.run(async()=>2)).rejects.toThrow("JEV_BUSY");await rejected;release();await active;expect(await cap.run(async()=>3)).toBe(3);
});
