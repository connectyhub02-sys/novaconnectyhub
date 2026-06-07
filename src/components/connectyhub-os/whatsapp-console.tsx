"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Bot,
  Building2,
  CheckCircle2,
  CircleHelp,
  Clock3,
  Eye,
  FileText,
  Globe2,
  ImageIcon,
  Link2,
  Loader2,
  MessageCircle,
  MessageSquare,
  Mic,
  PlugZap,
  Power,
  Plus,
  QrCode,
  RefreshCcw,
  ShieldCheck,
  Smartphone,
  SplitSquareVertical,
  Timer,
  type LucideIcon,
  UserRound,
  Video,
  Volume2,
  Wand2,
  Wifi,
  X,
} from "lucide-react";
import { NeonBadge, Panel, SectionHeader } from "./panel-primitives";
import {
  defaultWhatsappBehaviorConfig,
  normalizeWhatsappBehaviorConfig,
  type WhatsappBehaviorConfig,
  type WhatsappRapportMode,
  type WhatsappResponseMode,
} from "@/lib/whatsapp/agent-behavior";
import { cn } from "@/lib/utils";

type WhatsappStatus = "draft" | "qr_pending" | "connected" | "disconnected" | "blocked" | "error" | "archived";

type ClientCompany = {
  id: string;
  name: string;
  slug: string | null;
  planCode: string;
  status: string;
  role: string;
  createdAt: string | null;
};

type WhatsappState = {
  companies: ClientCompany[];
  selectedCompanyId: string | null;
  instance: {
    id: string;
    provider: "uazapi";
    status: WhatsappStatus;
    phoneNumber: string | null;
    displayName: string | null;
    profileImageUrl: string | null;
    connectedAt: string | null;
    disconnectedAt: string | null;
    lastSyncedAt: string | null;
    lastHeartbeatAt: string | null;
    lastMessageAt: string | null;
    tokenReady: boolean;
  } | null;
  agent: {
    id: string;
    name: string;
    avatarUrl: string | null;
    avatarAlt: string | null;
    prompt: string;
    promptPreview: string;
    updatedAt: string | null;
  } | null;
  globalAgent: {
    id: string;
    name: string;
    prompt: string;
    promptPreview: string;
    updatedAt: string | null;
  };
  behavior: WhatsappBehaviorConfig;
  audio: {
    configured: boolean;
    defaultVoiceId: string | null;
    defaultModelId: string | null;
    outputFormat: string | null;
    voices: AudioVoiceOption[];
    errorMessage: string | null;
  };
  capability: {
    canConnect: boolean;
    schemaReady: boolean;
    message: string | null;
  };
};

type AudioVoiceOption = {
  voiceId: string;
  name: string;
  source: "platform" | "customer" | "elevenlabs" | "library";
  previewUrl: string | null;
  category: string | null;
  status: string | null;
  publicOwnerId: string | null;
  language: string | null;
  accent: string | null;
  gender: string | null;
  useCase: string | null;
  defaultForAgents: boolean;
  isDefault: boolean;
};

type ActionResponse = {
  state: WhatsappState;
  notice?: {
    tone: "success" | "warning" | "error";
    message: string;
  };
  qrCode?: string | null;
  pairCode?: string | null;
  error?: string;
};

type Notice = {
  tone: "success" | "warning" | "error";
  message: string;
};

type VoiceCloneResponse = {
  audio?: WhatsappState["audio"];
  voice?: {
    voiceId: string;
    name: string;
    status: string;
    requiresVerification: boolean;
  };
  notice?: Notice;
  error?: string;
};

