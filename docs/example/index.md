---
title: GitHub 仓库同步
outline: deep
---

# GitHub 仓库同步

GitHub 仓库可以同时承担 Markdown 文件存储、多设备同步和版本历史管理。markmap++ 只在用户点击“同步”后创建提交，不会随每次输入自动推送。

## 为什么使用 GitHub 同步

GitHub 不只是代码托管平台，也可以作为个人 Markdown 笔记的版本库：

- **多端继续**：电脑、桌面 App 和移动浏览器都可以访问同一个仓库，换设备后继续编辑。
- **保留历史**：每次同步都会生成 Git commit，可以查看谁在什么时候改了什么，也能恢复到旧版本。
- **安全回退**：同步前应用会检查远程分支是否变化，发现其他设备已推送新提交时会停止，减少覆盖风险。
- **可审阅修改**：markmap++ 会先在本地暂存改动，确认后再一次性同步，不会因为每次输入产生大量提交。
- **数据归自己**：仓库由你自己的 GitHub 账号管理，可使用私有仓库并按自己的备份策略保存。

## Git 基础操作

如果你已经熟悉 Git，也可以在应用之外检查和管理同一个仓库：

| 操作 | 常用命令 | 用途 |
| --- | --- | --- |
| 获取仓库 | `git clone <仓库地址>` | 第一次在电脑上下载仓库 |
| 查看状态 | `git status` | 查看新增、修改和删除的文件 |
| 拉取更新 | `git pull --ff-only` | 获取其他设备已经推送的版本 |
| 提交修改 | `git add .`、`git commit -m "说明"` | 将一组修改记录为一个版本 |
| 推送版本 | `git push` | 将本地提交上传到 GitHub |
| 查看历史 | `git log --oneline` | 浏览提交记录 |

Web 版通过 GitHub API 完成同样的拉取和推送；桌面 App 还可以直接使用本地 Git 工作区。不要同时在应用和命令行修改同一文件后盲目推送，先拉取、检查差异，再同步更稳妥。

## 创建 GitHub 令牌

markmap++ 需要 fine-grained personal access token 才能读取和更新你的笔记仓库。令牌只应授权目标仓库，不要使用范围过大的 classic token。

1. 登录 GitHub，点击右上角头像 → **Settings**。
2. 在设置页找到 **Developer settings**，也可以直接打开 [Developer Settings](https://github.com/settings/apps)。
3. 进入 **Personal access tokens → Fine-grained tokens**，点击右上角 **Generate new token**。
4. 填写 **Token name**、**Description** 和 **Expiration**。
   - 如果需要长期使用，可以选择 **No expiration**；官方不建议永久令牌。只有在令牌不分享、不泄露，并且范围严格限制为笔记仓库时，风险才相对可控。更稳妥的做法是设置较短期限并定期轮换。
5. 在 **Repository access** 中选择 **Only select repositories**，然后选中你要同步的笔记仓库。
6. 在 **Repository permissions** 中将 **Contents** 设置为 **Read and write**，保留其他权限的默认值。
7. 点击页面底部 **Generate token**，立即复制生成的令牌。GitHub 通常只在生成后显示完整令牌一次。
8. 回到 markmap++ 的“仓库”页，填写仓库地址、分支和令牌并确认绑定。

不要把令牌写入 Markdown、仓库文件、截图、聊天记录或部署平台环境变量。若怀疑泄露，请立即在 GitHub 的 Fine-grained tokens 页面撤销并重新生成。

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

Web 版的仓库绑定信息和文件内容保存在当前浏览器的 IndexedDB；桌面 App 会优先使用操作系统提供的安全缓存。令牌不会进入 GitHub Pages 构建产物，但能访问目标仓库，因此不建议在共享设备上长期绑定。
