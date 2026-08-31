"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { ChevronDown, ExternalLink, Loader2, Send, X } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { publishCommerceAgentEvent } from "@/lib/commerce-agent/client-events";
import { getTrackingSnapshot, isTrackingDisabled } from "@/lib/tracking/client";
import {
  buildPublicTrackingApiBody,
  readPublicTrackingContext,
} from "@/lib/tracking/public-context";
import { cn } from "@/lib/utils";

type CommerceAgentMessage = {
  id: string;
  role: "lead" | "assistant" | "system";
  content: string;
};

type CommerceAgentSession = {
  enabled: boolean;
  commerceSessionId: string | null;
  mode: "observer" | "assistant" | "active_seller";
  surface: "store" | "product" | "cart" | "checkout" | "unknown";
  checkoutQuietMode: boolean;
  dockLabel: string;
  agentId: string | null;
  agentName: string;
  agentAvatarUrl: string | null;
  agentAvatarAlt: string | null;
  leadName: string | null;
  welcomeMessage: string | null;
  whisperMessage: string | null;
  whatsappHref: string | null;
  quickActions: Array<{
    id: string;
    label: string;
    message: string;
  }>;
  messages: CommerceAgentMessage[];
};

type CommerceAgentMessageResponse = {
  message?: CommerceAgentMessage;
  commerceSessionId?: string | null;
  error?: string;
};

