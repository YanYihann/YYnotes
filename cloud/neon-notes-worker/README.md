# YYNotes Cloud API

Cloudflare Worker backend for YYNotes, backed by Neon PostgreSQL. It serves both the Vercel frontend (through `/api/cloud`) and static frontends (through a direct API URL).

See the [deployment guide](../../docs/DEPLOYMENT.md) for database initialization, secrets, CORS, Google sign-in, and frontend configuration.

## Setup

Run [schema.sql](schema.sql) in Neon first, then:

```bash
npm ci
npx wrangler secret put DATABASE_URL
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put AUTH_SECRET
# Optional, for Google sign-in:
npx wrangler secret put GOOGLE_CLIENT_ID
npm run deploy
```

Review `wrangler.toml` before deploying. The current configuration uses `deepseek-v3.2` through `https://api.302.ai/v1`. Provider calls use Chat Completions, including SSE streaming for the assistant. A new model must be compatible with the generation allowlist, not just the environment configuration.

For local development, keep secrets in an ignored `.dev.vars` file and run `npm run dev`.

## API overview

Paths below are relative to the Worker origin. Protected routes require `Authorization: Bearer <token>` and scope data to the authenticated user.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Basic reachability check |
| `POST` | `/auth/register` | Email/password registration |
| `POST` | `/auth/login` | Email/password sign-in |
| `POST` | `/auth/google` | Google ID-token sign-in |
| `GET` | `/auth/me` | Current authenticated user |
| `POST` | `/assistant` | Contextual Q&A, optionally streamed |
| `GET`, `POST` | `/notes` | List notes/Trash or import a note |
| `GET`, `PATCH`, `DELETE` | `/notes/:slug` | Read, edit, move to Trash, or permanently delete |
| `POST` | `/notes/generate` | Generate bilingual content and save it |
| `POST` | `/notes/:slug/import-metadata` | Generate metadata for an imported note |
| `POST` | `/notes/:slug/restore` | Restore a note from Trash |
| `GET`, `POST`, `DELETE` | `/notes/:slug/highlights` | List/create/clear reading highlights |
| `DELETE` | `/notes/:slug/highlights/:id` | Delete a highlight |
| `GET`, `POST` | `/folders` | List/create folders |
| `PATCH`, `DELETE` | `/folders/:id` | Rename/reorder/delete a folder |

Check `src/index.js` for request fields and query options. The web client submits generation through `multipart/form-data`, including `sourceText` or `sourceFile`, `promptTemplate`, and optional metadata/instructions. The Vercel generation proxy enforces a 4 MiB file limit and a 35,000-character source limit.

## Verification

From the repository root:

```bash
npm run test:provider
npm run test:generation
```

These tests simulate database/provider behavior; they do not validate production credentials or create live notes.
