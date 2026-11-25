import { NextRequest, NextResponse } from 'next/server';
import {
  createCanvasWorkflow,
  ensureUserWorkspaces,
  getAuthContext,
  listCanvasWorkflows,
} from '@/lib/store/server-store';

export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    let workspaceId = request.nextUrl.searchParams.get('workspaceId') || '';
    if (!workspaceId) {
      const wsList = await ensureUserWorkspaces(ctx);
      workspaceId = wsList[0]?.id || '';
    }
    if (!workspaceId) {
      return NextResponse.json({ workflows: [] });
    }

    const workflows = await listCanvasWorkflows(ctx, workspaceId);
    return NextResponse.json({ workflows });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '加载工作流失败' },
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
      const wsList = await ensureUserWorkspaces(ctx);
      workspaceId = wsList[0]?.id || '';
    }

    const workflow = await createCanvasWorkflow(ctx, {
      workspace_id: workspaceId,
      name: String(body.name || '未命名画布工作流'),
      description: body.description ? String(body.description) : '',
      nodes: Array.isArray(body.nodes) ? body.nodes : [],
      edges: Array.isArray(body.edges) ? body.edges : [],
      viewport:
        body.viewport && typeof body.viewport === 'object'
          ? {
              x: Number(body.viewport.x || 0),
              y: Number(body.viewport.y || 0),
              zoom: Number(body.viewport.zoom || 1),
            }
          : undefined,
    });

    return NextResponse.json({ workflow }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '保存工作流失败' },
      { status: 400 }
    );
  }
}