export function WhatsAppConsole() {
  const [state, setState] = useState<WhatsappState | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [promptDraft, setPromptDraft] = useState("");
  const [behaviorDraft, setBehaviorDraft] = useState<WhatsappBehaviorConfig>(defaultWhatsappBehaviorConfig);
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [showAgentForm, setShowAgentForm] = useState(false);
  const [agentName, setAgentName] = useState("");
  const [creatingAgent, setCreatingAgent] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      const nextState = await fetchWhatsappState();

      if (!cancelled) {
        applyWhatsappState(nextState);
        if (nextState.capability.message) {
          setNotice({ tone: "warning", message: nextState.capability.message });
        }
        setLoading(false);
      }
    }

    load().catch((error: unknown) => {
      if (!cancelled) {
        setNotice({ tone: "error", message: error instanceof Error ? error.message : "Nao foi possivel carregar o WhatsApp." });
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const promptChanged = state?.agent ? promptDraft.trim() !== state.agent.prompt.trim() : false;
  const behaviorChanged = state ? !isBehaviorEqual(behaviorDraft, state.behavior) : false;
  const settingsChanged = promptChanged || behaviorChanged;
  const companies = state?.companies ?? [];
  const selectedCompany = companies.find((company) => company.id === selectedCompanyId) ?? companies[0] ?? null;
  const needsCompany = !loading && companies.length === 0;
  const needsAgent = !loading && companies.length > 0 && !state?.agent;
  const headerTitle = loading || needsCompany ? "WhatsApp" : needsAgent ? "Criar agente WhatsApp" : "Conexao, prompt e comportamento";
  const headerDescription = loading || needsCompany
    ? "Cadastre uma empresa antes de configurar WhatsApp e agentes."
    : needsAgent
      ? "Escolha uma empresa cadastrada e crie o agente que vai atender os leads."
      : "Conecte o numero da empresa, ajuste o prompt e escolha como o agente deve atender no WhatsApp.";

  function applyWhatsappState(nextState: WhatsappState) {
    const nextCompanyId = nextState.selectedCompanyId ?? nextState.companies[0]?.id ?? "";

    setState(nextState);
    setSelectedCompanyId(nextCompanyId);
    setPromptDraft(nextState.agent?.prompt ?? "");
    setBehaviorDraft(normalizeWhatsappBehaviorConfig(nextState.behavior));
  }

  function updateBehavior<K extends keyof WhatsappBehaviorConfig>(key: K, value: WhatsappBehaviorConfig[K]) {
    setBehaviorDraft((current) => normalizeWhatsappBehaviorConfig({ ...current, [key]: value }));
  }

  function selectAudioVoice(voice: AudioVoiceOption) {
    setBehaviorDraft((current) =>
      normalizeWhatsappBehaviorConfig({
        ...current,
        responseMode: "audio",
        audioVoiceId: voice.isDefault ? "" : voice.voiceId,
        audioVoiceName: voice.name,
        audioVoiceSource: voice.source,
        audioVoicePublicOwnerId: voice.publicOwnerId ?? "",
      }),
    );
  }

  function applyClonedVoice(audio: WhatsappState["audio"], voiceId: string, nextNotice?: Notice) {
    setState((current) => (current ? { ...current, audio } : current));

    const clonedVoice = audio.voices.find((voice) => voice.voiceId === voiceId);

    if (clonedVoice) {
      selectAudioVoice(clonedVoice);
    }

    setNotice(nextNotice ?? { tone: "success", message: "Voz clonada e selecionada para o agente." });
  }

  async function runAction(action: string, payload: Record<string, unknown> = {}) {
    setRunning(action);
    setNotice(null);

    try {
      const response = await fetch("/api/dashboard/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, companyId: selectedCompanyId, ...payload }),
      });
      const data = (await response.json().catch(() => null)) as ActionResponse | null;

      if (!response.ok || !data) {
        throw new Error(data?.error ?? "Nao foi possivel executar a acao.");
      }

      applyWhatsappState(data.state);
      setQrCode(data.qrCode ?? null);
      setNotice(data.notice ?? { tone: "success", message: "Acao concluida." });
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Erro inesperado no WhatsApp." });
    } finally {
      setRunning(null);
    }
  }

  async function saveAgentSettings() {
    setRunning("save_settings");
    setNotice(null);

    try {
      const response = await fetch("/api/dashboard/whatsapp", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: selectedCompanyId,
          agentPrompt: promptDraft,
          behavior: behaviorDraft,
        }),
      });
      const data = (await response.json().catch(() => null)) as (WhatsappState & { error?: string }) | null;

      if (!response.ok || !data) {
        throw new Error(data?.error ?? "Nao foi possivel salvar a configuracao.");
      }

      applyWhatsappState(data);
      setNotice({ tone: "success", message: "Configuracao do agente salva." });
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Erro ao salvar configuracao." });
    } finally {
      setRunning(null);
    }
  }

  async function createWhatsappAgent() {
    if (!selectedCompanyId) {
      setNotice({ tone: "warning", message: "Escolha uma empresa antes de criar o agente." });
      return;
    }

    setCreatingAgent(true);
    setNotice(null);

    try {
      const response = await fetch("/api/dashboard/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: selectedCompanyId,
          name: agentName.trim() || "Agente WhatsApp",
          roleTitle: "Agente de WhatsApp",
        }),
      });
      const data = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        throw new Error(data?.error ?? "Nao foi possivel criar o agente.");
      }

      const nextState = await fetchWhatsappState(selectedCompanyId);
      applyWhatsappState(nextState);
      setAgentName("");
      setShowAgentForm(false);
      setNotice({ tone: "success", message: "Agente criado. Agora configure o prompt, comportamento e conexao." });
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Erro ao criar agente." });
    } finally {
      setCreatingAgent(false);
    }
  }

  return (
    <>
      <SectionHeader
        eyebrow="WhatsApp / Agente comercial"
        title={headerTitle}
        description={headerDescription}
      />

      {notice && <NoticeBar notice={notice} />}

      {loading ? (
        <LoadingState />
      ) : companies.length === 0 ? (
        <CompanyRequiredState />
      ) : !state?.agent ? (
        <AgentCreationGate
          agentName={agentName}
          companies={companies}
          creating={creatingAgent}
          selectedCompany={selectedCompany}
          selectedCompanyId={selectedCompanyId}
          showForm={showAgentForm}
          onAgentNameChange={setAgentName}
          onCancel={() => setShowAgentForm(false)}
          onCreate={createWhatsappAgent}
          onSelectCompany={setSelectedCompanyId}
          onStart={() => setShowAgentForm(true)}
        />
      ) : (
      <>
        <Panel
          title="Prompt do agente"
          eyebrow="atendimento / vendas"
          action={<NeonBadge tone={promptChanged ? "amber" : "green"}>{promptChanged ? "alterado" : "salvo"}</NeonBadge>}
        >
          {state?.agent ? (
            <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_320px]">
              <div className="grid gap-4">
                <AgentIdentityCard agent={state.agent} instance={state.instance} />

                <PromptBox
                  label="Prompt do agente"
                  description="Define o tom, limites, perguntas e forma de atendimento do agente neste WhatsApp. Nao e template fixo de mensagem."
                  value={promptDraft}
                  onChange={setPromptDraft}
                  helper={`${promptDraft.length.toLocaleString("pt-BR")} caracteres`}
                />

                <div className="flex flex-wrap gap-2">
                  <SecondaryAction
                    icon={RefreshCcw}
                    label="Restaurar salvo"
                    description="Desfaz alteracoes ainda nao salvas e volta para a configuracao atual do banco."
                    disabled={!state || !settingsChanged}
                    onClick={() => state && applyWhatsappState(state)}
                  />
                  <ActionButton
                    icon={Wand2}
                    label="Salvar alteracoes"
                    description="Salva prompt e comportamento deste agente para a empresa selecionada."
                    disabled={!state?.capability.schemaReady || !state.agent || !settingsChanged}
                    loading={running === "save_settings"}
                    onClick={saveAgentSettings}
                  />
                </div>
              </div>

              <CompactConnectionCard
                instance={state.instance}
                qrCode={qrCode}
                running={running}
                onConnect={() => runAction("connect")}
                onDisconnect={() => runAction("disconnect")}
                onRefresh={() => runAction("refresh_status")}
              />
            </div>
          ) : (
            <NoAgentState />
          )}
        </Panel>

      {state?.agent ? (
      <div className="mt-5">
        <Panel
          title="Comportamento do agente"
          eyebrow="controles do atendimento"
          action={<NeonBadge tone={behaviorChanged ? "amber" : "green"}>{behaviorChanged ? "alterado" : "salvo"}</NeonBadge>}
        >
          <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="grid gap-3">
              <BehaviorSection title="Base do agente" description="Controles principais que ligam ou pausam o atendimento automatico deste agente." defaultOpen>
                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                  <ToggleTile icon={Power} label="Agente ativo" description="Quando ligado, o agente pode responder leads automaticamente neste WhatsApp." checked={behaviorDraft.agentEnabled} onChange={() => updateBehavior("agentEnabled", !behaviorDraft.agentEnabled)} />
                  <ToggleTile icon={Wifi} label="Sempre online" description="Mantem o atendimento disponivel sem depender de horario comercial." checked={behaviorDraft.alwaysOnline} onChange={() => updateBehavior("alwaysOnline", !behaviorDraft.alwaysOnline)} />
                  <ToggleTile icon={Eye} label="Marcar como lido" description="Marca mensagens como lidas depois que o sistema processa a conversa." checked={behaviorDraft.markAsRead} onChange={() => updateBehavior("markAsRead", !behaviorDraft.markAsRead)} />
                  <ToggleTile icon={SplitSquareVertical} label="Dividir respostas" description="Quebra respostas longas em mensagens menores para parecer mais natural." checked={behaviorDraft.splitMessages} onChange={() => updateBehavior("splitMessages", !behaviorDraft.splitMessages)} />
                </div>
              </BehaviorSection>

              <BehaviorSection title="Voz do agente" description="Escolhe a voz ElevenLabs usada quando o agente responder em audio.">
                <VoiceSelector
                  behavior={behaviorDraft}
                  companyId={selectedCompanyId}
                  defaultVoiceId={state.audio.defaultVoiceId}
                  errorMessage={state.audio.errorMessage}
                  voices={state.audio.voices}
                  onCloned={applyClonedVoice}
                  onSelect={selectAudioVoice}
                />
              </BehaviorSection>

              <div className="grid gap-3 xl:grid-cols-2">
                <BehaviorSection title="Modo de conversa" description="Define se o agente responde sempre por texto, sempre por audio ou acompanha o formato usado pelo lead." defaultOpen>
                  <ModeSelector<WhatsappResponseMode>
                    value={behaviorDraft.responseMode}
                    options={[
                      { value: "text", label: "Sempre texto", description: "Responde por texto", help: "Mesmo se o lead mandar audio, o agente responde em texto." },
                      { value: "audio", label: "Sempre audio", description: "Prefere audio", help: "O agente gera audio com a voz selecionada sempre que possivel." },
                      { value: "mirror", label: "Espelho", description: "Segue o lead", help: "Se o lead mandar audio, responde em audio; se mandar texto, responde em texto." },
                    ]}
                    onChange={(value) => updateBehavior("responseMode", value)}
                  />
                </BehaviorSection>

                <BehaviorSection title="Rapport adaptativo" description="Controla quanto a IA adapta linguagem, formalidade e tom ao perfil do lead." defaultOpen>
                  <ModeSelector<WhatsappRapportMode>
                    value={behaviorDraft.adaptiveRapportMode}
                    options={[
                      { value: "off", label: "Desligado", description: "Usa o prompt", help: "Mantem exatamente o tom definido no prompt do agente." },
                      { value: "soft", label: "Suave", description: "Adapta leve", help: "Ajusta pequenas escolhas de linguagem sem mudar o estilo principal." },
                      { value: "strong", label: "Forte", description: "Adapta mais", help: "Adapta com mais forca a linguagem do lead quando fizer sentido." },
                    ]}
                    onChange={(value) => updateBehavior("adaptiveRapportMode", value)}
                  />
                </BehaviorSection>
              </div>

              <BehaviorSection title="Seguranca e testes" description="Protecoes para evitar atendimento indevido, loops e conflitos com humanos." defaultOpen>
                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                  <ToggleTile icon={ShieldCheck} label="Intervencao humana" description="Pausa a IA quando um humano assume a conversa ou quando o lead pede atendimento humano." checked={behaviorDraft.humanIntervention} onChange={() => updateBehavior("humanIntervention", !behaviorDraft.humanIntervention)} />
                  <ToggleTile icon={Bot} label="Protecao bots/loops" description="Evita conversas infinitas quando outro bot ou automacao responder o agente." checked={behaviorDraft.botLoopProtection} onChange={() => updateBehavior("botLoopProtection", !behaviorDraft.botLoopProtection)} />
                  <ToggleTile icon={UserRound} label="Teste entre instancias" description="Permite testar mensagens entre numeros internos sem bloquear a automacao." checked={behaviorDraft.allowInternalInstanceMessages} onChange={() => updateBehavior("allowInternalInstanceMessages", !behaviorDraft.allowInternalInstanceMessages)} />
                  <ToggleTile icon={Clock3} label="Janela da IA ativa" description="Faz o agente responder apenas dentro do horario configurado na Janela da IA." checked={behaviorDraft.aiScheduleEnabled} onChange={() => updateBehavior("aiScheduleEnabled", !behaviorDraft.aiScheduleEnabled)} />
                </div>
              </BehaviorSection>

              <BehaviorSection title="Cenarios especiais do lead" description="Eventos que a IA deve reconhecer para alimentar CRM, memoria e proximos passos.">
                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                  <ToggleTile icon={UserRound} label="Pedido de humano" description="Identifica quando o lead pede vendedor, atendente ou suporte humano." checked={behaviorDraft.detectHumanRequest} onChange={() => updateBehavior("detectHumanRequest", !behaviorDraft.detectHumanRequest)} />
                  <ToggleTile icon={Clock3} label="Cancelar/remarcar" description="Reconhece pedidos de cancelamento, reagendamento ou mudanca de horario." checked={behaviorDraft.detectRescheduleCancel} onChange={() => updateBehavior("detectRescheduleCancel", !behaviorDraft.detectRescheduleCancel)} />
                  <ToggleTile icon={MessageSquare} label="Captacao" description="Detecta quando o lead quer cadastrar, vender ou oferecer um imovel/produto." checked={behaviorDraft.detectPropertyCapture} onChange={() => updateBehavior("detectPropertyCapture", !behaviorDraft.detectPropertyCapture)} />
                  <ToggleTile icon={Globe2} label="Localizacao" description="Registra localizacao enviada pelo lead para enriquecer atendimento e CRM." checked={behaviorDraft.detectLocation} onChange={() => updateBehavior("detectLocation", !behaviorDraft.detectLocation)} />
                  <ToggleTile icon={ShieldCheck} label="Opt-out" description="Detecta quando o lead pede para parar contato ou sair da lista." checked={behaviorDraft.detectOptOut} onChange={() => updateBehavior("detectOptOut", !behaviorDraft.detectOptOut)} />
                  <ToggleTile icon={Link2} label="Links do lead" description="Analisa links enviados pelo lead e guarda contexto util para atendimento." checked={behaviorDraft.analyzeLinks} onChange={() => updateBehavior("analyzeLinks", !behaviorDraft.analyzeLinks)} />
                  <ToggleTile icon={MessageCircle} label="Resposta citada" description="Usa a mensagem citada no WhatsApp para entender melhor a resposta do lead." checked={behaviorDraft.quotedReplyContext} onChange={() => updateBehavior("quotedReplyContext", !behaviorDraft.quotedReplyContext)} />
                  <ToggleTile icon={FileText} label="Salvar midia" description="Salva arquivos relevantes recebidos para historico, CRM e memoria da empresa." checked={behaviorDraft.leadFileStorage} onChange={() => updateBehavior("leadFileStorage", !behaviorDraft.leadFileStorage)} />
                </div>
              </BehaviorSection>

              <BehaviorSection title="Audio e midia com IA" description="Define quais tipos de midia a IA pode interpretar antes de responder o lead.">
                <div className="grid gap-3 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                  <div className="grid gap-2 md:grid-cols-2">
                    <ToggleTile icon={Mic} label="Transcrever audio" description="Converte audios recebidos em texto para a IA entender antes de responder." checked={behaviorDraft.audioTranscription} onChange={() => updateBehavior("audioTranscription", !behaviorDraft.audioTranscription)} />
                    <ToggleTile icon={ImageIcon} label="Analisar imagens" description="Permite que a IA leia imagens enviadas pelo lead e use esse contexto." checked={behaviorDraft.mediaImage} onChange={() => updateBehavior("mediaImage", !behaviorDraft.mediaImage)} />
                    <ToggleTile icon={FileText} label="Analisar documentos" description="Permite interpretar documentos recebidos quando forem relevantes para o atendimento." checked={behaviorDraft.mediaDocument} onChange={() => updateBehavior("mediaDocument", !behaviorDraft.mediaDocument)} />
                    <ToggleTile icon={Video} label="Analisar videos" description="Permite analisar videos enviados, respeitando os limites de lote configurados." checked={behaviorDraft.mediaVideo} onChange={() => updateBehavior("mediaVideo", !behaviorDraft.mediaVideo)} />
                  </div>
                  <div className="grid gap-2 md:grid-cols-3">
                    <NumberField label="Imagens" description="Maximo de imagens analisadas quando o lead envia varias midias juntas." value={behaviorDraft.mediaBatchImageLimit} min={1} max={20} onChange={(value) => updateBehavior("mediaBatchImageLimit", value)} />
                    <NumberField label="Videos" description="Maximo de videos analisados em um mesmo lote de mensagens." value={behaviorDraft.mediaBatchVideoLimit} min={1} max={5} onChange={(value) => updateBehavior("mediaBatchVideoLimit", value)} />
                    <NumberField label="Documentos" description="Maximo de documentos analisados em um mesmo lote de mensagens." value={behaviorDraft.mediaBatchDocumentLimit} min={1} max={8} onChange={(value) => updateBehavior("mediaBatchDocumentLimit", value)} />
                  </div>
                </div>
              </BehaviorSection>

              <BehaviorSection title="Temporizadores" description="Define pausas antes de responder, para evitar respostas instantaneas demais ou fora de contexto.">
                <div className="grid gap-3">
                  <ToggleTile icon={Timer} label="Temporizacao inteligente" description="Ajusta o tempo de resposta conforme o tipo e a quantidade de mensagens recebidas." checked={behaviorDraft.smartTiming} onChange={() => updateBehavior("smartTiming", !behaviorDraft.smartTiming)} />
                  <div className="grid gap-2 md:grid-cols-3 2xl:grid-cols-4">
                    <NumberField label="So texto" description="Segundos de espera quando chega apenas uma mensagem de texto." value={behaviorDraft.timingTextSeconds} min={2} max={60} onChange={(value) => updateBehavior("timingTextSeconds", value)} />
                    <NumberField label="Textos seguidos" description="Espera quando o lead manda varias mensagens de texto em sequencia." value={behaviorDraft.timingTextBurstSeconds} min={3} max={90} onChange={(value) => updateBehavior("timingTextBurstSeconds", value)} />
                    <NumberField label="Foto legenda" description="Espera antes de responder foto com legenda." value={behaviorDraft.timingMediaCaptionSeconds} min={5} max={120} onChange={(value) => updateBehavior("timingMediaCaptionSeconds", value)} />
                    <NumberField label="Foto + texto" description="Espera quando o lead manda foto e depois texto." value={behaviorDraft.timingMediaThenTextSeconds} min={5} max={120} onChange={(value) => updateBehavior("timingMediaThenTextSeconds", value)} />
                    <NumberField label="Foto so" description="Espera para analisar e responder imagem sem texto." value={behaviorDraft.timingMediaOnlySeconds} min={5} max={120} onChange={(value) => updateBehavior("timingMediaOnlySeconds", value)} />
                    <NumberField label="Audio" description="Espera antes de responder quando chega audio isolado." value={behaviorDraft.timingAudioSeconds} min={5} max={120} onChange={(value) => updateBehavior("timingAudioSeconds", value)} />
                    <NumberField label="Audio + texto" description="Espera quando o lead envia audio e complementa com texto." value={behaviorDraft.timingAudioThenTextSeconds} min={5} max={120} onChange={(value) => updateBehavior("timingAudioThenTextSeconds", value)} />
                    <NumberField label="Video legenda" description="Espera antes de responder video com legenda." value={behaviorDraft.timingVideoCaptionSeconds} min={8} max={180} onChange={(value) => updateBehavior("timingVideoCaptionSeconds", value)} />
                    <NumberField label="So video" description="Espera para processar video sem texto." value={behaviorDraft.timingVideoOnlySeconds} min={8} max={180} onChange={(value) => updateBehavior("timingVideoOnlySeconds", value)} />
                    <NumberField label="Doc. + texto" description="Espera quando chegam documento e texto juntos." value={behaviorDraft.timingDocumentCaptionSeconds} min={8} max={180} onChange={(value) => updateBehavior("timingDocumentCaptionSeconds", value)} />
                    <NumberField label="So documento" description="Espera para processar documento sem mensagem complementar." value={behaviorDraft.timingDocumentOnlySeconds} min={8} max={180} onChange={(value) => updateBehavior("timingDocumentOnlySeconds", value)} />
                    <NumberField label="Antes botao" description="Espera antes de responder botoes ou chamadas de acao." value={behaviorDraft.timingButtonDelaySeconds} min={0} max={20} onChange={(value) => updateBehavior("timingButtonDelaySeconds", value)} />
                    <NumberField label="Fallback" description="Tempo minimo para agrupar mensagens antes de gerar resposta." value={behaviorDraft.debounceSeconds} min={5} max={120} onChange={(value) => updateBehavior("debounceSeconds", value)} />
                    <NumberField label="Reativar agente" description="Minutos ate a IA voltar depois de uma intervencao humana." value={behaviorDraft.humanInterventionMinutes} min={5} max={1440} onChange={(value) => updateBehavior("humanInterventionMinutes", value)} />
                  </div>
                </div>
              </BehaviorSection>

              <BehaviorSection title="Janela da IA" description="Horario em que o agente pode responder quando a opcao Janela da IA ativa estiver ligada.">
                <div className="grid gap-2 md:grid-cols-3">
                  <TextField label="Inicio" description="Horario em que a IA comeca a responder." value={behaviorDraft.aiScheduleStart} onChange={(value) => updateBehavior("aiScheduleStart", value)} />
                  <TextField label="Fim" description="Horario em que a IA para de responder." value={behaviorDraft.aiScheduleEnd} onChange={(value) => updateBehavior("aiScheduleEnd", value)} />
                  <TextField label="Fuso horario" description="Fuso usado para calcular a janela de atendimento." value={behaviorDraft.aiScheduleTimezone} onChange={(value) => updateBehavior("aiScheduleTimezone", value)} />
                </div>
              </BehaviorSection>
            </div>

            <BehaviorSummary behavior={behaviorDraft} promptChanged={promptChanged} behaviorChanged={behaviorChanged} />

            <div className="flex flex-wrap gap-2 2xl:col-start-2">
              <SecondaryAction
                icon={RefreshCcw}
                label="Restaurar salvo"
                description="Desfaz alteracoes ainda nao salvas nos controles de comportamento."
                disabled={!state || !settingsChanged}
                onClick={() => state && applyWhatsappState(state)}
              />
              <ActionButton
                icon={Wand2}
                label="Salvar comportamento"
                description="Grava os controles de atendimento, audio, midia, temporizadores e janela da IA."
                disabled={!state?.capability.schemaReady || !settingsChanged}
                loading={running === "save_settings"}
                onClick={saveAgentSettings}
              />
            </div>
          </div>
        </Panel>
      </div>
      ) : null}
      </>
      )}
    </>
  );
}

