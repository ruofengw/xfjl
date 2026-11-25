import { NextRequest, NextResponse } from 'next/server';
import {
  appendChatMessage,
  deleteChatSession,
  getAuthContext,
  listChatMessages,
  updateChatSession,
} from '@/lib/store/server-store';

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const { id } = await context.params;
    const messages = await listChatMessages(ctx, id);
    return NextResponse.json({ messages });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '加载消息失败' },
      { status: 500 }
    );
  }
}

export async function POST(
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
    const message = await appendChatMessage(ctx, {
      session_id: id,
      role: body.role === 'user' ? 'user' : body.role === 'system' ? 'system' : 'assistant',
      content: String(body.content || ''),
      reasoning_content: body.reasoning_content ? String(body.reasoning_content) : null,
    });

    return NextResponse.json({ message }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '保存消息失败' },
      { status: 400 }
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
    const session = await updateChatSession(ctx, id, {
      ...(body.title !== undefined ? { title: String(body.title) } : {}),
      ...(body.product_id !== undefined ? { product_id: body.product_id || null } : {}),
      ...(body.model_config_id !== undefined
        ? { model_config_id: body.model_config_id || null }
        : {}),
      ...(body.model_name !== undefined ? { model_name: body.model_name || null } : {}),
      ...(typeof body.is_pinned === 'boolean' ? { is_pinned: body.is_pinned } : {}),
    });

    return NextResponse.json({ session });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '更新会话失败' },
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
    await deleteChatSession(ctx, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '删除会话失败' },
      { status: 400 }
    );
  }
}
