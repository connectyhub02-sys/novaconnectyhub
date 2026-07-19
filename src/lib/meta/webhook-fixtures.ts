type JsonRecord = Record<string, unknown>;

export type MetaWebhookSimulationScenario =
  | "facebook_comment"
  | "facebook_messenger"
  | "instagram_comment"
  | "instagram_direct";

export type MetaWebhookSimulationPayloadInput = {
  scenario: MetaWebhookSimulationScenario;
  facebookPageId?: string | null;
  instagramBusinessId?: string | null;
  now?: Date;
  suffix?: string;
};

export function isMetaWebhookSimulationScenario(value: unknown): value is MetaWebhookSimulationScenario {
  return value === "facebook_comment"
    || value === "facebook_messenger"
    || value === "instagram_comment"
    || value === "instagram_direct";
}

export function createMetaWebhookSimulationPayload(input: MetaWebhookSimulationPayloadInput) {
  const now = input.now ?? new Date();
  const timestamp = now.getTime();
  const seconds = Math.floor(timestamp / 1000);
  const suffix = input.suffix ?? String(timestamp);

  switch (input.scenario) {
    case "facebook_comment": {
      const pageId = requireFixtureAsset(input.facebookPageId, "Pagina Facebook");
      const commentId = `fb_comment_${suffix}`;

      return {
        assetId: pageId,
        payload: {
          object: "page",
          entry: [{
            id: pageId,
            time: seconds,
            changes: [{
              field: "feed",
              value: {
                item: "comment",
                verb: "add",
                page_id: pageId,
                post_id: `${pageId}_post_${suffix}`,
                comment_id: commentId,
                created_time: seconds,
                from: {
                  id: `fb_lead_${suffix}`,
                  name: "Lead Simulado Facebook",
                },
                message: "Quero saber mais sobre essa oferta.",
              },
            }],
          }],
        } satisfies JsonRecord,
      };
    }
    case "facebook_messenger": {
      const pageId = requireFixtureAsset(input.facebookPageId, "Pagina Facebook");

      return {
        assetId: pageId,
        payload: {
          object: "page",
          entry: [{
            id: pageId,
            time: seconds,
            messaging: [{
              sender: { id: `fb_user_${suffix}` },
              recipient: { id: pageId },
              timestamp,
              message: {
                mid: `mid_fb_${suffix}`,
                text: "Oi, vim pelo Facebook e quero atendimento.",
              },
            }],
          }],
        } satisfies JsonRecord,
      };
    }
    case "instagram_comment": {
      const instagramId = requireFixtureAsset(input.instagramBusinessId, "Instagram Business");
      const commentId = `ig_comment_${suffix}`;

      return {
        assetId: instagramId,
        payload: {
          object: "instagram",
          entry: [{
            id: instagramId,
            time: seconds,
            changes: [{
              field: "comments",
              value: {
                media_id: `ig_media_${suffix}`,
                comment_id: commentId,
                created_time: seconds,
                from: {
                  id: `ig_user_${suffix}`,
                  username: "lead_simulado",
                },
                text: "Tenho interesse, pode me chamar no direct?",
              },
            }],
          }],
        } satisfies JsonRecord,
      };
    }
    case "instagram_direct": {
      const instagramId = requireFixtureAsset(input.instagramBusinessId, "Instagram Business");

      return {
        assetId: instagramId,
        payload: {
          object: "instagram",
          entry: [{
            id: instagramId,
            time: seconds,
            messaging: [{
              sender: { id: `ig_user_${suffix}` },
              recipient: { id: instagramId },
              timestamp,
              message: {
                mid: `mid_ig_${suffix}`,
                text: "Oi, quero falar com o atendimento.",
              },
            }],
          }],
        } satisfies JsonRecord,
      };
    }
  }
}

function requireFixtureAsset(value: string | null | undefined, label: string) {
  const text = value?.trim();

  if (!text) {
    throw new Error(`${label} obrigatorio para simular este webhook.`);
  }

  return text;
}
