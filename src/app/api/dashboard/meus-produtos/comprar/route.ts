import {preparePlatformCampaign} from "@/lib/commerce/platform-campaigns";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentWorkspace, ensureStarterOrganization } from "@/lib/supabase/profile";
import { createServiceClient } from "@/lib/supabase/service";
import { assertAccountComplete } from "@/lib/account/signup-completion";
import { formatAccessControlError, statusForAccessControlError } from "@/lib/billing/access-control";
import { getAppBaseUrl, normalizeCurrencyAmount } from "@/lib/sales-catalog/mercado-pago";
import { sendPlatformSubscriptionPendingNotification } from "@/lib/billing/platform-billing-webhook";
import { loadBillingCheckoutIntent, readOrderBumpCreditAmount } from "@/lib/billing/plan-checkout";
import { recordPlatformCustomerEvent } from "@/lib/billing/customer-journey";

export async function POST(request: NextRequest) {
  const workspace = await getCurrentWorkspace({ allowRestricted: true });
  if (!workspace) return NextResponse.json({ error: "Entre na sua conta." }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (typeof body?.productId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.productId)) return NextResponse.json({ error: "Produto inválido." }, { status: 400 });
  const client = createServiceClient();
  try {
    await assertAccountComplete({ userId: workspace.user.id, client });
    const organization = workspace.organization ?? await ensureStarterOrganization();
    if (!organization) throw new Error("Complete seu cadastro antes de comprar.");
    const { data: product, error } = await client.from("platform_products").select("id,name,short_description,commercial_description,price,offer,billing_cycle,billing_interval,metadata")
      .eq("id", body.productId).eq("status", "active").eq("owner_type", "connectyhub").eq("sales_channel_type", "direct").maybeSingle();
    if (error) throw new Error("Não foi possível consultar a oferta.");
    if (!product) return NextResponse.json({ error: "Oferta indisponível." }, { status: 404 });
    const owned = await client.from("platform_product_entitlements").select("id").eq("buyer_user_id", workspace.user.id).eq("product_id", product.id).eq("state", "active")
      .or(`ends_at.is.null,ends_at.gt.${new Date().toISOString()}`).limit(1).maybeSingle();
    if (owned.error) throw new Error("Não foi possível conferir suas compras.");
    const credits = readOrderBumpCreditAmount(product.metadata??{},product.name,product.short_description??product.commercial_description??"")??0;
    if (owned.data && product.billing_cycle !== "recurring" && credits <= 0) return NextResponse.json({ checkoutUrl: `/dashboard/meus-produtos/${owned.data.id}`, alreadyPurchased: true });
    const amount = normalizeCurrencyAmount(product.offer?.sale_price ?? product.offer?.salePrice ?? product.price);
    if (!amount || amount <= 0) throw new Error("O preço deste produto precisa ser configurado.");
    const terms = { billing_cycle: product.billing_cycle, billing_interval: product.billing_interval, price_brl: amount, included_credits: credits, access_duration_days: null };
    const result = await client.rpc("create_product_purchase_intent", { p_org: organization.id, p_user: workspace.user.id, p_product: product.id, p_amount: amount, p_terms: terms });
    if (result.error) throw new Error("Não foi possível preparar a compra.");
    const checkoutUrl = `/dashboard/meus-produtos/checkout/${result.data}`;
    await recordPlatformCustomerEvent(client, { userId: workspace.user.id, eventType: "product_checkout_created", sourceId: result.data, eventKey: `product_checkout:${result.data}`, payload: { product_id: product.id, product: product.name, terms } });
    let intent = await loadBillingCheckoutIntent(client, { organizationId: organization.id, subscriptionId: result.data });
    if (intent && typeof body.campaignId === "string" && typeof body.optionId === "string") {await preparePlatformCampaign(client,intent.payment.id,{campaignId:body.campaignId,optionId:body.optionId});intent=await loadBillingCheckoutIntent(client,{organizationId:organization.id,subscriptionId:result.data});}
    if (intent) await sendPlatformSubscriptionPendingNotification(client, { organizationId: organization.id, subscriptionId: result.data, invoiceId: intent.invoice.id, paymentId: intent.payment.id,
      planCode: intent.targetPlanCode, planName: product.name, amountBrl: Number(intent.payment.amount_brl), includedCredits: terms.included_credits,
      metadata: { purchase_kind: "product", checkout_url: checkoutUrl, checkout_public_url: getAppBaseUrl() + checkoutUrl } }).catch(() => null);
    return NextResponse.json({ checkoutUrl });
  } catch (error) {
    return NextResponse.json(formatAccessControlError(error, "Não foi possível iniciar a compra."), { status: statusForAccessControlError(error, 422) });
  }
}
