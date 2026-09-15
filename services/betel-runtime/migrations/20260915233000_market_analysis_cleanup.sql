-- Authorized purge of imported analysis/test data; service role only.
-- Wallets, LLM receipts, users, agents, configuration and audit rows are excluded.
BEGIN;
CREATE TABLE IF NOT EXISTS public.market_analysis_cleanup_runs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz NOT NULL DEFAULT now(),
 completed_at timestamptz, status text NOT NULL CHECK(status IN ('db_processing','storage_pending','completed')),
 transaction_id bigint NOT NULL, backend_pid integer NOT NULL, plan_hash text NOT NULL,
 plan jsonb NOT NULL, result jsonb NOT NULL DEFAULT '{}', storage_results jsonb NOT NULL DEFAULT '{}'
);
ALTER TABLE public.market_analysis_cleanup_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.market_analysis_cleanup_runs FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.market_analysis_cleanup_runs TO service_role;

CREATE OR REPLACE FUNCTION public.preview_market_analysis_cleanup()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public
AS $$
DECLARE allowed text[]:=ARRAY['market_analysis_import_batches','market_analysis_import_rows','auction_opportunities',
 'auction_scrape_runs','source_snapshots','auction_scrape_assets','property_market_comparables','property_market_analyses',
 'property_market_publication_versions','opportunity_validation_steps','opportunity_validation_runs','legal_reviews','dossiers',
 'post_auction_cases','auction_sessions','bid_strategies','opportunity_matches','admin_alerts','agent_runs','intelligence_reports',
 'ai_analysis_runs','scraper_process_notifications','internal_notifications','opportunity_workflow_tasks',
 'property_qualification_dossiers','property_qualification_evidence','property_qualification_feedback'];
 f record; t text; added integer; n integer; active integer:=0; ext integer:=0; active_id uuid;
 targets jsonb:='{}'; counts jsonb:='{}'; fingerprints jsonb:='{}'; ids jsonb; digest text; keys jsonb;
