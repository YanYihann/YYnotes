"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
} from "react";

export type NoteEditorMode = "annotation" | "full";

type NoteEditorPanelProps = {
  source: string;
  mode: NoteEditorMode | null;
  saving?: boolean;
  onModeChange: (mode: NoteEditorMode) => void;
  onSave: (nextSource: string) => Promise<void>;
  onCancel: () => void;
};

type PreviewInsertion = {
  value: string;
  insertedStart: number;
  insertedEnd: number;
  insertedLength: number;
};

function normalizeNewlines(value: string): string {
  return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read pasted image."));
    reader.readAsDataURL(file);
  });
}

function clampIndex(index: number, source: string): number {
  return Math.max(0, Math.min(index, source.length));
}

function getLineColumn(source: string, index: number): { line: number; column: number } {
  const safeIndex = clampIndex(index, source);
  const before = source.slice(0, safeIndex);
  const lines = before.split("\n");
  return {
    line: lines.length,
    column: lines[lines.length - 1].length + 1,
  };
}

function buildAnnotationBlock(content: string): string {
  const normalized = normalizeNewlines(content).trim();
  if (!normalized) {
    return "";
  }

  const timestamp = new Date().toLocaleString("zh-CN", {
    hour12: false,
  });
  const quotedLines = normalized.split("\n").map((line) => (line.trim() ? `> ${line}` : ">"));

  return [
    "> **【笔记注释 / Note Annotation】**",
    `> _${timestamp}_`,
    ">",
    ...quotedLines,
  ].join("\n");
}

function buildInsertion(source: string, block: string, index: number): PreviewInsertion {
  if (!block) {
    return {
      value: source,
      insertedStart: index,
      insertedEnd: index,
      insertedLength: 0,
    };
  }

  const cursor = clampIndex(index, source);
  const before = source.slice(0, cursor);
  const after = source.slice(cursor);
  const prefix = before.length === 0 || before.endsWith("\n\n") ? "" : before.endsWith("\n") ? "\n" : "\n\n";
  const suffix = after.length === 0 || after.startsWith("\n\n") ? "" : after.startsWith("\n") ? "\n" : "\n\n";
  const inserted = `${prefix}${block}${suffix}`;

  return {
    value: `${before}${inserted}${after}`,
    insertedStart: before.length,
    insertedEnd: before.length + inserted.length,
    insertedLength: inserted.length,
  };
}

function insertAnnotationBlock(source: string, content: string, index: number): string {
  const block = buildAnnotationBlock(content);
  if (!block) {
    return source;
  }
  return buildInsertion(source, block, index).value;
}

function mapPreviewIndexToSourceIndex(previewIndex: number, preview: PreviewInsertion): number {
  if (preview.insertedLength === 0 || previewIndex <= preview.insertedStart) {
    return previewIndex;
  }
  if (previewIndex >= preview.insertedEnd) {
    return previewIndex - preview.insertedLength;
  }
  return preview.insertedStart;
}

function insertTextIntoTextareaValue(
  value: string,
  start: number,
  end: number,
  text: string,
): { value: string; cursor: number } {
  const before = value.slice(0, start);
  const after = value.slice(end);
  const nextValue = `${before}${text}${after}`;
  return {
    value: nextValue,
    cursor: before.length + text.length,
  };
}

async function getPastedMarkdownImages(event: ClipboardEvent<HTMLTextAreaElement>): Promise<string[]> {
  const imageItems = Array.from(event.clipboardData.items)
    .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
    .map((item) => item.getAsFile())
    .filter((file): file is File => file !== null);

  return Promise.all(
    imageItems.map(async (file, index) => {
      const dataUrl = await fileToDataUrl(file);
      const safeName = file.name?.replace(/[^\w.-]+/g, "-") || `pasted-image-${index + 1}.png`;
      return `![${safeName}](${dataUrl})`;
    }),
  );
}

