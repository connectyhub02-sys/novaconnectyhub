import {beforeEach,expect,it,vi} from 'vitest';
vi.mock('server-only',()=>({}));
const mocks=vi.hoisted(()=>({workspace:vi.fn(),service:vi.fn()}));
vi.mock('@/lib/supabase/profile',()=>({getCurrentWorkspace:mocks.workspace}));
vi.mock('@/lib/supabase/service',()=>({createServiceClient:mocks.service}));
import {GET as voice} from '../src/app/api/admin/voice/route';
import {GET as projects} from '../src/app/api/admin/ai-projects/route';
const org='11111111-1111-4111-8111-111111111111',project='22222222-2222-4222-8222-222222222222';
function database(failure=false){
 const traces:{table:string;fields:string;filters:unknown[][]}[]=[];
 const rpc=vi.fn(async()=>({data:{requests:3},error:null}));
 const client={rpc,from:(table:string)=>{const trace={table,fields:'',filters:[] as unknown[][]};traces.push(trace);
 const q={select:(fields:string)=>{trace.fields=fields;return q;},order:()=>q,limit:()=>q,gte:(...args:unknown[])=>{trace.filters.push(args);return q;},eq:(...args:unknown[])=>{trace.filters.push(args);return q;},then:(resolve:(v:unknown)=>unknown)=>Promise.resolve({data:[],error:failure?{message:'private database error'}:null}).then(resolve)};return q;}};
 mocks.service.mockReturnValue(client);return {traces,rpc};
}
beforeEach(()=>{vi.clearAllMocks();mocks.workspace.mockResolvedValue({profile:{isPlatformAdmin:true}});});
it('rejects clients and unauthenticated requests before service access',async()=>{
 for(const workspace of [null,{profile:{isPlatformAdmin:false}}]){mocks.workspace.mockResolvedValue(workspace);expect((await voice(new Request('https://local/api/admin/voice'))).status).toBe(403);expect((await projects()).status).toBe(403);}
 expect(mocks.service).not.toHaveBeenCalled();
});
it('filters voice summary and history by project and organization',async()=>{
 const {traces,rpc}=database();const response=await voice(new Request(`https://local/api/admin/voice?project=${project}&organization=${org}&days=7`));
 expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toBe('no-store');
 expect(rpc).toHaveBeenCalledWith('voice_usage_summary',{p_org:org,p_project:project,p_admin:true,p_days:7});
 const history=traces.find(t=>t.table==='voice_generations')!;expect(history.filters).toContainEqual(['project_id',project]);expect(history.filters).toContainEqual(['organization_id',org]);
 expect(history.fields).not.toMatch(/object_path|snapshot|input_hash|text|provider_history/);
});
it('rejects malformed voice filters without querying data',async()=>{const {traces,rpc}=database();expect((await voice(new Request('https://local/api/admin/voice?project=private'))).status).toBe(422);expect(traces).toHaveLength(0);expect(rpc).not.toHaveBeenCalled();});
it('AI project directory selects only public key metadata, never hashes or secrets',async()=>{const {traces}=database();expect((await projects()).status).toBe(200);expect(traces[0].fields).toContain('key_prefix');expect(traces[0].fields).not.toMatch(/key_hash|secret|encrypted|result_snapshot/);});
it('does not present incomplete voice reads as zero usage',async()=>{database(true);const response=await voice(new Request('https://local/api/admin/voice'));expect(response.status).toBe(503);expect(await response.text()).not.toContain('private database error');});
