import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { access, failure, response } from "@/lib/infrastructure/server";
import { collectHealth } from "@/lib/infrastructure/collector";
import { stale } from "@/lib/infrastructure/model";
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
    const observations = await Promise.all((projects.data ?? []).map(async project => {
      const stored = telemetry.data?.find(t => t.project_id === project.id);
      const live = await collectHealth(project.id);
      return stored && !stale(stored) ? stored : live.telemetry ? { ...live.telemetry, project_id: project.id } : stored;
    }));
    return response({ projects: projects.data, telemetry: observations.filter(Boolean), canOperate: auth.canOperate, permissionReason: auth.canOperate ? null : "Operações SQL exigem seu UUID em INFRA_ADMIN_USER_IDS, além de administrador da plataforma." });
  } catch (e) { return failure(e); }
}
