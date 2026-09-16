import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { access, failure, getProject, response } from "@/lib/infrastructure/server";
import { uuid } from "@/lib/infrastructure/validation";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ project: string }> }) {
  try {
    const auth = await access();
    if (auth instanceof NextResponse) return auth;
    const { project: id } = await context.params;
    const project = await getProject(id);
    if (!project) return response({ error: "Projeto não encontrado." }, 404);
    const requestedDeploy = new URL(request.url).searchParams.get("deploy");
    if (requestedDeploy) uuid(requestedDeploy);
    const db = createServiceClient();
    const [telemetry, deployments, audit] = await Promise.all([
      db.from("infra_telemetry").select("*").eq("project_id", id).maybeSingle(),
      db.from("infra_deployments").select("*").eq("project_id", id).order("started_at", { ascending: false }).limit(51),
      db.from("infra_audit").select("id,actor,action,target,result,reason,created_at,before_state,after_state").eq("project_id", id).neq("action", "telemetry").order("created_at", { ascending: false }).limit(100),
    ]);
    if (telemetry.error || deployments.error || audit.error) throw new Error("READ_FAILED");
    const selectedDeployId = requestedDeploy ?? deployments.data?.[0]?.id ?? null;
    let events: unknown[] = [];
    if (selectedDeployId) {
      const { data: owner, error: ownerError } = await db.from("infra_deployments").select("id").eq("project_id", id).eq("id", selectedDeployId).maybeSingle();
      if (ownerError) throw new Error("READ_FAILED");
      if (!owner) return response({ error: "Deploy não encontrado neste projeto." }, 404);
      const result = await db.from("infra_deploy_events").select("sequence,stage,code,created_at,executor").eq("deploy_id", selectedDeployId).order("sequence", { ascending: false }).limit(100);
      if (result.error) throw new Error("READ_FAILED");
      events = (result.data ?? []).reverse();
    }
    return response({ project, telemetry: telemetry.data, deployments: deployments.data?.slice(0, 50), events, selectedDeployId, audit: audit.data, canOperate: auth.canOperate, truncated: (deployments.data?.length ?? 0) > 50 });
  } catch (e) { return failure(e); }
}
