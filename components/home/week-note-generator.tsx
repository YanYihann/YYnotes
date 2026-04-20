"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { WeekCard } from "@/components/week-card";

type ExistingNote = {
  slug: string;
};

type GeneratedNote = {
  slug: string;
  weekLabelZh: string;
  weekLabelEn: string;
  zhTitle: string;
  enTitle: string;
  descriptionZh: string;
  descriptionEn: string;
  tags?: string[];
};

type GenerationResult = {
  success: boolean;
  slug: string;
  replaced: boolean;
  note: GeneratedNote | null;
  fileName: string;
  preview: string;
};

type MetadataUpdateResult = {
  success: boolean;
  slug: string;
  note: GeneratedNote | null;
};

type WeekNoteGeneratorProps = {
  existingNotes: ExistingNote[];
};

const CLOUD_API_BASE = process.env.NEXT_PUBLIC_NOTES_API_BASE?.trim() ?? "";
const IS_CLOUD_MODE = CLOUD_API_BASE.length > 0;

function slugifyTitle(input: string): string {
  const base = input
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (base) {
    return base;
  }

  return "new-note";
}

function normalizeApiBase(input: string): string {
  return input.replace(/\/+$/, "");
}

function fileExtension(fileName: string): string {
  const index = fileName.lastIndexOf(".");
  if (index === -1) {
    return "";
  }
  return fileName.slice(index + 1).toLowerCase();
}

