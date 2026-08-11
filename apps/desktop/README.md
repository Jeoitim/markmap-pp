# markmap++ Desktop

Electron desktop shell for the existing React application. Release builds target Windows x64 and Linux x64; macOS packaging is available only as a local source build.

## Run and build

From the repository root, use Node.js 22+ and the pinned pnpm version:

```bash
pnpm install
pnpm dev:desktop
pnpm build:desktop
pnpm make:desktop:win
pnpm --filter markmap-plus-plus-desktop make:linux
pnpm --filter markmap-plus-plus-desktop make:mac
```

Release output is written to `apps/desktop/release/`:

- `markmap-plus-plus-<version>-windows-x64-setup.exe` is the Windows NSIS installer.
- `markmap-plus-plus-<version>-windows-x64-portable.7z` is the Windows portable archive.
- `markmap-plus-plus-<version>-linux-x64.AppImage` is the Linux AppImage.

Pushing any new Git tag runs the Windows and Linux native builds and creates a GitHub Release with these three files. The builds are not triggered by normal branch pushes.

macOS packages are not built or published in GitHub Actions because the hosted macOS runner can block releases with long queue times. On macOS, run `pnpm --filter markmap-plus-plus-desktop make:mac` locally to create an unsigned native-architecture DMG.

## Platform notes

- Local file access uses Electron's native open/save dialogs and Node's cross-platform path APIs. Workspace moves remain inside the selected repository, so they never cross filesystem volumes.
- Local Git features require the `git` executable to be available on `PATH`: install Git for Windows, Xcode Command Line Tools on macOS, or your distribution's Git package on Linux.
- The Linux secure cache intentionally requires an available system keyring. If no secret service is running, the app refuses to write sensitive credentials rather than falling back to plain text.
- The Windows installer is unsigned until signing credentials are configured, so Windows SmartScreen may show a warning. Some Linux distributions also require FUSE support to launch AppImages.

## Architecture and foundations

- The packaged renderer is loaded through the private `markmap://app/` protocol, which gives IndexedDB and local storage a stable origin across releases.
- The renderer has no Node.js access. Context isolation, sandboxing, CSP, sender validation and Electron fuses are enabled; filesystem access goes through a narrow preload API.
- Native Markdown open/save dialogs are wired into the existing import and export actions.
- The workspace API can select a local folder, list Markdown files, and safely read/write files inside that folder. The UI for browsing this workspace can be added independently in the next iteration.
- Update IPC and state handling remain disabled while `feedUrl` in `resources/update.json` is empty. Configure a signed update channel before enabling in-app updates for release packages.

Local workspace selection is stored in Electron's per-user `userData/desktop-state.json`. Existing web cache, AI settings, conversations and drafts continue to use the renderer's IndexedDB/local storage under the stable desktop origin.
