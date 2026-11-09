import 'server-only';
import {createHash,createHmac} from 'node:crypto';
import type {SupabaseClient} from '@supabase/supabase-js';
import {createServiceClient} from '@/lib/supabase/service';
import {decryptCredentialValue} from '@/lib/security/credentials-crypto';
import {coexistenceCallback,ownBusinessPhone} from './coexistence-policy';
import {partitionCoexistenceEvents} from './coexistence-partition';
import type {CoexistenceConnection} from './coexistence';
import {inngest} from '@/lib/inngest/client';

export const coexistenceEvent='connectyhub/meta-coexistence.deliver';
const table='connectyhub_meta_coexistence_events';
export async function routeCoexistenceEvents(payload:unknown,client:SupabaseClient=createServiceClient()){
 const loaded=await client.from('connectyhub_meta_coexistence').select('*').not('waba_id','is',null).returns<CoexistenceConnection[]>();
 if(loaded.error)throw Error('Coexistence routing unavailable.');
 const parts=partitionCoexistenceEvents(payload,loaded.data||[]);
 for(const item of parts.relays){
  const hash=createHash('sha256').update(JSON.stringify(item.payload)).digest('hex');
  const saved=await client.from(table).upsert({connection_id:item.connectionId,event_hash:hash,payload:item.payload},{onConflict:'connection_id,event_hash',ignoreDuplicates:true});
  if(saved.error)throw Error('Coexistence event could not be archived.');
  const row=await client.from(table).select('id,delivered_at').eq('connection_id',item.connectionId).eq('event_hash',hash).single();
  if(row.error)throw Error('Coexistence receipt unavailable.');
  if(!row.data.delivered_at)await inngest.send({name:coexistenceEvent,data:{receiptId:row.data.id}});
 }
 return parts.ordinary;
}
export async function deliverCoexistenceEvent(id:string,client:SupabaseClient=createServiceClient()){
 const event=await client.from(table).select('*').eq('id',id).maybeSingle();
 if(event.error)throw Error('Receipt unavailable.');
 if(!event.data||event.data.delivered_at)return {skipped:true};
 const binding=await client.from('connectyhub_meta_coexistence').select('*').eq('id',event.data.connection_id).single<CoexistenceConnection>();
 if(binding.error||!binding.data)throw Error('Binding unavailable.');
 const connection=binding.data;
 const [owner,instance,endpoints]=await Promise.all([
  client.from('connectyhub_api_clients').select('organization_id,status,metadata').eq('id',connection.client_id).single(),
  client.from('whatsapp_instances').select('organization_id,connectyhub_api_client_id,connectyhub_api_instance_id,phone_number,status').eq('id',connection.instance_id).single(),
  client.from('connectyhub_webhook_endpoints').select('url').eq('client_id',connection.client_id).eq('status','active')
 ]);
 if(owner.error||instance.error||endpoints.error||owner.data.status!=='active'||owner.data.metadata?.meta_coexistence_enabled!==true||!owner.data.metadata?.meta_coexistence_instances?.includes(connection.public_instance_id)||owner.data.organization_id!==connection.organization_id||instance.data.organization_id!==connection.organization_id||instance.data.connectyhub_api_client_id!==connection.client_id||instance.data.connectyhub_api_instance_id!==connection.public_instance_id||instance.data.status==='archived'||ownBusinessPhone(instance.data.phone_number)!==ownBusinessPhone(connection.owner_phone)||connection.state!=='linked')throw Error('Delivery binding is not active.');
 const url=coexistenceCallback(connection.callback_url,owner.data.metadata.meta_coexistence_callback_origin,(endpoints.data||[]).map(row=>row.url));
 const raw=JSON.stringify(event.data.payload),signature=createHmac('sha256',decryptCredentialValue(connection.callback_secret_encrypted)).update(raw).digest('hex');
 const attempt=await client.from(table).update({attempts:Number(event.data.attempts)+1}).eq('id',id);
 if(attempt.error)throw Error('Could not record delivery attempt.');
 let response:Response;
 try{response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','x-hub-signature-256':`sha256=${signature}`,'x-connectyhub-coexistence-receipt':id},body:raw,redirect:'error',signal:AbortSignal.timeout(20000)});}
 catch{await client.from(table).update({last_error:'Destination unavailable'}).eq('id',id);throw Error('Coexistence destination unavailable.');}
 if(!response.ok){await client.from(table).update({last_error:`HTTP ${response.status}`}).eq('id',id);throw Error('Coexistence delivery not acknowledged.');}
 await response.body?.cancel();
 const saved=await client.from(table).update({delivered_at:new Date().toISOString(),last_error:null}).eq('id',id);
 if(saved.error)throw Error('Could not acknowledge receipt.');
 return {delivered:true};
}
export async function recoverCoexistenceEvents(client:SupabaseClient=createServiceClient()){
 const pending=await client.from(table).select('id').is('delivered_at',null).lt('received_at',new Date(Date.now()-120000).toISOString()).order('received_at').limit(100);
 if(pending.error)throw Error('Could not load pending receipts.');
 if(pending.data?.length)await inngest.send(pending.data.map(row=>({name:coexistenceEvent,data:{receiptId:row.id}})));
 // Provider receipts are temporary transport copies, not a second customer archive.
 const cleaned=await client.from(table).delete().not('delivered_at','is',null).lt('delivered_at',new Date(Date.now()-7*86400000).toISOString());
 if(cleaned.error)throw Error('Could not clean delivered receipts.');
 return {queued:pending.data?.length||0};
}
