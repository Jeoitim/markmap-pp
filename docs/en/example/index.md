---
title: GitHub repository sync
outline: deep
---

# GitHub repository sync

A GitHub repository can store Markdown, synchronize devices and provide version history. markmap++ creates a commit only after you click **Sync**; typing never pushes automatically.

## Create a token

Create a fine-grained personal access token for the target repository and grant **Repository permissions → Contents → Read and write**. Do not put the token in Markdown, repository files or deployment environment variables.

## Connect a repository

1. Open the **Repository** tab.
2. Enter `owner/repository` or a full GitHub repository URL.
3. Enter the target branch, such as `main`.
4. Enter the GitHub token and connect.
5. Click a Markdown file in the tree to download it to the current device.

## Cache and states

| Marker | State |
| --- | --- |
| Gray dot | Exists remotely but is not pulled to this device |
| Green dot | Local cache matches the remote |
| `A` | Added file |
| `M` | Modified file |
| `R` | Renamed or moved file |
| `D` | Deleted file |

The title bar shows the active file state: green means synced, orange means staged but not pushed and yellow means syncing.

## Manage files

- Collapse folders and use gray guides to understand nesting.
- Drag files and folders to other directories.
- Right-click to rename, copy, cut, create, paste or delete.
- Press Enter to confirm an inline rename and Esc to cancel.
- Empty folders stay local until they contain a file.

## Sync and commit

Click the purple Sync button to combine pending files in one commit. Commit messages are generated from the actions:

```text
update: add notes/new.md
update: edit notes/topic.md
update: rename old.md to archive/old.md
update: delete draft.md
update: change multiple markdown files
```

Before syncing, the app checks whether the remote branch still matches the version pulled locally. If another device pushed a new commit, syncing stops rather than overwriting remote content.

## Refresh and discard

- **Refresh** reads the remote tree and latest commit without pushing local drafts.
- **Discard** clears local staged actions and restores cached files to the latest remote commit.

::: danger Discard cannot be undone
Confirm that local drafts are no longer needed before using it. Commits already pushed to GitHub are unaffected and remain recoverable through Git history.
:::

## Security

Repository bindings are stored in the current browser's `localStorage`; file contents are stored in IndexedDB. Tokens are not included in GitHub Pages builds, but they can access the target repository, so avoid long-term bindings on shared devices.
