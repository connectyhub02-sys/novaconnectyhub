import { billingTermsLabel } from "@/lib/billing/commercial-terms";
import { readCheckoutCommercialTerms } from "@/lib/billing/plan-checkout";
import { PlatformOffers } from "@/components/commerce/platform-offers";
import { campaignPriceNotice, type CampaignPricing } from "@/lib/commerce/campaigns";
import { readCheckoutPlanAmounts } from "@/lib/billing/plan-discounts";
import { recordPlatformCustomerEvent } from "@/lib/billing/customer-journey";
import type { Metadata } from "next";
import Script from "next/script";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { BillingPlanCheckout } from "@/components/connectyhub-os/billing-plan-checkout";
import { ConnectyShell } from "@/components/connectyhub-os/connecty-shell";
import { AccountCompletionRequiredError, assertAccountComplete } from "@/lib/account/signup-completion";
import {
  loadBillingCheckoutBumps,
  loadBillingCheckoutIntent,
  readBillingCheckoutPixData,
  readSelectedBillingCheckoutBumpCodesForCatalog,
  resolveBillingCheckoutProvider,
} from "@/lib/billing/plan-checkout";
import { loadMercadoPagoPlatformBillingConfig, normalizeCurrencyAmount } from "@/lib/sales-catalog/mercado-pago";
import { ensureStarterOrganization, getCurrentWorkspace } from "@/lib/supabase/profile";
import { createServiceClient } from "@/lib/supabase/service";
import { buildBillingPaymentFailureCopy } from "@/lib/billing/payment-feedback";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Checkout de plano | ConnectyHub",
  description: "Checkout proprio da ConnectyHub para planos, creditos e adicionais.",
};

const mercadoPagoSecurityScriptAttributes: Record<string, string> = {
  view: "checkout",
};
const pagBankCheckoutSdkUrl = "https://assets.pagseguro.com.br/checkout-sdk-js/rc/dist/browser/pagseguro.min.js";

