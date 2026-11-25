'use client';

import React, { createContext, useContext } from 'react';
import type {
  ApiConfigPublic,
  Asset,
  CanvasNodeData,
  Product,
} from '@/lib/types';

export interface CanvasActionsContextValue {
  products: Product[];
  assets: Asset[];
  apiConfigs: ApiConfigPublic[];
  isRunningAll: boolean;
  updateNodeData: (
    nodeId: string,
    patch: Partial<CanvasNodeData>,
    markDownstreamStale?: boolean
  ) => void;
  runSingleNode: (nodeId: string) => Promise<void>;
  runDownstreamFrom: (nodeId: string) => Promise<void>;
  deleteNode: (nodeId: string) => void;
  duplicateNode: (nodeId: string) => void;
  openQuickAddFromNode: (nodeId: string) => void;
  archiveSingleNode: (nodeId: string) => Promise<void>;
}

const CanvasActionsContext = createContext<CanvasActionsContextValue | undefined>(
  undefined
);

export const CanvasActionsProvider = CanvasActionsContext.Provider;

export function useCanvasActions() {
  const ctx = useContext(CanvasActionsContext);
  if (!ctx) {
    throw new Error('useCanvasActions must be used inside CanvasActionsProvider');
  }
  return ctx;
}
