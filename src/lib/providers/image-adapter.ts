import { uploadBufferToStorage } from '@/lib/r2';
import type { ApiExtraConfig, ApiProtocol } from '@/lib/types';

export interface ProviderConnectionContext {
  baseUrl: string;
  apiKey: string;
  protocol?: ApiProtocol;
  extraConfig?: ApiExtraConfig;
}

export interface ProviderTestResult {
  ok: boolean;
  status?: number;
  ttfbMs: number;
  message?: string;
  error?: string;
}

export interface ImageGenerateRequest {
  workspaceId: string;
  model: string;
  prompt: string;
  negativePrompt?: string | null;
  aspectRatio: string;
  resolution?: string | null;
  batchCount: number;
  referenceImageUrl?: string | null;
}

export interface ImageGenerateResponse {
  ok: boolean;
  urls?: string[];
  providerTaskId?: string;
  error?: string;
}

function normalizePath(p: string, fallback: string): string {
  const clean = (p || fallback).trim();
  return clean.startsWith('/') ? clean : `/${clean}`;
}

function resolveSize(aspectRatio: string, resolution?: string | null): string {
  if (resolution && /^\d+x\d+$/.test(resolution)) return resolution;
  switch (aspectRatio) {
    case '16:9':
      return '1280x720';
    case '1:1':
      return '1024x1024';
    case '3:4':
      return '768x1024';
    case '4:3':
      return '1024x768';
    case '9:16':
    default:
      return '720x1280';
  }
}

export async function testImageProvider(
  ctx: ProviderConnectionContext
): Promise<ProviderTestResult> {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(`${ctx.baseUrl.replace(/\/+$/, '')}/models`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${ctx.apiKey}` },
      signal: controller.signal,
    });
    const ttfbMs = Date.now() - startedAt;
    clearTimeout(timer);
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      return {
        ok: false,
        status: res.status,
        ttfbMs,
        error: `图片 API 鉴权/连接失败 (${res.status}): ${txt.slice(0, 180) || res.statusText}`,
      };
    }
    return {
      ok: true,
      status: res.status,
      ttfbMs,
      message: `图片 API 连接正常，响应耗时 ${ttfbMs} ms`,
    };
  } catch (err) {
    clearTimeout(timer);
    return {
      ok: false,
      ttfbMs: Date.now() - startedAt,
      error: err instanceof Error ? `图片 API 连接失败: ${err.message}` : '连接超时',
    };
  }
}

export async function generateImageWithProvider(
  ctx: ProviderConnectionContext,
  req: ImageGenerateRequest
): Promise<ImageGenerateResponse> {
  const endpointPath = normalizePath(
    ctx.extraConfig?.imageEndpointPath || '',
    '/images/generations'
  );
  const url = `${ctx.baseUrl.replace(/\/+$/, '')}${endpointPath}`;
  const size = resolveSize(req.aspectRatio, req.resolution);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);

  try {
    const upstream = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ctx.apiKey}`,
      },
      body: JSON.stringify({
        model: req.model,
        prompt: req.prompt,
        ...(req.negativePrompt ? { negative_prompt: req.negativePrompt } : {}),
        n: req.batchCount,
        size,
        ...(req.referenceImageUrl ? { image: req.referenceImageUrl } : {}),
      }),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!upstream.ok) {
      const errTxt = await upstream.text().catch(() => '');
      return {
        ok: false,
        error: `图片供应商返回 ${upstream.status}: ${errTxt.slice(0, 220) || upstream.statusText}`,
      };
    }

    const json = await upstream.json();
    const rawItems = Array.isArray(json.data)
      ? json.data
      : Array.isArray(json.images)
        ? json.images
        : [];
    const savedUrls: string[] = [];

    for (let idx = 0; idx < rawItems.length; idx++) {
      const item = rawItems[idx];
      if (item?.url) {
        savedUrls.push(String(item.url));
      } else if (item?.b64_json) {
        const buf = Buffer.from(String(item.b64_json), 'base64');
        const uploaded = await uploadBufferToStorage({
          workspaceId: req.workspaceId,
          folder: 'studio-generated',
          filename: `img-${idx + 1}.png`,
          contentType: 'image/png',
          buffer: buf,
        });
        savedUrls.push(uploaded.url);
      }
    }

    if (savedUrls.length > 0) {
      return { ok: true, urls: savedUrls };
    }

    const asyncId = json.task_id || json.requestId || json.id;
    if (asyncId) {
      return { ok: true, providerTaskId: String(asyncId) };
    }

    return { ok: false, error: '图片接口返回格式中未包含图片地址或任务 ID' };
  } catch (err) {
    clearTimeout(timer);
    return {
      ok: false,
      error: err instanceof Error ? `调用图片 API 异常: ${err.message}` : '图片请求超时',
    };
  }
}
