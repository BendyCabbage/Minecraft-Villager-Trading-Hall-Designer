import { BLOCKS, getBlock, professionById, type BlockDef } from "./blocks";
import { professionOfKey, resolveTrade, type Edition } from "./trades";

export interface OwnedTrade {
  key: string;
  /** Emerald price the player locked in, if recorded. */
  price?: number;
}

export interface VillagerMeta {
  /** Custom name. Falls back to the profession name. */
  name?: string;
  /** Trades this villager has. */
  trades: OwnedTrade[];
  /** Trades this villager is being rerolled for. */
  targets: string[];
  note?: string;
}

export interface WishItem {
  key: string;
  note?: string;
}

export interface Design {
  version: 2;
  name: string;
  edition: Edition;
  width: number;
  height: number;
  /** Stacked floors, all sharing one footprint. Level 0 is the bottom. */
  levels: number;
  /** One entry per cell, level by level: cell = (level * height + z) * width + x. */
  floor: (string | null)[];
  obj: (string | null)[];
  /** Per-cell villager details, keyed by cell index. */
  villagers: Record<number, VillagerMeta>;
  wishlist: WishItem[];
  /**
   * Plan each villager for a single wanted trade. Stacking several specific trades on
   * one villager is possible but rarely worth the rerolling.
   */
  oneTradePerVillager: boolean;
}

export const MIN_SIZE = 4;
export const MAX_SIZE = 128;
export const MAX_LEVELS = 12;

export function createDesign(width: number, height: number, name = "Untitled hall", edition: Edition = "java"): Design {
  return {
    version: 2,
    name,
    edition,
    width,
    height,
    levels: 1,
    floor: new Array(width * height).fill(null),
    obj: new Array(width * height).fill(null),
    villagers: {},
    wishlist: [],
    oneTradePerVillager: true,
  };
}

type Footprint = Pick<Design, "width" | "height">;

export const idx = (d: Footprint, x: number, y: number, level = 0) => (level * d.height + y) * d.width + x;
/** X and Z within the cell's own level. */
export const xy = (d: Footprint, i: number) => {
  const a = i % (d.width * d.height);
  return [a % d.width, Math.floor(a / d.width)] as const;
};
export const levelOf = (d: Footprint, i: number) => Math.floor(i / (d.width * d.height));
/** "4, 7", plus the level when the hall has more than one. */
export const cellLabel = (d: Design, i: number) => `${xy(d, i).join(", ")}${d.levels > 1 ? ` on level ${levelOf(d, i) + 1}` : ""}`;

export function inBounds(d: Pick<Design, "width" | "height">, x: number, y: number) {
  return x >= 0 && y >= 0 && x < d.width && y < d.height;
}

export const emptyMeta = (): VillagerMeta => ({ trades: [], targets: [] });

export function villagerMeta(d: Design, cell: number): VillagerMeta {
  return d.villagers[cell] ?? emptyMeta();
}

/** Name used when none is set: its first recorded trade ("Protection IV", "Pumpkin"), else its profession. */
export function defaultVillagerName(d: Design, cell: number) {
  for (const t of d.villagers[cell]?.trades ?? []) {
    const o = resolveTrade(d.edition, t.key);
    if (o) return o.label;
  }
  const def = getBlock(d.obj[cell]);
  return def?.kind === "villager" ? professionById(def.profession!)!.name : "Villager";
}

/** The villager's custom name, or its default name. */
export function villagerName(d: Design, cell: number) {
  return d.villagers[cell]?.name?.trim() || defaultVillagerName(d, cell);
}

/** Keep what still makes sense when a villager changes profession: its name and note. */
function carryMeta(meta: VillagerMeta, profession: string): VillagerMeta {
  return {
    ...meta,
    trades: meta.trades.filter((t) => professionOfKey(t.key) === profession),
    targets: meta.targets.filter((k) => professionOfKey(k) === profession),
  };
}

