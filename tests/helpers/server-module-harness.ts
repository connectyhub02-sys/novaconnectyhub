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
      if (name in imports) return imports[name];
      if (name.endsWith("/outbound-delivery")) return { fetchWhatsappOutbound: (url: unknown, init: unknown) => {
        if (typeof globals.fetch !== "function") throw new Error("HTTP mock required for outbound transport");
        return globals.fetch(url, init);
      } };
      return {};
    }, URL, Date, Buffer, process, console, AbortSignal, ...globals,
  });
  return loadedModule.exports as T;
}
