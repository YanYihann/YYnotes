# Neon Notes Worker

This worker is the backend for GitHub Pages note generation and storage.

## Features

- `POST /auth/register`: create account and return auth token
- `POST /auth/login`: login and return auth token
- `GET /auth/me`: verify token and return current user
- `POST /notes/generate`: generate MDX via OpenAI and save to Neon
- `GET /notes`: list latest notes (current user only)
- `GET /notes/:slug`: get a single note (current user only)
- `PATCH /notes/:slug`: update metadata (and supports `folderId` assignment)
- `GET /folders`: list folders (current user only)
- `POST /folders`: create folder (current user only)
- `PATCH /folders/:id`: update folder name/order (current user only)
- `DELETE /folders/:id`: delete folder and unassign related notes (current user only)
- `DELETE /notes/:slug`: delete one note by slug (current user only)
- `GET /health`: health check

## 1) Prepare Neon

Run `schema.sql` in your Neon SQL console.

## 2) Configure Worker

```bash
cd cloud/neon-notes-worker
npm install
wrangler secret put DATABASE_URL
wrangler secret put OPENAI_API_KEY
wrangler secret put AUTH_SECRET
```

Edit `wrangler.toml` if needed:

- `ALLOWED_ORIGIN`: set your Pages origin, e.g. `https://yanyihann.github.io`
- `OPENAI_MODEL`: defaults to `gpt-4.1-mini`

All `/notes*` and `/assistant` endpoints require:

`Authorization: Bearer <token>`

## 3) Deploy

```bash
npm run deploy
```

After deploy, copy the worker URL, for example:

`https://neon-notes-worker.<subdomain>.workers.dev`

## 4) Connect GitHub Pages front-end

In GitHub repo settings:

- `Settings` -> `Secrets and variables` -> `Actions` -> `Variables`
- Add variable `NEXT_PUBLIC_NOTES_API_BASE`
- Value: your worker URL (without trailing slash)

Re-run Pages workflow. Front-end generator will switch to cloud mode automatically.

## 5) Request body for `POST /notes/generate`

```json
{
  "title": "Limits and Continuity Core Concepts",
  "topic": "Calculus Basics",
  "tags": "definition, theorem, proof",
  "sourceText": "...raw source text...",
  "extraInstruction": "...optional...",
  "overwrite": false,
  "promptTemplate": "...content of prompt.md..."
}
```

Auth endpoints return bearer tokens. Use them for all notes requests:

`Authorization: Bearer <token>`
