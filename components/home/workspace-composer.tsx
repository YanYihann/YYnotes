"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { Check, ChevronDown, FileText, LoaderCircle, Paperclip, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { useLanguage } from "@/components/language-provider";
import { UiText } from "@/components/ui-text";
import type { GenerationError, GenerationPhase } from "@/lib/ai/note-generation-client";
import { MAX_GENERATION_SOURCE_CHARS } from "@/lib/ai/generation-limits";

const AdvancedGenerator = dynamic(() => import("./week-note-generator").then((m) => m.WeekNoteGenerator), {
  loading: () => <p className="workspace-loading" role="status"><UiText zh="正在加载生成工具…" en="Loading generation tools…" /></p>,
});
const DRAFT_KEY = "yynotes.composer-draft.v1";
const CLOUD_MODE = Boolean(process.env.NEXT_PUBLIC_NOTES_API_BASE?.trim());
const FILE_LIMIT_MB = process.env.NEXT_PUBLIC_NOTES_API_BASE?.startsWith("/") ? 4 : 20;
const intents = [
  { label: "课程", en: "Coursework", instruction: "按概念、原理与例子组织资料，保留重要细节。", instructionEn: "Organize concepts, principles, and examples. Preserve important details." },
  { label: "研究", en: "Research", instruction: "整理研究问题、方法、证据与局限，保留原文引用。", instructionEn: "Organize research questions, methods, evidence, and limitations. Preserve source citations." },
  { label: "复习", en: "Revision", instruction: "突出核心知识、常见误区与复习要点，并提供自测问题。", instructionEn: "Highlight key concepts, common errors, and revision points. Include self-assessment questions." },
  { label: "通用", en: "General", instruction: "根据资料组织内容，解释关键概念及其联系。", instructionEn: "Structure the source material and explain key concepts and their relationships." },
];

