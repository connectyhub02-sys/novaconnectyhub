import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const m=vi.hoisted(()=>({access:vi.fn(),history:vi.fn(),run:vi.fn()}));
vi.mock("@/lib/meta/organic-access",()=>({metaOrganicAccess:m.access,OrganicAccessError:class extends Error {constructor(message:string,public status:number){super(message);}}}));
vi.mock("@/lib/meta/creative-studio",()=>({creativeHistory:m.history,runCreativeJob:m.run}));
import { GET, POST } from "../src/app/api/dashboard/meta-creative/route";
import { OrganicAccessError } from "../src/lib/meta/organic-access";
const url="https://www.connectyhub.com.br/api/dashboard/meta-creative";
const body={requestId:"11111111-1111-4111-8111-111111111111",mode:"campaign",prompt:"CBO com três anúncios"};
const request=(b:unknown=body,origin="https://www.connectyhub.com.br")=>new Request(url,{method:"POST",headers:{origin,"Content-Type":"application/json"},body:JSON.stringify(b)});
beforeEach(()=>{vi.clearAllMocks();m.access.mockResolvedValue({client:{},organizationId:"owned",workspace:{user:{id:"u"},profile:{isPlatformAdmin:false}},company:{role:"owner",planCode:"scale",status:"active"}});m.run.mockResolvedValue([]);m.history.mockResolvedValue([]);});
describe("creative endpoint authorization",()=>{
  it("does not read or generate without session",async()=>{m.access.mockRejectedValue(new OrganicAccessError("Sessão",401));expect((await GET(new Request(url))).status).toBe(401);expect(m.history).not.toHaveBeenCalled();});
  it("rejects cross-origin generation",async()=>{expect((await POST(request(body,"https://other.test"))).status).toBe(403);expect(m.run).not.toHaveBeenCalled();});
  it("does not trust company IDs from payload",async()=>{expect((await POST(request({...body,companyId:"victim"}))).status).toBe(200);expect(m.run.mock.calls[0][1]).toBe("owned");});
  it("requires a manager role",async()=>{const a=await m.access();a.company.role="member";expect((await POST(request())).status).toBe(403);expect(m.run).not.toHaveBeenCalled();});
  it("does not send invalid budgets to the model",async()=>{expect((await POST(request({...body,dailyBudget:-100}))).status).toBe(400);expect(m.run).not.toHaveBeenCalled();});
  it("enforces identity keys before generating",async()=>{expect((await POST(request({...body,requestId:"bad"}))).status).toBe(400);expect(m.run).not.toHaveBeenCalled();});
});
