'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { ApiConfigPublic, Product, Workspace } from '@/lib/types';

export interface AuthUserInfo {
  id: string;
  email: string;
  isDemo: boolean;
}

interface WorkspaceContextValue {
  workspaces: Workspace[];
  activeWorkspace: Workspace | null;
  activeWorkspaceId: string;
  setActiveWorkspaceId: (id: string) => void;
  user: AuthUserInfo | null;
  supabaseConfigured: boolean;
  r2Configured: boolean;
  apiConfigs: ApiConfigPublic[];
  products: Product[];
  loading: boolean;
  refreshWorkspaces: () => Promise<void>;
  refreshApiConfigs: (workspaceId?: string) => Promise<void>;
  refreshProducts: (workspaceId?: string) => Promise<void>;
  createWorkspace: (name: string) => Promise<Workspace>;
  createInviteCode: (role?: 'admin' | 'member') => Promise<string>;
  joinWorkspaceByCode: (code: string) => Promise<Workspace>;
}

const WorkspaceContext = createContext<WorkspaceContextValue | undefined>(undefined);

const STORAGE_KEY = 'ai_workbench_active_workspace';

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceIdState] = useState<string>('');
  const [user, setUser] = useState<AuthUserInfo | null>(null);
  const [supabaseConfigured, setSupabaseConfigured] = useState<boolean>(false);
  const [r2Configured, setR2Configured] = useState<boolean>(false);
  const [apiConfigs, setApiConfigs] = useState<ApiConfigPublic[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const setActiveWorkspaceId = useCallback((id: string) => {
    setActiveWorkspaceIdState(id);
    if (typeof window !== 'undefined' && id) {
      window.localStorage.setItem(STORAGE_KEY, id);
    }
  }, []);

  const refreshApiConfigs = useCallback(
    async (targetWsId?: string) => {
      const wsId = targetWsId || activeWorkspaceId;
      if (!wsId) return;
      try {
        const res = await fetch(`/api/api-configs?workspaceId=${encodeURIComponent(wsId)}`);
        if (!res.ok) return;
        const data = await res.json();
        if (Array.isArray(data.configs)) {
          setApiConfigs(data.configs);
        }
      } catch {
        // Ignore transient fetch errors during initialization
      }
    },
    [activeWorkspaceId]
  );

  const refreshProducts = useCallback(
    async (targetWsId?: string) => {
      const wsId = targetWsId || activeWorkspaceId;
      if (!wsId) return;
      try {
        const res = await fetch(`/api/products?workspaceId=${encodeURIComponent(wsId)}`);
        if (!res.ok) return;
        const data = await res.json();
        if (Array.isArray(data.products)) {
          setProducts(data.products);
        }
      } catch {
        // Ignore transient fetch errors during initialization
      }
    },
    [activeWorkspaceId]
  );

  const refreshWorkspaces = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/workspaces');
      if (!res.ok) {
        setLoading(false);
        return;
      }
      const data = await res.json();
      const list: Workspace[] = Array.isArray(data.workspaces) ? data.workspaces : [];
      setWorkspaces(list);
      setUser(data.user || null);
      setSupabaseConfigured(Boolean(data.supabaseConfigured));
      setR2Configured(Boolean(data.r2Configured));

      const savedId =
        typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) : null;
      const matched = list.find((w) => w.id === savedId) || list[0];
      if (matched) {
        setActiveWorkspaceId(matched.id);
      }
    } finally {
      setLoading(false);
    }
  }, [setActiveWorkspaceId]);

  useEffect(() => {
    refreshWorkspaces();
  }, [refreshWorkspaces]);

  useEffect(() => {
    if (activeWorkspaceId) {
      refreshApiConfigs(activeWorkspaceId);
      refreshProducts(activeWorkspaceId);
    }
  }, [activeWorkspaceId, refreshApiConfigs, refreshProducts]);

  const createWorkspace = useCallback(
    async (name: string): Promise<Workspace> => {
      const res = await fetch('/api/workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create', name }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || '创建工作空间失败');
      }
      await refreshWorkspaces();
      if (data.workspace?.id) {
        setActiveWorkspaceId(data.workspace.id);
      }
      return data.workspace;
    },
    [refreshWorkspaces, setActiveWorkspaceId]
  );

  const createInviteCode = useCallback(
    async (role: 'admin' | 'member' = 'member'): Promise<string> => {
      if (!activeWorkspaceId) {
        throw new Error('请先选择工作空间');
      }
      const res = await fetch('/api/workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'invite',
          workspaceId: activeWorkspaceId,
          role,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || '生成邀请码失败');
      }
      return data.inviteCode;
    },
    [activeWorkspaceId]
  );

  const joinWorkspaceByCode = useCallback(
    async (code: string): Promise<Workspace> => {
      const res = await fetch('/api/workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'join', inviteCode: code }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || '加入工作空间失败');
      }
      await refreshWorkspaces();
      if (data.workspace?.id) {
        setActiveWorkspaceId(data.workspace.id);
      }
      return data.workspace;
    },
    [refreshWorkspaces, setActiveWorkspaceId]
  );

  const activeWorkspace = useMemo(
    () => workspaces.find((w) => w.id === activeWorkspaceId) || workspaces[0] || null,
    [workspaces, activeWorkspaceId]
  );

  const value: WorkspaceContextValue = {
    workspaces,
    activeWorkspace,
    activeWorkspaceId: activeWorkspace?.id || activeWorkspaceId,
    setActiveWorkspaceId,
    user,
    supabaseConfigured,
    r2Configured,
    apiConfigs,
    products,
    loading,
    refreshWorkspaces,
    refreshApiConfigs,
    refreshProducts,
    createWorkspace,
    createInviteCode,
    joinWorkspaceByCode,
  };

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) {
    throw new Error('useWorkspace must be used inside WorkspaceProvider');
  }
  return ctx;
}