function deriveTitleFromFileName(fileName: string): string {
  const trimmed = fileName.trim();
  if (!trimmed) {
    return "";
  }

  const dot = trimmed.lastIndexOf(".");
  const base = dot > 0 ? trimmed.slice(0, dot) : trimmed;

  return base
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseTagsInput(raw: string): string[] {
  const dedup = new Set<string>();
  for (const token of raw.split(/[��,��|]/)) {
    const cleaned = token.trim().replace(/^#+/, "");
    if (!cleaned) {
      continue;
    }
    dedup.add(cleaned);
    if (dedup.size >= 12) {
      break;
    }
  }

  return Array.from(dedup);
}

function buildNoteViewHref(slug: string): string {
  if (IS_CLOUD_MODE) {
    return `/notes/cloud?slug=${encodeURIComponent(slug)}`;
  }
  return `/notes/${slug}`;
}

function buildPromptCandidates(): string[] {
  const candidates = new Set<string>(["./prompt.md"]);

  if (typeof window !== "undefined") {
    const { origin, pathname } = window.location;
    const segments = pathname.split("/").filter(Boolean);
    const repoSegment = segments[0];

    if (repoSegment) {
      candidates.add(`/${repoSegment}/prompt.md`);
    }

    const currentDir = pathname.endsWith("/") ? pathname : pathname.slice(0, pathname.lastIndexOf("/") + 1);
    if (currentDir) {
      candidates.add(`${currentDir}prompt.md`);
    }

    // Keep absolute root as a final fallback to avoid noisy 404 on project pages.
    candidates.add("/prompt.md");

    for (const candidate of Array.from(candidates)) {
      try {
        candidates.add(new URL(candidate, origin).toString());
      } catch {
        // Ignore malformed URL candidates.
      }
    }
  }

  return Array.from(candidates);
}

async function loadPromptTemplateFromSite(): Promise<string> {
  const candidates = buildPromptCandidates();

  for (const candidate of candidates) {
    const response = await fetch(candidate, { cache: "no-store" });
    if (!response.ok) {
      continue;
    }

    const content = (await response.text()).trim();
    if (content) {
      return content;
    }
  }

  throw new Error(`�޷���ȡ prompt.md����ȷ�ϸ��ļ��ѷ�����վ���Ŀ¼���ѳ���·����${candidates.join("��")}`);
}

async function callLocalGenerator(params: {
  title: string;
  topic: string;
  tags: string;
  sourceFile: File;
  overwrite: boolean;
  extraInstruction: string;
}): Promise<GenerationResult> {
  const body = new FormData();
  body.append("title", params.title);
  body.append("topic", params.topic);
  body.append("tags", params.tags);
  body.append("sourceFile", params.sourceFile);
  body.append("overwrite", params.overwrite ? "true" : "false");
  if (params.extraInstruction) {
    body.append("extraInstruction", params.extraInstruction);
  }

  const response = await fetch("/api/note-generator", {
    method: "POST",
    body,
  });

  const json = (await response.json().catch(() => null)) as { error?: string } & Partial<GenerationResult> | null;

  if (!response.ok || !json) {
    throw new Error(json?.error || "����ʧ�ܣ����Ժ����ԡ�");
  }

  if (!json.success || !json.slug) {
    throw new Error("���ɽ����Ч�������ԡ�");
  }

  return json as GenerationResult;
}

async function callCloudGenerator(params: {
  title: string;
  topic: string;
  tags: string;
  sourceFile: File;
  overwrite: boolean;
  extraInstruction: string;
  authToken: string;
}): Promise<GenerationResult> {
  const extension = fileExtension(params.sourceFile.name);
  if (extension === "doc" || extension === "ppt") {
    throw new Error("�ݲ�֧�־ɰ� .doc / .ppt���������Ϊ .docx / .pptx �����ϴ���");
  }

  const promptTemplate = await loadPromptTemplateFromSite();
  const apiBase = normalizeApiBase(CLOUD_API_BASE);
  const body = new FormData();
  body.append("title", params.title);
  body.append("topic", params.topic);
  body.append("tags", params.tags);
  body.append("sourceFile", params.sourceFile);
  body.append("overwrite", params.overwrite ? "true" : "false");
  body.append("promptTemplate", promptTemplate);
  if (params.extraInstruction) {
    body.append("extraInstruction", params.extraInstruction);
  }

  const response = await fetch(`${apiBase}/notes/generate`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.authToken}`,
    },
    body,
  });

  const json = (await response.json().catch(() => null)) as { error?: string } & Partial<GenerationResult> | null;

  if (!response.ok || !json) {
    throw new Error(json?.error || "�ƶ�����ʧ�ܣ����Ժ����ԡ�");
  }

  if (!json.success || !json.slug) {
    throw new Error("�ƶ˷�������Ч����������ԡ�");
  }

  return json as GenerationResult;
}

async function callLocalMetadataUpdate(params: {
  slug: string;
  title: string;
  topic: string;
  tags: string[];
}): Promise<MetadataUpdateResult> {
  const response = await fetch("/api/note-generator", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params),
  });

  const json = (await response.json().catch(() => null)) as { error?: string } & Partial<MetadataUpdateResult> | null;
  if (!response.ok || !json) {
    throw new Error(json?.error || "����Ԫ��Ϣʧ�ܣ����Ժ����ԡ�");
  }

  if (!json.success || !json.slug) {
    throw new Error("Ԫ��Ϣ���½����Ч�������ԡ�");
  }

  return json as MetadataUpdateResult;
}

async function callCloudMetadataUpdate(params: {
  slug: string;
  title: string;
  topic: string;
  tags: string[];
  authToken: string;
}): Promise<MetadataUpdateResult> {
  const apiBase = normalizeApiBase(CLOUD_API_BASE);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${params.authToken}`,
  };

  const response = await fetch(`${apiBase}/notes/${encodeURIComponent(params.slug)}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(params),
  });

  const json = (await response.json().catch(() => null)) as { error?: string } & Partial<MetadataUpdateResult> | null;
  if (!response.ok || !json) {
    throw new Error(json?.error || "�ƶ�Ԫ��Ϣ����ʧ�ܣ����Ժ����ԡ�");
  }

  if (!json.success || !json.slug) {
    throw new Error("�ƶ�Ԫ��Ϣ���½����Ч�������ԡ�");
  }

  return json as MetadataUpdateResult;
}

export function WeekNoteGenerator({ existingNotes }: WeekNoteGeneratorProps) {
  const router = useRouter();
  const { session } = useAuth();
  const [title, setTitle] = useState("");
  const [topic, setTopic] = useState("");
  const [tags, setTags] = useState("");
  const [overwrite, setOverwrite] = useState(false);
  const [extraInstruction, setExtraInstruction] = useState("");
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [savingMeta, setSavingMeta] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editTopic, setEditTopic] = useState("");
  const [editTags, setEditTags] = useState("");

  const slugPreview = useMemo(() => {
    const manualTitle = title.trim();
    if (manualTitle) {
      return slugifyTitle(manualTitle);
    }

    if (sourceFile) {
      const guessedTitle = deriveTitleFromFileName(sourceFile.name);
      if (guessedTitle) {
        return slugifyTitle(guessedTitle);
      }
    }

    return "";
  }, [title, sourceFile]);

  const existingSlugSet = useMemo(() => {
    return new Set(existingNotes.map((note) => note.slug));
  }, [existingNotes]);

  const noteAlreadyExists = slugPreview ? existingSlugSet.has(slugPreview) : false;

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!sourceFile) {
      setError("�����ϴ�ԭʼ�����ļ���");
      return;
    }

    if (IS_CLOUD_MODE && !session?.token) {
      setError("���ȵ�¼���������ƶ˱ʼǡ�");
      return;
    }

    setSubmitting(true);
    setError("");
    setResult(null);

    try {
      const payload = {
        title: title.trim(),
        topic: topic.trim(),
        tags: tags.trim(),
        sourceFile,
        overwrite,
        extraInstruction: extraInstruction.trim(),
        authToken: session?.token || "",
      };

      const generationResult = IS_CLOUD_MODE ? await callCloudGenerator(payload) : await callLocalGenerator(payload);

      setResult(generationResult);
      setEditTitle(generationResult.note?.zhTitle ?? payload.title);
      setEditTopic(generationResult.note?.weekLabelZh ?? payload.topic);
      setEditTags((generationResult.note?.tags ?? parseTagsInput(payload.tags)).join(", "));
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "����ʧ�ܣ����Ժ����ԡ�");
    } finally {
      setSubmitting(false);
    }
  }

  async function onSaveMetadata() {
    if (!result?.slug) {
      return;
    }

    if (IS_CLOUD_MODE && !session?.token) {
      setError("��¼״̬��ʧЧ�������µ�¼��");
      return;
    }

    setSavingMeta(true);
    setError("");

    try {
      const payload = {
        slug: result.slug,
        title: editTitle.trim(),
        topic: editTopic.trim(),
        tags: parseTagsInput(editTags),
        authToken: session?.token || "",
      };

      const updated = IS_CLOUD_MODE ? await callCloudMetadataUpdate(payload) : await callLocalMetadataUpdate(payload);

      if (updated.note) {
        setResult((previous) => {
          if (!previous) {
            return previous;
          }

          return {
            ...previous,
            note: updated.note,
          };
        });
        setEditTitle(updated.note.zhTitle);
        setEditTopic(updated.note.weekLabelZh);
        setEditTags((updated.note.tags ?? []).join(", "));
      }

      router.refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "����Ԫ��Ϣʧ�ܣ����Ժ����ԡ�");
    } finally {
      setSavingMeta(false);
    }
  }

  return (
    <section className="mb-8 rounded-apple bg-card p-5 text-card-foreground shadow-card">
      <div className="mb-4">
        <h3 className="font-display text-[28px] font-normal leading-[1.14] tracking-[0.196px] text-foreground">
          �ϴ����ϲ����ɱʼ�
        </h3>
        <p className="mt-2 max-w-[860px] font-text text-[14px] leading-[1.45] tracking-tightCaption text-muted-foreground">
          �������� + ���� + ��ǩ����ʽ����ͨ�� MDX �ʼǣ�����������ѧ�ơ�
          <span className="ui-en ml-1">Generate structured MDX notes using title, topic, and tags.</span>
        </p>
        {IS_CLOUD_MODE ? (
          <p className="mt-2 rounded-apple border border-primary/35 bg-primary/10 px-3 py-2 font-text text-[12px] leading-[1.4] text-muted-foreground">
            ��ǰΪ�ƶ�ģʽ��������Զ�̱ʼ� API ���洢�� Neon ���ݿ⣬��ֻд�뵱ǰ��¼�˺š�
          </p>
        ) : null}
      </div>

      <form onSubmit={onSubmit} className="grid gap-4 md:grid-cols-2">
        <label className="space-y-2 md:col-span-2">
          <span className="font-text text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            ���⣨��ѡ������Զ����ɣ�
          </span>
          <input
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="���磺�����������Ժ��ĸ���"
            className="w-full rounded-apple border border-input bg-background px-3 py-2 font-text text-[15px] text-foreground outline-none transition placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
          />
          <p className="font-text text-[12px] leading-[1.4] text-muted-foreground">
            {slugPreview ? `Ԥ�� slug��${slugPreview}` : "���ʱ���Զ����ɱ��⡢���⡢��ǩ�� slug��"}
          </p>
        </label>

        <label className="space-y-2">
          <span className="font-text text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">���⣨��ѡ��</span>
          <input
            type="text"
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
            placeholder="���磺΢���ֻ���"
            className="w-full rounded-apple border border-input bg-background px-3 py-2 font-text text-[15px] text-foreground outline-none transition placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>

        <label className="space-y-2">
          <span className="font-text text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">��ǩ����ѡ��</span>
          <input
            type="text"
            value={tags}
            onChange={(event) => setTags(event.target.value)}
            placeholder="���磺����, ����, ֤��"
            className="w-full rounded-apple border border-input bg-background px-3 py-2 font-text text-[15px] text-foreground outline-none transition placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>

        <label className="space-y-2 md:col-span-2">
          <span className="font-text text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">ԭʼ�����ļ�</span>
          <input
            type="file"
            accept=".txt,.md,.markdown,.doc,.docx,.ppt,.pptx,.tex,.csv"
            onChange={(event) => setSourceFile(event.target.files?.[0] ?? null)}
            className="w-full rounded-apple border border-input bg-background px-3 py-2 font-text text-[14px] text-foreground outline-none file:mr-3 file:rounded-capsule file:border-0 file:bg-primary file:px-3 file:py-1 file:text-[12px] file:text-primary-foreground hover:file:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>

        <label className="space-y-2 md:col-span-2">
          <span className="font-text text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">����˵������ѡ��</span>
          <textarea
            value={extraInstruction}
            onChange={(event) => setExtraInstruction(event.target.value)}
            rows={3}
            placeholder="����д��������Ҫ���磺ǿ�������״�㡣"
            className="w-full rounded-apple border border-input bg-background px-3 py-2 font-text text-[14px] leading-[1.45] text-foreground outline-none transition placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>

        <label className="md:col-span-2 inline-flex items-center gap-2 font-text text-[13px] text-muted-foreground">
          <input
            type="checkbox"
            checked={overwrite}
            onChange={(event) => setOverwrite(event.target.checked)}
            className="h-4 w-4 rounded border-input text-primary focus:ring-ring"
          />
          �� slug �Ѵ��ڣ�����������бʼ�
        </label>

        <div className="md:col-span-2 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={submitting || (IS_CLOUD_MODE && !session?.token)}
            className="inline-flex items-center rounded-apple bg-primary px-5 py-2 font-text text-[15px] text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
          >
            {submitting ? "������..." : IS_CLOUD_MODE && !session?.token ? "���ȵ�¼" : "���ɲ�����ʼ�"}
          </button>

          <Link
            href="/notes"
            className="inline-flex items-center rounded-capsule border border-primary/60 px-4 py-1.5 font-text text-[14px] tracking-tightCaption text-primary transition hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            �鿴�ʼ��б�
          </Link>
        </div>
      </form>

      {noteAlreadyExists ? (
        <p className="mt-4 rounded-apple border border-border bg-muted/50 px-3 py-2 font-text text-[13px] leading-[1.45] text-muted-foreground">
          �ñ����Ӧ�� slug �Ѵ��ڣ���Ҫ�����빴ѡ��������ǡ���
        </p>
      ) : null}

      {error ? (
        <p className="mt-4 rounded-apple border border-[#b4232f]/30 bg-[#b4232f]/[0.08] px-3 py-2 font-text text-[13px] leading-[1.4] text-[#7f1820] dark:border-[#ff6a77]/35 dark:bg-[#ff6a77]/[0.12] dark:text-[#ffd5da]">
          {error}
        </p>
      ) : null}

      {result ? (
        <div className="mt-5 space-y-4">
          <div className="rounded-apple border border-primary/35 bg-primary/10 p-3">
            <p className="font-text text-[13px] leading-[1.45] text-foreground">
              �ѱ��� {result.fileName}
              {result.replaced ? "���Ѹ���ԭ�ļ�����" : "��"}
            </p>
            <Link
              href={buildNoteViewHref(result.slug)}
              className="mt-2 inline-flex items-center rounded-capsule border border-primary/60 px-4 py-1.5 font-text text-[14px] tracking-tightCaption text-primary transition hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              �����ɽ��
              <span className="ml-1">&gt;</span>
            </Link>
          </div>

          <section className="rounded-apple border border-border bg-card p-4">
            <p className="font-text text-[13px] font-semibold tracking-[0.06em] text-muted-foreground">
              ���ɺ���޸�Ԫ��Ϣ
              <span className="ui-en ml-1">Edit Metadata After Generation</span>
            </p>

            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <label className="space-y-1 md:col-span-2">
                <span className="font-text text-[12px] text-muted-foreground">����</span>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(event) => setEditTitle(event.target.value)}
                  placeholder="��ս������ǰ����"
                  className="w-full rounded-apple border border-input bg-background px-3 py-2 font-text text-[14px] text-foreground outline-none transition placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
                />
              </label>

              <label className="space-y-1">
                <span className="font-text text-[12px] text-muted-foreground">����</span>
                <input
                  type="text"
                  value={editTopic}
                  onChange={(event) => setEditTopic(event.target.value)}
                  placeholder="��ս��Զ�������������"
                  className="w-full rounded-apple border border-input bg-background px-3 py-2 font-text text-[14px] text-foreground outline-none transition placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
                />
              </label>

              <label className="space-y-1">
                <span className="font-text text-[12px] text-muted-foreground">��ǩ</span>
                <input
                  type="text"
                  value={editTags}
                  onChange={(event) => setEditTags(event.target.value)}
                  placeholder="�ö��ŷָ���磺����, �Ƶ�, ����"
                  className="w-full rounded-apple border border-input bg-background px-3 py-2 font-text text-[14px] text-foreground outline-none transition placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
                />
              </label>
            </div>

            <div className="mt-3">
              <button
                type="button"
                disabled={savingMeta}
                onClick={onSaveMetadata}
                className="inline-flex items-center rounded-capsule border border-primary/60 px-4 py-1.5 font-text text-[14px] tracking-tightCaption text-primary transition hover:underline disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {savingMeta ? "������..." : "����Ԫ��Ϣ�޸�"}
              </button>
            </div>
          </section>

          {result.note ? (
            <WeekCard
              href={buildNoteViewHref(result.note.slug)}
              weekLabelZh={result.note.weekLabelZh}
              weekLabelEn={result.note.weekLabelEn}
              zhTitle={result.note.zhTitle}
              enTitle={result.note.enTitle}
              descriptionZh={result.note.descriptionZh}
              descriptionEn={result.note.descriptionEn}
              tags={result.note.tags}
              className="max-w-[420px]"
            />
          ) : null}

          <details className="rounded-apple border border-border bg-card px-4 py-3">
            <summary className="cursor-pointer font-text text-[13px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Ԥ��ǰ����
            </summary>
            <pre className="mt-3 overflow-x-auto whitespace-pre-wrap rounded-apple bg-muted p-3 font-mono text-[12px] leading-[1.45] text-muted-foreground">
              {result.preview}
            </pre>
          </details>
        </div>
      ) : null}
    </section>
  );
}
