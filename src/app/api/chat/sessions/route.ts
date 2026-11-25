import { NextRequest, NextResponse } from 'next/server';
import {
  createChatSession,
  ensureUserWorkspaces,
  getAuthContext,
  listChatSessions,
} from '@/lib/store/server-store';

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
      return NextResponse.json({ sessions: [] });
    }

    const q = request.nextUrl.searchParams.get('q') || undefined;
    const sessions = await listChatSessions(ctx, workspaceId, q);
    return NextResponse.json({ sessions });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '加载会话列表失败' },
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

    const session = await createChatSession(ctx, {
      workspace_id: workspaceId,
      title: body.title ? String(body.title) : '新对话',
      product_id: body.product_id || null,
      model_config_id: body.model_config_id || null,
      model_name: body.model_name || null,
    });

    return NextResponse.json({ session }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '创建会话失败' },
      { status: 400 }
    );
  }
}
