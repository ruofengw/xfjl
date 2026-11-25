'use client';

import React, { useState } from 'react';
import { usePathname } from 'next/navigation';
import { WorkspaceProvider } from '@/components/providers/workspace-provider';
import { Sidebar } from '@/components/layout/sidebar';
import { Topbar } from '@/components/layout/topbar';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const pathname = usePathname();
  const isCanvas = pathname === '/canvas' || pathname.startsWith('/canvas/');

  return (
    <WorkspaceProvider>
      <div className="flex h-screen w-full overflow-hidden bg-background">
        <Sidebar
          mobileOpen={mobileMenuOpen}
          onCloseMobile={() => setMobileMenuOpen(false)}
        />
        <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
          <Topbar onOpenMobileMenu={() => setMobileMenuOpen(true)} />
          <main
            className={
              isCanvas
                ? 'flex-1 overflow-hidden p-0'
                : 'flex-1 overflow-y-auto p-4 md:p-6'
            }
          >
            {children}
          </main>
        </div>
      </div>
    </WorkspaceProvider>
  );
}
