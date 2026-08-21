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

## Preferences and editor

Editor, preview, appearance, spelling, global and shortcut settings are available from **Help → Preferences**. Mobile uses expandable categories, while desktop uses a sidebar; every page can restore only its own defaults.

The editor page provides:

- A 12–22px font-size range, line height, editor max width and font choices.
- Source / visual (WYSIWYG) mode for Markdown; visual mode renders common Markdown structures as you edit, and the browser remembers the last choice.
- Browser spell check for both source and visual modes.
- **Jump from preview nodes**, which returns to the matching Markdown content when enabled.

The **Editor theme** is controlled by the active community theme by default, so the syntax highlighting selector starts in a gray “follow theme” state. Enable **Set syntax highlighting separately** to pick a highlight scheme manually. When it is off, switching Catppuccin, Everforest, Gruvbox, Tokyo Night, Nord or Dracula also updates the source editor colors.

The editor status bar shows a check when there are no issues and a warning count when issues are found. Click it to inspect line numbers and messages. Checks cover common problems such as missing spaces after headings, skipped heading levels, Tab indentation in lists and unclosed fenced code blocks.

## Markdown and Mermaid documents

Use the document-mode button in the editor status bar to switch between Markdown and Mermaid:

- Markdown defaults to source mode and can use the experimental visual mode from editor settings. Mermaid documents stay in source mode.
- Mermaid documents have a standalone SVG preview and can export SVG, PNG, JPEG, PDF or `.mmd` source.
- To preview Mermaid fences inside a Markdown mind map, enable the experimental **Mermaid code-block preview** in preview settings. It renders `mermaid` fences as SVG thumbnails with copy-source, fullscreen and SVG-download actions; mind-map exports keep the original code block.

## Preview settings

Preview settings support:

- Node font size.
- Noto Sans SC, Noto Serif SC, LXGW WenKai, Inter Variable and JetBrains Mono Variable.
- Variable font weight where supported.
- Showing or hiding the grid background.
- Mermaid code-block previews with copy-source, fullscreen and SVG-download actions.
- A canvas background that follows the active theme and light / dark mode by default. Enable **Set canvas background separately** to decouple the preset from the theme; it still switches between the matching light and dark background.
- Background-aware Markmap branch lightness for better contrast. Document metadata such as `options.color` always overrides the automatic adjustment.

Export colors remain independent from the preview theme so export controls, canvas and document preview do not interfere with one another.

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

Long-pressing text on a phone keeps the system selection bar, including Select all and dictionary actions. markmap++ only adds note-link actions to the mobile floating controls. When a heading is selected in visual mode, the bottom toolbar can duplicate it, convert it to a paragraph, delete it or change its heading level. Tapping a repository file returns to the editor, while long-pressing the tree keeps the repository menu.
