import {getCurrentWorkspace} from '@/lib/supabase/profile';
import {createServiceClient} from '@/lib/supabase/service';
import {voiceJson,voiceFailure,VoiceError} from '@/lib/voice-api/contract';
export const dynamic='force-dynamic';
export async function GET(request:Request){try{
 const w=await getCurrentWorkspace();if(!w?.profile.isPlatformAdmin)throw new VoiceError('forbidden',403,'Acesso exclusivo à administração da plataforma.');
 const client=createServiceClient(),url=new URL(request.url);const days=Math.min(90,Math.max(1,Number(url.searchParams.get('days'))||30));
 const org=url.searchParams.get('organization');if(org&&!/^[a-f0-9-]{36}$/i.test(org))throw new VoiceError('invalid_org',422,'Conta inválida.');
 const {data,error}=await client.rpc('voice_usage_summary',{p_org:org,p_days:days,p_admin:true});if(error)throw new VoiceError('service_unavailable',503,'Não foi possível carregar a operação de Voz.');
 return voiceJson({summary:data});
}catch(e){return voiceFailure(e);}}
