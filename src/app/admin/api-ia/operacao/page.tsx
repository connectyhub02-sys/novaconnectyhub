import {getCurrentWorkspace} from "@/lib/supabase/profile";
import {AccessDenied} from "@/components/connectyhub-os/access-denied";
import {ConnectyShell} from "@/components/connectyhub-os/connecty-shell";
import {AiOperations} from "@/components/connectyhub-os/ai-operations";
export const dynamic="force-dynamic";
export const metadata={title:"Conciliação de IA | ConnectyHub",robots:{index:false,follow:false}};
export default async function Page(){const w=await getCurrentWorkspace();if(!w?.profile.isPlatformAdmin)return <AccessDenied/>;return <ConnectyShell mode="admin" activeHref="/admin/api-ia" isPlatformAdmin><AiOperations/></ConnectyShell>;}
