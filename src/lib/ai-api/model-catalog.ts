import { aiModelDefinitions } from "./model-definitions";
export type PublicAiModel = {
  id: string; object: "model"; name: string; family: string; profile: string;
  consumption: string; recommended: boolean; capabilities: string[]; available: boolean;
  unavailable_reason: string | null;
};
export const recommendedAiModel = "flash-3.5";
export function aiModelDefinition(id: string) { return aiModelDefinitions.find(model => model.id === id); }
export function publicModelId(providerId: string) { return aiModelDefinitions.find(model => model.providerId === providerId)?.id ?? "connectyhub-auto"; }
