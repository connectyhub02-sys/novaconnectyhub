import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";

// Load only our pure documentation modules; no service credentials or network.
const cache = new Map();
function load(file) {
  if (cache.has(file)) return cache.get(file);
  const exports = {};
  cache.set(file, exports);
  const code = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  runInNewContext(code, {
    exports,
    require(name) {
      if (!name.startsWith("./")) throw new Error(`Unexpected documentation import: ${name}`);
      return load(resolve(dirname(file), `${name}.ts`));
    },
  });
  return exports;
}
const { renderAiGuide } = load(resolve("src/lib/ai-api/guide.ts"));
writeFileSync("docs/guia-integracao-api-llm.md", renderAiGuide(), "utf8");
console.log("Guia de integração atualizado a partir da referência pública.");
