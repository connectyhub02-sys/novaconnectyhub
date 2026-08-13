"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ButtonHTMLAttributes,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from "react";
import Image from "next/image";
import Link from "next/link";
import {
  AlertTriangle,
  CalendarDays,
  Camera,
  CheckCircle2,
  CreditCard,
  Edit3,
  ExternalLink,
  KeyRound,
  Loader2,
  Mail,
  RefreshCw,
  ReceiptText,
  Save,
  Send,
  ShieldCheck,
  Smartphone,
  WalletCards,
  type LucideIcon,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { InfinityLoadingPanel } from "./infinity-loader";
import { formatBrazilPhoneInput, normalizeBrazilPhoneForApi } from "@/lib/account/input-format";
import { cn } from "@/lib/utils";

type BillingAccessClientStatus = {
  state: "trial_active" | "trial_low_credits" | "trial_no_credits" | "trial_expired" | "paid_active" | "paid_no_credits" | "paid_expired" | "inactive";
  canUseBillableFeatures: boolean;
  balanceCredits: number;
  trialDaysRemaining: number | null;
  includedCredits: number;
  usedCredits: number;
  bannerTone: "green" | "amber" | "rose" | "cyan";
  bannerTitle: string;
  bannerDescription: string;
  ctaLabel: string;
  ctaHref: string;
  trialStartsAt: string | null;
  trialEndsAt: string | null;
  planCode: string | null;
  organizationStatus: string | null;
};

type AccountCompletionStatus = {
  isComplete: boolean;
  missingFields: string[];
  fullName: string | null;
  email: string | null;
  phone: string | null;
  phoneNormalized: string | null;
  phoneVerified: boolean;
  phoneWhatsappExists: boolean | null;
  cpfPreview: string | null;
  signupCompletedAt: string | null;
  isPlatformAdmin: boolean;
};

type AccountData = {
  profile: {
    id: string;
    email: string | null;
    fullName: string | null;
    phone: string | null;
    phoneNormalized: string | null;
    phoneVerified: boolean;
    phoneWhatsappExists: boolean | null;
    cpfPreview: string | null;
    signupCompletedAt: string | null;
    companyName: string | null;
    avatarUrl: string | null;
    completion: AccountCompletionStatus;
  };
  organization: {
    id: string;
    name: string;
    slug: string | null;
    role: string;
    planCode: string;
    status: string;
  };
  billingAccess: BillingAccessClientStatus;
  wallet: {
    balanceCredits: number;
    reservedCredits: number;
    lifetimePurchasedCredits: number;
    lifetimeUsedCredits: number;
    status: string;
    updatedAt: string | null;
  };
  subscriptions: Array<{
    id: string;
    planCode: string;
    planName: string;
    status: string;
    billingProvider: string | null;
    payerEmail: string | null;
    monthlyPriceBrl: number;
    includedCredits: number;
    currentPeriodStart: string | null;
    currentPeriodEnd: string | null;
    nextBillingAt: string | null;
    canceledAt: string | null;
    createdAt: string | null;
    updatedAt: string | null;
    checkoutHref: string | null;
  }>;
  payments: Array<{
    id: string;
    invoiceId: string | null;
    subscriptionId: string | null;
    provider: string | null;
    providerPaymentId: string | null;
    providerStatus: string | null;
    status: string;
    amountBrl: number;
    paidAt: string | null;
    createdAt: string | null;
    updatedAt: string | null;
    invoiceStatus: string | null;
    invoiceDueAt: string | null;
    invoiceTotalBrl: number;
    providerInvoiceId: string | null;
    planCode: string | null;
    invoiceHref: string | null;
    receiptUrl: string | null;
    checkoutHref: string | null;
  }>;
  creditTransactions: Array<{
    id: string;
    type: string;
    amountCredits: number;
    balanceAfterCredits: number;
    provider: string | null;
    description: string | null;
    createdAt: string | null;
  }>;
  usageEvents: Array<{
    id: string;
    featureCode: string | null;
    publicCategory: string;
    inputUnits: number;
    outputUnits: number;
    chargeCredits: number;
    createdAt: string | null;
  }>;
  usageSummary: {
    balanceCredits: number;
    includedCredits: number;
    usedCredits: number;
    remainingCredits: number;
    totalChargeCredits30d: number;
    todayChargeCredits: number;
    eventCount30d: number;
    lastEventAt: string | null;
    byCategory: Array<{
      category: string;
      chargeCredits: number;
      events: number;
    }>;
  };
  cycles: Array<{
    id: string;
    planCode: string | null;
    planName: string | null;
    cycleStart: string | null;
    cycleEnd: string | null;
    includedCredits: number;
    usedCredits: number;
    overageCredits: number;
    status: string;
    createdAt: string | null;
  }>;
  actions: {
    plansHref: string;
    pendingCheckoutHref: string | null;
  };
};

type AccountApiResponse = {
  account?: AccountData;
  error?: string;
};

type WhatsappCheckState = {
  state: "idle" | "checking" | "valid" | "not_found" | "error";
  phoneNormalized: string | null;
  message: string | null;
};

type BillingTab = "payments" | "subscriptions" | "credits" | "cycles";
type ActionTone = "primary" | "secondary" | "success" | "warning" | "ghost";

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  currency: "BRL",
  style: "currency",
});

const creditsFormatter = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 0,
});

const billingTabs: Array<{ icon: LucideIcon; label: string; value: BillingTab }> = [
  { icon: ReceiptText, label: "Pagamentos", value: "payments" },
  { icon: CreditCard, label: "Assinaturas", value: "subscriptions" },
  { icon: WalletCards, label: "Creditos", value: "credits" },
  { icon: CalendarDays, label: "Ciclos de uso", value: "cycles" },
];

const LIST_LIMIT = 6;

