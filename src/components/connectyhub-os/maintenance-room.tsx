import type { MaintenanceStoredCredential } from "@/lib/maintenance-vault";
import { getMaintenanceVaultSnapshot } from "@/lib/maintenance-vault";
import { ConnectyShell } from "./connecty-shell";
import { CredentialVaultForm } from "./credential-vault-form";
import {
  PageHeader,
  Panel,
} from "./panel-primitives";

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
        eyebrow="Admin OS / Sala de Manutencao"
        title="Manutencao da Plataforma"
        description="Credenciais, APIs e webhooks do ambiente ConnectyHub."
      />

      <Panel
        className="mb-5"
        id="credenciais-do-sistema"
        title="Conexoes e credenciais do sistema"
        eyebrow="credenciais / tokens / OAuth"
      >
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
              help: field.help,
            })),
          }))}
        />
      </Panel>
    </ConnectyShell>
  );
}
