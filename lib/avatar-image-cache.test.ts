import { expect, it, vi } from "vitest";
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
it("keeps server images for thirty minutes while detecting a new source immediately",async()=>{
 vi.useFakeTimers();try{
 const cache=new AvatarImageCache(),load=vi.fn(async()=>({bytes:new ArrayBuffer(10),contentType:"image/png"}));
 await cache.get("photo",load);await vi.advanceTimersByTimeAsync(29*60*1000);await cache.get("photo",load);expect(load).toHaveBeenCalledTimes(1);
 await cache.get("new-photo",load);expect(load).toHaveBeenCalledTimes(2);
 await vi.advanceTimersByTimeAsync(60*1000+1);await cache.get("photo",load);expect(load).toHaveBeenCalledTimes(3);
 }finally{vi.useRealTimers();}
});
