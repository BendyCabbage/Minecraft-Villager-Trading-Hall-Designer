import { PROFESSIONS, professionById } from "./blocks";
import {
  analyze,
  clampSize,
  computeLight,
  createDesign,
  emptyMeta,
  idx,
  inBounds,
  spawnableCells,
  xy,
  type Design,
  type VillagerMeta,
  type WishItem,
} from "./design";
import { resolveTrade, type Edition } from "./trades";

export type HallLayout = "row" | "double" | "square" | "circle";
export type VillagerSource = "wishlist" | "all" | "librarian" | "unemployed";

export interface TemplateOptions {
  layout: HallLayout;
  source: VillagerSource;
  /** Number of villagers, unless planning from the wishlist. */
  pods: number;
  floor: string;
  wall: string;
  lights: boolean;
  /** When planning from the wishlist, give every wanted trade its own villager. */
  oneTradePerVillager: boolean;
  /** When planning from the wishlist, record wanted trades as ones the villagers already have. */
  lockTrades: boolean;
}

export const DEFAULT_TEMPLATE: TemplateOptions = {
  layout: "row",
  source: "all",
  pods: 13,
  floor: "floor_stone_bricks",
  wall: "stone_bricks",
  lights: true,
  oneTradePerVillager: true,
  lockTrades: true,
};

export const LAYOUTS: { id: HallLayout; name: string; description: string }[] = [
  { id: "row", name: "Row", description: "One straight line of pods along a walkway." },
  { id: "double", name: "Double row", description: "Pods on both sides of a central walkway." },
  { id: "square", name: "Square", description: "Pods line all four walls, facing an open floor." },
  { id: "circle", name: "Circle", description: "A ring of pods facing the middle, so every villager is a few steps away." },
];

/** One villager cell plus the job site in front of it. */
export interface PodSpec {
  /** Villager profession (may be "unemployed"). */
  villager: string;
  /** Profession whose job site goes in front. */
  station: string;
  meta?: VillagerMeta;
}

/**
 * Work out the villagers needed to cover a wishlist.
 * With `oneTradePerVillager`, every wanted trade gets its own villager.
 * Otherwise librarians still get one book each (only the first trade can be rerolled by
 * replacing the lectern), and other professions, which offer two trades per level, get one
 * villager per two wanted trades at the same level.
 */
export function planFromWishlist(edition: Edition, wishlist: WishItem[], oneTradePerVillager: boolean): PodSpec[] {
  const pods: PodSpec[] = [];
  const byProfession = new Map<string, Map<number, string[]>>();
  for (const w of wishlist) {
    const t = resolveTrade(edition, w.key);
    if (!t) continue;
    if (t.enchant || oneTradePerVillager) {
      pods.push({ villager: t.profession, station: t.profession, meta: { ...emptyMeta(), targets: [t.key] } });
      continue;
    }
    const levels = byProfession.get(t.profession) ?? new Map<number, string[]>();
    const lvl = t.levels[0];
    levels.set(lvl, [...(levels.get(lvl) ?? []), t.key]);
    byProfession.set(t.profession, levels);
  }
  for (const p of PROFESSIONS) {
    const levels = byProfession.get(p.id);
    if (!levels) continue;
    const count = Math.max(...[...levels.values()].map((keys) => Math.ceil(keys.length / 2)));
    const group: PodSpec[] = Array.from({ length: count }, () => ({ villager: p.id, station: p.id, meta: emptyMeta() }));
    for (const keys of levels.values()) keys.forEach((k, i) => group[i % count].meta!.targets.push(k));
    pods.push(...group);
  }
  // Keep each profession's villagers together, librarians first (stable, so wishlist order holds within one).
  const rank = (prof: string) => (prof === "librarian" ? -1 : PROFESSIONS.findIndex((p) => p.id === prof));
  return pods.sort((a, b) => rank(a.villager) - rank(b.villager));
}

