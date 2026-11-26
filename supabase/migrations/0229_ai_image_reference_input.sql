-- Image editing uses metered image inputs on the same existing image models.
-- Does not enable a model, change a rate, or bypass project/key ownership.
update public.ai_public_models
set capabilities = '["image_input"]'::jsonb || capabilities
where id in ('flash-2.5-image','pro-3-image-preview','pro-3-image','image-pro-preview','flash-3.1-image-preview','flash-3.1-image','flash-lite-3.1-image')
  and family = 'image' and not (capabilities ? 'image_input');
