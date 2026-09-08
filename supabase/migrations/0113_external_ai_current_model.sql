-- Verified 2026-09-08: this account returns HTTP 404 for Gemini 2.5 Flash/Pro.
-- Gemini 3.6 Flash countTokens succeeds. Preserve old models for historical usage.
-- Official USD prices: https://ai.google.dev/gemini-api/docs/pricing
-- Existing ConnectyHub policy: BRL/USD guardrail 6, markup 4, BRL 0.01/credit.
do $migration$
declare cc uuid;feature uuid;model uuid;row record;
begin
 select id into cc from public.provider_cost_centers where provider='gemini';
 if cc is null then raise exception 'GEMINI_COST_CENTER_REQUIRED';end if;
 insert into public.provider_features(cost_center_id,feature_code,name,description,unit,enabled,billable)
 values(cc,'external_ai','API de IA ConnectyHub','Geração e análise nos projetos externos com saldo compartilhado.','input_token',true,true)
 on conflict(cost_center_id,feature_code) do update set name=excluded.name returning id into feature;
 insert into public.provider_models(cost_center_id,provider_model_id,display_name,feature_code,supports_billing,enabled,input_unit,output_unit,metadata)
 values(cc,'gemini-3.6-flash','Gemini 3.6 Flash','external_ai',true,true,'input_token','output_token','{"external_ai_available":true,"verified_at":"2026-09-08"}')
 on conflict(cost_center_id,provider_model_id) do update set enabled=true,metadata=provider_models.metadata||excluded.metadata returning id into model;
 update public.provider_models set metadata=metadata||'{"external_ai_available":false,"external_ai_unavailable_reason":"Provider returned 404 for this account on 2026-09-08"}'::jsonb where cost_center_id=cc and provider_model_id in ('gemini-2.5-flash','gemini-2.5-pro');
 for row in select * from (values
  ('input_token',0.00000450::numeric,0.0018::numeric,now(),'2027-01-01T00:00:00Z'::timestamptz,0.75::numeric),
  ('output_token',0.00002250::numeric,0.009::numeric,now(),'2027-01-01T00:00:00Z'::timestamptz,3.75::numeric),
  ('input_token',0.00000900::numeric,0.0036::numeric,'2027-01-01T00:00:00Z'::timestamptz,null::timestamptz,1.50::numeric),
  ('output_token',0.00004500::numeric,0.018::numeric,'2027-01-01T00:00:00Z'::timestamptz,null::timestamptz,7.50::numeric)
 ) as rates(unit,cost,price,starts,ends,usd_per_million) loop
  insert into public.billing_rates(cost_center_id,feature_id,model_id,unit,provider_cost_per_unit,connecty_price_per_unit,margin_multiplier,minimum_charge_credits,currency,effective_from,effective_to,active,metadata)
  values(cc,feature,model,row.unit::public.billing_unit,row.cost,row.price,4,1,'BRL',row.starts,row.ends,true,
   jsonb_build_object('seed','external_ai_2026_09','pricing_source','https://ai.google.dev/gemini-api/docs/pricing','usd_per_million',row.usd_per_million,'usd_fx_guardrail',6,'markup_on_provider_cost',4,'credit_unit_brl',0.01,'cost_is_brl_estimate',true));
 end loop;
end $migration$;
