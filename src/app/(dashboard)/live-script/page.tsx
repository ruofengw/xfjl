'use client';

import React, { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  FolderPlus,
  Mic2,
  MonitorPlay,
  Plus,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Wand2,
} from 'lucide-react';
import { toast } from 'sonner';
import { useWorkspace } from '@/components/providers/workspace-provider';
import { ProductSelector } from '@/components/product-selector/product-selector';
import {
  AssetSaveDialog,
  type AssetSavePayload,
} from '@/components/asset-save-dialog/asset-save-dialog';
import { Teleprompter } from '@/components/teleprompter/teleprompter';
import { LIVE_SCRIPT_SECTION_DEFS } from '@/lib/constants';
import { streamAiChat } from '@/lib/ai-stream';
import {
  detectBannedWords,
  replaceBannedWordsInText,
  type BannedWordMatch,
} from '@/lib/banned-words';
import { copyToClipboard } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

type SectionKey = (typeof LIVE_SCRIPT_SECTION_DEFS)[number]['key'];

function parseStructuredSections(raw: string): Partial<Record<SectionKey, string>> {
  const result: Partial<Record<SectionKey, string>> = {};
  const keys: SectionKey[] = ['hook', 'pain', 'selling', 'closing', 'qa'];

  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    const startMarker = `[SECTION:${k}]`;
    const startIdx = raw.indexOf(startMarker);
    if (startIdx === -1) continue;

    let endIdx = raw.length;
    for (let j = i + 1; j < keys.length; j++) {
      const nextIdx = raw.indexOf(`[SECTION:${keys[j]}]`, startIdx + startMarker.length);
      if (nextIdx !== -1) {
        endIdx = nextIdx;
        break;
      }
    }
    result[k] = raw.slice(startIdx + startMarker.length, endIdx).trim();
  }
  return result;
}

function HighlightedPreview({
  text,
  matches,
}: {
  text: string;
  matches: BannedWordMatch[];
}) {
  if (!text) return null;
  if (matches.length === 0) {
    return <p className="text-xs text-muted-foreground whitespace-pre-wrap">{text}</p>;
  }

  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  matches.forEach((m, idx) => {
    if (m.index > cursor) {
      nodes.push(<span key={`t-${idx}`}>{text.slice(cursor, m.index)}</span>);
    }
    nodes.push(
      <mark
        key={`m-${idx}`}
        className="rounded bg-rose-100 px-1 py-0.5 font-semibold text-rose-700 underline decoration-rose-500 decoration-wavy"
        title={`${m.category} · 建议替换为「${m.suggestion}」`}
      >
        {text.slice(m.index, m.index + m.length)}
      </mark>
    );
    cursor = m.index + m.length;
  });
  if (cursor < text.length) {
    nodes.push(<span key="tail">{text.slice(cursor)}</span>);
  }

  return (
    <div className="rounded-md border border-rose-200 bg-rose-50/40 p-2.5 text-xs leading-relaxed whitespace-pre-wrap">
      {nodes}
    </div>
  );
}

