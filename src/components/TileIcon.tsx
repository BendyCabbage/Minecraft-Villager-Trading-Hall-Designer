"use client";

import { useEffect, useRef } from "react";
import { TILE, getTile } from "@/lib/tiles";

export function TileIcon({ id, size = 32, className = "" }: { id: string | null; size?: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, TILE, TILE);
    const tile = id ? getTile(id) : null;
    if (tile) ctx.drawImage(tile, 0, 0);
  }, [id]);
  return (
    <canvas
      ref={ref}
      width={TILE}
      height={TILE}
      className={`pixelated shrink-0 ${className}`}
      style={{ width: size, height: size }}
      aria-hidden
    />
  );
}
