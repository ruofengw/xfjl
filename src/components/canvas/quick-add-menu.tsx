'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Eye,
  FileImage,
  FileText,
  Film,
  GitBranch,
  Image as ImageIcon,
  Layers,
  Package,
  Search,
  Sparkles,
  StickyNote,
} from 'lucide-react';
import type {
  Asset,
  CanvasNodeData,
  CanvasNodeKind,
  Product,
} from '@/lib/types';

export interface NodePaletteMeta {
  type: CanvasNodeKind;
  title: string;
  desc: string;
  group: '输入节点' | '处理节点' | '生成节点' | '展示节点';
  keywords: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
}

export const CANVAS_NODE_PALETTE: NodePaletteMeta[] = [
  {
    type: 'textNote',
    title: '文本 / Prompt 节点',
    desc: '自由输入提示词、脚本文案或创意备注，传递至下游',
    group: '输入节点',
    keywords: '文本 prompt 提示词 备注 note text 脚本 输入',
    icon: StickyNote,
    accent: 'text-teal-600 bg-teal-50',
  },
  {
    type: 'llmFission',
    title: 'LLM 文本裂变',
    desc: '接入文本大模型生成钩子、口播、种草或话术',
    group: '处理节点',
    keywords: 'llm 文本 裂变 文案 口播 钩子 话术 deepseek kimi ai',
    icon: Sparkles,
    accent: 'text-violet-600 bg-violet-50',
  },
  {
    type: 'storyboard',
    title: '分镜画面拆解',
    desc: '将脚本拆解为多镜头景别、运镜与英文 Prompt',
    group: '处理节点',
    keywords: '分镜 storyboard 拆解 镜头 运镜 prompt',
    icon: GitBranch,
    accent: 'text-amber-600 bg-amber-50',
  },
  {
    type: 'imageGen',
    title: 'AI 生图节点',
    desc: '独立绑定「图片 API」，支持多图出图与选图传下游',
    group: '生成节点',
    keywords: '图片 生图 image flux t2i i2i 封面 主图',
    icon: ImageIcon,
    accent: 'text-indigo-600 bg-indigo-50',
  },
  {
    type: 'videoGen',
    title: 'AI 生视频节点',
    desc: '独立绑定「视频 API」，自动承接上游选定首帧图',
    group: '生成节点',
    keywords: '视频 生视频 video wan kling i2v t2v 分镜成片',
    icon: Film,
    accent: 'text-rose-600 bg-rose-50',
  },
  {
    type: 'resultDisplay',
    title: '结果展示节点',
    desc: '放大检视上游生成的图片、视频或文案，一键下载归档',
    group: '展示节点',
    keywords: '结果 预览 展示 输出 result preview download',
    icon: Eye,
    accent: 'text-cyan-600 bg-cyan-50',
  },
  {
    type: 'productInput',
    title: '产品档案节点',
    desc: '关联产品库，自动向下游注入卖点、痛点与价格',
    group: '输入节点',
    keywords: '产品 商品 卖点 product',
    icon: Package,
    accent: 'text-indigo-600 bg-indigo-50',
  },
  {
    type: 'assetInput',
    title: '参考素材节点',
    desc: '引用云端素材库的图片、视频或参考文案',
    group: '输入节点',
    keywords: '素材 参考图 参考文案 asset',
    icon: FileText,
    accent: 'text-emerald-600 bg-emerald-50',
  },
];

const RECOMMENDED_NEXT: Partial<Record<CanvasNodeKind, CanvasNodeKind[]>> = {
  textNote: ['imageGen', 'videoGen', 'llmFission', 'storyboard'],
  productInput: ['llmFission', 'storyboard', 'imageGen'],
  assetInput: ['imageGen', 'videoGen', 'llmFission'],
  llmFission: ['storyboard', 'imageGen', 'videoGen', 'resultDisplay'],
  storyboard: ['imageGen', 'videoGen', 'resultDisplay'],
  imageGen: ['videoGen', 'resultDisplay', 'imageGen'],
  videoGen: ['resultDisplay'],
  resultDisplay: ['imageGen', 'videoGen'],
};

