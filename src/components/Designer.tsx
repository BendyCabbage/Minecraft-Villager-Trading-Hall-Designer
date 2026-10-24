"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getBlock } from "@/lib/blocks";
import { analyze, applyCells, moveCell, parseDesign, resizeDesign, updateVillager, villagerName, xy, type Design, type VillagerMeta } from "@/lib/design";
import { DEFAULT_TEMPLATE, generateHall, type VillagerSource } from "@/lib/templates";
import { preloadTiles } from "@/lib/tiles";
import { EDITIONS, bookKey, resolveTrade, type Edition } from "@/lib/trades";
import { EditorCanvas, type EditorHandle, type Overlays, type Tool } from "./EditorCanvas";
import { NewHallDialog } from "./NewHallDialog";
import { Palette } from "./Palette";
import { CellPanel, ChecksPanel, HallPanel, MaterialsPanel } from "./Panels";
import { TileIcon } from "./TileIcon";
import { TradesView } from "./TradesView";
import { VillagerPanel } from "./VillagerPanel";

const STORAGE_KEY = "trading-hall-designer:v1";
const HISTORY_LIMIT = 200;

type View = "hall" | "trades";
type Tab = "selected" | "checks" | "materials" | "hall";

interface Saved {
  design: Design;
  reach: number;
  overlays: Overlays;
  hotbar: string[];
  view: View;
}

const DEFAULT_OVERLAYS: Overlays = { grid: true, links: true, issues: true, spawns: false, labels: true };
const DEFAULT_HOTBAR = ["villager_librarian", "lectern", "stone_bricks", "glass", "floor_stone_bricks", "oak_door", "sea_lantern", "oak_trapdoor", "rail"];

function firstDesign(): Design {
  const d = generateHall(DEFAULT_TEMPLATE, "java", []);
  // A starter wishlist so the Trades page has something to show.
  d.wishlist = [bookKey("mending", 1), bookKey("unbreaking", 3), bookKey("efficiency", 5)]
    .filter((key) => resolveTrade("java", key))
    .map((key) => ({ key }));
  return d;
}

function loadSaved(): Partial<Saved> {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    if (!raw) return {};
    const hotbar = Array.isArray(raw.hotbar) ? raw.hotbar.filter((id: unknown) => typeof id === "string" && getBlock(id)).slice(0, 9) : undefined;
    return {
      design: parseDesign(raw.design) ?? undefined,
      reach: typeof raw.reach === "number" ? Math.max(1, Math.min(6, raw.reach)) : undefined,
      overlays: raw.overlays ? { ...DEFAULT_OVERLAYS, ...raw.overlays } : undefined,
      hotbar: hotbar?.length === 9 ? hotbar : undefined,
      view: raw.view === "trades" ? "trades" : "hall",
    };
  } catch {
    return {};
  }
}

const TOOLS: { id: Tool; name: string; key: string; icon: React.ReactNode }[] = [
  { id: "pencil", name: "Pencil", key: "B", icon: <path d="M4 20l4-1 11-11-3-3L5 16l-1 4zM14 6l3 3" /> },
  { id: "line", name: "Line", key: "L", icon: <path d="M5 19L19 5" /> },
  { id: "rect", name: "Filled rectangle", key: "R", icon: <rect x="5" y="6" width="14" height="12" fill="currentColor" fillOpacity=".35" /> },
  { id: "outline", name: "Hollow rectangle, for walls", key: "O", icon: <rect x="5" y="6" width="14" height="12" /> },
  { id: "fill", name: "Bucket fill", key: "F", icon: <path d="M6 11l6-6 7 7-6 6-7-7zM6 11h13M19 16c0 1.5 1 2.5 1 3.2a1 1 0 01-2 0c0-.7 1-1.7 1-3.2z" /> },
  { id: "picker", name: "Pick block", key: "I", icon: <path d="M15 4l5 5-2 2-5-5 2-2zM13 6l-8 8v5h5l8-8" /> },
  { id: "inspect", name: "Inspect", key: "V", icon: <path d="M6 4l12 8-5 1.5L16 20l-2.5 1-3-6.5L6 18V4z" /> },
];

const OVERLAY_LABELS: { id: keyof Overlays; name: string; key?: string }[] = [
  { id: "labels", name: "Names" },
  { id: "links", name: "Job links" },
  { id: "issues", name: "Issues" },
  { id: "spawns", name: "Dark tiles" },
  { id: "grid", name: "Grid", key: "G" },
];

function download(name: string, href: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  a.click();
}

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "trading-hall";
}

