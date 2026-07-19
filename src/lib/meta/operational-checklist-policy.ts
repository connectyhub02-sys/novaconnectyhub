import {
  normalizeMetaSocialDispatchLiveActivation,
  type MetaSocialDispatchLiveActivationSnapshot,
  type MetaSocialDispatchMode,
} from "./social-dispatch-policy";

type JsonRecord = Record<string, unknown>;

export type MetaOperationalChecklistItemStatus = "ready" | "warning" | "blocked";

export type MetaOperationalChecklistStatus = "ready_for_tests" | "needs_attention" | "blocked";

export type MetaOperationalChecklistItemId =
  | "meta_connection"
  | "app_review"
  | "webhooks"
  | "live_activation"
  | "canary"
  | "runtime_mode"
  | "rollback";

export type MetaOperationalChecklistItem = {
  id: MetaOperationalChecklistItemId;
  label: string;
  status: MetaOperationalChecklistItemStatus;
  detail: string;
  action: string;
};

export type MetaOperationalChecklistSnapshot = {
  status: MetaOperationalChecklistStatus;
  generatedAt: string;
  runtimeMode: MetaSocialDispatchMode;
  ready: number;
  warning: number;
  blocked: number;
  items: MetaOperationalChecklistItem[];
};

export function buildMetaOperationalChecklist(input: {
  accountLabel?: string | null;
  integrationStatus?: string | null;
  metadata: JsonRecord | null | undefined;
  now?: Date;
  runtimeMode: MetaSocialDispatchMode;
}): MetaOperationalChecklistSnapshot {
  const metadata = readRecord(input.metadata);
  const items: MetaOperationalChecklistItem[] = [
    buildConnectionItem({
      accountLabel: input.accountLabel,
      integrationStatus: input.integrationStatus,
      metadata,
    }),
    buildReviewItem(metadata),
    buildWebhookItem(metadata),
    buildLiveActivationItem(normalizeMetaSocialDispatchLiveActivation(metadata.meta_social_dispatch_activation)),
    buildCanaryItem(metadata, input.runtimeMode),
    buildRuntimeModeItem(input.runtimeMode),
    buildRollbackItem(),
  ];
  const ready = items.filter((item) => item.status === "ready").length;
  const warning = items.filter((item) => item.status === "warning").length;
  const blocked = items.filter((item) => item.status === "blocked").length;

  return {
    status: blocked > 0 ? "blocked" : warning > 0 ? "needs_attention" : "ready_for_tests",
    generatedAt: (input.now ?? new Date()).toISOString(),
    runtimeMode: input.runtimeMode,
    ready,
    warning,
    blocked,
    items,
  };
}

function buildConnectionItem(input: {
  accountLabel?: string | null;
  integrationStatus?: string | null;
  metadata: JsonRecord;
}): MetaOperationalChecklistItem {
  const connected = input.integrationStatus === "connected";
  const adAccountId = normalizeMetaAdAccountId(readString(input.metadata.selected_ad_account_id) ?? readString(input.metadata.ad_account_id));
  const pageId = readString(input.metadata.selected_facebook_page_id) ?? readString(input.metadata.facebook_page_id);
  const instagramBusinessId = readString(input.metadata.selected_instagram_business_id) ?? readString(input.metadata.instagram_business_id);
  const socialAssetCount = [pageId, instagramBusinessId].filter(Boolean).length;

  if (!connected) {
    return {
      id: "meta_connection",
      label: "Conexao Meta",
      status: "blocked",
      detail: "A empresa ainda nao tem uma integracao Meta conectada.",
      action: "Conectar a Meta pelo OAuth guiado antes de iniciar testes.",
    };
  }

  if (!adAccountId) {
    return {
      id: "meta_connection",
      label: "Conexao Meta",
      status: "blocked",
      detail: "A conta de anuncios Meta ainda nao foi selecionada para a empresa.",
      action: "Selecionar e salvar a conta de anuncios usada nos dashboards.",
    };
  }

  if (socialAssetCount === 0) {
    return {
      id: "meta_connection",
      label: "Conexao Meta",
      status: "warning",
      detail: `Conta ${input.accountLabel ?? adAccountId} pronta para trafego pago, mas sem Page/Instagram social selecionado.`,
      action: "Selecionar Page Facebook e Instagram Business quando for testar atendimento social.",
    };
  }

  return {
    id: "meta_connection",
    label: "Conexao Meta",
    status: "ready",
    detail: `Conta ${input.accountLabel ?? adAccountId} com ${socialAssetCount} ativo(s) social(is) selecionado(s).`,
    action: "Manter esta selecao durante os testes internos.",
  };
}

