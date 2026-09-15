import {describe,it,expect,vi} from 'vitest';
vi.mock('server-only',()=>({}));
vi.mock('@/lib/supabase/server',()=>({createClient:vi.fn()}));
import {connectedSource} from '../services/managed-portal/lib/connected-source';
import type {SupabaseClient} from '@supabase/supabase-js';
const project='fdf6122a-b883-4d41-968d-71ba1d31d48a';
describe('connected production source authorization',()=>{
 it('rejects a project member before reading administrative source data',async()=>{
  const from=vi.fn();await expect(connectedSource({from} as unknown as SupabaseClient,false,project)).rejects.toMatchObject({status:403});expect(from).not.toHaveBeenCalled();
 });
 it('requires an existing binding, without treating missing data as zero',async()=>{
  const chain={select:vi.fn().mockReturnThis(),eq:vi.fn().mockReturnThis(),maybeSingle:vi.fn().mockResolvedValue({data:null,error:null})};
  const from=vi.fn().mockReturnValue(chain);await expect(connectedSource({from} as unknown as SupabaseClient,true,project)).rejects.toMatchObject({status:404});
 });
 it('preserves failed collection and last timestamp instead of claiming current success',async()=>{
  const source={project_id:project,collection_status:'failed',collected_at:'2026-09-15T10:00:00Z',snapshot:null};
  const chain={select:vi.fn().mockReturnThis(),eq:vi.fn().mockReturnThis(),maybeSingle:vi.fn().mockResolvedValue({data:source,error:null})};
  const result=await connectedSource({from:()=>chain} as unknown as SupabaseClient,true,project);expect(result).toEqual(source);expect(chain.eq).toHaveBeenCalledWith('project_id',project);
 });
});
