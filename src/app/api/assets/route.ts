import { NextRequest, NextResponse } from 'next/server';
import {
  createAsset,
  ensureUserWorkspaces,
  getAuthContext,
  listAssets,
} from '@/lib/store/server-store';
import type { AssetType, AssetVisibility } from '@/lib/types';

export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const sp = request.nextUrl.searchParams;
    let workspaceId = sp.get('workspaceId') || '';
    if (!workspaceId) {
      const list = await ensureUserWorkspaces(ctx);
      workspaceId = list[0]?.id || '';
    }
    if (!workspaceId) {
      return NextResponse.json({ assets: [] });
    }

    const assets = await listAssets(ctx, {
      workspaceId,
      assetType: (sp.get('assetType') as AssetType | 'all') || 'all',
      productId: sp.get('productId') || 'all',
      tag: sp.get('tag') || undefined,
      visibility: (sp.get('visibility') as AssetVisibility | 'all') || 'all',
      starredOnly: sp.get('starred') === 'true',
      q: sp.get('q') || undefined,
    });

    return NextResponse.json({ assets });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '加载素材库失败' },
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

    if (!workspaceId || !body.title || !body.asset_type) {
      return NextResponse.json(
        { error: '请填写素材标题并指定素材类型' },
        { status: 400 }
      );
    }

    const asset = await createAsset(ctx, {
      workspace_id: workspaceId,
      product_id: body.product_id || null,
      asset_type: body.asset_type as AssetType,
      visibility: (body.visibility === 'private' ? 'private' : 'workspace') as AssetVisibility,
      title: String(body.title),
      content: body.content !== undefined ? body.content : null,
      file_url: body.file_url !== undefined ? body.file_url : null,
      generation_meta:
        body.generation_meta && typeof body.generation_meta === 'object'
          ? body.generation_meta
          : {},
      tags: Array.isArray(body.tags) ? body.tags.map(String) : [],
      is_starred: Boolean(body.is_starred),
    });

    return NextResponse.json({ asset }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '保存素材失败' },
      { status: 400 }
    );
  }
}
