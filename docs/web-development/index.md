---
title: Web 部署与开发
description: 在 GitHub Pages、Cloudflare Pages 或 EdgeOne 部署 markmap++，并从源码启动 Web 应用与文档站。
outline: deep
---

# Web 部署与开发

本页只讨论 Web 应用和文档站的部署、构建与源码开发；导出格式请查看[导出](/export/)，Electron 桌面窗口请查看[桌面开发](/desktop/)。

## 本地开发

```bash
pnpm install
pnpm dev
pnpm --filter markmap-plus-plus-web lint
pnpm docs:dev
```

`pnpm dev` 启动 Web 应用，`pnpm docs:dev` 启动 VitePress 文档站。完成修改后可以运行：

```bash
pnpm build:app
pnpm build:site
pnpm test
```

`build:site` 会分别构建根路径下的应用和 `/doc/` 下的文档，并合并到 `dist/`。

## GitHub Pages

正式部署结构为：

```text
https://jeoitim.github.io/markmap-pp/      # markmap++ 应用
https://jeoitim.github.io/markmap-pp/doc/  # VitePress 文档
```

仓库内的 `.github/workflows/deploy-pages.yml` 会安装 pnpm 10 和 Node.js 22，检查应用，使用 `/markmap-pp/` 与 `/markmap-pp/doc/` 作为 base 构建站点，再发布一个 Pages artifact。首次使用时，在仓库 **Settings → Pages** 将 Source 设为 **GitHub Actions**。

## Cloudflare Pages

| 配置 | 值 |
| --- | --- |
| Root directory | `/` |
| Build command | `pnpm build:site` |
| Output directory | `dist` |
| `NODE_VERSION` | `22` |
| `PNPM_VERSION` | `10` |

默认构建使用 `/` 作为应用 base、`/doc/` 作为文档 base。部署完成后，站点根路径是应用，`/doc/` 是文档站。

## EdgeOne Pages

保持从仓库根目录构建：

| 配置 | 值 |
| --- | --- |
| Root directory | `./` |
| Installation command | `pnpm install --frozen-lockfile` |
| Build command | `pnpm build:site` |
| Output directory | `dist` |
| Node.js | `22` |
| pnpm | `9` |

不要把项目根目录改为 `apps/web`，否则无法解析 `packages/*` workspace 依赖。

## 代码结构

```text
markmap-pp/
├─ apps/web/                       # React Web 应用
│  └─ src/components/
│     ├─ markdown-editor.tsx       # CodeMirror 源码编辑器
│     ├─ visual-markdown-editor.tsx# WYSIWYG 视觉编辑器
│     ├─ mermaid-renderer.ts       # Mermaid 渲染与预览
│     ├─ pdf-export.ts              # 静态矢量 PDF 导出
│     ├─ markdown-lint.ts           # Markdown 检查
│     ├─ github-sync.ts             # GitHub API 与 IndexedDB
│     └─ markmap-hooks.tsx          # 工作区与导图交互
├─ apps/desktop/                   # Electron 桌面应用
├─ packages/                       # markmap-lib、markmap-view-plus 等共享包
├─ docs/                           # VitePress 文档
└─ .github/workflows/              # 自动部署
```

## 上游关系

markmap++ 基于 [Tem-man/markmap-plus](https://github.com/Tem-man/markmap-plus)，后者在原始 [markmap](https://github.com/markmap/markmap) 上增加节点编辑、增删和 Markdown 回写。本项目进一步扩展工作区、同步、文件管理、Agent、导出和跨设备体验。
