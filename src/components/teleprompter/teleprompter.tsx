'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  FlipHorizontal2,
  Minus,
  Pause,
  Play,
  Plus,
  RotateCcw,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';

export interface TeleprompterSection {
  key: string;
  title: string;
  content: string;
}

interface TeleprompterProps {
  open: boolean;
  onClose: () => void;
  sections: TeleprompterSection[];
  productName?: string;
}

export function Teleprompter({
  open,
  onClose,
  sections,
  productName,
}: TeleprompterProps) {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const [playing, setPlaying] = useState(false);
  const [fontSize, setFontSize] = useState(42);
  const [speed, setSpeed] = useState(45); // pixels per second
  const [mirrored, setMirrored] = useState(false);

  // RequestAnimationFrame smooth scroll loop
  useEffect(() => {
    if (!open || !playing) return;
    let rafId = 0;
    let lastTime = performance.now();

    const step = (now: number) => {
      const dt = (now - lastTime) / 1000;
      lastTime = now;
      const el = scrollContainerRef.current;
      if (el) {
        el.scrollTop += speed * dt;
        if (el.scrollTop + el.clientHeight >= el.scrollHeight - 2) {
          setPlaying(false);
          return;
        }
      }
      rafId = requestAnimationFrame(step);
    };

    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [open, playing, speed]);

  // Keyboard shortcuts: Space play/pause, Arrows speed, +/- fontSize, M mirror, Esc exit
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.code === 'Space') {
        e.preventDefault();
        setPlaying((p) => !p);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSpeed((s) => Math.min(180, s + 10));
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSpeed((s) => Math.max(10, s - 10));
      } else if (e.key === '+' || e.key === '=') {
        setFontSize((f) => Math.min(84, f + 4));
      } else if (e.key === '-') {
        setFontSize((f) => Math.max(22, f - 4));
      } else if (e.key.toLowerCase() === 'm') {
        setMirrored((m) => !m);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const handleResetTop = () => {
    setPlaying(false);
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const jumpToSection = (key: string) => {
    const target = sectionRefs.current[key];
    if (target && scrollContainerRef.current) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black text-white select-none">
      {/* 顶部悬浮控制栏 */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/15 bg-zinc-950/95 px-4 py-3">
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={playing ? 'destructive' : 'default'}
            onClick={() => setPlaying((p) => !p)}
            className="gap-1.5"
          >
            {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            {playing ? '暂停 (Space)' : '开始滚动 (Space)'}
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={handleResetTop}
            className="border-white/20 bg-transparent text-white hover:bg-white/10"
          >
            <RotateCcw className="h-4 w-4" />
            回顶部
          </Button>

          <Button
            size="sm"
            variant={mirrored ? 'default' : 'outline'}
            onClick={() => setMirrored((m) => !m)}
            className={
              mirrored
                ? ''
                : 'border-white/20 bg-transparent text-white hover:bg-white/10'
            }
          >
            <FlipHorizontal2 className="h-4 w-4" />
            {mirrored ? '已镜像 (M)' : '镜像翻转 (M)'}
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-5 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-zinc-400">字号 {fontSize}px</span>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-white hover:bg-white/10"
              onClick={() => setFontSize((f) => Math.max(22, f - 4))}
            >
              <Minus className="h-3.5 w-3.5" />
            </Button>
            <div className="w-24">
              <Slider
                value={[fontSize]}
                min={22}
                max={84}
                step={2}
                onValueChange={([v]) => setFontSize(v)}
              />
            </div>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-white hover:bg-white/10"
              onClick={() => setFontSize((f) => Math.min(84, f + 4))}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-zinc-400">滚速 {speed} px/s</span>
            <div className="w-28">
              <Slider
                value={[speed]}
                min={10}
                max={180}
                step={5}
                onValueChange={([v]) => setSpeed(v)}
              />
            </div>
          </div>

          <Button
            size="sm"
            variant="ghost"
            onClick={onClose}
            className="text-zinc-300 hover:bg-white/15 hover:text-white"
          >
            <X className="h-4 w-4" />
            退出 (Esc)
          </Button>
        </div>
      </div>

      {/* 段落快速锚点栏 */}
      <div className="flex items-center gap-2 overflow-x-auto border-b border-white/10 bg-zinc-900/70 px-4 py-2">
        {productName && (
          <span className="text-xs font-medium text-indigo-300 mr-2 shrink-0">
            当前商品：{productName}
          </span>
        )}
        {sections.map((sec, idx) => (
          <button
            key={sec.key}
            type="button"
            onClick={() => jumpToSection(sec.key)}
            className="shrink-0 rounded-full border border-white/15 px-3 py-1 text-xs text-zinc-300 hover:bg-white/10 hover:text-white transition-colors"
          >
            {idx + 1}. {sec.title}
          </button>
        ))}
      </div>

      {/* 中央视线提示引导区 */}
      <div className="relative flex-1 overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-[34%] h-24 border-y border-indigo-400/35 bg-indigo-500/10 z-10"
        />

        <div
          ref={scrollContainerRef}
          className="h-full overflow-y-auto px-6 sm:px-16 md:px-28 py-[34vh]"
        >
          <div
            className="mx-auto max-w-4xl space-y-14 transition-transform"
            style={{
              transform: mirrored ? 'scaleX(-1)' : 'none',
            }}
          >
            {sections.map((sec, idx) => (
              <div
                key={sec.key}
                ref={(el) => {
                  sectionRefs.current[sec.key] = el;
                }}
                className="space-y-4"
              >
                <div className="inline-block rounded-full border border-amber-400/40 bg-amber-500/15 px-3 py-1 text-sm font-semibold text-amber-300">
                  第 {idx + 1} 节 · {sec.title}
                </div>
                <p
                  className="whitespace-pre-wrap font-medium tracking-wide text-white"
                  style={{
                    fontSize: `${fontSize}px`,
                    lineHeight: 1.65,
                  }}
                >
                  {sec.content.trim() || '（本段暂无内容）'}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
