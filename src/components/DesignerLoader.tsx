"use client";

import dynamic from "next/dynamic";

// The designer is canvas- and localStorage-driven, so it renders only in the browser.
const Designer = dynamic(() => import("./Designer").then((m) => m.Designer), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center font-pixel text-lg text-muted">Loading trading hall…</div>
  ),
});

export function DesignerLoader() {
  return <Designer />;
}
