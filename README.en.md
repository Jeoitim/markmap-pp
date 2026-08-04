# markmap++

A browser-based Markdown mind-map workspace with live editing, interactive visualization, high-resolution export, and GitHub-backed multi-device sync.

[![Deploy to GitHub Pages](https://github.com/Jeoitim/markmap-pp/actions/workflows/deploy-pages.yml/badge.svg)](https://github.com/Jeoitim/markmap-pp/actions/workflows/deploy-pages.yml)
[![Node.js 22+](https://img.shields.io/badge/Node.js-22%2B-43853d?logo=node.js&logoColor=white)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

[Live app](https://jeoitim.github.io/markmap-pp/) · [中文](README.md) · [Upstream project](https://github.com/Tem-man/markmap-plus)

## Overview

markmap++ is built on [Tem-man/markmap-plus](https://github.com/Tem-man/markmap-plus). Markdown remains the single source of truth, while the rendered mind map is an editable SVG view. The app adds a complete CodeMirror editor, persistent browser drafts, an IDE-style repository tree, manual GitHub commits, display settings, and multi-format export.

The application runs entirely in the browser. No application server or database is required.

## Key capabilities

- Live Markdown editing with syntax highlighting, search, line numbers, undo, and common-structure diagnostics.
- GFM tables, inline and display LaTeX, task checkboxes, and Markdown images, including automatic relayout after images load.
- Interactive mind maps with pan, zoom, branch folding, in-place node editing, creation, deletion, and Markdown write-back.
- Resizable desktop panes, a collapsible editor, fullscreen mode, and mobile editor/preview tabs.
- Light and dark themes with configurable editor and preview typography.
- Noto Sans SC, Noto Serif SC, LXGW WenKai, Inter Variable, and JetBrains Mono Variable fonts.
- Optional dotted preview background.
- Markdown, SVG, PNG, JPEG, and standalone HTML export with 1–4× rendering scale.
- GitHub repository browsing, persistent local drafts, file operations, status indicators, and conflict-safe manual pushes.

## Mind-map controls

| Input | Result |
| --- | --- |
| Single click | Select a node |
| Double click | Edit node text |
| Enter | Add a sibling when selected; save text while editing |
| Tab | Add a child node |
| Delete / Backspace | Delete the selected node |

## GitHub sync model

Remote Markdown files are downloaded into IndexedDB and remain available after a refresh. Edits are staged locally and are not committed on every keystroke. Pressing **Sync** combines all pending additions, edits, moves, renames, and deletions into one Git commit.

The repository tree supports collapsible folders, drag-and-drop moves, inline rename, and context-menu actions for create, copy, cut, paste, and delete.

| Indicator | Meaning |
| --- | --- |
| Gray dot | Remote file not downloaded on this device |
| Green dot | Local cache matches the remote revision |
| `A` | Added locally |
| `M` | Modified locally |
| `R` | Renamed or moved locally |
| `D` | Deleted locally |

Binding requires a fine-grained GitHub personal access token restricted to the target repository with **Contents: Read and write** permission. The token is stored only in the current browser's `localStorage`; it is never included in the repository, Pages build, or deployment workflow. Avoid binding repositories on shared or untrusted devices.

If the remote branch changes before a push, markmap++ refuses to overwrite it and asks the user to refresh. Empty folders remain local because Git does not track true empty directories.

## Local development

Requirements: Node.js 22+ and pnpm 10.

```bash
git clone https://github.com/Jeoitim/markmap-pp.git
cd markmap-pp
npm install --global pnpm@10
pnpm install
pnpm dev
```

Open `http://localhost:5173`.

Useful commands:

```bash
pnpm --filter markmap-plus-plus-app lint
pnpm build:app
pnpm test
pnpm --filter markmap-plus-plus-app preview
```

The production app is generated in `examples/react-example/dist/`.

## GitHub Pages deployment

The repository includes [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml). It installs dependencies, checks the app, builds it with the correct repository base path, uploads the Pages artifact, and deploys whenever `main` is updated. It can also be started manually from the Actions page.

For the first deployment, open **Settings → Pages** and select **GitHub Actions** as the publishing source. The resulting URL is normally `https://<username>.github.io/<repository>/`.

No repository secret is needed to deploy the app. Tokens entered by users at runtime do not pass through GitHub Actions.

## Cloudflare Pages deployment

Connect the repository from **Workers & Pages → Create application → Pages → Connect to Git**. Keep the monorepo root as the build root so that the application can resolve the local workspace packages.

| Setting | Value |
| --- | --- |
| Framework preset | React (Vite) or None |
| Root directory | `/` |
| Build command | `pnpm --filter markmap-plus-plus-app build` |
| Build output directory | `examples/react-example/dist` |
| `NODE_VERSION` | `22` |
| `PNPM_VERSION` | `10` |

Cloudflare Pages serves the project at the domain root, so do not reuse the GitHub Pages `--base "/markmap-pp/"` option. The default Vite base of `/` is correct.

For a direct upload instead of Git integration:

```bash
pnpm build:app
pnpm dlx wrangler pages deploy examples/react-example/dist --project-name markmap-pp
```

See the official [Cloudflare Pages Git integration](https://developers.cloudflare.com/pages/get-started/git-integration/) and [build configuration](https://developers.cloudflare.com/pages/configuration/build-configuration/) guides.

## EdgeOne Pages deployment

Import the GitHub repository into [EdgeOne Pages](https://pages.edgeone.ai/), associate `main` with Production, and use these build settings:

| Setting | Value |
| --- | --- |
| Framework preset | Vite or Custom |
| Root directory | `./` |
| Installation command | `pnpm install --frozen-lockfile` |
| Build command | `pnpm --filter markmap-plus-plus-app build` |
| Output directory | `examples/react-example/dist` |
| Node.js version | 22 |
| pnpm version | 9 |

EdgeOne's managed build environment currently supports pnpm 6–9, and pnpm 9 can read this repository's lockfile. Do not change the root to `examples/react-example`, because the application depends on `packages/*` workspace packages.

Optional CLI deployment:

```bash
pnpm build:app
npx edgeone pages deploy examples/react-example/dist \
  -n markmap-pp \
  -t "$EDGEONE_API_TOKEN" \
  -e production
```

Store `EDGEONE_API_TOKEN` as a CI secret rather than committing it. See the official EdgeOne [GitHub Actions guide](https://pages.edgeone.ai/document/use-github-actions) and [Build Guide](https://pages.edgeone.ai/document/build-guide/).

## Hosting comparison

| Platform | Default path | Preview deployments | Additional project credential |
| --- | --- | --- | --- |
| GitHub Pages | `/<repository>/` | This workflow deploys `main` only | None |
| Cloudflare Pages | Domain root `/` | Branches and pull requests | Git integration authorization |
| EdgeOne Pages | Domain root `/` | Production and Preview environments | Git authorization; API token for CLI deploys |

## Technology

- React 19, TypeScript, and Vite 8
- CodeMirror 6
- Markmap libraries and the editable `markmap-view-plus`
- GitHub REST Git Data API
- IndexedDB and localStorage
- pnpm workspace and Lerna

## Project layout

```text
markmap-pp/
├─ .github/workflows/         # GitHub Pages deployment
├─ examples/react-example/    # markmap++ web application
├─ packages/                  # Markmap workspace packages
├─ docs/                      # Upstream documentation
├─ package.json               # Workspace commands
└─ pnpm-workspace.yaml        # Workspace package mapping
```

## Upstream and license

This repository is derived from [Tem-man/markmap-plus](https://github.com/Tem-man/markmap-plus), which extends the original [markmap](https://github.com/markmap/markmap) renderer with editable nodes and Markdown write-back. markmap++ adds the end-user workspace and synchronization experience under `examples/react-example`.

Licensed under the [MIT License](LICENSE).
