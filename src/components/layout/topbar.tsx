'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Building2,
  Check,
  ChevronsUpDown,
  Cloud,
  Copy,
  HardDrive,
  LogOut,
  Menu,
  Plus,
  UserPlus,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { useWorkspace } from '@/components/providers/workspace-provider';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { copyToClipboard } from '@/lib/utils';

interface TopbarProps {
  onOpenMobileMenu: () => void;
}

const ROLE_LABEL: Record<string, string> = {
  owner: '创建者',
  admin: '管理员',
  member: '成员',
};

export function Topbar({ onOpenMobileMenu }: TopbarProps) {
  const router = useRouter();
  const {
    workspaces,
    activeWorkspace,
    setActiveWorkspaceId,
    user,
    supabaseConfigured,
    r2Configured,
    createWorkspace,
    createInviteCode,
    joinWorkspaceByCode,
  } = useWorkspace();

  const [createOpen, setCreateOpen] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [creating, setCreating] = useState(false);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [generatedCode, setGeneratedCode] = useState('');
  const [generatingInvite, setGeneratingInvite] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joining, setJoining] = useState(false);

  const handleCreateWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWorkspaceName.trim()) return;
    setCreating(true);
    try {
      await createWorkspace(newWorkspaceName.trim());
      toast.success('已创建并切换到新工作空间');
      setNewWorkspaceName('');
      setCreateOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '创建失败');
    } finally {
      setCreating(false);
    }
  };

  const handleGenerateInvite = async () => {
    setGeneratingInvite(true);
    try {
      const code = await createInviteCode('member');
      setGeneratedCode(code);
      toast.success('邀请码已生成');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '生成邀请码失败');
    } finally {
      setGeneratingInvite(false);
    }
  };

  const handleJoinWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCode.trim()) return;
    setJoining(true);
    try {
      await joinWorkspaceByCode(joinCode.trim());
      toast.success('成功加入团队工作空间');
      setJoinCode('');
      setInviteOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '加入失败');
    } finally {
      setJoining(false);
    }
  };

  const handleSignOut = async () => {
    const supabase = createSupabaseBrowserClient();
    if (supabase) {
      await supabase.auth.signOut();
    }
    router.push('/login');
    router.refresh();
  };

  const inviteLink =
    generatedCode && typeof window !== 'undefined'
      ? `${window.location.origin}/invite?code=${generatedCode}`
      : '';

  return (
    <>
      <header className="flex h-14 shrink-0 items-center justify-between border-b bg-card px-4 gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden shrink-0"
            onClick={onOpenMobileMenu}
            aria-label="打开导航菜单"
          >
            <Menu className="h-5 w-5" />
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className="h-9 justify-between gap-2 px-3 font-medium max-w-[260px]"
              >
                <span className="flex items-center gap-2 truncate">
                  <Building2 className="h-4 w-4 text-primary shrink-0" />
                  <span className="truncate">
                    {activeWorkspace?.name || '个人工作空间'}
                  </span>
                </span>
                <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              <DropdownMenuLabel>切换工作空间</DropdownMenuLabel>
              {workspaces.map((ws) => (
                <DropdownMenuItem
                  key={ws.id}
                  onClick={() => setActiveWorkspaceId(ws.id)}
                  className="justify-between"
                >
                  <div className="flex items-center gap-2 truncate">
                    <Check
                      className={`h-4 w-4 shrink-0 ${
                        ws.id === activeWorkspace?.id ? 'opacity-100 text-primary' : 'opacity-0'
                      }`}
                    />
                    <span className="truncate">{ws.name}</span>
                  </div>
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    {ROLE_LABEL[ws.role] || ws.role}
                  </Badge>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" />
                <span>新建团队 / 个人空间</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setInviteOpen(true)}>
                <UserPlus className="h-4 w-4" />
                <span>邀请成员 / 邀请码加入</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {activeWorkspace && (
            <Badge
              variant="outline"
              className="hidden sm:inline-flex text-xs font-normal text-muted-foreground"
            >
              角色：{ROLE_LABEL[activeWorkspace.role] || activeWorkspace.role}
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="hidden md:flex items-center gap-1.5">
            {supabaseConfigured ? (
              <Badge
                variant="outline"
                className="gap-1 bg-emerald-50 text-emerald-700 border-emerald-200"
              >
                <Cloud className="h-3 w-3" />
                Supabase 云同步
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="gap-1 bg-amber-50 text-amber-700 border-amber-200"
                title="未配置真实 Supabase 密钥时自动启用本地 JSON 持久化演示模式"
              >
                <HardDrive className="h-3 w-3" />
                本地演示存储模式
              </Badge>
            )}

            {r2Configured && (
              <Badge
                variant="outline"
                className="gap-1 bg-sky-50 text-sky-700 border-sky-200"
              >
                R2 存储已连接
              </Badge>
            )}
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
                  {(user?.email || 'D').slice(0, 1).toUpperCase()}
                </div>
                <span className="hidden sm:inline max-w-[140px] truncate text-xs text-muted-foreground">
                  {user?.email || 'demo@local.workspace'}
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <div className="text-xs font-medium text-foreground truncate">
                  {user?.email || '本地演示账号'}
                </div>
                <div className="text-[11px] font-normal text-muted-foreground">
                  {supabaseConfigured ? '已开启云端 RLS 安全隔离' : '本地演示工作台'}
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setInviteOpen(true)}>
                <Users className="h-4 w-4" />
                <span>团队空间协作</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => router.push('/settings/api')}>
                <span>API 密钥管理中心</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOut} className="text-destructive">
                <LogOut className="h-4 w-4" />
                <span>{supabaseConfigured ? '退出登录' : '前往登录页'}</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* 新建工作空间弹窗 */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新建工作空间</DialogTitle>
            <DialogDescription>
              每个空间拥有独立的产品库、云端素材库与团队共享 API 配置。
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateWorkspace} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="ws-name">空间名称</Label>
              <Input
                id="ws-name"
                placeholder="例如：美妆直播一组 / 个人副业号"
                value={newWorkspaceName}
                onChange={(e) => setNewWorkspaceName(e.target.value)}
                required
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                取消
              </Button>
              <Button type="submit" disabled={creating}>
                {creating ? '创建中...' : '确认创建'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* 邀请与加入工作空间弹窗 */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>团队协作：邀请与加入工作空间</DialogTitle>
            <DialogDescription>
              生成邀请码分享给同事，或输入邀请码加入已有的团队共享空间。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5">
            <div className="rounded-lg border p-4 space-y-3 bg-muted/30">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">邀请同事加入「{activeWorkspace?.name}」</div>
                  <div className="text-xs text-muted-foreground">
                    同事加入后将共享本空间的产品库、公共 API 渠道与团队素材库
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleGenerateInvite}
                  disabled={generatingInvite}
                >
                  {generatingInvite ? '生成中...' : '生成邀请码'}
                </Button>
              </div>
              {generatedCode && (
                <div className="space-y-2 pt-1">
                  <div className="flex items-center gap-2">
                    <Input readOnly value={generatedCode} className="font-mono text-sm" />
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        copyToClipboard(generatedCode);
                        toast.success('已复制邀请码');
                      }}
                    >
                      <Copy className="h-3.5 w-3.5" />
                      复制
                    </Button>
                  </div>
                  {inviteLink && (
                    <div className="flex items-center justify-between text-xs text-muted-foreground bg-background rounded border px-2.5 py-1.5">
                      <span className="truncate mr-2">{inviteLink}</span>
                      <button
                        type="button"
                        className="text-primary hover:underline shrink-0"
                        onClick={() => {
                          copyToClipboard(inviteLink);
                          toast.success('已复制邀请链接');
                        }}
                      >
                        复制链接
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            <form onSubmit={handleJoinWorkspace} className="space-y-3">
              <Label htmlFor="join-code">输入邀请码加入团队空间</Label>
              <div className="flex gap-2">
                <Input
                  id="join-code"
                  placeholder="粘贴同事发来的邀请码，如 TEAM-XXXXXX"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value)}
                />
                <Button type="submit" disabled={joining || !joinCode.trim()}>
                  {joining ? '加入中...' : '立即加入'}
                </Button>
              </div>
            </form>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
