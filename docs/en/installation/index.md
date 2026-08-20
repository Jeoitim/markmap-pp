---
title: Quick start
outline: deep
---

# Quick start

## Use online

Open the [markmap++ app](https://jeoitim.github.io/markmap-pp/). The app loads a localized welcome guide based on your browser or operating-system language. Choose the language button in the top bar at any time.

## Create your first map

Enter this Markdown on the left:

```markdown
# Learning plan

## Web development

- HTML and CSS
- JavaScript
  - TypeScript
  - React

## Tools

- Git
- VS Code
```

Heading and list levels become nodes in the mind map. Drag the canvas to pan, use the wheel to zoom, and click a node dot to collapse or expand a branch.

## Interface areas

| Area | Purpose |
| --- | --- |
| Top bar | Open files, open the guide, undo, export, enter fullscreen, switch theme and language |
| Markdown tab | Edit source text, switch visual mode and see syntax status |
| Editor settings | Switch source / WYSIWYG, spell check and preview-node navigation |
| Repository tab | Connect GitHub and manage Markdown files |
| Split handle | Resize or collapse the editor |
| Mind-map preview | View and edit nodes, zoom the canvas, adjust font and background |

## Choose an editor mode

For Markdown documents, choose a mode from editor settings:

- **Source**: edit Markdown text in CodeMirror when you need exact syntax and structure control.
- **Visual**: an experimental WYSIWYG editor for editing rendered headings, paragraphs, lists, tables, code and links; the choice is remembered in the current browser.

Mermaid documents stay in source mode and provide a standalone source editor and SVG preview. Editor settings also include browser spell check and an option to jump from a preview node to its Markdown content.

On phones, long-pressing text keeps the system selection bar so Select all and dictionary actions remain available. Tapping a repository file returns to the editor, while long-pressing the tree keeps its repository menu.

## Open and save local files

Click **Open** to read `.md` or `.markdown` files. The browser does not overwrite the original file; use **Export → Markdown** to download a new version.

## Local development

The project requires Node.js 22+ and pnpm 10:

```bash
git clone https://github.com/Jeoitim/markmap-pp.git
cd markmap-pp
npm install --global pnpm@10
pnpm install
pnpm dev
```

The development app runs at `http://localhost:5173`.

```bash
pnpm --filter markmap-plus-plus-web lint
pnpm build:app
pnpm build:site
pnpm docs:dev
pnpm docs:build
```

`pnpm dev` starts the app server. Preview VitePress separately with `pnpm docs:dev`. `pnpm build:site` combines the app and docs under `dist/`, with the docs at `dist/doc/`.

::: warning The welcome guide is not an auto-saved file
Export important content as Markdown or connect GitHub from the **Repository** tab.
:::
