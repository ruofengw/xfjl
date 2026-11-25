'use client';

import React, { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Copy,
  FolderPlus,
  PenTool,
  RefreshCw,
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
import {
  COPYWRITING_TEMPLATES,
  TARGET_PLATFORMS,
  TONE_STYLES,
} from '@/lib/constants';
import { streamAiChat } from '@/lib/ai-stream';
import { copyToClipboard } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

interface CopyVersionCard {
  id: string;
  title: string;
  content: string;
}

function parseVersions(rawText: string): CopyVersionCard[] {
  const parts = rawText
    .split(/---VERSION---/gi)
    .map((s) => s.trim())
    .filter(Boolean);

  if (parts.length === 0) return [];
  return parts.map((text, idx) => {
    const firstLine = text.split('\n')[0]?.replace(/^[#*【\s]+|[】\s]+$/g, '') || '';
    return {
      id: `ver-${idx}-${Date.now()}`,
      title: firstLine.slice(0, 28) || `文案版本 ${idx + 1}`,
      content: text,
    };
  });
}

function CopywritingWorkbench() {
  const searchParams = useSearchParams();
  const { activeWorkspace, activeWorkspaceId, apiConfigs } = useWorkspace();

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
  const [templateId, setTemplateId] = useState<string>(COPYWRITING_TEMPLATES[0].id);
  const [platform, setPlatform] = useState<string>(TARGET_PLATFORMS[0]);
  const [tone, setTone] = useState<string>(TONE_STYLES[0]);
  const [count, setCount] = useState<number>(2);
  const [extraNote, setExtraNote] = useState('');

  const [generating, setGenerating] = useState(false);
  const [rawStream, setRawStream] = useState('');
  const [versions, setVersions] = useState<CopyVersionCard[]>([]);
  const [rewritingId, setRewritingId] = useState<string | null>(null);

  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [savePayload, setSavePayload] = useState<AssetSavePayload | null>(null);

  useEffect(() => {
    const draft = searchParams.get('draft');
    const pid = searchParams.get('productId');
    if (draft) {
      setExtraNote(draft);
      setTemplateId('rewrite_polish');
    }
    if (pid) setProductId(pid);
  }, [searchParams]);

  useEffect(() => {
    if (activeConfigs.length === 0) return;
    const route = activeWorkspace?.default_routing?.copywriting;
    const cfg = activeConfigs.find((c) => c.id === route?.configId) || activeConfigs[0];
    setConfigId((prev) => (activeConfigs.some((c) => c.id === prev) ? prev : cfg.id));
    setModel((prev) => prev || route?.model || cfg.models[0] || '');
  }, [activeConfigs, activeWorkspace]);

  const handleGenerate = async () => {
    if (!activeWorkspaceId) return;
    const template =
      COPYWRITING_TEMPLATES.find((t) => t.id === templateId) ||
      COPYWRITING_TEMPLATES[0];

    setGenerating(true);
    setRawStream('');
    setVersions([]);

    const systemPrompt = [
      '你是顶级短视频带货与新媒体爆款文案操盘手。',
      `请严格生成 ${count} 个相互独立、可直接复制使用的版本。`,
      '每个版本开头务必单独一行输出 `---VERSION---` 作为分隔标记，然后写出该版本的标题和完整正文。',
    ].join('\n');

    const userPrompt = [
      `创作模板：${template.label}（${template.description}）`,
      `目标平台：${platform}`,
      `语气风格：${tone}`,
      `生成版本数量：${count} 个版本`,
      extraNote.trim() ? `补充要求 / 待改写原稿：\n${extraNote.trim()}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    try {
      const res = await streamAiChat({
        workspaceId: activeWorkspaceId,
        configId: configId || undefined,
        model: model || undefined,
        productId: productId || undefined,
        scene: 'copywriting',
        systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
        onDelta: (_chunk, full) => {
          setRawStream(full);
          const parsed = parseVersions(full);
          if (parsed.length > 0) {
            setVersions(parsed);
          }
        },
      });

      const finalCards = parseVersions(res.content);
      setVersions(
        finalCards.length > 0
          ? finalCards
          : [{ id: `ver-0`, title: '生成结果', content: res.content }]
      );
      toast.success('爆款文案已生成完成');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '生成失败');
    } finally {
      setGenerating(false);
    }
  };

  const handlePartialRewrite = async (card: CopyVersionCard, directive: string) => {
    if (!activeWorkspaceId || rewritingId) return;
    setRewritingId(card.id);
    try {
      const res = await streamAiChat({
        workspaceId: activeWorkspaceId,
        configId: configId || undefined,
        model: model || undefined,
        productId: productId || undefined,
        scene: 'copywriting',
        systemPrompt:
          '请只输出改写润色后的单篇完整文案正文，不要输出多余解释或 ---VERSION--- 分隔符。',
        messages: [
          {
            role: 'user',
            content: `请按「${directive}」的方向局部优化以下文案：\n\n${card.content}`,
          },
        ],
        onDelta: (_chunk, full) => {
          setVersions((prev) =>
            prev.map((v) => (v.id === card.id ? { ...v, content: full } : v))
          );
        },
      });
      setVersions((prev) =>
        prev.map((v) => (v.id === card.id ? { ...v, content: res.content } : v))
      );
      toast.success(`已完成「${directive}」局部重写`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '局部重写失败');
    } finally {
      setRewritingId(null);
    }
  };

  const selectedConfig = activeConfigs.find((c) => c.id === configId);

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <PenTool className="h-6 w-6 text-primary" />
            爆款文案写作工坊
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            关联产品自动注入核心卖点，一次流式产出多版本带货口播稿、种草图文与前 3 秒黄金痛点钩子。
          </p>
        </div>

        <ProductSelector value={productId} onChange={(pid) => setProductId(pid)} />
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        {/* 左侧参数配置区 */}
        <Card className="lg:col-span-4 h-fit">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">创作参数配置</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>写作场景模板</Label>
              <Select value={templateId} onValueChange={setTemplateId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COPYWRITING_TEMPLATES.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                {COPYWRITING_TEMPLATES.find((t) => t.id === templateId)?.description}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <div className="space-y-2">
                <Label>目标平台</Label>
                <Select value={platform} onValueChange={setPlatform}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TARGET_PLATFORMS.map((p) => (
                      <SelectItem key={p} value={p}>
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>语气风格</Label>
                <Select value={tone} onValueChange={setTone}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TONE_STYLES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-3 grid-cols-2">
              <div className="space-y-2">
                <Label>输出版本数</Label>
                <Select
                  value={String(count)}
                  onValueChange={(v) => setCount(Number(v))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 个版本</SelectItem>
                    <SelectItem value="2">2 个版本</SelectItem>
                    <SelectItem value="3">3 个版本</SelectItem>
                    <SelectItem value="4">4 个版本</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>使用模型</Label>
                {activeConfigs.length > 0 ? (
                  <Select
                    value={model}
                    onValueChange={(m) => setModel(m)}
                  >
                    <SelectTrigger className="font-mono text-xs">
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
                ) : (
                  <div className="h-9 flex items-center rounded-md border px-2.5 text-xs text-muted-foreground bg-muted/40">
                    演示模式
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="copy-extra">补充要求 / 待改写草稿（选填）</Label>
              <Textarea
                id="copy-extra"
                rows={4}
                value={extraNote}
                onChange={(e) => setExtraNote(e.target.value)}
                placeholder="输入特定活动节点（如618预热）、目标时长（如30秒口播）或贴入旧文案进行改写..."
              />
            </div>

            <Button
              className="w-full"
              onClick={handleGenerate}
              disabled={generating}
            >
              <Sparkles className="h-4 w-4" />
              {generating ? '正在流式创作中...' : '立即生成多版本文案'}
            </Button>
          </CardContent>
        </Card>

        {/* 右侧多版本结果卡片区 */}
        <div className="lg:col-span-8 space-y-4">
          {versions.length === 0 && !generating ? (
            <Card className="border-dashed h-full min-h-[420px] flex items-center justify-center">
              <CardContent className="text-center space-y-3 py-12">
                <Wand2 className="h-9 w-9 mx-auto text-muted-foreground/60" />
                <div className="text-sm font-medium">配置左侧参数后点击「立即生成」</div>
                <p className="text-xs text-muted-foreground max-w-md">
                  系统会流式拆分为多个独立结果卡片，每张卡片均可直接修改正文、一键局部润色或归档至云端素材库。
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              {generating && versions.length === 0 && (
                <Card>
                  <CardContent className="p-5 text-sm text-muted-foreground whitespace-pre-wrap">
                    {rawStream || '正在连接模型流式生成多版本爆款文案...'}
                  </CardContent>
                </Card>
              )}

              {versions.map((card, index) => (
                <Card key={card.id} className="overflow-hidden">
                  <CardHeader className="pb-3 bg-muted/20 border-b">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Badge>版本 {index + 1}</Badge>
                        <CardTitle className="text-sm font-semibold">
                          {card.title}
                        </CardTitle>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          disabled={Boolean(rewritingId)}
                          onClick={() => handlePartialRewrite(card, '更有紧迫感与转化力')}
                        >
                          <RefreshCw
                            className={`h-3 w-3 ${
                              rewritingId === card.id ? 'animate-spin' : ''
                            }`}
                          />
                          更紧迫
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          disabled={Boolean(rewritingId)}
                          onClick={() => handlePartialRewrite(card, '精简到150字以内')}
                        >
                          精简
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => {
                            copyToClipboard(card.content);
                            toast.success('已复制该版本文案');
                          }}
                        >
                          <Copy className="h-3 w-3" />
                          复制
                        </Button>
                        <Button
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => {
                            setSavePayload({
                              title: `${platform} - ${card.title}`,
                              assetType: 'copywriting',
                              productId: productId || null,
                              content: card.content,
                              tags: [platform, tone],
                              generationMeta: {
                                model,
                                source_scene: 'copywriting',
                              },
                            });
                            setSaveDialogOpen(true);
                          }}
                        >
                          <FolderPlus className="h-3 w-3" />
                          存入素材库
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4">
                    <Textarea
                      rows={7}
                      value={card.content}
                      onChange={(e) => {
                        const val = e.target.value;
                        setVersions((prev) =>
                          prev.map((v) =>
                            v.id === card.id ? { ...v, content: val } : v
                          )
                        );
                      }}
                      className="text-sm leading-relaxed border-0 shadow-none focus-visible:ring-0 p-0 resize-y"
                    />
                  </CardContent>
                </Card>
              ))}
            </>
          )}
        </div>
      </div>

      <AssetSaveDialog
        open={saveDialogOpen}
        onOpenChange={setSaveDialogOpen}
        initialData={savePayload}
      />
    </div>
  );
}

export default function CopywritingPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-muted-foreground">正在加载文案写作工坊...</div>}>
      <CopywritingWorkbench />
    </Suspense>
  );
}
