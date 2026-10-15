"use client";

import { BookOpen, List, Sparkles } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useLanguage } from "@/components/language-provider";
import { UiText } from "@/components/ui-text";
import { TableOfContents } from "@/components/toc";
import type { Heading } from "@/lib/content";

const NoteAssistantPanel = dynamic(() => import("@/components/ai/note-assistant-panel").then((module) => module.NoteAssistantPanel), {
  loading: () => <p className="workspace-loading" role="status"><UiText zh="正在打开学习助手…" en="Loading assistant…" /></p>,
});

type ReadingWorkspaceProps = {
  headings: Heading[];
  noteContext: { slug: string; weekLabelZh: string; weekLabelEn: string; zhTitle: string; enTitle: string; noteContent: string };
  children: React.ReactNode;
};
const MIN_WIDTH = 300;
const MAX_WIDTH = 560;

export function ReadingWorkspace({ headings, noteContext, children }: ReadingWorkspaceProps) {
  const { t, locale } = useLanguage();
  const [visibleHeadings, setVisibleHeadings] = useState<Heading[]>(headings);
  const [tocOpen, setTocOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantVisited, setAssistantVisited] = useState(false);
  const [aiWidth, setAiWidth] = useState(360);
  const [maxWidth, setMaxWidth] = useState(MAX_WIDTH);
  const grid = useRef<HTMLDivElement>(null);
  const resizeFrame = useRef(0);
  const dragging = useRef(false);

  useEffect(() => {
    const wide = window.matchMedia("(min-width: 1280px)").matches;
    setAssistantOpen(wide); setAssistantVisited(wide);
    return () => cancelAnimationFrame(resizeFrame.current);
  }, []);

  useEffect(() => {
    if (!grid.current) return;
    const observer = new ResizeObserver(([entry]) => {
      const available = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, entry.contentRect.width - (tocOpen ? 188 : 0) - 500 - 48));
      setMaxWidth(available); setAiWidth((current) => Math.min(current, available));
    });
    observer.observe(grid.current);
    return () => observer.disconnect();
  }, [tocOpen]);

  useEffect(() => {
    const root = grid.current?.querySelector(".note-prose");
    if (!root) return;
    const readHeadings = () => setVisibleHeadings(Array.from(root.querySelectorAll<HTMLHeadingElement>("h2[id], h3[id]")).map((element) => ({
      id: element.id,
      title: Array.from(element.childNodes).filter((node) => !(node instanceof Element && node.classList.contains("anchor-link"))).map((node) => node.textContent || "").join("").trim(),
      level: Number(element.tagName.slice(1)) as 2 | 3,
    })));
    readHeadings();
    const observer = new MutationObserver(readHeadings);
    observer.observe(root, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [locale, headings]);

  function resize(clientX: number) {
    cancelAnimationFrame(resizeFrame.current);
    resizeFrame.current = requestAnimationFrame(() => {
      if (grid.current) setAiWidth(Math.round(Math.max(MIN_WIDTH, Math.min(maxWidth, grid.current.getBoundingClientRect().right - clientX))));
    });
  }

  return <div className="reading-workspace">
    <div className="reading-toolbar"><button type="button" aria-pressed={tocOpen} aria-controls="reading-contents" onClick={() => setTocOpen((value) => !value)}><List size={16} />{tocOpen ? t("收起目录", "Hide contents") : t("本页目录", "Contents")}</button><label className="reading-width-control">{t("助手宽度", "Panel width")}<input type="range" min={MIN_WIDTH} max={maxWidth} step={10} value={aiWidth} onChange={(event) => setAiWidth(Number(event.target.value))} aria-label={t("调整学习助手宽度", "Adjust assistant width")} /></label>{!assistantOpen && <button type="button" aria-pressed={assistantOpen} aria-controls="reading-assistant" onClick={() => { setAssistantOpen((value) => !value); setAssistantVisited(true); }}><Sparkles size={16} />{t("学习助手", "Study assistant")}</button>}</div>
    <div ref={grid} className={`reading-grid ${tocOpen ? "has-toc" : ""} ${assistantOpen ? "has-assistant" : ""}`} style={{ "--assistant-width": `${aiWidth}px` } as CSSProperties}>
      <aside id="reading-contents" hidden={!tocOpen} className="reading-contents">{visibleHeadings.length ? <TableOfContents items={visibleHeadings} /> : <p className="reading-no-headings"><BookOpen size={18} />{t("这篇笔记没有章节目录。", "No headings in this note.")}</p>}</aside>
      <div className="reading-document">{children}</div>
      <aside id="reading-assistant" hidden={!assistantOpen} className="reading-assistant"><button className="assistant-resize" type="button" aria-label={t("调整助手宽度，使用左右方向键", "Resize assistant using left and right arrow keys")} onPointerDown={(event) => { dragging.current = true; event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={(event) => { if (dragging.current) resize(event.clientX); }} onPointerUp={() => { dragging.current = false; }} onPointerCancel={() => { dragging.current = false; }} onKeyDown={(event) => { if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); setAiWidth((value) => Math.max(MIN_WIDTH, Math.min(maxWidth, value + (event.key === "ArrowLeft" ? 20 : -20)))); } }} />{assistantVisited && <NoteAssistantPanel noteContext={noteContext} onClose={() => setAssistantOpen(false)} />}</aside>
    </div>
  </div>;
}
