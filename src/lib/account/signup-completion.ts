import "server-only";

import { randomInt } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { grantTrialCredits, scheduleTrialConversionMessages, TRIAL_PLAN_CODE } from "@/lib/billing/trial";
import { decryptCredentialValue, encryptCredentialValue, hashCredentialValue } from "@/lib/security/credentials-crypto";
import { createServiceClient } from "@/lib/supabase/service";
import { loadUazapiCredentials, type UazapiCredentials } from "@/lib/whatsapp/uazapi-credentials";

type JsonRecord = Record<string, unknown>;

type ProfileCompletionRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  phone_normalized: string | null;
  phone_verified_at: string | null;
  phone_whatsapp_exists: boolean | null;
  cpf_hash: string | null;
  cpf_preview: string | null;
  signup_completed_at: string | null;
  is_platform_admin: boolean | null;
  trial_whatsapp_opt_in: boolean | null;
};

type PhoneVerificationRow = {
  id: string;
  user_id: string;
  phone: string;
  phone_normalized: string;
  code_hash: string;
  status: string;
  attempts: number;
  max_attempts: number;
  expires_at: string;
};

type OrganizationTrialRow = {
  id: string;
  name: string;
  slug: string | null;
  plan_code: string;
  status: string;
  owner_id: string | null;
};

type BillingSettingsRow = {
  billing_whatsapp_agent_id: string | null;
  notification_whatsapp_enabled: boolean | null;
};

type WhatsappInstanceRow = {
  id: string;
  status: string | null;
  instance_token_encrypted: string | null;
};

type SignupWhatsappTransport = {
  credentials: UazapiCredentials;
  instance: WhatsappInstanceRow;
  token: string;
};

export type AccountCompletionStatus = {
  isComplete: boolean;
  missingFields: string[];
  fullName: string | null;
  email: string | null;
  phone: string | null;
  phoneNormalized: string | null;
  phoneVerified: boolean;
  phoneWhatsappExists: boolean | null;
  cpfPreview: string | null;
  signupCompletedAt: string | null;
  isPlatformAdmin: boolean;
};

export class AccountCompletionRequiredError extends Error {
  status: AccountCompletionStatus;

  constructor(status: AccountCompletionStatus) {
    super("Complete seu cadastro para liberar esta acao.");
    this.name = "AccountCompletionRequiredError";
    this.status = status;
  }
}

class UazapiSignupRequestError extends Error {
  status: number;
  data: unknown;

  constructor(message: string, status: number, data: unknown) {
    super(message);
    this.name = "UazapiSignupRequestError";
    this.status = status;
    this.data = data;
  }
}

export async function getAccountCompletionStatusForUser(input: {
  userId: string;
  client?: SupabaseClient;
}): Promise<AccountCompletionStatus> {
  const client = input.client ?? createServiceClient();
  const profile = await loadProfileCompletion(client, input.userId);

  if (!profile) {
    return {
      isComplete: false,
      missingFields: ["full_name", "phone", "phone_verification", "cpf"],
      fullName: null,
      email: null,
      phone: null,
      phoneNormalized: null,
      phoneVerified: false,
      phoneWhatsappExists: null,
      cpfPreview: null,
      signupCompletedAt: null,
      isPlatformAdmin: false,
    };
  }

  const missingFields: string[] = [];
  const hasName = Boolean(profile.full_name?.trim());
  const hasPhone = Boolean(profile.phone_normalized || normalizeBrazilPhone(profile.phone ?? ""));
  const phoneVerified = Boolean(profile.phone_verified_at);
  const hasCpf = Boolean(profile.cpf_hash);
  const isPlatformAdmin = Boolean(profile.is_platform_admin);

  if (!hasName) missingFields.push("full_name");
  if (!hasPhone) missingFields.push("phone");
  if (!phoneVerified) missingFields.push("phone_verification");
  if (!hasCpf) missingFields.push("cpf");

  return {
    isComplete: isPlatformAdmin || missingFields.length === 0,
    missingFields,
    fullName: profile.full_name,
    email: profile.email,
    phone: profile.phone,
    phoneNormalized: profile.phone_normalized,
    phoneVerified,
    phoneWhatsappExists: profile.phone_whatsapp_exists,
    cpfPreview: profile.cpf_preview,
    signupCompletedAt: profile.signup_completed_at,
    isPlatformAdmin,
  };
}

