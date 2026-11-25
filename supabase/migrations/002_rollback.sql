-- ============================================================================
-- Rollback 002: 回滚 Migration 002 新增字段与索引（保留原有基础表与旧数据）
-- ============================================================================

drop policy if exists "media_tasks_delete_member" on public.media_tasks;

alter table public.media_tasks
  drop column if exists node_id,
  drop column if exists resolution,
  drop column if exists duration_sec,
  drop column if exists fps,
  drop column if exists camera_movement,
  drop column if exists provider_name,
  drop column if exists input_snapshot;

alter table public.canvas_workflows
  drop column if exists viewport;

drop index if exists idx_api_configs_workspace_type;

alter table public.api_configs
  drop column if exists api_type,
  drop column if exists protocol,
  drop column if exists is_default,
  drop column if exists image_models,
  drop column if exists extra_config;
