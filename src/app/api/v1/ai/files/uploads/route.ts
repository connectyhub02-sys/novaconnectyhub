import {createServiceClient} from '@/lib/supabase/service';
import {createAiUpload} from '@/lib/ai-api/upload-sessions';
import {readAiJson,aiHttpFailure} from '@/lib/ai-api/http';
export const runtime='nodejs';
export async function POST(request:Request) {
  try{return Response.json(await createAiUpload(createServiceClient(),request,await readAiJson(request,10000)),{status:201,headers:{'Cache-Control':'no-store'}});}
  catch(error){return aiHttpFailure(error);}
}
