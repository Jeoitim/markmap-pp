---
title: Version Log
description: Major markmap++ features, capabilities and fixes organized by release.
outline: deep
---

# Version Log

This page records the main changes that have reached a released or stable baseline. For the current package and download links, see [Web and desktop apps](/en/app/).

## 1.2.0

The theme system and accessibility work became part of the stable release:

- Added community color themes including Catppuccin, Everforest, Gruvbox, Tokyo Night, Nord and Dracula, while keeping their original names and color semantics.
- Centralized editor, preview, appearance, spelling, global and shortcut preferences; mobile uses expandable categories and desktop uses a sidebar layout.
- Theme presets can control the UI, editor and preview together. Syntax highlighting and canvas background can be enabled as independent overrides.
- Dark / light mode can follow the system or switch the default theme manually; the export surface keeps its own color logic.
- Markmap branch lines adapt their lightness to the background for better contrast; document metadata such as `options.color` always has the highest priority.
- Agent controls, selected states and workspace controls now use the active theme accents.

## 1.1.0

Editing and cross-device behavior received a major refresh:

- Added Mermaid document mode, code-block previews and Mermaid source export.
- Added the experimental WYSIWYG visual editor and remembered the last source / visual mode in the browser.
- Preserved the native mobile text-selection toolbar for select all, dictionary lookup and other system actions; repository files can open directly in the editor on mobile.
- Reworked mobile editing controls and heading bubbles while keeping the desktop heading controls as a floating action on the right.
- Expanded GitHub file navigation, spell checking and preferences, together with desktop window and local-file workspace support.
- Added static vector PDF export and improved export consistency for fonts, tables, formulas and Mermaid previews.

## 1.0.x

- Established the Markdown-to-editable-SVG mind-map workflow.
- Added node editing, canvas zoom, links, tables, formulas, code blocks and multi-format export.
- Established the shared local workspace and GitHub sync foundation for web, Electron and mobile use.

## How to read the docs

The Version Log records what changed. Use the [feature guide](/en/modules/) for workflows and the [development guide](/en/web-development/) for builds and deployment.
