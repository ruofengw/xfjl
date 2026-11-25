-- ============================================================================
-- Migration 002: API 三分类隔离（图片 / 视频 / 文本）、媒体任务扩展与画布视口持久化
-- 安全策略：仅新增带默认值的列，完全保留旧数据与旧字段兼容
-- ============================================================================

-- 1. api_configs 新增独立类型、协议、默认标识、图片模型列表及扩展能力配置
alter table public.api_configs
  add column if not exists api_type text check (api_type in ('text', 'image', 'video')) not null default 'text';

alter table public.api_configs
  add column if not exists protocol text not null default 'openai';

alter table public.api_configs
  add column if not exists is_default boolean not null default false;

alter table public.api_configs
  add column if not exists image_models jsonb not null default '[]'::jsonb;

alter table public.api_configs
  add column if not exists video_models jsonb not null default '[]'::jsonb;

alter table public.api_configs
  add column if not exists extra_config jsonb not null default '{}'::jsonb;

-- 对历史旧配置做兼容归类：若 provider='video' 或仅有 video_models，归入 video
update public.api_configs
set api_type = 'video'
where api_type = 'text'
  and (
    provider = 'video'
    or (jsonb_array_length(coalesce(models, '[]'::jsonb)) = 0
        and jsonb_array_length(coalesce(video_models, '[]'::jsonb)) > 0)
  );

create index if not exists idx_api_configs_workspace_type
  on public.api_configs(workspace_id, api_type);

-- 2. canvas_workflows 新增视口持久化字段
alter table public.canvas_workflows
  add column if not exists viewport jsonb not null default '{"x":0,"y":0,"zoom":1}'::jsonb;

-- 3. media_tasks 新增画布节点关联、分辨率、时长、帧率、运镜、供应商名与参数快照
alter table public.media_tasks
  add column if not exists node_id text;

alter table public.media_tasks
  add column if not exists resolution text;

alter table public.media_tasks
  add column if not exists duration_sec integer;

alter table public.media_tasks
  add column if not exists fps integer;

alter table public.media_tasks
  add column if not exists camera_movement text;

alter table public.media_tasks
  add column if not exists provider_name text;

alter table public.media_tasks
  add column if not exists input_snapshot jsonb not null default '{}'::jsonb;

-- 支持删除自己或团队空间内的历史生成任务
drop policy if exists "media_tasks_delete_member" on public.media_tasks;
create policy "media_tasks_delete_member" on public.media_tasks
  for delete using (public.is_workspace_member(workspace_id));
