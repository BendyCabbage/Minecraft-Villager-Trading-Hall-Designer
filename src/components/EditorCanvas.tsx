"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { floodCells, idx, lineCells, rectCells, villagerName, xy, type Analysis, type Design } from "@/lib/design";
import { drawDesign, drawGrid } from "@/lib/render";
import { TILE, getTile } from "@/lib/tiles";

export type Tool = "pencil" | "line" | "rect" | "outline" | "fill" | "picker" | "inspect";

export interface Overlays {
  grid: boolean;
  links: boolean;
  issues: boolean;
  spawns: boolean;
  labels: boolean;
}

export interface EditorHandle {
  fit(): void;
  zoomBy(factor: number): void;
  centerOn(cell: number): void;
  toPNG(scale: number, withGrid: boolean): string;
}

interface View {
  zoom: number;
  x: number;
  y: number;
}

interface Props {
  design: Design;
  analysis: Analysis;
  tool: Tool;
  block: string;
  overlays: Overlays;
  selected: number | null;
  onBeginEdit(): void;
  onEndEdit(): void;
  onApply(cells: number[], erase: boolean): void;
  onPick(cell: number): void;
  onSelect(cell: number | null): void;
  onHover(cell: number | null): void;
  onZoom(zoom: number): void;
}

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 8;

const ISSUE_COLOURS = { error: "#ef4444", warn: "#f59e0b", info: "#38bdf8" } as const;

