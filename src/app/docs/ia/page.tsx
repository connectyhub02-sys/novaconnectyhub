import { permanentRedirect } from "next/navigation";

export default function AiDocsLegacyPage() {
  permanentRedirect("/docs/api#ia");
}
