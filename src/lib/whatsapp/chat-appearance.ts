import type { CSSProperties } from "react";
export const whatsappConversationBackgroundUrl =
  "https://pub-eaf679ed02634f958b68991d910a997b.r2.dev/8c98994518b575bfd8c949e91d20548b.jpg";
export const whatsappChatBackgroundStyle: CSSProperties = {
  backgroundImage: `linear-gradient(rgba(239,234,226,0.28), rgba(239,234,226,0.28)), url("${whatsappConversationBackgroundUrl}")`,
  backgroundRepeat: "repeat",
  backgroundSize: "420px",
};
