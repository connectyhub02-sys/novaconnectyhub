import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentWorkspace } from "@/lib/supabase/profile";
import { ConnectyShell } from "@/components/connectyhub-os/connecty-shell";
import { AiConsole } from "@/components/connectyhub-os/ai-console";
export const dynamic="force-dynamic";
export const metadata:Metadata={title:"API de IA | ConnectyHub",robots:{index:false,follow:false}};
export default async function Page(){const w=await getCurrentWorkspace();if(!w)redirect("/login");return <ConnectyShell mode="client" activeHref="/dashboard/api-ia" isPlatformAdmin={w.profile.isPlatformAdmin} workspaceName={w.organization?.name??"ConnectyHub"} userLabel={w.profile.email??undefined} userAvatarUrl={w.profile.avatarUrl}><AiConsole/></ConnectyShell>;}
