import "server-only";

import { createPrivateKey, sign, type KeyObject } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptCredentialValue } from "@/lib/security/credentials-crypto";

type JsonRecord = Record<string, unknown>;

type PushSubscriptionRow = {
  id: string;
  endpoint: string;
  user_id: string | null;
  organization_id: string | null;
  last_seen_at: string | null;
};

type VapidCredentials = {
  publicKey: string;
  privateKey: string;
  subject: string;
};

const pushSubscriptionFreshDays = 90;

export async function sendLeadReplyPushNotifications(input: {
  client: SupabaseClient;
  organizationId: string;
}) {
  const credentials = await loadVapidCredentials(input.client);

  if (!credentials) {
    return { attempted: 0, sent: 0, failed: 0, skipped: true };
  }

  const subscriptions = await loadOrganizationPushSubscriptions(input.client, input.organizationId);

  if (!subscriptions.length) {
    return { attempted: 0, sent: 0, failed: 0, skipped: false };
  }

  let sent = 0;
  let failed = 0;

  for (const subscription of subscriptions.slice(0, 50)) {
    const result = await sendEmptyWebPush(subscription.endpoint, credentials);

    if (result.ok) {
      sent += 1;
      continue;
    }

    failed += 1;

    if (result.expired) {
      await input.client.from("push_subscriptions").delete().eq("id", subscription.id);
    }
  }

  return {
    attempted: Math.min(subscriptions.length, 50),
    sent,
    failed,
    skipped: false,
  };
}

async function loadOrganizationPushSubscriptions(client: SupabaseClient, organizationId: string) {
  const cutoff = new Date(Date.now() - pushSubscriptionFreshDays * 24 * 60 * 60 * 1000).toISOString();
  const { data: members } = await client
    .from("organization_members")
    .select("user_id")
    .eq("organization_id", organizationId);
  const memberIds = Array.from(new Set((members ?? [])
    .map((member) => readString((member as JsonRecord).user_id))
    .filter(Boolean) as string[]));
  const [organizationSubscriptions, userSubscriptions] = await Promise.all([
    client
      .from("push_subscriptions")
      .select("id, endpoint, user_id, organization_id, last_seen_at")
      .eq("permission", "granted")
      .eq("organization_id", organizationId)
      .is("unsubscribed_at", null)
      .gte("last_seen_at", cutoff)
      .order("last_seen_at", { ascending: false }),
    memberIds.length
      ? client
          .from("push_subscriptions")
          .select("id, endpoint, user_id, organization_id, last_seen_at")
          .eq("permission", "granted")
          .in("user_id", memberIds)
          .is("unsubscribed_at", null)
          .gte("last_seen_at", cutoff)
          .order("last_seen_at", { ascending: false })
      : Promise.resolve({ data: [] as PushSubscriptionRow[], error: null }),
  ]);

  const subscriptions = [
    ...((organizationSubscriptions.data ?? []) as PushSubscriptionRow[]),
    ...((userSubscriptions.data ?? []) as PushSubscriptionRow[]),
  ];
  const byEndpoint = new Map<string, PushSubscriptionRow>();

  for (const subscription of subscriptions) {
    if (subscription.endpoint) {
      byEndpoint.set(subscription.endpoint, subscription);
    }
  }

  return Array.from(byEndpoint.values());
}

async function sendEmptyWebPush(endpoint: string, credentials: VapidCredentials) {
  const audience = getPushAudience(endpoint);

  if (!audience) {
    return { ok: false, expired: false };
  }

  const token = createVapidJwt({
    audience,
    subject: credentials.subject,
    publicKey: credentials.publicKey,
    privateKey: credentials.privateKey,
  });
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `vapid t=${token}, k=${credentials.publicKey}`,
      TTL: "300",
      Urgency: "high",
    },
  }).catch(() => null);

  if (!response) {
    return { ok: false, expired: false };
  }

  return {
    ok: response.status >= 200 && response.status < 300,
    expired: response.status === 404 || response.status === 410,
  };
}

