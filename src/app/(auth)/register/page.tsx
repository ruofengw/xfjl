'use client';

import React, { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Lock, Mail, Sparkles, Ticket } from 'lucide-react';
import { toast } from 'sonner';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState(searchParams.get('code') || '');
  const [loading, setLoading] = useState(false);
  const [configured, setConfigured] = useState(false);

  useEffect(() => {
    setConfigured(isSupabaseConfigured());
  }, []);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    const supabase = createSupabaseBrowserClient();
    if (!supabase) {
      toast.info('当前处于本地演示模式，已为您自动初始化默认工作空间');
      router.push('/chat');
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      });

      if (error) {
        toast.error(error.message);
        return;
      }

      if (data.session) {
        // Ensure personal workspace & optional invite join
        await fetch('/api/workspaces');
        if (inviteCode.trim()) {
          await fetch('/api/workspaces', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'join', inviteCode: inviteCode.trim() }),
          });
        }
        toast.success('注册成功，已自动为您创建默认个人工作空间');
        router.push('/chat');
        router.refresh();
      } else {
        toast.success('注册请求已提交，请查收验证邮件后登录');
        router.push('/login');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-indigo-50/40 to-slate-100 p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="space-y-2 text-center">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow">
            <Sparkles className="h-5 w-5" />
          </div>
          <CardTitle className="text-xl">注册工作台账号</CardTitle>
          <CardDescription>
            注册后将自动创建专属「个人工作空间」，也可填写团队邀请码直接协同
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <form onSubmit={handleRegister} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="reg-email">邮箱地址</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="reg-email"
                  type="email"
                  placeholder="name@company.com"
                  className="pl-9"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required={configured}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="reg-password">设置密码（至少 6 位）</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="reg-password"
                  type="password"
                  minLength={6}
                  placeholder="设置密码"
                  className="pl-9"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required={configured}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="reg-invite">团队邀请码（选填）</Label>
              <div className="relative">
                <Ticket className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="reg-invite"
                  placeholder="如有团队邀请码可填写，例如 TEAM-XXXX"
                  className="pl-9"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                />
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? '正在注册...' : '注册并初始化工作空间'}
            </Button>
          </form>

          <div className="text-center text-xs text-muted-foreground pt-2 border-t">
            已有账号？{' '}
            <Link href="/login" className="text-primary hover:underline">
              返回登录
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">正在加载注册页...</div>}>
      <RegisterForm />
    </Suspense>
  );
}
