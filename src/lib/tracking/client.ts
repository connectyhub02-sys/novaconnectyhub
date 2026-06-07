const visitorCookieName = "connecty_visitor_id";
const consentCookieName = "connecty_tracking_consent";
const disabledCookieName = "connecty_tracking_disabled";
const cookieDays = 365;

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
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
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