export function AccountConsole() {
  const [account, setAccount] = useState<AccountData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [activeBillingTab, setActiveBillingTab] = useState<BillingTab>("payments");

  const loadAccount = useCallback(async (mode: "initial" | "refresh" | "silent" = "initial") => {
    if (mode === "initial") {
      setLoading(true);
    } else if (mode === "refresh") {
      setRefreshing(true);
    }

    if (mode !== "silent") {
      setError(null);
    }

    try {
      const response = await fetch("/api/dashboard/account", { cache: "no-store" });
      const data = (await response.json().catch(() => null)) as AccountApiResponse | null;

      if (!response.ok || !data?.account) {
        throw new Error(data?.error ?? "Nao foi possivel carregar sua conta.");
      }

      setAccount(data.account);
      window.dispatchEvent(new CustomEvent("connectyhub:billing-status", { detail: data.account.billingAccess }));
    } catch (loadError) {
      if (mode !== "silent") {
        setError(loadError instanceof Error ? loadError.message : "Erro ao carregar sua conta.");
      }
    } finally {
      if (mode === "initial") {
        setLoading(false);
      } else if (mode === "refresh") {
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadAccount();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadAccount]);

  useEffect(() => {
    function refreshAccountSilently() {
      if (document.visibilityState === "visible") {
        void loadAccount("silent");
      }
    }

    const intervalId = window.setInterval(refreshAccountSilently, 15_000);

    window.addEventListener("focus", refreshAccountSilently);
    window.addEventListener("connectyhub:billing-refresh", refreshAccountSilently);
    document.addEventListener("visibilitychange", refreshAccountSilently);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshAccountSilently);
      window.removeEventListener("connectyhub:billing-refresh", refreshAccountSilently);
      document.removeEventListener("visibilitychange", refreshAccountSilently);
    };
  }, [loadAccount]);

  async function handleAvatarUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    event.currentTarget.value = "";

    if (!file) {
      return;
    }

    const formData = new FormData();
    formData.set("avatar", file);
    setAvatarUploading(true);
    setAvatarError(null);

    try {
      const response = await fetch("/api/account/avatar", {
        method: "POST",
        body: formData,
      });
      const data = (await response.json().catch(() => null)) as { avatarUrl?: string; error?: string } | null;

      if (!response.ok || !data?.avatarUrl) {
        throw new Error(data?.error ?? "Nao foi possivel trocar a foto.");
      }

      const nextAvatarUrl = data.avatarUrl;

      setAccount((current) => current
        ? {
            ...current,
            profile: {
              ...current.profile,
              avatarUrl: nextAvatarUrl,
            },
          }
        : current);
      window.dispatchEvent(new CustomEvent("connectyhub:avatar-updated", { detail: { avatarUrl: nextAvatarUrl } }));
    } catch (uploadError) {
      setAvatarError(uploadError instanceof Error ? uploadError.message : "Erro ao trocar foto.");
    } finally {
      setAvatarUploading(false);
    }
  }

  const completionSummary = useMemo(() => {
    if (!account) return null;

    const missing = account.profile.completion.missingFields.length;

    return account.profile.completion.isComplete
      ? "Cadastro completo"
      : `${missing} pendencia${missing === 1 ? "" : "s"}`;
  }, [account]);

  if (loading) {
    return <AccountLoadingState />;
  }

  if (error) {
    return (
      <section className="mx-auto max-w-[1380px] space-y-4">
        <AccountHeader onRefresh={() => loadAccount("refresh")} refreshing={refreshing} />
        <ErrorState message={error} refreshing={refreshing} onRetry={() => loadAccount("refresh")} />
      </section>
    );
  }

  if (!account) {
    return null;
  }

  const pendingCheckoutHref = account.actions.pendingCheckoutHref;

  return (
    <section className="mx-auto max-w-[1460px] space-y-4">
      <AccountHeader
        account={account}
        completionSummary={completionSummary}
        onRefresh={() => loadAccount("refresh")}
        refreshing={refreshing}
      />

      <div className="grid grid-cols-1 items-stretch gap-4 xl:grid-cols-12">
        <AccountDetailsCard
          key={[
            account.profile.phoneNormalized ?? "",
            account.profile.phoneVerified ? "verified" : "pending",
          ].join(":")}
          account={account}
          avatarUploading={avatarUploading}
          avatarError={avatarError}
          onAccountChange={setAccount}
          onAvatarUpload={handleAvatarUpload}
          onReload={() => loadAccount("refresh")}
        />
        <PlanUsageCard account={account} pendingCheckoutHref={pendingCheckoutHref} />
        <SecurityAccessCard email={account.profile.email} onReload={() => loadAccount("refresh")} />
      </div>

      <BillingWorkspace
        account={account}
        activeTab={activeBillingTab}
        onTabChange={setActiveBillingTab}
      />
    </section>
  );
}

