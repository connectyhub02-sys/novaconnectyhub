import { isMetaCommentChannel, type MetaSocialChannel } from "./social-agent-policy";

export type MetaSocialDispatchTarget =
  | {
      kind: "direct_message" | "private_comment_reply";
      endpointPath: string;
      contentType: "json";
      body: {
        messaging_type: "RESPONSE";
        recipient: Record<string, string>;
        message: {
          text: string;
        };
      };
    }
  | {
      kind: "public_comment_reply";
      endpointPath: string;
      contentType: "form";
      body: {
        message: string;
      };
    };

export function resolveMetaSocialDispatchTarget(input: {
  channel: MetaSocialChannel;
  pageId?: string | null;
  instagramBusinessId?: string | null;
  externalUserId?: string | null;
  sourceCommentId?: string | null;
  text: string;
  allowPrivateReplies?: boolean;
  allowPublicReplies?: boolean;
}): MetaSocialDispatchTarget {
  const text = normalizeDispatchText(input.text);
  const pageId = normalizeId(input.pageId);
  const instagramBusinessId = normalizeId(input.instagramBusinessId);
  const externalUserId = normalizeId(input.externalUserId);
  const sourceCommentId = normalizeId(input.sourceCommentId);

  if (!isMetaCommentChannel(input.channel)) {
    if (!pageId) {
      throw new Error("Pagina Facebook nao selecionada para envio Meta.");
    }

    if (!externalUserId) {
      throw new Error("Identidade social do lead ausente para envio Meta.");
    }

    return {
      kind: "direct_message",
      endpointPath: `/${pageId}/messages`,
      contentType: "json",
      body: {
        messaging_type: "RESPONSE",
        recipient: { id: externalUserId },
        message: { text },
      },
    };
  }

  if (input.allowPrivateReplies !== false && pageId && sourceCommentId) {
    return {
      kind: "private_comment_reply",
      endpointPath: `/${pageId}/messages`,
      contentType: "json",
      body: {
        messaging_type: "RESPONSE",
        recipient: { comment_id: sourceCommentId },
        message: { text },
      },
    };
  }

  if (input.allowPublicReplies === true && sourceCommentId) {
    return {
      kind: "public_comment_reply",
      endpointPath: input.channel === "instagram_comments"
        ? `/${sourceCommentId}/replies`
        : `/${sourceCommentId}/comments`,
      contentType: "form",
      body: { message: text },
    };
  }

  if (input.channel === "instagram_comments" && instagramBusinessId && input.allowPrivateReplies !== false) {
    throw new Error("Comentario Instagram sem Page ID/source comment suficiente para private reply.");
  }

  throw new Error("Canal de comentarios Meta sem modo de resposta permitido.");
}

function normalizeDispatchText(value: string) {
  const text = value.trim();

  if (!text) {
    throw new Error("Texto aprovado ausente para envio Meta.");
  }

  return text;
}

function normalizeId(value: string | null | undefined) {
  const text = value?.trim();
  return text || null;
}
