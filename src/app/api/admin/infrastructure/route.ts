import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { access, failure, response } from "@/lib/infrastructure/server";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const auth = await access();
    if (auth instanceof NextResponse) return auth;
    const db = createServiceClient();
    const [projects, telemetry] = await Promise.all([
      db.from("infra_projects").select("*").order("name").limit(100),
      db.from("infra_telemetry").select("*").limit(100),
    ]);
    if (projects.error || telemetry.error) throw new Error("READ_FAILED");
    return response({ projects: projects.data, telemetry: telemetry.data, canOperate: auth.canOperate });
  } catch (e) { return failure(e); }
}
