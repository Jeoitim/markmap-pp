---
title: Electron desktop development
outline: deep
---

# Electron desktop development

This page is for local development, packaging and desktop-specific behavior. For version choice, downloads and first use, see [Web and desktop apps](/en/app/); this page keeps the Electron workflow in one place.

## What the desktop app adds

| Capability | Web app | Desktop app |
| --- | --- | --- |
| Markdown editing, mind maps, Agent and GitHub sync | Yes | Yes |
| Native file dialogs | Browser-limited | Native open and save |
| Local Git workspace | Not directly available | Available inside a selected folder |
| Window and system integration | Browser tab | Standalone Electron window |

The desktop renderer shares the Web UI. The Electron main process handles windows, files, paths and local Git; the workspace stays inside a folder selected by the user.

## Development environment

- Node.js 22 or newer
- pnpm 10
- Local Git when using a local Git workspace

Install dependencies and start the desktop development environment from the repository root:

```bash
corepack enable
pnpm install
pnpm dev:desktop
```

## Build and package

```bash
# Compile the desktop main process and renderer assets
pnpm build:desktop

# Build a package for the selected platform
pnpm --filter markmap-plus-plus-desktop make:win
pnpm --filter markmap-plus-plus-desktop make:linux
pnpm --filter markmap-plus-plus-desktop make:mac
```

Windows and Linux release artifacts are built by GitHub Actions on native runners. Releases currently provide Windows x64 and Linux x64 packages; the macOS command is for local builds only. Artifacts are written to `apps/desktop/release/`.

## Local files, Git and security boundaries

- **Open** and **Save** use native file dialogs and do not scan folders the user has not selected.
- Local Git requires `git` on `PATH`; Windows can use Git for Windows and macOS can use the Git provided by Xcode Command Line Tools.
- The Electron renderer is isolated from the main process; file and Git operations go through controlled IPC interfaces.
- Linux sensitive settings prefer the system keyring. If no key service is available, the app refuses to save sensitive cache in plain text.
