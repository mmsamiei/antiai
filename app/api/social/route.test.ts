import { beforeEach, expect, it, vi } from "vitest";
const m=vi.hoisted(()=>({user:vi.fn(),query:vi.fn(),invites:vi.fn(),matching:vi.fn()}));
vi.mock("@/lib/auth",()=>({currentUserId:m.user}));
vi.mock("@/lib/prisma",()=>({prisma:{$queryRaw:m.query}}));
vi.mock("@/lib/duel-invites",()=>({readInvites:m.invites}));
vi.mock("@/lib/country-matchmaking",()=>({readCountryMatch:m.matching}));
import { GET } from "./route";
beforeEach(()=>{vi.clearAllMocks();m.user.mockReturnValue("owner");m.query.mockResolvedValue([{acceptsGameInvites:false}]);});
it("requires authentication",async()=>{m.user.mockReturnValue(null);expect((await GET()).status).toBe(401);expect(m.query).not.toHaveBeenCalled();});
it("returns both empty states for an idle newcomer and preserves their preference",async()=>{
 const r=await GET();expect(r.headers.get("cache-control")).toBe("no-store");expect(await r.json()).toMatchObject({invitations:{acceptsGameInvites:false,invites:[]},matching:{search:null,incoming:null,roomId:null}});expect(m.invites).not.toHaveBeenCalled();expect(m.matching).not.toHaveBeenCalled();expect(m.query.mock.calls[0]).toContain("owner");
});
it("uses authoritative invitation and matchmaking state for users with activity",async()=>{
 m.query.mockResolvedValue([{acceptsGameInvites:true,hasInvitations:true,hasMatching:true}]);m.invites.mockResolvedValue({invites:[{id:"private-invite"}]});m.matching.mockResolvedValue({roomId:"reserved-room"});
 expect(await (await GET()).json()).toMatchObject({invitations:{invites:[{id:"private-invite"}]},matching:{roomId:"reserved-room"}});expect(m.invites).toHaveBeenCalledWith("owner");expect(m.matching).toHaveBeenCalledWith("owner");
});

it("does not run matchmaking queries for a direct-invitation-only player",async()=>{
 m.query.mockResolvedValue([{acceptsGameInvites:true,hasInvitations:true,hasMatching:false}]);m.invites.mockResolvedValue({invites:[{id:"direct"}]});
 expect(await(await GET()).json()).toMatchObject({invitations:{invites:[{id:"direct"}]},matching:{search:null,roomId:null}});expect(m.matching).not.toHaveBeenCalled();
});