export function podsFor(o: TemplateOptions, edition: Edition, wishlist: WishItem[]): PodSpec[] {
  if (o.source === "wishlist") {
    const pods = planFromWishlist(edition, wishlist, o.oneTradePerVillager);
    if (!o.lockTrades) return pods;
    return pods.map((p) => ({ ...p, meta: { ...p.meta!, trades: p.meta!.targets.map((key) => ({ key })), targets: [] } }));
  }
  const n = Math.max(1, Math.min(80, Math.round(o.pods) || 1));
  return Array.from({ length: n }, (_, i) => {
    const prof = o.source === "librarian" ? "librarian" : PROFESSIONS[i % PROFESSIONS.length].id;
    return { villager: o.source === "unemployed" ? "unemployed" : prof, station: prof };
  });
}

/* ------------------------------------------------------------------ */

type Painter = ReturnType<typeof painter>;

function painter(d: Design) {
  return {
    obj(x: number, y: number, id: string | null) {
      if (inBounds(d, x, y)) d.obj[idx(d, x, y)] = id;
    },
    floor(x: number, y: number, id: string | null) {
      if (inBounds(d, x, y)) d.floor[idx(d, x, y)] = id;
    },
    pod(vx: number, vy: number, sx: number, sy: number, spec: PodSpec) {
      this.obj(vx, vy, `villager_${spec.villager}`);
      this.obj(sx, sy, professionById(spec.station)!.workstation);
      if (spec.meta && inBounds(d, vx, vy)) d.villagers[idx(d, vx, vy)] = spec.meta;
    },
  };
}

function rowHall(pods: PodSpec[], o: TemplateOptions, double: boolean, p: (d: Design) => Painter) {
  const perRow = double ? Math.ceil(pods.length / 2) : pods.length;
  const innerW = perRow * 2 + 1;
  // Interior rows: villagers, job sites, walkway ×2, then (double) job sites, villagers.
  const innerH = double ? 6 : 4;
  const d = createDesign(clampSize(innerW + 4), clampSize(innerH + 4));
  const paint = p(d);
  const ox = 2;
  const oy = 1;

  for (let y = oy; y <= oy + innerH + 1; y++)
    for (let x = ox - 1; x <= ox + innerW; x++) {
      paint.floor(x, y, o.floor);
      const edge = y === oy || y === oy + innerH + 1 || x === ox - 1 || x === ox + innerW;
      if (edge) paint.obj(x, y, o.wall);
    }

  const placeRow = (villagerY: number, stationY: number, specs: PodSpec[]) => {
    for (let x = ox; x < ox + innerW; x++) {
      paint.obj(x, villagerY, o.wall);
      // Lights between job sites keep the walkway spawn-proof.
      paint.obj(x, stationY, o.lights && (x - ox) % 4 === 0 ? "sea_lantern" : o.wall);
    }
    specs.forEach((spec, k) => paint.pod(ox + 1 + k * 2, villagerY, ox + 1 + k * 2, stationY, spec));
  };
  placeRow(oy + 1, oy + 2, pods.slice(0, perRow));
  if (double) placeRow(oy + 6, oy + 5, pods.slice(perRow));

  paint.obj(ox - 1, oy + 3, "oak_door");
  paint.obj(ox + innerW, oy + 3, "oak_door");
  return d;
}

/** Pods along all four walls, facing inward, with the entrance in the middle of the bottom wall. */
function squareHall(pods: PodSpec[], o: TemplateOptions, p: (d: Design) => Painter) {
  const perSide = Math.max(2, Math.ceil((pods.length + 1) / 4));
  const S = perSide * 2 + 5;
  const d = createDesign(clampSize(S + 2), clampSize(S + 2));
  const paint = p(d);
  const m = 1;
  const ring = (x: number, y: number) => Math.min(x, y, S - 1 - x, S - 1 - y);

  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      paint.floor(m + x, m + y, o.floor);
      if (ring(x, y) <= 2) paint.obj(m + x, m + y, o.wall);
    }

  const slot = (j: number) => 3 + 2 * j;
  const entrance = Math.floor(perSide / 2);
  // Interleave sides so villagers spread evenly round the room.
  const slots: [number, number, number, number][] = [];
  for (let j = 0; j < perSide; j++) {
    const s = slot(j);
    slots.push([s, 1, s, 2]); // top
    slots.push([S - 2, s, S - 3, s]); // right
    if (j !== entrance) slots.push([s, S - 2, s, S - 3]); // bottom
    slots.push([1, s, 2, s]); // left
  }
  pods.forEach((spec, i) => {
    const [vx, vy, sx, sy] = slots[i];
    paint.pod(m + vx, m + vy, m + sx, m + sy, spec);
  });

  const ex = m + slot(entrance);
  paint.obj(ex, m + S - 1, "oak_door");
  paint.obj(ex, m + S - 2, null);
  paint.obj(ex, m + S - 3, null);
  return d;
}

