# YYNotes

A bilingual note site built with Next.js + MDX.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Note storage layout

All local note files are stored in:

- `笔记/*.mdx`

The app reads notes from this folder and local generation also writes into this folder.

## AI setup (local)

Create `.env.local`:

```bash
OPENAI_API_KEY=your_api_key_here
OPENAI_MODEL=gpt-4.1-mini
OPENAI_BASE_URL=https://api.openai.com/v1
```

## Local APIs

- `POST /api/note-generator`: generate MDX note from uploaded source using `prompt.md`
- `POST /api/notes-assistant`: note-aware AI assistant
- `POST /api/week-note-generator`: deprecated, returns 410

## Prompt rule

`prompt.md` in project root is the generation instruction source.
Generation must follow this prompt strictly.

## GitHub Pages + Neon (cloud mode)

GitHub Pages is static, so it cannot write files directly.
Use an external API backend to generate and store notes.

This repo includes a Cloudflare Worker template + Neon integration:

- `cloud/neon-notes-worker/README.md`
- `cloud/neon-notes-worker/schema.sql`
- `cloud/neon-notes-worker/src/index.js`

### Connect Pages to cloud API

1. Deploy the worker backend.
2. In GitHub repo settings, add Actions variable:
   - `NEXT_PUBLIC_NOTES_API_BASE=https://<your-worker-domain>`
3. Re-run Pages deployment.

When this variable is set, the front-end generator switches to cloud mode automatically.

## GitHub Pages workflow

Pages workflow file:

- `.github/workflows/deploy-pages.yml`

It injects:

- `NEXT_PUBLIC_NOTES_API_BASE` (from GitHub Actions Variables)

## Main routes

- `/` home
- `/notes` notes index
- `/notes/[slug]` note detail
