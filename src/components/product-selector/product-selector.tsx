'use client';

import React from 'react';
import { Package, Sparkles } from 'lucide-react';
import { useWorkspace } from '@/components/providers/workspace-provider';
import type { Product } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface ProductSelectorProps {
  value: string;
  onChange: (productId: string, product: Product | null) => void;
  showSummaryBadge?: boolean;
  className?: string;
}

export function ProductSelector({
  value,
  onChange,
  showSummaryBadge = true,
  className,
}: ProductSelectorProps) {
  const { products } = useWorkspace();
  const selectedProduct = products.find((p) => p.id === value) || null;

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className || ''}`}>
      <div className="flex items-center gap-1.5 min-w-[220px]">
        <Package className="h-4 w-4 text-primary shrink-0" />
        <Select
          value={value || 'none'}
          onValueChange={(nextVal) => {
            if (nextVal === 'none') {
              onChange('', null);
            } else {
              const found = products.find((p) => p.id === nextVal) || null;
              onChange(nextVal, found);
            }
          }}
        >
          <SelectTrigger className="h-8 text-xs bg-background">
            <SelectValue placeholder="关联产品档案（自动注入卖点）" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">不关联特定产品</SelectItem>
            {products.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {showSummaryBadge && selectedProduct && (
        <Badge
          variant="outline"
          className="gap-1 bg-indigo-50/70 text-indigo-700 border-indigo-200 max-w-[320px] truncate font-normal"
          title={selectedProduct.selling_points}
        >
          <Sparkles className="h-3 w-3 shrink-0" />
          <span className="truncate">
            已注入卖点：{selectedProduct.selling_points || selectedProduct.name}
          </span>
        </Badge>
      )}
    </div>
  );
}

export function buildProductSystemPrompt(product?: Product | null): string {
  if (!product) return '';
  const lines = [
    `【关联产品档案】`,
    `产品名称：${product.name}`,
    product.selling_points ? `核心卖点：${product.selling_points}` : '',
    product.target_audience ? `目标受众与痛点：${product.target_audience}` : '',
    product.specs_and_price ? `规格与价格机制：${product.specs_and_price}` : '',
    product.banned_words?.length
      ? `专属禁用词（严禁出现以下词汇）：${product.banned_words.join('、')}`
      : '',
  ].filter(Boolean);
  return lines.join('\n');
}
