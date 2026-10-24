import { BLOCK_MAP, getBlock, professionById } from "./blocks";

/** Every tile is a 16×16 pixel-art texture, scaled up with smoothing off. */
export const TILE = 16;

type RGBA = [number, number, number, number];

function hex(c: string, a = 255): RGBA {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, a];
}

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Px {
  data = new Uint8ClampedArray(TILE * TILE * 4);
  rand: () => number;

  constructor(seed: string) {
    this.rand = rng(hash(seed));
  }

  set(x: number, y: number, c: string | RGBA, a?: number) {
    if (x < 0 || y < 0 || x >= TILE || y >= TILE) return;
    const [r, g, b, al] = typeof c === "string" ? hex(c, a) : c;
    const i = (y * TILE + x) * 4;
    if (al >= 255) {
      this.data.set([r, g, b, 255], i);
      return;
    }
    // Alpha-composite over what's already there.
    const da = this.data[i + 3] / 255;
    const sa = al / 255;
    const oa = sa + da * (1 - sa);
    if (oa === 0) return;
    for (let k = 0; k < 3; k++) {
      this.data[i + k] = ([r, g, b][k] * sa + this.data[i + k] * da * (1 - sa)) / oa;
    }
    this.data[i + 3] = oa * 255;
  }

  rect(x: number, y: number, w: number, h: number, c: string, a?: number) {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, c, a);
  }

  frame(x: number, y: number, w: number, h: number, c: string, a?: number) {
    this.rect(x, y, w, 1, c, a);
    this.rect(x, y + h - 1, w, 1, c, a);
    this.rect(x, y + 1, 1, h - 2, c, a);
    this.rect(x + w - 1, y + 1, 1, h - 2, c, a);
  }

  disc(cx: number, cy: number, r: number, c: string, a?: number) {
    for (let y = 0; y < TILE; y++)
      for (let x = 0; x < TILE; x++) {
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - cy;
        if (dx * dx + dy * dy <= r * r) this.set(x, y, c, a);
      }
  }

  /** Fill with a base colour plus per-pixel brightness jitter. */
  noise(c: string, amount: number, x = 0, y = 0, w = TILE, h = TILE) {
    const [r, g, b] = hex(c);
    for (let j = y; j < y + h; j++)
      for (let i = x; i < x + w; i++) {
        const d = (this.rand() - 0.5) * 2 * amount;
        this.set(i, j, [r + d, g + d, b + d, 255]);
      }
  }

  shade(x: number, y: number, f: number) {
    const i = (y * TILE + x) * 4;
    for (let k = 0; k < 3; k++) this.data[i + k] = Math.min(255, this.data[i + k] * f);
  }

  /** Light top/left edge, dark bottom/right edge so a block reads as raised. */
  bevel() {
    for (let i = 0; i < TILE; i++) {
      this.shade(i, 0, 1.3);
      this.shade(0, i, 1.2);
      this.shade(i, TILE - 1, 0.55);
      this.shade(TILE - 1, i, 0.65);
    }
  }
}

function bricks(p: Px, base: string, mortar: string, bw = 8, bh = 4) {
  p.noise(base, 10);
  for (let y = 0; y < TILE; y++) {
    const row = Math.floor(y / bh);
    for (let x = 0; x < TILE; x++) {
      const off = row % 2 ? bw / 2 : 0;
      if (y % bh === bh - 1 || (x + off) % bw === bw - 1) p.set(x, y, mortar);
      else if (y % bh === 0) p.shade(x, y, 1.12);
    }
  }
}

function planks(p: Px, base: string, seam: string) {
  p.noise(base, 8);
  for (let y = 0; y < TILE; y++) {
    if (y % 4 === 3) p.rect(0, y, TILE, 1, seam);
    const row = Math.floor(y / 4);
    const cut = [3, 11, 7, 14][row];
    if (y % 4 !== 3) p.set(cut, y, seam);
    // Grain
    if (y % 4 === 1) for (let x = 0; x < TILE; x += 5) p.shade((x + row * 3) % TILE, y, 0.9);
  }
}

