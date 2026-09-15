import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({createClient:vi.fn()}));
vi.mock('server-only',()=>({}));vi.mock('@/lib/supabase/server',()=>({createClient:mocks.createClient}));
import {managedSession,readBody,requireInfrastructure} from '../src/lib/managed-projects/server';
describe('production session entrypoint, without pilot adapters',()=>{
 beforeEach(()=>{vi.clearAllMocks();vi.stubEnv('MANAGED_PROJECTS_ENABLED','true');});afterEach(()=>vi.unstubAllEnvs());
 it('fails closed before opening a database when the feature is disabled',async()=>{vi.stubEnv('MANAGED_PROJECTS_ENABLED','false');await expect(managedSession()).rejects.toMatchObject({status:404});expect(mocks.createClient).not.toHaveBeenCalled();});
 it('requires a verified existing session',async()=>{mocks.createClient.mockResolvedValue({auth:{getUser:async()=>({data:{user:null},error:null})}});await expect(managedSession()).rejects.toMatchObject({status:401});});
 it('does not infer infrastructure privileges from product profiles',async()=>{const rpc=vi.fn().mockResolvedValue({data:false,error:null});mocks.createClient.mockResolvedValue({auth:{getUser:async()=>({data:{user:{id:'existing-user'}},error:null})},rpc});const session=await managedSession();expect(session.admin).toBe(false);expect(rpc).toHaveBeenCalledWith('is_infrastructure_admin');expect(()=>requireInfrastructure(session.admin)).toThrow();});
 it('does not silently activate an unprepared database',async()=>{mocks.createClient.mockResolvedValue({auth:{getUser:async()=>({data:{user:{id:'u'}},error:null})},rpc:async()=>({error:'migration missing',data:null})});await expect(managedSession()).rejects.toMatchObject({status:503});});
 it('rejects cross-origin mutations and oversized streaming bodies',async()=>{await expect(readBody(new Request('https://app.invalid/api',{method:'POST',headers:{origin:'https://other.invalid'},body:'{}'}))).rejects.toMatchObject({status:403});await expect(readBody(new Request('https://app.invalid/api',{method:'POST',body:'x'.repeat(101)}),100)).rejects.toMatchObject({status:413});});
 it('rejects invalid JSON and non-object bodies',async()=>{for(const body of ['null','[]','{'])await expect(readBody(new Request('https://app.invalid/api',{method:'POST',body}))).rejects.toMatchObject({status:400});});
});