export interface QuickAddSelection {
  kind: CanvasNodeKind;
  extra?: Partial<CanvasNodeData>;
}

interface QuickAddItem {
  id: string;
  section: string;
  title: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
  badge?: string;
  selection: QuickAddSelection;
}

interface QuickAddMenuProps {
  open: boolean;
  screenX: number;
  screenY: number;
  containerWidth: number;
  containerHeight: number;
  connectFromNodeId?: string | null;
  connectFromKind?: CanvasNodeKind | null;
  connectFromLabel?: string | null;
  products: Product[];
  assets: Asset[];
  onSelect: (selection: QuickAddSelection) => void;
  onClose: () => void;
}

export function QuickAddMenu({
  open,
  screenX,
  screenY,
  containerWidth,
  containerHeight,
  connectFromNodeId,
  connectFromKind,
  connectFromLabel,
  products,
  assets,
  onSelect,
  onClose,
}: QuickAddMenuProps) {
  const [query, setQuery] = useState('');
  const [highlightIndex, setHighlightIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setHighlightIndex(0);
      setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [open, screenX, screenY]);

  useEffect(() => {
    if (!open) return;
    const handleOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    window.addEventListener('mousedown', handleOutside);
    return () => window.removeEventListener('mousedown', handleOutside);
  }, [open, onClose]);

  const items = useMemo<QuickAddItem[]>(() => {
    const kw = query.trim().toLowerCase();
    const list: QuickAddItem[] = [];

    const recommendedKinds = connectFromKind
      ? RECOMMENDED_NEXT[connectFromKind] || []
      : [];

    // When extending from an upstream node, exclude pure input nodes; if from videoGen, only resultDisplay
    const paletteCandidates = connectFromNodeId
      ? connectFromKind === 'videoGen'
        ? CANVAS_NODE_PALETTE.filter((n) => n.type === 'resultDisplay')
        : CANVAS_NODE_PALETTE.filter(
            (n) =>
              n.type !== 'productInput' &&
              n.type !== 'assetInput' &&
              n.type !== 'textNote'
          )
      : CANVAS_NODE_PALETTE;

    const sortedPalette = [...paletteCandidates].sort((a, b) => {
      const ia = recommendedKinds.indexOf(a.type);
      const ib = recommendedKinds.indexOf(b.type);
      if (ia !== -1 && ib !== -1) return ia - ib;
      if (ia !== -1) return -1;
      if (ib !== -1) return 1;
      return 0;
    });

    for (const meta of sortedPalette) {
      if (
        kw &&
        !`${meta.title} ${meta.desc} ${meta.keywords}`.toLowerCase().includes(kw)
      ) {
        continue;
      }
      const isRec = recommendedKinds.includes(meta.type);
      list.push({
        id: `node-${meta.type}`,
        section: isRec && connectFromNodeId ? '推荐下游节点' : 'AI 节点',
        title: meta.title,
        subtitle: meta.desc,
        icon: meta.icon,
        accent: meta.accent,
        badge: isRec && connectFromNodeId ? '推荐衔接' : meta.group,
        selection: { kind: meta.type },
      });
    }

    if (!connectFromNodeId) {
      for (const p of products) {
        if (kw && !`${p.name} ${p.selling_points}`.toLowerCase().includes(kw)) {
          continue;
        }
        list.push({
          id: `prod-${p.id}`,
          section: '直接引入产品档案',
          title: p.name,
          subtitle: p.selling_points || '产品卖点档案',
          icon: Package,
          accent: 'text-indigo-600 bg-indigo-50',
          badge: '产品库',
          selection: {
            kind: 'productInput',
            extra: {
              label: `产品：${p.name.slice(0, 14)}`,
              productId: p.id,
              status: 'done',
            },
          },
        });
      }

      for (const a of assets.slice(0, 12)) {
        if (kw && !`${a.title} ${a.tags.join(' ')}`.toLowerCase().includes(kw)) {
          continue;
        }
        const isMedia = a.asset_type === 'image' || a.asset_type === 'video';
        list.push({
          id: `asset-${a.id}`,
          section: '直接引入云端素材',
          title: a.title,
          subtitle: a.content ? a.content.slice(0, 48) : '媒体素材资产',
          icon: isMedia ? FileImage : Layers,
          accent: 'text-emerald-600 bg-emerald-50',
          badge: a.asset_type,
          selection: {
            kind: 'assetInput',
            extra: {
              label: `素材：${a.title.slice(0, 14)}`,
              assetId: a.id,
              assetTitle: a.title,
              assetType: a.asset_type,
              assetContent: a.content || '',
              assetFileUrl: a.file_url || '',
              status: 'done',
            },
          },
        });
      }
    }

    return list;
  }, [query, connectFromNodeId, connectFromKind, products, assets]);

  useEffect(() => {
    setHighlightIndex(0);
  }, [items.length]);

  if (!open) return null;

  const menuWidth = 340;
  const menuMaxHeight = 420;
  const left = Math.max(
    12,
    Math.min(screenX, Math.max(12, containerWidth - menuWidth - 12))
  );
  const top = Math.max(
    12,
    Math.min(screenY, Math.max(12, containerHeight - menuMaxHeight - 12))
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIndex((i) => (items.length ? (i + 1) % items.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIndex((i) =>
        items.length ? (i - 1 + items.length) % items.length : 0
      );
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = items[highlightIndex];
      if (target) {
        onSelect(target.selection);
      }
    }
  };

  let lastSection = '';

  return (
    <div
      ref={menuRef}
      style={{ left, top, width: menuWidth }}
      onKeyDown={handleKeyDown}
      className="absolute z-40 rounded-2xl border bg-popover/95 backdrop-blur-md shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-100"
    >
      {connectFromNodeId && (
        <div className="flex items-center gap-1.5 bg-primary/10 px-3 py-1.5 text-[11px] font-medium text-primary border-b">
          <ArrowRight className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">
            承接「{connectFromLabel || '上游节点'}」继续延伸下游
          </span>
        </div>
      )}

      <div className="flex items-center gap-2 border-b px-3 py-2">
        <Search className="h-4 w-4 text-muted-foreground shrink-0" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索节点、产品或素材... (↑↓ 选择 / Enter 创建)"
          className="w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground"
        />
        <kbd className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
          ESC
        </kbd>
      </div>

      <div className="max-h-[330px] overflow-y-auto p-1.5 space-y-0.5">
        {items.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground">
            未找到匹配的节点或资产
          </div>
        ) : (
          items.map((item, idx) => {
            const Icon = item.icon;
            const showHeader = item.section !== lastSection;
            lastSection = item.section;
            const isHighlighted = idx === highlightIndex;

            return (
              <React.Fragment key={item.id}>
                {showHeader && (
                  <div className="px-2.5 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {item.section}
                  </div>
                )}
                <button
                  type="button"
                  onMouseEnter={() => setHighlightIndex(idx)}
                  onClick={() => onSelect(item.selection)}
                  className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors ${
                    isHighlighted ? 'bg-accent text-accent-foreground' : 'hover:bg-muted/70'
                  }`}
                >
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${item.accent}`}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs font-semibold">
                        {item.title}
                      </span>
                      {item.badge && (
                        <span className="shrink-0 rounded-full bg-background/80 border px-1.5 py-0.2 text-[10px] text-muted-foreground">
                          {item.badge}
                        </span>
                      )}
                    </div>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {item.subtitle}
                    </p>
                  </div>
                </button>
              </React.Fragment>
            );
          })
        )}
      </div>
    </div>
  );
}
