import { createHash } from "node:crypto";

export const sqlHash = (sql: string) => createHash("sha256").update(sql.replace(/\r\n/g, "\n")).digest("hex");

// Lex statements rather than searching raw SQL: transaction words inside a
// function/string/comment must not be mistaken for transaction boundaries.
export function statements(sql: string): string[] {
  const result: string[] = [];
  let current = "";
  for (let i = 0; i < sql.length;) {
    const rest = sql.slice(i);
    if (rest.startsWith("--")) { const end = sql.indexOf("\n", i); i = end < 0 ? sql.length : end; current += " "; continue; }
    if (rest.startsWith("/*")) {
      let depth = 1; i += 2;
      while (i < sql.length && depth) { if (sql.slice(i, i + 2) === "/*") { depth++; i += 2; } else if (sql.slice(i, i + 2) === "*/") { depth--; i += 2; } else i++; }
      if (depth) throw new Error("SQL_UNTERMINATED"); current += " "; continue;
    }
    const dollar = rest.match(/^\$(?:[a-zA-Z_][a-zA-Z0-9_]*)?\$/)?.[0];
    if (dollar) { const end = sql.indexOf(dollar, i + dollar.length); if (end < 0) throw new Error("SQL_UNTERMINATED"); current += " body "; i = end + dollar.length; continue; }
    if (sql[i] === "'" || sql[i] === '"') {
      const quote = sql[i++]; let closed = false; current += " literal ";
      while (i < sql.length) { if (sql[i] === "\\") throw new Error("SQL_ESCAPE_REVIEW"); if (sql[i++] === quote) { if (sql[i] === quote) i++; else { closed = true; break; } } }
      if (!closed) throw new Error("SQL_UNTERMINATED"); continue;
    }
    if (sql[i] === ";") { if (current.trim()) result.push(current.trim()); current = ""; i++; } else current += sql[i++];
  }
  if (current.trim()) result.push(current.trim());
  return result;
}

export function executionPolicy(sql: string): string[] {
  try {
    const parts = statements(sql);
    const reasons: string[] = [];
    if (!parts.length || Buffer.byteLength(sql) > 60000) reasons.push("SQL vazio ou maior que 60 KB.");
    if (parts.some(s => /^(drop|truncate|delete|update)\b/i.test(s) || /^alter\s+table\b[\s\S]*\b(drop|disable|type)\b/i.test(s))) reasons.push("SQL destrutivo ou alteração de dados existentes bloqueado por padrão (DROP/TRUNCATE/DELETE/UPDATE/ALTER destrutivo). Exige procedimento revisado no host com autorização específica e backup.");
    if (parts.some(s => !/^(create\s+(or\s+replace\s+)?(table|index|unique\s+index|function|trigger|type|view|policy|schema)|alter\s+(table|type)|drop\s+(table|index|function|trigger|type|view|policy)|insert\s+into|update\s|delete\s+from|grant\s|revoke\s|comment\s+on)\b/i.test(s))) reasons.push("Comando exige execução revisada no host (controle de transação, sessão, DO, CALL e comandos administrativos não são aceitos).");
    if (/\b(concurrently|infra_control|supabase_migrations|infra_migration_runs|infra_migrations|infra_audit|infra_projects)\b/i.test(sql)) reasons.push("SQL não transacional ou altera estruturas protegidas do executor. Aplicar pelo procedimento do host.");
    return reasons;
  } catch { return ["SQL incompleto ou escape que exige revisão no host."]; }
}
