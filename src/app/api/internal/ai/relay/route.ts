import {createServiceClient} from '@/lib/supabase/service';
import {aiRelayCommand,assertAiRelay} from '@/lib/ai-api/live';
import {readAiJson,aiHttpFailure} from '@/lib/ai-api/http';
export const runtime='nodejs';
export async function POST(request:Request) {
  try{assertAiRelay(request);return Response.json(await aiRelayCommand(createServiceClient(),await readAiJson(request,1000000)),{headers:{'Cache-Control':'no-store'}});}
  catch(error){return aiHttpFailure(error);}
}
