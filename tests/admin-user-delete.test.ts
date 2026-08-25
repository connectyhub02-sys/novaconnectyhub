import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const routeSource = readFileSync("src/app/api/admin/users/route.ts", "utf8");
const adminUsersSource = readFileSync("src/lib/admin/users.ts", "utf8");
const consoleSource = readFileSync("src/components/connectyhub-os/admin-users-console.tsx", "utf8");

function sourceBetween(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);

  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);

  return source.slice(startIndex, endIndex);
}

describe("Admin user deletion", () => {
  it("protects the destructive API behind platform admin auth and confirmation", () => {
    const routeDelete = sourceBetween(routeSource, "export async function DELETE", "async function readJson");

    expect(routeDelete).toContain("requirePlatformAdmin()");
    expect(routeDelete).toContain("deleteAdminPlatformUser");
    expect(routeDelete).toContain("actorUserId: auth.userId");
    expect(routeDelete).toContain("confirmation: readString(body?.confirmation)");
    expect(routeDelete).toContain("deleteOrganization: body?.deleteOrganization === true");
    expect(routeDelete).toContain('revalidatePath("/admin/clientes")');
  });

  it("blocks unsafe deletions and audits completed removals", () => {
    const deleter = sourceBetween(adminUsersSource, "export async function deleteAdminPlatformUser", "async function loadDeleteProfile");

    expect(deleter).toContain('confirmation !== "EXCLUIR"');
    expect(deleter).toContain("targetUserId === input.actorUserId");
    expect(deleter).toContain("profile?.is_platform_admin");
    expect(deleter).toContain("countOrganizationMembers");
    expect(deleter).toContain("deleteOrganizationRow");
    expect(deleter).toContain("service.auth.admin.deleteUser");
    expect(deleter).toContain("writeAdminUserDeleteAuditLog");
  });

  it("exposes a guarded delete modal in the admin customers console", () => {
    expect(consoleSource).toContain("DeleteUserModal");
    expect(consoleSource).toContain('method: "DELETE"');
    expect(consoleSource).toContain("deleteOrganization: deleteDraft.scope === \"client\"");
    expect(consoleSource).toContain("Digite EXCLUIR");
    expect(consoleSource).toContain("Excluir só o usuário");
    expect(consoleSource).toContain("Excluir usuário e cliente");
    expect(consoleSource).toContain("user.isPlatformAdmin");
  });
});
