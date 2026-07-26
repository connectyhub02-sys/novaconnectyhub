"use client";

import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  AlertTriangle,
  Building2,
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
  UserRound,
  WalletCards,
  type LucideIcon,
} from "lucide-react";
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

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  currency: "BRL",
  style: "currency",
});

const creditsFormatter = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 0,
});

export function AccountConsole() {
  const [account, setAccount] = useState<AccountData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);

  const loadAccount = useCallback(async (mode: "initial" | "refresh" = "initial") => {
    if (mode === "initial") {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    setError(null);

    try {
      const response = await fetch("/api/dashboard/account", { cache: "no-store" });
      const data = (await response.json().catch(() => null)) as AccountApiResponse | null;

      if (!response.ok || !data?.account) {
        throw new Error(data?.error ?? "Nao foi possivel carregar sua conta.");
      }

      setAccount(data.account);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Erro ao carregar sua conta.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadAccount();
    }, 0);

    return () => window.clearTimeout(timer);
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
      <section className="space-y-6">
        <AccountHeader onRefresh={() => loadAccount("refresh")} refreshing={refreshing} />
        <div className="rounded-2xl border border-rose-300/25 bg-rose-400/10 p-5 text-rose-100">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <h2 className="text-sm font-black uppercase tracking-[0.18em]">Conta indisponivel</h2>
              <p className="mt-2 text-sm leading-6 text-rose-100/80">{error}</p>
            </div>
          </div>
        </div>
      </section>
    );
  }

  if (!account) {
    return null;
  }

  const pendingCheckoutHref = account.actions.pendingCheckoutHref;

  return (
    <section className="space-y-6">
      <AccountHeader onRefresh={() => loadAccount("refresh")} refreshing={refreshing} />

      <div className="grid gap-3 md:grid-cols-3">
        <MetricPanel
          detail={completionSummary ?? "Cadastro"}
          icon={ShieldCheck}
          tone={account.profile.completion.isComplete ? "emerald" : "amber"}
          value={account.profile.completion.isComplete ? "Liberado" : "Pendente"}
        />
        <MetricPanel
          detail={statusLabel(account.organization.status)}
          icon={CreditCard}
          tone="cyan"
          value={account.organization.planCode}
        />
        <MetricPanel
          detail={`${formatCredits(account.wallet.lifetimeUsedCredits)} usados`}
          icon={WalletCards}
          tone={account.wallet.balanceCredits > 0 ? "blue" : "rose"}
          value={`${formatCredits(account.wallet.balanceCredits)} creditos`}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
        <ProfilePanel
          key={[
            account.profile.phoneNormalized ?? "",
            account.profile.phoneVerified ? "verified" : "pending",
          ].join(":")}
          account={account}
          avatarUploading={avatarUploading}
          avatarError={avatarError}
          onAvatarUpload={handleAvatarUpload}
          onAccountChange={setAccount}
          onReload={() => loadAccount("refresh")}
        />
        <BillingPanel account={account} pendingCheckoutHref={pendingCheckoutHref} />
      </div>

      <SecurityPanel email={account.profile.email} onReload={() => loadAccount("refresh")} />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
        <PaymentsPanel payments={account.payments} />
        <CreditHistoryPanel transactions={account.creditTransactions} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <SubscriptionsPanel subscriptions={account.subscriptions} />
        <CyclesPanel cycles={account.cycles} />
      </div>
    </section>
  );
}

function AccountHeader({ onRefresh, refreshing }: { onRefresh: () => void; refreshing: boolean }) {
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <div className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-cyan-300">
          Client OS / Minha conta
        </div>
        <h1 className="mt-3 text-[28px] font-black leading-tight text-white sm:text-[36px]">
          Minha conta
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
          Veja seus dados, status do cadastro, plano ativo, creditos e historico financeiro do workspace.
        </p>
      </div>
      <button
        className="inline-flex h-11 items-center justify-center rounded-xl border border-cyan-200/20 bg-cyan-300/10 px-4 text-sm font-bold text-cyan-100 transition hover:bg-cyan-300/15 disabled:cursor-wait disabled:opacity-70"
        disabled={refreshing}
        type="button"
        onClick={onRefresh}
      >
        {refreshing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
        Atualizar
      </button>
    </div>
  );
}

