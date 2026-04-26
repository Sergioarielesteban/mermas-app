-- Documentación: el token de acceso público al lote es `qr_token` (UUID único, default gen_random_uuid()).
-- Las URLs de QR deben ser /cocina-central/lote/{id}?token={qr_token}; no se admite acceso sin token.
comment on column public.production_batches.qr_token is
  'Token secreto obligatorio en enlaces y códigos QR del lote (no exponer la ficha solo con el id).';
