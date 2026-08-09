# markmap++ Desktop

Electron desktop shell for the existing React application. The first release targets Windows x64 while keeping the main process and preload bridge portable for macOS and Linux packaging later.

## Run and build

From the repository root, use Node.js 22+ and the pinned pnpm version:

```bash
pnpm install
pnpm dev:desktop
pnpm build:desktop
pnpm make:desktop:win
```

Windows output is written to `apps/desktop/out/make/`:

- `squirrel.windows/x64/markmap-plus-plus-Setup.exe` is the Squirrel installer.
- `zip/win32/x64/markmap++-win32-x64-<version>.zip` is the portable archive.

The current installer is unsigned. Windows SmartScreen warnings are expected until a code-signing certificate is configured.

## Architecture and foundations

- The packaged renderer is loaded through the private `markmap://app/` protocol, which gives IndexedDB and local storage a stable origin across releases.
- The renderer has no Node.js access. Context isolation, sandboxing, CSP, sender validation and Electron fuses are enabled; filesystem access goes through a narrow preload API.
- Native Markdown open/save dialogs are wired into the existing import and export actions.
- The workspace API can select a local folder, list Markdown files, and safely read/write files inside that folder. The UI for browsing this workspace can be added independently in the next iteration.
- Update IPC and state handling are ready for Squirrel.Windows. Set `feedUrl` in `resources/update.json` when a release server and signing process are available. An empty URL intentionally leaves updates disabled.

Local workspace selection is stored in Electron's per-user `userData/desktop-state.json`. Existing web cache, AI settings, conversations and drafts continue to use the renderer's IndexedDB/local storage under the stable desktop origin.
