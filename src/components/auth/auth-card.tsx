"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { AlertTriangle, ArrowRight, Building2, CheckCircle2, Loader2, LockKeyhole, Mail, Phone, UserRound } from "lucide-react";
import { ConnectyLogo } from "@/components/brand/connecty-logo";
import { formatBrazilPhoneInput, formatCnpjInput, formatCpfInput, normalizeBrazilPhoneForApi } from "@/lib/account/input-format";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type AuthMode = "login" | "signup";
type SignupAccountType = "person" | "company";

type WhatsappCheckState = {
  state: "idle" | "incomplete" | "checking" | "valid" | "not_found" | "error";
  phoneNormalized: string | null;
  message: string | null;
};

export function AuthCard({
  mode,
  supabaseConfigured,
  nextPath = "/dashboard",
  initialEmail = "",
}: {
  mode: AuthMode;
  supabaseConfigured: boolean;
  nextPath?: string;
  initialEmail?: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [accountType, setAccountType] = useState<SignupAccountType>("person");
  const [companyName, setCompanyName] = useState("");
  const [phone, setPhone] = useState("");
  const [documentValue, setDocumentValue] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [awaitingPhoneVerification, setAwaitingPhoneVerification] = useState(false);
  const [trialWhatsappOptIn, setTrialWhatsappOptIn] = useState(true);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [remoteWhatsappCheck, setRemoteWhatsappCheck] = useState<WhatsappCheckState | null>(null);
  const [manualSignupOpen, setManualSignupOpen] = useState(mode !== "signup");

  const isSignup = mode === "signup";
  const benefitItems = ["Sessao persistente", "Painel do cliente", "Credenciais seguras"];
  const documentType = accountType === "company" ? "cnpj" : "cpf";
  const documentLabel = accountType === "company" ? "CNPJ" : "CPF";
  const showCredentialForm = !isSignup || manualSignupOpen || awaitingPhoneVerification;
  const currentPhoneForVerification = normalizeBrazilPhoneForApi(phone);
  const whatsappCheck = useMemo<WhatsappCheckState>(() => {
    if (!isSignup || awaitingPhoneVerification) {
      return {
        state: "idle",
        phoneNormalized: null,
        message: null,
      };
    }

    if (!phone.trim()) {
      return {
        state: "idle",
        phoneNormalized: null,
        message: "Digite DDD + numero para validar o WhatsApp.",
      };
    }

    if (!currentPhoneForVerification) {
      const localLength = getBrazilPhoneLocalDigitCount(phone);

      return {
        state: "incomplete",
        phoneNormalized: null,
        message: localLength >= 10
          ? "Use um WhatsApp valido com DDD. Ex.: (47) 99999-9999."
          : "Complete o WhatsApp com DDD para validar.",
      };
    }

    if (remoteWhatsappCheck?.phoneNormalized === currentPhoneForVerification) {
      return remoteWhatsappCheck;
    }

    return {
      state: "idle",
      phoneNormalized: currentPhoneForVerification,
      message: "Aguardando validacao do WhatsApp.",
    };
  }, [awaitingPhoneVerification, currentPhoneForVerification, isSignup, phone, remoteWhatsappCheck]);
  const whatsappValidated = !isSignup
    || awaitingPhoneVerification
    || (whatsappCheck.state === "valid" && whatsappCheck.phoneNormalized === currentPhoneForVerification);

  useEffect(() => {
    if (!isSignup || awaitingPhoneVerification || !currentPhoneForVerification) {
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setRemoteWhatsappCheck({
        state: "checking",
        phoneNormalized: currentPhoneForVerification,
        message: "Verificando se este numero possui WhatsApp...",
      });

      try {
        const response = await fetch("/api/account/phone-verification/public-check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone: currentPhoneForVerification }),
          signal: controller.signal,
        });
        const data = (await response.json().catch(() => null)) as {
          exists?: boolean;
          error?: string;
          phoneNormalized?: string;
        } | null;

        if (!response.ok) {
          throw new Error(data?.error ?? "Nao foi possivel validar o WhatsApp.");
        }

        if (data?.exists) {
          setRemoteWhatsappCheck({
            state: "valid",
            phoneNormalized: data.phoneNormalized ?? currentPhoneForVerification,
            message: "WhatsApp encontrado. Agora voce pode criar a conta.",
          });
          return;
        }

        setRemoteWhatsappCheck({
          state: "not_found",
          phoneNormalized: currentPhoneForVerification,
          message: "Nao encontramos WhatsApp ativo neste numero.",
        });
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }

        setRemoteWhatsappCheck({
          state: "error",
          phoneNormalized: currentPhoneForVerification,
          message: error instanceof Error ? error.message : "Nao foi possivel validar o WhatsApp.",
        });
      }
    }, 650);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [awaitingPhoneVerification, currentPhoneForVerification, isSignup]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("loading");
    setMessage("");

    if (!supabaseConfigured) {
      setStatus("error");
      setMessage("Configure NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY para ativar login.");
      return;
    }

    try {
      const supabase = createClient();

      if (awaitingPhoneVerification) {
        const phoneForVerification = normalizeBrazilPhoneForApi(phone);

        if (!phoneForVerification) {
          setStatus("error");
          setMessage("Informe um WhatsApp valido com DDD. Ex.: (47) 99999-9999.");
          return;
        }

        const response = await fetch("/api/account/phone-verification/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: verificationCode }),
        });
        const data = (await response.json().catch(() => null)) as { error?: string } | null;

        if (!response.ok) {
          setStatus("error");
          setMessage(data?.error ?? "Nao foi possivel validar o codigo.");
          return;
        }

        const bootstrap = await bootstrapAccount();
        router.replace(resolvePostLoginPath(nextPath, bootstrap?.redirectPath));
        router.refresh();
        return;
      }

      if (isSignup) {
        const phoneForVerification = normalizeBrazilPhoneForApi(phone);

        if (accountType === "company" && companyName.trim().length < 2) {
          setStatus("error");
          setMessage("Informe o nome da empresa.");
          return;
        }

        if (!phoneForVerification) {
          setStatus("error");
          setMessage("Informe um WhatsApp valido com DDD. Ex.: (47) 99999-9999.");
          return;
        }

        if (!whatsappValidated) {
          setStatus("error");
          setMessage("Valide um WhatsApp ativo antes de criar a conta.");
          return;
        }

        const redirectTo = buildAuthCallbackUrl(nextPath);
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: redirectTo,
            data: {
              full_name: fullName,
              account_type: accountType,
              company_name: accountType === "company" ? companyName : null,
              password_set_at: new Date().toISOString(),
              trial_whatsapp_opt_in: trialWhatsappOptIn,
              trial_whatsapp_opt_in_at: trialWhatsappOptIn ? new Date().toISOString() : null,
              trial_whatsapp_opt_in_source: "signup_trial_form",
            },
          },
        });

        if (error) {
          const alreadyRegistered = error.message.toLowerCase().includes("already");
          setStatus("error");
          setMessage(
            alreadyRegistered
              ? "Este email parece ja estar cadastrado. Entre com sua senha na tela de login."
              : error.message,
          );

          if (alreadyRegistered) {
            router.push(`/login?email=${encodeURIComponent(email)}&next=${encodeURIComponent(nextPath)}`);
          }

          return;
        }

        if (data.session) {
          await saveSignupCompletion({
            fullName,
            companyName: accountType === "company" ? companyName : null,
            accountType,
            document: documentValue,
            documentType,
            passwordSet: true,
          });
          await requestPhoneVerification(phoneForVerification);
          setAwaitingPhoneVerification(true);
          setStatus("success");
          setMessage("Enviamos um codigo para seu WhatsApp. Confirme para liberar o teste gratis.");
          return;
        }

        setStatus("success");
        setMessage("Cadastro iniciado. Confira seu email para confirmar a conta e entrar no painel.");
        return;
      }

      const { error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        setStatus("error");
        setMessage(error.message);
        return;
      }

      const bootstrap = await bootstrapAccount();
      router.replace(resolvePostLoginPath(nextPath, bootstrap?.redirectPath));
      router.refresh();
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Nao foi possivel autenticar agora.");
    }
  }

  async function handleGoogleSignIn() {
    setStatus("loading");
    setMessage("");

    if (!supabaseConfigured) {
      setStatus("error");
      setMessage("Configure NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY para ativar login.");
      return;
    }

    try {
      const supabase = createClient();
      const redirectTo = buildAuthCallbackUrl(nextPath);
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
          queryParams: {
            prompt: "select_account",
          },
        },
      });

      if (error) {
        setStatus("error");
        setMessage(error.message);
      }
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Nao foi possivel entrar com Google.");
    }
  }

  async function resendPhoneVerification() {
    setStatus("loading");
    setMessage("");

    try {
      const phoneForVerification = normalizeBrazilPhoneForApi(phone);

      if (!phoneForVerification) {
        throw new Error("Informe um WhatsApp valido com DDD. Ex.: (47) 99999-9999.");
      }

      await requestPhoneVerification(phoneForVerification);
      setStatus("success");
      setMessage("Codigo reenviado para seu WhatsApp.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Nao foi possivel enviar o codigo.");
    }
  }

  return (
    <div className="min-h-screen bg-[#050505] px-4 py-8 text-white">
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute left-[-12%] top-[-18%] h-[420px] w-[420px] rounded-full bg-[#0aff0a]/15 blur-[120px]" />
        <div className="absolute right-[-12%] top-[28%] h-[520px] w-[520px] rounded-full bg-[#00f3ff]/10 blur-[140px]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.028)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.018)_1px,transparent_1px)] bg-[size:38px_38px]" />
      </div>

      <main className="relative mx-auto grid min-h-[calc(100vh-64px)] w-full max-w-6xl items-center gap-8 lg:grid-cols-[1fr_460px]">
        <section>
          <Link
            href="/"
            className="inline-flex rounded-full border border-white/15 px-4 py-2 transition hover:border-white/30"
          >
            <ConnectyLogo className="h-5 w-[156px]" tone="white" type="full" />
          </Link>

          <p className="mt-10 font-mono text-[10px] uppercase text-[#0aff0a]">
            {isSignup ? "Ativar teste gratis" : "Entrar no painel"}
          </p>
          <h1 className="display-type mt-3 max-w-3xl text-4xl leading-tight text-white md:text-6xl">
            {isSignup ? "Crie sua empresa digital no WhatsApp." : "Volte para sua operacao digital."}
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-8 text-zinc-400">
            {isSignup
              ? "O primeiro acesso cria o usuario do lead. Depois disso, o painel pode ativar WhatsApp, agentes, rastreamento e creditos de IA."
              : "Se este navegador ja tiver uma sessao ativa, a ConnectyHub entra automaticamente no painel."}
          </p>

          <div className="mt-8 hidden max-w-2xl gap-3 sm:grid-cols-3 lg:grid">
            {benefitItems.map((item) => (
              <div key={item} className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-4">
                <CheckCircle2 size={17} className="text-[#0aff0a]" />
                <span className="mt-3 block text-sm text-zinc-300">{item}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-white/[0.1] bg-[#0c0c0e]/92 p-5 shadow-[0_0_80px_rgba(0,0,0,0.55)]">
          <div className="mb-5 flex items-start justify-between gap-4 border-b border-white/[0.08] pb-4">
            <div>
              <p className="font-mono text-[10px] uppercase text-zinc-500">
                {isSignup ? "Novo acesso" : "Acesso existente"}
              </p>
              <h2 className="mt-1 text-xl font-semibold text-white">
                {isSignup ? "Comecar teste gratis" : "Entrar na ConnectyHub"}
              </h2>
            </div>
            <span className="grid h-10 w-10 place-items-center rounded-md border border-[#0aff0a]/35 bg-[#0aff0a]/8 text-[#0aff0a]">
              <LockKeyhole size={18} />
            </span>
          </div>

          {!supabaseConfigured ? (
            <div className="mb-4 rounded-md border border-amber-300/25 bg-amber-300/8 p-3 text-sm leading-6 text-amber-100">
              Supabase ainda nao esta configurado neste ambiente. Preencha as variaveis publicas no `.env.local`.
            </div>
          ) : null}

          {supabaseConfigured ? (
            <button
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-white/[0.12] bg-white/[0.04] px-4 text-sm font-semibold text-white transition hover:border-[#00f3ff]/45 hover:bg-[#00f3ff]/10 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={status === "loading"}
              onClick={handleGoogleSignIn}
              type="button"
            >
              <GoogleLogoIcon />
              Continuar com Google
            </button>
          ) : null}

          {isSignup && !awaitingPhoneVerification ? (
            <div className="my-4">
              <button
                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-white/[0.1] bg-black/25 px-4 text-sm font-semibold text-zinc-300 transition hover:border-white/20 hover:bg-white/[0.05] hover:text-white"
                onClick={() => {
                  setManualSignupOpen((current) => !current);
                  setMessage("");
                }}
                type="button"
              >
                <Mail size={16} />
                {manualSignupOpen ? "Ocultar cadastro com email" : "Cadastrar com email e senha"}
              </button>
            </div>
          ) : null}

          <AuthStatusMessage message={message} status={status} />

          {showCredentialForm ? (
            <form
              className={cn(
                "space-y-4",
                (!isSignup || awaitingPhoneVerification) && "mt-4",
                isSignup && !awaitingPhoneVerification && "mt-4 border-t border-white/[0.08] pt-4",
              )}
              onSubmit={handleSubmit}
            >
              {isSignup ? (
                <>
                  {!awaitingPhoneVerification ? (
                    <>
                      <SignupAccountTypeControl
                        value={accountType}
                        onChange={(nextType) => {
                          setAccountType(nextType);
                          setDocumentValue("");
                          setMessage("");
                        }}
                      />
                      <FormField
                        icon={UserRound}
                        label={accountType === "company" ? "Responsavel" : "Nome"}
                        name="full_name"
                        onChange={setFullName}
                        placeholder="Seu nome completo"
                        value={fullName}
                      />
                      {accountType === "company" ? (
                        <FormField
                          icon={Building2}
                          label="Empresa"
                          name="company_name"
                          onChange={setCompanyName}
                          placeholder="Nome da empresa"
                          required
                          value={companyName}
                        />
                      ) : null}
                      <FormField
                        icon={Phone}
                        label="WhatsApp"
                        name="phone"
                        inputMode="tel"
                        maxLength={19}
                        onChange={(value) => {
                          setPhone(formatBrazilPhoneInput(value));
                          setMessage("");
                        }}
                        placeholder="(47) 99999-9999"
                        type="tel"
                        value={phone}
                      />
                      <SignupWhatsappCheck check={whatsappCheck} />
                      <FormField
                        icon={CheckCircle2}
                        label={documentLabel}
                        name="document"
                        inputMode="numeric"
                        maxLength={accountType === "company" ? 18 : 14}
                        onChange={(value) => setDocumentValue(accountType === "company" ? formatCnpjInput(value) : formatCpfInput(value))}
                        placeholder={accountType === "company" ? "00.000.000/0000-00" : "000.000.000-00"}
                        value={documentValue}
                      />
                      <label className="flex gap-3 rounded-md border border-white/[0.08] bg-black/25 p-3 text-left">
                        <input
                          checked={trialWhatsappOptIn}
                          className="mt-0.5 h-4 w-4 accent-[#0aff0a]"
                          onChange={(event) => setTrialWhatsappOptIn(event.target.checked)}
                          type="checkbox"
                        />
                        <span className="text-xs leading-5 text-zinc-400">
                          Aceito receber avisos importantes sobre meu teste gratis, creditos e assinatura pelo WhatsApp.
                        </span>
                      </label>
                    </>
                  ) : (
                    <>
                      <FormField
                        icon={Phone}
                        label="WhatsApp"
                        name="phone"
                        inputMode="tel"
                        maxLength={19}
                        onChange={(value) => setPhone(formatBrazilPhoneInput(value))}
                        placeholder="(47) 99999-9999"
                        type="tel"
                        value={phone}
                      />
                      <FormField
                        icon={CheckCircle2}
                        label="Codigo"
                        name="verification_code"
                        inputMode="numeric"
                        maxLength={6}
                        onChange={(value) => setVerificationCode(value.replace(/\D/g, "").slice(0, 6))}
                        placeholder="000000"
                        value={verificationCode}
                      />
                      <button
                        className="h-10 rounded-md border border-[#00f3ff]/30 px-4 font-mono text-[10px] font-bold uppercase text-[#00f3ff] transition hover:bg-[#00f3ff]/10 disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={status === "loading"}
                        onClick={resendPhoneVerification}
                        type="button"
                      >
                        Reenviar codigo
                      </button>
                    </>
                  )}
                </>
              ) : null}

              {!awaitingPhoneVerification ? (
                <>
                  <FormField
                    icon={Mail}
                    label="Email"
                    name="email"
                    onChange={setEmail}
                    placeholder="voce@email.com"
                    type="email"
                    value={email}
                  />
                  <FormField
                    icon={LockKeyhole}
                    label="Senha"
                    name="password"
                    onChange={setPassword}
                    placeholder="Minimo 6 caracteres"
                    type="password"
                    value={password}
                  />
                </>
              ) : null}

              <button
                className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-[#0aff0a] px-4 font-mono text-xs font-bold uppercase text-black transition hover:bg-[#5cff5c] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={status === "loading" || (isSignup && !awaitingPhoneVerification && !whatsappValidated)}
                type="submit"
              >
                {status === "loading" ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
                {awaitingPhoneVerification
                  ? "Confirmar WhatsApp"
                  : isSignup
                    ? whatsappCheck.state === "checking"
                      ? "Verificando WhatsApp"
                      : whatsappValidated
                        ? "Criar conta e validar"
                        : "Aguardando WhatsApp valido"
                    : "Entrar no painel"}
              </button>
            </form>
          ) : null}

          <p className="mt-5 text-center text-sm text-zinc-500">
            {isSignup ? "Ja tem conta?" : "Ainda nao tem conta?"}{" "}
            <Link
              className="font-semibold text-[#00f3ff] hover:text-white"
              href={isSignup ? `/login?email=${encodeURIComponent(email)}&next=${encodeURIComponent(nextPath)}` : "/cadastro"}
            >
              {isSignup ? "Entrar agora" : "Criar teste gratis"}
            </Link>
          </p>
        </section>

        <section className="grid gap-3 lg:hidden">
          {benefitItems.map((item) => (
            <div key={item} className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-4">
              <CheckCircle2 size={17} className="text-[#0aff0a]" />
              <span className="mt-3 block text-sm text-zinc-300">{item}</span>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}

function AuthStatusMessage({
  message,
  status,
}: {
  message: string;
  status: "idle" | "loading" | "success" | "error";
}) {
  if (!message) {
    return null;
  }

  return (
    <div
      className={cn(
        "mt-4 rounded-md border p-3 text-sm leading-6",
        status === "success"
          ? "border-[#0aff0a]/25 bg-[#0aff0a]/8 text-[#b7ffb7]"
          : "border-rose-300/25 bg-rose-300/8 text-rose-100",
      )}
    >
      {message}
    </div>
  );
}

function SignupWhatsappCheck({ check }: { check: WhatsappCheckState }) {
  if (!check.message) {
    return null;
  }

  const isValid = check.state === "valid";
  const isChecking = check.state === "checking";
  const isNeutral = check.state === "idle" || check.state === "incomplete";
  const Icon = isValid ? CheckCircle2 : isChecking ? Loader2 : AlertTriangle;

  return (
    <div className={cn(
      "flex items-start gap-2 rounded-md border p-3 text-xs leading-5",
      isValid
        ? "border-[#0aff0a]/25 bg-[#0aff0a]/8 text-[#b7ffb7]"
        : isNeutral
          ? "border-[#00f3ff]/20 bg-[#00f3ff]/8 text-cyan-100"
          : "border-rose-300/25 bg-rose-300/8 text-rose-100",
    )}>
      <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", isChecking && "animate-spin")} />
      <span>{check.message}</span>
    </div>
  );
}

function SignupAccountTypeControl({
  onChange,
  value,
}: {
  onChange: (value: SignupAccountType) => void;
  value: SignupAccountType;
}) {
  const options: Array<{ icon: LucideIcon; label: string; value: SignupAccountType }> = [
    { icon: UserRound, label: "Pessoa fisica", value: "person" },
    { icon: Building2, label: "Empresa", value: "company" },
  ];

  return (
    <div>
      <span className="mb-2 block font-mono text-[10px] uppercase text-zinc-500">Tipo de cadastro</span>
      <div className="grid grid-cols-2 gap-2 rounded-md border border-white/[0.08] bg-black/25 p-1">
        {options.map((option) => {
          const Icon = option.icon;
          const selected = option.value === value;

          return (
            <button
              key={option.value}
              className={cn(
                "inline-flex min-h-10 items-center justify-center gap-2 rounded-[5px] px-3 text-xs font-semibold transition",
                selected
                  ? "bg-[#0aff0a] text-black"
                  : "text-zinc-400 hover:bg-white/[0.06] hover:text-white",
              )}
              onClick={() => onChange(option.value)}
              type="button"
            >
              <Icon size={15} />
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

async function bootstrapAccount() {
  const response = await fetch("/api/account/bootstrap", {
    method: "POST",
  }).catch(() => null);

  if (!response?.ok) {
    return null;
  }

  return (await response.json().catch(() => null)) as { redirectPath?: string } | null;
}

async function saveSignupCompletion(input: {
  fullName: string;
  companyName: string | null;
  accountType: SignupAccountType;
  document: string;
  documentType: "cpf" | "cnpj";
  passwordSet: boolean;
}) {
  const response = await fetch("/api/account/completion", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = (await response.json().catch(() => null)) as { error?: string } | null;

  if (!response.ok) {
    throw new Error(data?.error ?? "Nao foi possivel salvar os dados do cadastro.");
  }

  return data;
}

async function requestPhoneVerification(phone: string) {
  const response = await fetch("/api/account/phone-verification/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone }),
  });
  const data = (await response.json().catch(() => null)) as { error?: string } | null;

  if (!response.ok) {
    throw new Error(data?.error ?? "Nao foi possivel enviar o codigo no WhatsApp.");
  }

  return data;
}

function GoogleLogoIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4 shrink-0" viewBox="0 0 24 24">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06L5.84 9.9C6.71 7.3 9.14 5.38 12 5.38z"
        fill="#EA4335"
      />
    </svg>
  );
}

function buildAuthCallbackUrl(nextPath: string) {
  const configuredBaseUrl = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
  const baseUrl = configuredBaseUrl && /^https?:\/\//i.test(configuredBaseUrl)
    ? configuredBaseUrl
    : window.location.origin;

  return `${baseUrl}/auth/callback?next=${encodeURIComponent(nextPath)}`;
}

function resolvePostLoginPath(nextPath: string, rolePath?: string) {
  if (nextPath !== "/dashboard") {
    return nextPath;
  }

  return rolePath ?? nextPath;
}

function getBrazilPhoneLocalDigitCount(value: string) {
  const digits = value.replace(/\D/g, "");
  const local = digits.startsWith("55") ? digits.slice(2) : digits;

  return local.length;
}

function FormField({
  icon: Icon,
  label,
  name,
  onChange,
  placeholder,
  inputMode,
  maxLength,
  required = true,
  type = "text",
  value,
}: {
  icon: LucideIcon;
  label: string;
  name: string;
  inputMode?: "none" | "text" | "tel" | "url" | "email" | "numeric" | "decimal" | "search";
  maxLength?: number;
  onChange: (value: string) => void;
  placeholder: string;
  required?: boolean;
  type?: string;
  value: string;
}) {
  return (
    <label className="block">
      <span className="mb-2 block font-mono text-[10px] uppercase text-zinc-500">{label}</span>
      <span className="flex min-h-11 items-center gap-3 rounded-md border border-white/[0.08] bg-black/30 px-3 focus-within:border-[#0aff0a]/45">
        <Icon size={16} className="text-zinc-500" />
        <input
          autoComplete={name}
          className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-zinc-700"
          inputMode={inputMode}
          maxLength={maxLength}
          name={name}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          required={required}
          type={type}
          value={value}
        />
      </span>
    </label>
  );
}
