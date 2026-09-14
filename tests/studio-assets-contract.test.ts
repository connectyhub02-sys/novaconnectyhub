import {it,expect,vi} from 'vitest';
import type {SupabaseClient} from '@supabase/supabase-js';
import type {VoiceAuth} from '../src/lib/voice-api/auth';
vi.mock('server-only',()=>({}));
vi.mock('@/lib/supabase/service',()=>({createServiceClient:vi.fn()}));
import {studioAssetMetadata,ownedStudioAsset,studioAssetTicket,deleteStudioAsset,publicStudioAsset} from '../src/lib/voice-api/assets';
const row={id:'11111111-1111-4111-8111-111111111111',project_id:'a',organization_id:'org-a',billing_organization_id:'org-a',key_id:'key',display_name:'Input',size_bytes:300,mime_type:'audio/wav',status:'ready',duration_seconds:1.125,ticket_expires_at:null,sha256:'secret-hash',created_at:'2026-09-14'};
function auth(project='a',org='org-a'):VoiceAuth{
 const client={from:()=>{let rows=[row];const q={select:()=>q,eq:(key:keyof typeof row,value:unknown)=>{rows=rows.filter(r=>r[key]===value);return q;},maybeSingle:async()=>({data:rows[0]??null,error:null})};return q;}} as unknown as SupabaseClient;
 return {client,project:{id:project,organization_id:org,name:'Test',status:'active',monthly_credit_limit:null},keyId:'key',planCode:'free',billingOrg:org,studio:false};
}
it('accepts bounded audio metadata, not client duration, URLs, hashes or an unbounded body',()=>{
 expect(studioAssetMetadata({name:'Test',size_bytes:20_000_000,mime_type:'audio/mpeg'})).toMatchObject({size_bytes:20_000_000});
 for(const extra of [{duration_seconds:1},{url:'https://example.com/a'},{sha256:'fake'}])expect(()=>studioAssetMetadata({name:'Test',size_bytes:30,mime_type:'audio/wav',...extra})).toThrow();
 for(const size of [0,-1,20_000_001,NaN,Infinity,1.1])expect(()=>studioAssetMetadata({name:'Test',size_bytes:size,mime_type:'audio/wav'})).toThrow();
 expect(()=>studioAssetMetadata({name:'Test',size_bytes:30,mime_type:'video/mp4'})).toThrow();
});
it('isolates asset detail, downloads and deletion by both project and organization',async()=>{
 vi.stubGlobal('fetch',vi.fn());
 for(const a of [auth('b','org-a'),auth('a','org-b'),auth('b','org-b')]){
  await expect(ownedStudioAsset(a,row.id)).rejects.toMatchObject({status:404});
  await expect(studioAssetTicket(a,row.id,'download')).rejects.toMatchObject({status:404});
  await expect(deleteStudioAsset(a,row.id)).rejects.toMatchObject({status:404});
 }
 expect(fetch).not.toHaveBeenCalled();vi.unstubAllGlobals();
});
it('returns useful metadata without storage paths, hashes, keys or tickets',async()=>{
 const result=publicStudioAsset(await ownedStudioAsset(auth(),row.id));
 expect(result).toMatchObject({name:'Input',duration_seconds:1.125,status:'ready'});
 expect(result).not.toHaveProperty('sha256');expect(result).not.toHaveProperty('key_id');expect(result).not.toHaveProperty('ticket_hash');
});
