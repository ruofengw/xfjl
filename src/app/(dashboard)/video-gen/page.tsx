'use client';

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clapperboard,
  Copy,
  Download,
  Film,
  FolderOpen,
  FolderPlus,
  Info,
  Loader2,
  RefreshCw,
  Settings2,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { useWorkspace } from '@/components/providers/workspace-provider';
import { ProductSelector } from '@/components/product-selector/product-selector';
import {
  AssetSaveDialog,
  type AssetSavePayload,
} from '@/components/asset-save-dialog/asset-save-dialog';
import {
  ASPECT_RATIOS,
  CAMERA_MOVEMENTS,
  VIDEO_DURATIONS,
  VIDEO_RESOLUTIONS,
} from '@/lib/constants';
import { streamAiChat } from '@/lib/ai-stream';
import type { Asset, MediaTask, StoryboardPromptCard } from '@/lib/types';
import { uploadFileToCloud } from '@/lib/upload-client';
import { copyToClipboard, formatDateTime } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';

const DEMO_CONFIG_VALUE = 'demo_sim';

function isPlayableVideoUrl(url: string): boolean {
  return /\.(mp4|webm|mov)(\?|$)/i.test(url) || url.includes('video');
}

function VideoGenContent() {
  const searchParams = useSearchParams();
  const { activeWorkspaceId, apiConfigs, products } = useWorkspace();

  // STRICT ISOLATION: only active Video API configs
  const videoApiConfigs = useMemo(
    () =>
      apiConfigs.filter(
        (c) => c.is_active && c.api_type === 'video' && (c.video_models || []).length > 0
      ),
    [apiConfigs]
  );

  const [workMode, setWorkMode] = useState<'generate' | 'storyboard'>('generate');
  const [mode, setMode] = useState<'t2v' | 'i2v' | 'first_last_frame'>('t2v');
  const [configId, setConfigId] = useState<string>(DEMO_CONFIG_VALUE);
  const [modelName, setModelName] = useState<string>('video-demo');
  const [prompt, setPrompt] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState('9:16');
  const [resolution, setResolution] = useState('720p');
  const [durationSec, setDurationSec] = useState<number>(5);
  const [fps, setFps] = useState<number>(24);
  const [cameraMovement, setCameraMovement] = useState<string>(CAMERA_MOVEMENTS[0]);
  const [productId, setProductId] = useState('');
  const [firstFrameUrl, setFirstFrameUrl] = useState('');
  const [endFrameUrl, setEndFrameUrl] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [uploadingSlot, setUploadingSlot] = useState<'first' | 'end' | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [tasks, setTasks] = useState<MediaTask[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(true);

  // Storyboard prompt card mode (zero-cost LLM)
  const [generatingStoryboard, setGeneratingStoryboard] = useState(false);
  const [shots, setShots] = useState<StoryboardPromptCard[]>([]);

  // Dialogs
  const [detailTask, setDetailTask] = useState<MediaTask | null>(null);
  const [deleteTaskTarget, setDeleteTaskTarget] = useState<MediaTask | null>(null);
  const [assetPickerSlot, setAssetPickerSlot] = useState<'first' | 'end' | null>(null);
  const [imageAssets, setImageAssets] = useState<Asset[]>([]);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [savePayload, setSavePayload] = useState<AssetSavePayload | null>(null);

  const firstFrameRef = useRef<HTMLInputElement | null>(null);
  const endFrameRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const qPrompt = searchParams.get('prompt');
    const qNeg = searchParams.get('negativePrompt');
    const qRatio = searchParams.get('aspectRatio');
    const qRef = searchParams.get('refImage');
    const qProd = searchParams.get('productId');
    if (qPrompt) setPrompt(qPrompt);
    if (qNeg) {
      setNegativePrompt(qNeg);
      setShowAdvanced(true);
    }
    if (qRatio) setAspectRatio(qRatio);
    if (qRef) {
      setFirstFrameUrl(qRef);
      setMode('i2v');
    }
    if (qProd) setProductId(qProd);
  }, [searchParams]);

  useEffect(() => {
    if (videoApiConfigs.length === 0) {
      setConfigId(DEMO_CONFIG_VALUE);
      setModelName('video-demo');
      return;
    }
    const exists = videoApiConfigs.some((c) => c.id === configId);
    if (!exists) {
      const def = videoApiConfigs.find((c) => c.is_default) || videoApiConfigs[0];
      setConfigId(def.id);
      setModelName(def.video_models[0] || '');
    }
  }, [videoApiConfigs, configId]);

  const activeConfig = useMemo(
    () => videoApiConfigs.find((c) => c.id === configId) || null,
    [videoApiConfigs, configId]
  );

  const loadTasks = useCallback(async () => {
    if (!activeWorkspaceId) return;
    try {
      const res = await fetch(
        `/api/ai/media?workspaceId=${encodeURIComponent(activeWorkspaceId)}&taskType=video`
      );
      if (res.ok) {
        const data = await res.json();
        setTasks(Array.isArray(data.tasks) ? data.tasks : []);
      }
    } finally {
      setLoadingTasks(false);
    }
  }, [activeWorkspaceId]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  const hasRunningTasks = useMemo(
    () => tasks.some((t) => t.status === 'pending' || t.status === 'processing'),
    [tasks]
  );

  useEffect(() => {
    if (!hasRunningTasks) return;
    const timer = setInterval(async () => {
      const activeIds = tasks
        .filter((t) => t.status === 'pending' || t.status === 'processing')
        .map((t) => t.id);

      const updates = await Promise.all(
        activeIds.map(async (id) => {
          const r = await fetch(`/api/ai/task/${id}`);
          if (!r.ok) return null;
          const d = await r.json();
          return d.task as MediaTask;
        })
      );

      const valid = updates.filter(Boolean) as MediaTask[];
      if (valid.length > 0) {
        setTasks((prev) =>
          prev.map((t) => valid.find((u) => u.id === t.id) || t)
        );
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [hasRunningTasks, tasks]);

  const openAssetPicker = async (slot: 'first' | 'end') => {
    if (!activeWorkspaceId) return;
    setAssetPickerSlot(slot);
    const res = await fetch(
      `/api/assets?workspaceId=${encodeURIComponent(activeWorkspaceId)}&assetType=image`
    );
    if (res.ok) {
      const data = await res.json();
      setImageAssets(Array.isArray(data.assets) ? data.assets : []);
    }
  };

  const handleUploadFrame = async (
    slot: 'first' | 'end',
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file || !activeWorkspaceId) return;
    setUploadingSlot(slot);
    try {
      const uploaded = await uploadFileToCloud(file, activeWorkspaceId, 'video-frames');
      if (slot === 'first') setFirstFrameUrl(uploaded.url);
      else setEndFrameUrl(uploaded.url);
      toast.success(slot === 'first' ? '首帧参考图上传成功' : '尾帧参考图上传成功');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '上传失败');
    } finally {
      setUploadingSlot(null);
      e.target.value = '';
    }
  };

  const handleGenerateVideo = async () => {
    if (submitting) return;
    if (!activeWorkspaceId) {
      toast.error('未检测到当前工作空间');
      return;
    }
    if (!prompt.trim()) {
      toast.error('请输入视频分镜与动态提示词');
      return;
    }
    if ((mode === 'i2v' || mode === 'first_last_frame') && !firstFrameUrl) {
      toast.error('请先上传或选择首帧参考图');
      return;
    }
    if (mode === 'first_last_frame' && !endFrameUrl) {
      toast.error('首尾帧模式需要同时提供尾帧参考图');
      return;
    }

    const selectedProduct = products.find((p) => p.id === productId);
    const enrichedPrompt = selectedProduct
      ? `${prompt.trim()}（展示商品：${selectedProduct.name}，核心亮点：${selectedProduct.selling_points.slice(0, 100)}）`
      : prompt.trim();

    setSubmitting(true);
    try {
      const res = await fetch('/api/ai/media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspace_id: activeWorkspaceId,
          product_id: productId || null,
          api_config_id: configId === DEMO_CONFIG_VALUE ? null : configId,
          task_type: 'video',
          mode,
          prompt: enrichedPrompt,
          negative_prompt: negativePrompt.trim() || null,
          aspect_ratio: aspectRatio,
          resolution,
          duration_sec: durationSec,
          fps,
          camera_movement: cameraMovement,
          model_name:
            configId === DEMO_CONFIG_VALUE ? 'video-demo' : modelName || activeConfig?.video_models[0],
          reference_image_url: mode !== 't2v' ? firstFrameUrl : null,
          end_frame_image_url: mode === 'first_last_frame' ? endFrameUrl : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || '提交视频任务失败');
        return;
      }

      const created = data.task as MediaTask;
      setTasks((prev) => [created, ...prev]);
      if (created.status === 'failed') {
        toast.error(created.error_message || '视频任务提交失败');
      } else {
        toast.success('视频任务已提交异步队列，正在自动轮询渲染状态...');
      }
    } catch {
      toast.error('网络错误，无法提交视频任务');
    } finally {
      setSubmitting(false);
    }
  };

  const handleGenerateStoryboard = async () => {
    if (!activeWorkspaceId || !prompt.trim()) {
      toast.error('请先输入视频主题或分镜创意');
      return;
    }
    setGeneratingStoryboard(true);
    setShots([]);
    try {
      let raw = '';
      const streamResult = await streamAiChat({
        workspaceId: activeWorkspaceId,
        scene: 'storyboard',
        productId: productId || undefined,
        messages: [
          {
            role: 'user',
            content: `请基于以下创意拆解 3 个短视频分镜，并以纯 JSON 数组返回，每项包含 shot_number, shot_type, duration, visual_zh, prompt_en, negative_prompt, camera_movement, lighting_style, aspect_ratio, suggested_tool。\n画面比例：${aspectRatio}\n创意需求：${prompt.trim()}`,
          },
        ],
        onDelta: (_chunk, full) => {
          raw = full;
        },
      });
      raw = raw || streamResult.content;

      const jsonMatch = raw.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (Array.isArray(parsed)) {
          setShots(parsed as StoryboardPromptCard[]);
          toast.success(`已生成 ${parsed.length} 组结构化分镜提示词`);
          return;
        }
      }
      toast.error('分镜结构解析失败，请稍后重试');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '生成分镜失败');
    } finally {
      setGeneratingStoryboard(false);
    }
  };

  const handleRegenerateFromTask = (task: MediaTask) => {
    setWorkMode('generate');
    setPrompt(task.prompt);
    if (task.negative_prompt) {
      setNegativePrompt(task.negative_prompt);
      setShowAdvanced(true);
    }
    setAspectRatio(task.aspect_ratio || '9:16');
    if (task.resolution) setResolution(task.resolution);
    if (task.duration_sec) setDurationSec(task.duration_sec);
    if (task.camera_movement) setCameraMovement(task.camera_movement);
    if (task.reference_image_url) {
      setFirstFrameUrl(task.reference_image_url);
      setMode('i2v');
    } else {
      setMode('t2v');
    }
    toast.success('已回填视频参数，可直接重新生成');
  };

  const handleConfirmDeleteTask = async () => {
    if (!deleteTaskTarget) return;
    const res = await fetch(`/api/ai/task/${deleteTaskTarget.id}`, {
      method: 'DELETE',
    });
    if (res.ok) {
      setTasks((prev) => prev.filter((t) => t.id !== deleteTaskTarget.id));
      toast.success('已删除该视频任务');
    } else {
      toast.error('删除失败');
    }
    setDeleteTaskTarget(null);
  };

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2.5">
            <Film className="h-6 w-6 text-violet-600" />
            视频生成工作台
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            专注文生视频、图生视频与首尾帧运镜，独立绑定「视频 API」异步任务通道。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Tabs value={workMode} onValueChange={(v) => setWorkMode(v as 'generate' | 'storyboard')}>
            <TabsList className="h-9">
              <TabsTrigger value="generate" className="text-xs gap-1.5">
                <Film className="h-3.5 w-3.5" />
                视频任务生成
              </TabsTrigger>
              <TabsTrigger value="storyboard" className="text-xs gap-1.5">
                <Clapperboard className="h-3.5 w-3.5" />
                分镜提示词卡片
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <Button asChild variant="outline" size="sm">
            <Link href="/settings/api?tab=video">
              <Settings2 className="mr-1.5 h-3.5 w-3.5" />
              配置视频 API
            </Link>
          </Button>
        </div>
      </div>

      {/* Main 2-Column Layout */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
        {/* Left: Controls Panel */}
        <Card className="lg:col-span-4 lg:sticky lg:top-4">
          <CardContent className="p-5 space-y-4">
            {workMode === 'generate' && (
              <>
                {/* Mode Switch */}
                <div className="grid grid-cols-3 rounded-lg bg-slate-100 p-1 gap-0.5">
                  {(
                    [
                      { id: 't2v', label: '文生视频' },
                      { id: 'i2v', label: '图生视频' },
                      { id: 'first_last_frame', label: '首尾帧' },
                    ] as const
                  ).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setMode(item.id)}
                      className={`rounded-md py-1.5 text-xs font-medium transition-all ${
                        mode === item.id
                          ? 'bg-white text-violet-700 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>

                {/* Video API Provider & Model */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold">视频 API 供应商</Label>
                    {videoApiConfigs.length === 0 && (
                      <Link
                        href="/settings/api?tab=video"
                        className="text-[11px] font-medium text-violet-600 hover:underline"
                      >
                        + 去配置视频 API
                      </Link>
                    )}
                  </div>

                  {videoApiConfigs.length === 0 && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-[11px] text-amber-800 leading-relaxed">
                      尚未配置专用「视频 API」。可先使用演示模拟模式体验流程，或
                      <Link href="/settings/api?tab=video" className="underline font-semibold ml-1">
                        前往添加视频 API
                      </Link>
                      。
                    </div>
                  )}

                  <Select
                    value={configId}
                    onValueChange={(val) => {
                      setConfigId(val);
                      if (val === DEMO_CONFIG_VALUE) {
                        setModelName('video-demo');
                      } else {
                        const found = videoApiConfigs.find((c) => c.id === val);
                        setModelName(found?.video_models[0] || '');
                      }
                    }}
                  >
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {videoApiConfigs.map((c) => (
                        <SelectItem key={c.id} value={c.id} className="text-xs">
                          {c.display_name} {c.is_default ? '（默认）' : ''}
                        </SelectItem>
                      ))}
                      <SelectItem value={DEMO_CONFIG_VALUE} className="text-xs text-muted-foreground">
                        演示模拟模式（零消耗预览）
                      </SelectItem>
                    </SelectContent>
                  </Select>

                  {activeConfig && activeConfig.video_models.length > 0 && (
                    <div className="space-y-1">
                      <Label className="text-xs font-semibold">视频模型</Label>
                      <Select value={modelName} onValueChange={setModelName}>
                        <SelectTrigger className="h-9 text-xs font-mono">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {activeConfig.video_models.map((m) => (
                            <SelectItem key={m} value={m} className="text-xs font-mono">
                              {m}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>

                {/* First / End Frame Uploaders */}
                {mode !== 't2v' && (
                  <div className="grid grid-cols-1 gap-3">
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-semibold">
                          {mode === 'first_last_frame' ? '首帧图' : '参考首帧图'}
                        </Label>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-[11px] text-violet-600"
                          onClick={() => openAssetPicker('first')}
                        >
                          <FolderOpen className="mr-1 h-3 w-3" />
                          素材库
                        </Button>
                      </div>
                      <input
                        ref={firstFrameRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => handleUploadFrame('first', e)}
                      />
                      {firstFrameUrl ? (
                        <div className="relative overflow-hidden rounded-lg border bg-slate-50">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={firstFrameUrl}
                            alt="首帧"
                            className="h-28 w-full object-contain"
                          />
                          <Button
                            type="button"
                            size="icon"
                            variant="destructive"
                            className="absolute right-2 top-2 h-6 w-6"
                            onClick={() => setFirstFrameUrl('')}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          disabled={uploadingSlot === 'first'}
                          onClick={() => firstFrameRef.current?.click()}
                          className="flex h-24 w-full flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-200 bg-slate-50/50 text-xs text-muted-foreground hover:border-violet-400 hover:text-violet-600"
                        >
                          {uploadingSlot === 'first' ? (
                            <Loader2 className="h-4 w-4 animate-spin mb-1" />
                          ) : (
                            <Upload className="h-4 w-4 mb-1" />
                          )}
                          <span>点击上传首帧图（≤ 15MB）</span>
                        </button>
                      )}
                    </div>

                    {mode === 'first_last_frame' && (
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs font-semibold">尾帧图</Label>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-[11px] text-violet-600"
                            onClick={() => openAssetPicker('end')}
                          >
                            <FolderOpen className="mr-1 h-3 w-3" />
                            素材库
                          </Button>
                        </div>
                        <input
                          ref={endFrameRef}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => handleUploadFrame('end', e)}
                        />
                        {endFrameUrl ? (
                          <div className="relative overflow-hidden rounded-lg border bg-slate-50">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={endFrameUrl}
                              alt="尾帧"
                              className="h-28 w-full object-contain"
                            />
                            <Button
                              type="button"
                              size="icon"
                              variant="destructive"
                              className="absolute right-2 top-2 h-6 w-6"
                              onClick={() => setEndFrameUrl('')}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            disabled={uploadingSlot === 'end'}
                            onClick={() => endFrameRef.current?.click()}
                            className="flex h-24 w-full flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-200 bg-slate-50/50 text-xs text-muted-foreground hover:border-violet-400 hover:text-violet-600"
                          >
                            {uploadingSlot === 'end' ? (
                              <Loader2 className="h-4 w-4 animate-spin mb-1" />
                            ) : (
                              <Upload className="h-4 w-4 mb-1" />
                            )}
                            <span>点击上传尾帧图（≤ 15MB）</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            {/* Prompt */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">
                {workMode === 'generate' ? '视频画面与动态描述 Prompt' : '分镜创意主题'}
              </Label>
              <Textarea
                rows={4}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="描述主体动作、镜头运动、光影氛围，例如：镜头缓慢推进，阳光洒在玻璃瓶身上，透明精华液泛起柔和光泽，背景轻微虚化，电影级商业广告质感..."
                className="resize-none text-sm leading-relaxed"
              />
            </div>

            {/* Aspect Ratio */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">画幅比例</Label>
              <div className="grid grid-cols-5 gap-1.5">
                {ASPECT_RATIOS.map((r) => (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => setAspectRatio(r.value)}
                    className={`rounded-md border py-1.5 text-xs font-medium tabular-nums transition-colors ${
                      aspectRatio === r.value
                        ? 'border-violet-600 bg-violet-50 text-violet-700'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    {r.value}
                  </button>
                ))}
              </div>
            </div>

            {workMode === 'generate' && (
              <>
                {/* Duration & Resolution */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">视频时长</Label>
                    <div className="grid grid-cols-3 gap-1">
                      {VIDEO_DURATIONS.map((sec) => (
                        <button
                          key={sec}
                          type="button"
                          onClick={() => setDurationSec(sec)}
                          className={`h-9 rounded-md border text-xs font-semibold tabular-nums transition-colors ${
                            durationSec === sec
                              ? 'border-violet-600 bg-violet-600 text-white'
                              : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                          }`}
                        >
                          {sec}s
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">清晰度</Label>
                    <Select value={resolution} onValueChange={setResolution}>
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {VIDEO_RESOLUTIONS.map((resVal) => (
                          <SelectItem key={resVal} value={resVal} className="text-xs">
                            {resVal}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Camera Movement */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold flex items-center gap-1">
                    <Camera className="h-3.5 w-3.5 text-muted-foreground" />
                    运镜控制
                  </Label>
                  <Select value={cameraMovement} onValueChange={setCameraMovement}>
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CAMERA_MOVEMENTS.map((cm) => (
                        <SelectItem key={cm} value={cm} className="text-xs">
                          {cm}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Collapsible Advanced */}
                <div className="border-t pt-3">
                  <button
                    type="button"
                    onClick={() => setShowAdvanced((v) => !v)}
                    className="flex w-full items-center justify-between text-xs font-medium text-muted-foreground hover:text-foreground"
                  >
                    <span>高级设置（帧率 / 反向提示词 / 产品知识库）</span>
                    {showAdvanced ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </button>
                  {showAdvanced && (
                    <div className="mt-3 space-y-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">帧率 (FPS)</Label>
                        <Select
                          value={String(fps)}
                          onValueChange={(v) => setFps(Number(v))}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="24">24 FPS（电影感）</SelectItem>
                            <SelectItem value="30">30 FPS（流畅电商）</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">关联产品知识库（可选）</Label>
                        <ProductSelector value={productId} onChange={setProductId} />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">反向提示词</Label>
                        <Textarea
                          rows={2}
                          value={negativePrompt}
                          onChange={(e) => setNegativePrompt(e.target.value)}
                          placeholder="flicker, morphing, distorted face, watermark..."
                          className="resize-none text-xs"
                        />
                      </div>
                    </div>
                  )}
                </div>

                <Button
                  type="button"
                  disabled={submitting}
                  onClick={handleGenerateVideo}
                  className="w-full h-10 bg-violet-600 hover:bg-violet-700 text-sm font-semibold"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      正在提交视频任务...
                    </>
                  ) : (
                    <>
                      <Sparkles className="mr-2 h-4 w-4" />
                      提交视频生成任务（{durationSec}s · {resolution}）
                    </>
                  )}
                </Button>
              </>
            )}

            {workMode === 'storyboard' && (
              <>
                <div className="space-y-1.5">
                  <Label className="text-xs">关联产品知识库（可选）</Label>
                  <ProductSelector value={productId} onChange={setProductId} />
                </div>
                <Button
                  type="button"
                  disabled={generatingStoryboard}
                  onClick={handleGenerateStoryboard}
                  className="w-full h-10 bg-violet-600 hover:bg-violet-700 text-sm font-semibold"
                >
                  {generatingStoryboard ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      正在拆解分镜卡片...
                    </>
                  ) : (
                    <>
                      <Clapperboard className="mr-2 h-4 w-4" />
                      生成结构化分镜提示词
                    </>
                  )}
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        {/* Right: Video Task Queue or Storyboard Cards */}
        <div className="lg:col-span-8 space-y-4">
          {workMode === 'storyboard' ? (
            shots.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed bg-card/60 py-20 text-center px-6">
                <Clapperboard className="h-10 w-10 text-violet-400 mb-3" />
                <p className="text-sm font-semibold">零成本分镜提示词拆解</p>
                <p className="mt-1 text-xs text-muted-foreground max-w-md">
                  无需消耗视频 API 额度，即可生成包含中英文 Prompt、运镜与光影建议的分镜卡片，支持一键填入左侧提交视频生成。
                </p>
              </div>
            ) : (
              shots.map((shot) => (
                <Card key={shot.shot_number}>
                  <CardContent className="p-4 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Badge className="bg-violet-100 text-violet-800 hover:bg-violet-100">
                          分镜 #{shot.shot_number}
                        </Badge>
                        <span className="text-sm font-semibold">{shot.shot_type}</span>
                        <Badge variant="outline" className="text-[11px]">
                          {shot.duration}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={async () => {
                            await copyToClipboard(shot.prompt_en);
                            toast.success('已复制英文 Prompt');
                          }}
                        >
                          <Copy className="mr-1 h-3 w-3" />
                          复制英文词
                        </Button>
                        <Button
                          size="sm"
                          className="h-7 text-xs bg-violet-600 hover:bg-violet-700"
                          onClick={() => {
                            setPrompt(`${shot.visual_zh}\n${shot.prompt_en}`);
                            setWorkMode('generate');
                            toast.success('已填入视频生成 Prompt');
                          }}
                        >
                          填入生成视频
                        </Button>
                      </div>
                    </div>
                    <p className="text-xs text-slate-700">{shot.visual_zh}</p>
                    <div className="rounded-lg bg-slate-50 border p-2.5 text-xs font-mono text-slate-600">
                      {shot.prompt_en}
                    </div>
                    <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                      <span>运镜：{shot.camera_movement}</span>
                      <span>·</span>
                      <span>光影：{shot.lighting_style}</span>
                    </div>
                  </CardContent>
                </Card>
              ))
            )
          ) : loadingTasks ? (
            <div className="flex h-72 items-center justify-center rounded-xl border bg-card text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              正在加载视频任务队列...
            </div>
          ) : tasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed bg-card/60 py-20 text-center px-6">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-50 text-violet-600 mb-4">
                <Film className="h-7 w-7" />
              </div>
              <h2 className="text-base font-semibold">开启你的第一个 AI 视频生成任务</h2>
              <p className="mt-1.5 max-w-md text-xs text-muted-foreground leading-relaxed">
                支持文生视频、图生视频与首尾帧过渡。任务提交后将在云端异步渲染并自动持久化，刷新页面后仍可继续追踪进度。
              </p>
            </div>
          ) : (
            tasks.map((task) => {
              const isRunning = task.status === 'pending' || task.status === 'processing';
              const isFailed = task.status === 'failed';
              const firstUrl = task.result_urls[0];
              return (
                <Card key={task.id} className="overflow-hidden">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge variant="outline" className="text-[10px] font-mono">
                            {task.provider_name || '视频 API'} · {task.model_name}
                          </Badge>
                          <Badge variant="secondary" className="text-[10px] tabular-nums">
                            {task.aspect_ratio} · {task.duration_sec || 5}s · {task.resolution || '720p'}
                          </Badge>
                          {isRunning && (
                            <Badge className="bg-violet-100 text-violet-700 hover:bg-violet-100 text-[10px] gap-1">
                              <Loader2 className="h-2.5 w-2.5 animate-spin" />
                              {task.status === 'pending' ? '排队中' : `渲染中 ${task.progress}%`}
                            </Badge>
                          )}
                          {task.status === 'succeeded' && (
                            <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 text-[10px] gap-1">
                              <CheckCircle2 className="h-2.5 w-2.5" />
                              已完成
                            </Badge>
                          )}
                          {isFailed && (
                            <Badge variant="destructive" className="text-[10px] gap-1">
                              <AlertCircle className="h-2.5 w-2.5" />
                              失败
                            </Badge>
                          )}
                          <span className="text-[11px] text-muted-foreground tabular-nums">
                            {formatDateTime(task.created_at)}
                          </span>
                        </div>
                        <p className="text-xs text-slate-700 line-clamp-2">{task.prompt}</p>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs"
                          onClick={() => setDetailTask(task)}
                        >
                          <Info className="mr-1 h-3 w-3" />
                          详情
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs"
                          onClick={() => handleRegenerateFromTask(task)}
                        >
                          <RefreshCw className="mr-1 h-3 w-3" />
                          {isFailed ? '重试' : '复用'}
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-rose-500 hover:text-rose-700"
                          onClick={() => setDeleteTaskTarget(task)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>

                    {isRunning && (
                      <div className="space-y-1.5 py-2">
                        <Progress value={task.progress || 25} className="h-2" />
                        <p className="text-[11px] text-muted-foreground">
                          视频异步渲染队列执行中，每 3 秒自动同步上游状态...
                        </p>
                      </div>
                    )}

                    {isFailed && (
                      <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                        {task.error_message || '视频供应商返回错误，请检查视频 API 配置与模型名称'}
                      </div>
                    )}

                    {firstUrl && (
                      <div className="space-y-2.5">
                        <div className="overflow-hidden rounded-xl border bg-slate-950/5 max-w-lg">
                          {isPlayableVideoUrl(firstUrl) ? (
                            <video
                              src={firstUrl}
                              controls
                              playsInline
                              className="w-full max-h-[380px] bg-black"
                            />
                          ) : (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img
                              src={firstUrl}
                              alt="视频预览"
                              className="w-full max-h-[340px] object-contain"
                            />
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 text-xs"
                            asChild
                          >
                            <a href={firstUrl} download target="_blank" rel="noopener noreferrer">
                              <Download className="mr-1.5 h-3.5 w-3.5" />
                              下载成片
                            </a>
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 text-xs"
                            onClick={async () => {
                              await copyToClipboard(task.prompt);
                              toast.success('已复制视频提示词');
                            }}
                          >
                            <Copy className="mr-1.5 h-3.5 w-3.5" />
                            复制提示词
                          </Button>
                          <Button
                            size="sm"
                            className="h-8 text-xs bg-violet-600 hover:bg-violet-700"
                            onClick={() => {
                              setSavePayload({
                                assetType: 'video',
                                title: `AI 视频 - ${task.prompt.slice(0, 18)}`,
                                content: task.prompt,
                                fileUrl: firstUrl,
                                productId: task.product_id || productId || undefined,
                                tags: ['AI视频', task.aspect_ratio, `${task.duration_sec || 5}s`],
                                generationMeta: {
                                  prompt: task.prompt,
                                  negative_prompt: task.negative_prompt || undefined,
                                  model: task.model_name,
                                  aspect_ratio: task.aspect_ratio,
                                  mode: task.mode,
                                },
                              });
                              setSaveDialogOpen(true);
                            }}
                          >
                            <FolderPlus className="mr-1.5 h-3.5 w-3.5" />
                            转存至云端素材库
                          </Button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      </div>

      {/* Task Detail Modal */}
      <Dialog open={Boolean(detailTask)} onOpenChange={(o) => !o && setDetailTask(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>视频任务详情</DialogTitle>
            <DialogDescription className="font-mono text-xs">
              Task ID: {detailTask?.id}
            </DialogDescription>
          </DialogHeader>
          {detailTask && (
            <div className="space-y-2.5 text-xs">
              <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-3 border">
                <div>
                  <span className="text-muted-foreground">供应商：</span>
                  <span className="font-medium">{detailTask.provider_name || '默认'}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">模型：</span>
                  <span className="font-mono">{detailTask.model_name}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">比例 / 时长：</span>
                  <span className="tabular-nums">
                    {detailTask.aspect_ratio} / {detailTask.duration_sec || 5}s
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">清晰度 / 运镜：</span>
                  <span>
                    {detailTask.resolution || '720p'} / {detailTask.camera_movement || 'static'}
                  </span>
                </div>
                {detailTask.provider_task_id && (
                  <div className="col-span-2">
                    <span className="text-muted-foreground">上游任务 ID：</span>
                    <span className="font-mono">{detailTask.provider_task_id}</span>
                  </div>
                )}
              </div>
              <div>
                <p className="text-muted-foreground mb-1">完整 Prompt：</p>
                <p className="rounded-lg border p-2.5 bg-white whitespace-pre-wrap">
                  {detailTask.prompt}
                </p>
              </div>
              {detailTask.error_message && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-rose-700">
                  错误信息：{detailTask.error_message}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Asset Picker Dialog */}
      <Dialog
        open={Boolean(assetPickerSlot)}
        onOpenChange={(o) => !o && setAssetPickerSlot(null)}
      >
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              从素材库选择{assetPickerSlot === 'end' ? '尾帧图' : '首帧参考图'}
            </DialogTitle>
          </DialogHeader>
          {imageAssets.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              素材库暂无图片素材
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {imageAssets
                .filter((a) => a.file_url)
                .map((asset) => (
                  <button
                    key={asset.id}
                    type="button"
                    onClick={() => {
                      if (assetPickerSlot === 'end') setEndFrameUrl(asset.file_url || '');
                      else setFirstFrameUrl(asset.file_url || '');
                      setAssetPickerSlot(null);
                      toast.success(`已选定「${asset.title}」`);
                    }}
                    className="overflow-hidden rounded-lg border text-left hover:border-violet-500"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={asset.file_url || ''}
                      alt={asset.title}
                      className="h-28 w-full object-cover"
                    />
                    <p className="truncate px-2 py-1.5 text-xs font-medium">{asset.title}</p>
                  </button>
                ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog
        open={Boolean(deleteTaskTarget)}
        onOpenChange={(o) => !o && setDeleteTaskTarget(null)}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>确认删除视频任务</DialogTitle>
            <DialogDescription>
              删除后将从视频历史记录中移除，已转存素材库的视频不受影响。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTaskTarget(null)}>
              取消
            </Button>
            <Button variant="destructive" onClick={handleConfirmDeleteTask}>
              确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AssetSaveDialog
        open={saveDialogOpen}
        onOpenChange={setSaveDialogOpen}
        initialData={savePayload}
        transferRemoteFile
      />
    </div>
  );
}

export default function VideoGenPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
          正在加载视频生成工作台...
        </div>
      }
    >
      <VideoGenContent />
    </Suspense>
  );
}
