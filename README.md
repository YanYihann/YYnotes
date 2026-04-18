# Numerical Analysis Bilingual Study Site

A Next.js App Router + TypeScript + MDX study site for bilingual numerical analysis notes, now extended with interactive numerical method demos.

## Run Locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## AI Note Assistant Setup

The note pages include a context-aware AI study assistant panel.

Required environment variables (create `.env.local`):

```bash
OPENAI_API_KEY=your_api_key_here
OPENAI_MODEL=gpt-4.1-mini
OPENAI_BASE_URL=https://api.openai.com/v1
```

If you use a proxy endpoint, set for example:

```bash
OPENAI_BASE_URL=https://api.openai-proxy.org/v1
```

- API route: `/api/notes-assistant`
- Backend tries `responses` first and automatically falls back to `chat/completions` for proxy compatibility.
- Desktop: assistant panel appears beside note content.
- Mobile: assistant opens via floating button + bottom sheet.
- The assistant is context-aware by week/page content and supports selected-text Q&A.

## Auto-Generate New Week Notes from Upload

Homepage "Weekly Study Modules" now includes an upload generator panel.

Flow:

1. Upload a source file (`txt`, `md`, `markdown`, `docx` recommended).
2. Enter target week number (for example `8`).
3. Optionally add extra generation instruction and enable overwrite.
4. Submit to generate and save `week8.mdx` automatically.

What it does:

- API route: `/api/week-note-generator`
- Reads your uploaded source text.
- Uses existing `week1`-`week7` note style as reference.
- Calls OpenAI to generate MDX with frontmatter.
- Saves the file to project root as `week{n}.mdx`.
- Returns a preview and open-link to `/notes/week-{n}`.

Notes:

- Requires the same AI env vars as assistant (`OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_BASE_URL`).
- Existing file is protected unless "overwrite" is enabled.
- If your file type is not text-readable, convert it to `txt`/`md`/`docx` first.

## Core Routes

- `/` homepage
- `/notes` weekly notes index
- `/notes/week-{n}` week detail page
- `/api/notes-assistant` context-aware AI endpoint for note pages
- `/demos` interactive demo index
- `/demos/numerical-differentiation`
- `/demos/numerical-integration`
- `/demos/integration-comparison`
- `/demos/romberg`

## Content Architecture

- Weekly sources are auto-discovered from:
  - project root: `week*.mdx`
  - optional folder: `content/weeks/week*.mdx`
- Routes are generated automatically as `/notes/week-{number}` unless a custom `slug` is provided in frontmatter.
- Frontmatter is optional.

Supported frontmatter fields:

```yaml
---
title: Week 8 - Numerical Differentiation
description: Bilingual notes on finite differences.
week: 8
order: 8
slug: week-8
---
```

Fallback behavior when frontmatter is missing:

- `week` and `order` are inferred from filename (`week8.mdx` -> `8`)
- `title` falls back to `Week 8`
- Chinese title falls back to `第8周` (or is extracted from the top-level Chinese `#` heading when present)
- `description` falls back to the first non-heading paragraph
- `slug` falls back to `week-8`

## Adding Week 8+

1. Add a new file named like `week8.mdx` (or put it in `content/weeks/week8.mdx`).
2. Optionally add frontmatter for title/description/slug.
3. Recommended: keep top-level bilingual headings in this order for best title extraction:
   - `# Week 8: ...`
   - `# 第8周：...`
4. Restart `npm run dev` if needed.
5. Homepage, `/notes`, and prev/next navigation update automatically.

## Interactive Demo System

### Implemented demos

- Numerical Differentiation:
  - Forward Difference
  - Backward Difference
  - Central Difference / 3-point first derivative
  - 3-point second derivative
- Numerical Integration:
  - Right Endpoint Approximation
  - Trapezoidal Rule
  - Simpson's 1/3 Rule
- Integration Method Comparison:
  - side-by-side approximations and errors
  - convergence trend as `n` increases
- Romberg Extrapolation:
  - trapezoidal refinement base
  - Romberg table and final extrapolated estimate

### Note-to-demo mapping

- `week-5`: numerical differentiation demo
- `week-6`: numerical integration + integration comparison demos
- `week-7`: integration comparison + Romberg demo

Related demo cards are rendered contextually on matching week pages.

### Demo architecture

- Numerical logic: `lib/numerical/*`
- Reusable demo UI + plots: `components/demos/*`
- Demo routes: `app/demos/*`
- Note mapping: `lib/numerical/demo-catalog.ts`

## Adding Future Demos

1. Add reusable numerical logic under `lib/numerical/`.
2. Add UI components under `components/demos/` (prefer reusing existing core/table/plot components).
3. Create a route under `app/demos/<your-demo>/page.tsx`.
4. Register the demo in `lib/numerical/demo-catalog.ts`.
5. Map it to related week slugs via `linkedWeeks` in the same catalog file.
6. Add a card on `/demos` (auto-driven by catalog entries).

## MDX Study Blocks

The following reusable blocks are available inside MDX:

- `<TheoremBlock>`
- `<DefinitionBlock>`
- `<ExampleBlock>`
- `<WarningBlock>`
- `<SummaryBlock>`
- `<FormulaBlock>`
- `<PracticeQuestionBlock>`
- `<InteractiveDemoCard>`
- `<TryThisDemoBlock>`
