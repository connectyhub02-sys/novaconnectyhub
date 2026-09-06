import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { ModuleKind, transpileModule } from "typescript";

export function serverModuleHarness<T>(path: string, imports: Record<string, unknown> = {}, exposed: string[] = [], globals: Record<string, unknown> = {}): T {
  const source = readFileSync(path, "utf8");
  const compiled = transpileModule(`${source}\nObject.assign(exports, {${exposed.join(",")}});`, {
    compilerOptions: { module: ModuleKind.CommonJS, target: 9 },
  }).outputText;
  const loadedModule = { exports: {} };
  runInNewContext(compiled, {
    module: loadedModule, exports: loadedModule.exports, require: (name: string) => {
      if (name === "server-only") return {};
      if (name in imports) return imports[name];
      return {};
    }, URL, Date, Buffer, process, console, AbortSignal, ...globals,
  });
  return loadedModule.exports as T;
}
