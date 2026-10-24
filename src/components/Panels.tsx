"use client";

import { useState } from "react";
import { PROFESSIONS, getBlock, professionById } from "@/lib/blocks";
import { MAX_SIZE, MIN_SIZE, clampSize, formatStacks, villagerName, xy, type Analysis, type Design, type IssueLevel } from "@/lib/design";
import { TileIcon } from "./TileIcon";
import { SectionHeading } from "./ui";

const LEVEL_STYLE: Record<IssueLevel, { colour: string; label: string }> = {
  error: { colour: "var(--redstone)", label: "Problem" },
  warn: { colour: "var(--gold)", label: "Warning" },
  info: { colour: "var(--lapis)", label: "Note" },
};

function coords(d: Design, cell: number) {
  return xy(d, cell).join(", ");
}

export function Section({ title, children, aside }: { title?: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="border-b-2 border-gui-deep px-4 py-4">
      {title && <SectionHeading aside={aside}>{title}</SectionHeading>}
      {children}
    </section>
  );
}

/* ------------------------------------------------------------------ */

export function CellPanel({
  design: d,
  analysis: a,
  selected,
  onSetObject,
  onSetFloor,
  onSelect,
}: {
  design: Design;
  analysis: Analysis;
  selected: number | null;
  onSetObject(cell: number, id: string | null): void;
  onSetFloor(cell: number, id: string | null): void;
  onSelect(cell: number): void;
}) {
  if (selected === null)
    return (
      <Section title="Nothing selected">
        <p className="text-sm leading-relaxed text-ink-soft">
          Choose the inspect tool (V) and click a villager to name it and record its trades. Clicking a name anywhere else in the app brings you here too.
        </p>
      </Section>
    );
  const obj = getBlock(d.obj[selected]);
  const floor = getBlock(d.floor[selected]);
  return (
    <Section title={`Block at ${coords(d, selected)}`}>
      <div className="space-y-2">
        <Row label="Block" id={obj?.id ?? null} name={obj?.name ?? "Air"} onClear={obj ? () => onSetObject(selected, null) : undefined} />
        <Row label="Floor" id={floor?.id ?? null} name={floor?.name ?? "Nothing"} onClear={floor ? () => onSetFloor(selected, null) : undefined} />
      </div>
      {obj?.kind === "workstation" && (
        <p className="mt-4 text-sm">
          {a.claimedBy.has(selected) ? (
            <button type="button" className="text-left text-emerald hover:underline" onClick={() => onSelect(a.claimedBy.get(selected)!)}>
              Claimed by {villagerName(d, a.claimedBy.get(selected)!)} at {coords(d, a.claimedBy.get(selected)!)}
            </button>
          ) : (
            <span className="text-gold">Not claimed. Put a {professionById(obj.profession!)!.name.toLowerCase()} or unemployed villager next to it.</span>
          )}
        </p>
      )}
    </Section>
  );
}

