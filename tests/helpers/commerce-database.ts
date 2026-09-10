type Row = Record<string, unknown>;

/** Minimal in-memory PostgREST boundary. No application decisions are mocked here. */
export function commerceDatabase(initial: Record<string, Row[]> = {}, failure?: { table: string; operation: string }) {
  const tables = structuredClone(initial);
  let sequence = 0;
  for (const table of ["leads", "agent_registry"]) tables[table]?.forEach(row => { row.updated_at ??= "version-0"; });
  const client = {
    from(table: string) {
      let operation = "select";
      let payload: Row | Row[] = {};
      const filters: Array<(row: Row) => boolean> = [];
      let sorting: { key: string; ascending: boolean } | null = null;
      let maximum = Infinity;
      let offset = 0;
      const query = {
        select: () => query,
        order: (key: string, options?: { ascending?: boolean }) => { sorting = { key, ascending: options?.ascending !== false }; return query; },
        limit: (value: number) => { maximum = value; return query; },
        range: (from: number, to: number) => { offset = from; maximum = to - from + 1; return query; },
        eq(key: string, value: unknown) {
          filters.push(row => {
            const [field, child] = key.split("->>");
            const actual = child ? (row[field] as Row | undefined)?.[child] : row[field];
            return typeof actual === "object" ? JSON.stringify(actual) === value : actual === value;
          });
          return query;
        },
        in(key: string, values: unknown[]) { filters.push(row => values.includes(row[key])); return query; },
        neq(key: string, value: unknown) { filters.push(row => row[key] !== value); return query; },
        is(key: string, value: unknown) { filters.push(row => value === null ? row[key] == null : row[key] === value); return query; },
        gte(key: string, value: string) { filters.push(row => String(row[key] ?? "") >= value); return query; },
        gt(key: string, value: string) { filters.push(row => row[key] != null && String(row[key]) > value); return query; },
        lt(key: string, value: string) { filters.push(row => row[key] != null && String(row[key]) < value); return query; },
        lte(key: string, value: string) { filters.push(row => row[key] != null && String(row[key]) <= value); return query; },
        not(key: string, operator: string, value: unknown) {
          if (operator !== "is") throw new Error(`Unsupported operator: ${operator}`);
          filters.push(row => value === null ? row[key] != null : row[key] !== value);
          return query;
        },
        contains(key: string, value: unknown[] | Row) {
          filters.push(row => Array.isArray(value)
            ? value.every(item => Array.isArray(row[key]) && (row[key] as unknown[]).includes(item))
            : Object.entries(value).every(([field, expected]) => (row[key] as Row | undefined)?.[field] === expected));
          return query;
        },
        insert(value: Row | Row[]) { operation = "insert"; payload = value; return query; },
        upsert(value: Row) { operation = "upsert"; payload = value; return query; },
        update(value: Row) { operation = "update"; payload = value; return query; },
        async maybeSingle() { const result = execute(); return { ...result, data: result.data[0] ?? null }; },
        async single() { return query.maybeSingle(); },
        then(resolve: (value: ReturnType<typeof execute>) => unknown) { return Promise.resolve(execute()).then(resolve); },
      };
      function execute() {
        tables[table] ??= [];
        if (failure?.table === table && failure.operation === operation) {
          return { data: [] as Row[], error: { message: "Simulated database failure" } };
        }
        let selected = tables[table].filter(row => filters.every(filter => filter(row)));
        if (sorting) {
          const { key, ascending } = sorting;
          selected.sort((a, b) => String(a[key] ?? "").localeCompare(String(b[key] ?? "")) * (ascending ? 1 : -1));
        }
        selected = selected.slice(offset, offset + maximum);
        if (operation === "insert") {
          selected = (Array.isArray(payload) ? payload : [payload]).map(row => ({ id: `row-${++sequence}`, ...row }));
          if (selected.some(row => tables[table].some(existing => existing.id === row.id))) {
            return { data: [] as Row[], error: { code: "23505", message: "Duplicate primary key" } };
          }
          tables[table].push(...selected);
        }
        if (operation === "update") selected.forEach(row => {
          Object.assign(row, payload);
          if (table === "leads" || table === "agent_registry") row.updated_at = `version-${++sequence}`;
        });
        if (operation === "upsert") {
          const value = payload as Row;
          const previous = tables[table].find(row => row.id === value.id);
          if (previous) Object.assign(previous, value);
          else tables[table].push({ id: `row-${++sequence}`, ...value });
          selected = tables[table].filter(row => row.id === value.id);
        }
        return { data: structuredClone(selected), error: null };
      }
      return query;
    },
  };
  return { client, tables };
}
