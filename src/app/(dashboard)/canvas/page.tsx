'use client';

import React, {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useSearchParams } from 'next/navigation';
import {
  addEdge,
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type OnConnectEnd,
  type Viewport,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  Archive,
  CheckCircle2,
  Copy,
  Download,
  FileImage,
  FileText,
  FolderPlus,
  Layers,
  LayoutGrid,
  LayoutTemplate,
  Loader2,
  Maximize2,
  Package,
  Play,
  Plus,
  Redo2,
  RefreshCw,
  RotateCw,
  Save,
  SlidersHorizontal,
  Trash2,
  Undo2,
  Upload,
  Workflow,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { useWorkspace } from '@/components/providers/workspace-provider';
import { CanvasActionsProvider } from '@/components/canvas/canvas-context';
import {
  AssetInputNode,
  ImageGenNode,
  LlmFissionNode,
  ProductInputNode,
  ResultDisplayNode,
  StoryboardNode,
  TextNoteNode,
  VideoGenNode,
  type WorkflowNode,
} from '@/components/canvas/custom-nodes';
import { NodeInspector } from '@/components/canvas/node-inspector';
import {
  CANVAS_NODE_PALETTE,
  QuickAddMenu,
  type QuickAddSelection,
} from '@/components/canvas/quick-add-menu';
import { CANVAS_TEMPLATES } from '@/lib/canvas-templates';
import { streamAiChat } from '@/lib/ai-stream';
import type {
  Asset,
  CanvasFlowEdge,
  CanvasFlowNode,
  CanvasNodeData,
  CanvasNodeKind,
  CanvasWorkflow,
  Product,
  StoryboardPromptCard,
} from '@/lib/types';
import { Badge } from '@/components/ui/badge';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

// Module-level constant nodeTypes as required by React Flow
const nodeTypes = {
  textNote: TextNoteNode,
  productInput: ProductInputNode,
  assetInput: AssetInputNode,
  llmFission: LlmFissionNode,
  storyboard: StoryboardNode,
  imageGen: ImageGenNode,
  videoGen: VideoGenNode,
  resultDisplay: ResultDisplayNode,
};

const SOURCE_ONLY_KINDS = new Set<string>(['productInput', 'assetInput', 'textNote']);

const DEFAULT_EDGE_OPTIONS = {
  type: 'smoothstep',
  markerEnd: {
    type: MarkerType.ArrowClosed,
    width: 18,
    height: 18,
    color: '#64748b',
  },
  style: {
    strokeWidth: 2,
    stroke: '#94a3b8',
  },
};

function parseStoryboardJson(raw: string): StoryboardPromptCard[] {
  try {
    const cleaned = raw
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .trim();
    const start = cleaned.indexOf('[');
    const end = cleaned.lastIndexOf(']');
    if (start !== -1 && end !== -1) {
      const parsed = JSON.parse(cleaned.slice(start, end + 1));
      if (Array.isArray(parsed)) return parsed as StoryboardPromptCard[];
    }
  } catch {
    // fallback below
  }
  return [];
}

function getDownstreamIds(startId: string, edges: Edge[]): string[] {
  const visited = new Set<string>();
  const queue: string[] = [];
  for (const e of edges) {
    if (e.source === startId && !visited.has(e.target)) {
      visited.add(e.target);
      queue.push(e.target);
    }
  }
  const order: string[] = [];
  while (queue.length > 0) {
    const curr = queue.shift()!;
    order.push(curr);
    for (const e of edges) {
      if (e.source === curr && !visited.has(e.target)) {
        visited.add(e.target);
        queue.push(e.target);
      }
    }
  }
  return order;
}

function wouldCreateCycle(source: string, target: string, edges: Edge[]): boolean {
  if (source === target) return true;
  const downstreamOfTarget = getDownstreamIds(target, edges);
  return downstreamOfTarget.includes(source);
}

function topoSortSubset(subsetIds: Set<string>, edges: Edge[]): string[] {
  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();

  subsetIds.forEach((id) => {
    inDegree.set(id, 0);
    adj.set(id, []);
  });

  for (const e of edges) {
    if (subsetIds.has(e.source) && subsetIds.has(e.target)) {
      adj.get(e.source)!.push(e.target);
      inDegree.set(e.target, (inDegree.get(e.target) || 0) + 1);
    }
  }

  const queue: string[] = [];
  inDegree.forEach((deg, id) => {
    if (deg === 0) queue.push(id);
  });

  const sorted: string[] = [];
  while (queue.length > 0) {
    const u = queue.shift()!;
    sorted.push(u);
    for (const v of adj.get(u) || []) {
      const nextDeg = (inDegree.get(v) || 0) - 1;
      inDegree.set(v, nextDeg);
      if (nextDeg === 0) queue.push(v);
    }
  }

  subsetIds.forEach((id) => {
    if (!sorted.includes(id)) sorted.push(id);
  });

  return sorted;
}

function buildDefaultNodeData(
  kind: CanvasNodeKind,
  extra?: Partial<CanvasNodeData>
): CanvasNodeData {
  const meta = CANVAS_NODE_PALETTE.find((n) => n.type === kind);
  const base: CanvasNodeData = {
    label: meta?.title || '节点',
    status: SOURCE_ONLY_KINDS.has(kind) ? 'done' : 'idle',
  };
  if (kind === 'textNote') {
    base.noteText = '';
  } else if (kind === 'llmFission') {
    base.fissionMode = 'short_video';
    base.instruction = '根据上游产品卖点生成高转化短视频口播稿';
    base.outputText = '';
  } else if (kind === 'storyboard') {
    base.shotCount = 3;
    base.aspectRatio = '9:16';
    base.selectedShotIndex = 0;
    base.shots = [];
  } else if (kind === 'imageGen') {
    base.aspectRatio = '9:16';
    base.mediaMode = 't2i';
    base.batchCount = 1;
    base.resolution = '1024x1024';
  } else if (kind === 'videoGen') {
    base.aspectRatio = '9:16';
    base.mediaMode = 'i2v';
    base.durationSec = 5;
    base.resolution = '720p';
    base.cameraMovement = 'static';
    base.fps = 24;
  } else if (kind === 'resultDisplay') {
    base.status = 'idle';
  }
  return { ...base, ...extra };
}

interface QuickAddState {
  open: boolean;
  screenX: number;
  screenY: number;
  flowPosition: { x: number; y: number };
  connectFromNodeId?: string | null;
  connectFromKind?: CanvasNodeKind | null;
  connectFromLabel?: string | null;
}

interface NodeContextMenuState {
  open: boolean;
  nodeId: string;
  screenX: number;
  screenY: number;
}

interface HistorySnapshot {
  nodes: WorkflowNode[];
  edges: Edge[];
}

function CanvasEditor() {
  const searchParams = useSearchParams();
  const { activeWorkspaceId, products, apiConfigs } = useWorkspace();
  const {
    screenToFlowPosition,
    flowToScreenPosition,
    fitView,
    getViewport,
    setViewport,
  } = useReactFlow();

  const canvasContainerRef = useRef<HTMLDivElement | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const lastPaneClickRef = useRef<{ time: number; x: number; y: number }>({
    time: 0,
    x: 0,
    y: 0,
  });

  const [nodes, setNodes, onNodesChange] = useNodesState<WorkflowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const nodesRef = useRef<WorkflowNode[]>(nodes);
  const edgesRef = useRef<Edge[]>(edges);
  nodesRef.current = nodes;
  edgesRef.current = edges;

  const [workflows, setWorkflows] = useState<CanvasWorkflow[]>([]);
  const [activeWorkflowId, setActiveWorkflowId] = useState<string>('');
  const [workflowName, setWorkflowName] = useState('爆款短视频全链路生产流');
  const [assets, setAssets] = useState<Asset[]>([]);

  // Inspector & drawers
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState<boolean>(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [newWfOpen, setNewWfOpen] = useState(false);
  const [newWfName, setNewWfName] = useState('');

  // Execution & Save status
  const [saving, setSaving] = useState(false);
  const [saveState, setSaveState] = useState<'saved' | 'dirty' | 'saving'>('saved');
  const [isRunningAll, setIsRunningAll] = useState(false);
  const [archivingAll, setArchivingAll] = useState(false);
  const [zoomPercent, setZoomPercent] = useState<number>(100);

  // Undo / Redo & Clipboard
  const [past, setPast] = useState<HistorySnapshot[]>([]);
  const [future, setFuture] = useState<HistorySnapshot[]>([]);
  const clipboardRef = useRef<WorkflowNode | null>(null);
  const hydratedRef = useRef(false);

  const [quickAdd, setQuickAdd] = useState<QuickAddState>({
    open: false,
    screenX: 240,
    screenY: 180,
    flowPosition: { x: 240, y: 180 },
  });

  const [nodeCtxMenu, setNodeCtxMenu] = useState<NodeContextMenuState>({
    open: false,
    nodeId: '',
    screenX: 0,
    screenY: 0,
  });

  // STRICT ISOLATION: text configs only for LLM/storyboard
  const activeTextConfigs = useMemo(
    () =>
      apiConfigs.filter(
        (c) => c.is_active && c.api_type === 'text' && (c.models || []).length > 0
      ),
    [apiConfigs]
  );

  const pushHistory = useCallback(() => {
    setPast((prev) => [
      ...prev.slice(-29),
      {
        nodes: structuredClone(nodesRef.current),
        edges: structuredClone(edgesRef.current),
      },
    ]);
    setFuture([]);
    setSaveState('dirty');
  }, []);

  const handleUndo = useCallback(() => {
    setPast((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      setFuture((f) => [
        {
          nodes: structuredClone(nodesRef.current),
          edges: structuredClone(edgesRef.current),
        },
        ...f.slice(0, 29),
      ]);
      setNodes(last.nodes);
      setEdges(last.edges);
      setSaveState('dirty');
      toast.info('已撤销上一步操作');
      return prev.slice(0, -1);
    });
  }, [setNodes, setEdges]);

  const handleRedo = useCallback(() => {
    setFuture((prev) => {
      if (prev.length === 0) return prev;
      const [next, ...rest] = prev;
      setPast((p) => [
        ...p.slice(-29),
        {
          nodes: structuredClone(nodesRef.current),
          edges: structuredClone(edgesRef.current),
        },
      ]);
      setNodes(next.nodes);
      setEdges(next.edges);
      setSaveState('dirty');
      toast.info('已重做操作');
      return rest;
    });
  }, [setNodes, setEdges]);

  const loadAssets = useCallback(async () => {
    if (!activeWorkspaceId) return;
    const res = await fetch(
      `/api/assets?workspaceId=${encodeURIComponent(activeWorkspaceId)}`
    );
    if (res.ok) {
      const data = await res.json();
      setAssets(Array.isArray(data.assets) ? data.assets : []);
    }
  }, [activeWorkspaceId]);

  const applyWorkflowToCanvas = useCallback(
    (wf: CanvasWorkflow) => {
      hydratedRef.current = false;
      setActiveWorkflowId(wf.id);
      setWorkflowName(wf.name);
      setNodes((wf.nodes || []) as WorkflowNode[]);
      setEdges((wf.edges || []) as Edge[]);
      setPast([]);
      setFuture([]);
      setSaveState('saved');
      setTimeout(() => {
        if (wf.viewport && typeof wf.viewport.zoom === 'number' && wf.viewport.zoom > 0.1) {
          setViewport(wf.viewport, { duration: 150 });
          setZoomPercent(Math.round(wf.viewport.zoom * 100));
        } else {
          fitView({ padding: 0.18 });
        }
        hydratedRef.current = true;
      }, 90);
    },
    [setNodes, setEdges, setViewport, fitView]
  );

  const loadWorkflows = useCallback(async () => {
    if (!activeWorkspaceId) return;
    const res = await fetch(
      `/api/canvas/workflows?workspaceId=${encodeURIComponent(activeWorkspaceId)}`
    );
    if (!res.ok) return;
    const data = await res.json();
    const list: CanvasWorkflow[] = Array.isArray(data.workflows)
      ? data.workflows
      : [];
    setWorkflows(list);

    const requestedWfId = searchParams.get('workflowId');
    if (list.length > 0) {
      const target =
        (requestedWfId && list.find((w) => w.id === requestedWfId)) || list[0];
      applyWorkflowToCanvas(target);
    } else {
      const tpl = CANVAS_TEMPLATES[0].build(products[0]?.id || '');
      setActiveWorkflowId('');
      setWorkflowName(CANVAS_TEMPLATES[0].name);
      setNodes(tpl.nodes as WorkflowNode[]);
      setEdges(tpl.edges as Edge[]);
      setTimeout(() => {
        fitView({ padding: 0.18 });
        hydratedRef.current = true;
      }, 90);
    }
  }, [activeWorkspaceId, products, searchParams, applyWorkflowToCanvas, setNodes, setEdges, fitView]);

  useEffect(() => {
    loadAssets();
    loadWorkflows();
  }, [loadAssets, loadWorkflows]);

  const handleSaveWorkflow = useCallback(
    async (silent = false) => {
      if (!activeWorkspaceId) return;
      setSaving(true);
      setSaveState('saving');
      try {
        const cleanNodes = nodesRef.current.map((n) => ({
          id: n.id,
          type: (n.type || 'llmFission') as CanvasNodeKind,
          position: n.position,
          data: n.data,
        })) as CanvasFlowNode[];

        const cleanEdges = edgesRef.current.map((e) => ({
          id: e.id,
          source: e.source,
          target: e.target,
          sourceHandle: e.sourceHandle ?? null,
          targetHandle: e.targetHandle ?? null,
        })) as CanvasFlowEdge[];

        const vp = getViewport();

        if (activeWorkflowId) {
          const res = await fetch(`/api/canvas/workflows/${activeWorkflowId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: workflowName.trim() || '未命名画布工作流',
              nodes: cleanNodes,
              edges: cleanEdges,
              viewport: vp,
            }),
          });
          if (!res.ok) {
            if (!silent) {
              const d = await res.json();
              toast.error(d.error || '保存画布失败');
            }
            setSaveState('dirty');
            return;
          }
          const data = await res.json();
          setWorkflows((prev) =>
            prev.map((w) => (w.id === data.workflow.id ? data.workflow : w))
          );
          setSaveState('saved');
          if (!silent) toast.success('工作流画布已保存到云端');
        } else {
          const res = await fetch('/api/canvas/workflows', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              workspace_id: activeWorkspaceId,
              name: workflowName.trim() || '新建画布工作流',
              nodes: cleanNodes,
              edges: cleanEdges,
              viewport: vp,
            }),
          });
          if (!res.ok) {
            if (!silent) {
              const d = await res.json();
              toast.error(d.error || '保存画布失败');
            }
            setSaveState('dirty');
            return;
          }
          const data = await res.json();
          setWorkflows((prev) => [data.workflow, ...prev]);
          setActiveWorkflowId(data.workflow.id);
          setSaveState('saved');
          if (!silent) toast.success('已创建并保存新工作流');
        }
      } finally {
        setSaving(false);
      }
    },
    [activeWorkspaceId, activeWorkflowId, workflowName, getViewport]
  );

  // Debounced Auto-Save (2 seconds after dirty change for persisted workflows)
  useEffect(() => {
    if (!hydratedRef.current || !activeWorkflowId || saveState !== 'dirty') return;
    const timer = setTimeout(() => {
      handleSaveWorkflow(true);
    }, 2000);
    return () => clearTimeout(timer);
  }, [saveState, activeWorkflowId, nodes, edges, workflowName, handleSaveWorkflow]);

  const handleSelectWorkflow = (wfId: string) => {
    const found = workflows.find((w) => w.id === wfId);
    if (!found) return;
    applyWorkflowToCanvas(found);
  };

  const handleCreateWorkflow = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeWorkspaceId || !newWfName.trim()) return;
    const tpl = CANVAS_TEMPLATES[0].build(products[0]?.id || '');
    const res = await fetch('/api/canvas/workflows', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspace_id: activeWorkspaceId,
        name: newWfName.trim(),
        description: '自定义可视化工作流',
        nodes: tpl.nodes,
        edges: tpl.edges,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      setWorkflows((prev) => [data.workflow, ...prev]);
      applyWorkflowToCanvas(data.workflow);
      setNewWfName('');
      setNewWfOpen(false);
      toast.success('已创建新工作流画布');
    }
  };

  const handleDeleteCurrentWorkflow = async () => {
    if (!activeWorkflowId) return;
    const res = await fetch(`/api/canvas/workflows/${activeWorkflowId}`, {
      method: 'DELETE',
    });
    if (res.ok) {
      const rest = workflows.filter((w) => w.id !== activeWorkflowId);
      setWorkflows(rest);
      if (rest.length > 0) {
        applyWorkflowToCanvas(rest[0]);
      } else {
        const tpl = CANVAS_TEMPLATES[0].build(products[0]?.id || '');
        setActiveWorkflowId('');
        setWorkflowName(CANVAS_TEMPLATES[0].name);
        setNodes(tpl.nodes as WorkflowNode[]);
        setEdges(tpl.edges as Edge[]);
      }
      toast.success('已删除当前画布工作流');
    }
  };

  const applyTemplate = (templateId: string) => {
    const tpl = CANVAS_TEMPLATES.find((t) => t.id === templateId);
    if (!tpl) return;
    pushHistory();
    const built = tpl.build(products[0]?.id || '');
    setNodes(built.nodes as WorkflowNode[]);
    setEdges(built.edges as Edge[]);
    setWorkflowName(tpl.name);
    setTemplateOpen(false);
    toast.success(`已套用模板「${tpl.name}」`);
    setTimeout(() => fitView({ padding: 0.18 }), 80);
  };

  // Export / Import JSON
  const handleExportJson = () => {
    const payload = {
      version: '2.1',
      name: workflowName,
      exportedAt: new Date().toISOString(),
      viewport: getViewport(),
      nodes: nodesRef.current.map((n) => ({
        id: n.id,
        type: n.type,
        position: n.position,
        data: n.data,
      })),
      edges: edgesRef.current.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle ?? null,
        targetHandle: e.targetHandle ?? null,
      })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${workflowName.replace(/[^\w\u4e00-\u9fa5-]+/g, '_') || 'workflow'}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('已导出工作流 JSON 文件');
  };

  const handleImportJson = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) {
        toast.error('JSON 格式无效：缺少 nodes 或 edges 字段');
        return;
      }
      pushHistory();
      setNodes(parsed.nodes as WorkflowNode[]);
      setEdges(parsed.edges as Edge[]);
      if (parsed.name) setWorkflowName(String(parsed.name));
      setSaveState('dirty');
      toast.success(`已导入 ${parsed.nodes.length} 个节点`);
      setTimeout(() => fitView({ padding: 0.18 }), 80);
    } catch {
      toast.error('导入失败，请检查 JSON 文件格式');
    } finally {
      e.target.value = '';
    }
  };

  const handleAutoLayout = useCallback(() => {
    const currentNodes = nodesRef.current;
    const currentEdges = edgesRef.current;
    if (currentNodes.length === 0) return;

    pushHistory();
    const idSet = new Set(currentNodes.map((n) => n.id));
    const sorted = topoSortSubset(idSet, currentEdges);
    const levelMap = new Map<string, number>();

    for (const id of sorted) {
      const incoming = currentEdges.filter(
        (e) => e.target === id && idSet.has(e.source)
      );
      if (incoming.length === 0) {
        levelMap.set(id, 0);
      } else {
        const maxParent = Math.max(
          ...incoming.map((e) => levelMap.get(e.source) ?? 0)
        );
        levelMap.set(id, maxParent + 1);
      }
    }

    const columns = new Map<number, string[]>();
    for (const id of sorted) {
      const lvl = levelMap.get(id) ?? 0;
      const arr = columns.get(lvl) || [];
      arr.push(id);
      columns.set(lvl, arr);
    }

    const posMap = new Map<string, { x: number; y: number }>();
    columns.forEach((ids, colIdx) => {
      ids.forEach((id, rowIdx) => {
        posMap.set(id, {
          x: 60 + colIdx * 390,
          y: 80 + rowIdx * 310,
        });
      });
    });

    setNodes((nds) =>
      nds.map((n) => ({
        ...n,
        position: posMap.get(n.id) || n.position,
      }))
    );
    toast.success('已按拓扑层级自动整理排版');
    setTimeout(() => fitView({ padding: 0.18 }), 80);
  }, [setNodes, fitView, pushHistory]);

  const updateNodeData = useCallback(
    (
      nodeId: string,
      patch: Partial<CanvasNodeData>,
      markDownstreamStale = false
    ) => {
      const downstream = markDownstreamStale
        ? new Set(getDownstreamIds(nodeId, edgesRef.current))
        : new Set<string>();

      setNodes((nds) =>
        nds.map((node) => {
          if (node.id === nodeId) {
            return { ...node, data: { ...node.data, ...patch } };
          }
          if (downstream.has(node.id) && node.data.status === 'done') {
            return { ...node, data: { ...node.data, status: 'stale' } };
          }
          return node;
        })
      );
      if (hydratedRef.current) {
        setSaveState('dirty');
      }
    },
    [setNodes]
  );

  const deleteNode = useCallback(
    (nodeId: string) => {
      pushHistory();
      setNodes((nds) => nds.filter((n) => n.id !== nodeId));
      setEdges((eds) =>
        eds.filter((e) => e.source !== nodeId && e.target !== nodeId)
      );
      if (selectedNodeId === nodeId) setSelectedNodeId(null);
    },
    [setNodes, setEdges, pushHistory, selectedNodeId]
  );

  const duplicateNode = useCallback(
    (nodeId: string) => {
      const target = nodesRef.current.find((n) => n.id === nodeId);
      if (!target) return;
      pushHistory();
      const newId = `node-${target.type || 'custom'}-${Date.now().toString(36)}`;
      const cloned: WorkflowNode = {
        ...target,
        id: newId,
        selected: true,
        position: {
          x: target.position.x + 56,
          y: target.position.y + 56,
        },
        data: {
          ...structuredClone(target.data),
          label: `${target.data.label} (副本)`,
        },
      };
      setNodes((nds) => [
        ...nds.map((n) => ({ ...n, selected: false })),
        cloned,
      ]);
      setSelectedNodeId(newId);
      toast.success('已复制节点');
    },
    [setNodes, pushHistory]
  );

  const openQuickAddFromNode = useCallback(
    (nodeId: string) => {
      const node = nodesRef.current.find((n) => n.id === nodeId);
      if (!node) return;
      const targetFlowPos = {
        x: node.position.x + 390,
        y: node.position.y,
      };
      const screenPt = flowToScreenPosition(targetFlowPos);
      const rect = canvasContainerRef.current?.getBoundingClientRect();
      const relX = rect ? screenPt.x - rect.left : 420;
      const relY = rect ? screenPt.y - rect.top : 180;

      setNodeCtxMenu((prev) => ({ ...prev, open: false }));
      setQuickAdd({
        open: true,
        screenX: relX,
        screenY: relY,
        flowPosition: targetFlowPos,
        connectFromNodeId: node.id,
        connectFromKind: (node.type || 'llmFission') as CanvasNodeKind,
        connectFromLabel: node.data.label,
      });
    },
    [flowToScreenPosition]
  );

  // Global keyboard shortcuts: `/`, Ctrl+Z, Ctrl+Shift+Z, Ctrl+C, Ctrl+V, Ctrl+S, `0`
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isEditingText =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      const mod = e.ctrlKey || e.metaKey;

      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleSaveWorkflow(false);
        return;
      }

      if (isEditingText) return;

      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
        return;
      }

      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
        return;
      }

      if (mod && e.key.toLowerCase() === 'c' && selectedNodeId) {
        const found = nodesRef.current.find((n) => n.id === selectedNodeId);
        if (found) {
          clipboardRef.current = structuredClone(found);
          toast.info(`已复制节点「${found.data.label}」`);
        }
        return;
      }

      if (mod && e.key.toLowerCase() === 'v' && clipboardRef.current) {
        e.preventDefault();
        const src = clipboardRef.current;
        pushHistory();
        const newId = `node-${src.type || 'custom'}-${Date.now().toString(36)}`;
        const pasted: WorkflowNode = {
          ...structuredClone(src),
          id: newId,
          selected: true,
          position: { x: src.position.x + 60, y: src.position.y + 60 },
          data: {
            ...structuredClone(src.data),
            label: `${src.data.label} (粘贴)`,
          },
        };
        clipboardRef.current = pasted;
        setNodes((nds) => [
          ...nds.map((n) => ({ ...n, selected: false })),
          pasted,
        ]);
        setSelectedNodeId(newId);
        toast.success('已粘贴节点');
        return;
      }

      if (e.key === '0' && !mod) {
        e.preventDefault();
        fitView({ padding: 0.18, duration: 200 });
        return;
      }

      if (e.key === '/') {
        e.preventDefault();
        const rect = canvasContainerRef.current?.getBoundingClientRect();
        const centerX = rect ? rect.width / 2 - 160 : 300;
        const centerY = rect ? rect.height / 2 - 150 : 200;
        const flowPos = screenToFlowPosition({
          x: (rect?.left || 0) + (rect?.width || 800) / 2,
          y: (rect?.top || 0) + (rect?.height || 600) / 2,
        });
        setNodeCtxMenu((prev) => ({ ...prev, open: false }));
        setQuickAdd({
          open: true,
          screenX: Math.max(24, centerX),
          screenY: Math.max(80, centerY),
          flowPosition: flowPos,
          connectFromNodeId: null,
          connectFromKind: null,
          connectFromLabel: null,
        });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    handleSaveWorkflow,
    handleUndo,
    handleRedo,
    selectedNodeId,
    pushHistory,
    setNodes,
    fitView,
    screenToFlowPosition,
  ]);

  const collectUpstreamContext = useCallback(
    (targetId: string) => {
      const currentNodes = nodesRef.current;
      const currentEdges = edgesRef.current;

      const visited = new Set<string>();
      const queue: string[] = [];
      for (const e of currentEdges) {
        if (e.target === targetId && !visited.has(e.source)) {
          visited.add(e.source);
          queue.push(e.source);
        }
      }
      while (queue.length > 0) {
        const curr = queue.shift()!;
        for (const e of currentEdges) {
          if (e.target === curr && !visited.has(e.source)) {
            visited.add(e.source);
            queue.push(e.source);
          }
        }
      }

      const sortedIds = topoSortSubset(visited, currentEdges);
      const ancestors = sortedIds
        .map((id) => currentNodes.find((n) => n.id === id))
        .filter((n): n is WorkflowNode => Boolean(n));

      let product: Product | null = null;
      const noteTexts: string[] = [];
      const customHooks: string[] = [];
      const assetTexts: string[] = [];
      const llmOutputs: string[] = [];
      let activeShot: StoryboardPromptCard | null = null;
      let referenceImageUrl = '';
      let latestResultUrl = '';
      let latestOutputText = '';

      for (const anc of ancestors) {
        if (anc.type === 'textNote') {
          if (anc.data.noteText?.trim()) {
            noteTexts.push(anc.data.noteText.trim());
            latestOutputText = anc.data.noteText.trim();
          }
        } else if (anc.type === 'productInput') {
          if (anc.data.productId) {
            product = products.find((p) => p.id === anc.data.productId) || product;
          }
          if (anc.data.customHookNote) {
            customHooks.push(anc.data.customHookNote);
          }
          if (!referenceImageUrl && product?.reference_images?.[0]) {
            referenceImageUrl = product.reference_images[0];
          }
        } else if (anc.type === 'assetInput') {
          const found = assets.find((a) => a.id === anc.data.assetId);
          const text = anc.data.assetContent || found?.content || '';
          const fileUrl = anc.data.assetFileUrl || found?.file_url || '';
          if (text) {
            assetTexts.push(text);
            latestOutputText = text;
          }
          if (fileUrl) {
            referenceImageUrl = fileUrl;
            latestResultUrl = fileUrl;
          }
        } else if (anc.type === 'llmFission') {
          if (anc.data.outputText) {
            llmOutputs.push(anc.data.outputText);
            latestOutputText = anc.data.outputText;
          }
        } else if (anc.type === 'storyboard') {
          const shots = anc.data.shots || [];
          const idx = anc.data.selectedShotIndex ?? 0;
          if (shots[idx]) {
            activeShot = shots[idx];
            latestOutputText = `${shots[idx].visual_zh}\n${shots[idx].prompt_en}`;
          }
        } else if (anc.type === 'imageGen') {
          const chosen =
            anc.data.resultUrls?.[anc.data.selectedResultIndex ?? 0] ||
            anc.data.resultUrl ||
            '';
          if (chosen) {
            referenceImageUrl = chosen;
            latestResultUrl = chosen;
          }
        } else if (anc.type === 'videoGen') {
          if (anc.data.resultUrl) {
            latestResultUrl = anc.data.resultUrl;
          }
        } else if (anc.type === 'resultDisplay') {
          if (anc.data.resultUrl) {
            referenceImageUrl = anc.data.resultUrl;
            latestResultUrl = anc.data.resultUrl;
          }
          if (anc.data.outputText) {
            latestOutputText = anc.data.outputText;
          }
        }
      }

      return {
        product,
        noteTexts,
        customHooks,
        assetTexts,
        llmOutputs,
        activeShot,
        referenceImageUrl,
        latestResultUrl,
        latestOutputText,
      };
    },
    [products, assets]
  );

  const setIncomingEdgesAnimated = useCallback(
    (nodeId: string, animated: boolean) => {
      setEdges((eds) =>
        eds.map((e) =>
          e.target === nodeId
            ? {
                ...e,
                animated,
                style: animated
                  ? { strokeWidth: 2.5, stroke: '#4f46e5' }
                  : { strokeWidth: 2, stroke: '#94a3b8' },
              }
            : e
        )
      );
    },
    [setEdges]
  );

  const executeSingleNode = useCallback(
    async (nodeId: string): Promise<void> => {
      if (!activeWorkspaceId) return;
      const node = nodesRef.current.find((n) => n.id === nodeId);
      if (!node) return;

      if (SOURCE_ONLY_KINDS.has(node.type || '')) {
        updateNodeData(nodeId, { status: 'done', errorMessage: undefined });
        return;
      }

      const upstream = collectUpstreamContext(nodeId);
      setIncomingEdgesAnimated(nodeId, true);
      updateNodeData(nodeId, {
        status: 'running',
        errorMessage: undefined,
        progress: 15,
      });

      try {
        if (node.type === 'resultDisplay') {
          updateNodeData(nodeId, {
            resultUrl: upstream.latestResultUrl || node.data.resultUrl || '',
            outputText: upstream.latestOutputText || node.data.outputText || '',
            status: 'done',
            lastRunSnapshot: {
              executedAt: new Date().toISOString(),
            },
          });
          return;
        }

        if (node.type === 'llmFission') {
          const modeLabelMap: Record<string, string> = {
            hooks: '前 3 秒黄金痛点钩子（输出 5 条不同情绪切入句式）',
            short_video: '短视频带货口播稿（150-220字，含黄金开头+卖点+转化）',
            seeding_post: '小红书高互动种草图文（含3个爆款标题+正文+标签）',
            live_script: '直播间高转化逼单话术（痛点+核心卖点+限时机制）',
            custom: '自定义电商内容创作',
          };
          const modeKey = node.data.fissionMode || 'short_video';
          const scene = modeKey === 'live_script' ? 'live_script' : 'copywriting';

          const contextParts = [
            upstream.noteTexts.length
              ? `上游文本/Prompt 输入：\n${upstream.noteTexts.join('\n\n')}`
              : '',
            upstream.customHooks.length
              ? `上游产品补充亮点/机制：\n${upstream.customHooks.join('\n')}`
              : '',
            upstream.assetTexts.length
              ? `上游参考素材文案：\n${upstream.assetTexts.join('\n\n')}`
              : '',
            upstream.llmOutputs.length
              ? `上游节点输出参考：\n${upstream.llmOutputs.join('\n\n')}`
              : '',
          ].filter(Boolean);

          const validTextCfg =
            activeTextConfigs.find((c) => c.id === node.data.configId) ||
            activeTextConfigs.find((c) => c.is_default) ||
            activeTextConfigs[0];
          const modelName = node.data.model || validTextCfg?.models[0];

          const res = await streamAiChat({
            workspaceId: activeWorkspaceId,
            configId: validTextCfg?.id,
            model: modelName,
            productId: upstream.product?.id,
            scene,
            systemPrompt:
              '你是画布工作流中的资深 AI 内容裂变节点。请直接输出高质量、可直接使用的中文正文，无需寒暄。',
            messages: [
              {
                role: 'user',
                content: [
                  `任务类型：${modeLabelMap[modeKey] || modeKey}`,
                  node.data.instruction
                    ? `节点补充指令：${node.data.instruction}`
                    : '',
                  ...contextParts,
                ]
                  .filter(Boolean)
                  .join('\n\n'),
              },
            ],
            onDelta: (_chunk, full) => {
              updateNodeData(nodeId, { outputText: full });
            },
          });

          updateNodeData(nodeId, {
            outputText: res.content,
            status: 'done',
            lastRunSnapshot: {
              model: modelName || 'demo',
              executedAt: new Date().toISOString(),
            },
          });
        } else if (node.type === 'storyboard') {
          const shotCount = node.data.shotCount || 3;
          const aspectRatio = node.data.aspectRatio || '9:16';
          const cfg =
            activeTextConfigs.find((c) => c.is_default) || activeTextConfigs[0];

          const contextText = [
            upstream.noteTexts.join('\n\n'),
            upstream.customHooks.join('\n'),
            upstream.llmOutputs.join('\n\n'),
            upstream.assetTexts.join('\n\n'),
          ]
            .filter(Boolean)
            .join('\n\n');

          const res = await streamAiChat({
            workspaceId: activeWorkspaceId,
            configId: cfg?.id,
            model: cfg?.models[0],
            productId: upstream.product?.id,
            scene: 'storyboard',
            systemPrompt: [
              '你是电商视觉导演与分镜提示词专家。',
              `请输出严格合法的 JSON 数组（包含 ${shotCount} 个分镜对象），不要输出 JSON 以外的说明文字。`,
              '字段要求：shot_number, shot_type, duration, visual_zh, prompt_en, negative_prompt, camera_movement, lighting_style, aspect_ratio, suggested_tool。',
            ].join('\n'),
            messages: [
              {
                role: 'user',
                content: `请基于以下上游脚本与产品信息拆解 ${shotCount} 个视觉分镜（比例 ${aspectRatio}）：\n\n${
                  contextText || upstream.product?.name || '热销电商主推单品展示'
                }`,
              },
            ],
            onDelta: () => {},
          });

          const parsed = parseStoryboardJson(res.content);
          if (parsed.length === 0) {
            throw new Error('分镜 JSON 解析失败，请重试');
          }
          updateNodeData(nodeId, {
            shots: parsed,
            selectedShotIndex: 0,
            status: 'done',
            lastRunSnapshot: {
              model: cfg?.models[0] || 'demo',
              executedAt: new Date().toISOString(),
            },
          });
        } else if (node.type === 'imageGen' || node.type === 'videoGen') {
          const isVideo = node.type === 'videoGen';
          const autoPrompt =
            node.data.promptOverride?.trim() ||
            upstream.activeShot?.prompt_en ||
            upstream.noteTexts[upstream.noteTexts.length - 1] ||
            upstream.llmOutputs[0]?.slice(0, 260) ||
            (upstream.product
              ? `Commercial studio shot of ${upstream.product.name}, ${upstream.product.selling_points.slice(0, 120)}`
              : 'Minimalist e-commerce commercial visual, studio lighting, 8k');

          const aspectRatio =
            node.data.aspectRatio ||
            upstream.activeShot?.aspect_ratio ||
            '9:16';

          const mediaMode =
            node.data.mediaMode ||
            (isVideo
              ? upstream.referenceImageUrl
                ? 'i2v'
                : 't2v'
              : upstream.referenceImageUrl
                ? 'i2i'
                : 't2i');

          const batchCount = isVideo ? 1 : Math.min(4, Math.max(1, node.data.batchCount || 1));

          const submitRes = await fetch('/api/ai/media', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              workspace_id: activeWorkspaceId,
              product_id: upstream.product?.id || null,
              api_config_id: node.data.configId || null,
              node_id: nodeId,
              task_type: isVideo ? 'video' : 'image',
              mode: mediaMode,
              prompt: autoPrompt,
              negative_prompt:
                node.data.negativePrompt ||
                upstream.activeShot?.negative_prompt ||
                'blurry, watermark, low quality',
              aspect_ratio: aspectRatio,
              resolution: node.data.resolution || (isVideo ? '720p' : '1024x1024'),
              duration_sec: isVideo ? node.data.durationSec || 5 : null,
              fps: isVideo ? node.data.fps || 24 : null,
              camera_movement: isVideo ? node.data.cameraMovement || 'static' : null,
              model_name:
                node.data.model ||
                (isVideo ? 'canvas-video-demo' : 'canvas-image-demo'),
              batch_count: batchCount,
              reference_image_url: upstream.referenceImageUrl || null,
            }),
          });

          const submitData = await submitRes.json();
          if (!submitRes.ok || !submitData.task?.id) {
            throw new Error(submitData.error || '提交异步生成任务失败');
          }

          let currentTask = submitData.task;
          updateNodeData(nodeId, {
            taskId: currentTask.id,
            progress: currentTask.progress || 20,
          });

          for (let attempt = 0; attempt < 40; attempt++) {
            if (
              currentTask.status === 'succeeded' ||
              currentTask.status === 'failed'
            ) {
              break;
            }
            await new Promise((r) => setTimeout(r, 1500));
            const pollRes = await fetch(`/api/ai/task/${currentTask.id}`);
            if (pollRes.ok) {
              const pollData = await pollRes.json();
              if (pollData.task) {
                currentTask = pollData.task;
                updateNodeData(nodeId, {
                  progress: currentTask.progress || 50,
                });
              }
            }
          }

          if (currentTask.status === 'failed') {
            throw new Error(currentTask.error_message || '多模态生成失败');
          }

          const urls: string[] = Array.isArray(currentTask.result_urls)
            ? currentTask.result_urls
            : [];
          updateNodeData(nodeId, {
            status: 'done',
            progress: 100,
            resultUrls: urls,
            selectedResultIndex: 0,
            resultUrl: urls[0] || '',
            lastRunSnapshot: {
              prompt: autoPrompt,
              model: currentTask.model_name,
              providerName: currentTask.provider_name || '演示模式',
              executedAt: new Date().toISOString(),
            },
          });
        }
      } catch (err) {
        updateNodeData(nodeId, {
          status: 'error',
          errorMessage: err instanceof Error ? err.message : '节点运行失败',
        });
        // Pause all downstream nodes so canvas never hangs
        const downstreamIds = getDownstreamIds(nodeId, edgesRef.current);
        for (const did of downstreamIds) {
          updateNodeData(did, { status: 'paused' });
        }
        throw err;
      } finally {
        setIncomingEdgesAnimated(nodeId, false);
      }
    },
    [
      activeWorkspaceId,
      activeTextConfigs,
      collectUpstreamContext,
      updateNodeData,
      setIncomingEdgesAnimated,
    ]
  );

  const runSequence = useCallback(
    async (targetIds: string[], smartReuse = false) => {
      if (targetIds.length === 0) return;
      setIsRunningAll(true);
      let skippedCount = 0;
      let ranCount = 0;
      try {
        for (const nid of targetIds) {
          const n = nodesRef.current.find((item) => item.id === nid);
          if (!n) continue;
          if (
            smartReuse &&
            !SOURCE_ONLY_KINDS.has(n.type || '') &&
            n.data.status === 'done'
          ) {
            skippedCount += 1;
            continue;
          }
          await executeSingleNode(nid);
          ranCount += 1;
        }
        if (skippedCount > 0 && ranCount === 0) {
          toast.info(`所有 ${skippedCount} 个节点均为最新结果，已智能复用（可点击「重跑全部」强制重新执行）`);
        } else if (skippedCount > 0) {
          toast.success(`执行完成：运行 ${ranCount} 个节点，智能复用 ${skippedCount} 个未变更节点`);
        } else {
          toast.success('工作流节点已按依赖顺序执行完成');
        }
      } catch (err) {
        toast.error(
          err instanceof Error
            ? `节点执行失败，下游已自动暂停：${err.message}`
            : '工作流执行中断，下游已暂停'
        );
      } finally {
        setIsRunningAll(false);
      }
    },
    [executeSingleNode]
  );

  const runSingleNode = useCallback(
    async (nodeId: string) => {
      await runSequence([nodeId], false);
    },
    [runSequence]
  );

  const runDownstreamFrom = useCallback(
    async (startNodeId: string) => {
      const downIds = getDownstreamIds(startNodeId, edgesRef.current);
      if (downIds.length === 0) {
        toast.info('该节点下游暂无连接处理节点');
        return;
      }
      const sorted = topoSortSubset(new Set(downIds), edgesRef.current);
      await runSequence(sorted, false);
    },
    [runSequence]
  );

  const handleRunAll = async (forceAll = false) => {
    const allIds = new Set(nodesRef.current.map((n) => n.id));
    const sorted = topoSortSubset(allIds, edgesRef.current);
    await runSequence(sorted, !forceAll);
  };

  const archiveSingleNode = useCallback(
    async (nodeId: string) => {
      if (!activeWorkspaceId) return;
      const node = nodesRef.current.find((n) => n.id === nodeId);
      if (!node) return;
      const upstream = collectUpstreamContext(nodeId);

      let assetType: 'copywriting' | 'script' | 'image' | 'video' = 'copywriting';
      let content: string | null = null;
      let fileUrl: string | null = null;

      if (node.type === 'llmFission') {
        if (!node.data.outputText?.trim()) {
          toast.info('该节点暂无可归档的输出文本');
          return;
        }
        assetType = node.data.fissionMode === 'live_script' ? 'script' : 'copywriting';
        content = node.data.outputText;
      } else if (node.type === 'storyboard') {
        if (!node.data.shots?.length) {
          toast.info('该分镜节点暂无分镜内容');
          return;
        }
        assetType = 'video';
        content = node.data.shots
          .map(
            (s) =>
              `镜#${s.shot_number} [${s.shot_type}] ${s.visual_zh}\nPrompt: ${s.prompt_en}`
          )
          .join('\n\n');
      } else if (
        node.type === 'imageGen' ||
        node.type === 'videoGen' ||
        node.type === 'resultDisplay'
      ) {
        const chosenUrl =
          node.data.resultUrls?.[node.data.selectedResultIndex ?? 0] ||
          node.data.resultUrl ||
          '';
        if (!chosenUrl && !node.data.outputText) {
          toast.info('该节点暂无可归档的成果');
          return;
        }
        if (chosenUrl) {
          const looksVideo =
            node.type === 'videoGen' || /\.(mp4|webm|mov)(\?|$)/i.test(chosenUrl);
          assetType = looksVideo ? 'video' : 'image';
          fileUrl = chosenUrl;
          content =
            node.data.promptOverride ||
            node.data.outputText ||
            upstream.activeShot?.prompt_en ||
            '画布工作流生成成片';

          const trRes = await fetch('/api/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'transfer',
              workspaceId: activeWorkspaceId,
              sourceUrl: fileUrl,
              mediaType: assetType,
            }),
          });
          if (trRes.ok) {
            const trData = await trRes.json();
            if (trData.url) fileUrl = trData.url;
          }
        } else {
          assetType = 'copywriting';
          content = node.data.outputText || '';
        }
      }

      const res = await fetch('/api/assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspace_id: activeWorkspaceId,
          product_id: upstream.product?.id || null,
          asset_type: assetType,
          visibility: 'workspace',
          title: `画布归档 · ${node.data.label}`,
          content,
          file_url: fileUrl,
          tags: ['画布V2.0', workflowName],
          generation_meta: {
            source_scene: 'canvas_v2',
            aspect_ratio: node.data.aspectRatio,
            prompt: content?.slice(0, 300),
          },
        }),
      });

      if (res.ok) {
        toast.success(`已归档「${node.data.label}」至云端素材库`);
        loadAssets();
      } else {
        toast.error('归档失败');
      }
    },
    [activeWorkspaceId, collectUpstreamContext, workflowName, loadAssets]
  );

  const handleBatchArchiveAll = async () => {
    const candidates = nodesRef.current.filter((n) => {
      if (n.type === 'llmFission') return Boolean(n.data.outputText?.trim());
      if (n.type === 'storyboard') return Boolean(n.data.shots?.length);
      if (n.type === 'imageGen' || n.type === 'videoGen' || n.type === 'resultDisplay') {
        return Boolean(n.data.resultUrl || n.data.outputText);
      }
      return false;
    });

    if (candidates.length === 0) {
      toast.info('当前画布暂无已生成的节点成果可归档，请先运行工作流');
      return;
    }

    setArchivingAll(true);
    try {
      for (const n of candidates) {
        await archiveSingleNode(n.id);
      }
      toast.success(`已批量归档 ${candidates.length} 项画布成果至云端素材库`);
    } finally {
      setArchivingAll(false);
    }
  };

  // ============================================================================
  // Jimeng / Xiaoyunque / LibTV Style Canvas Interactions + Validation
  // ============================================================================

  const isValidConnection = useCallback((connection: Connection | Edge) => {
    if (!connection.source || !connection.target) return false;
    if (connection.source === connection.target) return false;

    const srcNode = nodesRef.current.find((n) => n.id === connection.source);
    const tgtNode = nodesRef.current.find((n) => n.id === connection.target);
    if (!srcNode || !tgtNode) return false;

    // Cannot connect into pure source input nodes
    if (SOURCE_ONLY_KINDS.has(tgtNode.type || '')) return false;
    // Video node can only connect into resultDisplay
    if (srcNode.type === 'videoGen' && tgtNode.type !== 'resultDisplay') return false;
    // Prevent DAG cycles
    if (wouldCreateCycle(connection.source, connection.target, edgesRef.current)) {
      return false;
    }
    return true;
  }, []);

  const addNodeAtPosition = useCallback(
    (
      kind: CanvasNodeKind,
      position: { x: number; y: number },
      extra?: Partial<CanvasNodeData>,
      connectFromNodeId?: string | null
    ) => {
      pushHistory();
      const id = `node-${kind}-${Date.now().toString(36)}-${Math.random()
        .toString(36)
        .slice(2, 5)}`;

      // Auto-bind default dedicated Image / Video / Text API on newly created nodes
      const autoExtra: Partial<CanvasNodeData> = { ...extra };
      if (kind === 'imageGen' && !autoExtra.configId) {
        const defImg =
          apiConfigs.find(
            (c) => c.is_active && c.api_type === 'image' && c.is_default && c.image_models.length > 0
          ) ||
          apiConfigs.find(
            (c) => c.is_active && c.api_type === 'image' && c.image_models.length > 0
          );
        if (defImg) {
          autoExtra.configId = defImg.id;
          autoExtra.model = defImg.image_models[0];
        }
      } else if (kind === 'videoGen' && !autoExtra.configId) {
        const defVid =
          apiConfigs.find(
            (c) => c.is_active && c.api_type === 'video' && c.is_default && c.video_models.length > 0
          ) ||
          apiConfigs.find(
            (c) => c.is_active && c.api_type === 'video' && c.video_models.length > 0
          );
        if (defVid) {
          autoExtra.configId = defVid.id;
          autoExtra.model = defVid.video_models[0];
        }
      }

      const newNode: WorkflowNode = {
        id,
        type: kind,
        position,
        selected: true,
        data: buildDefaultNodeData(kind, autoExtra),
      };
      setNodes((nds) => [
        ...nds.map((n) => ({ ...n, selected: false })),
        newNode,
      ]);
      setSelectedNodeId(id);

      if (connectFromNodeId) {
        setEdges((eds) =>
          addEdge(
            {
              id: `e-${connectFromNodeId}-${id}`,
              source: connectFromNodeId,
              target: id,
            },
            eds
          )
        );
      }
    },
    [setNodes, setEdges, pushHistory, apiConfigs]
  );

  const openQuickAddAtPointer = useCallback(
    (
      clientX: number,
      clientY: number,
      connectInfo?: {
        nodeId: string;
        kind: CanvasNodeKind;
        label: string;
      } | null
    ) => {
      const rect = canvasContainerRef.current?.getBoundingClientRect();
      const relX = rect ? clientX - rect.left : clientX;
      const relY = rect ? clientY - rect.top : clientY;
      const flowPos = screenToFlowPosition({ x: clientX, y: clientY });

      setNodeCtxMenu((prev) => ({ ...prev, open: false }));
      setQuickAdd({
        open: true,
        screenX: relX,
        screenY: relY,
        flowPosition: flowPos,
        connectFromNodeId: connectInfo?.nodeId || null,
        connectFromKind: connectInfo?.kind || null,
        connectFromLabel: connectInfo?.label || null,
      });
    },
    [screenToFlowPosition]
  );

  const handlePaneClick = useCallback(
    (event: React.MouseEvent) => {
      setNodeCtxMenu((prev) => ({ ...prev, open: false }));
      const now = Date.now();
      const prev = lastPaneClickRef.current;
      const dist = Math.hypot(event.clientX - prev.x, event.clientY - prev.y);
      const isDoubleClick =
        event.detail >= 2 || (now - prev.time < 320 && dist < 24);

      if (isDoubleClick) {
        lastPaneClickRef.current = { time: 0, x: 0, y: 0 };
        openQuickAddAtPointer(event.clientX, event.clientY, null);
      } else {
        setSelectedNodeId(null);
        lastPaneClickRef.current = {
          time: now,
          x: event.clientX,
          y: event.clientY,
        };
      }
    },
    [openQuickAddAtPointer]
  );

  const handlePaneContextMenu = useCallback(
    (event: MouseEvent | React.MouseEvent) => {
      event.preventDefault();
      openQuickAddAtPointer(event.clientX, event.clientY, null);
    },
    [openQuickAddAtPointer]
  );

  const handleNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: WorkflowNode) => {
      event.preventDefault();
      setSelectedNodeId(node.id);
      const rect = canvasContainerRef.current?.getBoundingClientRect();
      const relX = rect ? event.clientX - rect.left : event.clientX;
      const relY = rect ? event.clientY - rect.top : event.clientY;
      setQuickAdd((prev) => ({ ...prev, open: false }));
      setNodeCtxMenu({
        open: true,
        nodeId: node.id,
        screenX: relX,
        screenY: relY,
      });
    },
    []
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!isValidConnection(connection)) {
        toast.error('该连线不符合数据流向规则或会产生循环依赖');
        return;
      }
      pushHistory();
      setEdges((eds) => addEdge(connection, eds));
    },
    [setEdges, isValidConnection, pushHistory]
  );

  const onConnectEnd: OnConnectEnd = useCallback(
    (event, connectionState) => {
      if (
        !connectionState.isValid &&
        connectionState.fromNode &&
        connectionState.fromHandle?.type === 'source'
      ) {
        const touch =
          'changedTouches' in event ? event.changedTouches[0] : null;
        const clientX = touch ? touch.clientX : (event as MouseEvent).clientX;
        const clientY = touch ? touch.clientY : (event as MouseEvent).clientY;
        const fromNode = nodesRef.current.find(
          (n) => n.id === connectionState.fromNode?.id
        );
        openQuickAddAtPointer(clientX, clientY, {
          nodeId: connectionState.fromNode.id,
          kind: (fromNode?.type || 'llmFission') as CanvasNodeKind,
          label: fromNode?.data.label || '上游节点',
        });
      }
    },
    [openQuickAddAtPointer]
  );

  const handleQuickAddSelect = useCallback(
    (selection: QuickAddSelection) => {
      addNodeAtPosition(
        selection.kind,
        quickAdd.flowPosition,
        selection.extra,
        quickAdd.connectFromNodeId
      );
      setQuickAdd((prev) => ({ ...prev, open: false }));
    },
    [addNodeAtPosition, quickAdd.flowPosition, quickAdd.connectFromNodeId]
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const rawPayload = event.dataTransfer.getData('application/reactflow-node');
      if (!rawPayload) return;
      try {
        const parsed = JSON.parse(rawPayload) as {
          kind: CanvasNodeKind;
          extra?: Partial<CanvasNodeData>;
        };
        const position = screenToFlowPosition({
          x: event.clientX,
          y: event.clientY,
        });
        addNodeAtPosition(parsed.kind, position, parsed.extra);
      } catch {
        // Ignore invalid drop payload
      }
    },
    [screenToFlowPosition, addNodeAtPosition]
  );

  const handleMoveEnd = useCallback((_evt: unknown, vp: Viewport) => {
    setZoomPercent(Math.round((vp.zoom || 1) * 100));
  }, []);

  const contextValue = useMemo(
    () => ({
      products,
      assets,
      apiConfigs,
      isRunningAll,
      updateNodeData,
      runSingleNode,
      runDownstreamFrom,
      deleteNode,
      duplicateNode,
      openQuickAddFromNode,
      archiveSingleNode,
    }),
    [
      products,
      assets,
      apiConfigs,
      isRunningAll,
      updateNodeData,
      runSingleNode,
      runDownstreamFrom,
      deleteNode,
      duplicateNode,
      openQuickAddFromNode,
      archiveSingleNode,
    ]
  );

  const containerRect = canvasContainerRef.current?.getBoundingClientRect();
  const containerW = containerRect?.width || 1200;
  const containerH = containerRect?.height || 760;

  const ctxMenuNode = nodeCtxMenu.open
    ? nodes.find((n) => n.id === nodeCtxMenu.nodeId)
    : null;

  const selectedNode = useMemo(
    () => (selectedNodeId ? nodes.find((n) => n.id === selectedNodeId) || null : null),
    [nodes, selectedNodeId]
  );

  return (
    <CanvasActionsProvider value={contextValue}>
      <div
        ref={canvasContainerRef}
        className="relative h-full w-full overflow-hidden bg-slate-50/70"
      >
        <input
          ref={importInputRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={handleImportJson}
        />

        {/* 顶部毛玻璃悬浮控制栏 */}
        <div className="pointer-events-none absolute top-3 left-3 right-3 z-20 flex flex-wrap items-center justify-between gap-2">
          <div className="pointer-events-auto flex flex-wrap items-center gap-1.5 rounded-2xl border bg-card/90 backdrop-blur-md px-2.5 py-1.5 shadow-md">
            <div className="flex items-center gap-1.5 pr-1">
              <Workflow className="h-4 w-4 text-indigo-600" />
              <Badge variant="secondary" className="text-[10px]">
                画布 Studio
              </Badge>
            </div>

            {workflows.length > 0 && (
              <Select value={activeWorkflowId} onValueChange={handleSelectWorkflow}>
                <SelectTrigger className="h-7 w-[150px] text-xs bg-background/80">
                  <SelectValue placeholder="切换工作流" />
                </SelectTrigger>
                <SelectContent>
                  {workflows.map((wf) => (
                    <SelectItem key={wf.id} value={wf.id}>
                      {wf.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <Input
              value={workflowName}
              onChange={(e) => {
                setWorkflowName(e.target.value);
                setSaveState('dirty');
              }}
              className="h-7 w-[155px] text-xs bg-background/80"
              placeholder="工作流名称"
            />

            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              onClick={() => setNewWfOpen(true)}
            >
              <Plus className="h-3.5 w-3.5" />
              新建
            </Button>

            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              onClick={() => setTemplateOpen(true)}
            >
              <LayoutTemplate className="h-3.5 w-3.5" />
              模板
            </Button>

            {/* Undo / Redo */}
            <div className="mx-0.5 h-4 w-px bg-border" />
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              disabled={past.length === 0}
              onClick={handleUndo}
              title="撤销 (Ctrl+Z)"
            >
              <Undo2 className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              disabled={future.length === 0}
              onClick={handleRedo}
              title="重做 (Ctrl+Shift+Z)"
            >
              <Redo2 className="h-3.5 w-3.5" />
            </Button>
          </div>

          <div className="pointer-events-auto flex flex-wrap items-center gap-1.5 rounded-2xl border bg-card/90 backdrop-blur-md px-2.5 py-1.5 shadow-md">
            {/* Auto-save indicator */}
            <span className="hidden xl:inline-flex items-center gap-1 px-1.5 text-[11px] text-muted-foreground">
              {saveState === 'saving' ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin text-indigo-600" />
                  自动保存中...
                </>
              ) : saveState === 'dirty' ? (
                <span className="text-amber-600">未保存修改</span>
              ) : (
                <>
                  <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                  已保存
                </>
              )}
            </span>

            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={handleExportJson}
              title="导出 JSON"
            >
              <Download className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={() => importInputRef.current?.click()}
              title="导入 JSON"
            >
              <Upload className="h-3.5 w-3.5" />
            </Button>

            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              onClick={handleAutoLayout}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              排版
            </Button>

            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2.5 text-xs"
              onClick={() => handleSaveWorkflow(false)}
              disabled={saving}
            >
              <Save className="h-3.5 w-3.5" />
              保存
            </Button>

            {activeWorkflowId && (
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 text-destructive hover:text-destructive"
                onClick={handleDeleteCurrentWorkflow}
                title="删除当前工作流"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}

            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2 text-xs"
              onClick={handleBatchArchiveAll}
              disabled={archivingAll || isRunningAll}
            >
              <Archive className="h-3.5 w-3.5" />
              归档
            </Button>

            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2 text-xs"
              onClick={() => handleRunAll(true)}
              disabled={isRunningAll}
              title="忽略缓存，强制重跑所有节点"
            >
              <RotateCw className="h-3.5 w-3.5" />
              重跑
            </Button>

            <Button
              size="sm"
              className="h-7 px-3 text-xs bg-indigo-600 hover:bg-indigo-700"
              onClick={() => handleRunAll(false)}
              disabled={isRunningAll}
              title="智能复用未改动节点，按拓扑顺序执行"
            >
              <Play className="h-3.5 w-3.5" />
              {isRunningAll ? '执行中...' : '运行工作流'}
            </Button>

            <Button
              size="icon"
              variant={inspectorOpen && selectedNode ? 'default' : 'ghost'}
              className="h-7 w-7"
              onClick={() => setInspectorOpen((v) => !v)}
              title="切换右侧属性检查器"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* 左侧极简悬浮 Dock 胶囊条 */}
        <div className="absolute left-3 top-20 z-20 flex flex-col gap-1.5 rounded-2xl border bg-card/90 backdrop-blur-md p-1.5 shadow-lg">
          <Button
            size="icon"
            variant={quickAdd.open && !quickAdd.connectFromNodeId ? 'default' : 'ghost'}
            className="h-9 w-9 rounded-xl"
            title="快捷添加节点（也可双击空白处或按 / 键）"
            onClick={() => {
              const rect = canvasContainerRef.current?.getBoundingClientRect();
              const cx = (rect?.left || 0) + (rect?.width || 900) / 2;
              const cy = (rect?.top || 0) + (rect?.height || 640) / 2;
              openQuickAddAtPointer(cx, cy, null);
            }}
          >
            <Plus className="h-4 w-4" />
          </Button>

          <Button
            size="icon"
            variant={drawerOpen ? 'default' : 'ghost'}
            className="h-9 w-9 rounded-xl"
            title="展开产品库 & 云端素材库抽屉"
            onClick={() => setDrawerOpen((v) => !v)}
          >
            <Layers className="h-4 w-4" />
          </Button>

          <Button
            size="icon"
            variant="ghost"
            className="h-9 w-9 rounded-xl"
            title="工作流模板市场"
            onClick={() => setTemplateOpen(true)}
          >
            <LayoutTemplate className="h-4 w-4" />
          </Button>

          <Button
            size="icon"
            variant="ghost"
            className="h-9 w-9 rounded-xl"
            title="自动整理节点排版"
            onClick={handleAutoLayout}
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>

          <Button
            size="icon"
            variant="ghost"
            className="h-9 w-9 rounded-xl"
            title="居中适应所有节点 (快捷键 0)"
            onClick={() => fitView({ padding: 0.18, duration: 200 })}
          >
            <Maximize2 className="h-4 w-4" />
          </Button>
        </div>

        {/* 可收起的悬浮产品与素材库抽屉 */}
        {drawerOpen && (
          <aside className="absolute left-16 top-20 bottom-12 z-20 w-64 rounded-2xl border bg-card/95 backdrop-blur-md flex flex-col overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between border-b px-3 py-2">
              <span className="text-xs font-semibold">节点与资产库</span>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="rounded p-1 text-muted-foreground hover:bg-muted"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <Tabs defaultValue="nodes" className="flex flex-1 flex-col min-h-0">
              <div className="px-2.5 pt-2">
                <TabsList className="grid w-full grid-cols-2 h-8">
                  <TabsTrigger value="nodes" className="text-xs">
                    全部节点
                  </TabsTrigger>
                  <TabsTrigger value="library" className="text-xs">
                    产品 & 素材
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent
                value="nodes"
                className="flex-1 overflow-y-auto p-2.5 space-y-2 m-0"
              >
                {CANVAS_NODE_PALETTE.map((item) => {
                  const Icon = item.icon;
                  return (
                    <div
                      key={item.type}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData(
                          'application/reactflow-node',
                          JSON.stringify({ kind: item.type })
                        );
                        e.dataTransfer.effectAllowed = 'move';
                      }}
                      onClick={() =>
                        addNodeAtPosition(
                          item.type,
                          screenToFlowPosition({
                            x: (containerRect?.left || 0) + containerW * 0.48,
                            y: (containerRect?.top || 0) + containerH * 0.45,
                          })
                        )
                      }
                      className="cursor-grab rounded-lg border bg-background p-2.5 hover:border-primary/60 transition-all"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={`flex h-6 w-6 items-center justify-center rounded ${item.accent}`}
                        >
                          <Icon className="h-3.5 w-3.5" />
                        </span>
                        <span className="text-xs font-semibold">{item.title}</span>
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {item.desc}
                      </p>
                    </div>
                  );
                })}
              </TabsContent>

              <TabsContent
                value="library"
                className="flex-1 overflow-y-auto p-2.5 space-y-3 m-0"
              >
                <div className="space-y-1.5">
                  <div className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1">
                    <Package className="h-3 w-3" /> 产品档案 ({products.length})
                  </div>
                  {products.map((p) => (
                    <div
                      key={p.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData(
                          'application/reactflow-node',
                          JSON.stringify({
                            kind: 'productInput',
                            extra: {
                              label: `产品：${p.name.slice(0, 14)}`,
                              productId: p.id,
                              status: 'done',
                            },
                          })
                        );
                        e.dataTransfer.effectAllowed = 'move';
                      }}
                      onClick={() =>
                        addNodeAtPosition(
                          'productInput',
                          screenToFlowPosition({
                            x: (containerRect?.left || 0) + containerW * 0.42,
                            y: (containerRect?.top || 0) + containerH * 0.45,
                          }),
                          {
                            label: `产品：${p.name.slice(0, 14)}`,
                            productId: p.id,
                            status: 'done',
                          }
                        )
                      }
                      className="cursor-grab rounded-lg border bg-indigo-50/40 p-2 text-xs hover:border-primary transition-colors"
                    >
                      <div className="font-medium truncate">{p.name}</div>
                      <div className="text-[10px] text-muted-foreground line-clamp-1 mt-0.5">
                        {p.selling_points}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="space-y-1.5 pt-2 border-t">
                  <div className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1">
                    <Layers className="h-3 w-3" /> 云端素材 ({assets.length})
                  </div>
                  {assets.slice(0, 15).map((a) => (
                    <div
                      key={a.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData(
                          'application/reactflow-node',
                          JSON.stringify({
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
                          })
                        );
                        e.dataTransfer.effectAllowed = 'move';
                      }}
                      onClick={() =>
                        addNodeAtPosition(
                          'assetInput',
                          screenToFlowPosition({
                            x: (containerRect?.left || 0) + containerW * 0.45,
                            y: (containerRect?.top || 0) + containerH * 0.5,
                          }),
                          {
                            label: `素材：${a.title.slice(0, 14)}`,
                            assetId: a.id,
                            assetTitle: a.title,
                            assetType: a.asset_type,
                            assetContent: a.content || '',
                            assetFileUrl: a.file_url || '',
                            status: 'done',
                          }
                        )
                      }
                      className="cursor-grab rounded-lg border bg-emerald-50/40 p-2 text-xs hover:border-primary transition-colors"
                    >
                      <div className="flex items-center gap-1.5">
                        {a.asset_type === 'image' || a.asset_type === 'video' ? (
                          <FileImage className="h-3.5 w-3.5 text-emerald-700 shrink-0" />
                        ) : (
                          <FileText className="h-3.5 w-3.5 text-emerald-700 shrink-0" />
                        )}
                        <span className="font-medium truncate">{a.title}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </TabsContent>
            </Tabs>
          </aside>
        )}

        {/* 右侧可收起属性检查面板 */}
        {inspectorOpen && selectedNode && (
          <NodeInspector
            node={selectedNode}
            apiConfigs={apiConfigs}
            isRunningAll={isRunningAll}
            onUpdateData={updateNodeData}
            onRunNode={runSingleNode}
            onRunDownstream={runDownstreamFrom}
            onDuplicate={duplicateNode}
            onArchive={archiveSingleNode}
            onDelete={deleteNode}
            onClose={() => setInspectorOpen(false)}
          />
        )}

        {/* 无限沉浸式二维白板 */}
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          defaultEdgeOptions={DEFAULT_EDGE_OPTIONS}
          isValidConnection={isValidConnection}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeDragStop={() => {
            if (hydratedRef.current) setSaveState('dirty');
          }}
          onNodesDelete={() => {
            if (hydratedRef.current) setSaveState('dirty');
          }}
          onEdgesDelete={() => {
            if (hydratedRef.current) setSaveState('dirty');
          }}
          onConnect={onConnect}
          onConnectEnd={onConnectEnd}
          onNodeClick={(_e, node) => {
            setSelectedNodeId(node.id);
          }}
          onPaneClick={handlePaneClick}
          onPaneContextMenu={handlePaneContextMenu}
          onNodeContextMenu={handleNodeContextMenu}
          onMoveEnd={handleMoveEnd}
          onDragOver={onDragOver}
          onDrop={onDrop}
          zoomOnDoubleClick={false}
          fitView
          fitViewOptions={{ padding: 0.18 }}
          deleteKeyCode={['Backspace', 'Delete']}
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={20}
            size={1.25}
            color="#cbd5e1"
          />
          <Controls position="bottom-right" className="!mb-10" />
          <MiniMap
            position="bottom-right"
            nodeStrokeWidth={3}
            zoomable
            pannable
            className="!bg-card/90 !backdrop-blur !border !rounded-xl !mr-12 !mb-10"
          />
        </ReactFlow>

        {/* 底部状态栏 */}
        <div className="pointer-events-none absolute bottom-2.5 left-3 right-3 z-10 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <div className="pointer-events-auto flex items-center gap-2.5 rounded-full border bg-card/90 backdrop-blur-md px-3.5 py-1 shadow-xs tabular-nums">
            <span className="font-semibold text-foreground">{zoomPercent}%</span>
            <span>·</span>
            <span>{nodes.length} 节点</span>
            <span>·</span>
            <span>{edges.length} 连线</span>
            {isRunningAll && (
              <>
                <span>·</span>
                <span className="text-indigo-600 font-medium flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  工作流执行中
                </span>
              </>
            )}
          </div>

          <div className="hidden lg:flex items-center gap-2 rounded-full border bg-card/85 backdrop-blur-md px-4 py-1 shadow-xs">
            <span className="font-medium text-foreground">双击空白 / 右键 / 按 /</span>
            <span>快捷加节点</span>
            <span>·</span>
            <span>拖线松手接下游</span>
            <span>·</span>
            <span>Ctrl+Z 撤销 / Ctrl+S 保存 / 0 居中</span>
          </div>
        </div>

        {/* 即梦 / LibTV 风格双击快捷添加节点菜单 */}
        <QuickAddMenu
          open={quickAdd.open}
          screenX={quickAdd.screenX}
          screenY={quickAdd.screenY}
          containerWidth={containerW}
          containerHeight={containerH}
          connectFromNodeId={quickAdd.connectFromNodeId}
          connectFromKind={quickAdd.connectFromKind}
          connectFromLabel={quickAdd.connectFromLabel}
          products={products}
          assets={assets}
          onSelect={handleQuickAddSelect}
          onClose={() => setQuickAdd((prev) => ({ ...prev, open: false }))}
        />

        {/* 右键节点快捷菜单 */}
        {ctxMenuNode && (
          <div
            style={{
              left: Math.min(nodeCtxMenu.screenX, Math.max(12, containerW - 200)),
              top: Math.min(nodeCtxMenu.screenY, Math.max(12, containerH - 260)),
            }}
            onMouseLeave={() =>
              setNodeCtxMenu((prev) => ({ ...prev, open: false }))
            }
            className="absolute z-40 w-48 rounded-xl border bg-popover/95 backdrop-blur-md p-1.5 shadow-xl text-xs space-y-0.5"
          >
            <div className="px-2.5 py-1 text-[10px] font-semibold text-muted-foreground truncate border-b mb-1">
              {ctxMenuNode.data.label}
            </div>

            {!SOURCE_ONLY_KINDS.has(ctxMenuNode.type || '') && (
              <button
                type="button"
                onClick={() => {
                  setNodeCtxMenu((p) => ({ ...p, open: false }));
                  runSingleNode(ctxMenuNode.id);
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 hover:bg-accent"
              >
                <Play className="h-3.5 w-3.5 text-primary" />
                运行此节点
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                setNodeCtxMenu((p) => ({ ...p, open: false }));
                runDownstreamFrom(ctxMenuNode.id);
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 hover:bg-accent"
            >
              <RefreshCw className="h-3.5 w-3.5 text-indigo-600" />
              触发下游重算
            </button>

            <button
              type="button"
              onClick={() => openQuickAddFromNode(ctxMenuNode.id)}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 hover:bg-accent"
            >
              <Plus className="h-3.5 w-3.5 text-emerald-600" />
              向右延伸下游节点
            </button>

            <button
              type="button"
              onClick={() => {
                setNodeCtxMenu((p) => ({ ...p, open: false }));
                duplicateNode(ctxMenuNode.id);
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 hover:bg-accent"
            >
              <Copy className="h-3.5 w-3.5" />
              复制节点
            </button>

            {(ctxMenuNode.type === 'llmFission' ||
              ctxMenuNode.type === 'storyboard' ||
              ctxMenuNode.type === 'imageGen' ||
              ctxMenuNode.type === 'videoGen' ||
              ctxMenuNode.type === 'resultDisplay') && (
              <button
                type="button"
                onClick={() => {
                  setNodeCtxMenu((p) => ({ ...p, open: false }));
                  archiveSingleNode(ctxMenuNode.id);
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 hover:bg-accent"
              >
                <FolderPlus className="h-3.5 w-3.5 text-amber-600" />
                存入云端素材库
              </button>
            )}

            <div className="my-1 h-px bg-border" />
            <button
              type="button"
              onClick={() => {
                setNodeCtxMenu((p) => ({ ...p, open: false }));
                deleteNode(ctxMenuNode.id);
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="h-3.5 w-3.5" />
              删除节点
            </button>
          </div>
        )}

        {/* 工作流模板市场弹窗 */}
        <Dialog open={templateOpen} onOpenChange={setTemplateOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <LayoutTemplate className="h-5 w-5 text-primary" />
                工作流模板市场
              </DialogTitle>
              <DialogDescription>
                选择标准化 AI 创作内容生产流模板，一键加载到当前白板并自动绑定首款产品档案。
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-3">
              {CANVAS_TEMPLATES.map((tpl) => (
                <div
                  key={tpl.id}
                  className="flex items-center justify-between gap-4 rounded-xl border p-4 hover:border-primary/60 transition-colors"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm">{tpl.name}</span>
                      <Badge variant="secondary" className="text-[10px]">
                        {tpl.badge}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{tpl.description}</p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => applyTemplate(tpl.id)}
                    className="shrink-0"
                  >
                    立即套用
                  </Button>
                </div>
              ))}
            </div>
          </DialogContent>
        </Dialog>

        {/* 新建工作流弹窗 */}
        <Dialog open={newWfOpen} onOpenChange={setNewWfOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>新建节点画布工作流</DialogTitle>
              <DialogDescription>
                将基于「爆款短视频全链路生产流」初始化一张新的协作画布。
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreateWorkflow} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="wf-name">工作流名称</Label>
                <Input
                  id="wf-name"
                  value={newWfName}
                  onChange={(e) => setNewWfName(e.target.value)}
                  placeholder="例如：618 防晒衣主推全案工作流"
                  required
                />
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setNewWfOpen(false)}
                >
                  取消
                </Button>
                <Button type="submit">创建画布</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </CanvasActionsProvider>
  );
}

export default function CanvasPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          正在加载创作画布...
        </div>
      }
    >
      <ReactFlowProvider>
        <CanvasEditor />
      </ReactFlowProvider>
    </Suspense>
  );
}
