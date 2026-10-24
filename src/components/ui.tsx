"use client";

import { categoryInfo, LEVEL_NAMES, priceText, type TradeOption } from "@/lib/trades";

/** 8×8 pixel emerald. */
export function Emerald({ size = 14, className = "" }: { size?: number; className?: string }) {
  const px: [number, number, string][] = [];
  const rows = ["...dd...", "..dlld..", ".dllmmd.", "dlmmmmed", "dmmmmeed", ".dmmeed.", "..deed..", "...dd..."];
  const colours: Record<string, string> = { d: "#0b5a2b", l: "#8af0ac", m: "#17c45a", e: "#0e8f3f" };
  rows.forEach((r, y) => [...r].forEach((c, x) => c !== "." && px.push([x, y, colours[c]])));
  return (
    <svg viewBox="0 0 8 8" width={size} height={size} className={`shrink-0 ${className}`} shapeRendering="crispEdges" aria-hidden>
      {px.map(([x, y, c]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={c} />
      ))}
    </svg>
  );
}

/** Pixel right-arrow, the merchant screen's trade arrow. */
export function TradeArrow() {
  return (
    <svg viewBox="0 0 9 7" width={14} height={11} className="shrink-0" shapeRendering="crispEdges" aria-hidden>
      <path d="M0 2h5V0h1v1h1v1h1v1h1v1H8v1H7v1H6v1H5V5H0z" fill="#5a5a5a" />
    </svg>
  );
}

export function levelRange(levels: number[]) {
  if (!levels.length) return "";
  const names = levels.map((l) => LEVEL_NAMES[l - 1]);
  if (levels.length > 2 && levels[levels.length - 1] - levels[0] === levels.length - 1) return `${names[0]} to ${names[names.length - 1]}`;
  return names.join(" or ");
}

/** Cost side and result side of a trade, as the merchant screen shows it. */
export function TradeTerms({ o, price }: { o: TradeOption; price?: number }) {
  const emeraldText = price ? `${price}` : priceText(o.emeralds);
  const cost =
    o.kind === "sell" ? (
      <span className="flex items-center gap-1 whitespace-nowrap">
        <Emerald />
        <span className={price ? "font-semibold" : ""}>{emeraldText}</span>
        {o.extra && <span className="text-ink-soft">+ {o.extra}</span>}
      </span>
    ) : (
      <span className="whitespace-nowrap">
        {o.count} {o.item}
      </span>
    );
  const result =
    o.kind === "sell" ? (
      <span className={`min-w-0 truncate font-medium ${o.enchant ? "glint" : ""}`}>
        {o.count > 1 && `${o.count} `}
        {o.label}
        {o.enchanted && <span className="glint"> (enchanted)</span>}
      </span>
    ) : (
      <span className="flex items-center gap-1 font-medium whitespace-nowrap">
        <Emerald />
        {emeraldText}
      </span>
    );
  return (
    <span className="flex min-w-0 items-center gap-2 text-sm">
      <span className="w-[7.5rem] shrink-0">{cost}</span>
      <TradeArrow />
      {result}
    </span>
  );
}

export function CategoryDot({ category }: { category: TradeOption["category"] }) {
  return <span className="inline-block size-2 shrink-0" style={{ background: categoryInfo(category).colour }} aria-hidden />;
}

export function SectionHeading({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="mb-2.5 flex items-center justify-between gap-2">
      <h3 className="font-pixel text-[15px] leading-none text-ink">{children}</h3>
      {aside}
    </div>
  );
}

const REPO_URL = "https://github.com/BendyCabbage/Minecraft-Villager-Trading-Hall-Designer";

/** Required fan-project disclaimer plus the trade data credit. */
export function Credits({ className = "" }: { className?: string }) {
  return (
    <p className={`text-xs leading-relaxed text-ink-soft ${className}`}>
      Not an official Minecraft product. Not approved by or associated with Mojang or Microsoft. Trade data from the{" "}
      <a className="underline hover:text-ink" href="https://minecraft.wiki/w/Trading" target="_blank" rel="noreferrer">
        Minecraft Wiki
      </a>
      , licensed{" "}
      <a className="underline hover:text-ink" href="https://creativecommons.org/licenses/by-nc-sa/3.0/" target="_blank" rel="noreferrer">
        CC BY-NC-SA 3.0
      </a>
      .{" "}
      <a className="underline hover:text-ink" href={REPO_URL} target="_blank" rel="noreferrer">
        Source on GitHub
      </a>
      .
    </p>
  );
}
