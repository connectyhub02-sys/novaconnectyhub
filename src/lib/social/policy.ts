export type SocialProvider = "youtube" | "tiktok";
export type SocialShell = "client" | "admin";
export const socialAreas = ["publicacoes", "calendario", "biblioteca", "contas"] as const;
export type SocialArea = typeof socialAreas[number];
export const socialLabels: Record<SocialArea, string> = {
  publicacoes: "Publicações", calendario: "Calendário de posts", biblioteca: "Biblioteca de mídias", contas: "Contas conectadas",
};
export function socialPath(shell: SocialShell, area: SocialArea = "publicacoes") {
  return `/${shell === "admin" ? "admin" : "dashboard"}/redes-sociais/${area}`;
}
export function socialNavigation(shell: SocialShell) {
  return socialAreas.map(key => ({ key, label: socialLabels[key], href: socialPath(shell, key) }));
}
export function isSocialProvider(value: string): value is SocialProvider { return value === "youtube" || value === "tiktok"; }
export const socialScopes: Record<SocialProvider, string[]> = {
  youtube: ["https://www.googleapis.com/auth/youtube.readonly", "https://www.googleapis.com/auth/youtube.upload"],
  tiktok: ["user.info.basic", "video.publish"],
};
export type SocialAccount = { id: string; name: string };
export type SocialConnectionCard = {
  provider: SocialProvider;
  configured: boolean;
  connected: boolean;
  status: string;
  accounts: SocialAccount[];
  selectedAccountId: string | null;
  checkedAt: string | null;
};
export type SocialAccountsOverview = {
  schemaReady: boolean;
  canManage: boolean;
  meta: { connected: boolean; account: string | null; publishingScopes: boolean; available: boolean };
  connections: SocialConnectionCard[];
};
export function hasSocialScopes(provider: SocialProvider, granted: string[]) {
  return socialScopes[provider].every(scope => granted.includes(scope));
}
