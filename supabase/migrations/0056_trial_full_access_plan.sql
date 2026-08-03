-- Trial should be presented and configured as full-access for 7 days.
-- After the trial expires or credits end, billing guards block access until a paid plan is activated.

do $$
begin
  update public.billing_plans
  set
    short_description = 'Teste completo de 7 dias com creditos para validar atendimento, produtos, IA e automacoes.',
    module_codes = array[
      'whatsapp_agent',
      'sales_catalog',
      'crm_basic',
      'automations',
      'voice_ai',
      'api_whatsapp',
      'reports',
      'team_users'
    ]::text[],
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'trial_full_access', true,
      'trial_block_after_expiration', true,
      'updated_by', '0056_trial_full_access_plan',
      'updated_at', now()
    ),
    updated_at = now()
  where plan_code = 'trial';
exception
  when undefined_table or undefined_column then null;
end $$;
