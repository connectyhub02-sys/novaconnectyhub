import type { MaintenanceStoredCredential } from "@/lib/maintenance-vault";
import { getMaintenanceVaultSnapshot } from "@/lib/maintenance-vault";
import { ConnectyShell } from "./connecty-shell";
import { CredentialVaultForm } from "./credential-vault-form";
import { PageHeader } from "./panel-primitives";

export function MaintenanceRoom({
  storedCredentials = [],
  userLabel = "CEO_HUMAN_ADM",
}: {
  storedCredentials?: MaintenanceStoredCredential[];
  userLabel?: string;
}) {
  const vault = getMaintenanceVaultSnapshot({ storedCredentials });

  return (
    <ConnectyShell mode="admin" isPlatformAdmin userLabel={userLabel}>
      <PageHeader
        eyebrow="Sistema"
        title="Manutenção da plataforma"
        description="Chaves e credenciais dos aplicativos da ConnectyHub em cada serviço. As contas da operação própria ficam em Redes sociais › Contas conectadas."
      />

      <section id="credenciais-do-sistema" aria-label="Credenciais do sistema">
        <CredentialVaultForm
          integrations={vault.integrations.map((integration) => ({
            id: integration.id,
            name: integration.name,
            description: integration.description,
            fields: integration.fields.map((field) => ({
              label: field.label,
              env: field.env,
              aliases: field.aliases,
              kind: field.kind,
              requirement: field.requirement,
              section: field.section,
              multiline: field.multiline,
              help: field.help,
              environmentConfigured: field.environmentConfigured,
              savedInVault: field.source === "vault",
            })),
          }))}
        />
      </section>
    </ConnectyShell>
  );
}
