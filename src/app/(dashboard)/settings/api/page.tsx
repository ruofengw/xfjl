'use client';

import React, { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Activity,
  CheckCircle2,
  CloudDownload,
  Edit3,
  Film,
  Image as ImageIcon,
  KeyRound,
  Lock,
  MessageSquare,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Trash2,
  Users,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { useWorkspace } from '@/components/providers/workspace-provider';
import {
  IMAGE_PROVIDER_PRESETS,
  TEXT_PROVIDER_PRESETS,
  VIDEO_PROVIDER_PRESETS,
  type ProviderPreset,
} from '@/lib/constants';
import type {
  ApiCategory,
  ApiConfigPublic,
  ApiProtocol,
  ApiProvider,
  ApiScope,
  DefaultRouting,
} from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface TestResultState {
  loading: boolean;
  ok?: boolean;
  ttfbMs?: number;
  message?: string;
  error?: string;
}

const TAB_META: Record<
  ApiCategory,
  {
    label: string;
    subtitle: string;
    emptyTitle: string;
    emptyHint: string;
    icon: React.ComponentType<{ className?: string }>;
    accentClass: string;
    badgeClass: string;
    presets: ProviderPreset[];
  }
> = {
  image: {
    label: '图片 API',
    subtitle: '仅供「图片生成页」与「画布图片节点」调用，与视频 / 文本 API 彻底隔离',
    emptyTitle: '尚未配置任何图片 API',
    emptyHint: '添加硅基流动 FLUX、即梦、OpenAI Images 等生图接口后即可在图片生成与画布中调用',
    icon: ImageIcon,
    accentClass: 'text-indigo-600 bg-indigo-50 border-indigo-200',
    badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    presets: IMAGE_PROVIDER_PRESETS,
  },
  video: {
    label: '视频 API',
    subtitle: '仅供「视频生成页」与「画布视频节点」调用，独立异步提交与轮询通道',
    emptyTitle: '尚未配置任何视频 API',
    emptyHint: '添加可灵、硅基流动 Wan/CogVideoX、即梦视频等异步视频接口后即可调用',
    icon: Film,
    accentClass: 'text-violet-600 bg-violet-50 border-violet-200',
    badgeClass: 'bg-violet-50 text-violet-700 border-violet-200',
    presets: VIDEO_PROVIDER_PRESETS,
  },
  text: {
    label: '文本 / LLM API',
    subtitle: '仅供「AI 对话」「爆款文案」「主播话术」「画布裂变节点」调用',
    emptyTitle: '尚未配置任何文本大模型 API',
    emptyHint: '添加 DeepSeek、Kimi、Qwen、OpenAI 等对话模型后即可开启流式文案创作',
    icon: MessageSquare,
    accentClass: 'text-emerald-600 bg-emerald-50 border-emerald-200',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    presets: TEXT_PROVIDER_PRESETS,
  },
};

const TEXT_SCENES: Array<{ key: 'chat' | 'copywriting' | 'live_script'; title: string; hint: string }> = [
  { key: 'chat', title: 'AI 对话工作台', hint: '推荐 Kimi 长文本或 DeepSeek' },
  { key: 'copywriting', title: '爆款文案写作', hint: '推荐 DeepSeek-V3 / R1' },
  { key: 'live_script', title: '主播话术工坊', hint: '推荐 DeepSeek / Kimi' },
];

function parseModelInput(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(/[,，\n]/)
        .map((s) => s.trim())
        .filter(Boolean)
    )
  );
}

function getCategoryModels(cfg: ApiConfigPublic): string[] {
  if (cfg.api_type === 'image') return cfg.image_models || [];
  if (cfg.api_type === 'video') return cfg.video_models || [];
  return cfg.models || [];
}

