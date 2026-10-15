"use client";

import * as Dialog from "@radix-ui/react-dialog";
import Link from "next/link";
import { FileText, LoaderCircle, Plus, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useLanguage } from "@/components/language-provider";
import { useAuth } from "@/components/auth/auth-provider";
import type { WorkspaceNote } from "@/components/home/workspace-types";
import { normalizeCloudNote, type CloudNoteRecord } from "@/lib/cloud-note-normalizer";

const API_BASE = process.env.NEXT_PUBLIC_NOTES_API_BASE?.trim().replace(/\/+$/, "") || "";

export function CommandSearch({ publicNotes }: { publicNotes: WorkspaceNote[] }) {
  const { t, locale } = useLanguage();
  const { session } = useAuth();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [notes, setNotes] = useState<WorkspaceNote[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const token = session?.token || "";
  const personal = Boolean(API_BASE && token);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setOpen((value) => !value); }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    setQuery("");
  }, [open]);

  useEffect(() => {
    setNotes([]); setError("");
    if (!open || !personal) { setLoading(false); return; }
    const controller = new AbortController();
    setLoading(true);
    (async () => {
      try {
        const response = await fetch(`${API_BASE}/notes?limit=200`, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal });
        const json = await response.json();
        if (!response.ok || !json.success || !Array.isArray(json.notes)) throw new Error(t("笔记搜索暂时不可用。","Search is unavailable."));
        if (!controller.signal.aborted) setNotes(json.notes.map((row: CloudNoteRecord) => {
          const note = normalizeCloudNote(row);
          return { slug: note.slug, href: `/notes/cloud?slug=${encodeURIComponent(note.slug)}`, title: note.zhTitle, englishTitle: note.enTitle, topic: note.topicZh, englishTopic: note.topicEn, description: note.descriptionZh, tags: note.tags };
        }));
      } catch { if (!controller.signal.aborted) setError(t("笔记搜索暂时不可用，请重新加载。","Search is unavailable. Please retry.")); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    })();
    return () => controller.abort();
  }, [open, personal, token, retry, t]);

  const results = useMemo(() => (personal ? notes : publicNotes).filter((note) => [note.title, note.englishTitle, note.topic, ...note.tags].join(" ").toLowerCase().includes(query.trim().toLowerCase())).slice(0, 12), [personal, notes, publicNotes, query]);

  return <Dialog.Root open={open} onOpenChange={setOpen}>
    <Dialog.Trigger asChild><button type="button" className="header-search" aria-label={t("搜索笔记","Search notes")}><Search size={17} /><span>{t("搜索笔记","Search notes")}</span><kbd>Ctrl K</kbd></button></Dialog.Trigger>
    <Dialog.Portal><Dialog.Overlay className="search-overlay" /><Dialog.Content className="search-dialog">
      <Dialog.Title className="sr-only">{t("搜索笔记与快捷操作","Search notes and actions")}</Dialog.Title><Dialog.Description className="sr-only">{t("输入标题或主题，按 Tab 选择结果，按 Enter 打开，按 Escape 关闭。","Search by title or topic. Use Tab to select, Enter to open, Escape to close.")}</Dialog.Description>
      <div className="search-dialog-input"><Search size={20} /><label htmlFor="global-note-search" className="sr-only">{t("搜索标题或主题","Search titles or topics")}</label><input id="global-note-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("想找哪一篇笔记？","Search notes…")} autoComplete="off" /><Dialog.Close asChild><button aria-label={t("关闭搜索","Close search")} type="button"><X size={18} /></button></Dialog.Close></div>
      <div className="search-dialog-results"><Link href="/#create" onClick={() => setOpen(false)} className="search-result"><Plus size={18} /><span>{t("开始一篇新笔记","Generate a note")}<small>{t("粘贴文字或上传资料","Paste text or attach a file")}</small></span></Link>
        <p className="search-group-label">{personal ? t("我的笔记","Your notes") : t("公开示例","Example notes")}</p>
        {loading ? <p className="search-status" role="status"><LoaderCircle className="spin" size={16} />{t("正在加载笔记…","Loading notes…")}</p> : error ? <div className="search-status" role="alert">{error}<button type="button" className="text-action" onClick={() => setRetry((value) => value + 1)}>{t("重试","Retry")}</button></div> : results.length ? results.map((note) => <Link className="search-result" key={note.slug} href={note.href} onClick={() => setOpen(false)}><FileText size={18} /><span>{locale === "en" ? note.englishTitle || note.title : note.title}<small>{locale === "en" ? note.englishTopic || note.topic : note.topic}</small></span></Link>) : <p className="search-status">{t("没有匹配的笔记，试试其他关键词。","No matching notes. Try another search.")}</p>}
      </div><div className="search-dialog-footer"><span>{t("Tab 选择 · Enter 打开","Tab to select · Enter to open")}</span><span>{t("Esc 关闭","Esc to close")}</span></div>
    </Dialog.Content></Dialog.Portal>
  </Dialog.Root>;
}
