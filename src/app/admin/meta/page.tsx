import Link from "next/link";
import { connection } from "next/server";
import { getMetaWorkspace } from "@/lib/meta/company-access";
import { AccessDenied } from "@/components/connectyhub-os/access-denied";
import { ConnectyShell } from "@/components/connectyhub-os/connecty-shell";
import { MetaWhatsAppConsole } from "@/components/connectyhub-os/meta-whatsapp-console";
export const metadata = { title: "WhatsApp oficial | ConnectyHub" };
export default async function AdminMetaPage() {
  await connection();
  const workspace = await getMetaWorkspace();
  if (!workspace?.profile.isPlatformAdmin) return <AccessDenied/>;
  return <ConnectyShell mode="admin" activeHref="/admin/meta" isPlatformAdmin userLabel={workspace.profile.email ?? undefined}>
    <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm"><span className="text-slate-500">Instagram e Facebook têm sua própria conexão.</span><Link className="font-medium text-blue-700" href="/admin/meta/social">Gerenciar Instagram e Facebook →</Link></div>
    <MetaWhatsAppConsole admin/>
  </ConnectyShell>;
}
