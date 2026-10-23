import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
const m = vi.hoisted(() => ({ workspace: vi.fn(), company: vi.fn(), admin: vi.fn(), sector: vi.fn(), organization: vi.fn(), preview: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/profile', () => ({ getCurrentWorkspace: m.workspace }));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => ({}) }));
vi.mock('@/lib/supabase/admin-auth', () => ({ requirePlatformAdmin: m.admin }));
vi.mock('@/lib/client-os/companies', () => ({ requireClientCompanyAccess: m.company }));
vi.mock('@/lib/admin/platform-whatsapp-console', () => ({ requirePlatformWhatsappSector: m.sector }));
vi.mock('@/lib/voice/internal-organization', () => ({ resolveOrganizationId: m.organization }));
vi.mock('@/lib/voice/agent-preview-route', () => ({ agentPreviewResponse: m.preview, agentPreviewError: () => Response.json({ error: 'denied' }, { status: 403 }) }));
import { GET, POST } from '@/app/api/dashboard/voices/settings/route';
import { GET as adminGet, POST as adminPost } from '@/app/api/admin/whatsapp/internal/voices/settings/route';
beforeEach(() => { vi.resetAllMocks(); m.preview.mockResolvedValue(Response.json({ models: [] })); });
it('requires a session before exposing prices or paid preview', async () => {
  m.workspace.mockResolvedValue(null);
  for (const method of [GET, POST]) expect((await method(new NextRequest('https://fixture.invalid/api/dashboard/voices/settings'))).status).toBe(401);
  expect(m.preview).not.toHaveBeenCalled();
});
it('rejects another company through the existing ownership gate', async () => {
  m.workspace.mockResolvedValue({ user: { id: 'user' }, organization: { id: 'own-company' } });
  m.company.mockRejectedValue(new Error('denied'));
  expect((await GET(new NextRequest('https://fixture.invalid/api/dashboard/voices/settings?companyId=another-company'))).status).toBe(403);
  expect(m.preview).not.toHaveBeenCalled();
});
it('uses the authorized company and server-assigned customer billing scope', async () => {
  m.workspace.mockResolvedValue({ user: { id: 'user' }, organization: { id: 'company' } });
  m.company.mockResolvedValue({ id: 'company' });
  await POST(new NextRequest('https://fixture.invalid/api/dashboard/voices/settings?companyId=company', { method: 'POST', body: JSON.stringify({ action: 'quote', organizationId: 'victim', agentScope: 'platform' }) }));
  expect(m.preview.mock.calls[0][1]).toMatchObject({ organizationId: 'company', userId: 'user', agentScope: 'customer' });
});
it('requires admin authentication and resolves the internal organization from the sector', async () => {
  m.admin.mockResolvedValueOnce(NextResponse.json({ error: 'denied' }, { status: 403 }));
  expect((await adminGet(new NextRequest('https://fixture.invalid/api/admin/whatsapp/internal/voices/settings?sectorId=s'))).status).toBe(403);
  expect(m.preview).not.toHaveBeenCalled();
  m.admin.mockResolvedValue({ userId: 'admin' }); m.sector.mockResolvedValue({ id: 's' }); m.organization.mockResolvedValue('internal-org');
  await adminPost(new NextRequest('https://fixture.invalid/api/admin/whatsapp/internal/voices/settings?sectorId=s', { method: 'POST', body: '{}' }));
  expect(m.preview.mock.calls[0][1]).toMatchObject({ organizationId: 'internal-org', userId: 'admin', agentScope: 'platform' });
});
