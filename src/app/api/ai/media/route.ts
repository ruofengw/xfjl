import { NextRequest, NextResponse } from 'next/server';
import { generateImageWithProvider } from '@/lib/providers/image-adapter';
import { createVideoTaskWithProvider } from '@/lib/providers/video-adapter';
import {
  createMediaTask,
  ensureUserWorkspaces,
  getAuthContext,
  getDecryptedApiConfig,
  listMediaTasks,
  updateMediaTask,
} from '@/lib/store/server-store';
import type { MediaGenerationMode, MediaTaskType } from '@/lib/types';

export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    let workspaceId = request.nextUrl.searchParams.get('workspaceId') || '';
    if (!workspaceId) {
      const wsList = await ensureUserWorkspaces(ctx);
      workspaceId = wsList[0]?.id || '';
    }
    if (!workspaceId) {
      return NextResponse.json({ tasks: [] });
    }

    const rawType = request.nextUrl.searchParams.get('taskType');
    const taskType: MediaTaskType | undefined =
      rawType === 'image' || rawType === 'video' ? rawType : undefined;

    const tasks = await listMediaTasks(ctx, workspaceId, taskType);
    return NextResponse.json({ tasks });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '加载任务列表失败' },
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
      const wsList = await ensureUserWorkspaces(ctx);
      workspaceId = wsList[0]?.id || '';
    }

    const prompt = String(body.prompt || '').trim();
    if (!prompt) {
      return NextResponse.json({ error: '请输入画面生成提示词' }, { status: 400 });
    }

    const taskType: MediaTaskType = body.task_type === 'video' ? 'video' : 'image';
    const mode: MediaGenerationMode =
      body.mode === 'i2i' ||
      body.mode === 't2v' ||
      body.mode === 'i2v' ||
      body.mode === 'first_last_frame'
        ? body.mode
        : taskType === 'video'
          ? 't2v'
          : 't2i';

    const aspectRatio = String(body.aspect_ratio || '9:16');
    const resolution = body.resolution ? String(body.resolution) : null;
    const durationSec = body.duration_sec ? Number(body.duration_sec) : null;
    const fps = body.fps ? Number(body.fps) : null;
    const cameraMovement = body.camera_movement ? String(body.camera_movement) : null;
    const batchCount =
      taskType === 'image' ? Math.min(4, Math.max(1, Number(body.batch_count || 1))) : 1;
    const negativePrompt = body.negative_prompt ? String(body.negative_prompt) : null;
    const referenceImageUrl = body.reference_image_url
      ? String(body.reference_image_url)
      : null;
    const endFrameImageUrl = body.end_frame_image_url
      ? String(body.end_frame_image_url)
      : null;
    const nodeId = body.node_id ? String(body.node_id) : null;
    const apiConfigId = body.api_config_id ? String(body.api_config_id) : null;
    const modelName = String(
      body.model_name || (taskType === 'video' ? 'video-demo' : 'image-demo')
    );

    // STRICT API ISOLATION: Never allow cross-type API invocation or silent fallback
    let resolvedCfg = null;
    if (apiConfigId) {
      resolvedCfg = await getDecryptedApiConfig(ctx, apiConfigId, workspaceId, taskType);
      if (!resolvedCfg) {
        const expectedLabel = taskType === 'image' ? '图片 API' : '视频 API';
        return NextResponse.json(
          {
            error: `所选 API 渠道不存在、已被停用，或不属于「${expectedLabel}」类型。请前往 API 管理中心配置专用${expectedLabel}。`,
          },
          { status: 400 }
        );
      }
    }

    const inputSnapshot: Record<string, unknown> = {
      ...(body.input_snapshot && typeof body.input_snapshot === 'object'
        ? body.input_snapshot
        : {}),
      mode,
      aspectRatio,
      resolution,
      durationSec,
      fps,
      cameraMovement,
      batchCount,
      hasReferenceImage: Boolean(referenceImageUrl),
      hasEndFrameImage: Boolean(endFrameImageUrl),
      providerName: resolvedCfg?.display_name || '演示模拟模式',
    };

    const task = await createMediaTask(ctx, {
      workspace_id: workspaceId,
      product_id: body.product_id || null,
      api_config_id: apiConfigId,
      node_id: nodeId,
      provider_name: resolvedCfg?.display_name || '演示模拟模式',
      task_type: taskType,
      mode,
      status: 'pending',
      progress: 15,
      prompt,
      negative_prompt: negativePrompt,
      aspect_ratio: aspectRatio,
      resolution,
      duration_sec: durationSec,
      fps,
      camera_movement: cameraMovement,
      model_name: modelName,
      batch_count: batchCount,
      reference_image_url: referenceImageUrl,
      input_snapshot: inputSnapshot,
    });

    if (resolvedCfg) {
      const conn = {
        baseUrl: resolvedCfg.base_url,
        apiKey: resolvedCfg.api_key,
        protocol: resolvedCfg.protocol,
        extraConfig: resolvedCfg.extra_config,
      };

      if (taskType === 'image') {
        const finalModel =
          modelName || resolvedCfg.image_models[0] || resolvedCfg.models[0] || '';
        const res = await generateImageWithProvider(conn, {
          workspaceId,
          model: finalModel,
          prompt,
          negativePrompt,
          aspectRatio,
          resolution,
          batchCount,
          referenceImageUrl,
        });

        if (!res.ok) {
          const failed = await updateMediaTask(ctx, task.id, {
            status: 'failed',
            progress: 0,
            error_message: res.error || '图片生成失败',
          });
          return NextResponse.json({ task: failed }, { status: 201 });
        }

        if (res.urls && res.urls.length > 0) {
          const completed = await updateMediaTask(ctx, task.id, {
            status: 'succeeded',
            progress: 100,
            result_urls: res.urls,
          });
          return NextResponse.json({ task: completed }, { status: 201 });
        }

        if (res.providerTaskId) {
          const processing = await updateMediaTask(ctx, task.id, {
            provider_task_id: res.providerTaskId,
            status: 'processing',
            progress: 35,
          });
          return NextResponse.json({ task: processing }, { status: 201 });
        }
      } else {
        const finalModel =
          modelName || resolvedCfg.video_models[0] || resolvedCfg.models[0] || '';
        const res = await createVideoTaskWithProvider(conn, {
          model: finalModel,
          prompt,
          negativePrompt,
          aspectRatio,
          resolution,
          durationSec,
          fps,
          cameraMovement,
          referenceImageUrl,
          endFrameImageUrl,
        });

        if (!res.ok) {
          const failed = await updateMediaTask(ctx, task.id, {
            status: 'failed',
            progress: 0,
            error_message: res.error || '视频任务提交失败',
          });
          return NextResponse.json({ task: failed }, { status: 201 });
        }

        if (res.urls && res.urls.length > 0) {
          const completed = await updateMediaTask(ctx, task.id, {
            status: 'succeeded',
            progress: 100,
            result_urls: res.urls,
          });
          return NextResponse.json({ task: completed }, { status: 201 });
        }

        if (res.providerTaskId) {
          const processing = await updateMediaTask(ctx, task.id, {
            provider_task_id: res.providerTaskId,
            status: 'processing',
            progress: 30,
          });
          return NextResponse.json({ task: processing }, { status: 201 });
        }
      }
    }

    // Explicit demo simulation mode (only when api_config_id is null)
    return NextResponse.json({ task }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '提交生成任务失败' },
      { status: 500 }
    );
  }
}
