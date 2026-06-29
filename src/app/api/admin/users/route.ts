import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/supabase/admin-auth";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

type ProfileRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  company_name: string | null;
  is_platform_admin: boolean | null;
};

type OrgInfo = { id: string; name: string; status: string; plan_code: string };

type RawMembership = {
  user_id: string;
  role: string;
  created_at: string | null;
  organizations: OrgInfo | OrgInfo[] | null;
};

function resolveOrg(raw: OrgInfo | OrgInfo[] | null): OrgInfo | null {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw[0] ?? null;
  return raw;
}

export async function GET() {
  const auth = await requirePlatformAdmin();

  if (auth instanceof NextResponse) {
    return auth;
  }

  const service = createServiceClient();

  const [authResult, profilesResult, membershipsResult] = await Promise.all([
    service.auth.admin.listUsers({ perPage: 1000 }),
    service.from("profiles").select("id, full_name, email, company_name, is_platform_admin"),
    service
      .from("organization_members")
      .select("user_id, role, created_at, organizations(id, name, status, plan_code)")
      .order("created_at", { ascending: true }),
  ]);

  if (authResult.error) {
    return NextResponse.json({ error: authResult.error.message }, { status: 500 });
  }

  const profileMap = new Map(
    ((profilesResult.data ?? []) as ProfileRow[]).map((p) => [p.id, p]),
  );

  const membershipMap = new Map<string, { orgName: string; role: string; status: string; planCode: string }>();

  for (const raw of (membershipsResult.data ?? []) as unknown as RawMembership[]) {
    const org = resolveOrg(raw.organizations);
    if (raw.user_id && org && !membershipMap.has(raw.user_id)) {
      membershipMap.set(raw.user_id, {
        orgName: org.name,
        role: raw.role,
        status: org.status,
        planCode: org.plan_code,
      });
    }
  }

  const users = authResult.data.users
    .filter((u) => Boolean(u.email))
    .map((u) => {
      const profile = profileMap.get(u.id);
      const membership = membershipMap.get(u.id);
      return {
        id: u.id,
        email: u.email ?? null,
        fullName: profile?.full_name ?? null,
        companyName: profile?.company_name ?? membership?.orgName ?? null,
        isPlatformAdmin: Boolean(profile?.is_platform_admin),
        orgName: membership?.orgName ?? null,
        orgRole: membership?.role ?? null,
        orgStatus: membership?.status ?? null,
        planCode: membership?.planCode ?? null,
        createdAt: u.created_at ?? null,
        lastSignInAt: u.last_sign_in_at ?? null,
      };
    })
    .sort((a, b) => {
      const da = a.lastSignInAt ? new Date(a.lastSignInAt).getTime() : 0;
      const db = b.lastSignInAt ? new Date(b.lastSignInAt).getTime() : 0;
      return db - da;
    });

  return NextResponse.json({ users });
}