/** A ring of pods facing the centre. Grows the radius until every pod fits without touching its neighbours. */
function circleHall(pods: PodSpec[], o: TemplateOptions, p: (d: Design) => Painter) {
  const slots = pods.length + 1;
  let R = Math.max(4, Math.ceil((slots * 2.6) / (2 * Math.PI)));
  for (; R < 60; R++) {
    const S = 2 * R + 5;
    const c = R + 2;
    const at = (i: number, r: number) => {
      const a = -Math.PI / 2 + (2 * Math.PI * i) / slots;
      return [Math.round(c + r * Math.cos(a)), Math.round(c + r * Math.sin(a))] as const;
    };
    // Every cell of one pod must be at least 2 cells (Chebyshev) from every cell of another.
    const cells = Array.from({ length: slots }, (_, i) => [at(i, R), at(i, R - 1)]);
    let clash = false;
    for (let i = 0; i < slots && !clash; i++)
      for (let j = i + 1; j < slots && !clash; j++)
        for (const [ax, ay] of cells[i])
          for (const [bx, by] of cells[j]) if (Math.max(Math.abs(ax - bx), Math.abs(ay - by)) < 2) clash = true;
    if (clash) continue;

    const d = createDesign(clampSize(S), clampSize(S));
    const paint = p(d);
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        const r = Math.hypot(x - c, y - c);
        if (r > R + 1.8) continue;
        paint.floor(x, y, o.floor);
        if (r > R - 1.7) paint.obj(x, y, o.wall);
      }
    pods.forEach((spec, i) => {
      const [[vx, vy], [sx, sy]] = cells[i];
      paint.pod(vx, vy, sx, sy, spec);
    });
    // Entrance: clear a path out along the spare slot's ray, with a door in the outer wall.
    const e = slots - 1;
    let door: readonly [number, number] | null = null;
    for (let r = R - 2; r <= R + 2; r += 0.5) {
      const [x, y] = at(e, r);
      if (Math.hypot(x - c, y - c) > R + 1.8) break;
      paint.obj(x, y, null);
      door = [x, y];
    }
    if (door) paint.obj(door[0], door[1], "oak_door");

    // Accept only if every pod links up and is boxed in.
    const a = analyze(d, 1);
    if (a.links.size === pods.length && !a.issues.some((is) => is.level !== "info" && /boxed|no free/.test(is.message))) return d;
  }
  return squareHall(pods, o, p);
}

/** Drop floor lights into any dark patch until nothing can spawn. */
function lightUp(d: Design) {
  for (let guard = 0; guard < 400; guard++) {
    const dark = spawnableCells(d, computeLight(d));
    if (!dark.length) return;
    const set = new Set(dark);
    const [x, y] = xy(d, dark[0]);
    // Step into the dark patch rather than hugging its top-left corner.
    const pick = [
      [x + 5, y + 5],
      [x + 5, y],
      [x, y + 5],
      [x + 3, y + 3],
    ]
      .filter(([px, py]) => inBounds(d, px, py) && set.has(idx(d, px, py)))
      .map(([px, py]) => idx(d, px, py))[0] ?? dark[0];
    d.floor[pick] = "floor_sea_lantern";
  }
}

export function generateHall(o: TemplateOptions, edition: Edition, wishlist: WishItem[]): Design {
  const pods = podsFor(o, edition, wishlist);
  const build = o.layout === "square" ? squareHall : o.layout === "circle" ? circleHall : null;
  const d = build ? build(pods, o, painter) : rowHall(pods, o, o.layout === "double", painter);
  if (o.lights) lightUp(d);
  const layout = LAYOUTS.find((l) => l.id === o.layout)!.name.toLowerCase();
  d.name = o.source === "wishlist" ? `Wishlist hall (${layout})` : `${pods.length}-villager ${layout} hall`;
  d.edition = edition;
  d.wishlist = wishlist;
  d.oneTradePerVillager = o.oneTradePerVillager;
  return d;
}
