---
title: Overview
outline: deep
---

# Overview

markmap++ is a browser-based knowledge and mind-map workspace where Markdown is the only content source. It builds on the editable map capabilities of `Tem-man/markmap-plus` and adds a full editor, file management, local caching, Agent Q&A and reviewable changes, GitHub sync, community themes, centralized preferences and high-resolution export.

## How it works

```text
Markdown text
    ├─ Editor: source / WYSIWYG visual modes, highlighting, spell check and undo
    ├─ Markmap view: zoom, collapse, add, edit and delete nodes
    ├─ Mermaid documents: source editing, SVG preview and standalone export
    ├─ Browser cache: settings, repository bindings and local drafts
    ├─ Agent: note retrieval, general Q&A, diff review and action memory
    ├─ GitHub repository: multi-device files and commit history
    └─ Export: MD / Mermaid / SVG / PDF / PNG / JPEG / HTML
```

Editor changes are converted to a mind map in real time. Editing, adding or deleting nodes in the map writes the structure back to Markdown. You keep portable plain text while gaining a visual editing experience.

Appearance and editing behavior are managed from **Help → Preferences**. Theme presets can control the UI, editor and preview together; syntax highlighting and the canvas background follow the theme by default but can be overridden independently. Markmap branch lines adapt their lightness to the background, while document metadata such as `options.color` always remains authoritative.

## Where data is stored

| Data | Storage | Synced with the device |
| --- | --- | --- |
| Welcome guide | Built into the app | Restored on a fresh start |
| Preferences, fonts and editor mode | `localStorage` | No |
| GitHub binding and token | IndexedDB | No |
| Agent provider settings and API keys | IndexedDB | No |
| Agent history and review state | IndexedDB | No |
| Pulled files and drafts | IndexedDB | No |
| Confirmed Markdown sync | GitHub repository | Yes |
| Exported files | Device downloads | User-managed |

::: tip Recommended workflow
Use direct editing and Markdown export for temporary work. Use GitHub sync for long-term storage, version history and cross-device continuation.
:::

## Why sync is not automatic on every keystroke

Creating a Git commit for every character would create noisy history and more conflicts across devices. markmap++ stages changes locally and syncs only after you confirm:

1. Open a repository Markdown file and cache it on the current device.
2. Edit, rename, move, create or delete files.
3. Review `A`, `M`, `R` and `D` states in the file tree.
4. Click **Sync** to combine pending actions into one commit.

## Project boundaries

- The app is a static front end and does not provide accounts or a server database.
- GitHub tokens are entered by the user in the browser and are not included in deployment artifacts.
- Agent requests go directly from the browser to the selected AI provider.
- Agent backups contain API keys and should be treated as sensitive files.
- Git cannot record truly empty directories; local folders without files are not synced.
- GitHub is the first sync backend; WebDAV is outside the initial scope.
