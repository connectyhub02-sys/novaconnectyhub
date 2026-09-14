import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { deleteR2Object, loadR2Config } from "@/lib/storage/r2";
import type { AssistedAccess } from "@/lib/admin-assisted-access";

type ResetAsset = { key?: string; bucket?: string; done?: boolean };
export type LeadResetResult = { jobId: string; deleted: boolean; complete: boolean; counts: Record<string, number>; leadIds?: string[] };

export async function resetLead(client: SupabaseClient, organizationId: string, leadId: string, access: AssistedAccess) {
  const result = await client.rpc("reset_lead_data_assisted", {
    p_organization_id: organizationId, p_lead_id: leadId, p_confirm: true,
    p_token_hash: access.tokenHash, p_target_session_id: access.targetSessionId, p_target_user_id: access.targetUserId,
  });
  if (result.error) throw new Error(result.error.message);
  const reset = result.data as LeadResetResult;
  if (!reset?.deleted || !reset.jobId) throw new Error("RESET_RESULT_INVALID");
  if (!reset.complete) reset.complete = await finishLeadResetAssets(client, organizationId, reset.jobId);
  return reset;
}

export async function finishLeadResetAssets(client: SupabaseClient, organizationId: string, jobId: string) {
  const { data: job, error } = await client.from("lead_reset_jobs").select("assets,completed_at")
    .eq("organization_id", organizationId).eq("id", jobId).single();
  if (error || !job) throw new Error("RESET_JOB_UNAVAILABLE");
  if (job.completed_at) return true;
  const assets = job.assets as ResetAsset[];
  let complete = true;
  for (const [index, asset] of assets.entries()) {
    if (asset.done) continue;
    try {
      if (!asset.key || !asset.bucket) throw new Error("RESET_ASSET_INVALID");
      // Keys come only from the transaction's scoped deletion manifest, never
      // from request parameters. Shared catalogue/knowledge assets are not seeded.
      if (asset.bucket === "r2") {
        const config = await loadR2Config(client);
        if (!config.ok) throw new Error("RESET_STORAGE_UNAVAILABLE");
        const deleted = await deleteR2Object(config.config, asset.key);
        if (!deleted.ok) throw new Error("RESET_STORAGE_DELETE_FAILED");
      } else {
        const deleted = await client.storage.from(asset.bucket).remove([asset.key]);
        if (deleted.error) throw new Error("RESET_STORAGE_DELETE_FAILED");
      }
      const acknowledged = await client.rpc("complete_lead_reset_asset", {
        p_organization_id: organizationId, p_job_id: jobId, p_index: index,
      });
      if (acknowledged.error) throw new Error("RESET_STORAGE_COMMIT_FAILED");
    } catch { complete = false; }
  }
  return complete;
}

export async function retryLeadResetAssets(client: SupabaseClient) {
  const { data, error } = await client.from("lead_reset_jobs").select("id,organization_id")
    .is("completed_at", null).order("started_at").limit(10);
  if (error) throw new Error("RESET_PENDING_LOOKUP_FAILED");
  let completed = 0;
  for (const job of data ?? []) {
    if (await finishLeadResetAssets(client, job.organization_id, job.id)) completed++;
  }
  return { completed, pending: (data?.length ?? 0) - completed };
}
