import {createServiceClient} from '@/lib/supabase/service';
import {aiRelayCommand,assertAiRelay} from '@/lib/ai-api/live';
import {readAiJson,aiHttpFailure} from '@/lib/ai-api/http';
import {aiUploadCommand} from '@/lib/ai-api/upload-sessions';
export const runtime='nodejs';
export async function POST(request:Request) {
  try{assertAiRelay(request);const body=await readAiJson(request,1000000) as {action?:string};const command=typeof body.action==='string'&&body.action.startsWith('upload.')?aiUploadCommand:aiRelayCommand;return Response.json(await command(createServiceClient(),body),{headers:{'Cache-Control':'no-store'}});}
  catch(error){return aiHttpFailure(error);}
}
