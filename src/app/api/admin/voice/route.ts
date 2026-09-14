import {getCurrentWorkspace} from '@/lib/supabase/profile';
import {createServiceClient} from '@/lib/supabase/service';
import {voiceJson,voiceFailure,VoiceError} from '@/lib/voice-api/contract';
export const dynamic='force-dynamic';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export async function GET(request:Request){try{
 const w=await getCurrentWorkspace();if(!w?.profile.isPlatformAdmin)throw new VoiceError('forbidden',403,'Acesso exclusivo à administração da plataforma.');
 const client=createServiceClient(),url=new URL(request.url);const days=Math.min(90,Math.max(1,Math.floor(Number(url.searchParams.get('days'))||30)));
 const org=url.searchParams.get('organization'),project=url.searchParams.get('project');
 if((org&&!uuid.test(org))||(project&&!uuid.test(project)))throw new VoiceError('invalid_filter',422,'Conta ou projeto inválido.');
 let projectsQuery=client.from('voice_projects').select('id,name,organization_id,status').order('name').order('id').limit(1001);
 let historyQuery=client.from('voice_generations').select('id,project_id,organization_id,operation,model_id,status,charged_credits,reserved_credits,created_at,error_code').gte('created_at',new Date(Date.now()-days*86400000).toISOString()).order('created_at',{ascending:false}).limit(50);
 if(org){projectsQuery=projectsQuery.eq('organization_id',org);historyQuery=historyQuery.eq('organization_id',org);}
 if(project)historyQuery=historyQuery.eq('project_id',project);
 const [summary,projects,history]=await Promise.all([
  client.rpc('voice_usage_summary',{p_org:org,p_days:days,p_admin:true,p_project:project}),projectsQuery,historyQuery,
 ]);
 if(summary.error||projects.error||history.error)throw new VoiceError('service_unavailable',503,'Não foi possível carregar a operação de voz.');
 return voiceJson({summary:summary.data,adminProjects:(projects.data??[]).slice(0,1000),projectsTruncated:(projects.data?.length??0)>1000,history:history.data??[]});
}catch(e){return voiceFailure(e);}}
