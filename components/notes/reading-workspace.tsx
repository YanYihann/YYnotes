"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { NoteAssistantPanel } from "@/components/ai";
import { TableOfContents } from "@/components/toc";
import type { Heading } from "@/lib/content";

type ReadingWorkspaceProps = {
  headings: Heading[];
  noteContext: {
    slug: string;
    weekLabelZh: string;
    weekLabelEn: string;
    zhTitle: string;
    enTitle: string;
    noteContent: string;
  };
  children: React.ReactNode;
};

const MIN_AI_WIDTH = 380;
const DEFAULT_AI_WIDTH = 420;
const MAX_AI_WIDTH = 860;

export function ReadingWorkspace({ headings, noteContext, children }: ReadingWorkspaceProps) {
  const [tocCollapsed, setTocCollapsed] = useState(true);
  const [aiWidth, setAiWidth] = useState(DEFAULT_AI_WIDTH);
  const [dragging, setDragging] = useState(false);

  const desktopGridRef = useRef<HTMLDivElement>(null);

  const desktopGridTemplate = useMemo(() => {
    if (tocCollapsed) {
      return `minmax(0, 1fr) ${aiWidth}px`;
    }
    return `180px minmax(0, 1fr) ${aiWidth}px`;
  }, [aiWidth, tocCollapsed]);

  useEffect(() => {
    if (!dragging) {
      return;
    }

    const onMouseMove = (event: MouseEvent) => {
      if (!desktopGridRef.current) {
        return;
      }

      const rect = desktopGridRef.current.getBoundingClientRect();
      const relativeAiWidth = rect.right - event.clientX;
      const maxByContainer = Math.min(MAX_AI_WIDTH, rect.width * 0.62);
      const nextWidth = Math.max(MIN_AI_WIDTH, Math.min(relativeAiWidth, maxByContainer));
      setAiWidth(Math.round(nextWidth));
    };

    const onMouseUp = () => {
      setDragging(false);
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    document.body.style.userSelect = "none";

    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.body.style.userSelect = "";
    };
  }, [dragging]);

  return (
    <>
      <div className="mx-auto w-full max-w-[1720px] px-4 sm:px-6 lg:hidden">
        {children}
        <NoteAssistantPanel noteContext={noteContext} />
      </div>

      <div className="mx-auto hidden w-full max-w-[1720px] px-4 sm:px-6 lg:block">
        <div className="mb-3 flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => setTocCollapsed((value) => !value)}
            className="inline-flex items-center rounded-capsule border border-border px-3 py-1.5 font-text text-[12px] tracking-tightCaption text-muted-foreground transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {tocCollapsed ? "展开目录" : "折叠目录"}
            <span className="ui-en ml-1">{tocCollapsed ? "Show TOC" : "Hide TOC"}</span>
          </button>

          <div className="flex items-center gap-3 rounded-capsule border border-border bg-card px-3 py-1">
            <label htmlFor="ai-width-slider" className="font-text text-[12px] tracking-tightCaption text-muted-foreground">
              AI宽度
              <span className="ui-en ml-1">AI Width</span>
            </label>
            <input
              id="ai-width-slider"
              type="range"
              min={MIN_AI_WIDTH}
              max={MAX_AI_WIDTH}
              step={10}
              value={aiWidth}
              onChange={(event) => setAiWidth(Number(event.target.value))}
              className="h-1 w-28 accent-primary"
            />
          </div>
        </div>

        <div ref={desktopGridRef} className="grid gap-6" style={{ gridTemplateColumns: desktopGridTemplate }}>
          {!tocCollapsed ? (
            <aside className="min-w-0">
              <TableOfContents items={headings} />
            </aside>
          ) : null}

          <div className="min-w-0">{children}</div>

          <div className="relative min-w-0">
            <button
              type="button"
              aria-label="Resize assistant width"
              onMouseDown={() => setDragging(true)}
              className="absolute -left-3 top-1/2 hidden h-14 w-2 -translate-y-1/2 cursor-col-resize rounded-capsule bg-border transition hover:bg-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring xl:block"
            />
            <NoteAssistantPanel noteContext={noteContext} />
          </div>
        </div>
      </div>
    </>
  );
}
