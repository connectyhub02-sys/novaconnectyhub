import { NextResponse, type NextRequest } from "next/server";
import { getCurrentWorkspace } from "@/lib/supabase/profile";
import { createServiceClient } from "@/lib/supabase/service";
import { loadPurchasedProduct } from "@/lib/billing/product-library";
import { recordPlatformCustomerEvent } from "@/lib/billing/customer-journey";

export const dynamic = "force-dynamic";
export async function GET(request: NextRequest, { params }: { params: Promise<{ purchaseId: string }> }) {
  const workspace = await getCurrentWorkspace({ allowRestricted: true });
  if (!workspace) return NextResponse.json({ error: "Entre na sua conta." }, { status: 401 });
  const { purchaseId } = await params;
  const index = Number(request.nextUrl.searchParams.get("index"));
  if (!/^[0-9a-f-]{36}$/i.test(purchaseId) || !Number.isInteger(index) || index < 0) return NextResponse.json({ error: "Arquivo não encontrado." }, { status: 404 });
  const client = createServiceClient();
  const item = await loadPurchasedProduct(client, workspace.user.id, purchaseId);
  const file = item?.content.files[index];
  if (!item || !file || !file.key.startsWith(item.product.product_id + "/")) return NextResponse.json({ error: "Arquivo não encontrado." }, { status: 404 });
  const signed = await client.storage.from("platform-deliverables").createSignedUrl(file.key, 30, { download: file.name });
  if (signed.error) return NextResponse.json({ error: "Não foi possível abrir o arquivo." }, { status: 503 });
  await recordPlatformCustomerEvent(client, { userId: workspace.user.id, eventType: "product_download", sourceId: purchaseId, payload: { product_id: item.product.product_id, file_name: file.name } });
  return NextResponse.redirect(signed.data.signedUrl, { headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
}
