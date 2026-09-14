import type {SupabaseClient} from '@supabase/supabase-js';
export class OutboundLinkError extends Error {constructor(public status:number,message:string){super(message);}}
export const outboundLinkHeaders={'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow'};
export const validOutboundLinkId=(id:string)=>/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(id);
export function outboundLinkPreview(request:Request){return /bot|crawler|spider|facebookexternalhit|whatsapp|preview/i.test(request.headers.get('user-agent')??'')||/prefetch|preview/i.test(`${request.headers.get('purpose')??''} ${request.headers.get('sec-purpose')??''}`);}
function safeDestination(value:unknown){
 if(typeof value!=='string')throw new OutboundLinkError(503,'Destino indisponível.');
 let url:URL;try{url=new URL(value);}catch{throw new OutboundLinkError(503,'Destino indisponível.');}
 if(!['http:','https:'].includes(url.protocol)||url.username||url.password||/^\/w\/[a-f0-9-]{36}\/?$/i.test(url.pathname))throw new OutboundLinkError(503,'Destino indisponível.');
 return value;
}
export async function resolveOwnedOutboundLink(client:SupabaseClient,organizationId:string,id:string,count:boolean){
 if(!validOutboundLinkId(id))throw new OutboundLinkError(404,'Link não encontrado.');
 // Link ownership/target are immutable in the application. Never call the click
 // RPC for an unowned ID, even with a valid platform gateway credential.
 const result=await client.from('whatsapp_outbound_links').select('target_url').eq('id',id).eq('organization_id',organizationId).maybeSingle();
 if(result.error)throw new OutboundLinkError(503,'Não foi possível consultar o link.');
 if(!result.data)throw new OutboundLinkError(404,'Link não encontrado.');
 const destination=safeDestination(result.data.target_url);
 if(count){const clicked=await client.rpc('record_whatsapp_outbound_click',{p_link:id});if(clicked.error||clicked.data!==destination)throw new OutboundLinkError(503,'Não foi possível registrar a abertura.');}
 return destination;
}
