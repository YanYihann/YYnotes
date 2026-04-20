import Link from "next/link";
import { HomeCloudNotesSections } from "@/components/home/home-cloud-notes-sections";
import { Component as EtheralShadow } from "@/components/ui/etheral-shadow";

export default async function HomePage() {
  return (
    <>
      <section className="section-dark relative isolate overflow-hidden">
        <div className="absolute inset-0 -z-20">
          <EtheralShadow
            className="h-full w-full"
            color="rgba(128, 128, 128, 1)"
            animation={{ scale: 100, speed: 90 }}
            noise={{ opacity: 1, scale: 1.2 }}
            sizing="fill"
            title={null}
          />
        </div>
        <div className="absolute inset-0 -z-10 bg-black/45" />

        <div className="mx-auto flex min-h-[calc(100dvh-3rem)] w-full max-w-[1100px] flex-col justify-center px-4 py-20 text-center sm:px-6">
          <p className="mx-auto mb-5 rounded-capsule border border-white/30 px-4 py-1 text-[12px] font-semibold uppercase tracking-[0.1em] text-white/75">
            YYNotes
            <span className="ui-en ml-1">Note Archive</span>
          </p>
          <h1 className="mx-auto max-w-[980px] font-display text-[clamp(2rem,7vw,3.5rem)] font-semibold leading-[1.07] tracking-tightDisplay text-white">
            YYNotes
            <span className="ui-en mt-2 block text-[0.54em] font-normal text-white/85">Bilingual Notes Across Subjects</span>
          </h1>
          <p className="mx-auto mt-6 max-w-[760px] font-text text-[17px] leading-[1.47] tracking-tightBody text-white/85">
            面向长期积累的双语笔记空间，支持中文主线与英文对照阅读�?            <span className="ui-en ml-1">
              A long-term bilingual note space with Chinese-first flow and optional English line-by-line support.
            </span>
          </p>

          <div className="mt-9 flex flex-wrap items-center justify-center">
            <Link
              href="/notes"
              className="inline-flex items-center rounded-apple bg-primary px-5 py-2 text-[17px] text-primary-foreground transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
            >
              浏览笔记
              <span className="ui-en ml-1">Browse Notes</span>
            </Link>
          </div>
        </div>
      </section>

      <HomeCloudNotesSections />

      <section className="section-light py-16">
        <div className="mx-auto w-full max-w-content px-4 sm:px-6">
          <h2 className="font-display text-[40px] font-semibold leading-[1.1] text-foreground">
            双语笔记格式说明
            <span className="ui-en mt-1 block text-[0.52em] font-normal text-muted-foreground">Bilingual Format Principle</span>
          </h2>
          <p className="mt-4 font-text text-[17px] leading-[1.47] text-muted-foreground">
            笔记默认按“中文在上、英文在下”展示，并支持英文一键隐藏，便于快速记忆�?            <span className="ui-en ml-1">
              Notes are displayed Chinese-first with optional English below, and English can be hidden in one click.
            </span>
          </p>
          <div className="mt-6 rounded-apple bg-card p-6 text-card-foreground shadow-card">
            <p className="font-text text-[14px] leading-[1.43] tracking-tightCaption text-muted-foreground">
              建议学习路径：先看目标与定义，再跟推导，最后完成练习题�?              <span className="ui-en ml-1">
                Recommended workflow: skim objectives, review definitions, follow derivations, then complete practice prompts.
              </span>
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
