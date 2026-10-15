import { MAX_GENERATION_SOURCE_CHARS, MAX_GENERATION_REQUEST_BYTES } from "./generation-limits";
const API_BASE = process.env.NEXT_PUBLIC_NOTES_API_BASE?.trim().replace(/\/+$/, "") || "";

export type GenerationPhase = { stage: "reading" | "prompt" | "generating"; current?: number; total?: number };
export type GenerationSource = { sourceFile?: File; sourceText?: string; fileName: string };
export type GenerationInput = {
  title: string; topic: string; tags: string; source: GenerationSource;
  extraInstruction: string; model: string; promptPreset: "standard" | "detailed" | "custom";
  customPromptTemplate: string; generateInteractiveDemo: boolean; authToken?: string;
  signal?: AbortSignal; onPhase?: (phase: GenerationPhase) => void;
};
export type GenerationResult = {
  success: boolean; slug: string; fileName: string; preview: string;
  note: null | { slug: string; weekLabelZh: string; weekLabelEn: string; zhTitle: string; enTitle: string; descriptionZh: string; descriptionEn: string; tags?: string[] };
};
export class GenerationError extends Error {
  constructor(public code: string, message: string, public uncertain = false) { super(message); this.name = "GenerationError"; }
}

export function validateGenerationText(text: string): string {
  const normalized = text.replace(/\r\n?/g, "\n").trim();
  if (!normalized) throw new GenerationError("empty_source", "No readable source material was found.");
  if (normalized.length > MAX_GENERATION_SOURCE_CHARS) throw new GenerationError("source_too_long", "Source material exceeds 35,000 characters. Split it into smaller documents.");
  return normalized;
}

function publicAssetUrl(file: string): string {
  const script = typeof document !== "undefined" ? document.querySelector<HTMLScriptElement>('script[src*="/_next/"]') : null;
  const path = script ? new URL(script.src).pathname : "";
  const prefix = path.includes("/_next/") ? path.slice(0, path.indexOf("/_next/")) : "";
  return `${prefix}/${file}`;
}

const promptCache = new Map<string, string>();
export async function resolvePromptTemplateForPreset(preset: "standard" | "detailed" | "custom", custom: string, signal?: AbortSignal): Promise<string> {
  signal?.throwIfAborted();
  if (preset === "custom") {
    if (!custom.trim()) throw new GenerationError("prompt_load", "Enter a custom prompt or select a preset.");
    return custom.trim();
  }
  const url = publicAssetUrl(preset === "detailed" ? "prompt2.md" : "prompt.md");
  const cached = promptCache.get(url);
  if (cached) return cached;
  try {
    const response = await fetch(url, { signal, cache: "default" });
    const text = response.ok ? (await response.text()).trim() : "";
    signal?.throwIfAborted();
    if (!text || /^\s*<!doctype|^\s*<html/i.test(text)) throw new Error("Prompt unavailable");
    promptCache.set(url, text);
    return text;
  } catch (error) {
    signal?.throwIfAborted();
    if (error instanceof GenerationError) throw error;
    throw new GenerationError("prompt_load", "Could not load generation instructions. Please retry.");
  }
}

async function readPdf(file: File, signal?: AbortSignal, onPhase?: GenerationInput["onPhase"]): Promise<string> {
  const pdfJs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  signal?.throwIfAborted();
  pdfJs.GlobalWorkerOptions.workerSrc = publicAssetUrl("pdf.worker.min.mjs");
  const data = new Uint8Array(await file.arrayBuffer());
  signal?.throwIfAborted();
  const task = pdfJs.getDocument({ data, isEvalSupported: false, useSystemFonts: true });
  const abort = () => { void task.destroy().catch(() => {}); };
  signal?.addEventListener("abort", abort, { once: true });
  try {
    const pdf = await task.promise;
    const texts: string[] = [];
    let length = 0;
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      signal?.throwIfAborted();
      onPhase?.({ stage: "reading", current: pageNumber, total: pdf.numPages });
      const page = await pdf.getPage(pageNumber);
      try {
        const content = await page.getTextContent();
        signal?.throwIfAborted();
        const text = content.items.map((item) => "str" in item ? item.str + (item.hasEOL ? "\n" : " ") : "").join("").trim();
        if (text) { texts.push(text); length += text.length + (texts.length > 1 ? 2 : 0); }
        if (length > MAX_GENERATION_SOURCE_CHARS) throw new GenerationError("source_too_long", "Source material exceeds 35,000 characters. Split the PDF before generating.");
      } finally { page.cleanup(); }
    }
    if (!texts.length) throw new GenerationError("pdf_scan", "This PDF has no readable text. Apply OCR or upload a text-based document.");
    return validateGenerationText(texts.join("\n\n"));
  } catch (error) {
    signal?.throwIfAborted();
    if (error instanceof GenerationError) throw error;
    throw new GenerationError("unreadable_file", "Could not read this PDF. Check that it is valid and unlocked.");
  } finally {
    signal?.removeEventListener("abort", abort);
    await task.destroy().catch(() => {});
  }
}

