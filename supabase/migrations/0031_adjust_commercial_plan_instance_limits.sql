update public.billing_plans
set
  agent_limit = 4,
  whatsapp_instance_limit = 4,
  metadata = metadata || '{"agent_whatsapp_ratio":"1:1","limit_update":"pro_4_agents_4_whatsapps"}'::jsonb,
  updated_at = now()
where plan_code = 'pro';

update public.billing_plans
set
  agent_limit = 8,
  whatsapp_instance_limit = 8,
  metadata = metadata || '{"agent_whatsapp_ratio":"1:1","limit_update":"scale_8_agents_8_whatsapps"}'::jsonb,
  updated_at = now()
where plan_code = 'scale';
