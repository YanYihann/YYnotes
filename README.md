<!-- Improved compatibility of back to top link -->
<a id="readme-top"></a>

[![Contributors][contributors-shield]][contributors-url]
[![Forks][forks-shield]][forks-url]
[![Stargazers][stars-shield]][stars-url]
[![Issues][issues-shield]][issues-url]
[![License][license-shield]][license-url]

<br />
<div align="center">
  <h3 align="center">YYNotes</h3>
  <p align="center">
    General-purpose bilingual AI note generation workspace
    <br />
    <a href="https://github.com/YanYihann/YYnotes"><strong>Explore the docs</strong></a>
    <br />
    <br />
    <a href="https://yynotes.pages.dev">Live Demo</a>
    |
    <a href="https://github.com/YanYihann/YYnotes/issues">Report Bug</a>
    |
    <a href="https://github.com/YanYihann/YYnotes/issues">Request Feature</a>
  </p>
</div>

<details>
  <summary>Table of Contents</summary>
  <ol>
    <li>
      <a href="#about-the-project">About The Project</a>
      <ul>
        <li><a href="#built-with">Built With</a></li>
        <li><a href="#core-features">Core Features</a></li>
      </ul>
    </li>
    <li>
      <a href="#getting-started">Getting Started</a>
      <ul>
        <li><a href="#prerequisites">Prerequisites</a></li>
        <li><a href="#installation">Installation</a></li>
        <li><a href="#environment-variables">Environment Variables</a></li>
      </ul>
    </li>
    <li><a href="#usage">Usage</a></li>
    <li><a href="#api-overview">API Overview</a></li>
    <li><a href="#deployment">Deployment</a></li>
    <li><a href="#project-structure">Project Structure</a></li>
    <li><a href="#roadmap">Roadmap</a></li>
    <li><a href="#contributing">Contributing</a></li>
    <li><a href="#license">License</a></li>
    <li><a href="#contact">Contact</a></li>
    <li><a href="#acknowledgments">Acknowledgments</a></li>
  </ol>
</details>

## About The Project

YYNotes is a general-purpose AI note generation and study workspace. It turns raw learning materials, lecture notes, screenshots, documents, or pasted text into structured bilingual Markdown/MDX notes with Chinese-first and English-version output.

The project is not limited to one subject. It is designed for cross-course and cross-domain note workflows, including technical courses, humanities readings, language learning, exam review, research summaries, and formula-heavy materials that need stable KaTeX rendering.

It supports two working modes:
- Local mode: write/read notes from `笔记/*.mdx` and use local Next.js API routes.
- Cloud mode: authenticate users and manage notes/folders through a Cloudflare Worker + Neon PostgreSQL backend.

Typical workflows include:
- Generate bilingual notes from uploaded source files (`.txt/.md/.docx/.pptx`) or pasted content.
- Keep the Chinese version and English version structurally aligned.
- Preserve formulas, tables, code, images, derivations, examples, and important source details.
- Use a note-aware AI assistant with current-page context and selected text.
- Organize notes by folders, edit metadata, annotate notes, and sync cloud notes.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

### Built With

- [![Next.js][Next.js]][Next-url]
- [![React][React.js]][React-url]
- [![TypeScript][TypeScript]][TypeScript-url]
- [![Tailwind CSS][Tailwind]][Tailwind-url]
- [![Cloudflare][Cloudflare]][Cloudflare-url]
- [![Neon][Neon]][Neon-url]
- [![OpenAI][OpenAI]][OpenAI-url]

### Core Features

- Chinese-first + English Version bilingual note generation.
- Markdown/MDX rendering with formula-friendly KaTeX support.
- AI note generation using strict `prompt.md` rules.
- AI study assistant with page context, selected-text grounding, question history, file upload, and voice upload entry.
- Typora-like rendered note editing, including annotation mode and full-note editing.
- Image paste support that saves images as Markdown image syntax.
- Google Sign-In + email/password auth.
- Cloud note CRUD + folder management.
- Cloudflare Pages + Worker split deployment with GitHub Actions automation.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Getting Started

### Prerequisites

