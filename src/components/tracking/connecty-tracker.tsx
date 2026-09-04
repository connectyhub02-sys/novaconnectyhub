"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Bell, LocateFixed, X } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { commerceAgentTrackingEventName } from "@/lib/commerce-agent/client-events";
import { getTrackingSnapshot, isTrackingDisabled } from "@/lib/tracking/client";
import {
  buildPublicTrackingApiBody,
  buildPublicTrackingMetadata,
  type ConnectyPublicTrackingContext,
  getPublicTrackingContextSignature,
  publicTrackingContextUpdatedEventName,
  readPublicTrackingContext,
  writePublicTrackingContext,
} from "@/lib/tracking/public-context";

type TrackPayload = {
  event_type: string;
  metadata?: Record<string, unknown>;
};

type PermissionSignal = "granted" | "denied" | "prompt" | "unsupported" | "unknown";
type PermissionRequestResult = "granted" | "denied" | "dismissed" | "failed" | "unsupported";
type PermissionStep = "push" | "gps";
type PermissionPromptAudience = "dashboard" | "public";

type PermissionPromptState = {
  push: PermissionSignal;
  gps: PermissionSignal;
  activeStep: PermissionStep | null;
  completedSteps: PermissionStep[];
  promptVisible: boolean;
  busy: "push" | "gps" | null;
  message: string | null;
};

const permissionPromptDelayMs = 9_000;
let cachedVapidPublicKey: string | null = null;
let vapidPublicKeyPromise: Promise<string> | null = null;

