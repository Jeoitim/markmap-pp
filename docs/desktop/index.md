---
title: Electron 桌面应用
outline: deep
---

# Electron 桌面应用

markmap++ 桌面应用与 Web 版共用编辑器和思维导图界面。Electron 负责系统窗口、安全隔离、Markdown 文件读写以及本地 Git 工作区；浏览器版仍可直接在线使用。

想直接下载可用版本，请前往 [GitHub Releases](https://github.com/Jeoitim/markmap-pp/releases)；版本选择和 Web / 桌面 App 对比见 [App 介绍](/app/)。

## 下载与安装

发布版本位于 [GitHub Releases](https://github.com/Jeoitim/markmap-pp/releases)。推送版本 tag 后，发布工作流会自动构建并上传以下 x64 文件：

| 平台    | 文件                                          | 使用方式                           |
| ------- | --------------------------------------------- | ---------------------------------- |
| Windows | `markmap-plus-plus-*-windows-x64-setup.exe`   | 运行安装器                         |
| Windows | `markmap-plus-plus-*-windows-x64-portable.7z` | 解压后运行 `markmap-plus-plus.exe` |
| Linux   | `markmap-plus-plus-*-linux-x86_64.AppImage`   | 授予执行权限后运行                 |

Linux AppImage 可在终端中启动：

```bash
chmod +x markmap-plus-plus-*.AppImage
./markmap-plus-plus-*.AppImage
```

部分 Linux 发行版需要安装 FUSE 兼容组件才能启动 AppImage。

::: warning 未签名的 Windows 安装包
当前 Windows 安装包尚未进行代码签名。Windows SmartScreen 可能显示提示；请仅从本项目的 GitHub Releases 下载。
:::

## macOS：暂不提供预构建包

抱歉，自动构建 macOS DMG 会因 GitHub-hosted macOS runner 的长时间排队而阻塞 Windows 和 Linux 的版本发布。因此，当前 Releases 不提供 macOS 包，也不会等待 macOS 任务完成。

macOS 用户可下载源码并在本机尝试构建。构建会使用本机架构的 Electron，并输出未签名 DMG：

```bash
git clone https://github.com/Jeoitim/markmap-pp.git
cd markmap-pp
corepack enable
pnpm install
pnpm --filter markmap-plus-plus-desktop make:mac
```

产物位于 `apps/desktop/release/`。第一次打开未签名应用时，macOS 可能阻止启动；请在确认源码可信后，通过“系统设置 → 隐私与安全性”允许打开。

## 本地开发与打包

需要 Node.js 22+ 和 pnpm 10。以下命令均从仓库根目录运行：

```bash
# 启动桌面开发环境
pnpm dev:desktop

# 编译主进程与桌面渲染资源
pnpm build:desktop

# 本机打包
pnpm --filter markmap-plus-plus-desktop make:win
pnpm --filter markmap-plus-plus-desktop make:linux
pnpm --filter markmap-plus-plus-desktop make:mac
```

Windows 和 Linux 发布包由 GitHub Actions 在各自的原生 runner 上构建。macOS 命令仅用于本地手动构建，不参与自动发布。

## 本地文件与 Git

- “打开”和“保存”使用系统原生文件对话框；桌面应用可以直接读写用户选择的 Markdown 文件。
- 本地工作区限制在用户选择的文件夹内，并通过 Node 的跨平台路径 API 处理 Windows、macOS 和 Linux 路径。
- 本地 Git 功能要求系统可以在 `PATH` 中找到 `git`：Windows 安装 Git for Windows，macOS 可安装 Xcode Command Line Tools，Linux 使用发行版的 Git 包。
- Linux 上的敏感配置使用系统密钥环；如果没有可用的密钥服务，应用会拒绝以明文保存敏感缓存。
