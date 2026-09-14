import {redirect} from 'next/navigation';
import {getCurrentWorkspace} from '@/lib/supabase/profile';
import {ConnectyShell} from '@/components/connectyhub-os/connecty-shell';
import {VoiceConsole} from '@/components/connectyhub-os/voice-console';
export const dynamic='force-dynamic';
export const metadata={title:'API de Voz AI | ConnectyHub',robots:{index:false,follow:false}};
export default async function Page(){const w=await getCurrentWorkspace();if(!w)redirect('/login');return <ConnectyShell mode="client" activeHref="/dashboard/voz" isPlatformAdmin={w.profile.isPlatformAdmin} workspaceName={w.organization?.name??'ConnectyHub'} userLabel={w.profile.email??undefined} userAvatarUrl={w.profile.avatarUrl}><VoiceConsole/></ConnectyShell>;}
