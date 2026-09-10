import 'server-only';
import {lookup} from 'node:dns/promises';
import {isIP} from 'node:net';
import {request as httpsRequest} from 'node:https';
import {createHmac} from 'node:crypto';

export function publicWebhookUrl(value: unknown) {
  const url=new URL(String(value));
  if(url.protocol!=='https:'||url.username||url.password||url.hash||(url.port&&url.port!=='443')||!url.hostname.includes('.')||isIP(url.hostname)||url.hostname.includes(':'))throw new Error('Use uma URL HTTPS pública, sem credenciais e na porta padrão.');
  return url;
}
export function publicWebhookIpv4(address:string) {
  if(isIP(address)!==4)return false;
  const [a,b]=address.split('.').map(Number);
  return !([0,10,127].includes(a)||a>=224||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&[0,168].includes(b))||(a===198&&[18,19,51].includes(b))||(a===203&&b===0)||(a===100&&b>=64&&b<=127));
}
export const signAiWebhook=(secret:string,id:string,timestamp:string,body:string)=>createHmac('sha256',secret).update(`${id}.${timestamp}.${body}`).digest('hex');

export async function deliverAiWebhook(target:string,secret:string,id:string,payload:unknown):Promise<number> {
  const url=publicWebhookUrl(target);
  // Pin the validated DNS result to the socket. Never follow redirects or attach API credentials.
  const addresses=await lookup(url.hostname,{all:true,family:4});
  if(!addresses.length||addresses.some(item=>!publicWebhookIpv4(item.address)))throw new Error('Destino indisponível.');
  const body=JSON.stringify(payload),timestamp=String(Math.floor(Date.now()/1000));
  return new Promise((resolve,reject)=>{
    const req=httpsRequest(url,{method:'POST',agent:false,lookup:(_name,_options,callback)=>callback(null,addresses[0].address,4),headers:{
      'Content-Type':'application/json','Content-Length':Buffer.byteLength(body),'User-Agent':'ConnectyHub-Webhooks/1.0',
      'X-ConnectyHub-Event-Id':id,'X-ConnectyHub-Timestamp':timestamp,'X-ConnectyHub-Signature':`v1=${signAiWebhook(secret,id,timestamp,body)}`,
    }},res=>{const status=res.statusCode??0;res.destroy();resolve(status);});
    const deadline=setTimeout(()=>req.destroy(new Error('Webhook indisponível.')),10000);
    req.once('close',()=>clearTimeout(deadline));req.once('error',reject);req.end(body);
  });
}
