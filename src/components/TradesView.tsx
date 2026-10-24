"use client";

import { useMemo, useState } from "react";
import { PROFESSIONS, professionById } from "@/lib/blocks";
import { villagerName, type Analysis, type Design, type WishStatus } from "@/lib/design";
import { CATEGORIES, LEVEL_NAMES, resolveTrade, tradeOptions, type TradeCategory, type TradeOption } from "@/lib/trades";
import { TileIcon } from "./TileIcon";
import { CategoryDot, Credits, SectionHeading, TradeTerms, levelRange } from "./ui";

type Show = "all" | "hall" | "wishlist" | "missing";

interface Props {
  design: Design;
  analysis: Analysis;
  onToggleWish(key: string): void;
  onClearWish(): void;
  onBuild(): void;
  onJump(cell: number): void;
}

const SHOW: { id: Show; name: string }[] = [
  { id: "all", name: "All trades" },
  { id: "hall", name: "In this hall" },
  { id: "wishlist", name: "Wishlist" },
  { id: "missing", name: "Still needed" },
];

export function TradesView({ design: d, analysis: a, onToggleWish, onClearWish, onBuild, onJump }: Props) {
  const [query, setQuery] = useState("");
  // Open on what the hall already offers, once there is something to show.
  const [show, setShow] = useState<Show>(() => (a.owners.size ? "hall" : "all"));
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [category, setCategory] = useState<TradeCategory | "all">("all");
  const [professions, setProfessions] = useState<Set<string>>(new Set());
  const [levels, setLevels] = useState<Set<number>>(new Set());
  const [kind, setKind] = useState<"all" | "sell" | "buy">("all");
  const [topBooks, setTopBooks] = useState(true);

  const wished = useMemo(() => new Set(d.wishlist.map((w) => w.key)), [d.wishlist]);
  const q = query.trim().toLowerCase();

  // Everything but the category filter, so the category list can show counts.
  const base = useMemo(
    () =>
      tradeOptions(d.edition).filter((o) => {
        const owned = a.owners.has(o.key);
        if (show === "hall" && !owned) return false;
        if (show === "wishlist" && !wished.has(o.key)) return false;
        if (show === "missing" && (!wished.has(o.key) || owned)) return false;
        if (show === "all" && topBooks && o.enchant && o.enchant.level !== o.enchant.def.maxLevel && !owned && !wished.has(o.key)) return false;
        if (professions.size && !professions.has(o.profession)) return false;
        if (levels.size && !o.levels.some((l) => levels.has(l))) return false;
        if (kind !== "all" && o.kind !== kind) return false;
        if (q && !`${o.label} ${o.item} ${professionById(o.profession)?.name}`.toLowerCase().includes(q)) return false;
        return true;
      }),
    [d.edition, a.owners, show, wished, topBooks, professions, levels, kind, q],
  );

  const counts = new Map<string, number>();
  for (const o of base) counts.set(o.category, (counts.get(o.category) ?? 0) + 1);
  const rows = category === "all" ? base : base.filter((o) => o.category === category);
  const groups = CATEGORIES.map((c) => ({ ...c, rows: rows.filter((o) => o.category === c.id) })).filter((g) => g.rows.length);

  const toggle = <T,>(set: Set<T>, v: T) => {
    const next = new Set(set);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    return next;
  };
  const filtered = !!(q || category !== "all" || professions.size || levels.size || kind !== "all");

  return (
    <div className="flex flex-col lg:min-h-0 lg:flex-1 lg:flex-row">
      {/* Filters */}
      <aside className="gui scroll-thin flex flex-col gap-5 overflow-y-auto p-4 lg:w-64 lg:shrink-0">
        <div className="flex gap-2">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search, e.g. mending or bread"
            className="field min-w-0 flex-1 px-3 py-2 text-sm"
            aria-label="Search trades"
          />
          <button type="button" className="btn px-3 text-sm lg:hidden" aria-expanded={filtersOpen} onClick={() => setFiltersOpen((o) => !o)}>
            Filters
          </button>
        </div>
        <div className={`flex-col gap-5 lg:flex ${filtersOpen ? "flex" : "hidden"}`}>
          <fieldset>
            <legend className="mb-2 font-pixel text-[15px]">Show</legend>
            <div className="grid grid-cols-2 gap-1.5">
              {SHOW.map((s) => (
                <button key={s.id} type="button" className="btn px-2 py-1.5 text-sm" data-active={show === s.id} aria-pressed={show === s.id} onClick={() => setShow(s.id)}>
                  {s.name}
                </button>
              ))}
            </div>
            {show === "all" && (
              <label className="mt-2.5 flex items-center gap-2 text-sm">
                <input type="checkbox" checked={topBooks} onChange={(e) => setTopBooks(e.target.checked)} className="size-4 accent-[#0f7f3d]" />
                Only highest-level books
              </label>
            )}
          </fieldset>

          <fieldset>
            <legend className="mb-2 font-pixel text-[15px]">Category</legend>
            <ul className="space-y-0.5">
              {[{ id: "all" as const, name: "Everything", colour: "transparent" }, ...CATEGORIES].map((c) => {
                const n = c.id === "all" ? base.length : (counts.get(c.id) ?? 0);
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      className={`flex w-full items-center gap-2 px-2 py-1 text-left text-sm ${category === c.id ? "bg-ink text-white" : "hover:bg-gui-deep"} ${n === 0 && category !== c.id ? "opacity-45" : ""}`}
                      aria-pressed={category === c.id}
                      onClick={() => setCategory(c.id)}
                    >
                      <span className="inline-block size-2 shrink-0" style={{ background: c.colour }} />
                      <span className="flex-1">{c.name}</span>
                      <span className="tabular-nums">{n}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </fieldset>

          <fieldset>
            <legend className="mb-2 font-pixel text-[15px]">Profession</legend>
            <div className="grid grid-cols-7 gap-1 lg:grid-cols-5">
              {PROFESSIONS.map((pr) => (
                <button
                  key={pr.id}
                  type="button"
                  className="slot flex aspect-square items-center justify-center"
                  data-active={professions.has(pr.id)}
                  aria-pressed={professions.has(pr.id)}
                  title={pr.name}
                  aria-label={pr.name}
                  onClick={() => setProfessions((s) => toggle(s, pr.id))}
                >
                  <TileIcon id={`villager_${pr.id}`} size={26} />
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-2 font-pixel text-[15px]">Villager level</legend>
            <div className="flex flex-wrap gap-1">
              {LEVEL_NAMES.map((name, i) => (
                <button
                  key={name}
                  type="button"
                  className="btn px-2 py-1 text-xs"
                  data-active={levels.has(i + 1)}
                  aria-pressed={levels.has(i + 1)}
                  onClick={() => setLevels((s) => toggle(s, i + 1))}
                >
                  {name}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-2 font-pixel text-[15px]">Direction</legend>
            <div className="grid grid-cols-3 gap-1">
              {(
                [
                  ["all", "Both"],
                  ["sell", "You buy"],
                  ["buy", "You sell"],
                ] as const
              ).map(([id, name]) => (
                <button key={id} type="button" className="btn px-1.5 py-1 text-xs" data-active={kind === id} aria-pressed={kind === id} onClick={() => setKind(id)}>
                  {name}
                </button>
              ))}
            </div>
          </fieldset>

          {filtered && (
            <button
              type="button"
              className="btn px-3 py-1.5 text-sm"
              onClick={() => {
                setQuery("");
                setCategory("all");
                setProfessions(new Set());
                setLevels(new Set());
                setKind("all");
              }}
            >
              Clear filters
            </button>
          )}
        </div>
      </aside>

      {/* Catalogue */}
      <main className="scroll-thin min-w-0 flex-1 overflow-y-auto bg-[#a9a9a9] px-3 py-4 sm:px-6">
        <div className="mx-auto max-w-4xl">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-pixel text-2xl text-ink">{d.edition === "java" ? "Java" : "Bedrock"} Edition trades</h2>
            <p className="text-sm text-ink-soft">
              {rows.length} trade{rows.length === 1 ? "" : "s"}, {a.owners.size} available in this hall
            </p>
          </div>
          {groups.length === 0 ? (
            <EmptyCatalogue show={show} />
          ) : (
            groups.map((g) => (
              <section key={g.id} className="mb-6">
                <h3 className="mb-2 flex items-center gap-2 font-pixel text-lg text-ink">
                  <span className="inline-block size-3" style={{ background: g.colour }} />
                  {g.name}
                  <span className="font-sans text-sm font-normal text-ink-soft">{g.rows.length}</span>
                </h3>
                <ul className="space-y-1">
                  {g.rows.map((o) => (
                    <CatalogueRow key={o.key} o={o} design={d} owners={a.owners.get(o.key) ?? []} planners={a.planners.get(o.key) ?? []} wanted={wished.has(o.key)} onToggleWish={onToggleWish} onJump={onJump} />
                  ))}
                </ul>
              </section>
            ))
          )}
          <Credits className="mt-8 border-t-2 border-black/15 pt-4" />
        </div>
      </main>

      <WishlistRail design={d} analysis={a} onToggleWish={onToggleWish} onClear={onClearWish} onBuild={onBuild} onJump={onJump} />
    </div>
  );
}

function EmptyCatalogue({ show }: { show: Show }) {
  const text: Record<Show, string> = {
    all: "No trades match these filters.",
    hall: "No villager in this hall has a trade recorded yet. Select a villager in the hall and add the trades it has.",
    wishlist: "Your wishlist is empty. Switch to All trades and pick Want on the ones you need.",
    missing: "Everything on your wishlist is available in this hall.",
  };
  return <p className="offer px-4 py-6 text-center text-sm">{text[show]}</p>;
}

function VillagerLinks({ design, cells, onJump, tone }: { design: Design; cells: number[]; onJump(c: number): void; tone: "owned" | "planned" }) {
  if (!cells.length) return null;
  const shown = cells.slice(0, 2);
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
      {tone === "planned" && <span className="text-enchant">Rolling:</span>}
      {shown.map((c) => (
        <button key={c} type="button" className={`truncate underline-offset-2 hover:underline ${tone === "owned" ? "font-medium text-emerald" : "text-enchant"}`} onClick={() => onJump(c)}>
          {villagerName(design, c)}
        </button>
      ))}
      {cells.length > shown.length && <span className="text-ink-soft">and {cells.length - shown.length} more</span>}
    </span>
  );
}

function CatalogueRow({
  o,
  design,
  owners,
  planners,
  wanted,
  onToggleWish,
  onJump,
}: {
  o: TradeOption;
  design: Design;
  owners: number[];
  planners: number[];
  wanted: boolean;
  onToggleWish(key: string): void;
  onJump(c: number): void;
}) {
  const prof = professionById(o.profession)!;
  return (
    <li className="offer grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-1 py-1.5 pr-2 pl-2 sm:grid-cols-[auto_minmax(0,1fr)_9rem_minmax(0,10rem)_auto]" data-owned={owners.length > 0} data-wanted={wanted && !owners.length}>
      <TileIcon id={`villager_${prof.id}`} size={24} className="row-span-2 sm:row-span-1" />
      <div className="min-w-0">
        <TradeTerms o={o} />
        {o.note && <p className="truncate text-xs text-ink-soft">{o.note}</p>}
      </div>
      <button
        type="button"
        className="btn row-span-2 px-2.5 py-1 text-xs sm:order-last sm:row-span-1"
        data-active={wanted}
        aria-pressed={wanted}
        onClick={() => onToggleWish(o.key)}
        title={wanted ? "Remove from wishlist" : "Add to wishlist"}
      >
        {wanted ? "Wanted" : "Want"}
      </button>
      <span className="text-xs text-ink-soft">
        {prof.name}, {levelRange(o.levels)}
      </span>
      <span className="min-w-0">
        <VillagerLinks design={design} cells={owners} onJump={onJump} tone="owned" />
        {!owners.length && <VillagerLinks design={design} cells={planners} onJump={onJump} tone="planned" />}
      </span>
    </li>
  );
}

/* ------------------------------------------------------------------ */

const STATUS: { id: WishStatus; name: string; colour: string }[] = [
  { id: "missing", name: "Still needed", colour: "#7a7a7a" },
  { id: "planned", name: "Being rolled for", colour: "var(--enchant)" },
  { id: "secured", name: "Secured", colour: "var(--emerald)" },
];

function WishlistRail({
  design: d,
  analysis: a,
  onToggleWish,
  onClear,
  onBuild,
  onJump,
}: {
  design: Design;
  analysis: Analysis;
  onToggleWish(key: string): void;
  onClear(): void;
  onBuild(): void;
  onJump(c: number): void;
}) {
  const total = d.wishlist.length;
  const tally = STATUS.map((s) => ({ ...s, items: d.wishlist.filter((w) => a.wishStatus.get(w.key) === s.id) }));

  return (
    <aside className="gui scroll-thin flex flex-col overflow-y-auto lg:w-80 lg:shrink-0">
      <div className="border-b-2 border-gui-deep p-4">
        <SectionHeading aside={<span className="text-sm text-ink-soft">{total} trade{total === 1 ? "" : "s"}</span>}>Wishlist</SectionHeading>
        {total === 0 ? (
          <p className="text-sm leading-relaxed text-ink-soft">
            Pick <span className="font-medium text-ink">Want</span> on each trade the hall needs. Then build a hall around the list: it works out how many villagers
            of each profession you need.
          </p>
        ) : (
          <>
            <div className="slot flex h-4 overflow-hidden p-0.5" role="img" aria-label={tally.map((t) => `${t.items.length} ${t.name.toLowerCase()}`).join(", ")}>
              {[...tally].reverse().map((t) => (
                <span key={t.id} style={{ width: `${(t.items.length / total) * 100}%`, background: t.colour }} />
              ))}
            </div>
            <p className="mt-2 text-sm">
              {tally[2].items.length} of {total} secured
              {tally[1].items.length > 0 && `, ${tally[1].items.length} being rolled for`}
            </p>
          </>
        )}
        <div className="mt-3 flex gap-2">
          <button type="button" className="btn btn-emerald flex-1 px-3 py-2 text-sm" disabled={!total} onClick={onBuild}>
            Build a hall from this list
          </button>
          {total > 0 && (
            <button type="button" className="btn px-3 py-2 text-sm" onClick={onClear}>
              Clear
            </button>
          )}
        </div>
      </div>

      {tally.map(
        (t) =>
          t.items.length > 0 && (
            <section key={t.id} className="border-b-2 border-gui-deep px-4 py-3">
              <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                <span className="inline-block size-2.5" style={{ background: t.colour }} />
                {t.name}
              </h4>
              <ul className="space-y-1">
                {t.items.map((w) => {
                  const o = resolveTrade(d.edition, w.key);
                  const cells = t.id === "secured" ? a.owners.get(w.key) : t.id === "planned" ? a.planners.get(w.key) : undefined;
                  return (
                    <li key={w.key} className="flex items-center gap-2 text-sm">
                      {o ? <CategoryDot category={o.category} /> : <span className="size-2" />}
                      <span className="min-w-0 flex-1">
                        <span className={`block truncate ${o?.enchant ? "glint font-medium" : ""}`}>{o ? (o.kind === "buy" ? `Sell ${o.count} ${o.item}` : o.label) : "Not in this edition"}</span>
                        <span className="block truncate text-xs text-ink-soft">
                          {cells?.length ? (
                            <button type="button" className="hover:underline" onClick={() => onJump(cells[0])}>
                              {cells.map((c) => villagerName(d, c)).join(", ")}
                            </button>
                          ) : (
                            o && professionById(o.profession)?.name
                          )}
                        </span>
                      </span>
                      <button type="button" className="btn px-1.5 py-0.5 text-xs" onClick={() => onToggleWish(w.key)} aria-label="Remove from wishlist">
                        Remove
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ),
      )}
    </aside>
  );
}
