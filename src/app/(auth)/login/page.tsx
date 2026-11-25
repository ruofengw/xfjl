'use client';

import React, { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowRight, HardDrive, Lock, Mail, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get('next') || '/chat';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [configured, setConfigured] = useState(false);

  useEffect(() => {
    setConfigured(isSupabaseConfigured());
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const supabase = createSupabaseBrowserClient();
    if (!supabase) {
      toast.info('当前处于本地演示模式，直接为您进入工作台');
      router.push(nextPath);
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success('登录成功，正在进入工作台');
      router.push(nextPath);
      router.refresh();
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
          <CardTitle className="text-xl">AI 内容创作协同工作台</CardTitle>
          <CardDescription>
            登录你的账号，与团队同步产品库、云端素材与公共 API 额度
          </CardDescription>
          {!configured && (
            <div className="pt-1">
              <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 gap-1">
                <HardDrive className="h-3 w-3" />
                未检测到 Supabase 密钥 · 支持免配置本地体验
              </Badge>
            </div>
          )}
        </CardHeader>

        <CardContent className="space-y-4">
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">邮箱地址</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
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
              <Label htmlFor="password">密码</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  placeholder="输入登录密码"
                  className="pl-9"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required={configured}
                />
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? '正在登录...' : configured ? '登录进入工作台' : '登录 / 进入工作台'}
            </Button>
          </form>

          {!configured && (
            <Button
              type="button"
              variant="secondary"
              className="w-full"
              onClick={() => router.push('/chat')}
            >
              免账号一键进入本地演示工作台
              <ArrowRight className="h-4 w-4" />
            </Button>
          )}

          <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t">
            <Link href="/register" className="text-primary hover:underline">
              没有账号？注册并自动创建空间
            </Link>
            <Link href="/invite" className="hover:underline">
              使用团队邀请码加入
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">正在加载登录页...</div>}>
      <LoginForm />
    </Suspense>
  );
}
