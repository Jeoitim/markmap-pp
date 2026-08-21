---
title: Web deployment and development
description: Deploy markmap++ to GitHub Pages, Cloudflare Pages or EdgeOne, and develop the web app and docs locally.
outline: deep
---

# Web deployment and development

This page covers the web app and documentation site. See [Export](/en/export/) for file formats and [Electron desktop development](/en/desktop/) for desktop windows.

## Local development

```bash
pnpm install
pnpm dev
pnpm --filter markmap-plus-plus-web lint
pnpm docs:dev
```

`pnpm dev` starts the web app and `pnpm docs:dev` starts VitePress. After making changes, run:

```bash
pnpm build:app
pnpm build:site
pnpm test
```

`build:site` builds the app at the root path and the docs under `/doc/`, then combines both outputs in `dist/`.

## GitHub Pages

The deployed structure is:

```text
https://jeoitim.github.io/markmap-pp/      # markmap++ app
https://jeoitim.github.io/markmap-pp/doc/  # VitePress docs
```

`.github/workflows/deploy-pages.yml` installs pnpm 10 and Node.js 22, checks the app, builds with `/markmap-pp/` and `/markmap-pp/doc/` bases, combines the outputs and publishes one Pages artifact. Set **Settings → Pages → Source** to **GitHub Actions**.

## Cloudflare Pages

| Setting | Value |
| --- | --- |
| Root directory | `/` |
| Build command | `pnpm build:site` |
| Output directory | `dist` |
| `NODE_VERSION` | `22` |
| `PNPM_VERSION` | `10` |

The default build uses `/` for the app and `/doc/` for the docs.

## EdgeOne Pages

Build from the repository root:

| Setting | Value |
| --- | --- |
| Root directory | `./` |
| Installation command | `pnpm install --frozen-lockfile` |
| Build command | `pnpm build:site` |
| Output directory | `dist` |
| Node.js | `22` |
| pnpm | `9` |

Do not set `apps/web` as the project root, or `packages/*` workspace dependencies will not resolve.

## Code structure

```text
markmap-pp/
├─ apps/web/                       # React web app
│  └─ src/components/
│     ├─ markdown-editor.tsx       # CodeMirror source editor
│     ├─ visual-markdown-editor.tsx# WYSIWYG visual editor
│     ├─ mermaid-renderer.ts       # Mermaid rendering and preview
│     ├─ pdf-export.ts              # Static vector PDF export
│     ├─ markdown-lint.ts           # Markdown checks
│     ├─ github-sync.ts             # GitHub API and IndexedDB
│     └─ markmap-hooks.tsx          # workspace and map interaction
├─ apps/desktop/                   # Electron desktop app
├─ packages/                       # shared markmap-lib and view packages
├─ docs/                           # VitePress documentation
└─ .github/workflows/              # deployment
```

## Upstream relationship

markmap++ is based on [Tem-man/markmap-plus](https://github.com/Tem-man/markmap-plus), which adds node editing and Markdown write-back to [markmap](https://github.com/markmap/markmap). This project extends the workspace, sync, file management, Agent, export and cross-device experience.
