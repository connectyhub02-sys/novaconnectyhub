#!/usr/bin/env bash
# Prune Inngest run history (observability only) older than N days from a self-hosted
# Inngest Postgres container. Queue/state live in Redis and are never touched.
# Usage: inngest-retention.sh <postgres-container> [days=3] [--vacuum-full]
set -euo pipefail
container="${1:?postgres container}"
days="${2:-3}"
mode="${3:-}"
[[ "$days" =~ ^[0-9]+$ ]] && (( days >= 1 )) || { echo "days must be >= 1" >&2; exit 2; }

psqlc() { docker exec -i "$container" sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -q'; }
cutoff="now() - interval '$days days'"
cutoff_ms="(extract(epoch from now() - interval '$days days') * 1000)::bigint"

# table|condition (batched by ctid so each statement is short and Inngest keeps writing)
jobs=(
  "spans|start_time < $cutoff"
  "traces|\"timestamp\" < $cutoff"
  "trace_runs|ended_at > 0 and ended_at < $cutoff_ms"
  "history|created_at < $cutoff"
  "events|received_at < $cutoff"
  # Only finished runs: unfinished (sleeping, waiting) runs keep their row.
  "function_runs|run_started_at < $cutoff and exists (select 1 from function_finishes f where f.run_id = function_runs.run_id)"
  "function_finishes|created_at < $cutoff and not exists (select 1 from function_runs r where r.run_id = function_finishes.run_id)"
)

echo "$(date -u +%FT%TZ) $container keep=${days}d"
echo "select pg_size_pretty(pg_database_size(current_database()));" | psqlc | sed 's/^/before: /'
for job in "${jobs[@]}"; do
  table="${job%%|*}"; cond="${job#*|}"
  total=0
  while :; do
    n=$(echo "with d as (delete from $table where ctid in (select ctid from $table where $cond limit 20000) returning 1) select count(*) from d;" | psqlc)
    total=$((total + n))
    (( n < 20000 )) && break
  done
  echo "$table: deleted $total"
done

if [[ "$mode" == "--vacuum-full" ]]; then
  # One-off: return space to the disk. Locks each table briefly while it rewrites live rows.
  for table in function_finishes function_runs events history trace_runs traces spans; do
    echo "vacuum full $table;" | psqlc
    echo "vacuum full $table: done"
  done
else
  echo "vacuum (analyze) spans, traces, trace_runs, history, events, function_runs, function_finishes;" | psqlc
fi
echo "select pg_size_pretty(pg_database_size(current_database()));" | psqlc | sed 's/^/after: /'
