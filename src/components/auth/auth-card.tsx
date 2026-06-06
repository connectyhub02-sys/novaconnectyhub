"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { ArrowRight, CheckCircle2, Loader2, LockKeyhole, Mail, Phone, UserRound } from "lucide-react";
import { ConnectyLogo } from "@/components/brand/connecty-logo";
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
  const [companyName, setCompanyName] = useState("");
  const [phone, setPhone] = useState("");
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

      if (isSignup) {
        const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`;
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: redirectTo,
            data: {
              full_name: fullName,
              company_name: companyName,
              phone,
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
          const bootstrap = await bootstrapAccount();
          router.replace(resolvePostLoginPath(nextPath, bootstrap?.redirectPath));
          router.refresh();
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

          <form className="space-y-4" onSubmit={handleSubmit}>
            {isSignup ? (
              <>
                <FormField
                  icon={UserRound}
                  label="Nome"
                  name="full_name"
                  onChange={setFullName}
                  placeholder="Seu nome"
                  value={fullName}
                />
                <FormField
                  icon={CheckCircle2}
                  label="Empresa"
                  name="company_name"
                  onChange={setCompanyName}
                  placeholder="Nome da empresa ou projeto"
                  value={companyName}
                />
                <FormField
                  icon={Phone}
                  label="WhatsApp"
                  name="phone"
                  onChange={setPhone}
                  placeholder="(47) 99999-9999"
                  type="tel"
                  value={phone}
                />
              </>
            ) : null}

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
              {isSignup ? "Criar conta e iniciar" : "Entrar no painel"}
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
  type = "text",
  value,
}: {
  icon: LucideIcon;
  label: string;
  name: string;
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