function LiveScriptWorkbench() {
  const searchParams = useSearchParams();
  const {
    activeWorkspace,
    activeWorkspaceId,
    apiConfigs,
    products,
    refreshWorkspaces,
  } = useWorkspace();

  const activeConfigs = useMemo(
    () =>
      apiConfigs.filter(
        (c) => c.is_active && c.api_type === 'text' && (c.models || []).length > 0
      ),
    [apiConfigs]
  );

  const [productId, setProductId] = useState('');
  const [configId, setConfigId] = useState('');
  const [model, setModel] = useState('');
  const [liveStyle, setLiveStyle] = useState('热情互动逼单风');
  const [extraNote, setExtraNote] = useState('');

  const [sections, setSections] = useState<Record<SectionKey, string>>({
    hook: '',
    pain: '',
    selling: '',
    closing: '',
    qa: '',
  });

  const [generating, setGenerating] = useState(false);
  const [regeneratingKey, setRegeneratingKey] = useState<SectionKey | null>(null);
  const [teleprompterOpen, setTeleprompterOpen] = useState(false);

  const [customWordInput, setCustomWordInput] = useState('');
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [savePayload, setSavePayload] = useState<AssetSavePayload | null>(null);

  useEffect(() => {
    const draft = searchParams.get('draft');
    const pid = searchParams.get('productId');
    if (draft) setExtraNote(draft);
    if (pid) setProductId(pid);
  }, [searchParams]);

  useEffect(() => {
    if (activeConfigs.length === 0) return;
    const route = activeWorkspace?.default_routing?.live_script;
    const cfg = activeConfigs.find((c) => c.id === route?.configId) || activeConfigs[0];
    setConfigId((prev) => (activeConfigs.some((c) => c.id === prev) ? prev : cfg.id));
    setModel((prev) => prev || route?.model || cfg.models[0] || '');
  }, [activeConfigs, activeWorkspace]);

  const selectedProduct = useMemo(
    () => products.find((p) => p.id === productId) || null,
    [products, productId]
  );

  const combinedExtraBannedWords = useMemo(() => {
    return [
      ...(selectedProduct?.banned_words || []),
      ...(activeWorkspace?.custom_banned_words || []),
    ];
  }, [selectedProduct, activeWorkspace]);

  const sectionMatches = useMemo(() => {
    const map: Record<SectionKey, BannedWordMatch[]> = {
      hook: detectBannedWords(sections.hook, combinedExtraBannedWords),
      pain: detectBannedWords(sections.pain, combinedExtraBannedWords),
      selling: detectBannedWords(sections.selling, combinedExtraBannedWords),
      closing: detectBannedWords(sections.closing, combinedExtraBannedWords),
      qa: detectBannedWords(sections.qa, combinedExtraBannedWords),
    };
    return map;
  }, [sections, combinedExtraBannedWords]);

  const allHits = useMemo(() => {
    return Object.entries(sectionMatches).flatMap(([secKey, matches]) =>
      matches.map((m) => ({ ...m, sectionKey: secKey as SectionKey }))
    );
  }, [sectionMatches]);

  const handleGenerateAll = async () => {
    if (!activeWorkspaceId) return;
    setGenerating(true);

    const systemPrompt = [
      '你是头部直播间金牌控场与主播话术策划师。',
      '请严格按照以下 5 个分段标记顺序输出主播口播话术，每段必须独占一行输出标记：',
      '[SECTION:hook]',
      '[SECTION:pain]',
      '[SECTION:selling]',
      '[SECTION:closing]',
      '[SECTION:qa]',
      '要求：口语化、有节奏感、适合主播对着提词器直接张嘴念；主动规避“全网最低、第一、永久、根治”等广告法违禁词。',
    ].join('\n');

    const userPrompt = [
      `直播间人设/风格：${liveStyle}`,
      extraNote.trim() ? `补充背景或参考内容：\n${extraNote.trim()}` : '',
      '请生成完整 5 段式结构化直播话术。',
    ]
      .filter(Boolean)
      .join('\n');

    try {
      const res = await streamAiChat({
        workspaceId: activeWorkspaceId,
        configId: configId || undefined,
        model: model || undefined,
        productId: productId || undefined,
        scene: 'live_script',
        systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
        onDelta: (_chunk, full) => {
          const parsed = parseStructuredSections(full);
          if (Object.keys(parsed).length > 0) {
            setSections((prev) => ({
              hook: parsed.hook ?? prev.hook,
              pain: parsed.pain ?? prev.pain,
              selling: parsed.selling ?? prev.selling,
              closing: parsed.closing ?? prev.closing,
              qa: parsed.qa ?? prev.qa,
            }));
          }
        },
      });

      const finalParsed = parseStructuredSections(res.content);
      if (Object.keys(finalParsed).length > 0) {
        setSections((prev) => ({
          hook: finalParsed.hook ?? prev.hook,
          pain: finalParsed.pain ?? prev.pain,
          selling: finalParsed.selling ?? prev.selling,
          closing: finalParsed.closing ?? prev.closing,
          qa: finalParsed.qa ?? prev.qa,
        }));
      } else {
        setSections((prev) => ({ ...prev, hook: res.content }));
      }
      toast.success('5 段式结构化主播话术已生成');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '生成失败');
    } finally {
      setGenerating(false);
    }
  };

  const handleRegenerateSection = async (key: SectionKey, title: string) => {
    if (!activeWorkspaceId || regeneratingKey) return;
    setRegeneratingKey(key);
    try {
      const res = await streamAiChat({
        workspaceId: activeWorkspaceId,
        configId: configId || undefined,
        model: model || undefined,
        productId: productId || undefined,
        scene: 'live_script',
        systemPrompt:
          '请只输出这一段主播直接口播的纯文本话术，不要包含任何 [SECTION:...] 标记或多余解释，注意规避广告法极限违禁词。',
        messages: [
          {
            role: 'user',
            content: `请重写优化直播话术中的「${title}」模块（风格：${liveStyle}）。当前草稿供参考：\n${
              sections[key] || '（暂无，请全新创作）'
            }`,
          },
        ],
        onDelta: (_chunk, full) => {
          setSections((prev) => ({ ...prev, [key]: full }));
        },
      });
      setSections((prev) => ({ ...prev, [key]: res.content }));
      toast.success(`已刷新「${title}」`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '单段生成失败');
    } finally {
      setRegeneratingKey(null);
    }
  };

  const handleOneClickFixAll = () => {
    let totalReplaced = 0;
    const next = { ...sections };
    (Object.keys(next) as SectionKey[]).forEach((k) => {
      const res = replaceBannedWordsInText(next[k], combinedExtraBannedWords);
      next[k] = res.nextText;
      totalReplaced += res.replacedCount;
    });
    setSections(next);
    if (totalReplaced > 0) {
      toast.success(`已一键合规替换 ${totalReplaced} 处违禁敏感词`);
    } else {
      toast.info('当前话术未检测到违禁词');
    }
  };

  const handleAddCustomBannedWord = async (e: React.FormEvent) => {
    e.preventDefault();
    const word = customWordInput.trim();
    if (!word || !activeWorkspaceId) return;
    const current = activeWorkspace?.custom_banned_words || [];
    if (current.includes(word)) {
      toast.info('该词汇已在自定义词库中');
      return;
    }
    const nextWords = [...current, word];
    const res = await fetch('/api/workspaces', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspaceId: activeWorkspaceId,
        custom_banned_words: nextWords,
      }),
    });
    if (res.ok) {
      setCustomWordInput('');
      toast.success(`已将「${word}」加入工作空间违禁词库`);
      await refreshWorkspaces();
    }
  };

  const combinedFullScript = LIVE_SCRIPT_SECTION_DEFS.map(
    (def, idx) =>
      `【${idx + 1}. ${def.title}】\n${sections[def.key]?.trim() || '（待补充）'}`
  ).join('\n\n');

  const selectedConfig = activeConfigs.find((c) => c.id === configId);

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Mic2 className="h-6 w-6 text-primary" />
            主播话术工坊 & 全屏提词器
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            结构化 5 段直播节奏输出、实时广告法违禁词标红替换，一键开启沉浸式全屏滚动提词器直接上播。
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setSavePayload({
                title: `${selectedProduct?.name || '直播间'} 5段式话术包`,
                assetType: 'script',
                productId: productId || null,
                content: combinedFullScript,
                tags: ['主播话术', liveStyle],
                generationMeta: { model, source_scene: 'live_script' },
              });
              setSaveDialogOpen(true);
            }}
          >
            <FolderPlus className="h-4 w-4" />
            整套存入素材库
          </Button>
          <Button
            onClick={() => setTeleprompterOpen(true)}
            className="bg-zinc-900 text-white hover:bg-zinc-800"
          >
            <MonitorPlay className="h-4 w-4" />
            开启全屏提词器
          </Button>
        </div>
      </div>

      {/* 顶部控制条 */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <ProductSelector value={productId} onChange={(pid) => setProductId(pid)} />

            <div className="flex flex-wrap items-center gap-2">
              <Select value={liveStyle} onValueChange={setLiveStyle}>
                <SelectTrigger className="h-8 w-[160px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="热情互动逼单风">热情互动逼单风</SelectItem>
                  <SelectItem value="专业成分党测评风">专业成分党测评风</SelectItem>
                  <SelectItem value="闺蜜聊天自然种草风">闺蜜聊天自然种草风</SelectItem>
                  <SelectItem value="高端品牌专柜讲解风">高端品牌专柜讲解风</SelectItem>
                </SelectContent>
              </Select>

              {activeConfigs.length > 0 && (
                <Select value={model} onValueChange={setModel}>
                  <SelectTrigger className="h-8 w-[165px] text-xs font-mono">
                    <SelectValue placeholder="选择模型" />
                  </SelectTrigger>
                  <SelectContent>
                    {(selectedConfig?.models || []).map((m) => (
                      <SelectItem key={m} value={m} className="font-mono text-xs">
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              <Button size="sm" onClick={handleGenerateAll} disabled={generating}>
                <Sparkles className="h-3.5 w-3.5" />
                {generating ? '生成中...' : 'AI 生成 5 段式话术'}
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Input
              placeholder="补充播前背景/草稿（例如：本场主打买一送一库存只有200单，可结合上面导入的草稿生成）..."
              value={extraNote}
              onChange={(e) => setExtraNote(e.target.value)}
              className="text-xs flex-1 min-w-[240px]"
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-12">
        {/* 左侧 5 段式结构化卡片编辑区 */}
        <div className="lg:col-span-8 space-y-4">
          {LIVE_SCRIPT_SECTION_DEFS.map((def, idx) => {
            const text = sections[def.key] || '';
            const matches = sectionMatches[def.key];

            return (
              <Card key={def.key}>
                <CardHeader className="pb-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className="rounded-md">{idx + 1}</Badge>
                      <CardTitle className="text-base">{def.title}</CardTitle>
                      <span className="text-xs text-muted-foreground">{def.badge}</span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {matches.length > 0 ? (
                        <Badge variant="destructive" className="text-[11px]">
                          命中 {matches.length} 处违禁词
                        </Badge>
                      ) : (
                        text.trim() && (
                          <Badge
                            variant="outline"
                            className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[11px]"
                          >
                            合规通过
                          </Badge>
                        )
                      )}

                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs"
                        disabled={Boolean(regeneratingKey)}
                        onClick={() => handleRegenerateSection(def.key, def.title)}
                      >
                        <RefreshCw
                          className={`h-3 w-3 ${
                            regeneratingKey === def.key ? 'animate-spin' : ''
                          }`}
                        />
                        重写本段
                      </Button>

                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs"
                        onClick={() => {
                          copyToClipboard(text);
                          toast.success(`已复制「${def.title}」`);
                        }}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-2.5">
                  <Textarea
                    rows={4}
                    value={text}
                    placeholder={def.placeholder}
                    onChange={(e) =>
                      setSections((prev) => ({ ...prev, [def.key]: e.target.value }))
                    }
                    className="text-sm leading-relaxed"
                  />

                  {matches.length > 0 && (
                    <div className="space-y-1">
                      <div className="text-[11px] font-medium text-rose-600 flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        违禁词标红实时预览（鼠标悬停查看替换建议）：
                      </div>
                      <HighlightedPreview text={text} matches={matches} />
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* 右侧实时合规检测与自定义词库面板 */}
        <div className="lg:col-span-4 space-y-4">
          <Card className="sticky top-4">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-rose-600" />
                  实时违禁词检测中心
                </CardTitle>
                <Badge variant={allHits.length > 0 ? 'destructive' : 'secondary'}>
                  {allHits.length} 处风险
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {allHits.length === 0 ? (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-4 text-center space-y-1.5">
                  <CheckCircle2 className="h-6 w-6 mx-auto text-emerald-600" />
                  <div className="text-sm font-medium text-emerald-800">
                    暂未检测到高风险违禁词
                  </div>
                  <p className="text-xs text-emerald-700/80">
                    已实时比对广告法极限词库、产品专属词与你的自定义敏感词。
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <Button
                    size="sm"
                    className="w-full"
                    variant="destructive"
                    onClick={handleOneClickFixAll}
                  >
                    <Wand2 className="h-3.5 w-3.5" />
                    一键全部合规替换（{allHits.length} 处）
                  </Button>

                  <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
                    {allHits.map((hit, idx) => (
                      <div
                        key={`${hit.word}-${hit.index}-${idx}`}
                        className="rounded-lg border border-rose-200 bg-rose-50/40 p-2.5 text-xs space-y-1"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-rose-700">
                            「{hit.word}」
                          </span>
                          <Badge variant="outline" className="text-[10px]">
                            {hit.category}
                          </Badge>
                        </div>
                        <div className="text-muted-foreground">
                          建议替换为：
                          <span className="font-medium text-emerald-700">
                            {hit.suggestion}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="border-t pt-4 space-y-2.5">
                <Label className="text-xs font-semibold">
                  补充工作空间自定义违禁词库
                </Label>
                <form onSubmit={handleAddCustomBannedWord} className="flex gap-2">
                  <Input
                    value={customWordInput}
                    onChange={(e) => setCustomWordInput(e.target.value)}
                    placeholder="输入自定义禁词，如 网红同款"
                    className="h-8 text-xs"
                  />
                  <Button size="sm" type="submit" variant="outline" className="h-8">
                    <Plus className="h-3.5 w-3.5" />
                    添加
                  </Button>
                </form>

                {combinedExtraBannedWords.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {combinedExtraBannedWords.map((w) => (
                      <Badge
                        key={w}
                        variant="outline"
                        className="text-[10px] bg-muted/50"
                      >
                        {w}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Teleprompter
        open={teleprompterOpen}
        onClose={() => setTeleprompterOpen(false)}
        productName={selectedProduct?.name}
        sections={LIVE_SCRIPT_SECTION_DEFS.map((d) => ({
          key: d.key,
          title: d.title,
          content: sections[d.key] || '',
        }))}
      />

      <AssetSaveDialog
        open={saveDialogOpen}
        onOpenChange={setSaveDialogOpen}
        initialData={savePayload}
      />
    </div>
  );
}

export default function LiveScriptPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-muted-foreground">正在加载主播话术工坊...</div>}>
      <LiveScriptWorkbench />
    </Suspense>
  );
}
