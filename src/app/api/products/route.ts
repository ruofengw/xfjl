import { NextRequest, NextResponse } from 'next/server';
import {
  createProduct,
  ensureUserWorkspaces,
  getAuthContext,
  listProducts,
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
      return NextResponse.json({ products: [] });
    }

    const products = await listProducts(ctx, workspaceId);
    return NextResponse.json({ products });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '加载产品库失败' },
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

    if (!workspaceId || !body.name || !String(body.name).trim()) {
      return NextResponse.json({ error: '请填写产品名称' }, { status: 400 });
    }

    const product = await createProduct(ctx, {
      workspace_id: workspaceId,
      name: String(body.name),
      selling_points: body.selling_points ? String(body.selling_points) : '',
      target_audience: body.target_audience ? String(body.target_audience) : '',
      specs_and_price: body.specs_and_price ? String(body.specs_and_price) : '',
      banned_words: Array.isArray(body.banned_words)
        ? body.banned_words.map(String)
        : [],
      reference_images: Array.isArray(body.reference_images)
        ? body.reference_images.map(String)
        : [],
    });

    return NextResponse.json({ product }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '创建产品失败' },
      { status: 400 }
    );
  }
}
