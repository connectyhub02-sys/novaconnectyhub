import {getCurrentWorkspace} from '@/lib/supabase/profile';
import {createServiceClient} from '@/lib/supabase/service';
import {VoiceError,voiceFailure,voiceJson} from '@/lib/voice-api/contract';
import {readStudioJson} from '@/lib/voice-api/assets';
import {studioAdminCatalog,updateStudioCapability} from '@/lib/voice-api/studio-admin';
export const dynamic='force-dynamic';
async function admin(){const w=await getCurrentWorkspace();if(!w?.profile.isPlatformAdmin)throw new VoiceError('forbidden',403,'Acesso exclusivo à administração da plataforma.');return w;}
export async function GET(){try{await admin();return voiceJson(await studioAdminCatalog(createServiceClient()));}catch(e){return voiceFailure(e);}}
export async function POST(request:Request){try{
 const w=await admin();const origin=request.headers.get('origin');if(!origin||new URL(request.url).origin!==origin)throw new VoiceError('forbidden',403,'Origem não autorizada.');
 return voiceJson(await updateStudioCapability(createServiceClient(),await readStudioJson(request),w.user.id));
}catch(e){return voiceFailure(e);}}
