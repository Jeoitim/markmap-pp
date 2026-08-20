# markmap++

一个以 Markdown 为唯一源文件，集实时编辑、思维导图、AI 知识问答、可审核仓库修改、高清导出和 GitHub 多端同步于一体的浏览器工作台。

[![Deploy to GitHub Pages](https://github.com/Jeoitim/markmap-pp/actions/workflows/deploy-pages.yml/badge.svg)](https://github.com/Jeoitim/markmap-pp/actions/workflows/deploy-pages.yml)
[![Node.js 22+](https://img.shields.io/badge/Node.js-22%2B-43853d?logo=node.js&logoColor=white)](https://nodejs.org/)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache--2.0-blue.svg)](LICENSE)

[在线使用](https://jeoitim.github.io/markmap-pp/) · [App 介绍](https://jeoitim.github.io/markmap-pp/doc/app/) · [使用文档](https://jeoitim.github.io/markmap-pp/doc/) · [Agent 指南](https://jeoitim.github.io/markmap-pp/doc/agent/) · [English](README.en.md) · [上游项目](https://github.com/Tem-man/markmap-plus)

## 项目简介

markmap++ 基于 [Tem-man/markmap-plus](https://github.com/Tem-man/markmap-plus) 开发。它保留了“Markdown → 思维导图”的工作方式，并在此基础上加入完整的本地编辑体验、可回写的节点操作、IDE 风格仓库文件树、浏览器持久缓存、AI Agent 和手动 GitHub 提交。

应用完全运行在浏览器中，不需要数据库或自建后端。Markdown 是内容的唯一来源，Markmap 负责交互式 SVG 视图，GitHub 仓库可以作为跨设备文件存储和版本历史。

## 主要能力

### Markdown 编辑与实时预览

- CodeMirror 6 编辑器，支持 Markdown 高亮、行号、搜索和撤回。
- 常见 Markdown 结构检查；编辑器底部显示问题数量和对应行号。
- 编辑内容时实时更新右侧思维导图，无需手动刷新。
- 支持 GFM 表格、LaTeX 行内/块级公式、任务 checkbox 和 Markdown 图片；公式字体随应用一同构建，图片加载完成后会自动重排节点。
- 桌面端可拖动分割线调整编辑器宽度，也可收起编辑器专注预览。
- 移动端在 Markdown 编辑与思维导图预览之间切换。
- 支持浏览器全屏以及全局浅色、深色主题。

### 思维导图交互

- 拖动画布、滚轮缩放、节点折叠和一键适应画布。
- 双击节点直接编辑文字，编辑结果自动回写 Markdown。
- 选中节点后可新增同级节点、子节点或删除节点。
- 节点误操作后可通过顶部“撤回”恢复最近一次修改。
- 预览字号、字体和可变字重均可调整。
- 可关闭点阵背景，获得更简洁的导图画布。

节点快捷操作：

| 操作               | 结果                               |
| ------------------ | ---------------------------------- |
| 单击节点           | 选中节点                           |
| 双击节点           | 编辑节点文字                       |
| Enter              | 选中时新增同级节点；编辑时保存文字 |
| Tab                | 新增子节点                         |
| Delete / Backspace | 删除当前选中的整个节点             |

### 字体与显示

- 编辑器字号可调，仓库文件树的文字和图标会同步变化。
- 内置 Violet、GitHub、Solarized 三种编辑器高亮方案。
- 预览内置思源黑体、思源宋体、霞鹜文楷、Inter Variable 和 JetBrains Mono Variable。
- 思源黑体、思源宋体、Inter 与 JetBrains Mono 支持可变字重。
- 编辑器、预览和仓库文件树均跟随全局深浅色主题。

### AI Agent 知识与仓库工作流

- Chat 模式按需列出、搜索和读取真实笔记，同时融合模型的通用知识、推导、反例和跨领域联系回答问题。
- Edit 模式先读取实时文件，再生成逐文件 Diff；用户接受后才写入本地草稿，避免模型直接覆盖笔记。
- 持续显示当前文件、Git 分支、已缓存笔记数和本地修改数，并记录近期工具操作，保持任务上下文连续。
- 支持当前文件或仓库笔记两种范围；未缓存的远程笔记可按需批量读取。
- 对话中展示思考状态、工具调用、修改结果和 Git 提交请求，可停止生成、重试、复制回答或重新生成。
- 修改旧问题会创建可切换的对话分支；回答版本、问题版本和原有后续内容不会丢失。
- 对话历史支持 Chat / Edit 标签、待审核数量、搜索、重命名、删除、单个 Markdown 导出及完整 JSON 导入导出。
- AI 配置支持多服务商独立档案、模型列表、连接测试、推理强度、Temperature、最大输出 Token 与操作许可。

默认最大输出为 16,000 Token、Temperature 为 0.3、操作许可为“请求批准”。最大 Token 只限制单次模型输出，并不等同于模型的上下文窗口；普通问答可调至 4,000–8,000，复杂的跨文件整理可保留默认值。

内置服务商包括 OpenAI、Anthropic、Google Gemini、Azure OpenAI、DeepSeek、Groq、Mistral AI、Moonshot / Kimi、智谱 AI、腾讯混元、NVIDIA NIM、硅基流动、Ollama 和自定义 OpenAI 兼容接口。

Agent 配置和对话历史保存在当前浏览器。配置 JSON 为实现一键迁移会**包含 API 密钥**，请将备份视为敏感文件；模型请求会由浏览器直接发送给所选 AI 服务商。完整用法与安全说明见 [Agent 指南](https://jeoitim.github.io/markmap-pp/doc/agent/)。

### 多格式导出

| 格式     | 用途                                 |
| -------- | ------------------------------------ |
| Markdown | 保存可继续编辑的源文件               |
| SVG      | 矢量导图，适合打印和后期编辑         |
| PDF      | 静态矢量页面，适合打印               |
| PNG      | 无损位图，适合文档和演示文稿         |
| JPEG     | 文件体积更小，适合快速分享           |
| HTML     | 可独立打开的网页文件，保留矢量清晰度 |

PDF、SVG、PNG、JPEG 和 HTML 均可导出；其中 PDF 是静态矢量页面，网页端会打开打印对话框，桌面端可直接保存。PNG、JPEG、SVG 和 HTML 可选择 1–4 倍渲染倍率；位图倍率越高，输出分辨率越高。

## GitHub 仓库同步

markmap++ 不会在每次输入时创建提交。远程 Markdown 文件被下载到浏览器后，可以离线继续修改；只有用户点击“同步”，待处理操作才会合并成一次 Git 提交并推送到远程分支。

GitHub 同步的价值不只是“把文件放到云端”：你可以在电脑、桌面 App 和移动浏览器之间继续编辑，使用 Git commit 保留每次版本，比较改动并在需要时恢复旧版本。Web 版通过 GitHub API 同步，桌面 App 还支持本地 Git 工作区；两者都把改动留在本地，等你确认后再推送。

### 绑定仓库

1. 打开左侧编辑区的“仓库”页签。
2. 填写 `owner/repository`、目标分支和 GitHub fine-grained personal access token。
3. 令牌只需授权目标仓库，并赋予 **Contents: Read and write** 权限。
4. 绑定完成后，点击文件树中的 Markdown 文件将其下载到本机缓存。

令牌的创建步骤见[详细 GitHub 令牌教程](https://jeoitim.github.io/markmap-pp/doc/example/)。建议在 GitHub 的 **Developer settings → Personal access tokens → Fine-grained tokens** 中创建令牌，并在 **Repository access** 选择 **Only select repositories**，只勾选自己的笔记仓库。

GitHub 绑定与令牌保存在当前浏览器的 IndexedDB 本地设置中，Markdown 草稿也保存在 IndexedDB。应用会直接从浏览器请求 GitHub API，不会把令牌写入项目、构建产物或 GitHub Pages。请勿在公共或不受信任的设备上长期保存令牌。

### 文件树与状态

- 文件夹可折叠，并以灰色缩进线辅助判断层级。
- 文件和文件夹支持拖动移动。
- 右键菜单支持新建、重命名、复制、剪切、粘贴和删除。
- 重命名可在文件树中直接完成，无需弹出输入窗口。
- 刷新只更新远程目录信息，不会覆盖当前本地草稿。
- “放弃”会丢弃全部本地暂存操作，并恢复到远程最新提交。

| 标记 | 含义                       |
| ---- | -------------------------- |
| 灰点 | 远程文件尚未下载到当前设备 |
| 绿点 | 本地缓存与远程版本一致     |
| `A`  | 本地新增文件               |
| `M`  | 本地修改文件               |
| `R`  | 本地重命名或移动文件       |
| `D`  | 本地删除文件               |

同步时会根据操作自动生成 `update: add ...`、`update: edit ...`、`update: rename ...`、`update: delete ...` 或批量变更提交信息。推送前如果远程分支已经变化，应用会拒绝覆盖并提示先刷新，从而避免强制推送造成的数据丢失。

> Git 无法保存真正的空文件夹。只在本地创建但未包含文件的文件夹不会同步到 GitHub。

### 仓库内双向链接

- 使用标准 Markdown 写法链接仓库笔记：`[说明](/doc/说明.md#安装)`。以 `/` 开头表示仓库根目录，也支持 `./`、`../` 和当前文件内的 `#标题`。
- 只有指向 `.md` 或 `.markdown` 的根路径、相对路径和标题片段会在应用内打开并精确定位；`https://`、`mailto:` 及其他普通链接仍按浏览器默认行为打开。
- 在 Markdown 编辑器或思维导图预览中选中文字并右键，可复制、剪切、粘贴，或从仓库文件树选择笔记；只有主动展开某个文件时才显示其标题，也可搜索文件/标题、创建新笔记并添加链接。按住 Shift 右键可直接使用浏览器原生菜单；“更多浏览器选项”会让下一次右键回到原生菜单。
- 当前笔记的链接入口位于 Markdown 编辑器底栏、编辑器设置按钮旁，使用独立的链环图标；面板集中显示反向链接、出站链接、失效目标与索引覆盖率。
- 移动或重命名文件时，已经读取到本地的笔记引用会自动改写并进入待同步状态。点击“索引全部”可先读取整个仓库，从而获得完整反向链接和引用更新范围。

## 本地开发

### 环境要求

- Node.js 22 或更高版本
- pnpm 10

### 启动开发环境

```bash
git clone https://github.com/Jeoitim/markmap-pp.git
cd markmap-pp
npm install --global pnpm@10
pnpm install
pnpm dev
```

打开 `http://localhost:5173`。

### 检查与构建

```bash
# 检查 Web 应用
pnpm --filter markmap-plus-plus-web lint

# 构建 Web 应用
pnpm build:app

# 构建完整站点（应用 + VitePress 文档）
pnpm build:site

# 运行仓库测试
pnpm test

# 预览生产构建
pnpm --filter markmap-plus-plus-web preview
```

`pnpm build:app` 只把应用输出到 `apps/web/dist/`。用于部署的 `pnpm build:site` 会把应用和 VitePress 文档合并到根目录 `dist/`：应用位于 `/`，文档位于 `/doc/`。

本地 `pnpm dev` 只启动应用，因此 `http://localhost:5173/doc/` 不会显示文档。需要使用 `pnpm docs:dev` 单独启动 VitePress；正式部署则由 `pnpm build:site` 将两者合并。

### Electron 桌面应用（Beta）

桌面应用与 Web 版共用 React 界面，Electron 提供系统窗口、安全隔离、本地 Markdown 文件读写和本地 Git 工作区能力。请先查看[App 介绍](https://jeoitim.github.io/markmap-pp/doc/app/)，再从 [GitHub Releases](https://github.com/Jeoitim/markmap-pp/releases) 下载最新版本。每次推送版本 tag 时，GitHub Actions 会自动发布：

| 平台        | 发布文件        | 说明                       |
| ----------- | --------------- | -------------------------- |
| Windows x64 | `*-setup.exe`   | 可安装的 NSIS 安装包       |
| Windows x64 | `*-portable.7z` | 解压后即可使用的便携包     |
| Linux x64   | `*.AppImage`    | 下载后授予执行权限即可运行 |

Linux AppImage 的典型启动方式：

```bash
chmod +x markmap-plus-plus-*.AppImage
./markmap-plus-plus-*.AppImage
```

::: warning macOS 发行说明
抱歉，GitHub-hosted macOS runner 长时间排队会阻塞整次发布，因此当前不提供 macOS 的自动构建或下载包。macOS 用户可以下载源码并在本机尝试构建；该过程会生成与本机 CPU 架构匹配的 DMG，但产物未签名，首次打开可能需要在系统设置中手动允许。
:::

```bash
git clone https://github.com/Jeoitim/markmap-pp.git
cd markmap-pp
corepack enable
pnpm install
pnpm --filter markmap-plus-plus-desktop make:mac
```

构建产物写入 `apps/desktop/release/`。桌面开发可使用 `pnpm dev:desktop`；实现与平台注意事项见 [`apps/desktop/README.md`](apps/desktop/README.md) 和[桌面应用文档](docs/desktop/index.md)。

## 部署到 GitHub Pages

仓库已提供 [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml)。推送到 `main` 分支后，GitHub Actions 会自动完成依赖安装、代码检查、应用与 VitePress 文档构建、Pages artifact 上传和部署。工作流会根据仓库名分别设置应用和文档的 `base`，因此 `/markmap-pp/` 与 `/markmap-pp/doc/` 的静态资源都能正确加载。

首次部署需要在 GitHub 仓库中完成一次设置：

1. 打开 **Settings → Pages**。
2. 将 **Build and deployment → Source** 设为 **GitHub Actions**。
3. 推送到 `main`，或在 **Actions → Deploy Markmap++ to GitHub Pages** 中手动运行工作流。
4. 部署完成后访问 `https://<用户名>.github.io/<仓库名>/`。

对于本仓库，应用地址为 [https://jeoitim.github.io/markmap-pp/](https://jeoitim.github.io/markmap-pp/)，文档地址为 [https://jeoitim.github.io/markmap-pp/doc/](https://jeoitim.github.io/markmap-pp/doc/)。部署不需要配置 GitHub Secret；用户在页面内输入的仓库令牌不会经过 Actions。

## 部署到 Cloudflare Pages

Cloudflare Pages 可以直接连接 GitHub 仓库，并在每次推送后自动构建。由于本项目使用 pnpm workspace，构建必须从仓库根目录执行。

1. 进入 [Cloudflare Dashboard](https://dash.cloudflare.com/) 的 **Workers & Pages**。
2. 选择 **Create application → Pages → Connect to Git**，授权并选择本仓库。
3. 生产分支选择 `main`。
4. 使用下面的构建配置：

| 配置项                 | 值                            |
| ---------------------- | ----------------------------- |
| Framework preset       | React (Vite)，也可以选择 None |
| Root directory         | `/`，保持仓库根目录           |
| Build command          | `pnpm build:site`             |
| Build output directory | `dist`                        |
| `NODE_VERSION`         | `22`                          |
| `PNPM_VERSION`         | `10`                          |

5. 点击 **Save and Deploy**。部署完成后会得到一个 `*.pages.dev` 地址，其他分支和 Pull Request 会生成独立的预览部署。

Cloudflare Pages 的站点位于域名根路径。`build:site` 默认将应用 base 设为 `/`，将文档 base 设为 `/doc/`，因此部署后分别访问站点根路径和 `/doc/` 即可。

也可以先在本地构建，再通过 Wrangler 直接上传：

```bash
pnpm build:site
pnpm dlx wrangler pages deploy dist --project-name markmap-pp
```

Git 集成项目与 Direct Upload 项目的管理方式不同；如果希望长期由 Git 自动部署，建议一开始就选择 Git 集成。详细设置可参考 [Cloudflare Pages Git integration](https://developers.cloudflare.com/pages/get-started/git-integration/) 和 [Build configuration](https://developers.cloudflare.com/pages/configuration/build-configuration/)。

## 部署到 EdgeOne Pages

[腾讯云 EdgeOne Pages](https://pages.edgeone.ai/) 同样支持关联 GitHub 仓库、生产分支自动部署和其他分支预览。项目是 monorepo，仍需从仓库根目录安装依赖和构建。

1. 登录 EdgeOne Pages，选择导入 GitHub 仓库。
2. 选择 `main` 作为 Production 环境关联分支。
3. 在 **Project Settings → Build and Deployment Configuration** 中填写：

| 配置项               | 值                               |
| -------------------- | -------------------------------- |
| Framework preset     | Vite 或自定义                    |
| Root directory       | `./`                             |
| Installation command | `pnpm install --frozen-lockfile` |
| Build command        | `pnpm build:site`                |
| Output directory     | `dist`                           |
| Node.js version      | 22（例如平台提供的 22.21.1）     |
| pnpm version         | 9                                |

4. 保存并开始部署。生产分支更新会发布到正式环境，其他分支进入 Preview 环境。

EdgeOne Pages 当前托管构建支持 pnpm 6–9，而本项目的 lockfile 格式可由 pnpm 9 读取，因此这里指定 pnpm 9。不要把 Root directory 改为 `apps/web`，该应用依赖仓库内的 `packages/*` workspace 包；应保持从仓库根目录安装依赖和构建。

如果希望通过 GitHub Actions 或其他 CI 主动上传，可以先创建 EdgeOne API Token，然后执行：

```bash
pnpm build:site
npx edgeone pages deploy dist \
  -n markmap-pp \
  -t "$EDGEONE_API_TOKEN" \
  -e production
```

在 GitHub Actions 中应将令牌保存为仓库 Secret `EDGEONE_API_TOKEN`，不要写入工作流或 README。EdgeOne CLI 的参数与最新构建环境说明见 [Using GitHub Actions](https://pages.edgeone.ai/document/use-github-actions) 和 [Build Guide](https://pages.edgeone.ai/document/build-guide)。

## 部署方式对比

| 平台             | 默认访问路径   | 自动预览                  | 项目所需额外凭据                     |
| ---------------- | -------------- | ------------------------- | ------------------------------------ |
| GitHub Pages     | `/<仓库名>/`   | 工作流当前仅部署 `main`   | 无                                   |
| Cloudflare Pages | 域名根路径 `/` | 分支与 Pull Request       | Git 集成授权                         |
| EdgeOne Pages    | 域名根路径 `/` | Production / Preview 环境 | Git 集成授权；CLI 部署需要 API Token |

## 技术组成

- React 19 + TypeScript
- Vite 8
- CodeMirror 6
- `markmap-lib` / `markmap-view-plus` / `markmap-toolbar`
- GitHub REST Git Data API
- IndexedDB + localStorage
- pnpm workspace

## 目录结构

```text
markmap-pp/
├─ .github/workflows/         # GitHub Pages 自动部署
├─ apps/
│  ├─ web/                    # markmap++ Web 应用
│  │  ├─ src/components/      # 编辑器、导图、Agent 和 GitHub 同步
│  │  └─ dist/                # 生产构建输出
│  └─ desktop/                # Electron 桌面应用
├─ packages/
│  ├─ markmap-lib/            # Markdown 转换
│  ├─ markmap-view-plus/      # 可编辑思维导图视图
│  ├─ markmap-toolbar/        # 导图工具栏
│  └─ ...                     # 上游 Markmap 相关包
├─ docs/                      # 使用、Agent、同步与部署文档
├─ package.json               # 工作区命令
└─ pnpm-workspace.yaml        # pnpm workspace 配置
```

## 与上游项目的关系

本仓库基于 `Tem-man/markmap-plus` 修改，并继续保留其可编辑节点、增删节点、增量更新和 `toMarkdown` 回写能力。markmap++ 主要在 `apps/web` 中提供面向最终用户的完整工作台，并扩展本地缓存、Agent 知识与仓库操作、GitHub 同步、文件管理、显示设置和多格式导出。

## 贡献者与鸣谢

感谢所有为 markmap++ 提交代码、完善文档、报告问题和提出建议的贡献者。头像图标会随 GitHub 贡献记录自动更新：

<a href="https://github.com/Jeoitim/markmap-pp/graphs/contributors"><img src="https://contrib.rocks/image?repo=Jeoitim/markmap-pp" alt="markmap++ contributors" /></a>

## 许可证与上游鸣谢

Markmap++ 采用 [Apache License 2.0](LICENSE)。项目包含来自 `markmap-plus` 及其他 MIT 许可上游项目的派生代码；原始版权声明和许可证条款保留在对应文件中，详见 [NOTICE](NOTICE) 与各包的 LICENSE 文件。感谢 [markmap](https://github.com/markmap/markmap) 和 [Tem-man/markmap-plus](https://github.com/Tem-man/markmap-plus) 提供的基础实现。