function AccountHeader({
  account,
  completionSummary,
  onRefresh,
  refreshing,
}: {
  account?: AccountData | null;
  completionSummary?: string | null;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const trialText = account ? trialSummary(account.billingAccess) : null;
  const status = account ? (account.profile.completion.isComplete ? "approved" : "pending") : null;

  return (
    <header className="flex flex-col gap-4 py-1 lg:flex-row lg:items-start lg:justify-between">
      <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-start">
        <div className="min-w-0">
          <h1 className="text-[22px] font-semibold leading-tight text-white sm:text-2xl">Minha conta</h1>
          <p className="mt-1 text-sm leading-5 text-slate-400">
            Gerencie seus dados, seguranca, plano e faturamento.
          </p>
          {completionSummary ? <p className="mt-1 text-xs font-medium text-slate-500">{completionSummary}</p> : null}
        </div>
        <div className="flex flex-wrap gap-2 lg:pt-0.5">
          {status ? <HeaderPill icon={CheckCircle2} tone="success" value={statusLabel(status)} /> : null}
          {trialText ? (
            <HeaderPill icon={CalendarDays} tone="info" value={`Teste gratis ativo - ${trialText}`} />
          ) : null}
        </div>
      </div>

      <ActionButton
        icon={RefreshCw}
        loading={refreshing}
        type="button"
        variant="primary"
        onClick={onRefresh}
      >
        Atualizar
      </ActionButton>
    </header>
  );
}

function AccountDetailsCard({
  account,
  avatarUploading,
  avatarError,
  onAccountChange,
  onAvatarUpload,
  onReload,
}: {
  account: AccountData;
  avatarUploading: boolean;
  avatarError: string | null;
  onAccountChange: (account: AccountData) => void;
  onAvatarUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onReload: () => Promise<void>;
}) {
  const profile = account.profile;
  const [editingProfile, setEditingProfile] = useState(false);
  const [editingWhatsapp, setEditingWhatsapp] = useState(false);
  const [fullName, setFullName] = useState(profile.fullName ?? "");
  const [companyName, setCompanyName] = useState(profile.companyName ?? account.organization.name ?? "");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [phone, setPhone] = useState(formatBrazilPhoneInput(profile.phone ?? profile.phoneNormalized ?? ""));
  const [phoneCode, setPhoneCode] = useState("");
  const [phoneStep, setPhoneStep] = useState<"idle" | "code">("idle");
  const [phoneWorking, setPhoneWorking] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [phoneMessage, setPhoneMessage] = useState<string | null>(null);
  const [phoneCheck, setPhoneCheck] = useState<WhatsappCheckState>({
    state: "idle",
    phoneNormalized: null,
    message: null,
  });
  const phoneNormalized = normalizeBrazilPhoneForApi(phone);
  const currentPhoneNormalized = profile.phoneNormalized ?? normalizeBrazilPhoneForApi(profile.phone);
  const phoneIsCurrent = Boolean(phoneNormalized && currentPhoneNormalized === phoneNormalized && profile.phoneVerified);
  const phoneValidated = phoneCheck.state === "valid" && phoneCheck.phoneNormalized === phoneNormalized;

  async function handleProfileSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProfileSaving(true);
    setProfileError(null);
    setProfileMessage(null);

    try {
      const response = await fetch("/api/dashboard/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName,
          companyName,
        }),
      });
      const data = (await response.json().catch(() => null)) as AccountApiResponse | null;

      if (!response.ok || !data?.account) {
        throw new Error(data?.error ?? "Nao foi possivel salvar os dados.");
      }

      setProfileMessage("Dados atualizados.");
      setEditingProfile(false);
      onAccountChange(data.account);
    } catch (saveError) {
      setProfileError(saveError instanceof Error ? saveError.message : "Erro ao salvar dados.");
    } finally {
      setProfileSaving(false);
    }
  }

  async function handlePhoneCheck() {
    setPhoneWorking(true);
    setPhoneError(null);
    setPhoneMessage(null);

    try {
      if (!phoneNormalized) {
        throw new Error("Informe um WhatsApp valido com DDD.");
      }

      if (phoneIsCurrent) {
        setPhoneCheck({
          state: "valid",
          phoneNormalized,
          message: "Este WhatsApp ja esta confirmado.",
        });
        return;
      }

      setPhoneCheck({
        state: "checking",
        phoneNormalized,
        message: "Verificando WhatsApp...",
      });

      const response = await fetch("/api/account/phone-verification/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phoneNormalized }),
      });
      const data = (await response.json().catch(() => null)) as {
        exists?: boolean;
        error?: string;
        phoneNormalized?: string;
      } | null;

      if (!response.ok) {
        throw new Error(data?.error ?? "Nao foi possivel validar o WhatsApp.");
      }

      if (!data?.exists) {
        setPhoneCheck({
          state: "not_found",
          phoneNormalized,
          message: "Nao encontramos WhatsApp ativo neste numero.",
        });
        return;
      }

      setPhoneCheck({
        state: "valid",
        phoneNormalized: data.phoneNormalized ?? phoneNormalized,
        message: "WhatsApp encontrado. Envie o codigo para confirmar.",
      });
    } catch (checkError) {
      const message = checkError instanceof Error ? checkError.message : "Erro ao validar WhatsApp.";
      setPhoneCheck({
        state: "error",
        phoneNormalized,
        message,
      });
      setPhoneError(message);
    } finally {
      setPhoneWorking(false);
    }
  }

  async function handlePhoneSend() {
    setPhoneWorking(true);
    setPhoneError(null);
    setPhoneMessage(null);

    try {
      if (!phoneNormalized) {
        throw new Error("Informe um WhatsApp valido com DDD.");
      }

      if (phoneIsCurrent) {
        throw new Error("Este WhatsApp ja esta confirmado na sua conta.");
      }

      if (!phoneValidated) {
        throw new Error("Valide o WhatsApp antes de enviar o codigo.");
      }

      const response = await fetch("/api/account/phone-verification/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phoneNormalized }),
      });
      const data = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        throw new Error(data?.error ?? "Nao foi possivel enviar o codigo.");
      }

      setPhoneStep("code");
      setPhoneMessage("Codigo enviado no WhatsApp informado.");
    } catch (sendError) {
      setPhoneError(sendError instanceof Error ? sendError.message : "Erro ao enviar codigo.");
    } finally {
      setPhoneWorking(false);
    }
  }

  async function handlePhoneVerify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPhoneWorking(true);
    setPhoneError(null);
    setPhoneMessage(null);

    try {
      const code = phoneCode.replace(/\D/g, "");

      if (code.length !== 6) {
        throw new Error("Informe o codigo de 6 digitos.");
      }

      const response = await fetch("/api/account/phone-verification/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = (await response.json().catch(() => null)) as {
        accountCompletion?: AccountCompletionStatus;
        avatarUrl?: string | null;
        error?: string;
      } | null;

      if (!response.ok || !data?.accountCompletion) {
        throw new Error(data?.error ?? "Nao foi possivel confirmar o codigo.");
      }

      if (data.avatarUrl) {
        window.dispatchEvent(new CustomEvent("connectyhub:avatar-updated", { detail: { avatarUrl: data.avatarUrl } }));
      }

      setPhoneStep("idle");
      setPhoneCode("");
      setPhoneCheck({
        state: "valid",
        phoneNormalized,
        message: "WhatsApp confirmado.",
      });
      setPhoneMessage("WhatsApp atualizado e confirmado.");
      void onReload();
    } catch (verifyError) {
      setPhoneError(verifyError instanceof Error ? verifyError.message : "Codigo invalido.");
    } finally {
      setPhoneWorking(false);
    }
  }

  function handlePhoneChange(value: string) {
    setPhone(formatBrazilPhoneInput(value));
    setPhoneStep("idle");
    setPhoneCode("");
    setPhoneError(null);
    setPhoneMessage(null);
    setPhoneCheck({
      state: "idle",
      phoneNormalized: null,
      message: null,
    });
  }

  return (
    <Surface className="flex xl:col-span-5">
      <div className="flex min-h-full flex-1 flex-col gap-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-base font-semibold text-white">Dados da conta</h2>
          <div className="flex flex-wrap gap-2">
            <ActionButton
              icon={Edit3}
              type="button"
              variant={editingProfile ? "primary" : "secondary"}
              onClick={() => {
                setEditingProfile((current) => !current);
                setProfileError(null);
                setProfileMessage(null);
              }}
            >
              {editingProfile ? "Cancelar" : "Editar dados"}
            </ActionButton>
            <ActionButton
              icon={Smartphone}
              type="button"
              variant={editingWhatsapp ? "success" : "secondary"}
              onClick={() => {
                setEditingWhatsapp((current) => !current);
                setPhoneError(null);
                setPhoneMessage(null);
              }}
            >
              WhatsApp
            </ActionButton>
            <label className={cn(actionButtonClass("secondary"), "cursor-pointer")}>
              {avatarUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
              Foto
              <input accept="image/jpeg,image/png,image/webp" className="hidden" type="file" onChange={onAvatarUpload} />
            </label>
          </div>
        </div>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="flex min-w-0 items-center gap-4">
            <AccountAvatar avatarUrl={profile.avatarUrl} name={profile.fullName ?? profile.email ?? account.organization.name} />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-xl font-semibold text-white">{profile.fullName ?? "Usuario ConnectyHub"}</h2>
                <StatusBadge status={profile.completion.isComplete ? "approved" : "pending"} />
              </div>
              <p className="mt-1 break-all text-sm text-slate-400">{profile.email ?? "email nao informado"}</p>
            </div>
          </div>
        </div>

        {avatarError ? <Feedback tone="error">{avatarError}</Feedback> : null}

        {editingProfile ? (
          <form className="rounded-md bg-white/[0.035] p-4" onSubmit={handleProfileSubmit}>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Nome">
                <input
                  className={inputClassName}
                  maxLength={120}
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                />
              </Field>
              <Field label="Empresa">
                <input
                  className={inputClassName}
                  maxLength={120}
                  value={companyName}
                  onChange={(event) => setCompanyName(event.target.value)}
                />
              </Field>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <ActionButton icon={Save} loading={profileSaving} type="submit" variant="primary">
                Salvar dados
              </ActionButton>
              {profileMessage ? <Feedback tone="success">{profileMessage}</Feedback> : null}
              {profileError ? <Feedback tone="error">{profileError}</Feedback> : null}
            </div>
          </form>
        ) : (
          <dl className="grid overflow-hidden rounded-lg border border-white/10 bg-[#081322]/70 sm:grid-cols-2">
            <AccountFact label="WhatsApp" value={profile.phone ?? "Nao informado"} />
            <AccountFact label="CPF/CNPJ" value={profile.cpfPreview ?? "Pendente"} />
            <AccountFact label="Empresa" value={profile.companyName ?? account.organization.name} />
            <AccountFact label="Cadastro" value={profile.signupCompletedAt ? formatDate(profile.signupCompletedAt) : "Em andamento"} />
          </dl>
        )}

        {editingWhatsapp ? (
          <div className="rounded-md bg-emerald-300/[0.035] p-4">
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:items-end">
              <Field label="Alterar WhatsApp">
                <input
                  className={inputClassName}
                  inputMode="tel"
                  placeholder="(47) 99999-9999"
                  value={phone}
                  onChange={(event) => handlePhoneChange(event.target.value)}
                />
              </Field>
              <ActionButton
                icon={ShieldCheck}
                loading={phoneWorking && phoneCheck.state === "checking"}
                type="button"
                variant="secondary"
                onClick={handlePhoneCheck}
              >
                Validar
              </ActionButton>
              <ActionButton
                icon={Send}
                disabled={phoneWorking || phoneIsCurrent || !phoneValidated}
                loading={phoneWorking && phoneStep === "idle" && phoneValidated}
                type="button"
                variant="success"
                onClick={handlePhoneSend}
              >
                Enviar codigo
              </ActionButton>
            </div>

            {phoneCheck.message ? (
              <Feedback tone={phoneCheck.state === "valid" ? "success" : phoneCheck.state === "not_found" || phoneCheck.state === "error" ? "error" : "neutral"}>
                {phoneCheck.message}
              </Feedback>
            ) : null}

            {phoneStep === "code" ? (
              <form className="mt-4 flex flex-col gap-2 sm:flex-row" onSubmit={handlePhoneVerify}>
                <input
                  className={cn(inputClassName, "font-semibold tracking-[0.18em] sm:max-w-[170px]")}
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="000000"
                  value={phoneCode}
                  onChange={(event) => setPhoneCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                />
                <ActionButton icon={CheckCircle2} loading={phoneWorking} type="submit" variant="primary">
                  Confirmar
                </ActionButton>
              </form>
            ) : null}

            {phoneMessage ? <Feedback tone="success">{phoneMessage}</Feedback> : null}
            {phoneError ? <Feedback tone="error">{phoneError}</Feedback> : null}
          </div>
        ) : null}
      </div>
    </Surface>
  );
}

function PlanUsageCard({ account, pendingCheckoutHref }: { account: AccountData; pendingCheckoutHref: string | null }) {
  const access = account.billingAccess;
  const usageSummary = account.usageSummary;
  const activeSubscription = getPrimarySubscription(account.subscriptions);
  const planName = activeSubscription?.planName ?? formatPlanName(account.organization.planCode);
  const monthlyPrice = activeSubscription?.monthlyPriceBrl ?? 0;
  const nextBillingAt = activeSubscription?.nextBillingAt ?? null;
  const usagePercent = usagePercentage(access.usedCredits, access.includedCredits);
  const trialText = trialSummary(access);
  const hasActiveSubscription = Boolean(activeSubscription && isActiveSubscription(activeSubscription.status));
  const primaryHref = pendingCheckoutHref ?? account.actions.plansHref;
  const primaryLabel = pendingCheckoutHref
    ? "Finalizar pagamento"
    : hasActiveSubscription
      ? "Gerenciar assinatura"
      : "Ver planos";
  const primaryTone: ActionTone = pendingCheckoutHref ? "warning" : "primary";

  return (
    <Surface className="flex xl:col-span-4">
      <div className="flex min-h-full flex-1 flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-cyan-300/10 text-cyan-200">
              <WalletCards className="h-4 w-4" />
            </span>
            <h2 className="truncate text-base font-semibold text-white">Plano e utilizacao</h2>
          </div>
          <StatusBadge status={account.organization.status} />
        </div>

        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_112px] sm:items-center">
          <div className="min-w-0">
            <h3 className="truncate text-2xl font-semibold text-white">{planName}</h3>
            <p className="mt-1 text-sm text-slate-300">{formatCredits(access.includedCredits)} creditos</p>
            {trialText ? (
              <p className="mt-4 inline-flex rounded-full border border-cyan-300/15 bg-cyan-300/10 px-2.5 py-1 text-xs font-semibold text-cyan-100">
                Teste gratis: {trialText}
              </p>
            ) : null}
          </div>
          <UsageRing value={usagePercent} />
        </div>

        <div>
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-slate-400">
              <span className="font-semibold text-cyan-200">{formatCredits(access.usedCredits)}</span> de {formatCredits(access.includedCredits)} creditos utilizados
            </span>
            <span className="font-semibold text-slate-200">{Math.round(clamp(usagePercent, 0, 100))}%</span>
          </div>
          <ProgressBar value={usagePercent} />
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          <PlanMetric label="Creditos disponiveis" value={formatCredits(account.wallet.balanceCredits)} />
          <PlanMetric label="Usados no ciclo" value={formatCredits(access.usedCredits)} />
          <PlanMetric label="Gasto hoje" value={formatCredits(usageSummary.todayChargeCredits)} />
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          <PlanMetric label="Ultimos 30 dias" value={formatCredits(usageSummary.totalChargeCredits30d)} />
          <PlanMetric label="Eventos 30 dias" value={formatCredits(usageSummary.eventCount30d)} />
          <PlanMetric label="Valor mensal" value={formatCurrency(monthlyPrice)} />
        </div>

        <div className="rounded-lg border border-white/10 bg-[#081322]/70 p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm text-slate-400">Ultimo consumo / proxima cobranca</p>
              <p className="mt-1 font-semibold text-white">
                {usageSummary.lastEventAt ? formatDateTime(usageSummary.lastEventAt) : "Sem consumo recente"} / {nextBillingAt ? formatDate(nextBillingAt) : "Nao agendada"}
              </p>
            </div>
            <CalendarDays className="h-5 w-5 shrink-0 text-slate-500" />
          </div>
        </div>

        <div className="mt-auto grid gap-2 sm:grid-cols-2">
          <ActionLink href={primaryHref} icon={pendingCheckoutHref ? ExternalLink : CreditCard} variant={primaryTone}>
            {primaryLabel}
          </ActionLink>
          {pendingCheckoutHref ? (
            <ActionLink href={account.actions.plansHref} variant="secondary">
              Ver planos
            </ActionLink>
          ) : null}
        </div>
      </div>
    </Surface>
  );
}

