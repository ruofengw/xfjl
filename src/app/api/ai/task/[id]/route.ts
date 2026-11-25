import { NextRequest, NextResponse } from 'next/server';
import { pollVideoTaskWithProvider } from '@/lib/providers/video-adapter';
import { uploadBufferToStorage } from '@/lib/r2';
import {
  deleteMediaTask,
  getAuthContext,
  getDecryptedApiConfig,
  getMediaTaskById,
  updateMediaTask,
} from '@/lib/store/server-store';

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildDemoPosterSvg(params: {
  title: string;
  prompt: string;
  ratio: string;
  variantIndex: number;
  isVideo: boolean;
}): string {
  const [w, h] =
    params.ratio === '16:9'
      ? [960, 540]
      : params.ratio === '1:1'
        ? [720, 720]
        : params.ratio === '3:4'
          ? [600, 800]
          : params.ratio === '4:3'
            ? [800, 600]
            : [540, 960];

  const gradients = [
    ['#4f46e5', '#06b6d4'],
    ['#7c3aed', '#ec4899'],
    ['#0f766e', '#3b82f6'],
    ['#ea580c', '#db2777'],
  ];
  const [c1, c2] = gradients[params.variantIndex % gradients.length];
  const shortPrompt = escapeXml(params.prompt.slice(0, 72));
  const badgeText = params.isVideo
    ? 'AI VIDEO STORYBOARD PREVIEW'
    : `AI IMAGE PREVIEW · #${params.variantIndex + 1}`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${c1}" />
      <stop offset="100%" stop-color="${c2}" />
    </linearGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#bg)" />
  <circle cx="${Math.round(w * 0.82)}" cy="${Math.round(h * 0.18)}" r="${Math.round(w * 0.24)}" fill="rgba(255,255,255,0.12)" />
  <circle cx="${Math.round(w * 0.18)}" cy="${Math.round(h * 0.82)}" r="${Math.round(w * 0.28)}" fill="rgba(255,255,255,0.08)" />
  <rect x="36" y="${Math.round(h * 0.34)}" width="${w - 72}" height="${Math.round(h * 0.36)}" rx="20" fill="rgba(15,23,42,0.58)" stroke="rgba(255,255,255,0.28)" />
  <text x="60" y="${Math.round(h * 0.42)}" fill="#e0e7ff" font-family="sans-serif" font-size="20" font-weight="700">${escapeXml(badgeText)}</text>
  <text x="60" y="${Math.round(h * 0.50)}" fill="#ffffff" font-family="sans-serif" font-size="26" font-weight="700">${escapeXml(params.title)} (${escapeXml(params.ratio)})</text>
  <text x="60" y="${Math.round(h * 0.58)}" fill="#cbd5e1" font-family="sans-serif" font-size="16">${shortPrompt}</text>
  <text x="60" y="${Math.round(h * 0.65)}" fill="#93c5fd" font-family="sans-serif" font-size="14">可一键转存至云端素材库（演示模式预览图）</text>
</svg>`;
}

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
    const task = await getMediaTaskById(ctx, id);
    if (!task) {
      return NextResponse.json({ error: '任务不存在' }, { status: 404 });
    }

    if (task.status === 'succeeded' || task.status === 'failed') {
      return NextResponse.json({ task });
    }

    // Real upstream async task polling
    if (task.provider_task_id && task.api_config_id) {
      const cfg = await getDecryptedApiConfig(
        ctx,
        task.api_config_id,
        task.workspace_id,
        task.task_type
      );
      if (cfg) {
        const polled = await pollVideoTaskWithProvider(
          {
            baseUrl: cfg.base_url,
            apiKey: cfg.api_key,
            protocol: cfg.protocol,
            extraConfig: cfg.extra_config,
          },
          task.provider_task_id
        );

        if (polled.status === 'succeeded') {
          const doneTask = await updateMediaTask(ctx, task.id, {
            status: 'succeeded',
            progress: 100,
            result_urls: polled.urls || [],
          });
          return NextResponse.json({ task: doneTask });
        }
        if (polled.status === 'failed') {
          const failedTask = await updateMediaTask(ctx, task.id, {
            status: 'failed',
            progress: 0,
            error_message: polled.error || '上游渲染失败',
          });
          return NextResponse.json({ task: failedTask });
        }
        if (typeof polled.progress === 'number' && polled.progress > task.progress) {
          const updated = await updateMediaTask(ctx, task.id, {
            status: 'processing',
            progress: Math.min(95, polled.progress),
          });
          return NextResponse.json({ task: updated });
        }
      }
      return NextResponse.json({ task });
    }

    // Explicit demo simulation progression (only for tasks without api_config_id)
    const elapsedMs = Date.now() - new Date(task.created_at).getTime();

    if (elapsedMs < 1400) {
      const next = await updateMediaTask(ctx, task.id, {
        status: 'processing',
        progress: 45,
      });
      return NextResponse.json({ task: next });
    }

    if (elapsedMs < 2600) {
      const next = await updateMediaTask(ctx, task.id, {
        status: 'processing',
        progress: 80,
      });
      return NextResponse.json({ task: next });
    }

    const count = task.task_type === 'image' ? task.batch_count || 1 : 1;
    const urls: string[] = [];
    for (let i = 0; i < count; i++) {
      const svg = buildDemoPosterSvg({
        title: task.task_type === 'video' ? '视频分镜成片预览' : '电商视觉成片预览',
        prompt: task.prompt,
        ratio: task.aspect_ratio,
        variantIndex: i,
        isVideo: task.task_type === 'video',
      });
      const uploaded = await uploadBufferToStorage({
        workspaceId: task.workspace_id,
        folder: 'studio-demo',
        filename: `demo-${task.task_type}-${i + 1}.svg`,
        contentType: 'image/svg+xml',
        buffer: Buffer.from(svg, 'utf8'),
      });
      urls.push(uploaded.url);
    }

    const completed = await updateMediaTask(ctx, task.id, {
      status: 'succeeded',
      progress: 100,
      result_urls: urls,
    });
    return NextResponse.json({ task: completed });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '轮询任务状态失败' },
      { status: 500 }
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
    await deleteMediaTask(ctx, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '删除历史任务失败' },
      { status: 400 }
    );
  }
}