async function loadVapidCredentials(client: SupabaseClient): Promise<VapidCredentials | null> {
  const envPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() ?? "";
  const envPrivateKey = process.env.VAPID_PRIVATE_KEY?.trim() ?? "";
  const envSubject = process.env.VAPID_SUBJECT?.trim() ?? "";

  if (envPublicKey && envPrivateKey && envSubject) {
    return {
      publicKey: envPublicKey,
      privateKey: envPrivateKey,
      subject: envSubject,
    };
  }

  const { data } = await client
    .from("integration_credentials")
    .select("env_name, encrypted_value")
    .eq("scope", "platform")
    .eq("integration_id", "push")
    .is("organization_id", null)
    .in("env_name", ["NEXT_PUBLIC_VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"]);
  const values = new Map<string, string>();

  for (const row of (data ?? []) as Array<{ env_name: string | null; encrypted_value: string | null }>) {
    if (row.env_name && row.encrypted_value) {
      values.set(row.env_name, decryptCredentialValue(row.encrypted_value).trim());
    }
  }

  const publicKey = envPublicKey || values.get("NEXT_PUBLIC_VAPID_PUBLIC_KEY") || "";
  const privateKey = envPrivateKey || values.get("VAPID_PRIVATE_KEY") || "";
  const subject = envSubject || values.get("VAPID_SUBJECT") || "";

  if (!publicKey || !privateKey || !subject) {
    return null;
  }

  return { publicKey, privateKey, subject };
}

function createVapidJwt(input: {
  audience: string;
  subject: string;
  publicKey: string;
  privateKey: string;
}) {
  const header = base64urlJson({ typ: "JWT", alg: "ES256" });
  const payload = base64urlJson({
    aud: input.audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub: input.subject,
  });
  const signingInput = `${header}.${payload}`;
  const key = createVapidPrivateKey(input.publicKey, input.privateKey);
  const signature = derToJose(sign("SHA256", Buffer.from(signingInput), key));

  return `${signingInput}.${signature}`;
}

function createVapidPrivateKey(publicKey: string, privateKey: string): KeyObject {
  if (privateKey.includes("BEGIN")) {
    return createPrivateKey(privateKey);
  }

  const publicBytes = base64urlDecode(publicKey);
  const privateBytes = base64urlDecode(privateKey);

  if (publicBytes.length !== 65 || publicBytes[0] !== 4 || privateBytes.length !== 32) {
    throw new Error("Chaves VAPID invalidas.");
  }

  return createPrivateKey({
    key: {
      kty: "EC",
      crv: "P-256",
      x: publicBytes.subarray(1, 33).toString("base64url"),
      y: publicBytes.subarray(33, 65).toString("base64url"),
      d: privateBytes.toString("base64url"),
    },
    format: "jwk",
  });
}

function derToJose(signature: Buffer) {
  let offset = 0;

  if (signature[offset++] !== 0x30) {
    throw new Error("Assinatura VAPID invalida.");
  }

  const sequenceLength = readDerLength(signature, offset);
  offset = sequenceLength.offset;

  if (signature[offset++] !== 0x02) {
    throw new Error("Assinatura VAPID invalida.");
  }

  const rLength = readDerLength(signature, offset);
  offset = rLength.offset;
  const r = signature.subarray(offset, offset + rLength.length);
  offset += rLength.length;

  if (signature[offset++] !== 0x02) {
    throw new Error("Assinatura VAPID invalida.");
  }

  const sLength = readDerLength(signature, offset);
  offset = sLength.offset;
  const s = signature.subarray(offset, offset + sLength.length);

  return Buffer.concat([normalizeInteger(r), normalizeInteger(s)]).toString("base64url");
}

function readDerLength(buffer: Buffer, offset: number) {
  const first = buffer[offset++];

  if (first < 0x80) {
    return { length: first, offset };
  }

  const bytes = first & 0x7f;
  let length = 0;

  for (let index = 0; index < bytes; index += 1) {
    length = (length << 8) + buffer[offset++];
  }

  return { length, offset };
}

function normalizeInteger(value: Buffer) {
  let normalized = value;

  while (normalized.length > 0 && normalized[0] === 0) {
    normalized = normalized.subarray(1);
  }

  if (normalized.length > 32) {
    normalized = normalized.subarray(normalized.length - 32);
  }

  if (normalized.length === 32) {
    return normalized;
  }

  return Buffer.concat([Buffer.alloc(32 - normalized.length), normalized]);
}

function getPushAudience(endpoint: string) {
  try {
    const url = new URL(endpoint);
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}

function base64urlJson(value: JsonRecord) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function base64urlDecode(value: string) {
  return Buffer.from(value, "base64url");
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
