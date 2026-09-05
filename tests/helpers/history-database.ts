type Row = Record<string, unknown>;

/** Read-only PostgREST boundary, including compound cursors and deterministic ordering. */
export function historyDatabase(tables: Record<string, Row[]>, failTable?: string) {
  const calls: string[] = [];
  const client = { from(table: string) {
    calls.push(table);
    const filters: Array<(row: Row) => boolean> = [];
    const orders: Array<{ column: string; ascending: boolean }> = [];
    let limit = Infinity;
    const query = {
      select: () => query,
      eq(column: string, value: unknown) { filters.push(row => row[column] === value); return query; },
      in(column: string, values: unknown[]) { filters.push(row => values.includes(row[column])); return query; },
      or(expression: string) { filters.push(row => splitTerms(expression).some(term => matches(row, term))); return query; },
      order(column: string, options: { ascending: boolean }) { orders.push({ column, ...options }); return query; },
      limit(value: number) { limit = value; return query; },
      async maybeSingle() { const result = execute(); return { ...result, data: result.data[0] ?? null }; },
      then(resolve: (value: ReturnType<typeof execute>) => unknown) { return Promise.resolve(execute()).then(resolve); },
    };
    function execute() {
      const data = (tables[table] ?? []).filter(row => filters.every(filter => filter(row))).sort((a, b) => {
        for (const { column, ascending } of orders) {
          const diff = String(a[column] ?? "").localeCompare(String(b[column] ?? ""));
          if (diff) return ascending ? diff : -diff;
        }
        return 0;
      }).slice(0, limit);
      return { data: structuredClone(data), error: failTable === table ? { message: "Database unavailable" } : null };
    }
    return query;
  } };
  return { client, calls };
}

function matches(row: Row, term: string): boolean {
  if (term.startsWith("and(")) return splitTerms(term.slice(4, -1)).every(child => matches(row, child));
  const match = /^(\w+)\.(eq|lt|is)\.(.*)$/.exec(term);
  if (!match) throw new Error(`Unsupported filter: ${term}`);
  const [, column, operator, value] = match;
  if (operator === "is") return value === "null" && row[column] == null;
  if (operator === "eq") return String(row[column]) === value;
  return String(row[column]) < value;
}

function splitTerms(value: string) {
  let depth = 0; let start = 0; const terms: string[] = [];
  for (let index = 0; index < value.length; index++) {
    if (value[index] === "(") depth++;
    if (value[index] === ")") depth--;
    if (value[index] === "," && !depth) { terms.push(value.slice(start, index)); start = index + 1; }
  }
  terms.push(value.slice(start));
  return terms;
}
