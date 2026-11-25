'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  Film,
  FolderPlus,
  Image as ImageIcon,
  Info,
  Loader2,
  RefreshCw,
  Search,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { useWorkspace } from '@/components/providers/workspace-provider';
import {
  AssetSaveDialog,
  type AssetSavePayload,
} from '@/components/asset-save-dialog/asset-save-dialog';
import type { MediaTask } from '@/lib/types';
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
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

type HistoryTab = 'all' | 'image' | 'video' | 'running' | 'failed';

export default function HistoryPage() {
  const router = useRouter();
  const { activeWorkspaceId } = useWorkspace();

  const [tab, setTab] = useState<HistoryTab>('all');
  const [search, setSearch] = useState('');
  const [tasks, setTasks] = useState<MediaTask[]>([]);
  const [loading, setLoading] = useState(true);

  const [detailTask, setDetailTask] = useState<MediaTask | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MediaTask | null>(null);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [savePayload, setSavePayload] = useState<AssetSavePayload | null>(null);

  const fetchTasks = useCallback(async () => {
    if (!activeWorkspaceId) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/ai/media?workspaceId=${encodeURIComponent(activeWorkspaceId)}`
      );
      if (res.ok) {
        const data = await res.json();
        setTasks(Array.isArray(data.tasks) ? data.tasks : []);
      }
    } finally {
      setLoading(false);
    }
  }, [activeWorkspaceId]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const filteredTasks = useMemo(() => {
    const kw = search.trim().toLowerCase();
    return tasks.filter((t) => {
      if (tab === 'image' && t.task_type !== 'image') return false;
      if (tab === 'video' && t.task_type !== 'video') return false;
      if (tab === 'running' && t.status !== 'pending' && t.status !== 'processing') {
        return false;
      }
      if (tab === 'failed' && t.status !== 'failed') return false;
      if (kw) {
        const hay = `${t.prompt} ${t.model_name} ${t.provider_name || ''}`.toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      return true;
    });
  }, [tasks, tab, search]);

  const counts = useMemo(
    () => ({
      all: tasks.length,
      image: tasks.filter((t) => t.task_type === 'image').length,
      video: tasks.filter((t) => t.task_type === 'video').length,
      running: tasks.filter((t) => t.status === 'pending' || t.status === 'processing').length,
      failed: tasks.filter((t) => t.status === 'failed').length,
    }),
    [tasks]
  );

  const handleRegenerate = (task: MediaTask) => {
    const params = new URLSearchParams();
    params.set('prompt', task.prompt);
    if (task.negative_prompt) params.set('negativePrompt', task.negative_prompt);
    if (task.aspect_ratio) params.set('aspectRatio', task.aspect_ratio);
    if (task.reference_image_url) params.set('refImage', task.reference_image_url);
    if (task.product_id) params.set('productId', task.product_id);
    const target = task.task_type === 'video' ? '/video-gen' : '/image-gen';
    router.push(`${target}?${params.toString()}`);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    const res = await fetch(`/api/ai/task/${deleteTarget.id}`, { method: 'DELETE' });
    if (res.ok) {
      setTasks((prev) => prev.filter((t) => t.id !== deleteTarget.id));
      toast.success('已删除该历史记录');
    } else {
      toast.error('删除失败');
    }
    setDeleteTarget(null);
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2.5">
            <Clock className="h-6 w-6 text-indigo-600" />
            作品 / 生成历史
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            统一追踪图片、视频与画布节点产生的异步任务记录，支持参数复现、下载与归档。
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={fetchTasks}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          刷新记录
        </Button>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={tab} onValueChange={(v) => setTab(v as HistoryTab)}>
          <TabsList className="h-9">
            <TabsTrigger value="all" className="text-xs">
              全部 ({counts.all})
            </TabsTrigger>
            <TabsTrigger value="image" className="text-xs">
              图片 ({counts.image})
            </TabsTrigger>
            <TabsTrigger value="video" className="text-xs">
              视频 ({counts.video})
            </TabsTrigger>
            <TabsTrigger value="running" className="text-xs">
              进行中 ({counts.running})
            </TabsTrigger>
            <TabsTrigger value="failed" className="text-xs">
              失败 ({counts.failed})
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索提示词、模型或供应商..."
            className="h-9 pl-9 text-xs"
          />
        </div>
      </div>

      {/* Task Grid */}
      {loading ? (
        <div className="flex h-64 items-center justify-center rounded-xl border bg-card text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          正在加载生成历史...
        </div>
      ) : filteredTasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed py-20 text-center">
          <Clock className="h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="text-sm font-medium">暂无匹配的生成历史记录</p>
          <p className="text-xs text-muted-foreground mt-1">
            前往「图片生成」「视频生成」或「创作画布」生成作品后将自动记录在此。
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredTasks.map((task) => {
            const firstUrl = task.result_urls[0];
            const isVideo = task.task_type === 'video';
            const isRunning = task.status === 'pending' || task.status === 'processing';
            const isFailed = task.status === 'failed';

            return (
              <Card key={task.id} className="overflow-hidden flex flex-col">
                <div className="relative h-44 bg-slate-100 flex items-center justify-center overflow-hidden">
                  {firstUrl ? (
                    isVideo && /\.(mp4|webm|mov)(\?|$)/i.test(firstUrl) ? (
                      <video
                        src={firstUrl}
                        controls
                        className="h-full w-full object-cover bg-black"
                      />
                    ) : (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={firstUrl}
                        alt={task.prompt.slice(0, 20)}
                        className="h-full w-full object-cover"
                      />
                    )
                  ) : isRunning ? (
                    <div className="w-3/4 space-y-2 text-center">
                      <Loader2 className="mx-auto h-6 w-6 animate-spin text-indigo-500" />
                      <Progress value={task.progress || 30} className="h-1.5" />
                      <p className="text-[11px] text-muted-foreground">
                        渲染中 {task.progress}%
                      </p>
                    </div>
                  ) : (
                    <div className="text-center px-4">
                      {isFailed ? (
                        <AlertCircle className="mx-auto h-7 w-7 text-rose-400 mb-1" />
                      ) : isVideo ? (
                        <Film className="mx-auto h-7 w-7 text-slate-300 mb-1" />
                      ) : (
                        <ImageIcon className="mx-auto h-7 w-7 text-slate-300 mb-1" />
                      )}
                      <p className="text-[11px] text-muted-foreground line-clamp-2">
                        {task.error_message || '暂无预览文件'}
                      </p>
                    </div>
                  )}

                  <div className="absolute left-2 top-2 flex items-center gap-1">
                    <Badge
                      variant="secondary"
                      className="bg-white/90 text-slate-800 text-[10px] backdrop-blur-xs"
                    >
                      {isVideo ? '视频' : `图片 ×${Math.max(1, task.result_urls.length)}`}
                    </Badge>
                    {task.status === 'succeeded' && (
                      <Badge className="bg-emerald-500/90 text-white text-[10px]">
                        <CheckCircle2 className="mr-0.5 h-2.5 w-2.5" />
                        成功
                      </Badge>
                    )}
                    {isFailed && (
                      <Badge variant="destructive" className="text-[10px]">
                        失败
                      </Badge>
                    )}
                  </div>
                </div>

                <CardContent className="p-3.5 flex-1 flex flex-col justify-between space-y-3">
                  <div className="space-y-1.5">
                    <p className="text-xs text-slate-800 line-clamp-2 leading-relaxed">
                      {task.prompt}
                    </p>
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                      <span className="font-mono truncate max-w-[160px]">
                        {task.model_name}
                      </span>
                      <span>·</span>
                      <span className="tabular-nums">{task.aspect_ratio}</span>
                      <span>·</span>
                      <span className="tabular-nums">{formatDateTime(task.created_at)}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-1 border-t pt-2.5">
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-[11px]"
                        onClick={() => setDetailTask(task)}
                      >
                        <Info className="mr-1 h-3 w-3" />
                        详情
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-[11px]"
                        onClick={() => handleRegenerate(task)}
                      >
                        <RefreshCw className="mr-1 h-3 w-3" />
                        重新生成
                      </Button>
                    </div>
                    <div className="flex items-center gap-1">
                      {firstUrl && (
                        <>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            title="下载"
                            asChild
                          >
                            <a href={firstUrl} download target="_blank" rel="noopener noreferrer">
                              <Download className="h-3.5 w-3.5" />
                            </a>
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-indigo-600"
                            title="存入素材库"
                            onClick={() => {
                              setSavePayload({
                                assetType: isVideo ? 'video' : 'image',
                                title: `${isVideo ? 'AI视频' : 'AI图片'} - ${task.prompt.slice(0, 16)}`,
                                content: task.prompt,
                                fileUrl: firstUrl,
                                productId: task.product_id || undefined,
                                tags: [isVideo ? 'AI视频' : 'AI生图', task.aspect_ratio],
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
                            <FolderPlus className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-rose-500 hover:text-rose-700"
                        title="删除"
                        onClick={() => setDeleteTarget(task)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Detail Dialog */}
      <Dialog open={Boolean(detailTask)} onOpenChange={(o) => !o && setDetailTask(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>任务参数详情</DialogTitle>
            <DialogDescription className="font-mono text-xs">
              ID: {detailTask?.id}
            </DialogDescription>
          </DialogHeader>
          {detailTask && (
            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2 rounded-lg border bg-slate-50 p-3">
                <div>
                  <span className="text-muted-foreground">类型：</span>
                  <span>{detailTask.task_type === 'video' ? '视频生成' : '图片生成'}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">供应商：</span>
                  <span>{detailTask.provider_name || '默认'}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">模型：</span>
                  <span className="font-mono">{detailTask.model_name}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">比例：</span>
                  <span>{detailTask.aspect_ratio}</span>
                </div>
                {detailTask.resolution && (
                  <div>
                    <span className="text-muted-foreground">分辨率：</span>
                    <span>{detailTask.resolution}</span>
                  </div>
                )}
                {detailTask.duration_sec && (
                  <div>
                    <span className="text-muted-foreground">时长：</span>
                    <span>{detailTask.duration_sec}s</span>
                  </div>
                )}
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">提示词：</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-[11px]"
                    onClick={async () => {
                      await copyToClipboard(detailTask.prompt);
                      toast.success('已复制提示词');
                    }}
                  >
                    <Copy className="mr-1 h-3 w-3" />
                    复制
                  </Button>
                </div>
                <p className="rounded-lg border p-2.5 bg-white whitespace-pre-wrap">
                  {detailTask.prompt}
                </p>
              </div>
              {detailTask.error_message && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-rose-700">
                  失败原因：{detailTask.error_message}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={Boolean(deleteTarget)} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>确认删除历史记录</DialogTitle>
            <DialogDescription>
              删除后无法恢复该任务历史记录（已归档至云端素材库的资产不受影响）。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              取消
            </Button>
            <Button variant="destructive" onClick={handleConfirmDelete}>
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
