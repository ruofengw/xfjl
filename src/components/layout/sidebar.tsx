'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ChevronLeft,
  ChevronRight,
  Film,
  FolderKanban,
  History,
  Home,
  Image as ImageIcon,
  KeyRound,
  MessageSquareText,
  Mic2,
  Package,
  PenTool,
  Sparkles,
  Workflow,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
}

const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: '视觉创作',
    items: [
      { label: '工作台', href: '/workbench', icon: Home },
      { label: '图片生成', href: '/image-gen', icon: ImageIcon },
      { label: '视频生成', href: '/video-gen', icon: Film },
      { label: '创作画布', href: '/canvas', icon: Workflow, badge: '节点流' },
    ],
  },
  {
    title: '历史与资产',
    items: [
      { label: '作品 / 生成历史', href: '/history', icon: History },
      { label: '云端素材库', href: '/assets', icon: FolderKanban },
      { label: '产品库底座', href: '/products', icon: Package },
    ],
  },
  {
    title: '文案与直播',
    items: [
      { label: 'AI 对话', href: '/chat', icon: MessageSquareText },
      { label: '爆款文案', href: '/copywriting', icon: PenTool },
      { label: '主播话术 & 提词器', href: '/live-script', icon: Mic2 },
    ],
  },
];

interface SidebarProps {
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}

const COLLAPSE_STORAGE_KEY = 'ai_studio_sidebar_collapsed';

export function Sidebar({ mobileOpen = false, onCloseMobile }: SidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setCollapsed(window.localStorage.getItem(COLLAPSE_STORAGE_KEY) === 'true');
    }
  }, []);

  const toggleCollapse = () => {
    setCollapsed((prev) => {
      const next = !prev;
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(COLLAPSE_STORAGE_KEY, String(next));
      }
      return next;
    });
  };

  const renderContent = (isCollapsed: boolean) => {
    const isApiActive = pathname.startsWith('/settings/api');

    return (
      <div className="flex h-full flex-col bg-card border-r select-none">
        {/* 顶部品牌栏 */}
        <div className="flex h-14 items-center justify-between border-b px-3.5">
          <Link
            href="/workbench"
            className="flex items-center gap-2.5 font-semibold tracking-tight text-foreground min-w-0"
            onClick={onCloseMobile}
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
              <Sparkles className="h-4 w-4" />
            </div>
            {!isCollapsed && (
              <div className="leading-tight min-w-0">
                <div className="text-sm font-bold truncate">AI Creative Studio</div>
                <div className="text-[11px] font-normal text-muted-foreground truncate">
                  图 / 视频与视觉工作流
                </div>
              </div>
            )}
          </Link>

          {onCloseMobile ? (
            <button
              type="button"
              onClick={onCloseMobile}
              className="rounded-md p-1 text-muted-foreground hover:bg-muted lg:hidden"
              aria-label="关闭侧边栏"
            >
              <X className="h-5 w-5" />
            </button>
          ) : null}

          <button
            type="button"
            onClick={toggleCollapse}
            className="hidden lg:flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            title={isCollapsed ? '展开导航栏' : '折叠导航栏'}
          >
            {isCollapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </button>
        </div>

        {/* 中间主导航菜单 */}
        <nav className="flex-1 space-y-5 overflow-y-auto px-2.5 py-4">
          {NAV_GROUPS.map((group) => (
            <div key={group.title} className="space-y-1">
              {!isCollapsed && (
                <div className="px-2.5 pb-1 text-[11px] font-medium text-muted-foreground/80">
                  {group.title}
                </div>
              )}
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const isActive =
                    pathname === item.href || pathname.startsWith(`${item.href}/`);
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onCloseMobile}
                      title={isCollapsed ? item.label : undefined}
                      className={cn(
                        'flex items-center rounded-lg px-2.5 py-2 text-sm font-medium transition-colors',
                        isCollapsed ? 'justify-center' : 'justify-between',
                        isActive
                          ? 'bg-primary/10 text-primary'
                          : 'text-muted-foreground hover:bg-muted/80 hover:text-foreground'
                      )}
                    >
                      <span className="flex items-center gap-2.5 min-w-0">
                        <Icon
                          className={cn(
                            'h-4 w-4 shrink-0',
                            isActive ? 'text-primary' : 'text-muted-foreground'
                          )}
                        />
                        {!isCollapsed && <span className="truncate">{item.label}</span>}
                      </span>
                      {!isCollapsed && item.badge && (
                        <Badge
                          variant="secondary"
                          className="px-1.5 py-0 text-[10px] font-medium"
                        >
                          {item.badge}
                        </Badge>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* 底部固定系统设置与 API 入口 */}
        <div className="border-t p-2.5 space-y-1">
          <Link
            href="/settings/api"
            onClick={onCloseMobile}
            title={isCollapsed ? 'API 管理中心' : undefined}
            className={cn(
              'flex items-center rounded-lg px-2.5 py-2 text-sm font-medium transition-colors',
              isCollapsed ? 'justify-center' : 'gap-2.5',
              isApiActive
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-muted/80 hover:text-foreground'
            )}
          >
            <KeyRound
              className={cn(
                'h-4 w-4 shrink-0',
                isApiActive ? 'text-primary' : 'text-muted-foreground'
              )}
            />
            {!isCollapsed && <span>API 管理（图/视频独立）</span>}
          </Link>
        </div>
      </div>
    );
  };

  return (
    <>
      <aside
        className={cn(
          'hidden shrink-0 transition-all duration-200 lg:block',
          collapsed ? 'w-[68px]' : 'w-60'
        )}
      >
        {renderContent(collapsed)}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-[1px]"
            onClick={onCloseMobile}
          />
          <aside className="relative z-10 w-64 max-w-[82vw] h-full shadow-xl">
            {renderContent(false)}
          </aside>
        </div>
      )}
    </>
  );
}
