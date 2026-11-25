'use client';

import React, { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Ticket, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

function InviteJoinForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [code, setCode] = useState(searchParams.get('code') || '');
  const [loading, setLoading] = useState(false);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    setLoading(true);
    try {
      const res = await fetch('/api/workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'join', inviteCode: code.trim() }),
      });
      const data = await res.json();
      if (res.status === 401) {
        toast.info('请先登录后再加入团队工作空间');
        router.push(`/register?code=${encodeURIComponent(code.trim())}`);
        return;
      }
      if (!res.ok) {
        toast.error(data.error || '加入失败');
        return;
      }
      if (typeof window !== 'undefined' && data.workspace?.id) {
        window.localStorage.setItem('ai_workbench_active_workspace', data.workspace.id);
      }
      toast.success(`已加入工作空间「${data.workspace?.name || ''}」`);
      router.push('/chat');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-indigo-50/40 to-slate-100 p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="space-y-2 text-center">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Users className="h-5 w-5" />
          </div>
          <CardTitle className="text-xl">加入团队工作空间</CardTitle>
          <CardDescription>
            加入同一空间后即可共享产品卖点库、云端素材库与团队公共 API 密钥
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <form onSubmit={handleJoin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="invite-code">团队邀请码</Label>
              <div className="relative">
                <Ticket className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="invite-code"
                  placeholder="例如 TEAM-A1B2C3D4"
                  className="pl-9 font-mono"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  required
                />
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? '正在验证并加入...' : '加入团队空间'}
            </Button>
          </form>

          <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t">
            <Link href="/login" className="hover:underline">
              前往登录
            </Link>
            <Link
              href={code ? `/register?code=${encodeURIComponent(code)}` : '/register'}
              className="text-primary hover:underline"
            >
              新成员注册并加入
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function InvitePage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">正在加载邀请页面...</div>}>
      <InviteJoinForm />
    </Suspense>
  );
}
