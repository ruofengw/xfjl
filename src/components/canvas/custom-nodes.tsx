'use client';

import React from 'react';
import Link from 'next/link';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  Eye,
  FileImage,
  FileText,
  Film,
  FolderPlus,
  GitBranch,
  Image as ImageIcon,
  Loader2,
  Package,
  PauseCircle,
  Play,
  Plus,
  RefreshCw,
  Sparkles,
  StickyNote,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { useCanvasActions } from './canvas-context';
import type {
  CanvasNodeData,
  CanvasNodeStatus,
  LlmFissionMode,
} from '@/lib/types';
import { copyToClipboard } from '@/lib/utils';

export type WorkflowNode = Node<CanvasNodeData>;

const STATUS_BADGE: Record<
  CanvasNodeStatus,
  { label: string; className: string; icon: React.ComponentType<{ className?: string }> }
> = {
  idle: {
    label: '待运行',
    className: 'bg-slate-100 text-slate-600 border-slate-200',
    icon: Clock,
  },
  running: {
    label: '执行中',
    className: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    icon: Loader2,
  },
  done: {
    label: '已完成',
    className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    icon: CheckCircle2,
  },
  stale: {
    label: '上游已更新',
    className: 'bg-amber-50 text-amber-700 border-amber-200',
    icon: AlertCircle,
  },
  paused: {
    label: '上游失败暂停',
    className: 'bg-orange-50 text-orange-700 border-orange-200',
    icon: PauseCircle,
  },
  error: {
    label: '失败',
    className: 'bg-rose-50 text-rose-700 border-rose-200',
    icon: AlertCircle,
  },
};

