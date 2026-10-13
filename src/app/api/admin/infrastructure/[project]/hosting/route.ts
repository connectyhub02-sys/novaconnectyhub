import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { access, audit, failure, getProject, response } from "@/lib/infrastructure/server";
import { hostingBroker, sameOrigin, usageSources } from "@/lib/infrastructure/hosting-server";
import { choice, InvalidInput, keys, object, readBody, uuid } from "@/lib/infrastructure/validation";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ project: string }> };
export async function GET(_request: Request, context: Context) {
  try {
    const auth = await access(); if (auth instanceof NextResponse) return auth;
    const id = (await context.params).project, project = await getProject(id);
    if (!project) return response({ error: "Projeto não encontrado." }, 404);
    const [usage, broker] = await Promise.all([usageSources(), hostingBroker(id).catch(() => null)]);
    const customer = project.organization_id ? await createServiceClient().from("organizations").select("name").eq("id", project.organization_id).maybeSingle() : null;
    return response({ project, customerName: customer?.data?.name ?? null, usage: usage(id), broker, canOperate: auth.canOperate });
  } catch (e) { return failure(e); }
}
export async function PATCH(request: Request, context: Context) {
  try {
    const auth = await access(true); if (auth instanceof NextResponse) return auth;
    sameOrigin(request);
    const id = (await context.params).project;
    if (!await getProject(id)) return response({ error: "Projeto não encontrado." }, 404);
    const b = object(await readBody(request)); keys(b, ["organizationId", "visible", "revision"]);
    if (typeof b.visible !== "boolean" || !Number.isSafeInteger(b.revision) || (b.revision as number) < 0) throw new InvalidInput("Vínculo inválido.");
    const { error } = await createServiceClient().rpc("infra_save_customer_binding", { p_project: id, p_organization: b.organizationId === null ? null : uuid(b.organizationId), p_visible: b.visible, p_revision: b.revision, p_actor: auth.userId });
    if (error) {
      if (error.message.includes("binding_conflict")) return response({ error: "Outro administrador alterou o vínculo. Atualize antes de salvar." }, 409);
      throw new InvalidInput("Não foi possível salvar. Confira o cliente e atualize a página.");
    }
    return response({ message: "Vínculo e acesso do cliente salvos." });
  } catch (e) { return failure(e); }
}
export async function POST(request: Request, context: Context) {
  try {
    const auth = await access(true); if (auth instanceof NextResponse) return auth;
    if (!auth.canOperate) return response({ error: "Operação exige permissão de administrador de infraestrutura." }, 403);
    sameOrigin(request);
    const id = (await context.params).project;
    if (!await getProject(id)) return response({ error: "Projeto não encontrado." }, 404);
    const b = object(await readBody(request)); keys(b, ["action", "revision", "confirmation", "requestId", "reason"]);
    const action = choice(b.action, ["pause", "resume", "quarantine", "delete"] as const);
    if (typeof b.revision !== "string" || !/^[a-f0-9]{64}$/.test(b.revision) || b.confirmation !== `${id}:${action}` || typeof b.reason !== "string" || b.reason.trim().length < 5 || b.reason.length > 300) throw new InvalidInput("Confira a prévia, informe o motivo e digite a confirmação.");
    const requestId = uuid(b.requestId);
    await audit(auth.userId, id, `hosting_${action}`, "requested", b.reason.trim(), requestId);
    const result = await hostingBroker(id, { action, revision: b.revision, requestId, actor: auth.userId });
    return response(result);
  } catch (e) { return e instanceof InvalidInput ? failure(e) : response({ error: "Não foi possível confirmar o resultado. Atualize e confira o recibo antes de repetir a operação." }, 503); }
}