BEGIN
 SELECT id INTO active_id FROM public.market_analysis_cleanup_runs WHERE status IN ('db_processing','storage_pending') LIMIT 1;
 CREATE TEMP TABLE IF NOT EXISTS _betel_cleanup_nodes(relation text NOT NULL,id uuid NOT NULL,PRIMARY KEY(relation,id)) ON COMMIT DROP;
 TRUNCATE pg_temp._betel_cleanup_nodes;
 INSERT INTO pg_temp._betel_cleanup_nodes SELECT 'market_analysis_import_batches',id FROM public.market_analysis_import_batches;
 INSERT INTO pg_temp._betel_cleanup_nodes SELECT 'auction_opportunities',id FROM public.auction_opportunities
 WHERE owner_name ILIKE '%upload de links%' OR raw_payload->>'collectionMode'='uploaded_auction_link'
 OR coalesce(raw_payload->>'importRowId','')<>'' OR coalesce(raw_payload->>'importBatchId','')<>'';
 -- Follow only known analysis-domain FKs. Any unrecognized dependent row blocks below.
 LOOP
  added:=0;
  FOR f IN SELECT c.conrelid::regclass::text child,c.confrelid::regclass::text parent,a.attname col
    FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=c.conkey[1]
    JOIN pg_attribute pa ON pa.attrelid=c.confrelid AND pa.attnum=c.confkey[1]
    WHERE c.contype='f' AND cardinality(c.conkey)=1 AND pa.attname='id'
    AND c.conrelid::regclass::text=ANY(allowed) AND c.confrelid::regclass::text=ANY(allowed)
  LOOP
   EXECUTE format('INSERT INTO pg_temp._betel_cleanup_nodes SELECT %L,t.id FROM public.%I t JOIN pg_temp._betel_cleanup_nodes p ON p.relation=%L AND t.%I=p.id ON CONFLICT DO NOTHING',f.child,f.child,f.parent,f.col);
   GET DIAGNOSTICS n=ROW_COUNT; added:=added+n;
  END LOOP;
  INSERT INTO pg_temp._betel_cleanup_nodes SELECT 'source_snapshots',r.raw_snapshot_id FROM public.auction_scrape_runs r
  JOIN pg_temp._betel_cleanup_nodes n ON n.relation='auction_scrape_runs' AND n.id=r.id WHERE r.raw_snapshot_id IS NOT NULL ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS n=ROW_COUNT; added:=added+n;
  EXIT WHEN added=0;
 END LOOP;
 FOR f IN SELECT c.conrelid::regclass::text child,c.confrelid::regclass::text parent,a.attname col,c.confdeltype action
  FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=c.conkey[1]
  WHERE c.contype='f' AND cardinality(c.conkey)=1 AND c.confrelid::regclass::text=ANY(allowed)
 LOOP
  -- Audit rows survive with their nullable opportunity FK cleared by PostgreSQL.
  IF f.child='audit_logs' AND f.action='n' THEN CONTINUE; END IF;
  EXECUTE format('SELECT count(*) FROM public.%I t JOIN pg_temp._betel_cleanup_nodes p ON p.relation=%L AND t.%I=p.id WHERE NOT EXISTS(SELECT 1 FROM pg_temp._betel_cleanup_nodes q WHERE q.relation=%L AND q.id=t.id)',f.child,f.parent,f.col,f.child) INTO n;
  ext:=ext+n;
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_constraint c WHERE c.contype='f' AND cardinality(c.conkey)<>1 AND c.confrelid::regclass::text=ANY(allowed)) THEN ext:=ext+1; END IF;
 SELECT count(*) INTO active FROM public.auction_scrape_runs r JOIN pg_temp._betel_cleanup_nodes n ON n.relation='auction_scrape_runs' AND n.id=r.id
 WHERE r.status NOT IN ('failed','partial','completed','success') OR r.completed_at IS NULL;
 active:=active+(SELECT count(*) FROM public.market_analysis_import_batches WHERE status NOT IN ('concluido','falha','aguardando_inicio','cancelado'));
 FOR t IN SELECT DISTINCT relation FROM pg_temp._betel_cleanup_nodes ORDER BY relation LOOP
  SELECT jsonb_agg(id ORDER BY id),count(*) INTO ids,n FROM pg_temp._betel_cleanup_nodes WHERE relation=t;
  targets:=targets||jsonb_build_object(t,ids); counts:=counts||jsonb_build_object(t,n);
  EXECUTE format('SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.id),''[]''::jsonb)::text) FROM public.%I t JOIN pg_temp._betel_cleanup_nodes n ON n.relation=%L AND n.id=t.id',t,t) INTO digest;
  fingerprints:=fingerprints||jsonb_build_object(t,digest);
 END LOOP;
 WITH candidate AS (
  SELECT a.id,coalesce(nullif(a.raw_payload->>'storageKey',''),nullif(a.raw_payload->>'storage_key',''),nullif(a.storage_path,''),a.raw_payload->>'url') value
  FROM public.auction_scrape_assets a JOIN pg_temp._betel_cleanup_nodes n ON n.relation='auction_scrape_assets' AND n.id=a.id WHERE a.asset_type='image'
 ), normalized AS (SELECT id,regexp_replace(value,'^https?://[^/]+/','') key FROM candidate), exclusive AS (
  SELECT DISTINCT key FROM normalized x WHERE key ~ '^opportunities/[A-Za-z0-9/_-]+\.(jpg|jpeg|png|webp|gif|avif)$'
  AND NOT EXISTS(SELECT 1 FROM public.auction_scrape_assets a WHERE NOT EXISTS(SELECT 1 FROM pg_temp._betel_cleanup_nodes n WHERE n.relation='auction_scrape_assets' AND n.id=a.id)
   AND (position(x.key in coalesce(a.storage_path,''))>0 OR position(x.key in a.raw_payload::text)>0))
 ) SELECT coalesce(jsonb_agg(key ORDER BY key),'[]') INTO keys FROM exclusive;
 RETURN jsonb_build_object('planHash',md5(jsonb_build_object('targets',targets,'fingerprints',fingerprints,'r2Keys',keys)::text),
  'mode','purge_test_analysis','blocked',active>0 OR ext>0 OR active_id IS NOT NULL,'activeJobs',active,'externalReferences',ext,
  'activeCleanupId',active_id,'reason',CASE WHEN active_id IS NOT NULL THEN 'Limpeza ativa; conciliar armazenamento' WHEN active>0 THEN 'Processamento ativo' WHEN ext>0 THEN 'Referencias externas protegidas' ELSE NULL END,
  'targets',targets,'counts',counts,'batchesFound',coalesce((counts->>'market_analysis_import_batches')::int,0),
  'rowsFound',coalesce((counts->>'market_analysis_import_rows')::int,0),'opportunitiesFound',coalesce((counts->>'auction_opportunities')::int,0),
  'assetsFound',coalesce((counts->>'auction_scrape_assets')::int,0),'opportunitiesProtected',0,'protected','[]'::jsonb,
  'r2Keys',keys,'r2ObjectsFound',jsonb_array_length(keys),'externalAssetsSkipped',coalesce((counts->>'auction_scrape_assets')::int,0)-jsonb_array_length(keys));
END $$;

