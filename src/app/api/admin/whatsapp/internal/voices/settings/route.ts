import { NextResponse, type NextRequest } from 'next/server';
import { requirePlatformAdmin } from '@/lib/supabase/admin-auth';
import { createServiceClient } from '@/lib/supabase/service';
import { requirePlatformWhatsappSector } from '@/lib/admin/platform-whatsapp-console';
import { resolveOrganizationId } from '@/lib/voice/internal-organization';
import { agentPreviewResponse, agentPreviewError } from '@/lib/voice/agent-preview-route';
import { voiceBody } from '@/lib/voice-api/contract';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
async function handle(request: NextRequest) {
  const auth = await requirePlatformAdmin();
  if (auth instanceof NextResponse) return auth;
  try {
    const client = createServiceClient();
    const sector = await requirePlatformWhatsappSector(client, request.nextUrl.searchParams.get('sectorId') ?? '');
    const organizationId = await resolveOrganizationId(client, sector.id);
    const body = request.method === 'POST' ? JSON.parse(new TextDecoder().decode(await voiceBody(request, 12000))) as Record<string, unknown> : undefined;
    return await agentPreviewResponse(request, { organizationId, userId: auth.userId, agentScope: 'platform', client }, body);
  } catch (error) { return agentPreviewError(error); }
}
export const GET = handle;
export const POST = handle;
