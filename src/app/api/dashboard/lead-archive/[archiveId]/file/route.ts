import { NextResponse } from "next/server";
import { getCurrentWorkspace } from "@/lib/supabase/profile";
import { createServiceClient } from "@/lib/supabase/service";
import { requireClientCompanyAccess } from "@/lib/client-os/companies";
export const dynamic = "force-dynamic";
export async function GET(_request: Request, { params }: { params: Promise<{ archiveId: string }> }) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });
  const { archiveId } = await params;
  const client = createServiceClient();
  const { data: file } = await client.from("lead_files").select("organization_id, object_key, mime_type, original_name").eq("archive_id", archiveId).maybeSingle();
  if (!file) return NextResponse.json({ error: "Arquivo não encontrado." }, { status: 404 });
  if (!workspace.profile.isPlatformAdmin) {
    const access = await requireClientCompanyAccess({ client, companyId: file.organization_id, userId: workspace.user.id }).catch(() => null);
    if (!access) return NextResponse.json({ error: "Arquivo não encontrado." }, { status: 404 });
  }
  const result = await client.storage.from("lead-archive").download(file.object_key);
  if (result.error) return NextResponse.json({ error: "Arquivo temporariamente indisponível." }, { status: 503 });
  return new Response(result.data, { headers: { "Content-Type": file.mime_type ?? "application/octet-stream", "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.original_name ?? "arquivo")}`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
