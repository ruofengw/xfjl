'use client';

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  Expand,
  FolderOpen,
  FolderPlus,
  Image as ImageIcon,
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
import { ASPECT_RATIOS, IMAGE_RESOLUTIONS } from '@/lib/constants';
import type { Asset, MediaTask } from '@/lib/types';
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
import { Textarea } from '@/components/ui/textarea';

const DEMO_CONFIG_VALUE = 'demo_sim';

function ImageGenContent() {
  const searchParams = useSearchParams();
  const { activeWorkspaceId, apiConfigs, products } = useWorkspace();

  // STRICT ISOLATION: only active Image API configs
  const imageApiConfigs = useMemo(
    () =>
      apiConfigs.filter(
        (c) => c.is_active && c.api_type === 'image' && (c.image_models || []).length > 0
      ),
    [apiConfigs]
  );

  // Generation parameters (never cleared when switching provider/model)
  const [mode, setMode] = useState<'t2i' | 'i2i'>('t2i');
  const [configId, setConfigId] = useState<string>(DEMO_CONFIG_VALUE);
  const [modelName, setModelName] = useState<string>('image-demo');
  const [prompt, setPrompt] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState('3:4');
  const [resolution, setResolution] = useState('1024x1024');
  const [batchCount, setBatchCount] = useState<number>(2);
  const [productId, setProductId] = useState('');
  const [referenceImageUrl, setReferenceImageUrl] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [uploadingRef, setUploadingRef] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [tasks, setTasks] = useState<MediaTask[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(true);

  // Lightbox preview
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [lightboxPrompt, setLightboxPrompt] = useState<string>('');

  // Asset picker dialog
  const [assetPickerOpen, setAssetPickerOpen] = useState(false);
  const [imageAssets, setImageAssets] = useState<Asset[]>([]);

  // Save to assets dialog
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [savePayload, setSavePayload] = useState<AssetSavePayload | null>(null);

  // Delete confirmation
  const [deleteTaskTarget, setDeleteTaskTarget] = useState<MediaTask | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Read URL query params (from History / Assets / Workbench)
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
      setReferenceImageUrl(qRef);
      setMode('i2i');
    }
    if (qProd) setProductId(qProd);
  }, [searchParams]);

  // Auto-select default Image API config (never silently switch if user chose one)
  useEffect(() => {
    if (imageApiConfigs.length === 0) {
      setConfigId(DEMO_CONFIG_VALUE);
      setModelName('image-demo');
      return;
    }
    const exists = imageApiConfigs.some((c) => c.id === configId);
    if (!exists && configId !== DEMO_CONFIG_VALUE) {
      const def = imageApiConfigs.find((c) => c.is_default) || imageApiConfigs[0];
      setConfigId(def.id);
      setModelName(def.image_models[0] || '');
    } else if (configId === DEMO_CONFIG_VALUE) {
      const def = imageApiConfigs.find((c) => c.is_default) || imageApiConfigs[0];
      setConfigId(def.id);
      setModelName(def.image_models[0] || '');
    }
  }, [imageApiConfigs, configId]);

  const activeConfig = useMemo(
    () => imageApiConfigs.find((c) => c.id === configId) || null,
    [imageApiConfigs, configId]
  );

  const loadTasks = useCallback(async () => {
    if (!activeWorkspaceId) return;
    try {
      const res = await fetch(
        `/api/ai/media?workspaceId=${encodeURIComponent(activeWorkspaceId)}&taskType=image`
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

  // 3s polling for active pending/processing tasks
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

  const openAssetPicker = async () => {
    if (!activeWorkspaceId) return;
    setAssetPickerOpen(true);
    const res = await fetch(
      `/api/assets?workspaceId=${encodeURIComponent(activeWorkspaceId)}&assetType=image`
    );
    if (res.ok) {
      const data = await res.json();
      setImageAssets(Array.isArray(data.assets) ? data.assets : []);
    }
  };

  const handleUploadReference = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeWorkspaceId) return;
    setUploadingRef(true);
    try {
      const uploaded = await uploadFileToCloud(file, activeWorkspaceId, 'image-refs');
      setReferenceImageUrl(uploaded.url);
      setMode('i2i');
      toast.success('参考图上传成功');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '上传参考图失败');
    } finally {
      setUploadingRef(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleGenerate = async () => {
    if (submitting) return;
    if (!activeWorkspaceId) {
      toast.error('未检测到当前工作空间');
      return;
    }
    if (!prompt.trim()) {
      toast.error('请输入画面描述提示词');
      return;
    }
    if (mode === 'i2i' && !referenceImageUrl) {
      toast.error('图生图模式请先上传或选择一张参考图');
      return;
    }

    const selectedProduct = products.find((p) => p.id === productId);
    const enrichedPrompt = selectedProduct
      ? `${prompt.trim()}（商品参考：${selectedProduct.name}，核心卖点：${selectedProduct.selling_points.slice(0, 120)}）`
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
          task_type: 'image',
          mode,
          prompt: enrichedPrompt,
          negative_prompt: negativePrompt.trim() || null,
          aspect_ratio: aspectRatio,
          resolution,
          batch_count: batchCount,
          model_name:
            configId === DEMO_CONFIG_VALUE ? 'image-demo' : modelName || activeConfig?.image_models[0],
          reference_image_url: mode === 'i2i' ? referenceImageUrl : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || '提交生图任务失败');
        return;
      }

      const created = data.task as MediaTask;
      setTasks((prev) => [created, ...prev]);
      if (created.status === 'succeeded') {
        toast.success(`成功生成 ${created.result_urls.length} 张图片`);
      } else if (created.status === 'failed') {
        toast.error(created.error_message || '图片生成失败');
      } else {
        toast.info('已提交生图任务，正在实时渲染...');
      }
    } catch {
      toast.error('网络错误，无法提交生图任务');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRegenerateFromTask = (task: MediaTask) => {
    setPrompt(task.prompt);
    if (task.negative_prompt) {
      setNegativePrompt(task.negative_prompt);
      setShowAdvanced(true);
    }
    setAspectRatio(task.aspect_ratio || '3:4');
    if (task.resolution) setResolution(task.resolution);
    setBatchCount(task.batch_count || 1);
    if (task.reference_image_url) {
      setReferenceImageUrl(task.reference_image_url);
      setMode('i2i');
    } else {
      setMode('t2i');
    }
    toast.success('已回填该任务参数，可直接微调并重新生成');
  };

  const handleConfirmDeleteTask = async () => {
    if (!deleteTaskTarget) return;
    const res = await fetch(`/api/ai/task/${deleteTaskTarget.id}`, {
      method: 'DELETE',
    });
    if (res.ok) {
      setTasks((prev) => prev.filter((t) => t.id !== deleteTaskTarget.id));
      toast.success('已删除该图片记录');
    } else {
      toast.error('删除失败');
    }
    setDeleteTaskTarget(null);
  };

  const handleDownload = (url: string, filename: string) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.click();
  };

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2.5">
            <ImageIcon className="h-6 w-6 text-indigo-600" />
            图片生成工作台
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            专注文生图与图生图视觉创作，严格绑定「图片 API」独立通道。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/settings/api?tab=image">
              <Settings2 className="mr-1.5 h-3.5 w-3.5" />
              配置图片 API
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/history">查看全部历史</Link>
          </Button>
        </div>
      </div>

      {/* Main 2-Column Workspace */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
        {/* Left: Controls Panel */}
        <Card className="lg:col-span-4 lg:sticky lg:top-4">
          <CardContent className="p-5 space-y-4">
            {/* Mode Switch */}
            <div className="grid grid-cols-2 rounded-lg bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => setMode('t2i')}
                className={`rounded-md py-1.5 text-xs font-medium transition-all ${
                  mode === 't2i'
                    ? 'bg-white text-indigo-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                文生图 (Text → Image)
              </button>
              <button
                type="button"
                onClick={() => setMode('i2i')}
                className={`rounded-md py-1.5 text-xs font-medium transition-all ${
                  mode === 'i2i'
                    ? 'bg-white text-indigo-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                图生图 (Image → Image)
              </button>
            </div>

            {/* Image API Provider & Model */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold">图片 API 供应商</Label>
                {imageApiConfigs.length === 0 && (
                  <Link
                    href="/settings/api?tab=image"
                    className="text-[11px] font-medium text-indigo-600 hover:underline"
                  >
                    + 去配置图片 API
                  </Link>
                )}
              </div>

              {imageApiConfigs.length === 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-[11px] text-amber-800 leading-relaxed">
                  尚未配置专用「图片 API」。当前可使用演示模拟模式预览效果，或
                  <Link href="/settings/api?tab=image" className="underline font-semibold ml-1">
                    前往添加图片 API
                  </Link>
                  。
                </div>
              )}

              <Select
                value={configId}
                onValueChange={(val) => {
                  setConfigId(val);
                  if (val === DEMO_CONFIG_VALUE) {
                    setModelName('image-demo');
                  } else {
                    const found = imageApiConfigs.find((c) => c.id === val);
                    setModelName(found?.image_models[0] || '');
                  }
                }}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {imageApiConfigs.map((c) => (
                    <SelectItem key={c.id} value={c.id} className="text-xs">
                      {c.display_name} {c.is_default ? '（默认）' : ''}
                    </SelectItem>
                  ))}
                  <SelectItem value={DEMO_CONFIG_VALUE} className="text-xs text-muted-foreground">
                    演示模拟模式（零消耗预览）
                  </SelectItem>
                </SelectContent>
              </Select>

              {activeConfig && activeConfig.image_models.length > 0 && (
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">生图模型</Label>
                  <Select value={modelName} onValueChange={setModelName}>
                    <SelectTrigger className="h-9 text-xs font-mono">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {activeConfig.image_models.map((m) => (
                        <SelectItem key={m} value={m} className="text-xs font-mono">
                          {m}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {/* Reference Image Upload (shown in i2i or optional quick attach) */}
            {mode === 'i2i' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold">参考图</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[11px] text-indigo-600"
                    onClick={openAssetPicker}
                  >
                    <FolderOpen className="mr-1 h-3 w-3" />
                    从素材库选择
                  </Button>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleUploadReference}
                />
                {referenceImageUrl ? (
                  <div className="relative overflow-hidden rounded-lg border bg-slate-50">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={referenceImageUrl}
                      alt="参考图"
                      className="h-36 w-full object-contain"
                    />
                    <div className="absolute right-2 top-2 flex gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="h-7 px-2 text-[11px]"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        替换
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="destructive"
                        className="h-7 w-7"
                        onClick={() => setReferenceImageUrl('')}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={uploadingRef}
                    onClick={() => fileInputRef.current?.click()}
                    className="flex h-28 w-full flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-200 bg-slate-50/50 text-xs text-muted-foreground hover:border-indigo-400 hover:text-indigo-600 transition-colors"
                  >
                    {uploadingRef ? (
                      <Loader2 className="h-5 w-5 animate-spin mb-1" />
                    ) : (
                      <Upload className="h-5 w-5 mb-1" />
                    )}
                    <span>{uploadingRef ? '正在上传...' : '点击上传 PNG / JPG / WEBP（≤ 15MB）'}</span>
                  </button>
                )}
              </div>
            )}

            {/* Prompt Input */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold">画面描述 Prompt</Label>
                <span className="text-[11px] text-muted-foreground tabular-nums">
                  {prompt.length} 字
                </span>
              </div>
              <Textarea
                rows={5}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="描述主体、构图、光影、材质与风格，例如：高级电商摄影棚主图，极简暖白大理石桌面，玻璃精华瓶，柔和自然窗光与水珠高光，8K 超清质感..."
                className="resize-none text-sm leading-relaxed"
              />
            </div>

            {/* Aspect Ratio Pills */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">画面比例</Label>
              <div className="grid grid-cols-5 gap-1.5">
                {ASPECT_RATIOS.map((r) => (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => setAspectRatio(r.value)}
                    className={`rounded-md border py-1.5 text-xs font-medium tabular-nums transition-colors ${
                      aspectRatio === r.value
                        ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    {r.value}
                  </button>
                ))}
              </div>
            </div>

            {/* Resolution & Batch Count */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">分辨率</Label>
                <Select value={resolution} onValueChange={setResolution}>
                  <SelectTrigger className="h-9 text-xs font-mono">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {IMAGE_RESOLUTIONS.map((r) => (
                      <SelectItem key={r.value} value={r.value} className="text-xs font-mono">
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">生成数量</Label>
                <div className="grid grid-cols-4 gap-1">
                  {[1, 2, 3, 4].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setBatchCount(n)}
                      className={`h-9 rounded-md border text-xs font-semibold tabular-nums transition-colors ${
                        batchCount === n
                          ? 'border-indigo-600 bg-indigo-600 text-white'
                          : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Collapsible Advanced Settings */}
            <div className="border-t pt-3">
              <button
                type="button"
                onClick={() => setShowAdvanced((v) => !v)}
                className="flex w-full items-center justify-between text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                <span>高级设置（负面提示词 / 关联产品卖点）</span>
                {showAdvanced ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </button>
              {showAdvanced && (
                <div className="mt-3 space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">关联产品知识库（可选）</Label>
                    <ProductSelector value={productId} onChange={setProductId} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">反向提示词 (Negative Prompt)</Label>
                    <Textarea
                      rows={2}
                      value={negativePrompt}
                      onChange={(e) => setNegativePrompt(e.target.value)}
                      placeholder="blurry, watermark, distorted hands, low quality..."
                      className="resize-none text-xs"
                    />
                  </div>
                </div>
              )}
            </div>

            <Button
              type="button"
              disabled={submitting}
              onClick={handleGenerate}
              className="w-full h-10 bg-indigo-600 hover:bg-indigo-700 text-sm font-semibold"
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  正在提交生图任务...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  立即生成图片（{batchCount} 张）
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Right: Image Results Gallery */}
        <div className="lg:col-span-8 space-y-4">
          {loadingTasks ? (
            <div className="flex h-72 items-center justify-center rounded-xl border bg-card text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              正在加载历史生图作品...
            </div>
          ) : tasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed bg-card/60 py-20 text-center px-6">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 mb-4">
                <ImageIcon className="h-7 w-7" />
              </div>
              <h2 className="text-base font-semibold">开始你的第一组 AI 图片创作</h2>
              <p className="mt-1.5 max-w-md text-xs text-muted-foreground leading-relaxed">
                在左侧输入画面提示词，选择比例与张数即可批量出图。生成结果支持高清大图预览、本地下载及一键归档至云端素材库。
              </p>
            </div>
          ) : (
            tasks.map((task) => {
              const isRunning = task.status === 'pending' || task.status === 'processing';
              const isFailed = task.status === 'failed';
              return (
                <Card key={task.id} className="overflow-hidden">
                  <CardContent className="p-4 space-y-3">
                    {/* Task Meta Header */}
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge variant="outline" className="text-[10px] font-mono">
                            {task.provider_name || '图片 API'} · {task.model_name}
                          </Badge>
                          <Badge variant="secondary" className="text-[10px] tabular-nums">
                            {task.aspect_ratio} {task.resolution ? `· ${task.resolution}` : ''}
                          </Badge>
                          {isRunning && (
                            <Badge className="bg-indigo-100 text-indigo-700 hover:bg-indigo-100 text-[10px] gap-1">
                              <Loader2 className="h-2.5 w-2.5 animate-spin" />
                              渲染中 {task.progress}%
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
                              生成失败
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
                          onClick={async () => {
                            await copyToClipboard(task.prompt);
                            toast.success('已复制提示词');
                          }}
                        >
                          <Copy className="mr-1 h-3 w-3" />
                          复制词
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs"
                          onClick={() => handleRegenerateFromTask(task)}
                        >
                          <RefreshCw className="mr-1 h-3 w-3" />
                          复用参数
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

                    {/* Progress or Error */}
                    {isRunning && (
                      <div className="space-y-1.5 py-2">
                        <Progress value={task.progress || 25} className="h-2" />
                        <p className="text-[11px] text-muted-foreground">
                          任务正在云端队列生成中，每 3 秒自动刷新进度，刷新页面不会丢失...
                        </p>
                      </div>
                    )}

                    {isFailed && (
                      <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                        {task.error_message || '生图供应商返回异常，请检查图片 API 余额与模型名称'}
                      </div>
                    )}

                    {/* Image Grid */}
                    {task.result_urls.length > 0 && (
                      <div
                        className={`grid gap-3 ${
                          task.result_urls.length === 1
                            ? 'grid-cols-1 max-w-md'
                            : 'grid-cols-2 sm:grid-cols-2'
                        }`}
                      >
                        {task.result_urls.map((url, idx) => (
                          <div
                            key={`${task.id}-${idx}`}
                            className="group relative overflow-hidden rounded-xl border bg-slate-50"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={url}
                              alt={`${task.prompt.slice(0, 20)} #${idx + 1}`}
                              onClick={() => {
                                setLightboxUrl(url);
                                setLightboxPrompt(task.prompt);
                              }}
                              className="w-full aspect-[4/3] object-cover cursor-zoom-in transition-transform duration-300 group-hover:scale-[1.02]"
                            />
                            <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-gradient-to-t from-slate-950/75 via-slate-950/40 to-transparent p-2.5 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Button
                                size="sm"
                                variant="secondary"
                                className="h-7 px-2 text-[11px]"
                                onClick={() => {
                                  setLightboxUrl(url);
                                  setLightboxPrompt(task.prompt);
                                }}
                              >
                                <Expand className="mr-1 h-3 w-3" />
                                大图
                              </Button>
                              <div className="flex items-center gap-1">
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  className="h-7 px-2 text-[11px]"
                                  onClick={() =>
                                    handleDownload(url, `ai-image-${task.id.slice(0, 6)}-${idx + 1}.png`)
                                  }
                                >
                                  <Download className="h-3 w-3" />
                                </Button>
                                <Button
                                  size="sm"
                                  className="h-7 px-2 text-[11px] bg-indigo-600 hover:bg-indigo-700"
                                  onClick={() => {
                                    setSavePayload({
                                      assetType: 'image',
                                      title: `AI 生图 - ${task.prompt.slice(0, 18)}`,
                                      content: task.prompt,
                                      fileUrl: url,
                                      productId: task.product_id || productId || undefined,
                                      tags: ['AI生图', task.aspect_ratio],
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
                                  <FolderPlus className="mr-1 h-3 w-3" />
                                  存素材库
                                </Button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      </div>

      {/* Lightbox Modal */}
      <Dialog open={Boolean(lightboxUrl)} onOpenChange={(o) => !o && setLightboxUrl(null)}>
        <DialogContent className="max-w-4xl p-3">
          <DialogHeader className="px-2 pt-1">
            <DialogTitle className="text-sm">高清成图预览</DialogTitle>
            <DialogDescription className="text-xs line-clamp-2">
              {lightboxPrompt}
            </DialogDescription>
          </DialogHeader>
          {lightboxUrl && (
            <div className="flex items-center justify-center bg-slate-950/5 rounded-lg overflow-hidden max-h-[75vh]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={lightboxUrl}
                alt="高清预览"
                className="max-h-[72vh] w-auto object-contain"
              />
            </div>
          )}
          <DialogFooter>
            {lightboxUrl && (
              <Button
                size="sm"
                onClick={() => handleDownload(lightboxUrl, 'ai-generated-image.png')}
              >
                <Download className="mr-1.5 h-3.5 w-3.5" />
                下载原图
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Asset Picker Dialog */}
      <Dialog open={assetPickerOpen} onOpenChange={setAssetPickerOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>从云端素材库选择参考图</DialogTitle>
            <DialogDescription>点击任意图片即可设为当前图生图参考底图</DialogDescription>
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
                      setReferenceImageUrl(asset.file_url || '');
                      setMode('i2i');
                      setAssetPickerOpen(false);
                      toast.success(`已选定参考图「${asset.title}」`);
                    }}
                    className="group overflow-hidden rounded-lg border text-left hover:border-indigo-500 transition-colors"
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
            <DialogTitle>确认删除生图记录</DialogTitle>
            <DialogDescription>
              删除后该任务将从历史列表中移除（已归档到素材库的图片不受影响）。
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

export default function ImageGenPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
          正在加载图片生成工作台...
        </div>
      }
    >
      <ImageGenContent />
    </Suspense>
  );
}