/** Place `blockId` (or erase that block's layer) on every cell in `cells`. */
export function applyCells(d: Design, cells: number[], blockId: string, erase: boolean): Design {
  const def = getBlock(blockId);
  if (!def) return d;
  const layer = def.layer === "floor" ? "floor" : "obj";
  const value = erase ? null : blockId;
  const nextDef = getBlock(value);
  let arr: (string | null)[] | null = null;
  let villagers: Record<number, VillagerMeta> | null = null;
  for (const i of cells) {
    if (i < 0 || i >= d.floor.length) continue;
    if (d[layer][i] === value) continue;
    arr ??= d[layer].slice();
    arr[i] = value;
    const meta = d.villagers[i];
    if (layer === "obj" && meta) {
      villagers ??= { ...d.villagers };
      if (nextDef?.kind === "villager") villagers[i] = carryMeta(meta, nextDef.profession!);
      else delete villagers[i];
    }
  }
  if (!arr) return d;
  return { ...d, [layer]: arr, villagers: villagers ?? d.villagers };
}

/**
 * Clear each cell's top layer: the block or villager if there is one, otherwise the floor.
 * With `all`, clear both layers.
 */
export function eraseCells(d: Design, cells: number[], all: boolean): Design {
  let floor: (string | null)[] | null = null;
  let obj: (string | null)[] | null = null;
  let villagers: Record<number, VillagerMeta> | null = null;
  for (const i of cells) {
    if (i < 0 || i >= d.obj.length) continue;
    if (d.obj[i] !== null) {
      obj ??= d.obj.slice();
      obj[i] = null;
      if (d.villagers[i]) {
        villagers ??= { ...d.villagers };
        delete villagers[i];
      }
      if (!all) continue;
    }
    if (d.floor[i] !== null) {
      floor ??= d.floor.slice();
      floor[i] = null;
    }
  }
  if (!obj && !floor) return d;
  return { ...d, obj: obj ?? d.obj, floor: floor ?? d.floor, villagers: villagers ?? d.villagers };
}

/**
 * Move what's on `layer` at `from` to `to`, swapping with anything already there.
 * A villager's name, trades and notes travel with it.
 */
export function moveCell(d: Design, from: number, to: number, layer: "floor" | "obj"): Design {
  if (from === to || d[layer][from] === d[layer][to]) return d;
  const arr = d[layer].slice();
  [arr[from], arr[to]] = [arr[to], arr[from]];
  if (layer === "floor") return { ...d, floor: arr };
  const villagers = { ...d.villagers };
  const [a, b] = [d.villagers[from], d.villagers[to]];
  delete villagers[from];
  delete villagers[to];
  if (a) villagers[to] = a;
  if (b) villagers[from] = b;
  return { ...d, obj: arr, villagers };
}

export function updateVillager(d: Design, cell: number, fn: (m: VillagerMeta) => VillagerMeta): Design {
  return { ...d, villagers: { ...d.villagers, [cell]: fn(villagerMeta(d, cell)) } };
}

/** 4-connected flood fill on the layer of `blockId`. */
export function floodCells(d: Design, start: number, blockId: string): number[] {
  const def = getBlock(blockId);
  if (!def) return [];
  const arr = def.layer === "floor" ? d.floor : d.obj;
  const target = arr[start];
  const seen = new Uint8Array(arr.length);
  const out: number[] = [];
  const stack = [start];
  const level = levelOf(d, start);
  seen[start] = 1;
  while (stack.length) {
    const i = stack.pop()!;
    out.push(i);
    const [x, y] = xy(d, i);
    for (const [dx, dy] of NEIGHBOURS4) {
      const nx = x + dx;
      const ny = y + dy;
      if (!inBounds(d, nx, ny)) continue;
      const n = idx(d, nx, ny, level);
      if (seen[n] || arr[n] !== target) continue;
      seen[n] = 1;
      stack.push(n);
    }
  }
  return out;
}

