'use client';

import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Edit3,
  ImagePlus,
  Package,
  Plus,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { useWorkspace } from '@/components/providers/workspace-provider';
import { uploadFileToCloud } from '@/lib/upload-client';
import type { Product } from '@/lib/types';
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
import { Textarea } from '@/components/ui/textarea';
import { formatDateTime } from '@/lib/utils';

export default function ProductsPage() {
  const { activeWorkspaceId, products, refreshProducts } = useWorkspace();
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [sellingPoints, setSellingPoints] = useState('');
  const [targetAudience, setTargetAudience] = useState('');
  const [specsAndPrice, setSpecsAndPrice] = useState('');
  const [bannedWordsInput, setBannedWordsInput] = useState('');
  const [referenceImages, setReferenceImages] = useState<string[]>([]);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [saving, setSaving] = useState(false);

  const filteredProducts = useMemo(() => {
    const kw = search.trim().toLowerCase();
    if (!kw) return products;
    return products.filter((p) =>
      `${p.name} ${p.selling_points} ${p.target_audience} ${p.specs_and_price}`
        .toLowerCase()
        .includes(kw)
    );
  }, [products, search]);

  const openCreate = () => {
    setEditingId(null);
    setName('');
    setSellingPoints('');
    setTargetAudience('');
    setSpecsAndPrice('');
    setBannedWordsInput('');
    setReferenceImages([]);
    setDialogOpen(true);
  };

  const openEdit = (p: Product) => {
    setEditingId(p.id);
    setName(p.name);
    setSellingPoints(p.selling_points || '');
    setTargetAudience(p.target_audience || '');
    setSpecsAndPrice(p.specs_and_price || '');
    setBannedWordsInput((p.banned_words || []).join(', '));
    setReferenceImages(Array.isArray(p.reference_images) ? p.reference_images : []);
    setDialogOpen(true);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !files.length || !activeWorkspaceId) return;

    setUploadingImage(true);
    try {
      const uploadedUrls: string[] = [];
      for (const file of Array.from(files)) {
        const res = await uploadFileToCloud(file, activeWorkspaceId, 'products');
        uploadedUrls.push(res.url);
      }
      setReferenceImages((prev) => [...prev, ...uploadedUrls]);
      toast.success(`已上传 ${uploadedUrls.length} 张参考图`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '图片上传失败');
    } finally {
      setUploadingImage(false);
      e.target.value = '';
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeWorkspaceId) {
      toast.error('请先选择工作空间');
      return;
    }
    if (!name.trim()) {
      toast.error('请输入产品名称');
      return;
    }

    const bannedWords = Array.from(
      new Set(
        bannedWordsInput
          .split(/[,，\n]/)
          .map((w) => w.trim())
          .filter(Boolean)
      )
    );

    setSaving(true);
    try {
      const url = editingId ? `/api/products/${editingId}` : '/api/products';
      const method = editingId ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspace_id: activeWorkspaceId,
          name: name.trim(),
          selling_points: sellingPoints.trim(),
          target_audience: targetAudience.trim(),
          specs_and_price: specsAndPrice.trim(),
          banned_words: bannedWords,
          reference_images: referenceImages,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || '保存产品失败');
        return;
      }
      toast.success(editingId ? '产品档案已更新' : '新产品档案已添加到产品库');
      setDialogOpen(false);
      await refreshProducts();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (p: Product) => {
    try {
      const res = await fetch(`/api/products/${p.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const d = await res.json();
        toast.error(d.error || '删除失败');
        return;
      }
      toast.success(`已删除「${p.name}」`);
      await refreshProducts();
    } catch {
      toast.error('删除失败');
    }
  };

  const handleCreateSample = async () => {
    if (!activeWorkspaceId) return;
    try {
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspace_id: activeWorkspaceId,
          name: '玻色因紧致抗皱次抛精华液（30支装）',
          selling_points:
            '1. 15%高浓度玻色因复配胶原三肽，精准淡化法令纹与干纹；2. BFS无菌次抛锁鲜包装，0酒精0香精，敏感肌可用；3. 质地水润好吸收，妆前打底不搓泥。',
          target_audience:
            '25-45岁熬夜垮脸、初老细纹困扰女性，痛点：大牌抗老面霜太贵太厚重、开封后活性易流失。',
          specs_and_price:
            '1.5ml×30支/盒；日常价 299元，直播间拍1发2盒（共60支）到手仅159元，赠送同款体验装5支（不满意可退正装）。',
          banned_words: ['医疗级', '抗衰老治病', '7天换皮', '零风险', '全网第一'],
          reference_images: [],
        }),
      });
      if (res.ok) {
        toast.success('已生成示例护肤品档案');
        await refreshProducts();
      }
    } catch {
      toast.error('创建示例产品失败');
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Package className="h-6 w-6 text-primary" />
            产品库底座
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            沉淀商品核心卖点、受众痛点、价格机制与专属违禁词。对话、文案、话术与视觉生成顶部均可一键关联注入上下文。
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={handleCreateSample}>
            <Sparkles className="h-4 w-4" />
            导入示例产品
          </Button>
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            新建产品档案
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="搜索产品名称、卖点关键词或受众痛点..."
            className="pl-9 bg-card"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Badge variant="secondary">共 {filteredProducts.length} 款商品</Badge>
      </div>

      {filteredProducts.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-14 text-center space-y-3">
            <Package className="h-9 w-9 text-muted-foreground/60" />
            <div className="text-sm font-medium">暂无符合条件的产品档案</div>
            <p className="text-xs text-muted-foreground">
              新建你的第一个主推商品档案，即可在全工作台各模块自动注入卖点知识库。
            </p>
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-4 w-4" />
              新建产品档案
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {filteredProducts.map((p) => (
            <Card key={p.id} className="flex flex-col justify-between">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-base leading-snug">{p.name}</CardTitle>
                    <CardDescription className="text-xs mt-1">
                      更新于 {formatDateTime(p.updated_at)}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={() => openEdit(p)}
                      title="编辑产品"
                    >
                      <Edit3 className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => handleDelete(p)}
                      title="删除产品"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-3 text-sm">
                {p.reference_images?.length > 0 && (
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {p.reference_images.map((imgUrl, idx) => (
                      <img
                        key={`${imgUrl}-${idx}`}
                        src={imgUrl}
                        alt={`${p.name} 参考图 ${idx + 1}`}
                        className="h-16 w-16 rounded-md object-cover border shrink-0 bg-muted"
                      />
                    ))}
                  </div>
                )}

                {p.selling_points && (
                  <div>
                    <div className="text-xs font-semibold text-foreground mb-1">
                      核心卖点
                    </div>
                    <p className="text-xs text-muted-foreground whitespace-pre-line line-clamp-3">
                      {p.selling_points}
                    </p>
                  </div>
                )}

                {p.target_audience && (
                  <div>
                    <div className="text-xs font-semibold text-foreground mb-1">
                      目标受众与痛点
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {p.target_audience}
                    </p>
                  </div>
                )}

                {p.specs_and_price && (
                  <div className="rounded-md bg-muted/50 px-3 py-2 text-xs text-foreground">
                    <span className="font-semibold">规格与机制：</span>
                    {p.specs_and_price}
                  </div>
                )}

                {p.banned_words?.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <span className="inline-flex items-center gap-1 text-[11px] text-rose-600 font-medium">
                      <AlertTriangle className="h-3 w-3" />
                      专属违禁词：
                    </span>
                    {p.banned_words.map((word) => (
                      <Badge
                        key={word}
                        variant="outline"
                        className="text-[11px] bg-rose-50 text-rose-700 border-rose-200"
                      >
                        {word}
                      </Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* 新建 / 编辑产品弹窗 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingId ? '编辑产品档案' : '新建产品档案'}</DialogTitle>
            <DialogDescription>
              填写越详细，AI 生成的带货文案、直播话术与画面分镜提示词越精准。
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="prod-name">产品名称 *</Label>
              <Input
                id="prod-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例如：云朵冰感防晒冰丝防晒衣 UPF50+"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="prod-points">核心卖点</Label>
              <Textarea
                id="prod-points"
                rows={3}
                value={sellingPoints}
                onChange={(e) => setSellingPoints(e.target.value)}
                placeholder="列出 3-5 个核心差异化卖点、实测数据或材质优势..."
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="prod-audience">目标受众与核心痛点</Label>
              <Textarea
                id="prod-audience"
                rows={2}
                value={targetAudience}
                onChange={(e) => setTargetAudience(e.target.value)}
                placeholder="例如：25-35岁宝妈或职场女性，痛点是..."
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="prod-specs">规格参数与价格促销机制</Label>
              <Textarea
                id="prod-specs"
                rows={2}
                value={specsAndPrice}
                onChange={(e) => setSpecsAndPrice(e.target.value)}
                placeholder="日常价、直播间闪购价、拍几发几、赠品与售后保障..."
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="prod-banned">专属违禁词 / 注意事项（逗号分隔）</Label>
              <Input
                id="prod-banned"
                value={bannedWordsInput}
                onChange={(e) => setBannedWordsInput(e.target.value)}
                placeholder="例如：永久防晒, 根治, 医疗级, 全网最低"
              />
            </div>

            <div className="space-y-2">
              <Label>产品参考素材图（对接 Cloudflare R2 预签名直传）</Label>
              <div className="flex flex-wrap items-center gap-3">
                {referenceImages.map((imgUrl, idx) => (
                  <div
                    key={`${imgUrl}-${idx}`}
                    className="relative h-20 w-20 rounded-md border overflow-hidden group"
                  >
                    <img
                      src={imgUrl}
                      alt="产品参考图"
                      className="h-full w-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setReferenceImages((prev) => prev.filter((_, i) => i !== idx))
                      }
                      className="absolute right-1 top-1 rounded-full bg-black/70 p-0.5 text-white opacity-90 hover:opacity-100"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}

                <label className="flex h-20 w-24 cursor-pointer flex-col items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground hover:border-primary hover:text-primary transition-colors">
                  <ImagePlus className="h-5 w-5 mb-1" />
                  <span>{uploadingImage ? '上传中...' : '上传图片'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    disabled={uploadingImage}
                    onChange={handleImageUpload}
                  />
                </label>
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
              >
                取消
              </Button>
              <Button type="submit" disabled={saving || uploadingImage}>
                {saving ? '保存中...' : '保存产品档案'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
