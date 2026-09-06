import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentWorkspace } from "@/lib/supabase/profile";
import { createServiceClient } from "@/lib/supabase/service";
import { ProductContentEditor } from "@/components/connectyhub-os/product-content-editor";

export default async function ContentPage({ params }: { params: Promise<{ productId: string }> }) {
  const workspace = await getCurrentWorkspace({ allowRestricted: true });
  if (!workspace?.profile.isPlatformAdmin) redirect("/login");
  const { productId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(productId)) notFound();
  const client = createServiceClient();
  const [product, content] = await Promise.all([
    client.from("platform_products").select("id,name").eq("id", productId).maybeSingle(),
    client.from("platform_product_contents").select("body,files").eq("product_id", productId).maybeSingle(),
  ]);
  if (product.error || content.error) throw new Error("Não foi possível consultar o conteúdo do produto.");
  if (!product.data) notFound();
  return <main className="mx-auto max-w-3xl space-y-6 p-6">
    <Link href="/admin/produtos-connectyhub" className="text-sm text-blue-600">Voltar aos produtos ConnectyHub</Link>
    <h1 className="text-2xl font-bold">Conteúdo de {product.data.name}</h1>
    <ProductContentEditor productId={productId} initialBody={content.data?.body ?? ""} initialFiles={content.data?.files ?? []} />
  </main>;
}
