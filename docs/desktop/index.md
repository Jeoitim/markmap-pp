---
title: Electron 桌面开发
outline: deep
---

# Electron 桌面开发

本页面向需要本地开发、打包或排查桌面能力的用户。普通用户的版本选择、下载和首次使用请查看 [Web 与桌面 App](/app/)；这里集中说明 Electron 特有的本地能力和构建流程。

## 桌面版增加的能力

| 能力 | Web 版 | 桌面版 |
| --- | --- | --- |
| Markdown 编辑、导图、Agent、GitHub 同步 | 支持 | 支持 |
| 系统文件对话框 | 浏览器受限 | 原生打开与保存 |
| 本地 Git 工作区 | 不可直接访问 | 支持用户选择的目录 |
| 应用窗口与系统集成 | 浏览器标签页 | 独立 Electron 窗口 |

桌面版渲染界面与 Web 版共用，Electron 主进程只负责窗口、文件、路径和本地 Git 等系统能力。工作区范围限制在用户主动选择的目录内。

## 开发环境

- Node.js 22 或更高版本
- pnpm 10
- 本地 Git（使用本地 Git 工作区时需要）

从仓库根目录安装依赖并启动桌面开发环境：

```bash
corepack enable
pnpm install
pnpm dev:desktop
```

## 构建与打包

```bash
# 编译桌面主进程和渲染资源
pnpm build:desktop

# 按当前平台生成安装包或可运行产物
pnpm --filter markmap-plus-plus-desktop make:win
pnpm --filter markmap-plus-plus-desktop make:linux
pnpm --filter markmap-plus-plus-desktop make:mac
```

Windows 和 Linux 的正式包由 GitHub Actions 在对应 runner 上构建。当前 Releases 提供 Windows x64 和 Linux x64；macOS 命令用于本机手动构建，产物位于 `apps/desktop/release/`，不参与自动发布。

## 本地文件、Git 与安全边界

- “打开”和“保存”使用系统原生文件对话框，不会扫描用户未选择的目录。
- 本地 Git 功能要求 `git` 位于系统 `PATH`；Windows 使用 Git for Windows，macOS 可使用 Xcode Command Line Tools 提供的 Git。
- Electron 渲染区与主进程隔离，文件和 Git 操作通过受控的 IPC 接口执行。
- Linux 敏感配置优先使用系统密钥环；没有可用密钥服务时，应用拒绝将敏感缓存以明文保存。
