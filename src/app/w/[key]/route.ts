import { createServiceClient } from "@/lib/supabase/service";
export const dynamic="force-dynamic";
type Context={params:Promise<{key:string}>};
const headers={"Cache-Control":"private, no-store","Referrer-Policy":"no-referrer","X-Robots-Tag":"noindex, nofollow"};
const valid=(key:string)=>/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(key);
async function redirect(request:Request,context:Context,count:boolean){
  const {key}=await context.params;
  if(!valid(key))return new Response("Link não encontrado.",{status:404,headers});
  try{
    const client=createServiceClient();
    const preview=/bot|crawler|spider|facebookexternalhit|whatsapp|preview/i.test(request.headers.get("user-agent")??"") || /prefetch|preview/i.test(request.headers.get("purpose")??request.headers.get("sec-purpose")??"");
    let destination:string|null;
    if(count&&!preview){const r=await client.rpc("record_whatsapp_outbound_click",{p_link:key});if(r.error)throw r.error;destination=r.data;}
    else{const r=await client.from("whatsapp_outbound_links").select("target_url").eq("id",key).maybeSingle();if(r.error)throw r.error;destination=r.data?.target_url??null;}
    if(!destination)return new Response("Link não encontrado.",{status:404,headers});
    const url=new URL(destination);
    if(!["http:","https:"].includes(url.protocol)||url.username||url.password)throw new Error("Invalid destination");
    return new Response(null,{status:302,headers:{...headers,Location:destination}});
  }catch{return new Response("Não foi possível abrir este link. Tente novamente.",{status:503,headers});}
}
export const GET=(request:Request,context:Context)=>redirect(request,context,true);
export const HEAD=(request:Request,context:Context)=>redirect(request,context,false);
