import { beforeEach, expect, it, vi } from "vitest";
const m=vi.hoisted(()=>({user:vi.fn(),find:vi.fn(),totals:vi.fn(),recent:vi.fn()}));
vi.mock("@/lib/auth",()=>({currentUserId:m.user}));vi.mock("@/lib/prisma",()=>({prisma:{user:{findUnique:m.find},$queryRaw:m.totals,gameSession:{findMany:m.recent}}}));
import { GET } from "./route";
beforeEach(()=>{vi.clearAllMocks();m.user.mockReturnValue("owner");m.find.mockResolvedValue({id:"owner"});m.recent.mockResolvedValue([]);});
it("requires authentication",async()=>{m.user.mockReturnValue(null);expect((await GET()).status).toBe(401);expect(m.totals).not.toHaveBeenCalled();});
it("preserves empty profile statistics and scopes all reads to the session",async()=>{
 m.totals.mockResolvedValue([{total:0,wins:0,surrendered:0,average:null,best:null,duelWins:0,duelLosses:0,duelDraws:0}]);expect(await (await GET()).json()).toMatchObject({stats:{total:0,wins:0,averageGuesses:0,bestGame:0},letterDuelStats:{total:0},user:{id:"owner"}});expect(m.totals.mock.calls[0]).toContain("owner");
});
it("preserves rounded skill statistics and separates duel rounds",async()=>{
 m.totals.mockResolvedValue([{total:8,wins:5,surrendered:3,average:4.26,best:2,duelWins:10,duelLosses:4,duelDraws:2}]);expect(await (await GET()).json()).toMatchObject({stats:{total:8,wins:5,surrendered:3,averageGuesses:4.3,bestGame:2},letterDuelStats:{total:16,wins:10,losses:4,draws:2}});
});
