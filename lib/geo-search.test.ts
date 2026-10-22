import { describe, expect, it } from "vitest";
import { datasetFor, normalizePersian, searchItems } from "./geo";
function baseline(type: "COUNTRY" | "IRAN_CITY", raw: string, limit: number) {
  const query = normalizePersian(raw);
  if (!query) return [];
  return datasetFor(type).map(item => {
    const names = [item.name, ...item.aliases].map(normalizePersian);
    return { item, score: names.some(n=>n===query)?0:names.some(n=>n.startsWith(query))?1:names.some(n=>n.includes(query))?2:99 };
  }).filter(x=>x.score<99).sort((a,b)=>a.score-b.score||a.item.name.localeCompare(b.item.name,"fa")).slice(0,limit).map(x=>x.item.id);
}
describe("indexed geographic search",()=>{
  it("preserves exact, prefix, substring, alias and Persian ordering across both datasets",()=>{
    for(const type of ["COUNTRY","IRAN_CITY"] as const) for(const q of ["", "ت", "ش", "تهران", "شيراز", "ك", "سردشت", "آباد", "ایران", "فرانسه", "نام‌ناموجود"]) for(const limit of [1,8,20]) {
      expect(searchItems(type,q,limit).map(x=>x.id)).toEqual(baseline(type,q,limit));
    }
  });
  it("isolates result limits and returns independent arrays from cached results",()=>{
    const expected=searchItems("IRAN_CITY","ش").map(x=>x.id);
    const changed=searchItems("IRAN_CITY","ش");changed.splice(0);
    expect(searchItems("IRAN_CITY","ش").map(x=>x.id)).toEqual(expected);
    expect(searchItems("IRAN_CITY","ش",1)).toHaveLength(1);
    expect(searchItems("IRAN_CITY","ش",0)).toEqual([]);
  });
});
