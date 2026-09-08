import {NextResponse} from "next/server";
import {requirePlatformAdmin} from "@/lib/supabase/admin-auth";
import {createServiceClient} from "@/lib/supabase/service";
export async function GET(){
 const auth=await requirePlatformAdmin();if(auth instanceof NextResponse)return auth;const c=createServiceClient();
 const [slots,requests]=await Promise.all([c.from("custom_software_meeting_slots").select("*").gte("ends_at",new Date(Date.now()-86400000).toISOString()).order("starts_at").limit(200),c.from("custom_software_requests").select("*,leads(name:display_name,phone:phone_number),custom_software_visits(campaign),custom_software_meeting_notices(hours_before,state,error_code)").order("updated_at",{ascending:false}).limit(200)]);
 return NextResponse.json(slots.error||requests.error?{error:"Não foi possível carregar a agenda."}:{slots:slots.data,requests:requests.data},{status:slots.error||requests.error?503:200,headers:{"Cache-Control":"no-store"}});
}
export async function POST(request:Request){
 const auth=await requirePlatformAdmin();if(auth instanceof NextResponse)return auth;
 try{const b=await request.json(),c=createServiceClient();
  if(b.action==="cancel") {const r=await c.rpc("cancel_custom_software_slot",{p_actor:auth.userId,p_slot:b.slotId});if(r.error)throw new Error("Não foi possível cancelar o horário.");return NextResponse.json({ok:true});}
  const start=new Date(String(b.start)),end=new Date(String(b.end));if(!Number.isFinite(+start)||!Number.isFinite(+end)||+start<Date.now()||+end<=+start)throw new Error("Confira as datas do horário.");
  const url=String(b.meetingUrl??"").trim();if(url&&new URL(url).protocol!=="https:")throw new Error("O link da reunião precisa usar HTTPS.");
  const result=await c.rpc("add_custom_software_slot",{p_actor:auth.userId,p_start:start.toISOString(),p_end:end.toISOString(),p_url:url||null});if(result.error)throw new Error("Este horário coincide com outro ou não está disponível.");
  return NextResponse.json({id:result.data});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Dados inválidos."},{status:422});}
}