export function CommerceAgentDock() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = useMemo(() => searchParams?.toString() ?? "", [searchParams]);
  const [session, setSession] = useState<CommerceAgentSession | null>(null);
  const [messages, setMessages] = useState<CommerceAgentMessage[]>([]);
  const [open, setOpen] = useState(false);
  const [whisperVisible, setWhisperVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [input, setInput] = useState("");
  const [trackingContextProbe, setTrackingContextProbe] = useState({ pageKey: "", attempts: 0 });
  const lastSessionKey = useRef<string | null>(null);
  const lastWhisperKey = useRef<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const surface = resolveCommerceSurface(pathname);
    const publicTracking = readPublicTrackingContext();
    const pageKey = `${pathname ?? ""}?${search}`;
    const probeAttempts = trackingContextProbe.pageKey === pageKey ? trackingContextProbe.attempts : 0;

    if (isTrackingDisabled() || !surface) {
      window.setTimeout(() => {
        setSession(null);
        setMessages([]);
        setOpen(false);
        setWhisperVisible(false);
      }, 0);
      return;
    }

    if (!publicTracking?.organization_id) {
      if (probeAttempts < 10) {
        const retryTimer = window.setTimeout(() => {
          setTrackingContextProbe({ pageKey, attempts: probeAttempts + 1 });
        }, 250);

        return () => window.clearTimeout(retryTimer);
      }

      window.setTimeout(() => {
        setSession(null);
        setMessages([]);
        setOpen(false);
        setWhisperVisible(false);
      }, 0);
      return;
    }

    const sessionKey = `${surface}:${pathname ?? ""}?${search}:${publicTracking.organization_id}:${publicTracking.lead_id ?? ""}:${publicTracking.conversation_id ?? ""}:${publicTracking.agent_id ?? ""}`;
    if (lastSessionKey.current === sessionKey) {
      return;
    }

    lastSessionKey.current = sessionKey;
    setLoading(true);
    setWhisperVisible(false);

    const controller = new AbortController();
    const snapshot = getTrackingSnapshot();

    fetch("/api/public/commerce-agent/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        ...buildPublicTrackingApiBody(publicTracking),
        visitor_cookie_id: snapshot.visitorId,
        session_cookie_id: snapshot.sessionId,
        surface,
        page_path: window.location.pathname,
        page_url: window.location.href,
        page_title: document.title,
        referrer: document.referrer,
      }),
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => null) as CommerceAgentSession | null;
        if (!response.ok || !payload?.enabled) {
          setSession(null);
          setMessages([]);
          return;
        }

        setSession(payload);
        setMessages(payload.messages.length > 0 ? payload.messages : createInitialMessages(payload));
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setSession(null);
          setMessages([]);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [pathname, search, trackingContextProbe]);

  useEffect(() => {
    if (!session || open || session.mode === "observer" || !session.whisperMessage) {
      return;
    }

    const whisperKey = `${session.commerceSessionId ?? session.agentId ?? session.agentName}:${session.surface}:${session.leadName ?? ""}`;

    if (lastWhisperKey.current === whisperKey) {
      return;
    }

    lastWhisperKey.current = whisperKey;

    const showTimer = window.setTimeout(() => setWhisperVisible(true), session.surface === "checkout" ? 700 : 1_000);
    const hideTimer = window.setTimeout(
      () => setWhisperVisible(false),
      session.surface === "checkout" && session.checkoutQuietMode ? 7_200 : 9_500,
    );

    return () => {
      window.clearTimeout(showTimer);
      window.clearTimeout(hideTimer);
    };
  }, [open, session]);

  useEffect(() => {
    if (!open) return;
    messagesEndRef.current?.scrollIntoView({ block: "end" });
  }, [messages, open]);

  if (!session || loading) {
    return null;
  }

  const isCheckout = session.surface === "checkout";
  const dockText = session.leadName
    ? `${firstName(session.leadName)}, ${session.agentName} esta contigo`
    : session.dockLabel;

  function openDock() {
    setOpen(true);
    setWhisperVisible(false);
    publishCommerceAgentEvent("agent_dock_opened", {
      commerce_session_id: session?.commerceSessionId ?? null,
      surface: session?.surface ?? null,
      mode: session?.mode ?? null,
    });
  }

  function closeDock() {
    setOpen(false);
    publishCommerceAgentEvent("agent_dock_minimized", {
      commerce_session_id: session?.commerceSessionId ?? null,
      surface: session?.surface ?? null,
    });
  }

  async function submitMessage(event?: FormEvent<HTMLFormElement>, forcedMessage?: string) {
    event?.preventDefault();
    const content = (forcedMessage ?? input).trim();

    if (!content || sending || !session) {
      return;
    }

    const publicTracking = readPublicTrackingContext();
    const snapshot = getTrackingSnapshot();
    const leadMessage: CommerceAgentMessage = {
      id: createClientId("lead"),
      role: "lead",
      content,
    };

    setMessages((current) => [...current, leadMessage]);
    setInput("");
    setOpen(true);
    setSending(true);
    publishCommerceAgentEvent("agent_message_sent", {
      commerce_session_id: session.commerceSessionId,
      surface: session.surface,
    });

    try {
      const response = await fetch("/api/public/commerce-agent/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...buildPublicTrackingApiBody(publicTracking),
          visitor_cookie_id: snapshot.visitorId,
          session_cookie_id: snapshot.sessionId,
          commerce_session_id: session.commerceSessionId,
          surface: session.surface,
          message: content,
          page_path: window.location.pathname,
          page_url: window.location.href,
        }),
      });
      const payload = await response.json().catch(() => null) as CommerceAgentMessageResponse | null;

      if (!response.ok || !payload?.message) {
        throw new Error(payload?.error ?? "Nao foi possivel responder agora.");
      }

      setSession((current) => current ? {
        ...current,
        commerceSessionId: payload.commerceSessionId ?? current.commerceSessionId,
      } : current);
      setMessages((current) => [...current, payload.message!]);
    } catch {
      setMessages((current) => [...current, {
        id: createClientId("assistant"),
        role: "assistant",
        content: "Nao consegui responder agora por aqui. Voce pode continuar no WhatsApp ou tentar de novo em instantes.",
      }]);
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      className={cn(
        "fixed z-[45] font-sans text-slate-950",
        isCheckout
          ? "bottom-20 right-3 sm:bottom-5 sm:right-5"
          : "bottom-20 right-3 sm:bottom-5 sm:right-5",
      )}
    >
      {whisperVisible && session.whisperMessage ? (
        <div
          aria-live="polite"
          className="relative mb-3 ml-auto mr-1 max-w-[min(20rem,calc(100vw-5.5rem))] rounded-[8px] border border-cyan-200/80 bg-white/95 px-3.5 py-3 text-left shadow-2xl shadow-cyan-950/15 backdrop-blur animate-in fade-in slide-in-from-bottom-2"
        >
          <p className="text-xs font-semibold leading-5 text-slate-700">{session.whisperMessage}</p>
          <span className="absolute -bottom-1.5 right-6 h-3 w-3 rotate-45 border-b border-r border-cyan-200/80 bg-white/95" />
        </div>
      ) : null}

      {open ? (
        <section className="mb-3 w-[min(24rem,calc(100vw-1.5rem))] overflow-hidden rounded-[8px] border border-cyan-200/70 bg-white shadow-2xl shadow-slate-950/20">
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-950 px-3 py-3 text-white">
            <div className="flex min-w-0 items-center gap-2">
              <AgentAvatar session={session} />
              <div className="min-w-0">
                <h2 className="truncate text-sm font-black">{session.agentName}</h2>
                <p className="truncate text-[11px] font-semibold text-cyan-100">{surfaceLabel(session.surface)}</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                aria-label="Minimizar agente"
                className="grid h-8 w-8 place-items-center rounded-[8px] text-cyan-100 transition hover:bg-white/10"
                type="button"
                onClick={closeDock}
              >
                <ChevronDown className="h-4 w-4" />
              </button>
              <button
                aria-label="Fechar agente"
                className="grid h-8 w-8 place-items-center rounded-[8px] text-cyan-100 transition hover:bg-white/10"
                type="button"
                onClick={() => {
                  setOpen(false);
                  setWhisperVisible(false);
                }}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="max-h-[min(26rem,52dvh)] space-y-2 overflow-y-auto bg-slate-50 px-3 py-3">
            {messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  "max-w-[85%] rounded-[8px] px-3 py-2 text-xs font-medium leading-5",
                  message.role === "lead"
                    ? "ml-auto bg-slate-950 text-white"
                    : "mr-auto border border-slate-200 bg-white text-slate-700",
                )}
              >
                {message.content}
              </div>
            ))}
            {sending ? (
              <div className="mr-auto inline-flex items-center gap-2 rounded-[8px] border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Pensando
              </div>
            ) : null}
            <div ref={messagesEndRef} />
          </div>

          <div className="border-t border-slate-200 bg-white p-3">
            {session.quickActions.length > 0 ? (
              <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
                {session.quickActions.map((action) => (
                  <button
                    key={action.id}
                    className="shrink-0 rounded-[8px] border border-cyan-200 px-2.5 py-1.5 text-[11px] font-bold text-cyan-800 transition hover:bg-cyan-50"
                    type="button"
                    onClick={() => void submitMessage(undefined, action.message)}
                  >
                    {action.label}
                  </button>
                ))}
                {session.whatsappHref ? (
                  <a
                    className="inline-flex shrink-0 items-center gap-1 rounded-[8px] border border-slate-200 px-2.5 py-1.5 text-[11px] font-bold text-slate-600 transition hover:bg-slate-50"
                    href={session.whatsappHref}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => publishCommerceAgentEvent("whatsapp_return_clicked", {
                      commerce_session_id: session.commerceSessionId,
                      surface: session.surface,
                    })}
                  >
                    WhatsApp
                    <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  </a>
                ) : null}
              </div>
            ) : null}
            <form className="grid grid-cols-[minmax(0,1fr)_40px] gap-2" onSubmit={(event) => void submitMessage(event)}>
              <input
                className="h-10 min-w-0 rounded-[8px] border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-cyan-300"
                value={input}
                onChange={(event) => setInput(event.target.value.slice(0, 700))}
                placeholder="Pergunte aqui"
              />
              <button
                aria-label="Enviar mensagem"
                className="grid h-10 w-10 place-items-center rounded-[8px] bg-slate-950 text-cyan-100 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!input.trim() || sending}
                type="submit"
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </form>
          </div>
        </section>
      ) : null}

      <button
        type="button"
        className={cn(
          "group relative ml-auto grid h-16 w-16 place-items-center rounded-full border border-cyan-200/80 bg-white p-1 text-slate-950 shadow-2xl shadow-cyan-950/20 transition hover:-translate-y-0.5 hover:shadow-cyan-950/30",
          isCheckout ? "opacity-95" : "opacity-100",
        )}
        onClick={openDock}
        aria-label={`Abrir agente da loja ${session.agentName}`}
        title={`Conversar com ${session.agentName}`}
      >
        <AgentAvatar session={session} size="coin" />
        <span className="sr-only">{dockText}. {surfaceLabel(session.surface)}</span>
      </button>
    </div>
  );
}

