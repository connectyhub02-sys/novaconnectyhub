"use client";

import Image from "next/image";
import { useState, type FormEvent } from "react";
import { CheckCircle2, Loader2, Mail, MessageCircle, Store } from "lucide-react";
import { cn } from "@/lib/utils";

type StoreNewsletterBranding = {
  displayName: string;
  logoUrl: string | null;
  logoAlt: string;
};

type StoreNewsletterTracking = {
  leadId: string | null;
  leadPhone: string | null;
  conversationId: string | null;
  trackingLinkId: string | null;
};

type StoreNewsletterCardProps = {
  branding: StoreNewsletterBranding;
  storeSlug: string;
  tracking: StoreNewsletterTracking;
  className?: string;
};

export function StoreNewsletterCard({
  branding,
  className,
  storeSlug,
  tracking,
}: StoreNewsletterCardProps) {
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hasLeadPhone = Boolean(tracking.leadPhone?.trim());

  async function submitNewsletter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    setBusy(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(`/api/public/sales-catalog/stores/${encodeURIComponent(storeSlug)}/newsletter`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          leadPhone: tracking.leadPhone ?? phone,
          leadId: tracking.leadId,
          conversationId: tracking.conversationId,
          trackingLinkId: tracking.trackingLinkId,
        }),
      });
      const payload = await response.json().catch(() => ({})) as { message?: string; error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Nao foi possivel cadastrar agora.");
      }

      setMessage(payload.message ?? "Cadastro recebido.");
      setEmail("");
      if (!hasLeadPhone) setPhone("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel cadastrar agora.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={cn(
      "grid gap-6 rounded-[20px] bg-black px-6 py-8 text-white shadow-2xl shadow-black/10 md:grid-cols-[minmax(0,1fr)_390px] md:items-center md:px-16 md:py-9",
      className,
    )}>
      <div className="flex max-w-2xl items-center gap-4">
        <NewsletterLogo branding={branding} />
        <h2 className="text-[23px] font-semibold leading-[29px] md:text-[30px] md:leading-[36px]">
          Receba novidades e ofertas da {branding.displayName}
        </h2>
      </div>

      <form className="grid gap-3" onSubmit={submitNewsletter}>
        {!hasLeadPhone ? (
          <label className="relative">
            <MessageCircle className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#128C4A]" aria-hidden="true" />
            <input
              className="h-12 w-full rounded-full border-0 bg-white px-12 text-sm font-medium text-black outline-none placeholder:text-black/40"
              onChange={(event) => setPhone(event.target.value)}
              placeholder="WhatsApp com DDD"
              required
              type="tel"
              value={phone}
            />
          </label>
        ) : null}
        <label className="relative">
          <Mail className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-black/45" aria-hidden="true" />
          <input
            className="h-12 w-full rounded-full border-0 bg-white px-12 text-sm font-medium text-black outline-none placeholder:text-black/40"
            onChange={(event) => setEmail(event.target.value)}
            placeholder="E-mail"
            required
            type="email"
            value={email}
          />
        </label>
        <button
          className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-white px-6 text-sm font-bold text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:bg-white/70"
          disabled={busy}
          type="submit"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
          {busy ? "Cadastrando..." : "Cadastrar-se"}
        </button>
        {message ? <p className="text-xs font-semibold text-emerald-200">{message}</p> : null}
        {error ? <p className="text-xs font-semibold text-rose-200">{error}</p> : null}
      </form>
    </section>
  );
}

function NewsletterLogo({ branding }: { branding: StoreNewsletterBranding }) {
  return (
    <span className="relative grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-[8px] border border-white/20 bg-white">
      {branding.logoUrl ? (
        <Image alt={branding.logoAlt} className="object-contain p-1" fill sizes="40px" src={branding.logoUrl} unoptimized />
      ) : (
        <Store className="h-5 w-5 text-black" />
      )}
    </span>
  );
}
