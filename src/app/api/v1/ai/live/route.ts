import {createServiceClient} from '@/lib/supabase/service';
import {createAiLive} from '@/lib/ai-api/live';
import {readAiJson,aiHttpFailure} from '@/lib/ai-api/http';
export const runtime='nodejs';
export async function POST(request:Request) {
  try{return Response.json(await createAiLive(createServiceClient(),request,await readAiJson(request,1000000)),{headers:{'Cache-Control':'no-store'}});}
  catch(error){return aiHttpFailure(error);}
}
