"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import Script from "next/script";
import Link from "next/link";
import { getCookie, grantTrackingConsent, isTrackingDisabled, revokeTrackingConsent, deleteCookie } from "@/lib/tracking/client";
import { analyticsLocation, analyticsReferrer, isPlatformAnalyticsPage } from "@/lib/tracking/google-analytics-policy";

type AnalyticsWindow = Window & {
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
} & Record<`ga-disable-${string}`, boolean>;

function subscribe(listener: () => void) {
  window.addEventListener("connecty:tracking-consent", listener);
  window.addEventListener("focus", listener);
  return () => { window.removeEventListener("connecty:tracking-consent", listener); window.removeEventListener("focus", listener); };
}
function browserSnapshot() {
  return `${window.location.hostname}|${isTrackingDisabled() ? "denied" : getCookie("connecty_tracking_explicit_consent") === "true" ? "granted" : "unknown"}`;
}
const serverSnapshot = () => "";

export function GoogleAnalytics({ measurementId }: { measurementId: string }) {
  const pathname = usePathname();
  const snapshot = useSyncExternalStore(subscribe, browserSnapshot, serverSnapshot);
  const [hostname, choice] = snapshot.split("|");
  const [preferences, setPreferences] = useState(false);
  const publicPage = isPlatformAnalyticsPage(pathname, hostname);
  const lastPage = useRef<string | null>(null);
  const initialized = useRef(false);
  const validId = /^G-[A-Z0-9]+$/.test(measurementId);

  useEffect(() => {
    if (!validId) return;
    const win = window as unknown as AnalyticsWindow;
    const allowed = choice === "granted" && isPlatformAnalyticsPage(pathname, window.location.hostname);
    win[`ga-disable-${measurementId}`] = !allowed;
    if (!allowed) { lastPage.current = null; return; }
    win.dataLayer ||= [];
    // The Google tag command queue uses Arguments objects, as in Google's snippet.
    // eslint-disable-next-line prefer-rest-params
    win.gtag ||= function () { win.dataLayer!.push(arguments); };
    if (!initialized.current) {
      win.gtag("consent", "default", { analytics_storage: "granted", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" });
      win.gtag("js", new Date());
      win.gtag("config", measurementId, { send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false });
      initialized.current = true;
    }
    const page = analyticsLocation(window.location.href);
    if (lastPage.current === page) return;
    win.gtag("set", { page_location: page, page_referrer: lastPage.current || analyticsReferrer(document.referrer) });
    win.gtag("event", "page_view", { send_to: measurementId, page_location: page, page_title: document.title,
      page_referrer: lastPage.current || analyticsReferrer(document.referrer) });
    lastPage.current = page;
  }, [pathname, choice, measurementId, validId]);

  function choose(granted: boolean) {
    if (granted) grantTrackingConsent();
    else {
      revokeTrackingConsent();
      (window as unknown as AnalyticsWindow)[`ga-disable-${measurementId}`] = true;
      for (const item of document.cookie.split(";")) {
        const name = item.trim().split("=")[0];
        if (name === "_ga" || name.startsWith("_ga_")) deleteCookie(name);
      }
    }
    window.dispatchEvent(new Event("connecty:tracking-consent"));
    setPreferences(false);
  }

  if (!validId || !publicPage || !choice) return null;
  return <>
    {choice === "granted" && <Script id="connectyhub-ga4" src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`} strategy="afterInteractive" />}
    {(choice === "unknown" || preferences) ? <section aria-label="Preferências de cookies" className="fixed bottom-4 left-4 z-[100] max-w-md rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-900 shadow-xl mr-4">
      <p className="font-semibold">Estatísticas de visitas</p>
      <p className="mt-1 text-slate-600">Podemos usar o Google Analytics para entender as visitas às páginas públicas? Você pode mudar sua escolha em Cookies. <Link href="/privacidade" className="underline">Privacidade</Link></p>
      <div className="mt-3 flex gap-3"><button className="rounded-lg border border-slate-300 px-4 py-2" onClick={() => choose(false)}>Recusar</button><button className="rounded-lg bg-blue-600 px-4 py-2 text-white" onClick={() => choose(true)}>Aceitar estatísticas</button></div>
    </section> : <button className="fixed bottom-2 left-2 z-50 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600 shadow" onClick={() => setPreferences(true)}>Cookies</button>}
  </>;
}
