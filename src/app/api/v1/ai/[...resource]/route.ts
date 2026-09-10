import { createServiceClient } from '@/lib/supabase/service';
import { AiApiError, authenticateAi } from '@/lib/ai-api/gateway';
import { aiHttpFailure, readAiJson } from '@/lib/ai-api/http';
import { createAiResource, listAiResources, refreshAiResource, resourceKinds } from '@/lib/ai-api/resources';
import { getOwnedAiResource } from '@/lib/ai-api/files';
import { downloadAiMedia, removeAiStoredResource,readAiEnvironmentFiles } from '@/lib/ai-api/resource-management';
import {updateAiCache} from '@/lib/ai-api/cache-management';
export const runtime='nodejs';
export const maxDuration=120;
type Context={params:Promise<{resource:string[]}>};
const json=(value:unknown)=>Response.json(value,{headers:{'Cache-Control':'no-store'}});
export async function POST(request:Request,context:Context) {
  try {
    const [collection,id,action]= (await context.params).resource;
    const client=createServiceClient();
    if(id&&action==='cancel') {
      const auth=await authenticateAi(request,client),row=await getOwnedAiResource(client,auth,id,resourceKinds[collection]);
      return json(await refreshAiResource(client,row,true));
    }
    if(id)throw new AiApiError('resource_not_found',404,'Operação não encontrada.');
    return json(await createAiResource(client,request,collection,await readAiJson(request,20_000_000)));
  }catch(error){return aiHttpFailure(error);}
}
export async function GET(request:Request,context:Context) {
  try {
    const [collection,id,action]=(await context.params).resource;
    const client=createServiceClient(),auth=await authenticateAi(request,client);
    if(!id)return json(await listAiResources(client,auth,collection));
    const row=await getOwnedAiResource(client,auth,id,resourceKinds[collection]);
    if(action==='files'&&collection==='environments')return await readAiEnvironmentFiles(client,row,request);
    if(action==='content'&&['videos','interactions'].includes(collection))return await downloadAiMedia(client,row,request);
    if(action)throw new AiApiError('resource_not_found',404,'Operação não encontrada.');
    return json(await refreshAiResource(client,row));
  }catch(error){return aiHttpFailure(error);}
}
export async function DELETE(request:Request,context:Context) {
  try {
    const [collection,id,action]=(await context.params).resource;
    if(!id||action)throw new AiApiError('resource_not_found',404,'Recurso não encontrado.');
    const client=createServiceClient(),auth=await authenticateAi(request,client);
    const row=await getOwnedAiResource(client,auth,id,resourceKinds[collection]);
    return json(await removeAiStoredResource(client,row));
  }catch(error){return aiHttpFailure(error);}
}
export async function PATCH(request:Request,context:Context) {
  try {
    const [collection,id,action]=(await context.params).resource;
    if(collection!=='caches'||!id||action)throw new AiApiError('resource_not_found',404,'Operação não encontrada.');
    const client=createServiceClient(),auth=await authenticateAi(request,client);
    const row=await getOwnedAiResource(client,auth,id,'cache');
    return json(await updateAiCache(client,row,await readAiJson(request)));
  }catch(error){return aiHttpFailure(error);}
}