export function lineCells(d: Design, a: number, b: number): number[] {
  let [x0, y0] = xy(d, a);
  const [x1, y1] = xy(d, b);
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  const level = levelOf(d, a);
  const out: number[] = [];
  for (;;) {
    out.push(idx(d, x0, y0, level));
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
  return out;
}

export function rectCells(d: Design, a: number, b: number, hollow: boolean): number[] {
  const [ax, ay] = xy(d, a);
  const [bx, by] = xy(d, b);
  const [x0, x1] = [Math.min(ax, bx), Math.max(ax, bx)];
  const [y0, y1] = [Math.min(ay, by), Math.max(ay, by)];
  const level = levelOf(d, a);
  const out: number[] = [];
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      if (hollow && x !== x0 && x !== x1 && y !== y0 && y !== y1) continue;
      out.push(idx(d, x, y, level));
    }
  return out;
}

/** Resize every level. Content is anchored to the top-left. */
export function resizeDesign(d: Design, width: number, height: number): Design {
  width = clampSize(width);
  height = clampSize(height);
  const next: Design = {
    ...createDesign(width, height, d.name, d.edition),
    levels: d.levels,
    floor: new Array(width * height * d.levels).fill(null),
    obj: new Array(width * height * d.levels).fill(null),
    wishlist: d.wishlist,
    oneTradePerVillager: d.oneTradePerVillager,
  };
  for (let l = 0; l < d.levels; l++)
    for (let y = 0; y < Math.min(height, d.height); y++)
      for (let x = 0; x < Math.min(width, d.width); x++) {
        const from = idx(d, x, y, l);
        const to = idx(next, x, y, l);
        next.floor[to] = d.floor[from];
        next.obj[to] = d.obj[from];
        if (d.villagers[from]) next.villagers[to] = d.villagers[from];
      }
  return next;
}

/** A level in a rebuilt stack: an existing level, an empty one, or a copy of one's blocks. */
type LevelSource = number | null | { copy: number };

function rebuildLevels(d: Design, sources: LevelSource[]): Design {
  const A = d.width * d.height;
  const floor: (string | null)[] = new Array(A * sources.length).fill(null);
  const obj: (string | null)[] = new Array(A * sources.length).fill(null);
  const villagers: Record<number, VillagerMeta> = {};
  sources.forEach((src, l) => {
    if (src === null) return;
    const from = typeof src === "number" ? src : src.copy;
    for (let i = 0; i < A; i++) {
      floor[l * A + i] = d.floor[from * A + i];
      obj[l * A + i] = d.obj[from * A + i];
      // A copy gets the villagers but not their names or trades, which belong to the originals.
      const meta = d.villagers[from * A + i];
      if (meta && typeof src === "number") villagers[l * A + i] = meta;
    }
  });
  return { ...d, levels: sources.length, floor, obj, villagers };
}

const levelList = (d: Design) => Array.from({ length: d.levels }, (_, l): LevelSource => l);

/** Insert an empty level at `at` (0 = new bottom level, `levels` = new top level). */
export function addLevel(d: Design, at: number): Design {
  if (d.levels >= MAX_LEVELS) return d;
  const list = levelList(d);
  list.splice(at, 0, null);
  return rebuildLevels(d, list);
}

/** Copy a level's blocks and villagers into a new level just above it. */
export function duplicateLevel(d: Design, level: number): Design {
  if (d.levels >= MAX_LEVELS) return d;
  const list = levelList(d);
  list.splice(level + 1, 0, { copy: level });
  return rebuildLevels(d, list);
}

export function removeLevel(d: Design, level: number): Design {
  if (d.levels <= 1) return d;
  return rebuildLevels(d, levelList(d).filter((l) => l !== level));
}

export function swapLevels(d: Design, a: number, b: number): Design {
  if (a === b || a < 0 || b < 0 || a >= d.levels || b >= d.levels) return d;
  const list = levelList(d);
  [list[a], list[b]] = [list[b], list[a]];
  return rebuildLevels(d, list);
}

export function clampSize(n: number) {
  return Math.max(MIN_SIZE, Math.min(MAX_SIZE, Math.round(n) || MIN_SIZE));
}

