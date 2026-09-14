import {getCurrentWorkspace} from '@/lib/supabase/profile';
import {ConnectyShell} from '@/components/connectyhub-os/connecty-shell';
import {AccessDenied} from '@/components/connectyhub-os/access-denied';
import {VoiceConsole} from '@/components/connectyhub-os/voice-console';
export const dynamic='force-dynamic';
export const metadata={title:'Operação de Voz | ConnectyHub',robots:{index:false,follow:false}};
export default async function Page(){const w=await getCurrentWorkspace();if(!w?.profile.isPlatformAdmin)return <AccessDenied/>;return <ConnectyShell mode="admin" activeHref="/admin/voz" isPlatformAdmin workspaceName="ConnectyHub" userLabel={w.profile.email??undefined}><VoiceConsole admin/></ConnectyShell>;}
