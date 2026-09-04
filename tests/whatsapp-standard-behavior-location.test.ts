import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  formatOrganizationLocationAddress,
  formatOrganizationLocationServiceMode,
  hasOrganizationLocationCoordinates,
  normalizeOrganizationLocations,
} from "../src/lib/company-locations/shared";
import { normalizeWhatsappBehaviorConfig } from "../src/lib/whatsapp/agent-behavior";

const runtimeSource = readFileSync("src/lib/whatsapp/agent-runtime.ts", "utf8");
const behaviorSource = readFileSync("src/lib/whatsapp/agent-behavior.ts", "utf8");
const consoleSource = readFileSync("src/components/connectyhub-os/whatsapp-console.tsx", "utf8");
const salesCatalogConsoleSource = readFileSync("src/components/connectyhub-os/sales-catalog-console.tsx", "utf8");
const salesCatalogPageSource = readFileSync("src/app/dashboard/links/page.tsx", "utf8");
const salesCatalogRouteSource = readFileSync("src/app/api/dashboard/sales-catalog/route.ts", "utf8");
const globalsSource = readFileSync("src/app/globals.css", "utf8");
const migrationSource = readFileSync("supabase/migrations/0061_organization_locations.sql", "utf8");

function sourceBetween(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);

  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);

  return source.slice(startIndex, endIndex);
}