- Node.js 20+ (recommended)
- npm 10+
- Optional for cloud mode: Cloudflare account + Neon database

### Installation

1. Clone the repo
   ```bash
   git clone https://github.com/YanYihann/YYnotes.git
   cd YYnotes
   ```
2. Install dependencies
   ```bash
   npm install
   ```
3. Start development server
   ```bash
   npm run dev
   ```
4. Open
   ```text
   http://localhost:3000
   ```

### Environment Variables

Create `.env.local` in project root:

```bash
# Required for local AI generation / assistant API routes
OPENAI_API_KEY=your_openai_api_key

# Optional OpenAI-compatible model provider overrides
OPENAI_MODEL=gpt-4.1-mini
OPENAI_BASE_URL=https://api.openai.com/v1

# Required for cloud mode frontend
NEXT_PUBLIC_NOTES_API_BASE=https://<your-worker-domain>
NEXT_PUBLIC_GOOGLE_CLIENT_ID=<your-google-oauth-web-client-id>
```

Notes:
- If `NEXT_PUBLIC_NOTES_API_BASE` is missing, cloud login/cloud notes are disabled.
- Local note files are stored under `笔记/*.mdx`.
- The app saves notes as MDX so ordinary Markdown notes can later be extended with reusable React/MDX blocks when needed.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Usage

### Run locally

```bash
npm run dev
```

### Type check and lint

```bash
npm run typecheck
npm run lint
```

### Build

```bash
npm run build
```

### Main routes

- `/` Home + note generation entry
- `/auth` Login/Register (email + Google)
- `/notes` Notes index
- `/notes/[slug]` Local note detail viewer
- `/notes/cloud?slug=...` Cloud note detail viewer
- `/demos/sign-in` Sign-in UI demo

### Authoring Rules

- Generation prompt source: `prompt.md`
- Synced public copy: `public/prompt.md`
- Generated notes should follow the Chinese-first + English Version structure defined in `prompt.md`.
- Notes may be general Markdown, but are saved as `.mdx` for future support of reusable blocks, rich callouts, and interactive components.
- Formula-heavy content must remain compatible with `remark-math + rehype-katex`.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## API Overview

### Next.js local API routes

- `POST /api/note-generator`  
  Generate and save an MDX note from uploaded materials.
- `POST /api/notes-assistant`  
  Note-aware assistant response.
- `PATCH /api/notes?slug=...`  
  Update local note metadata or note content.
- `DELETE /api/notes?slug=...`  
  Delete local note file.

### Cloud Worker API (in `cloud/neon-notes-worker`)

- Auth: `/auth/register`, `/auth/login`, `/auth/google`, `/auth/me`
- Notes: `/notes`, `/notes/:slug`, `/notes/generate`
- Folders: `/folders`, `/folders/:id`
- Health: `/health`

All protected cloud endpoints require:

```http
Authorization: Bearer <token>
```

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Deployment

### GitHub Actions workflows

- `.github/workflows/deploy-pages.yml`
  - builds static export and deploys to Cloudflare Pages
  - triggers on push to `master`
- `.github/workflows/deploy-worker.yml`
  - deploys `cloud/neon-notes-worker`
  - includes retry strategy for transient Cloudflare API failures

### Required GitHub repository secrets/variables

Secrets:
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

Variables:
- `CLOUDFLARE_PAGES_PROJECT_NAME`
- `NEXT_PUBLIC_NOTES_API_BASE`
- `NEXT_PUBLIC_GOOGLE_CLIENT_ID`
- `NEXT_PUBLIC_NOTES_WRITE_KEY` (optional, if your worker setup uses it)

### Worker deployment (manual)

```bash
cd cloud/neon-notes-worker
npm install
wrangler secret put DATABASE_URL
wrangler secret put OPENAI_API_KEY
wrangler secret put AUTH_SECRET
wrangler secret put GOOGLE_CLIENT_ID
npm run deploy
```

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Project Structure

