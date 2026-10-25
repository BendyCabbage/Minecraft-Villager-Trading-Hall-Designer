export type Layer = "floor" | "object";
export type Category = "floor" | "blocks" | "workstations" | "villagers" | "utility";

export const CATEGORIES: { id: Category; name: string }[] = [
  { id: "villagers", name: "Villagers" },
  { id: "workstations", name: "Job Sites" },
  { id: "blocks", name: "Blocks" },
  { id: "utility", name: "Utility" },
  { id: "floor", name: "Floor" },
];

export interface Profession {
  id: string;
  name: string;
  /** Block id of the job site block, if the profession has one. */
  workstation: string | null;
  robe: string;
  hat: string | null;
  accent: string;
  wideBrim?: boolean;
}

export const PROFESSIONS: Profession[] = [
  { id: "armorer", name: "Armorer", workstation: "blast_furnace", robe: "#5a3d27", hat: "#2c2c30", accent: "#9aa3ab" },
  { id: "butcher", name: "Butcher", workstation: "smoker", robe: "#e8e2d4", hat: "#b3302e", accent: "#e8e2d4" },
  { id: "cartographer", name: "Cartographer", workstation: "cartography_table", robe: "#5a3d27", hat: "#3a2a1c", accent: "#e2b93b" },
  { id: "cleric", name: "Cleric", workstation: "brewing_stand", robe: "#6b2f91", hat: "#6b2f91", accent: "#d8b75a" },
  { id: "farmer", name: "Farmer", workstation: "composter", robe: "#5a3d27", hat: "#d8b84c", accent: "#a88d33", wideBrim: true },
  { id: "fisherman", name: "Fisherman", workstation: "barrel", robe: "#5a3d27", hat: "#a98e5e", accent: "#3e6db5", wideBrim: true },
  { id: "fletcher", name: "Fletcher", workstation: "fletching_table", robe: "#5a3d27", hat: "#5f7d33", accent: "#c8402f" },
  { id: "leatherworker", name: "Leatherworker", workstation: "cauldron", robe: "#8c5a2b", hat: "#6e4220", accent: "#c08a4f" },
  { id: "librarian", name: "Librarian", workstation: "lectern", robe: "#5a3d27", hat: "#ece6d6", accent: "#a8312e" },
  { id: "mason", name: "Mason", workstation: "stonecutter", robe: "#3f3f44", hat: "#3f3f44", accent: "#8f8f8f" },
  { id: "shepherd", name: "Shepherd", workstation: "loom", robe: "#5a3d27", hat: "#6e4626", accent: "#e9e9e9", wideBrim: true },
  { id: "toolsmith", name: "Toolsmith", workstation: "smithing_table", robe: "#3a3a40", hat: "#555c66", accent: "#b0b6bd" },
  { id: "weaponsmith", name: "Weaponsmith", workstation: "grindstone", robe: "#3a3a40", hat: "#1f1f22", accent: "#d9d9d9" },
];

export const NON_TRADING: Profession[] = [
  { id: "unemployed", name: "Unemployed", workstation: null, robe: "#5a3d27", hat: null, accent: "#5a3d27" },
  { id: "nitwit", name: "Nitwit", workstation: null, robe: "#3f7d3a", hat: null, accent: "#3f7d3a" },
];

export const ALL_PROFESSIONS = [...PROFESSIONS, ...NON_TRADING];

export function professionById(id: string): Profession | undefined {
  return ALL_PROFESSIONS.find((p) => p.id === id);
}

export interface BlockDef {
  id: string;
  name: string;
  layer: Layer;
  category: Category;
  /** Texture key used by the tile renderer. */
  texture: string;
  /** Villagers can't walk through it. */
  solid: boolean;
  /** Blocks light. */
  opaque: boolean;
  /** Drawn with a raised bevel to read as a full block. */
  raised?: boolean;
  /** Name used in the bill of materials. Omitted = not counted (villagers). */
  material?: string;
  /** Block light level emitted. */
  light?: number;
  /** For job sites: the profession it unlocks. For villagers: their profession. */
  profession?: string;
  kind?: "workstation" | "villager";
  /** Mobs can't spawn on this floor. */
  noSpawn?: boolean;
  hint?: string;
}

const floor = (id: string, name: string, extra: Partial<BlockDef> = {}): BlockDef => ({
  id: `floor_${id}`,
  name,
  layer: "floor",
  category: "floor",
  texture: id,
  solid: false,
  opaque: false,
  material: name,
  ...extra,
});

const block = (id: string, name: string, extra: Partial<BlockDef> = {}): BlockDef => ({
  id,
  name,
  layer: "object",
  category: "blocks",
  texture: id,
  solid: true,
  opaque: true,
  raised: true,
  material: name,
  ...extra,
});

