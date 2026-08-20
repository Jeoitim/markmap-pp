# markmap++ Web 应用

这是 markmap++ 的主 Web 应用，提供 Markdown 源码与实验性 WYSIWYG 视觉编辑、Mermaid 文档与预览、思维导图预览、节点编辑、Agent 工作区、GitHub 同步和多格式导出能力。移动端保留系统文本选择栏，并支持从仓库文件树点击文件后回到编辑器。

## 开发

从仓库根目录执行：

```bash
pnpm dev:web
```

也可以直接在本目录启动 Vite：

```bash
pnpm dev
```

## 检查与构建

```bash
pnpm --filter markmap-plus-plus-web lint
pnpm --filter markmap-plus-plus-web build
pnpm --filter markmap-plus-plus-web preview
```

生产构建输出到 `apps/web/dist/`。完整站点（Web 应用 + VitePress 文档）使用根目录的 `pnpm build:site`，最终输出到 `dist/`。

## Electron

Electron 桌面应用复用本应用的 renderer。桌面端构建和开发命令统一从根目录执行：

```bash
pnpm dev:desktop
pnpm build:desktop
```