export async function assertAccountComplete(input: {
  userId: string;
  client?: SupabaseClient;
}) {
  const status = await getAccountCompletionStatusForUser(input);

  if (!status.isComplete) {
    throw new AccountCompletionRequiredError(status);
  }

  return status;
}

export async function isAccountSignupComplete(input: {
  userId: string;
  client?: SupabaseClient;
}) {
  const status = await getAccountCompletionStatusForUser(input);
  return status.isComplete;
}

export async function saveAccountCompletionProfile(input: {
  userId: string;
  fullName?: string | null;
  cpf?: string | null;
  passwordSet?: boolean;
  source?: string;
  client?: SupabaseClient;
}) {
  const client = input.client ?? createServiceClient();
  const updates: JsonRecord = {
    updated_at: new Date().toISOString(),
  };

  if (typeof input.fullName === "string") {
    const fullName = input.fullName.trim();

    if (fullName.length < 3) {
      throw new Error("Informe seu nome completo.");
    }

    updates.full_name = fullName;
  }

  if (typeof input.cpf === "string") {
    const normalizedCpf = normalizeCpf(input.cpf);

    if (!isValidCpf(normalizedCpf)) {
      throw new Error("CPF invalido.");
    }

    updates.cpf_encrypted = encryptCredentialValue(normalizedCpf);
    updates.cpf_hash = hashCredentialValue(`cpf:${normalizedCpf}`);
    updates.cpf_preview = formatCpfPreview(normalizedCpf);
    updates.cpf_verified_at = new Date().toISOString();
  }

  if (input.passwordSet) {
    updates.password_set_at = new Date().toISOString();
  }

  const { error } = await client
    .from("profiles")
    .update(updates)
    .eq("id", input.userId);

  if (error) {
    if (error.code === "23505") {
      throw new Error("Este CPF ou WhatsApp ja esta vinculado a outro cadastro.");
    }

    throw new Error(`Nao foi possivel atualizar o cadastro: ${error.message}`);
  }

  await markSignupCompleteIfReady(client, {
    userId: input.userId,
    source: input.source ?? "account_completion_profile",
  });

  return getAccountCompletionStatusForUser({ userId: input.userId, client });
}

export async function loadAccountCpfNumber(input: {
  userId: string;
  client?: SupabaseClient;
}) {
  const client = input.client ?? createServiceClient();
  const { data, error } = await client
    .from("profiles")
    .select("cpf_encrypted")
    .eq("id", input.userId)
    .maybeSingle<{ cpf_encrypted: string | null }>();

  if (error || !data?.cpf_encrypted) {
    return null;
  }

  try {
    return decryptCredentialValue(data.cpf_encrypted);
  } catch {
    return null;
  }
}

export async function sendPhoneVerificationCode(input: {
  userId: string;
  phone: string;
  client?: SupabaseClient;
}) {
  const client = input.client ?? createServiceClient();
  const phoneNormalized = normalizeBrazilPhone(input.phone);

  if (!phoneNormalized) {
    throw new Error("Informe um WhatsApp valido com DDD.");
  }

  const code = String(randomInt(100000, 999999));
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 10 * 60 * 1000).toISOString();
  const displayPhone = formatBrazilPhone(phoneNormalized);
  const transport = await loadSignupWhatsappTransport(client);
  const whatsappCheck = await checkSignupWhatsappNumber(transport, phoneNormalized);

  if (!whatsappCheck.exists) {
    throw new Error("Este numero nao possui WhatsApp ativo. Revise o numero ou informe outro WhatsApp.");
  }

  await client
    .from("account_phone_verification_codes")
    .update({
      status: "expired",
      error_message: "Substituido por novo codigo.",
      updated_at: now.toISOString(),
    })
    .eq("user_id", input.userId)
    .eq("status", "pending");

  const { data: inserted, error: insertError } = await client
    .from("account_phone_verification_codes")
    .insert({
      user_id: input.userId,
      phone: displayPhone,
      phone_normalized: phoneNormalized,
      code_hash: buildCodeHash(input.userId, phoneNormalized, code),
      expires_at: expiresAt,
      sent_at: now.toISOString(),
      metadata: {
        source: "signup_phone_verification",
        whatsapp_check: {
          exists: whatsappCheck.exists,
          provider_response: sanitizeProviderData(whatsappCheck.providerResponse),
        },
      },
    })
    .select("id")
    .maybeSingle<{ id: string }>();

  if (insertError || !inserted) {
    throw new Error(`Nao foi possivel criar o codigo de verificacao: ${insertError?.message ?? "sem retorno"}`);
  }

  try {
    const providerResponse = await sendSignupVerificationWhatsapp(client, {
      transport,
      code,
      phone: phoneNormalized,
      verificationId: inserted.id,
    });

    await client
      .from("account_phone_verification_codes")
      .update({
        provider_message_id: readProviderMessageId(providerResponse),
        metadata: {
          source: "signup_phone_verification",
          whatsapp_check: {
            exists: whatsappCheck.exists,
            provider_response: sanitizeProviderData(whatsappCheck.providerResponse),
          },
          provider_response: sanitizeProviderData(providerResponse),
        },
      })
      .eq("id", inserted.id);

    await client
      .from("profiles")
      .update({
        phone: displayPhone,
        phone_normalized: phoneNormalized,
        phone_whatsapp_exists: true,
        phone_whatsapp_checked_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.userId);
  } catch (error) {
    await client
      .from("account_phone_verification_codes")
      .update({
        status: "failed",
        error_message: error instanceof Error ? error.message : "Falha ao enviar codigo.",
      })
      .eq("id", inserted.id);

    throw error;
  }

  return {
    ok: true,
    phone: displayPhone,
    phoneNormalized,
    expiresAt,
  };
}