function SecurityAccessCard({ email, onReload }: { email: string | null; onReload: () => Promise<void> }) {
  const [nextEmail, setNextEmail] = useState(email ?? "");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [emailWorking, setEmailWorking] = useState(false);
  const [passwordWorking, setPasswordWorking] = useState(false);
  const [emailMessage, setEmailMessage] = useState<string | null>(null);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [securityMode, setSecurityMode] = useState<"summary" | "email" | "password">("summary");

  async function handleEmailSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setEmailWorking(true);
    setEmailError(null);
    setEmailMessage(null);

    try {
      const response = await fetch("/api/dashboard/account/security", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "change_email",
          email: nextEmail,
        }),
      });
      const data = (await response.json().catch(() => null)) as {
        emailChangedImmediately?: boolean;
        error?: string;
        message?: string;
      } | null;

      if (!response.ok) {
        throw new Error(data?.error ?? "Nao foi possivel alterar o email.");
      }

      setEmailMessage(data?.message ?? "Solicitacao enviada.");

      if (data?.emailChangedImmediately) {
        void onReload();
      }
    } catch (error) {
      setEmailError(error instanceof Error ? error.message : "Erro ao alterar email.");
    } finally {
      setEmailWorking(false);
    }
  }

  async function handlePasswordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordWorking(true);
    setPasswordError(null);
    setPasswordMessage(null);

    try {
      if (password.length < 6) {
        throw new Error("A senha precisa ter no minimo 6 caracteres.");
      }

      if (password !== passwordConfirm) {
        throw new Error("As senhas nao conferem.");
      }

      const response = await fetch("/api/dashboard/account/security", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "change_password",
          password,
        }),
      });
      const data = (await response.json().catch(() => null)) as { error?: string; message?: string } | null;

      if (!response.ok) {
        throw new Error(data?.error ?? "Nao foi possivel alterar a senha.");
      }

      setPassword("");
      setPasswordConfirm("");
      setPasswordMessage(data?.message ?? "Senha atualizada.");
    } catch (error) {
      setPasswordError(error instanceof Error ? error.message : "Erro ao alterar senha.");
    } finally {
      setPasswordWorking(false);
    }
  }

  return (
    <Surface className="flex xl:col-span-3">
      <div className="flex min-h-full flex-1 flex-col gap-5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-cyan-300/10 text-cyan-200">
            <ShieldCheck className="h-4 w-4" />
          </span>
          <h2 className="text-base font-semibold text-white">Seguranca e acesso</h2>
        </div>

        <div className="space-y-5">
          <div className="border-t border-white/10 pt-4">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">E-mail de acesso</p>
            <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between xl:flex-col xl:items-start">
              <p className="break-all text-sm font-semibold text-white">{email ?? "sem email atual"}</p>
              <ActionButton
                icon={Mail}
                type="button"
                variant={securityMode === "email" ? "primary" : "secondary"}
                onClick={() => {
                  setSecurityMode((current) => current === "email" ? "summary" : "email");
                  setEmailError(null);
                  setEmailMessage(null);
                }}
              >
                Alterar e-mail
              </ActionButton>
            </div>
          </div>

          <div className="border-t border-white/10 pt-4">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Senha</p>
            <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between xl:flex-col xl:items-start">
              <p className="text-sm font-semibold text-white">************</p>
              <ActionButton
                icon={KeyRound}
                type="button"
                variant={securityMode === "password" ? "primary" : "secondary"}
                onClick={() => {
                  setSecurityMode((current) => current === "password" ? "summary" : "password");
                  setPasswordError(null);
                  setPasswordMessage(null);
                }}
              >
                Alterar senha
              </ActionButton>
            </div>
          </div>
        </div>

        {securityMode === "email" ? (
        <form className="grid gap-3 rounded-md bg-white/[0.035] p-4" onSubmit={handleEmailSubmit}>
          <Field label="Novo e-mail">
            <input
              className={inputClassName}
              inputMode="email"
              type="email"
              value={nextEmail}
              onChange={(event) => {
                setNextEmail(event.target.value);
                setEmailError(null);
                setEmailMessage(null);
              }}
            />
          </Field>
          <ActionButton icon={Send} loading={emailWorking} type="submit" variant="primary">
            Enviar alteracao
          </ActionButton>
          {emailMessage ? <Feedback tone="success">{emailMessage}</Feedback> : null}
          {emailError ? <Feedback tone="error">{emailError}</Feedback> : null}
        </form>
      ) : null}

      {securityMode === "password" ? (
        <form className="grid gap-3 rounded-md bg-white/[0.035] p-4" onSubmit={handlePasswordSubmit}>
          <Field label="Nova senha">
            <input
              className={inputClassName}
              maxLength={128}
              type="password"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                setPasswordError(null);
                setPasswordMessage(null);
              }}
            />
          </Field>
          <Field label="Confirmar senha">
            <input
              className={inputClassName}
              maxLength={128}
              type="password"
              value={passwordConfirm}
              onChange={(event) => {
                setPasswordConfirm(event.target.value);
                setPasswordError(null);
                setPasswordMessage(null);
              }}
            />
          </Field>
          <ActionButton icon={Save} loading={passwordWorking} type="submit" variant="success">
            Salvar senha
          </ActionButton>
          {passwordMessage ? <Feedback tone="success">{passwordMessage}</Feedback> : null}
          {passwordError ? <Feedback tone="error">{passwordError}</Feedback> : null}
        </form>
      ) : null}

        <div className="mt-auto rounded-lg border border-white/10 bg-white/[0.035] p-3">
          <div className="flex items-start gap-3">
            <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-cyan-200" />
            <p className="text-sm leading-5 text-slate-300">
              Mantenha seus dados sempre seguros. Recomendamos alterar sua senha regularmente.
            </p>
          </div>
        </div>
      </div>
    </Surface>
  );
}