function decodeXml(text: string): string {
  return text.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(parseInt(code, 10))).replace(/&amp;/g, "&");
}

function preserveOfficeTables(xml: string): string {
  return xml.replace(/<(w|a):tbl\b[^>]*>([\s\S]*?)<\/\1:tbl>/gi, (_, prefix: string, table: string) => {
    const rows = Array.from(table.matchAll(new RegExp(`<${prefix}:tr\\b[^>]*>([\\s\\S]*?)<\\/${prefix}:tr>`, "gi")), (row) =>
      Array.from(row[1].matchAll(new RegExp(`<${prefix}:tc\\b[^>]*>([\\s\\S]*?)<\\/${prefix}:tc>`, "gi")), (cell) =>
        cell[1].replace(/<\/(?:w|a):p>/gi, " ").replace(/<[^>]+>/g, "").trim()).join("\t"));
    return `\n${rows.join("\n")}\n`;
  });
}

async function readOffice(file: File, extension: string, signal?: AbortSignal, onPhase?: GenerationInput["onPhase"]): Promise<string> {
  const { default: JSZip } = await import("jszip");
  signal?.throwIfAborted();
  try {
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    signal?.throwIfAborted();
    const names = Object.keys(zip.files).filter((name) => extension === "docx"
      ? /^word\/(document|header\d+|footer\d+|footnotes|endnotes)\.xml$/i.test(name)
      : /^ppt\/slides\/slide\d+\.xml$/i.test(name)).sort((a, b) => extension === "pptx"
        ? Number(a.match(/slide(\d+)/i)?.[1]) - Number(b.match(/slide(\d+)/i)?.[1])
        : a === "word/document.xml" ? -1 : b === "word/document.xml" ? 1 : a.localeCompare(b));
    const texts: string[] = [];
    for (let i = 0; i < names.length; i++) {
      signal?.throwIfAborted();
      onPhase?.({ stage: "reading", current: i + 1, total: names.length });
      const xml = await zip.file(names[i])!.async("string");
      signal?.throwIfAborted();
      const text = decodeXml(preserveOfficeTables(xml).replace(/<(?:w|a):tab[^>]*\/>/gi, "\t").replace(/<(?:w|a):(?:br|cr)[^>]*\/>/gi, "\n")
        .replace(/<\/(?:w|a):p>/gi, "\n").replace(/<[^>]+>/g, "")).replace(/\n{3,}/g, "\n\n").trim();
      if (text) texts.push(text);
      if (texts.join("\n\n").length > MAX_GENERATION_SOURCE_CHARS) throw new GenerationError("source_too_long", "Source material exceeds 35,000 characters. Split the document before generating.");
    }
    return validateGenerationText(texts.join("\n\n"));
  } catch (error) {
    signal?.throwIfAborted();
    if (error instanceof GenerationError) throw error;
    throw new GenerationError("unreadable_file", "Could not read this document. Check that it is valid and unlocked.");
  }
}

export async function resolveGenerationSourcePayload(file: File, signal?: AbortSignal, onPhase?: GenerationInput["onPhase"]): Promise<GenerationSource> {
  signal?.throwIfAborted();
  const extension = file.name.split(".").pop()?.toLowerCase() || "";
  if (!/^(txt|md|markdown|docx|pptx|pdf|tex|csv)$/.test(extension)) throw new GenerationError("unsupported_file", "Use TXT, Markdown, DOCX, PPTX, PDF, TeX, or CSV. Convert legacy DOC/PPT files first.");
  if (!file.size) throw new GenerationError("empty_source", "This file is empty.");
  onPhase?.({ stage: "reading" });
  const text = extension === "pdf" ? await readPdf(file, signal, onPhase)
    : /^(docx|pptx)$/.test(extension) ? await readOffice(file, extension, signal, onPhase) : await file.text();
  signal?.throwIfAborted();
  return { sourceText: validateGenerationText(text), fileName: file.name };
}

