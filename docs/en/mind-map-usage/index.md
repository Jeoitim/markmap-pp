---
title: Editing and mind maps
outline: deep
---

# Editing and mind maps

## Node actions

Single-click and double-click have different meanings: a single click selects a node, while a double-click edits its text.

| Action | Result |
| --- | --- |
| Click a node | Select it without editing |
| Double-click a node | Edit its text |
| Press Enter while editing | Save the text |
| Press Enter after selecting | Add a sibling |
| Press Tab after selecting | Add a child |
| Delete / Backspace | Delete the selected node |
| Click the node dot | Collapse or expand a branch |

Use **Undo** in the top bar to restore the latest change.

## Canvas actions

- Drag an empty area to pan the canvas.
- Use the mouse wheel or trackpad to zoom.
- Click **Fit** in the preview toolbar to recenter the map.
- Use the fullscreen icon in the top bar for browser fullscreen.
- Turn the grid background off in preview settings.

## Editor settings

The editor settings provide:

- A 12–22px font-size range.
- Violet, GitHub and Solarized highlighting.
- A light or dark editor background that follows the page theme.

The editor status bar shows a check when there are no issues and a warning count when issues are found. Click it to inspect line numbers and messages. Checks cover common problems such as missing spaces after headings, skipped heading levels, Tab indentation in lists and unclosed fenced code blocks.

## Preview settings

Preview settings support:

- Node font size.
- Noto Sans SC, Noto Serif SC, LXGW WenKai, Inter Variable and JetBrains Mono Variable.
- Variable font weight where supported.
- Showing or hiding the grid background.

## Repository note links

Repository links use standard Markdown, while the app distinguishes their target type:

```md
[A document at the repository root](/doc/guide.md)
[A heading in a neighboring note](./design.md#interaction-principles)
[A heading in the current note](#node-actions)
[A regular website](https://example.com)
```

Links to Markdown files or headings open inside the app and locate both the editor line and the map node. Regular websites, email links and other protocols remain browser links.

Select text in the editor or preview and right-click to copy, cut, paste or choose a target note from the repository tree. Files show one line by default; expand them to see headings. Search matches both files and headings.

The chain icon in the Markdown editor status bar shows backlinks, outgoing links, broken targets and the number of indexed notes. Choose **Index all** for a complete result. Moving or renaming a cached repository file updates its local Markdown references for the next sync.

## Desktop layout

Drag the split handle to resize the editor and preview. Its standalone long button collapses or expands the editor while keeping the preview visible.

## Mobile layout

On narrow screens, use the top tabs to switch between Markdown and the mind map. Landscape orientation is recommended for larger maps.
