import { connection } from "next/server";
import { redirect } from "next/navigation";
import { getCurrentWorkspace } from "@/lib/supabase/profile";
import { ConnectyShell } from "@/components/connectyhub-os/connecty-shell";
import { MetaWhatsAppConsole } from "@/components/connectyhub-os/meta-whatsapp-console";
export const metadata = {title:"Chat Meta oficial | ConnectyHub"};
export default async function ChatMetaPage() {
  await connection(); const workspace=await getCurrentWorkspace();
  if(!workspace)redirect("/login?next=/dashboard/chat-meta");
  return <ConnectyShell mode="client" activeHref="/dashboard/chat-meta" isPlatformAdmin={workspace.profile.isPlatformAdmin} userLabel={workspace.profile.email ?? undefined} workspaceName={workspace.organization?.name ?? "Minha empresa"}>
    <MetaWhatsAppConsole />
  </ConnectyShell>;
}
