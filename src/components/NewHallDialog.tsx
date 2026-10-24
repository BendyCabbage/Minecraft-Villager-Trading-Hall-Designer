"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getBlock, professionById } from "@/lib/blocks";
import { MAX_SIZE, MIN_SIZE, clampSize, createDesign, type Design, type WishItem } from "@/lib/design";
import { drawDesign } from "@/lib/render";
import { DEFAULT_TEMPLATE, LAYOUTS, generateHall, planFromWishlist, type TemplateOptions, type VillagerSource } from "@/lib/templates";
import type { Edition } from "@/lib/trades";
import { TileIcon } from "./TileIcon";

const FLOORS = ["floor_stone_bricks", "floor_polished_andesite", "floor_deepslate_tiles", "floor_oak_planks", "floor_spruce_planks", "floor_smooth_stone"];
const WALLS = ["stone_bricks", "cobblestone", "deepslate_bricks", "oak_planks", "glass"];

const SOURCES: { id: VillagerSource; name: string }[] = [
  { id: "wishlist", name: "Villagers for my wishlist" },
  { id: "all", name: "One of each profession, repeating" },
  { id: "librarian", name: "All librarians" },
  { id: "unemployed", name: "Unemployed, to assign later" },
];

interface Props {
  edition: Edition;
  wishlist: WishItem[];
  initialSource?: VillagerSource;
  oneTradePerVillager: boolean;
  onClose(): void;
  onCreate(d: Design): void;
}

