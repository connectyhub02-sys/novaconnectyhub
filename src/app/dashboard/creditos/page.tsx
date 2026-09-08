import {getCurrentWorkspace} from "@/lib/supabase/profile";
import {ConnectyShell} from "@/components/connectyhub-os/connecty-shell";
import {AccessDenied} from "@/components/connectyhub-os/access-denied";
import {CreditsConsole} from "@/components/connectyhub-os/credits-console";
export const dynamic="force-dynamic";
export const metadata={title:"Créditos e recargas | ConnectyHub",robots:{index:false,follow:false}};
export default async function Page(){const w=await getCurrentWorkspace();if(!w)return <AccessDenied/>;return <ConnectyShell mode="client" activeHref="/dashboard/creditos" workspaceName={w.organization?.name} userLabel={w.profile.email??undefined}><CreditsConsole/></ConnectyShell>;}
