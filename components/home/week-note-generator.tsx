"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { WeekCard } from "@/components/week-card";

type ExistingWeek = {
  weekNumber: number;
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
};

type GenerationResult = {
  success: boolean;
  weekNumber: number;
  slug: string;
  replaced: boolean;
  note: GeneratedNote | null;
  fileName: string;
  preview: string;
};

type WeekNoteGeneratorProps = {
  existingWeeks: ExistingWeek[];
};

export function WeekNoteGenerator({ existingWeeks }: WeekNoteGeneratorProps) {
  const router = useRouter();
  const [weekNumber, setWeekNumber] = useState(() => {
    const maxWeek = existingWeeks.reduce((max, week) => Math.max(max, week.weekNumber), 0);
    return maxWeek + 1;
  });
  const [overwrite, setOverwrite] = useState(false);
  const [extraInstruction, setExtraInstruction] = useState("");
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<GenerationResult | null>(null);

  const existingWeekSet = useMemo(() => {
    return new Set(existingWeeks.map((week) => week.weekNumber));
  }, [existingWeeks]);

  const weekAlreadyExists = existingWeekSet.has(weekNumber);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!sourceFile) {
      setError("Please choose a source document first.");
      return;
    }

    if (!Number.isFinite(weekNumber) || weekNumber < 1 || weekNumber > 99) {
      setError("Please enter a valid week number (1-99).");
      return;
    }

    setSubmitting(true);
    setError("");
    setResult(null);

    try {
      const body = new FormData();
      body.append("weekNumber", String(weekNumber));
      body.append("sourceFile", sourceFile);
      body.append("overwrite", overwrite ? "true" : "false");
      if (extraInstruction.trim()) {
        body.append("extraInstruction", extraInstruction.trim());
      }

      const response = await fetch("/api/week-note-generator", {
        method: "POST",
        body,
      });

      const json = (await response.json().catch(() => null)) as { error?: string } & Partial<GenerationResult> | null;

      if (!response.ok || !json) {
        throw new Error(json?.error || "Generation failed. Please retry.");
      }

      if (!json.success || !json.slug) {
        throw new Error("Generation returned an invalid payload.");
      }

      setResult(json as GenerationResult);
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Generation failed. Please retry.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="mb-8 rounded-apple bg-white p-5 shadow-card dark:bg-[#272729]">
      <div className="mb-4">
        <h3 className="font-display text-[28px] font-normal leading-[1.14] tracking-[0.196px] text-[#1d1d1f] dark:text-white">
          Upload Source to Generate New Week
          <span className="ui-en mt-1 block font-text text-[15px] leading-[1.43] tracking-tightCaption text-black/62 dark:text-white/66">
            Auto-generate weekN.mdx from your course material
          </span>
        </h3>
        <p className="mt-2 max-w-[860px] font-text text-[14px] leading-[1.45] tracking-tightCaption text-black/75 dark:text-white/75">
          Upload your notes, set the target week, and AI will generate a new MDX note in the same structure as existing weeks.
          <span className="ui-en ml-1">Recommended formats: txt / md / markdown / docx.</span>
        </p>
      </div>

      <form onSubmit={onSubmit} className="grid gap-4 md:grid-cols-[180px_minmax(0,1fr)]">
        <label className="space-y-2">
          <span className="font-text text-[12px] font-semibold uppercase tracking-[0.08em] text-black/60 dark:text-white/60">
            Week
          </span>
          <input
            type="number"
            min={1}
            max={99}
            value={weekNumber}
            onChange={(event) => setWeekNumber(Number(event.target.value))}
            className="w-full rounded-apple border border-black/15 bg-white px-3 py-2 font-text text-[15px] text-black/85 outline-none transition focus-visible:ring-2 focus-visible:ring-[#0071e3] dark:border-white/20 dark:bg-[#202022] dark:text-white/86"
          />
        </label>

        <label className="space-y-2">
          <span className="font-text text-[12px] font-semibold uppercase tracking-[0.08em] text-black/60 dark:text-white/60">
            Source File
          </span>
          <input
            type="file"
            accept=".txt,.md,.markdown,.docx,.tex,.csv"
            onChange={(event) => setSourceFile(event.target.files?.[0] ?? null)}
            className="w-full rounded-apple border border-black/15 bg-white px-3 py-2 font-text text-[14px] text-black/80 outline-none file:mr-3 file:rounded-capsule file:border-0 file:bg-[#0071e3] file:px-3 file:py-1 file:text-[12px] file:text-white hover:file:bg-[#0066cc] focus-visible:ring-2 focus-visible:ring-[#0071e3] dark:border-white/20 dark:bg-[#202022] dark:text-white/82"
          />
        </label>

        <label className="space-y-2 md:col-span-2">
          <span className="font-text text-[12px] font-semibold uppercase tracking-[0.08em] text-black/60 dark:text-white/60">
            Extra Instruction (Optional)
          </span>
          <textarea
            value={extraInstruction}
            onChange={(event) => setExtraInstruction(event.target.value)}
            rows={3}
            placeholder="Example: emphasize theorem derivations and include practice tasks."
            className="w-full rounded-apple border border-black/15 bg-white px-3 py-2 font-text text-[14px] leading-[1.45] text-black/85 outline-none transition placeholder:text-black/45 focus-visible:ring-2 focus-visible:ring-[#0071e3] dark:border-white/20 dark:bg-[#202022] dark:text-white/86 dark:placeholder:text-white/45"
          />
        </label>

        <label className="md:col-span-2 inline-flex items-center gap-2 font-text text-[13px] text-black/72 dark:text-white/76">
          <input
            type="checkbox"
            checked={overwrite}
            onChange={(event) => setOverwrite(event.target.checked)}
            className="h-4 w-4 rounded border-black/25 text-[#0071e3] focus:ring-[#0071e3] dark:border-white/30"
          />
          Overwrite existing week file (if already present)
        </label>

        <div className="md:col-span-2 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center rounded-apple bg-[#0071e3] px-5 py-2 font-text text-[15px] text-white transition hover:bg-[#0066cc] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071e3] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
          >
            {submitting ? "Generating..." : "Generate and Save Week MDX"}
          </button>

          <Link
            href="/notes"
            className="inline-flex items-center rounded-capsule border border-[#0066cc] px-4 py-1.5 font-text text-[14px] tracking-tightCaption text-[#0066cc] transition hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071e3] dark:border-[#2997ff] dark:text-[#2997ff]"
          >
            View Notes
          </Link>
        </div>
      </form>

      {weekAlreadyExists ? (
        <p className="mt-4 rounded-apple border border-black/15 bg-black/[0.03] px-3 py-2 font-text text-[13px] leading-[1.45] text-black/72 dark:border-white/16 dark:bg-white/[0.06] dark:text-white/74">
          Week {weekNumber} already exists. Enable overwrite to replace it.
        </p>
      ) : null}

      {error ? (
        <p className="mt-4 rounded-apple border border-[#b4232f]/30 bg-[#b4232f]/[0.08] px-3 py-2 font-text text-[13px] leading-[1.4] text-[#7f1820] dark:border-[#ff6a77]/35 dark:bg-[#ff6a77]/[0.12] dark:text-[#ffd5da]">
          {error}
        </p>
      ) : null}

      {result ? (
        <div className="mt-5 space-y-4">
          <div className="rounded-apple border border-[#0071e3]/30 bg-[#0071e3]/[0.06] p-3 dark:border-[#2997ff]/45 dark:bg-[#2997ff]/[0.08]">
            <p className="font-text text-[13px] leading-[1.45] text-black/82 dark:text-white/84">
              Saved {result.fileName}
              {result.replaced ? " (replaced existing file)." : "."}
            </p>
            <Link
              href={`/notes/${result.slug}`}
              className="mt-2 inline-flex items-center rounded-capsule border border-[#0066cc] px-4 py-1.5 font-text text-[14px] tracking-tightCaption text-[#0066cc] transition hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071e3] dark:border-[#2997ff] dark:text-[#2997ff]"
            >
              Open Generated Week
              <span className="ml-1">&gt;</span>
            </Link>
          </div>

          {result.note ? (
            <WeekCard
              href={`/notes/${result.note.slug}`}
              weekLabelZh={result.note.weekLabelZh}
              weekLabelEn={result.note.weekLabelEn}
              zhTitle={result.note.zhTitle}
              enTitle={result.note.enTitle}
              descriptionZh={result.note.descriptionZh}
              descriptionEn={result.note.descriptionEn}
              className="max-w-[420px]"
            />
          ) : null}

          <details className="rounded-apple border border-black/12 bg-white px-4 py-3 dark:border-white/12 dark:bg-[#1f1f21]">
            <summary className="cursor-pointer font-text text-[13px] font-semibold uppercase tracking-[0.08em] text-black/62 dark:text-white/64">
              Preview First Lines
            </summary>
            <pre className="mt-3 overflow-x-auto whitespace-pre-wrap rounded-apple bg-black/[0.04] p-3 font-mono text-[12px] leading-[1.45] text-black/75 dark:bg-white/[0.08] dark:text-white/80">
              {result.preview}
            </pre>
          </details>
        </div>
      ) : null}
    </section>
  );
}

