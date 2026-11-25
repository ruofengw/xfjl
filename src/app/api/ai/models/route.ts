import { NextRequest, NextResponse } from 'next/server';
import { classifyFetchedModels } from '@/lib/constants';
import { fetchProviderModelsList } from '@/lib/providers/text-adapter';
import { getAuthContext, getDecryptedApiConfig } from '@/lib/store/server-store';

export async function POST(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) {
      return NextResponse.json({ ok: false, error: '未登录' }, { status: 401 });
    }

    const body = await request.json();
    let baseUrl = String(body.base_url || '').trim().replace(/\/+$/, '');
    let apiKey = String(body.api_key || '').trim();

    if (body.configId) {
      const stored = await getDecryptedApiConfig(ctx, String(body.configId));
      if (!stored) {
        return NextResponse.json(
          { ok: false, error: '未找到该 API 配置或已被停用' },
          { status: 404 }
        );
      }
      baseUrl = baseUrl || stored.base_url;
      apiKey = apiKey || stored.api_key;
    }

    if (!baseUrl || !apiKey) {
      return NextResponse.json(
        { ok: false, error: '请先填写 Base URL 和 API Key 再获取模型' },
        { status: 400 }
      );
    }

    const fetched = await fetchProviderModelsList({ baseUrl, apiKey });
    if (!fetched.ok || !fetched.modelIds) {
      return NextResponse.json({
        ok: false,
        error: fetched.error || '上游接口未返回可用模型列表，请手动填写模型 ID',
      });
    }

    const classified = classifyFetchedModels(fetched.modelIds);
    return NextResponse.json({
      ok: true,
      total: fetched.modelIds.length,
      allModels: fetched.modelIds,
      models: classified.models,
      imageModels: classified.imageModels,
      videoModels: classified.videoModels,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : '获取模型异常' },
      { status: 500 }
    );
  }
}
