-- ============================================================================
-- AI 内容创作与直播电商协同工作台 — Supabase PostgreSQL 完整建表与 RLS 脚本
-- 对应 PROJECT_SPEC.md 第 6 节 + 团队协作/多模态任务扩展
-- 可直接在 Supabase Dashboard -> SQL Editor 中整段执行
-- ============================================================================

create extension if not exists "pgcrypto";

-- 1. 工作空间表（支持个人独立使用与团队协作）
create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid references auth.users(id) on delete cascade not null,
  default_routing jsonb not null default '{}'::jsonb,
  custom_banned_words text[] not null default '{}',
  created_at timestamptz not null default now()
);

-- 2. 空间成员表
create table if not exists public.workspace_members (
  workspace_id uuid references public.workspaces(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  role text check (role in ('owner', 'admin', 'member')) not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

-- 2.1 团队邀请码表（支持通过邀请链接/邀请码加入同一空间）
create table if not exists public.workspace_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade not null,
  invite_code text not null unique,
  role text check (role in ('admin', 'member')) not null default 'member',
  created_by uuid references auth.users(id) on delete cascade not null,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

-- 3. API 密钥与模型配置表（encrypted_api_key 采用 AES-256-GCM 服务端加密存储）
create table if not exists public.api_configs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete set null, -- scope='personal' 时有效
  scope text check (scope in ('workspace', 'personal')) not null default 'workspace',
  provider text not null, -- 'deepseek' | 'moonshot' | 'siliconflow' | 'gemini' | 'image' | 'video' | 'custom'
  api_type text check (api_type in ('text', 'image', 'video')) not null default 'text',
  protocol text not null default 'openai',
  is_default boolean not null default false,
  display_name text not null,
  base_url text not null,
  encrypted_api_key text not null,
  models jsonb not null default '[]'::jsonb,
  image_models jsonb not null default '[]'::jsonb,
  video_models jsonb not null default '[]'::jsonb,
  extra_config jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- 兼容已部署旧表的幂等字段升级
alter table public.api_configs add column if not exists api_type text not null default 'text';
alter table public.api_configs add column if not exists protocol text not null default 'openai';
alter table public.api_configs add column if not exists is_default boolean not null default false;
alter table public.api_configs add column if not exists image_models jsonb not null default '[]'::jsonb;
alter table public.api_configs add column if not exists video_models jsonb not null default '[]'::jsonb;
alter table public.api_configs add column if not exists extra_config jsonb not null default '{}'::jsonb;

-- 4. 产品库表
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade not null,
  created_by uuid references auth.users(id) on delete set null,
  name text not null,
  selling_points text not null default '',
  target_audience text not null default '',
  specs_and_price text not null default '',
  banned_words text[] not null default '{}',
  reference_images jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 5. 云端素材库表（文案、话术、图片、视频统一存储）
create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade not null,
  created_by uuid references auth.users(id) on delete set null,
  product_id uuid references public.products(id) on delete set null,
  asset_type text check (asset_type in ('copywriting', 'script', 'image', 'video')) not null,
  visibility text check (visibility in ('workspace', 'private')) not null default 'workspace',
  title text not null,
  content text,
  file_url text, -- Cloudflare R2 存储地址（严禁将图片/视频 Base64 写入数据库）
  generation_meta jsonb not null default '{}'::jsonb,
  tags text[] not null default '{}',
  is_starred boolean not null default false,
  created_at timestamptz not null default now()
);

-- 6. AI 对话会话与消息表
create table if not exists public.chat_sessions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  product_id uuid references public.products(id) on delete set null,
  title text not null,
  model_config_id uuid references public.api_configs(id) on delete set null,
  model_name text,
  is_pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references public.chat_sessions(id) on delete cascade not null,
  role text check (role in ('system', 'user', 'assistant')) not null,
  content text not null,
  reasoning_content text,
  created_at timestamptz not null default now()
);

-- 7. 多模态异步生成任务表（图片 / 视频异步轮询）
create table if not exists public.media_tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade not null,
  created_by uuid references auth.users(id) on delete set null,
  product_id uuid references public.products(id) on delete set null,
  api_config_id uuid references public.api_configs(id) on delete set null,
  task_type text check (task_type in ('image', 'video')) not null,
  mode text check (mode in ('t2i', 'i2i', 't2v', 'i2v', 'first_last_frame')) not null,
  node_id text,
  provider_name text,
  provider_task_id text,
  status text check (status in ('pending', 'processing', 'succeeded', 'failed')) not null default 'pending',
  progress integer not null default 0,
  prompt text not null,
  negative_prompt text,
  aspect_ratio text not null default '9:16',
  resolution text,
  duration_sec integer,
  fps integer,
  camera_movement text,
  model_name text not null default '',
  batch_count integer not null default 1,
  reference_image_url text,
  input_snapshot jsonb not null default '{}'::jsonb,
  result_urls jsonb not null default '[]'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 常用检索索引
