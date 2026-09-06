import Link from "next/link";
import { redirect } from "next/navigation";
import { Package, ArrowRight } from "lucide-react";
import { ConnectyShell } from "@/components/connectyhub-os/connecty-shell";
import { getCurrentWorkspace } from "@/lib/supabase/profile";
import { createServiceClient } from "@/lib/supabase/service";
import { listPurchasedProducts } from "@/lib/billing/product-library";
import { getContractAccess } from "@/lib/billing/contract-access";

export const dynamic = "force-dynamic";
export const metadata = { title: "Meus produtos | ConnectyHub" };

export default async function PurchasedProductsPage() {
  const workspace = await getCurrentWorkspace({ allowRestricted: true });
  if (!workspace) redirect("/login?next=/dashboard/meus-produtos");
  const client = createServiceClient();
  const all = await listPurchasedProducts(client, workspace.user.id);
  const active = workspace.organization ? (await getContractAccess(workspace.organization.id, client)).allowed : false;
  const products = all;
  return <ConnectyShell mode="client" activeHref="/dashboard/meus-produtos" isPlatformAdmin={workspace.profile.isPlatformAdmin} userLabel={workspace.profile.fullName ?? workspace.profile.email ?? undefined}>
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-8">
      <div><p className="text-sm text-emerald-700">Sua biblioteca ConnectyHub</p><h1 className="mt-1 text-2xl font-bold">Meus produtos</h1>
        <p className="mt-2 text-sm text-slate-500">Seus produtos avulsos já pagos continuam disponíveis mesmo sem assinatura ativa.</p></div>
      {!active ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-slate-800"><span>Os serviços do plano estão suspensos. Suas compras avulsas estão preservadas.</span><Link href="/dashboard/planos" className="font-semibold text-blue-700 underline">Pagamento do plano</Link></div> : null}
      {products.length ? <div className="grid gap-4 sm:grid-cols-2">{products.map(product => <Link key={product.id} href={`/dashboard/meus-produtos/${product.id}`} className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 shadow-sm hover:border-emerald-400">
        <Package className="h-9 w-9 shrink-0 text-emerald-600" /><div className="min-w-0 flex-1"><h2 className="font-semibold">{product.title}</h2><p className="mt-1 text-xs text-slate-500">{product.billing_cycle === "one_time" ? "Compra avulsa" : "Produto recorrente"} · Acesso disponível</p></div><ArrowRight size={18} />
      </Link>)}</div> : <div className="rounded-2xl border border-slate-200 p-8 text-center"><Package className="mx-auto mb-3 text-emerald-600" /><p>Nenhum produto pago disponível nesta conta.</p><p className="mt-2 text-sm text-slate-500">As compras aparecem aqui após a confirmação do pagamento e identificação do comprador.</p></div>}
    </div>
  </ConnectyShell>;
}