function buildReviewItem(metadata: JsonRecord): MetaOperationalChecklistItem {
  const review = readRecord(metadata.review_test);
  const readiness = readRecord(review.readiness);
  const status = readString(readiness.status);
  const total = readNumber(readiness.total);
  const ready = readNumber(readiness.ready);
  const blocked = readNumber(readiness.blocked);

  if (review.ok === true && status === "ready") {
    return {
      id: "app_review",
      label: "Checklist Meta",
      status: "ready",
      detail: total > 0 ? `${ready}/${total} checks Meta prontos.` : "Checklist Meta salvo como pronto.",
      action: "Reexecutar antes de sair de dry-run para confirmar permissoes.",
    };
  }

  if (review.ok === true && status === "warning") {
    return {
      id: "app_review",
      label: "Checklist Meta",
      status: "warning",
      detail: total > 0 ? `${ready}/${total} checks prontos com alerta operacional.` : "Checklist Meta passou com alertas.",
      action: "Revisar alertas antes de liberar usuarios reais.",
    };
  }

  return {
    id: "app_review",
    label: "Checklist Meta",
    status: "blocked",
    detail: blocked > 0 ? `${blocked} bloqueio(s) no checklist Meta.` : "Checklist Meta ainda nao foi executado ou nao passou.",
    action: "Rodar o checklist Meta e corrigir permissoes/ativos pendentes.",
  };
}

function buildWebhookItem(metadata: JsonRecord): MetaOperationalChecklistItem {
  const activation = readRecord(metadata.webhook_activation);
  const simulation = readRecord(metadata.webhook_simulation);
  const ingest = readRecord(simulation.ingest);
  const activationOk = activation.ok === true;
  const simulationOk = readNumber(ingest.normalized) > 0
    && readNumber(ingest.failed) === 0
    && readNumber(ingest.unmapped) === 0;

  if (activationOk && simulationOk) {
    return {
      id: "webhooks",
      label: "Webhooks Meta",
      status: "ready",
      detail: "Assinatura e simulacao de evento Meta confirmadas.",
      action: "Usar o monitor para acompanhar eventos reais durante os testes.",
    };
  }

  if (activationOk || simulationOk) {
    return {
      id: "webhooks",
      label: "Webhooks Meta",
      status: "warning",
      detail: activationOk
        ? "Page assinada, mas a simulacao operacional ainda nao foi confirmada."
        : "Simulacao processada, mas a assinatura da Page ainda nao foi confirmada.",
      action: "Completar assinatura e simulacao antes de testar comentarios/directs reais.",
    };
  }

  return {
    id: "webhooks",
    label: "Webhooks Meta",
    status: "blocked",
    detail: "Nenhuma assinatura ou simulacao Meta operacional foi confirmada.",
    action: "Assinar a Page e simular pelo menos um evento Meta.",
  };
}