function BillingWorkspace({
  account,
  activeTab,
  onTabChange,
}: {
  account: AccountData;
  activeTab: BillingTab;
  onTabChange: (tab: BillingTab) => void;
}) {
  return (
    <Surface>
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold text-white">Faturamento e consumo</h2>
        <p className="text-sm text-slate-400">Acompanhe seus pagamentos, assinaturas, creditos e ciclos de uso.</p>
      </div>

      <Tabs className="mt-5 gap-4" value={activeTab} onValueChange={(value) => onTabChange(value as BillingTab)}>
        <div className="overflow-x-auto overflow-y-hidden pb-1">
          <TabsList className="w-max min-w-full justify-start gap-0 border-b border-white/10 bg-transparent p-0" variant="line">
            {billingTabs.map((tab) => {
              const Icon = tab.icon;
              const count = billingTabCount(account, tab.value);

              return (
                <TabsTrigger
                  key={tab.value}
                  className="h-11 min-w-[132px] rounded-none border-0 border-b-2 border-transparent bg-transparent px-4 text-sm font-semibold text-slate-400 hover:bg-white/[0.025] hover:text-white data-active:border-cyan-300 data-active:bg-transparent data-active:text-cyan-200"
                  value={tab.value}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                  <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[11px]">{count}</span>
                </TabsTrigger>
              );
            })}
          </TabsList>
        </div>

        <TabsContent className="mt-0 data-[state=inactive]:hidden" forceMount value="payments">
          <PaymentsTab payments={account.payments} />
        </TabsContent>
        <TabsContent className="mt-0 data-[state=inactive]:hidden" forceMount value="subscriptions">
          <SubscriptionsTab plansHref={account.actions.plansHref} subscriptions={account.subscriptions} />
        </TabsContent>
        <TabsContent className="mt-0 data-[state=inactive]:hidden" forceMount value="credits">
          <CreditsTab
            transactions={account.creditTransactions}
            usageEvents={account.usageEvents}
            usageSummary={account.usageSummary}
          />
        </TabsContent>
        <TabsContent className="mt-0 data-[state=inactive]:hidden" forceMount value="cycles">
          <CyclesTab cycles={account.cycles} />
        </TabsContent>
      </Tabs>
    </Surface>
  );
}