function voronoi(p: Px, base: string, line: string, cells: number) {
  const pts = Array.from({ length: cells }, () => [p.rand() * TILE, p.rand() * TILE, 0.85 + p.rand() * 0.35]);
  const [r, g, b] = hex(base);
  for (let y = 0; y < TILE; y++)
    for (let x = 0; x < TILE; x++) {
      let d1 = Infinity;
      let d2 = Infinity;
      let best = 0;
      pts.forEach(([px, py], i) => {
        // Wrap so the texture tiles seamlessly.
        const dx = Math.min(Math.abs(x - px), TILE - Math.abs(x - px));
        const dy = Math.min(Math.abs(y - py), TILE - Math.abs(y - py));
        const d = Math.hypot(dx, dy);
        if (d < d1) {
          d2 = d1;
          d1 = d;
          best = i;
        } else if (d < d2) d2 = d;
      });
      if (d2 - d1 < 1.1) p.set(x, y, line);
      else {
        const f = pts[best][2] + (p.rand() - 0.5) * 0.08;
        p.set(x, y, [r * f, g * f, b * f, 255]);
      }
    }
}

function villager(p: Px, profId: string) {
  const prof = professionById(profId)!;
  // Shoulders / robe seen from above.
  p.rect(1, 4, 14, 9, prof.robe);
  p.frame(1, 4, 14, 9, "#000000", 70);
  p.rect(2, 12, 12, 2, prof.robe);
  p.rect(2, 13, 12, 1, "#000000", 60);
  // Arms folded across the front.
  p.rect(3, 11, 10, 3, prof.robe);
  p.rect(3, 11, 10, 1, "#ffffff", 30);
  // Head.
  p.rect(4, 2, 8, 9, "#b4815f");
  p.frame(4, 2, 8, 9, "#000000", 60);
  // Big villager nose poking forward.
  p.rect(7, 10, 2, 4, "#a7704f");
  p.rect(7, 13, 2, 1, "#8b5a3c");
  if (prof.id === "nitwit" || prof.id === "unemployed") {
    p.rect(4, 2, 8, 4, "#4a2f1d");
  }
  if (prof.hat) {
    if (prof.wideBrim) {
      p.rect(2, 1, 12, 9, prof.hat);
      p.frame(2, 1, 12, 9, "#000000", 70);
      p.rect(4, 3, 8, 5, prof.hat);
      p.frame(4, 3, 8, 5, "#000000", 40);
    } else {
      p.rect(4, 2, 8, 6, prof.hat);
      p.frame(4, 2, 8, 6, "#000000", 50);
    }
    p.rect(4, 7, 8, 1, prof.accent);
  }
  switch (prof.id) {
    case "librarian":
      p.rect(6, 3, 4, 3, "#a8312e");
      p.rect(7, 4, 2, 1, "#f2ead8");
      break;
    case "cartographer":
      p.disc(10.5, 9.5, 1.6, prof.accent);
      break;
    case "weaponsmith":
    case "armorer":
      p.rect(9, 8, 3, 2, "#111111");
      break;
    case "fletcher":
      p.rect(11, 1, 2, 5, prof.accent);
      break;
    case "cleric":
      p.rect(6, 12, 4, 1, prof.accent);
      break;
    case "butcher":
      p.rect(3, 11, 10, 3, prof.robe);
      p.rect(6, 12, 4, 1, prof.hat!);
      break;
  }
}