export function NoteEditorPanel({
  source,
  mode,
  saving = false,
  onModeChange,
  onSave,
  onCancel,
}: NoteEditorPanelProps) {
  const normalizedSource = useMemo(() => normalizeNewlines(source), [source]);
  const sourceTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const annotationTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fullTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [annotationCursor, setAnnotationCursor] = useState(normalizedSource.length);
  const [annotationDraft, setAnnotationDraft] = useState("");
  const [fullDraft, setFullDraft] = useState(normalizedSource);
  const [error, setError] = useState("");

  useEffect(() => {
    setAnnotationCursor(normalizedSource.length);
    setAnnotationDraft("");
    setFullDraft(normalizedSource);
    setError("");
  }, [normalizedSource]);

  useEffect(() => {
    setError("");
    if (mode === "full") {
      setFullDraft(normalizedSource);
      window.requestAnimationFrame(() => fullTextareaRef.current?.focus());
      return;
    }
    if (mode === "annotation") {
      window.requestAnimationFrame(() => sourceTextareaRef.current?.focus());
    }
  }, [mode, normalizedSource]);

  const annotationBlock = useMemo(() => buildAnnotationBlock(annotationDraft), [annotationDraft]);
  const annotationPreview = useMemo(
    () => buildInsertion(normalizedSource, annotationBlock, annotationCursor),
    [annotationBlock, annotationCursor, normalizedSource],
  );
  const cursorPosition = useMemo(
    () => getLineColumn(normalizedSource, annotationCursor),
    [annotationCursor, normalizedSource],
  );

  const updateAnnotationCursorFromPreview = useCallback(() => {
    const textarea = sourceTextareaRef.current;
    if (!textarea) {
      return;
    }
    const nextCursor = clampIndex(mapPreviewIndexToSourceIndex(textarea.selectionStart, annotationPreview), normalizedSource);
    setAnnotationCursor(nextCursor);
  }, [annotationPreview, normalizedSource]);

  const insertIntoAnnotationDraft = useCallback((markdown: string) => {
    const textarea = annotationTextareaRef.current;
    setAnnotationDraft((current) => {
      const start = textarea?.selectionStart ?? current.length;
      const end = textarea?.selectionEnd ?? current.length;
      const prefix = current && start === current.length && !current.endsWith("\n") ? "\n\n" : "";
      const insertion = `${prefix}${markdown}`;
      const next = insertTextIntoTextareaValue(current, start, end, insertion);

      window.requestAnimationFrame(() => {
        const cursor = next.cursor;
        annotationTextareaRef.current?.focus();
        annotationTextareaRef.current?.setSelectionRange(cursor, cursor);
      });

      return next.value;
    });
  }, []);

  const insertIntoFullDraft = useCallback((markdown: string) => {
    const textarea = fullTextareaRef.current;
    setFullDraft((current) => {
      const start = textarea?.selectionStart ?? current.length;
      const end = textarea?.selectionEnd ?? current.length;
      const prefix = current && start === current.length && !current.endsWith("\n") ? "\n\n" : "";
      const insertion = `${prefix}${markdown}`;
      const next = insertTextIntoTextareaValue(current, start, end, insertion);

      window.requestAnimationFrame(() => {
        fullTextareaRef.current?.focus();
        fullTextareaRef.current?.setSelectionRange(next.cursor, next.cursor);
      });

      return next.value;
    });
  }, []);

  const handleAnnotationSourcePaste = useCallback(
    async (event: ClipboardEvent<HTMLTextAreaElement>) => {
      event.preventDefault();
      setError("");
      updateAnnotationCursorFromPreview();

      try {
        const pastedImages = await getPastedMarkdownImages(event);
        if (pastedImages.length > 0) {
          insertIntoAnnotationDraft(pastedImages.join("\n\n"));
          return;
        }

        const text = event.clipboardData.getData("text/plain");
        if (text) {
          insertIntoAnnotationDraft(text);
        }
      } catch (pasteError) {
        setError(pasteError instanceof Error ? pasteError.message : "图片粘贴失败，请稍后重试。");
      }
    },
    [insertIntoAnnotationDraft, updateAnnotationCursorFromPreview],
  );

  const handleAnnotationDraftPaste = useCallback(
    async (event: ClipboardEvent<HTMLTextAreaElement>) => {
      const pastedImages = await getPastedMarkdownImages(event);
      if (pastedImages.length === 0) {
        return;
      }

      event.preventDefault();
      setError("");
      insertIntoAnnotationDraft(pastedImages.join("\n\n"));
    },
    [insertIntoAnnotationDraft],
  );

  const handleFullPaste = useCallback(
    async (event: ClipboardEvent<HTMLTextAreaElement>) => {
      const pastedImages = await getPastedMarkdownImages(event);
      if (pastedImages.length === 0) {
        return;
      }

      event.preventDefault();
      setError("");
      insertIntoFullDraft(pastedImages.join("\n\n"));
    },
    [insertIntoFullDraft],
  );

  const handleAnnotationSourceKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      updateAnnotationCursorFromPreview();

      if (event.key === "Enter") {
        event.preventDefault();
        annotationTextareaRef.current?.focus();
        return;
      }

      if (event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }

      if (event.key.length === 1) {
        event.preventDefault();
        insertIntoAnnotationDraft(event.key);
      }
    },
    [insertIntoAnnotationDraft, updateAnnotationCursorFromPreview],
  );

  const save = useCallback(async () => {
    setError("");

    const nextSource =
      mode === "annotation"
        ? insertAnnotationBlock(normalizedSource, annotationDraft, annotationCursor)
        : normalizeNewlines(fullDraft).trimEnd();

    if (!nextSource.trim()) {
      setError("内容不能为空。");
      return;
    }

    if (nextSource.trimEnd() === normalizedSource.trimEnd()) {
      setError(mode === "annotation" ? "请先输入要插入的注释内容。" : "没有可保存的改动。");
      return;
    }

    try {
      await onSave(`${nextSource.trimEnd()}\n`);
      setAnnotationDraft("");
      setFullDraft(nextSource);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "保存失败，请稍后重试。");
    }
  }, [annotationCursor, annotationDraft, fullDraft, mode, normalizedSource, onSave]);

  if (mode === null) {
    return (
      <section className="rounded-apple border border-primary/25 bg-primary/[0.04] p-4 shadow-card">
        <p className="font-text text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          选择编辑方式
          <span className="ui-en ml-1">Choose Edit Mode</span>
        </p>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <button
            type="button"
            onClick={() => onModeChange("annotation")}
            className="rounded-apple border border-primary/30 bg-card px-4 py-4 text-left shadow-card transition hover:-translate-y-0.5 hover:border-primary/70 hover:bg-primary/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="block font-display text-[22px] font-semibold tracking-tightDisplay text-foreground">
              笔记注释
              <span className="ui-en ml-2 text-[0.65em] font-normal text-muted-foreground">Annotation</span>
            </span>
            <span className="mt-2 block font-text text-[13px] leading-[1.5] text-muted-foreground">
              原文只读。把光标放到原文中的插入位置，然后输入注释；保存时会自动包成醒目的 Markdown 引用块。
            </span>
          </button>
          <button
            type="button"
            onClick={() => onModeChange("full")}
            className="rounded-apple border border-border bg-card px-4 py-4 text-left shadow-card transition hover:-translate-y-0.5 hover:border-primary/60 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="block font-display text-[22px] font-semibold tracking-tightDisplay text-foreground">
              全文编辑
              <span className="ui-en ml-2 text-[0.65em] font-normal text-muted-foreground">Full Edit</span>
            </span>
            <span className="mt-2 block font-text text-[13px] leading-[1.5] text-muted-foreground">
              直接编辑完整 Markdown / MDX 原文，适合重排结构、修改原句或删除内容。
            </span>
          </button>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="btn-apple-link mt-4 inline-flex px-3 py-1.5 font-text text-[14px] tracking-tightCaption transition focus-visible:outline-none"
        >
          取消
          <span className="ui-en ml-1">Cancel</span>
        </button>
      </section>
    );
  }

  return (
    <section className="rounded-apple border border-primary/25 bg-primary/[0.04] p-4 shadow-card">
      <header className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-text text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            {mode === "annotation" ? "笔记注释模式" : "全文编辑模式"}
            <span className="ui-en ml-1">{mode === "annotation" ? "Annotation Mode" : "Full Edit Mode"}</span>
          </p>
          <p className="mt-1 font-text text-[12px] leading-[1.45] text-muted-foreground">
            {mode === "annotation"
              ? "原文区域只读，点击任意位置移动插入光标；输入或粘贴图片会进入注释内容，保存后插入为引用块。"
              : "正在直接编辑完整原文；粘贴图片会自动插入 Markdown 图片语法。"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onModeChange("annotation")}
            className={`rounded-capsule border px-3 py-1 text-[12px] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              mode === "annotation"
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:bg-accent"
            }`}
          >
            笔记注释
          </button>
          <button
            type="button"
            onClick={() => onModeChange("full")}
            className={`rounded-capsule border px-3 py-1 text-[12px] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              mode === "full"
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:bg-accent"
            }`}
          >
            全文编辑
          </button>
        </div>
      </header>

      {mode === "annotation" ? (
        <div className="space-y-3">
          <div className="rounded-apple border border-border bg-card px-3 py-2 font-text text-[12px] text-muted-foreground">
            插入位置：第 {cursorPosition.line} 行，第 {cursorPosition.column} 列
            <span className="ui-en ml-1">
              Line {cursorPosition.line}, Column {cursorPosition.column}
            </span>
          </div>
          <textarea
            ref={sourceTextareaRef}
            value={annotationPreview.value}
            readOnly
            onClick={updateAnnotationCursorFromPreview}
            onKeyUp={updateAnnotationCursorFromPreview}
            onSelect={updateAnnotationCursorFromPreview}
            onKeyDown={handleAnnotationSourceKeyDown}
            onPaste={handleAnnotationSourcePaste}
            rows={22}
            className="min-h-[520px] w-full resize-y rounded-apple border border-input bg-background px-4 py-4 font-mono text-[13px] leading-[1.6] text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="只读原文定位区"
          />
          <label className="block space-y-2">
            <span className="font-text text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              注释内容
              <span className="ui-en ml-1">Annotation Content</span>
            </span>
            <textarea
              ref={annotationTextareaRef}
              value={annotationDraft}
              onChange={(event) => setAnnotationDraft(event.target.value)}
              onPaste={handleAnnotationDraftPaste}
              rows={6}
              placeholder="在这里写注释，或直接粘贴截图 / 图片。保存时会自动包成 Markdown 引用块。"
              className="w-full resize-y rounded-apple border border-input bg-background px-3 py-3 font-mono text-[13px] leading-[1.55] text-foreground outline-none transition placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>
        </div>
      ) : (
        <textarea
          ref={fullTextareaRef}
          value={fullDraft}
          onChange={(event) => setFullDraft(event.target.value)}
          onPaste={handleFullPaste}
          rows={28}
          placeholder="直接编辑完整 Markdown / MDX 原文。"
          className="min-h-[620px] w-full resize-y rounded-apple border border-input bg-background px-4 py-4 font-mono text-[13px] leading-[1.6] text-foreground outline-none transition placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="全文编辑区"
        />
      )}

      {error ? (
        <p className="mt-3 rounded-apple border border-[#b4232f]/30 bg-[#b4232f]/[0.08] px-3 py-2 font-text text-[13px] leading-[1.4] text-[#7f1820] dark:border-[#ff6a77]/35 dark:bg-[#ff6a77]/[0.12] dark:text-[#ffd5da]">
          {error}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="btn-apple-primary inline-flex items-center rounded-apple px-5 py-2 font-text text-[14px] transition disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none"
        >
          {saving ? "保存中..." : mode === "annotation" ? "保存注释" : "保存全文"}
          <span className="ui-en ml-1">{saving ? "Saving..." : mode === "annotation" ? "Save Annotation" : "Save Full Note"}</span>
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="btn-apple-link inline-flex items-center px-4 py-1.5 font-text text-[14px] tracking-tightCaption transition disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none"
        >
          取消
          <span className="ui-en ml-1">Cancel</span>
        </button>
      </div>
    </section>
  );
}
