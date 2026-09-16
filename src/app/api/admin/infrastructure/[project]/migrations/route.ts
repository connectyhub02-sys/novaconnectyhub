import { NextResponse } from "next/server";
import { access, failure, getProject, migrationCatalog, response } from "@/lib/infrastructure/server";
export const dynamic = "force-dynamic";
export async function GET(_request: Request, context: { params: Promise<{ project: string }> }) {
  try {
    const auth = await access();
    if (auth instanceof NextResponse) return auth;
    const { project } = await context.params;
    if (!await getProject(project)) return response({ error: "Projeto não encontrado." }, 404);
    return response({ migrations: await migrationCatalog(project) });
  } catch (e) { return failure(e); }
}
