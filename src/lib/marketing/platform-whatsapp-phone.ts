// Used only when the live lookup fails (database outage or missing credentials).
// Public links follow the platform attendance instance connected in the admin panel.
export const platformWhatsappFallback = "5511910188233";

const validPhone = /^[1-9][0-9]{9,14}$/;

/** Digits safe for wa.me; Brazilian mobiles stored without the ninth digit get it back. */
export function normalizePlatformWhatsapp(phone: unknown) {
  let digits = String(phone ?? "").replace(/\D/g, "");
  if (/^55[1-9][0-9][6-9][0-9]{7}$/.test(digits)) digits = `${digits.slice(0, 4)}9${digits.slice(4)}`;
  return validPhone.test(digits) ? digits : platformWhatsappFallback;
}
