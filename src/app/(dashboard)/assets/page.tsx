'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Copy,
  Eye,
  FileText,
  Film,
  FolderKanban,
  Globe,
  Image as ImageIcon,
  Lock,
  Plus,
  Search,
  Sparkles,
  Star,
  Tag,
  Trash2,
  Upload,
} from 'lucide-react';
import { toast } from 'sonner';
import { useWorkspace } from '@/components/providers/workspace-provider';
import { ASSET_TYPE_META } from '@/lib/constants';
import { uploadFileToCloud } from '@/lib/upload-client';
import type { Asset, AssetType, AssetVisibility } from '@/lib/types';
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
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';

export default function AssetsPage() {
  const router = useRouter();
  const { activeWorkspaceId, products } = useWorkspace();

  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);

  const [typeFilter, setTypeFilter] = useState<AssetType | 'all'>('all');
  const [productFilter, setProductFilter] = useState<string>('all');
  const [visibilityFilter, setVisibilityFilter] = useState<AssetVisibility | 'all'>('all');
  const [tagFilter, setTagFilter] = useState<string>('');
  const [starredOnly, setStarredOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);

  // Create / Upload dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newType, setNewType] = useState<AssetType>('image');
  const [newProductId, setNewProductId] = useState('');
  const [newVisibility, setNewVisibility] = useState<AssetVisibility>('workspace');
  const [newContent, setNewContent] = useState('');
  const [newTags, setNewTags] = useState('');
  const [newFileUrl, setNewFileUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchAssets = useCallback(async () => {
    if (!activeWorkspaceId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        workspaceId: activeWorkspaceId,
        assetType: typeFilter,
        productId: productFilter,
        visibility: visibilityFilter,
      });
      if (tagFilter) params.set('tag', tagFilter);
      if (starredOnly) params.set('starred', 'true');
      if (searchQuery.trim()) params.set('q', searchQuery.trim());

      const res = await fetch(`/api/assets?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setAssets(Array.isArray(data.assets) ? data.assets : []);
      }
    } finally {
      setLoading(false);
    }
  }, [
    activeWorkspaceId,
    typeFilter,
    productFilter,
    visibilityFilter,
    tagFilter,
    starredOnly,
    searchQuery,
  ]);

  useEffect(() => {
    fetchAssets();
  }, [fetchAssets]);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const a of assets) {
      for (const t of a.tags || []) {
        set.add(t);
      }
    }
    return Array.from(set);
  }, [assets]);

  const productNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const p of products) map[p.id] = p.name;
    return map;
  }, [products]);

  const handleToggleStar = async (asset: Asset) => {
    const nextVal = !asset.is_starred;
    const res = await fetch(`/api/assets/${asset.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_starred: nextVal }),
    });
    if (res.ok) {
      setAssets((prev) =>
        prev.map((a) => (a.id === asset.id ? { ...a, is_starred: nextVal } : a))
      );
      if (selectedAsset?.id === asset.id) {
        setSelectedAsset({ ...selectedAsset, is_starred: nextVal });
      }
    }
  };

  const handleToggleVisibility = async (asset: Asset) => {
    const nextVis: AssetVisibility =
      asset.visibility === 'workspace' ? 'private' : 'workspace';
    const res = await fetch(`/api/assets/${asset.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visibility: nextVis }),
    });
    if (res.ok) {
      toast.success(
        nextVis === 'workspace' ? '已设为团队共享可见' : '已设为仅自己可见'
      );
      setAssets((prev) =>
        prev.map((a) => (a.id === asset.id ? { ...a, visibility: nextVis } : a))
      );
      if (selectedAsset?.id === asset.id) {
        setSelectedAsset({ ...selectedAsset, visibility: nextVis });
      }
    }
  };

  const [deleteCandidate, setDeleteCandidate] = useState<{
    asset: Asset;
    referencingWorkflows: string[];
  } | null>(null);
  const [deletingAsset, setDeletingAsset] = useState(false);

  const handleDeleteAsset = async (asset: Asset) => {
    let referencingWorkflows: string[] = [];
    try {
      const checkRes = await fetch(
        `/api/assets/${asset.id}?workspaceId=${encodeURIComponent(activeWorkspaceId || '')}`
      );
      if (checkRes.ok) {
        const checkData = await checkRes.json();
        referencingWorkflows = Array.isArray(checkData.referencingWorkflows)
          ? checkData.referencingWorkflows
          : [];
      }
    } catch {
      // Proceed to confirmation modal even if ref check fails
    }
    setDeleteCandidate({ asset, referencingWorkflows });
  };

  const confirmDeleteAsset = async () => {
    if (!deleteCandidate) return;
    setDeletingAsset(true);
    try {
      const { asset } = deleteCandidate;
      const res = await fetch(`/api/assets/${asset.id}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success(`已删除素材「${asset.title}」`);
        setAssets((prev) => prev.filter((a) => a.id !== asset.id));
        if (selectedAsset?.id === asset.id) {
          setSelectedAsset(null);
        }
        setDeleteCandidate(null);
      } else {
        toast.error('删除素材失败');
      }
    } finally {
      setDeletingAsset(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeWorkspaceId) return;

    setUploading(true);
    try {
      const folder = file.type.startsWith('video/') ? 'videos' : 'images';
      const uploaded = await uploadFileToCloud(file, activeWorkspaceId, folder);
      setNewFileUrl(uploaded.url);
      if (!newTitle.trim()) {
        setNewTitle(file.name.replace(/\.[^.]+$/, ''));
      }
      if (file.type.startsWith('video/')) {
        setNewType('video');
      } else if (file.type.startsWith('image/')) {
        setNewType('image');
      }
      toast.success(
        uploaded.storage === 'r2'
          ? '已通过预签名直传至 Cloudflare R2'
          : '文件已上传并保存访问地址'
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '上传失败');
    } finally {
      setUploading(false);
    }
  };

  const handleCreateAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeWorkspaceId || !newTitle.trim()) return;
    setSaving(true);
    try {
      const tags = Array.from(
        new Set(
          newTags
            .split(/[,，\s]+/)
            .map((t) => t.trim())
            .filter(Boolean)
        )
      );
      const res = await fetch('/api/assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspace_id: activeWorkspaceId,
          product_id: newProductId || null,
          asset_type: newType,
          visibility: newVisibility,
          title: newTitle.trim(),
          content: newContent.trim() || null,
          file_url: newFileUrl.trim() || null,
          tags,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || '创建素材失败');
        return;
      }
      toast.success('素材已存入云端素材库');
      setCreateOpen(false);
      setNewTitle('');
      setNewContent('');
      setNewTags('');
      setNewFileUrl('');
      fetchAssets();
    } finally {
      setSaving(false);
    }
  };

  const handleReuseInStudio = (asset: Asset) => {
    const meta = asset.generation_meta || {};
    const params = new URLSearchParams();
    if (meta.prompt) params.set('prompt', String(meta.prompt));
    if (meta.negative_prompt) params.set('negativePrompt', String(meta.negative_prompt));
    if (meta.aspect_ratio) params.set('aspectRatio', String(meta.aspect_ratio));
    if (meta.model) params.set('model', String(meta.model));
    if (asset.product_id) params.set('productId', asset.product_id);
    if (asset.file_url && asset.asset_type === 'image') {
      params.set('refImage', asset.file_url);
    }
    const targetRoute = asset.asset_type === 'video' ? '/video-gen' : '/image-gen';
    router.push(`${targetRoute}?${params.toString()}`);
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <FolderKanban className="h-6 w-6 text-primary" />
            云端素材库
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            统一管理文案、主播话术、AI 图片与视频成片（媒体文件通过 Cloudflare R2 预签名持久化保存，支持复用参数继续生成）。
          </p>
        </div>

        <Button
          onClick={() => {
            setNewType('image');
            setCreateOpen(true);
          }}
        >
          <Plus className="h-4 w-4" />
          上传媒体 / 新建素材
        </Button>
      </div>

      {/* 多维筛选工具栏 */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Tabs
              value={typeFilter}
              onValueChange={(v) => setTypeFilter(v as AssetType | 'all')}
            >
              <TabsList className="flex-wrap h-auto">
                <TabsTrigger value="all">全部资产</TabsTrigger>
                <TabsTrigger value="copywriting">文案资产</TabsTrigger>
                <TabsTrigger value="script">话术资产</TabsTrigger>
                <TabsTrigger value="image">图片资产</TabsTrigger>
                <TabsTrigger value="video">视频资产</TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant={starredOnly ? 'default' : 'outline'}
                onClick={() => setStarredOnly((v) => !v)}
              >
                <Star className={`h-3.5 w-3.5 ${starredOnly ? 'fill-current' : ''}`} />
                仅看星标
              </Button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="关键词搜索标题 / 正文..."
                className="pl-9"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <Select value={productFilter} onValueChange={setProductFilter}>
              <SelectTrigger>
                <SelectValue placeholder="按关联产品筛选" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部关联产品</SelectItem>
                {products.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={visibilityFilter}
              onValueChange={(v) => setVisibilityFilter(v as AssetVisibility | 'all')}
            >
              <SelectTrigger>
                <SelectValue placeholder="按共享权限筛选" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部权限范围</SelectItem>
                <SelectItem value="workspace">团队共享可见</SelectItem>
                <SelectItem value="private">仅自己可见</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={tagFilter || 'all_tags'}
              onValueChange={(v) => setTagFilter(v === 'all_tags' ? '' : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="按标签筛选" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all_tags">全部标签</SelectItem>
                {allTags.map((t) => (
                  <SelectItem key={t} value={t}>
                    #{t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {allTags.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-xs text-muted-foreground flex items-center gap-1 mr-1">
                <Tag className="h-3 w-3" /> 快捷标签：
              </span>
              {tagFilter && (
                <Badge
                  variant="secondary"
                  className="cursor-pointer text-xs"
                  onClick={() => setTagFilter('')}
                >
                  清除筛选 ✕
                </Badge>
              )}
              {allTags.slice(0, 12).map((t) => (
                <Badge
                  key={t}
                  variant={tagFilter === t ? 'default' : 'outline'}
                  className="cursor-pointer text-xs"
                  onClick={() => setTagFilter(tagFilter === t ? '' : t)}
                >
                  #{t}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 素材卡片网格 */}
      {loading ? (
        <div className="py-16 text-center text-sm text-muted-foreground">
          正在加载云端素材库...
        </div>
      ) : assets.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-14 text-center space-y-3">
            <FolderKanban className="h-9 w-9 text-muted-foreground/60" />
            <div className="text-sm font-medium">暂无匹配的云端素材</div>
            <p className="text-xs text-muted-foreground max-w-md">
              你可以直接上传图片/视频到 Cloudflare R2，或在 AI 对话、文案、话术、图/视频生成页面一键归档到这里。
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {assets.map((asset) => {
            const meta = ASSET_TYPE_META[asset.asset_type];
            return (
              <Card
                key={asset.id}
                className="flex flex-col justify-between overflow-hidden hover:shadow-md transition-shadow"
              >
                <div>
                  {asset.file_url && asset.asset_type === 'image' && (
                    <div
                      className="aspect-video w-full bg-muted overflow-hidden cursor-pointer border-b"
                      onClick={() => setSelectedAsset(asset)}
                    >
                      <img
                        src={asset.file_url}
                        alt={asset.title}
                        className="h-full w-full object-cover transition-transform hover:scale-105"
                      />
                    </div>
                  )}
                  {asset.file_url && asset.asset_type === 'video' && (
                    <div
                      className="aspect-video w-full bg-black overflow-hidden cursor-pointer border-b relative flex items-center justify-center"
                      onClick={() => setSelectedAsset(asset)}
                    >
                      <video
                        src={asset.file_url}
                        className="h-full w-full object-cover"
                        muted
                      />
                      <Badge className="absolute bottom-2 right-2 bg-black/70 text-white">
                        视频成片
                      </Badge>
                    </div>
                  )}

                  <div className="p-4 space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge variant="outline" className={meta.color}>
                          {meta.label}
                        </Badge>
                        <Badge variant="secondary" className="gap-1 text-[10px]">
                          {asset.visibility === 'workspace' ? (
                            <>
                              <Globe className="h-2.5 w-2.5" />
                              团队共享
                            </>
                          ) : (
                            <>
                              <Lock className="h-2.5 w-2.5" />
                              私有
                            </>
                          )}
                        </Badge>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleToggleStar(asset)}
                        className="text-muted-foreground hover:text-amber-500 transition-colors"
                        aria-label="收藏星标"
                      >
                        <Star
                          className={`h-4 w-4 ${
                            asset.is_starred ? 'fill-amber-400 text-amber-500' : ''
                          }`}
                        />
                      </button>
                    </div>

                    <h3
                      className="font-semibold text-sm leading-snug line-clamp-2 cursor-pointer hover:text-primary"
                      onClick={() => setSelectedAsset(asset)}
                    >
                      {asset.title}
                    </h3>

                    {asset.content && (
                      <p className="text-xs text-muted-foreground line-clamp-3 whitespace-pre-line">
                        {asset.content}
                      </p>
                    )}

                    {asset.product_id && productNameMap[asset.product_id] && (
                      <div className="text-[11px] text-indigo-600 truncate">
                        关联产品：{productNameMap[asset.product_id]}
                      </div>
                    )}

                    {asset.tags?.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-0.5">
                        {asset.tags.map((t) => (
                          <span
                            key={t}
                            className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                          >
                            #{t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between border-t bg-muted/20 px-4 py-2.5 text-xs">
                  <span className="text-muted-foreground">
                    {formatDateTime(asset.created_at)}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs"
                      onClick={() => setSelectedAsset(asset)}
                    >
                      <Eye className="h-3.5 w-3.5" />
                      详情
                    </Button>
                    {asset.content && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs"
                        onClick={() => {
                          copyToClipboard(asset.content || '');
                          toast.success('已复制素材正文');
                        }}
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                      onClick={() => handleDeleteAsset(asset)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* 素材详情抽屉 Sheet */}
      <Sheet
        open={Boolean(selectedAsset)}
        onOpenChange={(open) => !open && setSelectedAsset(null)}
      >
        <SheetContent side="right" className="space-y-5">
          {selectedAsset && (
            <>
              <SheetHeader>
                <div className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className={ASSET_TYPE_META[selectedAsset.asset_type].color}
                  >
                    {ASSET_TYPE_META[selectedAsset.asset_type].label}
                  </Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 text-xs"
                    onClick={() => handleToggleVisibility(selectedAsset)}
                  >
                    {selectedAsset.visibility === 'workspace'
                      ? '当前：团队共享（点击切为私有）'
                      : '当前：仅自己可见（点击切为共享）'}
                  </Button>
                </div>
                <SheetTitle className="pt-2">{selectedAsset.title}</SheetTitle>
                <SheetDescription>
                  创建时间：{formatDateTime(selectedAsset.created_at)}
                  {selectedAsset.product_id && productNameMap[selectedAsset.product_id]
                    ? ` · 关联产品：${productNameMap[selectedAsset.product_id]}`
                    : ''}
                </SheetDescription>
              </SheetHeader>

              {selectedAsset.file_url && selectedAsset.asset_type === 'image' && (
                <div className="rounded-lg border overflow-hidden bg-muted">
                  <img
                    src={selectedAsset.file_url}
                    alt={selectedAsset.title}
                    className="w-full max-h-[360px] object-contain"
                  />
                </div>
              )}

              {selectedAsset.file_url && selectedAsset.asset_type === 'video' && (
                <div className="rounded-lg border overflow-hidden bg-black">
                  <video
                    src={selectedAsset.file_url}
                    controls
                    className="w-full max-h-[360px]"
                  />
                </div>
              )}

              {selectedAsset.content && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground">正文内容</span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => {
                        copyToClipboard(selectedAsset.content || '');
                        toast.success('已复制全部正文');
                      }}
                    >
                      <Copy className="h-3.5 w-3.5" />
                      复制正文
                    </Button>
                  </div>
                  <div className="rounded-lg border bg-muted/30 p-3.5 text-sm whitespace-pre-wrap leading-relaxed max-h-[300px] overflow-y-auto">
                    {selectedAsset.content}
                  </div>
                </div>
              )}

              {/* 生成参数元数据展示与一键复用 */}
              {selectedAsset.generation_meta &&
                Object.keys(selectedAsset.generation_meta).length > 0 && (
                  <div className="rounded-lg border p-4 space-y-2.5 bg-indigo-50/40">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-indigo-900">
                        AI 生成参数快照
                      </span>
                      {(selectedAsset.asset_type === 'image' ||
                        selectedAsset.asset_type === 'video' ||
                        Boolean(selectedAsset.generation_meta.prompt)) && (
                        <Button
                          size="sm"
                          onClick={() => handleReuseInStudio(selectedAsset)}
                        >
                          <Sparkles className="h-3.5 w-3.5" />
                          一键复用同款参数继续生成
                        </Button>
                      )}
                    </div>
                    <div className="grid gap-1.5 text-xs text-muted-foreground">
                      {selectedAsset.generation_meta.model && (
                        <div>
                          <span className="font-medium text-foreground">使用模型：</span>
                          <span className="font-mono">
                            {String(selectedAsset.generation_meta.model)}
                          </span>
                        </div>
                      )}
                      {selectedAsset.generation_meta.aspect_ratio && (
                        <div>
                          <span className="font-medium text-foreground">画面比例：</span>
                          {String(selectedAsset.generation_meta.aspect_ratio)}
                        </div>
                      )}
                      {selectedAsset.generation_meta.prompt && (
                        <div>
                          <span className="font-medium text-foreground">Prompt：</span>
                          <p className="mt-0.5 rounded bg-background p-2 border font-mono text-[11px]">
                            {String(selectedAsset.generation_meta.prompt)}
                          </p>
                        </div>
                      )}
                      {selectedAsset.generation_meta.negative_prompt && (
                        <div>
                          <span className="font-medium text-foreground">负面词：</span>
                          {String(selectedAsset.generation_meta.negative_prompt)}
                        </div>
                      )}
                    </div>
                  </div>
                )}

              <div className="flex items-center justify-between pt-2 border-t">
                <Button
                  variant="outline"
                  onClick={() => handleToggleStar(selectedAsset)}
                >
                  <Star
                    className={`h-4 w-4 ${
                      selectedAsset.is_starred ? 'fill-amber-400 text-amber-500' : ''
                    }`}
                  />
                  {selectedAsset.is_starred ? '取消星标' : '加入星标'}
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => handleDeleteAsset(selectedAsset)}
                >
                  <Trash2 className="h-4 w-4" />
                  删除素材
                </Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* 上传 / 新建素材弹窗 */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>上传媒体或新建素材</DialogTitle>
            <DialogDescription>
              图片/视频将通过 Cloudflare R2 预签名接口直传持久化保存，避免链接失效。
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateAsset} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>素材类型</Label>
                <Select
                  value={newType}
                  onValueChange={(v) => setNewType(v as AssetType)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="image">
                      <span className="flex items-center gap-1.5">
                        <ImageIcon className="h-3.5 w-3.5" /> 图片资产
                      </span>
                    </SelectItem>
                    <SelectItem value="video">
                      <span className="flex items-center gap-1.5">
                        <Film className="h-3.5 w-3.5" /> 视频资产
                      </span>
                    </SelectItem>
                    <SelectItem value="copywriting">
                      <span className="flex items-center gap-1.5">
                        <FileText className="h-3.5 w-3.5" /> 文案资产
                      </span>
                    </SelectItem>
                    <SelectItem value="script">话术资产</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>共享权限</Label>
                <Select
                  value={newVisibility}
                  onValueChange={(v) => setNewVisibility(v as AssetVisibility)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="workspace">团队共享</SelectItem>
                    <SelectItem value="private">仅自己可见</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {(newType === 'image' || newType === 'video') && (
              <div className="space-y-2">
                <Label>上传媒体文件（Cloudflare R2 预签名直传）</Label>
                <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-5 text-center hover:border-primary transition-colors">
                  <Upload className="h-6 w-6 text-muted-foreground mb-1.5" />
                  <span className="text-xs font-medium">
                    {uploading
                      ? '正在上传到云端存储...'
                      : newFileUrl
                        ? '已上传成功，点击可重新选择'
                        : '点击选择图片或视频文件'}
                  </span>
                  <input
                    type="file"
                    accept={newType === 'video' ? 'video/*' : 'image/*'}
                    className="hidden"
                    disabled={uploading}
                    onChange={handleFileChange}
                  />
                </label>
                {newFileUrl && (
                  <Input
                    value={newFileUrl}
                    onChange={(e) => setNewFileUrl(e.target.value)}
                    placeholder="或直接粘贴图片/视频 URL"
                    className="text-xs font-mono"
                  />
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="new-asset-title">素材标题 *</Label>
              <Input
                id="new-asset-title"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="输入素材名称"
                required
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>关联产品</Label>
                <Select
                  value={newProductId || 'none'}
                  onValueChange={(v) => setNewProductId(v === 'none' ? '' : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="关联产品" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">不关联</SelectItem>
                    {products.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-asset-tags">标签（逗号分隔）</Label>
                <Input
                  id="new-asset-tags"
                  value={newTags}
                  onChange={(e) => setNewTags(e.target.value)}
                  placeholder="主图, 直播素材"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-asset-content">正文或备注说明</Label>
              <Textarea
                id="new-asset-content"
                rows={4}
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                placeholder="文案/话术正文或媒体使用说明..."
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateOpen(false)}
              >
                取消
              </Button>
              <Button type="submit" disabled={saving || uploading}>
                {saving ? '保存中...' : '保存入库'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* 安全删除确认弹窗（含画布引用检测） */}
      <Dialog
        open={Boolean(deleteCandidate)}
        onOpenChange={(open) => !open && setDeleteCandidate(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>确认删除素材</DialogTitle>
            <DialogDescription>
              即将删除素材「{deleteCandidate?.asset.title}」。删除后无法撤销。
            </DialogDescription>
          </DialogHeader>
          {deleteCandidate && deleteCandidate.referencingWorkflows.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 space-y-1">
              <p className="font-semibold">
                注意：以下 {deleteCandidate.referencingWorkflows.length} 个创作画布工作流正在引用此素材：
              </p>
              <ul className="list-disc pl-4 space-y-0.5">
                {deleteCandidate.referencingWorkflows.map((wfName) => (
                  <li key={wfName}>{wfName}</li>
                ))}
              </ul>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteCandidate(null)}>
              取消
            </Button>
            <Button
              variant="destructive"
              disabled={deletingAsset}
              onClick={confirmDeleteAsset}
            >
              {deletingAsset ? '删除中...' : '仍要删除'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
