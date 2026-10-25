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
  level = 0,
) {
  ctx.imageSmoothingEnabled = false;
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      const i = idx(d, x, y, level);
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

/** Faint copy of the blocks one level down, drawn wherever this level has nothing standing. */
export function drawGhost(ctx: CanvasRenderingContext2D, d: Design, cellPx: number, ox: number, oy: number, x0: number, y0: number, x1: number, y1: number, level: number) {
  if (level < 1) return;
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = 0.32;
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      if (d.obj[idx(d, x, y, level)]) continue;
      const below = d.obj[idx(d, x, y, level - 1)];
      const tile = below ? getTile(below) : null;
      if (tile) ctx.drawImage(tile, ox + x * cellPx, oy + y * cellPx, cellPx, cellPx);
    }
  ctx.globalAlpha = 1;
}

/* ------------------------------------------------------------------ */
/* Every level on one sheet, for image export and previews.           */

/** Wide halls stack their levels top to bottom (highest first); others sit side by side. */
export function sheetLayout(d: Design, cellPx: number, labelPx: number) {
  const multi = d.levels > 1;
  const label = multi ? labelPx : 0;
  const gap = multi ? Math.max(cellPx, labelPx * 0.75) : 0;
  const vertical = d.width > d.height;
  const pw = d.width * cellPx;
  const ph = d.height * cellPx + label;
  const at = (l: number) => (vertical ? [0, (d.levels - 1 - l) * (ph + gap)] : [l * (pw + gap), 0]) as [number, number];
  return {
    width: vertical ? pw : d.levels * pw + (d.levels - 1) * gap,
    height: vertical ? d.levels * ph + (d.levels - 1) * gap : ph,
    label,
    at,
  };
}

/** Largest whole cell size that fits the whole sheet inside `w` × `h`. */
export function fitSheet(d: Design, w: number, h: number, labelPx: number) {
  let cell = Math.max(1, Math.floor(Math.min(w / d.width, h / d.height)));
  while (cell > 1) {
    const s = sheetLayout(d, cell, labelPx);
    if (s.width <= w && s.height <= h) break;
    cell--;
  }
  return cell;
}

export function drawSheet(ctx: CanvasRenderingContext2D, d: Design, cellPx: number, ox: number, oy: number, opts: { grid?: boolean; labelPx: number; labelColour: string; font: string }) {
  const s = sheetLayout(d, cellPx, opts.labelPx);
  for (let l = 0; l < d.levels; l++) {
    const [lx, ly] = s.at(l);
    const top = oy + ly + s.label;
    if (s.label) {
      ctx.fillStyle = opts.labelColour;
      ctx.font = `600 ${Math.round(s.label * 0.62)}px ${opts.font}`;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(`Level ${l + 1}`, ox + lx, oy + ly + s.label / 2);
    }
    drawDesign(ctx, d, cellPx, ox + lx, top, 0, 0, d.width, d.height, l);
    if (opts.grid) drawGrid(ctx, d, cellPx, ox + lx, top, 0, 0, d.width, d.height);
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

