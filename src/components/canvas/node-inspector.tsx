'use client';

import React from 'react';
import Link from 'next/link';
import {
  Copy,
  Download,
  FolderPlus,
  Play,
  RefreshCw,
  SlidersHorizontal,
  Trash2,
  X,
} from 'lucide-react';
import {
  ASPECT_RATIOS,
  CAMERA_MOVEMENTS,
  IMAGE_RESOLUTIONS,
  VIDEO_DURATIONS,
  VIDEO_RESOLUTIONS,
} from '@/lib/constants';
import type { ApiConfigPublic, CanvasNodeData } from '@/lib/types';
import type { WorkflowNode } from './custom-nodes';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

interface NodeInspectorProps {
  node: WorkflowNode | null;
  apiConfigs: ApiConfigPublic[];
  isRunningAll: boolean;
  onUpdateData: (
    nodeId: string,
    patch: Partial<CanvasNodeData>,
    markDownstreamStale?: boolean
  ) => void;
  onRunNode: (nodeId: string) => void;
  onRunDownstream: (nodeId: string) => void;
  onDuplicate: (nodeId: string) => void;
  onArchive: (nodeId: string) => void;
  onDelete: (nodeId: string) => void;
  onClose: () => void;
}

export function NodeInspector({
  node,
  apiConfigs,
  isRunningAll,
  onUpdateData,
  onRunNode,
  onRunDownstream,
  onDuplicate,
  onArchive,
  onDelete,
  onClose,
}: NodeInspectorProps) {
  if (!node) return null;

  const kind = node.type || 'llmFission';
  const data = node.data;

  const imageConfigs = apiConfigs.filter(
    (c) => c.is_active && c.api_type === 'image' && (c.image_models || []).length > 0
  );
  const videoConfigs = apiConfigs.filter(
    (c) => c.is_active && c.api_type === 'video' && (c.video_models || []).length > 0
  );
  const textConfigs = apiConfigs.filter(
    (c) => c.is_active && c.api_type === 'text' && (c.models || []).length > 0
  );

  const canRun =
    kind !== 'productInput' && kind !== 'assetInput' && kind !== 'textNote';
  const canArchive =
    kind === 'llmFission' ||
    kind === 'storyboard' ||
    kind === 'imageGen' ||
    kind === 'videoGen' ||
    kind === 'resultDisplay';

  return (
    <aside className="absolute right-3 top-20 bottom-12 z-20 w-80 rounded-2xl border bg-card/95 backdrop-blur-md shadow-2xl flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-3.5 py-2.5 bg-slate-50/70">
        <div className="flex items-center gap-2 min-w-0">
          <SlidersHorizontal className="h-4 w-4 text-indigo-600 shrink-0" />
          <span className="text-xs font-semibold truncate">节点属性面板</span>
          <Badge variant="outline" className="text-[10px] font-mono shrink-0">
            {kind}
          </Badge>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-muted-foreground hover:bg-muted"
          title="收起属性面板"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Scrollable Body */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-4 text-xs">
        {/* Node Label */}
        <div className="space-y-1.5">
          <Label className="text-[11px] text-muted-foreground">节点名称</Label>
          <Input
            value={data.label || ''}
            onChange={(e) => onUpdateData(node.id, { label: e.target.value })}
            className="h-8 text-xs"
          />
        </div>

        {/* Text Note editor */}
        {kind === 'textNote' && (
          <div className="space-y-1.5">
            <Label className="text-[11px] text-muted-foreground">提示词 / 文本内容</Label>
            <Textarea
              rows={7}
              value={data.noteText || ''}
              onChange={(e) =>
                onUpdateData(node.id, { noteText: e.target.value, status: 'done' }, true)
              }
              className="text-xs leading-relaxed"
            />
          </div>
        )}

        {/* LLM Fission settings */}
        {kind === 'llmFission' && (
          <>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-[11px] text-muted-foreground">文本 API 模型</Label>
                {textConfigs.length === 0 && (
                  <Link href="/settings/api?tab=text" className="text-[10px] text-indigo-600 hover:underline">
                    去配置文本 API
                  </Link>
                )}
              </div>
              <select
                value={
                  data.configId && data.model
                    ? `${data.configId}::${data.model}`
                    : 'demo_sim'
                }
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === 'demo_sim') {
                    onUpdateData(node.id, { configId: '', model: '' });
                  } else {
                    const [cid, ...rest] = v.split('::');
                    onUpdateData(node.id, { configId: cid, model: rest.join('::') });
                  }
                }}
                className="w-full rounded-md border bg-background px-2 py-1.5 font-mono text-[11px]"
              >
                <option value="demo_sim">内置演示模式</option>
                {textConfigs.flatMap((c) =>
                  c.models.map((m) => (
                    <option key={`${c.id}-${m}`} value={`${c.id}::${m}`}>
                      {c.display_name} · {m}
                    </option>
                  ))
                )}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] text-muted-foreground">创作指令</Label>
              <Textarea
                rows={4}
                value={data.instruction || ''}
                onChange={(e) => onUpdateData(node.id, { instruction: e.target.value })}
                className="text-xs"
              />
            </div>
          </>
        )}

        {/* ImageGen settings */}
        {kind === 'imageGen' && (
          <>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-[11px] text-muted-foreground">图片 API 供应商与模型</Label>
                <Link href="/settings/api?tab=image" className="text-[10px] text-indigo-600 hover:underline">
                  管理图片 API
                </Link>
              </div>
              <select
                value={
                  data.configId && data.model && imageConfigs.some((c) => c.id === data.configId)
                    ? `${data.configId}::${data.model}`
                    : 'demo_sim'
                }
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === 'demo_sim') {
                    onUpdateData(node.id, { configId: '', model: '' });
                  } else {
                    const [cid, ...rest] = v.split('::');
                    onUpdateData(node.id, { configId: cid, model: rest.join('::') });
                  }
                }}
                className="w-full rounded-md border bg-background px-2 py-1.5 font-mono text-[11px]"
              >
                <option value="demo_sim">内置图片演示通道</option>
                {imageConfigs.flatMap((c) =>
                  (c.image_models || []).map((m) => (
                    <option key={`${c.id}-${m}`} value={`${c.id}::${m}`}>
                      {c.display_name} · {m}
                    </option>
                  ))
                )}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">画面比例</Label>
                <select
                  value={data.aspectRatio || '9:16'}
                  onChange={(e) => onUpdateData(node.id, { aspectRatio: e.target.value })}
                  className="w-full rounded-md border bg-background px-2 py-1.5 text-xs"
                >
                  {ASPECT_RATIOS.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">分辨率</Label>
                <select
                  value={data.resolution || '1024x1024'}
                  onChange={(e) => onUpdateData(node.id, { resolution: e.target.value })}
                  className="w-full rounded-md border bg-background px-2 py-1.5 font-mono text-[11px]"
                >
                  {IMAGE_RESOLUTIONS.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.value}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[11px] text-muted-foreground">批量出图数量</Label>
              <div className="grid grid-cols-4 gap-1.5">
                {[1, 2, 3, 4].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => onUpdateData(node.id, { batchCount: n })}
                    className={`h-8 rounded-md border text-xs font-semibold ${
                      (data.batchCount || 1) === n
                        ? 'border-indigo-600 bg-indigo-600 text-white'
                        : 'bg-background hover:bg-muted'
                    }`}
                  >
                    {n} 张
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[11px] text-muted-foreground">画面提示词覆盖</Label>
              <Textarea
                rows={4}
                value={data.promptOverride || ''}
                onChange={(e) => onUpdateData(node.id, { promptOverride: e.target.value })}
                placeholder="留空则自动继承上游输出..."
                className="text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-[11px] text-muted-foreground">反向提示词</Label>
              <Textarea
                rows={2}
                value={data.negativePrompt || ''}
                onChange={(e) => onUpdateData(node.id, { negativePrompt: e.target.value })}
                placeholder="blurry, watermark..."
                className="text-xs"
              />
            </div>
          </>
        )}

        {/* VideoGen settings */}
        {kind === 'videoGen' && (
          <>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-[11px] text-muted-foreground">视频 API 供应商与模型</Label>
                <Link href="/settings/api?tab=video" className="text-[10px] text-rose-600 hover:underline">
                  管理视频 API
                </Link>
              </div>
              <select
                value={
                  data.configId && data.model && videoConfigs.some((c) => c.id === data.configId)
                    ? `${data.configId}::${data.model}`
                    : 'demo_sim'
                }
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === 'demo_sim') {
                    onUpdateData(node.id, { configId: '', model: '' });
                  } else {
                    const [cid, ...rest] = v.split('::');
                    onUpdateData(node.id, { configId: cid, model: rest.join('::') });
                  }
                }}
                className="w-full rounded-md border bg-background px-2 py-1.5 font-mono text-[11px]"
              >
                <option value="demo_sim">内置视频演示通道</option>
                {videoConfigs.flatMap((c) =>
                  (c.video_models || []).map((m) => (
                    <option key={`${c.id}-${m}`} value={`${c.id}::${m}`}>
                      {c.display_name} · {m}
                    </option>
                  ))
                )}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">时长</Label>
                <select
                  value={String(data.durationSec || 5)}
                  onChange={(e) =>
                    onUpdateData(node.id, { durationSec: Number(e.target.value) })
                  }
                  className="w-full rounded-md border bg-background px-2 py-1.5 text-xs"
                >
                  {VIDEO_DURATIONS.map((sec) => (
                    <option key={sec} value={sec}>
                      {sec} 秒
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">清晰度</Label>
                <select
                  value={data.resolution || '720p'}
                  onChange={(e) => onUpdateData(node.id, { resolution: e.target.value })}
                  className="w-full rounded-md border bg-background px-2 py-1.5 text-xs"
                >
                  {VIDEO_RESOLUTIONS.map((resVal) => (
                    <option key={resVal} value={resVal}>
                      {resVal}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">运镜</Label>
                <select
                  value={data.cameraMovement || CAMERA_MOVEMENTS[0]}
                  onChange={(e) =>
                    onUpdateData(node.id, { cameraMovement: e.target.value })
                  }
                  className="w-full rounded-md border bg-background px-2 py-1.5 text-xs"
                >
                  {CAMERA_MOVEMENTS.map((cm) => (
                    <option key={cm} value={cm}>
                      {cm}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">FPS</Label>
                <select
                  value={String(data.fps || 24)}
                  onChange={(e) => onUpdateData(node.id, { fps: Number(e.target.value) })}
                  className="w-full rounded-md border bg-background px-2 py-1.5 text-xs"
                >
                  <option value="24">24 FPS</option>
                  <option value="30">30 FPS</option>
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[11px] text-muted-foreground">视频画面 Prompt 覆盖</Label>
              <Textarea
                rows={4}
                value={data.promptOverride || ''}
                onChange={(e) => onUpdateData(node.id, { promptOverride: e.target.value })}
                placeholder="留空则自动继承上游分镜与选定首帧图..."
                className="text-xs"
              />
            </div>
          </>
        )}

        {/* Execution Snapshot / Error Log */}
        {data.errorMessage && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-[11px] text-rose-700 space-y-1">
            <p className="font-semibold">最近一次运行错误：</p>
            <p>{data.errorMessage}</p>
          </div>
        )}

        {data.lastRunSnapshot && (
          <div className="rounded-lg border bg-slate-50 p-2.5 text-[11px] space-y-1">
            <p className="font-semibold text-slate-700">最近执行快照</p>
            {data.lastRunSnapshot.model && (
              <p className="text-muted-foreground font-mono truncate">
                模型: {data.lastRunSnapshot.model}
              </p>
            )}
            {data.lastRunSnapshot.executedAt && (
              <p className="text-muted-foreground tabular-nums">
                时间: {new Date(data.lastRunSnapshot.executedAt).toLocaleTimeString('zh-CN')}
              </p>
            )}
            {data.lastRunSnapshot.prompt && (
              <p className="text-slate-600 line-clamp-3">
                实际 Prompt: {data.lastRunSnapshot.prompt}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Footer Quick Actions */}
      <div className="border-t bg-slate-50/70 p-3 space-y-2">
        <div className="grid grid-cols-2 gap-2">
          {canRun && (
            <Button
              size="sm"
              className="h-8 text-xs bg-indigo-600 hover:bg-indigo-700"
              disabled={isRunningAll || data.status === 'running'}
              onClick={() => onRunNode(node.id)}
            >
              <Play className="mr-1 h-3.5 w-3.5" />
              运行此节点
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs"
            disabled={isRunningAll}
            onClick={() => onRunDownstream(node.id)}
          >
            <RefreshCw className="mr-1 h-3.5 w-3.5" />
            运行下游
          </Button>
        </div>

        <div className="flex items-center justify-between gap-1">
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-[11px]"
              onClick={() => onDuplicate(node.id)}
            >
              <Copy className="mr-1 h-3 w-3" />
              复制
            </Button>
            {canArchive && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-[11px]"
                onClick={() => onArchive(node.id)}
              >
                <FolderPlus className="mr-1 h-3 w-3" />
                归档
              </Button>
            )}
            {data.resultUrl && (
              <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" asChild>
                <a href={data.resultUrl} download target="_blank" rel="noopener noreferrer">
                  <Download className="mr-1 h-3 w-3" />
                  下载
                </a>
              </Button>
            )}
          </div>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-rose-500 hover:text-rose-700"
            onClick={() => onDelete(node.id)}
            title="删除节点"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </aside>
  );
}
