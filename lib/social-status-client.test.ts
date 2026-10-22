import { afterEach, expect, it, vi } from "vitest";
import { fetchSocialStatus } from "./social-status-client";
import { setClientSessionToken } from "./client-session";
afterEach(()=>{vi.unstubAllGlobals();setClientSessionToken("");});
it("combines simultaneous hooks without sharing responses across accounts",async()=>{
 const fetchMock=vi.fn().mockResolvedValue({ok:true,json:async()=>({invitations:{invites:[]},matching:{roomId:null}})});vi.stubGlobal("fetch",fetchMock);setClientSessionToken("session-a");
 await Promise.all([fetchSocialStatus("a"),fetchSocialStatus("a")]);expect(fetchMock).toHaveBeenCalledTimes(1);
 setClientSessionToken("session-b");await fetchSocialStatus("b");expect(fetchMock).toHaveBeenCalledTimes(2);
});
it("retries failed polling rather than retaining a rejected promise",async()=>{
 const fetchMock=vi.fn().mockRejectedValueOnce(Error("offline")).mockResolvedValueOnce({ok:true,json:async()=>({})});vi.stubGlobal("fetch",fetchMock);
 await expect(fetchSocialStatus("retry-user")).rejects.toThrow("offline");await fetchSocialStatus("retry-user");expect(fetchMock).toHaveBeenCalledTimes(2);
});
