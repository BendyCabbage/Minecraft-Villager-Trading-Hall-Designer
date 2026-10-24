"use client";

import { useMemo, useState } from "react";
import { BLOCKS, CATEGORIES, getBlock } from "@/lib/blocks";
import { TileIcon } from "./TileIcon";

export function Palette({ selected, onSelect }: { selected: string; onSelect(id: string): void }) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();

  const groups = useMemo(
    () =>
      CATEGORIES.map((c) => ({
        ...c,
        blocks: BLOCKS.filter(
          (b) => b.category === c.id && (!q || b.name.toLowerCase().includes(q) || b.hint?.toLowerCase().includes(q)),
        ),
      })).filter((g) => g.blocks.length),
    [q],
  );

  const current = getBlock(selected);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b-2 border-gui-deep p-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search blocks…"
          className="field w-full px-3 py-2 text-sm"
          aria-label="Search blocks"
        />
      </div>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {groups.map((g) => (
          <section key={g.id} className="mt-3">
            <h3 className="mb-1.5 font-pixel text-[15px] text-ink">{g.name}</h3>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(42px,1fr))] gap-1">
              {g.blocks.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  className="slot flex aspect-square items-center justify-center"
                  data-active={b.id === selected}
                  onClick={() => onSelect(b.id)}
                  title={b.hint ? `${b.name}: ${b.hint}` : b.name}
                  aria-label={b.name}
                  aria-pressed={b.id === selected}
                >
                  <TileIcon id={b.id} size={28} />
                </button>
              ))}
            </div>
          </section>
        ))}
        {!groups.length && <p className="mt-6 text-center text-sm text-ink-soft">No blocks match “{query}”.</p>}
      </div>
      {current && (
        <div className="flex items-center gap-3 border-t-2 border-gui-deep px-3 py-2.5">
          <TileIcon id={current.id} size={32} />
          <div className="min-w-0 text-sm">
            <div className="truncate font-medium">{current.name}</div>
            <div className="truncate text-xs text-ink-soft">
              {current.hint ?? (current.layer === "floor" ? "Floor" : "Block")}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
