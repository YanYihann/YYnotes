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

## Cloudflare Pages Functions + Neon (cloud mode)

Cloudflare Pages serves the static front-end, and Neon + Worker handles note generation/storage.

This repo includes the Cloudflare Worker backend:

- `cloud/neon-notes-worker/README.md`
- `cloud/neon-notes-worker/schema.sql`
- `cloud/neon-notes-worker/src/index.js`

And a Pages Functions directory (example endpoint):

- `functions/api/health.js`

### Required GitHub repo settings for auto deploy

Secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

Variables:

- `CLOUDFLARE_PAGES_PROJECT_NAME` (your Cloudflare Pages project name)
- `NEXT_PUBLIC_NOTES_API_BASE=https://<your-worker-domain>`
- `NEXT_PUBLIC_NOTES_WRITE_KEY` (optional, only if worker uses `WRITE_API_KEY`)

## Workflows

This repo has two deployment workflows:

1. `.github/workflows/deploy-pages.yml`
   - Deploy static site to Cloudflare Pages
   - Trigger: push to `master`
2. `.github/workflows/deploy-worker.yml`
   - Deploy Worker backend
   - Trigger: push to `master` and changes under `cloud/neon-notes-worker/**`

## Main routes

- `/` home
- `/notes` notes index
- `/notes/[slug]` note detail
