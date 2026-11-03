import { expect, it, vi } from 'vitest';
import { serverModuleHarness } from './helpers/server-module-harness';

it('revalidates stale connections and still runs retention after provider failure without exposing identities',async()=>{
 const check=vi.fn().mockResolvedValueOnce({}).mockRejectedValueOnce(Error('provider secret'));
 const query={select:vi.fn().mockReturnThis(),eq:vi.fn().mockReturnThis(),lt:vi.fn().mockReturnThis(),order:vi.fn().mockReturnThis(),limit:vi.fn().mockResolvedValue({data:[{organization_id:'tenant-a',provider:'youtube'},{organization_id:'tenant-b',provider:'tiktok'}],error:null})};
 const client={from:vi.fn(()=>query),rpc:vi.fn().mockResolvedValue({data:{connectionsRemoved:1,deliveriesCleared:2},error:null})};
 const mod=serverModuleHarness<typeof import('../src/lib/social/maintenance')>('src/lib/social/maintenance.ts',{'./connections':{changeSocialConnection:check}});
 const result=await mod.maintainSocialConnections(client as never);
 expect(check.mock.calls.map(c=>c.slice(1))).toEqual([['tenant-a','youtube','check'],['tenant-b','tiktok','check']]);
 expect(client.rpc).toHaveBeenCalledWith('expire_social_api_data');
 expect(result).toEqual({verified:1,reconnect:1,cleanup:{connectionsRemoved:1,deliveriesCleared:2}});
 expect(JSON.stringify(result)).not.toMatch(/tenant|secret/);
});
