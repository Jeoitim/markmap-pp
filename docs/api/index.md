---
title: 导出、部署与开发
outline: deep
---

# 导出、部署与开发

## 导出格式

| 格式     | 特点                     | 推荐用途                 |
| -------- | ------------------------ | ------------------------ |
| Markdown | 保留源结构，可继续编辑   | 长期保存、Git 版本管理   |
| SVG      | 矢量内容，任意缩放仍清晰 | 打印、排版、设计软件     |
| PNG      | 无损位图                 | 文档、演示文稿、社交平台 |
| JPEG     | 文件较小                 | 快速分享和预览           |
| HTML     | 独立网页，保留矢量显示   | 离线查看、网页归档       |

PNG 和 JPEG 支持 1–4 倍渲染倍率。倍率越高，像素尺寸和文件体积越大。SVG 与 HTML 本身使用矢量内容，放大后仍保持清晰。

## GitHub Pages

正式部署结构为：

```text
https://jeoitim.github.io/markmap-pp/       # markmap++ 应用
https://jeoitim.github.io/markmap-pp/doc/   # VitePress 文档
```

仓库内的 `.github/workflows/deploy-pages.yml` 会：

1. 安装 pnpm 10 和 Node.js 22。
2. 检查 markmap++ 应用。
3. 运行 `pnpm build:site`，分别使用 `/markmap-pp/` 与 `/markmap-pp/doc/` 作为 base。
4. 将应用和文档合并到根目录 `dist/`。
5. 上传一个 Pages artifact 并发布。

首次使用需在仓库 **Settings → Pages** 将 Source 设为 **GitHub Actions**。

## Cloudflare Pages

Cloudflare Pages 使用域名根路径，配置如下：

| 配置             | 值                |
| ---------------- | ----------------- |
| Root directory   | `/`               |
| Build command    | `pnpm build:site` |
| Output directory | `dist`            |
| `NODE_VERSION`   | `22`              |
| `PNPM_VERSION`   | `10`              |

`pnpm build:site` 默认使用 `/` 作为应用 base、`/doc/` 作为文档 base。部署完成后，站点根路径是应用，`/doc/` 是 VitePress 文档站。

## EdgeOne Pages

| 配置                 | 值                               |
| -------------------- | -------------------------------- |
| Root directory       | `./`                             |
| Installation command | `pnpm install --frozen-lockfile` |
| Build command        | `pnpm build:site`                |
| Output directory     | `dist`                           |
| Node.js              | 22                               |
| pnpm                 | 9                                |

EdgeOne 当前托管构建使用 pnpm 9 读取本仓库 lockfile。不要把项目根目录改为 `examples/react-example`，否则无法解析 `packages/*` workspace 依赖。

## 代码结构

```text
markmap-pp/
├─ examples/react-example/       # markmap++ React 应用
│  └─ src/components/
│     ├─ markdown-editor.tsx     # CodeMirror 编辑器
│     ├─ markdown-lint.ts        # Markdown 检查
│     ├─ github-sync.ts          # GitHub API 与 IndexedDB
│     └─ markmap-hooks.tsx       # 工作区与导图交互
├─ packages/
│  ├─ markmap-lib/               # Markdown 转换
│  ├─ markmap-view-plus/         # 可编辑 SVG 导图
│  └─ markmap-toolbar/           # 导图工具栏
├─ docs/                         # markmap++ VitePress 文档
└─ .github/workflows/            # 自动部署
```

## 常用命令

```bash
pnpm dev
pnpm --filter markmap-plus-plus-app lint
pnpm build:app
pnpm build:site
pnpm docs:dev
pnpm docs:build
pnpm test
```

## 上游关系

markmap++ 基于 [Tem-man/markmap-plus](https://github.com/Tem-man/markmap-plus)，后者在原始 [markmap](https://github.com/markmap/markmap) 上增加节点编辑、增删和 Markdown 回写。本项目主要扩展面向最终用户的工作台、同步、文件管理、导出和跨设备体验。
