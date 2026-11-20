import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Operational consoles (Supabase Studio, Inngest dashboard) served on ops-*.connectyhub.com.br.
 * Caddy forward_auth asks /api/admin/ops/verify for every request; the panel grants a short
 * signed cookie only to platform admins, so the consoles open inside the admin without passwords.
 */
export const opsTools = {
  "connectyhub:studio": "https://ops-studio.connectyhub.com.br/",
  "connectyhub:inngest": "https://ops-inngest.connectyhub.com.br/",
  "vision:studio": "https://ops-vision-studio.connectyhub.com.br/",
  "vision:inngest": "https://ops-vision-inngest.connectyhub.com.br/",
} as const;
export type OpsToolKey = keyof typeof opsTools;
export const opsCookieName = "ch_ops";
export const opsCookieMaxAge = 8 * 60 * 60;

export function isOpsTool(value: string | null): value is OpsToolKey {
  return !!value && Object.hasOwn(opsTools, value);
}

function secret() {
  const base = process.env.CREDENTIAL_ENCRYPTION_KEY;
  if (!base) throw new Error("CREDENTIAL_ENCRYPTION_KEY ausente.");
  // Domain-separated key: the encryption key itself never signs anything else here.
  return createHmac("sha256", base).update("connectyhub-infra-ops-cookie-v1").digest();
}

function sign(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function createOpsToken(userId: string, now = Date.now()) {
  const payload = `${userId}.${Math.floor(now / 1000) + opsCookieMaxAge}`;
  return `${payload}.${sign(payload)}`;
}

export function verifyOpsToken(token: string | undefined | null, now = Date.now()) {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userId, exp, signature] = parts;
  if (!/^[0-9a-f-]{36}$/i.test(userId) || !/^\d{9,11}$/.test(exp)) return null;
  const expected = Buffer.from(sign(`${userId}.${exp}`));
  const received = Buffer.from(signature);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;
  if (Number(exp) * 1000 < now) return null;
  return { userId, expiresAt: Number(exp) * 1000 };
}

export function readCookie(header: string | null, name: string) {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return null;
}