function Row({ label, id, name, onClear }: { label: string; id: string | null; name: string; onClear?: () => void }) {
  return (
    <div className="flex items-center gap-3">
      <div className="slot flex size-10 items-center justify-center">{id && <TileIcon id={id} size={28} />}</div>
      <div className="min-w-0 flex-1">
        <div className="text-xs text-ink-soft">{label}</div>
        <div className="truncate text-sm font-medium">{name}</div>
      </div>
      {onClear && (
        <button type="button" className="btn px-2 py-1 text-xs" onClick={onClear}>
          Remove
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function HallPanel({
  design: d,
  reach,
  onReach,
  onOneTrade,
  onRename,
  onResize,
}: {
  design: Design;
  reach: number;
  onReach(n: number): void;
  onOneTrade(on: boolean): void;
  onRename(name: string): void;
  onResize(w: number, h: number): void;
}) {
  return (
    <>
      <Section title="Hall">
        <div className="space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block text-ink-soft">Name</span>
            <input className="field w-full px-2.5 py-2 text-sm" value={d.name} maxLength={80} onChange={(e) => onRename(e.target.value)} />
          </label>
          {/* Keyed so the fields reset when the size changes elsewhere (undo, template, import). */}
          <SizeForm key={`${d.width}x${d.height}`} width={d.width} height={d.height} onResize={onResize} />
        </div>
      </Section>
      <Section title="Wanted trades">
        <label className="flex items-start gap-2.5 text-sm">
          <input type="checkbox" checked={d.oneTradePerVillager} onChange={(e) => onOneTrade(e.target.checked)} className="mt-0.5 size-4 shrink-0 accent-[#0f7f3d]" />
          <span>
            One wanted trade per villager
            <span className="mt-1 block text-xs leading-relaxed text-ink-soft">
              Getting two specific trades on the same villager is possible but takes so much rerolling that it rarely pays off. With this on, halls built from
              your wishlist give every trade its own villager, and each villager can be rolled for one trade at a time.
            </span>
          </span>
        </label>
      </Section>
      <Section title="Job site reach">
        <label className="block text-sm">
          <span className="mb-1 flex justify-between text-ink-soft">
            <span>Furthest a villager can be from its job site</span>
            <span className="font-medium text-ink">{reach}</span>
          </span>
          <input type="range" min={1} max={6} value={reach} onChange={(e) => onReach(Number(e.target.value))} className="w-full accent-[#0f7f3d]" />
          <span className="mt-1 block text-xs leading-relaxed text-ink-soft">
            In game, villagers claim a job site up to 48 blocks away. Keeping each one right next to its own stops them swapping.
          </span>
        </label>
      </Section>
    </>
  );
}

function SizeForm({ width, height, onResize }: { width: number; height: number; onResize(w: number, h: number): void }) {
  const [w, setW] = useState(String(width));
  const [h, setH] = useState(String(height));
  return (
    <form
      className="flex items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        onResize(clampSize(Number(w)), clampSize(Number(h)));
      }}
    >
      <label className="block flex-1 text-sm">
        <span className="mb-1 block text-ink-soft">Width (X)</span>
        <input className="field w-full px-2.5 py-2 text-sm" type="number" min={MIN_SIZE} max={MAX_SIZE} value={w} onChange={(e) => setW(e.target.value)} />
      </label>
      <label className="block flex-1 text-sm">
        <span className="mb-1 block text-ink-soft">Depth (Z)</span>
        <input className="field w-full px-2.5 py-2 text-sm" type="number" min={MIN_SIZE} max={MAX_SIZE} value={h} onChange={(e) => setH(e.target.value)} />
      </label>
      <button type="submit" className="btn h-9 px-3 text-sm" disabled={Number(w) === width && Number(h) === height}>
        Resize
      </button>
    </form>
  );
}

/* ------------------------------------------------------------------ */

export function ChecksPanel({ design: d, analysis: a, onSelect, onOpenTrades }: { design: Design; analysis: Analysis; onSelect(c: number): void; onOpenTrades(): void }) {
  const covered = PROFESSIONS.filter((pr) => a.professionCounts[pr.id]).length;
  const secured = [...a.wishStatus.values()].filter((s) => s === "secured").length;
  const stats = [
    { label: "villagers", value: `${a.villagers.length}` },
    { label: "with a job site", value: `${a.links.size}` },
    { label: "professions", value: `${covered} of 13` },
    { label: "dark tiles", value: `${a.spawnable.length}`, bad: a.spawnable.length > 0 },
  ];

  return (
    <div>
      <Section title="Overview">
        <dl className="grid grid-cols-2 gap-2">
          {stats.map((s) => (
            <div key={s.label} className="slot px-3 py-2 text-white">
              <dt className="sr-only">{s.label}</dt>
              <dd className={`font-pixel text-xl leading-tight ${s.bad ? "text-[#ff8a80]" : ""}`}>{s.value}</dd>
              <dd className="text-xs text-[#ececec]">{s.label}</dd>
            </div>
          ))}
        </dl>
        {a.spawnable.length > 0 && <p className="mt-3 text-xs leading-relaxed text-ink-soft">Dark tiles are floor with block light 0, where hostile mobs can spawn. Turn on the dark tiles overlay to find them.</p>}
      </Section>

      {d.wishlist.length > 0 && (
        <Section
          title="Wishlist"
          aside={
            <button type="button" className="btn px-2.5 py-1 text-xs" onClick={onOpenTrades}>
              Open
            </button>
          }
        >
          <p className="text-sm">
            {secured} of {d.wishlist.length} wanted trades secured.
          </p>
        </Section>
      )}

      <Section title="Professions">
        <div className="grid grid-cols-2 gap-x-3 gap-y-1">
          {PROFESSIONS.map((pr) => {
            const n = a.professionCounts[pr.id] ?? 0;
            return (
              <div key={pr.id} className={`flex items-center gap-2 text-sm ${n ? "" : "opacity-45"}`}>
                <TileIcon id={`villager_${pr.id}`} size={20} />
                <span className="flex-1 truncate">{pr.name}</span>
                <span className="tabular-nums">{n}</span>
              </div>
            );
          })}
        </div>
      </Section>

      <Section title={a.issues.length ? `Issues (${a.issues.length})` : "Issues"}>
        {a.issues.length === 0 ? (
          <p className="text-sm text-ink-soft">None. Every villager is boxed in next to its own job site.</p>
        ) : (
          <ul className="space-y-0.5">
            {a.issues.map((is, k) => (
              <li key={k}>
                <button type="button" className="flex w-full items-start gap-2.5 px-2 py-1.5 text-left text-sm hover:bg-gui-deep" onClick={() => onSelect(is.cell)}>
                  <span className="mt-1.5 size-2 shrink-0" style={{ background: LEVEL_STYLE[is.level].colour }} aria-label={LEVEL_STYLE[is.level].label} />
                  <span className="flex-1 leading-snug">{is.message}</span>
                  <span className="shrink-0 text-xs text-ink-soft tabular-nums">{coords(d, is.cell)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function MaterialsPanel({ analysis: a, onCopied }: { analysis: Analysis; onCopied(): void }) {
  const total = a.materials.reduce((s, m) => s + m.count, 0);
  const shulkers = Math.ceil(total / 64 / 27);
  const copy = async () => {
    const text = a.materials.map((m) => `${m.name}: ${m.count} (${formatStacks(m.count)})`).join("\n");
    await navigator.clipboard.writeText(text);
    onCopied();
  };
  return (
    <Section
      title="Materials"
      aside={
        a.materials.length > 0 && (
          <button type="button" className="btn px-2.5 py-1 text-xs" onClick={copy}>
            Copy list
          </button>
        )
      }
    >
      {a.materials.length === 0 ? (
        <p className="text-sm text-ink-soft">Nothing placed yet.</p>
      ) : (
        <>
          <ul className="space-y-1">
            {a.materials.map((m) => (
              <li key={m.name} className="flex items-center gap-2.5 py-0.5 text-sm">
                <TileIcon id={m.id} size={22} />
                <span className="flex-1 truncate">{m.name}</span>
                <span className="text-xs text-ink-soft">{m.count >= 64 ? formatStacks(m.count) : ""}</span>
                <span className="w-9 text-right font-medium tabular-nums">{m.count}</span>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex justify-between border-t-2 border-gui-deep pt-3 text-sm">
            <span>Total</span>
            <span className="font-medium tabular-nums">
              {total} blocks, {shulkers} shulker box{shulkers === 1 ? "" : "es"}
            </span>
          </div>
          <p className="mt-2 text-xs text-ink-soft">Counts the floor plus one block per cell. Villagers aren’t included.</p>
        </>
      )}
    </Section>
  );
}
