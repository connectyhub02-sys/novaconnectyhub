import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabasePublicEnv } from "./env";

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
  signupCompletedAt: string | null;
  isPlatformAdmin: boolean;
};

type ProxyProfileRow = {
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

  if (isAuthPage && user) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (user && (isProtected || isProtectedApi)) {
    const accountCompletion = await loadProxyAccountCompletion(supabase, user.id);

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
    .select("email, full_name, phone, phone_normalized, phone_verified_at, phone_whatsapp_exists, cpf_hash, cpf_preview, signup_completed_at, is_platform_admin")
    .eq("id", userId)
    .maybeSingle<ProxyProfileRow>();

  if (error) {
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
      signupCompletedAt: null,
      isPlatformAdmin: false,
    };
  }

  const missingFields: string[] = [];
  const hasName = Boolean(profile.full_name?.trim());
  const hasPhone = Boolean(profile.phone_normalized || normalizeBrazilPhone(profile.phone));
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
