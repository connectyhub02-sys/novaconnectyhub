import { aiBaseUrl, aiDocPages, aiEndpointResponses, type AiDocBlock } from "./documentation";
const cell = (value: string) => value.replace(/\|/g, "\\|").replace(/\n/g, " ");
function renderBlock(block: AiDocBlock): string {
  if (block.kind === "text") return block.text;
  if (block.kind === "note") return `### ${block.title}\n\n${block.text}`;
  if (block.kind === "steps") return `### ${block.title}\n\n` + block.items.map((item, index) => `${index + 1}. ${item}`).join("\n");
  if (block.kind === "code") return `### ${block.title}\n\n\`\`\`${block.language}\n${block.code}\n\`\`\``;
  return `### ${block.title}\n\n| ${block.columns.map(cell).join(" | ")} |\n| ${block.columns.map(() => "---").join(" | ")} |\n` + block.rows.map(row => `| ${row.map(cell).join(" | ")} |`).join("\n");
}
export function renderAiGuide() {
  const header = `# Integração com a API de IA ConnectyHub\n\nReferência 1.5.0 · 10/09/2026\n\n- Página pública: https://www.connectyhub.com.br/docs/api#ia\n- OpenAPI JSON: https://www.connectyhub.com.br/docs/api/ia/openapi.json\n- Guia completo: https://www.connectyhub.com.br/docs/api/ia/guide.md\n- Base da API: ${aiBaseUrl}\n\nEste guia descreve o contrato público implementado. Exemplos de consumo são ilustrativos.\n\n## Navegação\n\n` + aiDocPages.map(page => `- [${page.label}](https://www.connectyhub.com.br/docs/api#${page.id})`).join("\n");
  return header + "\n\n" + aiDocPages.map(page => {
    const responses = aiEndpointResponses(page);
    const blocks = [...page.blocks];
    if (responses.length) blocks.push({ kind: "table", title: "Respostas HTTP", columns: ["HTTP", "Descrição"], rows: responses });
    return `## ${page.title}\n\n${page.description}\n\n` + (page.path ? `**${page.method} ${page.path}**\n\n` : "") + blocks.map(renderBlock).join("\n\n");
  }).join("\n\n---\n\n") + "\n";
}
