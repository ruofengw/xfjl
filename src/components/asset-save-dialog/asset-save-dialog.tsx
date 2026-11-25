'use client';

import React, { useEffect, useState } from 'react';
import { FolderPlus } from 'lucide-react';
import { toast } from 'sonner';
import { useWorkspace } from '@/components/providers/workspace-provider';
import { ASSET_TYPE_META } from '@/lib/constants';
import type { AssetType, AssetVisibility, GenerationMeta } from '@/lib/types';
import { Button } from '@/components/ui/button';
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
import { Textarea } from '@/components/ui/textarea';

export interface AssetSavePayload {
  title: string;
  assetType: AssetType;
  productId?: string | null;
  content?: string | null;
  fileUrl?: string | null;
  tags?: string[];
  generationMeta?: GenerationMeta;
}

interface AssetSaveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialData: AssetSavePayload | null;
  onSaved?: () => void;
  transferRemoteFile?: boolean;
}

export function AssetSaveDialog({
  open,
  onOpenChange,
  initialData,
  onSaved,
  transferRemoteFile = false,
}: AssetSaveDialogProps) {
  const { activeWorkspaceId, products } = useWorkspace();
  const [title, setTitle] = useState('');
  const [assetType, setAssetType] = useState<AssetType>('copywriting');
  const [productId, setProductId] = useState('');
  const [visibility, setVisibility] = useState<AssetVisibility>('workspace');
  const [tagsInput, setTagsInput] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (initialData && open) {
      setTitle(initialData.title || '');
      setAssetType(initialData.assetType || 'copywriting');
      setProductId(initialData.productId || '');
      setTagsInput((initialData.tags || []).join(', '));
      setContent(initialData.content || '');
      setVisibility('workspace');
    }
  }, [initialData, open]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeWorkspaceId) {
      toast.error('请先选择工作空间');
      return;
    }
    if (!title.trim()) {
      toast.error('请填写素材标题');
      return;
    }

    setSaving(true);
    try {
      let finalFileUrl = initialData?.fileUrl || null;

      if (transferRemoteFile && finalFileUrl) {
        const trRes = await fetch('/api/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'transfer',
            workspaceId: activeWorkspaceId,
            sourceUrl: finalFileUrl,
            mediaType: assetType === 'video' ? 'video' : 'image',
          }),
        });
        if (trRes.ok) {
          const trData = await trRes.json();
          if (trData.url) {
            finalFileUrl = trData.url;
          }
        }
      }

      const tags = Array.from(
        new Set(
          tagsInput
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
          product_id: productId || null,
          asset_type: assetType,
          visibility,
          title: title.trim(),
          content: content || null,
          file_url: finalFileUrl,
          generation_meta: initialData?.generationMeta || {},
          tags,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || '存入素材库失败');
        return;
      }

      toast.success('已成功归档至云端素材库');
      onOpenChange(false);
      onSaved?.();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderPlus className="h-5 w-5 text-primary" />
            保存到云端素材库
          </DialogTitle>
          <DialogDescription>
            归档后的文案、话术与 R2 图/视频资产可供全空间成员检索和复用。
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSave} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="asset-title">素材标题</Label>
            <Input
              id="asset-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="输入易于检索的素材标题"
              required
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>资产类型</Label>
              <Select
                value={assetType}
                onValueChange={(v) => setAssetType(v as AssetType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(ASSET_TYPE_META) as AssetType[]).map((t) => (
                    <SelectItem key={t} value={t}>
                      {ASSET_TYPE_META[t].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>团队可见性</Label>
              <Select
                value={visibility}
                onValueChange={(v) => setVisibility(v as AssetVisibility)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="workspace">团队共享（空间可见）</SelectItem>
                  <SelectItem value="private">仅自己可见（私有）</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>关联产品（选填）</Label>
              <Select
                value={productId || 'none'}
                onValueChange={(v) => setProductId(v === 'none' ? '' : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="关联产品" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">不关联产品</SelectItem>
                  {products.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="asset-tags">自定义标签（逗号分隔）</Label>
              <Input
                id="asset-tags"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="例如：爆款开头, 抖音, 618"
              />
            </div>
          </div>

          {(assetType === 'copywriting' || assetType === 'script' || content) && (
            <div className="space-y-2">
              <Label htmlFor="asset-content">正文 / 备注内容</Label>
              <Textarea
                id="asset-content"
                rows={5}
                value={content}
                onChange={(e) => setContent(e.target.value)}
              />
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              取消
            </Button>
            <Button type="submit" disabled={saving}>
              {saving
                ? transferRemoteFile
                  ? '正在转存至 R2 并保存...'
                  : '保存中...'
                : '确认保存'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
