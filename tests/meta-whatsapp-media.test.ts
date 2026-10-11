import {describe,it,expect,vi} from 'vitest';
import * as crypto from 'node:crypto';
import {serverModuleHarness} from './helpers/server-module-harness';
describe('official media boundary',()=>{
 function fixture(url='https://lookaside.fbsbx.com/whatsapp_business/file'){
  const fetch=vi.fn(async()=>Response.json({id:'123456789'})),insert=vi.fn(async()=>({error:null}));
  const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:{message_type:'image',content:{image:{id:'123456789'}}},error:null}),insert};
  const client={from:()=>q},connection={organization_id:'org-a',phone_number_id:'123456',encrypted_token:'encrypted'};
  const media=serverModuleHarness<typeof import('../src/lib/meta/whatsapp-media')>('src/lib/meta/whatsapp-media.ts',{'node:crypto':crypto,'@/lib/security/credentials-crypto':{decryptCredentialValue:()=> 'private-token'},'./whatsapp-cloud':{officialSettings:async()=>({graphVersion:'v25.0',appSecret:'private-secret'}),cloudRequest:async()=>({url,file_size:100})}},[],{fetch,FormData,Error});return {media,client,connection,fetch,insert};
 }
 it('uploads with bearer authentication and proof, recording ownership',async()=>{
  const f=fixture();await f.media.uploadOfficialMedia(f.client as never,f.connection as never,new File(['data'],'test.png',{type:'image/png'}));
  const [url,init]=f.fetch.mock.calls[0] as unknown as [URL,RequestInit];expect(url.searchParams.get('appsecret_proof')).toBe(crypto.createHmac('sha256','private-secret').update('private-token').digest('hex'));expect(url.href).not.toContain('private-token');expect(init.headers).toMatchObject({Authorization:'Bearer private-token'});
  expect(f.insert).toHaveBeenCalledWith(expect.objectContaining({organization_id:'org-a',phone_number_id:'123456'}));
 });
 it('rejects unsafe download destinations before fetching with the token',async()=>{
  for(const url of ['http://lookaside.fbsbx.com/file','https://lookaside.fbsbx.com.attacker.test/file','https://attacker.test/file']){const f=fixture(url);await expect(f.media.downloadOfficialMedia(f.client as never,f.connection as never,'message')).rejects.toThrow();expect(f.fetch).not.toHaveBeenCalled();}
 });
});