async function fetchWhatsappState(companyId?: string) {
  const query = companyId ? `?companyId=${encodeURIComponent(companyId)}` : "";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(`/api/dashboard/whatsapp${query}`, { cache: "no-store", signal: controller.signal });
    const data = (await response.json().catch(() => null)) as (WhatsappState & { error?: string }) | null;

    if (!response.ok || !data) {
      throw new Error(data?.error ?? "Nao foi possivel carregar o WhatsApp.");
    }

    return data;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("O WhatsApp demorou para carregar. Atualize a pagina ou tente novamente em alguns segundos.");
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function isBehaviorEqual(left: WhatsappBehaviorConfig, right: WhatsappBehaviorConfig) {
  return JSON.stringify(normalizeWhatsappBehaviorConfig(left)) === JSON.stringify(normalizeWhatsappBehaviorConfig(right));
}

function NoticeBar({ notice }: { notice: Notice }) {
  const colors = {
    success: "border-emerald-400/25 bg-emerald-400/10 text-emerald-200",
    warning: "border-amber-400/25 bg-amber-400/10 text-amber-200",
    error: "border-rose-400/25 bg-rose-400/10 text-rose-200",
  } satisfies Record<Notice["tone"], string>;

  return (
    <div className={cn("mb-5 rounded-xl border px-4 py-3 text-[13px] leading-5", colors[notice.tone])}>
      {notice.message}
    </div>
  );
}

function LoadingState() {
  return (
    <Panel title="WhatsApp" eyebrow="carregando">
      <div className="grid min-h-[240px] place-items-center text-cyan-300">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    </Panel>
  );
}

function CompanyRequiredState() {
  return (
    <Panel title="Nenhuma empresa cadastrada" eyebrow="primeiro passo">
      <div className="grid min-h-[280px] place-items-center text-center">
        <div className="max-w-sm">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-cyan-400/10 text-cyan-300">
            <Building2 className="h-7 w-7" />
          </div>
          <h2 className="mt-4 text-[16px] font-semibold" style={{ color: "var(--ch-text)" }}>Cadastre sua empresa</h2>
          <p className="mt-2 text-[13px] leading-6 text-slate-500">
            O WhatsApp fica bloqueado ate existir uma empresa cadastrada no painel.
          </p>
          <Link
            className="mt-5 inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-cyan-300 px-4 font-mono text-[10px] font-bold uppercase tracking-wide text-slate-950 transition hover:bg-cyan-200"
            href="/dashboard/empresa"
          >
            <Plus className="h-4 w-4" />
            Nova empresa
          </Link>
        </div>
      </div>
    </Panel>
  );
}

function AgentCreationGate({
  agentName,
  companies,
  creating,
  selectedCompany,
  selectedCompanyId,
  showForm,
  onAgentNameChange,
  onCancel,
  onCreate,
  onSelectCompany,
  onStart,
}: {
  agentName: string;
  companies: ClientCompany[];
  creating: boolean;
  selectedCompany: ClientCompany | null;
  selectedCompanyId: string;
  showForm: boolean;
  onAgentNameChange: (value: string) => void;
  onCancel: () => void;
  onCreate: () => void;
  onSelectCompany: (value: string) => void;
  onStart: () => void;
}) {
  return (
    <Panel
      title="Criar agente WhatsApp"
      eyebrow="empresa / agente"
      action={<NeonBadge tone="cyan">novo fluxo</NeonBadge>}
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(360px,0.7fr)]">
        <div
          className="rounded-xl p-5"
          style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)" }}
        >
          <div className="flex items-start gap-3">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-cyan-400/10 text-cyan-300">
              <Bot className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-[16px] font-semibold" style={{ color: "var(--ch-text)" }}>Nenhum agente criado</h2>
              <p className="mt-2 text-[13px] leading-6 text-slate-500">
                Escolha qual empresa este agente vai atender antes de liberar conexao, prompt e comportamento.
              </p>
            </div>
          </div>

          {selectedCompany ? (
            <div className="mt-5 max-w-md">
              <InfoTile label="Empresa selecionada" value={selectedCompany.name} />
            </div>
          ) : null}

          {!showForm ? (
            <div className="mt-5">
              <ActionButton icon={Plus} label="Criar agente" onClick={onStart} />
            </div>
          ) : null}
        </div>

        {showForm ? (
          <div
            className="rounded-xl p-5"
            style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)" }}
          >
            <div className="grid gap-3">
              <label className="block">
                <span className="mb-1.5 block font-mono text-[9px] uppercase tracking-widest text-slate-500">Empresa</span>
                <select
                  className="h-11 w-full rounded-lg border px-3 text-[13px] outline-none"
                  value={selectedCompanyId}
                  onChange={(event) => onSelectCompany(event.target.value)}
                >
                  {companies.map((company) => (
                    <option key={company.id} value={company.id}>
                      {company.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block font-mono text-[9px] uppercase tracking-widest text-slate-500">Nome do agente</span>
                <input
                  className="h-11 w-full rounded-lg border px-3 text-[13px] outline-none"
                  placeholder="Ex: Agente comercial"
                  value={agentName}
                  onChange={(event) => onAgentNameChange(event.target.value)}
                />
              </label>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <SecondaryAction icon={RefreshCcw} label="Cancelar" disabled={creating} onClick={onCancel} />
              <ActionButton icon={Wand2} label="Salvar agente" disabled={creating || !selectedCompanyId} loading={creating} onClick={onCreate} />
            </div>
          </div>
        ) : (
          <div
            className="grid min-h-[220px] place-items-center rounded-xl p-5 text-center"
            style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)" }}
          >
            <div className="max-w-xs">
              <Building2 className="mx-auto h-7 w-7 text-cyan-300" />
              <p className="mt-3 text-[13px] leading-6 text-slate-500">
                Depois que o agente for criado, esta tela abre os controles de WhatsApp.
              </p>
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
}

function AgentIdentityCard({
  agent,
  instance,
}: {
  agent: NonNullable<WhatsappState["agent"]>;
  instance: WhatsappState["instance"];
}) {
  const avatarUrl = agent.avatarUrl ?? instance?.profileImageUrl ?? null;
  const avatarAlt = agent.avatarAlt ?? `Foto de ${agent.name}`;
  const whatsappLabel = instance?.displayName ?? formatPhone(instance?.phoneNumber);

  return (
    <div
      className="grid gap-3 rounded-xl border p-3 sm:grid-cols-[auto_1fr]"
      style={{ background: "var(--ch-surface-2)", borderColor: "var(--ch-border)" }}
    >
      <WhatsappAvatar alt={avatarAlt} fallback={agent.name} imageUrl={avatarUrl} size="lg" />
      <div className="grid gap-2 sm:grid-cols-3">
        <InfoTile label="Agente" value={agent.name} />
        <InfoTile label="WhatsApp" value={whatsappLabel} />
        <InfoTile label="Ultima edicao" value={formatDate(agent.updatedAt)} />
      </div>
    </div>
  );
}

function WhatsappAvatar({
  alt,
  fallback,
  imageUrl,
  size = "md",
}: {
  alt: string;
  fallback: string;
  imageUrl: string | null;
  size?: "md" | "lg";
}) {
  const dimension = size === "lg" ? "h-14 w-14" : "h-10 w-10";

  return (
    <div
      className={cn("relative grid shrink-0 place-items-center overflow-hidden rounded-2xl border bg-cyan-400/10 text-cyan-200", dimension)}
      style={{ borderColor: "var(--ch-border)" }}
      title={imageUrl ? "Foto do WhatsApp conectado" : "Foto aparece quando o WhatsApp estiver conectado"}
    >
      {imageUrl ? (
        <Image
          alt={alt}
          className="object-cover"
          fill
          sizes={size === "lg" ? "56px" : "40px"}
          src={imageUrl}
          unoptimized
        />
      ) : (
        <span className="font-mono text-[12px] font-bold uppercase tracking-widest">{getInitials(fallback)}</span>
      )}
    </div>
  );
}

function InfoHint({ text }: { text: string }) {
  return (
    <span
      aria-label={text}
      className="group/help relative inline-flex shrink-0 items-center align-middle"
      title={text}
    >
      <CircleHelp className="h-3.5 w-3.5 text-current opacity-70 transition group-hover/help:opacity-100" />
      <span
        className="pointer-events-none absolute right-0 top-5 z-50 hidden w-64 max-w-[calc(100vw-3rem)] rounded-lg border px-3 py-2 text-left font-sans text-[11px] normal-case leading-5 tracking-normal text-slate-200 shadow-2xl group-hover/help:block"
        style={{ background: "var(--ch-surface)", borderColor: "var(--ch-border)" }}
      >
        {text}
      </span>
    </span>
  );
}

function PromptBox({
  label,
  description,
  value,
  helper,
  onChange,
}: {
  label: string;
  description?: string;
  value: string;
  helper: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-2 flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-widest text-slate-500">
        {label}
        {description ? <InfoHint text={description} /> : null}
      </span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-[430px] w-full resize-y rounded-xl border px-4 py-3 font-mono text-[12px] leading-5 outline-none"
        placeholder="Defina o comportamento do agente."
      />
      <span className="mt-2 block font-mono text-[10px] uppercase tracking-widest text-slate-500">{helper}</span>
    </label>
  );
}

function NoAgentState() {
  return (
    <div className="grid min-h-[430px] place-items-center rounded-xl border p-6 text-center" style={{ background: "var(--ch-surface-2)", borderColor: "var(--ch-border)" }}>
      <div className="max-w-sm">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-cyan-400/10 text-cyan-300">
          <Bot className="h-7 w-7" />
        </div>
        <h2 className="mt-4 text-[16px] font-semibold" style={{ color: "var(--ch-text)" }}>Nenhum agente cadastrado</h2>
        <p className="mt-2 text-[13px] leading-6 text-slate-500">
          Crie um agente e escolha a empresa que ele vai atender.
        </p>
        <Link
          className="mt-5 inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-cyan-300 px-4 font-mono text-[10px] font-bold uppercase tracking-wide text-slate-950 transition hover:bg-cyan-200"
          href="/dashboard/agentes"
        >
          <Wand2 className="h-4 w-4" />
          Criar agente
        </Link>
      </div>
    </div>
  );
}

function BehaviorSection({
  title,
  description,
  defaultOpen = false,
  children,
}: {
  title: string;
  description?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details
      className="group rounded-xl border"
      open={defaultOpen}
      style={{ background: "var(--ch-surface-2)", borderColor: "var(--ch-border)" }}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
        <span className="flex min-w-0 items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--ch-text)" }}>
          {title}
          {description ? <InfoHint text={description} /> : null}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-widest text-slate-500 group-open:hidden">abrir</span>
        <span className="hidden font-mono text-[10px] uppercase tracking-widest text-cyan-300 group-open:inline">fechar</span>
      </summary>
      <div className="border-t px-4 py-4" style={{ borderColor: "var(--ch-border)" }}>
        {children}
      </div>
    </details>
  );
}

function ToggleTile({
  icon: Icon,
  label,
  description,
  checked,
  onChange,
}: {
  icon: LucideIcon;
  label: string;
  description?: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      className="flex min-h-11 items-center justify-between gap-3 rounded-lg border px-3 text-left transition hover:border-cyan-300/35"
      style={{ background: "var(--ch-surface)", borderColor: "var(--ch-border)" }}
    >
      <span className="flex min-w-0 items-center gap-2">
        <Icon className={cn("h-4 w-4 shrink-0", checked ? "text-cyan-300" : "text-slate-500")} />
        <span className="min-w-0 text-[12px] font-semibold leading-4" style={{ color: "var(--ch-text)" }}>{label}</span>
        {description ? <InfoHint text={description} /> : null}
      </span>
      <span className={cn("relative h-5 w-9 shrink-0 rounded-full transition", checked ? "bg-emerald-400" : "bg-slate-700")}>
        <span className={cn("absolute top-1 h-3 w-3 rounded-full bg-white transition", checked ? "left-5" : "left-1")} />
      </span>
    </button>
  );
}

function ModeSelector<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<{ value: T; label: string; description: string; help?: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="grid gap-2 md:grid-cols-3">
      {options.map((option) => {
        const active = option.value === value;

        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={cn(
              "min-h-16 rounded-lg border px-3 py-2 text-left transition",
              active ? "border-cyan-300/50 bg-cyan-400/10" : "border-slate-700/70 bg-slate-950/20 hover:border-cyan-300/35",
            )}
          >
            <span className="flex items-center gap-1.5 text-[12px] font-semibold" style={{ color: "var(--ch-text)" }}>
              {option.label}
              {option.help ? <InfoHint text={option.help} /> : null}
            </span>
            <span className="mt-1 block text-[11px] text-slate-500">{option.description}</span>
          </button>
        );
      })}
    </div>
  );
}

