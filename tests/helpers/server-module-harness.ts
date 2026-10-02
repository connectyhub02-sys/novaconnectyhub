import * as responsibleAttendance from "../../src/lib/whatsapp/responsible-attendance";
import * as foodComposition from "../../src/lib/sales-catalog/food-composition";
import * as foodOrder from "../../src/lib/sales-catalog/food-order";
import * as foodConversation from "../../src/lib/sales-catalog/food-conversation";
import * as operationHours from "../../src/lib/sales-catalog/operation-hours";
import * as localDelivery from "../../src/lib/sales-catalog/local-delivery";
import * as geminiModels from "../../src/lib/gemini/models";
import * as costOptimizations from "../../src/lib/billing/cost-optimizations";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { JsxEmit, ModuleKind, transpileModule } from "typescript";

export function serverModuleHarness<T>(path: string, imports: Record<string, unknown> = {}, exposed: string[] = [], globals: Record<string, unknown> = {}): T {
  const source = readFileSync(path, "utf8");
  const compiled = transpileModule(`${source}\nObject.assign(exports, {${exposed.join(",")}});`, {
    fileName: path,
    compilerOptions: { module: ModuleKind.CommonJS, target: 9, jsx: JsxEmit.ReactJSX },
  }).outputText;
  const loadedModule = { exports: {} };
  runInNewContext(compiled, {
    module: loadedModule, exports: loadedModule.exports, require: (name: string) => {
      if (name === "server-only") return {};
      // Pure helpers: a partial mock of this module keeps the real thinking config.
      if (name === "@/lib/gemini/models") return { ...geminiModels, ...(imports[name] as object | undefined) };
      if (name === "@/lib/billing/cost-optimizations" && !(name in imports)) return costOptimizations;
      if (name in imports) return imports[name];
      if (name === "./responsible-attendance" || name === "@/lib/whatsapp/responsible-attendance") return responsibleAttendance;
      if (name === "./food-composition" || name === "@/lib/sales-catalog/food-composition") return foodComposition;
      if (name === "./food-payment-guard" || name === "@/lib/sales-catalog/food-payment-guard") return serverModuleHarness("src/lib/sales-catalog/food-payment-guard.ts", imports, [], globals);
      if (name === "./food-order" || name === "@/lib/sales-catalog/food-order") return foodOrder;
      if (name === "./food-conversation" || name === "@/lib/sales-catalog/food-conversation") return foodConversation;
      if (name === "./operation-hours" || name === "@/lib/sales-catalog/operation-hours") return operationHours;
      if (name === "./local-delivery" || name === "@/lib/sales-catalog/local-delivery") return localDelivery;
      if (name.endsWith("/outbound-delivery")) return { fetchWhatsappOutbound: (url: unknown, init: unknown) => {
        if (typeof globals.fetch !== "function") throw new Error("HTTP mock required for outbound transport");
        return globals.fetch(url, init);
      } };
      return {};
    }, URL, Date, Buffer, process, console, AbortSignal, Response, ...globals,
  });
  return loadedModule.exports as T;
}
