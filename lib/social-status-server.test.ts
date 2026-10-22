import { afterEach, expect, it, vi } from "vitest";
import {createHmac} from "node:crypto";
import type { Server } from "node:http";
const policy=vi.hoisted(()=>({blocked:vi.fn().mockReturnValue(false)}));
vi.mock("./account-suspensions",()=>({isAccountSuspended:policy.blocked}));
import {createSocialStatusServer} from "./social-status-server";
const servers:Server[]=[];
const sign=(id:string)=>id+'.'+createHmac('sha256','test-key').update(id).digest('hex');
async function start(read=vi.fn(async(id:string)=>({owner:id}))){const server=createSocialStatusServer('test-key','/anti-ai',read);servers.push(server);await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const address=server.address() as {port:number};return {url:`http://127.0.0.1:${address.port}/anti-ai/api/social`,read};}
afterEach(async()=>{policy.blocked.mockReturnValue(false);await Promise.all(servers.splice(0).map(s=>new Promise<void>(r=>{s.close(()=>r());s.closeIdleConnections();})));});
it("requires valid signed credentials and never falls back from an invalid bearer to cookies",async()=>{
 const {url,read}=await start();expect((await fetch(url)).status).toBe(401);expect((await fetch(url,{headers:{Authorization:'Bearer invalid',Cookie:'anti_ai_user_id='+sign('owner')}})).status).toBe(401);expect(read).not.toHaveBeenCalled();
});
it("uses only the authenticated account, with both bearer and cookie sessions",async()=>{
 const {url}=await start();const r=await fetch(url+'?userId=other',{headers:{Authorization:'Bearer '+sign('owner')}});expect(r.status).toBe(200);expect(r.headers.get('cache-control')).toBe('no-store');expect(await r.json()).toEqual({owner:'owner'});expect(await(await fetch(url,{headers:{Cookie:'anti_ai_user_id='+sign('cookie-owner')}})).json()).toEqual({owner:'cookie-owner'});
});
it("honors suspensions and restricts the route and method",async()=>{
 const {url,read}=await start();policy.blocked.mockReturnValue(true);expect((await fetch(url,{headers:{Authorization:'Bearer '+sign('blocked')}})).status).toBe(401);expect((await fetch(url+'/wrong')).status).toBe(404);expect((await fetch(url,{method:'POST'})).status).toBe(405);expect(read).not.toHaveBeenCalled();
});
it("returns a recoverable error without exposing internals",async()=>{
 const {url}=await start(vi.fn(async()=>{throw Error('private detail');}));const r=await fetch(url,{headers:{Authorization:'Bearer '+sign('owner')}});expect(r.status).toBe(503);expect(await r.text()).not.toContain('private detail');
});