function NodeShell({
  id,
  data,
  selected,
  headerClass,
  icon: Icon,
  hasTarget = true,
  hasSource = true,
  canRun = true,
  canArchive = false,
  onTriggerDownstream = false,
  children,
}: {
  id: string;
  data: CanvasNodeData;
  selected?: boolean;
  headerClass: string;
  icon: React.ComponentType<{ className?: string }>;
  hasTarget?: boolean;
  hasSource?: boolean;
  canRun?: boolean;
  canArchive?: boolean;
  onTriggerDownstream?: boolean;
  children: React.ReactNode;
}) {
  const {
    runSingleNode,
    runDownstreamFrom,
    deleteNode,
    openQuickAddFromNode,
    archiveSingleNode,
    isRunningAll,
  } = useCanvasActions();

  const statusMeta = STATUS_BADGE[data.status || 'idle'];
  const StatusIcon = statusMeta.icon;

  return (
    <div
      className={`group relative w-[320px] rounded-2xl border bg-card/95 backdrop-blur-sm text-card-foreground shadow-md transition-all hover:shadow-xl ${
        selected ? 'border-primary ring-2 ring-primary/35 shadow-xl' : ''
      }`}
    >
      {hasTarget && (
        <Handle
          type="target"
          position={Position.Left}
          className="!-left-2 !h-3.5 !w-3.5 !border-2 !border-white !bg-primary shadow-sm transition-transform hover:scale-125"
        />
      )}

      <div
        className={`flex items-center justify-between rounded-t-2xl border-b px-3 py-2 ${headerClass}`}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <Icon className="h-4 w-4 shrink-0" />
          <span className="truncate text-xs font-semibold">{data.label}</span>
        </div>

        <div className="flex items-center gap-1 nodrag">
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${statusMeta.className}`}
          >
            <StatusIcon
              className={`h-2.5 w-2.5 ${
                data.status === 'running' ? 'animate-spin' : ''
              }`}
            />
            {statusMeta.label}
          </span>

          {canRun && (
            <button
              type="button"
              onClick={() => runSingleNode(id)}
              disabled={isRunningAll || data.status === 'running'}
              title="运行此节点"
              className="rounded p-1 hover:bg-black/10 disabled:opacity-40"
            >
              <Play className="h-3.5 w-3.5" />
            </button>
          )}

          {onTriggerDownstream && (
            <button
              type="button"
              onClick={() => runDownstreamFrom(id)}
              disabled={isRunningAll}
              title="触发下游重新生成"
              className="rounded p-1 hover:bg-black/10 disabled:opacity-40"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          )}

          {canArchive && (
            <button
              type="button"
              onClick={() => archiveSingleNode(id)}
              title="保存成果到云端素材库"
              className="rounded p-1 hover:bg-black/10"
            >
              <FolderPlus className="h-3.5 w-3.5" />
            </button>
          )}

          <button
            type="button"
            onClick={() => deleteNode(id)}
            disabled={isRunningAll}
            title="删除节点"
            className="rounded p-1 text-rose-600 hover:bg-rose-500/10 disabled:opacity-40"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="p-3 space-y-2.5 text-xs">{children}</div>

      {data.errorMessage && (
        <div className="mx-3 mb-3 rounded-lg border border-rose-200 bg-rose-50 p-2 text-[11px] text-rose-700 leading-relaxed">
          {data.errorMessage}
        </div>
      )}

      {hasSource && (
        <>
          <Handle
            type="source"
            position={Position.Right}
            className="!-right-2 !h-3.5 !w-3.5 !border-2 !border-white !bg-primary shadow-sm transition-transform hover:scale-125"
          />
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              openQuickAddFromNode(id);
            }}
            title="快速添加下游节点（或直接拖出连线松手）"
            className="nodrag absolute -right-9 top-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded-full border bg-background text-primary shadow-md opacity-0 group-hover:opacity-100 hover:bg-primary hover:text-white transition-all"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </>
      )}
    </div>
  );
}

// 0. 文本 / Prompt 节点
export function TextNoteNode({ id, data, selected }: NodeProps<WorkflowNode>) {
  const { updateNodeData } = useCanvasActions();
  const text = data.noteText || '';

  return (
    <NodeShell
      id={id}
      data={data}
      selected={selected}
      headerClass="bg-teal-50/90 text-teal-900"
      icon={StickyNote}
      hasTarget={false}
      canRun={false}
      onTriggerDownstream
    >
      <div className="flex items-center justify-between">
        <label className="text-[11px] font-medium text-muted-foreground">
          提示词 / 创意脚本
        </label>
        {text && (
          <button
            type="button"
            onClick={async () => {
              await copyToClipboard(text);
              toast.success('已复制节点文本');
            }}
            className="nodrag inline-flex items-center gap-1 text-[10px] text-teal-700 hover:underline"
          >
            <Copy className="h-2.5 w-2.5" />
            复制
          </button>
        )}
      </div>
      <textarea
        rows={4}
        value={text}
        onChange={(e) =>
          updateNodeData(
            id,
            { noteText: e.target.value, status: 'done' },
            true
          )
        }
        placeholder="输入画面描述 Prompt、卖点脚本或运镜需求，连线到生图/生视频/LLM 节点即可自动传递..."
        className="nodrag nowheel w-full rounded-md border bg-background px-2 py-1.5 text-xs leading-relaxed outline-none focus:ring-1 focus:ring-teal-500 resize-none"
      />
    </NodeShell>
  );
}

// 1. 产品档案输入节点
export function ProductInputNode({ id, data, selected }: NodeProps<WorkflowNode>) {
  const { products, updateNodeData, runDownstreamFrom, isRunningAll } =
    useCanvasActions();
  const product = products.find((p) => p.id === data.productId);

  return (
    <NodeShell
      id={id}
      data={data}
      selected={selected}
      headerClass="bg-indigo-50/90 text-indigo-900"
      icon={Package}
      hasTarget={false}
      canRun={false}
      onTriggerDownstream
    >
      <div className="space-y-1">
        <label className="text-[11px] font-medium text-muted-foreground">
          关联产品档案
        </label>
        <select
          value={data.productId || ''}
          onChange={(e) =>
            updateNodeData(
              id,
              { productId: e.target.value, status: 'done' },
              true
            )
          }
          className="nodrag w-full rounded-md border bg-background px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="">-- 请选择产品 --</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {product && (
        <div className="rounded-md bg-muted/50 p-2 text-[11px] text-muted-foreground space-y-1">
          <div className="font-medium text-foreground line-clamp-1">
            {product.name}
          </div>
          <div className="line-clamp-2">{product.selling_points}</div>
        </div>
      )}

      <div className="space-y-1">
        <label className="text-[11px] font-medium text-muted-foreground">
          临时钩子 / 卖点补充（修改后可重算下游）
        </label>
        <textarea
          rows={2}
          value={data.customHookNote || ''}
          onChange={(e) =>
            updateNodeData(
              id,
              { customHookNote: e.target.value, status: 'done' },
              true
            )
          }
          placeholder="例如：本场新增买1送1机制..."
          className="nodrag nowheel w-full rounded-md border bg-background px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-primary resize-none"
        />
      </div>

      <button
        type="button"
        disabled={isRunningAll}
        onClick={() => runDownstreamFrom(id)}
        className="nodrag flex w-full items-center justify-center gap-1.5 rounded-md bg-indigo-600 py-1.5 text-[11px] font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
      >
        <RefreshCw className="h-3 w-3" />
        触发下游重新生成
      </button>
    </NodeShell>
  );
}

// 2. 素材库输入节点
export function AssetInputNode({ id, data, selected }: NodeProps<WorkflowNode>) {
  const { assets, updateNodeData } = useCanvasActions();
  const selectedAsset = assets.find((a) => a.id === data.assetId);

  const displayUrl = data.assetFileUrl || selectedAsset?.file_url || '';
  const displayContent = data.assetContent || selectedAsset?.content || '';
  const displayType = data.assetType || selectedAsset?.asset_type || 'copywriting';

  return (
    <NodeShell
      id={id}
      data={data}
      selected={selected}
      headerClass="bg-emerald-50/90 text-emerald-900"
      icon={displayType === 'image' || displayType === 'video' ? FileImage : FileText}
      hasTarget={false}
      canRun={false}
      onTriggerDownstream
    >
      <div className="space-y-1">
        <label className="text-[11px] font-medium text-muted-foreground">
          选择参考素材（可从左侧抽屉拖入）
        </label>
        <select
          value={data.assetId || ''}
          onChange={(e) => {
            const found = assets.find((a) => a.id === e.target.value);
            updateNodeData(
              id,
              {
                assetId: e.target.value,
                assetTitle: found?.title || '',
                assetType: found?.asset_type,
                assetContent: found?.content || '',
                assetFileUrl: found?.file_url || '',
                status: 'done',
              },
              true
            );
          }}
          className="nodrag w-full rounded-md border bg-background px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="">-- 选择云端素材 --</option>
          {assets.map((a) => (
            <option key={a.id} value={a.id}>
              [{a.asset_type}] {a.title}
            </option>
          ))}
        </select>
      </div>

      {displayUrl && (displayType === 'image' || displayType === 'video') && (
        <div className="overflow-hidden rounded-md border bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={displayUrl}
            alt={data.assetTitle || '参考素材'}
            className="h-24 w-full object-cover"
          />
        </div>
      )}

      {displayContent && (
        <div className="nowheel max-h-20 overflow-y-auto rounded-md bg-muted/50 p-2 text-[11px] text-muted-foreground whitespace-pre-wrap">
          {displayContent}
        </div>
      )}
    </NodeShell>
  );
}

// 3. LLM 文本裂变节点（严格仅列 text API）
export function LlmFissionNode({ id, data, selected }: NodeProps<WorkflowNode>) {
  const { apiConfigs, updateNodeData, runDownstreamFrom, isRunningAll } =
    useCanvasActions();
  const activeTextConfigs = apiConfigs.filter(
    (c) => c.is_active && c.api_type === 'text' && (c.models || []).length > 0
  );
  const selectedCfg =
    activeTextConfigs.find((c) => c.id === data.configId) || activeTextConfigs[0];

  return (
    <NodeShell
      id={id}
      data={data}
      selected={selected}
      headerClass="bg-violet-50/90 text-violet-900"
      icon={Sparkles}
      canArchive
      onTriggerDownstream
    >
      <div className="grid grid-cols-2 gap-1.5">
        <div className="space-y-1">
          <label className="text-[10px] text-muted-foreground">裂变任务</label>
          <select
            value={data.fissionMode || 'short_video'}
            onChange={(e) =>
              updateNodeData(id, {
                fissionMode: e.target.value as LlmFissionMode,
              })
            }
            className="nodrag w-full rounded border bg-background px-1.5 py-1 text-[11px]"
          >
            <option value="hooks">前3秒黄金钩子</option>
            <option value="short_video">短视频口播稿</option>
            <option value="seeding_post">小红书种草图文</option>
            <option value="live_script">直播逼单话术</option>
            <option value="custom">自定义裂变</option>
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] text-muted-foreground">文本 API 模型</label>
          {activeTextConfigs.length > 0 ? (
            <select
              value={data.model || selectedCfg?.models[0] || ''}
              onChange={(e) => {
                const m = e.target.value;
                const ownerCfg = activeTextConfigs.find((c) => c.models.includes(m));
                updateNodeData(id, {
                  model: m,
                  configId: ownerCfg?.id || selectedCfg?.id,
                });
              }}
              className="nodrag w-full rounded border bg-background px-1.5 py-1 font-mono text-[10px]"
            >
              {activeTextConfigs.flatMap((c) =>
                c.models.map((m) => (
                  <option key={`${c.id}-${m}`} value={m}>
                    {m}
                  </option>
                ))
              )}
            </select>
          ) : (
            <Link
              href="/settings/api?tab=text"
              className="nodrag block rounded border border-dashed border-violet-300 bg-violet-50/50 px-2 py-1 text-[10px] text-violet-700 hover:bg-violet-50"
            >
              演示模式 · 去配置
            </Link>
          )}
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-[10px] text-muted-foreground">指令约束</label>
        <input
          value={data.instruction || ''}
          onChange={(e) => updateNodeData(id, { instruction: e.target.value })}
          placeholder="输入风格、字数或受众指令..."
          className="nodrag w-full rounded border bg-background px-2 py-1 text-[11px]"
        />
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <label className="text-[10px] text-muted-foreground">
            输出文案（可编辑后重算下游）
          </label>
          {data.outputText && (
            <button
              type="button"
              disabled={isRunningAll}
              onClick={() => runDownstreamFrom(id)}
              className="nodrag text-[10px] text-primary hover:underline"
            >
              更新下游
            </button>
          )}
        </div>
        <textarea
          rows={4}
          value={data.outputText || ''}
          onChange={(e) =>
            updateNodeData(id, { outputText: e.target.value }, true)
          }
          placeholder="点击右上角 ▶ 运行，结果将流式写入此处..."
          className="nodrag nowheel w-full rounded-md border bg-muted/30 px-2 py-1.5 text-[11px] leading-relaxed outline-none focus:ring-1 focus:ring-primary"
        />
      </div>
    </NodeShell>
  );
}

// 4. 分镜拆解节点
export function StoryboardNode({ id, data, selected }: NodeProps<WorkflowNode>) {
  const { updateNodeData } = useCanvasActions();
  const shots = data.shots || [];
  const selectedIdx = data.selectedShotIndex ?? 0;
  const activeShot = shots[selectedIdx];

  return (
    <NodeShell
      id={id}
      data={data}
      selected={selected}
      headerClass="bg-amber-50/90 text-amber-900"
      icon={GitBranch}
      canArchive
      onTriggerDownstream
    >
      <div className="grid grid-cols-2 gap-1.5">
        <div className="space-y-1">
          <label className="text-[10px] text-muted-foreground">分镜数</label>
          <select
            value={String(data.shotCount || 3)}
            onChange={(e) =>
              updateNodeData(id, { shotCount: Number(e.target.value) })
            }
            className="nodrag w-full rounded border bg-background px-2 py-1 text-[11px]"
          >
            <option value="2">2 个镜头</option>
            <option value="3">3 个镜头</option>
            <option value="4">4 个镜头</option>
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] text-muted-foreground">画面比例</label>
          <select
            value={data.aspectRatio || '9:16'}
            onChange={(e) =>
              updateNodeData(id, { aspectRatio: e.target.value }, true)
            }
            className="nodrag w-full rounded border bg-background px-2 py-1 text-[11px]"
          >
            <option value="9:16">9:16 竖屏</option>
            <option value="16:9">16:9 横屏</option>
            <option value="1:1">1:1 方图</option>
            <option value="3:4">3:4 图文</option>
          </select>
        </div>
      </div>

      {shots.length > 0 ? (
        <div className="space-y-1.5">
          <div className="flex flex-wrap gap-1 nodrag">
            {shots.map((s, idx) => (
              <button
                key={s.shot_number}
                type="button"
                onClick={() =>
                  updateNodeData(id, { selectedShotIndex: idx }, true)
                }
                className={`rounded px-2 py-0.5 text-[10px] font-medium border ${
                  idx === selectedIdx
                    ? 'bg-amber-600 text-white border-amber-600'
                    : 'bg-background text-muted-foreground hover:bg-muted'
                }`}
              >
                镜 #{s.shot_number}
              </button>
            ))}
          </div>

          {activeShot && (
            <div className="nowheel max-h-28 overflow-y-auto rounded-md border bg-muted/30 p-2 text-[11px] space-y-1">
              <div className="font-semibold text-foreground">
                {activeShot.shot_type} · {activeShot.camera_movement}
              </div>
              <div className="text-muted-foreground">{activeShot.visual_zh}</div>
              <div className="rounded bg-slate-900 px-1.5 py-1 font-mono text-[10px] text-slate-100">
                {activeShot.prompt_en}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-md border border-dashed p-3 text-center text-[11px] text-muted-foreground">
          运行后将自动拆解出结构化中文分镜与英文生图/生视频 Prompt
        </div>
      )}
    </NodeShell>
  );
}

// 5. AI 生图节点（严格仅绑定 image API，支持多图结果点选传下游）
export function ImageGenNode({ id, data, selected }: NodeProps<WorkflowNode>) {
  const { apiConfigs, updateNodeData } = useCanvasActions();
  const imageConfigs = apiConfigs.filter(
    (c) => c.is_active && c.api_type === 'image' && (c.image_models || []).length > 0
  );
  const selectedCompound =
    data.configId && data.model && imageConfigs.some((c) => c.id === data.configId)
      ? `${data.configId}::${data.model}`
      : 'demo_sim';

  const resultUrls =
    data.resultUrls && data.resultUrls.length > 0
      ? data.resultUrls
      : data.resultUrl
        ? [data.resultUrl]
        : [];
  const selectedIdx = data.selectedResultIndex ?? 0;

  return (
    <NodeShell
      id={id}
      data={data}
      selected={selected}
      headerClass="bg-indigo-50/90 text-indigo-900"
      icon={ImageIcon}
      canArchive
      onTriggerDownstream
    >
      <div className="grid grid-cols-3 gap-1.5">
        <div className="space-y-1">
          <label className="text-[10px] text-muted-foreground">模式</label>
          <select
            value={data.mediaMode || 't2i'}
            onChange={(e) =>
              updateNodeData(id, {
                mediaMode: e.target.value as 't2i' | 'i2i',
              })
            }
            className="nodrag w-full rounded border bg-background px-1.5 py-1 text-[11px]"
          >
            <option value="t2i">文生图</option>
            <option value="i2i">图生图</option>
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] text-muted-foreground">比例</label>
          <select
            value={data.aspectRatio || '9:16'}
            onChange={(e) => updateNodeData(id, { aspectRatio: e.target.value })}
            className="nodrag w-full rounded border bg-background px-1.5 py-1 text-[11px]"
          >
            <option value="9:16">9:16</option>
            <option value="16:9">16:9</option>
            <option value="1:1">1:1</option>
            <option value="3:4">3:4</option>
            <option value="4:3">4:3</option>
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] text-muted-foreground">张数</label>
          <select
            value={String(data.batchCount || 1)}
            onChange={(e) =>
              updateNodeData(id, { batchCount: Number(e.target.value) })
            }
            className="nodrag w-full rounded border bg-background px-1.5 py-1 text-[11px]"
          >
            <option value="1">1 张</option>
            <option value="2">2 张</option>
            <option value="3">3 张</option>
            <option value="4">4 张</option>
          </select>
        </div>
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <label className="text-[10px] text-muted-foreground">
            图片 API 专用模型
          </label>
          {imageConfigs.length === 0 && (
            <Link
              href="/settings/api?tab=image"
              className="nodrag text-[10px] font-medium text-indigo-600 hover:underline"
            >
              + 配置图片 API
            </Link>
          )}
        </div>
        <select
          value={selectedCompound}
          onChange={(e) => {
            const val = e.target.value;
            if (val === 'demo_sim') {
              updateNodeData(id, { configId: '', model: '' });
            } else {
              const [cfgId, ...rest] = val.split('::');
              updateNodeData(id, { configId: cfgId, model: rest.join('::') });
            }
          }}
          className="nodrag w-full rounded border bg-background px-1.5 py-1 font-mono text-[10px]"
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

      <div className="space-y-1">
        <label className="text-[10px] text-muted-foreground">
          画面 Prompt（留空则自动继承上游）
        </label>
        <textarea
          rows={2}
          value={data.promptOverride || ''}
          onChange={(e) => updateNodeData(id, { promptOverride: e.target.value })}
          placeholder="自动继承上游文本/分镜输出..."
          className="nodrag nowheel w-full rounded border bg-background px-2 py-1 text-[11px] resize-none"
        />
      </div>

      {data.status === 'running' && (
        <div className="space-y-1">
          <div className="flex justify-between text-[10px] text-indigo-700">
            <span>异步生图渲染中...</span>
            <span className="tabular-nums">{data.progress || 20}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-indigo-600 transition-all duration-300"
              style={{ width: `${data.progress || 20}%` }}
            />
          </div>
        </div>
      )}

      {resultUrls.length > 0 && (
        <div className="space-y-1.5">
          {resultUrls.length > 1 && (
            <p className="text-[10px] text-muted-foreground">
              点击选择传入下游的首选图（当前：图 #{selectedIdx + 1}）
            </p>
          )}
          <div
            className={`grid gap-1.5 ${
              resultUrls.length === 1 ? 'grid-cols-1' : 'grid-cols-2'
            }`}
          >
            {resultUrls.map((url, idx) => {
              const isChosen = idx === selectedIdx;
              return (
                <button
                  key={`${id}-img-${idx}`}
                  type="button"
                  onClick={() =>
                    updateNodeData(
                      id,
                      { selectedResultIndex: idx, resultUrl: url },
                      true
                    )
                  }
                  className={`nodrag relative overflow-hidden rounded-lg border transition-all ${
                    isChosen
                      ? 'border-indigo-600 ring-2 ring-indigo-500/30'
                      : 'border-slate-200 opacity-80 hover:opacity-100'
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt={`生图结果 ${idx + 1}`}
                    className={`w-full object-cover bg-slate-950/5 ${
                      resultUrls.length === 1 ? 'max-h-44 object-contain' : 'h-24'
                    }`}
                  />
                  {resultUrls.length > 1 && isChosen && (
                    <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-indigo-600 text-white shadow">
                      <Check className="h-2.5 w-2.5" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </NodeShell>
  );
}

// 6. AI 生视频节点（严格仅绑定 video API，允许继续连线到结果展示节点）
export function VideoGenNode({ id, data, selected }: NodeProps<WorkflowNode>) {
  const { apiConfigs, updateNodeData } = useCanvasActions();
  const videoConfigs = apiConfigs.filter(
    (c) => c.is_active && c.api_type === 'video' && (c.video_models || []).length > 0
  );
  const selectedCompound =
    data.configId && data.model && videoConfigs.some((c) => c.id === data.configId)
      ? `${data.configId}::${data.model}`
      : 'demo_sim';

  return (
    <NodeShell
      id={id}
      data={data}
      selected={selected}
      headerClass="bg-rose-50/90 text-rose-900"
      icon={Film}
      hasSource={true}
      canArchive
      onTriggerDownstream
    >
      <div className="grid grid-cols-3 gap-1.5">
        <div className="space-y-1">
          <label className="text-[10px] text-muted-foreground">模式</label>
          <select
            value={data.mediaMode || 'i2v'}
            onChange={(e) =>
              updateNodeData(id, {
                mediaMode: e.target.value as 't2v' | 'i2v',
              })
            }
            className="nodrag w-full rounded border bg-background px-1.5 py-1 text-[11px]"
          >
            <option value="i2v">图生视频</option>
            <option value="t2v">文生视频</option>
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] text-muted-foreground">比例</label>
          <select
            value={data.aspectRatio || '9:16'}
            onChange={(e) => updateNodeData(id, { aspectRatio: e.target.value })}
            className="nodrag w-full rounded border bg-background px-1.5 py-1 text-[11px]"
          >
            <option value="9:16">9:16</option>
            <option value="16:9">16:9</option>
            <option value="1:1">1:1</option>
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] text-muted-foreground">时长</label>
          <select
            value={String(data.durationSec || 5)}
            onChange={(e) =>
              updateNodeData(id, { durationSec: Number(e.target.value) })
            }
            className="nodrag w-full rounded border bg-background px-1.5 py-1 text-[11px]"
          >
            <option value="5">5 秒</option>
            <option value="8">8 秒</option>
            <option value="10">10 秒</option>
          </select>
        </div>
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <label className="text-[10px] text-muted-foreground">
            视频 API 专用模型
          </label>
          {videoConfigs.length === 0 && (
            <Link
              href="/settings/api?tab=video"
              className="nodrag text-[10px] font-medium text-rose-600 hover:underline"
            >
              + 配置视频 API
            </Link>
          )}
        </div>
        <select
          value={selectedCompound}
          onChange={(e) => {
            const val = e.target.value;
            if (val === 'demo_sim') {
              updateNodeData(id, { configId: '', model: '' });
            } else {
              const [cfgId, ...rest] = val.split('::');
              updateNodeData(id, { configId: cfgId, model: rest.join('::') });
            }
          }}
          className="nodrag w-full rounded border bg-background px-1.5 py-1 font-mono text-[10px]"
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

      <div className="space-y-1">
        <label className="text-[10px] text-muted-foreground">
          运镜/画面 Prompt（自动继承上游分镜 & 首帧图）
        </label>
        <textarea
          rows={2}
          value={data.promptOverride || ''}
          onChange={(e) => updateNodeData(id, { promptOverride: e.target.value })}
          placeholder="自动继承上游分镜与选定首帧图..."
          className="nodrag nowheel w-full rounded border bg-background px-2 py-1 text-[11px] resize-none"
        />
      </div>

      {data.status === 'running' && (
        <div className="space-y-1">
          <div className="flex justify-between text-[10px] text-rose-700">
            <span>异步视频渲染轮询中...</span>
            <span className="tabular-nums">{data.progress || 20}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-rose-600 transition-all duration-300"
              style={{ width: `${data.progress || 20}%` }}
            />
          </div>
        </div>
      )}

      {data.resultUrl && (
        <div className="space-y-1.5">
          <div className="overflow-hidden rounded-lg border bg-black/5">
            {/\.(mp4|webm|mov)(\?|$)/i.test(data.resultUrl) ? (
              <video src={data.resultUrl} controls className="w-full max-h-40" />
            ) : (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={data.resultUrl}
                alt="视频成片预览"
                className="w-full max-h-40 object-contain"
              />
            )}
          </div>
          <a
            href={data.resultUrl}
            download
            target="_blank"
            rel="noopener noreferrer"
            className="nodrag inline-flex items-center gap-1 text-[10px] text-rose-700 hover:underline"
          >
            <Download className="h-3 w-3" />
            下载成片
          </a>
        </div>
      )}
    </NodeShell>
  );
}

// 7. 结果展示节点
export function ResultDisplayNode({ id, data, selected }: NodeProps<WorkflowNode>) {
  const url = data.resultUrl || '';
  const text = data.outputText || '';
  const isVideo = /\.(mp4|webm|mov)(\?|$)/i.test(url);

  return (
    <NodeShell
      id={id}
      data={data}
      selected={selected}
      headerClass="bg-cyan-50/90 text-cyan-900"
      icon={Eye}
      canArchive={Boolean(url || text)}
      hasSource={true}
    >
      {!url && !text ? (
        <div className="rounded-lg border border-dashed py-6 text-center text-[11px] text-muted-foreground">
          连接上游生图 / 生视频 / LLM 节点并运行，即可在此汇总展示与下载成果
        </div>
      ) : (
        <div className="space-y-2">
          {url && (
            <div className="overflow-hidden rounded-lg border bg-slate-950/5">
              {isVideo ? (
                <video src={url} controls className="w-full max-h-48" />
              ) : (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={url}
                  alt="最终成果预览"
                  className="w-full max-h-48 object-contain"
                />
              )}
            </div>
          )}
          {text && (
            <div className="nowheel max-h-28 overflow-y-auto rounded-md border bg-muted/30 p-2 text-[11px] whitespace-pre-wrap leading-relaxed">
              {text}
            </div>
          )}
          <div className="flex items-center gap-2 pt-0.5">
            {url && (
              <a
                href={url}
                download
                target="_blank"
                rel="noopener noreferrer"
                className="nodrag inline-flex items-center gap-1 rounded-md border bg-white px-2 py-1 text-[10px] font-medium hover:bg-slate-50"
              >
                <Download className="h-3 w-3" />
                下载文件
              </a>
            )}
            {text && (
              <button
                type="button"
                onClick={async () => {
                  await copyToClipboard(text);
                  toast.success('已复制成果文案');
                }}
                className="nodrag inline-flex items-center gap-1 rounded-md border bg-white px-2 py-1 text-[10px] font-medium hover:bg-slate-50"
              >
                <Copy className="h-3 w-3" />
                复制内容
              </button>
            )}
          </div>
        </div>
      )}
    </NodeShell>
  );
}
