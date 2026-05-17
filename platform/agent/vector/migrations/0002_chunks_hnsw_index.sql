-- HNSW index on the embedding column, vector_cosine_ops opclass. Drizzle
-- 0.45.2 cannot express WITH-storage parameters; the index lives in a
-- hand-authored migration.
--
-- Bulk-build tuning (operator-applied in a platform_admin session BEFORE
-- running this migration on a populated table; intentionally NOT part of
-- the migration body):
--   SET maintenance_work_mem = '8GB';
--   SET max_parallel_maintenance_workers = 7;
-- Defaults m=16, ef_construction=128 match setup.md §6.
CREATE INDEX "chunks_embedding_idx" ON "agent_vector"."chunks"
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 128);
