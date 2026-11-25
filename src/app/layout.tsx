import type { Metadata } from 'next';
import { Toaster } from 'sonner';
import './globals.css';

export const metadata: Metadata = {
  title: 'AI Creative Studio — AI 图片、视频与视觉工作流创作平台',
  description:
    '专业一站式 AI 图片生成、视频创作、节点式视觉工作流与云端素材协同平台，图片与视频 API 独立隔离管理。',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-background text-foreground font-sans">
        {children}
        <Toaster position="top-center" richColors closeButton />
      </body>
    </html>
  );
}
