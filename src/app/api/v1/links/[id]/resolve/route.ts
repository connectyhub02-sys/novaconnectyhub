import {authenticateGatewayRequest,formatGatewayError} from '@/lib/connectyhub-api/gateway';
import {outboundLinkHeaders,OutboundLinkError,outboundLinkPreview,resolveOwnedOutboundLink} from '@/lib/whatsapp/resolve-outbound-link';
export const runtime='nodejs';
export const dynamic='force-dynamic';
type Context={params:Promise<{id:string}>};
async function resolve(request:Request,context:Context,head:boolean){try{
 const auth=await authenticateGatewayRequest(request,['instances:read']);
 const {id}=await context.params;
 const destination=await resolveOwnedOutboundLink(auth.client,auth.apiClient.organization_id,id,!head&&!outboundLinkPreview(request));
 return head?new Response(null,{status:302,headers:{...outboundLinkHeaders,Location:destination}}):Response.json({ok:true,destination},{headers:outboundLinkHeaders});
}catch(error){
 const formatted=error instanceof OutboundLinkError?{status:error.status,body:{ok:false,error:{code:error.status===404?'link_not_found':'link_unavailable',message:error.message}}}:formatGatewayError(error);
 return head?new Response(null,{status:formatted.status,headers:outboundLinkHeaders}):Response.json(formatted.body,{status:formatted.status,headers:outboundLinkHeaders});
}}
export const GET=(request:Request,context:Context)=>resolve(request,context,false);
export const HEAD=(request:Request,context:Context)=>resolve(request,context,true);