export function NewHallDialog({ edition, wishlist, initialSource, oneTradePerVillager, onClose, onCreate }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [mode, setMode] = useState<"template" | "blank">("template");
  const [opts, setOpts] = useState<TemplateOptions>({
    ...DEFAULT_TEMPLATE,
    source: initialSource ?? (wishlist.length ? "wishlist" : DEFAULT_TEMPLATE.source),
    oneTradePerVillager,
  });
  const [size, setSize] = useState({ w: "32", h: "20" });

  useEffect(() => {
    const el = ref.current;
    if (el && !el.open) el.showModal();
  }, []);

  const set = <K extends keyof TemplateOptions>(k: K, v: TemplateOptions[K]) => setOpts((o) => ({ ...o, [k]: v }));

  const plan = useMemo(() => planFromWishlist(edition, wishlist, opts.oneTradePerVillager), [edition, wishlist, opts.oneTradePerVillager]);
  const planSummary = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of plan) counts.set(p.villager, (counts.get(p.villager) ?? 0) + 1);
    return [...counts].map(([id, n]) => `${n} ${professionById(id)!.name.toLowerCase()}${n === 1 ? "" : "s"}`).join(", ");
  }, [plan]);
  const wishlistEmpty = opts.source === "wishlist" && plan.length === 0;

  const preview = useMemo(() => (mode === "template" && !wishlistEmpty ? generateHall(opts, edition, wishlist) : null), [mode, opts, edition, wishlist, wishlistEmpty]);

  const create = () => {
    if (mode === "blank") onCreate({ ...createDesign(clampSize(Number(size.w)), clampSize(Number(size.h)), "Untitled hall", edition), wishlist, oneTradePerVillager: opts.oneTradePerVillager });
    else if (preview) onCreate({ ...preview, wishlist });
  };

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className="gui-float m-auto max-h-[calc(100vh-32px)] w-[min(880px,calc(100vw-32px))] p-0 text-ink backdrop:bg-black/60"
    >
      <form
        method="dialog"
        className="flex max-h-[calc(100vh-32px)] flex-col"
        onSubmit={(e) => {
          e.preventDefault();
          create();
        }}
      >
        <header className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-gui-deep px-5 py-4">
          <div>
            <h2 className="font-pixel text-2xl leading-none">New hall</h2>
            <p className="mt-1.5 text-sm text-ink-soft">This replaces the current hall. Undo brings it back.</p>
          </div>
          <div className="flex gap-1.5" role="radiogroup" aria-label="Start from">
            {(["template", "blank"] as const).map((m) => (
              <button key={m} type="button" role="radio" aria-checked={mode === m} data-active={mode === m} className="btn px-3 py-1.5 text-sm" onClick={() => setMode(m)}>
                {m === "template" ? "From a template" : "Blank canvas"}
              </button>
            ))}
          </div>
        </header>

        {mode === "template" ? (
          <div className="scroll-thin grid min-h-0 gap-5 overflow-y-auto px-5 py-5 md:grid-cols-[1fr_minmax(0,22rem)]">
            <div className="min-w-0 space-y-5">
              <fieldset>
                <legend className="mb-2 font-pixel text-[15px]">Layout</legend>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {LAYOUTS.map((l) => (
                    <button
                      key={l.id}
                      type="button"
                      className="btn flex flex-col items-center gap-1.5 px-2 pt-2.5 pb-2 text-sm"
                      data-active={opts.layout === l.id}
                      aria-pressed={opts.layout === l.id}
                      onClick={() => set("layout", l.id)}
                      title={l.description}
                    >
                      <LayoutGlyph layout={l.id} />
                      {l.name}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-sm text-ink-soft">{LAYOUTS.find((l) => l.id === opts.layout)!.description}</p>
              </fieldset>

              <fieldset>
                <legend className="mb-2 font-pixel text-[15px]">Villagers</legend>
                <div className="space-y-1">
                  {SOURCES.map((s) => (
                    <label key={s.id} className="flex items-center gap-2.5 text-sm">
                      <input type="radio" name="source" checked={opts.source === s.id} onChange={() => set("source", s.id)} className="size-4 accent-[#0f7f3d]" />
                      {s.name}
                    </label>
                  ))}
                </div>
                {opts.source === "wishlist" ? (
                  <>
                    <p className={`mt-2 text-sm ${wishlistEmpty ? "text-redstone" : "text-ink-soft"}`}>
                      {wishlistEmpty
                        ? "Your wishlist is empty. Add the trades you need on the Trades page first."
                        : `${wishlist.length} wanted trade${wishlist.length === 1 ? "" : "s"} need ${plan.length} villager${plan.length === 1 ? "" : "s"}: ${planSummary}.`}
                    </p>
                    <label className="mt-2.5 flex items-start gap-2.5 text-sm">
                      <input
                        type="checkbox"
                        checked={opts.oneTradePerVillager}
                        onChange={(e) => set("oneTradePerVillager", e.target.checked)}
                        className="mt-0.5 size-4 shrink-0 accent-[#0f7f3d]"
                      />
                      <span>
                        One wanted trade per villager
                        <span className="block text-ink-soft">
                          {opts.oneTradePerVillager
                            ? "Every trade gets its own villager. More pods, far less rerolling."
                            : "Villagers of the same profession share wanted trades. Librarians still get one book each."}
                        </span>
                      </span>
                    </label>
                    <label className="mt-2.5 flex items-start gap-2.5 text-sm">
                      <input type="checkbox" checked={opts.lockTrades} onChange={(e) => set("lockTrades", e.target.checked)} className="mt-0.5 size-4 shrink-0 accent-[#0f7f3d]" />
                      <span>
                        Lock in wanted trades
                        <span className="block text-ink-soft">
                          {opts.lockTrades
                            ? "Each villager starts with its wanted trades already recorded, so the wishlist shows them as secured."
                            : "Each villager starts with its wanted trades under Rolling for. Mark each one Got it as you lock it in."}
                        </span>
                      </span>
                    </label>
                  </>
                ) : (
                  <label className="mt-2 flex items-center gap-2 text-sm">
                    How many
                    <input type="number" min={1} max={80} value={opts.pods} onChange={(e) => set("pods", Number(e.target.value))} className="field w-20 px-2 py-1" />
                  </label>
                )}
              </fieldset>

              <div className="grid gap-4 sm:grid-cols-2">
                <Swatches label="Floor" ids={FLOORS} value={opts.floor} onChange={(v) => set("floor", v)} />
                <Swatches label="Walls" ids={WALLS} value={opts.wall} onChange={(v) => set("wall", v)} />
              </div>
              <label className="flex items-center gap-2.5 text-sm">
                <input type="checkbox" checked={opts.lights} onChange={(e) => set("lights", e.target.checked)} className="size-4 accent-[#0f7f3d]" />
                Add lights so mobs can’t spawn inside
              </label>
            </div>

            <div className="min-w-0">
              <p className="mb-2 font-pixel text-[15px]">Preview</p>
              <Preview design={preview} />
              {preview && (
                <p className="mt-2 text-sm text-ink-soft">
                  {preview.width} × {preview.height} blocks
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 px-5 py-5 sm:max-w-md">
            <label className="block text-sm">
              <span className="mb-1 block text-ink-soft">Width (X)</span>
              <input type="number" min={MIN_SIZE} max={MAX_SIZE} value={size.w} onChange={(e) => setSize((s) => ({ ...s, w: e.target.value }))} className="field w-full px-2.5 py-2" />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-ink-soft">Depth (Z)</span>
              <input type="number" min={MIN_SIZE} max={MAX_SIZE} value={size.h} onChange={(e) => setSize((s) => ({ ...s, h: e.target.value }))} className="field w-full px-2.5 py-2" />
            </label>
          </div>
        )}

        <footer className="flex justify-end gap-2 border-t-2 border-gui-deep px-5 py-4">
          <button type="button" className="btn px-4 py-2 text-sm" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-emerald px-4 py-2 text-sm" disabled={mode === "template" && !preview}>
            Create hall
          </button>
        </footer>
      </form>
    </dialog>
  );
}

function Preview({ design }: { design: Design | null }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    const W = c.width;
    const H = c.height;
    ctx.fillStyle = "#17161c";
    ctx.fillRect(0, 0, W, H);
    if (!design) return;
    const cell = Math.max(1, Math.floor(Math.min((W - 16) / design.width, (H - 16) / design.height)));
    const ox = Math.floor((W - design.width * cell) / 2);
    const oy = Math.floor((H - design.height * cell) / 2);
    drawDesign(ctx, design, cell, ox, oy, 0, 0, design.width, design.height);
  }, [design]);
  return <canvas ref={ref} width={704} height={528} className="slot pixelated block aspect-[4/3] w-full p-1" aria-label="Preview of the generated hall" />;
}

/** Tiny diagram of each layout: villagers as dots. */
function LayoutGlyph({ layout }: { layout: string }) {
  const dots: [number, number][] =
    layout === "row"
      ? [0, 1, 2, 3, 4].map((i) => [6 + i * 7, 10])
      : layout === "double"
        ? [0, 1, 2, 3, 4].flatMap((i) => [[6 + i * 7, 8] as [number, number], [6 + i * 7, 28] as [number, number]])
        : layout === "square"
          ? [
              [10, 4],
              [20, 4],
              [30, 4],
              [36, 12],
              [36, 22],
              [36, 32],
              [10, 36],
              [30, 36],
              [4, 12],
              [4, 22],
              [4, 32],
            ]
          : Array.from({ length: 11 }, (_, i) => {
              const a = -Math.PI / 2 + (2 * Math.PI * i) / 12;
              return [20 + 15 * Math.cos(a), 20 + 15 * Math.sin(a)] as [number, number];
            });
  return (
    <svg viewBox="0 0 40 40" width={40} height={40} aria-hidden shapeRendering="crispEdges">
      {dots.map(([x, y], i) => (
        <rect key={i} x={x - 2} y={y - 2} width={4} height={4} fill="currentColor" />
      ))}
    </svg>
  );
}

function Swatches({ label, ids, value, onChange }: { label: string; ids: string[]; value: string; onChange(id: string): void }) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm">
        {label}: <span className="font-medium">{getBlock(value)?.name}</span>
      </legend>
      <div className="flex flex-wrap gap-1">
        {ids.map((id) => (
          <button
            key={id}
            type="button"
            className="slot flex size-10 items-center justify-center"
            data-active={id === value}
            onClick={() => onChange(id)}
            title={getBlock(id)?.name}
            aria-label={getBlock(id)?.name}
            aria-pressed={id === value}
          >
            <TileIcon id={id} size={28} />
          </button>
        ))}
      </div>
    </fieldset>
  );
}