/* ------------------------------------------------------------------ */
/* Analysis                                                           */
/* ------------------------------------------------------------------ */

export type IssueLevel = "error" | "warn" | "info";

export interface Issue {
  level: IssueLevel;
  cell: number;
  message: string;
}

export type WishStatus = "secured" | "planned" | "missing";

export interface Analysis {
  villagers: number[];
  /** villager cell → job site cell */
  links: Map<number, number>;
  /** job site cell → villager cell */
  claimedBy: Map<number, number>;
  issues: Issue[];
  issueCells: Map<number, IssueLevel>;
  professionCounts: Record<string, number>;
  materials: { name: string; count: number; id: string }[];
  /** Block light level per cell (single-layer approximation). */
  light: Uint8Array;
  spawnable: number[];
  /** trade key → villager cells that have it */
  owners: Map<string, number[]>;
  /** trade key → villager cells being rolled for it */
  planners: Map<string, number[]>;
  wishStatus: Map<string, WishStatus>;
}

export const NEIGHBOURS4 = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

export function computeLight(d: Design) {
  const light = new Uint8Array(d.obj.length);
  const queue: number[] = [];
  for (let i = 0; i < d.obj.length; i++) {
    const l = Math.max(getBlock(d.obj[i])?.light ?? 0, getBlock(d.floor[i])?.light ?? 0);
    if (l > 0) {
      light[i] = l;
      queue.push(i);
    }
  }
  // Each level is lit on its own: the floor above counts as a solid ceiling.
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q];
    const next = light[i] - 1;
    if (next <= 0) continue;
    const [x, y] = xy(d, i);
    const level = levelOf(d, i);
    for (const [dx, dy] of NEIGHBOURS4) {
      if (!inBounds(d, x + dx, y + dy)) continue;
      const n = idx(d, x + dx, y + dy, level);
      if (light[n] >= next) continue;
      if (getBlock(d.obj[n])?.opaque) continue;
      light[n] = next;
      queue.push(n);
    }
  }
  return light;
}

/** Floor tiles at block light 0 with nothing on them: hostile mobs can spawn there (1.18+). */
export function spawnableCells(d: Design, light = computeLight(d)) {
  const out: number[] = [];
  for (let i = 0; i < d.obj.length; i++) {
    const f = getBlock(d.floor[i]);
    if (!f || f.noSpawn || f.light || d.obj[i] !== null || light[i] > 0) continue;
    out.push(i);
  }
  return out;
}