function ProfilePanel({
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
    <Panel>
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
        <AccountAvatar avatarUrl={profile.avatarUrl} name={profile.fullName ?? profile.email ?? account.organization.name} />
        <div className="min-w-0 flex-1">
          <form className="space-y-5" onSubmit={handleProfileSubmit}>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="truncate text-xl font-black text-white">{profile.fullName ?? "Usuario ConnectyHub"}</h2>
                  <StatusBadge status={profile.completion.isComplete ? "approved" : "pending"} />
                </div>
                <p className="mt-1 truncate text-sm text-slate-400">{profile.email ?? "email nao informado"}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  className="inline-flex h-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.06] px-3 text-xs font-bold text-slate-100 transition hover:bg-white/[0.09]"
                  type="button"
                  onClick={() => {
                    setEditingProfile((current) => !current);
                    setProfileError(null);
                    setProfileMessage(null);
                  }}
                >
                  <Edit3 className="mr-2 h-3.5 w-3.5" />
                  {editingProfile ? "Cancelar" : "Editar dados"}
                </button>
                <label className="inline-flex h-10 cursor-pointer items-center justify-center rounded-xl border border-white/10 bg-white/[0.06] px-3 text-xs font-bold text-slate-100 transition hover:bg-white/[0.09]">
                  {avatarUploading ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Camera className="mr-2 h-3.5 w-3.5" />}
                  Trocar foto
                  <input accept="image/jpeg,image/png,image/webp" className="hidden" type="file" onChange={onAvatarUpload} />
                </label>
              </div>
            </div>

            {avatarError ? <p className="text-xs font-semibold text-rose-300">{avatarError}</p> : null}

            {editingProfile ? (
              <div className="grid gap-3 md:grid-cols-2">
                <label className="block">
                  <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Nome</span>
                  <input
                    className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-white/[0.06] px-3 text-sm font-semibold text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/45"
                    maxLength={120}
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                  />
                </label>
                <label className="block">
                  <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Empresa</span>
                  <input
                    className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-white/[0.06] px-3 text-sm font-semibold text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/45"
                    maxLength={120}
                    value={companyName}
                    onChange={(event) => setCompanyName(event.target.value)}
                  />
                </label>
                <div className="md:col-span-2 flex flex-wrap items-center gap-3">
                  <button
                    className="inline-flex h-11 items-center justify-center rounded-xl bg-cyan-300 px-4 text-sm font-black text-slate-950 transition hover:bg-cyan-200 disabled:cursor-wait disabled:opacity-70"
                    disabled={profileSaving}
                    type="submit"
                  >
                    {profileSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    Salvar dados
                  </button>
                  {profileMessage ? <span className="text-xs font-bold text-emerald-300">{profileMessage}</span> : null}
                  {profileError ? <span className="text-xs font-bold text-rose-300">{profileError}</span> : null}
                </div>
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                <InfoTile icon={UserRound} label="WhatsApp" value={profile.phone ?? "Nao informado"} />
                <InfoTile icon={ShieldCheck} label="CPF" value={profile.cpfPreview ?? "Pendente"} />
                <InfoTile icon={Building2} label="Empresa" value={profile.companyName ?? account.organization.name} />
                <InfoTile icon={CheckCircle2} label="Cadastro" value={profile.signupCompletedAt ? formatDate(profile.signupCompletedAt) : "Em andamento"} />
              </div>
            )}
          </form>

          <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.045] p-4">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-emerald-300/20 bg-emerald-300/10 text-emerald-200">
                <Smartphone className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
                  <label className="min-w-0 flex-1">
                    <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Alterar WhatsApp</span>
                    <input
                      className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-white/[0.06] px-3 text-sm font-semibold text-white outline-none transition placeholder:text-slate-500 focus:border-emerald-300/45"
                      inputMode="tel"
                      placeholder="(47) 99999-9999"
                      value={phone}
                      onChange={(event) => handlePhoneChange(event.target.value)}
                    />
                  </label>
                  <button
                    className="inline-flex h-11 items-center justify-center rounded-xl border border-emerald-300/25 bg-emerald-300/10 px-4 text-sm font-black text-emerald-100 transition hover:bg-emerald-300/15 disabled:cursor-wait disabled:opacity-70"
                    disabled={phoneWorking}
                    type="button"
                    onClick={handlePhoneCheck}
                  >
                    {phoneWorking && phoneCheck.state === "checking" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
                    Validar
                  </button>
                  <button
                    className="inline-flex h-11 items-center justify-center rounded-xl bg-emerald-300 px-4 text-sm font-black text-slate-950 transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={phoneWorking || phoneIsCurrent || !phoneValidated}
                    type="button"
                    onClick={handlePhoneSend}
                  >
                    {phoneWorking && phoneStep === "idle" && phoneValidated ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                    Enviar codigo
                  </button>
                </div>

                {phoneCheck.message ? (
                  <p className={cn("mt-3 text-xs font-bold", phoneCheck.state === "valid" ? "text-emerald-300" : phoneCheck.state === "not_found" || phoneCheck.state === "error" ? "text-rose-300" : "text-slate-300")}>
                    {phoneCheck.message}
                  </p>
                ) : null}

                {phoneStep === "code" ? (
                  <form className="mt-4 flex flex-col gap-3 sm:flex-row" onSubmit={handlePhoneVerify}>
                    <input
                      className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.06] px-3 font-mono text-sm font-black tracking-[0.28em] text-white outline-none transition placeholder:tracking-normal placeholder:text-slate-500 focus:border-emerald-300/45 sm:max-w-[180px]"
                      inputMode="numeric"
                      maxLength={6}
                      placeholder="000000"
                      value={phoneCode}
                      onChange={(event) => setPhoneCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                    />
                    <button
                      className="inline-flex h-11 items-center justify-center rounded-xl bg-cyan-300 px-4 text-sm font-black text-slate-950 transition hover:bg-cyan-200 disabled:cursor-wait disabled:opacity-70"
                      disabled={phoneWorking}
                      type="submit"
                    >
                      {phoneWorking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                      Confirmar
                    </button>
                  </form>
                ) : null}

                {phoneMessage ? <p className="mt-3 text-xs font-bold text-emerald-300">{phoneMessage}</p> : null}
                {phoneError ? <p className="mt-3 text-xs font-bold text-rose-300">{phoneError}</p> : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Panel>
  );
}

function BillingPanel({ account, pendingCheckoutHref }: { account: AccountData; pendingCheckoutHref: string | null }) {
  const access = account.billingAccess;
  const activeSubscription = account.subscriptions[0] ?? null;

  return (
    <Panel>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-300">Plano e creditos</div>
          <h2 className="mt-2 text-xl font-black text-white">{activeSubscription?.planName ?? account.organization.planCode}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">{access.bannerDescription}</p>
        </div>
        <StatusBadge status={account.organization.status} />
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <InfoTile icon={WalletCards} label="Saldo" value={`${formatCredits(account.wallet.balanceCredits)} creditos`} />
        <InfoTile icon={ReceiptText} label="Uso atual" value={`${formatCredits(access.usedCredits)} / ${formatCredits(access.includedCredits)}`} />
        <InfoTile icon={CreditCard} label="Mensalidade" value={formatCurrency(activeSubscription?.monthlyPriceBrl ?? 0)} />
        <InfoTile icon={ShieldCheck} label="Proxima cobranca" value={activeSubscription?.nextBillingAt ? formatDate(activeSubscription.nextBillingAt) : "Nao agendada"} />
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <Link
          className="inline-flex h-11 items-center justify-center rounded-xl bg-cyan-300 px-4 text-sm font-black text-slate-950 transition hover:bg-cyan-200"
          href={account.actions.plansHref}
        >
          Ver planos
        </Link>
        {pendingCheckoutHref ? (
          <Link
            className="inline-flex h-11 items-center justify-center rounded-xl border border-amber-300/35 bg-amber-300/12 px-4 text-sm font-black text-amber-100 transition hover:bg-amber-300/18"
            href={pendingCheckoutHref}
          >
            Finalizar pagamento
            <ExternalLink className="ml-2 h-4 w-4" />
          </Link>
        ) : null}
      </div>
    </Panel>
  );
}

function SecurityPanel({ email, onReload }: { email: string | null; onReload: () => Promise<void> }) {
  const [nextEmail, setNextEmail] = useState(email ?? "");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [emailWorking, setEmailWorking] = useState(false);
  const [passwordWorking, setPasswordWorking] = useState(false);
  const [emailMessage, setEmailMessage] = useState<string | null>(null);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

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
    <Panel>
      <div className="flex flex-col gap-5 xl:flex-row">
        <div className="xl:w-[260px]">
          <PanelTitle icon={ShieldCheck} label="Seguranca" />
          <p className="mt-3 text-sm leading-6 text-slate-400">
            Gerencie acesso, email de login e senha da sua conta.
          </p>
        </div>

        <div className="grid min-w-0 flex-1 gap-4 lg:grid-cols-2">
          <form className="rounded-2xl border border-white/10 bg-white/[0.045] p-4" onSubmit={handleEmailSubmit}>
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl border border-cyan-300/20 bg-cyan-300/10 text-cyan-200">
                <Mail className="h-5 w-5" />
              </span>
              <div>
                <h3 className="text-sm font-black text-white">Email de acesso</h3>
                <p className="text-xs text-slate-400">{email ?? "sem email atual"}</p>
              </div>
            </div>
            <label className="mt-4 block">
              <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Novo email</span>
              <input
                className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-white/[0.06] px-3 text-sm font-semibold text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/45"
                inputMode="email"
                type="email"
                value={nextEmail}
                onChange={(event) => {
                  setNextEmail(event.target.value);
                  setEmailError(null);
                  setEmailMessage(null);
                }}
              />
            </label>
            <button
              className="mt-4 inline-flex h-11 items-center justify-center rounded-xl bg-cyan-300 px-4 text-sm font-black text-slate-950 transition hover:bg-cyan-200 disabled:cursor-wait disabled:opacity-70"
              disabled={emailWorking}
              type="submit"
            >
              {emailWorking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              Alterar email
            </button>
            {emailMessage ? <p className="mt-3 text-xs font-bold text-emerald-300">{emailMessage}</p> : null}
            {emailError ? <p className="mt-3 text-xs font-bold text-rose-300">{emailError}</p> : null}
          </form>

          <form className="rounded-2xl border border-white/10 bg-white/[0.045] p-4" onSubmit={handlePasswordSubmit}>
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl border border-emerald-300/20 bg-emerald-300/10 text-emerald-200">
                <KeyRound className="h-5 w-5" />
              </span>
              <div>
                <h3 className="text-sm font-black text-white">Senha</h3>
                <p className="text-xs text-slate-400">Minimo de 6 caracteres</p>
              </div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Nova senha</span>
                <input
                  className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-white/[0.06] px-3 text-sm font-semibold text-white outline-none transition placeholder:text-slate-500 focus:border-emerald-300/45"
                  maxLength={128}
                  type="password"
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    setPasswordError(null);
                    setPasswordMessage(null);
                  }}
                />
              </label>
              <label className="block">
                <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Confirmar</span>
                <input
                  className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-white/[0.06] px-3 text-sm font-semibold text-white outline-none transition placeholder:text-slate-500 focus:border-emerald-300/45"
                  maxLength={128}
                  type="password"
                  value={passwordConfirm}
                  onChange={(event) => {
                    setPasswordConfirm(event.target.value);
                    setPasswordError(null);
                    setPasswordMessage(null);
                  }}
                />
              </label>
            </div>
            <button
              className="mt-4 inline-flex h-11 items-center justify-center rounded-xl bg-emerald-300 px-4 text-sm font-black text-slate-950 transition hover:bg-emerald-200 disabled:cursor-wait disabled:opacity-70"
              disabled={passwordWorking}
              type="submit"
            >
              {passwordWorking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Alterar senha
            </button>
            {passwordMessage ? <p className="mt-3 text-xs font-bold text-emerald-300">{passwordMessage}</p> : null}
            {passwordError ? <p className="mt-3 text-xs font-bold text-rose-300">{passwordError}</p> : null}
          </form>
        </div>
      </div>
    </Panel>
  );
}

function PaymentsPanel({ payments }: { payments: AccountData["payments"] }) {
  return (
    <Panel>
      <PanelTitle icon={ReceiptText} label="Historico de pagamentos" />
      <div className="mt-4 space-y-3">
        {payments.length ? payments.map((payment) => (
          <div key={payment.id} className="rounded-2xl border border-white/10 bg-white/[0.045] p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-mono text-sm font-black text-white">{formatCurrency(payment.amountBrl)}</p>
                  <StatusBadge status={payment.status} />
                </div>
                <p className="mt-1 truncate text-xs text-slate-400">
                  {payment.planCode ?? "Plano"} - {payment.providerStatus ?? payment.invoiceStatus ?? "sem status externo"}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-xs font-semibold text-slate-300">{formatDateTime(payment.paidAt ?? payment.createdAt)}</span>
                {payment.invoiceHref ? (
                  <Link className="rounded-lg border border-cyan-300/25 bg-cyan-300/10 px-3 py-2 text-xs font-black text-cyan-100" href={payment.invoiceHref}>
                    Fatura
                  </Link>
                ) : null}
                {payment.receiptUrl ? (
                  <a
                    className="rounded-lg border border-emerald-300/25 bg-emerald-300/10 px-3 py-2 text-xs font-black text-emerald-100"
                    href={payment.receiptUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Comprovante
                  </a>
                ) : null}
                {payment.checkoutHref ? (
                  <Link className="rounded-lg bg-amber-300 px-3 py-2 text-xs font-black text-slate-950" href={payment.checkoutHref}>
                    Pagar
                  </Link>
                ) : null}
              </div>
            </div>
          </div>
        )) : <EmptyState text="Nenhum pagamento encontrado para esta conta." />}
      </div>
    </Panel>
  );
}

function CreditHistoryPanel({ transactions }: { transactions: AccountData["creditTransactions"] }) {
  return (
    <Panel>
      <PanelTitle icon={WalletCards} label="Historico de creditos" />
      <div className="mt-4 space-y-3">
        {transactions.length ? transactions.map((transaction) => {
          const positive = transaction.amountCredits > 0;

          return (
            <div key={transaction.id} className="rounded-2xl border border-white/10 bg-white/[0.045] p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-white">
                    {transaction.description ?? transactionTypeLabel(transaction.type)}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    Saldo depois: {formatCredits(transaction.balanceAfterCredits)} - {formatDateTime(transaction.createdAt)}
                  </p>
                </div>
                <span className={cn("font-mono text-sm font-black", positive ? "text-emerald-300" : "text-rose-300")}>
                  {positive ? "+" : ""}{formatCredits(transaction.amountCredits)}
                </span>
              </div>
            </div>
          );
        }) : <EmptyState text="Nenhuma movimentacao de creditos ainda." />}
      </div>
    </Panel>
  );
}

function SubscriptionsPanel({ subscriptions }: { subscriptions: AccountData["subscriptions"] }) {
  return (
    <Panel>
      <PanelTitle icon={CreditCard} label="Assinaturas" />
      <div className="mt-4 space-y-3">
        {subscriptions.length ? subscriptions.map((subscription) => (
          <div key={subscription.id} className="rounded-2xl border border-white/10 bg-white/[0.045] p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-white">{subscription.planName}</p>
                <p className="mt-1 text-xs text-slate-400">
                  {formatCurrency(subscription.monthlyPriceBrl)} - {formatCredits(subscription.includedCredits)} creditos
                </p>
              </div>
              <StatusBadge status={subscription.status} />
            </div>
          </div>
        )) : <EmptyState text="Nenhuma assinatura registrada." />}
      </div>
    </Panel>
  );
}

function CyclesPanel({ cycles }: { cycles: AccountData["cycles"] }) {
  return (
    <Panel>
      <PanelTitle icon={ShieldCheck} label="Ciclos de uso" />
      <div className="mt-4 space-y-3">
        {cycles.length ? cycles.map((cycle) => (
          <div key={cycle.id} className="rounded-2xl border border-white/10 bg-white/[0.045] p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-white">{cycle.planName ?? cycle.planCode ?? "Ciclo"}</p>
                <p className="mt-1 text-xs text-slate-400">
                  {formatDate(cycle.cycleStart)} ate {formatDate(cycle.cycleEnd)}
                </p>
              </div>
              <div className="text-right">
                <p className="font-mono text-sm font-black text-white">{formatCredits(cycle.usedCredits)}</p>
                <p className="text-[11px] text-slate-400">de {formatCredits(cycle.includedCredits)}</p>
              </div>
            </div>
          </div>
        )) : <EmptyState text="Nenhum ciclo de uso encontrado." />}
      </div>
    </Panel>
  );
}

function MetricPanel({
  detail,
  icon: Icon,
  tone,
  value,
}: {
  detail: string;
  icon: LucideIcon;
  tone: "emerald" | "amber" | "cyan" | "blue" | "rose";
  value: string;
}) {
  const toneClass = {
    amber: "border-amber-300/20 bg-amber-300/10 text-amber-200",
    blue: "border-sky-300/20 bg-sky-300/10 text-sky-200",
    cyan: "border-cyan-300/20 bg-cyan-300/10 text-cyan-200",
    emerald: "border-emerald-300/20 bg-emerald-300/10 text-emerald-200",
    rose: "border-rose-300/20 bg-rose-300/10 text-rose-200",
  }[tone];

  return (
    <div className={cn("rounded-2xl border p-4", toneClass)}>
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/10">
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-lg font-black text-white">{value}</p>
          <p className="truncate text-xs font-semibold opacity-80">{detail}</p>
        </div>
      </div>
    </div>
  );
}

function Panel({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#0c1422]/88 p-5 shadow-[0_22px_80px_rgba(0,0,0,0.24)]">
      {children}
    </div>
  );
}

function PanelTitle({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid h-10 w-10 place-items-center rounded-xl border border-cyan-300/20 bg-cyan-300/10 text-cyan-200">
        <Icon className="h-5 w-5" />
      </span>
      <h2 className="text-lg font-black text-white">{label}</h2>
    </div>
  );
}

function InfoTile({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-4">
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" />
        <div className="min-w-0">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">{label}</p>
          <p className="mt-1 break-words text-sm font-bold text-slate-100">{value}</p>
        </div>
      </div>
    </div>
  );
}

function AccountAvatar({ avatarUrl, name }: { avatarUrl: string | null; name: string }) {
  const [failedAvatarUrl, setFailedAvatarUrl] = useState<string | null>(null);
  const initials = initialsFromName(name);
  const showImage = Boolean(avatarUrl && failedAvatarUrl !== avatarUrl);

  return (
    <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-2xl border border-cyan-200/20 bg-cyan-300/12">
      {showImage && avatarUrl ? (
        <Image
          alt=""
          className="h-full w-full object-cover"
          height={96}
          src={avatarUrl}
          width={96}
          onError={() => setFailedAvatarUrl(avatarUrl)}
        />
      ) : (
        <div className="grid h-full w-full place-items-center text-2xl font-black text-cyan-100">{initials}</div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const tone = statusTone(status);

  return (
    <span className={cn("inline-flex min-h-7 items-center rounded-full border px-2.5 font-mono text-[10px] font-black uppercase tracking-wide", tone)}>
      {statusLabel(status)}
    </span>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/12 bg-white/[0.035] p-5 text-sm font-semibold text-slate-400">
      {text}
    </div>
  );
}

function AccountLoadingState() {
  return (
    <section className="space-y-6">
      <AccountHeader onRefresh={() => undefined} refreshing={true} />
      <div className="grid gap-3 md:grid-cols-3">
        {[0, 1, 2].map((item) => (
          <div key={item} className="h-24 animate-pulse rounded-2xl border border-white/10 bg-white/[0.05]" />
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <div className="h-80 animate-pulse rounded-2xl border border-white/10 bg-white/[0.05]" />
        <div className="h-80 animate-pulse rounded-2xl border border-white/10 bg-white/[0.05]" />
      </div>
    </section>
  );
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

function statusLabel(status: string | null | undefined) {
  const labels: Record<string, string> = {
    active: "Ativo",
    approved: "Aprovado",
    canceled: "Cancelado",
    complete: "Completo",
    incomplete: "Incompleto",
    in_process: "Processando",
    paid: "Pago",
    past_due: "Atrasado",
    paused: "Pausado",
    pending: "Pendente",
    rejected: "Recusado",
    refunded: "Reembolsado",
    trial: "Teste",
    trial_expired: "Teste expirado",
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
  if (["active", "approved", "paid", "trial", "complete"].includes(status)) {
    return "border-emerald-300/30 bg-emerald-300/12 text-emerald-200";
  }

  if (["pending", "incomplete", "in_process", "trial_pending"].includes(status)) {
    return "border-amber-300/30 bg-amber-300/12 text-amber-200";
  }

  if (["rejected", "canceled", "past_due", "trial_expired"].includes(status)) {
    return "border-rose-300/30 bg-rose-300/12 text-rose-200";
  }

  return "border-slate-300/20 bg-slate-300/10 text-slate-200";
}
