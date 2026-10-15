"use client";

import Link from "next/link";
import { ChevronDown, FileText, RotateCw, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { useLanguage } from "@/components/language-provider";
import { WorkspaceComposer } from "./workspace-composer";
import { FlowBackground } from "./flow-background";
import type { WorkspaceNote } from "./workspace-types";
import { normalizeCloudNote, type CloudNoteRecord } from "@/lib/cloud-note-normalizer";
import { summarizeCardDescription } from "@/lib/note-card-summary";

const API_BASE = process.env.NEXT_PUBLIC_NOTES_API_BASE?.trim().replace(/\/+$/, "") || "";

export function HomeWorkspace({ publicNotes }: { publicNotes: WorkspaceNote[] }) {
  const { session, isReady } = useAuth();
  const { t, locale } = useLanguage();
  const [cloudNotes, setCloudNotes] = useState<WorkspaceNote[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("");
  const [visibleCount, setVisibleCount] = useState(6);
  const [view, setView] = useState<"grid" | "list">("grid");
  const token = session?.token || "";
  const signedInCloud = Boolean(API_BASE && token);

  useEffect(() => {
    setCloudNotes([]); setError("");
    if (!isReady || !API_BASE || !token) { setLoading(false); return; }
    const controller = new AbortController();
    setLoading(true);
    (async () => {
      try {
        const response = await fetch(`${API_BASE}/notes?limit=200&include_content=1`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: controller.signal });
        const json = await response.json();
        if (!response.ok || !json.success || !Array.isArray(json.notes)) throw new Error("Could not load notes. Please retry.");
        const notes = json.notes.map((row: CloudNoteRecord) => {
          const note = normalizeCloudNote(row);
          return { slug: note.slug, href: `/notes/cloud?slug=${encodeURIComponent(note.slug)}`, title: note.zhTitle, englishTitle: note.enTitle, description: note.descriptionZh, englishDescription: note.descriptionEn, topic: note.topicZh, englishTopic: note.topicEn, tags: note.tags };
        }).filter((note: WorkspaceNote) => note.slug);
        if (!controller.signal.aborted) setCloudNotes(notes);
      } catch { if (!controller.signal.aborted) setError("load"); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    })();
    return () => controller.abort();
  }, [isReady, token, revision]);

  const notes = signedInCloud ? cloudNotes : publicNotes;
  const topics = useMemo(() => Array.from(new Set(notes.map((note) => note.topic).filter(Boolean))), [notes]);
  const filtered = useMemo(() => notes.filter((note) => (!filter || note.topic === filter) && [note.title, note.englishTitle, note.description, note.englishDescription, note.topic, note.englishTopic, ...note.tags].join(" ").toLowerCase().includes(search.trim().toLowerCase())), [notes, search, filter]);
  useEffect(() => { setVisibleCount(6); }, [search, filter]);
  const topicLabel = (topic: string) => locale === "en" ? notes.find((note) => note.topic === topic)?.englishTopic || topic : topic;
  const titleOf = (note: WorkspaceNote) => locale === "en" ? note.englishTitle || note.title : note.title;

  return <div className="note-home">
    <section className="research-hero" aria-labelledby="hero-title">
      <FlowBackground />
      <div className="hero-content">
        <h1 id="hero-title" className="hero-brand-title">YYnotes</h1>
        <p className="hero-description">{t("将文档、课程与研究资料整理为双语笔记。", "Generate bilingual notes from documents, lectures, and research.")}</p>
      </div>
      <a className="hero-browse" href="#generate" aria-label={t("前往生成笔记", "Go to note generation")}><ChevronDown size={22} aria-hidden="true" /></a>
    </section>

    <section id="generate" className="home-generation" aria-labelledby="generation-title">
      <div className="generation-content">
        <h2 id="generation-title">{t("生成笔记", "Generate notes")}</h2>
        <WorkspaceComposer onGenerated={() => setRevision((value) => value + 1)} />
      </div>
    </section>

    <section id="library" className="workspace-library home-library" aria-labelledby="library-title">
      <div className="library-heading"><h2 id="library-title">{signedInCloud ? t("我的笔记", "Your notes") : t("示例笔记", "Example notes")}</h2><Link href="/notes" className="text-action">{signedInCloud ? t("管理笔记", "Manage notes") : t("打开笔记库", "Open library")}</Link></div>
      <div className="library-tools"><div className="library-filters" aria-label={t("按主题筛选", "Filter by topic")}><button type="button" aria-pressed={!filter} onClick={() => setFilter("")}>{t("全部", "All")}</button>{topics.slice(0, 4).map((topic) => <button key={topic} type="button" aria-pressed={filter === topic} onClick={() => setFilter(topic)}>{topicLabel(topic)}</button>)}</div><div className="library-search"><Search size={16} /><label className="sr-only" htmlFor="home-note-search">{t("搜索笔记", "Search notes")}</label><input id="home-note-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("搜索笔记", "Search notes")} /><button type="button" className="view-toggle" aria-label={view === "grid" ? t("列表视图", "List view") : t("网格视图", "Grid view")} onClick={() => setView(view === "grid" ? "list" : "grid")}><span className={view === "grid" ? "grid-mark" : "list-mark"} /></button></div></div>
      {loading ? <div className="note-grid" role="status" aria-label={t("正在加载笔记", "Loading notes")}>{[0, 1, 2].map((i) => <div key={i} className="note-skeleton"><span /><span /><span /></div>)}</div>
        : error ? <div className="library-empty" role="alert"><p>{t("笔记加载失败，请重试。", "Could not load notes. Please retry.")}</p><button type="button" className="text-action" onClick={() => setRevision((value) => value + 1)}><RotateCw size={16} />{t("重试", "Retry")}</button></div>
        : filtered.length ? <div className={`note-grid ${view === "list" ? "note-list" : ""}`}>{filtered.slice(0, visibleCount).map((note) => <Link className="workspace-note" key={note.slug} href={note.href}><div className="note-card-top"><span><FileText size={16} />{topicLabel(note.topic)}</span></div><h3>{titleOf(note)}</h3><p>{summarizeCardDescription(locale === "en" ? note.englishDescription || note.description : note.description, locale, titleOf(note))}</p></Link>)}</div>
        : <div className="library-empty"><h3>{notes.length ? t("未找到匹配笔记", "No matching notes") : t("暂无笔记", "No notes yet")}</h3>{notes.length ? <button type="button" className="text-action" onClick={() => { setSearch(""); setFilter(""); }}>{t("清除筛选", "Clear filters")}</button> : <a href="#create" className="text-action">{t("生成笔记", "Generate notes")}</a>}</div>}
      {filtered.length > visibleCount && <button type="button" className="show-more" onClick={() => setVisibleCount((value) => value + 6)}>{t("加载更多", "Load more")}</button>}
    </section>
  </div>;
}
