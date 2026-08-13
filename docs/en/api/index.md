---
title: Export, deploy and develop
outline: deep
---

# Export, deploy and develop

## Export formats

| Format | Characteristics | Recommended use |
| --- | --- | --- |
| Markdown | Keeps source structure and remains editable | Long-term storage and Git history |
| SVG | Vector content stays sharp at any scale | Print, layout and design tools |
| PNG | Lossless bitmap | Documents, presentations and social platforms |
| JPEG | Smaller file | Quick sharing and previews |
| HTML | Standalone page with vector display | Offline viewing and web archives |

PNG and JPEG support a 1–4× render scale. SVG and HTML remain sharp because they use vector content.

## GitHub Pages

The deployed structure is:

```text
https://jeoitim.github.io/markmap-pp/       # markmap++ app
https://jeoitim.github.io/markmap-pp/doc/   # VitePress documentation
```

`.github/workflows/deploy-pages.yml` installs pnpm 10 and Node.js 22, checks the app, runs `pnpm build:site` with `/markmap-pp/` and `/markmap-pp/doc/` bases, combines the app and docs in `dist/`, and publishes one Pages artifact. Set **Settings → Pages → Source** to **GitHub Actions**.

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

Use `./` as the root, `pnpm install --frozen-lockfile` as the installation command, `pnpm build:site` as the build command and `dist` as the output directory. Keep builds at the repository root so `packages/*` workspace dependencies resolve correctly.

## Code structure

```text
markmap-pp/
├─ apps/
│  ├─ web/                       # markmap++ React app
│  │  └─ src/components/
│  │     ├─ markdown-editor.tsx  # CodeMirror editor
│  │     ├─ markdown-lint.ts     # Markdown checks
│  │     ├─ github-sync.ts       # GitHub API and IndexedDB
│  │     └─ markmap-hooks.tsx    # workspace and map interaction
│  └─ desktop/                   # Electron desktop app
├─ packages/
│  ├─ markmap-lib/               # Markdown conversion
│  ├─ markmap-view-plus/         # Editable SVG map
│  └─ markmap-toolbar/           # Map toolbar
├─ docs/                         # markmap++ VitePress docs
└─ .github/workflows/            # deployment
```

## Common commands

```bash
pnpm dev
pnpm --filter markmap-plus-plus-web lint
pnpm build:app
pnpm build:site
pnpm docs:dev
pnpm docs:build
pnpm test
```

## Upstream relationship

markmap++ is based on [Tem-man/markmap-plus](https://github.com/Tem-man/markmap-plus), which adds node editing and Markdown write-back to [markmap](https://github.com/markmap/markmap). This project extends it with the end-user workspace, sync, file management, export and cross-device experience.
