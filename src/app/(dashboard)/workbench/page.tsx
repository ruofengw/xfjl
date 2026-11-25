'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Clock,
  Film,
  FolderKanban,
  History,
  Image as ImageIcon,
  KeyRound,
  MessageSquareText,
  Mic2,
  Package,
  PenTool,
  Plus,
  Sparkles,
  Upload,
  Workflow,
} from 'lucide-react';
import { useWorkspace } from '@/components/providers/workspace-provider';
import type { CanvasWorkflow, MediaTask } from '@/lib/types';
import { formatDateTime } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export default function WorkbenchHomePage() {
  const { activeWorkspace, activeWorkspaceId, apiConfigs } = useWorkspace();
  const [recentWorkflows, setRecentWorkflows] = useState<CanvasWorkflow[]>([]);
  const [recentTasks, setRecentTasks] = useState<MediaTask[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeWorkspaceId) return;
    let active = true;
    setLoading(true);
    Promise.all([
      fetch(`/api/canvas/workflows?workspaceId=${encodeURIComponent(activeWorkspaceId)}`)
        .then((r) => (r.ok ? r.json() : { workflows: [] }))
        .catch(() => ({ workflows: [] })),
      fetch(`/api/ai/media?workspaceId=${encodeURIComponent(activeWorkspaceId)}`)
        .then((r) => (r.ok ? r.json() : { tasks: [] }))
        .catch(() => ({ tasks: [] })),
    ]).then(([wfData, taskData]) => {
      if (!active) return;
      setRecentWorkflows(Array.isArray(wfData.workflows) ? wfData.workflows.slice(0, 4) : []);
      setRecentTasks(Array.isArray(taskData.tasks) ? taskData.tasks.slice(0, 8) : []);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [activeWorkspaceId]);

  const imageApiCount = apiConfigs.filter(
    (c) => c.is_active && (c.api_type === 'image' || (c.image_models || []).length > 0)
  ).length;
  const videoApiCount = apiConfigs.filter(
    (c) => c.is_active && (c.api_type === 'video' || (c.video_models || []).length > 0)
  ).length;

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      {/* 1. 顶部欢迎区 */}
      <div className="flex flex-wrap items-end justify-between gap-4 border-b pb-6">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs font-medium">
              {activeWorkspace?.name || '个人工作空间'}
            </Badge>
            <span className="text-xs text-muted-foreground tabular-nums">
              已启用图片 API: {imageApiCount} · 视频 API: {videoApiCount}
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            AI Creative Studio
          </h1>
          <p className="text-sm text-muted-foreground">
            一站式 AI 图片生成、视频创作与节点式视觉工作流工作台，所有模型接口独立隔离管理。
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/settings/api">
              <KeyRound className="h-4 w-4" />
              管理 API
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href="/assets">
              <Upload className="h-4 w-4" />
              上传素材
            </Link>
          </Button>
          <Button size="sm" asChild>
            <Link href="/canvas">
              <Plus className="h-4 w-4" />
              打开创作画布
            </Link>
          </Button>
        </div>
      </div>

      {/* 2. 核心创作入口 */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">开始创作</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <Link href="/image-gen" className="group block">
            <Card className="h-full transition-all hover:border-primary/50 hover:shadow-md">
              <CardHeader className="pb-3">
                <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                  <ImageIcon className="h-5 w-5" />
                </div>
                <CardTitle className="text-base flex items-center justify-between">
                  <span>图片生成</span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary" />
                </CardTitle>
                <CardDescription className="text-xs leading-relaxed">
                  独立图片模型与参数面板，支持文生图、图生图参考、比例与分辨率控制及大图预览下载。
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>

          <Link href="/video-gen" className="group block">
            <Card className="h-full transition-all hover:border-primary/50 hover:shadow-md">
              <CardHeader className="pb-3">
                <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
                  <Film className="h-5 w-5" />
                </div>
                <CardTitle className="text-base flex items-center justify-between">
                  <span>视频生成</span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary" />
                </CardTitle>
                <CardDescription className="text-xs leading-relaxed">
                  独立视频供应商与异步任务队列，支持文生视频、首帧/尾帧图生视频、时长分辨率与运镜控制。
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>

          <Link href="/canvas" className="group block">
            <Card className="h-full transition-all hover:border-primary/50 hover:shadow-md">
              <CardHeader className="pb-3">
                <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-violet-50 text-violet-600">
                  <Workflow className="h-5 w-5" />
                </div>
                <CardTitle className="text-base flex items-center justify-between">
                  <span>创作画布</span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary" />
                </CardTitle>
                <CardDescription className="text-xs leading-relaxed">
                  双击无限画布节点工作流，串联「文本 → 图片 → 视频 → 结果」，支持撤销重做、属性面板与依赖执行。
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>
        </div>

        {/* 快捷电商文案/话术与底座入口 */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 pt-1">
          {[
            { href: '/chat', label: 'AI 对话灵感', icon: MessageSquareText },
            { href: '/copywriting', label: '爆款文案写作', icon: PenTool },
            { href: '/live-script', label: '主播话术 & 提词器', icon: Mic2 },
            { href: '/products', label: '产品库卖点底座', icon: Package },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center justify-between rounded-xl border bg-card px-4 py-3 text-sm font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-accent/40"
              >
                <span className="flex items-center gap-2.5">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <span>{item.label}</span>
                </span>
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
              </Link>
            );
          })}
        </div>
      </section>

      {/* 3. 最近画布项目 */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">最近画布项目</h2>
          <Button variant="ghost" size="sm" className="text-xs" asChild>
            <Link href="/canvas">
              查看全部画布
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>

        {loading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-28 rounded-xl border bg-card/60 animate-pulse"
              />
            ))}
          </div>
        ) : recentWorkflows.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex items-center justify-between py-6">
              <div className="text-sm text-muted-foreground">
                暂无保存的画布项目，点击右侧立即创建你的第一条视觉工作流。
              </div>
              <Button size="sm" asChild>
                <Link href="/canvas">新建画布</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {recentWorkflows.map((wf) => (
              <Link
                key={wf.id}
                href={`/canvas?workflowId=${encodeURIComponent(wf.id)}`}
                className="group block"
              >
                <Card className="h-full transition-all hover:border-primary/50 hover:shadow-sm">
                  <CardContent className="p-4 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-foreground group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                        <Workflow className="h-4 w-4" />
                      </div>
                      <Badge variant="outline" className="text-[10px] tabular-nums">
                        {wf.nodes?.length || 0} 节点
                      </Badge>
                    </div>
                    <div>
                      <div className="text-sm font-semibold truncate">{wf.name}</div>
                      <div className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground tabular-nums">
                        <Clock className="h-3 w-3" />
                        {formatDateTime(wf.updated_at)}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* 4. 最近生成作品 */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">最近生成记录</h2>
          <Button variant="ghost" size="sm" className="text-xs" asChild>
            <Link href="/history">
              <History className="h-3.5 w-3.5" />
              进入作品历史
            </Link>
          </Button>
        </div>

        {recentTasks.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-10 text-center space-y-2.5">
              <Sparkles className="h-7 w-7 text-muted-foreground/50" />
              <div className="text-sm font-medium">还没有生成作品</div>
              <p className="text-xs text-muted-foreground max-w-sm">
                前往图片生成、视频生成或节点画布创作你的第一组视觉作品，所有记录将自动保存在此处。
              </p>
              <div className="flex gap-2 pt-1">
                <Button size="sm" variant="outline" asChild>
                  <Link href="/image-gen">去生成图片</Link>
                </Button>
                <Button size="sm" variant="outline" asChild>
                  <Link href="/video-gen">去生成视频</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {recentTasks.map((t) => {
              const previewUrl = t.result_urls?.[0];
              return (
                <Link
                  key={t.id}
                  href={t.task_type === 'video' ? '/video-gen' : '/image-gen'}
                  className="group block"
                >
                  <Card className="overflow-hidden transition-all hover:border-primary/50 hover:shadow-sm">
                    <div className="aspect-[4/3] w-full bg-muted flex items-center justify-center overflow-hidden border-b">
                      {previewUrl ? (
                        t.task_type === 'video' && previewUrl.endsWith('.mp4') ? (
                          <video
                            src={previewUrl}
                            className="h-full w-full object-cover"
                            muted
                          />
                        ) : (
                          <img
                            src={previewUrl}
                            alt={t.prompt}
                            className="h-full w-full object-cover transition-transform group-hover:scale-105"
                          />
                        )
                      ) : (
                        <div className="flex flex-col items-center gap-1 text-xs text-muted-foreground">
                          {t.task_type === 'video' ? (
                            <Film className="h-5 w-5" />
                          ) : (
                            <ImageIcon className="h-5 w-5" />
                          )}
                          <span>{t.status}</span>
                        </div>
                      )}
                    </div>
                    <CardContent className="p-3 space-y-1.5">
                      <div className="flex items-center justify-between gap-1">
                        <Badge variant="secondary" className="text-[10px]">
                          {t.task_type === 'video' ? '视频' : '图片'}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground tabular-nums">
                          {formatDateTime(t.created_at)}
                        </span>
                      </div>
                      <p className="text-xs text-foreground line-clamp-1 font-medium">
                        {t.prompt}
                      </p>
                      <div className="text-[10px] font-mono text-muted-foreground truncate">
                        {t.model_name}
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
