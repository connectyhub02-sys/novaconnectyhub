"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { ArrowRight, CheckCircle2, Loader2, LockKeyhole, Mail, Phone, UserRound } from "lucide-react";
import { ConnectyLogo } from "@/components/brand/connecty-logo";
import { formatBrazilPhoneInput, formatCpfInput, normalizeBrazilPhoneForApi } from "@/lib/account/input-format";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type AuthMode = "login" | "signup";

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
  const [phone, setPhone] = useState("");
  const [cpf, setCpf] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [awaitingPhoneVerification, setAwaitingPhoneVerification] = useState(false);
  const [trialWhatsappOptIn, setTrialWhatsappOptIn] = useState(true);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  const isSignup = mode === "signup";
  const benefitItems = ["Sessao persistente", "Painel do cliente", "Credenciais seguras"];

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

        if (!phoneForVerification) {
          setStatus("error");
          setMessage("Informe um WhatsApp valido com DDD. Ex.: (47) 99999-9999.");
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
            cpf,
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
              className="mb-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-white/[0.12] bg-white/[0.04] px-4 text-sm font-semibold text-white transition hover:border-[#00f3ff]/45 hover:bg-[#00f3ff]/10 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={status === "loading"}
              onClick={handleGoogleSignIn}
              type="button"
            >
              <GoogleLogoIcon />
              Continuar com Google
            </button>
          ) : null}

          <form className="space-y-4" onSubmit={handleSubmit}>
            {isSignup ? (
              <>
                {!awaitingPhoneVerification ? (
                  <>
                    <FormField
                      icon={UserRound}
                      label="Nome"
                      name="full_name"
                      onChange={setFullName}
                      placeholder="Seu nome completo"
                      value={fullName}
                    />
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
                      label="CPF"
                      name="cpf"
                      inputMode="numeric"
                      maxLength={14}
                      onChange={(value) => setCpf(formatCpfInput(value))}
                      placeholder="000.000.000-00"
                      value={cpf}
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

            {message ? (
              <div
                className={cn(
                  "rounded-md border p-3 text-sm leading-6",
                  status === "success"
                    ? "border-[#0aff0a]/25 bg-[#0aff0a]/8 text-[#b7ffb7]"
                    : "border-rose-300/25 bg-rose-300/8 text-rose-100",
                )}
              >
                {message}
              </div>
            ) : null}

            <button
              className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-[#0aff0a] px-4 font-mono text-xs font-bold uppercase text-black transition hover:bg-[#5cff5c] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={status === "loading"}
              type="submit"
            >
              {status === "loading" ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
              {awaitingPhoneVerification ? "Confirmar WhatsApp" : isSignup ? "Criar conta e validar" : "Entrar no painel"}
            </button>
          </form>

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
  cpf: string;
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

function FormField({
  icon: Icon,
  label,
  name,
  onChange,
  placeholder,
  inputMode,
  maxLength,
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
          required={name !== "company_name"}
          type={type}
          value={value}
        />
      </span>
    </label>
  );
}