CREATE OR REPLACE FUNCTION public.prevent_market_version_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_OP='DELETE' AND current_user IN ('postgres','supabase_admin') AND EXISTS (
  SELECT 1 FROM public.market_analysis_cleanup_runs c WHERE c.status='db_processing'
  AND c.transaction_id=txid_current() AND c.backend_pid=pg_backend_pid()
  AND (c.plan->'targets'->'property_market_publication_versions') ? OLD.id::text
 ) THEN RETURN OLD; END IF;
 RAISE EXCEPTION 'Approved market publication versions are immutable';
END $$;

CREATE OR REPLACE FUNCTION public.execute_market_analysis_cleanup(p_plan_hash text,p_confirmation text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE p jsonb; c uuid:=gen_random_uuid(); t text; ids uuid[]; n integer; deleted jsonb:='{}'; v_result jsonb;
 receipt_count bigint; audit_count bigint;
BEGIN
 IF p_confirmation IS DISTINCT FROM 'LIMPAR ANALISE' THEN RAISE EXCEPTION 'Confirmacao invalida'; END IF;
 IF NOT pg_try_advisory_xact_lock(hashtextextended('betel_market_analysis_cleanup',0)) THEN RAISE EXCEPTION 'Cleanup ativo'; END IF;
 -- Stable lock order. Blocks producers throughout database validation and purge.
 FOR t IN SELECT c.relname FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace WHERE ns.nspname='public' AND c.relkind='r' ORDER BY c.relname LOOP
  EXECUTE format('LOCK TABLE public.%I IN SHARE ROW EXCLUSIVE MODE',t);
 END LOOP;
 p:=public.preview_market_analysis_cleanup();
 IF (p->>'blocked')::boolean THEN RAISE EXCEPTION 'Cleanup bloqueado: %',p->>'reason'; END IF;
 IF p_plan_hash IS NULL OR p_plan_hash IS DISTINCT FROM p->>'planHash' THEN RAISE EXCEPTION 'Plan hash mudou; atualize a previa'; END IF;
 SELECT count(*) INTO receipt_count FROM public.llm_operation_receipts;
 SELECT count(*) INTO audit_count FROM public.audit_logs;
 INSERT INTO public.market_analysis_cleanup_runs(id,status,transaction_id,backend_pid,plan_hash,plan)
 VALUES(c,'db_processing',txid_current(),pg_backend_pid(),p_plan_hash,p);
 -- Break only the nullable, scoped rows/runs cycle; rollback restores it on error.
 UPDATE public.market_analysis_import_rows SET scrape_run_id=NULL WHERE id IN (SELECT id FROM pg_temp._betel_cleanup_nodes WHERE relation='market_analysis_import_rows');
 UPDATE public.auction_scrape_runs SET import_row_id=NULL WHERE id IN (SELECT id FROM pg_temp._betel_cleanup_nodes WHERE relation='auction_scrape_runs');
 FOREACH t IN ARRAY ARRAY['property_market_publication_versions','property_market_comparables','property_market_analyses',
  'property_qualification_feedback','property_qualification_evidence','property_qualification_dossiers',
  'opportunity_validation_steps','opportunity_validation_runs','opportunity_workflow_tasks','internal_notifications',
  'legal_reviews','dossiers','post_auction_cases','auction_sessions','bid_strategies','opportunity_matches','admin_alerts',
  'agent_runs','intelligence_reports','ai_analysis_runs','auction_scrape_assets','auction_scrape_runs','source_snapshots',
  'scraper_process_notifications','market_analysis_import_rows','market_analysis_import_batches','auction_opportunities'] LOOP
  IF NOT (p->'targets' ? t) THEN CONTINUE; END IF;
  SELECT array_agg(value::uuid) INTO ids FROM jsonb_array_elements_text(p->'targets'->t);
  EXECUTE format('DELETE FROM public.%I WHERE id=ANY($1)',t) USING ids;
  GET DIAGNOSTICS n=ROW_COUNT; deleted:=deleted||jsonb_build_object(t,n);
 END LOOP;
 IF receipt_count<>(SELECT count(*) FROM public.llm_operation_receipts) OR audit_count<>(SELECT count(*) FROM public.audit_logs) THEN RAISE EXCEPTION 'Preserved records changed'; END IF;
 v_result:=p||jsonb_build_object('cleanupId',c,'rowsDeleted',coalesce((deleted->>'market_analysis_import_rows')::int,0),
 'batchesDeleted',coalesce((deleted->>'market_analysis_import_batches')::int,0),'opportunitiesDeleted',coalesce((deleted->>'auction_opportunities')::int,0),
 'assetsDeleted',coalesce((deleted->>'auction_scrape_assets')::int,0),'scrapeRunsDeleted',coalesce((deleted->>'auction_scrape_runs')::int,0),
 'sourceSnapshotsDeleted',coalesce((deleted->>'source_snapshots')::int,0),'aiAnalysisRunsDeleted',coalesce((deleted->>'ai_analysis_runs')::int,0),
 'marketAnalysesDeleted',coalesce((deleted->>'property_market_analyses')::int,0),'marketComparablesDeleted',coalesce((deleted->>'property_market_comparables')::int,0),
 'publicationVersionsDeleted',coalesce((deleted->>'property_market_publication_versions')::int,0),'notificationsDeleted',coalesce((deleted->>'scraper_process_notifications')::int,0),
 'relatedRowsDeleted',(SELECT coalesce(sum(value::integer),0) FROM jsonb_each_text(deleted) WHERE key NOT IN ('market_analysis_import_rows','market_analysis_import_batches','auction_opportunities','auction_scrape_assets','auction_scrape_runs','source_snapshots','ai_analysis_runs','property_market_analyses','property_market_comparables','property_market_publication_versions','scraper_process_notifications')),'deletedCounts',deleted,'r2ObjectsDeleted',0,'r2ObjectsMissing',0,'r2ObjectsFailed',0,
 'storagePending',jsonb_array_length(p->'r2Keys'),'failures','[]'::jsonb);
 UPDATE public.market_analysis_cleanup_runs SET status=CASE WHEN jsonb_array_length(p->'r2Keys')=0 THEN 'completed' ELSE 'storage_pending' END,
 result=v_result,completed_at=CASE WHEN jsonb_array_length(p->'r2Keys')=0 THEN now() END WHERE id=c;
 RETURN v_result;
END $$;

CREATE OR REPLACE FUNCTION public.finish_market_analysis_cleanup(p_cleanup_id uuid,p_storage_results jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE c public.market_analysis_cleanup_runs%ROWTYPE; item jsonb; key text; pending integer; del integer; missing integer; failed integer; r jsonb;
BEGIN
 SELECT * INTO c FROM public.market_analysis_cleanup_runs WHERE id=p_cleanup_id FOR UPDATE;
 IF NOT FOUND OR c.status='db_processing' THEN RAISE EXCEPTION 'Cleanup desconhecido ou ativo'; END IF;
 IF jsonb_typeof(p_storage_results) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Resultados invalidos'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_storage_results) LOOP
  key:=item->>'storageKey';
  IF key IS NULL OR NOT (c.plan->'r2Keys' ? key) OR coalesce(item->>'status','') NOT IN ('deleted','missing','failed','skipped','unavailable') THEN RAISE EXCEPTION 'Objeto fora do plano'; END IF;
  -- Do not downgrade a verified terminal result on a repeated checkpoint call.
  IF coalesce(c.storage_results->key->>'status','') NOT IN ('deleted','missing') THEN c.storage_results:=c.storage_results||jsonb_build_object(key,item); END IF;
 END LOOP;
 SELECT count(*) FILTER(WHERE value->>'status'='deleted'),count(*) FILTER(WHERE value->>'status'='missing'),
 count(*) FILTER(WHERE value->>'status' NOT IN ('deleted','missing')) INTO del,missing,failed FROM jsonb_each(c.storage_results);
 pending:=jsonb_array_length(c.plan->'r2Keys')-del-missing;
 r:=c.result||jsonb_build_object('r2ObjectsDeleted',del,'r2ObjectsMissing',missing,'r2ObjectsFailed',failed,'storagePending',pending);
 UPDATE public.market_analysis_cleanup_runs SET storage_results=c.storage_results,result=r,status=CASE WHEN pending=0 THEN 'completed' ELSE 'storage_pending' END,completed_at=CASE WHEN pending=0 THEN now() END WHERE id=p_cleanup_id;
 RETURN r;
END $$;

CREATE OR REPLACE FUNCTION public.guard_market_analysis_cleanup()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.market_analysis_cleanup_runs WHERE status IN ('db_processing','storage_pending')
 AND NOT(transaction_id=txid_current() AND backend_pid=pg_backend_pid())) THEN RAISE EXCEPTION 'Cleanup ativo; aguarde a conciliacao das imagens'; END IF;
 RETURN NEW;
END $$;
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['market_analysis_import_batches','market_analysis_import_rows','auction_scrape_runs','auction_opportunities'] LOOP
 EXECUTE format('DROP TRIGGER IF EXISTS guard_market_analysis_cleanup ON public.%I',t);
 EXECUTE format('CREATE TRIGGER guard_market_analysis_cleanup BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.guard_market_analysis_cleanup()',t);
END LOOP; END $$;
REVOKE ALL ON FUNCTION public.preview_market_analysis_cleanup() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.execute_market_analysis_cleanup(text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.finish_market_analysis_cleanup(uuid,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.guard_market_analysis_cleanup() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.preview_market_analysis_cleanup() TO service_role;
GRANT EXECUTE ON FUNCTION public.execute_market_analysis_cleanup(text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_market_analysis_cleanup(uuid,jsonb) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
