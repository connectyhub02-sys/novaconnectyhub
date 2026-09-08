import type { Metadata } from "next";
import { getCurrentWorkspace } from "@/lib/supabase/profile";
import { ConnectyShell } from "@/components/connectyhub-os/connecty-shell";
import { AccessDenied } from "@/components/connectyhub-os/access-denied";
import { AiConsole } from "@/components/connectyhub-os/ai-console";
export const dynamic="force-dynamic";
export const metadata:Metadata={title:"Operação de IA | ConnectyHub",robots:{index:false,follow:false}};
export default async function Page(){const w=await getCurrentWorkspace();if(!w?.profile.isPlatformAdmin)return <AccessDenied/>;return <ConnectyShell mode="admin" activeHref="/admin/api-ia" isPlatformAdmin workspaceName="ConnectyHub" userLabel={w.profile.email??undefined}><AiConsole admin/></ConnectyShell>;}
