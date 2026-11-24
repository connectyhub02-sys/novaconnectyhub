export type InboxNetwork = "instagram" | "facebook";
export type InboxMedia = { type: "image" | "video"; url: string | null; thumbnail: string | null };
export type InboxPost = {
  id: string; network: InboxNetwork; caption: string; timestamp: string;
  permalink: string | null; media: InboxMedia[]; commentsCount: number | null;
};
export type InboxComment = {
  id: string; text: string; author: string; timestamp: string;
  replyToken: string; replies: InboxComment[]; repliesAfter: string | null;
};
export type InboxConversation = {
  id: string; lead_id: string | null; name: string; channel: string;
  last_message_preview: string; last_message_at: string; sourcePostId: string | null;
};
export type InboxMessage = {
  id: string; direction: string; text_content: string; message_type: string;
  occurred_at: string; deliveryStatus?: string | null;
};
export const inboxChannelLabels: Record<string, string> = {
  instagram_direct: "Instagram Direct", facebook_messenger: "Messenger",
  instagram_comments: "Instagram · comentário", facebook_comments: "Facebook · comentário",
};
export function inboxNetwork(channel: string): InboxNetwork {
  return channel.startsWith("instagram") ? "instagram" : "facebook";
}
export function safeSocialUrl(value: unknown, media = false): string | null {
  try {
    if (typeof value !== "string") return null;
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const domains = media ? ["fbcdn.net", "cdninstagram.com", "fbsbx.com"] : ["facebook.com", "instagram.com", "fb.watch"];
    if (url.protocol !== "https:" || url.username || url.password || url.port || !domains.some(d => host === d || host.endsWith(`.${d}`))) return null;
    if ([...url.searchParams.keys()].some(k => /access_token|appsecret|authorization/i.test(k))) return null;
    return url.href;
  } catch { return null; }
}
