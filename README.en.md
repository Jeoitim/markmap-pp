# markmap++

A browser-based Markdown knowledge and mind-map workspace with live editing, an AI note agent, reviewable repository changes, high-resolution export, and GitHub-backed multi-device sync.

[![Deploy to GitHub Pages](https://github.com/Jeoitim/markmap-pp/actions/workflows/deploy-pages.yml/badge.svg)](https://github.com/Jeoitim/markmap-pp/actions/workflows/deploy-pages.yml)
[![Node.js 22+](https://img.shields.io/badge/Node.js-22%2B-43853d?logo=node.js&logoColor=white)](https://nodejs.org/)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache--2.0-blue.svg)](LICENSE)

[Live app](https://jeoitim.github.io/markmap-pp/) · [App overview](https://jeoitim.github.io/markmap-pp/doc/en/app/) · [Documentation](https://jeoitim.github.io/markmap-pp/doc/) · [Agent guide](https://jeoitim.github.io/markmap-pp/doc/en/agent/) · [中文](README.md) · [Upstream project](https://github.com/Tem-man/markmap-plus)

## Overview

markmap++ is built on [Tem-man/markmap-plus](https://github.com/Tem-man/markmap-plus). Markdown remains the single source of truth, while the rendered mind map is an editable SVG view. The app adds a complete CodeMirror editor, persistent browser drafts, an IDE-style repository tree, an AI note and repository agent, manual GitHub commits, display settings, and multi-format export.

The application runs entirely in the browser. No application server or database is required.

## Key capabilities

- Live Markdown editing with syntax highlighting, search, line numbers, undo, and common-structure diagnostics.
- GFM tables, inline and display LaTeX, task checkboxes, and Markdown images, including automatic relayout after images load.
- Interactive mind maps with pan, zoom, branch folding, in-place node editing, creation, deletion, and Markdown write-back.
- Resizable desktop panes, a collapsible editor, fullscreen mode, and mobile editor/preview tabs.
- Light and dark themes with configurable editor and preview typography.
- Noto Sans SC, Noto Serif SC, LXGW WenKai, Inter Variable, and JetBrains Mono Variable fonts.
- Optional dotted preview background.
- Markdown, SVG, static vector PDF, PNG, JPEG, and standalone HTML export; the web PDF flow uses the print dialog and the desktop app saves directly.
- GitHub repository browsing, persistent local drafts, file operations, status indicators, and conflict-safe manual pushes.
- Chat and Edit Agent modes with note retrieval, model knowledge, reviewable diffs, operation memory, and explicit Git commit approval.

## AI Agent workflow

- **Chat** lists, searches, and reads relevant notes on demand, then combines those sources with the model's general knowledge, reasoning, counterexamples, and cross-domain connections.
- **Edit** reads the live file state before proposing per-file diffs. A proposal changes only the local draft after it is accepted.
- The context bar keeps the active note, Git branch, cached note count, and local change count visible throughout the task.
- Scope can be limited to the current file or expanded to cached repository notes; uncached Markdown can be loaded when needed.
- Tool activity, reasoning status, applied changes, and Git commit requests appear in the conversation instead of being hidden background actions.
- Editing an earlier question creates a switchable conversation branch. Question versions, answer versions, and the previous tail remain available.
- Conversation history includes Chat / Edit labels, pending-review counts, search, rename, delete, per-conversation Markdown export, and complete JSON import/export.
- Provider-specific profiles retain keys, endpoints, models, and fetched model lists when switching services.

The default maximum output is 16,000 tokens, the temperature is 0.3, and changes require confirmation. The token setting limits one model response rather than the model's full context window; 4,000–8,000 is usually sufficient for ordinary questions, while complex multi-file work can keep the default.

Built-in provider presets cover OpenAI, Anthropic, Google Gemini, Azure OpenAI, DeepSeek, Groq, Mistral AI, Moonshot / Kimi, Zhipu AI, Tencent Hunyuan, NVIDIA NIM, SiliconFlow, Ollama, and custom OpenAI-compatible endpoints.

Agent settings and conversations remain in the current browser. Configuration JSON backups **include API keys** to support one-step migration, so treat them as sensitive files. Model requests go directly from the browser to the selected provider. See the [Agent guide](https://jeoitim.github.io/markmap-pp/doc/agent/) for the complete workflow and security notes.

## Mind-map controls

| Input              | Result                                               |
| ------------------ | ---------------------------------------------------- |
| Single click       | Select a node                                        |
| Double click       | Edit node text                                       |
| Enter              | Add a sibling when selected; save text while editing |
| Tab                | Add a child node                                     |
| Delete / Backspace | Delete the selected node                             |

## GitHub sync model

Remote Markdown files are downloaded into IndexedDB and remain available after a refresh. Edits are staged locally and are not committed on every keystroke. Pressing **Sync** combines all pending additions, edits, moves, renames, and deletions into one Git commit.

GitHub sync is more than cloud storage: edit on a computer, desktop app or mobile browser, keep every confirmed version as a Git commit, review changes and restore an earlier version when needed. The Web app uses the GitHub API; the desktop app can also use a local Git workspace. In both cases, changes stay local until you confirm a push.

The repository tree supports collapsible folders, drag-and-drop moves, inline rename, and context-menu actions for create, copy, cut, paste, and delete.

| Indicator | Meaning                                   |
| --------- | ----------------------------------------- |
| Gray dot  | Remote file not downloaded on this device |
| Green dot | Local cache matches the remote revision   |
| `A`       | Added locally                             |
| `M`       | Modified locally                          |
| `R`       | Renamed or moved locally                  |
| `D`       | Deleted locally                           |

Binding requires a fine-grained GitHub personal access token restricted to the target repository with **Contents: Read and write** permission. The repository binding and token are stored only in the current browser's IndexedDB settings; they are never included in the repository, Pages build, or deployment workflow. Avoid binding repositories on shared or untrusted devices.

See the [detailed GitHub token tutorial](https://jeoitim.github.io/markmap-pp/doc/en/example/). Create the token under **Developer settings → Personal access tokens → Fine-grained tokens**, choose **Only select repositories**, and select only your note repository.

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
pnpm --filter markmap-plus-plus-web lint
pnpm build:app
pnpm test
pnpm --filter markmap-plus-plus-web preview
```

The production app is generated in `apps/web/dist/`.

## Electron desktop app (Beta)

The desktop app shares the React interface with the web app. Electron provides native windows, security isolation, local Markdown file access, and local Git workspace support. Read the [App overview](https://jeoitim.github.io/markmap-pp/doc/en/app/) first, then download the latest build from [GitHub Releases](https://github.com/Jeoitim/markmap-pp/releases). Pushing a version tag publishes these assets:

| Platform    | Release file    | Purpose                           |
| ----------- | --------------- | --------------------------------- |
| Windows x64 | `*-setup.exe`   | NSIS installer                    |
| Windows x64 | `*-portable.7z` | Portable archive; extract and run |
| Linux x64   | `*.AppImage`    | Standalone Linux application      |

To run the Linux package:

```bash
chmod +x markmap-plus-plus-*.AppImage
./markmap-plus-plus-*.AppImage
```

### macOS

Sorry, macOS builds are not currently published: GitHub-hosted macOS runners remained queued long enough to block the entire release. macOS users can download the source and try a native build instead. It produces a DMG for the local CPU architecture, but it is unsigned and may need to be allowed manually in macOS System Settings on first launch.

```bash
git clone https://github.com/Jeoitim/markmap-pp.git
cd markmap-pp
corepack enable
pnpm install
pnpm --filter markmap-plus-plus-desktop make:mac
```

Artifacts are written to `apps/desktop/release/`. Use `pnpm dev:desktop` for desktop development. See [`apps/desktop/README.md`](apps/desktop/README.md) and the [desktop documentation](docs/desktop/index.md) for details.

## GitHub Pages deployment

The repository includes [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml). It installs dependencies, checks the app, builds it with the correct repository base path, uploads the Pages artifact, and deploys whenever `main` is updated. It can also be started manually from the Actions page.

For the first deployment, open **Settings → Pages** and select **GitHub Actions** as the publishing source. The resulting URL is normally `https://<username>.github.io/<repository>/`.

No repository secret is needed to deploy the app. Tokens entered by users at runtime do not pass through GitHub Actions.

## Cloudflare Pages deployment

Connect the repository from **Workers & Pages → Create application → Pages → Connect to Git**. Keep the monorepo root as the build root so that the application can resolve the local workspace packages.

| Setting                | Value                                       |
| ---------------------- | ------------------------------------------- |
| Framework preset       | React (Vite) or None                        |
| Root directory         | `/`                                         |
| Build command          | `pnpm --filter markmap-plus-plus-web build` |
| Build output directory | `apps/web/dist`                             |
| `NODE_VERSION`         | `22`                                        |
| `PNPM_VERSION`         | `10`                                        |

Cloudflare Pages serves the project at the domain root, so do not reuse the GitHub Pages `--base "/markmap-pp/"` option. The default Vite base of `/` is correct.

For a direct upload of the standalone web app instead of Git integration:

```bash
pnpm build:app
pnpm dlx wrangler pages deploy apps/web/dist --project-name markmap-pp
```

See the official [Cloudflare Pages Git integration](https://developers.cloudflare.com/pages/get-started/git-integration/) and [build configuration](https://developers.cloudflare.com/pages/configuration/build-configuration/) guides.

## EdgeOne Pages deployment

Import the GitHub repository into [EdgeOne Pages](https://pages.edgeone.ai/), associate `main` with Production, and use these build settings:

| Setting              | Value                                       |
| -------------------- | ------------------------------------------- |
| Framework preset     | Vite or Custom                              |
| Root directory       | `./`                                        |
| Installation command | `pnpm install --frozen-lockfile`            |
| Build command        | `pnpm --filter markmap-plus-plus-web build` |
| Output directory     | `apps/web/dist`                             |
| Node.js version      | 22                                          |
| pnpm version         | 9                                           |

EdgeOne's managed build environment currently supports pnpm 6–9, and pnpm 9 can read this repository's lockfile. Keep the root directory at the repository root rather than changing it to `apps/web`, because the application depends on `packages/*` workspace packages.

Optional CLI deployment:

```bash
pnpm build:app
npx edgeone pages deploy apps/web/dist \
  -n markmap-pp \
  -t "$EDGEONE_API_TOKEN" \
  -e production
```

Store `EDGEONE_API_TOKEN` as a CI secret rather than committing it. See the official EdgeOne [GitHub Actions guide](https://pages.edgeone.ai/document/use-github-actions) and [Build Guide](https://pages.edgeone.ai/document/build-guide/).

## Hosting comparison

| Platform         | Default path     | Preview deployments                 | Additional project credential                |
| ---------------- | ---------------- | ----------------------------------- | -------------------------------------------- |
| GitHub Pages     | `/<repository>/` | This workflow deploys `main` only   | None                                         |
| Cloudflare Pages | Domain root `/`  | Branches and pull requests          | Git integration authorization                |
| EdgeOne Pages    | Domain root `/`  | Production and Preview environments | Git authorization; API token for CLI deploys |

## Technology

- React 19, TypeScript, and Vite 8
- CodeMirror 6
- Markmap libraries and the editable `markmap-view-plus`
- GitHub REST Git Data API
- IndexedDB and localStorage
- pnpm workspace

## Project layout

```text
markmap-pp/
├─ .github/workflows/         # GitHub Pages deployment
├─ apps/
│  ├─ web/                    # markmap++ web application and Agent UI
│  └─ desktop/                # Electron desktop application
├─ packages/                  # Markmap workspace packages
├─ docs/                      # Usage, Agent, sync, and deployment documentation
├─ package.json               # Workspace commands
└─ pnpm-workspace.yaml        # Workspace package mapping
```

## Contributors and thanks

Thanks to all contributors who submit code, improve documentation, report issues and share ideas for markmap++. The avatar strip updates automatically from the GitHub contribution graph:

<a href="https://github.com/Jeoitim/markmap-pp/graphs/contributors"><img src="https://contrib.rocks/image?repo=Jeoitim/markmap-pp" alt="markmap++ contributors" /></a>

## Upstream and license

This repository is derived from [Tem-man/markmap-plus](https://github.com/Tem-man/markmap-plus), which extends the original [markmap](https://github.com/markmap/markmap) renderer with editable nodes and Markdown write-back. markmap++ adds the end-user workspace, AI note and repository Agent, and synchronization experience under `apps/web`.

Markmap++ is licensed under the [Apache License 2.0](LICENSE). This project contains code derived from `markmap-plus` and other MIT-licensed upstream projects; their original copyright notices and license terms are preserved. See [NOTICE](NOTICE) and the individual package LICENSE files for details.
