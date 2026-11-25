import { NextRequest, NextResponse } from 'next/server';
import {
  deleteApiConfig,
  getAuthContext,
  updateApiConfig,
} from '@/lib/store/server-store';

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const { id } = await context.params;
    const body = await request.json();

    const config = await updateApiConfig(ctx, id, {
      scope: body.scope,
      api_type:
        body.api_type === 'image' || body.api_type === 'video' || body.api_type === 'text'
          ? body.api_type
          : undefined,
      protocol: body.protocol,
      provider: body.provider,
      display_name: body.display_name,
      base_url: body.base_url,
      api_key: body.api_key,
      models: Array.isArray(body.models) ? body.models.map(String) : undefined,
      image_models: Array.isArray(body.image_models)
        ? body.image_models.map(String)
        : undefined,
      video_models: Array.isArray(body.video_models)
        ? body.video_models.map(String)
        : undefined,
      extra_config:
        body.extra_config && typeof body.extra_config === 'object'
          ? body.extra_config
          : undefined,
      is_active: typeof body.is_active === 'boolean' ? body.is_active : undefined,
      is_default: typeof body.is_default === 'boolean' ? body.is_default : undefined,
    });

    return NextResponse.json({ config });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '更新失败' },
      { status: 400 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const { id } = await context.params;
    await deleteApiConfig(ctx, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '删除失败' },
      { status: 400 }
    );
  }
}
