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
import { getCurrentWorkspace } from "@/lib/supabase/profile";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Checkout de plano | ConnectyHub",
  description: "Checkout proprio da ConnectyHub para planos, creditos e adicionais.",
};

const mercadoPagoSecurityScriptAttributes: Record<string, string> = {
  view: "checkout",
};

export default async function DashboardBillingCheckoutPage({
  params,
}: {
  params: Promise<{ subscriptionId: string }>;
}) {
  await connection();
  const { subscriptionId } = await params;
  const workspace = await getCurrentWorkspace();

  if (!workspace) {
    redirect(`/login?next=${encodeURIComponent(`/dashboard/planos/checkout/${subscriptionId}`)}`);
  }

  if (!workspace.organization) {
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
    organizationId: workspace.organization.id,
    subscriptionId,
  });
  const availableBumps = await loadBillingCheckoutBumps(client);
  const billingProvider = resolveBillingCheckoutProvider(intent);
  const publicKey = billingProvider === "mercado_pago"
    ? await loadMercadoPagoPlatformBillingConfig({ client })
        .then((config) => config.publicKey)
        .catch(() => null)
    : null;

  return (
    <ConnectyShell
      activeHref="/dashboard/planos"
      isPlatformAdmin={workspace.profile.isPlatformAdmin}
      mode="client"
      userAvatarUrl={workspace.profile.avatarUrl}
      userLabel={workspace.profile.email ?? undefined}
      workspaceName={workspace.organization.name ?? workspace.profile.companyName ?? "Workspace"}
    >
      {billingProvider === "mercado_pago" ? (
        <Script
          id="mercado-pago-security"
          src="https://www.mercadopago.com/v2/security.js"
          strategy="afterInteractive"
          {...mercadoPagoSecurityScriptAttributes}
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
                Finalize sua assinatura.
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
                Confira seu plano, adicione creditos promocionais e pague no checkout ConnectyHub.
              </p>
            </div>
            <Link
              href="/dashboard/planos"
              className="inline-flex min-h-10 items-center justify-center rounded-[8px] border border-white/10 px-4 text-sm font-bold text-slate-200 transition hover:bg-white/5"
            >
              Trocar plano
            </Link>
          </div>

          <BillingPlanCheckout
            subscriptionId={intent.subscription.id}
            planCode={intent.plan.plan_code}
            planName={intent.plan.name}
            planAmountBrl={normalizeCurrencyAmount(intent.plan.monthly_price_brl) ?? 0}
            includedCredits={normalizeCurrencyAmount(intent.plan.included_credits) ?? 0}
            storageLimitBytes={normalizePlanNumber(intent.plan.storage_limit_bytes)}
            storageFileLimit={normalizePlanNumber(intent.plan.storage_file_limit)}
            storageImageMaxBytes={normalizePlanNumber(intent.plan.storage_image_max_bytes)}
            storageVideoMaxBytes={normalizePlanNumber(intent.plan.storage_video_max_bytes)}
            storageFileMaxBytes={normalizePlanNumber(intent.plan.storage_file_max_bytes)}
            payerEmail={intent.subscription.payer_email}
            subscriptionStatus={intent.subscription.status}
            paymentStatus={intent.payment.status}
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
