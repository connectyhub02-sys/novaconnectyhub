import {NextResponse,type NextRequest} from 'next/server';
import {socialAccess} from '@/lib/social/access';
import {socialFailure} from '@/lib/social/oauth';
import {loadInboxContext,readInboxPosts} from '@/lib/meta/inbox-content';
import {assertOrganicPublishingAccess} from '@/lib/meta/organic-publishing-access';
export async function GET(request:NextRequest){try{
  const query=request.nextUrl.searchParams,shell=query.get('shell'),network=query.get('network');
  if(shell!=='admin'&&shell!=='client')throw Error('Painel inválido.');
  if(network!=='facebook'&&network!=='instagram')throw Error('Rede inválida.');
  const after=query.get('after')??'';if(after.length>2048)throw Error('Paginação inválida.');
  const a=await socialAccess(shell,query.get('companyId'));
  await assertOrganicPublishingAccess(a.client,a.organizationId);
  const ctx=await loadInboxContext(a.client,a.organizationId);
  return NextResponse.json(await readInboxPosts(ctx,network,after),{headers:{'Cache-Control':'private, no-store'}});
}catch(error){return socialFailure(error);}}
