import { ResultCache } from "./result-cache";
// Cache only the public count. Heartbeats and invitation eligibility stay live.
export const onlineCountCache = new ResultCache(1);
