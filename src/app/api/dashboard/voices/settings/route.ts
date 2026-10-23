import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentWorkspace } from '@/lib/supabase/profile';
import { createServiceClient } from '@/lib/supabase/service';
import { requireClientCompanyAccess } from '@/lib/client-os/companies';
import { resolveDashboardCompanyId } from '@/lib/client-os/dashboard-route-scope';
import { agentPreviewResponse, agentPreviewError } from '@/lib/voice/agent-preview-route';
import { voiceBody } from '@/lib/voice-api/contract';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
async function handle(request: NextRequest) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return NextResponse.json({ error: 'Sessão obrigatória.' }, { status: 401 });
  try {
    const body = request.method === 'POST' ? JSON.parse(new TextDecoder().decode(await voiceBody(request, 12000))) as Record<string, unknown> : undefined;
    const companyId = resolveDashboardCompanyId({ workspace, requestedCompanyId: request.nextUrl.searchParams.get('companyId'), missingMessage: 'Escolha uma empresa.' });
    const organization = await requireClientCompanyAccess({ userId: workspace.user.id, companyId });
    return await agentPreviewResponse(request, { organizationId: organization.id, userId: workspace.user.id, agentScope: 'customer', client: createServiceClient() }, body);
  } catch (error) { return agentPreviewError(error); }
}
export const GET = handle;
export const POST = handle;
