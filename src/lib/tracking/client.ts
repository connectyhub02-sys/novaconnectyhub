const visitorCookieName = "connecty_visitor_id";
const sessionCookieName = "connecty_session_id";
const consentCookieName = "connecty_tracking_consent";
const disabledCookieName = "connecty_tracking_disabled";
const firstTouchCookieName = "connecty_first_touch";
const lastTouchCookieName = "connecty_last_touch";
const utmCookieName = "connecty_utm";
const cookieDays = 365;
const sessionCookieDays = 1;
const attributionKeys = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "gclid", "fbclid", "msclkid", "ttclid"];

export type TrackingTouch = {
  captured_at: string;
  page_path: string;
  page_url: string;
  referrer: string | null;
  attribution: Record<string, string>;
};

export type TrackingSnapshot = {
  visitorId: string;
  sessionId: string;
  consent: "granted" | "denied" | "implicit";
  firstTouch: TrackingTouch | null;
  lastTouch: TrackingTouch;
  attribution: Record<string, string>;
  cookies: {
    visitor: string;
    session: string;
    firstTouch: string;
    lastTouch: string;
    attribution: string;
    consent: string;
  };
};

export function getCookie(name: string) {
  if (typeof document === "undefined") {
    return null;
  }

  const match = document.cookie.match(new RegExp(`(^| )${name}=([^;]+)`));
  return match ? decodeURIComponent(match[2] ?? "") : null;
}

export function setCookie(name: string, value: string, days = cookieDays) {
  if (typeof document === "undefined") {
    return;
  }

  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax${secure}`;
}

export function deleteCookie(name: string) {
  if (typeof document === "undefined") {
    return;
  }

  document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax`;
}

export function isTrackingDisabled() {
  return getCookie(disabledCookieName) === "true";
}

export function grantTrackingConsent() {
  deleteCookie(disabledCookieName);
  setCookie(consentCookieName, "true");
  getVisitorId();
}

export function revokeTrackingConsent() {
  setCookie(disabledCookieName, "true");
  deleteCookie(consentCookieName);
}

export function getVisitorId() {
  const current = getCookie(visitorCookieName);

  if (current) {
    return current;
  }

  const generated = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

  setCookie(visitorCookieName, generated);
  setCookie(consentCookieName, "true");

  return generated;
}

export function getSessionId() {
  const current = getCookie(sessionCookieName);

  if (current) {
    setCookie(sessionCookieName, current, sessionCookieDays);
    return current;
  }

  const generated = createTrackingId("ses");
  setCookie(sessionCookieName, generated, sessionCookieDays);

  return generated;
}

export function getTrackingSnapshot(): TrackingSnapshot {
  const visitorId = getVisitorId();
  const sessionId = getSessionId();
  const currentTouch = buildCurrentTouch();
  const storedFirstTouch = readJsonCookie<TrackingTouch>(firstTouchCookieName);
  const firstTouch = storedFirstTouch ?? currentTouch;
  const currentAttribution = currentTouch.attribution;
  const storedAttribution = readJsonCookie<Record<string, string>>(utmCookieName) ?? {};
  const attribution = Object.keys(currentAttribution).length > 0 ? currentAttribution : storedAttribution;

  if (!storedFirstTouch) {
    setJsonCookie(firstTouchCookieName, firstTouch);
  }

  setJsonCookie(lastTouchCookieName, currentTouch);

  if (Object.keys(currentAttribution).length > 0) {
    setJsonCookie(utmCookieName, {
      ...currentAttribution,
      captured_at: currentTouch.captured_at,
    });
  }

  return {
    visitorId,
    sessionId,
    consent: getConsentState(),
    firstTouch,
    lastTouch: currentTouch,
    attribution,
    cookies: {
      visitor: visitorCookieName,
      session: sessionCookieName,
      firstTouch: firstTouchCookieName,
      lastTouch: lastTouchCookieName,
      attribution: utmCookieName,
      consent: consentCookieName,
    },
  };
}

function buildCurrentTouch(): TrackingTouch {
  return {
    captured_at: new Date().toISOString(),
    page_path: window.location.pathname,
    page_url: window.location.href,
    referrer: document.referrer || null,
    attribution: readAttributionParams(),
  };
}

function readAttributionParams() {
  const params = new URLSearchParams(window.location.search);
  const attribution: Record<string, string> = {};

  for (const key of attributionKeys) {
    const value = params.get(key);

    if (value?.trim()) {
      attribution[key] = value.trim().slice(0, 240);
    }
  }

  return attribution;
}

function getConsentState(): TrackingSnapshot["consent"] {
  if (isTrackingDisabled()) {
    return "denied";
  }

  return getCookie(consentCookieName) === "true" ? "granted" : "implicit";
}

function setJsonCookie(name: string, value: unknown) {
  setCookie(name, JSON.stringify(value));
}

function readJsonCookie<T>(name: string): T | null {
  const value = getCookie(name);

  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function createTrackingId(prefix: string) {
  const id = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

  return `${prefix}_${id}`;
}