function buildLiveActivationItem(activation: MetaSocialDispatchLiveActivationSnapshot): MetaOperationalChecklistItem {
  if (activation.readyChannels > 0 && activation.blockedChannels === 0) {
    return {
      id: "live_activation",
      label: "Canais live",
      status: "ready",
      detail: `${activation.readyChannels}/${activation.enabledChannels} canal(is) habilitado(s) e pronto(s).`,
      action: "Testar primeiro em dry-run/canario antes de usuarios reais.",
    };
  }

  if (activation.readyChannels > 0 && activation.blockedChannels > 0) {
    return {
      id: "live_activation",
      label: "Canais live",
      status: "warning",
      detail: `${activation.readyChannels} canal(is) pronto(s) e ${activation.blockedChannels} bloqueado(s).`,
      action: "Testar apenas canais prontos e corrigir os bloqueados antes da liberacao total.",
    };
  }

  return {
    id: "live_activation",
    label: "Canais live",
    status: "blocked",
    detail: activation.enabledChannels > 0
      ? `${activation.blockedChannels} canal(is) habilitado(s), todos bloqueados.`
      : "Nenhum canal social Meta foi habilitado para live.",
    action: "Habilitar pelo menos um canal social e salvar a ativacao operacional.",
  };
}

function buildCanaryItem(metadata: JsonRecord, runtimeMode: MetaSocialDispatchMode): MetaOperationalChecklistItem {
  const canary = readRecord(metadata.meta_social_dispatch_canary);
  const status = readString(canary.status);
  const channelLabel = readString(canary.channelLabel ?? canary.channel_label);
  const ranAt = readString(canary.ranAt ?? canary.ran_at);

  if (status === "sent") {
    return {
      id: "canary",
      label: "Canario de envio",
      status: "ready",
      detail: `${channelLabel ?? "Canario Meta"} enviado${ranAt ? ` em ${formatDateTime(ranAt)}` : ""}.`,
      action: "Guardar o run como evidencia do teste controlado.",
    };
  }

  if (status === "blocked" || status === "skipped") {
    return {
      id: "canary",
      label: "Canario de envio",
      status: "warning",
      detail: runtimeMode === "dry_run"
        ? "Canario executado sem envio real porque o servidor segue em dry-run."
        : readString(canary.detail) ?? "Canario executado, mas o dispatch Meta foi bloqueado.",
      action: runtimeMode === "dry_run"
        ? "Manter assim para testes internos ou trocar para live apenas quando a Meta aprovar o app."
        : "Revisar permissao, canal e janela de resposta antes de repetir.",
    };
  }

  if (status === "failed") {
    return {
      id: "canary",
      label: "Canario de envio",
      status: "blocked",
      detail: readString(canary.detail) ?? "O ultimo canario Meta falhou.",
      action: "Corrigir a falha do dispatcher antes dos testes internos.",
    };
  }

  return {
    id: "canary",
    label: "Canario de envio",
    status: "blocked",
    detail: "Nenhum canario de envio social Meta foi executado.",
    action: "Executar um canario controlado no painel da integracao.",
  };
}

function buildRuntimeModeItem(runtimeMode: MetaSocialDispatchMode): MetaOperationalChecklistItem {
  if (runtimeMode === "live") {
    return {
      id: "runtime_mode",
      label: "Modo do servidor",
      status: "ready",
      detail: "META_SOCIAL_DISPATCH_MODE=live: o servidor pode enviar respostas reais nos canais prontos.",
      action: "Usar somente depois da aprovacao Meta e com canario validado.",
    };
  }

  return {
    id: "runtime_mode",
    label: "Modo do servidor",
    status: "warning",
    detail: "META_SOCIAL_DISPATCH_MODE em dry-run: nenhum envio social real sai pela Graph API.",
    action: "Usar dry-run para testes internos enquanto a Meta nao libera o app.",
  };
}

function buildRollbackItem(): MetaOperationalChecklistItem {
  return {
    id: "rollback",
    label: "Rollback",
    status: "ready",
    detail: "A trava global dry-run continua disponivel para cortar envios sociais reais.",
    action: "Em emergencia, voltar META_SOCIAL_DISPATCH_MODE para dry_run e redeployar.",
  };
}

function readRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function readString(value: unknown) {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return null;
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function normalizeMetaAdAccountId(value: string | null) {
  const text = value?.trim() ?? "";

  if (!text) {
    return null;
  }

  return text.startsWith("act_") ? text : `act_${text.replace(/^act_/, "")}`;
}

function formatDateTime(value: string) {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return value;

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(time));
}
