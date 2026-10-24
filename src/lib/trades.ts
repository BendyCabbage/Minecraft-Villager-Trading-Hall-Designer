import { BOOK_ENCHANTS, TRADES, type Edition, type EnchantDef, type TradeCategory, type TradeDef } from "./trades-data";

export type { Edition, TradeCategory };

export const EDITIONS: { id: Edition; name: string }[] = [
  { id: "java", name: "Java" },
  { id: "bedrock", name: "Bedrock" },
];

export const LEVEL_NAMES = ["Novice", "Apprentice", "Journeyman", "Expert", "Master"] as const;

export const CATEGORIES: { id: TradeCategory; name: string; colour: string }[] = [
  { id: "enchanted-book", name: "Enchanted books", colour: "#8a4fd8" },
  { id: "armor", name: "Armor", colour: "#5d7fa8" },
  { id: "weapon", name: "Weapons", colour: "#a8433b" },
  { id: "tool", name: "Tools", colour: "#7b6a4e" },
  { id: "brewing", name: "Brewing & magic", colour: "#b0457f" },
  { id: "food", name: "Food", colour: "#c07a2a" },
  { id: "building", name: "Building blocks", colour: "#6f6f6f" },
  { id: "decoration", name: "Decoration", colour: "#3f8f8a" },
  { id: "maps-banners", name: "Maps & banners", colour: "#9a7b2f" },
  { id: "emerald-income", name: "Emerald income", colour: "#178a45" },
  { id: "misc", name: "Other", colour: "#596069" },
];

export const categoryInfo = (id: TradeCategory) => CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[CATEGORIES.length - 1];

export interface TradeOption {
  key: string;
  profession: string;
  /** What the player is after: "Mending", "Protection IV", "Iron Chestplate", "Coal". */
  label: string;
  item: string;
  category: TradeCategory;
  kind: "sell" | "buy";
  /** Villager levels this trade can appear at. */
  levels: number[];
  count: number;
  emeralds: [number, number];
  extra?: string;
  enchanted?: boolean;
  note?: string;
  enchant?: { def: EnchantDef; level: number };
}

const ROMAN = ["", "I", "II", "III", "IV", "V"];
export const roman = (n: number) => ROMAN[n] ?? String(n);

/** Java librarian book price: 2 + 3×level + rand(0, 4 + 10×level), doubled for treasure, capped at 64. */
export function bookPrice(level: number, treasure: boolean): [number, number] {
  const k = treasure ? 2 : 1;
  return [Math.min(64, (2 + 3 * level) * k), Math.min(64, (6 + 13 * level) * k)];
}

export const bookKey = (enchantId: string, level: number) => `librarian/book/${enchantId}/${level}`;

const cache = new Map<Edition, { all: TradeOption[]; byKey: Map<string, TradeOption> }>();

function build(edition: Edition) {
  const hit = cache.get(edition);
  if (hit) return hit;
  const all: TradeOption[] = [];
  const byKey = new Map<string, TradeOption>();
  const add = (o: TradeOption) => {
    const existing = byKey.get(o.key);
    if (existing) {
      for (const l of o.levels) if (!existing.levels.includes(l)) existing.levels.push(l);
      return;
    }
    byKey.set(o.key, o);
    all.push(o);
  };

  const bookLevels: number[] = [];
  for (const t of TRADES[edition] as TradeDef[]) {
    if (t.id === "enchanted_book") {
      bookLevels.push(t.level);
      continue;
    }
    add({
      key: `${t.profession}/${t.id}`,
      profession: t.profession,
      label: t.item,
      item: t.item,
      category: t.category,
      kind: t.kind,
      levels: [t.level],
      count: t.count,
      emeralds: t.emeralds,
      extra: t.extra,
      enchanted: t.enchanted,
      note: t.note,
    });
  }
  const levels = [...new Set(bookLevels)].sort();
  for (const def of BOOK_ENCHANTS[edition]) {
    for (let l = 1; l <= def.maxLevel; l++) {
      add({
        key: bookKey(def.id, l),
        profession: "librarian",
        label: def.maxLevel > 1 ? `${def.name} ${roman(l)}` : def.name,
        item: "Enchanted Book",
        category: "enchanted-book",
        kind: "sell",
        levels: levels.length ? levels : [1, 2, 3, 4],
        count: 1,
        emeralds: bookPrice(l, def.treasure),
        extra: "1 Book",
        enchant: { def, level: l },
      });
    }
  }
  for (const o of all) o.levels.sort();
  const out = { all, byKey };
  cache.set(edition, out);
  return out;
}

export const tradeOptions = (edition: Edition) => build(edition).all;
export const resolveTrade = (edition: Edition, key: string) => build(edition).byKey.get(key);
export const tradeOptionsFor = (edition: Edition, profession: string) => build(edition).all.filter((o) => o.profession === profession);

export function professionOfKey(key: string) {
  return key.split("/")[0];
}

/** "Mending" for books, otherwise the item with its count, e.g. "4 Bread". */
export function describeTrade(o: TradeOption) {
  if (o.enchant) return `${o.label} book`;
  if (o.kind === "buy") return `Buys ${o.count} ${o.item}`;
  return o.count > 1 ? `${o.count} ${o.item}` : o.item;
}

export function priceText([min, max]: [number, number]) {
  return min === max ? `${min}` : `${min}–${max}`;
}