export const EditorCanvas = forwardRef<EditorHandle, Props>(function EditorCanvas(props, ref) {
  const { design, analysis, tool, block, overlays, selected } = props;
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<View>({ zoom: 2, x: 40, y: 40 });
  const [hover, setHover] = useState<number | null>(null);
  const [preview, setPreview] = useState<{ cells: number[]; erase: boolean } | null>(null);
  const [spaceDown, setSpaceDown] = useState(false);
  const [panning, setPanning] = useState(false);

  // Latest values for use inside event handlers and imperative calls.
  const live = useRef({ design, view, size, props });
  useEffect(() => {
    live.current = { design, view, size, props };
  });

  const drag = useRef<
    | { kind: "pan"; sx: number; sy: number; vx: number; vy: number }
    | { kind: "paint"; last: number; erase: boolean }
    | { kind: "shape"; start: number; erase: boolean }
    | null
  >(null);

  const fitTo = useCallback((d: Design, w: number, h: number) => {
    if (!w || !h) return;
    // Leave room for the floating toolbar above and the hotbar + status bar below.
    const padX = 32;
    const top = 64;
    const bottom = 104;
    const zoom = Math.max(
      MIN_ZOOM,
      Math.min(MAX_ZOOM, Math.min((w - padX * 2) / (d.width * TILE), (h - top - bottom) / (d.height * TILE))),
    );
    setView({ zoom, x: (w - d.width * TILE * zoom) / 2, y: top + (h - top - bottom - d.height * TILE * zoom) / 2 });
  }, []);

  const didFit = useRef(false);
  useEffect(() => {
    const el = wrapRef.current!;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ w: width, h: height });
      if (!didFit.current && width > 0) {
        didFit.current = true;
        fitTo(live.current.design, width, height);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [fitTo]);

  useEffect(() => {
    props.onZoom(view.zoom);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.zoom]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space" && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        setSpaceDown(true);
      }
    };
    const up = (e: KeyboardEvent) => e.code === "Space" && setSpaceDown(false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  const zoomAt = useCallback((factor: number, px: number, py: number) => {
    setView((v) => {
      const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, v.zoom * factor));
      const k = zoom / v.zoom;
      return { zoom, x: px - (px - v.x) * k, y: py - (py - v.y) * k };
    });
  }, []);

  const measure = () => {
    const r = wrapRef.current!.getBoundingClientRect();
    return { w: r.width, h: r.height };
  };

  useImperativeHandle(
    ref,
    () => ({
      fit() {
        // Defer so a design swapped in the same event has rendered first.
        requestAnimationFrame(() => {
          const s = measure();
          fitTo(live.current.design, s.w, s.h);
        });
      },
      zoomBy(factor) {
        const s = measure();
        zoomAt(factor, s.w / 2, s.h / 2);
      },
      centerOn(cell) {
        // Deferred: the canvas may have only just been shown.
        requestAnimationFrame(() => {
          const d = live.current.design;
          const s = measure();
          const [x, y] = xy(d, cell);
          setView((v) => {
            const zoom = Math.max(v.zoom, 2);
            return { zoom, x: s.w / 2 - (x + 0.5) * TILE * zoom, y: s.h / 2 - (y + 0.5) * TILE * zoom };
          });
        });
      },
      toPNG(scale, withGrid) {
        const d = live.current.design;
        const cellPx = TILE * scale;
        const c = document.createElement("canvas");
        c.width = d.width * cellPx;
        c.height = d.height * cellPx;
        const ctx = c.getContext("2d")!;
        drawDesign(ctx, d, cellPx, 0, 0, 0, 0, d.width, d.height);
        if (withGrid) drawGrid(ctx, d, cellPx, 0, 0, 0, 0, d.width, d.height);
        return c.toDataURL("image/png");
      },
    }),
    [fitTo, zoomAt],
  );

  // Render.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !size.w) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(size.w * dpr);
    canvas.height = Math.round(size.h * dpr);
    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#17161c";
    ctx.fillRect(0, 0, size.w, size.h);

    const d = design;
    const cellPx = TILE * view.zoom;
    const x0 = Math.max(0, Math.floor(-view.x / cellPx));
    const y0 = Math.max(0, Math.floor(-view.y / cellPx));
    const x1 = Math.min(d.width, Math.ceil((size.w - view.x) / cellPx));
    const y1 = Math.min(d.height, Math.ceil((size.h - view.y) / cellPx));
    const center = (i: number) => {
      const [x, y] = xy(d, i);
      return [view.x + (x + 0.5) * cellPx, view.y + (y + 0.5) * cellPx] as const;
    };
    const cellRect = (i: number, inset = 0) => {
      const [x, y] = xy(d, i);
      return [view.x + x * cellPx + inset, view.y + y * cellPx + inset, cellPx - inset * 2, cellPx - inset * 2] as const;
    };

    // Outer drop shadow.
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(view.x + 6, view.y + 6, d.width * cellPx, d.height * cellPx);

    if (x1 > x0 && y1 > y0) {
      drawDesign(ctx, d, cellPx, view.x, view.y, x0, y0, x1, y1);

      if (overlays.spawns) {
        ctx.strokeStyle = "rgba(239,68,68,0.85)";
        ctx.fillStyle = "rgba(239,68,68,0.18)";
        ctx.lineWidth = Math.max(1, cellPx / 14);
        for (const i of analysis.spawnable) {
          const [sx, sy, w] = cellRect(i);
          ctx.fillRect(sx, sy, w, w);
          const m = w * 0.3;
          ctx.beginPath();
          ctx.moveTo(sx + m, sy + m);
          ctx.lineTo(sx + w - m, sy + w - m);
          ctx.moveTo(sx + w - m, sy + m);
          ctx.lineTo(sx + m, sy + w - m);
          ctx.stroke();
        }
      }

      if (overlays.grid && cellPx >= 6) drawGrid(ctx, d, cellPx, view.x, view.y, x0, y0, x1, y1);

      if (overlays.links) {
        ctx.lineWidth = Math.max(1.5, cellPx / 10);
        ctx.lineCap = "round";
        for (const [v, s] of analysis.links) {
          const [ax, ay] = center(v);
          const [bx, by] = center(s);
          ctx.strokeStyle = "rgba(16,24,20,0.7)";
          ctx.lineWidth = Math.max(3, cellPx / 6);
          ctx.beginPath();
          ctx.moveTo(ax, ay);
          ctx.lineTo(bx, by);
          ctx.stroke();
          ctx.strokeStyle = "#4ade80";
          ctx.lineWidth = Math.max(1.5, cellPx / 12);
          ctx.stroke();
          ctx.fillStyle = "#4ade80";
          ctx.beginPath();
          ctx.arc(bx, by, Math.max(2, cellPx / 10), 0, Math.PI * 2);
          ctx.fill();
        }
      }

      if (overlays.issues) {
        ctx.lineWidth = Math.max(1.5, cellPx / 12);
        for (const [i, level] of analysis.issueCells) {
          const [sx, sy, w] = cellRect(i, ctx.lineWidth / 2);
          ctx.strokeStyle = ISSUE_COLOURS[level];
          ctx.setLineDash([Math.max(2, cellPx / 6), Math.max(2, cellPx / 8)]);
          ctx.strokeRect(sx, sy, w, w);
        }
        ctx.setLineDash([]);
      }

      if (overlays.labels && cellPx >= 20) {
        ctx.font = `600 ${Math.max(9, Math.min(13, cellPx / 3.2))}px ${getComputedStyle(canvas).fontFamily}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        for (const v of analysis.villagers) {
          const [cx] = center(v);
          const [, sy] = cellRect(v);
          // Fit within about two cells so neighbouring pods' names don't overlap.
          const maxW = Math.max(cellPx * 1.9, 40);
          let label = villagerName(d, v);
          if (ctx.measureText(label).width + 8 > maxW) {
            while (label.length > 1 && ctx.measureText(label + "…").width + 8 > maxW) label = label.slice(0, -1);
            label += "…";
          }
          const tw = ctx.measureText(label).width + 8;
          ctx.fillStyle = "rgba(10,12,16,0.82)";
          ctx.fillRect(cx - tw / 2, sy - 16, tw, 15);
          ctx.fillStyle = d.villagers[v]?.trades.length ? "#7cf29c" : "#ececec";
          ctx.fillText(label, cx, sy - 2);
        }
      }
    }

    if (preview) {
      const tile = getTile(block);
      ctx.globalAlpha = 0.65;
      for (const i of preview.cells) {
        const [sx, sy, w] = cellRect(i);
        if (preview.erase) {
          ctx.fillStyle = "rgba(239,68,68,0.45)";
          ctx.fillRect(sx, sy, w, w);
        } else if (tile) ctx.drawImage(tile, sx, sy, w, w);
      }
      ctx.globalAlpha = 1;
    }

    if (selected !== null && selected < d.obj.length) {
      const [sx, sy, w] = cellRect(selected, 1);
      ctx.lineWidth = 3;
      ctx.strokeStyle = "#0b0d10";
      ctx.strokeRect(sx, sy, w, w);
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#34d399";
      ctx.strokeRect(sx, sy, w, w);
    }

    if (hover !== null && hover < d.obj.length && !preview) {
      const [sx, sy, w] = cellRect(hover, 0.5);
      if (tool !== "inspect" && tool !== "picker") {
        const tile = getTile(block);
        if (tile) {
          ctx.globalAlpha = 0.45;
          ctx.drawImage(tile, sx, sy, w, w);
          ctx.globalAlpha = 1;
        }
      }
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.strokeRect(sx, sy, w, w);
    }

    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.strokeRect(Math.round(view.x) - 0.5, Math.round(view.y) - 0.5, d.width * cellPx + 1, d.height * cellPx + 1);
  }, [design, analysis, view, size, overlays, hover, preview, selected, tool, block]);

  // Native listener so we can preventDefault (stops trackpad pinch zooming the page).
  useEffect(() => {
    const canvas = canvasRef.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      if (e.ctrlKey || Math.abs(e.deltaY) >= Math.abs(e.deltaX)) {
        const factor = Math.pow(1.0015, -e.deltaY * (e.deltaMode === 1 ? 30 : 1) * (e.ctrlKey ? 4 : 1));
        zoomAt(factor, e.clientX - rect.left, e.clientY - rect.top);
      } else {
        setView((v) => ({ ...v, x: v.x - e.deltaX }));
      }
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  const cellAt = (e: React.PointerEvent, clamp = false): number | null => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const cellPx = TILE * view.zoom;
    let x = Math.floor((e.clientX - rect.left - view.x) / cellPx);
    let y = Math.floor((e.clientY - rect.top - view.y) / cellPx);
    if (clamp) {
      x = Math.max(0, Math.min(design.width - 1, x));
      y = Math.max(0, Math.min(design.height - 1, y));
    }
    if (x < 0 || y < 0 || x >= design.width || y >= design.height) return null;
    return idx(design, x, y);
  };

  const shapeCells = (start: number, end: number) => {
    if (tool === "line") return lineCells(design, start, end);
    return rectCells(design, start, end, tool === "outline");
  };

  const onPointerDown = (e: React.PointerEvent) => {
    canvasRef.current!.setPointerCapture(e.pointerId);
    if (e.button === 1 || (e.button === 0 && spaceDown)) {
      drag.current = { kind: "pan", sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y };
      setPanning(true);
      return;
    }
    if (e.button !== 0 && e.button !== 2) return;
    const cell = cellAt(e);
    const erase = e.button === 2;
    if (tool === "inspect") {
      props.onSelect(cell);
      return;
    }
    if (cell === null) return;
    if (tool === "picker") {
      props.onPick(cell);
      return;
    }
    if (tool === "fill") {
      props.onBeginEdit();
      props.onApply(floodCells(design, cell, block), erase);
      props.onEndEdit();
      return;
    }
    if (tool === "pencil") {
      props.onBeginEdit();
      props.onApply([cell], erase);
      drag.current = { kind: "paint", last: cell, erase };
      return;
    }
    drag.current = { kind: "shape", start: cell, erase };
    setPreview({ cells: shapeCells(cell, cell), erase });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const g = drag.current;
    if (g?.kind === "pan") {
      setView((v) => ({ ...v, x: g.vx + e.clientX - g.sx, y: g.vy + e.clientY - g.sy }));
      return;
    }
    const cell = cellAt(e);
    if (cell !== hover) {
      setHover(cell);
      props.onHover(cell);
    }
    if (g?.kind === "paint" && cell !== null && cell !== g.last) {
      props.onApply(lineCells(design, g.last, cell), g.erase);
      g.last = cell;
    } else if (g?.kind === "shape") {
      const end = cellAt(e, true)!;
      setPreview({ cells: shapeCells(g.start, end), erase: g.erase });
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const g = drag.current;
    drag.current = null;
    setPanning(false);
    if (g?.kind === "paint") props.onEndEdit();
    if (g?.kind === "shape") {
      const end = cellAt(e, true)!;
      props.onBeginEdit();
      props.onApply(shapeCells(g.start, end), g.erase);
      props.onEndEdit();
      setPreview(null);
    }
  };

  const cursor =
    panning
      ? "grabbing"
      : spaceDown
      ? "grab"
      : tool === "inspect"
        ? "default"
        : tool === "picker"
          ? "copy"
          : "crosshair";

  return (
    <div ref={wrapRef} className="absolute inset-0 overflow-hidden">
      <canvas
        ref={canvasRef}
        className="block h-full w-full touch-none select-none"
        style={{ cursor }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={() => {
          if (!drag.current) {
            setHover(null);
            props.onHover(null);
          }
        }}
        onContextMenu={(e) => e.preventDefault()}
        aria-label="Trading hall canvas"
        role="application"
      />
    </div>
  );
});
