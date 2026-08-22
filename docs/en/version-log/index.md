---
title: Version Log
description: Major markmap++ features, capabilities and fixes organized by release.
outline: deep
---

# Version Log

This page records the main changes that have reached a released or stable baseline. For the current package and download links, see [Web and desktop apps](/en/app/).

## 1.2.2

Editing, export and cross-device shortcut behavior received another refinement:

- Added redo, copy, cut, paste, delete and select-all commands to the Edit menu, with shared handling across source and visual editor modes.
- Preferences can be opened with `Ctrl+,`; the new shortcut manager supports custom bindings, reset and disabling, and marks conflicts with an exclamation indicator. On the web, “Open file…” uses `Ctrl+O`, separate from the ordered-list shortcut.
- Completed inline and block KaTeX rendering in the visual Markdown editor. Block conversion now covers heading levels, math, code, quotes, ordered lists, unordered lists and task lists, while tables keep their row and column actions.
- The selected-text bubble and mobile bottom bar now support links, bold, italic, underline, inline code, text color and highlights. Color presets include Classic, Macaron and Morandi, with editable values and palette restore.
- Export themes can follow the current theme or use an independent preset. Solarized Light and Everforest Light now have separate export palettes, with body, link, code-block and task-box colors following the theme semantics.
- Removed the visual editor’s unsupported “Convert to HTML block” entry so HTML is no longer represented as a code-like pseudo-block.

## 1.2.1

Agent, cross-device editing and desktop window behavior received another refinement:

- Added selectable Anthropic Messages, OpenAI Chat Completions, OpenAI Responses API and Gemini Native `generateContent` upstream formats, with a default chosen from the provider, Base URL, model and search setting.
- Added native search integrations for OpenAI, Anthropic, Gemini, MiMo, Azure OpenAI, DeepSeek, Groq and Moonshot / Kimi; Agent parses available citations, URLs, grounding sources and search operations.
- Added MiMo `force_search`; the [Agent guide](/en/agent/) documents protocol selection, model detection, source availability and provider plugin or permission requirements.
- Refined the Notion-style block actions, heading conversion, formatting bubble and mobile toolbar in the visual Markdown editor while preserving native copy, paste and other system context-menu actions.
- Fixed theme colors flowing through body text, hyperlinks, code-block backgrounds and Markmap previews; code text without an explicit color now inherits the theme text color.
- Added “Use system title-bar material” under Preferences > Global in Electron, enabled by default. Windows uses Mica and macOS uses a translucent blurred title bar; users can turn it off to return to the regular window background.

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
