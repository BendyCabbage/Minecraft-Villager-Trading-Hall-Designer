import { getBlock } from "./blocks";
import { idx, type Design } from "./design";
import { getTile } from "./tiles";

export const VOID_A = "#1d1c23";
export const VOID_B = "#201f27";

export function drawDesign(
  ctx: CanvasRenderingContext2D,
  d: Design,
  cellPx: number,
  ox: number,
  oy: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
) {
  ctx.imageSmoothingEnabled = false;
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      const i = idx(d, x, y);
      const sx = ox + x * cellPx;
      const sy = oy + y * cellPx;
      const f = d.floor[i] ? getTile(d.floor[i]!) : null;
      if (f) {
        ctx.drawImage(f, sx, sy, cellPx, cellPx);
        // Dim the floor so blocks standing on it read as raised.
        ctx.fillStyle = "rgba(8,10,14,0.32)";
        ctx.fillRect(sx, sy, cellPx, cellPx);
      } else {
        ctx.fillStyle = (x + y) % 2 ? VOID_A : VOID_B;
        ctx.fillRect(sx, sy, cellPx, cellPx);
      }
      const o = d.obj[i] ? getTile(d.obj[i]!) : null;
      if (o) {
        if (getBlock(d.obj[i])?.raised && cellPx >= 8) {
          ctx.fillStyle = "rgba(0,0,0,0.28)";
          ctx.fillRect(sx + cellPx * 0.12, sy + cellPx * 0.12, cellPx, cellPx);
        }
        ctx.drawImage(o, sx, sy, cellPx, cellPx);
      }
    }
}

export function drawGrid(ctx: CanvasRenderingContext2D, d: Design, cellPx: number, ox: number, oy: number, x0: number, y0: number, x1: number, y1: number) {
  ctx.lineWidth = 1;
  for (let x = x0; x <= x1; x++) {
    ctx.strokeStyle = x % 16 === 0 ? "rgba(255,255,255,0.28)" : "rgba(0,0,0,0.22)";
    const sx = Math.round(ox + x * cellPx) + 0.5;
    ctx.beginPath();
    ctx.moveTo(sx, oy + y0 * cellPx);
    ctx.lineTo(sx, oy + y1 * cellPx);
    ctx.stroke();
  }
  for (let y = y0; y <= y1; y++) {
    ctx.strokeStyle = y % 16 === 0 ? "rgba(255,255,255,0.28)" : "rgba(0,0,0,0.22)";
    const sy = Math.round(oy + y * cellPx) + 0.5;
    ctx.beginPath();
    ctx.moveTo(ox + x0 * cellPx, sy);
    ctx.lineTo(ox + x1 * cellPx, sy);
    ctx.stroke();
  }
}

