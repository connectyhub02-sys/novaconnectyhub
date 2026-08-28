import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const operationsSource = readFileSync("src/lib/whatsapp/channel-operations.ts", "utf8");
const dashboardRouteSource = readFileSync("src/app/api/dashboard/whatsapp/channels/route.ts", "utf8");
const adminRouteSource = readFileSync("src/app/api/admin/whatsapp/internal/channels/route.ts", "utf8");
const studioSource = readFileSync("src/components/connectyhub-os/client-whatsapp-automation-studio.tsx", "utf8");

describe("WhatsApp growth engine v2", () => {
  it("supports product carousel campaigns with provider fallback", () => {
    expect(operationsSource).toContain('"target_carousel"');
    expect(operationsSource).toContain("queueWhatsappTargetCarouselCampaign");
    expect(operationsSource).toContain('"/send/carousel"');
    expect(operationsSource).toContain("newsletter_text_fallback");
    expect(operationsSource).toContain("buildCampaignCarouselCards");
    expect(operationsSource).toContain("buildSalesCatalogProductUrl");
    expect(operationsSource).toContain("image_button: buttonImage");
    expect(operationsSource).toContain("footerText: resolveCampaignInteractiveFooterText(context)");
    expect(operationsSource).toContain("normalizeInteractiveFooterText(context.organizationName)");
  });

  it("keeps WhatsApp status text under provider byte limits", () => {
    expect(operationsSource).toContain("whatsappStatusTextMaxBytes");
    expect(operationsSource).toContain("truncateUtf8Text");
    expect(operationsSource).toContain('Buffer.byteLength(text, "utf8")');
    expect(operationsSource).toContain("normalizeGrowthPlanText(type, text)");
    expect(operationsSource).toContain("background_color");
    expect(operationsSource).toContain("...(maxRecipients ? { max_recipients: maxRecipients } : {})");
    expect(operationsSource).toContain("...(recipients.length ? { recipients } : {})");
    expect(operationsSource).toContain("requestedTypeRaw");
    expect(operationsSource).toContain("manualMedia ?? (requestedTypeRaw && requestedType === \"text\" ? null : catalogMedia)");
    expect(operationsSource).toContain("buildCatalogStatusMedia(catalogItems, requestedTypeRaw ? requestedType : null)");
  });

  it("exposes the AI growth plan globally for customer and admin flows", () => {
    for (const source of [dashboardRouteSource, adminRouteSource]) {
      expect(source).toContain("generate_growth_plan");
      expect(source).toContain("schedule_growth_plan");
      expect(source).toContain("send_target_carousel");
      expect(source).toContain("enable_group_replies");
      expect(source).toContain("enable_automation_capability");
      expect(source).toContain("set_automation_capability");
      expect(source).toContain("sync_outbound_insights");
      expect(source).toContain("syncWhatsappOutboundInsights");
      expect(source).toContain("preferredFormats");
      expect(source).toContain("buttonEnabled");
      expect(source).toContain("whatsapp_growth_plan_ai");
      expect(source).toContain("toSafeGrowthPlan");
    }
  });

  it("surfaces the new automation controls in the client WhatsApp studio", () => {
    expect(studioSource).toContain("Campanha automatica");
    expect(studioSource).toContain("Tipo de campanha");
    expect(studioSource).toContain("Destino da campanha");
    expect(studioSource).toContain("campaignTargetFocusId");
    expect(studioSource).toContain("Nenhum");
    expect(studioSource).toContain("toggleCampaignTargetSelection");
    expect(studioSource).toContain("Selecionado para campanha");
    expect(studioSource).toContain("Limite por hora");
    expect(studioSource).toContain("Campanhas em canais");
    expect(studioSource).toContain("Publicar no canal");
    expect(studioSource).toContain("Planejar rotina");
    expect(studioSource).toContain("Agendar rotina");
    expect(studioSource).toContain("Carrossel");
    expect(studioSource).toContain("Envio manual");
    expect(studioSource).toContain("Formato principal");
    expect(studioSource).toContain("@ nas respostas");
    expect(studioSource).toContain("Previa WhatsApp");
    expect(studioSource).not.toContain("URL de midia externa (opcional)");
    expect(studioSource).toContain("Agente em uso");
    expect(studioSource).not.toContain("Agente executor");
    expect(studioSource).toContain("Ativar responder grupos");
    expect(studioSource).toContain("set_automation_capability");
    expect(studioSource).toContain("Desativar");
    expect(studioSource).toContain("Resumo da rotina");
    expect(studioSource).toContain("Envio real");
    expect(studioSource).toContain("Misto revisavel");
    expect(studioSource).toContain("Texto do botao de compra");
    expect(studioSource).toContain("audio puro nao leva botao");
    expect(studioSource).toContain("Falta ativar Responder grupos");
    expect(studioSource).toContain("Segmentos sugeridos");
    expect(studioSource).toContain("Atualizar metricas");
    expect(studioSource).toContain("Raio-x da campanha");
    expect(studioSource).toContain("Leads CRM");
  });

  it("keeps user campaign controls authoritative when scheduling AI plans", () => {
    expect(operationsSource).toContain("const buttonsEnabled = input.buttonEnabled !== false");
    expect(operationsSource).toContain("const userButtonLabel = input.buttonLabel?.trim().slice(0, 24) || null");
    expect(operationsSource).toContain("userButtonLabel ?? planItem.buttonLabel ?? \"Comprar agora\"");
    expect(operationsSource).toContain('interactiveMode: itemButtonLabel ? "button" : "none"');
    expect(studioSource).toContain("buttonEnabled: campaignButtonEnabled");
    expect(studioSource).toContain('useState<GrowthFormatPreference>("text")');
  });
});