export async function submitNoteGeneration(params: GenerationInput, mode: "cloud" | "local"): Promise<GenerationResult> {
  params.signal?.throwIfAborted();
  if (mode === "cloud" && !params.authToken) throw new GenerationError("unauthenticated", "Sign in to generate notes.");
  params.onPhase?.({ stage: "prompt" });
  const promptTemplate = mode === "cloud" ? await resolvePromptTemplateForPreset(params.promptPreset, params.customPromptTemplate, params.signal) : "";
  params.signal?.throwIfAborted();
  const body = new FormData();
  for (const field of ["title", "topic", "tags", "model", "extraInstruction", "promptPreset", "customPromptTemplate"] as const) body.set(field, params[field]);
  body.set("generateInteractiveDemo", String(params.generateInteractiveDemo));
  body.set("fileName", params.source.fileName);
  if (params.source.sourceText) body.set("sourceText", validateGenerationText(params.source.sourceText));
  if (params.source.sourceFile) body.set("sourceFile", params.source.sourceFile);
  if (mode === "cloud") body.set("promptTemplate", promptTemplate);
  if (mode === "cloud" && API_BASE.startsWith("/")) {
    // Measure the actual multipart payload, including prompt and boundaries.
    const size = (await new Response(body).blob()).size;
    params.signal?.throwIfAborted();
    if (size > MAX_GENERATION_REQUEST_BYTES) throw new GenerationError("request_too_large", "The request is too large. Reduce the source material or custom prompt.");
  }
  const timeout = AbortSignal.timeout(285_000);
  const signal = params.signal ? AbortSignal.any([params.signal, timeout]) : timeout;
  params.onPhase?.({ stage: "generating" });
  try {
    const response = await fetch(mode === "cloud" ? `${API_BASE}/notes/generate` : "/api/note-generator", {
      method: "POST", body, signal, headers: mode === "cloud" ? { Authorization: `Bearer ${params.authToken}` } : undefined,
    });
    const json = await response.json().catch(() => null);
    signal.throwIfAborted();
    if (response.status === 401) throw new GenerationError("unauthenticated", "Your session has expired. Sign in again.");
    if (response.status === 413) throw new GenerationError("request_too_large", "The request is too large. Split the source material.");
    if (response.status === 429) throw new GenerationError("rate_limit", "The service is busy. Wait before trying again.");
    if (!response.ok) throw new GenerationError("server_error", typeof json?.error === "string" ? json.error : "Generation failed. Your source material has been retained.", response.status >= 500);
    if (json?.success !== true || typeof json.slug !== "string" || !json.slug.trim()) throw new GenerationError("invalid_result", "The generation result could not be confirmed. Check your library before retrying.", true);
    return { ...json, slug: json.slug.trim() } as GenerationResult;
  } catch (error) {
    params.signal?.throwIfAborted();
    if (timeout.aborted) throw new GenerationError("timeout", "Generation took too long. Check your library before retrying.", true);
    if (error instanceof GenerationError) throw error;
    throw new GenerationError("network", "The connection was interrupted. Check your library before retrying.", true);
  }
}

export async function generateWorkspaceNote(params: {
  file: File | null; text: string; instruction: string; title: string; model: string;
  authToken: string; signal: AbortSignal; onPhase?: GenerationInput["onPhase"];
}): Promise<GenerationResult> {
  params.signal.throwIfAborted();
  if (API_BASE && !params.authToken) throw new GenerationError("unauthenticated", "Sign in to generate notes.");
  const source = params.file ? await resolveGenerationSourcePayload(params.file, params.signal, params.onPhase)
    : { sourceText: validateGenerationText(params.text), fileName: "source-material.txt" };
  return submitNoteGeneration({
    title: params.title.trim(), topic: "", tags: "", source, extraInstruction: params.instruction.trim(), model: params.model,
    promptPreset: "standard", customPromptTemplate: "", authToken: params.authToken, generateInteractiveDemo: false,
    signal: params.signal, onPhase: params.onPhase,
  }, API_BASE ? "cloud" : "local");
}