export function WorkspaceComposer({ onGenerated }: { onGenerated: () => void }) {
  const { t, locale } = useLanguage();
  const { isReady, session } = useAuth();
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [instruction, setInstruction] = useState("");
  const [intent, setIntent] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [model, setModel] = useState("deepseek-v3.2");
  const [advanced, setAdvanced] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [resultHref, setResultHref] = useState("");
  const [draftReady, setDraftReady] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [phase, setPhase] = useState<GenerationPhase>({ stage: "reading" });
  const [notice, setNotice] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const textInput = useRef<HTMLTextAreaElement>(null);
  const request = useRef<AbortController | null>(null);
  const submitting = useRef(false);
  const mounted = useRef(false);
  const phaseRef = useRef<GenerationPhase>({ stage: "reading" });
  const needsLogin = CLOUD_MODE && isReady && !session;

  function saveDraft() {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ text, title, instruction, intent, model })); } catch { /* Optional draft storage. */ }
  }

  useEffect(() => {
    mounted.current = true;
    try {
      const saved = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
      if (saved && typeof saved.text === "string") {
        setText(saved.text); setTitle(typeof saved.title === "string" ? saved.title : "");
        setInstruction(typeof saved.instruction === "string" ? saved.instruction : "");
        if (intents.some((item) => item.label === saved.intent)) setIntent(saved.intent);
        if (["deepseek-v3.2"].includes(saved.model)) setModel(saved.model);
      }
    } catch { /* An unavailable browser store does not prevent composing. */ }
    setDraftReady(true);
    return () => { mounted.current = false; request.current?.abort(); };
  }, []);

  useEffect(() => {
    if (!draftReady) return;
    const timer = window.setTimeout(() => {
      try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ text, title, instruction, intent, model })); } catch { /* Optional draft storage. */ }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [text, title, instruction, intent, model, draftReady]);

  function selectFile(next: File | null) {
    if (!next) return;
    if (/\.(doc|ppt)$/i.test(next.name)) { setError(t("请将旧版 DOC / PPT 另存为 DOCX / PPTX 后上传。", "Convert legacy DOC / PPT files to DOCX / PPTX before uploading.")); return; }
    if (!next.size) { setError(t("文件为空，请重新选择。", "This file is empty. Choose another file.")); return; }
    if (!/\.(txt|md|markdown|docx|pptx|pdf|tex|csv)$/i.test(next.name)) {
      setError(t("请选择 TXT、Markdown、Word、PPT、PDF、TeX 或 CSV 文件。", "Choose a TXT, Markdown, Word, PPT, PDF, TeX, or CSV file.")); return;
    }
    if (next.size > FILE_LIMIT_MB * 1024 * 1024) { setError(t(`文件超过 ${FILE_LIMIT_MB} MB，请拆分后上传。`, `File exceeds ${FILE_LIMIT_MB} MB. Split it before uploading.`)); return; }
    setFile(next); setError(""); setResultHref("");
  }

  async function generate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || resultHref) return;
    if (!file && !text.trim()) { setError(t("请输入资料或上传文件。", "Paste source material or upload a file.")); textInput.current?.focus(); return; }
    if (needsLogin || !isReady) return;
    submitting.current = true;
    const controller = new AbortController(); request.current = controller;
    const initialPhase: GenerationPhase = { stage: "reading" };
    phaseRef.current = initialPhase; setPhase(initialPhase);
    setBusy(true); setError(""); setResultHref(""); setNotice(""); setUncertain(false);
    try {
      const { generateWorkspaceNote } = await import("@/lib/ai/note-generation-client");
      controller.signal.throwIfAborted();
      const result = await generateWorkspaceNote({ file, text, instruction, title, model, authToken: session?.token || "", signal: controller.signal,
        onPhase: (next) => { if (mounted.current && !controller.signal.aborted) { phaseRef.current = next; setPhase(next); } },
      });
      controller.signal.throwIfAborted();
      if (!mounted.current) return;
      setResultHref(CLOUD_MODE ? `/notes/cloud?slug=${encodeURIComponent(result.slug)}` : `/notes/${encodeURIComponent(result.slug)}`);
      onGenerated();
    } catch (cause) {
      if (!mounted.current) return;
      if (controller.signal.aborted) {
        const sent = phaseRef.current.stage === "generating";
        setUncertain(sent);
        setNotice(sent ? t("已停止等待，服务器仍可能完成保存。重新生成前请先检查笔记库。", "Stopped waiting. The server may still save the note. Check your library before generating again.") : t("已取消资料处理，输入内容已保留。", "Preparation cancelled. Your source material has been retained."));
      } else {
        const failure = cause as GenerationError;
        const messages: Record<string, string> = {
          empty_source: "未找到可读取的资料，请检查输入或文件。", source_too_long: "资料超过 35,000 字符，请拆分后生成，避免内容被截断。",
          pdf_scan: "PDF 没有可读取的文字，请先进行 OCR 或上传文本文件。", unreadable_file: "文件读取失败，请检查文件是否有效、是否加密。",
          unsupported_file: "请上传 TXT、Markdown、DOCX、PPTX、PDF、TeX 或 CSV。", prompt_load: "无法读取生成规则，请重试。",
          request_too_large: "提交内容过大，请缩减资料或自定义 Prompt。", unauthenticated: "请重新登录后生成笔记。", rate_limit: "生成服务繁忙，请稍后重试。",
          timeout: "生成等待超时，重新提交前请先检查笔记库。", network: "连接中断，重新提交前请先检查笔记库。", invalid_result: "无法确认生成结果，重新提交前请先检查笔记库。",
        };
        setUncertain(Boolean(failure?.uncertain));
        setError(cause instanceof Error ? t(messages[failure.code] || "生成失败，资料已保留。", cause.message) : t("生成失败，资料已保留。", "Generation failed. Your source material has been retained."));
      }
    } finally {
      if (request.current === controller) { submitting.current = false; request.current = null; if (mounted.current) setBusy(false); }
    }
  }

  const statusLabel = phase.stage === "reading"
    ? phase.total ? t(`正在读取资料 ${phase.current}/${phase.total}…`, `Reading source ${phase.current}/${phase.total}…`) : t("正在解析资料…", "Preparing source material…")
    : phase.stage === "prompt" ? t("正在加载生成规则…", "Loading generation instructions…") : t("正在生成并保存双语笔记…", "Generating and saving bilingual notes…");

  return (
    <div id="create" className="composer-section">
      <div className="composer-intents" aria-label={t("整理用途", "Note purpose")}>
        {intents.map((item) => <button key={item.label} type="button" aria-pressed={intent === item.label} disabled={busy} onClick={() => {
          setResultHref(""); setIntent(item.label); setInstruction(locale === "en" ? item.instructionEn : item.instruction); textInput.current?.focus();
        }}>{t(item.label, item.en)}</button>)}
      </div>
      <form className={`workspace-composer ${dragOver ? "is-dragging" : ""}`} onSubmit={generate}
        onDragOver={(event) => { if (!busy) { event.preventDefault(); setDragOver(true); } }}
        onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragOver(false); }}
        onDrop={(event) => { event.preventDefault(); setDragOver(false); if (!busy) selectFile(event.dataTransfer.files[0]); }}
        aria-busy={busy}>
        <label htmlFor="source-material" className="sr-only">{t("原始资料", "Source material")}</label>
        <textarea id="source-material" ref={textInput} value={file ? "" : text} disabled={busy || Boolean(file)} onChange={(event) => { setText(event.target.value); setError(event.target.value.trim().length > MAX_GENERATION_SOURCE_CHARS ? t("资料超过 35,000 字符，请拆分后生成。输入内容已完整保留。", "Source exceeds 35,000 characters. Split it before generating. Your full input has been retained.") : ""); setResultHref(""); }}
          placeholder={file ? t("已添加文件，文字草稿保留但不参与本次生成。", "File attached. Your text draft is retained separately.") : t("粘贴资料，或拖入文件…", "Paste source material, or drop a document here…")} rows={4} />
        {file && <div className="composer-attachment"><FileText size={17} /><span>{file.name}<small>{(file.size / 1024).toFixed(0)} KB</small></span><button type="button" disabled={busy} aria-label={t("移除文件", "Remove file")} onClick={() => { setFile(null); setResultHref(""); if (fileInput.current) fileInput.current.value = ""; }}><X size={16} /></button></div>}
        <div className="composer-toolbar">
          <div className="composer-tools">
            <button type="button" className="composer-upload" aria-label={t("添加文件", "Attach file")} onClick={() => fileInput.current?.click()} disabled={busy}><Paperclip size={17} /><span>{t("添加文件", "Attach file")}</span></button>
            <input ref={fileInput} type="file" className="sr-only" tabIndex={-1} aria-label={t("上传资料", "Upload source material")} accept=".txt,.md,.markdown,.docx,.pptx,.pdf,.tex,.csv" onChange={(event) => { selectFile(event.target.files?.[0] || null); event.target.value = ""; }} />
            <label className="composer-model"><span className="sr-only">{t("生成模型", "Generation model")}</span><select value={model} disabled={busy} onChange={(event) => { setModel(event.target.value); setResultHref(""); }}><option value="deepseek-v3.2">DeepSeek V3.2</option></select><ChevronDown size={12} /></label>
          </div>
          {needsLogin ? <Link className="composer-submit" href="/auth?redirect=%2F%23create" onClick={saveDraft}>{t("登录以生成", "Sign in to generate")}</Link>
            : <button className="composer-submit" type="submit" disabled={busy || !isReady || !draftReady || Boolean(resultHref)}><span>{resultHref ? t("已保存", "Saved") : busy ? t("正在生成", "Generating") : t("生成笔记", "Generate notes")}</span>{busy && <LoaderCircle className="spin" size={17} />}</button>}
        </div>
      </form>
      <div className="composer-meta"><span>{t("文档 / PDF", "Documents / PDF")} · {FILE_LIMIT_MB} MB</span><button type="button" aria-expanded={advanced} onClick={() => setAdvanced((value) => !value)}><SlidersHorizontal size={14} />{t("设置", "Settings")}<ChevronDown size={13} className={advanced ? "rotated" : ""} /></button></div>
      {advanced && <div className="composer-options"><label>{t("笔记标题", "Note title")}<span>{t("可选", "Optional")}</span><input value={title} maxLength={80} disabled={busy} onChange={(event) => { setTitle(event.target.value); setResultHref(""); }} placeholder={t("留空自动生成", "Leave blank to generate a title")} /></label><label>{t("整理要求", "Instructions")}<textarea value={instruction} maxLength={1500} disabled={busy} onChange={(event) => { setInstruction(event.target.value); setResultHref(""); }} rows={2} placeholder={t("例如：保留定义、引用与关键证据", "For example: preserve definitions, citations, and key evidence")} /></label><p className="composer-limit">{t("最多 35,000 字符。文字草稿在此设备自动保存；登录后需重新添加文件。", "Up to 35,000 characters. Text drafts are saved on this device; reattach files after signing in.")}</p><details><summary>{t("高级生成工具", "Advanced generation tools")}</summary><AdvancedGenerator /></details></div>}
      {error && <div className="workspace-message error" role="alert"><span>{error}</span><button type="button" onClick={() => setError("")} aria-label={t("关闭错误提示", "Dismiss error")}><X size={16} /></button></div>}
      {notice && <p className="generation-notice" role="status">{notice}</p>}
      {uncertain && <Link className="text-action generation-library" href="/notes">{t("检查笔记库", "Check library")}</Link>}
      {busy && <div className="generation-status" role="status"><span className="status-dot" /><span>{statusLabel}</span><button type="button" onClick={() => request.current?.abort()}>{phase.stage === "generating" ? t("停止等待", "Stop waiting") : t("取消", "Cancel")}</button></div>}
      {resultHref && <div className="workspace-message success" role="status"><Check size={18} /><span>{t("笔记已保存", "Note saved")}</span><Link href={resultHref}>{t("打开笔记", "Open note")}</Link><button type="button" onClick={() => { setText(""); setTitle(""); setInstruction(""); setIntent(""); setFile(null); setResultHref(""); setError(""); setNotice(""); setUncertain(false); textInput.current?.focus(); }}>{t("新建笔记", "New note")}</button></div>}
    </div>
  );
}
