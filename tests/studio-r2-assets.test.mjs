import {it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {createR2AssetStore} from '../services/ai-relay/r2-assets.mjs';

it('uses private immutable keys and never forwards a customer filename',async()=>{
 const commands=[],id=randomUUID();
 const store=createR2AssetStore({bucket:'private',client:{async send(c){commands.push(c.input);return {};}}});
 await store.writeExclusive(id,Buffer.from('abc'),'audio/wav');
 expect(commands[0]).toMatchObject({Bucket:'private',Key:`studio-relay/assets/${id}.audio`,IfNoneMatch:'*',CacheControl:'private, no-store'});
 await expect(store.read('../other-account')).rejects.toThrow('Invalid asset id');expect(commands).toHaveLength(1);
});
it('distinguishes absent objects from forbidden access or an outage',async()=>{
 for(const status of [403,404,503]){
  const store=createR2AssetStore({bucket:'private',client:{async send(){throw {$metadata:{httpStatusCode:status}};}}});
  if(status===404)expect(await store.exists(randomUUID())).toBe(false);
  else await expect(store.exists(randomUUID())).rejects.toThrow('storage unavailable');
 }
});
it('requires explicit R2 credentials in production',()=>{
 expect(()=>createR2AssetStore({bucket:'private'})).toThrow('configuration is required');
});
