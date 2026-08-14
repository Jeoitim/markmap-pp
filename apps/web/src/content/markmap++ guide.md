---
title: markmap++ guide
options:
  colorFreezeLevel: 2
---

# markmap++

## 👋 Welcome

- Write **Markdown** on the left and get an instant mind map on the right.
- This guide covers nodes, the canvas, Markdown, exports and GitHub document sync.
- Return to the Markdown editor to change content; use **Export** in the top bar to save important work.
- [markmap++ docs](https://jeoitim.github.io/markmap-pp/doc/en/) · GitHub: [Jeoitim/markmap-pp](https://github.com/Jeoitim/markmap-pp)

## 🧭 Nodes and canvas

| Icon | Action | Result |
| :--: | --- | --- |
| 🖱️ | Click / double-click a node | Select a node / edit its text |
| ↩️ | Press Enter after selecting | Add a sibling node |
| ⇥ | Press Tab after selecting | Add a child node |
| ⌫ | Delete / Backspace | Delete the whole node |
| ↶ | Click **Undo** in the top bar | Restore the latest change |
| ✥ | Drag the canvas / use the wheel | Pan the canvas / zoom the view |
| ◉ | Click a node dot | Collapse or expand a branch |

## ✍️ Rich Markdown syntax

### Text styles

- **Bold**, *italic*, ~~strikethrough~~, ==highlight== and `inline code`.
- Long text wraps automatically to the available width, which is useful for full notes.
- A simple workflow:
  1. Select text in the left editor.
  2. Type or paste Markdown.
  3. Review the live result on the right.

### Task list

- [x] Tables
- [x] LaTeX formulas
- [x] Checkboxes
- [x] Online images
- [ ] Keep exploring with your own content

### Code block

```js
const message = 'Hello, markmap++'
console.log(message)
```

## ∑ LaTeX formulas

### Rendered examples

- Inline formula: the area of a circle is $A = \pi r^2$.
- Quadratic formula: $x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}$.

### Formula source

```latex
\int_{-\infty}^{\infty} e^{-x^2} \, dx = \sqrt{\pi}
```

## 🖼️ Online images

### Markmap

![Markmap icon](https://markmap.js.org/favicon.png)

### GitHub

![GitHub icon](https://cdn.simpleicons.org/github/7056e8)

## 🎛️ Editing and display

| Location | What it does |
| --- | --- |
| Split handle | Drag to resize both panes; use the long button to collapse or expand the editor |
| Editor top-right | Adjust font size and syntax highlighting |
| Preview top-right | Fit the canvas, change font/weight and toggle the grid |
| Page top-right | Open the guide, undo, export, enter fullscreen and switch themes |

## ☁️ GitHub sync across devices

| Status | Meaning | Next step |
| :--: | --- | --- |
| Gray dot | The file has not been pulled | Click the file to download it to the local cache |
| A / M | Added / modified | Review the content and click **Sync** |
| R / D | Renamed / deleted | Sync to write the change to the remote repository |
| 🟢 | Synced | Continue editing |
| 🟠 | Staged, not pushed | Click **Sync** to commit and push |

## 📦 Export

- Markdown: keeps an editable source file.
- SVG / HTML: suitable for web pages and infinite zoom.
- PNG / JPEG: suitable for sharing, with a 1×–4× render scale.
