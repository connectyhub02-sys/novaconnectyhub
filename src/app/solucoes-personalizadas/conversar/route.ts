import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/service";
export const dynamic="force-dynamic";
export async function GET(request:Request){
  const client=createServiceClient();const url=new URL(request.url);
  const settings=await client.from("platform_billing_settings").select("billing_whatsapp_agent_id,metadata").eq("setting_key","default").maybeSingle();
  const agent=settings.data?.metadata?.custom_software_agent_id??settings.data?.billing_whatsapp_agent_id;
  const instance=agent?await client.from("whatsapp_instances").select("phone_number").contains("metadata",{agent_id:agent,admin_whatsapp:true,platform_whatsapp:true}).order("updated_at",{ascending:false}).limit(1).maybeSingle():null;
  const phone=String(instance?.data?.phone_number??process.env.CONNECTYHUB_COMMERCIAL_WHATSAPP??"554788556936").replace(/\D/g,"");
  if(!/^[1-9][0-9]{9,14}$/.test(phone))return NextResponse.redirect(new URL("/solucoes-personalizadas#perguntas",url));
  const id=randomUUID();const campaign:Record<string,string>={source_page:"/solucoes-personalizadas"};
  for(const key of ["utm_source","utm_medium","utm_campaign","utm_content"]) {const value=url.searchParams.get(key);if(value)campaign[key]=value.slice(0,150);}
  const saved=await client.from("custom_software_visits").insert({id,campaign});
  const text=`Olá! Vim da página de soluções personalizadas da ConnectyHub. Quero agendar uma reunião sobre um software para minha empresa.${saved.error?"":` [CHS:${id}]`}`;
  const response=NextResponse.redirect(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`,302);
  response.headers.set("Cache-Control","no-store");response.headers.set("X-Robots-Tag","noindex, nofollow");return response;
}
