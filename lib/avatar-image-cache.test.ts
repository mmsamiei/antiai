import { expect, it } from "vitest";
import { AvatarImageCache } from "./avatar-image-cache";
it("coalesces an arrival burst and keys freshness by photo source", async()=>{
 const cache=new AvatarImageCache();let calls=0;
 const load=async()=>{calls++;await new Promise(r=>setTimeout(r,5));return {bytes:new ArrayBuffer(10),contentType:"image/png"};};
 await Promise.all(Array.from({length:200},()=>cache.get("source-a",load)));expect(calls).toBe(1);
 await cache.get("source-b",load);expect(calls).toBe(2);
});
it("retries failed images and enforces its memory bound",async()=>{
 const cache=new AvatarImageCache(10);let calls=0;const load=async()=>{calls++;return {bytes:new ArrayBuffer(10),contentType:"image/png"};};
 await expect(cache.get("bad",async()=>{throw Error("offline");})).rejects.toThrow("offline");await cache.get("bad",load);await cache.get("b",load);await cache.get("bad",load);expect(calls).toBe(3);
});