function ApiSettingsContent() {
  const searchParams = useSearchParams();
  const {
    activeWorkspace,
    activeWorkspaceId,
    apiConfigs,
    refreshApiConfigs,
    refreshWorkspaces,
  } = useWorkspace();

  const initialTab = useMemo<ApiCategory>(() => {
    const raw = searchParams.get('tab');
    if (raw === 'image' || raw === 'video' || raw === 'text') return raw;
    return 'image';
  }, [searchParams]);

  const [activeTab, setActiveTab] = useState<ApiCategory>(initialTab);

  useEffect(() => {
    const raw = searchParams.get('tab');
    if (raw === 'image' || raw === 'video' || raw === 'text') {
      setActiveTab(raw);
    }
  }, [searchParams]);

  // Modal state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formApiType, setFormApiType] = useState<ApiCategory>('image');
  const [provider, setProvider] = useState<ApiProvider>('siliconflow');
  const [protocol, setProtocol] = useState<ApiProtocol>('openai');
  const [scope, setScope] = useState<ApiScope>('workspace');
  const [displayName, setDisplayName] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [modelsInput, setModelsInput] = useState('');
  const [isDefault, setIsDefault] = useState(false);

  // Protocol / endpoint extra_config fields
  const [imageEndpointPath, setImageEndpointPath] = useState('/images/generations');
  const [videoSubmitPath, setVideoSubmitPath] = useState('/video/submit');
  const [videoStatusPath, setVideoStatusPath] = useState('/video/status');
  const [saving, setSaving] = useState(false);

  // Remote model fetching state inside modal
  const [fetchingModels, setFetchingModels] = useState(false);
  const [fetchedMatched, setFetchedMatched] = useState<string[]>([]);
  const [fetchedAll, setFetchedAll] = useState<string[]>([]);
  const [showAllFetched, setShowAllFetched] = useState(false);
  const [fetchedFilter, setFetchedFilter] = useState('');

  // Quick sync & test per card
  const [syncingCardId, setSyncingCardId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, TestResultState>>({});
  const [modalTest, setModalTest] = useState<TestResultState>({ loading: false });

  // Delete confirmation dialog
  const [deleteTarget, setDeleteTarget] = useState<ApiConfigPublic | null>(null);
  const [deleting, setDeleting] = useState(false);

  const counts = useMemo(
    () => ({
      image: apiConfigs.filter((c) => c.api_type === 'image').length,
      video: apiConfigs.filter((c) => c.api_type === 'video').length,
      text: apiConfigs.filter((c) => c.api_type === 'text').length,
    }),
    [apiConfigs]
  );

  const tabConfigs = useMemo(
    () => apiConfigs.filter((c) => c.api_type === activeTab),
    [apiConfigs, activeTab]
  );

  const activeTextConfigs = useMemo(
    () =>
      apiConfigs.filter(
        (c) => c.is_active && c.api_type === 'text' && (c.models || []).length > 0
      ),
    [apiConfigs]
  );

  const tabMeta = TAB_META[activeTab];
  const TabIcon = tabMeta.icon;

  const selectedModelList = useMemo(() => parseModelInput(modelsInput), [modelsInput]);

  const displayedCatalog = useMemo(() => {
    const source = showAllFetched ? fetchedAll : fetchedMatched;
    const kw = fetchedFilter.trim().toLowerCase();
    if (!kw) return source;
    return source.filter((id) => id.toLowerCase().includes(kw));
  }, [showAllFetched, fetchedAll, fetchedMatched, fetchedFilter]);

  const resetFetchState = () => {
    setFetchedMatched([]);
    setFetchedAll([]);
    setShowAllFetched(false);
    setFetchedFilter('');
    setModalTest({ loading: false });
  };

  const openCreateFromPreset = (preset: ProviderPreset) => {
    setEditingId(null);
    setFormApiType(preset.apiType);
    setProvider(preset.provider);
    setProtocol(preset.protocol);
    setScope('workspace');
    setDisplayName(preset.displayName);
    setBaseUrl(preset.baseUrl);
    setApiKey('');
    const presetModels =
      preset.apiType === 'image'
        ? preset.defaultImageModels
        : preset.apiType === 'video'
          ? preset.defaultVideoModels
          : preset.defaultModels;
    setModelsInput(presetModels.join(', '));
    setIsDefault(counts[preset.apiType] === 0);
    setImageEndpointPath(preset.imageEndpointPath || '/images/generations');
    setVideoSubmitPath(preset.videoSubmitPath || '/video/submit');
    setVideoStatusPath(preset.videoStatusPath || '/video/status');
    resetFetchState();
    setDialogOpen(true);
  };

  const openEdit = (cfg: ApiConfigPublic) => {
    setEditingId(cfg.id);
    setFormApiType(cfg.api_type);
    setProvider(cfg.provider);
    setProtocol(cfg.protocol || 'openai');
    setScope(cfg.scope);
    setDisplayName(cfg.display_name);
    setBaseUrl(cfg.base_url);
    setApiKey('');
    setModelsInput(getCategoryModels(cfg).join(', '));
    setIsDefault(Boolean(cfg.is_default));
    setImageEndpointPath(cfg.extra_config?.imageEndpointPath || '/images/generations');
    setVideoSubmitPath(cfg.extra_config?.videoSubmitPath || '/video/submit');
    setVideoStatusPath(cfg.extra_config?.videoStatusPath || '/video/status');
    resetFetchState();
    setDialogOpen(true);
  };

  const handleToggleModel = (modelId: string) => {
    const current = parseModelInput(modelsInput);
    const next = current.includes(modelId)
      ? current.filter((m) => m !== modelId)
      : [...current, modelId];
    setModelsInput(next.join(', '));
  };

  const handleFetchModelsInModal = async () => {
    if (!baseUrl.trim()) {
      toast.error('请先填写 Base URL');
      return;
    }
    if (!apiKey.trim() && !editingId) {
      toast.error('请先填写 API Key 再获取模型列表');
      return;
    }
    setFetchingModels(true);
    try {
      const res = await fetch('/api/ai/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          configId: editingId || undefined,
          base_url: baseUrl.trim(),
          api_key: apiKey.trim() || undefined,
          api_type: formApiType,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        toast.error(data.error || '获取模型列表失败');
        return;
      }

      const allIds: string[] = Array.isArray(data.allModels) ? data.allModels : [];
      const matchedIds: string[] =
        formApiType === 'image'
          ? Array.isArray(data.imageModels)
            ? data.imageModels
            : []
          : formApiType === 'video'
            ? Array.isArray(data.videoModels)
              ? data.videoModels
              : []
            : Array.isArray(data.models)
              ? data.models
              : [];

      setFetchedAll(allIds);
      setFetchedMatched(matchedIds.length > 0 ? matchedIds : allIds);
      setShowAllFetched(matchedIds.length === 0);

      // If input currently empty, auto-populate top matched models
      if (parseModelInput(modelsInput).length === 0 && matchedIds.length > 0) {
        setModelsInput(matchedIds.slice(0, 6).join(', '));
      }

      toast.success(
        `已拉取 ${allIds.length} 个模型，智能匹配到 ${matchedIds.length} 个${TAB_META[formApiType].label}模型`
      );
    } catch {
      toast.error('网络错误，无法拉取上游模型');
    } finally {
      setFetchingModels(false);
    }
  };

  const handleTestInModal = async () => {
    if (!baseUrl.trim() || (!apiKey.trim() && !editingId)) {
      toast.error('请填写 Base URL 和 API Key 后再测试连接');
      return;
    }
    setModalTest({ loading: true });
    try {
      const parsed = parseModelInput(modelsInput);
      const res = await fetch('/api/ai/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          configId: !apiKey.trim() && editingId ? editingId : undefined,
          base_url: baseUrl.trim(),
          api_key: apiKey.trim() || undefined,
          api_type: formApiType,
          protocol,
          model: parsed[0] || undefined,
          extra_config: {
            imageEndpointPath,
            videoSubmitPath,
            videoStatusPath,
          },
        }),
      });
      const data = await res.json();
      setModalTest({
        loading: false,
        ok: Boolean(data.ok),
        ttfbMs: data.ttfbMs,
        message: data.message,
        error: data.error,
      });
      if (data.ok) toast.success(data.message || '连接测试成功');
      else toast.error(data.error || '连接测试失败');
    } catch {
      setModalTest({ loading: false, ok: false, error: '测试请求发送失败' });
    }
  };

  const handleSave = async () => {
    if (!activeWorkspaceId) {
      toast.error('未检测到当前工作空间');
      return;
    }
    if (!displayName.trim() || !baseUrl.trim()) {
      toast.error('请填写渠道名称和 Base URL');
      return;
    }
    if (!editingId && !apiKey.trim()) {
      toast.error('新建渠道必须填写 API Key');
      return;
    }

    const parsedModels = parseModelInput(modelsInput);
    if (parsedModels.length === 0) {
      toast.error('请至少添加 1 个可用模型 ID');
      return;
    }

    setSaving(true);
    try {
      const extra_config =
        formApiType === 'image'
          ? { imageEndpointPath: imageEndpointPath.trim() || '/images/generations' }
          : formApiType === 'video'
            ? {
                videoSubmitPath: videoSubmitPath.trim() || '/video/submit',
                videoStatusPath: videoStatusPath.trim() || '/video/status',
              }
            : {};

      const payload: Record<string, unknown> = {
        workspace_id: activeWorkspaceId,
        scope,
        api_type: formApiType,
        protocol,
        provider,
        display_name: displayName.trim(),
        base_url: baseUrl.trim().replace(/\/+$/, ''),
        models: formApiType === 'text' ? parsedModels : [],
        image_models: formApiType === 'image' ? parsedModels : [],
        video_models: formApiType === 'video' ? parsedModels : [],
        extra_config,
        is_default: isDefault,
      };
      if (apiKey.trim()) {
        payload.api_key = apiKey.trim();
      }

      const res = await fetch(
        editingId ? `/api/api-configs/${editingId}` : '/api/api-configs',
        {
          method: editingId ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || '保存失败');
        return;
      }

      toast.success(
        editingId
          ? `${TAB_META[formApiType].label}配置已更新`
          : `已安全加密保存 ${TAB_META[formApiType].label}`
      );
      setDialogOpen(false);
      await refreshApiConfigs();
    } catch {
      toast.error('网络错误，保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleTestCard = async (cfg: ApiConfigPublic) => {
    setTestResults((prev) => ({ ...prev, [cfg.id]: { loading: true } }));
    try {
      const res = await fetch('/api/ai/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ configId: cfg.id }),
      });
      const data = await res.json();
      setTestResults((prev) => ({
        ...prev,
        [cfg.id]: {
          loading: false,
          ok: Boolean(data.ok),
          ttfbMs: data.ttfbMs,
          message: data.message,
          error: data.error,
        },
      }));
      if (data.ok) {
        toast.success(`${cfg.display_name}: ${data.message}`);
      } else {
        toast.error(`${cfg.display_name}: ${data.error || '连接失败'}`);
      }
      await refreshApiConfigs();
    } catch {
      setTestResults((prev) => ({
        ...prev,
        [cfg.id]: { loading: false, ok: false, error: '请求测试接口失败' },
      }));
    }
  };

  const handleSyncCardModels = async (cfg: ApiConfigPublic) => {
    setSyncingCardId(cfg.id);
    try {
      const res = await fetch('/api/ai/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ configId: cfg.id, api_type: cfg.api_type }),
      });
      const data = await res.json();
      if (!data.ok) {
        toast.error(data.error || '拉取模型失败');
        return;
      }

      const matched: string[] =
        cfg.api_type === 'image'
          ? data.imageModels || []
          : cfg.api_type === 'video'
            ? data.videoModels || []
            : data.models || [];

      if (matched.length === 0) {
        toast.info(`上游返回 ${data.total || 0} 个模型，但未自动匹配到同类模型，请点击「编辑」手动勾选`);
        return;
      }

      const merged = Array.from(new Set([...getCategoryModels(cfg), ...matched]));
      const patchField =
        cfg.api_type === 'image'
          ? { image_models: merged }
          : cfg.api_type === 'video'
            ? { video_models: merged }
            : { models: merged };

      const patchRes = await fetch(`/api/api-configs/${cfg.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patchField),
      });
      if (!patchRes.ok) {
        toast.error('写入同步模型失败');
        return;
      }
      toast.success(`已为「${cfg.display_name}」同步 ${matched.length} 个模型`);
      await refreshApiConfigs();
    } catch {
      toast.error('同步模型异常');
    } finally {
      setSyncingCardId(null);
    }
  };

  const handleToggleActive = async (cfg: ApiConfigPublic, nextActive: boolean) => {
    const res = await fetch(`/api/api-configs/${cfg.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: nextActive }),
    });
    if (res.ok) {
      toast.success(nextActive ? '已启用该通道' : '已停用该通道');
      await refreshApiConfigs();
    }
  };

  const handleSetDefault = async (cfg: ApiConfigPublic) => {
    const res = await fetch(`/api/api-configs/${cfg.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_default: true, is_active: true }),
    });
    if (res.ok) {
      toast.success(`已将「${cfg.display_name}」设为默认${TAB_META[cfg.api_type].label}`);
      await refreshApiConfigs();
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/api-configs/${deleteTarget.id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        toast.success(`已删除「${deleteTarget.display_name}」`);
        setDeleteTarget(null);
        await refreshApiConfigs();
      } else {
        const d = await res.json();
        toast.error(d.error || '删除失败');
      }
    } finally {
      setDeleting(false);
    }
  };

  const handleRoutingChange = async (
    scene: 'chat' | 'copywriting' | 'live_script',
    configId: string,
    model?: string
  ) => {
    if (!activeWorkspace) return;
    const targetCfg = activeTextConfigs.find((c) => c.id === configId);
    const chosenModel = model || targetCfg?.models[0] || '';
    const nextRouting: DefaultRouting = {
      ...(activeWorkspace.default_routing || {}),
      [scene]:
        configId === 'none'
          ? undefined
          : { configId, model: chosenModel },
    };

    const res = await fetch(`/api/workspaces/${activeWorkspace.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ default_routing: nextRouting }),
    });
    if (res.ok) {
      toast.success('文本模块默认路由已更新');
      await refreshWorkspaces();
    } else {
      toast.error('保存路由失败');
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2.5">
            <KeyRound className="h-6 w-6 text-indigo-600" />
            API 管理中心
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            图片 API、视频 API、文本 API 彻底隔离管理，服务端 AES-256-GCM 加密存储，绝不跨类型混用。
          </p>
        </div>
        <Button
          onClick={() => openCreateFromPreset(tabMeta.presets[0])}
          className="bg-indigo-600 hover:bg-indigo-700"
        >
          <Plus className="mr-1.5 h-4 w-4" />
          添加{tabMeta.label}
        </Button>
      </div>

      {/* Security Notice */}
      <div className="flex items-start gap-3 rounded-xl border border-indigo-200/70 bg-indigo-50/50 px-4 py-3 text-sm text-indigo-950">
        <ShieldCheck className="h-5 w-5 text-indigo-600 shrink-0 mt-0.5" />
        <div className="text-xs leading-relaxed text-indigo-900/90">
          <span className="font-semibold text-indigo-950">安全与强隔离机制：</span>
          所有 API Key 仅在服务端加密落盘，前端列表仅展示脱敏后四位。图片生成仅允许调用「图片 API」，视频生成仅允许调用「视频 API」，文本创作仅允许调用「文本 API」，不会发生静默切换。
        </div>
      </div>

      {/* 3 Primary Category Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as ApiCategory)}
        className="space-y-5"
      >
        <TabsList className="grid w-full max-w-xl grid-cols-3 h-11 p-1 bg-slate-100">
          <TabsTrigger value="image" className="gap-1.5 text-xs sm:text-sm data-[state=active]:bg-white data-[state=active]:text-indigo-700">
            <ImageIcon className="h-4 w-4" />
            图片 API
            <Badge variant="secondary" className="ml-0.5 h-5 px-1.5 text-[10px] tabular-nums">
              {counts.image}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="video" className="gap-1.5 text-xs sm:text-sm data-[state=active]:bg-white data-[state=active]:text-violet-700">
            <Film className="h-4 w-4" />
            视频 API
            <Badge variant="secondary" className="ml-0.5 h-5 px-1.5 text-[10px] tabular-nums">
              {counts.video}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="text" className="gap-1.5 text-xs sm:text-sm data-[state=active]:bg-white data-[state=active]:text-emerald-700">
            <MessageSquare className="h-4 w-4" />
            文本 / LLM API
            <Badge variant="secondary" className="ml-0.5 h-5 px-1.5 text-[10px] tabular-nums">
              {counts.text}
            </Badge>
          </TabsTrigger>
        </TabsList>

        {/* Active Tab Intro + Quick Presets */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">{tabMeta.subtitle}</p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {tabMeta.presets.map((preset) => (
              <button
                key={`${preset.apiType}-${preset.provider}-${preset.label}`}
                type="button"
                onClick={() => openCreateFromPreset(preset)}
                className="group flex flex-col justify-between rounded-xl border bg-card p-3.5 text-left transition-all hover:border-indigo-400 hover:shadow-sm"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold group-hover:text-indigo-600 transition-colors">
                      {preset.label}
                    </span>
                    <Badge variant="secondary" className="text-[10px] font-normal shrink-0">
                      {preset.protocol}
                    </Badge>
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground line-clamp-2">
                    {preset.description}
                  </p>
                </div>
                <div className="mt-3 flex items-center justify-between text-[11px] text-indigo-600 font-medium">
                  <span>点击一键接入</span>
                  <Plus className="h-3.5 w-3.5" />
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Provider List for Active Category */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className={`flex h-8 w-8 items-center justify-center rounded-lg border ${tabMeta.accentClass}`}>
                  <TabIcon className="h-4 w-4" />
                </div>
                <div>
                  <CardTitle className="text-base">
                    已配置的{tabMeta.label}（{tabConfigs.length}）
                  </CardTitle>
                  <CardDescription className="text-xs">
                    支持独立测试连接、一键拉取上游模型、设置默认首选渠道
                  </CardDescription>
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => openCreateFromPreset(tabMeta.presets[tabMeta.presets.length - 1])}
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                自定义{tabMeta.label}
              </Button>
            </div>
          </CardHeader>

          <CardContent className="space-y-3">
            {tabConfigs.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-12 text-center">
                <TabIcon className="h-10 w-10 text-muted-foreground/40 mb-3" />
                <p className="text-sm font-medium">{tabMeta.emptyTitle}</p>
                <p className="text-xs text-muted-foreground mt-1 max-w-md">
                  {tabMeta.emptyHint}
                </p>
                <Button
                  size="sm"
                  className="mt-4 bg-indigo-600 hover:bg-indigo-700"
                  onClick={() => openCreateFromPreset(tabMeta.presets[0])}
                >
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  立即添加{tabMeta.label}
                </Button>
              </div>
            ) : (
              tabConfigs.map((cfg) => {
                const models = getCategoryModels(cfg);
                const liveTest = testResults[cfg.id];
                const lastStatus = liveTest?.ok !== undefined
                  ? liveTest.ok ? 'ok' : 'error'
                  : cfg.extra_config?.lastTestStatus;
                const lastLatency = liveTest?.ttfbMs ?? cfg.extra_config?.lastLatencyMs;
                const lastMsg = liveTest?.message || liveTest?.error || cfg.extra_config?.lastTestMessage;

                return (
                  <div
                    key={cfg.id}
                    className={`rounded-xl border p-4 transition-all ${
                      cfg.is_active
                        ? 'bg-card hover:border-slate-300'
                        : 'bg-slate-50/70 opacity-75'
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="space-y-2 min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-sm">{cfg.display_name}</span>
                          {cfg.is_default && (
                            <Badge className="bg-amber-100 text-amber-800 border border-amber-200 hover:bg-amber-100 text-[10px] gap-1">
                              <Star className="h-2.5 w-2.5 fill-amber-500 text-amber-500" />
                              默认首选
                            </Badge>
                          )}
                          <Badge variant="outline" className={`text-[10px] ${tabMeta.badgeClass}`}>
                            {tabMeta.label} · {cfg.protocol || 'openai'}
                          </Badge>
                          <Badge variant="secondary" className="text-[10px] gap-1 font-normal">
                            {cfg.scope === 'workspace' ? (
                              <>
                                <Users className="h-2.5 w-2.5" />
                                空间共享
                              </>
                            ) : (
                              <>
                                <Lock className="h-2.5 w-2.5" />
                                仅自己可见
                              </>
                            )}
                          </Badge>
                          {lastStatus === 'ok' && (
                            <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200 gap-1">
                              <CheckCircle2 className="h-2.5 w-2.5" />
                              已连通 {lastLatency ? `${lastLatency}ms` : ''}
                            </Badge>
                          )}
                          {lastStatus === 'error' && (
                            <Badge variant="outline" className="text-[10px] bg-rose-50 text-rose-700 border-rose-200 gap-1">
                              <XCircle className="h-2.5 w-2.5" />
                              连接异常
                            </Badge>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground font-mono">
                          <span className="truncate max-w-md">{cfg.base_url}</span>
                          <span>Key: {cfg.masked_api_key}</span>
                          {cfg.api_type === 'image' && cfg.extra_config?.imageEndpointPath && (
                            <span>Path: {cfg.extra_config.imageEndpointPath}</span>
                          )}
                          {cfg.api_type === 'video' && cfg.extra_config?.videoSubmitPath && (
                            <span>Submit: {cfg.extra_config.videoSubmitPath}</span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                          <span className="text-[11px] text-muted-foreground mr-1">
                            模型 ({models.length}):
                          </span>
                          {models.length === 0 ? (
                            <span className="text-[11px] text-amber-600">
                              暂无模型，请点击「拉取模型」或「编辑」添加
                            </span>
                          ) : (
                            models.slice(0, 8).map((m) => (
                              <Badge
                                key={m}
                                variant="secondary"
                                className="text-[11px] font-mono font-normal"
                              >
                                {m}
                              </Badge>
                            ))
                          )}
                          {models.length > 8 && (
                            <Badge variant="outline" className="text-[10px]">
                              +{models.length - 8} 个
                            </Badge>
                          )}
                        </div>

                        {lastMsg && (
                          <p
                            className={`text-xs pt-0.5 ${
                              lastStatus === 'error' ? 'text-rose-600' : 'text-emerald-700'
                            }`}
                          >
                            {lastMsg}
                          </p>
                        )}
                      </div>

                      {/* Card Actions */}
                      <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                        {!cfg.is_default && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 text-xs"
                            onClick={() => handleSetDefault(cfg)}
                          >
                            <Star className="mr-1 h-3.5 w-3.5" />
                            设为默认
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs"
                          disabled={syncingCardId === cfg.id}
                          onClick={() => handleSyncCardModels(cfg)}
                        >
                          <CloudDownload className="mr-1 h-3.5 w-3.5" />
                          {syncingCardId === cfg.id ? '拉取中...' : '获取模型'}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs"
                          disabled={liveTest?.loading}
                          onClick={() => handleTestCard(cfg)}
                        >
                          <Activity className="mr-1 h-3.5 w-3.5" />
                          {liveTest?.loading ? '测试中...' : '测试连接'}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0"
                          title="编辑配置"
                          onClick={() => openEdit(cfg)}
                        >
                          <Edit3 className="h-4 w-4" />
                        </Button>
                        <Switch
                          checked={cfg.is_active}
                          onCheckedChange={(checked) => handleToggleActive(cfg, checked)}
                          aria-label="启用或停用渠道"
                        />
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0 text-rose-500 hover:text-rose-700 hover:bg-rose-50"
                          title="删除配置"
                          onClick={() => setDeleteTarget(cfg)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        {/* Text Module Fine-Grained Routing (only on Text tab) */}
        {activeTab === 'text' && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-emerald-600" />
                文本场景默认模型路由
              </CardTitle>
              <CardDescription className="text-xs">
                为 AI 对话、爆款文案、主播话术分别指定默认文本 API 渠道与模型（仅展示已启用的文本 API）
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-3">
              {TEXT_SCENES.map((scene) => {
                const current = activeWorkspace?.default_routing?.[scene.key];
                const currentCfg = activeTextConfigs.find((c) => c.id === current?.configId);
                return (
                  <div
                    key={scene.key}
                    className="rounded-lg border bg-slate-50/50 p-3.5 space-y-2.5"
                  >
                    <div>
                      <p className="text-sm font-medium">{scene.title}</p>
                      <p className="text-[11px] text-muted-foreground">{scene.hint}</p>
                    </div>
                    <Select
                      value={current?.configId || 'none'}
                      onValueChange={(val) => handleRoutingChange(scene.key, val)}
                    >
                      <SelectTrigger className="h-8 bg-white text-xs">
                        <SelectValue placeholder="跟随默认文本 API" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">自动使用默认文本 API</SelectItem>
                        {activeTextConfigs.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.display_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {currentCfg && currentCfg.models.length > 0 && (
                      <Select
                        value={current?.model || currentCfg.models[0]}
                        onValueChange={(m) => handleRoutingChange(scene.key, currentCfg.id, m)}
                      >
                        <SelectTrigger className="h-8 bg-white text-xs font-mono">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {currentCfg.models.map((m) => (
                            <SelectItem key={m} value={m} className="font-mono text-xs">
                              {m}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}
      </Tabs>

      {/* Create / Edit Provider Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {editingId ? '编辑' : '添加'}
              {TAB_META[formApiType].label}
              <Badge variant="outline" className={`text-xs ${TAB_META[formApiType].badgeClass}`}>
                {formApiType.toUpperCase()}
              </Badge>
            </DialogTitle>
            <DialogDescription>
              {TAB_META[formApiType].subtitle}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>渠道名称</Label>
                <Input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="例如：硅基流动 FLUX 主通道"
                />
              </div>
              <div className="space-y-1.5">
                <Label>接口协议</Label>
                <Select
                  value={protocol}
                  onValueChange={(v) => setProtocol(v as ApiProtocol)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="openai">OpenAI 兼容协议</SelectItem>
                    <SelectItem value="siliconflow">SiliconFlow 协议</SelectItem>
                    <SelectItem value="kling">可灵 / Kling 协议</SelectItem>
                    <SelectItem value="jimeng">即梦 / Jimeng 协议</SelectItem>
                    <SelectItem value="custom">自定义 REST 协议</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Base URL</Label>
                <Input
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="https://api.example.com/v1"
                  className="font-mono text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label>可见范围</Label>
                <Select value={scope} onValueChange={(v) => setScope(v as ApiScope)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="workspace">空间共享（团队成员可用）</SelectItem>
                    <SelectItem value="personal">仅自己可见（个人私钥）</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>
                API Key{' '}
                {editingId && (
                  <span className="text-xs font-normal text-muted-foreground">
                    （留空则保留原加密密钥）
                  </span>
                )}
              </Label>
              <Input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={editingId ? '••••••••••••（如需更换请输入新 Key）' : 'sk-...'}
                className="font-mono text-xs"
              />
            </div>

            {/* Category-Specific Endpoint Fields */}
            {formApiType === 'image' && (
              <div className="rounded-lg border bg-indigo-50/40 p-3 space-y-1.5">
                <Label className="text-xs text-indigo-900">图片生成接口路径（可选）</Label>
                <Input
                  value={imageEndpointPath}
                  onChange={(e) => setImageEndpointPath(e.target.value)}
                  placeholder="/images/generations"
                  className="bg-white font-mono text-xs h-8"
                />
              </div>
            )}

            {formApiType === 'video' && (
              <div className="rounded-lg border bg-violet-50/40 p-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs text-violet-900">任务提交路径</Label>
                  <Input
                    value={videoSubmitPath}
                    onChange={(e) => setVideoSubmitPath(e.target.value)}
                    placeholder="/video/submit"
                    className="bg-white font-mono text-xs h-8"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-violet-900">
                    状态轮询路径（支持 {'{taskId}'}）
                  </Label>
                  <Input
                    value={videoStatusPath}
                    onChange={(e) => setVideoStatusPath(e.target.value)}
                    placeholder="/video/status"
                    className="bg-white font-mono text-xs h-8"
                  />
                </div>
              </div>
            )}

            {/* Model IDs + One-Click Fetch */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>
                  可用{TAB_META[formApiType].label}模型列表（逗号分隔）
                </Label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  disabled={fetchingModels}
                  onClick={handleFetchModelsInModal}
                >
                  <CloudDownload className="mr-1 h-3.5 w-3.5" />
                  {fetchingModels ? '获取中...' : '一键获取上游模型'}
                </Button>
              </div>
              <Input
                value={modelsInput}
                onChange={(e) => setModelsInput(e.target.value)}
                placeholder={
                  formApiType === 'image'
                    ? 'black-forest-labs/FLUX.1-schnell, Kwai-Kolors/Kolors'
                    : formApiType === 'video'
                      ? 'Wan-AI/Wan2.1-I2V-14B-720P, kling-v1-6'
                      : 'deepseek-chat, deepseek-reasoner'
                }
                className="font-mono text-xs"
              />

              {fetchedAll.length > 0 && (
                <div className="rounded-lg border bg-slate-50 p-3 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="relative flex-1 min-w-[160px]">
                      <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        value={fetchedFilter}
                        onChange={(e) => setFetchedFilter(e.target.value)}
                        placeholder="筛选已拉取的模型 ID..."
                        className="h-7 pl-8 text-xs bg-white"
                      />
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs"
                      onClick={() => setShowAllFetched((v) => !v)}
                    >
                      {showAllFetched
                        ? `仅看智能匹配 (${fetchedMatched.length})`
                        : `查看全部 (${fetchedAll.length})`}
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto">
                    {displayedCatalog.map((id) => {
                      const active = selectedModelList.includes(id);
                      return (
                        <button
                          key={id}
                          type="button"
                          onClick={() => handleToggleModel(id)}
                          className={`rounded-md border px-2 py-1 text-[11px] font-mono transition-colors ${
                            active
                              ? 'border-indigo-500 bg-indigo-600 text-white'
                              : 'border-slate-200 bg-white text-slate-700 hover:border-indigo-300'
                          }`}
                        >
                          {id}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between rounded-lg border px-3.5 py-2.5">
              <div>
                <p className="text-sm font-medium">设为默认{TAB_META[formApiType].label}</p>
                <p className="text-xs text-muted-foreground">
                  开启后，对应生成页面与画布新建节点将优先选中此渠道
                </p>
              </div>
              <Switch checked={isDefault} onCheckedChange={setIsDefault} />
            </div>

            {/* Inline Test Connection inside modal */}
            {modalTest.ok !== undefined && (
              <div
                className={`rounded-lg border px-3 py-2 text-xs ${
                  modalTest.ok
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                    : 'border-rose-200 bg-rose-50 text-rose-700'
                }`}
              >
                {modalTest.ok ? modalTest.message : modalTest.error}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            <Button
              type="button"
              variant="outline"
              disabled={modalTest.loading}
              onClick={handleTestInModal}
            >
              <Activity className="mr-1.5 h-4 w-4" />
              {modalTest.loading ? '正在测试...' : '测试连接'}
            </Button>
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={() => setDialogOpen(false)}>
                取消
              </Button>
              <Button
                disabled={saving}
                onClick={handleSave}
                className="bg-indigo-600 hover:bg-indigo-700"
              >
                {saving ? '保存中...' : '保存配置'}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>确认删除 API 渠道</DialogTitle>
            <DialogDescription>
              即将永久删除「{deleteTarget?.display_name}」及其加密 API Key。已绑定该渠道的画布节点在下次运行时需重新选择渠道。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              取消
            </Button>
            <Button
              variant="destructive"
              disabled={deleting}
              onClick={handleConfirmDelete}
            >
              {deleting ? '删除中...' : '确认删除'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function ApiSettingsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
          正在加载 API 管理中心...
        </div>
      }
    >
      <ApiSettingsContent />
    </Suspense>
  );
}
