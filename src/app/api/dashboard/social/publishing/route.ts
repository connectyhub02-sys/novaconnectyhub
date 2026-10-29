import {NextResponse,type NextRequest} from 'next/server';
import {socialAccess} from '@/lib/social/access';
import {socialFailure} from '@/lib/social/oauth';
import {isSameOriginRequest} from '@/lib/security/same-origin-request';
import {validatePublicWriteRequest} from '@/lib/security/public-request-guard';
import {assertOrganicPublishingAccess} from '@/lib/meta/organic-publishing-access';
import {assertContractAccess} from '@/lib/billing/contract-access';
import {publishingOverview,saveSocialDraft,approveSocialPost,analyzeSocialVideo,reviewSocialDestinations} from '@/lib/social/publishing';
import {socialToken,creatorInfo} from '@/lib/social/publishers';
import {boundedBytes,uploadSocialVideo,checkStoredVideo,maxVideoBytes} from '@/lib/social/media';
export const runtime='nodejs';
export const maxDuration=300;
export async function GET(request:NextRequest){try{
 const shell=request.nextUrl.searchParams.get('shell');if(shell!=='client'&&shell!=='admin')throw Error('Painel inválido.');
 const a=await socialAccess(shell,request.nextUrl.searchParams.get('companyId'));
 await assertOrganicPublishingAccess(a.client,a.organizationId);
 return NextResponse.json(await publishingOverview(a.client,a.organizationId),{headers:{'Cache-Control':'no-store'}});
}catch(e){return socialFailure(e);}}
export async function POST(request:NextRequest){
 if(!isSameOriginRequest(request))return NextResponse.json({error:'Origem não autorizada.'},{status:403});
 const upload=request.nextUrl.searchParams.get('upload')==='1';
 const guard=validatePublicWriteRequest({headers:request.headers,requestUrl:request.url,routeKey:'social-publishing',maxPayloadBytes:upload?maxVideoBytes:32000,rateLimit:{limit:30,windowMs:60000}});
 if(!guard.ok)return NextResponse.json({error:guard.message},{status:guard.status});
 try{
  const raw=upload?null:await boundedBytes(request.body!,32000);
  const b=upload?Object.fromEntries(request.nextUrl.searchParams):JSON.parse(raw!.toString());
  if(!['client','admin'].includes(b.shell))throw Error('Painel inválido.');
  const a=await socialAccess(b.shell,b.companyId,true),{client,organizationId:org}=a,user=a.workspace.user.id;
  await assertOrganicPublishingAccess(client,org);await assertContractAccess(org,client);
  let result:unknown;
  if(upload){if(!request.body)throw Error('Envie um vídeo.');result=await uploadSocialVideo(client,org,user,String(b.name??'video.mp4').slice(0,200),await boundedBytes(request.body));}
  else if(b.action==='save')result=await saveSocialDraft(client,org,user,b.draft,b.id,b.revision);
  else if(b.action==='approve')result=await approveSocialPost(client,org,user,b.id,b.revision,b.scheduledFor,b.accounts);
  else if(b.action==='review')result=await reviewSocialDestinations(client,org,b.id);
  else if(b.action==='check')result=await checkStoredVideo(client,org,b.mediaId);
  else if(b.action==='analyze')result=await analyzeSocialVideo(client,org,user,b.mediaId);
  else if(b.action==='creator'){const c=await socialToken(client,org,'tiktok');result={accountId:c.accountId,info:await creatorInfo(c.token)};}
  else if(b.action==='cancel'){const r=await client.rpc('cancel_social_post',{p_org:org,p_id:b.id});if(r.error)throw Error('Não foi possível cancelar: pode haver um envio em andamento.');result={message:'Envios pendentes cancelados. Publicações já entregues permanecem nas redes.'};}
  else if(b.action==='retry'){
   const r=await client.rpc('retry_social_delivery',{p_org:org,p_id:b.id});
   if(r.error)throw Error('Somente falhas confirmadas de publicações aprovadas podem ser retomadas. Envios incertos exigem conferência.');result={message:'Entrega recolocada na fila. As demais redes foram preservadas.'};
  }else throw Error('Ação inválida.');
  return NextResponse.json(result,{headers:{'Cache-Control':'no-store'}});
 }catch(e){return socialFailure(e);}
}