export function analyze(d: Design, reach: number): Analysis {
  const villagers: number[] = [];
  const stations: number[] = [];
  const professionCounts: Record<string, number> = {};
  const mats = new Map<string, { name: string; count: number; id: string }>();
  const count = (def: BlockDef | undefined) => {
    if (!def?.material) return;
    const m = mats.get(def.material) ?? { name: def.material, count: 0, id: def.id };
    m.count++;
    mats.set(def.material, m);
  };

  for (let i = 0; i < d.obj.length; i++) {
    const o = getBlock(d.obj[i]);
    count(getBlock(d.floor[i]));
    count(o);
    if (o?.kind === "villager") {
      villagers.push(i);
      professionCounts[o.profession!] = (professionCounts[o.profession!] ?? 0) + 1;
    } else if (o?.kind === "workstation") stations.push(i);
  }

  // Villagers only link to job sites on their own level.
  const dist = (a: number, b: number) => {
    if (levelOf(d, a) !== levelOf(d, b)) return Infinity;
    const [ax, ay] = xy(d, a);
    const [bx, by] = xy(d, b);
    return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
  };

  // Greedy shortest-first matching of villagers to job sites of their profession.
  // Unemployed villagers will take any free job site, so they match last.
  const links = new Map<number, number>();
  const claimedBy = new Map<number, number>();
  const pairs: { v: number; s: number; d: number; employed: boolean }[] = [];
  for (const v of villagers) {
    const prof = getBlock(d.obj[v])!.profession!;
    if (prof === "nitwit") continue;
    for (const s of stations) {
      const sp = getBlock(d.obj[s])!.profession;
      if (prof !== "unemployed" && sp !== prof) continue;
      const dd = dist(v, s);
      if (dd <= reach) pairs.push({ v, s, d: dd, employed: prof !== "unemployed" });
    }
  }
  pairs.sort((a, b) => Number(b.employed) - Number(a.employed) || a.d - b.d);
  for (const p of pairs) {
    if (links.has(p.v) || claimedBy.has(p.s)) continue;
    links.set(p.v, p.s);
    claimedBy.set(p.s, p.v);
  }

  const issues: Issue[] = [];
  const isOpen = (x: number, y: number, level: number) => {
    if (!inBounds(d, x, y)) return true;
    const o = getBlock(d.obj[idx(d, x, y, level)]);
    return !(o?.solid || o?.kind === "villager");
  };
  const blocks = (n: number) => `${n} block${n === 1 ? "" : "s"}`;

  const owners = new Map<string, number[]>();
  const planners = new Map<string, number[]>();
  const push = (m: Map<string, number[]>, k: string, v: number) => m.set(k, [...(m.get(k) ?? []), v]);

  for (const v of villagers) {
    const def = getBlock(d.obj[v])!;
    const prof = professionById(def.profession!)!;
    const name = villagerName(d, v);
    const [x, y] = xy(d, v);
    if (prof.id === "nitwit") {
      issues.push({ level: "warn", cell: v, message: `${name} is a nitwit and can never trade.` });
    } else if (!links.has(v)) {
      if (prof.id === "unemployed") issues.push({ level: "info", cell: v, message: `${name} has no free job site within ${blocks(reach)}.` });
      else
        issues.push({
          level: "error",
          cell: v,
          message: `${name} has no free ${getBlock(prof.workstation)!.name.toLowerCase()} within ${blocks(reach)}.`,
        });
    } else if (prof.id === "unemployed") {
      const takes = getBlock(d.obj[links.get(v)!])!;
      issues.push({ level: "info", cell: v, message: `${name} will become a ${professionById(takes.profession!)!.name.toLowerCase()}.` });
    }
    const exits = NEIGHBOURS4.filter(([dx, dy]) => isOpen(x + dx, y + dy, levelOf(d, v))).length;
    if (exits > 0) issues.push({ level: "warn", cell: v, message: `${name} isn't boxed in (${exits} open side${exits === 1 ? "" : "s"}) and may wander off.` });
    if (d.floor[v] === null) issues.push({ level: "warn", cell: v, message: `${name} is standing on nothing.` });

    const meta = d.villagers[v];
    if (meta) {
      for (const t of meta.trades) {
        push(owners, t.key, v);
        if (!resolveTrade(d.edition, t.key))
          issues.push({ level: "info", cell: v, message: `${name} has a trade that ${d.edition === "java" ? "Java" : "Bedrock"} Edition doesn't offer.` });
      }
      for (const k of meta.targets) push(planners, k, v);
      if (d.oneTradePerVillager && meta.targets.length > 1)
        issues.push({ level: "info", cell: v, message: `${name} is being rolled for ${meta.targets.length} trades, but this hall plans one per villager.` });
    }
  }

  for (const s of stations) {
    if (!claimedBy.has(s)) {
      issues.push({ level: "warn", cell: s, message: `${getBlock(d.obj[s])!.name} isn't claimed by a nearby villager.` });
    }
  }

  const light = computeLight(d);
  const spawnable = spawnableCells(d, light);

  const wishStatus = new Map<string, WishStatus>();
  for (const w of d.wishlist) wishStatus.set(w.key, owners.has(w.key) ? "secured" : planners.has(w.key) ? "planned" : "missing");

  const order: Record<IssueLevel, number> = { error: 0, warn: 1, info: 2 };
  issues.sort((a, b) => order[a.level] - order[b.level] || a.cell - b.cell);
  const issueCells = new Map<number, IssueLevel>();
  for (const is of issues) if (!issueCells.has(is.cell)) issueCells.set(is.cell, is.level);

  const materials = [...mats.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  return { villagers, links, claimedBy, issues, issueCells, professionCounts, materials, light, spawnable, owners, planners, wishStatus };
}

export function formatStacks(n: number) {
  const stacks = Math.floor(n / 64);
  const rest = n % 64;
  if (stacks === 0) return `${n}`;
  return rest ? `${stacks} stacks + ${rest}` : `${stacks} stack${stacks === 1 ? "" : "s"}`;
}

/* ------------------------------------------------------------------ */
/* Serialisation                                                      */
/* ------------------------------------------------------------------ */

const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.slice(0, max) : undefined);

