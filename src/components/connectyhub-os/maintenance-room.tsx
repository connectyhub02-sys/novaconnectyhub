import type { LucideIcon } from "lucide-react";
import {
  CircleAlert,
  KeyRound,
  MessageCircle,
  ServerCog,
} from "lucide-react";
import type { MaintenanceStoredCredential } from "@/lib/maintenance-vault";
import { getMaintenanceVaultSnapshot } from "@/lib/maintenance-vault";
import type { Tone } from "@/lib/connectyhub-os-data";
import { ConnectyShell } from "./connecty-shell";
import { CredentialVaultForm } from "./credential-vault-form";
import {
  PageHeader,
  Panel,
  ProgressBar,
  toneClass,
} from "./panel-primitives";

export function MaintenanceRoom({
  storedCredentials = [],
  userLabel = "CEO_HUMAN_ADM",
}: {
  storedCredentials?: MaintenanceStoredCredential[];
  userLabel?: string;
}) {
  const vault = getMaintenanceVaultSnapshot({ storedCredentials });
  const configuredPercent = Math.round(
    (vault.summary.configuredFields / Math.max(vault.summary.fields, 1)) * 100,
  );

  return (
    <ConnectyShell mode="admin" isPlatformAdmin userLabel={userLabel}>
      <PageHeader
        eyebrow="Admin OS / Sala de Manutencao"
        title="Manutencao da Plataforma"
        description="Credenciais, APIs e webhooks do ambiente ConnectyHub."
      />

      <div className="mb-5 grid grid-cols-2 gap-4 md:grid-cols-4">
        <MaintenanceStat
          icon={ServerCog}
          label="Integracoes"
          value={`${vault.summary.readyIntegrations}/${vault.summary.integrations}`}
          detail="plataformas prontas"
          tone="green"
        />
        <MaintenanceStat
          icon={KeyRound}
          label="Credenciais"
          value={`${vault.summary.configuredFields}/${vault.summary.fields}`}
          detail={`${configuredPercent}% configuradas`}
          tone="cyan"
        />
        <MaintenanceStat
          icon={CircleAlert}
          label="Obrigatorias"
          value={String(vault.summary.missingRequired)}
          detail="campos essenciais ausentes"
          tone={vault.summary.missingRequired > 0 ? "rose" : "green"}
        />
        <MaintenanceStat
          icon={MessageCircle}
          label="WhatsApp"
          value={String(vault.summary.uazapiOperations)}
          detail="operacoes Uazapi"
          tone="violet"
        />
      </div>

      <div
        className="mb-5 rounded-2xl p-5"
        style={{ background: "var(--ch-surface)", border: "1px solid var(--ch-border)" }}
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-slate-500">
              progresso geral de configuracao
            </p>
            <p className="mt-0.5 text-[14px] font-semibold" style={{ color: "var(--ch-text)" }}>
              {configuredPercent}% do ambiente configurado
            </p>
          </div>
          <span
            className="rounded-xl px-3 py-1.5 font-mono text-[11px] font-semibold"
            style={{
              background: configuredPercent > 70
                ? "rgba(16,185,129,0.12)"
                : "rgba(245,158,11,0.12)",
              color: configuredPercent > 70 ? "#10b981" : "#f59e0b",
              border: `1px solid ${configuredPercent > 70 ? "rgba(16,185,129,0.25)" : "rgba(245,158,11,0.25)"}`,
            }}
          >
            {configuredPercent > 70 ? "Saudavel" : "Incompleto"}
          </span>
        </div>
        <ProgressBar
          value={configuredPercent}
          tone={configuredPercent > 70 ? "green" : "amber"}
        />
        <div className="mt-3 flex flex-wrap gap-4">
          {[
            ["Integracoes prontas", `${vault.summary.readyIntegrations}/${vault.summary.integrations}`],
            ["Campos configurados", `${vault.summary.configuredFields}/${vault.summary.fields}`],
            ["Campos ausentes", String(vault.summary.missingRequired)],
          ].map(([label, value]) => (
            <div key={label} className="flex items-center gap-2">
              <span className="font-mono text-[9px] uppercase tracking-wider text-slate-500">{label}</span>
              <span className="font-mono text-[11px] font-semibold" style={{ color: "var(--ch-text)" }}>{value}</span>
            </div>
          ))}
        </div>
      </div>

      <Panel
        className="mb-5"
        title="Credenciais do sistema"
        eyebrow="preencha / salve / pronto"
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

function MaintenanceStat({
  icon: Icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  detail: string;
  tone: Tone;
}) {
  const t = toneClass(tone);

  return (
    <div
      className="rounded-2xl p-5"
      style={{ background: "var(--ch-surface)", border: "1px solid var(--ch-border)" }}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-mono text-[9px] uppercase tracking-widest text-slate-500">{label}</p>
        <div className={`flex h-8 w-8 items-center justify-center rounded-xl ${t.bg}`}>
          <Icon className={`h-4 w-4 ${t.text}`} />
        </div>
      </div>
      <p className={`mt-3 font-mono text-[26px] font-bold leading-none ${t.text}`}>{value}</p>
      <p className="mt-2 text-[11px] text-slate-500">{detail}</p>
    </div>
  );
}
