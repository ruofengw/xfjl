'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Bot,
  ChevronDown,
  ChevronRight,
  Copy,
  FolderPlus,
  MessageSquarePlus,
  Mic2,
  PenTool,
  Pin,
  PinOff,
  Search,
  Send,
  Sparkles,
  Trash2,
  User,
} from 'lucide-react';
import { toast } from 'sonner';
import { useWorkspace } from '@/components/providers/workspace-provider';
import {
  ProductSelector,
} from '@/components/product-selector/product-selector';
import {
  AssetSaveDialog,
  type AssetSavePayload,
} from '@/components/asset-save-dialog/asset-save-dialog';
import { streamAiChat } from '@/lib/ai-stream';
import type { ChatMessage, ChatSession } from '@/lib/types';
import { copyToClipboard, formatDateTime } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

export default function ChatPage() {
  const router = useRouter();
  const { activeWorkspace, activeWorkspaceId, apiConfigs } = useWorkspace();

  const activeConfigs = useMemo(
    () =>
      apiConfigs.filter(
        (c) => c.is_active && c.api_type === 'text' && (c.models || []).length > 0
      ),
    [apiConfigs]
  );

  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [sessionSearch, setSessionSearch] = useState('');
  const [activeSessionId, setActiveSessionId] = useState<string>('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const [selectedConfigId, setSelectedConfigId] = useState<string>('');
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [selectedProductId, setSelectedProductId] = useState<string>('');

  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [streamingReasoning, setStreamingReasoning] = useState('');
  const [expandedReasoningIds, setExpandedReasoningIds] = useState<
    Record<string, boolean>
  >({});

  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [savePayload, setSavePayload] = useState<AssetSavePayload | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Pick default routing or first active config
  useEffect(() => {
    if (activeConfigs.length === 0) {
      setSelectedConfigId('');
      setSelectedModel('');
      return;
    }
    const route = activeWorkspace?.default_routing?.chat;
    const routedCfg = activeConfigs.find((c) => c.id === route?.configId);
    const chosenCfg = routedCfg || activeConfigs[0];
    setSelectedConfigId((prev) =>
      activeConfigs.some((c) => c.id === prev) ? prev : chosenCfg.id
    );
    setSelectedModel((prev) => {
      if (prev) return prev;
      return route?.model || chosenCfg.models[0] || '';
    });
  }, [activeConfigs, activeWorkspace]);

  const fetchSessions = useCallback(async () => {
    if (!activeWorkspaceId) return;
    const params = new URLSearchParams({ workspaceId: activeWorkspaceId });
    if (sessionSearch.trim()) params.set('q', sessionSearch.trim());
    const res = await fetch(`/api/chat/sessions?${params.toString()}`);
    if (res.ok) {
      const data = await res.json();
      const list: ChatSession[] = Array.isArray(data.sessions) ? data.sessions : [];
      setSessions(list);
      if (list.length > 0 && !activeSessionId) {
        setActiveSessionId(list[0].id);
      }
    }
  }, [activeWorkspaceId, sessionSearch, activeSessionId]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const loadMessages = useCallback(async (sessionId: string) => {
    if (!sessionId) {
      setMessages([]);
      return;
    }
    const res = await fetch(`/api/chat/sessions/${sessionId}`);
    if (res.ok) {
      const data = await res.json();
      setMessages(Array.isArray(data.messages) ? data.messages : []);
    }
  }, []);

  useEffect(() => {
    if (activeSessionId) {
      loadMessages(activeSessionId);
      const sess = sessions.find((s) => s.id === activeSessionId);
      if (sess?.product_id) {
        setSelectedProductId(sess.product_id);
      }
      if (sess?.model_config_id && activeConfigs.some((c) => c.id === sess.model_config_id)) {
        setSelectedConfigId(sess.model_config_id);
        if (sess.model_name) setSelectedModel(sess.model_name);
      }
    }
  }, [activeSessionId, sessions, activeConfigs, loadMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  const handleNewSession = async () => {
    if (!activeWorkspaceId) return;
    const res = await fetch('/api/chat/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspace_id: activeWorkspaceId,
        title: '新对话灵感',
        product_id: selectedProductId || null,
        model_config_id: selectedConfigId || null,
        model_name: selectedModel || null,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      setSessions((prev) => [data.session, ...prev]);
      setActiveSessionId(data.session.id);
      setMessages([]);
    }
  };

  const handleTogglePin = async (sess: ChatSession) => {
    const res = await fetch(`/api/chat/sessions/${sess.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_pinned: !sess.is_pinned }),
    });
    if (res.ok) {
      fetchSessions();
    }
  };

  const handleDeleteSession = async (sess: ChatSession) => {
    const res = await fetch(`/api/chat/sessions/${sess.id}`, { method: 'DELETE' });
    if (res.ok) {
      const remaining = sessions.filter((s) => s.id !== sess.id);
      setSessions(remaining);
      if (activeSessionId === sess.id) {
        setActiveSessionId(remaining[0]?.id || '');
        if (!remaining[0]) setMessages([]);
      }
    }
  };

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const promptText = input.trim();
    if (!promptText || streaming || !activeWorkspaceId) return;

    let sessionId = activeSessionId;
    if (!sessionId) {
      const createRes = await fetch('/api/chat/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspace_id: activeWorkspaceId,
          title: promptText.slice(0, 22),
          product_id: selectedProductId || null,
          model_config_id: selectedConfigId || null,
          model_name: selectedModel || null,
        }),
      });
      if (!createRes.ok) {
        toast.error('创建会话失败');
        return;
      }
      const created = await createRes.json();
      sessionId = created.session.id;
      setSessions((prev) => [created.session, ...prev]);
      setActiveSessionId(sessionId);
    } else {
      const curr = sessions.find((s) => s.id === sessionId);
      if (curr && (curr.title === '新对话灵感' || curr.title === '新对话')) {
        fetch(`/api/chat/sessions/${sessionId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: promptText.slice(0, 24) }),
        }).then(() => fetchSessions());
      }
    }

    setInput('');
    const tempUserMsg: ChatMessage = {
      id: `tmp-user-${Date.now()}`,
      session_id: sessionId,
      role: 'user',
      content: promptText,
      created_at: new Date().toISOString(),
    };

    const nextHistory = [...messages, tempUserMsg];
    setMessages(nextHistory);
    setStreaming(true);
    setStreamingContent('');
    setStreamingReasoning('');

    // Persist user message
    await fetch(`/api/chat/sessions/${sessionId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'user', content: promptText }),
    });

    try {
      const result = await streamAiChat({
        workspaceId: activeWorkspaceId,
        configId: selectedConfigId || undefined,
        model: selectedModel || undefined,
        productId: selectedProductId || undefined,
        scene: 'chat',
        messages: nextHistory.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        onDelta: (_chunk, full) => setStreamingContent(full),
        onReasoningDelta: (_chunk, full) => setStreamingReasoning(full),
      });

      const savedRes = await fetch(`/api/chat/sessions/${sessionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: 'assistant',
          content: result.content,
          reasoning_content: result.reasoning || null,
        }),
      });

      if (savedRes.ok) {
        const savedData = await savedRes.json();
        setMessages((prev) => [...prev, savedData.message]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: `tmp-ai-${Date.now()}`,
            session_id: sessionId,
            role: 'assistant',
            content: result.content,
            reasoning_content: result.reasoning || null,
            created_at: new Date().toISOString(),
          },
        ]);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '生成失败');
    } finally {
      setStreaming(false);
      setStreamingContent('');
      setStreamingReasoning('');
    }
  };

  const selectedConfig = activeConfigs.find((c) => c.id === selectedConfigId);

  return (
    <div className="flex h-[calc(100vh-7.5rem)] gap-4">
      {/* 左侧历史会话列表 */}
      <aside className="hidden md:flex w-64 shrink-0 flex-col rounded-xl border bg-card overflow-hidden">
        <div className="p-3 border-b space-y-2.5">
          <Button className="w-full justify-start gap-2" onClick={handleNewSession}>
            <MessageSquarePlus className="h-4 w-4" />
            新建 AI 对话
          </Button>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="检索历史会话..."
              className="h-8 pl-8 text-xs"
              value={sessionSearch}
              onChange={(e) => setSessionSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {sessions.length === 0 ? (
            <div className="py-10 text-center text-xs text-muted-foreground">
              暂无历史对话
            </div>
          ) : (
            sessions.map((sess) => {
              const active = sess.id === activeSessionId;
              return (
                <div
                  key={sess.id}
                  onClick={() => setActiveSessionId(sess.id)}
                  className={`group flex items-center justify-between rounded-lg px-2.5 py-2 text-xs cursor-pointer transition-colors ${
                    active
                      ? 'bg-primary/10 text-primary font-medium'
                      : 'hover:bg-muted text-foreground'
                  }`}
                >
                  <div className="min-w-0 flex-1 pr-1">
                    <div className="flex items-center gap-1 truncate">
                      {sess.is_pinned && (
                        <Pin className="h-3 w-3 shrink-0 text-amber-500" />
                      )}
                      <span className="truncate">{sess.title}</span>
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      {formatDateTime(sess.updated_at || sess.created_at)}
                    </div>
                  </div>
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleTogglePin(sess);
                      }}
                      className="rounded p-1 hover:bg-background"
                      title={sess.is_pinned ? '取消置顶' : '置顶会话'}
                    >
                      {sess.is_pinned ? (
                        <PinOff className="h-3 w-3" />
                      ) : (
                        <Pin className="h-3 w-3" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteSession(sess);
                      }}
                      className="rounded p-1 text-destructive hover:bg-background"
                      title="删除会话"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </aside>

      {/* 右侧对话主工作区 */}
      <div className="flex flex-1 flex-col rounded-xl border bg-card overflow-hidden min-w-0">
        {/* 顶部产品关联 + 模型即时切换栏 */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/20 px-4 py-2.5">
          <ProductSelector
            value={selectedProductId}
            onChange={(pid) => {
              setSelectedProductId(pid);
              if (activeSessionId) {
                fetch(`/api/chat/sessions/${activeSessionId}`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ product_id: pid || null }),
                });
              }
            }}
          />

          <div className="flex flex-wrap items-center gap-2">
            {activeConfigs.length > 0 ? (
              <>
                <Select
                  value={selectedConfigId}
                  onValueChange={(cfgId) => {
                    setSelectedConfigId(cfgId);
                    const cfg = activeConfigs.find((c) => c.id === cfgId);
                    const nextModel = cfg?.models[0] || '';
                    setSelectedModel(nextModel);
                    if (activeSessionId) {
                      fetch(`/api/chat/sessions/${activeSessionId}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          model_config_id: cfgId,
                          model_name: nextModel,
                        }),
                      });
                    }
                  }}
                >
                  <SelectTrigger className="h-8 w-[160px] text-xs bg-background">
                    <SelectValue placeholder="选择模型渠道" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeConfigs.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.display_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={selectedModel}
                  onValueChange={(m) => {
                    setSelectedModel(m);
                    if (activeSessionId) {
                      fetch(`/api/chat/sessions/${activeSessionId}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ model_name: m }),
                      });
                    }
                  }}
                >
                  <SelectTrigger className="h-8 w-[170px] text-xs font-mono bg-background">
                    <SelectValue placeholder="选择模型 ID" />
                  </SelectTrigger>
                  <SelectContent>
                    {(selectedConfig?.models || []).map((m) => (
                      <SelectItem key={m} value={m} className="font-mono text-xs">
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            ) : (
              <Badge
                variant="outline"
                className="cursor-pointer bg-amber-50 text-amber-700 border-amber-200"
                onClick={() => router.push('/settings/api')}
              >
                演示模式（点击配置 Kimi / DeepSeek Key）
              </Badge>
            )}
          </div>
        </div>

        {/* 消息流滚动区域 */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
          {messages.length === 0 && !streaming && (
            <div className="mx-auto max-w-xl py-12 text-center space-y-4">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Sparkles className="h-6 w-6" />
              </div>
              <h2 className="text-lg font-semibold">AI 直播电商灵感工作台</h2>
              <p className="text-sm text-muted-foreground">
                可在上方随时切换关联产品与 Kimi / DeepSeek 模型。试试下面的快捷开场指令：
              </p>
              <div className="flex flex-wrap justify-center gap-2 pt-2">
                {[
                  '帮我提炼这款产品的 5 个短视频痛点吸睛开头',
                  '策划一场 10 分钟的直播间爆品憋单节奏',
                  '分析 25-35 岁女性下单前的核心顾虑和应对方案',
                ].map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => setInput(q)}
                    className="rounded-full border bg-muted/40 px-3.5 py-1.5 text-xs hover:border-primary hover:text-primary transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg) => {
            const isUser = msg.role === 'user';
            const reasoningExpanded = expandedReasoningIds[msg.id] ?? false;

            return (
              <div
                key={msg.id}
                className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}
              >
                {!isUser && (
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Bot className="h-4 w-4" />
                  </div>
                )}

                <div
                  className={`max-w-[85%] space-y-2 ${
                    isUser ? 'items-end flex flex-col' : 'flex-1 max-w-3xl'
                  }`}
                >
                  {!isUser && msg.reasoning_content && (
                    <div className="rounded-lg border bg-muted/40 px-3 py-2 text-xs">
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedReasoningIds((prev) => ({
                            ...prev,
                            [msg.id]: !reasoningExpanded,
                          }))
                        }
                        className="flex items-center gap-1.5 font-medium text-muted-foreground hover:text-foreground"
                      >
                        {reasoningExpanded ? (
                          <ChevronDown className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5" />
                        )}
                        深度思考过程（DeepSeek-R1）
                      </button>
                      {reasoningExpanded && (
                        <p className="mt-2 whitespace-pre-wrap text-muted-foreground leading-relaxed">
                          {msg.reasoning_content}
                        </p>
                      )}
                    </div>
                  )}

                  <div
                    className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                      isUser
                        ? 'bg-primary text-primary-foreground'
                        : 'border bg-background text-foreground'
                    }`}
                  >
                    {isUser ? (
                      <div className="whitespace-pre-wrap">{msg.content}</div>
                    ) : (
                      <div className="prose prose-sm max-w-none prose-slate dark:prose-invert prose-pre:bg-slate-900 prose-pre:text-slate-100 prose-pre:rounded-lg prose-pre:p-3">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {msg.content}
                        </ReactMarkdown>
                      </div>
                    )}
                  </div>

                  {!isUser && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs text-muted-foreground"
                        onClick={() => {
                          copyToClipboard(msg.content);
                          toast.success('已复制回答内容');
                        }}
                      >
                        <Copy className="h-3 w-3" />
                        复制
                      </Button>

                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs text-muted-foreground hover:text-primary"
                        onClick={() => {
                          setSavePayload({
                            title: `AI 灵感对话：${msg.content.slice(0, 20).replace(/\n/g, ' ')}`,
                            assetType: 'copywriting',
                            productId: selectedProductId || null,
                            content: msg.content,
                            tags: ['AI对话'],
                            generationMeta: {
                              model: selectedModel,
                              source_scene: 'chat',
                            },
                          });
                          setSaveDialogOpen(true);
                        }}
                      >
                        <FolderPlus className="h-3 w-3" />
                        一键存入素材库
                      </Button>

                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs text-muted-foreground hover:text-primary"
                        onClick={() =>
                          router.push(
                            `/copywriting?draft=${encodeURIComponent(
                              msg.content.slice(0, 1500)
                            )}&productId=${encodeURIComponent(selectedProductId)}`
                          )
                        }
                      >
                        <PenTool className="h-3 w-3" />
                        转为文案草稿
                      </Button>

                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs text-muted-foreground hover:text-primary"
                        onClick={() =>
                          router.push(
                            `/live-script?draft=${encodeURIComponent(
                              msg.content.slice(0, 1500)
                            )}&productId=${encodeURIComponent(selectedProductId)}`
                          )
                        }
                      >
                        <Mic2 className="h-3 w-3" />
                        转为话术草稿
                      </Button>
                    </div>
                  )}
                </div>

                {isUser && (
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
                    <User className="h-4 w-4" />
                  </div>
                )}
              </div>
            );
          })}

          {streaming && (
            <div className="flex gap-3 justify-start">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Bot className="h-4 w-4 animate-pulse" />
              </div>
              <div className="flex-1 max-w-3xl space-y-2">
                {streamingReasoning && (
                  <div className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
                    <div className="font-medium mb-1">正在深度思考...</div>
                    <p className="whitespace-pre-wrap">{streamingReasoning}</p>
                  </div>
                )}
                <div className="rounded-2xl border bg-background px-4 py-3 text-sm leading-relaxed">
                  {streamingContent ? (
                    <div className="prose prose-sm max-w-none prose-slate">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {streamingContent}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    <span className="text-muted-foreground text-xs">
                      正在思考并流式输出中...
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* 底部输入栏 */}
        <form onSubmit={handleSend} className="border-t bg-muted/20 p-3 md:p-4">
          <div className="flex items-end gap-2">
            <Textarea
              rows={2}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="输入你的问题或创作指令（Enter 发送，Shift + Enter 换行）..."
              className="min-h-[56px] max-h-40 resize-none bg-background"
            />
            <Button
              type="submit"
              disabled={streaming || !input.trim()}
              className="h-12 px-5 shrink-0"
            >
              <Send className="h-4 w-4" />
              发送
            </Button>
          </div>
        </form>
      </div>

      <AssetSaveDialog
        open={saveDialogOpen}
        onOpenChange={setSaveDialogOpen}
        initialData={savePayload}
      />
    </div>
  );
}