const utility = (id: string, name: string, extra: Partial<BlockDef> = {}): BlockDef => ({
  id,
  name,
  layer: "object",
  category: "utility",
  texture: id,
  solid: false,
  opaque: false,
  material: name,
  ...extra,
});

const WORKSTATION_NAMES: Record<string, { name: string; opaque: boolean }> = {
  blast_furnace: { name: "Blast Furnace", opaque: true },
  smoker: { name: "Smoker", opaque: true },
  cartography_table: { name: "Cartography Table", opaque: true },
  brewing_stand: { name: "Brewing Stand", opaque: false },
  composter: { name: "Composter", opaque: false },
  barrel: { name: "Barrel", opaque: true },
  fletching_table: { name: "Fletching Table", opaque: true },
  cauldron: { name: "Cauldron", opaque: false },
  lectern: { name: "Lectern", opaque: false },
  stonecutter: { name: "Stonecutter", opaque: false },
  loom: { name: "Loom", opaque: true },
  smithing_table: { name: "Smithing Table", opaque: true },
  grindstone: { name: "Grindstone", opaque: false },
};

const workstations: BlockDef[] = PROFESSIONS.map((p) => {
  const ws = WORKSTATION_NAMES[p.workstation!];
  return {
    id: p.workstation!,
    name: ws.name,
    layer: "object",
    category: "workstations",
    texture: p.workstation!,
    solid: true,
    opaque: ws.opaque,
    raised: ws.opaque,
    material: ws.name,
    profession: p.id,
    kind: "workstation",
    hint: `${p.name} job site`,
  };
});

const villagers: BlockDef[] = ALL_PROFESSIONS.map((p) => ({
  id: `villager_${p.id}`,
  name: p.id === "unemployed" || p.id === "nitwit" ? `${p.name} Villager` : p.name,
  layer: "object",
  category: "villagers",
  texture: `villager_${p.id}`,
  solid: false,
  opaque: false,
  profession: p.id,
  kind: "villager",
}));

export const BLOCKS: BlockDef[] = [
  ...villagers,
  ...workstations,
  block("stone_bricks", "Stone Bricks"),
  block("cobblestone", "Cobblestone"),
  block("deepslate_bricks", "Deepslate Bricks"),
  block("oak_planks", "Oak Planks"),
  block("spruce_log", "Spruce Log"),
  block("glass", "Glass", { opaque: false, raised: false }),
  block("sea_lantern", "Sea Lantern", { light: 15 }),
  block("glowstone", "Glowstone", { light: 15 }),
  utility("oak_door", "Oak Door", { hint: "Villagers can open wooden doors" }),
  utility("iron_door", "Iron Door", { solid: true, hint: "Villagers can't open iron doors" }),
  utility("oak_trapdoor", "Oak Trapdoor", { solid: true, hint: "Closed trapdoors stop villagers walking" }),
  utility("oak_fence", "Oak Fence", { solid: true }),
  utility("ladder", "Ladder", { hint: "Climbs between levels" }),
  utility("rail", "Rail", { noSpawn: true }),
  utility("powered_rail", "Powered Rail", { noSpawn: true }),
  utility("torch", "Torch", { light: 14 }),
  utility("lantern", "Lantern", { solid: true, light: 15 }),
  utility("chest", "Chest", { solid: true }),
  utility("bed", "Bed", { hint: "Lets villagers sleep and breed" }),
  utility("bell", "Bell", { solid: true, hint: "Village meeting point" }),
  utility("white_carpet", "White Carpet", { hint: "Prevents mob spawning" }),
  utility("hopper", "Hopper", { solid: true }),
  floor("stone_bricks", "Stone Bricks"),
  floor("polished_andesite", "Polished Andesite"),
  floor("smooth_stone", "Smooth Stone"),
  floor("deepslate_tiles", "Deepslate Tiles"),
  floor("cobblestone", "Cobblestone"),
  floor("stone", "Stone"),
  floor("oak_planks", "Oak Planks"),
  floor("spruce_planks", "Spruce Planks"),
  floor("dark_oak_planks", "Dark Oak Planks"),
  floor("sandstone", "Sandstone"),
  floor("grass_block", "Grass Block"),
  floor("dirt", "Dirt"),
  floor("dirt_path", "Dirt Path"),
  floor("water", "Water", { noSpawn: true }),
  floor("sea_lantern", "Sea Lantern", { light: 15, hint: "Set flush in the floor" }),
  floor("glowstone", "Glowstone", { light: 15, hint: "Set flush in the floor" }),
];

export const BLOCK_MAP = new Map(BLOCKS.map((b) => [b.id, b]));

export function getBlock(id: string | null | undefined): BlockDef | undefined {
  return id ? BLOCK_MAP.get(id) : undefined;
}

export function workstationFor(professionId: string): BlockDef | undefined {
  const p = professionById(professionId);
  return p?.workstation ? BLOCK_MAP.get(p.workstation) : undefined;
}