create index if not exists idx_workspace_members_user on public.workspace_members(user_id);
create index if not exists idx_api_configs_workspace on public.api_configs(workspace_id);
create index if not exists idx_products_workspace on public.products(workspace_id);
create index if not exists idx_assets_workspace_type on public.assets(workspace_id, asset_type);
create index if not exists idx_assets_tags on public.assets using gin(tags);
create index if not exists idx_chat_sessions_user on public.chat_sessions(workspace_id, user_id);
create index if not exists idx_chat_messages_session on public.chat_messages(session_id, created_at);
create index if not exists idx_media_tasks_workspace on public.media_tasks(workspace_id, created_at desc);

-- ============================================================================
-- 防递归权限辅助函数（SECURITY DEFINER）
-- ============================================================================

create or replace function public.is_workspace_member(_workspace_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = _workspace_id
      and wm.user_id = auth.uid()
  );
$$;

create or replace function public.is_workspace_admin(_workspace_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = _workspace_id
      and wm.user_id = auth.uid()
      and wm.role in ('owner', 'admin')
  );
$$;

-- ============================================================================
-- 行级安全策略 (Row Level Security)
-- ============================================================================

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.workspace_invites enable row level security;
alter table public.api_configs enable row level security;
alter table public.products enable row level security;
alter table public.assets enable row level security;
alter table public.chat_sessions enable row level security;
alter table public.chat_messages enable row level security;
alter table public.media_tasks enable row level security;

-- workspaces
drop policy if exists "workspaces_select_member" on public.workspaces;
create policy "workspaces_select_member" on public.workspaces
  for select using (owner_id = auth.uid() or public.is_workspace_member(id));

drop policy if exists "workspaces_insert_auth" on public.workspaces;
create policy "workspaces_insert_auth" on public.workspaces
  for insert with check (auth.uid() = owner_id);

drop policy if exists "workspaces_update_admin" on public.workspaces;
create policy "workspaces_update_admin" on public.workspaces
  for update using (public.is_workspace_admin(id));

drop policy if exists "workspaces_delete_owner" on public.workspaces;
create policy "workspaces_delete_owner" on public.workspaces
  for delete using (owner_id = auth.uid());

-- workspace_members
drop policy if exists "workspace_members_select" on public.workspace_members;
create policy "workspace_members_select" on public.workspace_members
  for select using (user_id = auth.uid() or public.is_workspace_member(workspace_id));

drop policy if exists "workspace_members_insert_self_or_admin" on public.workspace_members;
create policy "workspace_members_insert_self_or_admin" on public.workspace_members
  for insert with check (
    public.is_workspace_admin(workspace_id)
    or (
      user_id = auth.uid()
      and exists (
        select 1 from public.workspaces w
        where w.id = workspace_id and w.owner_id = auth.uid()
      )
    )
  );

drop policy if exists "workspace_members_update_admin" on public.workspace_members;
create policy "workspace_members_update_admin" on public.workspace_members
  for update using (public.is_workspace_admin(workspace_id));

drop policy if exists "workspace_members_delete_self_or_admin" on public.workspace_members;
create policy "workspace_members_delete_self_or_admin" on public.workspace_members
  for delete using (user_id = auth.uid() or public.is_workspace_admin(workspace_id));

-- workspace_invites
drop policy if exists "workspace_invites_select_member" on public.workspace_invites;
create policy "workspace_invites_select_member" on public.workspace_invites
  for select using (public.is_workspace_member(workspace_id));

drop policy if exists "workspace_invites_insert_admin" on public.workspace_invites;
create policy "workspace_invites_insert_admin" on public.workspace_invites
  for insert with check (public.is_workspace_admin(workspace_id) and created_by = auth.uid());

drop policy if exists "workspace_invites_delete_admin" on public.workspace_invites;
create policy "workspace_invites_delete_admin" on public.workspace_invites
  for delete using (public.is_workspace_admin(workspace_id));

-- api_configs（团队公共 Key 全员可用但仅管理员可改；个人私有 Key 仅本人可见可改）
drop policy if exists "api_configs_select" on public.api_configs;
create policy "api_configs_select" on public.api_configs
  for select using (
    (scope = 'workspace' and public.is_workspace_member(workspace_id))
    or (scope = 'personal' and user_id = auth.uid() and public.is_workspace_member(workspace_id))
  );

drop policy if exists "api_configs_insert" on public.api_configs;
create policy "api_configs_insert" on public.api_configs
  for insert with check (
    (scope = 'workspace' and public.is_workspace_admin(workspace_id))
    or (scope = 'personal' and user_id = auth.uid() and public.is_workspace_member(workspace_id))
  );

drop policy if exists "api_configs_update" on public.api_configs;
create policy "api_configs_update" on public.api_configs
  for update using (
    (scope = 'workspace' and public.is_workspace_admin(workspace_id))
    or (scope = 'personal' and user_id = auth.uid())
  );