export function ConnectyTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const trackedPageKey = useRef<string | null>(null);
  const trackedSession = useRef(false);
  const scrollMilestones = useRef(new Set<number>());
  const startedForms = useRef(new WeakSet<HTMLFormElement>());
  const promptShownTracked = useRef(new Set<PermissionStep>());
  const search = useMemo(() => searchParams?.toString() ?? "", [searchParams]);
  const [trackingContextSignature, setTrackingContextSignature] = useState("");
  const [permissionPromptReady, setPermissionPromptReady] = useState(false);
  const [permissions, setPermissions] = useState<PermissionPromptState>({
    push: "unknown",
    gps: "unknown",
    activeStep: null,
    completedSteps: [],
    promptVisible: false,
    busy: null,
    message: null,
  });
  const suppressPermissionPrompt = isCommercePublicPath(pathname);

  useEffect(() => {
    function syncPublicTrackingSignature() {
      setTrackingContextSignature(getPublicTrackingContextSignature(readPublicTrackingContext()));
    }

    syncPublicTrackingSignature();
    window.addEventListener(publicTrackingContextUpdatedEventName, syncPublicTrackingSignature);

    return () => {
      window.removeEventListener(publicTrackingContextUpdatedEventName, syncPublicTrackingSignature);
    };
  }, [pathname, search]);

  useEffect(() => {
    if (isTrackingDisabled() || trackedSession.current) {
      return;
    }

    trackedSession.current = true;

    void trackEvent({
      event_type: "session_started",
      metadata: getPageMetadata(),
    });
  }, []);

  useEffect(() => {
    if (isTrackingDisabled()) {
      return;
    }

    const timer = window.setTimeout(() => {
      const currentSignature = getPublicTrackingContextSignature(readPublicTrackingContext());
      const pageKey = `${pathname ?? "/"}?${search}:${currentSignature}`;

      if (trackedPageKey.current === pageKey) {
        return;
      }

      trackedPageKey.current = pageKey;
      scrollMilestones.current = new Set();

      void trackEvent({
        event_type: isDashboardPath(pathname) ? "dashboard_page_view" : "public_page_view",
        metadata: getPageMetadata(),
      });

      const commerceEventType = getCommercePageViewEvent(pathname);
      if (commerceEventType) {
        void trackEvent({
          event_type: commerceEventType,
          metadata: getPageMetadata(),
        });
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, [pathname, search, trackingContextSignature]);

  useEffect(() => {
    if (isTrackingDisabled() || !resolveCommerceSurface(pathname)) {
      return;
    }

    function handleCustomCommerceEvent(event: Event) {
      const detail = event instanceof CustomEvent ? readRecord(event.detail) : null;
      const eventType = normalizeCommerceCustomEventType(
        readString(detail?.event_type) ?? readString(detail?.eventType),
      );

      if (!eventType) {
        return;
      }

      void trackEvent({
        event_type: eventType,
        metadata: {
          ...getPageMetadata(),
          ...(readRecord(detail?.metadata) ?? {}),
        },
      });
    }

    window.addEventListener(commerceAgentTrackingEventName, handleCustomCommerceEvent);

    return () => {
      window.removeEventListener(commerceAgentTrackingEventName, handleCustomCommerceEvent);
    };
  }, [pathname]);

  useEffect(() => {
    const surface = resolveCommerceSurface(pathname);

    if (isTrackingDisabled() || !surface) {
      return;
    }

    let timer: ReturnType<typeof setTimeout> | null = null;
    const idleMs = surface === "checkout" ? 30_000 : 45_000;
    const eventType = surface === "checkout" ? "commerce.checkout_idle" : "commerce.page_idle";

    function clearIdleTimer() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    }

    function resetIdleTimer() {
      clearIdleTimer();
      timer = setTimeout(() => {
        void trackEvent({
          event_type: eventType,
          metadata: {
            ...getPageMetadata(),
            idle_ms: idleMs,
          },
        });
      }, idleMs);
    }

    resetIdleTimer();

    for (const eventName of ["click", "input", "keydown", "pointermove", "scroll"]) {
      window.addEventListener(eventName, resetIdleTimer, { passive: true });
    }

    return () => {
      clearIdleTimer();

      for (const eventName of ["click", "input", "keydown", "pointermove", "scroll"]) {
        window.removeEventListener(eventName, resetIdleTimer);
      }
    };
  }, [pathname, search]);

  useEffect(() => {
    if (isTrackingDisabled()) {
      return;
    }

    let timeout: ReturnType<typeof setTimeout> | null = null;

    function handleScroll() {
      if (timeout) {
        clearTimeout(timeout);
      }

      timeout = setTimeout(() => {
        const scrollHeight = document.documentElement.scrollHeight - window.innerHeight;

        if (scrollHeight <= 0) {
          return;
        }

        const percent = Math.round((window.scrollY / scrollHeight) * 100);

        for (const milestone of [25, 50, 75, 90]) {
          if (percent >= milestone && !scrollMilestones.current.has(milestone)) {
            scrollMilestones.current.add(milestone);
            void trackEvent({
              event_type: "scroll_depth",
              metadata: {
                ...getPageMetadata(),
                percentage: milestone,
              },
            });
          }
        }
      }, 500);
    }

    window.addEventListener("scroll", handleScroll);

    return () => {
      window.removeEventListener("scroll", handleScroll);

      if (timeout) {
        clearTimeout(timeout);
      }
    };
  }, []);

  useEffect(() => {
    if (isTrackingDisabled()) {
      return;
    }

    function handleClick(event: MouseEvent) {
      const target = event.target instanceof Element
        ? event.target.closest<HTMLElement>("[data-track-event], a[href], button")
        : null;

      if (!target) {
        return;
      }

      const eventName = target.dataset.trackEvent || (target instanceof HTMLAnchorElement ? "link_clicked" : "button_clicked");
      const href = target instanceof HTMLAnchorElement ? target.href : null;

      void trackEvent({
        event_type: eventName,
        metadata: {
          ...getPageMetadata(),
          element_type: target.tagName.toLowerCase(),
          label: target.dataset.trackLabel || summarizeText(target.textContent),
          href,
          is_external: href ? new URL(href, window.location.href).origin !== window.location.origin : false,
        },
      });
    }

    function handleFormStart(event: Event) {
      const target = event.target instanceof Element ? event.target : null;
      const form = target?.closest("form");

      if (!(form instanceof HTMLFormElement) || startedForms.current.has(form)) {
        return;
      }

      startedForms.current.add(form);

      void trackEvent({
        event_type: "form_started",
        metadata: {
          ...getPageMetadata(),
          ...getFormMetadata(form),
        },
      });
    }

    function handleFormSubmit(event: SubmitEvent) {
      const form = event.target;

      if (!(form instanceof HTMLFormElement)) {
        return;
      }

      void trackEvent({
        event_type: "form_submitted",
        metadata: {
          ...getPageMetadata(),
          ...getFormMetadata(form),
        },
      });
    }

    document.addEventListener("click", handleClick, true);
    document.addEventListener("input", handleFormStart, true);
    document.addEventListener("change", handleFormStart, true);
    document.addEventListener("submit", handleFormSubmit, true);

    return () => {
      document.removeEventListener("click", handleClick, true);
      document.removeEventListener("input", handleFormStart, true);
      document.removeEventListener("change", handleFormStart, true);
      document.removeEventListener("submit", handleFormSubmit, true);
    };
  }, []);

  useEffect(() => {
    if (isTrackingDisabled()) {
      return;
    }

    void capturePermissionSignals();
  }, []);

  useEffect(() => {
    if (isTrackingDisabled() || suppressPermissionPrompt) {
      return;
    }

    const timer = setTimeout(() => setPermissionPromptReady(true), permissionPromptDelayMs);

    return () => clearTimeout(timer);
  }, [suppressPermissionPrompt]);

  useEffect(() => {
    if (isTrackingDisabled() || suppressPermissionPrompt || !permissionPromptReady) {
      return;
    }

    let active = true;

    async function syncPermissions() {
      const snapshot = await readBrowserPermissionSnapshot();

      if (!active) {
        return;
      }

      setPermissions((current) => ({
        ...current,
        ...snapshot,
        activeStep: getNextPermissionStep(snapshot, current.completedSteps),
        promptVisible: shouldShowPermissionPrompt(snapshot, current.completedSteps),
      }));
    }

    void syncPermissions();

    return () => {
      active = false;
    };
  }, [permissionPromptReady, suppressPermissionPrompt]);

  useEffect(() => {
    if (!permissions.promptVisible || !permissions.activeStep || promptShownTracked.current.has(permissions.activeStep)) {
      return;
    }

    promptShownTracked.current.add(permissions.activeStep);

    void trackEvent({
      event_type: "tracking_permission_prompt_shown",
      metadata: {
        ...getPageMetadata(),
        permission_step: permissions.activeStep,
        push_permission: permissions.push,
        gps_permission: permissions.gps,
      },
    });
  }, [permissions.activeStep, permissions.gps, permissions.promptVisible, permissions.push]);

  async function refreshPromptState(message: string | null, completedStep: PermissionStep) {
    const snapshot = await readBrowserPermissionSnapshot();
    const completedSteps = addCompletedStep(permissions.completedSteps, completedStep);

    setPermissions((current) => ({
      ...current,
      ...snapshot,
      completedSteps,
      activeStep: getNextPermissionStep(snapshot, completedSteps),
      promptVisible: shouldShowPermissionPrompt(snapshot, completedSteps),
      busy: null,
      message,
    }));
  }

  async function handleRequestPush() {
    setPermissions((current) => ({
      ...current,
      busy: "push",
      message: "Quando o navegador perguntar, clique em Permitir para receber as novidades.",
    }));

    await waitForNextPaint();
    const result = await requestPushPermission();
    await refreshPromptState(getPushResultMessage(result), "push");
  }

  async function handleRequestGps() {
    setPermissions((current) => ({
      ...current,
      busy: "gps",
      message: "Quando o navegador perguntar, clique em Permitir para personalizar sua experiencia por regiao.",
    }));

    await waitForNextPaint();
    const result = await requestGpsPermission();
    await refreshPromptState(getGpsResultMessage(result), "gps");
  }

  function handleDismissPrompt() {
    setPermissions((current) => ({ ...current, promptVisible: false, busy: null }));

    void trackEvent({
      event_type: "tracking_permission_prompt_dismissed",
      metadata: {
        ...getPageMetadata(),
        push_permission: permissions.push,
        gps_permission: permissions.gps,
      },
    });
  }

  if (suppressPermissionPrompt || !permissionPromptReady || !permissions.promptVisible || !permissions.activeStep) {
    return null;
  }

  const promptAudience: PermissionPromptAudience = isDashboardPath(pathname) ? "dashboard" : "public";
  const activeContent = getActivePromptContent(permissions.activeStep, permissions[permissions.activeStep], promptAudience);

  return (
    <div className="fixed inset-x-3 bottom-4 z-[10000] mx-auto max-h-[calc(100dvh-2rem)] max-w-md overflow-y-auto rounded-[8px] border border-blue-100 bg-white p-3 text-slate-950 shadow-2xl shadow-blue-950/20 backdrop-blur md:bottom-6 md:p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase text-blue-700">{activeContent.stepLabel}</p>
          <p className="mt-1 text-sm font-black text-slate-950">{activeContent.title}</p>
          <p className="mt-1 text-xs leading-5 text-slate-600">
            {activeContent.description}
          </p>
          {permissions.message ? (
            <p className="mt-2 rounded-[8px] border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-semibold leading-5 text-blue-700">
              {permissions.message}
            </p>
          ) : null}
        </div>

        <button
          type="button"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] border border-blue-100 text-slate-500 transition hover:border-blue-300 hover:text-blue-700"
          data-track-event="tracking_prompt_dismiss_clicked"
          aria-label="Fechar aviso de novidades"
          onClick={handleDismissPrompt}
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div className={`mt-3 rounded-[8px] border p-3 ${activeContent.containerClass}`}>
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 gap-3">
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] ${activeContent.iconClass}`}>
              <activeContent.Icon className="h-4 w-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className={`text-xs font-semibold uppercase ${activeContent.eyebrowClass}`}>{activeContent.eyebrow}</p>
              <p className="mt-1 text-xs leading-5 text-slate-600">
                {activeContent.body}
              </p>
            </div>
          </div>
          <button
            type="button"
            className={`inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-[8px] border px-3 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-60 ${activeContent.buttonClass}`}
            data-track-event={activeContent.trackEvent}
            disabled={permissions.busy !== null}
            onClick={permissions.activeStep === "push" ? handleRequestPush : handleRequestGps}
          >
            <activeContent.Icon className="h-4 w-4" aria-hidden="true" />
            {permissions.busy === permissions.activeStep ? "Aguardando..." : activeContent.cta}
          </button>
        </div>
      </div>

      <p className="mt-3 text-[11px] leading-4 text-slate-500">
        {activeContent.tip}
      </p>
    </div>
  );
}

async function trackEvent(payload: TrackPayload) {
  if (isTrackingDisabled()) {
    return;
  }

  try {
    const snapshot = getTrackingSnapshot();
    const publicTracking = readPublicTrackingContext();

    const response = await fetch("/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        ...buildPublicTrackingApiBody(publicTracking),
        visitor_cookie_id: snapshot.visitorId,
        session_cookie_id: snapshot.sessionId,
        first_touch: snapshot.firstTouch,
        last_touch: snapshot.lastTouch,
        attribution: snapshot.attribution,
        consent: snapshot.consent,
        event_type: payload.event_type,
        referrer: document.referrer,
        search_params: window.location.search,
        metadata: {
          ...buildPublicTrackingMetadata(publicTracking),
          ...(payload.metadata ?? getPageMetadata()),
          tracking_cookies: snapshot.cookies,
        },
      }),
    });
    const result = await response.json().catch(() => null) as { public_tracking?: ConnectyPublicTrackingContext | null } | null;

    if (response.ok && result?.public_tracking) {
      writePublicTrackingContext(result.public_tracking);
    }
  } catch {
    // Tracking cannot block product flows.
  }
}

async function capturePermissionSignals() {
  if (typeof window === "undefined") {
    return;
  }

  const vapidPublicKey = await resolveVapidPublicKey();
  const notificationPermission = getPushPermissionForTracking();

  await trackEvent({
    event_type: "push_permission_status",
    metadata: {
      ...getPageMetadata(),
      permission: notificationPermission,
      vapid_configured: Boolean(vapidPublicKey),
    },
  });

  if (!("permissions" in navigator)) {
    await trackEvent({
      event_type: "gps_permission_status",
      metadata: {
        ...getPageMetadata(),
        permission: "unknown",
      },
    });

    return;
  }

  try {
    const permission = await navigator.permissions.query({ name: "geolocation" as PermissionName });

    await trackEvent({
      event_type: "gps_permission_status",
      metadata: {
        ...getPageMetadata(),
        permission: permission.state,
      },
    });

    if (permission.state === "granted" && "geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          void trackEvent({
            event_type: "gps_location_granted",
            metadata: {
              ...getPageMetadata(),
              gps_permission: { status: "granted", source: "passive_granted" },
              precise_location: formatPosition(position),
            },
          });
        },
        (error) => {
          void trackEvent({
            event_type: "gps_location_failed",
            metadata: {
              ...getPageMetadata(),
              gps_permission: {
                status: "unavailable",
                source: "passive_granted",
                code: error.code,
                message: error.message,
              },
            },
          });
        },
        {
          enableHighAccuracy: false,
          timeout: 5000,
          maximumAge: 10 * 60 * 1000,
        },
      );
    }
  } catch {
    await trackEvent({
      event_type: "gps_permission_status",
      metadata: {
        ...getPageMetadata(),
        permission: "unsupported",
      },
    });
  }
}

async function requestPushPermission(): Promise<PermissionRequestResult> {
  const vapidPublicKey = await resolveVapidPublicKey();

  if (!isPushRequestSupported(vapidPublicKey)) {
    await trackEvent({
      event_type: "push_subscription_failed",
      metadata: {
        ...getPageMetadata(),
        reason: vapidPublicKey ? "unsupported_browser" : "missing_vapid_public_key",
      },
    });

    return "unsupported";
  }

  try {
    await trackEvent({
      event_type: "push_permission_requested",
      metadata: {
        ...getPageMetadata(),
        vapid_configured: true,
      },
    });

    const permission = await Notification.requestPermission();

    await trackEvent({
      event_type: "push_permission_status",
      metadata: {
        ...getPageMetadata(),
        permission,
        source: "request",
      },
    });

    if (permission !== "granted") {
      await trackEvent({
        event_type: permission === "denied" ? "push_permission_denied" : "push_permission_dismissed",
        metadata: {
          ...getPageMetadata(),
          permission,
        },
      });

      return permission === "denied" ? "denied" : "dismissed";
    }

    const registration = await navigator.serviceWorker.register("/connecty-push-sw.js", { scope: "/" });
    await registration.update().catch(() => undefined);
    const readyRegistration = await navigator.serviceWorker.ready;
    const existingSubscription = await readyRegistration.pushManager.getSubscription();
    const subscription = existingSubscription ?? await readyRegistration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
    });
    const snapshot = getTrackingSnapshot();
    const publicTracking = readPublicTrackingContext();
    const response = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...buildPublicTrackingApiBody(publicTracking),
        visitor_cookie_id: snapshot.visitorId,
        session_cookie_id: snapshot.sessionId,
        permission,
        subscription: subscription.toJSON(),
        metadata: {
          ...buildPublicTrackingMetadata(publicTracking),
          ...getPageMetadata(),
          first_touch: snapshot.firstTouch,
          last_touch: snapshot.lastTouch,
          attribution: snapshot.attribution,
          consent: snapshot.consent,
          tracking_cookies: snapshot.cookies,
        },
      }),
    });

    const result = await response.json().catch(() => null) as { endpoint_hash?: string; error?: string } | null;

    if (!response.ok) {
      throw new Error(result?.error || "Falha ao salvar assinatura push.");
    }

    await trackEvent({
      event_type: "push_subscription_status",
      metadata: {
        ...getPageMetadata(),
        status: "saved",
        endpoint_hash: result?.endpoint_hash ?? null,
      },
    });

    return "granted";
  } catch (error) {
    await trackEvent({
      event_type: "push_subscription_failed",
      metadata: {
        ...getPageMetadata(),
        reason: error instanceof Error ? error.message : "unknown_error",
      },
    });

    return "failed";
  }
}

async function requestGpsPermission(): Promise<PermissionRequestResult> {
  if (!("geolocation" in navigator)) {
    await trackEvent({
      event_type: "gps_permission_status",
      metadata: {
        ...getPageMetadata(),
        permission: "unsupported",
        source: "request",
      },
    });

    return "unsupported";
  }

  await trackEvent({
    event_type: "gps_permission_requested",
    metadata: getPageMetadata(),
  });

  try {
    const position = await readCurrentPosition({
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0,
    });

    await trackEvent({
      event_type: "gps_permission_status",
      metadata: {
        ...getPageMetadata(),
        permission: "granted",
        source: "request",
      },
    });

    await trackEvent({
      event_type: "gps_location_granted",
      metadata: {
        ...getPageMetadata(),
        gps_permission: { status: "granted", source: "request" },
        precise_location: formatPosition(position),
      },
    });

    return "granted";
  } catch (error) {
    const state = await readGpsPermissionState();
    const details = readGeolocationError(error);

    await trackEvent({
      event_type: "gps_permission_status",
      metadata: {
        ...getPageMetadata(),
        permission: state,
        source: "request",
        ...details,
      },
    });

    await trackEvent({
      event_type: state === "denied" ? "gps_permission_denied" : "gps_location_failed",
      metadata: {
        ...getPageMetadata(),
        gps_permission: {
          status: state,
          source: "request",
          ...details,
        },
      },
    });

    return state === "denied" ? "denied" : "failed";
  }
}

function getPushResultMessage(result: PermissionRequestResult) {
  if (result === "granted") {
    return "Pronto. Você vai receber alertas importantes quando leads responderem e quando houver novidades da ConnectyHub.";
  }

  if (result === "denied") {
    return "Sem problema. Para receber novidades depois, libere notificacoes nas permissoes do navegador.";
  }

  if (result === "dismissed") {
    return "Você pode confirmar o push depois. O navegador mostra essa escolha no topo da tela.";
  }

  if (result === "unsupported") {
    return "Este navegador ainda nao liberou Web Push nesta sessao.";
  }

  return "Nao conseguimos conectar o push agora. Vamos tentar novamente em outro momento.";
}

function getGpsResultMessage(result: PermissionRequestResult) {
  if (result === "granted") {
    return "Pronto. Sua experiencia pode ser personalizada com base na sua regiao.";
  }

  if (result === "denied") {
    return "Sem problema. Para personalizar por regiao depois, libere localizacao nas permissoes do navegador.";
  }

  if (result === "unsupported") {
    return "Este navegador nao liberou localizacao nesta sessao.";
  }

  return "Não conseguimos ler sua localização agora. Você pode tentar novamente depois.";
}

function getNextPermissionStep(snapshot: Pick<PermissionPromptState, "push" | "gps">, completedSteps: PermissionStep[]): PermissionStep | null {
  if (!completedSteps.includes("push") && shouldAskForPush(snapshot.push)) {
    return "push";
  }

  if (!completedSteps.includes("gps") && shouldAskForGps(snapshot.gps)) {
    return "gps";
  }

  return null;
}

function shouldShowPermissionPrompt(snapshot: Pick<PermissionPromptState, "push" | "gps">, completedSteps: PermissionStep[]) {
  return getNextPermissionStep(snapshot, completedSteps) !== null;
}

function shouldAskForPush(permission: PermissionSignal) {
  return permission !== "granted" && permission !== "unsupported";
}

function shouldAskForGps(permission: PermissionSignal) {
  return permission !== "granted" && permission !== "unsupported";
}

function addCompletedStep(steps: PermissionStep[], step: PermissionStep) {
  return steps.includes(step) ? steps : [...steps, step];
}

function getActivePromptContent(step: PermissionStep, permission: PermissionSignal, audience: PermissionPromptAudience) {
  if (step === "push") {
    const wasBlocked = permission === "denied";
    const isPublic = audience === "public";

    return {
      Icon: Bell,
      stepLabel: "Passo 1 de 2",
      title: isPublic
        ? (wasBlocked ? "Libere avisos da loja" : "Receba atualizacoes da loja")
        : (wasBlocked ? "Libere alertas de atendimento" : "Receba respostas dos leads"),
      description: isPublic
        ? "Ative avisos para acompanhar pedido, ofertas e retorno da loja. Depois podemos personalizar sua experiencia por regiao."
        : "Primeiro vamos ativar notificacoes para avisar quando um lead responder. Depois seguimos para a experiencia por regiao.",
      eyebrow: isPublic ? "Atualizacoes do pedido" : "Alertas de atendimento",
      body: isPublic
        ? (wasBlocked
          ? "Seu navegador bloqueou notificacoes. Clique para ver a orientacao e liberar quando quiser receber novidades da loja."
          : "Receba um aviso neste navegador quando a loja enviar novidades, status do pedido ou uma resposta importante.")
        : (wasBlocked
          ? "Seu navegador bloqueou notificacoes. Clique para ver a orientacao e liberar quando quiser receber alertas de conversa."
          : "Receba um aviso no navegador quando um lead responder no WhatsApp, mesmo que você esteja em outra aba."),
      cta: wasBlocked ? "Liberar notificacoes" : isPublic ? "Receber avisos" : "Ativar alertas",
      tip: wasBlocked
        ? "Dica: se o navegador nao abrir o aviso, clique no cadeado ao lado do endereco e libere notificacoes."
        : "Dica: depois de clicar, confirme em Permitir no aviso que aparece no topo do navegador.",
      trackEvent: "tracking_prompt_push_clicked",
      containerClass: "border-emerald-100 bg-emerald-50",
      iconClass: "border border-emerald-100 bg-white text-[#128C4A]",
      eyebrowClass: "text-[#128C4A]",
      buttonClass: "border-[#25D366] bg-[#25D366] text-white hover:bg-[#20bf5a]",
    };
  }

  const wasBlocked = permission === "denied";
  const isPublic = audience === "public";

  return {
    Icon: LocateFixed,
    stepLabel: "Passo 2 de 2",
    title: isPublic
      ? (wasBlocked ? "Libere ofertas da sua regiao" : "Veja condicoes da sua regiao")
      : (wasBlocked ? "Personalize sua experiencia por regiao" : "Ative a experiencia por regiao"),
    description: isPublic
      ? "Use localizacao aproximada para melhorar disponibilidade, entrega e ofertas quando a loja trabalhar por regiao."
      : "Agora vamos ajustar a experiencia para o seu contexto local.",
    eyebrow: isPublic ? "Regiao e entrega" : "Experiencia por regiao",
    body: isPublic
      ? (wasBlocked
        ? "Seu navegador bloqueou a localizacao. Clique para ver a orientacao e liberar quando quiser uma experiencia mais personalizada."
        : "Sua localização ajuda a loja a entender melhor região, entrega e ofertas relevantes para você.")
      : (wasBlocked
        ? "Seu navegador bloqueou a localizacao. Clique para ver a orientacao e liberar quando quiser uma experiencia mais personalizada."
        : "Use sua localizacao para receber sugestoes, convites e atendimento mais alinhados ao seu contexto."),
    cta: wasBlocked ? "Liberar localizacao" : "Personalizar regiao",
    tip: wasBlocked
      ? "Dica: se o navegador nao abrir o aviso, clique no cadeado ao lado do endereco e libere localizacao."
      : "Dica: depois de clicar, confirme em Permitir no aviso que aparece no topo do navegador.",
    trackEvent: "tracking_prompt_gps_clicked",
    containerClass: "border-blue-100 bg-blue-50",
    iconClass: "border border-blue-100 bg-white text-blue-700",
    eyebrowClass: "text-blue-700",
    buttonClass: "border-blue-600 bg-blue-600 text-white hover:bg-blue-700",
  };
}

function waitForNextPaint() {
  return new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}

async function readBrowserPermissionSnapshot(): Promise<Pick<PermissionPromptState, "push" | "gps">> {
  const vapidPublicKey = await resolveVapidPublicKey();

  return {
    push: readPushPermissionState(vapidPublicKey),
    gps: await readGpsPermissionState(),
  };
}

function readPushPermissionState(vapidPublicKey: string): PermissionSignal {
  if (!isPushRequestSupported(vapidPublicKey)) {
    return "unsupported";
  }

  return Notification.permission === "default" ? "prompt" : Notification.permission;
}

async function readGpsPermissionState(): Promise<PermissionSignal> {
  if (!("geolocation" in navigator)) {
    return "unsupported";
  }

  if (!("permissions" in navigator)) {
    return "prompt";
  }

  try {
    const permission = await navigator.permissions.query({ name: "geolocation" as PermissionName });
    return permission.state;
  } catch {
    return "unknown";
  }
}

function isPushRequestSupported(vapidPublicKey: string) {
  return (
    typeof Notification !== "undefined"
    && "serviceWorker" in navigator
    && "PushManager" in window
    && Boolean(vapidPublicKey)
  );
}

function getPushPermissionForTracking() {
  if (typeof Notification === "undefined") {
    return "unsupported";
  }

  return Notification.permission;
}

function getEnvVapidPublicKey() {
  return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() ?? "";
}

async function resolveVapidPublicKey() {
  if (cachedVapidPublicKey !== null) {
    return cachedVapidPublicKey;
  }

  const envPublicKey = getEnvVapidPublicKey();

  if (envPublicKey) {
    cachedVapidPublicKey = envPublicKey;
    return envPublicKey;
  }

  if (!vapidPublicKeyPromise) {
    vapidPublicKeyPromise = fetch("/api/push/config", {
      headers: { Accept: "application/json" },
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) {
          return "";
        }

        const payload = await response.json().catch(() => null) as { public_key?: unknown } | null;
        return typeof payload?.public_key === "string" ? payload.public_key.trim() : "";
      })
      .catch(() => "");
  }

  cachedVapidPublicKey = await vapidPublicKeyPromise;

  return cachedVapidPublicKey;
}

function readCurrentPosition(options: PositionOptions) {
  return new Promise<GeolocationPosition>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, options);
  });
}

function formatPosition(position: GeolocationPosition) {
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracy: position.coords.accuracy,
    altitude: position.coords.altitude,
    heading: position.coords.heading,
    speed: position.coords.speed,
    captured_at: new Date().toISOString(),
  };
}

function readGeolocationError(error: unknown) {
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    const code = typeof record.code === "number" ? record.code : null;
    const message = typeof record.message === "string" ? record.message : "unknown_error";

    return code === null ? { message } : { code, message };
  }

  return { message: error instanceof Error ? error.message : "unknown_error" };
}

function urlBase64ToUint8Array(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = `${value}${padding}`.replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let index = 0; index < rawData.length; index += 1) {
    outputArray[index] = rawData.charCodeAt(index);
  }

  return outputArray;
}

function getPageMetadata() {
  const publicTracking = readPublicTrackingContext();
  const commerceSurface = resolveCommerceSurface(window.location.pathname);

  return {
    page_path: window.location.pathname,
    page_url: window.location.href,
    page_title: document.title,
    commerce_surface: commerceSurface,
    commerce_context: commerceSurface
      ? {
          surface: commerceSurface,
          product_id: publicTracking?.product_id ?? publicTracking?.catalog_item_id ?? null,
          catalog_item_id: publicTracking?.catalog_item_id ?? null,
          order_id: publicTracking?.order_id ?? null,
          payment_session_id: publicTracking?.payment_session_id ?? null,
          tracking_source: publicTracking?.tracking_source ?? null,
        }
      : null,
    commerce_cart_snapshot: commerceSurface ? readCommerceCartSnapshot(publicTracking?.organization_id ?? null) : null,
  };
}

function getFormMetadata(form: HTMLFormElement) {
  return {
    form_id: form.id || null,
    form_name: form.getAttribute("name"),
    form_action: form.getAttribute("action"),
    form_method: form.getAttribute("method") || "get",
    form_fields: form.elements.length,
    form_label: form.dataset.trackLabel || form.getAttribute("aria-label") || null,
  };
}

function summarizeText(value: string | null) {
  const text = value?.replace(/\s+/g, " ").trim() ?? "";
  return text ? text.slice(0, 90) : null;
}

function isDashboardPath(pathname: string | null) {
  return Boolean(pathname?.startsWith("/dashboard") || pathname?.startsWith("/admin"));
}

function isCommercePublicPath(pathname: string | null) {
  return Boolean(
    pathname?.startsWith("/docs/api")
    || pathname?.startsWith("/loja/")
    || pathname?.startsWith("/produto/")
    || pathname?.startsWith("/checkout/"),
  );
}

function resolveCommerceSurface(pathname: string | null) {
  const path = pathname?.toLowerCase() ?? "";

  if (path.startsWith("/checkout/")) return "checkout";
  if (path.startsWith("/produto/") || path.includes("/produto/")) return "product";
  if (path.startsWith("/loja/") && path.includes("/carrinho")) return "cart";
  if (path.startsWith("/loja/")) return "store";
  return null;
}

function getCommercePageViewEvent(pathname: string | null) {
  const surface = resolveCommerceSurface(pathname);

  if (surface === "checkout") return "commerce.checkout_viewed";
  if (surface === "product") return "commerce.product_viewed";
  if (surface === "cart") return "commerce.cart_viewed";
  if (surface === "store") return "commerce.store_viewed";
  return null;
}

function readCommerceCartSnapshot(organizationId: string | null) {
  if (!organizationId) {
    return null;
  }

  try {
    const rawCart = window.localStorage.getItem(`connecty-store-cart:${organizationId}`);
    const parsed = rawCart ? JSON.parse(rawCart) as unknown : null;
    const items = Array.isArray(parsed) ? parsed : [];
    const itemCount = items.reduce((total, item) => {
      const record = readRecord(item);
      const quantity = typeof record?.quantity === "number" && Number.isFinite(record.quantity)
        ? record.quantity
        : 1;

      return total + Math.max(0, quantity);
    }, 0);

    return {
      lines: items.length,
      item_count: itemCount,
      product_ids: items
        .map((item) => readString(readRecord(item)?.productId))
        .filter((item): item is string => Boolean(item))
        .slice(0, 20),
    };
  } catch {
    return null;
  }
}

function normalizeCommerceCustomEventType(value: string | null) {
  if (!value) return null;

  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.:-]+/g, "_")
    .slice(0, 80);

  if (!normalized) return null;
  return normalized.startsWith("commerce.") ? normalized : `commerce.${normalized}`;
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
