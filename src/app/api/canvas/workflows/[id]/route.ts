import { NextRequest, NextResponse } from 'next/server';
import {
  deleteCanvasWorkflow,
  getAuthContext,
  updateCanvasWorkflow,
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

    const workflow = await updateCanvasWorkflow(ctx, id, {
      ...(body.name !== undefined ? { name: String(body.name) } : {}),
      ...(body.description !== undefined ? { description: String(body.description) } : {}),
      ...(Array.isArray(body.nodes) ? { nodes: body.nodes } : {}),
      ...(Array.isArray(body.edges) ? { edges: body.edges } : {}),
      ...(body.viewport && typeof body.viewport === 'object'
        ? {
            viewport: {
              x: Number(body.viewport.x || 0),
              y: Number(body.viewport.y || 0),
              zoom: Number(body.viewport.zoom || 1),
            },
          }
        : {}),
    });

    return NextResponse.json({ workflow });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '更新画布工作流失败' },
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
    await deleteCanvasWorkflow(ctx, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '删除画布工作流失败' },
      { status: 400 }
    );
  }
}
