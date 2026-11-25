import crypto from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { decryptApiKey, encryptApiKey, maskApiKey } from '@/lib/crypto';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import {
  createSupabaseAdminClient,
  createSupabaseServerClient,
} from '@/lib/supabase/server';
import {
  DEMO_USER_EMAIL,
  DEMO_USER_ID,
  readLocalStore,
  writeLocalStore,
  type StoredApiConfigRecord,
} from './local-store';
import type {
  ApiCategory,
  ApiConfigPublic,
  ApiExtraConfig,
  ApiProtocol,
  ApiProvider,
  ApiScope,
  Asset,
  AssetType,
  AssetVisibility,
  CanvasFlowEdge,
  CanvasFlowNode,
  CanvasViewport,
  CanvasWorkflow,
  ChatMessage,
  ChatSession,
  DefaultRouting,
  GenerationMeta,
  MediaGenerationMode,
  MediaTask,
  MediaTaskStatus,
  MediaTaskType,
  Product,
  Workspace,
  WorkspaceRole,
} from '@/lib/types';

export interface AuthContext {
  userId: string;
  email: string;
  isDemo: boolean;
  supabase: SupabaseClient | null;
}

export async function getAuthContext(): Promise<AuthContext | null> {
  if (!isSupabaseConfigured()) {
    return {
      userId: DEMO_USER_ID,
      email: DEMO_USER_EMAIL,
      isDemo: true,
      supabase: null,
    };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  return {
    userId: user.id,
    email: user.email || 'user@workspace',
    isDemo: false,
    supabase,
  };
}

function inferApiType(record: Partial<StoredApiConfigRecord>): ApiCategory {
  if (
    record.api_type === 'image' ||
    record.api_type === 'video' ||
    record.api_type === 'text'
  ) {
    return record.api_type;
  }
  if (
    record.provider === 'video' ||
    ((!record.models || record.models.length === 0) &&
      Array.isArray(record.video_models) &&
      record.video_models.length > 0)
  ) {
    return 'video';
  }
  if (
    record.provider === 'image' ||
    ((!record.models || record.models.length === 0) &&
      Array.isArray(record.image_models) &&
      record.image_models.length > 0)
  ) {
    return 'image';
  }
  return 'text';
}

function toPublicApiConfig(record: StoredApiConfigRecord): ApiConfigPublic {
  const apiType = inferApiType(record);
  const stdModels = Array.isArray(record.models) ? record.models : [];
  const imgModels = Array.isArray(record.image_models) ? record.image_models : [];
  const vidModels = Array.isArray(record.video_models) ? record.video_models : [];

  return {
    id: record.id,
    workspace_id: record.workspace_id,
    user_id: record.user_id,
    scope: record.scope,
    api_type: apiType,
    protocol: (record.protocol || 'openai') as ApiProtocol,
    is_default: Boolean(record.is_default),
    provider: record.provider,
    display_name: record.display_name,
    base_url: record.base_url,
    masked_api_key: maskApiKey(record.encrypted_api_key),
    models: stdModels,
    image_models: apiType === 'image' && imgModels.length === 0 ? stdModels : imgModels,
    video_models: vidModels,
    extra_config: record.extra_config && typeof record.extra_config === 'object'
      ? record.extra_config
      : {},
    is_active: record.is_active,
    created_at: record.created_at,
  };
}

// ============================================================================
// Workspaces & Team Collaboration
// ============================================================================

export async function ensureUserWorkspaces(ctx: AuthContext): Promise<Workspace[]> {
  if (ctx.isDemo || !ctx.supabase) {
    const store = readLocalStore();
    return store.workspaces.map((ws) => {
      const member = store.workspace_members.find(
        (m) => m.workspace_id === ws.id && m.user_id === ctx.userId
      );
      return {
        ...ws,
        role: member?.role || 'owner',
      };
    });
  }

  const { data: memberships, error: memError } = await ctx.supabase
    .from('workspace_members')
    .select('workspace_id, role, workspaces(id, name, owner_id, default_routing, custom_banned_words, created_at)')
    .eq('user_id', ctx.userId);

  if (memError) {
    throw new Error(`查询工作空间失败: ${memError.message}`);
  }

  const list: Workspace[] = [];
  for (const row of memberships || []) {
    const ws = Array.isArray(row.workspaces) ? row.workspaces[0] : row.workspaces;
    if (ws) {
      list.push({
        id: ws.id,
        name: ws.name,
        owner_id: ws.owner_id,
        role: row.role as WorkspaceRole,
        default_routing: ws.default_routing || {},
        custom_banned_words: ws.custom_banned_words || [],
        created_at: ws.created_at,
      });
    }
  }

  if (list.length > 0) {
    return list;
  }

  // Fallback idempotent creation when auth trigger didn't run
  const { data: createdWs, error: wsErr } = await ctx.supabase
    .from('workspaces')
    .insert({ name: '个人工作空间', owner_id: ctx.userId })
    .select()
    .single();

  if (wsErr || !createdWs) {
    throw new Error(`自动创建默认工作空间失败: ${wsErr?.message || '未知错误'}`);
  }

  await ctx.supabase.from('workspace_members').upsert({
    workspace_id: createdWs.id,
    user_id: ctx.userId,
    role: 'owner',
  });

  return [
    {
      id: createdWs.id,
      name: createdWs.name,
      owner_id: createdWs.owner_id,
      role: 'owner',
      default_routing: createdWs.default_routing || {},
      custom_banned_words: createdWs.custom_banned_words || [],
      created_at: createdWs.created_at,
    },
  ];
}

export async function createWorkspaceRecord(
  ctx: AuthContext,
  name: string
): Promise<Workspace> {
  const cleanName = name.trim();
  if (!cleanName) throw new Error('工作空间名称不能为空');

  if (ctx.isDemo || !ctx.supabase) {
    const store = readLocalStore();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const ws = {
      id,
      name: cleanName,
      owner_id: ctx.userId,
      default_routing: {},
      custom_banned_words: [],
      created_at: now,
    };
    store.workspaces.push(ws);
    store.workspace_members.push({
      workspace_id: id,
      user_id: ctx.userId,
      role: 'owner',
      joined_at: now,
    });
    writeLocalStore(store);
    return { ...ws, role: 'owner' };
  }

  const { data: createdWs, error } = await ctx.supabase
    .from('workspaces')
    .insert({ name: cleanName, owner_id: ctx.userId })
    .select()
    .single();

  if (error || !createdWs) {
    throw new Error(error?.message || '创建工作空间失败');
  }

  await ctx.supabase.from('workspace_members').upsert({
    workspace_id: createdWs.id,
    user_id: ctx.userId,
    role: 'owner',
  });

  return {
    id: createdWs.id,
    name: createdWs.name,
    owner_id: createdWs.owner_id,
    role: 'owner',
    default_routing: createdWs.default_routing || {},
    custom_banned_words: createdWs.custom_banned_words || [],
    created_at: createdWs.created_at,
  };
}

export async function createWorkspaceInviteCode(
  ctx: AuthContext,
  workspaceId: string,
  role: 'admin' | 'member' = 'member'
): Promise<string> {
  const inviteCode = `TEAM-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

  if (ctx.isDemo || !ctx.supabase) {
    const store = readLocalStore();
    store.workspace_invites.push({
      id: crypto.randomUUID(),
      workspace_id: workspaceId,
      invite_code: inviteCode,
      role,
      created_by: ctx.userId,
      created_at: new Date().toISOString(),
    });
    writeLocalStore(store);
    return inviteCode;
  }

  const { error } = await ctx.supabase.from('workspace_invites').insert({
    workspace_id: workspaceId,
    invite_code: inviteCode,
    role,
    created_by: ctx.userId,
  });

  if (error) {
    throw new Error(`创建邀请码失败: ${error.message}`);
  }
  return inviteCode;
}

export async function joinWorkspaceByInviteCode(
  ctx: AuthContext,
  inviteCode: string
): Promise<Workspace> {
  const cleanCode = inviteCode.trim().toUpperCase();
  if (!cleanCode) throw new Error('邀请码不能为空');

  if (ctx.isDemo || !ctx.supabase) {
    const store = readLocalStore();
    const invite = store.workspace_invites.find(
      (i) => i.invite_code.toUpperCase() === cleanCode
    );
    if (!invite) {
      throw new Error('邀请码无效或已过期');
    }
    const existing = store.workspace_members.find(
      (m) => m.workspace_id === invite.workspace_id && m.user_id === ctx.userId
    );
    if (!existing) {
      store.workspace_members.push({
        workspace_id: invite.workspace_id,
        user_id: ctx.userId,
        role: invite.role,
        joined_at: new Date().toISOString(),
      });
      writeLocalStore(store);
    }
    const ws = store.workspaces.find((w) => w.id === invite.workspace_id);
    if (!ws) throw new Error('目标工作空间不存在');
    return { ...ws, role: existing?.role || invite.role };
  }

  const admin = createSupabaseAdminClient();
  const db = admin || ctx.supabase;

  const { data: invite, error: inviteErr } = await db
    .from('workspace_invites')
    .select('*')
    .eq('invite_code', cleanCode)
    .maybeSingle();

  if (inviteErr || !invite) {
    throw new Error('邀请码无效或不存在');
  }

  const { error: joinErr } = await db.from('workspace_members').upsert({
    workspace_id: invite.workspace_id,
    user_id: ctx.userId,
    role: invite.role || 'member',
  });

  if (joinErr) {
    throw new Error(`加入工作空间失败: ${joinErr.message}`);
  }

  const { data: ws } = await db
    .from('workspaces')
    .select('*')
    .eq('id', invite.workspace_id)
    .single();

  return {
    id: ws.id,
    name: ws.name,
    owner_id: ws.owner_id,
    role: (invite.role || 'member') as WorkspaceRole,
    default_routing: ws.default_routing || {},
    custom_banned_words: ws.custom_banned_words || [],
    created_at: ws.created_at,
  };
}

export async function updateWorkspaceSettings(
  ctx: AuthContext,
  workspaceId: string,
  updates: {
    name?: string;
    default_routing?: DefaultRouting;
    custom_banned_words?: string[];
  }
): Promise<Workspace> {
  if (ctx.isDemo || !ctx.supabase) {
    const store = readLocalStore();
    const idx = store.workspaces.findIndex((w) => w.id === workspaceId);
    if (idx === -1) throw new Error('工作空间不存在');
    store.workspaces[idx] = {
      ...store.workspaces[idx],
      ...(updates.name ? { name: updates.name.trim() } : {}),
      ...(updates.default_routing !== undefined
        ? { default_routing: updates.default_routing }
        : {}),
      ...(updates.custom_banned_words !== undefined
        ? { custom_banned_words: updates.custom_banned_words }
        : {}),
    };
    writeLocalStore(store);
    const member = store.workspace_members.find(
      (m) => m.workspace_id === workspaceId && m.user_id === ctx.userId
    );
    return { ...store.workspaces[idx], role: member?.role || 'owner' };
  }

  const { data, error } = await ctx.supabase
    .from('workspaces')
    .update(updates)
    .eq('id', workspaceId)
    .select()
    .single();

  if (error || !data) {
    throw new Error(error?.message || '更新工作空间设置失败');
  }

  return {
    id: data.id,
    name: data.name,
    owner_id: data.owner_id,
    role: 'admin',
    default_routing: data.default_routing || {},
    custom_banned_words: data.custom_banned_words || [],
    created_at: data.created_at,
  };
}

// ============================================================================
// API Configs (AES-256-GCM Encrypted)
// ============================================================================

export async function listApiConfigs(
  ctx: AuthContext,
  workspaceId: string,
  apiType?: ApiCategory
): Promise<ApiConfigPublic[]> {
  if (ctx.isDemo || !ctx.supabase) {
    const store = readLocalStore();
    return store.api_configs
      .filter((c) => {
        if (c.workspace_id !== workspaceId) return false;
        if (c.scope !== 'workspace' && c.user_id !== ctx.userId) return false;
        if (apiType && inferApiType(c) !== apiType) return false;
        return true;
      })
      .map(toPublicApiConfig);
  }

  let query = ctx.supabase
    .from('api_configs')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false });

  if (apiType) {
    query = query.eq('api_type', apiType);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`加载 API 配置失败: ${error.message}`);
  }

  return (data || []).map((row) =>
    toPublicApiConfig({
      id: row.id,
      workspace_id: row.workspace_id,
      user_id: row.user_id,
      scope: row.scope,
      api_type: row.api_type,
      protocol: row.protocol,
      is_default: row.is_default,
      provider: row.provider,
      display_name: row.display_name,
      base_url: row.base_url,
      encrypted_api_key: row.encrypted_api_key,
      models: Array.isArray(row.models) ? row.models : [],
      image_models: Array.isArray(row.image_models) ? row.image_models : [],
      video_models: Array.isArray(row.video_models) ? row.video_models : [],
      extra_config: row.extra_config || {},
      is_active: row.is_active,
      created_at: row.created_at,
    })
  );
}

export async function createApiConfig(
  ctx: AuthContext,
  input: {
    workspace_id: string;
    scope: ApiScope;
    api_type?: ApiCategory;
    protocol?: ApiProtocol;
    is_default?: boolean;
    provider: ApiProvider;
    display_name: string;
    base_url: string;
    api_key: string;
    models: string[];
    image_models?: string[];
    video_models?: string[];
    extra_config?: ApiExtraConfig;
    is_active?: boolean;
  }
): Promise<ApiConfigPublic> {
  const encrypted = encryptApiKey(input.api_key);
  const cleanUrl = input.base_url.trim().replace(/\/+$/, '');
  const apiType: ApiCategory = input.api_type || 'text';
  const cleanModels =
    apiType === 'text'
      ? Array.from(new Set(input.models.map((m) => m.trim()).filter(Boolean)))
      : [];
  const cleanImageModels =
    apiType === 'image'
      ? Array.from(
          new Set(
            (input.image_models?.length ? input.image_models : input.models)
              .map((m) => m.trim())
              .filter(Boolean)
          )
        )
      : [];
  const cleanVideoModels =
    apiType === 'video'
      ? Array.from(
          new Set((input.video_models || []).map((m) => m.trim()).filter(Boolean))
        )
      : [];

  if (ctx.isDemo || !ctx.supabase) {
    const store = readLocalStore();
    if (input.is_default) {
      for (const c of store.api_configs) {
        if (c.workspace_id === input.workspace_id && inferApiType(c) === apiType) {
          c.is_default = false;
        }
      }
    }
    const record: StoredApiConfigRecord = {
      id: crypto.randomUUID(),
      workspace_id: input.workspace_id,
      user_id: input.scope === 'personal' ? ctx.userId : null,
      scope: input.scope,
      api_type: apiType,
      protocol: input.protocol || 'openai',
      is_default: Boolean(input.is_default),
      provider: input.provider,
      display_name: input.display_name.trim(),
      base_url: cleanUrl,
      encrypted_api_key: encrypted,
      models: cleanModels,
      image_models: cleanImageModels,
      video_models: cleanVideoModels,
      extra_config: input.extra_config || {},
      is_active: input.is_active ?? true,
      created_at: new Date().toISOString(),
    };
    store.api_configs.unshift(record);
    writeLocalStore(store);
    return toPublicApiConfig(record);
  }

  if (input.is_default) {
    await ctx.supabase
      .from('api_configs')
      .update({ is_default: false })
      .eq('workspace_id', input.workspace_id)
      .eq('api_type', apiType);
  }

  const { data, error } = await ctx.supabase
    .from('api_configs')
    .insert({
      workspace_id: input.workspace_id,
      user_id: input.scope === 'personal' ? ctx.userId : null,
      scope: input.scope,
      api_type: apiType,
      protocol: input.protocol || 'openai',
      is_default: Boolean(input.is_default),
      provider: input.provider,
      display_name: input.display_name.trim(),
      base_url: cleanUrl,
      encrypted_api_key: encrypted,
      models: cleanModels,
      image_models: cleanImageModels,
      video_models: cleanVideoModels,
      extra_config: input.extra_config || {},
      is_active: input.is_active ?? true,
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(`保存 API 配置失败: ${error?.message || '权限不足或参数错误'}`);
  }

  return toPublicApiConfig(data as StoredApiConfigRecord);
}

export async function updateApiConfig(
  ctx: AuthContext,
  id: string,
  updates: {
    scope?: ApiScope;
    api_type?: ApiCategory;
    protocol?: ApiProtocol;
    is_default?: boolean;
    provider?: ApiProvider;
    display_name?: string;
    base_url?: string;
    api_key?: string;
    models?: string[];
    image_models?: string[];
    video_models?: string[];
    extra_config?: ApiExtraConfig;
    is_active?: boolean;
  }
): Promise<ApiConfigPublic> {
  const patch: Record<string, unknown> = {};
  if (updates.scope !== undefined) {
    patch.scope = updates.scope;
    patch.user_id = updates.scope === 'personal' ? ctx.userId : null;
  }
  if (updates.api_type !== undefined) patch.api_type = updates.api_type;
  if (updates.protocol !== undefined) patch.protocol = updates.protocol;
  if (updates.is_default !== undefined) patch.is_default = updates.is_default;
  if (updates.provider !== undefined) patch.provider = updates.provider;
  if (updates.display_name !== undefined) patch.display_name = updates.display_name.trim();
  if (updates.base_url !== undefined) {
    patch.base_url = updates.base_url.trim().replace(/\/+$/, '');
  }
  if (updates.api_key && updates.api_key.trim()) {
    patch.encrypted_api_key = encryptApiKey(updates.api_key);
  }
  if (updates.models !== undefined) {
    patch.models = Array.from(new Set(updates.models.map((m) => m.trim()).filter(Boolean)));
  }
  if (updates.image_models !== undefined) {
    patch.image_models = Array.from(
      new Set(updates.image_models.map((m) => m.trim()).filter(Boolean))
    );
  }
  if (updates.video_models !== undefined) {
    patch.video_models = Array.from(
      new Set(updates.video_models.map((m) => m.trim()).filter(Boolean))
    );
  }
  if (updates.extra_config !== undefined) patch.extra_config = updates.extra_config;
  if (updates.is_active !== undefined) patch.is_active = updates.is_active;

  if (ctx.isDemo || !ctx.supabase) {
    const store = readLocalStore();
    const idx = store.api_configs.findIndex((c) => c.id === id);
    if (idx === -1) throw new Error('API 配置不存在');
    const targetType = updates.api_type || inferApiType(store.api_configs[idx]);
    if (updates.is_default) {
      for (const c of store.api_configs) {
        if (
          c.workspace_id === store.api_configs[idx].workspace_id &&
          inferApiType(c) === targetType
        ) {
          c.is_default = false;
        }
      }
    }
    store.api_configs[idx] = {
      ...store.api_configs[idx],
      ...(patch as Partial<StoredApiConfigRecord>),
      ...(updates.extra_config
        ? {
            extra_config: {
              ...(store.api_configs[idx].extra_config || {}),
              ...updates.extra_config,
            },
          }
        : {}),
    };
    writeLocalStore(store);
    return toPublicApiConfig(store.api_configs[idx]);
  }

  if (updates.is_default) {
    const { data: existing } = await ctx.supabase
      .from('api_configs')
      .select('workspace_id, api_type')
      .eq('id', id)
      .maybeSingle();
    if (existing) {
      await ctx.supabase
        .from('api_configs')
        .update({ is_default: false })
        .eq('workspace_id', existing.workspace_id)
        .eq('api_type', updates.api_type || existing.api_type || 'text');
    }
  }

  const { data, error } = await ctx.supabase
    .from('api_configs')
    .update(patch)
    .eq('id', id)
    .select()
    .single();

  if (error || !data) {
    throw new Error(`更新 API 配置失败: ${error?.message || '无权限或配置不存在'}`);
  }

  return toPublicApiConfig(data as StoredApiConfigRecord);
}

export async function deleteApiConfig(ctx: AuthContext, id: string): Promise<void> {
  if (ctx.isDemo || !ctx.supabase) {
    const store = readLocalStore();
    store.api_configs = store.api_configs.filter((c) => c.id !== id);
    writeLocalStore(store);
    return;
  }

  const { error } = await ctx.supabase.from('api_configs').delete().eq('id', id);
  if (error) {
    throw new Error(`删除 API 配置失败: ${error.message}`);
  }
}

export async function getDecryptedApiConfig(
  ctx: AuthContext,
  configId?: string | null,
  workspaceId?: string | null,
  requiredApiType?: ApiCategory
): Promise<{
  id: string;
  api_type: ApiCategory;
  protocol: ApiProtocol;
  provider: ApiProvider;
  display_name: string;
  base_url: string;
  api_key: string;
  models: string[];
  image_models: string[];
  video_models: string[];
  extra_config: ApiExtraConfig;
} | null> {
  if (ctx.isDemo || !ctx.supabase) {
    const store = readLocalStore();
    const found = configId
      ? store.api_configs.find((c) => c.id === configId && c.is_active)
      : store.api_configs.find(
          (c) =>
            (!workspaceId || c.workspace_id === workspaceId) &&
            c.is_active &&
            (!requiredApiType || inferApiType(c) === requiredApiType) &&
            (c.scope === 'workspace' || c.user_id === ctx.userId)
        );
    if (!found) return null;
    const type = inferApiType(found);
    if (requiredApiType && type !== requiredApiType) return null;
    return {
      id: found.id,
      api_type: type,
      protocol: (found.protocol || 'openai') as ApiProtocol,
      provider: found.provider,
      display_name: found.display_name,
      base_url: found.base_url,
      api_key: decryptApiKey(found.encrypted_api_key),
      models: Array.isArray(found.models) ? found.models : [],
      image_models: Array.isArray(found.image_models) ? found.image_models : [],
      video_models: Array.isArray(found.video_models) ? found.video_models : [],
      extra_config: found.extra_config || {},
    };
  }

  let query = ctx.supabase.from('api_configs').select('*').eq('is_active', true);
  if (configId) {
    query = query.eq('id', configId);
  } else if (workspaceId) {
    query = query.eq('workspace_id', workspaceId);
    if (requiredApiType) {
      query = query.eq('api_type', requiredApiType);
    }
    query = query.order('is_default', { ascending: false }).limit(1);
  }

  const { data, error } = await query.maybeSingle();
  if (error || !data) return null;

  const type = inferApiType(data as StoredApiConfigRecord);
  if (requiredApiType && type !== requiredApiType) return null;

  return {
    id: data.id,
    api_type: type,
    protocol: (data.protocol || 'openai') as ApiProtocol,
    provider: data.provider,
    display_name: data.display_name,
    base_url: data.base_url,
    api_key: decryptApiKey(data.encrypted_api_key),
    models: Array.isArray(data.models) ? data.models : [],
    image_models: Array.isArray(data.image_models) ? data.image_models : [],
    video_models: Array.isArray(data.video_models) ? data.video_models : [],
    extra_config: data.extra_config || {},
  };
}

// ============================================================================
// Products (知识库底座)
// ============================================================================

export async function listProducts(
  ctx: AuthContext,
  workspaceId: string
): Promise<Product[]> {
  if (ctx.isDemo || !ctx.supabase) {
    const store = readLocalStore();
    return store.products
      .filter((p) => p.workspace_id === workspaceId)
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }

  const { data, error } = await ctx.supabase
    .from('products')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('updated_at', { ascending: false });

  if (error) throw new Error(`查询产品库失败: ${error.message}`);
  return (data || []) as Product[];
}

export async function getProductById(
  ctx: AuthContext,
  productId: string
): Promise<Product | null> {
  if (ctx.isDemo || !ctx.supabase) {
    const store = readLocalStore();
    return store.products.find((p) => p.id === productId) || null;
  }

  const { data, error } = await ctx.supabase
    .from('products')
    .select('*')
    .eq('id', productId)
    .maybeSingle();

  if (error || !data) return null;
  return data as Product;
}

export async function createProduct(
  ctx: AuthContext,
  input: {
    workspace_id: string;
    name: string;
    selling_points?: string;
    target_audience?: string;
    specs_and_price?: string;
    banned_words?: string[];
    reference_images?: string[];
  }
): Promise<Product> {
  const now = new Date().toISOString();
  const payload = {
    workspace_id: input.workspace_id,
    created_by: ctx.userId,
    name: input.name.trim(),
    selling_points: input.selling_points?.trim() || '',
    target_audience: input.target_audience?.trim() || '',
    specs_and_price: input.specs_and_price?.trim() || '',
    banned_words: Array.from(
      new Set((input.banned_words || []).map((w) => w.trim()).filter(Boolean))
    ),
    reference_images: input.reference_images || [],
  };

  if (ctx.isDemo || !ctx.supabase) {
    const store = readLocalStore();
    const created: Product = {
      id: crypto.randomUUID(),
      ...payload,
      created_at: now,
      updated_at: now,
    };
    store.products.unshift(created);
    writeLocalStore(store);
    return created;
  }

  const { data, error } = await ctx.supabase
    .from('products')
    .insert(payload)
    .select()
    .single();

  if (error || !data) {
    throw new Error(`创建产品失败: ${error?.message || '未知错误'}`);
  }
  return data as Product;
}

export async function updateProduct(
  ctx: AuthContext,
  id: string,
  updates: Partial<{
    name: string;
    selling_points: string;
    target_audience: string;
    specs_and_price: string;
    banned_words: string[];
    reference_images: string[];
  }>
): Promise<Product> {
  const now = new Date().toISOString();

  if (ctx.isDemo || !ctx.supabase) {
    const store = readLocalStore();
    const idx = store.products.findIndex((p) => p.id === id);
    if (idx === -1) throw new Error('产品不存在');
    store.products[idx] = {
      ...store.products[idx],
      ...updates,
      updated_at: now,
    };
    writeLocalStore(store);
    return store.products[idx];
  }

  const { data, error } = await ctx.supabase
    .from('products')
    .update({ ...updates, updated_at: now })
    .eq('id', id)
    .select()
    .single();

  if (error || !data) {
    throw new Error(`更新产品失败: ${error?.message || '产品不存在'}`);
  }
  return data as Product;
}

export async function deleteProduct(ctx: AuthContext, id: string): Promise<void> {
  if (ctx.isDemo || !ctx.supabase) {
    const store = readLocalStore();
    store.products = store.products.filter((p) => p.id !== id);
    writeLocalStore(store);
    return;
  }

  const { error } = await ctx.supabase.from('products').delete().eq('id', id);
  if (error) throw new Error(`删除产品失败: ${error.message}`);
}

// ============================================================================
// Assets (云端素材库)
// ============================================================================

export async function listAssets(
  ctx: AuthContext,
  filters: {
    workspaceId: string;
    assetType?: AssetType | 'all';
    productId?: string;
    tag?: string;
    visibility?: AssetVisibility | 'all';
    starredOnly?: boolean;
    q?: string;
  }
): Promise<Asset[]> {
  if (ctx.isDemo || !ctx.supabase) {
    const store = readLocalStore();
    return store.assets
      .filter((a) => {
        if (a.workspace_id !== filters.workspaceId) return false;
        if (a.visibility === 'private' && a.created_by !== ctx.userId) return false;
        if (filters.assetType && filters.assetType !== 'all' && a.asset_type !== filters.assetType) {
          return false;
        }
        if (filters.productId && filters.productId !== 'all' && a.product_id !== filters.productId) {
          return false;
        }
        if (
          filters.visibility &&
          filters.visibility !== 'all' &&
          a.visibility !== filters.visibility
        ) {
          return false;
        }
        if (filters.starredOnly && !a.is_starred) return false;
        if (filters.tag && !a.tags.includes(filters.tag)) return false;
        if (filters.q) {
          const kw = filters.q.toLowerCase();
          const hay = `${a.title} ${a.content || ''} ${a.tags.join(' ')}`.toLowerCase();
          if (!hay.includes(kw)) return false;
        }
        return true;
      })
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  let query = ctx.supabase
    .from('assets')
    .select('*')
    .eq('workspace_id', filters.workspaceId)
    .order('created_at', { ascending: false });

  if (filters.assetType && filters.assetType !== 'all') {
    query = query.eq('asset_type', filters.assetType);
  }
  if (filters.productId && filters.productId !== 'all') {
    query = query.eq('product_id', filters.productId);
  }
  if (filters.visibility && filters.visibility !== 'all') {
    query = query.eq('visibility', filters.visibility);
  }
  if (filters.starredOnly) {
    query = query.eq('is_starred', true);
  }
  if (filters.tag) {
    query = query.contains('tags', [filters.tag]);
  }
  if (filters.q) {
    query = query.or(`title.ilike.%${filters.q}%,content.ilike.%${filters.q}%`);
  }

  const { data, error } = await query;
  if (error) throw new Error(`加载素材库失败: ${error.message}`);
  return (data || []) as Asset[];
}

export async function createAsset(
  ctx: AuthContext,
  input: {
    workspace_id: string;
    product_id?: string | null;
    asset_type: AssetType;
    visibility?: AssetVisibility;
    title: string;
    content?: string | null;
    file_url?: string | null;
    generation_meta?: GenerationMeta;
    tags?: string[];
    is_starred?: boolean;
  }
): Promise<Asset> {
  const payload = {
    workspace_id: input.workspace_id,
    created_by: ctx.userId,
    product_id: input.product_id || null,
    asset_type: input.asset_type,
    visibility: input.visibility || 'workspace',
    title: input.title.trim(),
    content: input.content ?? null,
    file_url: input.file_url ?? null,
    generation_meta: input.generation_meta || {},
    tags: Array.from(new Set((input.tags || []).map((t) => t.trim()).filter(Boolean))),
    is_starred: Boolean(input.is_starred),
  };

  if (ctx.isDemo || !ctx.supabase) {
    const store = readLocalStore();
    const created: Asset = {
      id: crypto.randomUUID(),
      ...payload,
      created_at: new Date().toISOString(),
    };
    store.assets.unshift(created);
    writeLocalStore(store);
    return created;
  }

  const { data, error } = await ctx.supabase
    .from('assets')
    .insert(payload)
    .select()
    .single();

  if (error || !data) {
    throw new Error(`保存素材失败: ${error?.message || '未知错误'}`);
  }
  return data as Asset;
}

export async function updateAsset(
  ctx: AuthContext,
  id: string,
  updates: Partial<{
    product_id: string | null;
    visibility: AssetVisibility;
    title: string;
    content: string | null;
    tags: string[];
    is_starred: boolean;
  }>
): Promise<Asset> {
  if (ctx.isDemo || !ctx.supabase) {
    const store = readLocalStore();
    const idx = store.assets.findIndex((a) => a.id === id);
    if (idx === -1) throw new Error('素材不存在');
    store.assets[idx] = { ...store.assets[idx], ...updates };
    writeLocalStore(store);
    return store.assets[idx];
  }

  const { data, error } = await ctx.supabase
    .from('assets')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error || !data) {
    throw new Error(`更新素材失败: ${error?.message || '无权限或素材不存在'}`);
  }
  return data as Asset;
}

export async function deleteAsset(ctx: AuthContext, id: string): Promise<void> {
  if (ctx.isDemo || !ctx.supabase) {
    const store = readLocalStore();
    store.assets = store.assets.filter((a) => a.id !== id);
    writeLocalStore(store);
    return;
  }

  const { error } = await ctx.supabase.from('assets').delete().eq('id', id);
  if (error) throw new Error(`删除素材失败: ${error.message}`);
}

// ============================================================================
// Chat Sessions & Messages
// ============================================================================

export async function listChatSessions(
  ctx: AuthContext,
  workspaceId: string,
  q?: string
): Promise<ChatSession[]> {
  if (ctx.isDemo || !ctx.supabase) {
    const store = readLocalStore();
    return store.chat_sessions
      .filter((s) => {
        if (s.workspace_id !== workspaceId || s.user_id !== ctx.userId) return false;
        if (q && !s.title.toLowerCase().includes(q.toLowerCase())) return false;
        return true;
      })
      .sort((a, b) => {
        if (Boolean(a.is_pinned) !== Boolean(b.is_pinned)) {
          return a.is_pinned ? -1 : 1;
        }
        return (b.updated_at || b.created_at).localeCompare(a.updated_at || a.created_at);
      });
  }

  let query = ctx.supabase
    .from('chat_sessions')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('user_id', ctx.userId)
    .order('is_pinned', { ascending: false })
    .order('created_at', { ascending: false });

  if (q) {
    query = query.ilike('title', `%${q}%`);
  }

  const { data, error } = await query;
  if (error) throw new Error(`加载会话列表失败: ${error.message}`);
  return (data || []) as ChatSession[];
}

export async function createChatSession(
  ctx: AuthContext,
  input: {
    workspace_id: string;
    title: string;
    product_id?: string | null;
    model_config_id?: string | null;
    model_name?: string | null;
  }
): Promise<ChatSession> {
  const now = new Date().toISOString();
  const payload = {
    workspace_id: input.workspace_id,
    user_id: ctx.userId,
    product_id: input.product_id || null,
    title: input.title.trim() || '新对话',
    model_config_id: input.model_config_id || null,
    model_name: input.model_name || null,
    is_pinned: false,
  };

  if (ctx.isDemo || !ctx.supabase) {
    const store = readLocalStore();
    const created: ChatSession = {
      id: crypto.randomUUID(),
      ...payload,
      created_at: now,
      updated_at: now,
    };
    store.chat_sessions.unshift(created);
    writeLocalStore(store);
    return created;
  }

  const { data, error } = await ctx.supabase
    .from('chat_sessions')
    .insert(payload)
    .select()
    .single();

  if (error || !data) {
    throw new Error(`创建会话失败: ${error?.message || '未知错误'}`);
  }
  return data as ChatSession;
}

export async function updateChatSession(
  ctx: AuthContext,
  id: string,
  updates: Partial<{
    title: string;
    product_id: string | null;
    model_config_id: string | null;
    model_name: string | null;
    is_pinned: boolean;
  }>
): Promise<ChatSession> {
  const now = new Date().toISOString();
  if (ctx.isDemo || !ctx.supabase) {
    const store = readLocalStore();
    const idx = store.chat_sessions.findIndex((s) => s.id === id);
    if (idx === -1) throw new Error('会话不存在');
    store.chat_sessions[idx] = {
      ...store.chat_sessions[idx],
      ...updates,
      updated_at: now,
    };
    writeLocalStore(store);
    return store.chat_sessions[idx];
  }

  const { data, error } = await ctx.supabase
    .from('chat_sessions')
    .update({ ...updates, updated_at: now })
    .eq('id', id)
    .select()
    .single();

  if (error || !data) {
    throw new Error(`更新会话失败: ${error?.message || '未知错误'}`);
  }
  return data as ChatSession;
}

export async function deleteChatSession(ctx: AuthContext, id: string): Promise<void> {
  if (ctx.isDemo || !ctx.supabase) {
    const store = readLocalStore();
    store.chat_sessions = store.chat_sessions.filter((s) => s.id !== id);
    store.chat_messages = store.chat_messages.filter((m) => m.session_id !== id);
    writeLocalStore(store);
    return;
  }

  const { error } = await ctx.supabase.from('chat_sessions').delete().eq('id', id);
  if (error) throw new Error(`删除会话失败: ${error.message}`);
}

export async function listChatMessages(
  ctx: AuthContext,
  sessionId: string
): Promise<ChatMessage[]> {
  if (ctx.isDemo || !ctx.supabase) {
    const store = readLocalStore();
    return store.chat_messages
      .filter((m) => m.session_id === sessionId)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  const { data, error } = await ctx.supabase
    .from('chat_messages')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });

  if (error) throw new Error(`加载消息记录失败: ${error.message}`);
  return (data || []) as ChatMessage[];
}

export async function appendChatMessage(
  ctx: AuthContext,
  input: {
    session_id: string;
    role: 'system' | 'user' | 'assistant';
    content: string;
    reasoning_content?: string | null;
  }
): Promise<ChatMessage> {
  const now = new Date().toISOString();
  if (ctx.isDemo || !ctx.supabase) {
    const store = readLocalStore();
    const created: ChatMessage = {
      id: crypto.randomUUID(),
      session_id: input.session_id,
      role: input.role,
      content: input.content,
      reasoning_content: input.reasoning_content ?? null,
      created_at: now,
    };
    store.chat_messages.push(created);
    const sIdx = store.chat_sessions.findIndex((s) => s.id === input.session_id);
    if (sIdx !== -1) {
      store.chat_sessions[sIdx].updated_at = now;
    }
    writeLocalStore(store);
    return created;
  }

  const { data, error } = await ctx.supabase
    .from('chat_messages')
    .insert({
      session_id: input.session_id,
      role: input.role,
      content: input.content,
      reasoning_content: input.reasoning_content ?? null,
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(`保存消息失败: ${error?.message || '未知错误'}`);
  }
  return data as ChatMessage;
}

// ============================================================================
// Media Tasks (异步图片/视频任务队列)
// ============================================================================

export async function listMediaTasks(
  ctx: AuthContext,
  workspaceId: string,
  taskType?: MediaTaskType
): Promise<MediaTask[]> {
  if (ctx.isDemo || !ctx.supabase) {
    const store = readLocalStore();
    return store.media_tasks
      .filter((t) => {
        if (t.workspace_id !== workspaceId) return false;
        if (taskType && t.task_type !== taskType) return false;
        return true;
      })
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  let query = ctx.supabase
    .from('media_tasks')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(60);

  if (taskType) {
    query = query.eq('task_type', taskType);
  }

  const { data, error } = await query;
  if (error) throw new Error(`加载生成任务失败: ${error.message}`);
  return (data || []) as MediaTask[];
}

export async function createMediaTask(
  ctx: AuthContext,
  input: {
    workspace_id: string;
    product_id?: string | null;
    api_config_id?: string | null;
    node_id?: string | null;
    provider_name?: string | null;
    task_type: MediaTaskType;
    mode: MediaGenerationMode;
    provider_task_id?: string | null;
    status?: MediaTaskStatus;
    progress?: number;
    prompt: string;
    negative_prompt?: string | null;
    aspect_ratio: string;
    resolution?: string | null;
    duration_sec?: number | null;
    fps?: number | null;
    camera_movement?: string | null;
    model_name: string;
    batch_count?: number;
    reference_image_url?: string | null;
    input_snapshot?: Record<string, unknown>;
    result_urls?: string[];
    error_message?: string | null;
  }
): Promise<MediaTask> {
  const now = new Date().toISOString();
  const payload = {
    workspace_id: input.workspace_id,
    created_by: ctx.userId,
    product_id: input.product_id || null,
    api_config_id: input.api_config_id || null,
    node_id: input.node_id || null,
    provider_name: input.provider_name || null,
    task_type: input.task_type,
    mode: input.mode,
    provider_task_id: input.provider_task_id || null,
    status: input.status || 'pending',
    progress: input.progress ?? 10,
    prompt: input.prompt,
    negative_prompt: input.negative_prompt || null,
    aspect_ratio: input.aspect_ratio,
    resolution: input.resolution || null,
    duration_sec: input.duration_sec ?? null,
    fps: input.fps ?? null,
    camera_movement: input.camera_movement || null,
    model_name: input.model_name,
    batch_count: input.batch_count ?? 1,
    reference_image_url: input.reference_image_url || null,
    input_snapshot: input.input_snapshot || {},
    result_urls: input.result_urls || [],
    error_message: input.error_message || null,
  };

  if (ctx.isDemo || !ctx.supabase) {
    const store = readLocalStore();
    const created: MediaTask = {
      id: crypto.randomUUID(),
      ...payload,
      created_at: now,
      updated_at: now,
    };
    store.media_tasks.unshift(created);
    writeLocalStore(store);
    return created;
  }

  const { data, error } = await ctx.supabase
    .from('media_tasks')
    .insert(payload)
    .select()
    .single();

  if (error || !data) {
    throw new Error(`创建生成任务失败: ${error?.message || '未知错误'}`);
  }
  return data as MediaTask;
}

export async function getMediaTaskById(
  ctx: AuthContext,
  taskId: string
): Promise<MediaTask | null> {
  if (ctx.isDemo || !ctx.supabase) {
    const store = readLocalStore();
    return store.media_tasks.find((t) => t.id === taskId) || null;
  }

  const { data, error } = await ctx.supabase
    .from('media_tasks')
    .select('*')
    .eq('id', taskId)
    .maybeSingle();

  if (error || !data) return null;
  return data as MediaTask;
}

export async function updateMediaTask(
  ctx: AuthContext,
  taskId: string,
  updates: Partial<{
    provider_task_id: string | null;
    status: MediaTaskStatus;
    progress: number;
    result_urls: string[];
    error_message: string | null;
  }>
): Promise<MediaTask> {
  const now = new Date().toISOString();

  if (ctx.isDemo || !ctx.supabase) {
    const store = readLocalStore();
    const idx = store.media_tasks.findIndex((t) => t.id === taskId);
    if (idx === -1) throw new Error('任务不存在');
    store.media_tasks[idx] = {
      ...store.media_tasks[idx],
      ...updates,
      updated_at: now,
    };
    writeLocalStore(store);
    return store.media_tasks[idx];
  }

  const { data, error } = await ctx.supabase
    .from('media_tasks')
    .update({ ...updates, updated_at: now })
    .eq('id', taskId)
    .select()
    .single();

  if (error || !data) {
    throw new Error(`更新任务失败: ${error?.message || '未知错误'}`);
  }
  return data as MediaTask;
}

export async function deleteMediaTask(ctx: AuthContext, taskId: string): Promise<void> {
  if (ctx.isDemo || !ctx.supabase) {
    const store = readLocalStore();
    store.media_tasks = store.media_tasks.filter((t) => t.id !== taskId);
    writeLocalStore(store);
    return;
  }

  const { error } = await ctx.supabase.from('media_tasks').delete().eq('id', taskId);
  if (error) throw new Error(`删除历史任务失败: ${error.message}`);
}

// ============================================================================
// Canvas Workflows (V2.0 节点画布工作流)
// ============================================================================

export async function listCanvasWorkflows(
  ctx: AuthContext,
  workspaceId: string
): Promise<CanvasWorkflow[]> {
  if (ctx.isDemo || !ctx.supabase) {
    const store = readLocalStore();
    return store.canvas_workflows
      .filter((w) => w.workspace_id === workspaceId)
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }

  const { data, error } = await ctx.supabase
    .from('canvas_workflows')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('updated_at', { ascending: false });

  if (error) throw new Error(`加载画布工作流失败: ${error.message}`);
  return (data || []) as CanvasWorkflow[];
}

export async function createCanvasWorkflow(
  ctx: AuthContext,
  input: {
    workspace_id: string;
    name: string;
    description?: string;
    nodes?: CanvasFlowNode[];
    edges?: CanvasFlowEdge[];
    viewport?: CanvasViewport;
  }
): Promise<CanvasWorkflow> {
  const now = new Date().toISOString();
  const payload = {
    workspace_id: input.workspace_id,
    created_by: ctx.userId,
    name: input.name.trim() || '未命名画布工作流',
    description: input.description?.trim() || '',
    nodes: input.nodes || [],
    edges: input.edges || [],
    viewport: input.viewport || { x: 0, y: 0, zoom: 1 },
  };

  if (ctx.isDemo || !ctx.supabase) {
    const store = readLocalStore();
    const created: CanvasWorkflow = {
      id: crypto.randomUUID(),
      ...payload,
      created_at: now,
      updated_at: now,
    };
    store.canvas_workflows.unshift(created);
    writeLocalStore(store);
    return created;
  }

  const { data, error } = await ctx.supabase
    .from('canvas_workflows')
    .insert(payload)
    .select()
    .single();

  if (error || !data) {
    throw new Error(`创建画布工作流失败: ${error?.message || '未知错误'}`);
  }
  return data as CanvasWorkflow;
}

export async function updateCanvasWorkflow(
  ctx: AuthContext,
  id: string,
  updates: Partial<{
    name: string;
    description: string;
    nodes: CanvasFlowNode[];
    edges: CanvasFlowEdge[];
    viewport: CanvasViewport;
  }>
): Promise<CanvasWorkflow> {
  const now = new Date().toISOString();

  if (ctx.isDemo || !ctx.supabase) {
    const store = readLocalStore();
    const idx = store.canvas_workflows.findIndex((w) => w.id === id);
    if (idx === -1) throw new Error('画布工作流不存在');
    store.canvas_workflows[idx] = {
      ...store.canvas_workflows[idx],
      ...updates,
      updated_at: now,
    };
    writeLocalStore(store);
    return store.canvas_workflows[idx];
  }

  const { data, error } = await ctx.supabase
    .from('canvas_workflows')
    .update({ ...updates, updated_at: now })
    .eq('id', id)
    .select()
    .single();

  if (error || !data) {
    throw new Error(`保存画布工作流失败: ${error?.message || '未知错误'}`);
  }
  return data as CanvasWorkflow;
}

export async function deleteCanvasWorkflow(
  ctx: AuthContext,
  id: string
): Promise<void> {
  if (ctx.isDemo || !ctx.supabase) {
    const store = readLocalStore();
    store.canvas_workflows = store.canvas_workflows.filter((w) => w.id !== id);
    writeLocalStore(store);
    return;
  }

  const { error } = await ctx.supabase
    .from('canvas_workflows')
    .delete()
    .eq('id', id);
  if (error) throw new Error(`删除画布工作流失败: ${error.message}`);
}

export async function findAssetReferencesInWorkflows(
  ctx: AuthContext,
  workspaceId: string,
  assetId: string
): Promise<string[]> {
  const workflows = await listCanvasWorkflows(ctx, workspaceId);
  const matched: string[] = [];
  for (const wf of workflows) {
    const nodes = Array.isArray(wf.nodes) ? wf.nodes : [];
    const referenced = nodes.some((n) => n?.data?.assetId === assetId);
    if (referenced) {
      matched.push(wf.name);
    }
  }
  return matched;
}
