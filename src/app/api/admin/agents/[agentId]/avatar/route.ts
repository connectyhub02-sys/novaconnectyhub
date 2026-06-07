import { createHash, createHmac } from "node:crypto";
import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { decryptCredentialValue } from "@/lib/security/credentials-crypto";
import { requirePlatformAdmin } from "@/lib/supabase/admin-auth";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const maxAvatarBytes = 5 * 1024 * 1024;
const allowedMimeTypes = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

type CredentialRow = {
  env_name: string;
  encrypted_value: string;
  value_preview: string;
};

type R2Config = {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicUrl: string;
};

type AgentAvatarRow = {
  id: string;
  name: string;
  persona_name: string | null;
  metadata: Record<string, unknown> | null;
};

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ agentId: string }> },
) {
  const auth = await requirePlatformAdmin();

  if (auth instanceof NextResponse) {
    return auth;
  }

  const { agentId } = await context.params;
  const formData = await request.formData().catch(() => null);
  const avatar = formData?.get("avatar");

  if (!(avatar instanceof File)) {
    return NextResponse.json({ error: "Envie um arquivo de imagem no campo avatar." }, { status: 400 });
  }

  const extension = allowedMimeTypes.get(avatar.type);

  if (!extension) {
    return NextResponse.json({ error: "Use uma imagem JPG, PNG ou WEBP." }, { status: 400 });
  }

  if (avatar.size <= 0 || avatar.size > maxAvatarBytes) {
    return NextResponse.json({ error: "A foto precisa ter ate 5 MB." }, { status: 400 });
  }

  const { data: agent, error: agentError } = await auth.supabase
    .from("agent_registry")
    .select("id, name, persona_name, metadata")
    .eq("id", agentId)
    .maybeSingle<AgentAvatarRow>();

  if (agentError) {
    return NextResponse.json({ error: agentError.message }, { status: 500 });
  }

  if (!agent) {
    return NextResponse.json({ error: "Agente nao encontrado." }, { status: 404 });
  }

  const configResult = await loadR2Config(auth.supabase);

  if (!configResult.ok) {
    return NextResponse.json({ error: configResult.error }, { status: 503 });
  }

  const bytes = new Uint8Array(await avatar.arrayBuffer());
  const now = new Date();
  const safePersona = slugify(agent.persona_name || agent.name || "agente");
  const objectKey = `agents/avatars/${agent.id}/${now.getTime()}-${safePersona}.${extension}`;
  const uploadResult = await putR2Object(configResult.config, objectKey, bytes, avatar.type);

  if (!uploadResult.ok) {
    return NextResponse.json({ error: uploadResult.error }, { status: 502 });
  }

  const avatarUrl = buildPublicObjectUrl(configResult.config.publicUrl, objectKey);
  const personaName = agent.persona_name?.trim() || agent.name;
  const metadata = normalizeMetadata(agent.metadata);
  const nextMetadata = {
    ...metadata,
    avatar_storage: {
      provider: "cloudflare-r2",
      bucket: configResult.config.bucket,
      key: objectKey,
      content_type: avatar.type,
      size: avatar.size,
      uploaded_at: now.toISOString(),
      uploaded_by: auth.userId,
    },
  };

  const { error: updateError } = await auth.supabase
    .from("agent_registry")
    .update({
      avatar_url: avatarUrl,
      avatar_alt: `Foto de ${personaName}`,
      metadata: nextMetadata,
    })
    .eq("id", agent.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  await auth.supabase.from("maintenance_audit_logs").insert({
    actor_id: auth.userId,
    event_type: "agent.avatar_uploaded",
    target_table: "agent_registry",
    target_id: agent.id,
    metadata: {
      agentId: agent.id,
      personaName,
      objectKey,
      size: avatar.size,
      contentType: avatar.type,
    },
  });

  revalidatePath("/admin/agentes");
  revalidatePath("/admin/conteudo");

  return NextResponse.json({
    avatarUrl,
    avatarAlt: `Foto de ${personaName}`,
    objectKey,
  });
}

async function loadR2Config(supabase: Awaited<ReturnType<typeof createClient>>) {
  const envNames = [
    "R2_ACCOUNT_ID",
    "R2_ENDPOINT",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_BUCKET",
    "R2_PUBLIC_URL",
  ];

  const values = new Map<string, string>();
  const { data, error } = await supabase
    .from("integration_credentials")
    .select("env_name, encrypted_value, value_preview")
    .eq("scope", "platform")
    .eq("integration_id", "r2")
    .is("organization_id", null)
    .in("env_name", envNames)
    .order("updated_at", { ascending: false });

  if (error) {
    return { ok: false as const, error: error.message };
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

  for (const envName of envNames) {
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
      ok: false as const,
      error: "Configure Endpoint, Access key ID, Secret access key, Bucket e Public URL do R2 antes de subir fotos.",
    };
  }

  return {
    ok: true as const,
    config: {
      endpoint,
      accessKeyId,
      secretAccessKey,
      bucket,
      publicUrl,
    },
  };
}

async function putR2Object(config: R2Config, objectKey: string, body: Uint8Array, contentType: string) {
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
    const text = await response.text().catch(() => "");
    return {
      ok: false as const,
      error: `R2 respondeu status ${response.status}. ${text.slice(0, 180)}`.trim(),
    };
  }

  return { ok: true as const };
}

function buildPublicObjectUrl(publicUrl: string, objectKey: string) {
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

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "agente";
}

function normalizeMetadata(value: Record<string, unknown> | null) {
  if (!value || Array.isArray(value) || typeof value !== "object") {
    return {};
  }

  return value;
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
