import type { MaintenanceStoredCredential } from "@/lib/maintenance-vault";
import { getMaintenanceVaultSnapshot } from "@/lib/maintenance-vault";
import { ConnectyShell } from "./connecty-shell";
import { CredentialVaultForm } from "./credential-vault-form";
import Link from "next/link";
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

      <Panel title="Meta · Configuração e homologação" className="mb-5">
        <p className="text-sm">Facebook e Instagram disponíveis para conexão nos painéis. WhatsApp oficial tem configuração própria de Embedded Signup, modelos e chat. As permissões efetivas continuam sendo conferidas pela Meta.</p>
        <div className="mt-3 flex flex-wrap gap-4 text-sm text-blue-700"><Link href="/admin/meta">Abrir laboratório e chat oficial</Link><Link href="/dashboard/integracoes">Integrações do painel do usuário</Link></div>
        <p className="mt-3 text-xs text-slate-500">Para a revisão WhatsApp: conecte o número de teste, crie um modelo neste painel e registre um envio chegando ao destinatário. A criação do modelo e o envio precisam de demonstrações distintas.</p>
      </Panel>
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
              section: field.section,
              multiline: field.multiline,
              help: field.help,
            })),
          }))}
        />
      </Panel>
    </ConnectyShell>
  );
}
