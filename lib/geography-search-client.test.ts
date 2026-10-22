import { afterEach, beforeEach, expect, it, vi } from "vitest";
const fetchMock=vi.fn();
beforeEach(()=>{vi.resetModules();vi.stubGlobal("fetch",fetchMock);fetchMock.mockReset();});
afterEach(()=>vi.unstubAllGlobals());
it("shares equivalent pending queries and reuses their public suggestions across screens",async()=>{
 const api=await import("./geography-search-client");let resolve!:(value:unknown)=>void;
 fetchMock.mockReturnValue(new Promise(r=>{resolve=r;}));
 const a=api.fetchGeographySearch("IRAN_CITY","شيراز"), b=api.fetchGeographySearch("IRAN_CITY","شیراز");
 expect(fetchMock).toHaveBeenCalledTimes(1);
 resolve({ok:true,json:async()=>({items:[{id:"city",name:"شیراز"}]})});
 expect(await a).toEqual(await b);
 expect(api.cachedGeographySearch("IRAN_CITY","  شیراز ")).toEqual([{id:"city",name:"شیراز"}]);
 await api.fetchGeographySearch("IRAN_CITY","شیراز");expect(fetchMock).toHaveBeenCalledTimes(1);
 expect(api.cachedGeographySearch("COUNTRY","شیراز")).toBeUndefined();
});
it("allows retry after network failure and does not cache the failure",async()=>{
 const api=await import("./geography-search-client");fetchMock.mockResolvedValueOnce({ok:false});
 await expect(api.fetchGeographySearch("IRAN_CITY","تهران")).rejects.toThrow();
 fetchMock.mockResolvedValueOnce({ok:true,json:async()=>({items:[]})});
 await expect(api.fetchGeographySearch("IRAN_CITY","تهران")).resolves.toEqual([]);expect(fetchMock).toHaveBeenCalledTimes(2);
});
it("does not let a caller mutate another screen's cached list",async()=>{
 const api=await import("./geography-search-client");fetchMock.mockResolvedValue({ok:true,json:async()=>({items:[{id:"city",name:"تهران"}]})});
 const result=await api.fetchGeographySearch("IRAN_CITY","تهران");result.splice(0);
 expect(await api.fetchGeographySearch("IRAN_CITY","تهران")).toHaveLength(1);
});
