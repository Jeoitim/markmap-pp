---
title: GitHub repository sync
outline: deep
---

# GitHub repository sync

A GitHub repository can store Markdown, synchronize devices and provide version history. markmap++ creates a commit only after you click **Sync**; typing never pushes automatically.

## Why sync with GitHub?

GitHub can be more than a code host. It can also be a versioned home for personal Markdown notes:

- **Continue on any device**: use the same repository from a computer, desktop app or mobile browser.
- **Keep history**: every sync creates a Git commit, so you can inspect changes and restore an earlier version.
- **Avoid accidental overwrites**: the app checks the remote branch before syncing and stops when another device has pushed first.
- **Review before pushing**: changes stay staged locally until you confirm a sync instead of creating a commit for every keystroke.
- **Keep ownership**: use your own private repository and choose your own backup policy.

## Basic Git operations

If you already use Git, you can inspect and manage the same repository outside the app:

| Action | Common command | Purpose |
| --- | --- | --- |
| Get a repository | `git clone <repository-url>` | Download it to a computer for the first time |
| Check status | `git status` | See added, modified and deleted files |
| Pull updates | `git pull --ff-only` | Get commits pushed from another device |
| Commit changes | `git add .`, `git commit -m "message"` | Record a group of changes as one version |
| Push a version | `git push` | Upload local commits to GitHub |
| View history | `git log --oneline` | Browse previous commits |

The Web app uses the GitHub API for the same pull and push workflow; the desktop app can also use a local Git workspace. If you edit the same file in the app and on the command line, pull and review the diff before pushing.

## Create a GitHub token

markmap++ needs a fine-grained personal access token to read and update your note repository. Grant access only to that repository instead of using a broad classic token.

1. Sign in to GitHub and open **Settings** from the avatar menu.
2. Find **Developer settings**, or open [Developer Settings](https://github.com/settings/apps) directly.
3. Open **Personal access tokens → Fine-grained tokens** and click **Generate new token** in the upper-right corner.
4. Fill in **Token name**, **Description** and **Expiration**.
   - Choose **No expiration** only when you need a long-lived token. GitHub does not recommend non-expiring tokens. Keeping the token private and restricting it to one note repository reduces exposure, while a shorter expiration and regular rotation is safer.
5. Under **Repository access**, choose **Only select repositories** and select your note repository.
6. Under **Repository permissions**, set **Contents** to **Read and write** and leave other permissions at their defaults.
7. Click **Generate token** and copy it immediately. GitHub normally shows the full token only once.
8. Return to the markmap++ **Repository** tab and enter the repository, branch and token.

Never put the token in Markdown, repository files, screenshots, chat messages or deployment environment variables. Revoke and regenerate it immediately if you suspect that it was exposed.

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

The Web app stores repository bindings and file contents in the current browser's IndexedDB; the desktop app prefers the operating system's secure cache. Tokens are not included in GitHub Pages builds, but they can access the target repository, so avoid long-term bindings on shared devices.
