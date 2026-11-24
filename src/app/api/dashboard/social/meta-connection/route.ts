import {NextResponse,type NextRequest} from 'next/server';
import {socialAccess} from '@/lib/social/access';
import {socialFailure} from '@/lib/social/oauth';
import {isSameOriginRequest} from '@/lib/security/same-origin-request';
import {validatePublicWriteRequest} from '@/lib/security/public-request-guard';
import {disconnectGuidedOAuth} from '@/lib/client-os/guided-oauth';
import {disableGrowthProviderAssets} from '@/lib/client-os/growth-integrations';
export async function POST(request:NextRequest){
 if(!isSameOriginRequest(request))return NextResponse.json({error:'Origem não autorizada.'},{status:403});
 const guard=validatePublicWriteRequest({headers:request.headers,requestUrl:request.url,routeKey:'social-meta-disconnect',maxPayloadBytes:4096,rateLimit:{limit:10,windowMs:60000}});
 if(!guard.ok)return NextResponse.json({error:guard.message},{status:guard.status});
 try{
  const raw=await request.text();if(raw.length>4096)throw Error('Solicitação muito grande.');
  const body=JSON.parse(raw);
  if(!['admin','client'].includes(body.shell)||body.action!=='disconnect')throw Error('Solicitação inválida.');
  const a=await socialAccess(body.shell,body.companyId,true);
  // Only the guided social/ads credentials are removed; WhatsApp has its own credentials.
  await disconnectGuidedOAuth({client:a.client,organizationId:a.organizationId,providerId:'meta-ads',actorId:a.workspace.user.id});
  await disableGrowthProviderAssets({client:a.client,organizationId:a.organizationId,providerId:'meta-ads'});
  return NextResponse.json({message:'Instagram, Facebook e Meta Ads desconectados desta empresa. O WhatsApp oficial foi preservado.'},{headers:{'Cache-Control':'no-store'}});
 }catch(error){return socialFailure(error);}
}
