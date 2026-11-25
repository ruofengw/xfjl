import { NextRequest, NextResponse } from 'next/server';
import {
  deleteProduct,
  getAuthContext,
  updateProduct,
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

    const product = await updateProduct(ctx, id, {
      ...(body.name !== undefined ? { name: String(body.name) } : {}),
      ...(body.selling_points !== undefined
        ? { selling_points: String(body.selling_points) }
        : {}),
      ...(body.target_audience !== undefined
        ? { target_audience: String(body.target_audience) }
        : {}),
      ...(body.specs_and_price !== undefined
        ? { specs_and_price: String(body.specs_and_price) }
        : {}),
      ...(Array.isArray(body.banned_words)
        ? { banned_words: body.banned_words.map(String) }
        : {}),
      ...(Array.isArray(body.reference_images)
        ? { reference_images: body.reference_images.map(String) }
        : {}),
    });

    return NextResponse.json({ product });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '更新产品失败' },
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
    await deleteProduct(ctx, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '删除产品失败' },
      { status: 400 }
    );
  }
}
