import {createServiceClient} from '@/lib/supabase/service';
import {assertAiRelay} from '@/lib/ai-api/live';
import {aiHttpFailure} from '@/lib/ai-api/http';
import {studioAssetCommand,readStudioJson} from '@/lib/voice-api/assets';
import {VoiceError,voiceFailure,voiceJson} from '@/lib/voice-api/contract';
export const runtime='nodejs';
export async function POST(request:Request){
 try{assertAiRelay(request);return voiceJson(await studioAssetCommand(createServiceClient(),await readStudioJson(request)));}
 catch(error){return error instanceof VoiceError?voiceFailure(error):aiHttpFailure(error);}
}
