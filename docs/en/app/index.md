---
title: Web and desktop apps
outline: deep
---

# Web and desktop apps

markmap++ is a mind-map workspace where Markdown is the only source file. Use the Web app without installing anything, or download the desktop app when you need local files and a local Git workspace.

## Choose a version

| Version | Good for | Main capabilities |
| --- | --- | --- |
| [Web app](https://jeoitim.github.io/markmap-pp/) | Quick, cross-platform use without installation | Markdown editing, mind maps, Agent, and GitHub repository sync |
| Desktop app | Direct local file access or local Git workflows | The same UI plus native file dialogs and a local Git workspace |

## Download the desktop app

Download the latest build from [GitHub Releases](https://github.com/Jeoitim/markmap-pp/releases). A release normally includes:

- **Windows installer**: run `*-windows-x64-setup.exe`.
- **Windows portable package**: extract `*-windows-x64-portable.7z` and run the app.
- **Linux AppImage**: download it, make it executable, and run it.

Published packages currently target Windows x64 and Linux x64. There is no automated prebuilt macOS package yet; see the [Electron desktop development guide](/en/desktop/) for local builds and platform details.

::: warning Download safely
Windows packages are currently unsigned, so SmartScreen may show a warning. Confirm that the download comes from this project's GitHub Releases page and verify the release before running it.
:::

## First use

1. Open the Web app or install the desktop app from Releases.
2. Edit the welcome guide in the Markdown tab and watch the mind map update on the right.
3. Export Markdown when you need a file, or bind your own GitHub note repository from the **Repository** tab.
4. Continue on another device by opening the Web or desktop app, binding the same repository and syncing.

The welcome guide demonstrates the interface; it is not an automatically saved local file. Export important notes or sync them to your own repository.

## Web app and desktop app

Both versions share the editor, mind map, Agent and GitHub sync UI. The Web app stores drafts in the current browser; the desktop app additionally provides native file dialogs for opening and saving selected Markdown files. Neither version uploads your GitHub token to a markmap++ server.
