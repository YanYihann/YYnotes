# Deploy YYNotes

[English README](../README.md) · [中文说明](../README.zh-CN.md)

The frontend and the Cloudflare Worker are separate deployments. Cloud account data lives in Neon; the repository contains source code and bundled example notes.

## 1. Set up Neon and the Worker

Create a Neon PostgreSQL database and execute [schema.sql](../cloud/neon-notes-worker/schema.sql) in its SQL editor. Configure the Worker from this directory:

```bash
cd cloud/neon-notes-worker
npm ci
npx wrangler secret put DATABASE_URL
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put AUTH_SECRET
```

Use a strong random value for `AUTH_SECRET`. If Google sign-in is needed, also set:

```bash
npx wrangler secret put GOOGLE_CLIENT_ID
```

Review [wrangler.toml](../cloud/neon-notes-worker/wrangler.toml) before deploying your own instance:

- `name`: choose your Worker name.
- `OPENAI_BASE_URL`: current configuration uses `https://api.302.ai/v1`.
- `OPENAI_MODEL`: current generation default is `deepseek-v3.2`; the implementation validates supported names.
- `ALLOWED_ORIGIN`: comma-separated browser origins allowed to call the Worker directly, without path suffixes.

```bash
npm run deploy
```

Record the resulting Worker origin. The Worker's `/health` route is a basic reachability check, not a full end-to-end AI/database test. For local Worker development use `npm run dev`; local secrets belong in an ignored `.dev.vars` file. Never commit the real database URL or signing/provider keys.

## 2. Vercel frontend

Import the GitHub repository into Vercel as a Next.js project. Keep `DEPLOY_TARGET` unset and use the build command in `vercel.json` (`npm run build`).

Set these variables for each environment you use:

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_NOTES_API_BASE` | `/api/cloud` |
| `NOTES_UPSTREAM_URL` | Your Worker origin, for example `https://your-worker.workers.dev` |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Optional OAuth web client ID, matching the Worker configuration |

The frontend uses `next.config.mjs` rewrites for cloud API requests. Generation has a dedicated `/api/cloud/notes/generate` route with a 300-second execution limit and a shorter upstream timeout. It forwards the bearer token; the Worker validates authentication and owns the database/provider credentials.

Public filesystem examples are read-only on Vercel. Personal note generation, editing, and organization use the Worker. Local filesystem and browser automation endpoints are blocked by middleware in a Vercel cloud deployment.

The project currently links to [yynotes.yanyihan.top](https://yynotes.yanyihan.top). Configure your own domain in Vercel and follow the DNS records it provides. A README link alone does not verify service availability.

## 3. Cloudflare Pages alternative

For static hosting, set these build variables:

```text
DEPLOY_TARGET=cloudflare-pages
NEXT_PUBLIC_NOTES_API_BASE=https://your-worker.workers.dev
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your-optional-google-client-id
```

Run `npm ci` and `npm run build`; publish `out/`. The build wrapper temporarily moves `app/api` out of the static build and restores it afterward. Static hosting has no Next.js API server or Vercel same-origin proxy, so the API base must be an absolute Worker URL and the Pages origin must be allowed by Worker CORS.

## 4. GitHub Actions

Existing workflows run for matching changes pushed to `master` and can also be started manually:

| Workflow | Scope |
| --- | --- |
| `deploy-pages.yml` | Static export and Cloudflare Pages deployment |
| `deploy-worker.yml` | Cloudflare Worker deployment |

Repository secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

Pages repository variables:

- `CLOUDFLARE_PAGES_PROJECT_NAME`
- `NEXT_PUBLIC_NOTES_API_BASE`: absolute Worker URL, not `/api/cloud`.
- `NEXT_PUBLIC_GOOGLE_CLIENT_ID`: optional when Google sign-in is enabled.
- `DEPLOY_TARGET`: defaults to `cloudflare-pages` in the workflow.

The workflow skips the deployment step when its Cloudflare credentials/configuration are missing. Worker secrets must be configured on the Worker itself; committing `wrangler.toml` does not upload secrets. Vercel Git integration is configured in Vercel separately.

## 5. Google sign-in

Use a Google OAuth **web application** client. Set `NEXT_PUBLIC_GOOGLE_CLIENT_ID` on the frontend and the corresponding `GOOGLE_CLIENT_ID` on the Worker. Add the exact frontend origin to the client's authorized JavaScript origins, including the scheme and development port where applicable. Rebuild after changing public frontend variables.

## 6. Check the deployment

1. Open the homepage and a bundled example note.
2. Check English/Chinese switching, theme controls, and mobile layout.
3. Register or sign in, then generate a short note from non-sensitive sample text.
4. Reload and confirm the cloud note persists; test editing, folders, Trash, and restoration.
5. Ask a question in the study assistant and verify streamed output.

Source uploads and note context can reach the configured AI provider. Keep provider credentials on the server/Worker. The source repository does not back up Neon data; arrange database backups separately.
