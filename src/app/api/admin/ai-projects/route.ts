import {getCurrentWorkspace} from '@/lib/supabase/profile';
import {createServiceClient} from '@/lib/supabase/service';
import {voiceJson,voiceFailure,VoiceError} from '@/lib/voice-api/contract';
export const dynamic='force-dynamic';
export async function GET(){try{
 const w=await getCurrentWorkspace();if(!w?.profile.isPlatformAdmin)throw new VoiceError('forbidden',403,'Acesso exclusivo à administração da plataforma.');
 const {data,error}=await createServiceClient().from('ai_projects').select('id,name,status,organization_id,organizations(name),ai_api_keys(id,name,key_prefix,status,model_id)').order('created_at',{ascending:false}).limit(1001);
 if(error)throw new VoiceError('service_unavailable',503,'Não foi possível consultar os projetos.');
 return voiceJson({projects:(data??[]).slice(0,1000),truncated:(data?.length??0)>1000});
}catch(e){return voiceFailure(e);}}