export function Designer() {
  const [saved] = useState(loadSaved);
  const [design, setDesign] = useState<Design>(() => saved.design ?? firstDesign());
  const [past, setPast] = useState<Design[]>([]);
  const [future, setFuture] = useState<Design[]>([]);
  const [view, setView] = useState<View>(saved.view ?? "hall");
  const [tool, setTool] = useState<Tool>("inspect");
  const [block, setBlock] = useState("villager_librarian");
  const [hotbar, setHotbar] = useState<string[]>(saved.hotbar ?? DEFAULT_HOTBAR);
  const [overlays, setOverlays] = useState<Overlays>(saved.overlays ?? DEFAULT_OVERLAYS);
  const [reach, setReach] = useState(saved.reach ?? 1);
  const [selected, setSelected] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const [tab, setTab] = useState<Tab>("checks");
  const [dialog, setDialog] = useState<{ source?: VillagerSource } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const editor = useRef<EditorHandle>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const designRef = useRef(design);
  useEffect(() => {
    designRef.current = design;
  });
  const snapshot = useRef<Design | null>(null);

  const analysis = useMemo(() => analyze(design, reach), [design, reach]);

  useEffect(() => preloadTiles(), []);

  useEffect(() => {
    const t = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ design, reach, overlays, hotbar, view } satisfies Saved));
      } catch {
        // Storage full or blocked: designs still export as JSON.
      }
    }, 300);
    return () => clearTimeout(t);
  }, [design, reach, overlays, hotbar, view]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  /* History ------------------------------------------------------- */

  const beginEdit = useCallback(() => {
    snapshot.current = designRef.current;
  }, []);

  const endEdit = useCallback(() => {
    const before = snapshot.current;
    snapshot.current = null;
    // Read the committed design on the next frame so the last live edit has landed.
    requestAnimationFrame(() => {
      if (!before || before === designRef.current) return;
      setPast((p) => [...p.slice(-HISTORY_LIMIT + 1), before]);
      setFuture([]);
    });
  }, []);

  /** Replace the whole design as one undoable step. */
  const commit = useCallback((next: Design) => {
    const before = designRef.current;
    if (next === before) return;
    setPast((p) => [...p.slice(-HISTORY_LIMIT + 1), before]);
    setFuture([]);
    setDesign(next);
    // Update now so a second change in the same tick builds on this one.
    designRef.current = next;
  }, []);

  const undo = useCallback(() => {
    if (!past.length) return;
    setFuture((f) => [designRef.current, ...f]);
    setDesign(past[past.length - 1]);
    setPast((p) => p.slice(0, -1));
  }, [past]);

  const redo = useCallback(() => {
    if (!future.length) return;
    setPast((p) => [...p, designRef.current]);
    setDesign(future[0]);
    setFuture((f) => f.slice(1));
  }, [future]);

  /* Editing ------------------------------------------------------- */

  const chooseBlock = useCallback((id: string) => {
    setBlock(id);
    setHotbar((h) => (h.includes(id) ? h : [id, ...h.slice(0, 8)]));
    setTool((t) => (t === "picker" || t === "inspect" ? "pencil" : t));
  }, []);

  const apply = useCallback((cells: number[], erase: boolean) => setDesign((d) => applyCells(d, cells, block, erase)), [block]);

  const pick = useCallback(
    (cell: number) => {
      const d = designRef.current;
      const id = d.obj[cell] ?? d.floor[cell];
      if (id) chooseBlock(id);
    },
    [chooseBlock],
  );

  const select = useCallback((cell: number | null) => {
    setSelected(cell);
    if (cell !== null) setTab("selected");
  }, []);

  const jumpTo = useCallback(
    (cell: number) => {
      setView("hall");
      select(cell);
      setTool("inspect");
      editor.current?.centerOn(cell);
    },
    [select],
  );

  const setCell = (layer: "floor" | "obj", cell: number, id: string | null) => {
    const d = designRef.current;
    const current = d[layer][cell];
    if (current === id) return;
    commit(id === null ? applyCells(d, [cell], current!, true) : applyCells(d, [cell], id, false));
  };

  const newDesign = (d: Design) => {
    commit(d);
    setSelected(null);
    setDialog(null);
    setView("hall");
    editor.current?.fit();
  };

  const toggleWish = (key: string) => {
    const d = designRef.current;
    const has = d.wishlist.some((w) => w.key === key);
    commit({ ...d, wishlist: has ? d.wishlist.filter((w) => w.key !== key) : [...d.wishlist, { key }] });
  };

  const setEdition = (edition: Edition) => {
    if (edition === designRef.current.edition) return;
    commit({ ...designRef.current, edition });
    setToast(`Showing ${edition === "java" ? "Java" : "Bedrock"} Edition trades`);
  };

  /* Import / export ----------------------------------------------- */

  const exportJSON = () => {
    const blob = new Blob([JSON.stringify(design, null, 1)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    download(`${slug(design.name)}.json`, url);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const exportPNG = () => {
    const png = editor.current?.toPNG(2, overlays.grid);
    if (png) download(`${slug(design.name)}.png`, png);
  };

  const importFile = async (file: File) => {
    try {
      const parsed = parseDesign(JSON.parse(await file.text()));
      if (!parsed) throw new Error("bad");
      newDesign(parsed);
      setToast(`Imported ${parsed.name}`);
    } catch {
      setToast("That file isn’t a saved hall. Choose a .json file saved from this app.");
    }
  };

  /* Keyboard ------------------------------------------------------ */

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, dialog[open]")) return;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (mod && k === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && k === "y") {
        e.preventDefault();
        redo();
        return;
      }
      if (mod || e.altKey || view !== "hall") return;
      const toolKey = TOOLS.find((tl) => tl.key.toLowerCase() === k);
      if (toolKey) setTool(toolKey.id);
      else if (k === "g") setOverlays((o) => ({ ...o, grid: !o.grid }));
      else if (k === "0") editor.current?.fit();
      else if (k === "=" || k === "+") editor.current?.zoomBy(1.25);
      else if (k === "-") editor.current?.zoomBy(0.8);
      else if (k === "escape") setSelected(null);
      else if (/^[1-9]$/.test(k)) {
        const id = hotbar[Number(k) - 1];
        if (id) chooseBlock(id);
      } else if ((k === "delete" || k === "backspace") && selected !== null) {
        const d = designRef.current;
        const id = d.obj[selected] ?? d.floor[selected];
        if (id) commit(applyCells(d, [selected], id, true));
      } else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo, hotbar, chooseBlock, selected, commit, view]);

  /* Render -------------------------------------------------------- */

  const sel = selected !== null && selected < design.obj.length ? selected : null;
  const selectedVillager = sel !== null && getBlock(design.obj[sel])?.kind === "villager" ? sel : null;
  const hoverInfo = hover !== null ? { xy: xy(design, hover), obj: getBlock(design.obj[hover]), floor: getBlock(design.floor[hover]) } : null;
  const problems = analysis.issues.filter((i) => i.level !== "info").length;
  const stillNeeded = [...analysis.wishStatus.values()].filter((s) => s !== "secured").length;
  const metaLive = (fn: (m: VillagerMeta) => VillagerMeta) => selectedVillager !== null && setDesign((d) => updateVillager(d, selectedVillager, fn));
  const metaCommit = (fn: (m: VillagerMeta) => VillagerMeta) => selectedVillager !== null && commit(updateVillager(designRef.current, selectedVillager, fn));

  return (
    <div className="flex min-h-full flex-col lg:h-full">
      <header className="gui relative z-10 flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          <TileIcon id="villager_librarian" size={30} />
          <h1 className="font-pixel text-xl leading-none whitespace-nowrap">Trading Hall Designer</h1>
        </div>

        <nav className="flex gap-1.5" aria-label="View">
          <button type="button" className="btn px-3.5 py-1.5 text-sm" data-active={view === "hall"} aria-pressed={view === "hall"} onClick={() => setView("hall")}>
            Hall plan
          </button>
          <button type="button" className="btn flex items-center gap-2 px-3.5 py-1.5 text-sm" data-active={view === "trades"} aria-pressed={view === "trades"} onClick={() => setView("trades")}>
            Trades & wishlist
            {stillNeeded > 0 && (
              <span className="bg-enchant px-1.5 text-xs leading-5 text-white" title={`${stillNeeded} wanted trades not secured yet`}>
                {stillNeeded}
              </span>
            )}
          </button>
        </nav>

        <div className="flex items-center gap-1.5 text-sm" role="radiogroup" aria-label="Edition">
          {EDITIONS.map((e) => (
            <button key={e.id} type="button" role="radio" aria-checked={design.edition === e.id} className="btn px-2.5 py-1 text-xs" data-active={design.edition === e.id} onClick={() => setEdition(e.id)}>
              {e.name}
            </button>
          ))}
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <IconButton label="Undo (Ctrl+Z)" onClick={undo} disabled={!past.length}>
            <path d="M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3" />
          </IconButton>
          <IconButton label="Redo (Ctrl+Y)" onClick={redo} disabled={!future.length}>
            <path d="M15 14l5-5-5-5M20 9H10a6 6 0 000 12h3" />
          </IconButton>
          <span className="mx-1 h-6 w-0.5 bg-gui-deep" />
          <button type="button" className="btn px-3 py-1.5 text-sm" onClick={() => fileInput.current?.click()}>
            Open
          </button>
          <button type="button" className="btn px-3 py-1.5 text-sm" onClick={exportJSON} title="Download this hall as a .json file">
            Save
          </button>
          <button type="button" className="btn px-3 py-1.5 text-sm" onClick={exportPNG} title="Download the plan as an image">
            Export image
          </button>
          <button type="button" className="btn btn-emerald px-3.5 py-1.5 text-sm" onClick={() => setDialog({})}>
            New hall
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importFile(f);
              e.target.value = "";
            }}
          />
        </div>
      </header>

      {view === "trades" && (
        <TradesView
          design={design}
          analysis={analysis}
          onToggleWish={toggleWish}
          onClearWish={() => commit({ ...designRef.current, wishlist: [] })}
          onBuild={() => setDialog({ source: "wishlist" })}
          onJump={jumpTo}
        />
      )}

      {/* Kept mounted while hidden so the canvas keeps its zoom and position. */}
      <div className={`flex-col lg:min-h-0 lg:flex-1 lg:flex-row ${view === "hall" ? "flex" : "hidden"}`}>
        <aside className="gui order-2 flex h-72 min-h-0 flex-col lg:order-none lg:h-auto lg:w-60">
          <Palette selected={block} onSelect={chooseBlock} />
        </aside>

        <main className="relative order-1 h-[65vh] min-h-96 min-w-0 shrink-0 bg-world lg:order-none lg:h-auto lg:min-h-0 lg:flex-1 lg:shrink">
          <EditorCanvas
            ref={editor}
            design={design}
            analysis={analysis}
            tool={tool}
            block={block}
            overlays={overlays}
            selected={sel}
            onBeginEdit={beginEdit}
            onEndEdit={endEdit}
            onApply={apply}
            onPick={pick}
            onSelect={select}
            onMove={(from, to, layer) => {
              commit(moveCell(designRef.current, from, to, layer));
              select(to);
            }}
            onHover={setHover}
            onZoom={setZoom}
          />

          <div className="pointer-events-none absolute inset-x-3 top-3 flex flex-wrap items-start justify-between gap-3">
            <div className="gui-float pointer-events-auto flex gap-1 p-1.5" role="toolbar" aria-label="Tools">
              {TOOLS.map((t) => (
                <IconButton key={t.id} label={`${t.name} (${t.key})`} active={tool === t.id} onClick={() => setTool(t.id)}>
                  {t.icon}
                </IconButton>
              ))}
            </div>
            <div className="gui-float pointer-events-auto flex flex-wrap gap-1 p-1.5" aria-label="Show on the plan">
              {OVERLAY_LABELS.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  className="btn px-2.5 py-1 text-xs"
                  data-active={overlays[o.id]}
                  aria-pressed={overlays[o.id]}
                  onClick={() => setOverlays((s) => ({ ...s, [o.id]: !s[o.id] }))}
                  title={o.key ? `${o.name} (${o.key})` : o.name}
                >
                  {o.name}
                </button>
              ))}
            </div>
          </div>

          {/* Hotbar, as in game: the selected slot gets a white frame. */}
          <div className="pointer-events-none absolute inset-x-0 bottom-11 flex justify-center px-3">
            <div className="pointer-events-auto flex bg-black/55 p-0.5 shadow-[0_0_0_2px_#000]">
              {hotbar.map((id, n) => (
                <button
                  key={`${id}-${n}`}
                  type="button"
                  className={`relative flex size-10 items-center justify-center sm:size-11 ${id === block ? "z-10 shadow-[0_0_0_3px_#fff,0_0_0_5px_#000]" : "shadow-[inset_0_0_0_2px_#2c2c2c]"} bg-[#8b8b8b]/40`}
                  onClick={() => chooseBlock(id)}
                  title={`${getBlock(id)?.name} (${n + 1})`}
                  aria-label={`${getBlock(id)?.name}, hotbar slot ${n + 1}`}
                  aria-pressed={id === block}
                >
                  <TileIcon id={id} size={28} />
                  <span className="absolute right-0.5 bottom-0 font-pixel text-[11px] text-white [text-shadow:1px_1px_0_#3f3f3f]">{n + 1}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="gui absolute inset-x-0 bottom-0 flex h-9 items-center gap-4 px-3 text-xs">
            <span className="w-24 shrink-0 font-medium tabular-nums">{hoverInfo ? `X ${hoverInfo.xy[0]}, Z ${hoverInfo.xy[1]}` : `${design.width} × ${design.height}`}</span>
            <span className="min-w-0 flex-1 truncate text-ink-soft">
              {hoverInfo ? (
                [hoverInfo.obj?.kind === "villager" && hover !== null ? villagerName(design, hover) : hoverInfo.obj?.name, hoverInfo.floor ? `on ${hoverInfo.floor.name.toLowerCase()}` : hoverInfo.obj ? "on nothing" : "Empty"]
                  .filter(Boolean)
                  .join(" ")
              ) : (
                <>
                  {tool === "inspect"
                    ? "Click to select. Drag a villager or block to move it; drop it on another to swap them."
                    : "Left-click places, right-click erases."}{" "}
                  Hold Space and drag to pan, scroll to zoom.
                </>
              )}
            </span>
            <button type="button" className="btn flex size-6 items-center justify-center" onClick={() => editor.current?.zoomBy(0.8)} aria-label="Zoom out">
              −
            </button>
            <button type="button" className="w-11 text-center tabular-nums hover:underline" onClick={() => editor.current?.fit()} title="Fit to screen (0)">
              {Math.round(zoom * 100)}%
            </button>
            <button type="button" className="btn flex size-6 items-center justify-center" onClick={() => editor.current?.zoomBy(1.25)} aria-label="Zoom in">
              +
            </button>
          </div>
        </main>

        <aside className="gui order-3 flex min-h-0 flex-col lg:w-[22rem]">
          <div className="flex gap-1 border-b-2 border-gui-deep px-3 pt-3" role="tablist">
            {(
              [
                ["selected", selectedVillager !== null ? "Villager" : "Selected"],
                ["checks", "Checks"],
                ["materials", "Materials"],
                ["hall", "Hall"],
              ] as const
            ).map(([id, name]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                className={`relative -mb-0.5 flex items-center gap-1.5 border-2 border-b-0 px-2.5 py-1.5 text-sm ${tab === id ? "border-gui-deep bg-gui font-semibold" : "border-transparent text-ink-soft hover:text-ink"}`}
                onClick={() => setTab(id)}
              >
                {name}
                {id === "checks" && problems > 0 && <span className="bg-redstone px-1 text-[11px] leading-4 text-white">{problems}</span>}
              </button>
            ))}
          </div>
          <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
            {tab === "selected" &&
              (selectedVillager !== null ? (
                <VillagerPanel
                  key={selectedVillager}
                  design={design}
                  analysis={analysis}
                  cell={selectedVillager}
                  onMeta={metaLive}
                  onMetaCommit={metaCommit}
                  onFieldFocus={beginEdit}
                  onFieldBlur={endEdit}
                  onProfession={(prof) => setCell("obj", selectedVillager, `villager_${prof}`)}
                  onSelect={jumpTo}
                />
              ) : (
                <CellPanel
                  design={design}
                  analysis={analysis}
                  selected={sel}
                  onSetObject={(c, id) => setCell("obj", c, id)}
                  onSetFloor={(c, id) => setCell("floor", c, id)}
                  onSelect={jumpTo}
                />
              ))}
            {tab === "checks" && <ChecksPanel design={design} analysis={analysis} onSelect={jumpTo} onOpenTrades={() => setView("trades")} />}
            {tab === "materials" && <MaterialsPanel analysis={analysis} onCopied={() => setToast("Copied the materials list")} />}
            {tab === "hall" && (
              <HallPanel
                design={design}
                reach={reach}
                onReach={setReach}
                onOneTrade={(on) => commit({ ...designRef.current, oneTradePerVillager: on })}
                onRename={(name) => setDesign((d) => ({ ...d, name }))}
                onResize={(w, h) => commit(resizeDesign(designRef.current, w, h))}
              />
            )}
          </div>
        </aside>
      </div>

      {dialog && (
        <NewHallDialog edition={design.edition} wishlist={design.wishlist} initialSource={dialog.source} oneTradePerVillager={design.oneTradePerVillager} onClose={() => setDialog(null)} onCreate={newDesign} />
      )}

      {toast && (
        <div role="status" className="gui-float fixed bottom-16 left-1/2 z-50 -translate-x-1/2 px-4 py-2 text-sm">
          {toast}
        </div>
      )}
    </div>
  );
}

function IconButton({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick(): void;
  children: React.ReactNode;
}) {
  return (
    <button type="button" className="btn flex size-8 items-center justify-center" data-active={active} aria-pressed={active} disabled={disabled} onClick={onClick} title={label} aria-label={label}>
      <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="square" strokeLinejoin="miter">
        {children}
      </svg>
    </button>
  );
}