const TEXTURES: Record<string, (p: Px) => void> = {
  grass_block: (p) => {
    p.noise("#5f9c3a", 16);
    for (let i = 0; i < 18; i++) p.set(Math.floor(p.rand() * 16), Math.floor(p.rand() * 16), "#78b84c");
  },
  dirt: (p) => {
    p.noise("#86603f", 14);
    for (let i = 0; i < 14; i++) p.set(Math.floor(p.rand() * 16), Math.floor(p.rand() * 16), "#5d4129");
  },
  dirt_path: (p) => {
    p.noise("#94793f", 10);
    for (let i = 0; i < 12; i++) p.set(Math.floor(p.rand() * 16), Math.floor(p.rand() * 16), "#7a6234");
  },
  stone: (p) => p.noise("#7d7d7d", 12),
  cobblestone: (p) => voronoi(p, "#7a7a7a", "#4f4f4f", 9),
  stone_bricks: (p) => bricks(p, "#7b7b7b", "#575757"),
  deepslate_bricks: (p) => bricks(p, "#4a4a50", "#2b2b30", 8, 4),
  deepslate_tiles: (p) => bricks(p, "#3d3d43", "#25252a", 4, 4),
  smooth_stone: (p) => {
    p.noise("#a0a0a0", 4);
    p.frame(0, 0, 16, 16, "#8a8a8a");
  },
  polished_andesite: (p) => {
    p.noise("#888c8d", 6);
    p.rect(0, 0, 16, 1, "#a2a6a7");
    p.rect(0, 0, 1, 16, "#a2a6a7");
    p.rect(0, 15, 16, 1, "#6c7071");
    p.rect(15, 0, 1, 16, "#6c7071");
  },
  oak_planks: (p) => planks(p, "#a2834f", "#735a33"),
  spruce_planks: (p) => planks(p, "#71523a", "#4f3824"),
  dark_oak_planks: (p) => planks(p, "#4b321c", "#321f10"),
  sandstone: (p) => {
    p.noise("#d9cc95", 6);
    p.rect(0, 5, 16, 1, "#c7b77d");
    p.rect(0, 11, 16, 1, "#c7b77d");
  },
  water: (p) => {
    p.noise("#3a64c8", 8);
    for (let y = 2; y < 16; y += 5) for (let x = 0; x < 16; x++) if ((x + y) % 7 < 3) p.set(x, (y + (x % 3 === 0 ? 1 : 0)) % 16, "#5a86e0");
  },
  glass: (p) => {
    p.rect(1, 1, 14, 14, "#bfe6f5", 45);
    p.frame(0, 0, 16, 16, "#dff4fb", 230);
    p.frame(1, 1, 14, 14, "#9ccfe2", 120);
    p.rect(3, 3, 1, 1, "#ffffff", 220);
    p.rect(4, 4, 2, 1, "#ffffff", 160);
    p.rect(11, 10, 1, 2, "#ffffff", 120);
  },
  spruce_log: (p) => {
    p.noise("#3d2a17", 8);
    p.rect(2, 2, 12, 12, "#8a6a42");
    p.frame(4, 4, 8, 8, "#6d5131");
    p.frame(6, 6, 4, 4, "#76593a");
    p.rect(7, 7, 2, 2, "#5d4429");
  },
  sea_lantern: (p) => {
    p.noise("#b4d2c6", 6);
    p.frame(0, 0, 16, 16, "#8fb0a5");
    p.rect(3, 3, 4, 4, "#e6f7f0");
    p.rect(9, 9, 4, 4, "#e6f7f0");
    p.rect(9, 3, 4, 4, "#cfe8de");
    p.rect(3, 9, 4, 4, "#cfe8de");
  },
  glowstone: (p) => {
    voronoi(p, "#d6a752", "#8a6230", 8);
    for (let i = 0; i < 16; i++) p.set(Math.floor(p.rand() * 16), Math.floor(p.rand() * 16), "#ffe9a8");
  },
  oak_door: (p) => {
    p.rect(0, 6, 16, 4, "#9b7a45");
    p.frame(0, 6, 16, 4, "#5f4a2a");
    p.rect(3, 7, 3, 2, "#5f4a2a");
    p.rect(10, 7, 3, 2, "#5f4a2a");
    p.rect(13, 9, 2, 2, "#3b3b3b");
  },
  iron_door: (p) => {
    p.rect(0, 6, 16, 4, "#c9c9c9");
    p.frame(0, 6, 16, 4, "#7d7d7d");
    p.rect(4, 7, 1, 2, "#8f8f8f");
    p.rect(11, 7, 1, 2, "#8f8f8f");
  },
  oak_trapdoor: (p) => {
    p.noise("#9b7a45", 6);
    p.frame(0, 0, 16, 16, "#5f4a2a");
    p.rect(3, 3, 4, 4, "#3a2c18", 200);
    p.rect(9, 3, 4, 4, "#3a2c18", 200);
    p.rect(3, 9, 4, 4, "#3a2c18", 200);
    p.rect(9, 9, 4, 4, "#3a2c18", 200);
  },
  oak_fence: (p) => {
    p.rect(0, 7, 16, 2, "#8c6d3e");
    p.rect(7, 0, 2, 16, "#8c6d3e");
    p.rect(5, 5, 6, 6, "#a2834f");
    p.frame(5, 5, 6, 6, "#5f4a2a");
  },
  rail: (p) => {
    for (let y = 1; y < 16; y += 4) p.rect(2, y, 12, 2, "#6b5132");
    p.rect(3, 0, 2, 16, "#a8a8a8");
    p.rect(11, 0, 2, 16, "#a8a8a8");
    p.rect(4, 0, 1, 16, "#6e6e6e");
    p.rect(12, 0, 1, 16, "#6e6e6e");
  },
  powered_rail: (p) => {
    for (let y = 1; y < 16; y += 4) p.rect(2, y, 12, 2, "#6b5132");
    p.rect(7, 0, 2, 16, "#a31a12");
    p.rect(3, 0, 2, 16, "#e8c43c");
    p.rect(11, 0, 2, 16, "#e8c43c");
    p.rect(4, 0, 1, 16, "#a8862b");
    p.rect(12, 0, 1, 16, "#a8862b");
  },
  torch: (p) => {
    p.disc(8, 8, 6, "#ffcc55", 40);
    p.disc(8, 8, 3.5, "#ffb22e", 120);
    p.rect(7, 7, 2, 2, "#fff3b0");
    p.frame(6, 6, 4, 4, "#e3801b");
  },
  lantern: (p) => {
    p.disc(8, 8, 7, "#ffcc55", 35);
    p.rect(5, 5, 6, 6, "#3b3e44");
    p.rect(6, 6, 4, 4, "#ffd36b");
    p.rect(7, 7, 2, 2, "#fff6c9");
    p.frame(5, 5, 6, 6, "#202226");
  },
  chest: (p) => {
    p.rect(1, 1, 14, 14, "#a76c25");
    p.noise("#a76c25", 6, 2, 2, 12, 12);
    p.frame(1, 1, 14, 14, "#4a2c0c");
    p.rect(1, 5, 14, 1, "#4a2c0c");
    p.rect(7, 4, 2, 3, "#c8c8c8");
  },
  bed: (p) => {
    p.rect(1, 0, 14, 16, "#a12722");
    p.rect(1, 0, 14, 5, "#ececec");
    p.rect(1, 5, 14, 1, "#7a1b17");
    p.frame(1, 0, 14, 16, "#000000", 70);
    p.rect(2, 8, 12, 1, "#c03a33");
  },
  bell: (p) => {
    p.rect(2, 7, 12, 2, "#4c4c4c");
    p.disc(8, 8, 4.5, "#e3b737");
    p.disc(8, 8, 2.5, "#f6d66a");
    p.rect(7, 7, 2, 2, "#a77b1a");
  },
  white_carpet: (p) => {
    p.noise("#e6e9e9", 6);
    p.frame(0, 0, 16, 16, "#c9cdcd");
  },
  hopper: (p) => {
    p.rect(0, 0, 16, 16, "#4a4a4e");
    p.frame(0, 0, 16, 16, "#2b2b2e");
    p.rect(2, 2, 12, 12, "#2f2f33");
    p.rect(5, 5, 6, 6, "#1d1d20");
    p.rect(7, 7, 2, 2, "#5a5a5f");
  },
  composter: (p) => {
    p.noise("#8b5d2c", 8);
    p.rect(2, 2, 12, 12, "#4b3219");
    p.noise("#5c4523", 14, 3, 5, 10, 8);
    for (let i = 0; i < 8; i++) p.set(3 + Math.floor(p.rand() * 10), 5 + Math.floor(p.rand() * 8), "#6f8f2e");
    p.rect(0, 5, 16, 1, "#6a4520");
    p.rect(0, 10, 16, 1, "#6a4520");
  },
  smoker: (p) => {
    p.noise("#5d5d5d", 8);
    p.frame(0, 0, 16, 16, "#3a3a3a");
    p.rect(4, 4, 8, 8, "#2a2a2a");
    for (let i = 5; i < 12; i += 2) p.rect(4, i, 8, 1, "#444444");
    p.rect(0, 7, 16, 2, "#6f4a2b");
  },
  blast_furnace: (p) => {
    p.noise("#6e6f73", 6);
    p.frame(0, 0, 16, 16, "#3f4044");
    p.rect(7, 0, 2, 16, "#4d4e52");
    p.rect(0, 7, 16, 2, "#4d4e52");
    p.rect(5, 5, 6, 6, "#2e2f33");
    p.frame(5, 5, 6, 6, "#9b9da3");
  },
  cartography_table: (p) => {
    p.noise("#4a3420", 6);
    p.rect(2, 2, 12, 12, "#e2d4ac");
    p.rect(4, 4, 4, 3, "#79a052");
    p.rect(8, 8, 4, 3, "#4f78b8");
    p.rect(9, 4, 3, 2, "#79a052");
    p.rect(3, 11, 9, 1, "#9b8a63");
    p.set(6, 9, "#b43a30");
  },
  brewing_stand: (p) => {
    p.disc(8, 8, 7, "#555555", 160);
    p.rect(7, 2, 2, 12, "#3a3a3a");
    p.disc(4.5, 11, 2.2, "#9a44c4");
    p.disc(11.5, 11, 2.2, "#9a44c4");
    p.disc(8, 4.5, 2.2, "#9a44c4");
    p.rect(7, 7, 2, 2, "#d6a93a");
    p.set(4, 10, "#e0b2f5");
    p.set(11, 10, "#e0b2f5");
    p.set(7, 4, "#e0b2f5");
  },
  barrel: (p) => {
    p.noise("#8b6033", 6);
    for (let x = 0; x < 16; x += 4) p.rect(x, 0, 1, 16, "#6a4723");
    p.frame(0, 0, 16, 16, "#454545");
    p.frame(1, 1, 14, 14, "#5e4022");
    p.rect(6, 6, 4, 4, "#2e1e0f");
  },
  fletching_table: (p) => {
    p.noise("#d3c38f", 6);
    p.frame(0, 0, 16, 16, "#a7955f");
    p.rect(3, 12, 10, 1, "#7a6b3f");
    p.rect(3, 3, 1, 9, "#7a6b3f");
    p.rect(10, 3, 3, 3, "#b33c2a");
    p.rect(6, 6, 6, 1, "#5f5f5f");
    p.rect(11, 7, 2, 1, "#5f5f5f");
  },
  cauldron: (p) => {
    p.rect(0, 0, 16, 16, "#3c3c40");
    p.frame(0, 0, 16, 16, "#2a2a2d");
    p.rect(2, 2, 12, 12, "#1e1e22");
    p.rect(2, 2, 12, 1, "#56565b");
    p.rect(2, 2, 1, 12, "#56565b");
  },
  lectern: (p) => {
    planks(p, "#a2834f", "#735a33");
    p.frame(0, 0, 16, 16, "#5f4a2a");
    p.rect(2, 3, 12, 10, "#6b3a1c");
    p.rect(3, 4, 5, 8, "#efe7d2");
    p.rect(8, 4, 5, 8, "#efe7d2");
    p.rect(8, 4, 1, 8, "#9b8f74");
    for (let y = 5; y < 11; y += 2) {
      p.rect(4, y, 3, 1, "#b7ad95");
      p.rect(10, y, 2, 1, "#b7ad95");
    }
  },
  stonecutter: (p) => {
    p.noise("#8a8a8a", 6);
    p.frame(0, 0, 16, 16, "#5e5e5e");
    p.rect(1, 7, 14, 2, "#c9c9c9");
    for (let x = 1; x < 15; x += 2) p.set(x, 6, "#a3a3a3");
    p.rect(1, 9, 14, 1, "#4a4a4a");
  },
  loom: (p) => {
    p.noise("#8b6a46", 6);
    p.frame(0, 0, 16, 16, "#5c4430");
    for (let x = 3; x < 14; x += 2) p.rect(x, 2, 1, 12, "#ededed");
    p.rect(2, 7, 12, 2, "#b03c30");
    p.rect(2, 2, 12, 1, "#5c4430");
    p.rect(2, 13, 12, 1, "#5c4430");
  },
  smithing_table: (p) => {
    p.noise("#2f2f38", 6);
    p.frame(0, 0, 16, 16, "#1a1a20");
    p.rect(3, 3, 10, 10, "#454550");
    p.rect(1, 1, 3, 3, "#7d828a");
    p.rect(12, 1, 3, 3, "#7d828a");
    p.rect(1, 12, 3, 3, "#7d828a");
    p.rect(12, 12, 3, 3, "#7d828a");
    p.rect(6, 6, 4, 4, "#9da2aa");
  },
  grindstone: (p) => {
    p.rect(1, 3, 3, 10, "#7a5a33");
    p.rect(12, 3, 3, 10, "#7a5a33");
    p.rect(4, 2, 8, 12, "#8f8f8f");
    p.frame(4, 2, 8, 12, "#5f5f5f");
    p.rect(5, 5, 6, 1, "#a8a8a8");
    p.rect(5, 10, 6, 1, "#a8a8a8");
    p.rect(4, 7, 8, 2, "#6e6e6e");
  },
};

const cache = new Map<string, HTMLCanvasElement>();

/** Returns a 16×16 canvas for a block id (memoised). */
export function getTile(blockId: string): HTMLCanvasElement | null {
  const hit = cache.get(blockId);
  if (hit) return hit;
  const def = getBlock(blockId);
  if (!def) return null;
  const p = new Px(def.texture);
  if (def.kind === "villager") villager(p, def.profession!);
  else TEXTURES[def.texture]?.(p);
  if (def.raised) p.bevel();
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = TILE;
  const ctx = canvas.getContext("2d")!;
  ctx.putImageData(new ImageData(p.data, TILE, TILE), 0, 0);
  cache.set(blockId, canvas);
  return canvas;
}

/** Warm the cache so the first canvas paint doesn't hitch. */
export function preloadTiles() {
  for (const id of BLOCK_MAP.keys()) getTile(id);
}
