import {NextResponse,type NextRequest} from 'next/server';
import {authenticateGatewayRequest,formatGatewayError} from '@/lib/connectyhub-api/gateway';
import {getCoexistenceStatus,startCoexistence,finishCoexistence,resumeCoexistence,proxyCoexistenceGraph} from '@/lib/connectyhub-api/coexistence';
export const runtime='nodejs';
export const dynamic='force-dynamic';
type Context={params:Promise<{instanceId:string}>};
const json=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
export async function GET(request:NextRequest,ctx:Context){try{const auth=await authenticateGatewayRequest(request,['instances:read']);return json({ok:true,...await getCoexistenceStatus(auth,(await ctx.params).instanceId,request.nextUrl.searchParams.get('inspect')==='1')});}catch(error){const formatted=formatGatewayError(error);return json(formatted.body,formatted.status);}}
export async function POST(request:NextRequest,ctx:Context){
 try{
  const auth=await authenticateGatewayRequest(request,['instances:read','instances:write']);
  const raw=await request.text();if(raw.length>100000)return json({ok:false,error:'Solicitação excede o limite.'},413);
  const body=JSON.parse(raw) as Record<string,unknown>,id=(await ctx.params).instanceId;
  switch(body.action){
   case 'start':return json({ok:true,...await startCoexistence(auth,id,body)});
   case 'finish':return json({ok:true,...await finishCoexistence(auth,id,body)});
   case 'resume':return json({ok:true,...await resumeCoexistence(auth,id)});
   case 'graph':return json({ok:true,result:await proxyCoexistenceGraph(auth,id,body)});
   default:return json({ok:false,error:'Ação inválida.'},400);
  }
 }catch(error){const formatted=formatGatewayError(error);return json(formatted.body,formatted.status);}
}
