import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentWorkspace } from "@/lib/supabase/profile";
import { createServiceClient } from "@/lib/supabase/service";
import { ProductPurchaseButton } from "@/components/connectyhub-os/product-purchase-button";
import { billingTermsLabel, readCommercialTerms } from "@/lib/billing/commercial-terms";
import { normalizeCurrencyAmount } from "@/lib/sales-catalog/mercado-pago";
export const dynamic = "force-dynamic";

export default async function ProductOfferPage({ params }: { params: Promise<{ productId: string }> }) {
  const { productId } = await params;
  const workspace = await getCurrentWorkspace({ allowRestricted: true });
  if (!workspace) redirect(`/login?next=${encodeURIComponent(`/dashboard/meus-produtos/comprar/${productId}`)}`);
  if (!/^[0-9a-f-]{36}$/i.test(productId)) notFound();
  const { data: product, error } = await createServiceClient().from("platform_products").select("id,name,short_description,price,offer,billing_cycle,billing_interval")
    .eq("id", productId).eq("status", "active").eq("owner_type", "connectyhub").eq("sales_channel_type", "direct").maybeSingle();
  if (error) throw new Error("Não foi possível consultar esta oferta.");
  if (!product) notFound();
  const price = normalizeCurrencyAmount(product.offer?.sale_price ?? product.offer?.salePrice ?? product.price) ?? 0;
  return <main className="mx-auto max-w-xl space-y-5 p-5 sm:p-8">
    <Link href="/dashboard/meus-produtos" className="text-sm text-blue-600">Meus produtos</Link>
    <h1 className="text-2xl font-bold">{product.name}</h1><p className="text-sm text-slate-500">{product.short_description}</p>
    <p className="text-3xl font-bold">{price.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</p>
    <p>{billingTermsLabel(readCommercialTerms(product))}</p>
    <p className="text-sm text-slate-500">A compra fica disponível na sua conta após a confirmação do pagamento. Produtos avulsos permanecem acessíveis sem assinatura ativa.</p>
    <ProductPurchaseButton productId={product.id} />
  </main>;
}
