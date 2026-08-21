---
title: Export
description: Export markmap++ documents as editable source, vector graphics, images, PDF or a standalone web page.
outline: deep
---

# Export

Open the export action from the top of the workspace. Exports use the current document, theme and canvas state; keep the source Markdown as the canonical copy before exporting a shareable format.

## Supported formats

| Format | Characteristics | Recommended use |
| --- | --- | --- |
| Markdown | Keeps the source structure editable | Long-term storage and Git history |
| Mermaid source | Keeps Mermaid code structure | Continue editing a standalone Mermaid document |
| SVG | Vector content stays sharp at any scale | Print, layout and design tools |
| PDF | Static vector page | Printing, sharing and archiving |
| PNG | Lossless bitmap | Documents, presentations and social platforms |
| JPEG | Smaller file | Quick sharing and previews |
| HTML | Standalone page with vector display | Offline viewing and web archives |

PDF, SVG, PNG, JPEG and HTML are available. PDF opens the print dialog on the web and can be saved directly by the desktop app; PNG and JPEG support a 1–4× render scale. SVG, PDF and HTML remain sharp because they use vector content.

## Mermaid document export

In Mermaid document mode, the export panel offers the `.mmd` source plus SVG, PNG, JPEG and PDF. Mermaid PDF uses the current diagram size. Mermaid code-block previews only change the on-screen view; Markmap exports keep the original code block.

## Before exporting

- Choose Markdown or Mermaid source when the result must remain editable.
- Choose SVG or PDF for print or layout work.
- Choose HTML for a standalone page that can be shared without the editor runtime.
- Spot-check links, tables, formulas, code blocks and Mermaid previews after exporting.

Export colors belong to export and canvas settings; they are not forced to follow the preview theme. Document metadata in `options` always has the highest priority.