function PaymentsTab({ payments }: { payments: AccountData["payments"] }) {
  const { hasMore, setExpanded, visibleItems } = useVisibleItems(payments);

  if (!payments.length) {
    return <EmptyState text="Nenhum pagamento encontrado para esta conta." />;
  }

  return (
    <div className="space-y-4">
      <div className="hidden overflow-x-auto overflow-y-hidden sm:block">
        <table className="w-full min-w-[760px] overflow-hidden rounded-lg border border-white/10 bg-[#081322]/55 text-left">
          <thead className="bg-white/[0.035]">
            <tr className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">
              <th className="border-b border-white/10 px-4 py-3">Valor</th>
              <th className="border-b border-white/10 px-4 py-3">Plano</th>
              <th className="border-b border-white/10 px-4 py-3">Status</th>
              <th className="border-b border-white/10 px-4 py-3">Data</th>
              <th className="border-b border-white/10 px-4 py-3">Fatura</th>
              <th className="border-b border-white/10 px-4 py-3 text-right">Acao</th>
            </tr>
          </thead>
          <tbody>
            {visibleItems.map((payment) => (
              <PaymentTableRow key={payment.id} payment={payment} />
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-3 sm:hidden">
        {visibleItems.map((payment) => (
          <PaymentMobileRow key={payment.id} payment={payment} />
        ))}
      </div>

      {hasMore ? <ShowMoreButton total={payments.length} onClick={() => setExpanded(true)} /> : null}
    </div>
  );
}

function PaymentTableRow({ payment }: { payment: AccountData["payments"][number] }) {
  const reference = internalReference([payment.planCode, payment.providerStatus ?? payment.invoiceStatus]);

  return (
    <tr className="group">
      <td className="border-b border-white/10 px-4 py-3 align-top text-sm font-semibold text-white">
        {formatCurrency(payment.amountBrl)}
      </td>
      <td className="border-b border-white/10 px-4 py-3 align-top">
        <p className="text-sm font-semibold text-white">{formatPlanName(payment.planCode ?? "Plano")}</p>
        {reference ? <InternalReference value={reference} /> : null}
      </td>
      <td className="border-b border-white/10 px-4 py-3 align-top">
        <StatusBadge status={payment.status} />
      </td>
      <td className="border-b border-white/10 px-4 py-3 align-top text-sm text-slate-300">
        {formatDateTime(payment.paidAt ?? payment.createdAt)}
      </td>
      <td className="border-b border-white/10 px-4 py-3 align-top">
        {payment.invoiceHref ? (
          <ActionLink href={payment.invoiceHref} variant="ghost">
            Ver fatura
          </ActionLink>
        ) : (
          <span className="text-sm text-slate-500">Nao disponivel</span>
        )}
      </td>
      <td className="border-b border-white/10 px-4 py-3 align-top">
        <PaymentActions payment={payment} />
      </td>
    </tr>
  );
}

function PaymentMobileRow({ payment }: { payment: AccountData["payments"][number] }) {
  const reference = internalReference([payment.planCode, payment.providerStatus ?? payment.invoiceStatus]);

  return (
    <article className="rounded-md bg-white/[0.035] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-base font-semibold text-white">{formatCurrency(payment.amountBrl)}</p>
          <p className="mt-1 text-sm text-slate-400">{formatPlanName(payment.planCode ?? "Plano")}</p>
        </div>
        <StatusBadge status={payment.status} />
      </div>
      <p className="mt-3 text-sm text-slate-300">{formatDateTime(payment.paidAt ?? payment.createdAt)}</p>
      {reference ? <InternalReference value={reference} /> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {payment.invoiceHref ? (
          <ActionLink href={payment.invoiceHref} variant="ghost">
            Ver fatura
          </ActionLink>
        ) : null}
        <PaymentActions payment={payment} align="left" />
      </div>
    </article>
  );
}

function PaymentActions({ align = "right", payment }: { align?: "left" | "right"; payment: AccountData["payments"][number] }) {
  return (
    <div className={cn("flex flex-wrap gap-2", align === "right" ? "justify-end" : "justify-start")}>
      {payment.receiptUrl ? (
        <ActionLink external href={payment.receiptUrl} variant="secondary">
          Comprovante
        </ActionLink>
      ) : null}
      {payment.checkoutHref ? (
        <ActionLink href={payment.checkoutHref} icon={ExternalLink} variant="warning">
          Pagar
        </ActionLink>
      ) : null}
      {!payment.receiptUrl && !payment.checkoutHref ? <span className="text-sm text-slate-500">Sem acao</span> : null}
    </div>
  );
}

function SubscriptionsTab({
  plansHref,
  subscriptions,
}: {
  plansHref: string;
  subscriptions: AccountData["subscriptions"];
}) {
  const { hasMore, setExpanded, visibleItems } = useVisibleItems(subscriptions);

  if (!subscriptions.length) {
    return <EmptyState text="Nenhuma assinatura registrada nesta conta." />;
  }

  return (
    <div className="space-y-4">
      <div className="hidden overflow-x-auto overflow-y-hidden sm:block">
        <table className="w-full min-w-[820px] border-separate border-spacing-0 text-left">
          <thead>
            <tr className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
              <th className="border-b border-white/10 pb-3 pr-4">Plano</th>
              <th className="border-b border-white/10 pb-3 pr-4">Valor</th>
              <th className="border-b border-white/10 pb-3 pr-4">Creditos</th>
              <th className="border-b border-white/10 pb-3 pr-4">Status</th>
              <th className="border-b border-white/10 pb-3 pr-4">Inicio</th>
              <th className="border-b border-white/10 pb-3 pr-4">Renovacao</th>
              <th className="border-b border-white/10 pb-3 text-right">Acao</th>
            </tr>
          </thead>
          <tbody>
            {visibleItems.map((subscription, index) => (
              <tr key={subscription.id} className={cn(isCurrentSubscription(subscription, index) ? "bg-cyan-300/[0.035]" : "")}>
                <td className="border-b border-white/10 py-3 pl-2 pr-4 align-top">
                  <p className="text-sm font-semibold text-white">{subscription.planName}</p>
                  {isCurrentSubscription(subscription, index) ? <p className="mt-1 text-xs font-semibold text-cyan-200">Assinatura atual</p> : null}
                </td>
                <td className="border-b border-white/10 py-3 pr-4 align-top text-sm text-slate-300">{formatCurrency(subscription.monthlyPriceBrl)}</td>
                <td className="border-b border-white/10 py-3 pr-4 align-top text-sm text-slate-300">{formatCredits(subscription.includedCredits)}</td>
                <td className="border-b border-white/10 py-3 pr-4 align-top"><StatusBadge status={subscription.status} /></td>
                <td className="border-b border-white/10 py-3 pr-4 align-top text-sm text-slate-300">{formatDate(subscription.currentPeriodStart ?? subscription.createdAt)}</td>
                <td className="border-b border-white/10 py-3 pr-4 align-top text-sm text-slate-300">{subscription.nextBillingAt ? formatDate(subscription.nextBillingAt) : "Nao agendada"}</td>
                <td className="border-b border-white/10 py-3 text-right align-top">
                  <ActionLink href={subscription.checkoutHref ?? plansHref} icon={ExternalLink} variant={subscription.checkoutHref ? "warning" : "ghost"}>
                    {subscription.checkoutHref ? "Finalizar pagamento" : "Gerenciar"}
                  </ActionLink>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-3 sm:hidden">
        {visibleItems.map((subscription, index) => (
          <article key={subscription.id} className={cn("rounded-md bg-white/[0.035] p-4", isCurrentSubscription(subscription, index) ? "ring-1 ring-cyan-300/25" : "")}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-white">{subscription.planName}</p>
                <p className="mt-1 text-sm text-slate-400">{formatCurrency(subscription.monthlyPriceBrl)} - {formatCredits(subscription.includedCredits)} creditos</p>
              </div>
              <StatusBadge status={subscription.status} />
            </div>
            <dl className="mt-3 grid gap-2 text-sm text-slate-300">
              <PlanFact label="Inicio" value={formatDate(subscription.currentPeriodStart ?? subscription.createdAt)} />
              <PlanFact label="Renovacao" value={subscription.nextBillingAt ? formatDate(subscription.nextBillingAt) : "Nao agendada"} />
            </dl>
            <div className="mt-3">
              <ActionLink href={subscription.checkoutHref ?? plansHref} icon={ExternalLink} variant={subscription.checkoutHref ? "warning" : "ghost"}>
                {subscription.checkoutHref ? "Finalizar pagamento" : "Gerenciar"}
              </ActionLink>
            </div>
          </article>
        ))}
      </div>

      {hasMore ? <ShowMoreButton total={subscriptions.length} onClick={() => setExpanded(true)} /> : null}
    </div>
  );
}

function CreditsTab({
  transactions,
  usageEvents,
  usageSummary,
}: {
  transactions: AccountData["creditTransactions"];
  usageEvents: AccountData["usageEvents"];
  usageSummary: AccountData["usageSummary"];
}) {
  const { hasMore, setExpanded, visibleItems } = useVisibleItems(transactions);

  if (!transactions.length && !usageEvents.length) {
    return <EmptyState text="Nenhuma movimentacao de creditos foi registrada ainda." />;
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <PlanMetric label="Saldo agora" value={formatCredits(usageSummary.balanceCredits)} />
        <PlanMetric label="Usado no ciclo" value={formatCredits(usageSummary.usedCredits)} />
        <PlanMetric label="Gasto hoje" value={formatCredits(usageSummary.todayChargeCredits)} />
        <PlanMetric label="Gasto 30 dias" value={formatCredits(usageSummary.totalChargeCredits30d)} />
      </div>

      {usageSummary.byCategory.length ? (
        <div className="space-y-3 rounded-md border border-white/10 bg-white/[0.025] p-4">
          <SectionLabel>Resumo por tipo de consumo</SectionLabel>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {usageSummary.byCategory.map((item) => (
              <div key={item.category} className="rounded-md bg-[#081322]/70 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">{item.category}</p>
                    <p className="mt-1 text-xs text-slate-500">{formatCredits(item.events)} evento{item.events === 1 ? "" : "s"}</p>
                  </div>
                  <p className="shrink-0 text-sm font-semibold text-rose-300">-{formatCredits(item.chargeCredits)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="space-y-3">
        <SectionLabel>Movimentacoes da carteira</SectionLabel>
        {transactions.length ? visibleItems.map((transaction) => {
          const positive = transaction.amountCredits >= 0;
          const sign = positive ? "+" : "-";

          return (
            <article key={transaction.id} className="flex flex-col gap-3 border-b border-white/10 pb-3 last:border-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white">{transaction.description ?? transactionTypeLabel(transaction.type)}</p>
                <p className="mt-1 text-sm text-slate-400">{formatDateTime(transaction.createdAt)}</p>
                <p className="mt-1 text-xs text-slate-500">Saldo apos movimentacao: {formatCredits(transaction.balanceAfterCredits)} creditos</p>
              </div>
              <div className="text-left sm:text-right">
                <p className={cn("text-lg font-semibold", positive ? "text-emerald-300" : "text-rose-300")}>
                  {sign}{formatCredits(Math.abs(transaction.amountCredits))}
                </p>
                <p className="text-xs text-slate-500">{positive ? "Entrada" : "Saida"}</p>
              </div>
            </article>
          );
        }) : <EmptyState text="Nenhuma movimentacao de carteira encontrada." />}

        {hasMore ? <ShowMoreButton total={transactions.length} onClick={() => setExpanded(true)} /> : null}
      </div>

      <div className="space-y-3">
        <SectionLabel>Consumo recente dos agentes</SectionLabel>
        {usageEvents.length ? usageEvents.map((event) => (
          <article key={event.id} className="flex flex-col gap-3 rounded-md bg-white/[0.035] p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white">{usageFeatureLabel(event.featureCode)}</p>
              <p className="mt-1 text-sm text-slate-400">{formatDateTime(event.createdAt)}</p>
              <p className="mt-1 truncate text-xs text-slate-500">
                {event.publicCategory}
              </p>
            </div>
            <div className="text-left sm:text-right">
              <p className="text-lg font-semibold text-rose-300">-{formatCredits(event.chargeCredits)}</p>
              <p className="text-xs text-slate-500">{formatUsageUnits(event)}</p>
            </div>
          </article>
        )) : <EmptyState text="Nenhum consumo de agente encontrado ainda." />}
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
      {children}
    </p>
  );
}

function usageFeatureLabel(featureCode: string | null) {
  const labels: Record<string, string> = {
    chat_completion: "Resposta do agente",
    voice_reply_whatsapp: "Resposta por audio",
    text_to_speech: "Audio gerado",
    audio_transcription: "Transcricao de audio",
    media_image_analysis: "Leitura de imagem",
    media_video_analysis: "Leitura de video",
    media_document_analysis: "Leitura de documento",
    human_handoff_detection: "Analise de atendimento",
    conversation_learning: "Memoria de conversa",
    lead_memory: "Memoria do lead",
    clone_memory: "Memoria do agente",
    conversation_state: "Contexto da conversa",
    follow_up_generation: "Follow-up automatico",
    prompt_assistant: "Assistente de prompt",
    clone_profile_import: "Importacao de DNA",
    lead_analysis: "Analise de lead",
    conversation_summary: "Resumo de conversa",
    content_generation: "Conteudo gerado",
    traffic_agent: "Agente de trafego",
    embedding_memory: "Memoria semantica",
  };

  return labels[featureCode ?? ""] ?? featureCode ?? "Consumo de agente";
}

function formatUsageUnits(event: AccountData["usageEvents"][number]) {
  const input = event.inputUnits > 0 ? `${formatCredits(event.inputUnits)} entrada` : null;
  const output = event.outputUnits > 0 ? `${formatCredits(event.outputUnits)} saida` : null;
  return [input, output].filter(Boolean).join(" / ") || "unidades registradas";
}

function CyclesTab({ cycles }: { cycles: AccountData["cycles"] }) {
  const { hasMore, setExpanded, visibleItems } = useVisibleItems(cycles);

  if (!cycles.length) {
    return <EmptyState text="Nenhum ciclo de uso encontrado para esta conta." />;
  }

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {visibleItems.map((cycle) => {
        const percent = usagePercentage(cycle.usedCredits, cycle.includedCredits);

        return (
          <article key={cycle.id} className="rounded-md bg-white/[0.035] p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-base font-semibold text-white">{cycle.planName ?? formatPlanName(cycle.planCode ?? "Ciclo")}</p>
                <p className="mt-1 text-sm text-slate-400">{formatDate(cycle.cycleStart)} ate {formatDate(cycle.cycleEnd)}</p>
              </div>
              <StatusBadge status={cycle.status} />
            </div>
            <div className="mt-4">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="font-medium text-slate-300">{formatCredits(cycle.usedCredits)} de {formatCredits(cycle.includedCredits)} creditos utilizados</span>
                <span className="font-semibold text-white">{Math.round(percent)}%</span>
              </div>
              <ProgressBar value={percent} />
              {cycle.overageCredits > 0 ? (
                <p className="mt-2 text-xs font-semibold text-amber-200">Excedente: {formatCredits(cycle.overageCredits)} creditos</p>
              ) : null}
            </div>
          </article>
        );
      })}

      {hasMore ? (
        <div className="lg:col-span-2">
          <ShowMoreButton total={cycles.length} onClick={() => setExpanded(true)} />
        </div>
      ) : null}
    </div>
  );
}

function Surface({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-lg border border-white/10 bg-[#07101d] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.035),0_22px_60px_rgba(0,0,0,0.2)]", className)}>
      {children}
    </section>
  );
}

function HeaderPill({ icon: Icon, tone, value }: { icon: LucideIcon; tone: "info" | "success"; value: string }) {
  return (
    <span
      className={cn(
        "inline-flex min-h-10 items-center gap-2 rounded-md border px-3 text-sm font-semibold shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]",
        tone === "success"
          ? "border-emerald-300/15 bg-emerald-300/10 text-emerald-200"
          : "border-sky-300/15 bg-sky-300/10 text-sky-100",
      )}
    >
      <Icon className="h-4 w-4" />
      {value}
    </span>
  );
}

function ActionButton({
  children,
  className,
  disabled,
  icon: Icon,
  loading = false,
  variant = "secondary",
  ...props
}: {
  children: ReactNode;
  icon?: LucideIcon;
  loading?: boolean;
  variant?: ActionTone;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={actionButtonClass(variant, className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : Icon ? <Icon className="h-4 w-4" /> : null}
      {children}
    </button>
  );
}

function ActionLink({
  children,
  className,
  external = false,
  href,
  icon: Icon,
  variant = "secondary",
}: {
  children: ReactNode;
  className?: string;
  external?: boolean;
  href: string;
  icon?: LucideIcon;
  variant?: ActionTone;
}) {
  const content = (
    <>
      {Icon ? <Icon className="h-4 w-4" /> : null}
      {children}
    </>
  );
  const linkClassName = actionButtonClass(variant, className);

  if (external) {
    return (
      <a className={linkClassName} href={href} rel="noreferrer" target="_blank">
        {content}
      </a>
    );
  }

  return (
    <Link className={linkClassName} href={href}>
      {content}
    </Link>
  );
}

function actionButtonClass(variant: ActionTone, className?: string) {
  const variantClass = {
    ghost: "border-transparent bg-transparent text-cyan-100 hover:bg-cyan-300/10",
    primary: "border-cyan-300 bg-cyan-300 text-slate-950 hover:bg-cyan-200",
    secondary: "border-white/10 bg-white/[0.055] text-slate-100 hover:bg-white/[0.085]",
    success: "border-emerald-300 bg-emerald-300 text-slate-950 hover:bg-emerald-200",
    warning: "border-amber-300 bg-amber-300 text-slate-950 hover:bg-amber-200",
  }[variant];

  return cn(
    "inline-flex min-h-9 items-center justify-center gap-2 rounded-md border px-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/45 disabled:pointer-events-none disabled:opacity-55",
    variantClass,
    className,
  );
}

function Field({ children, label }: { children: ReactNode; label: string }) {
  return (
    <label className="block min-w-0">
      <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">{label}</span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

const inputClassName = "h-10 w-full rounded-md border border-white/10 bg-[#162238] px-3 text-sm font-medium text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/50 focus:ring-2 focus:ring-cyan-300/15";

function AccountFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 border-b border-white/10 p-4 last:border-b-0 sm:[&:nth-child(2n+1)]:border-r sm:[&:nth-last-child(-n+2)]:border-b-0">
      <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">{label}</dt>
      <dd className="mt-1 break-words text-sm font-semibold text-slate-100">{value}</dd>
    </div>
  );
}

function PlanMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-[#081322]/70 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-base font-semibold text-white">{value}</p>
    </div>
  );
}

function UsageRing({ value }: { value: number }) {
  const percent = Math.round(clamp(value, 0, 100));

  return (
    <div
      className="grid h-28 w-28 place-items-center rounded-full"
      style={{ background: `conic-gradient(#22d3ee ${percent * 3.6}deg, rgba(148,163,184,0.2) 0deg)` }}
      aria-label={`${percent}% utilizado`}
    >
      <div className="grid h-[84px] w-[84px] place-items-center rounded-full bg-[#07101d] text-center">
        <div>
          <p className="text-2xl font-semibold text-white">{percent}%</p>
          <p className="text-xs text-slate-400">utilizado</p>
        </div>
      </div>
    </div>
  );
}

function PlanFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right font-semibold text-slate-100">{value}</dd>
    </div>
  );
}

function Feedback({ children, tone }: { children: ReactNode; tone: "error" | "neutral" | "success" }) {
  return (
    <p
      className={cn(
        "mt-3 text-sm font-medium",
        tone === "success" ? "text-emerald-300" : tone === "error" ? "text-rose-300" : "text-slate-300",
      )}
    >
      {children}
    </p>
  );
}

function ProgressBar({ value }: { value: number }) {
  const percent = clamp(value, 0, 100);

  return (
    <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10" aria-label={`Uso de ${Math.round(percent)}%`}>
      <div className="h-full rounded-full bg-cyan-300" style={{ width: `${percent}%` }} />
    </div>
  );
}

function AccountAvatar({ avatarUrl, name }: { avatarUrl: string | null; name: string }) {
  const [failedAvatarUrl, setFailedAvatarUrl] = useState<string | null>(null);
  const initials = initialsFromName(name);
  const showImage = Boolean(avatarUrl && failedAvatarUrl !== avatarUrl);

  return (
    <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-full border border-white/15 bg-cyan-300/12 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.1)]">
      {showImage && avatarUrl ? (
        <Image
          alt=""
          className="h-full w-full object-cover"
          height={80}
          src={avatarUrl}
          width={80}
          unoptimized
          onError={() => setFailedAvatarUrl(avatarUrl)}
        />
      ) : (
        <div className="grid h-full w-full place-items-center text-3xl font-semibold text-cyan-300">{initials}</div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const tone = statusTone(status);

  return (
    <span className={cn("inline-flex min-h-6 items-center rounded-full border px-2.5 text-xs font-semibold", tone)}>
      {statusLabel(status)}
    </span>
  );
}

function InternalReference({ value }: { value: string }) {
  return (
    <p className="mt-1 text-xs text-slate-500">
      Referencia interna: <span className="font-mono">{value}</span>
    </p>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-md border border-dashed border-white/12 bg-white/[0.025] p-5 text-sm font-medium text-slate-400">
      {text}
    </div>
  );
}

function ShowMoreButton({ onClick, total }: { onClick: () => void; total: number }) {
  return (
    <div className="flex justify-center">
      <ActionButton type="button" variant="secondary" onClick={onClick}>
        Mostrar todos ({total})
      </ActionButton>
    </div>
  );
}

function ErrorState({
  message,
  onRetry,
  refreshing,
}: {
  message: string;
  onRetry: () => void;
  refreshing: boolean;
}) {
  return (
    <Surface>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-rose-400/10 text-rose-200">
            <AlertTriangle className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-base font-semibold text-white">Conta indisponivel</h2>
            <p className="mt-1 text-sm leading-6 text-slate-400">{message}</p>
          </div>
        </div>
        <ActionButton icon={RefreshCw} loading={refreshing} type="button" variant="secondary" onClick={onRetry}>
          Tentar novamente
        </ActionButton>
      </div>
    </Surface>
  );
}

function AccountLoadingState() {
  return (
    <InfinityLoadingPanel
      className="mx-auto max-w-[1380px]"
      label="Carregando minha conta..."
      description="Preparando perfil, seguranca, creditos e faturas."
    />
  );
}

function useVisibleItems<T>(items: T[], limit = LIST_LIMIT) {
  const [expanded, setExpanded] = useState(false);

  return {
    expanded,
    hasMore: !expanded && items.length > limit,
    setExpanded,
    visibleItems: expanded ? items : items.slice(0, limit),
  };
}

function billingTabCount(account: AccountData, tab: BillingTab) {
  if (tab === "payments") return account.payments.length;
  if (tab === "subscriptions") return account.subscriptions.length;
  if (tab === "credits") return account.creditTransactions.length + account.usageEvents.length;
  return account.cycles.length;
}

function getPrimarySubscription(subscriptions: AccountData["subscriptions"]) {
  return subscriptions.find((subscription) => isActiveSubscription(subscription.status) || ["pending", "in_process", "trial_pending"].includes(subscription.status))
    ?? subscriptions[0]
    ?? null;
}

function isActiveSubscription(status: string) {
  return ["active", "paid_active", "trial", "trial_active"].includes(status);
}

function isCurrentSubscription(subscription: AccountData["subscriptions"][number], index: number) {
  return isActiveSubscription(subscription.status) || (index === 0 && !["canceled", "cancelled", "rejected", "refunded"].includes(subscription.status));
}

function trialSummary(access: BillingAccessClientStatus) {
  const isTrial = access.state.startsWith("trial") || access.organizationStatus === "trial";

  if (!isTrial) {
    return null;
  }

  if (typeof access.trialDaysRemaining === "number") {
    return `${access.trialDaysRemaining} dia${access.trialDaysRemaining === 1 ? "" : "s"} restante${access.trialDaysRemaining === 1 ? "" : "s"}`;
  }

  return statusLabel(access.state);
}

function usagePercentage(used: number, included: number) {
  if (!Number.isFinite(used) || !Number.isFinite(included) || included <= 0) {
    return 0;
  }

  return (used / included) * 100;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function initialsFromName(value: string) {
  const parts = value
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 2);

  if (!parts.length) {
    return "CH";
  }

  return parts.map((part) => part[0]?.toUpperCase()).join("");
}

function formatCurrency(value: number) {
  return currencyFormatter.format(Number.isFinite(value) ? value : 0);
}

function formatCredits(value: number) {
  return creditsFormatter.format(Number.isFinite(value) ? value : 0);
}

function formatDate(value: string | null) {
  if (!value) {
    return "Nao informado";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Nao informado";
  }

  return date.toLocaleDateString("pt-BR");
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "Nao informado";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Nao informado";
  }

  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}

function formatPlanName(value: string | null | undefined) {
  const normalized = String(value ?? "").trim();

  if (!normalized) {
    return "Plano";
  }

  return normalized
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function internalReference(values: Array<string | null | undefined>) {
  const cleaned = values
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);

  return Array.from(new Set(cleaned)).join(" - ");
}

function statusLabel(status: string | null | undefined) {
  const labels: Record<string, string> = {
    active: "Ativo",
    approved: "Aprovado",
    blocked: "Bloqueado",
    canceled: "Cancelado",
    cancelled: "Cancelado",
    complete: "Completo",
    incomplete: "Incompleto",
    inactive: "Inativo",
    in_process: "Processando",
    open: "Aberto",
    paid: "Pago",
    paid_active: "Ativo",
    paid_expired: "Pagamento expirado",
    paid_no_credits: "Sem creditos",
    past_due: "Atrasado",
    paused: "Pausado",
    pending: "Pendente",
    rejected: "Recusado",
    refunded: "Reembolsado",
    replaced_before_payment: "Substituido antes do pagamento",
    trial: "Teste",
    trial_active: "Teste ativo",
    trial_expired: "Teste expirado",
    trial_low_credits: "Teste com poucos creditos",
    trial_no_credits: "Teste sem creditos",
    trial_pending: "Teste pendente",
  };

  const normalized = String(status ?? "").trim();

  return labels[normalized] ?? (normalized ? normalized.replaceAll("_", " ") : "Sem status");
}

function transactionTypeLabel(type: string) {
  const labels: Record<string, string> = {
    admin_adjustment: "Ajuste manual",
    bonus: "Bonus",
    credit_pack: "Pacote de creditos",
    debit: "Uso de creditos",
    grant: "Credito concedido",
    refund: "Estorno",
    trial_grant: "Credito de teste",
  };

  return labels[type] ?? type.replaceAll("_", " ");
}

function statusTone(status: string) {
  if (["active", "approved", "paid", "paid_active", "trial", "trial_active", "complete"].includes(status)) {
    return "border-emerald-300/30 bg-emerald-300/12 text-emerald-200";
  }

  if (["pending", "incomplete", "in_process", "trial_pending", "trial_low_credits"].includes(status)) {
    return "border-amber-300/30 bg-amber-300/12 text-amber-200";
  }

  if (["open", "paused"].includes(status)) {
    return "border-sky-300/30 bg-sky-300/12 text-sky-200";
  }

  if (["refunded"].includes(status)) {
    return "border-violet-300/30 bg-violet-300/12 text-violet-200";
  }

  if (["blocked", "rejected", "canceled", "cancelled", "past_due", "paid_expired", "trial_expired", "trial_no_credits"].includes(status)) {
    return "border-rose-300/30 bg-rose-300/12 text-rose-200";
  }

  return "border-slate-300/20 bg-slate-300/10 text-slate-200";
}
