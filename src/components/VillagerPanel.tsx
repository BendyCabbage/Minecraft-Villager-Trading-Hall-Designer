"use client";

import { useMemo, useState } from "react";
import { ALL_PROFESSIONS, getBlock, professionById } from "@/lib/blocks";
import { defaultVillagerName, villagerMeta, xy, type Analysis, type Design, type VillagerMeta } from "@/lib/design";
import { LEVEL_NAMES, resolveTrade, roman, tradeOptionsFor, type TradeOption } from "@/lib/trades";
import { TileIcon } from "./TileIcon";
import { SectionHeading, TradeTerms } from "./ui";

type MetaFn = (m: VillagerMeta) => VillagerMeta;

interface Props {
  design: Design;
  analysis: Analysis;
  cell: number;
  /** Live edit while a field has focus (bracketed by onFieldFocus/onFieldBlur for undo). */
  onMeta(fn: MetaFn): void;
  /** One undoable change. */
  onMetaCommit(fn: MetaFn): void;
  onFieldFocus(): void;
  onFieldBlur(): void;
  onProfession(prof: string): void;
  onSelect(cell: number): void;
}

export function VillagerPanel(p: Props) {
  const { design: d, analysis: a, cell } = p;
  const def = getBlock(d.obj[cell])!;
  const prof = professionById(def.profession!)!;
  const meta = villagerMeta(d, cell);
  const [picker, setPicker] = useState<"has" | "rolling" | null>(null);
  const canTrade = !!prof.workstation;
  const link = a.links.get(cell);
  const wished = new Set(d.wishlist.map((w) => w.key));
  const single = d.oneTradePerVillager;

  return (
    <div>
      <section className="border-b-2 border-gui-deep px-4 pt-4 pb-4">
        <div className="flex items-start gap-3">
          <div className="slot flex size-14 shrink-0 items-center justify-center">
            <TileIcon id={def.id} size={40} />
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <label className="block">
              <span className="sr-only">Name</span>
              <input
                className="field w-full px-2.5 py-1.5 font-pixel text-lg"
                value={meta.name ?? ""}
                placeholder={defaultVillagerName(d, cell)}
                maxLength={40}
                onFocus={p.onFieldFocus}
                onBlur={p.onFieldBlur}
                onChange={(e) => {
                  const name = e.target.value;
                  p.onMeta((m) => ({ ...m, name: name || undefined }));
                }}
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <span className="text-ink-soft">Profession</span>
              <select className="field min-w-0 flex-1 px-2 py-1 text-sm" value={prof.id} onChange={(e) => p.onProfession(e.target.value)}>
                {ALL_PROFESSIONS.map((pr) => (
                  <option key={pr.id} value={pr.id}>
                    {pr.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
        <p className="mt-3 text-sm">
          {prof.id === "nitwit" ? (
            <span className="text-gold">Nitwits never take a job, so they can’t trade.</span>
          ) : link !== undefined ? (
            <button type="button" className="flex items-center gap-1.5 text-left text-emerald hover:underline" onClick={() => p.onSelect(link)}>
              <TileIcon id={d.obj[link]} size={18} />
              Works at the {getBlock(d.obj[link])!.name.toLowerCase()} at {xy(d, link).join(", ")}
            </button>
          ) : (
            <span className="text-redstone">
              No free {prof.workstation ? getBlock(prof.workstation)!.name.toLowerCase() : "job site"} next to it yet.
            </span>
          )}
        </p>
      </section>

      {canTrade ? (
        <>
          <section className="border-b-2 border-gui-deep px-4 py-4">
            <SectionHeading
              aside={
                <button type="button" className="btn px-2.5 py-1 text-xs" data-active={picker === "has"} onClick={() => setPicker(picker === "has" ? null : "has")}>
                  {picker === "has" ? "Done" : "Add trade"}
                </button>
              }
            >
              Trades it has
            </SectionHeading>
            {picker === "has" && (
              <TradePicker
                design={d}
                profession={prof.id}
                taken={new Set(meta.trades.map((t) => t.key))}
                wished={wished}
                onPick={(key) => p.onMetaCommit((m) => ({ ...m, trades: [...m.trades, { key }], targets: m.targets.filter((k) => k !== key) }))}
              />
            )}
            {meta.trades.length === 0 ? (
              picker !== "has" && <p className="text-sm text-ink-soft">None recorded. Add the trades you’ve locked in.</p>
            ) : (
              <ul className="space-y-1.5">
                {meta.trades.map((t, i) => {
                  const o = resolveTrade(d.edition, t.key);
                  return (
                    <li key={t.key} className="offer flex items-center gap-2 py-1.5 pr-1.5 pl-2.5" data-owned="true">
                      <div className="min-w-0 flex-1">
                        {o ? <TradeTerms o={o} price={t.price} /> : <span className="text-sm text-ink-soft">Not offered in this edition</span>}
                      </div>
                      {o?.kind === "sell" && (
                        <input
                          type="number"
                          min={1}
                          max={64}
                          className="field w-12 px-1.5 py-0.5 text-right text-sm"
                          placeholder={`${o.emeralds[0]}`}
                          value={t.price ?? ""}
                          aria-label="Locked-in emerald price"
                          title="Emerald price you locked in"
                          onFocus={p.onFieldFocus}
                          onBlur={p.onFieldBlur}
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            p.onMeta((m) => ({
                              ...m,
                              trades: m.trades.map((x, j) => (j === i ? { ...x, price: v > 0 ? Math.min(64, Math.round(v)) : undefined } : x)),
                            }));
                          }}
                        />
                      )}
                      <RemoveButton label="Remove trade" onClick={() => p.onMetaCommit((m) => ({ ...m, trades: m.trades.filter((_, j) => j !== i) }))} />
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="border-b-2 border-gui-deep px-4 py-4">
            <SectionHeading
              aside={
                <button
                  type="button"
                  className="btn px-2.5 py-1 text-xs"
                  data-active={picker === "rolling"}
                  onClick={() => setPicker(picker === "rolling" ? null : "rolling")}
                >
                  {picker === "rolling" ? "Done" : single && meta.targets.length ? "Change" : "Add target"}
                </button>
              }
            >
              Rolling for
            </SectionHeading>
            {picker === "rolling" && (
              <TradePicker
                design={d}
                profession={prof.id}
                taken={new Set([...meta.targets, ...meta.trades.map((t) => t.key)])}
                wished={wished}
                onPick={(key) => {
                  // One target per villager: picking another replaces it.
                  p.onMetaCommit((m) => ({ ...m, targets: single ? [key] : [...m.targets, key] }));
                  if (single) setPicker(null);
                }}
              />
            )}
            {single && meta.targets.length > 1 && (
              <p className="mb-2 text-xs text-ink-soft">This hall plans one trade per villager. Remove the extras or turn the setting off in the Hall tab.</p>
            )}
            {meta.targets.length === 0 ? (
              picker !== "rolling" && (
                <p className="text-sm text-ink-soft">Nothing yet. Add the trade you’re breaking and replacing its job site for.</p>
              )
            ) : (
              <ul className="space-y-1.5">
                {meta.targets.map((key) => {
                  const o = resolveTrade(d.edition, key);
                  return (
                    <li key={key} className="offer flex items-center gap-2 py-1.5 pr-1.5 pl-2.5" data-wanted="true">
                      <div className="min-w-0 flex-1">{o ? <TradeTerms o={o} /> : <span className="text-sm text-ink-soft">Not offered in this edition</span>}</div>
                      <button
                        type="button"
                        className="btn btn-emerald px-2 py-0.5 text-xs"
                        title="Move to trades it has"
                        onClick={() => p.onMetaCommit((m) => ({ ...m, targets: m.targets.filter((k) => k !== key), trades: [...m.trades, { key }] }))}
                      >
                        Got it
                      </button>
                      <RemoveButton label="Stop rolling for this" onClick={() => p.onMetaCommit((m) => ({ ...m, targets: m.targets.filter((k) => k !== key) }))} />
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      ) : (
        prof.id === "unemployed" && (
          <section className="border-b-2 border-gui-deep px-4 py-4 text-sm text-ink-soft">
            Unemployed villagers have no trades. Put a job site next to this one, or pick a profession above.
          </section>
        )
      )}

      <section className="border-b-2 border-gui-deep px-4 py-4">
        <label className="block">
          <SectionHeading>Notes</SectionHeading>
          <textarea
            className="field scroll-thin min-h-20 w-full resize-y px-2.5 py-2 text-sm"
            placeholder="Anything worth remembering, like who cured it"
            value={meta.note ?? ""}
            maxLength={500}
            onFocus={p.onFieldFocus}
            onBlur={p.onFieldBlur}
            onChange={(e) => {
              const note = e.target.value;
              p.onMeta((m) => ({ ...m, note: note || undefined }));
            }}
          />
        </label>
      </section>
    </div>
  );
}

function RemoveButton({ label, onClick }: { label: string; onClick(): void }) {
  return (
    <button type="button" className="btn flex size-6 shrink-0 items-center justify-center" onClick={onClick} aria-label={label} title={label}>
      <svg viewBox="0 0 8 8" width={9} height={9} shapeRendering="crispEdges" aria-hidden>
        <path d="M0 0h2v1h1v1h2V1h1V0h2v2H7v1H6v2h1v1h1v2H6V7H5V6H3v1H2v1H0V6h1V5h1V3H1V2H0z" fill="currentColor" />
      </svg>
    </button>
  );
}

/* ------------------------------------------------------------------ */

interface PickerProps {
  design: Design;
  profession: string;
  taken: Set<string>;
  wished: Set<string>;
  onPick(key: string): void;
}

/** Searchable list of a profession's trade pool. Books collapse to one row per enchantment with a chip per level. */
function TradePicker({ design: d, profession, taken, wished, onPick }: PickerProps) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const pool = useMemo(() => tradeOptionsFor(d.edition, profession), [d.edition, profession]);
  const match = (o: TradeOption) => !q || o.label.toLowerCase().includes(q) || o.item.toLowerCase().includes(q);

  const wanted = pool.filter((o) => wished.has(o.key) && !taken.has(o.key) && match(o));
  const books = new Map<string, TradeOption[]>();
  for (const o of pool) if (o.enchant && match(o)) books.set(o.enchant.def.id, [...(books.get(o.enchant.def.id) ?? []), o]);
  const byLevel = LEVEL_NAMES.map((name, i) => ({ name, items: pool.filter((o) => !o.enchant && o.levels[0] === i + 1 && match(o)) }));

  const row = (o: TradeOption) => (
    <li key={o.key}>
      <button
        type="button"
        className="offer flex w-full items-center gap-2 px-2.5 py-1.5 text-left disabled:opacity-50"
        data-wanted={wished.has(o.key)}
        disabled={taken.has(o.key)}
        onClick={() => onPick(o.key)}
      >
        <TradeTerms o={o} />
      </button>
    </li>
  );

  return (
    <div className="slot mb-3 p-2">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={profession === "librarian" ? "Search, e.g. mending" : "Search trades"}
        className="field mb-2 w-full px-2.5 py-1.5 text-sm"
        aria-label="Search trades"
        autoFocus
      />
      <div className="scroll-thin max-h-80 space-y-3 overflow-y-auto pr-1">
        {wanted.length > 0 && (
          <div>
            <p className="mb-1 text-xs font-semibold text-white">From your wishlist</p>
            <ul className="space-y-1">{wanted.map(row)}</ul>
          </div>
        )}
        {books.size > 0 && (
          <div>
            <p className="mb-1 text-xs font-semibold text-white">Enchanted books</p>
            <ul className="space-y-1">
              {[...books.values()].map((levels) => {
                const def = levels[0].enchant!.def;
                return (
                  <li key={def.id} className="offer flex items-center gap-2 px-2.5 py-1.5">
                    <span className="glint min-w-0 flex-1 truncate text-sm font-medium">{def.name}</span>
                    <span className="flex gap-1">
                      {levels.map((o) => (
                        <button
                          key={o.key}
                          type="button"
                          className="btn min-w-7 px-1 py-0.5 text-xs"
                          data-active={wished.has(o.key)}
                          disabled={taken.has(o.key)}
                          onClick={() => onPick(o.key)}
                          title={`${o.label}: ${o.emeralds[0]}–${o.emeralds[1]} emeralds`}
                        >
                          {roman(o.enchant!.level)}
                        </button>
                      ))}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        {byLevel.map(
          (g) =>
            g.items.length > 0 && (
              <div key={g.name}>
                <p className="mb-1 text-xs font-semibold text-white">{g.name}</p>
                <ul className="space-y-1">{g.items.map(row)}</ul>
              </div>
            ),
        )}
        {!wanted.length && !books.size && byLevel.every((g) => !g.items.length) && (
          <p className="px-1 py-2 text-sm text-white">No {professionById(profession)?.name.toLowerCase()} trades match “{query}”.</p>
        )}
      </div>
    </div>
  );
}
