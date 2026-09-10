import {it,expect} from "vitest";
import {aiModelDefinition} from "../src/lib/ai-api/model-catalog";
import {publicAiModelDefinitions} from "../src/lib/ai-api/public-models";
import * as modelCatalog from "../src/lib/ai-api/model-catalog";
import * as capabilities from "../src/lib/ai-api/capabilities";
import {commerceDatabase} from "./helpers/commerce-database";
import {serverModuleHarness} from "./helpers/server-module-harness";
import type * as Service from "../src/lib/ai-api/model-service";
it("keeps public model IDs unique and private routing out of the browser catalog",()=>{
  expect(new Set(publicAiModelDefinitions.map(model=>model.id)).size).toBe(55);
  expect(publicAiModelDefinitions.filter(model=>model.recommended).map(model=>model.id)).toEqual(["flash-3.5"]);
  expect(JSON.stringify(publicAiModelDefinitions)).not.toMatch(/gemini|google|providerId|apiKey/);
  for(const model of publicAiModelDefinitions)expect(aiModelDefinition(model.id)).toMatchObject(model);
});
it("does not offer unpriced, disabled or unsupported models even when listed in the catalog",async()=>{
  const models=publicAiModelDefinitions.filter(model=>["flash-3.5","flash-3.6","flash-3.7","flash-3.8","music-realtime-exp"].includes(model.id));
  const db=commerceDatabase({ai_public_models:models.map(model=>({...model,enabled:true,provider_model_id:aiModelDefinition(model.id)!.providerId})),provider_models:models.map(model=>({provider_model_id:aiModelDefinition(model.id)!.providerId,enabled:model.id!=="flash-3.6",metadata:{external_ai_available:model.id!=="flash-3.7"},"provider_cost_centers.enabled":true,"provider_cost_centers.provider":"gemini"}))});
  const service=serverModuleHarness<typeof Service>("src/lib/ai-api/model-service.ts",{"./model-catalog":modelCatalog,"./capabilities":capabilities,"@/lib/billing/metered-usage":{resolveActiveBillingRates:async(_client:unknown,input:{modelId:string})=>input.modelId==="gemini-3.8-flash"?[]:[{unit:"input_token",connectyPricePerUnit:1},{unit:"output_token",connectyPricePerUnit:1}]}});
  const result=await service.loadPublicAiModels(db.client as never);
  expect(result.filter(model=>model.available).map(model=>model.id)).toEqual(["flash-3.5"]);
  expect(result.filter(model=>!model.available).every(model=>model.capabilities.length===0)).toBe(true);
  expect(result[0].capabilities).not.toContain("cache");
});