function AgentAvatar({
  session,
  size = "md",
}: {
  session: Pick<CommerceAgentSession, "agentName" | "agentAvatarUrl" | "agentAvatarAlt">;
  size?: "sm" | "md" | "coin";
}) {
  const boxClass = size === "coin" ? "h-14 w-14" : size === "sm" ? "h-8 w-8" : "h-9 w-9";
  const imageSize = size === "coin" ? "56px" : size === "sm" ? "32px" : "36px";
  const statusClass = size === "coin"
    ? "-right-0.5 top-1 h-3.5 w-3.5 border-[3px]"
    : "-right-0.5 -top-0.5 h-2.5 w-2.5 border-2";

  return (
    <span className={cn(
      "relative grid shrink-0 place-items-center overflow-hidden rounded-full bg-slate-950 text-white ring-2 ring-cyan-200/80",
      size === "coin" ? "shadow-lg shadow-cyan-950/20 ring-4 ring-white" : "",
      boxClass,
    )}>
      {session.agentAvatarUrl ? (
        <Image
          alt={session.agentAvatarAlt ?? session.agentName}
          className="object-cover"
          fill
          sizes={imageSize}
          src={session.agentAvatarUrl}
          unoptimized
        />
      ) : (
        <span className={cn(
          "font-black uppercase tracking-normal text-cyan-100",
          size === "coin" ? "text-base" : "text-[11px]",
        )}>
          {agentInitials(session.agentName)}
        </span>
      )}
      <span className={cn("absolute rounded-full border-white bg-emerald-400", statusClass)} />
    </span>
  );
}

