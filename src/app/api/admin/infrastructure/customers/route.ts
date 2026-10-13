import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { access, failure, response } from "@/lib/infrastructure/server";
import { primaryCustomerAccounts, type CustomerMembership } from "@/lib/infrastructure/customers";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const auth = await access(); if (auth instanceof NextResponse) return auth;
    const db = createServiceClient();
    const memberships: CustomerMembership[] = [];
    // Page before reducing: historical duplicate workspaces must not hide later customers.
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await db.from("organization_members")
        .select("user_id,organizations!inner(id,name,owner_id,status,plan_code)")
        .order("created_at").order("organization_id").order("user_id").range(offset, offset + 999);
      if (error) throw error;
      memberships.push(...(data ?? []) as unknown as CustomerMembership[]);
      if (!data || data.length < 1000) break;
    }
    const accounts = primaryCustomerAccounts(memberships);
    const ids = accounts.map(row => row.owner_id!);
    const owners = ids.length ? await db.from("profiles").select("id,full_name,email").in("id", ids) : { data: [], error: null };
    if (owners.error) throw owners.error;
    return response({ customers: accounts.map(row => ({ id: row.id, name: row.name, owner: owners.data?.find(p => p.id === row.owner_id)?.full_name ?? "", email: owners.data?.find(p => p.id === row.owner_id)?.email ?? "" })).sort((a, b) => a.name.localeCompare(b.name, "pt-BR") || a.owner.localeCompare(b.owner, "pt-BR")) });
  } catch (e) { return failure(e); }
}
