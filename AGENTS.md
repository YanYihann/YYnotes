# AGENTS.md

Project: YYNotes General-Purpose Bilingual AI Note Workspace

## Stack
- Next.js App Router
- TypeScript
- MDX / Markdown
- KaTeX via remark-math + rehype-katex
- shadcn/ui
- Cloudflare Pages + Cloudflare Worker
- Neon PostgreSQL for cloud mode

## Product Positioning
- This is a general note generation and study workspace, not a single-subject course website.
- The app should support notes for any course, reading, research topic, exam review, or knowledge domain.
- Quantitative and formula-heavy material is supported, but it must not be treated as the only target use case.
- Prefer generic labels such as "note", "topic", "folder", "source material", and "study assistant" in user-facing copy.

## Content Rules
- Generated notes should follow the active `prompt.md` rules.
- Default output structure is Chinese-first, then `English Version`.
- Chinese and English sections should be structurally aligned.
- Preserve important definitions, concepts, derivations, examples, code, tables, screenshots, images, and source details.
- Use consistent terminology across both language versions.
- Use formal notation when the source material requires formulas, but do not force mathematical framing onto non-math subjects.
- Keep formulas KaTeX-safe and compatible with `remark-math + rehype-katex`.
- Notes may be ordinary Markdown content saved as `.mdx`; only use MDX components when they add real value.
- Reusable MDX blocks can be used for definitions, examples, warnings, summaries, practice, callouts, or subject-specific content.

## UI Rules
- Clean academic / knowledge-work style.
- Responsive layout for desktop and mobile.
- Sidebar + TOC where useful, but content should remain readable without them.
- Good typography for bilingual text, formulas, tables, code, and long-form notes.
- Avoid copy that implies every note must be a weekly lesson or a chapter from one specific subject.

## Editing Rules
- Annotation mode must not modify the original note body directly; it inserts a clearly marked Markdown quote block.
- Full-edit mode may modify the entire note.
- Rendered editing should behave like a lightweight Typora-style editor where practical.
- Formula, code, and table blocks should render normally by default and reveal Markdown/source only when clicked for editing.
