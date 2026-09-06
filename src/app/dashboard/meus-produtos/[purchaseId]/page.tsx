import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Download } from "lucide-react";
import { ConnectyShell } from "@/components/connectyhub-os/connecty-shell";
import { getCurrentWorkspace } from "@/lib/supabase/profile";
import { createServiceClient } from "@/lib/supabase/service";
import { loadPurchasedProduct } from "@/lib/billing/product-library";
import { recordPlatformCustomerEvent } from "@/lib/billing/customer-journey";

export const dynamic = "force-dynamic";
export default async function ProductAccessPage({ params }: { params: Promise<{ purchaseId: string }> }) {
  const { purchaseId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(purchaseId)) notFound();
  const workspace = await getCurrentWorkspace({ allowRestricted: true });
  if (!workspace) redirect("/login?next=/dashboard/meus-produtos");
  const client = createServiceClient();
  const item = await loadPurchasedProduct(client, workspace.user.id, purchaseId);
  if (!item) notFound();
  await recordPlatformCustomerEvent(client, { userId: workspace.user.id, eventType: "product_opened", sourceId: purchaseId, payload: { product_id: item.product.product_id, title: item.product.title } });
  return <ConnectyShell mode="client" activeHref="/dashboard/meus-produtos" isPlatformAdmin={workspace.profile.isPlatformAdmin}>
    <article className="mx-auto max-w-3xl space-y-6 p-4 sm:p-8"><Link href="/dashboard/meus-produtos" className="text-sm text-emerald-700 underline">Voltar para meus produtos</Link>
      <h1 className="text-2xl font-bold">{item.product.title}</h1>
      <div className="whitespace-pre-wrap break-words rounded-2xl border border-slate-200 bg-white p-5 leading-7 text-slate-800">{item.content.body || "Sua compra está confirmada. As instruções de acesso serão disponibilizadas aqui."}</div>
      {item.content.files.map((file, index) => <a key={file.key} href={`/api/dashboard/meus-produtos/${purchaseId}/file?index=${index}`} className="flex items-center gap-3 rounded-xl border border-slate-200 p-4 font-medium"><Download size={18} />{file.name}</a>)}
    </article>
  </ConnectyShell>;
}
