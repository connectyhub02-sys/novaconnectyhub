import "server-only";

import { randomInt } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeProfileAvatarUrl, syncAuthUserWhatsappAvatar } from "@/lib/account/profile-avatar-sync";
import { grantTrialCredits, scheduleTrialConversionMessages, TRIAL_PLAN_CODE } from "@/lib/billing/trial";
import { sendTrialStartedNotification } from "@/lib/billing/trial-notifications";
import { decryptCredentialValue, encryptCredentialValue, hashCredentialValue } from "@/lib/security/credentials-crypto";
import { createServiceClient } from "@/lib/supabase/service";
import { readWhatsappInstanceProfileImageUrl } from "@/lib/whatsapp/instance-profile-image";
import { loadUazapiCredentials, type UazapiCredentials } from "@/lib/whatsapp/uazapi-credentials";

type JsonRecord = Record<string, unknown>;

export type AccountType = "person" | "company";
export type AccountDocumentType = "cpf" | "cnpj";

type ProfileCompletionRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  company_name: string | null;
  account_type: string | null;
  phone: string | null;
  phone_normalized: string | null;
  phone_verified_at: string | null;
  phone_whatsapp_exists: boolean | null;
  document_type: string | null;
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

type OrganizationOwnerRow = {
  id: string;
  owner_id: string | null;
  plan_code: string | null;
  status: string | null;
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

type WhatsappAvatarLookupResult = {
  profileImageUrl: string;
  source: string;
  providerData: unknown;
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
  documentType: AccountDocumentType | null;
  accountType: AccountType | null;
  companyName: string | null;
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
      documentType: null,
      accountType: null,
      companyName: null,
      signupCompletedAt: null,
      isPlatformAdmin: false,
    };
  }

  const missingFields: string[] = [];
  const hasName = Boolean(profile.full_name?.trim());
  const companyName = profile.company_name?.trim() || null;
  const hasPhone = Boolean(profile.phone_normalized || normalizeBrazilPhone(profile.phone ?? ""));
  const phoneVerified = Boolean(profile.phone_verified_at);
  const hasDocument = Boolean(profile.cpf_hash);
  const documentType = normalizeAccountDocumentType(profile.document_type) ?? (hasDocument ? "cpf" : null);
  const accountType = normalizeAccountType(profile.account_type) ?? (documentType === "cnpj" ? "company" : "person");
  const isPlatformAdmin = Boolean(profile.is_platform_admin);

  if (!hasName) missingFields.push("full_name");
  if (accountType === "company" && !companyName) missingFields.push("company_name");
  if (!hasPhone) missingFields.push("phone");
  if (!phoneVerified) missingFields.push("phone_verification");
  if (!hasDocument) missingFields.push("cpf");

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
    documentType,
    accountType,
    companyName,
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

