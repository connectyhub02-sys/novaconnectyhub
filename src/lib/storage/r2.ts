import "server-only";

import { createHash, createHmac } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptCredentialValue } from "@/lib/security/credentials-crypto";
import { createServiceClient } from "@/lib/supabase/service";

export type R2Config = {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicUrl: string;
};

type CredentialRow = {
  env_name: string;
  encrypted_value: string;
  value_preview: string;
};

type LoadR2ConfigResult =
  | { ok: true; config: R2Config }
  | { ok: false; error: string };

const r2EnvNames = [
  "R2_ACCOUNT_ID",
  "R2_ENDPOINT",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
  "R2_PUBLIC_URL",
];

export async function loadR2Config(client: SupabaseClient = createServiceClient()): Promise<LoadR2ConfigResult> {
  const values = new Map<string, string>();
  const { data, error } = await client
    .from("integration_credentials")
    .select("env_name, encrypted_value, value_preview")
    .eq("scope", "platform")
    .eq("integration_id", "r2")
    .is("organization_id", null)
    .in("env_name", r2EnvNames)
    .order("updated_at", { ascending: false });

  if (error) {
    return { ok: false, error: error.message };
  }

  for (const credential of (data ?? []) as CredentialRow[]) {
    if (values.has(credential.env_name)) {
      continue;
    }

    try {
      values.set(credential.env_name, decryptCredentialValue(credential.encrypted_value));
    } catch {
      values.set(credential.env_name, credential.value_preview);
    }
  }

  for (const envName of r2EnvNames) {
    const value = process.env[envName];

    if (value && !values.has(envName)) {
      values.set(envName, value);
    }
  }

  const accountId = values.get("R2_ACCOUNT_ID")?.trim() ?? "";
  const endpoint = normalizeBaseUrl(
    values.get("R2_ENDPOINT")?.trim() || (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : ""),
  );
  const publicUrl = normalizeBaseUrl(values.get("R2_PUBLIC_URL")?.trim() ?? "");
  const accessKeyId = values.get("R2_ACCESS_KEY_ID")?.trim() ?? "";
  const secretAccessKey = values.get("R2_SECRET_ACCESS_KEY")?.trim() ?? "";
  const bucket = values.get("R2_BUCKET")?.trim() ?? "";

  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket || !publicUrl) {
    return {
      ok: false,
      error: "Configure Endpoint, Access key ID, Secret access key, Bucket e Public URL do R2 na sala de manutencao.",
    };
  }

  return {
    ok: true,
    config: {
      endpoint,
      accessKeyId,
      secretAccessKey,
      bucket,
      publicUrl,
    },
  };
}

export async function putR2Object(config: R2Config, objectKey: string, body: Uint8Array, contentType: string) {
  const endpointUrl = new URL(config.endpoint);
  const method = "PUT";
  const region = "auto";
  const service = "s3";
  const now = new Date();
  const amzDate = toAmzDate(now);
  const dateStamp = amzDate.slice(0, 8);
  const canonicalUri = `/${encodePathSegment(config.bucket)}/${encodeObjectKey(objectKey)}`;
  const payloadHash = sha256Hex(body);
  const host = endpointUrl.host;
  const canonicalHeaders = [
    `host:${host}`,
    `x-amz-content-sha256:${payloadHash}`,
    `x-amz-date:${amzDate}`,
    "",
  ].join("\n");
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
  const canonicalRequest = [
    method,
    canonicalUri,
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");
  const signature = hmacHex(getSignatureKey(config.secretAccessKey, dateStamp, region, service), stringToSign);
  const authorization = [
    `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${credentialScope}`,
    `SignedHeaders=${signedHeaders}`,
    `Signature=${signature}`,
  ].join(", ");
  const uploadBuffer = body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer;
  const uploadBody = new Blob([uploadBuffer], { type: contentType });
  const response = await fetch(`${endpointUrl.origin}${canonicalUri}`, {
    method,
    headers: {
      Authorization: authorization,
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Type": contentType,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
    },
    body: uploadBody,
    cache: "no-store",
  });

  if (!response.ok) {
    await response.text().catch(() => "");
    return {
      ok: false as const,
      error: `Falha ao enviar arquivo para o storage (status ${response.status}).`,
    };
  }

  return {
    ok: true as const,
    objectKey,
    publicUrl: buildPublicObjectUrl(config.publicUrl, objectKey),
    bytesSize: body.byteLength,
  };
}

export function buildPublicObjectUrl(publicUrl: string, objectKey: string) {
  return `${publicUrl.replace(/\/$/, "")}/${encodeObjectKey(objectKey)}`;
}

function normalizeBaseUrl(value: string) {
  if (!value) {
    return "";
  }

  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return "";
    }

    return url.origin.replace(/\/$/, "");
  } catch {
    return "";
  }
}

function encodePathSegment(value: string) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function encodeObjectKey(value: string) {
  return value.split("/").map(encodePathSegment).join("/");
}

function toAmzDate(date: Date) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

function sha256Hex(value: string | Uint8Array) {
  return createHash("sha256").update(value).digest("hex");
}

function hmac(key: Buffer | string, value: string) {
  return createHmac("sha256", key).update(value, "utf8").digest();
}

function hmacHex(key: Buffer, value: string) {
  return createHmac("sha256", key).update(value, "utf8").digest("hex");
}

function getSignatureKey(secretAccessKey: string, dateStamp: string, regionName: string, serviceName: string) {
  const kDate = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, regionName);
  const kService = hmac(kRegion, serviceName);
  return hmac(kService, "aws4_request");
}
