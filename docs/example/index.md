---
title: GitHub 仓库同步
outline: deep
---

# GitHub 仓库同步

GitHub 仓库可以同时承担 Markdown 文件存储、多设备同步和版本历史管理。markmap++ 只在用户点击“同步”后创建提交，不会随每次输入自动推送。

## 准备令牌

建议创建仅授权目标仓库的 fine-grained personal access token，并授予：

- Repository access：只选择存放 Markdown 的仓库。
- Repository permissions → Contents：Read and write。

不要把令牌写入 Markdown、仓库文件或部署平台环境变量。它只需填写在应用的仓库设置中。

## 绑定步骤

1. 打开左侧“仓库”页签。
2. 填写 `owner/repository` 或完整 GitHub 仓库地址。
3. 填写目标分支，例如 `main`。
4. 填写 GitHub 令牌并确认绑定。
5. 点击文件树中的 Markdown 文件，将其下载到当前设备。

底部 Git 图标和分支名可以再次打开仓库设置。

## 缓存与状态

| 标记 | 状态 |
| --- | --- |
| 灰点 | 文件存在于远程，但尚未拉取到当前设备 |
| 绿点 | 本地缓存与远程一致 |
| `A` | 新增文件 |
| `M` | 修改文件 |
| `R` | 重命名或移动文件 |
| `D` | 删除文件 |

标题栏只显示当前文件状态：绿色表示已同步，橙色表示已暂存但未推送，黄色表示同步中。

## 文件管理

- 文件夹可折叠，灰色辅助线用于判断嵌套层级。
- 文件和文件夹可以拖动到其他目录。
- 右键可重命名、复制、剪切、新建、粘贴或删除。
- 重命名在文件树中直接编辑，按 Enter 确认，按 Esc 取消。
- 空文件夹只保存在本地，加入文件后才会体现在 Git 中。

## 同步与自动提交

点击紫色同步按钮后，全部待处理文件合并到一次提交。提交说明会根据操作生成：

```text
update: add notes/new.md
update: edit notes/topic.md
update: rename old.md to archive/old.md
update: delete draft.md
update: change multiple markdown files
```

同步前应用会检查远程分支是否仍是本地拉取时的版本。如果其他设备已经推送新提交，本次同步会停止，避免覆盖远程内容。

## 刷新与放弃

- “刷新”重新读取远程目录和最新提交，不会自动推送本地草稿。
- 红色“放弃”会清除所有本地暂存操作，并让已缓存文件恢复到远程最新提交。

::: danger 放弃修改不可撤回
执行前请确认本地草稿不再需要。已经推送到 GitHub 的提交不受影响，仍可通过 Git 历史恢复。
:::

## 安全说明

仓库绑定信息保存在当前浏览器的 `localStorage`，文件内容保存在 IndexedDB。令牌不会进入 GitHub Pages 构建产物，但能访问目标仓库，因此不建议在共享设备上长期绑定。
