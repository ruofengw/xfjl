import { NextRequest, NextResponse } from 'next/server';
import {
  deleteAsset,
  ensureUserWorkspaces,
  findAssetReferencesInWorkflows,
  getAuthContext,
  updateAsset,
} from '@/lib/store/server-store';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }
    const { id } = await context.params;
    let workspaceId = request.nextUrl.searchParams.get('workspaceId') || '';
    if (!workspaceId) {
      const wsList = await ensureUserWorkspaces(ctx);
      workspaceId = wsList[0]?.id || '';
    }
    const referencingWorkflows = workspaceId
      ? await findAssetReferencesInWorkflows(ctx, workspaceId, id)
      : [];
    return NextResponse.json({ referencingWorkflows });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '检查引用失败' },
      { status: 500 }
    );
  }
}

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

    const asset = await updateAsset(ctx, id, {
      ...(body.product_id !== undefined ? { product_id: body.product_id || null } : {}),
      ...(body.visibility !== undefined ? { visibility: body.visibility } : {}),
      ...(body.title !== undefined ? { title: String(body.title) } : {}),
      ...(body.content !== undefined ? { content: body.content } : {}),
      ...(Array.isArray(body.tags) ? { tags: body.tags.map(String) } : {}),
      ...(typeof body.is_starred === 'boolean' ? { is_starred: body.is_starred } : {}),
    });

    return NextResponse.json({ asset });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '更新素材失败' },
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
    await deleteAsset(ctx, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '删除素材失败' },
      { status: 400 }
    );
  }
}
