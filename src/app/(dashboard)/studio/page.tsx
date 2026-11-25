'use client';

import React, { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';

function StudioRedirectInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const mediaType = searchParams.get('mediaType');
    const qs = searchParams.toString();
    const target = mediaType === 'video' ? '/video-gen' : '/image-gen';
    router.replace(qs ? `${target}?${qs}` : target);
  }, [router, searchParams]);

  return (
    <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      正在前往新版独立创作工作台...
    </div>
  );
}

export default function StudioRedirectPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
          正在跳转...
        </div>
      }
    >
      <StudioRedirectInner />
    </Suspense>
  );
}