export async function assertOrganizationOwnerAccountComplete(input: {
  organizationId: string;
  client?: SupabaseClient;
}) {
  const client = input.client ?? createServiceClient();
  const { data: organization, error } = await client
    .from("organizations")
    .select("id, owner_id, plan_code, status")
    .eq("id", input.organizationId)
    .maybeSingle<OrganizationOwnerRow>();

  if (error) {
    throw new Error(`Nao foi possivel carregar o dono do workspace: ${error.message}`);
  }

  if (!organization) {
    throw new Error("Workspace nao encontrado.");
  }

  if (organization.plan_code === "internal" || organization.status === "internal") {
    return null;
  }

  if (!organization.owner_id) {
    throw new Error("Workspace sem dono definido. Atualize o cadastro para liberar os recursos.");
  }

  return assertAccountComplete({ userId: organization.owner_id, client });
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
  companyName?: string | null;
  accountType?: string | null;
  document?: string | null;
  documentType?: string | null;
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

  const accountType = normalizeAccountType(input.accountType);
  const companyName = typeof input.companyName === "string" ? input.companyName.trim() : null;
  const documentInput = typeof input.document === "string"
    ? input.document
    : typeof input.cpf === "string"
      ? input.cpf
      : null;

  if (accountType) {
    updates.account_type = accountType;
  }

  if (typeof input.companyName === "string") {
    if (companyName && companyName.length < 2) {
      throw new Error("Informe o nome da empresa com pelo menos 2 caracteres.");
    }

    if (companyName && companyName.length > 120) {
      throw new Error("Nome da empresa muito longo.");
    }

    updates.company_name = companyName || null;
  }

  if (documentInput !== null) {
    const document = normalizeAccountDocument(documentInput, normalizeAccountDocumentType(input.documentType));
    const resolvedAccountType = accountType ?? (document.type === "cnpj" ? "company" : "person");

    if (resolvedAccountType === "company" && document.type !== "cnpj") {
      throw new Error("Para cadastrar empresa, informe um CNPJ valido.");
    }

    if (resolvedAccountType === "person" && document.type !== "cpf") {
      throw new Error("Para pessoa fisica, informe um CPF valido.");
    }

    if (resolvedAccountType === "company" && !companyName) {
      throw new Error("Informe o nome da empresa.");
    }

    updates.account_type = resolvedAccountType;
    updates.document_type = document.type;
    updates.cpf_encrypted = encryptCredentialValue(document.number);
    updates.cpf_hash = hashCredentialValue(`${document.type}:${document.number}`);
    updates.cpf_preview = formatDocumentPreview(document);
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
      throw new Error("Este CPF/CNPJ ou WhatsApp ja esta vinculado a outro cadastro.");
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
  const document = await loadAccountDocument(input);

  return document?.number ?? null;
}

export async function loadAccountDocument(input: {
  userId: string;
  client?: SupabaseClient;
}): Promise<{ type: AccountDocumentType; number: string } | null> {
  const client = input.client ?? createServiceClient();
  const { data, error } = await client
    .from("profiles")
    .select("cpf_encrypted, document_type")
    .eq("id", input.userId)
    .maybeSingle<{ cpf_encrypted: string | null; document_type: string | null }>();

  if (error || !data?.cpf_encrypted) {
    return null;
  }

  try {
    const number = decryptCredentialValue(data.cpf_encrypted);
    const type = normalizeAccountDocumentType(data.document_type) ?? (number.length === 14 ? "cnpj" : "cpf");

    return { type, number };
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
        phone_verified_at: null,
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

  await syncVerifiedPhoneWhatsappAvatar(client, {
    userId: input.userId,
    phoneNormalized: verification.phone_normalized,
  }).catch(() => null);

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

  await sendTrialStartedNotification({
    organizationId: organization.id,
    client,
  }).catch(() => null);

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

export function normalizeCnpj(value: string) {
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

export function isValidCnpj(value: string) {
  const cnpj = normalizeCnpj(value);

  if (cnpj.length !== 14 || /^(\d)\1+$/.test(cnpj)) {
    return false;
  }

  const first = calculateCnpjDigit(cnpj.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const second = calculateCnpjDigit(`${cnpj.slice(0, 12)}${first}`, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);

  return cnpj.endsWith(`${first}${second}`);
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

function calculateCnpjDigit(base: string, weights: number[]) {
  const sum = base
    .split("")
    .reduce((total, digit, index) => total + Number(digit) * weights[index], 0);
  const rest = sum % 11;

  return rest < 2 ? 0 : 11 - rest;
}

function normalizeAccountDocument(
  value: string,
  requestedType?: AccountDocumentType | null,
): { type: AccountDocumentType; number: string } {
  const digits = value.replace(/\D/g, "");
  const type = requestedType ?? (digits.length === 14 ? "cnpj" : "cpf");

  if (type === "cnpj") {
    if (!isValidCnpj(digits)) {
      throw new Error("CNPJ invalido.");
    }

    return { type, number: digits };
  }

  if (!isValidCpf(digits)) {
    throw new Error("CPF invalido.");
  }

  return { type, number: digits };
}

function normalizeAccountType(value: string | null | undefined): AccountType | null {
  const normalized = typeof value === "string" ? value.toLowerCase() : null;

  return normalized === "company" || normalized === "person" ? normalized : null;
}

function normalizeAccountDocumentType(value: string | null | undefined): AccountDocumentType | null {
  const normalized = typeof value === "string" ? value.toLowerCase() : null;

  return normalized === "cnpj" || normalized === "cpf" ? normalized : null;
}

function formatDocumentPreview(document: { type: AccountDocumentType; number: string }) {
  if (document.type === "cnpj") {
    return `**.***.***/****-${document.number.slice(-2)}`;
  }

  return `***.***.***-${document.number.slice(-2)}`;
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
    .select("id, email, full_name, company_name, account_type, phone, phone_normalized, phone_verified_at, phone_whatsapp_exists, document_type, cpf_hash, cpf_preview, signup_completed_at, is_platform_admin, trial_whatsapp_opt_in")
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
        numbers: [phoneNormalized],
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

export async function syncVerifiedPhoneWhatsappAvatar(
  client: SupabaseClient,
  input: {
    userId: string;
    phoneNormalized: string;
  },
) {
  const transport = await loadSignupWhatsappTransport(client);
  const lookup = await lookupSignupWhatsappAvatar(transport, input.phoneNormalized);
  const syncedAt = new Date().toISOString();
  const avatarUrl = normalizeProfileAvatarUrl(lookup?.profileImageUrl);
  const syncedAvatarUrl = await syncAuthUserWhatsappAvatar({
    client,
    userId: input.userId,
    avatarUrl,
    providerSource: lookup?.source ?? "uazapi",
    syncedAt,
  });

  if (avatarUrl) {
    await client.from("maintenance_audit_logs").insert({
      actor_id: input.userId,
      event_type: "profile.whatsapp_avatar_synced",
      target_table: "profiles",
      target_id: input.userId,
      metadata: {
        source: lookup?.source ?? null,
        phonePreview: formatPhonePreview(input.phoneNormalized),
      },
    }).then(undefined, () => null);
  }

  return syncedAvatarUrl;
}

async function lookupSignupWhatsappAvatar(
  transport: SignupWhatsappTransport,
  phoneNormalized: string,
): Promise<WhatsappAvatarLookupResult | null> {
  const attempts = [
    {
      source: "chat_details",
      path: "/chat/details",
      body: {
        number: phoneNormalized,
        preview: true,
      },
    },
    {
      source: "contact_avatar",
      path: "/contact/avatar",
      body: {
        number: phoneNormalized,
      },
    },
  ];

  for (const attempt of attempts) {
    let response: Awaited<ReturnType<typeof callUazapi>>;

    try {
      response = await callUazapi(transport.credentials, attempt.path, {
        method: "POST",
        token: transport.token,
        body: attempt.body,
      });
    } catch {
      continue;
    }

    const profileImageUrl = readWhatsappInstanceProfileImageUrl(response.data);

    if (profileImageUrl) {
      return {
        profileImageUrl,
        source: attempt.source,
        providerData: sanitizeProviderData(response.data),
      };
    }
  }

  return null;
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
    "isInWhatsapp",
    "isInWhatsApp",
    "inWhatsapp",
    "inWhatsApp",
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

function formatPhonePreview(phoneNormalized: string) {
  return `${phoneNormalized.slice(0, 4)}****${phoneNormalized.slice(-4)}`;
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
