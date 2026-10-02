import 'server-only';
import {createHmac,randomBytes} from 'node:crypto';
import {lookup} from 'node:dns/promises';
import {isIP} from 'node:net';
import type {SupabaseClient} from '@supabase/supabase-js';
import {decryptCredentialValue,encryptCredentialValue} from '@/lib/security/credentials-crypto';
import {VoiceError} from './contract';

// Project webhooks for asynchronous Voice operations (e-books, dubbing, transcription...).
// Each finished operation is delivered once per event, signed with the project's secret:
//   ConnectyHub-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<body>">
// Only public HTTPS endpoints are called; internal network addresses are refused.

export const webhookEvents={completed:'voice.operation.completed',failed:'voice.operation.failed'} as const;
const maxAttempts=5;

export function createWebhookSecret(){
 const secret=`whsec_${randomBytes(32).toString('hex')}`;
 return {secret,ciphertext:encryptCredentialValue(secret)};
}

export function signWebhook(secret:string,body:string,timestamp:number){
 return `t=${timestamp},v1=${createHmac('sha256',secret).update(`${timestamp}.${body}`).digest('hex')}`;
}

const privateV4=[/^10\./,/^127\./,/^169\.254\./,/^172\.(1[6-9]|2\d|3[01])\./,/^192\.168\./,/^0\./,/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./];
export function isPrivateAddress(address:string):boolean{
 if(isIP(address)===4)return privateV4.some(range=>range.test(address));
 const v6=address.toLowerCase();
 return v6==='::1'||v6==='::'||v6.startsWith('fc')||v6.startsWith('fd')||v6.startsWith('fe80')||v6.startsWith('::ffff:')&&isPrivateAddress(v6.slice(7));
}

/** Validates the URL format and that it resolves only to public addresses. */
export async function assertPublicWebhookUrl(raw:unknown){
 let url:URL;
 try{url=new URL(String(raw));}catch{throw new VoiceError('invalid_webhook',422,'Informe uma URL https válida.');}
 if(url.protocol!=='https:'||url.username||url.password||String(raw).length>500)throw new VoiceError('invalid_webhook',422,'O webhook precisa ser uma URL https pública, sem usuário e senha.');
 const host=url.hostname.replace(/^\[|\]$/g,'');
 if(host==='localhost'||host.endsWith('.local')||host.endsWith('.internal'))throw new VoiceError('invalid_webhook',422,'Endereços internos não são permitidos.');
 const addresses=isIP(host)?[{address:host}]:await lookup(host,{all:true}).catch(()=>[]);
 if(!addresses.length||addresses.some(item=>isPrivateAddress(item.address)))throw new VoiceError('invalid_webhook',422,'O endereço do webhook não é público ou não foi encontrado.');
 return url.toString();
}

type Pending={generation_id:string;project_id:string;status:string;operation:string;model_id:string;charged_credits:number;reserved_credits:number;quoted_credits:number;error_code:string|null;created_at:string;updated_at:string;webhook_url:string;webhook_secret_ciphertext:string;delivery_status:string|null;attempts:number|null};

export function webhookPayload(item:Pending,deliveryId:string){
 return {id:deliveryId,type:item.status==='completed'?webhookEvents.completed:webhookEvents.failed,created_at:new Date().toISOString(),
  data:{id:item.generation_id,project_id:item.project_id,operation:item.operation,model_id:item.model_id,status:item.status,
   usage:{credits:Number(item.charged_credits),reserved_credits:Number(item.reserved_credits),quoted_credits:Number(item.quoted_credits)},
   result:item.status==='completed'?{path:`/api/v1/voice/operations/${item.generation_id}/result`}:null,error:item.error_code?{code:item.error_code}:null}};
}

/** Cron (Inngest): finds finished operations of projects with a webhook and delivers them. */
export async function dispatchVoiceWebhooks(client:SupabaseClient,now=Date.now()){
 const {data,error}=await client.rpc('voice_webhook_pending',{p_limit:20,p_max_attempts:maxAttempts});
 if(error)throw new Error('Webhook queue unavailable');
 const results=[];
 for(const item of (data??[]) as Pending[]){
  const event=item.status==='completed'?webhookEvents.completed:webhookEvents.failed;
  const {data:delivery,error:claimError}=await client.from('voice_webhook_deliveries').upsert({generation_id:item.generation_id,project_id:item.project_id,event_type:event},{onConflict:'generation_id,event_type',ignoreDuplicates:false}).select('id,attempts').single<{id:string;attempts:number}>();
  if(claimError||!delivery){results.push({id:item.generation_id,status:'claim_failed'});continue;}
  let status=0;
  try{
   const url=await assertPublicWebhookUrl(item.webhook_url);
   const body=JSON.stringify(webhookPayload(item,delivery.id)),timestamp=Math.floor(now/1000);
   const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','ConnectyHub-Signature':signWebhook(decryptCredentialValue(item.webhook_secret_ciphertext),body,timestamp),'User-Agent':'ConnectyHub-Webhooks/1.0'},
    body,redirect:'error',signal:AbortSignal.timeout(10_000),cache:'no-store'});
   status=response.status;await response.body?.cancel();
  }catch{status=0;}
  const ok=status>=200&&status<300;
  await client.from('voice_webhook_deliveries').update({status:ok?'delivered':'failed',attempts:(delivery.attempts??0)+1,response_status:status||null,last_attempt_at:new Date(now).toISOString(),...(ok?{delivered_at:new Date(now).toISOString()}:{})}).eq('id',delivery.id);
  results.push({id:item.generation_id,status:ok?'delivered':'failed',response_status:status});
 }
 return {processed:results.length,results};
}