export default async function DashboardBillingCheckoutPage({
  params,
}: {
  params: Promise<{ subscriptionId: string }>;
}) {
  await connection();
  const { subscriptionId } = await params;
  const workspace = await getCurrentWorkspace({ allowRestricted: true });

  if (!workspace) {
    redirect(`/login?next=${encodeURIComponent(`/dashboard/planos/checkout/${subscriptionId}`)}`);
  }

  const organization = workspace.organization ?? await ensureStarterOrganization();

  if (!organization) {
    redirect("/dashboard/planos");
  }

  const client = createServiceClient();

  try {
    await assertAccountComplete({ userId: workspace.user.id, client });
  } catch (error) {
    if (error instanceof AccountCompletionRequiredError) {
      redirect(`/dashboard/minha-conta?complete=1&next=${encodeURIComponent(`/dashboard/planos/checkout/${subscriptionId}`)}`);
    }

    throw error;
  }

  const intent = await loadBillingCheckoutIntent(client, {
    organizationId: organization.id,
    subscriptionId,
  });
  if (intent) await recordPlatformCustomerEvent(client, { userId: workspace.user.id, eventType: "checkout_viewed", sourceId: intent.payment.id, payload: { subscription_id: intent.subscription.id, product_id: intent.payment.payload?.purchase_product_id ?? null } });
  const availableBumps = await loadBillingCheckoutBumps(client, intent ?? undefined);
  const billingProvider = resolveBillingCheckoutProvider(intent);
  const failedAttempt = intent?.payment.status === "rejected" && billingProvider === "asaas"
    ? await client.from("billing_card_attempts").select("state,diagnostic")
        .eq("organization_id", organization.id).eq("payment_id", intent.payment.id)
        .order("created_at", { ascending: false }).limit(1).maybeSingle()
    : null;
  const initialPaymentFailure = failedAttempt?.data
    ? buildBillingPaymentFailureCopy("asaas", failedAttempt.data.state, failedAttempt.data.diagnostic)
    : null;
  const publicKey = billingProvider === "mercado_pago"
    ? await loadMercadoPagoPlatformBillingConfig({ client })
        .then((config) => config.publicKey)
        .catch(() => null)
    : null;

  return (
    <ConnectyShell
      activeHref={intent?.payment.payload?.purchase_kind === "product" ? "/dashboard/meus-produtos" : "/dashboard/planos"}
      isPlatformAdmin={workspace.profile.isPlatformAdmin}
      mode="client"
      userAvatarUrl={workspace.profile.avatarUrl}
      userLabel={workspace.profile.email ?? undefined}
      workspaceName={organization.name ?? workspace.profile.companyName ?? "Workspace"}
    >
      {billingProvider === "mercado_pago" ? (
        <Script
          id="mercado-pago-security"
          src="https://www.mercadopago.com/v2/security.js"
          strategy="afterInteractive"
          {...mercadoPagoSecurityScriptAttributes}
        />
      ) : null}
      {billingProvider === "pagbank" ? (
        <Script
          id="pagbank-checkout-sdk"
          src={pagBankCheckoutSdkUrl}
          strategy="afterInteractive"
        />
      ) : null}

      {!intent ? (
        <section className="rounded-[8px] border border-rose-300/25 bg-rose-950/20 p-6">
          <div className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-rose-200">
            Checkout indisponivel
          </div>
          <h1 className="mt-3 text-2xl font-black text-white">Nao encontramos este checkout</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
            Volte para a tela de planos e gere uma nova tentativa de pagamento.
          </p>
          <Link
            href="/dashboard/planos"
            className="mt-5 inline-flex min-h-10 items-center justify-center rounded-[8px] bg-cyan-300 px-4 text-sm font-bold text-slate-950"
          >
            Ver planos
          </Link>
        </section>
      ) : (
        <section className="space-y-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-emerald-300">
                Billing / checkout
              </div>
              <h1 className="mt-3 text-[28px] font-black leading-tight text-white sm:text-[36px]">
                Finalize sua compra.
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
                Confira sua compra, escolha os adicionais e pague no checkout ConnectyHub.
              </p>
            </div>
            <Link
              href="/dashboard/planos"
              className="inline-flex min-h-10 items-center justify-center rounded-[8px] border border-white/10 px-4 text-sm font-bold text-slate-200 transition hover:bg-white/5"
            >
              Ver planos
            </Link>
          </div>

          {intent.payment.payload?.campaign_pricing ? <p className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900">{campaignPriceNotice(intent.payment.payload.campaign_pricing as CampaignPricing)}</p> : ["pending", "rejected"].includes(intent.payment.status) ? <PlatformOffers planCode={String(intent.payment.payload?.purchase_product_id ?? intent.targetPlanCode)} subscriptionId={subscriptionId}/> : null }
          <BillingPlanCheckout
            purchaseKind={intent.payment.payload?.purchase_kind === "product" ? "product" : "plan"}
            renewal={intent.checkoutKind === "renewal"}
            commercialLabel={billingTermsLabel(readCheckoutCommercialTerms(intent))}
            subscriptionId={intent.subscription.id}
            planCode={intent.plan.plan_code}
            planName={intent.plan.name}
            planAmountBrl={readCheckoutPlanAmounts(intent).amount}
            planListAmountBrl={readCheckoutPlanAmounts(intent).listAmount}
            renewalPlanAmountBrl={readCheckoutCommercialTerms(intent).billingCycle === "recurring" ? readCheckoutPlanAmounts(intent).renewalAmount : null}
            firstPurchaseDiscountPercent={readCheckoutPlanAmounts(intent).firstPurchaseDiscountPercent}
            includedCredits={normalizeCurrencyAmount(intent.plan.included_credits) ?? 0}
            storageLimitBytes={normalizePlanNumber(intent.plan.storage_limit_bytes)}
            storageFileLimit={normalizePlanNumber(intent.plan.storage_file_limit)}
            storageImageMaxBytes={normalizePlanNumber(intent.plan.storage_image_max_bytes)}
            storageVideoMaxBytes={normalizePlanNumber(intent.plan.storage_video_max_bytes)}
            storageFileMaxBytes={normalizePlanNumber(intent.plan.storage_file_max_bytes)}
            payerEmail={intent.subscription.payer_email}
            payerPhone={workspace.profile.phone}
            subscriptionStatus={intent.subscription.status}
            paymentStatus={intent.payment.status}
            initialPaymentFailure={initialPaymentFailure}
            initialProviderPaymentId={intent.payment.provider_payment_id}
            billingProvider={billingProvider}
            cardPublicKey={publicKey}
            availableBumps={availableBumps}
            initialSelectedBumpCodes={readSelectedBillingCheckoutBumpCodesForCatalog(intent, availableBumps)}
            initialPixQrCode={readBillingCheckoutPixData(intent).pixQrCode}
            initialPixQrCodeBase64={readBillingCheckoutPixData(intent).pixQrCodeBase64}
            initialPixTicketUrl={readBillingCheckoutPixData(intent).pixTicketUrl}
          />
        </section>
      )}
    </ConnectyShell>
  );
}

function normalizePlanNumber(value: number | string | null | undefined) {
  const normalized = typeof value === "number" ? value : Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(normalized) ? normalized : 0;
}
