import { NextRequest, NextResponse } from 'next/server';
import { isR2Configured, isSupabaseConfigured } from '@/lib/supabase/config';
import {
  createWorkspaceInviteCode,
  createWorkspaceRecord,
  ensureUserWorkspaces,
  getAuthContext,
  joinWorkspaceByInviteCode,
  updateWorkspaceSettings,
} from '@/lib/store/server-store';

export async function GET() {
  try {
    const ctx = await getAuthContext();
    if (!ctx) {
      return NextResponse.json({ error: '未登录，请先登录账号' }, { status: 401 });
    }

    const workspaces = await ensureUserWorkspaces(ctx);
    return NextResponse.json({
      workspaces,
      user: {
        id: ctx.userId,
        email: ctx.email,
        isDemo: ctx.isDemo,
      },
      supabaseConfigured: isSupabaseConfigured(),
      r2Configured: isR2Configured(),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '加载工作空间失败' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) {
      return NextResponse.json({ error: '未登录，请先登录账号' }, { status: 401 });
    }

    const body = await request.json();
    const action = body.action as string;

    if (action === 'create') {
      const workspace = await createWorkspaceRecord(ctx, String(body.name || ''));
      return NextResponse.json({ workspace }, { status: 201 });
    }

    if (action === 'invite') {
      const workspaceId = String(body.workspaceId || '');
      const role = body.role === 'admin' ? 'admin' : 'member';
      const inviteCode = await createWorkspaceInviteCode(ctx, workspaceId, role);
      return NextResponse.json({ inviteCode }, { status: 201 });
    }

    if (action === 'join') {
      const inviteCode = String(body.inviteCode || '');
      const workspace = await joinWorkspaceByInviteCode(ctx, inviteCode);
      return NextResponse.json({ workspace });
    }

    return NextResponse.json({ error: '不支持的操作类型' }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '操作失败' },
      { status: 400 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const body = await request.json();
    const workspaceId = String(body.workspaceId || '');
    if (!workspaceId) {
      return NextResponse.json({ error: '缺少 workspaceId' }, { status: 400 });
    }

    const workspace = await updateWorkspaceSettings(ctx, workspaceId, {
      name: body.name,
      default_routing: body.default_routing,
      custom_banned_words: body.custom_banned_words,
    });

    return NextResponse.json({ workspace });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '更新设置失败' },
      { status: 400 }
    );
  }
}
