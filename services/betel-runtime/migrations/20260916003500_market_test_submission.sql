-- One approval/test submission per caller-generated request UUID.
-- The application validates permissions and review content before claiming.
-- A processing or uncertain claim never expires or becomes retryable here.
BEGIN;

CREATE TABLE public.market_test_submissions (
  id uuid PRIMARY KEY,
  request_hash text NOT NULL CHECK (
    length(request_hash) BETWEEN 1 AND 256 AND request_hash = btrim(request_hash)
  ),
  status text NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing', 'completed', 'failed', 'uncertain')),
  result jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(result) = 'object'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.market_test_submissions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.market_test_submissions FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.market_test_submissions TO service_role;

CREATE FUNCTION public.claim_market_test_submission(p_id uuid, p_request_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
DECLARE
  v_claimed boolean;
  v_row public.market_test_submissions%ROWTYPE;
BEGIN
  IF p_id IS NULL OR p_request_hash IS NULL OR length(p_request_hash) NOT BETWEEN 1 AND 256
     OR p_request_hash <> btrim(p_request_hash) THEN
    RAISE EXCEPTION 'Invalid market test request identity' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.market_test_submissions(id, request_hash)
  VALUES (p_id, p_request_hash) ON CONFLICT (id) DO NOTHING;
  v_claimed := FOUND;

  SELECT * INTO STRICT v_row FROM public.market_test_submissions WHERE id = p_id FOR UPDATE;
  IF v_row.request_hash <> p_request_hash THEN
    RAISE EXCEPTION 'Market test request hash mismatch' USING ERRCODE = '22023';
  END IF;
  RETURN jsonb_build_object('claimed', v_claimed, 'status', v_row.status, 'result', v_row.result);
END;
$$;

CREATE FUNCTION public.finish_market_test_submission(
  p_id uuid, p_request_hash text, p_status text, p_result jsonb
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
DECLARE v_row public.market_test_submissions%ROWTYPE;
BEGIN
  IF p_status IS NULL OR p_status NOT IN ('completed', 'failed', 'uncertain')
     OR jsonb_typeof(p_result) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Invalid market test terminal result' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_row FROM public.market_test_submissions WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown market test submission' USING ERRCODE = '22023';
  END IF;
  IF v_row.request_hash IS DISTINCT FROM p_request_hash THEN
    RAISE EXCEPTION 'Market test request hash mismatch' USING ERRCODE = '22023';
  END IF;

  IF v_row.status = 'processing' THEN
    UPDATE public.market_test_submissions
    SET status = p_status, result = p_result, updated_at = clock_timestamp()
    WHERE id = p_id RETURNING * INTO v_row;
  ELSIF v_row.status <> p_status OR v_row.result <> p_result THEN
    RAISE EXCEPTION 'Market test terminal result is immutable' USING ERRCODE = '22023';
  END IF;
  RETURN jsonb_build_object('status', v_row.status, 'result', v_row.result);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_market_test_submission(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finish_market_test_submission(uuid, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_market_test_submission(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_market_test_submission(uuid, text, text, jsonb) TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