function createInitialMessages(session: CommerceAgentSession): CommerceAgentMessage[] {
  const content = session.welcomeMessage ?? "Continuo por aqui para te ajudar nesta compra.";

  return [{
    id: createClientId("assistant"),
    role: "assistant",
    content,
  }];
}

function resolveCommerceSurface(pathname: string | null): CommerceAgentSession["surface"] | null {
  const path = pathname?.toLowerCase() ?? "";

  if (path.startsWith("/checkout/")) return "checkout";
  if (path.startsWith("/produto/") || path.includes("/produto/")) return "product";
  if (path.startsWith("/loja/") && path.includes("/carrinho")) return "cart";
  if (path.startsWith("/loja/")) return "store";
  return null;
}

function surfaceLabel(surface: CommerceAgentSession["surface"]) {
  if (surface === "checkout") return "copiloto de checkout";
  if (surface === "product") return "copiloto do produto";
  if (surface === "cart") return "copiloto do carrinho";
  if (surface === "store") return "copiloto da loja";
  return "copiloto ConnectyHub";
}

function firstName(value: string) {
  return value.trim().split(/\s+/)[0] ?? value;
}

function agentInitials(value: string) {
  const words = value.trim().split(/\s+/).filter(Boolean);
  const initials = words.slice(0, 2).map((word) => word[0]).join("");

  return initials || "AI";
}

function createClientId(prefix: string) {
  const id = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

  return `${prefix}_${id}`;
}
