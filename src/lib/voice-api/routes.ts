import 'server-only';
import {authenticateVoice,authenticateVoiceStudio,type VoiceAuth} from './auth';
import {voiceFailure,voiceJson,VoiceError,voiceBody} from './contract';
import {voiceCatalog,voiceModels} from './catalog';
import {downloadVoice,downloadVoiceAlignment,generateVoice,generateVoiceStream,publicVoiceGeneration,recoverVoice,voiceGeneration} from './generations';
import {createPrivateClone,ownedClone,publicClone,editPrivateClone,deletePrivateClone,cloneSamples,previewPrivateClone} from './clones';
import {createStudioAsset,ownedStudioAsset,publicStudioAsset,listStudioAssets,studioAssetTicket,deleteStudioAsset,readStudioJson} from './assets';
import {createStudioOperation,quoteStudioOperation,ownedStudioOperation,publicStudioOperation,listStudioOperations,downloadStudioResult,downloadStudioPreview,deleteStudioResult} from './studio-operations';
import {studioCatalog,studioResources} from './studio-catalog';
export async function voiceRoute(request:Request,path:string[],studio=false) {
  try {
    const auth=await (studio?authenticateVoiceStudio(request):authenticateVoice(request));
    if(path.length===1&&path[0]==='capabilities'&&request.method==='GET')return voiceJson(await studioCatalog(auth));
    if(path.length===1&&path[0]==='resources'&&request.method==='GET')return voiceJson(await studioResources(auth));
    if(path[0]==='operations'){
      if(path.length===2&&path[1]==='quote'&&request.method==='POST')return voiceJson(await quoteStudioOperation(auth,await readStudioJson(request)));
      if(path.length===1&&request.method==='POST')return voiceJson(await createStudioOperation(auth,request,await readStudioJson(request)),202);
      if(path.length===1&&request.method==='GET')return voiceJson(await listStudioOperations(auth));
      if(path.length===2&&request.method==='GET'){const {r,s}=await ownedStudioOperation(auth,path[1]);return voiceJson(publicStudioOperation(r,s));}
      if(path.length===3&&path[2]==='result'&&request.method==='DELETE')return voiceJson(await deleteStudioResult(auth,path[1]));
      if(path.length===3&&path[2]==='result'&&request.method==='GET')return downloadStudioResult(auth,path[1],new URL(request.url).searchParams.get('format'));
    }
    if(path[0]==='resources'&&path.length===3&&path[2]==='audio'&&request.method==='GET')return downloadStudioPreview(auth,path[1]);
    if(path[0]==='assets'){
      if(path.length===1&&request.method==='POST')return voiceJson(await createStudioAsset(auth,await readStudioJson(request)),201);
      if(path.length===1&&request.method==='GET')return voiceJson(await listStudioAssets(auth));
      if(path.length===2&&request.method==='GET')return voiceJson(publicStudioAsset(await ownedStudioAsset(auth,path[1])));
      if(path.length===2&&request.method==='DELETE')return voiceJson(await deleteStudioAsset(auth,path[1]));
      if(path.length===3&&path[2]==='download'&&request.method==='POST')return voiceJson(await studioAssetTicket(auth,path[1],'download'));
    }
    if(path[0]==='voices'){
      if(path.length===3&&path[2]==='preview'&&request.method==='POST')return voiceJson(await previewPrivateClone(auth,path[1],request));
      if(path.length===1&&request.method==='POST')return voiceJson(await createPrivateClone(auth,request));
      if(path.length===2){
        if(request.method==='GET')return voiceJson({clone:publicClone(await ownedClone(auth,path[1]))});
        if(request.method==='PATCH')return voiceJson({clone:await editPrivateClone(auth,path[1],request)});
        if(request.method==='DELETE')return voiceJson(await deletePrivateClone(auth,path[1]));
      }
      if(request.method==='GET'&&path[2]==='samples'&&path.length===3)return voiceJson(await cloneSamples(auth,path[1]));
      if(request.method==='GET'&&path[2]==='samples'&&path.length===5&&path[4]==='audio')return await cloneSamples(auth,path[1],path[3]) as Response;
    }
    if(path.length===1&&path[0]==='usage'&&request.method==='GET')return voiceJson(await voiceUsage(auth,Number(new URL(request.url).searchParams.get('days'))||30));
    if(path.length===1 && request.method==='GET') {
      if(path[0]==='voices')return voiceJson(await voiceCatalog(auth));
      if(path[0]==='models')return voiceJson(await voiceModels(auth));
      if(path[0]==='generations')return voiceJson(await listGenerations(auth));
    }
    if(path[0]==='generations'){
      if(path.length===1 && request.method==='POST'){
        const result=await generateVoice(auth,request,await jsonBody(request));return voiceJson(result,['reserved','processing','uncertain'].includes(result.status)?202:200);
      }
      if(path.length===2 && path[1]==='stream' && request.method==='POST')return await generateVoiceStream(auth,request,await jsonBody(request));
      if(request.method==='GET' && path.length===3 && path[2]==='alignment')return await downloadVoiceAlignment(auth,path[1]);
      if(request.method==='GET' && path.length===2)return voiceJson(publicVoiceGeneration(await recoverVoice(auth,await voiceGeneration(auth,path[1]))));
      if(request.method==='GET' && path.length===3 && path[2]==='audio')return downloadVoice(auth,path[1]);
    }
    throw new VoiceError('not_found',404,'Operação não encontrada.');
  }catch(error){return voiceFailure(error);}
}
async function listGenerations(auth:VoiceAuth){
  const {data,error}=await auth.client.from('voice_generations').select('*').eq('project_id',auth.project.id).eq('organization_id',auth.project.organization_id).neq('operation','studio').order('created_at',{ascending:false}).limit(50);
  if(error)throw new VoiceError('service_unavailable',503,'Não foi possível consultar o histórico.');
  return {project_id:auth.project.id,billing_organization_id:auth.billingOrg,generations:(data??[]).map(r=>publicVoiceGeneration(r)),limit:50};
}

async function jsonBody(request:Request){
  const text=new TextDecoder().decode(await voiceBody(request,40000));
  try{return JSON.parse(text);}catch{throw new VoiceError('invalid_json',422,'JSON inválido.');}
}
/** Usage and balance for the key's project: what an API customer needs to monitor spend. */
async function voiceUsage(auth:VoiceAuth,requestedDays:number){
  const days=Math.min(90,Math.max(1,Math.floor(requestedDays)));
  const [summary,wallet]=await Promise.all([
    auth.client.rpc('voice_usage_summary',{p_org:auth.project.organization_id,p_days:days,p_admin:false,p_project:auth.project.id}),
    auth.client.from('credit_wallets').select('balance_credits,reserved_credits').eq('organization_id',auth.billingOrg).maybeSingle<{balance_credits:number;reserved_credits:number}>(),
  ]);
  if(summary.error||wallet.error)throw new VoiceError('service_unavailable',503,'Não foi possível consultar o uso.');
  const balance=Number(wallet.data?.balance_credits??0),reserved=Number(wallet.data?.reserved_credits??0);
  return {project_id:auth.project.id,days,usage:summary.data,
    wallet:{balance_credits:balance,reserved_credits:reserved,available_credits:Math.max(0,balance-reserved)},
    monthly_credit_limit:auth.project.monthly_credit_limit};
}