drop policy if exists "api_configs_delete" on public.api_configs;
create policy "api_configs_delete" on public.api_configs
  for delete using (
    (scope = 'workspace' and public.is_workspace_admin(workspace_id))
    or (scope = 'personal' and user_id = auth.uid())
  );

-- products（空间成员共享维护）
drop policy if exists "products_select_member" on public.products;
create policy "products_select_member" on public.products
  for select using (public.is_workspace_member(workspace_id));

drop policy if exists "products_insert_member" on public.products;
create policy "products_insert_member" on public.products
  for insert with check (public.is_workspace_member(workspace_id));

drop policy if exists "products_update_member" on public.products;
create policy "products_update_member" on public.products
  for update using (public.is_workspace_member(workspace_id));

drop policy if exists "products_delete_member" on public.products;
create policy "products_delete_member" on public.products
  for delete using (public.is_workspace_member(workspace_id));

-- assets（visibility='workspace' 空间共享；visibility='private' 仅创建者可见）
drop policy if exists "assets_select" on public.assets;
create policy "assets_select" on public.assets
  for select using (
    public.is_workspace_member(workspace_id)
    and (visibility = 'workspace' or created_by = auth.uid())
  );

drop policy if exists "assets_insert_member" on public.assets;
create policy "assets_insert_member" on public.assets
  for insert with check (
    public.is_workspace_member(workspace_id)
    and (created_by is null or created_by = auth.uid())
  );

drop policy if exists "assets_update_owner_or_shared" on public.assets;
create policy "assets_update_owner_or_shared" on public.assets
  for update using (
    public.is_workspace_member(workspace_id)
    and (created_by = auth.uid() or public.is_workspace_admin(workspace_id))
  );

drop policy if exists "assets_delete_owner_or_admin" on public.assets;
create policy "assets_delete_owner_or_admin" on public.assets
  for delete using (
    public.is_workspace_member(workspace_id)
    and (created_by = auth.uid() or public.is_workspace_admin(workspace_id))
  );

-- chat_sessions & chat_messages（仅会话所属用户可见与操作）
drop policy if exists "chat_sessions_all_owner" on public.chat_sessions;
create policy "chat_sessions_all_owner" on public.chat_sessions
  for all
  using (user_id = auth.uid() and public.is_workspace_member(workspace_id))
  with check (user_id = auth.uid() and public.is_workspace_member(workspace_id));

drop policy if exists "chat_messages_all_owner" on public.chat_messages;
create policy "chat_messages_all_owner" on public.chat_messages
  for all
  using (
    exists (
      select 1 from public.chat_sessions cs
      where cs.id = session_id and cs.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.chat_sessions cs
      where cs.id = session_id and cs.user_id = auth.uid()
    )
  );

-- media_tasks（空间成员可创建并查看自己或团队任务）
drop policy if exists "media_tasks_select_member" on public.media_tasks;
create policy "media_tasks_select_member" on public.media_tasks
  for select using (public.is_workspace_member(workspace_id));

drop policy if exists "media_tasks_insert_member" on public.media_tasks;
create policy "media_tasks_insert_member" on public.media_tasks
  for insert with check (public.is_workspace_member(workspace_id));

drop policy if exists "media_tasks_update_member" on public.media_tasks;
create policy "media_tasks_update_member" on public.media_tasks
  for update using (public.is_workspace_member(workspace_id));

-- 8. V2.0 节点画布工作流表
create table if not exists public.canvas_workflows (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade not null,
  created_by uuid references auth.users(id) on delete set null,
  name text not null,
  description text not null default '',
  nodes jsonb not null default '[]'::jsonb,
  edges jsonb not null default '[]'::jsonb,
  viewport jsonb not null default '{"x":0,"y":0,"zoom":1}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_canvas_workflows_workspace on public.canvas_workflows(workspace_id, updated_at desc);

alter table public.canvas_workflows enable row level security;

drop policy if exists "canvas_workflows_select_member" on public.canvas_workflows;
create policy "canvas_workflows_select_member" on public.canvas_workflows
  for select using (public.is_workspace_member(workspace_id));

drop policy if exists "canvas_workflows_insert_member" on public.canvas_workflows;
create policy "canvas_workflows_insert_member" on public.canvas_workflows
  for insert with check (public.is_workspace_member(workspace_id));

drop policy if exists "canvas_workflows_update_member" on public.canvas_workflows;
create policy "canvas_workflows_update_member" on public.canvas_workflows
  for update using (public.is_workspace_member(workspace_id));

drop policy if exists "canvas_workflows_delete_member" on public.canvas_workflows;
create policy "canvas_workflows_delete_member" on public.canvas_workflows
  for delete using (public.is_workspace_member(workspace_id));

-- ============================================================================
-- 注册时自动创建默认个人工作空间触发器
-- ============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_ws_id uuid;
begin
  insert into public.workspaces (name, owner_id)
  values ('个人工作空间', new.id)
  returning id into new_ws_id;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (new_ws_id, new.id, 'owner');

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