```text
YYnotes/
├─ app/                         # Next.js App Router pages + local APIs
├─ components/                  # UI and feature components
├─ lib/                         # shared utilities, auth, content, AI helpers
├─ 笔记/                        # local MDX notes
├─ cloud/neon-notes-worker/     # Cloudflare Worker backend + Neon schema
├─ functions/                   # Cloudflare Pages Functions examples
├─ prompt.md                    # AI generation rule source
└─ .github/workflows/           # CI/CD for Pages + Worker
```

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Roadmap

- [x] Cloud auth (email/password + Google)
- [x] Cloud note CRUD with user isolation
- [x] Folder management and note assignment
- [x] Bilingual rendering mode controls
- [x] AI assistant with contextual Q&A
- [x] Prompt box with file and voice upload entry
- [x] Rendered note editing with annotation mode
- [ ] Full speech-to-text pipeline for voice attachments
- [ ] More reusable MDX blocks for definitions, examples, warnings, summaries, practice, and subject-specific callouts
- [ ] Better visual docs and screenshots in README

See [open issues][issues-url] for ongoing tasks and proposals.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Contributing

Contributions are welcome.

1. Fork the project
2. Create your feature branch
   ```bash
   git checkout -b feature/amazing-feature
   ```
3. Commit your changes
   ```bash
   git commit -m "feat: add amazing feature"
   ```
4. Push to branch
   ```bash
   git push origin feature/amazing-feature
   ```
5. Open a Pull Request

If you find a bug or want a new feature, open an issue with clear reproduction steps / expected behavior.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## License

No `LICENSE` file has been added yet.

If you plan to open-source this project broadly, add a license (e.g. MIT/Apache-2.0) to clarify usage rights.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Contact

Yan Yihan  
Email: yanyihan@kean.edu

Project Link: [https://github.com/YanYihann/YYnotes](https://github.com/YanYihann/YYnotes)

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Acknowledgments

- [Best-README-Template](https://github.com/othneildrew/Best-README-Template)
- [Next.js](https://nextjs.org/)
- [Cloudflare Workers](https://developers.cloudflare.com/workers/)
- [Neon Serverless Postgres](https://neon.tech/)
- [OpenAI API](https://platform.openai.com/)
- [KaTeX](https://katex.org/)
- [shadcn/ui](https://ui.shadcn.com/)

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- MARKDOWN LINKS & IMAGES -->
[contributors-shield]: https://img.shields.io/github/contributors/YanYihann/YYnotes.svg?style=for-the-badge
[contributors-url]: https://github.com/YanYihann/YYnotes/graphs/contributors
[forks-shield]: https://img.shields.io/github/forks/YanYihann/YYnotes.svg?style=for-the-badge
[forks-url]: https://github.com/YanYihann/YYnotes/network/members
[stars-shield]: https://img.shields.io/github/stars/YanYihann/YYnotes.svg?style=for-the-badge
[stars-url]: https://github.com/YanYihann/YYnotes/stargazers
[issues-shield]: https://img.shields.io/github/issues/YanYihann/YYnotes.svg?style=for-the-badge
[issues-url]: https://github.com/YanYihann/YYnotes/issues
[license-shield]: https://img.shields.io/badge/license-not%20specified-lightgrey.svg?style=for-the-badge
[license-url]: https://github.com/YanYihann/YYnotes#license

[Next.js]: https://img.shields.io/badge/Next.js-000000?style=for-the-badge&logo=nextdotjs&logoColor=white
[Next-url]: https://nextjs.org/
[React.js]: https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB
[React-url]: https://react.dev/
[TypeScript]: https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white
[TypeScript-url]: https://www.typescriptlang.org/
[Tailwind]: https://img.shields.io/badge/Tailwind_CSS-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white
[Tailwind-url]: https://tailwindcss.com/
[Cloudflare]: https://img.shields.io/badge/Cloudflare-F38020?style=for-the-badge&logo=cloudflare&logoColor=white
[Cloudflare-url]: https://www.cloudflare.com/
[Neon]: https://img.shields.io/badge/Neon-00E599?style=for-the-badge&logo=neon&logoColor=0A0A0A
[Neon-url]: https://neon.tech/
[OpenAI]: https://img.shields.io/badge/OpenAI-412991?style=for-the-badge&logo=openai&logoColor=white
[OpenAI-url]: https://platform.openai.com/
