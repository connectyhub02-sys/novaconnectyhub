import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import {
  resolveAuthenticatedEntryPath,
  shouldRedirectPlatformAdminFromClientPage,
} from "@/lib/auth/route-destinations";
import { getSupabasePublicEnv } from "./env";
import { isMissingColumnError } from "./schema-errors";

const protectedPrefixes = ["/admin", "/dashboard"];
const protectedApiPrefixes = ["/api/dashboard"];
const authPages = ["/login", "/cadastro", "/iniciar"];
const incompleteSignupDashboardPages = new Set(["/dashboard/minha-conta"]);
const incompleteSignupDashboardApiPaths = new Set([
  "/api/dashboard/account",
  "/api/dashboard/account/security",
  "/api/dashboard/billing/status",
]);

type ProxyAccountCompletionStatus = {
  isComplete: boolean;
  missingFields: string[];
  fullName: string | null;
  email: string | null;
  phone: string | null;
  phoneNormalized: string | null;
  phoneVerified: boolean;
  phoneWhatsappExists: boolean | null;
  cpfPreview: string | null;
  documentType: "cpf" | "cnpj" | null;
  accountType: "person" | "company" | null;
  companyName: string | null;
  signupCompletedAt: string | null;
  isPlatformAdmin: boolean;
};

type ProxyProfileRow = {
  email: string | null;
  full_name: string | null;
  company_name: string | null;
  account_type?: string | null;
  phone: string | null;
  phone_normalized: string | null;
  phone_verified_at: string | null;
  phone_whatsapp_exists: boolean | null;
  document_type?: string | null;
  cpf_hash: string | null;
  cpf_preview: string | null;
  signup_completed_at: string | null;
  is_platform_admin: boolean | null;
};

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const env = getSupabasePublicEnv();

  if (!env.configured) {
    return response;
  }

  const supabase = createServerClient(env.url, env.publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isProtected = protectedPrefixes.some((prefix) => pathname.startsWith(prefix));
  const isProtectedApi = protectedApiPrefixes.some((prefix) => pathname.startsWith(prefix));
  const isAuthPage = authPages.includes(pathname);

  if ((isProtected || isProtectedApi) && !user) {
    if (isProtectedApi) {
      return NextResponse.json({ error: "Sessao obrigatoria." }, { status: 401 });
    }

    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  let accountCompletion: Promise<ProxyAccountCompletionStatus | null> | undefined;
  const getAccountCompletion = () => {
    accountCompletion ??= loadProxyAccountCompletion(supabase, user!.id);
    return accountCompletion;
  };

  if (isAuthPage && user) {
    const profile = await getAccountCompletion();
    const target = resolveAuthenticatedEntryPath({
      currentPath: pathname,
      isPlatformAdmin: profile?.isPlatformAdmin,
      nextPath: request.nextUrl.searchParams.get("next"),
      plan: request.nextUrl.searchParams.get("plan"),
    });

    return NextResponse.redirect(new URL(target, request.url));
  }

  if (user && (isProtected || isProtectedApi)) {
    const accountCompletion = await getAccountCompletion();

    if (
      accountCompletion?.isPlatformAdmin
      && isProtected
      && shouldRedirectPlatformAdminFromClientPage(pathname)
    ) {
      return NextResponse.redirect(new URL("/admin", request.url));
    }

    if (accountCompletion && !accountCompletion.isComplete) {
      if (isProtectedApi && !incompleteSignupDashboardApiPaths.has(pathname)) {
        return NextResponse.json(
          {
            error: "Complete seu cadastro para liberar o teste gratis.",
            accountCompletion,
          },
          { status: 428 },
        );
      }

      if (isProtected && !incompleteSignupDashboardPages.has(pathname)) {
        const url = request.nextUrl.clone();
        url.pathname = "/dashboard/minha-conta";
        url.searchParams.set("complete", "1");
        url.searchParams.set("next", pathname);
        return NextResponse.redirect(url);
      }
    }
  }

  return response;
}

async function loadProxyAccountCompletion(
  supabase: SupabaseClient,
  userId: string,
): Promise<ProxyAccountCompletionStatus | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("email, full_name, company_name, account_type, phone, phone_normalized, phone_verified_at, phone_whatsapp_exists, document_type, cpf_hash, cpf_preview, signup_completed_at, is_platform_admin")
    .eq("id", userId)
    .maybeSingle<ProxyProfileRow>();

  if (error) {
    if (isMissingColumnError(error, ["account_type", "document_type"])) {
      const { data: legacyData, error: legacyError } = await supabase
        .from("profiles")
        .select("email, full_name, company_name, phone, phone_normalized, phone_verified_at, phone_whatsapp_exists, cpf_hash, cpf_preview, signup_completed_at, is_platform_admin")
        .eq("id", userId)
        .maybeSingle<Omit<ProxyProfileRow, "account_type" | "document_type">>();

      if (legacyError) {
        return null;
      }

      return mapProxyAccountCompletion(legacyData
        ? {
            ...legacyData,
            account_type: null,
            document_type: null,
          }
        : null);
    }

    return null;
  }

  return mapProxyAccountCompletion(data ?? null);
}

function mapProxyAccountCompletion(profile: ProxyProfileRow | null): ProxyAccountCompletionStatus {
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
  const hasPhone = Boolean(profile.phone_normalized || normalizeBrazilPhone(profile.phone));
  const phoneVerified = Boolean(profile.phone_verified_at);
  const hasDocument = Boolean(profile.cpf_hash);
  const documentType = inferAccountDocumentType(profile);
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

function normalizeBrazilPhone(value: string | null | undefined) {
  let digits = String(value ?? "").replace(/\D/g, "");

  if (!digits) {
    return null;
  }

  if ((digits.length === 10 || digits.length === 11) && !digits.startsWith("55")) {
    digits = `55${digits}`;
  }

  return digits.startsWith("55") && (digits.length === 12 || digits.length === 13) ? digits : null;
}

function normalizeAccountType(value: string | null | undefined) {
  const normalized = typeof value === "string" ? value.toLowerCase() : null;

  return normalized === "company" || normalized === "person" ? normalized : null;
}

function normalizeAccountDocumentType(value: string | null | undefined) {
  const normalized = typeof value === "string" ? value.toLowerCase() : null;

  return normalized === "cnpj" || normalized === "cpf" ? normalized : null;
}

function inferAccountDocumentType(profile: Pick<ProxyProfileRow, "cpf_hash" | "cpf_preview" | "document_type">) {
  const documentType = normalizeAccountDocumentType(profile.document_type);

  if (documentType || !profile.cpf_hash) {
    return documentType;
  }

  return profile.cpf_preview?.includes("/") ? "cnpj" : "cpf";
}
