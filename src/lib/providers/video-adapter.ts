import type { ProviderConnectionContext, ProviderTestResult } from './image-adapter';

export interface VideoTaskCreateRequest {
  model: string;
  prompt: string;
  negativePrompt?: string | null;
  aspectRatio: string;
  resolution?: string | null;
  durationSec?: number | null;
  fps?: number | null;
  cameraMovement?: string | null;
  referenceImageUrl?: string | null;
  endFrameImageUrl?: string | null;
}

export interface VideoTaskCreateResponse {
  ok: boolean;
  providerTaskId?: string;
  urls?: string[];
  error?: string;
}

export interface VideoTaskPollResponse {
  status: 'pending' | 'processing' | 'succeeded' | 'failed';
  progress?: number;
  urls?: string[];
  error?: string;
}

function normalizePath(p: string, fallback: string): string {
  const clean = (p || fallback).trim();
  return clean.startsWith('/') ? clean : `/${clean}`;
}

export async function testVideoProvider(
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
        error: `视频 API 鉴权/连接失败 (${res.status}): ${txt.slice(0, 180) || res.statusText}`,
      };
    }
    return {
      ok: true,
      status: res.status,
      ttfbMs,
      message: `视频 API 连接正常，响应耗时 ${ttfbMs} ms`,
    };
  } catch (err) {
    clearTimeout(timer);
    return {
      ok: false,
      ttfbMs: Date.now() - startedAt,
      error: err instanceof Error ? `视频 API 连接失败: ${err.message}` : '连接超时',
    };
  }
}

export async function createVideoTaskWithProvider(
  ctx: ProviderConnectionContext,
  req: VideoTaskCreateRequest
): Promise<VideoTaskCreateResponse> {
  const submitPath = normalizePath(
    ctx.extraConfig?.videoSubmitPath || '',
    ctx.protocol === 'kling' ? '/videos/generations' : '/video/submit'
  );
  const url = `${ctx.baseUrl.replace(/\/+$/, '')}${submitPath}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);

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
        aspect_ratio: req.aspectRatio,
        ...(req.resolution ? { resolution: req.resolution } : {}),
        ...(req.durationSec ? { duration: req.durationSec } : {}),
        ...(req.fps ? { fps: req.fps } : {}),
        ...(req.cameraMovement ? { camera_movement: req.cameraMovement } : {}),
        ...(req.referenceImageUrl ? { image: req.referenceImageUrl } : {}),
        ...(req.endFrameImageUrl ? { tail_image: req.endFrameImageUrl } : {}),
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!upstream.ok) {
      const errTxt = await upstream.text().catch(() => '');
      return {
        ok: false,
        error: `视频供应商返回 ${upstream.status}: ${errTxt.slice(0, 220) || upstream.statusText}`,
      };
    }

    const json = await upstream.json();
    const taskId = json.requestId || json.task_id || json.data?.task_id || json.id;
    if (taskId) {
      return { ok: true, providerTaskId: String(taskId) };
    }
    const directUrl = json.video_url || json.data?.[0]?.url || json.results?.videos?.[0]?.url;
    if (directUrl) {
      return { ok: true, urls: [String(directUrl)] };
    }
    return { ok: false, error: '视频接口未返回有效的任务 ID 或视频地址' };
  } catch (err) {
    clearTimeout(timer);
    return {
      ok: false,
      error: err instanceof Error ? `调用视频 API 异常: ${err.message}` : '视频任务提交超时',
    };
  }
}

export async function pollVideoTaskWithProvider(
  ctx: ProviderConnectionContext,
  providerTaskId: string
): Promise<VideoTaskPollResponse> {
  const statusTemplate = normalizePath(
    ctx.extraConfig?.videoStatusPath || '',
    ctx.protocol === 'kling' ? '/videos/generations/{taskId}' : '/video/status'
  );
  const isGetById = statusTemplate.includes('{taskId}');
  const finalPath = statusTemplate.replace('{taskId}', encodeURIComponent(providerTaskId));
  const url = `${ctx.baseUrl.replace(/\/+$/, '')}${finalPath}`;

  try {
    const res = await fetch(url, {
      method: isGetById ? 'GET' : 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ctx.apiKey}`,
      },
      ...(isGetById ? {} : { body: JSON.stringify({ requestId: providerTaskId, task_id: providerTaskId }) }),
    });

    if (!res.ok) {
      return { status: 'processing', progress: 45 };
    }

    const json = await res.json();
    const rawStatus = String(json.status || json.data?.status || '').toLowerCase();

    if (rawStatus === 'succeed' || rawStatus === 'succeeded' || rawStatus === 'completed') {
      const urls: string[] = [];
      const foundUrl =
        json.results?.videos?.[0]?.url ||
        json.video_url ||
        json.data?.video_url ||
        json.data?.output?.video_url;
      if (foundUrl) urls.push(String(foundUrl));
      return { status: 'succeeded', progress: 100, urls };
    }

    if (rawStatus === 'failed' || rawStatus === 'error') {
      return {
        status: 'failed',
        progress: 0,
        error: String(json.reason || json.error || json.message || '上游视频渲染失败'),
      };
    }

    return {
      status: 'processing',
      progress: Number(json.progress || 55),
    };
  } catch {
    return { status: 'processing', progress: 50 };
  }
}
