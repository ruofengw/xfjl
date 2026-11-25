import { NextRequest, NextResponse } from 'next/server';
import { testImageProvider } from '@/lib/providers/image-adapter';
import { testTextProvider } from '@/lib/providers/text-adapter';
import { testVideoProvider } from '@/lib/providers/video-adapter';
import {
  getAuthContext,
  getDecryptedApiConfig,
  updateApiConfig,
} from '@/lib/store/server-store';
import type { ApiCategory, ApiExtraConfig, ApiProtocol } from '@/lib/types';

export async function POST(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const body = await request.json();
    let baseUrl = String(body.base_url || '').trim().replace(/\/+$/, '');
    let apiKey = String(body.api_key || '').trim();
    let model = String(body.model || '').trim();
    let apiType: ApiCategory =
      body.api_type === 'image' || body.api_type === 'video' || body.api_type === 'text'
        ? body.api_type
        : body.videoOnly
          ? 'video'
          : 'text';
    let protocol: ApiProtocol = body.protocol || 'openai';
    let existingExtra: ApiExtraConfig =
      body.extra_config && typeof body.extra_config === 'object' ? body.extra_config : {};

    const configId = body.configId ? String(body.configId) : null;
    if (configId) {
      const stored = await getDecryptedApiConfig(ctx, configId);
      if (!stored) {
        return NextResponse.json(
          { ok: false, error: '未找到该 API 配置或已被停用' },
          { status: 404 }
        );
      }
      baseUrl = baseUrl || stored.base_url;
      apiKey = apiKey || stored.api_key;
      apiType = stored.api_type;
      protocol = stored.protocol;
      existingExtra = stored.extra_config || {};
      model = model || stored.models[0] || stored.image_models[0] || stored.video_models[0] || '';
    }

    if (!baseUrl || !apiKey) {
      return NextResponse.json(
        { ok: false, error: '缺少 Base URL 或 API Key' },
        { status: 400 }
      );
    }

    const conn = { baseUrl, apiKey, protocol, extraConfig: existingExtra };
    const result =
      apiType === 'image'
        ? await testImageProvider(conn)
        : apiType === 'video'
          ? await testVideoProvider(conn)
          : await testTextProvider(conn, model);

    // Persist last test status back to api_config.extra_config
    if (configId) {
      try {
        await updateApiConfig(ctx, configId, {
          extra_config: {
            ...existingExtra,
            lastTestStatus: result.ok ? 'ok' : 'error',
            lastTestedAt: new Date().toISOString(),
            lastLatencyMs: result.ttfbMs,
            lastTestMessage: result.ok ? result.message : result.error,
          },
        });
      } catch {
        // Non-fatal if metadata persist fails
      }
    }

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : '测试请求异常' },
      { status: 500 }
    );
  }
}