export async function checkPhoneWhatsappAvailability(input: {
  phone: string;
  client?: SupabaseClient;
}) {
  const client = input.client ?? createServiceClient();
  const phoneNormalized = normalizeBrazilPhone(input.phone);

  if (!phoneNormalized) {
    throw new Error("Informe um WhatsApp valido com DDD.");
  }

  const transport = await loadSignupWhatsappTransport(client);
  const whatsappCheck = await checkSignupWhatsappNumber(transport, phoneNormalized);

  return {
    exists: whatsappCheck.exists,
    phone: formatBrazilPhone(phoneNormalized),
    phoneNormalized,
    checkedAt: new Date().toISOString(),
  };
}

export async function verifyPhoneCompletionCode(input: {
  userId: string;
  code: string;
  client?: SupabaseClient;
}) {
  const client = input.client ?? createServiceClient();
  const code = input.code.replace(/\D/g, "");

  if (code.length !== 6) {
    throw new Error("Informe o codigo de 6 digitos.");
  }

  const { data: rows, error } = await client
    .from("account_phone_verification_codes")
    .select("id, user_id, phone, phone_normalized, code_hash, status, attempts, max_attempts, expires_at")
    .eq("user_id", input.userId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .returns<PhoneVerificationRow[]>();

  if (error) {
    throw new Error(`Nao foi possivel validar o codigo: ${error.message}`);
  }

  const verification = rows?.[0] ?? null;

  if (!verification) {
    throw new Error("Nenhum codigo pendente encontrado. Solicite um novo codigo.");
  }

  if (new Date(verification.expires_at).getTime() < Date.now()) {
    await client
      .from("account_phone_verification_codes")
      .update({ status: "expired", error_message: "Codigo expirado." })
      .eq("id", verification.id);
    throw new Error("Codigo expirado. Solicite um novo codigo.");
  }

  if (verification.attempts >= verification.max_attempts) {
    await client
      .from("account_phone_verification_codes")
      .update({ status: "failed", error_message: "Limite de tentativas atingido." })
      .eq("id", verification.id);
    throw new Error("Limite de tentativas atingido. Solicite um novo codigo.");
  }

  const expected = buildCodeHash(input.userId, verification.phone_normalized, code);

  if (expected !== verification.code_hash) {
    await client
      .from("account_phone_verification_codes")
      .update({ attempts: verification.attempts + 1 })
      .eq("id", verification.id);
    throw new Error("Codigo incorreto.");
  }

  const verifiedAt = new Date().toISOString();

  await Promise.all([
    client
      .from("account_phone_verification_codes")
      .update({
        status: "verified",
        verified_at: verifiedAt,
      })
      .eq("id", verification.id),
    client
      .from("profiles")
      .update({
        phone: verification.phone,
        phone_normalized: verification.phone_normalized,
        phone_verified_at: verifiedAt,
        phone_whatsapp_exists: true,
        phone_whatsapp_checked_at: verifiedAt,
        updated_at: verifiedAt,
      })
      .eq("id", input.userId),
  ]);

  await markSignupCompleteIfReady(client, {
    userId: input.userId,
    source: "phone_verification",
  });

  return getAccountCompletionStatusForUser({ userId: input.userId, client });
}

export async function markSignupCompleteIfReady(
  client: SupabaseClient,
  input: {
    userId: string;
    source: string;
  },
) {
  const status = await getAccountCompletionStatusForUser({ userId: input.userId, client });

  if (!status.isComplete || status.signupCompletedAt) {
    return status;
  }

  const completedAt = new Date().toISOString();
  const { error } = await client
    .from("profiles")
    .update({
      signup_completed_at: completedAt,
      signup_completion_source: input.source,
      updated_at: completedAt,
    })
    .eq("id", input.userId);

  if (error) {
    throw new Error(`Nao foi possivel concluir o cadastro: ${error.message}`);
  }

  return {
    ...status,
    signupCompletedAt: completedAt,
  };
}

export async function ensureTrialForCompletedSignup(input: {
  userId: string;
  client?: SupabaseClient;
}) {
  const client = input.client ?? createServiceClient();
  const status = await getAccountCompletionStatusForUser({ userId: input.userId, client });

  if (!status.isComplete || status.isPlatformAdmin) {
    return null;
  }

  const { data: membership } = await client
    .from("organization_members")
    .select("organizations(id, name, slug, plan_code, status, owner_id)")
    .eq("user_id", input.userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle<{ organizations: OrganizationTrialRow | null }>();

  const organization = membership?.organizations ?? null;

  if (!organization || organization.plan_code !== TRIAL_PLAN_CODE) {
    return organization;
  }

  if (organization.status === "trial_pending") {
    await client
      .from("organizations")
      .update({ status: "trial", updated_at: new Date().toISOString() })
      .eq("id", organization.id);
  }

  await grantTrialCredits({
    organizationId: organization.id,
    userId: input.userId,
    externalReference: `trial:${organization.id}`,
    client,
  });

  await scheduleTrialConversionMessages({
    organizationId: organization.id,
    userId: input.userId,
    optIn: true,
    client,
  }).catch(() => 0);

  return organization;
}

export function formatAccountCompletionError(error: unknown) {
  return {
    error: error instanceof Error ? error.message : "Erro inesperado.",
    ...(error instanceof AccountCompletionRequiredError ? { accountCompletion: error.status } : {}),
  };
}

export function statusForAccountCompletionError(error: unknown, fallback: number) {
  return error instanceof AccountCompletionRequiredError ? 428 : fallback;
}

export function normalizeCpf(value: string) {
  return value.replace(/\D/g, "");
}

export function isValidCpf(value: string) {
  const cpf = normalizeCpf(value);

  if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) {
    return false;
  }

  const first = calculateCpfDigit(cpf.slice(0, 9), 10);
  const second = calculateCpfDigit(`${cpf.slice(0, 9)}${first}`, 11);

  return cpf.endsWith(`${first}${second}`);
}

export function normalizeBrazilPhone(value: string | null | undefined) {
  let digits = String(value ?? "").replace(/\D/g, "");

  if (!digits) {
    return null;
  }

  if ((digits.length === 10 || digits.length === 11) && !digits.startsWith("55")) {
    digits = `55${digits}`;
  }

  return digits.startsWith("55") && (digits.length === 12 || digits.length === 13) ? digits : null;
}

function calculateCpfDigit(base: string, weight: number) {
  const sum = base
    .split("")
    .reduce((total, digit, index) => total + Number(digit) * (weight - index), 0);
  const rest = (sum * 10) % 11;
  return rest === 10 ? 0 : rest;
}

function formatCpfPreview(cpf: string) {
  return `***.***.***-${cpf.slice(-2)}`;
}

function formatBrazilPhone(phoneNormalized: string) {
  const local = phoneNormalized.startsWith("55") ? phoneNormalized.slice(2) : phoneNormalized;

  if (local.length === 11) {
    return `+55 (${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  }

  if (local.length === 10) {
    return `+55 (${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  }

  return `+${phoneNormalized}`;
}

function buildCodeHash(userId: string, phoneNormalized: string, code: string) {
  return hashCredentialValue(`signup-phone:${userId}:${phoneNormalized}:${code}`);
}

async function loadProfileCompletion(client: SupabaseClient, userId: string) {
  const { data, error } = await client
    .from("profiles")
    .select("id, email, full_name, phone, phone_normalized, phone_verified_at, phone_whatsapp_exists, cpf_hash, cpf_preview, signup_completed_at, is_platform_admin, trial_whatsapp_opt_in")
    .eq("id", userId)
    .maybeSingle<ProfileCompletionRow>();

  if (error) {
    throw new Error(`Nao foi possivel carregar o cadastro: ${error.message}`);
  }

  return data ?? null;
}

async function sendSignupVerificationWhatsapp(
  client: SupabaseClient,
  input: {
    transport: SignupWhatsappTransport;
    phone: string;
    code: string;
    verificationId: string;
  },
) {
  const { credentials, instance, token } = input.transport;

  const response = await callUazapi(credentials, "/send/text", {
    method: "POST",
    token,
    body: {
      number: input.phone,
      text: [
        `Seu codigo ConnectyHub: ${input.code}`,
        "",
        "Use este codigo para confirmar seu WhatsApp e liberar seu teste gratis.",
      ].join("\n"),
      linkPreview: false,
      track_source: "connectyhub",
      track_id: `signup_verify_${input.verificationId}_${Date.now()}`,
    },
  });

  await client
    .from("whatsapp_instances")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", instance.id);

  return response.data;
}

async function loadSignupWhatsappTransport(client: SupabaseClient): Promise<SignupWhatsappTransport> {
  const [settings, credentials] = await Promise.all([
    loadBillingSettings(client),
    loadUazapiCredentials(client),
  ]);

  if (settings?.notification_whatsapp_enabled === false) {
    throw new Error("Envio de WhatsApp de cadastro esta desativado no painel admin.");
  }

  if (!settings?.billing_whatsapp_agent_id) {
    throw new Error("Escolha um agente de cobranca/verificacao no painel admin.");
  }

  const instance = await loadBillingAgentWhatsappInstance(client, settings.billing_whatsapp_agent_id);

  if (!instance?.instance_token_encrypted || instance.status !== "connected") {
    throw new Error("WhatsApp do agente escolhido nao esta conectado.");
  }

  const token = decryptCredentialValue(instance.instance_token_encrypted);

  return { credentials, instance, token };
}

async function checkSignupWhatsappNumber(
  transport: SignupWhatsappTransport,
  phoneNormalized: string,
) {
  let response: Awaited<ReturnType<typeof callUazapi>>;

  try {
    response = await callUazapi(transport.credentials, "/chat/check", {
      method: "POST",
      token: transport.token,
      body: {
        number: phoneNormalized,
        phone: phoneNormalized,
        chatid: `${phoneNormalized}@s.whatsapp.net`,
      },
    });
  } catch (error) {
    if (error instanceof UazapiSignupRequestError && isProviderMissingWhatsappError(error)) {
      return {
        exists: false,
        providerResponse: error.data,
      };
    }

    throw error;
  }

  const exists = readWhatsappExists(response.data);

  if (exists === null) {
    throw new Error("Nao foi possivel confirmar se este numero possui WhatsApp. Tente novamente.");
  }

  return {
    exists,
    providerResponse: response.data,
  };
}

async function loadBillingSettings(client: SupabaseClient) {
  const { data, error } = await client
    .from("platform_billing_settings")
    .select("billing_whatsapp_agent_id, notification_whatsapp_enabled")
    .eq("setting_key", "default")
    .maybeSingle<BillingSettingsRow>();

  if (error) {
    throw new Error(`Nao foi possivel carregar configuracao de billing: ${error.message}`);
  }

  return data ?? null;
}

async function loadBillingAgentWhatsappInstance(client: SupabaseClient, agentId: string) {
  const { data, error } = await client
    .from("whatsapp_instances")
    .select("id, status, instance_token_encrypted")
    .contains("metadata", { agent_id: agentId, admin_whatsapp: true, platform_whatsapp: true })
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle<WhatsappInstanceRow>();

  if (error) {
    throw new Error(`Nao foi possivel carregar WhatsApp do agente: ${error.message}`);
  }

  return data ?? null;
}

async function callUazapi(
  credentials: UazapiCredentials,
  path: string,
  options: {
    method: "GET" | "POST" | "PUT" | "DELETE";
    body?: unknown;
    token?: string;
  },
) {
  const response = await fetch(`${credentials.baseUrl}${path}`, {
    method: options.method,
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.token ? { token: options.token } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: "no-store",
  });
  const data = await readResponse(response);

  if (!response.ok) {
    throw new UazapiSignupRequestError(
      readProviderError(data) ?? `Uazapi respondeu status ${response.status}.`,
      response.status,
      data,
    );
  }

  return { ok: response.ok, status: response.status, data };
}

async function readResponse(response: Response) {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function readProviderError(value: unknown): string | null {
  if (typeof value === "string") return value;

  if (value && typeof value === "object") {
    const record = value as JsonRecord;
    const candidates = [record.error, record.message, record.detail];

    for (const candidate of candidates) {
      if (typeof candidate === "string" && candidate.trim()) {
        return candidate.trim();
      }
    }
  }

  return null;
}

function readProviderMessageId(value: unknown) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as JsonRecord;
  const candidates = [
    record.id,
    record.messageId,
    record.message_id,
    record.key && typeof record.key === "object" ? (record.key as JsonRecord).id : null,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return null;
}

function readWhatsappExists(value: unknown): boolean | null {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    return readWhatsappExistsFromText(value);
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const nested = readWhatsappExists(item);

      if (nested !== null) {
        return nested;
      }
    }

    return null;
  }

  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as JsonRecord;
  const booleanKeys = [
    "exists",
    "exist",
    "numberExists",
    "isWhatsapp",
    "isWhatsApp",
    "hasWhatsapp",
    "hasWhatsApp",
    "registered",
    "onWhatsapp",
    "onWhatsApp",
    "isWAContact",
    "canReceive",
    "isValid",
    "valid",
  ];

  for (const key of booleanKeys) {
    const direct = record[key];

    if (typeof direct === "boolean") {
      return direct;
    }
  }

  const identityCandidates = [
    record.jid,
    record.chatid,
    record.chatId,
    record.id,
    record.wid,
    record.number && typeof record.number === "object" ? (record.number as JsonRecord).jid : null,
    record.key && typeof record.key === "object" ? (record.key as JsonRecord).remoteJid : null,
  ];

  if (identityCandidates.some((candidate) => isWhatsappIdentity(candidate))) {
    return true;
  }

  for (const key of ["status", "message", "error", "detail"]) {
    const nestedText = readWhatsappExistsFromText(record[key]);

    if (nestedText !== null) {
      return nestedText;
    }
  }

  for (const key of ["data", "result", "response", "contact", "chat", "user", "item"]) {
    const nested = readWhatsappExists(record[key]);

    if (nested !== null) {
      return nested;
    }
  }

  return null;
}

function readWhatsappExistsFromText(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.toLowerCase();

  if (isWhatsappIdentity(value)) {
    return true;
  }

  if (
    normalized.includes("not found") ||
    normalized.includes("not exist") ||
    normalized.includes("does not exist") ||
    normalized.includes("not registered") ||
    normalized.includes("no whatsapp") ||
    normalized.includes("invalid whatsapp") ||
    normalized.includes("invalid number") ||
    normalized.includes("numero invalido") ||
    normalized.includes("numero nao") ||
    normalized.includes("número não")
  ) {
    return false;
  }

  if (
    normalized === "valid" ||
    normalized === "exists" ||
    normalized === "registered" ||
    normalized.includes("whatsapp user")
  ) {
    return true;
  }

  return null;
}

function isWhatsappIdentity(value: unknown) {
  return typeof value === "string" && (
    value.includes("@s.whatsapp.net") ||
    value.includes("@c.us") ||
    value.includes("@lid")
  );
}

function isProviderMissingWhatsappError(error: UazapiSignupRequestError) {
  if (![400, 404, 422].includes(error.status)) {
    return false;
  }

  const providerMessage = readProviderError(error.data) ?? error.message;
  const exists = readWhatsappExistsFromText(providerMessage);

  return exists === false;
}

function sanitizeProviderData(value: unknown) {
  if (!value || typeof value !== "object") {
    return value;
  }

  const serialized = JSON.stringify(value);

  if (serialized.length <= 4000) {
    return JSON.parse(serialized) as unknown;
  }

  return {
    truncated: true,
    preview: serialized.slice(0, 3800),
  };
}
