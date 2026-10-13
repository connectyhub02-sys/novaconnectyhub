import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { access, failure, response } from "@/lib/infrastructure/server";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const auth = await access(); if (auth instanceof NextResponse) return auth;
    const db = createServiceClient();
    const { data, error } = await db.from("organizations").select("id,name,owner_id").neq("status", "archived").neq("plan_code", "internal").order("name").limit(1000);
    if (error) throw error;
    const ids = [...new Set((data ?? []).map(row => row.owner_id).filter(Boolean))];
    const owners = ids.length ? await db.from("profiles").select("id,full_name,email").in("id", ids) : { data: [], error: null };
    if (owners.error) throw owners.error;
    return response({ customers: (data ?? []).map(row => ({ id: row.id, name: row.name, owner: owners.data?.find(p => p.id === row.owner_id)?.full_name ?? "", email: owners.data?.find(p => p.id === row.owner_id)?.email ?? "" })) });
  } catch (e) { return failure(e); }
}