function parseMeta(raw: unknown): VillagerMeta | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const trades = Array.isArray(r.trades)
    ? r.trades
        .filter((t): t is { key: string; price?: unknown } => !!t && typeof t === "object" && typeof (t as OwnedTrade).key === "string")
        .map((t) => ({ key: t.key.slice(0, 120), price: typeof t.price === "number" && t.price > 0 ? Math.min(64, Math.round(t.price)) : undefined }))
    : [];
  const targets = Array.isArray(r.targets) ? r.targets.filter((k): k is string => typeof k === "string").map((k) => k.slice(0, 120)) : [];
  return { name: str(r.name, 40), trades, targets, note: str(r.note, 500) };
}

/** Accepts v1 (notes only) and v2 designs. */
export function parseDesign(raw: unknown): Design | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const w = Number(r.width);
  const h = Number(r.height);
  if (!Number.isInteger(w) || !Number.isInteger(h) || w < MIN_SIZE || h < MIN_SIZE || w > MAX_SIZE || h > MAX_SIZE) return null;
  const levels = r.levels === undefined ? 1 : Number(r.levels);
  if (!Number.isInteger(levels) || levels < 1 || levels > MAX_LEVELS) return null;
  const cells = w * h * levels;
  if (!Array.isArray(r.floor) || !Array.isArray(r.obj) || r.floor.length !== cells || r.obj.length !== cells) return null;
  const valid = new Set(BLOCKS.map((b) => b.id));
  const clean = (v: unknown, layer: "floor" | "object") =>
    typeof v === "string" && valid.has(v) && getBlock(v)!.layer === layer ? v : null;
  const obj = r.obj.map((v) => clean(v, "object"));
  const isVillager = (i: number) => getBlock(obj[i])?.kind === "villager";

  const villagers: Record<number, VillagerMeta> = {};
  const cellKey = (k: string) => {
    const n = Number(k);
    return Number.isInteger(n) && n >= 0 && n < cells && isVillager(n) ? n : null;
  };
  if (r.villagers && typeof r.villagers === "object")
    for (const [k, v] of Object.entries(r.villagers)) {
      const n = cellKey(k);
      const meta = parseMeta(v);
      if (n !== null && meta) villagers[n] = meta;
    }
  if (r.notes && typeof r.notes === "object")
    for (const [k, v] of Object.entries(r.notes)) {
      const n = cellKey(k);
      if (n !== null && typeof v === "string" && !villagers[n]) villagers[n] = { ...emptyMeta(), note: v.slice(0, 500) };
    }

  const seen = new Set<string>();
  const wishlist: WishItem[] = [];
  if (Array.isArray(r.wishlist))
    for (const item of r.wishlist) {
      const key = item && typeof item === "object" ? str((item as WishItem).key, 120) : undefined;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      wishlist.push({ key, note: str((item as WishItem).note, 200) });
    }

  return {
    version: 2,
    name: str(r.name, 80) ?? "Imported hall",
    edition: r.edition === "bedrock" ? "bedrock" : "java",
    width: w,
    height: h,
    levels,
    floor: r.floor.map((v) => clean(v, "floor")),
    obj,
    villagers,
    wishlist,
    oneTradePerVillager: r.oneTradePerVillager !== false,
  };
}
