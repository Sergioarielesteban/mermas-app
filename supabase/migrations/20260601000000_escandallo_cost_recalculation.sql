-- ──────────────────────────────────────────────────────────────────────────────
-- Migración: Recálculo controlado de costes en Escandallos
-- Fecha: 2026-06-01
-- ──────────────────────────────────────────────────────────────────────────────

-- 1. Caché de coste en escandallo_recipes
--    cached_cost_eur  → coste total calculado en la última ejecución de recálculo
--    cost_cached_at   → marca temporal de ese recálculo
ALTER TABLE escandallo_recipes
  ADD COLUMN IF NOT EXISTS cached_cost_eur   float8,
  ADD COLUMN IF NOT EXISTS cost_cached_at    timestamptz;

-- 2. Cola de recálculo controlado
--    Cada fila representa una receta pendiente de recalcular, con origen y motivo.
--    Una receta solo puede tener UN registro 'pending' por (local_id, recipe_id).
--    Los registros 'done'/'error' se mantienen para trazabilidad/auditoría.
CREATE TABLE IF NOT EXISTS escandallo_cost_dirty_queue (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  local_id        uuid        NOT NULL,
  recipe_id       uuid        NOT NULL,
  source_type     text        NOT NULL,          -- 'raw' | 'processed' | 'subrecipe' | 'central_kitchen' | 'manual'
  source_id       text,                          -- ID del origen (supplier_product_id, article_id, etc.)
  reason          text,                          -- descripción libre del disparador
  status          text        NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending','processing','done','error')),
  attempts        int         NOT NULL DEFAULT 0,
  error_message   text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  processed_at    timestamptz,
  recalculated_at timestamptz
);

-- Índices de consulta
CREATE INDEX IF NOT EXISTS idx_escandallo_dirty_local_status_created
  ON escandallo_cost_dirty_queue (local_id, status, created_at);

CREATE INDEX IF NOT EXISTS idx_escandallo_dirty_recipe_status
  ON escandallo_cost_dirty_queue (recipe_id, status);

-- Constraint: evita duplicar entradas pendientes para la misma receta en el mismo local.
-- Permite múltiples entradas históricas (done/error) pero solo una 'pending'.
CREATE UNIQUE INDEX IF NOT EXISTS uq_escandallo_dirty_pending_per_recipe
  ON escandallo_cost_dirty_queue (local_id, recipe_id)
  WHERE status = 'pending';

-- ──────────────────────────────────────────────────────────────────────────────
-- Rollback reference (ejecutar manualmente si se necesita revertir):
--
-- DROP TABLE IF EXISTS escandallo_cost_dirty_queue;
-- ALTER TABLE escandallo_recipes
--   DROP COLUMN IF EXISTS cached_cost_eur,
--   DROP COLUMN IF EXISTS cost_cached_at;
-- ──────────────────────────────────────────────────────────────────────────────
