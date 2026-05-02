'use client';

import React, { useCallback, useEffect, useRef } from 'react';

type Props = {
  className?: string;
  onChange?: (dataUrl: string | null) => void;
};

export default function SignaturePad({ className, onChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);

  const syncSize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    ctx.strokeStyle = '#18181b';
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, []);

  useEffect(() => {
    syncSize();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => syncSize()) : null;
    if (canvasRef.current && ro) ro.observe(canvasRef.current);
    return () => ro?.disconnect();
  }, [syncSize]);

  const emit = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !onChange) return;
    try {
      onChange(canvas.toDataURL('image/png'));
    } catch {
      onChange(null);
    }
  }, [onChange]);

  const pos = (ev: React.PointerEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const r = canvas.getBoundingClientRect();
    return { x: ev.clientX - r.left, y: ev.clientY - r.top };
  };

  const onPointerDown = (ev: React.PointerEvent) => {
    ev.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(ev.pointerId);
    drawing.current = true;
    last.current = pos(ev);
  };

  const onPointerUp = (ev: React.PointerEvent) => {
    ev.preventDefault();
    drawing.current = false;
    last.current = null;
    emit();
  };

  const onPointerMove = (ev: React.PointerEvent) => {
    if (!drawing.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx || !canvas) return;
    const p = pos(ev);
    const prev = last.current;
    if (prev) {
      ctx.beginPath();
      ctx.moveTo(prev.x, prev.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }
    last.current = p;
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
    onChange?.(null);
  };

  return (
    <div className={className}>
      <canvas
        ref={canvasRef}
        className="h-40 w-full touch-none rounded-xl border-2 border-dashed border-zinc-300 bg-white"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerMove={onPointerMove}
      />
      <button
        type="button"
        onClick={clear}
        className="mt-2 h-11 w-full rounded-xl border border-zinc-300 bg-zinc-50 text-sm font-bold text-zinc-800"
      >
        Borrar firma
      </button>
    </div>
  );
}
