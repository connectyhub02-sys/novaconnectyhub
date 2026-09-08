import {getCurrentWorkspace} from "@/lib/supabase/profile";
import {ConnectyShell} from "@/components/connectyhub-os/connecty-shell";
import {AccessDenied} from "@/components/connectyhub-os/access-denied";
import {CustomSoftwareAgenda} from "@/components/connectyhub-os/custom-software-agenda";
export const dynamic="force-dynamic";
export const metadata={title:"Reuniões | ConnectyHub",robots:{index:false,follow:false}};
export default async function Page(){const w=await getCurrentWorkspace();if(!w?.profile.isPlatformAdmin)return <AccessDenied/>;return <ConnectyShell mode="admin" activeHref="/admin/reunioes" isPlatformAdmin><CustomSoftwareAgenda/></ConnectyShell>;}