describe("WhatsApp standard behavior and company location", () => {
  it("normalizes company locations for dashboard storage and runtime use", () => {
    const locations = normalizeOrganizationLocations([
      {
        label: "Matriz",
        address: "Rua Teste, 100",
        cep: "01310930",
        city: "Sao Paulo",
        region: "SP",
        mapsUrl: "https://maps.google.com/?q=-23.55,-46.63",
        latitude: "-23,55",
        longitude: "-46.63",
        serviceMode: "warehouse_dispatch",
        isPrimary: false,
      },
      {
        label: "Unidade vazia",
      },
    ]);

    expect(locations).toHaveLength(1);
    expect(locations[0].isPrimary).toBe(true);
    expect(locations[0].cep).toBe("01310-930");
    expect(locations[0].latitude).toBe(-23.55);
    expect(hasOrganizationLocationCoordinates(locations[0])).toBe(true);
    expect(formatOrganizationLocationAddress(locations[0])).toContain("Rua Teste, 100");
    expect(formatOrganizationLocationServiceMode(locations[0].serviceMode)).toBe("galpao/despacho sem atendimento ao publico");
  });

  it("creates the Supabase table needed for organization locations", () => {
    expect(migrationSource).toContain("create table if not exists public.organization_locations");
    expect(migrationSource).toContain("organization_id uuid not null references public.organizations(id)");
    expect(migrationSource).toContain("idx_organization_locations_one_primary");
    expect(migrationSource).toContain("alter table public.organization_locations enable row level security");
  });

  it("forces critical behavior defaults for every active agent", () => {
    const standardizer = sourceBetween(
      behaviorSource,
      "function forceStandardBehaviorForActiveAgents",
      "export function mergeWhatsappHandoffNotificationSettings",
    );

    [
      "behavior.splitMessages = true",
      "behavior.humanizedLanguage = true",
      "behavior.timingJitter = true",
      "behavior.composingPause = true",
      "behavior.readReceiptDelay = true",
      "behavior.readReceiptMinSeconds = 3",
      "behavior.readReceiptMaxSeconds = 12",
      "behavior.emojiReactions = true",
      "behavior.spontaneousAudio = true",
      "behavior.spontaneousAudioProbability = 15",
      "behavior.mirrorTextFallbackProbability = 30",
      "behavior.circadianTiming = true",
      "behavior.naturalAudioFillers = true",
      "behavior.wpmTypingModel = true",
      "behavior.wpmSpeed = 45",
      "behavior.intentionalTypos = false",
      "behavior.midMessageCorrections = false",
      "behavior.correctionFrequency = 0",
      "behavior.reactionProbability = 40",
      "behavior.stickerProbability = 20",
      "behavior.botLoopProtection = true",
      "behavior.allowInternalInstanceMessages = false",
      "behavior.cloneRealTestMode = false",
      "behavior.turingBenchmark = false",
      "behavior.audioTranscription = true",
      "behavior.detectHumanRequest = true",
      "behavior.humanHandoffAiDetection = true",
      "behavior.detectRescheduleCancel = true",
      "behavior.detectPropertyCapture = true",
      "behavior.detectLocation = true",
      "behavior.detectOptOut = true",
      "behavior.analyzeLinks = true",
      "behavior.leadFileStorage = true",
      "behavior.mediaBurstGuard = true",
      "behavior.missingMediaCaptionGuard = true",
      "behavior.audioQualityGuard = true",
      "behavior.messageEditDeleteAwareness = true",
      "behavior.contactPollReactionHandling = true",
      "behavior.topicShiftDetection = true",
      "behavior.promptInjectionGuard = true",
      "behavior.sharedCompanyContext = true",
      "behavior.cloneMemory = true",
      "behavior.cloneConsistencyGuard = true",
      "behavior.mediaImage = true",
      "behavior.mediaDocument = true",
      "behavior.mediaVideo = true",
      "behavior.mediaProcessingAcknowledgement = true",
      "behavior.temporalAwareness = true",
      "behavior.conversationArcMemory = true",
      "behavior.negotiationTracking = true",
    ].forEach((line) => expect(standardizer).toContain(line));
  });

  it("keeps humanized delivery variation enabled for every active agent", () => {
    const behavior = normalizeWhatsappBehaviorConfig({
      agentEnabled: true,
      emojiReactions: false,
      reactionProbability: 0,
      responseMode: "mirror",
      spontaneousAudio: false,
      spontaneousAudioProbability: 0,
      mirrorTextFallbackProbability: 0,
    });

    expect(behavior.emojiReactions).toBe(true);
    expect(behavior.reactionProbability).toBe(40);
    expect(behavior.spontaneousAudio).toBe(true);
    expect(behavior.spontaneousAudioProbability).toBe(15);
    expect(behavior.mirrorTextFallbackProbability).toBe(30);
  });

  it("uses the local clock to prevent wrong period greetings", () => {
    const temporalInstruction = sourceBetween(
      runtimeSource,
      "function buildTemporalAwarenessInstruction",
      "function buildConversationArcInstruction",
    );
    const delivery = sourceBetween(
      runtimeSource,
      "async function sendAgentResponse",
      "type CompanyLocationReply",
    );
    const normalizer = sourceBetween(
      runtimeSource,
      "function normalizeTemporalGreetingInOutboundText",
      "function repairIncompleteAssistantEnding",
    );

    expect(temporalInstruction).toContain("resolveRuntimeLocalClock(behavior)");
    expect(temporalInstruction).toContain("Horario local de referencia");
    expect(temporalInstruction).toContain("Saudacao correta para este momento");
    expect(temporalInstruction).toContain("nao espelhe o erro");
    expect(temporalInstruction).toContain("Nunca aceite a saudacao do lead como fonte de horario");
    expect(delivery).toContain("normalizeTemporalGreetingInOutboundText(");
    expect(normalizer).toContain("resolveRuntimeLocalClock(behavior)");
    expect(normalizer).toContain("bom\\s+dia|boa\\s+tarde|boa\\s+noite");
    expect(normalizer).toContain("matchTemporalGreetingCase(greeting, clock.greeting)");
  });

  it("removes critical infrastructure toggles from the client behavior panel", () => {
    const behaviorPanel = sourceBetween(
      consoleSource,
      '{state?.agent && activeWhatsappTab === "behavior"',
      '{state?.agent && activeWhatsappTab === "channels"',
    );

    [
      "Transcrever audio",
      "Analisar imagens",
      "Analisar documentos",
      "Analisar videos",
      "Pedido de humano",
      "IA pedido humano",
      "Cancelar/remarcar",
      "Captacao",
      "Opt-out",
      "Links do lead",
      "Salvar midia",
      "Rastreamento de negociacao",
      "Protecoes de contexto",
      "Anti prompt injection",
      "Aprendizado continuo",
      "Memoria da empresa",
      "Memoria do clone",
      "Coerencia do clone",
      "Consciencia temporal",
      "Arco da conversa",
      "Dividir respostas",
      "Linguagem humanizada",
      "Variacao de timing",
      "Pausa ao digitar",
      "Delay ao visualizar",
      "Audio espontaneo",
      "Ritmo circadiano",
      "Preenchimento vocal",
      "Ritmo WPM",
      "Correcoes mid-message",
      "Chance reacao %",
      "Leitura min (s)",
      "Leitura max (s)",
      "Chance audio %",
      "Chance figurinha %",
      "Chance correcao %",
      "Protecao bots/loops",
      "Teste entre instancias",
      "Teste real do clone",
      "Turing benchmark",
    ].forEach((label) => expect(behaviorPanel).not.toContain(label));

    expect(behaviorPanel).not.toContain("Localizacao da empresa");
    expect(behaviorPanel).not.toContain("CompanyLocationsEditor");
    expect(behaviorPanel).not.toContain("Intervencao humana");
    expect(behaviorPanel).not.toContain("Avisar humano");
    expect(behaviorPanel).not.toContain("Cooldown aviso");
    expect(behaviorPanel).not.toContain("Numeros responsaveis");
    expect(behaviorPanel).not.toContain("O agente nao responde esses numeros como lead.");
    expect(behaviorPanel).not.toContain("Enviar teste");
    expect(behaviorPanel).toContain("Janela da IA ativa");
    expect(behaviorPanel).toContain("Reacoes emoji");
    expect(behaviorPanel).not.toContain("Erros intencionais");
    expect(behaviorPanel).toContain("Figurinhas");
    expect(behaviorPanel).toContain("Midia proativa");
    expect(behaviorPanel).toContain("Small talk");

    const aiWindowSection = sourceBetween(
      behaviorPanel,
      '<BehaviorSection title="Janela da IA"',
      "</BehaviorSection>",
    );

    expect(behaviorPanel).not.toContain('<BehaviorSection title="Seguranca e testes"');
    expect(aiWindowSection).toContain("Janela da IA ativa");
  });

  it("keeps company location maintenance inside the sales catalog delivery panel", () => {
    expect(salesCatalogPageSource).toContain("listOrganizationLocations");
    expect(salesCatalogPageSource).toContain("initialCompanyLocations");
    expect(salesCatalogConsoleSource).toContain("CompanyLocationPolicyEditor");
    expect(salesCatalogConsoleSource).toContain("Localizacao da empresa");
    expect(salesCatalogConsoleSource).toContain("Tipo de sede");
    expect(salesCatalogConsoleSource).toContain("Sem sede fixa");
    expect(salesCatalogConsoleSource).toContain("Salvar entrega, frete e localizacao");
    expect(salesCatalogConsoleSource).toContain("Localizacao da empresa obrigatoria");
    expect(salesCatalogConsoleSource).toContain("Obrigatorio: informe uma sede/base ou marque Sem sede fixa.");
    expect(salesCatalogConsoleSource).toContain("normalizeCompanyLocationDraftsForSave(companyLocationDrafts)");
    expect(salesCatalogRouteSource).toContain("replaceOrganizationLocations");
    expect(salesCatalogRouteSource).toContain("normalizedCompanyLocations.length === 0");
    expect(salesCatalogRouteSource).toContain("companyLocations");
  });

  it("keeps selected dashboard controls readable on dark accent backgrounds", () => {
    expect(globalsSource).toContain('[data-connecty-mode] [data-connecty-contrast="dark"].text-slate-950');
    expect(globalsSource).toContain("[data-connecty-mode] .connecty-dark-chip");
    expect(globalsSource).toContain("[data-connecty-mode] .connecty-dark-action");
    expect(globalsSource).toContain('[data-connecty-mode] [data-connecty-infohint="true"]');
    expect(globalsSource).toContain('[data-connecty-mode] [data-connecty-contrast="dark"] [data-connecty-infohint="true"]');
    expect(globalsSource).toContain("color: #0f172a !important;");
    expect(consoleSource).toContain('data-connecty-contrast={active ? "dark" : undefined}');
    expect(consoleSource).toContain('data-connecty-contrast="dark"');
    expect(consoleSource).toContain("TooltipContent");
    expect(consoleSource).toContain('collisionPadding={16}');
    expect(consoleSource).toContain("z-[1000]");
    expect(consoleSource).toContain('data-connecty-infohint="true"');
    expect(consoleSource).toContain("bg-white px-3 py-2 text-left font-sans text-[11px] normal-case leading-5 tracking-normal text-slate-950");
    expect(consoleSource).toContain("connecty-dark-action");
    expect(consoleSource).toContain("connecty-dark-chip");
    expect(consoleSource).toContain("disabled:opacity-70");
  });

  it("loads company locations into the agent and sends Maps as a button instead of a loose link or native pin", () => {
    const resolver = sourceBetween(
      runtimeSource,
      "function resolveCompanyLocationReply",
      "async function sendCompanyLocationReply",
    );
    const sender = sourceBetween(
      runtimeSource,
      "async function sendCompanyLocationReply",
      "function buildSingleCompanyLocationText",
    );

    expect(runtimeSource).toContain("listOrganizationLocations(client, run.organization_id)");
    expect(runtimeSource).toContain("buildOrganizationLocationLines(input.companyLocations)");
    expect(runtimeSource).toContain("resolveCompanyLocationMapUrl");
    expect(runtimeSource).toContain("formatOrganizationLocationServiceMode(location.serviceMode)");
    expect(runtimeSource).toContain("Se a localizacao estiver marcada como sem sede fixa");
    expect(runtimeSource).not.toContain('"/send/location"');
    expect(resolver).toContain('reason: "company_location_single"');
    expect(resolver).toContain('reason: "company_location_multiple"');
    expect(resolver).toContain("location: null");
    expect(sender).toContain("Abrir no Google Maps|${mapsUrl}");
    expect(sender).toContain("company_location_maps_");
    expect(sender).toContain("company_location_button_failed");
  });

  it("keeps replies as text when the lead explicitly asks not to receive audio", () => {
    const resolver = sourceBetween(
      runtimeSource,
      "function shouldSendAudioResponse",
      "function hasConfiguredAudioVoice",
    );

    expect(resolver).toContain("leadExplicitlyRequestsTextReply(latestInbound)");
    expect(resolver).toContain("return false");
    expect(resolver).toContain("me manda");
    expect(resolver).toContain("nao");
    expect(resolver).toContain("escutar");
    expect(resolver).toContain("sem");
    expect(resolver).toContain("audio");
    expect(resolver).toContain("digita");
  });

  it("allows mirror mode to vary delivery without ignoring explicit text requests", () => {
    const resolver = sourceBetween(
      runtimeSource,
      "function shouldSendAudioResponse",
      "function hasConfiguredAudioVoice",
    );

    expect(resolver).toContain("const mirrorInboundIsAudio = latestInbound ? isAudioMessage(latestInbound)");
    expect(resolver).toContain("shouldUseMirrorTextFallback(context, latestInbound)");
    expect(resolver).toContain("shouldUseSpontaneousMirrorAudio(context, latestInbound)");
    expect(resolver).toContain("leadExplicitlyRequestsTextReply(latestInbound)");
    expect(runtimeSource).toContain("stableHumanizationPercent");
    expect(runtimeSource).toContain("spontaneous_mirror_audio");
    expect(runtimeSource).toContain("mirror_text_fallback");
  });

  it("stops stale overlapping WhatsApp runs before sending more chunks", () => {
    const processBody = sourceBetween(
      runtimeSource,
      "export async function processWhatsappAgentRun",
      "async function loadRunContext",
    );
    const deliveryBody = sourceBetween(
      runtimeSource,
      "async function sendAgentResponse",
      "type CompanyLocationReply",
    );
    const staleGuard = sourceBetween(
      runtimeSource,
      "async function loadLatestInboundMessage",
      "function resolveWhatsappAgentRunDelaySeconds",
    );

    expect(runtimeSource).toContain("class StaleWhatsappRunError extends Error");
    expect(processBody).toContain("error instanceof StaleWhatsappRunError");
    expect(processBody).toContain('reason: "newer_inbound_message"');
    expect(deliveryBody).toContain("await assertRunStillTargetsLatestInbound(input.client, context, latestInbound)");
    expect(staleGuard).toContain(".eq(\"direction\", \"inbound\")");
    expect(staleGuard).toContain("isNewerInboundMessage(activeInbound, latestInbound)");
  });

  it("uses customer branding only in native interactive button footers by plan", () => {
    const buttonSender = sourceBetween(
      runtimeSource,
      "async function sendWhatsappInteractiveButtons",
      "async function saveOutboundMessage",
    );
    const footerResolver = sourceBetween(
      runtimeSource,
      "function resolveInteractiveButtonFooterText",
      "async function saveOutboundMessage",
    );

    expect(buttonSender).toContain("footerText?: string");
    expect(buttonSender).toContain('footerText: input.footerText ?? "ConnectyHub"');
    expect(runtimeSource).toContain("footerText: resolveInteractiveButtonFooterText(input.context.organization)");
    expect(runtimeSource).not.toContain("appendWhatsappTextFooter");
    expect(runtimeSource).toContain("buildHumanHandoffText()");
    expect(footerResolver).toContain('planCode === "starter" || planCode === "pro" || planCode === "scale"');
    expect(footerResolver).toContain("normalizeInteractiveFooterText(organization?.name)");
    expect(footerResolver).toContain('return "ConnectyHub"');
    expect(footerResolver).toContain(".slice(0, 60)");
  });
});