function VoiceSelector({
  behavior,
  companyId,
  defaultVoiceId,
  errorMessage,
  voices,
  onCloned,
  onSelect,
}: {
  behavior: WhatsappBehaviorConfig;
  companyId: string;
  defaultVoiceId: string | null;
  errorMessage: string | null;
  voices: AudioVoiceOption[];
  onCloned: (audio: WhatsappState["audio"], voiceId: string, notice?: Notice) => void;
  onSelect: (voice: AudioVoiceOption) => void;
}) {
  const [voiceSearch, setVoiceSearch] = useState("");
  const [cloneOpen, setCloneOpen] = useState(false);
  const [cloneName, setCloneName] = useState("");
  const [cloneFiles, setCloneFiles] = useState<File[]>([]);
  const [cloneConsent, setCloneConsent] = useState(false);
  const [removeNoise, setRemoveNoise] = useState(true);
  const [cloneSaving, setCloneSaving] = useState(false);
  const [cloneError, setCloneError] = useState<string | null>(null);
  const selectedVoiceId = behavior.audioVoiceId || defaultVoiceId || "";
  const selectedVoice = voices.find((voice) => voice.voiceId === selectedVoiceId) ?? voices[0] ?? null;
  const canClone = Boolean(companyId && cloneName.trim() && cloneFiles.length > 0 && cloneConsent && !cloneSaving);
  const visibleVoices = useMemo(() => {
    const search = normalizeVoiceSearch(voiceSearch);

    if (!search) {
      return voices;
    }

    return voices.filter((voice) => {
      const haystack = normalizeVoiceSearch([
        voice.name,
        voice.category,
        voice.status,
        voice.source,
        voice.language,
        voice.accent,
        voice.gender,
        voice.useCase,
        voice.isDefault ? "padrao" : "",
      ].filter(Boolean).join(" "));

      return haystack.includes(search);
    });
  }, [voiceSearch, voices]);

  async function submitVoiceClone() {
    if (!canClone) {
      return;
    }

    setCloneSaving(true);
    setCloneError(null);

    try {
      const payload = new FormData();
      payload.set("companyId", companyId);
      payload.set("name", cloneName);
      payload.set("consentAccepted", String(cloneConsent));
      payload.set("removeBackgroundNoise", String(removeNoise));

      for (const file of cloneFiles) {
        payload.append("files", file);
      }

      const response = await fetch("/api/dashboard/voices", {
        method: "POST",
        body: payload,
      });
      const data = (await response.json().catch(() => null)) as VoiceCloneResponse | null;

      if (!response.ok || !data?.audio || !data.voice?.voiceId) {
        throw new Error(data?.error ?? "Nao foi possivel clonar a voz.");
      }

      onCloned(data.audio, data.voice.voiceId, data.notice);
      setCloneOpen(false);
      setCloneName("");
      setCloneFiles([]);
      setCloneConsent(false);
      setRemoveNoise(true);
    } catch (error) {
      setCloneError(error instanceof Error ? error.message : "Erro inesperado ao clonar voz.");
    } finally {
      setCloneSaving(false);
    }
  }

  return (
    <div className="rounded-xl border p-3" style={{ background: "var(--ch-surface)", borderColor: "var(--ch-border)" }}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-widest text-slate-500">
            Voz do agente
            <InfoHint text="A voz selecionada sera usada nas respostas em audio do agente." />
          </p>
          <p className="mt-1 text-[13px] font-semibold" style={{ color: "var(--ch-text)" }}>
            {selectedVoice?.name ?? "Nenhuma voz disponivel"}
          </p>
          <p className="mt-1 font-mono text-[9px] uppercase tracking-widest text-slate-500">
            {voices.length.toLocaleString("pt-BR")} vozes liberadas
          </p>
        </div>
        <NeonBadge tone={behavior.responseMode === "audio" ? "green" : "amber"}>
          {behavior.responseMode === "audio" ? "audio ativo" : "texto ativo"}
        </NeonBadge>
      </div>

      {errorMessage ? (
        <div className="mt-3 rounded-lg border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-[12px] leading-5 text-amber-100">
          {errorMessage}
        </div>
      ) : null}

      <div className="mt-3 rounded-lg border" style={{ borderColor: "var(--ch-border)" }}>
        <button
          type="button"
          className="flex min-h-11 w-full items-center justify-between gap-3 px-3 py-2 text-left"
          onClick={() => setCloneOpen((current) => !current)}
        >
          <span className="flex items-center gap-2">
            <Mic className="h-4 w-4 text-cyan-300" />
            <span>
              <span className="flex items-center gap-1.5 text-[12px] font-semibold" style={{ color: "var(--ch-text)" }}>
                Clonar minha voz
                <InfoHint text="Cria uma voz propria na ElevenLabs usando audios enviados pelo usuario com consentimento." />
              </span>
              <span className="block text-[11px] text-slate-500">Instant Voice Clone com consentimento do usuario.</span>
            </span>
          </span>
          <span className="font-mono text-[9px] uppercase tracking-widest text-cyan-200">{cloneOpen ? "fechar" : "abrir"}</span>
        </button>

        {cloneOpen ? (
          <div className="border-t p-3" style={{ borderColor: "var(--ch-border)" }}>
            <div className="grid gap-3 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
              <label className="block">
                <span className="mb-1.5 block font-mono text-[9px] uppercase tracking-widest text-slate-500">Nome da voz</span>
                <input
                  value={cloneName}
                  onChange={(event) => setCloneName(event.target.value)}
                  placeholder="Minha voz comercial"
                  className="h-10 w-full rounded-lg border px-3 text-[12px] outline-none"
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block font-mono text-[9px] uppercase tracking-widest text-slate-500">Audios de amostra</span>
                <input
                  accept="audio/*,.aac,.m4a,.mp3,.oga,.ogg,.opus,.wav,.webm"
                  className="block w-full rounded-lg border px-3 py-2 text-[12px] file:mr-3 file:rounded-md file:border-0 file:bg-cyan-300/15 file:px-3 file:py-1.5 file:text-[11px] file:font-semibold file:text-cyan-100"
                  multiple
                  onChange={(event) => setCloneFiles(Array.from(event.target.files ?? []))}
                  type="file"
                />
              </label>
            </div>

            {cloneFiles.length > 0 ? (
              <div className="mt-3 grid gap-2">
                {cloneFiles.map((file) => (
                  <div
                    key={`${file.name}-${file.size}-${file.lastModified}`}
                    className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-[11px]"
                    style={{ borderColor: "var(--ch-border)" }}
                  >
                    <span className="min-w-0 truncate text-slate-300">{file.name}</span>
                    <span className="shrink-0 font-mono text-[10px] uppercase tracking-widest text-slate-500">{formatBytes(file.size)}</span>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="mt-3 grid gap-2 md:grid-cols-2">
              <label className="flex min-h-11 items-center gap-3 rounded-lg border px-3 py-2 text-[12px]" style={{ borderColor: "var(--ch-border)" }}>
                <input
                  checked={removeNoise}
                  onChange={(event) => setRemoveNoise(event.target.checked)}
                  type="checkbox"
                />
                <span className="flex items-center gap-1.5">
                  Remover ruido das amostras
                  <InfoHint text="Limpa ruidos de fundo antes de enviar as amostras para clonagem." />
                </span>
              </label>
              <label className="flex min-h-11 items-start gap-3 rounded-lg border px-3 py-2 text-[12px] leading-5" style={{ borderColor: "var(--ch-border)" }}>
                <input
                  checked={cloneConsent}
                  className="mt-1"
                  onChange={(event) => setCloneConsent(event.target.checked)}
                  type="checkbox"
                />
                <span className="flex items-start gap-1.5">
                  Confirmo que tenho direito e consentimento para clonar esta voz.
                  <InfoHint text="A clonagem so deve ser feita com autorizacao da pessoa dona da voz." />
                </span>
              </label>
            </div>

            {cloneError ? (
              <div className="mt-3 rounded-lg border border-rose-300/20 bg-rose-300/10 px-3 py-2 text-[12px] leading-5 text-rose-100">
                {cloneError}
              </div>
            ) : null}

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-cyan-300 px-4 font-mono text-[10px] font-bold uppercase tracking-widest text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!canClone}
                onClick={submitVoiceClone}
              >
                {cloneSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Criar voz
              </button>
              <button
                type="button"
                className="inline-flex h-10 items-center gap-2 rounded-lg border px-4 font-mono text-[10px] font-bold uppercase tracking-widest text-slate-400"
                onClick={() => {
                  setCloneOpen(false);
                  setCloneError(null);
                }}
              >
                <X className="h-4 w-4" />
                Cancelar
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {voices.length > 0 ? (
        <>
          <label className="mt-3 block">
            <span className="mb-1.5 block font-mono text-[9px] uppercase tracking-widest text-slate-500">Buscar voz</span>
            <input
              value={voiceSearch}
              onChange={(event) => setVoiceSearch(event.target.value)}
              placeholder="Nome, categoria ou tipo de voz"
              className="h-10 w-full rounded-lg border px-3 text-[12px] outline-none"
            />
          </label>

          <div className="mt-3 max-h-[380px] overflow-y-auto rounded-lg border" style={{ borderColor: "var(--ch-border)" }}>
            <div className="divide-y" style={{ borderColor: "var(--ch-border)" }}>
            {visibleVoices.map((voice) => {
              const active = voice.voiceId === selectedVoiceId;

              return (
                <button
                  key={voice.voiceId}
                  type="button"
                  onClick={() => onSelect(voice)}
                  className={cn(
                    "grid min-h-12 w-full grid-cols-[1fr_auto] items-center gap-3 px-3 py-2 text-left transition",
                    active ? "bg-cyan-400/10" : "bg-slate-950/20 hover:bg-cyan-400/5",
                  )}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <Volume2 className={cn("h-3.5 w-3.5 shrink-0", active ? "text-cyan-300" : "text-slate-500")} />
                    <span className="min-w-0">
                      <span className="block truncate text-[12px] font-semibold" style={{ color: "var(--ch-text)" }}>{voice.name}</span>
                      <span className="mt-0.5 block truncate font-mono text-[9px] uppercase tracking-widest text-slate-500">
                        {formatVoiceDetails(voice)}
                      </span>
                    </span>
                  </span>
                  <span className={cn("rounded-md px-2 py-1 font-mono text-[8px] uppercase tracking-widest", active ? "bg-cyan-300/15 text-cyan-200" : "bg-slate-800/80 text-slate-400")}>
                    {formatVoiceSource(voice)}
                  </span>
                </button>
              );
            })}
            </div>
          </div>

          {visibleVoices.length === 0 ? (
            <div className="mt-3 rounded-lg border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-[12px] leading-5 text-amber-100">
              Nenhuma voz encontrada para esta busca.
            </div>
          ) : null}

          {selectedVoice?.previewUrl ? (
            <div className="mt-3 rounded-lg border px-3 py-2" style={{ borderColor: "var(--ch-border)" }}>
              <audio className="h-9 w-full" controls preload="none" src={selectedVoice.previewUrl} />
            </div>
          ) : null}
        </>
      ) : (
        <div className="mt-3 rounded-lg border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-[12px] leading-5 text-amber-100">
          {errorMessage ?? "Nenhuma voz ElevenLabs disponivel."}
        </div>
      )}
    </div>
  );
}

function NumberField({
  label,
  description,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  description?: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  const nextValue = (delta: number) => onChange(Math.min(max, Math.max(min, value + delta)));

  return (
    <div className="rounded-lg border px-2 py-2" style={{ background: "var(--ch-surface)", borderColor: "var(--ch-border)" }}>
      <span className="flex items-center gap-1.5 text-[11px] font-semibold leading-4" style={{ color: "var(--ch-text)" }}>
        {label}
        {description ? <InfoHint text={description} /> : null}
      </span>
      <div className="mt-2 grid grid-cols-[28px_1fr_28px] items-center gap-1">
        <button type="button" className="h-7 rounded-md border text-slate-300" onClick={() => nextValue(-1)}>-</button>
        <input
          value={value}
          onChange={(event) => onChange(Number(event.target.value) || min)}
          className="h-7 rounded-md border bg-transparent px-2 text-center font-mono text-[12px] outline-none"
          type="number"
          min={min}
          max={max}
        />
        <button type="button" className="h-7 rounded-md border text-slate-300" onClick={() => nextValue(1)}>+</button>
      </div>
    </div>
  );
}

function TextField({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description?: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-widest text-slate-500">
        {label}
        {description ? <InfoHint text={description} /> : null}
      </span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-lg border px-3 font-mono text-[12px] outline-none"
      />
    </label>
  );
}

function BehaviorSummary({
  behavior,
  promptChanged,
  behaviorChanged,
}: {
  behavior: WhatsappBehaviorConfig;
  promptChanged: boolean;
  behaviorChanged: boolean;
}) {
  const activeScenarios = [
    behavior.detectHumanRequest,
    behavior.detectRescheduleCancel,
    behavior.detectPropertyCapture,
    behavior.detectLocation,
    behavior.detectOptOut,
    behavior.analyzeLinks,
    behavior.quotedReplyContext,
    behavior.leadFileStorage,
  ].filter(Boolean).length;

  const activeMedia = [behavior.audioTranscription, behavior.mediaImage, behavior.mediaDocument, behavior.mediaVideo].filter(Boolean).length;

  return (
    <div className="rounded-xl border p-4" style={{ background: "var(--ch-surface-2)", borderColor: "var(--ch-border)" }}>
      <p className="font-mono text-[9px] uppercase tracking-widest text-slate-500">Resumo</p>
      <div className="mt-4 space-y-3">
        <PromptCheck label="Agente ativo" active={behavior.agentEnabled} />
        <PromptCheck label={`${activeScenarios}/8 cenarios ativos`} active={activeScenarios >= 4} />
        <PromptCheck label={`${activeMedia}/4 midias ativas`} active={activeMedia >= 2} />
        <PromptCheck label="Intervencao humana" active={behavior.humanIntervention} />
        <PromptCheck label="Temporizacao inteligente" active={behavior.smartTiming} />
      </div>
      <div className="mt-4 grid gap-2">
        <InfoTile label="Conversa" value={formatResponseMode(behavior.responseMode)} />
        <InfoTile label="Rapport" value={formatRapportMode(behavior.adaptiveRapportMode)} />
        <InfoTile label="Alteracoes" value={promptChanged || behaviorChanged ? "Pendentes" : "Salvo"} />
      </div>
    </div>
  );
}

function PromptCheck({ label, active }: { label: string; active: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <CheckCircle2 className={cn("h-4 w-4", active ? "text-emerald-300" : "text-slate-500")} />
      <span className={cn("text-[12px]", active ? "text-slate-200" : "text-slate-500")}>{label}</span>
    </div>
  );
}

function formatResponseMode(value: WhatsappResponseMode) {
  if (value === "audio") return "Sempre audio";
  if (value === "mirror") return "Espelho";
  return "Sempre texto";
}

function formatVoiceSource(voice: AudioVoiceOption) {
  if (voice.isDefault) return "padrao";
  if (voice.source === "customer") return "voz propria";
  if (voice.source === "library") return "biblioteca";
  if (voice.category) return voice.category;
  return "biblioteca";
}

function formatVoiceDetails(voice: AudioVoiceOption) {
  return [voice.category, voice.language, voice.accent, voice.gender, voice.useCase].filter(Boolean).join(" / ") || "ElevenLabs";
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function normalizeVoiceSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function formatRapportMode(value: WhatsappRapportMode) {
  if (value === "strong") return "Forte";
  if (value === "soft") return "Suave";
  return "Desligado";
}

function CompactConnectionCard({
  instance,
  qrCode,
  running,
  onConnect,
  onDisconnect,
  onRefresh,
}: {
  instance: WhatsappState["instance"];
  qrCode: string | null;
  running: string | null;
  onConnect: () => void;
  onDisconnect: () => void;
  onRefresh: () => void;
}) {
  const status = instance?.status ?? "draft";
  const meta = getStatusMeta(status);
  const Icon = meta.icon;
  const profileImageUrl = instance?.profileImageUrl ?? null;
  const whatsappLabel = instance?.displayName ?? formatPhone(instance?.phoneNumber);

  return (
    <div
      className="rounded-xl border p-4"
      style={{ background: "var(--ch-surface-2)", borderColor: "var(--ch-border)" }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.18em] text-slate-500">
            Conexao WhatsApp
            <InfoHint text="Gera o QR Code para conectar o numero da empresa e mostra o status atual da instancia." />
          </p>
          <p className="mt-1 text-[14px] font-semibold" style={{ color: "var(--ch-text)" }}>
            {meta.title}
          </p>
        </div>
        {profileImageUrl ? (
          <WhatsappAvatar alt={`Foto do WhatsApp ${whatsappLabel}`} fallback={whatsappLabel} imageUrl={profileImageUrl} />
        ) : (
          <div className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-xl", meta.bg, meta.text)}>
            <Icon className="h-4 w-4" />
          </div>
        )}
      </div>

      <div
        className="mt-4 grid min-h-[170px] place-items-center rounded-xl p-3 text-center"
        style={{ background: "var(--ch-surface)", border: "1px solid var(--ch-border)" }}
      >
        {qrCode ? (
          <Image
            alt="QR Code para conectar o WhatsApp"
            className="rounded-lg border bg-white p-2"
            height={144}
            src={qrCode}
            unoptimized
            width={144}
          />
        ) : profileImageUrl ? (
          <div>
            <WhatsappAvatar alt={`Foto do WhatsApp ${whatsappLabel}`} fallback={whatsappLabel} imageUrl={profileImageUrl} size="lg" />
            <p className="mt-3 text-[13px] font-semibold" style={{ color: "var(--ch-text)" }}>
              {whatsappLabel}
            </p>
            <p className="mt-1 text-[11px] leading-4 text-slate-500">
              Foto sincronizada do WhatsApp
            </p>
          </div>
        ) : (
          <div>
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-cyan-500/10 text-cyan-300">
              <QrCode className="h-6 w-6" />
            </div>
            <p className="mt-2 text-[11px] leading-4 text-slate-500">
              QR aparece aqui
            </p>
          </div>
        )}
      </div>

      <div className="mt-3 grid gap-2">
        <InfoTile label="Status" value={meta.label} />
        <InfoTile label="Numero" value={formatPhone(instance?.phoneNumber)} />
        <InfoTile label="Leitura" value={formatDate(instance?.lastSyncedAt)} />
      </div>

      <p className="mt-3 text-[12px] leading-5 text-slate-500">
        {qrCode ? "Escaneie o QR Code pelo WhatsApp para concluir." : meta.description}
      </p>

      <div className="mt-4 grid gap-2">
        <ActionButton
          icon={QrCode}
          label={instance ? "Gerar novo QR" : "Gerar QR"}
          description="Abre um QR Code para conectar ou reconectar o numero pelo WhatsApp."
          loading={running === "connect"}
          onClick={onConnect}
        />
        <div className="flex flex-wrap gap-2">
          <SecondaryAction
            icon={RefreshCcw}
            label="Status"
            description="Consulta a Uazapi e atualiza conexao, numero, leitura e foto do WhatsApp."
            disabled={!instance}
            loading={running === "refresh_status"}
            onClick={onRefresh}
          />
          <SecondaryAction
            icon={Power}
            label="Desconectar"
            description="Encerra a sessao atual do WhatsApp conectado a esta empresa."
            disabled={!instance}
            loading={running === "disconnect"}
            tone="danger"
            onClick={onDisconnect}
          />
        </div>
      </div>
    </div>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg px-3 py-2" style={{ background: "var(--ch-surface)", border: "1px solid var(--ch-border)" }}>
      <p className="font-mono text-[9px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 break-words text-[12px] font-semibold leading-4" style={{ color: "var(--ch-text)" }}>{value}</p>
    </div>
  );
}

function ActionButton({
  icon: Icon,
  label,
  description,
  loading,
  disabled,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  description?: string;
  loading?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      onClick={onClick}
      className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-cyan-300 px-4 font-mono text-[10px] font-bold uppercase tracking-wide text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
      <span className="inline-flex items-center gap-1.5">
        {label}
        {description ? <InfoHint text={description} /> : null}
      </span>
    </button>
  );
}

function SecondaryAction({
  icon: Icon,
  label,
  description,
  loading,
  disabled,
  tone = "default",
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  description?: string;
  loading?: boolean;
  disabled?: boolean;
  tone?: "default" | "danger";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border px-3 font-mono text-[10px] font-semibold uppercase tracking-wide transition disabled:cursor-not-allowed disabled:opacity-50",
        tone === "danger" ? "border-rose-400/25 bg-rose-400/10 text-rose-200 hover:bg-rose-400/15" : "border-cyan-400/25 bg-cyan-400/10 text-cyan-200 hover:bg-cyan-400/15",
      )}
    >
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />}
      <span className="inline-flex items-center gap-1.5">
        {label}
        {description ? <InfoHint text={description} /> : null}
      </span>
    </button>
  );
}

function getStatusMeta(status: WhatsappStatus): {
  icon: LucideIcon;
  label: string;
  title: string;
  description: string;
  bg: string;
  text: string;
} {
  if (status === "connected") {
    return {
      icon: Smartphone,
      label: "conectado",
      title: "WhatsApp conectado",
      description: "O numero esta pronto para enviar testes e receber conversas.",
      bg: "bg-emerald-400/10",
      text: "text-emerald-300",
    };
  }

  if (status === "qr_pending") {
    return {
      icon: QrCode,
      label: "qr pendente",
      title: "Aguardando leitura",
      description: "Finalize a conexao lendo o QR Code pelo WhatsApp.",
      bg: "bg-amber-400/10",
      text: "text-amber-300",
    };
  }

  if (status === "blocked" || status === "error") {
    return {
      icon: Power,
      label: "erro",
      title: "Conexao com erro",
      description: "Tente reconectar o numero ou acione o suporte da plataforma.",
      bg: "bg-rose-400/10",
      text: "text-rose-300",
    };
  }

  return {
    icon: PlugZap,
    label: "nao conectado",
    title: "Nenhum WhatsApp ativo",
    description: "Inicie a conexao para parear o numero desta empresa.",
    bg: "bg-cyan-400/10",
    text: "text-cyan-300",
  };
}

function formatPhone(value: string | null | undefined) {
  if (!value) {
    return "Nao informado";
  }

  return value;
}

function getInitials(value: string) {
  const parts = value
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    return "WA";
  }

  return parts
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function formatDate(value: string | null | undefined) {
  if (!value) {
    return "Pendente";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Pendente";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
