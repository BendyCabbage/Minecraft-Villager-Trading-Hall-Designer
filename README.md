# Minecraft Villager Trading Hall Designer

A top-down planner for Minecraft villager trading halls, built with Next.js. Place villagers, job site blocks, walls and floors on a grid. The designer checks that every villager pairs with its own job site, flags villagers that can wander off and dark floor tiles where mobs can spawn, and builds the bill of materials.

## Getting started

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Features

- **Plan around the trades you need.** Mark trades as wanted on the Trades page and the wishlist tracks each one as still needed, being rolled for, or secured. "Build a hall from this list" works out how many villagers of each profession you need. With **one wanted trade per villager** on (the default, in the Hall tab and the New hall dialog), every trade gets its own villager and each villager is rolled for one trade at a time. With it off, librarians still get one book each, and other professions get one villager per two wanted trades at the same level.
- **Villagers with names and trades.** Name any villager; the name defaults to its profession. Record the exact trades it has, with the emerald price you locked in, and the trades you're rerolling it for.
- **Trade catalogue** for Java 1.21 and Bedrock, switchable per hall. Filter by category, profession, villager level and trade direction, or show only what this hall offers or what the wishlist still needs.
- **Hall templates:** row, double row, square and circle. Square and circle place the pods around the walls, facing an open middle. Templates add lights until no floor tile is dark.
- **Pixel-art plan** with floor and block layers, pencil, line, rectangles, fill, pick and inspect tools, and a hotbar.
- **Checks:** pairs villagers with job sites within a reach you choose, flags villagers that can wander off, unclaimed job sites and nitwits, and shows dark tiles where mobs can spawn.
- **Materials** list in stacks and shulker boxes.
- Undo/redo, autosave in the browser, open/save as JSON, export as PNG.

Trade data comes from the Minecraft Wiki, read 2026-10-23 (see `src/lib/trades-data.ts`).

## Shortcuts

| Key | Action |
| --- | --- |
| `B` `L` `R` `O` `F` `I` `V` | Pencil, line, rectangle, hollow rectangle, fill, pick, inspect |
| `1`–`9` | Hotbar slots |
| `G` | Toggle grid |
| `Space` + drag / middle-drag | Pan |
| Scroll, `+` / `-`, `0` | Zoom, fit to screen |
| `Ctrl+Z` / `Ctrl+Y` | Undo / redo |
| `Delete` | Clear the inspected cell |
| `Esc` | Deselect |

## Code layout

- `src/lib/blocks.ts`: block and profession registry
- `src/lib/tiles.ts`: procedural 16×16 pixel-art textures
- `src/lib/trades-data.ts`: villager trade pools and librarian enchantments per edition
- `src/lib/trades.ts`: trade lookup, keys and book prices
- `src/lib/design.ts`: design model, editing ops, analysis, import
- `src/lib/templates.ts`: hall layouts and wishlist planning
- `src/components/`: editor canvas, palette, side panels, dialog
