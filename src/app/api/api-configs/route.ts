import { NextRequest, NextResponse } from 'next/server';
import {
  createApiConfig,
  ensureUserWorkspaces,
  getAuthContext,
  listApiConfigs,
} from '@/lib/store/server-store';
import type { ApiCategory, ApiExtraConfig, ApiProtocol, ApiProvider, ApiScope } from '@/lib/types';

function parseApiCategory(val: unknown): ApiCategory | undefined {
  if (val === 'image' || val === 'video' || val === 'text') return val;
  return undefined;
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    let workspaceId = request.nextUrl.searchParams.get('workspaceId') || '';
    if (!workspaceId) {
      const list = await ensureUserWorkspaces(ctx);
      workspaceId = list[0]?.id || '';
    }
    if (!workspaceId) {
      return NextResponse.json({ configs: [] });
    }

    const apiType = parseApiCategory(request.nextUrl.searchParams.get('apiType'));
    const configs = await listApiConfigs(ctx, workspaceId, apiType);
    return NextResponse.json({ configs });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '加载 API 配置失败' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const body = await request.json();
    let workspaceId = String(body.workspace_id || '');
    if (!workspaceId) {
      const list = await ensureUserWorkspaces(ctx);
      workspaceId = list[0]?.id || '';
    }

    if (!workspaceId || !body.display_name || !body.base_url || !body.api_key) {
      return NextResponse.json(
        { error: '请填写完整的渠道名称、Base URL 和 API Key' },
        { status: 400 }
      );
    }

    const apiType = parseApiCategory(body.api_type) || 'text';
    const protocol: ApiProtocol =
      body.protocol === 'siliconflow' ||
      body.protocol === 'kling' ||
      body.protocol === 'jimeng' ||
      body.protocol === 'custom'
        ? body.protocol
        : 'openai';

    const config = await createApiConfig(ctx, {
      workspace_id: workspaceId,
      scope: (body.scope === 'personal' ? 'personal' : 'workspace') as ApiScope,
      api_type: apiType,
      protocol,
      provider: (body.provider || 'custom') as ApiProvider,
      display_name: String(body.display_name),
      base_url: String(body.base_url),
      api_key: String(body.api_key),
      models: Array.isArray(body.models) ? body.models.map(String) : [],
      image_models: Array.isArray(body.image_models) ? body.image_models.map(String) : [],
      video_models: Array.isArray(body.video_models) ? body.video_models.map(String) : [],
      extra_config:
        body.extra_config && typeof body.extra_config === 'object'
          ? (body.extra_config as ApiExtraConfig)
          : {},
      is_active: body.is_active !== false,
      is_default: Boolean(body.is_default),
    });

    return NextResponse.json({ config }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '创建 API 配置失败' },
      { status: 400 }
    );
  }
}
