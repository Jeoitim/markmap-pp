---
title: App 介绍
outline: deep
---

# App 介绍

markmap++ 是一个以 Markdown 为唯一源文件的思维导图工作台。你可以直接使用 Web 版，也可以下载桌面 App，在本地文件和 Git 工作区中继续整理笔记。

## 选择适合你的版本

| 版本 | 适合场景 | 主要能力 |
| --- | --- | --- |
| [Web 版](https://jeoitim.github.io/markmap-pp/) | 不想安装软件、需要跨平台快速使用 | Markdown 编辑、思维导图、Agent、GitHub 仓库同步 |
| 桌面 App | 需要直接读写本地文件或使用本地 Git | Web 版全部界面，加上本地文件对话框和本地 Git 工作区 |

## 下载桌面 App

请从项目的 [GitHub Releases](https://github.com/Jeoitim/markmap-pp/releases) 下载最新版本。每个正式版本通常包含：

- **Windows 安装包**：运行 `*-windows-x64-setup.exe` 完成安装。
- **Windows 便携包**：解压 `*-windows-x64-portable.7z` 后直接运行应用。
- **Linux AppImage**：下载后授予执行权限即可运行。

当前发布包面向 Windows x64 和 Linux x64。macOS 暂无自动发布的预构建包，需要在本机从源码构建；具体步骤见[桌面应用文档](/desktop/)。

::: warning 下载安全提示
Windows 发布包目前未进行代码签名，SmartScreen 可能显示警告。请确认下载地址为本项目的 GitHub Releases，并核对发布版本后再运行。
:::

## 第一次使用

1. 打开 Web 版，或从 Releases 安装桌面 App。
2. 在 Markdown 页签中编辑欢迎示例，观察右侧导图实时变化。
3. 需要保存时，导出 Markdown，或在“仓库”页绑定自己的 GitHub 笔记仓库。
4. 需要跨设备继续时，在其他设备打开 Web 版或桌面 App，绑定同一个仓库并同步。

欢迎示例用于介绍功能，不是自动写入本地文件的工作区。重要笔记请主动导出或同步到自己的仓库。

## Web 版和桌面 App 的关系

两种版本共用编辑器、导图、Agent 和 GitHub 同步界面。Web 版把草稿保存在当前浏览器；桌面 App 额外提供系统文件对话框，可以直接打开和保存用户选择的 Markdown 文件。两种版本都不会把 GitHub Token 上传到 markmap++ 服务器。
