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
| Markdown 页签 | 编辑源文本、切换视觉模式并查看语法状态         |
| 偏好设置      | 集中管理编辑器、预览、外观、拼写、全局和快捷键  |
| 仓库页签      | 绑定 GitHub 后浏览和管理 Markdown 文件         |
| 中间分割线    | 拖动改变编辑区宽度；长条按钮收起或展开编辑区   |
| 思维导图预览  | 查看和编辑节点、缩放画布、调整字体与背景       |

## 选择编辑模式

Markdown 文档可以从“帮助 → 偏好设置”选择：

- **源码**：使用 CodeMirror 编辑 Markdown 文本，适合精确调整语法和结构。
- **视觉**：实验性的 WYSIWYG 编辑器，直接在渲染后的标题、段落、列表、表格、代码和链接中编辑；选择会记忆在当前浏览器中。

Mermaid 文档不使用视觉模式，而是提供独立的源码编辑和 SVG 预览。编辑器设置还可以开启浏览器拼写检查，以及点击预览节点后自动定位 Markdown 内容。

主题预设默认同时更新界面、编辑器和预览。语法高亮、画布背景可以分别打开“单独设置”后手动覆盖；偏好设置中的“全局”页还负责自动保存、启动恢复和文件排序等工作区行为。

在手机上长按文本会保留系统选中栏，因此可以继续使用全选和查词；移动端仓库文件点击后会回到编辑器，文件树长按菜单不受影响。

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
pnpm --filter markmap-plus-plus-web lint

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
