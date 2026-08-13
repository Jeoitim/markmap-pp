---
title: Electron desktop app
outline: deep
---

# Electron desktop app

The markmap++ desktop app shares the editor and mind-map UI with the web app. Electron provides native windows, an isolated renderer, Markdown file access and local Git workspaces; the browser version remains available online.

## Download and install

Release builds are published on [GitHub Releases](https://github.com/Jeoitim/markmap-pp/releases). After a version tag is pushed, the release workflow builds these x64 artifacts:

| Platform | File | Use |
| --- | --- | --- |
| Windows | `markmap-plus-plus-*-windows-x64-setup.exe` | Run the installer |
| Windows | `markmap-plus-plus-*-windows-x64-portable.7z` | Extract and run `markmap-plus-plus.exe` |
| Linux | `markmap-plus-plus-*-linux-x86_64.AppImage` | Grant execute permission and run |

```bash
chmod +x markmap-plus-plus-*.AppImage
./markmap-plus-plus-*.AppImage
```

Some Linux distributions require a FUSE compatibility package for AppImage.

::: warning Unsigned Windows installer
Windows packages are not currently code-signed. SmartScreen may show a warning; download releases only from this project's GitHub repository.
:::

## macOS: no prebuilt package yet

macOS DMG builds are not currently included in Releases. macOS users can build locally:

```bash
git clone https://github.com/Jeoitim/markmap-pp.git
cd markmap-pp
corepack enable
pnpm install
pnpm --filter markmap-plus-plus-desktop make:mac
```

Artifacts are written to `apps/desktop/release/`. The first launch of an unsigned app may require approval in **System Settings → Privacy & Security**.

## Local development and packaging

Run these commands from the repository root:

```bash
pnpm dev:desktop
pnpm build:desktop
pnpm --filter markmap-plus-plus-desktop make:win
pnpm --filter markmap-plus-plus-desktop make:linux
pnpm --filter markmap-plus-plus-desktop make:mac
```

## Local files and Git

- **Open** and **Save** use native file dialogs; the desktop app can read and write selected Markdown files.
- Local workspaces stay inside the folder selected by the user.
- Local Git features require `git` on `PATH`.
- Sensitive Linux configuration uses the system keyring; if no key service is available, the app refuses to save sensitive cache in plain text.
