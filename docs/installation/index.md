---
title: 快速开始
outline: deep
---

# 快速开始

## 在线使用

打开 [markmap++ 应用](https://jeoitim.github.io/markmap-pp/)。页面默认加载一份固定的欢迎指南，可以直接修改它体验实时预览；刷新页面后欢迎指南会恢复。

## 创建第一份导图

在左侧输入：

```markdown
# 学习计划

## Web 开发

- HTML 与 CSS
- JavaScript
  - TypeScript
  - React

## 工具

- Git
- VS Code
```

标题和列表层级会转换为右侧的思维导图节点。拖动画布可以移动，滚轮可以缩放，点击节点旁圆点可以折叠或展开分支。

## 界面区域

| 区域          | 作用                                           |
| ------------- | ---------------------------------------------- |
| 顶部操作栏    | 打开本地文件、帮助、撤回、导出、全屏和主题切换 |
| Markdown 页签 | 编辑源文本并查看语法状态                       |
| 仓库页签      | 绑定 GitHub 后浏览和管理 Markdown 文件         |
| 中间分割线    | 拖动改变编辑区宽度；长条按钮收起或展开编辑区   |
| 思维导图预览  | 查看和编辑节点、缩放画布、调整字体与背景       |

## 打开与保存本地文件

点击顶部“打开”可读取 `.md` 或 `.markdown` 文件。浏览器不会直接覆盖原文件；完成后通过“导出 → Markdown”下载新版本。

## 本地开发

环境要求为 Node.js 22+ 和 pnpm 10：

```bash
git clone https://github.com/Jeoitim/markmap-pp.git
cd markmap-pp
npm install --global pnpm@10
pnpm install
pnpm dev
```

开发地址为 `http://localhost:5173`。

```bash
# 检查 Web 应用
pnpm --filter markmap-plus-plus-app lint

# 构建应用
pnpm build:app

# 构建可直接部署的完整站点（应用 + 文档）
pnpm build:site

# 构建文档
pnpm docs:build
```

`pnpm dev` 只启动应用开发服务器，VitePress 需通过 `pnpm docs:dev` 单独预览。`pnpm build:site` 会把应用和文档合并到根目录 `dist/`，其中 `dist/doc/` 是文档站。

::: warning 欢迎示例不是自动保存文件
它用于随时提供操作指南。需要保留的内容请导出 Markdown，或打开“仓库”页签绑定 GitHub。
:::
