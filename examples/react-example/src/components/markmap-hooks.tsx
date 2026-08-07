import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import katex from 'katex'
import { defaultOptions, deriveOptions, Markmap, toMarkdown, Transformer } from 'markmap-plus'
import type { IMarkmapJSONOptions, IMarkmapOptions } from 'markmap-plus'
import 'katex/dist/katex.min.css'
import '@fontsource-variable/inter'
import '@fontsource-variable/jetbrains-mono'
import '@fontsource-variable/noto-sans-sc/wght.css'
import '@fontsource-variable/noto-serif-sc/wght.css'
import 'lxgw-wenkai-webfont/lxgwwenkai-regular.css'
import MarkdownEditor, { type HighlightScheme } from './markdown-editor'
import { inspectMarkdown } from './markdown-lint'
import {
  downloadMarkdown,
  downloadMarkdownAtCommit,
  listCachedFiles,
  listFileCommits,
  listRemoteMarkdown,
  listRepositoryBranches,
  listRepositoryCommits,
  loadGitHubConfig,
  pushCachedChanges,
  putCachedFile,
  removeCachedFile,
  repoKeyOf,
  saveGitHubConfig,
  verifyRepository,
  type CachedMarkdownFile,
  type GitHubBranch,
  type GitHubFileCommit,
  type GitHubRepositoryCommit,
  type GitHubConfig,
  type RemoteMarkdownFile,
} from './github-sync'

window.katex = katex as unknown as typeof window.katex
const transformer = new Transformer()
const SETTINGS_KEY = 'markmap-plus-plus:settings'
const VIRTUAL_FOLDERS_KEY = 'markmap-plus-plus:virtual-folders'
const MARKMAP_PREVIEW_ID = 'markmap-preview'

const starterDocument = `---
title: markmap++ 使用指南
options:
  colorFreezeLevel: 2
  maxWidth: 360
---

# markmap++

## 👋 欢迎使用

- 左侧编写 **Markdown**，右侧即时生成思维导图
- 这既是一份功能演示，也是一份可直接修改的操作教程
- 刷新页面会恢复本指南；重要内容请使用顶部 **导出** 保存
- [markmap++ 文档站](https://jeoitim.github.io/markmap-pp/doc/) · GitHub 项目：[Jeoitim/markmap-pp](https://github.com/Jeoitim/markmap-pp)

## 🧭 节点与画布操作

| 图标 | 操作 | 效果 |
| :--: | --- | --- |
| 🖱️ | 单击 / 双击节点 | 选中节点 / 编辑文字 |
| ↩️ | 选中后按 Enter | 新增同级节点 |
| ⇥ | 选中后按 Tab | 新增子节点 |
| ⌫ | Delete / Backspace | 删除整个节点 |
| ↶ | 点击顶部“撤回” | 恢复最近一次修改 |
| ✥ | 拖动画布 / 滚轮 | 移动画布 / 缩放视图 |
| ◉ | 点击节点圆点 | 折叠或展开分支 |

## ✍️ Markdown 丰富语法

### 文字样式

- **粗体**、*斜体*、~~删除线~~、==高亮== 与 \`行内代码\`
- 很长很长的文字会根据 maxWidth 自动换行，适合记录完整说明
- 有序步骤
  1. 在左侧拖动光标选中文字
  2. 输入或粘贴 Markdown
  3. 在右侧查看实时结果

### 任务清单

- [x] 表格
- [x] LaTeX 公式
- [x] Checkbox
- [x] 在线图片
- [ ] 用你的内容继续探索

### 代码块

\`\`\`js
const message = 'Hello, markmap++'
console.log(message)
\`\`\`

## ∑ LaTeX 公式

### 实际渲染

- 行内公式：圆的面积是 $A = \\pi r^2$
- 二次方程求根公式：$x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$

### 公式源码示例

\`\`\`latex
\\int_{-\\infty}^{\\infty} e^{-x^2} \\, dx = \\sqrt{\\pi}
\`\`\`

## 🖼️ 在线图片

### Markmap

![Markmap 图标](https://markmap.js.org/favicon.png)

### GitHub

![GitHub 图标](https://cdn.simpleicons.org/github/7056e8)

## 🎛️ 编辑与显示

| 位置 | 能做什么 |
| --- | --- |
| 中间分割线 | 拖动调整两侧宽度；长条按钮收起或展开编辑器 |
| 编辑器右上角 | 调整字号与语法高亮方案 |
| 预览右上角 | 适应画布、切换字体/字重和点阵背景 |
| 页面右上角 | 打开说明、撤回、导出、全屏和深浅色模式 |

## ☁️ GitHub 多端同步

| 状态 | 含义 | 下一步 |
| :--: | --- | --- |
| 灰点 | 文件尚未拉取 | 单击文件下载到本机缓存 |
| A / M | 新增 / 已修改 | 检查内容后点击“同步” |
| R / D | 已重命名 / 已删除 | 同步后写入远端仓库 |
| 🟢 | 已同步 | 可以继续编辑 |
| 🟠 | 已暂存、未推送 | 点击“同步”创建提交并推送 |

## 📦 导出

- Markdown：保留可继续编辑的源文件
- SVG / HTML：适合网页与无限缩放
- PNG / JPEG：适合分享，可选择 1×–4× 渲染倍率
`

type Pane = 'editor' | 'preview'
type Panel = Pane | 'export' | 'github' | 'help' | null
type ExportFormat = 'md' | 'svg' | 'png' | 'jpeg' | 'html'
type PreviewFont = 'inter' | 'notoSans' | 'notoSerif' | 'wenkai' | 'mono'

interface AppSettings {
  editorFontSize: number
  highlightScheme: HighlightScheme
  previewFontSize: number
  previewFont: PreviewFont
  previewWeight: number
  colorFreezeLevel: number
  showGrid: boolean
}

const defaultSettings: AppSettings = {
  editorFontSize: 14,
  highlightScheme: 'violet',
  previewFontSize: 16,
  previewFont: 'notoSans',
  previewWeight: 400,
  colorFreezeLevel: 2,
  showGrid: true,
}

const previewFonts: Record<PreviewFont, { label: string; family: string }> = {
  notoSans: { label: '思源黑体（Noto Sans SC Variable）', family: '"Noto Sans SC Variable", sans-serif' },
  notoSerif: { label: '思源宋体（Noto Serif SC Variable）', family: '"Noto Serif SC Variable", serif' },
  wenkai: { label: '霞鹜文楷（LXGW WenKai）', family: '"LXGW WenKai", cursive' },
  inter: { label: 'Inter Variable', family: '"Inter Variable", sans-serif' },
  mono: { label: 'JetBrains Mono Variable', family: '"JetBrains Mono Variable", monospace' },
}

type CodeOptions = Partial<IMarkmapJSONOptions> & {
  font?: string
  fontFamily?: string
  fontSize?: number | string
  fontWeight?: number | string
  showGrid?: boolean
}

interface CodeFontOptions {
  shorthand?: string
  family?: string
  size?: string
  weight?: string
  controlsFamily: boolean
  controlsSize: boolean
  controlsWeight: boolean
}

interface DocumentRenderConfig {
  root: ReturnType<Transformer['transform']>['root']
  jsonOptions: CodeOptions
  optionKeys: string[]
  style: string
  colorFreezeLevel?: number
  showGrid?: boolean
  font: CodeFontOptions
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function cssDeclaration(style: string, property: string) {
  const expression = new RegExp(`(?:^|[;{\\s])${property}\\s*:\\s*([^;}]+)`, 'gi')
  return Array.from(style.matchAll(expression)).at(-1)?.[1]?.trim()
}

function cssLength(value: unknown) {
  if (typeof value === 'number') return `${value}px`
  if (typeof value === 'string' && value.trim()) return /^-?\d+(?:\.\d+)?$/.test(value.trim()) ? `${value.trim()}px` : value.trim()
}

function normalizeExportText(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function wrapExportText(text: string, maxWidth: number, measure: (value: string) => number) {
  const normalized = normalizeExportText(text)
  if (!normalized) return []

  const lines: string[] = []
  let current = ''
  for (const character of Array.from(normalized)) {
    const candidate = current + character
    if (current && measure(candidate) > maxWidth) {
      lines.push(current.trimEnd())
      current = character === ' ' ? '' : character
    } else {
      current = candidate
    }
  }
  if (current) lines.push(current.trimEnd())
  return lines.filter(Boolean)
}

function getForeignContentElement(foreignObject: SVGForeignObjectElement) {
  const content = foreignObject.firstElementChild?.firstElementChild
  return content instanceof HTMLElement ? content : null
}

function getRenderedTextLines(foreignObject: SVGForeignObjectElement) {
  const content = getForeignContentElement(foreignObject)
  if (!content) return []

  const expectedText = normalizeExportText(content.textContent || '')
  if (!expectedText) return []

  const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT)
  const range = document.createRange()
  const lines: string[] = []
  let current = ''
  let currentTop: number | undefined
  let textNode: Node | null

  while ((textNode = walker.nextNode())) {
    const value = textNode.nodeValue || ''
    for (let offset = 0; offset < value.length;) {
      const codePoint = value.codePointAt(offset) || 0
      const character = String.fromCodePoint(codePoint)
      const nextOffset = offset + character.length
      range.setStart(textNode, offset)
      range.setEnd(textNode, nextOffset)
      const rect = range.getClientRects()[0]
      const top = rect?.top

      if (top !== undefined && currentTop !== undefined && Math.abs(top - currentTop) > Math.max(1, (rect.height || 0) * 0.25)) {
        if (current.trim()) lines.push(current.trimEnd())
        current = ''
        currentTop = top
      } else if (top !== undefined && currentTop === undefined) {
        currentTop = top
      }

      if (!(character === ' ' && !current)) current += character
      offset = nextOffset
    }
  }
  if (current.trim()) lines.push(current.trimEnd())

  const joined = lines.join('').replace(/\s/g, '')
  return joined === expectedText.replace(/\s/g, '') ? lines : []
}

function buildDocumentRenderConfig(markdown: string): DocumentRenderConfig {
  const transformed = transformer.transform(markdown)
  const frontmatter = recordValue(transformed.frontmatter)
  const markmap = recordValue(frontmatter.markmap)
  const options = { ...markmap, ...recordValue(frontmatter.options) } as CodeOptions
  const rawStyle = typeof frontmatter.style === 'string' ? frontmatter.style : ''
  const style = rawStyle.replaceAll('${id}', MARKMAP_PREVIEW_ID)
  const shorthand = typeof options.font === 'string' ? options.font.trim() : cssDeclaration(style, '--markmap-font') || cssDeclaration(style, 'font')
  const family = typeof options.fontFamily === 'string' ? options.fontFamily.trim() : cssDeclaration(style, 'font-family')
  const size = cssLength(options.fontSize) || cssDeclaration(style, 'font-size')
  const weight = options.fontWeight == null ? cssDeclaration(style, 'font-weight') : String(options.fontWeight)
  const parsedColorFreezeLevel = Number(options.colorFreezeLevel)
  return {
    root: transformed.root,
    jsonOptions: options,
    optionKeys: Object.keys(options).filter((key) => !['htmlParser', 'extraCss', 'extraJs'].includes(key)),
    style,
    colorFreezeLevel: options.colorFreezeLevel != null && Number.isFinite(parsedColorFreezeLevel) ? parsedColorFreezeLevel : undefined,
    showGrid: typeof options.showGrid === 'boolean' ? options.showGrid : undefined,
    font: {
      shorthand,
      family,
      size,
      weight,
      controlsFamily: Boolean(shorthand || family),
      controlsSize: Boolean(shorthand || size),
      controlsWeight: Boolean(shorthand || weight),
    },
  }
}

function resolveFontFamily(value: string | undefined, fallback: string) {
  if (!value) return fallback
  return value in previewFonts ? previewFonts[value as PreviewFont].family : value
}

interface RepositoryRow {
  type: 'folder' | 'file'
  path: string
  name: string
  depth: number
  remote?: RemoteMarkdownFile
  cached?: CachedMarkdownFile
}

type RepositoryTarget = Pick<RepositoryRow, 'type' | 'path' | 'name'> | { type: 'root'; path: ''; name: '仓库根目录' }
type RepositoryClipboard = { mode: 'copy' | 'cut'; target: RepositoryTarget }
type RepositoryHistoryState = {
  target: RepositoryTarget
  x: number
  y: number
  commits: GitHubFileCommit[]
  loading: boolean
  error: string
}
type RepositoryGraphState = {
  branches: GitHubBranch[]
  commits: GitHubRepositoryCommit[]
  loading: boolean
  error: string
}

function parentPath(path: string) {
  return path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''
}

function baseName(path: string) {
  return path.slice(path.lastIndexOf('/') + 1)
}

function historicalFileName(path: string, commitSha: string) {
  const name = baseName(path)
  const match = name.match(/^(.*?)(\.(?:md|markdown))$/i)
  return `${match?.[1] || name} [${commitSha.slice(0, 7)}]${match?.[2] || '.md'}`
}

function formatCommitDate(value: string) {
  if (!value) return '时间未知'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '时间未知'
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(date)
}

function joinPath(folder: string, name: string) {
  return [folder, name].filter(Boolean).join('/')
}

function validRepositoryPath(path: string) {
  return Boolean(path) && !path.startsWith('/') && !path.endsWith('/') && !path.split('/').some((part) => !part || part === '.' || part === '..')
}

function loadVirtualFolders(repoKey: string) {
  try {
    const stored = JSON.parse(localStorage.getItem(VIRTUAL_FOLDERS_KEY) || '{}') as Record<string, string[]>
    return stored[repoKey] || []
  } catch {
    return []
  }
}

function saveVirtualFolders(repoKey: string, folders: string[]) {
  try {
    const stored = JSON.parse(localStorage.getItem(VIRTUAL_FOLDERS_KEY) || '{}') as Record<string, string[]>
    stored[repoKey] = folders
    localStorage.setItem(VIRTUAL_FOLDERS_KEY, JSON.stringify(stored))
  } catch { /* storage may be disabled */ }
}

function buildRepositoryRows(remoteFiles: RemoteMarkdownFile[], cachedFiles: CachedMarkdownFile[], virtualFolders: string[], collapsedFolders: Set<string>): RepositoryRow[] {
  const files = new Map<string, { remote?: RemoteMarkdownFile; cached?: CachedMarkdownFile }>()
  remoteFiles.forEach((remote) => {
    const cached = cachedFiles.find((file) => file.path === remote.path || file.originalPath === remote.path)
    files.set(cached?.status === 'renamed' ? cached.path : remote.path, { remote, cached })
  })
  cachedFiles.forEach((cached) => {
    if (!files.has(cached.path)) files.set(cached.path, { cached })
  })
  const folders = new Set<string>()
  virtualFolders.forEach((path) => {
    const parts = path.split('/')
    parts.forEach((_, index) => folders.add(parts.slice(0, index + 1).join('/')))
  })
  Array.from(files).forEach(([path]) => {
    const parts = path.split('/')
    for (let index = 0; index < parts.length - 1; index += 1) {
      folders.add(parts.slice(0, index + 1).join('/'))
    }
  })
  const rows: RepositoryRow[] = [
    ...Array.from(folders, (path) => ({ type: 'folder' as const, path, name: baseName(path), depth: path.split('/').length - 1 })),
    ...Array.from(files, ([path, value]) => ({ type: 'file' as const, path, name: baseName(path), depth: path.split('/').length - 1, ...value })),
  ]
  return rows
    .sort((a, b) => a.path.localeCompare(b.path) || (a.type === 'folder' ? -1 : 1))
    .filter((row) => !Array.from(collapsedFolders).some((folder) => row.path !== folder && row.path.startsWith(`${folder}/`)))
}

type IconName = 'branch' | 'check' | 'chevron-down' | 'chevron-left' | 'chevron-right' | 'clock' | 'collapse' | 'download' | 'expand' | 'focus' | 'folder' | 'github' | 'help' | 'map' | 'moon' | 'more' | 'refresh' | 'settings' | 'sun' | 'sync' | 'undo' | 'warning' | 'x'

const iconPaths: Record<IconName, React.ReactNode> = {
  branch: <><path d="M6 4v12a4 4 0 0 0 4 4h8"/><path d="M18 8V4m0 0-3 3m3-3 3 3"/><circle cx="6" cy="4" r="2"/><circle cx="18" cy="20" r="2"/></>,
  check: <path d="m5 12 4 4L19 6"/>,
  'chevron-down': <path d="m6 9 6 6 6-6"/>,
  'chevron-left': <path d="m15 18-6-6 6-6"/>,
  'chevron-right': <path d="m9 18 6-6-6-6"/>,
  clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  collapse: <><path d="M4 14h6v6M20 10h-6V4"/><path d="M14 20v-6h6M10 4v6H4"/></>,
  download: <><path d="M12 3v12m0 0 4-4m-4 4-4-4"/><path d="M5 19h14"/></>,
  expand: <path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5"/>,
  focus: <><circle cx="12" cy="12" r="3"/><path d="M12 2v4m0 12v4M2 12h4m12 0h4"/></>,
  folder: <><path d="M3 7.5V6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3Z"/><path d="M3 9h18"/></>,
  github: <><circle cx="6" cy="5" r="2"/><circle cx="18" cy="6" r="2"/><circle cx="8" cy="19" r="2"/><path d="M6 7v5a3 3 0 0 0 3 3h5a4 4 0 0 0 4-4V8M8 17v-2"/></>,
  help: <><circle cx="12" cy="12" r="9"/><path d="M9.8 9a2.3 2.3 0 1 1 3.4 2c-.8.5-1.2 1-1.2 2"/><path d="M12 17h.01"/></>,
  map: <><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3Z"/><path d="M9 3v15m6-12v15"/></>,
  moon: <path d="M20 15.2A8 8 0 1 1 8.8 4 6.5 6.5 0 0 0 20 15.2Z"/>,
  more: <><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>,
  refresh: <><path d="M20 7v5h-5"/><path d="M18.2 16.5A8 8 0 1 1 19.8 9L20 12"/></>,
  settings: <><path d="M4 7h10m4 0h2M4 12h3m4 0h9M4 17h8m4 0h4"/><circle cx="16" cy="7" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="14" cy="17" r="2"/></>,
  sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/></>,
  sync: <><path d="m8 15 4-4 4 4m-4-4v9"/><path d="M7 18H5.8A3.8 3.8 0 0 1 5 10.5 7 7 0 0 1 18.5 9a4.5 4.5 0 0 1 .5 8.9"/></>,
  undo: <><path d="M9 7 4 12l5 5"/><path d="M5 12h8a6 6 0 0 1 6 6v1"/></>,
  warning: <><path d="M10.3 3.7 2.5 17.2A2 2 0 0 0 4.2 20h15.6a2 2 0 0 0 1.7-2.8L13.7 3.7a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4m0 3h.01"/></>,
  x: <path d="m6 6 12 12M18 6 6 18"/>,
}

function Icon({ name }: { name: IconName }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{iconPaths[name]}</svg>
}

function loadDocument() {
  return starterDocument
}

function loadSettings(): AppSettings {
  try {
    const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') as Partial<AppSettings> & { previewFont?: string }
    const legacyFonts: Record<string, PreviewFont> = { serif: 'notoSerif' }
    const requestedFont = stored.previewFont ? legacyFonts[stored.previewFont] || stored.previewFont : defaultSettings.previewFont
    const previewFont = requestedFont in previewFonts ? requestedFont as PreviewFont : defaultSettings.previewFont
    return { ...defaultSettings, ...stored, previewFont }
  } catch {
    return defaultSettings
  }
}

function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function MarkmapHooks() {
  const [markdown, setMarkdown] = useState(loadDocument)
  const [renderedMarkdown, setRenderedMarkdown] = useState(markdown)
  const [fileName, setFileName] = useState('markmap++ 操作指南.md')
  const [dark, setDark] = useState(false)
  const [mobilePane, setMobilePane] = useState<Pane>('editor')
  const [editorView, setEditorView] = useState<'markdown' | 'repository'>('markdown')
  const [saveState, setSaveState] = useState<'saved' | 'saving'>('saved')
  const [settings, setSettings] = useState(loadSettings)
  const [activePanel, setActivePanel] = useState<Panel>(null)
  const [editorWidth, setEditorWidth] = useState(38)
  const [editorCollapsed, setEditorCollapsed] = useState(false)
  const [canUndo, setCanUndo] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [actionMenuOpen, setActionMenuOpen] = useState(false)
  const [exportFormat, setExportFormat] = useState<ExportFormat>('png')
  const [exportScale, setExportScale] = useState(2)
  const [exportTab, setExportTab] = useState<'file' | 'repository'>('file')
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState('')
  const [showDiagnostics, setShowDiagnostics] = useState(false)
  const [githubConfig, setGithubConfig] = useState<GitHubConfig | null>(loadGitHubConfig)
  const [repositoryInput, setRepositoryInput] = useState(() => { const config = loadGitHubConfig(); return config ? `${config.owner}/${config.repo}` : '' })
  const [branchInput, setBranchInput] = useState(() => loadGitHubConfig()?.branch || 'main')
  const [tokenInput, setTokenInput] = useState(() => loadGitHubConfig()?.token || '')
  const [remoteFiles, setRemoteFiles] = useState<RemoteMarkdownFile[]>([])
  const [cachedFiles, setCachedFiles] = useState<CachedMarkdownFile[]>([])
  const [remoteHead, setRemoteHead] = useState('')
  const [repositoryCommitRef, setRepositoryCommitRef] = useState<string | null>(null)
  const [repositoryGraph, setRepositoryGraph] = useState<RepositoryGraphState | null>(null)
  const [repositoryGraphBranchesOpen, setRepositoryGraphBranchesOpen] = useState(false)
  const [activeRepoPath, setActiveRepoPath] = useState<string | null>(null)
  const [githubBusy, setGithubBusy] = useState(false)
  const [githubError, setGithubError] = useState('')
  const [githubNotice, setGithubNotice] = useState('')
  const [virtualFolders, setVirtualFolders] = useState<string[]>([])
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(() => new Set())
  const [repositorySaveCollapsedFolders, setRepositorySaveCollapsedFolders] = useState<Set<string>>(() => new Set())
  const [repositoryClipboard, setRepositoryClipboard] = useState<RepositoryClipboard | null>(null)
  const [repositoryMenu, setRepositoryMenu] = useState<{ x: number; y: number; target: RepositoryTarget } | null>(null)
  const [repositoryHistory, setRepositoryHistory] = useState<RepositoryHistoryState | null>(null)
  const [repositorySaveMode, setRepositorySaveMode] = useState(false)
  const [repositorySaveFolder, setRepositorySaveFolder] = useState('')
  const [repositorySaveName, setRepositorySaveName] = useState('')
  const [repositoryNewFolderParent, setRepositoryNewFolderParent] = useState<string | null>(null)
  const [repositoryNewFolderName, setRepositoryNewFolderName] = useState('')
  const [draggedRepositoryTarget, setDraggedRepositoryTarget] = useState<RepositoryTarget | null>(null)
  const [repositoryDropFolder, setRepositoryDropFolder] = useState<string | null>(null)
  const [repositoryTouchDrag, setRepositoryTouchDrag] = useState<{ target: RepositoryTarget; dropFolder: string | null; dragging: boolean; x: number; y: number } | null>(null)
  const [renamingRepositoryTarget, setRenamingRepositoryTarget] = useState<RepositoryTarget | null>(null)
  const [repositoryRenameValue, setRepositoryRenameValue] = useState('')
  const initialMarkdownRef = useRef(markdown)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const mmRef = useRef<Markmap | null>(null)
  const imageRelayoutTimerRef = useRef<number | null>(null)
  const suppressRepositoryClickRef = useRef(false)
  const repositoryTouchGestureRef = useRef<{
    target: RepositoryTarget
    element: HTMLElement
    originalDraggable: boolean
    startX: number
    startY: number
    lastX: number
    lastY: number
    longPressed: boolean
    dragging: boolean
    dropFolder: string | null
    timer: number
  } | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const actionsRef = useRef<HTMLElement | null>(null)
  const workspaceRef = useRef<HTMLElement | null>(null)
  const resizeWidthRef = useRef(editorWidth)
  const markdownRef = useRef(markdown)
  const historyRef = useRef<string[]>([])
  const lastEditRef = useRef({ source: '', time: 0 })

  useEffect(() => () => {
    const gesture = repositoryTouchGestureRef.current
    if (!gesture) return
    window.clearTimeout(gesture.timer)
    gesture.element.draggable = gesture.originalDraggable
  }, [])

  useEffect(() => {
    let frame = 0
    const restorePageOrigin = () => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => {
        if (window.scrollX || window.scrollY) window.scrollTo(0, 0)
      })
    }
    window.addEventListener('scroll', restorePageOrigin, { passive: true })
    window.addEventListener('resize', restorePageOrigin, { passive: true })
    window.visualViewport?.addEventListener('resize', restorePageOrigin, { passive: true })
    document.addEventListener('focusout', restorePageOrigin)
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('scroll', restorePageOrigin)
      window.removeEventListener('resize', restorePageOrigin)
      window.visualViewport?.removeEventListener('resize', restorePageOrigin)
      document.removeEventListener('focusout', restorePageOrigin)
    }
  }, [])

  const diagnostics = useMemo(() => inspectMarkdown(markdown), [markdown])
  const documentRenderConfig = useMemo(() => buildDocumentRenderConfig(renderedMarkdown), [renderedMarkdown])
  const codeFont = documentRenderConfig.font
  const selectedFontFamily = previewFonts[settings.previewFont].family
  const effectiveFontFamily = resolveFontFamily(codeFont.family, selectedFontFamily)
  const effectiveFontSizeCss = codeFont.size || `${settings.previewFontSize}px`
  const effectiveFontSize = Number.parseFloat(effectiveFontSizeCss) || settings.previewFontSize
  const effectiveFontWeightCss = codeFont.weight || String(settings.previewWeight)
  const effectiveFontWeight = Number.parseFloat(effectiveFontWeightCss) || settings.previewWeight
  const effectiveColorFreezeLevel = documentRenderConfig.colorFreezeLevel ?? settings.colorFreezeLevel
  const effectiveShowGrid = documentRenderConfig.showGrid ?? settings.showGrid
  const effectiveMarkmapOptions = useMemo<Partial<IMarkmapOptions>>(() => deriveOptions({
    ...documentRenderConfig.jsonOptions,
    colorFreezeLevel: effectiveColorFreezeLevel,
  }), [documentRenderConfig.jsonOptions, effectiveColorFreezeLevel])
  const fontPreviewStyle: React.CSSProperties = codeFont.shorthand
    ? { font: codeFont.shorthand }
    : { fontFamily: effectiveFontFamily, fontSize: effectiveFontSizeCss, fontWeight: effectiveFontWeightCss }
  const updateSettings = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => setSettings((current) => ({ ...current, [key]: value }))
  const resetSettings = () => setSettings({ ...defaultSettings })
  const updateMarkdown = useCallback((value: string, source = 'editor') => {
    const current = markdownRef.current
    if (value === current) return
    const now = Date.now()
    const groupedTyping = source === 'editor' && lastEditRef.current.source === 'editor' && now - lastEditRef.current.time < 700
    if (!groupedTyping) {
      historyRef.current = [...historyRef.current.slice(-49), current]
      setCanUndo(true)
    }
    lastEditRef.current = { source, time: now }
    markdownRef.current = value
    setSaveState('saving')
    setMarkdown(value)
  }, [])
  const syncFromMap = useCallback(() => {
    const data = mmRef.current?.getData(true)
    if (data) updateMarkdown(toMarkdown(data), 'map')
  }, [updateMarkdown])
  const viewOptions = useCallback((codeOptions: Partial<IMarkmapOptions>): Partial<IMarkmapOptions> => ({
    ...defaultOptions,
    autoFit: false,
    editable: true,
    addable: true,
    deletable: true,
    collapseOnHover: false,
    hoverBorder: true,
    clickBorder: true,
    duration: 220,
    inputPlaceholder: '输入节点内容',
    onNodeEdit: syncFromMap,
    onNodeAdd: syncFromMap,
    ...codeOptions,
  }), [syncFromMap])

  const undoLastChange = useCallback(() => {
    const previous = historyRef.current.pop()
    if (previous === undefined) return
    lastEditRef.current = { source: '', time: 0 }
    markdownRef.current = previous
    setMarkdown(previous)
    setRenderedMarkdown(previous)
    setSaveState('saving')
    setCanUndo(historyRef.current.length > 0)
  }, [])

  const activateCachedFile = useCallback((file: CachedMarkdownFile) => {
    historyRef.current = []
    lastEditRef.current = { source: '', time: 0 }
    markdownRef.current = file.content
    setCanUndo(false)
    setMarkdown(file.content)
    setRenderedMarkdown(file.content)
    setFileName(file.path)
    setActiveRepoPath(file.path)
    setEditorView('markdown')
    setSaveState('saved')
    window.setTimeout(() => mmRef.current?.fit(), 80)
  }, [])

  const activateHistoricalFile = useCallback((content: string, path: string, commitSha: string) => {
    historyRef.current = []
    lastEditRef.current = { source: '', time: 0 }
    markdownRef.current = content
    setCanUndo(false)
    setMarkdown(content)
    setRenderedMarkdown(content)
    setFileName(historicalFileName(path, commitSha))
    setActiveRepoPath(null)
    setEditorView('markdown')
    setSaveState('saved')
    window.setTimeout(() => mmRef.current?.fit(), 80)
  }, [])

  const refreshCachedFiles = useCallback(async (config: GitHubConfig) => {
    const files = await listCachedFiles(repoKeyOf(config))
    setCachedFiles(files)
    return files
  }, [])

  const refreshRepository = useCallback(async (config: GitHubConfig) => {
    const result = await listRemoteMarkdown(config)
    setRemoteHead(result.head)
    setRemoteFiles(result.files)
    await refreshCachedFiles(config)
    return result
  }, [refreshCachedFiles])

  const bindRepository = async () => {
    const [owner, repo, extra] = repositoryInput.trim().replace(/^https:\/\/github\.com\//, '').replace(/\.git$/, '').split('/').filter(Boolean)
    if (!owner || !repo || extra) { setGithubError('仓库请填写为 owner/repo 或完整 GitHub 仓库地址'); return }
    if (!tokenInput.trim()) { setGithubError('请输入具有 Contents 读写权限的 GitHub 令牌'); return }
    setGithubBusy(true); setGithubError(''); setGithubNotice('')
    try {
      const candidate = { owner, repo, branch: branchInput.trim(), token: tokenInput.trim() }
      const verified = await verifyRepository(candidate)
      const config = { ...candidate, branch: verified.branch }
      saveGitHubConfig(config)
      setGithubConfig(config)
      setBranchInput(config.branch)
      await refreshRepository(config)
      setGithubNotice(`已绑定 ${verified.fullName} · ${config.branch}`)
      setEditorView('repository')
      setActivePanel(null)
    } catch (error) {
      setGithubError(error instanceof Error ? error.message : '绑定仓库失败')
    } finally { setGithubBusy(false) }
  }

  const openRepositoryFile = async (remote: RemoteMarkdownFile) => {
    if (!githubConfig) return
    setGithubBusy(true); setGithubError(''); setGithubNotice('')
    try {
      const local = cachedFiles.find((file) => file.path === remote.path || file.originalPath === remote.path)
      if (local && (local.status !== 'clean' || local.baseSha === remote.sha)) activateCachedFile(local)
      else {
        const file = await downloadMarkdown(githubConfig, remote, remoteHead)
        await putCachedFile(file)
        setCachedFiles((current) => [...current.filter((item) => item.id !== file.id), file].sort((a, b) => a.path.localeCompare(b.path)))
        activateCachedFile(file)
      }
      setEditorView('markdown'); setActivePanel(null)
    } catch (error) {
      setGithubError(error instanceof Error ? error.message : '下载文件失败')
    } finally { setGithubBusy(false) }
  }

  const cancelRepositorySave = () => {
    setRepositorySaveMode(false)
    setRepositorySaveFolder('')
    setRepositorySaveName('')
    setRepositoryNewFolderParent(null)
    setRepositoryNewFolderName('')
    setRepositoryMenu(null)
    setDraggedRepositoryTarget(null)
    setRepositoryDropFolder(null)
    setRepositoryTouchDrag(null)
  }

  const startRepositorySave = () => {
    if (!githubConfig) {
      setGithubError('请先绑定 GitHub 仓库')
      setActivePanel('github')
      return
    }
    const currentName = baseName(fileName) || '未命名.md'
    setRepositorySaveName(/\.md$/i.test(currentName) ? currentName : `${currentName}.md`)
    setRepositorySaveFolder('')
    setRepositorySaveCollapsedFolders(new Set())
    setRepositorySaveMode(true)
    setExportTab('repository')
    setActivePanel('export')
    setGithubError('')
    setGithubNotice('')
    setGithubBusy(true)
    void refreshRepository(githubConfig)
      .catch((error) => setGithubError(error instanceof Error ? error.message : '刷新仓库失败'))
      .finally(() => setGithubBusy(false))
  }

  const saveCurrentDocumentToRepository = async () => {
    if (!githubConfig) return
    let name = repositorySaveName.trim()
    if (!name) { setGithubError('请输入 Markdown 文件名'); return }
    if (!/\.md$/i.test(name)) name += '.md'
    const path = joinPath(repositorySaveFolder, name)
    const occupied = buildRepositoryRows(remoteFiles, cachedFiles, virtualFolders, new Set()).some((row) => row.path === path)
    if (!validRepositoryPath(path) || /[\\/]/.test(name) || name === '.' || name === '..') { setGithubError('文件名无效，不能包含路径分隔符'); return }
    if (occupied) { setGithubError(`“${path}”已存在，请换一个文件名`); return }
    if (!remoteHead) { setGithubError('仓库尚未准备好，请先刷新文件树'); return }

    setGithubBusy(true); setGithubError(''); setGithubNotice('')
    try {
      const repoKey = repoKeyOf(githubConfig)
      const file: CachedMarkdownFile = {
        id: `${repoKey}:${path}`,
        repoKey,
        path,
        originalPath: path,
        content: markdown,
        baseContent: '',
        baseSha: '',
        baseCommit: remoteHead,
        status: 'added',
        updatedAt: Date.now(),
      }
      await putCachedFile(file)
      setCachedFiles((current) => [...current, file].sort((a, b) => a.path.localeCompare(b.path)))
      cancelRepositorySave()
      activateCachedFile(file)
      setGithubNotice(`已暂存到 ${path}，点击仓库页“同步”后推送`)
    } catch (error) {
      setGithubError(error instanceof Error ? error.message : '另存失败')
    } finally { setGithubBusy(false) }
  }

  const repositoryFilesForTarget = async (target: RepositoryTarget) => {
    if (!githubConfig || target.type === 'root') return []
    const rows = buildRepositoryRows(remoteFiles, cachedFiles, virtualFolders, new Set())
      .filter((row) => row.type === 'file' && (target.type === 'file' ? row.path === target.path : row.path.startsWith(`${target.path}/`)))
    const downloaded: CachedMarkdownFile[] = []
    for (const row of rows) {
      if (row.cached) downloaded.push(row.cached)
      else if (row.remote) {
        const file = await downloadMarkdown(githubConfig, row.remote, remoteHead)
        await putCachedFile(file)
        downloaded.push(file)
      }
    }
    if (downloaded.length) setCachedFiles((current) => {
      const merged = new Map(current.map((file) => [file.id, file]))
      downloaded.forEach((file) => merged.set(file.id, file))
      return Array.from(merged.values()).sort((a, b) => a.path.localeCompare(b.path))
    })
    return rows.map((row) => ({ sourcePath: row.path, file: downloaded.find((file) => file.path === row.path || file.originalPath === row.remote?.path) })).filter((item): item is { sourcePath: string; file: CachedMarkdownFile } => Boolean(item.file))
  }

  const relocateRepositoryTarget = async (target: RepositoryTarget, nextRoot: string, copy: boolean) => {
    if (!githubConfig || target.type === 'root' || !validRepositoryPath(nextRoot)) return
    if (target.type === 'folder' && (nextRoot === target.path || nextRoot.startsWith(`${target.path}/`))) { setGithubError('不能把文件夹移动到自身内部'); return }
    setGithubBusy(true); setGithubError(''); setGithubNotice('')
    try {
      const sources = await repositoryFilesForTarget(target)
      const sourcePaths = new Set(sources.map((item) => item.sourcePath))
      const visibleRows = buildRepositoryRows(remoteFiles, cachedFiles, virtualFolders, new Set())
      const occupied = new Set(visibleRows.filter((row) => row.type === 'file' && !sourcePaths.has(row.path)).map((row) => row.path))
      const changes = sources.map(({ sourcePath, file }) => {
        const suffix = target.type === 'file' ? '' : sourcePath.slice(target.path.length)
        const nextPath = `${nextRoot}${suffix}`
        if (occupied.has(nextPath)) throw new Error(`目标位置已存在 ${nextPath}`)
        occupied.add(nextPath)
        if (copy) return { previous: null, next: { ...file, id: `${file.repoKey}:${nextPath}`, path: nextPath, originalPath: nextPath, baseContent: '', baseSha: '', status: 'added' as const, updatedAt: Date.now() } }
        const added = file.status === 'added'
        return { previous: file, next: { ...file, id: `${file.repoKey}:${nextPath}`, path: nextPath, originalPath: added ? nextPath : file.originalPath, status: added ? 'added' as const : 'renamed' as const, updatedAt: Date.now() } }
      })
      await Promise.all(changes.flatMap(({ previous, next }) => [previous ? removeCachedFile(previous.id) : Promise.resolve(), putCachedFile(next)]))
      setCachedFiles((current) => {
        const removed = new Set(changes.flatMap(({ previous }) => previous ? [previous.id] : []))
        return [...current.filter((file) => !removed.has(file.id) && !changes.some(({ next }) => next.id === file.id)), ...changes.map(({ next }) => next)].sort((a, b) => a.path.localeCompare(b.path))
      })
      if (!copy && activeRepoPath && (activeRepoPath === target.path || activeRepoPath.startsWith(`${target.path}/`))) {
        const nextActivePath = `${nextRoot}${activeRepoPath.slice(target.path.length)}`
        setActiveRepoPath(nextActivePath); setFileName(nextActivePath)
      }
      if (target.type === 'folder') {
        const folderPaths = new Set([target.path, ...virtualFolders.filter((folder) => folder.startsWith(`${target.path}/`))])
        visibleRows.filter((row) => row.type === 'folder' && row.path.startsWith(`${target.path}/`)).forEach((row) => folderPaths.add(row.path))
        const mapped = Array.from(folderPaths, (folder) => `${nextRoot}${folder.slice(target.path.length)}`)
        const nextFolders = Array.from(new Set([...(copy ? virtualFolders : virtualFolders.filter((folder) => !folderPaths.has(folder))), ...mapped])).sort()
        setVirtualFolders(nextFolders); saveVirtualFolders(repoKeyOf(githubConfig), nextFolders)
      }
      setGithubNotice(copy ? '已复制到本地暂存区' : '已移动到本地暂存区')
    } catch (error) {
      setGithubError(error instanceof Error ? error.message : '文件操作失败')
    } finally { setGithubBusy(false) }
  }

  const renameRepositoryTarget = async (target: RepositoryTarget, requestedName: string) => {
    if (target.type === 'root') return
    const name = requestedName.trim()
    if (!name || name === target.name) return
    const nextPath = joinPath(parentPath(target.path), name)
    if (!validRepositoryPath(nextPath) || (target.type === 'file' && !/\.md$/i.test(nextPath))) { setGithubError('名称无效，Markdown 文件必须以 .md 结尾'); return }
    await relocateRepositoryTarget(target, nextPath, false)
  }

  const startRepositoryRename = (target: RepositoryTarget) => {
    if (target.type === 'root') return
    setRenamingRepositoryTarget(target)
    setRepositoryRenameValue(target.name)
  }

  const finishRepositoryRename = () => {
    const target = renamingRepositoryTarget
    if (!target) return
    const name = repositoryRenameValue
    setRenamingRepositoryTarget(null)
    void renameRepositoryTarget(target, name)
  }

  const createRepositoryFile = async (folder: string) => {
    if (!githubConfig || !remoteHead) return
    let name = window.prompt('新建 Markdown 文件', '未命名.md')?.trim()
    if (!name) return
    if (!/\.md$/i.test(name)) name += '.md'
    const path = joinPath(folder, name)
    const occupied = buildRepositoryRows(remoteFiles, cachedFiles, virtualFolders, new Set()).some((row) => row.path === path)
    if (!validRepositoryPath(path) || occupied) { setGithubError(occupied ? '该位置已存在同名文件' : '文件名无效'); return }
    const content = `# ${name.replace(/\.md$/i, '')}\n`
    const file: CachedMarkdownFile = { id: `${repoKeyOf(githubConfig)}:${path}`, repoKey: repoKeyOf(githubConfig), path, originalPath: path, content, baseContent: '', baseSha: '', baseCommit: remoteHead, status: 'added', updatedAt: Date.now() }
    await putCachedFile(file)
    setCachedFiles((current) => [...current, file].sort((a, b) => a.path.localeCompare(b.path)))
    activateCachedFile(file)
  }

  const createRepositoryFolderAt = (folder: string, requestedName: string) => {
    if (!githubConfig) return null
    const name = requestedName.trim()
    if (!name) return null
    const path = joinPath(folder, name)
    const occupied = buildRepositoryRows(remoteFiles, cachedFiles, virtualFolders, new Set()).some((row) => row.path === path)
    if (!validRepositoryPath(path) || /[\\/]/.test(name) || name === '.' || name === '..' || occupied) { setGithubError(occupied ? '文件夹或文件已存在' : '文件夹名称无效'); return null }
    const next = [...virtualFolders, path].sort()
    setVirtualFolders(next); saveVirtualFolders(repoKeyOf(githubConfig), next)
    setCollapsedFolders((current) => { const value = new Set(current); value.delete(folder); return value })
    return path
  }

  const createRepositoryFolder = (folder: string) => {
    if (!githubConfig) return
    const name = window.prompt('新建文件夹', '新建文件夹')?.trim()
    if (name) createRepositoryFolderAt(folder, name)
  }

  const beginRepositoryFolderCreation = () => {
    setGithubError('')
    setRepositoryNewFolderParent(repositorySaveFolder)
    setRepositoryNewFolderName('')
  }

  const finishRepositoryFolderCreation = () => {
    if (repositoryNewFolderParent === null) return
    const path = createRepositoryFolderAt(repositoryNewFolderParent, repositoryNewFolderName)
    if (path) {
      setRepositorySaveCollapsedFolders((current) => { const next = new Set(current); next.delete(repositoryNewFolderParent); return next })
      setRepositorySaveFolder(path)
      setRepositoryNewFolderParent(null)
      setRepositoryNewFolderName('')
    }
  }

  const deleteRepositoryTarget = async (target: RepositoryTarget) => {
    if (!githubConfig || target.type === 'root' || !window.confirm(`确定删除“${target.name}”吗？修改将在下次同步时推送。`)) return
    setGithubBusy(true); setGithubError(''); setGithubNotice('')
    try {
      const sources = await repositoryFilesForTarget(target)
      const removedIds: string[] = []
      const deleted: CachedMarkdownFile[] = []
      for (const { file } of sources) {
        if (file.status === 'added') { await removeCachedFile(file.id); removedIds.push(file.id) }
        else { const next = { ...file, status: 'deleted' as const, updatedAt: Date.now() }; await putCachedFile(next); deleted.push(next) }
      }
      setCachedFiles((current) => [...current.filter((file) => !removedIds.includes(file.id) && !deleted.some((item) => item.id === file.id)), ...deleted].sort((a, b) => a.path.localeCompare(b.path)))
      if (target.type === 'folder') {
        const next = virtualFolders.filter((folder) => folder !== target.path && !folder.startsWith(`${target.path}/`))
        setVirtualFolders(next); saveVirtualFolders(repoKeyOf(githubConfig), next)
      }
      if (activeRepoPath && (activeRepoPath === target.path || activeRepoPath.startsWith(`${target.path}/`))) { setActiveRepoPath(null); setEditorView('repository') }
      setGithubNotice('已标记删除，点击同步后写入仓库')
    } catch (error) {
      setGithubError(error instanceof Error ? error.message : '删除失败')
    } finally { setGithubBusy(false) }
  }

  const pasteRepositoryClipboard = async (folder: string) => {
    if (!repositoryClipboard) return
    const nextRoot = joinPath(folder, repositoryClipboard.target.name)
    await relocateRepositoryTarget(repositoryClipboard.target, nextRoot, repositoryClipboard.mode === 'copy')
    if (repositoryClipboard.mode === 'cut') setRepositoryClipboard(null)
  }

  const normalizeRepositoryDropFolder = (target: RepositoryTarget, folder: string) => {
    if (target.type === 'root' || folder === parentPath(target.path)) return null
    if (target.type === 'folder' && (folder === target.path || folder.startsWith(`${target.path}/`))) return null
    return folder
  }

  const repositoryDropFolderAt = (x: number, y: number) => {
    const row = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-repository-type]')
    if (!row) return null
    const path = row.dataset.repositoryPath || ''
    return row.dataset.repositoryType === 'file' ? parentPath(path) : path
  }

  const moveRepositoryTargetToFolder = async (target: RepositoryTarget, folder: string) => {
    const destination = normalizeRepositoryDropFolder(target, folder)
    if (destination === null) return
    await relocateRepositoryTarget(target, joinPath(destination, target.name), false)
  }

  const dropRepositoryTarget = async (folder: string) => {
    if (repositoryCommitRef) return
    const target = draggedRepositoryTarget
    setDraggedRepositoryTarget(null)
    setRepositoryDropFolder(null)
    if (!target) return
    await moveRepositoryTargetToFolder(target, folder)
  }

  const showRepositoryMenu = (x: number, y: number, target: RepositoryTarget) => {
    setRepositoryHistory(null)
    setRepositoryMenu({ x: Math.max(8, Math.min(x, window.innerWidth - 190)), y: Math.max(8, Math.min(y, window.innerHeight - 290)), target })
  }

  const openRepositoryMenu = (event: React.MouseEvent, target: RepositoryTarget) => {
    event.preventDefault(); event.stopPropagation()
    if (repositoryCommitRef || repositoryTouchGestureRef.current) return
    showRepositoryMenu(event.clientX, event.clientY, target)
  }

  const cancelRepositoryTouchGesture = () => {
    const gesture = repositoryTouchGestureRef.current
    if (!gesture) return
    window.clearTimeout(gesture.timer)
    gesture.element.draggable = gesture.originalDraggable
    repositoryTouchGestureRef.current = null
    setRepositoryTouchDrag(null)
  }

  const startRepositoryTouch = (event: React.TouchEvent<HTMLElement>, target: RepositoryTarget) => {
    if (repositoryCommitRef || event.touches.length !== 1 || (event.target as HTMLElement).closest('input')) return
    event.stopPropagation()
    cancelRepositoryTouchGesture()
    suppressRepositoryClickRef.current = false
    const touch = event.touches[0]
    const element = event.currentTarget
    const gesture = {
      target,
      element,
      originalDraggable: element.draggable,
      startX: touch.clientX,
      startY: touch.clientY,
      lastX: touch.clientX,
      lastY: touch.clientY,
      longPressed: false,
      dragging: false,
      dropFolder: null as string | null,
      timer: 0,
    }
    element.draggable = false
    gesture.timer = window.setTimeout(() => {
      if (repositoryTouchGestureRef.current !== gesture) return
      gesture.longPressed = true
      setRepositoryTouchDrag({ target, dropFolder: null, dragging: false, x: gesture.lastX, y: gesture.lastY })
    }, 450)
    repositoryTouchGestureRef.current = gesture
  }

  const moveRepositoryTouch = (event: React.TouchEvent<HTMLElement>) => {
    const gesture = repositoryTouchGestureRef.current
    if (!gesture || event.touches.length !== 1) return
    const touch = event.touches[0]
    gesture.lastX = touch.clientX
    gesture.lastY = touch.clientY
    const distance = Math.hypot(touch.clientX - gesture.startX, touch.clientY - gesture.startY)
    if (!gesture.longPressed) {
      if (distance > 10) cancelRepositoryTouchGesture()
      return
    }
    event.preventDefault()
    if (distance > 12) gesture.dragging = true
    if (!gesture.dragging) return
    const hoveredFolder = repositoryDropFolderAt(touch.clientX, touch.clientY)
    gesture.dropFolder = hoveredFolder === null ? null : normalizeRepositoryDropFolder(gesture.target, hoveredFolder)
    setRepositoryTouchDrag({ target: gesture.target, dropFolder: gesture.dropFolder, dragging: true, x: touch.clientX, y: touch.clientY })
  }

  const endRepositoryTouch = (event: React.TouchEvent<HTMLElement>) => {
    const gesture = repositoryTouchGestureRef.current
    if (!gesture) return
    window.clearTimeout(gesture.timer)
    gesture.element.draggable = gesture.originalDraggable
    repositoryTouchGestureRef.current = null
    setRepositoryTouchDrag(null)
    if (!gesture.longPressed) return
    event.preventDefault(); event.stopPropagation()
    suppressRepositoryClickRef.current = true
    window.setTimeout(() => { suppressRepositoryClickRef.current = false }, 400)
    if (gesture.dragging && gesture.dropFolder !== null) void moveRepositoryTargetToFolder(gesture.target, gesture.dropFolder)
    else if (!gesture.dragging) showRepositoryMenu(gesture.lastX, gesture.lastY, gesture.target)
  }

  const consumeRepositoryLongPressClick = () => {
    if (!suppressRepositoryClickRef.current) return false
    suppressRepositoryClickRef.current = false
    return true
  }

  const pushRepositoryChanges = async () => {
    if (!githubConfig) return
    setGithubBusy(true); setGithubError(''); setGithubNotice('')
    try {
      const result = await pushCachedChanges(githubConfig, cachedFiles)
      const refreshed = await listRemoteMarkdown(githubConfig)
      setRemoteHead(refreshed.head); setRemoteFiles(refreshed.files)
      const deletedFiles = cachedFiles.filter((file) => file.status === 'deleted')
      await Promise.all(deletedFiles.map((file) => removeCachedFile(file.id)))
      const cleanFiles = cachedFiles.filter((file) => file.status !== 'deleted').map((file) => {
        const remote = refreshed.files.find((item) => item.path === file.path)
        return { ...file, originalPath: file.path, baseContent: file.content, baseSha: remote?.sha || file.baseSha, baseCommit: result.commitSha, status: 'clean' as const, updatedAt: Date.now() }
      })
      await Promise.all(cleanFiles.map(putCachedFile))
      setCachedFiles(cleanFiles)
      setVirtualFolders([])
      saveVirtualFolders(repoKeyOf(githubConfig), [])
      setGithubNotice(`已推送：${result.message}`)
    } catch (error) {
      setGithubError(error instanceof Error ? error.message : '推送失败')
    } finally { setGithubBusy(false) }
  }

  const discardRepositoryChanges = async () => {
    if (!githubConfig || !window.confirm('放弃当前仓库的全部本地修改，并恢复到远程最新 commit？')) return
    setGithubBusy(true); setGithubError(''); setGithubNotice('')
    try {
      const refreshed = await listRemoteMarkdown(githubConfig)
      const activeFile = activeRepoPath ? cachedFiles.find((file) => file.path === activeRepoPath) : undefined
      const cachedRemotePaths = new Set(cachedFiles.filter((file) => file.status !== 'added').map((file) => file.originalPath))
      const filesToRestore = refreshed.files.filter((remote) => cachedRemotePaths.has(remote.path))
      await Promise.all(cachedFiles.map((file) => removeCachedFile(file.id)))
      const restored = await Promise.all(filesToRestore.map((remote) => downloadMarkdown(githubConfig, remote, refreshed.head)))
      await Promise.all(restored.map(putCachedFile))
      setRemoteHead(refreshed.head); setRemoteFiles(refreshed.files); setCachedFiles(restored.sort((a, b) => a.path.localeCompare(b.path)))
      setVirtualFolders([]); saveVirtualFolders(repoKeyOf(githubConfig), [])
      setRepositoryClipboard(null); setCollapsedFolders(new Set())
      const restoredActive = activeFile ? restored.find((file) => file.path === activeFile.originalPath) : undefined
      if (restoredActive) activateCachedFile(restoredActive)
      else if (activeRepoPath) { setActiveRepoPath(null); setEditorView('repository') }
      setGithubNotice('已放弃本地修改，并恢复到远程最新 commit')
    } catch (error) {
      setGithubError(error instanceof Error ? error.message : '放弃修改失败')
    } finally { setGithubBusy(false) }
  }

  const openGitHubPanel = () => {
    setGithubError(''); setGithubNotice('')
    if (!githubConfig) { setActivePanel('github'); return }
    setEditorView('repository')
    setGithubBusy(true)
    void refreshRepository(githubConfig)
      .catch((error) => setGithubError(error instanceof Error ? error.message : '刷新仓库失败'))
      .finally(() => setGithubBusy(false))
  }

  const refreshRepositoryView = async () => {
    if (!githubConfig) return
    setGithubBusy(true); setGithubError(''); setGithubNotice('')
    try {
      await refreshRepository(githubConfig)
      setRepositoryCommitRef(null)
      setActiveRepoPath(null)
      setGithubNotice('仓库文件列表已刷新')
    } catch (error) {
      setGithubError(error instanceof Error ? error.message : '刷新仓库失败')
    } finally { setGithubBusy(false) }
  }

  const openRepositoryRow = (row: RepositoryRow) => {
    if (row.remote) void (repositoryCommitRef ? openRepositoryRevisionFile(row.remote, repositoryCommitRef) : openRepositoryFile(row.remote))
    else if (row.cached) activateCachedFile(row.cached)
  }

  const openRepositoryHistory = async (target: RepositoryTarget, x: number, y: number) => {
    if (!githubConfig || target.type !== 'file') return
    const state: RepositoryHistoryState = {
      target,
      x: Math.max(8, Math.min(x, window.innerWidth - 428)),
      y: Math.max(8, Math.min(y, window.innerHeight - 568)),
      commits: [],
      loading: true,
      error: '',
    }
    setRepositoryMenu(null)
    setRepositoryHistory(state)
    try {
      const commits = await listFileCommits(githubConfig, target.path)
      setRepositoryHistory((current) => current?.target.path === target.path ? { ...current, commits, loading: false } : current)
    } catch (error) {
      setRepositoryHistory((current) => current?.target.path === target.path ? { ...current, loading: false, error: error instanceof Error ? error.message : '读取提交历史失败' } : current)
    }
  }

  const openRepositoryHistoryVersion = async (commit: GitHubFileCommit) => {
    const history = repositoryHistory
    if (!githubConfig || !history || history.target.type !== 'file') return
    setRepositoryHistory((current) => current ? { ...current, loading: true, error: '' } : current)
    try {
      const content = await downloadMarkdownAtCommit(githubConfig, history.target.path, commit.sha)
      activateHistoricalFile(content, history.target.path, commit.sha)
      setRepositoryHistory(null)
    } catch (error) {
      setRepositoryHistory((current) => current ? { ...current, loading: false, error: error instanceof Error ? error.message : '打开历史版本失败' } : current)
    }
  }

  const openRepositoryRevisionFile = async (remote: RemoteMarkdownFile, commitSha: string) => {
    if (!githubConfig) return
    setGithubBusy(true); setGithubError(''); setGithubNotice('')
    try {
      const content = await downloadMarkdownAtCommit(githubConfig, remote.path, commitSha)
      activateHistoricalFile(content, remote.path, commitSha)
      setEditorView('markdown'); setActivePanel(null)
    } catch (error) {
      setGithubError(error instanceof Error ? error.message : '下载历史文件失败')
    } finally { setGithubBusy(false) }
  }

  const openRepositoryGraph = async () => {
    if (!githubConfig) return
    setRepositoryGraph((current) => ({ branches: current?.branches || [], commits: current?.commits || [], loading: true, error: '' }))
    setRepositoryGraphBranchesOpen(false)
    try {
      const [branches, commits] = await Promise.all([listRepositoryBranches(githubConfig), listRepositoryCommits(githubConfig, githubConfig.branch)])
      setRepositoryGraph({ branches, commits, loading: false, error: '' })
    } catch (error) {
      setRepositoryGraph((current) => ({ branches: current?.branches || [], commits: current?.commits || [], loading: false, error: error instanceof Error ? error.message : '读取仓库提交历史失败' }))
    }
  }

  const switchRepositoryBranch = async (branch: GitHubBranch) => {
    if (!githubConfig || (branch.name === githubConfig.branch && !repositoryCommitRef)) {
      setRepositoryGraphBranchesOpen(false)
      return
    }
    const nextConfig = { ...githubConfig, branch: branch.name }
    setRepositoryGraphBranchesOpen(false)
    setGithubBusy(true); setGithubError(''); setGithubNotice('')
    setRepositoryGraph((current) => current ? { ...current, commits: [], loading: true, error: '' } : current)
    try {
      const [refreshed, commits] = await Promise.all([refreshRepository(nextConfig), listRepositoryCommits(nextConfig, branch.name)])
      setRepositoryCommitRef(null)
      setActiveRepoPath(null)
      saveGitHubConfig(nextConfig)
      setGithubConfig(nextConfig)
      setBranchInput(branch.name)
      setRepositoryGraph((current) => current ? { ...current, commits, loading: false, error: '' } : current)
      setGithubNotice(`已切换到分支 ${branch.name}`)
      setRemoteHead(refreshed.head)
    } catch (error) {
      setRepositoryGraph((current) => current ? { ...current, loading: false, error: error instanceof Error ? error.message : '切换分支失败' } : current)
      setGithubError(error instanceof Error ? error.message : '切换分支失败')
    } finally { setGithubBusy(false) }
  }

  const openRepositoryCommit = async (commit: GitHubRepositoryCommit) => {
    if (!githubConfig) return
    setGithubBusy(true); setGithubError(''); setGithubNotice('')
    try {
      const result = await listRemoteMarkdown(githubConfig, commit.sha)
      setRemoteHead(result.head)
      setRemoteFiles(result.files)
      setRepositoryCommitRef(commit.sha)
      setActiveRepoPath(null)
      setRepositoryMenu(null)
      setRepositoryHistory(null)
      setDraggedRepositoryTarget(null)
      setRepositoryDropFolder(null)
      setRepositoryGraph(null)
      setGithubNotice(`正在查看 commit ${commit.sha.slice(0, 7)} 的文件状态`)
    } catch (error) {
      setGithubError(error instanceof Error ? error.message : '切换到 commit 失败')
    } finally { setGithubBusy(false) }
  }

  useEffect(() => {
    if (!svgRef.current) return
    const initialConfig = buildDocumentRenderConfig(initialMarkdownRef.current)
    const mm = Markmap.create(svgRef.current, viewOptions(deriveOptions({
      ...initialConfig.jsonOptions,
      colorFreezeLevel: initialConfig.colorFreezeLevel ?? defaultSettings.colorFreezeLevel,
    })))
    mmRef.current = mm
    void mm.setData(initialConfig.root).then(() => {
      const { width, height } = svgRef.current?.getBoundingClientRect() || { width: 0, height: 0 }
      if (width > 0 && height > 0) return mm.fit()
    })
    return () => {
      if (imageRelayoutTimerRef.current !== null) window.clearTimeout(imageRelayoutTimerRef.current)
      mm.destroy(); mmRef.current = null
    }
  }, [viewOptions])

  useEffect(() => {
    const syncAfterDelete = (event: KeyboardEvent) => {
      if (!['Delete', 'Backspace'].includes(event.key)) return
      const active = document.activeElement as HTMLElement | null
      const isTextEditing = active?.tagName === 'INPUT' || active?.tagName === 'TEXTAREA' || active?.isContentEditable || active?.classList.contains('cm-content')
      if (!isTextEditing) window.setTimeout(syncFromMap, 0)
    }
    document.addEventListener('keydown', syncAfterDelete)
    return () => document.removeEventListener('keydown', syncAfterDelete)
  }, [syncFromMap])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setRenderedMarkdown(markdown)
      setSaveState('saved')
    }, 180)
    return () => window.clearTimeout(timer)
  }, [markdown])

  useEffect(() => {
    if (!githubConfig) return
    const key = repoKeyOf(githubConfig)
    void listCachedFiles(key).then((files) => {
      setCachedFiles(files)
      setVirtualFolders(loadVirtualFolders(key))
      setCollapsedFolders(new Set())
    }).catch(() => setGithubError('无法读取本地仓库缓存'))
  }, [githubConfig])

  useEffect(() => {
    if (!repositoryMenu && !repositoryHistory) return
    const closePopovers = () => { setRepositoryMenu(null); setRepositoryHistory(null) }
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') closePopovers() }
    window.addEventListener('pointerdown', closePopovers)
    window.addEventListener('keydown', closeOnEscape)
    return () => { window.removeEventListener('pointerdown', closePopovers); window.removeEventListener('keydown', closeOnEscape) }
  }, [repositoryMenu, repositoryHistory])

  useEffect(() => {
    if (!activeRepoPath) return
    const timer = window.setTimeout(() => {
      setCachedFiles((current) => {
        const file = current.find((item) => item.path === activeRepoPath)
        if (!file || file.content === markdown) return current
        const next = {
          ...file,
          content: markdown,
          status: (file.status === 'added' ? 'added' : file.originalPath !== file.path ? 'renamed' : markdown === file.baseContent ? 'clean' : 'modified') as CachedMarkdownFile['status'],
          updatedAt: Date.now(),
        }
        void putCachedFile(next).catch(() => setGithubError('本地缓存写入失败'))
        return current.map((item) => item.id === next.id ? next : item)
      })
    }, 220)
    return () => window.clearTimeout(timer)
  }, [activeRepoPath, markdown])

  useEffect(() => {
    const mm = mmRef.current
    const svg = svgRef.current
    if (!mm || !svg) return
    let disposed = false
    const trackedImages: HTMLImageElement[] = []
    const scheduleRelayout = () => {
      if (disposed) return
      if (imageRelayoutTimerRef.current !== null) window.clearTimeout(imageRelayoutTimerRef.current)
      imageRelayoutTimerRef.current = window.setTimeout(() => {
        imageRelayoutTimerRef.current = null
        if (!disposed) void mm.setData()
      }, 40)
    }
    void mm.setData(documentRenderConfig.root, viewOptions(effectiveMarkmapOptions)).then(() => {
      if (disposed) return
      svg.querySelectorAll('img').forEach((image) => {
        if (!image.complete) {
          trackedImages.push(image)
          image.addEventListener('load', scheduleRelayout, { once: true })
          image.addEventListener('error', scheduleRelayout, { once: true })
        }
      })
    })
    return () => {
      disposed = true
      trackedImages.forEach((image) => {
        image.removeEventListener('load', scheduleRelayout)
        image.removeEventListener('error', scheduleRelayout)
      })
      if (imageRelayoutTimerRef.current !== null) {
        window.clearTimeout(imageRelayoutTimerRef.current)
        imageRelayoutTimerRef.current = null
      }
    }
  }, [documentRenderConfig, effectiveMarkmapOptions, viewOptions])

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
    const svg = svgRef.current
    if (svg) {
      const codeStyle = documentRenderConfig.style
      svg.style.setProperty('--markmap-text-color', cssDeclaration(codeStyle, '--markmap-text-color') || (dark ? '#f4f6f9' : '#30333a'))
      svg.style.setProperty('--markmap-circle-open-bg', cssDeclaration(codeStyle, '--markmap-circle-open-bg') || (dark ? '#191c22' : '#ffffff'))
      svg.style.setProperty('--markmap-code-bg', cssDeclaration(codeStyle, '--markmap-code-bg') || (dark ? '#2a303a' : '#eef0f4'))
      svg.style.setProperty('--markmap-code-color', cssDeclaration(codeStyle, '--markmap-code-color') || (dark ? '#ffffff' : '#444852'))
    }
  }, [dark, documentRenderConfig.style])

  useEffect(() => {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)) } catch { /* storage may be disabled */ }
    const svg = svgRef.current
    if (!svg) return
    const font = codeFont.shorthand || `${effectiveFontWeightCss} ${effectiveFontSizeCss}/1.35 ${effectiveFontFamily}`
    svg.style.setProperty('--markmap-font', font)
    window.setTimeout(() => void mmRef.current?.setData().then(() => mmRef.current?.fit()), 50)
  }, [codeFont.shorthand, effectiveFontFamily, effectiveFontSizeCss, effectiveFontWeightCss, settings])

  useEffect(() => {
    const handleFullscreen = () => setFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', handleFullscreen)
    return () => document.removeEventListener('fullscreenchange', handleFullscreen)
  }, [])

  useEffect(() => {
    if (mobilePane !== 'preview') return
    let secondFrame = 0
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        const mm = mmRef.current
        if (mm) void mm.setData().then(() => mm.fit())
      })
    })
    return () => {
      window.cancelAnimationFrame(firstFrame)
      if (secondFrame) window.cancelAnimationFrame(secondFrame)
    }
  }, [mobilePane])

  useEffect(() => {
    if (!actionMenuOpen) return
    const closeMenu = (event: PointerEvent) => {
      if (!actionsRef.current?.contains(event.target as Node)) setActionMenuOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setActionMenuOpen(false)
    }
    document.addEventListener('pointerdown', closeMenu)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeMenu)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [actionMenuOpen])

  const openFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const next = String(reader.result || '')
      setActiveRepoPath(null); setEditorView('markdown'); updateMarkdown(next, 'file'); setRenderedMarkdown(next); setFileName(file.name)
      window.setTimeout(() => mmRef.current?.fit(), 60)
    }
    reader.readAsText(file); event.target.value = ''
  }

  const toggleFullscreen = async () => {
    if (document.fullscreenElement) await document.exitFullscreen()
    else await document.documentElement.requestFullscreen()
  }

  const startResize = (event: React.PointerEvent) => {
    if (editorCollapsed) return
    event.preventDefault()
    const handle = event.currentTarget
    const pointerId = event.pointerId
    const controller = new AbortController()
    handle.setPointerCapture(pointerId)
    workspaceRef.current?.classList.add('resizing')
    const move = (pointer: PointerEvent) => {
      if (pointer.pointerId !== pointerId) return
      const rect = workspaceRef.current?.getBoundingClientRect()
      if (!rect) return
      const width = Math.max(24, Math.min(76, ((pointer.clientX - rect.left) / rect.width) * 100))
      resizeWidthRef.current = width
      workspaceRef.current!.style.gridTemplateColumns = `${width}% 18px 1fr`
    }
    const stop = () => {
      if (controller.signal.aborted) return
      controller.abort()
      if (handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId)
      setEditorWidth(resizeWidthRef.current)
      workspaceRef.current?.classList.remove('resizing')
    }
    document.addEventListener('pointermove', move, { signal: controller.signal })
    document.addEventListener('pointerup', stop, { signal: controller.signal })
    document.addEventListener('pointercancel', stop, { signal: controller.signal })
    window.addEventListener('blur', stop, { signal: controller.signal })
  }

  const toggleEditor = () => {
    setEditorCollapsed((value) => !value)
    window.setTimeout(() => mmRef.current?.fit(), 250)
  }

  const createExportSvg = () => {
    const svg = svgRef.current
    const mm = mmRef.current
    if (!svg || !mm) throw new Error('思维导图尚未准备好')
    const { x1, y1, x2, y2 } = mm.state.rect
    const padding = 48
    const width = Math.max(1, Math.ceil(x2 - x1 + padding * 2))
    const height = Math.max(1, Math.ceil(y2 - y1 + padding * 2))
    const clone = svg.cloneNode(true) as SVGSVGElement
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    if (documentRenderConfig.style) {
      const style = document.createElementNS('http://www.w3.org/2000/svg', 'style')
      style.textContent = documentRenderConfig.style
      clone.prepend(style)
    }
    clone.setAttribute('viewBox', `${x1 - padding} ${y1 - padding} ${width} ${height}`)
    clone.setAttribute('width', String(width * exportScale))
    clone.setAttribute('height', String(height * exportScale))
    clone.querySelector('g')?.removeAttribute('transform')
    const background = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    background.setAttribute('x', String(x1 - padding)); background.setAttribute('y', String(y1 - padding))
    background.setAttribute('width', String(width)); background.setAttribute('height', String(height))
    background.setAttribute('fill', dark ? '#15181d' : '#fafafa')
    const firstGroup = clone.querySelector('g')
    if (firstGroup) clone.insertBefore(background, firstGroup)
    return { source: new XMLSerializer().serializeToString(clone), width, height }
  }

  const createRasterSafeSvg = (source: string) => {
    const liveForeignObjects = Array.from(svgRef.current?.querySelectorAll<SVGForeignObjectElement>('foreignObject') || [])
    const fallbackFont = codeFont.shorthand || `${effectiveFontWeightCss} ${effectiveFontSizeCss}/1.35 ${effectiveFontFamily}`
    const fallbackLineHeight = effectiveFontSize * 1.35
    const measureCanvas = document.createElement('canvas')
    const measureContext = measureCanvas.getContext('2d')
    if (measureContext) measureContext.font = fallbackFont
    const documentNode = new DOMParser().parseFromString(source, 'image/svg+xml')
    documentNode.querySelectorAll<SVGForeignObjectElement>('foreignObject').forEach((foreignObject, index) => {
      const text = documentNode.createElementNS('http://www.w3.org/2000/svg', 'text')
      const x = Number(foreignObject.getAttribute('x') || 0) + 6
      const y = Number(foreignObject.getAttribute('y') || 0)
      const width = Number(foreignObject.getAttribute('width') || 0)
      const height = Number(foreignObject.getAttribute('height') || effectiveFontSize * 1.5)
      const liveForeignObject = liveForeignObjects[index]
      const liveContent = liveForeignObject ? getForeignContentElement(liveForeignObject) : null
      const computedStyle = liveContent ? getComputedStyle(liveContent) : null
      const font = computedStyle?.font || fallbackFont
      if (measureContext) measureContext.font = font
      const rawText = normalizeExportText(foreignObject.textContent || '')
      const maxWidth = Math.max(1, Number.isFinite(width) ? width - 12 : effectiveFontSize * 30)
      const renderedLines = liveForeignObject ? getRenderedTextLines(liveForeignObject) : []
      const lines = renderedLines.length
        ? renderedLines
        : wrapExportText(rawText, maxWidth, (value) => measureContext?.measureText(value).width || value.length * effectiveFontSize)
      const lineHeight = Number.parseFloat(computedStyle?.lineHeight || '') || fallbackLineHeight
      const firstLineY = y + height / 2 - ((lines.length - 1) * lineHeight) / 2
      text.setAttribute('x', String(x))
      text.setAttribute('y', String(firstLineY))
      text.setAttribute('dominant-baseline', 'middle')
      text.setAttribute('fill', dark ? '#f4f6f9' : '#30333a')
      if (font) text.setAttribute('style', `font:${font}`)
      else {
        text.setAttribute('font-size', effectiveFontSizeCss)
        text.setAttribute('font-weight', String(effectiveFontWeight))
        text.setAttribute('font-family', effectiveFontFamily)
      }
      lines.forEach((line, lineIndex) => {
        const tspan = documentNode.createElementNS('http://www.w3.org/2000/svg', 'tspan')
        tspan.setAttribute('x', String(x))
        tspan.setAttribute('y', String(firstLineY + lineIndex * lineHeight))
        tspan.textContent = line
        text.appendChild(tspan)
      })
      foreignObject.replaceWith(text)
    })
    return new XMLSerializer().serializeToString(documentNode.documentElement)
  }

  const exportDocument = async () => {
    setExporting(true)
    setExportError('')
    const baseName = fileName.replace(/\.(md|markdown)$/i, '') || 'markmap'
    try {
      if (exportFormat === 'md') {
        saveBlob(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }), `${baseName}.md`)
      } else {
        await document.fonts.ready
        const { source, width, height } = createExportSvg()
        if (exportFormat === 'svg') saveBlob(new Blob([source], { type: 'image/svg+xml;charset=utf-8' }), `${baseName}.svg`)
        else if (exportFormat === 'html') {
          const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${baseName}</title><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:${dark ? '#15181d' : '#fafafa'}}svg{display:block;width:100%;height:100%}</style></head><body>${source}</body></html>`
          saveBlob(new Blob([html], { type: 'text/html;charset=utf-8' }), `${baseName}.html`)
        } else {
          const rasterSource = createRasterSafeSvg(source)
          const svgUrl = URL.createObjectURL(new Blob([rasterSource], { type: 'image/svg+xml;charset=utf-8' }))
          const image = new Image()
          await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('图像渲染失败')); image.src = svgUrl })
          const canvas = document.createElement('canvas')
          canvas.width = width * exportScale; canvas.height = height * exportScale
          const context = canvas.getContext('2d')
          if (!context) throw new Error('浏览器不支持画布导出')
          context.drawImage(image, 0, 0, canvas.width, canvas.height)
          URL.revokeObjectURL(svgUrl)
          const mime = exportFormat === 'png' ? 'image/png' : 'image/jpeg'
          const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mime, 0.94))
          if (!blob) throw new Error('导出文件生成失败')
          saveBlob(blob, `${baseName}.${exportFormat === 'jpeg' ? 'jpg' : 'png'}`)
        }
      }
      setActivePanel(null)
    } catch (error) {
      setExportError(error instanceof Error ? error.message : '导出失败，请重试')
    } finally { setExporting(false) }
  }

  const gridColumns = editorCollapsed ? '0 18px 1fr' : `${editorWidth}% 18px 1fr`
  const lineCount = markdown.split('\n').length
  const activeCachedFile = activeRepoPath ? cachedFiles.find((file) => file.path === activeRepoPath) : undefined
  const changedFiles = cachedFiles.filter((file) => file.status !== 'clean')
  const hasRepositoryDrafts = changedFiles.length > 0 || virtualFolders.length > 0
  const repositoryDisplayCachedFiles = repositoryCommitRef ? [] : cachedFiles
  const repositoryDisplayVirtualFolders = repositoryCommitRef ? [] : virtualFolders
  const repositoryRows = buildRepositoryRows(remoteFiles, repositoryDisplayCachedFiles, repositoryDisplayVirtualFolders, collapsedFolders)
  const repositorySaveRows = buildRepositoryRows(remoteFiles, cachedFiles, virtualFolders, repositorySaveCollapsedFolders)
  const repositoryMenuFile = repositoryMenu?.target.type === 'file' ? repositoryRows.find((row) => row.type === 'file' && row.path === repositoryMenu.target.path) : undefined
  const titleSyncState = activeCachedFile ? githubBusy ? 'syncing' : activeCachedFile.status === 'clean' ? 'synced' : 'dirty' : saveState
  const titleSyncText = activeCachedFile ? githubBusy ? '同步中' : activeCachedFile.status === 'clean' ? '已同步' : '已暂存但未推送' : saveState === 'saved' ? '当前内容已更新' : '正在更新预览…'

  return (
    <main className="app-shell">
      {documentRenderConfig.style && <style>{documentRenderConfig.style}</style>}
      <header className="topbar">
        <div className="brand" aria-label="markmap++"><span className="brand-mark"><Icon name="map" /></span><span className="brand-name">markmap<span>++</span></span></div>
        <div className="document-name" title={fileName}><span className={`save-dot ${titleSyncState}`} /><span>{fileName}</span><small>{titleSyncText}</small></div>
        <nav ref={actionsRef} className="actions" aria-label="文档操作">
          <input ref={fileInputRef} className="visually-hidden" type="file" accept=".md,.markdown,text/markdown,text/plain" onChange={openFile} />
          <button type="button" className="button secondary collapsible-action" onClick={() => fileInputRef.current?.click()}><Icon name="folder" /><span>打开</span></button>
          <button type="button" className="button secondary collapsible-action" onClick={() => setActivePanel('help')}><Icon name="help" /><span>说明</span></button>
          <button type="button" className="button secondary collapsible-action" onClick={undoLastChange} disabled={!canUndo} title="撤回上一次修改"><Icon name="undo" /><span>撤回</span></button>
          <button type="button" className="button primary" onClick={() => { setExportError(''); setExportTab('file'); setActivePanel('export') }}><Icon name="download" /><span>导出</span></button>
          <button type="button" className="icon-button" aria-label={fullscreen ? '退出全屏' : '进入全屏'} title={fullscreen ? '退出全屏' : '全屏'} onClick={() => void toggleFullscreen()}><Icon name={fullscreen ? 'collapse' : 'expand'} /></button>
          <button type="button" className="icon-button" aria-label={dark ? '切换浅色模式' : '切换深色模式'} title={dark ? '浅色模式' : '深色模式'} onClick={() => setDark((value) => !value)}><Icon name={dark ? 'sun' : 'moon'} /></button>
          <button type="button" className="icon-button more-action" aria-label="更多操作" title="更多操作" aria-expanded={actionMenuOpen} onClick={() => setActionMenuOpen((value) => !value)}><Icon name="more" /></button>
          {actionMenuOpen && <div className="action-overflow-menu">
            <button type="button" onClick={() => { setActionMenuOpen(false); fileInputRef.current?.click() }}><Icon name="folder" /><span>打开 Markdown</span></button>
            <button type="button" onClick={() => { setActionMenuOpen(false); setActivePanel('help') }}><Icon name="help" /><span>使用说明</span></button>
            <button type="button" onClick={() => { setActionMenuOpen(false); undoLastChange() }} disabled={!canUndo}><Icon name="undo" /><span>撤回修改</span></button>
          </div>}
        </nav>
      </header>

      <section ref={workspaceRef} className={`workspace mobile-${mobilePane}`} style={{ gridTemplateColumns: gridColumns }}>
        <section className={`editor-pane ${editorCollapsed ? 'collapsed' : ''} ${editorView === 'repository' ? 'repository-view' : ''}`} aria-label="Markdown 编辑器">
          {!editorCollapsed && <>
            <div className="pane-header"><div className="editor-view-tabs"><button className={editorView === 'markdown' ? 'active' : ''} onClick={() => setEditorView('markdown')}><span className="status-light" />Markdown</button><button className={editorView === 'repository' ? 'active' : ''} onClick={openGitHubPanel}><Icon name="github" />仓库{changedFiles.length > 0 && <b>{changedFiles.length}</b>}</button></div><button type="button" className="mobile-pane-switch" onClick={() => setMobilePane('preview')} title="切换到思维导图"><Icon name="map" /><span>导图</span></button><button className="header-icon" onClick={() => setActivePanel(editorView === 'repository' ? 'github' : 'editor')} title={editorView === 'repository' ? '仓库设置' : '编辑器设置'}><Icon name="settings" /></button></div>
            {editorView === 'markdown' ? <>
              <MarkdownEditor value={markdown} onChange={updateMarkdown} dark={dark} fontSize={settings.editorFontSize} scheme={settings.highlightScheme} />
              <footer className="editor-status"><button className={`lint-status ${diagnostics.length ? 'has-issues' : ''}`} onClick={() => diagnostics.length && setShowDiagnostics((value) => !value)} disabled={!diagnostics.length}><Icon name={diagnostics.length ? 'warning' : 'check'} />{diagnostics.length ? diagnostics.length : '语法正常'}</button><span>{lineCount} 行</span><span>{markdown.length} 字符</span><span>Markdown</span></footer>
              {showDiagnostics && diagnostics.length > 0 && <div className="diagnostics-popover"><header><strong>语法问题</strong><button className="header-icon" onClick={() => setShowDiagnostics(false)} aria-label="关闭问题列表"><Icon name="x" /></button></header>{diagnostics.map((item, index) => { const line = markdown.slice(0, item.from).split('\n').length; return <button key={`${item.from}-${index}`} onClick={() => setShowDiagnostics(false)}><Icon name="warning" /><span><strong>第 {line} 行</strong><small>{item.message}</small></span></button> })}</div>}
            </> : <div className="repository-workspace" style={{ fontSize: settings.editorFontSize }}>
              {!githubConfig ? <div className="repository-unbound"><Icon name="github" /><strong>尚未绑定 GitHub 仓库</strong><span>绑定后可浏览 Markdown 文件并在本地暂存修改。</span><button onClick={() => setActivePanel('github')}>绑定仓库</button></div> : <>
                <div className="repository-toolbar"><div><strong>{githubConfig.owner}/{githubConfig.repo}</strong><small>{repositoryCommitRef ? `commit ${repositoryCommitRef.slice(0, 7)}` : githubConfig.branch}</small></div><button className="discard-button" title={repositoryCommitRef ? '查看 commit 阶段时不能放弃当前分支修改' : '放弃所有本地修改'} onClick={() => void discardRepositoryChanges()} disabled={githubBusy || Boolean(repositoryCommitRef) || !hasRepositoryDrafts}><Icon name="undo" /><span>放弃</span></button><button className="repository-icon-button" title="刷新当前分支" aria-label="刷新当前分支" onClick={() => void refreshRepositoryView()} disabled={githubBusy}><i><Icon name="refresh" /></i></button><button className="repository-icon-button sync-button" title={repositoryCommitRef ? '查看 commit 阶段时不能同步' : changedFiles.length ? `同步 ${changedFiles.length} 个修改` : '没有待同步修改'} aria-label={repositoryCommitRef ? '查看 commit 阶段时不能同步' : changedFiles.length ? `同步 ${changedFiles.length} 个修改` : '没有待同步修改'} onClick={() => void pushRepositoryChanges()} disabled={githubBusy || Boolean(repositoryCommitRef) || !changedFiles.length}><i><Icon name="sync" /></i></button></div>
                {githubError && <div className="repository-error"><Icon name="warning" />{githubError}</div>}
                {githubNotice && <div className="repository-notice"><Icon name="check" />{githubNotice}</div>}
                <div className={`repository-tree ${(repositoryTouchDrag ? repositoryTouchDrag.dropFolder : repositoryDropFolder) === '' ? 'drop-root' : ''} ${repositoryTouchDrag?.dragging ? 'touch-dragging' : ''}`} role="tree" aria-label="GitHub Markdown 文件树" data-repository-type="root" data-repository-path="" onContextMenu={(event) => openRepositoryMenu(event, { type: 'root', path: '', name: '仓库根目录' })} onTouchStart={(event) => startRepositoryTouch(event, { type: 'root', path: '', name: '仓库根目录' })} onTouchMove={moveRepositoryTouch} onTouchEnd={endRepositoryTouch} onTouchCancel={cancelRepositoryTouchGesture} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; const target = draggedRepositoryTarget; setRepositoryDropFolder(target ? normalizeRepositoryDropFolder(target, '') : null) }} onDrop={(event) => { event.preventDefault(); void dropRepositoryTarget('') }}>
                  {repositoryRows.length ? repositoryRows.map((row) => {
                    const isRenaming = renamingRepositoryTarget?.type === row.type && renamingRepositoryTarget.path === row.path
                    const activeDropFolder = repositoryTouchDrag ? repositoryTouchDrag.dropFolder : repositoryDropFolder
                    const isDropZone = activeDropFolder !== null && activeDropFolder !== '' && (row.path === activeDropFolder || row.path.startsWith(`${activeDropFolder}/`))
                    const isTouchSource = repositoryTouchDrag?.target.path === row.path
                    if (row.type === 'folder') return <div className={`tree-folder ${isDropZone ? 'drop-zone' : ''} ${isTouchSource ? 'touch-source' : ''}`} role="treeitem" aria-expanded={!collapsedFolders.has(row.path)} data-repository-type="folder" data-repository-path={row.path} draggable={!repositoryCommitRef && !isRenaming} key={`folder:${row.path}`} style={{ paddingLeft: 8 + row.depth * 16 }} onTouchStart={(event) => startRepositoryTouch(event, row)} onTouchMove={moveRepositoryTouch} onTouchEnd={endRepositoryTouch} onTouchCancel={cancelRepositoryTouchGesture} onDragStart={(event) => { event.stopPropagation(); event.dataTransfer.effectAllowed = 'move'; setDraggedRepositoryTarget(row); setRepositoryDropFolder(null) }} onDragEnd={() => { setDraggedRepositoryTarget(null); setRepositoryDropFolder(null) }} onDragOver={(event) => { event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = 'move'; const target = draggedRepositoryTarget; setRepositoryDropFolder(target ? normalizeRepositoryDropFolder(target, row.path) : null) }} onDrop={(event) => { event.preventDefault(); event.stopPropagation(); void dropRepositoryTarget(row.path) }} onContextMenu={(event) => openRepositoryMenu(event, row)}><span className="tree-indent-guides" aria-hidden="true" style={{ width: row.depth * 16 }} />{isRenaming ? <div className="tree-inline-edit"><Icon name="folder" /><input autoFocus value={repositoryRenameValue} onFocus={(event) => event.currentTarget.select()} onChange={(event) => setRepositoryRenameValue(event.target.value)} onBlur={finishRepositoryRename} onContextMenu={(event) => event.stopPropagation()} onKeyDown={(event) => { if (event.key === 'Enter') finishRepositoryRename(); if (event.key === 'Escape') setRenamingRepositoryTarget(null) }} /></div> : <button onClick={() => { if (consumeRepositoryLongPressClick()) return; setCollapsedFolders((current) => { const next = new Set(current); if (next.has(row.path)) next.delete(row.path); else next.add(row.path); return next }) }}><Icon name={collapsedFolders.has(row.path) ? 'chevron-right' : 'chevron-down'} /><Icon name="folder" /><span>{row.name}</span></button>}</div>
                    const destination = parentPath(row.path)
                    return <div className={`tree-file ${activeRepoPath === row.path ? 'active' : ''} ${row.cached?.status === 'deleted' ? 'deleted' : ''} ${isDropZone ? 'drop-zone' : ''} ${isTouchSource ? 'touch-source' : ''}`} role="treeitem" data-repository-type="file" data-repository-path={row.path} draggable={!repositoryCommitRef && !isRenaming && row.cached?.status !== 'deleted'} key={`file:${row.path}`} style={{ paddingLeft: 12 + row.depth * 16 }} onTouchStart={(event) => startRepositoryTouch(event, row)} onTouchMove={moveRepositoryTouch} onTouchEnd={endRepositoryTouch} onTouchCancel={cancelRepositoryTouchGesture} onDragStart={(event) => { event.stopPropagation(); event.dataTransfer.effectAllowed = 'move'; setDraggedRepositoryTarget(row); setRepositoryDropFolder(null) }} onDragEnd={() => { setDraggedRepositoryTarget(null); setRepositoryDropFolder(null) }} onDragOver={(event) => { event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = 'move'; const target = draggedRepositoryTarget; setRepositoryDropFolder(target ? normalizeRepositoryDropFolder(target, destination) : null) }} onDrop={(event) => { event.preventDefault(); event.stopPropagation(); void dropRepositoryTarget(destination) }} onContextMenu={(event) => openRepositoryMenu(event, row)}><span className="tree-indent-guides" aria-hidden="true" style={{ width: row.depth * 16 }} />{isRenaming ? <div className="tree-open tree-inline-edit"><Icon name="map" /><input autoFocus value={repositoryRenameValue} onFocus={(event) => event.currentTarget.select()} onChange={(event) => setRepositoryRenameValue(event.target.value)} onBlur={finishRepositoryRename} onContextMenu={(event) => event.stopPropagation()} onKeyDown={(event) => { if (event.key === 'Enter') finishRepositoryRename(); if (event.key === 'Escape') setRenamingRepositoryTarget(null) }} /></div> : <button className="tree-open" disabled={row.cached?.status === 'deleted'} onClick={() => { if (!consumeRepositoryLongPressClick()) openRepositoryRow(row) }}><Icon name="map" /><span>{repositoryCommitRef ? historicalFileName(row.name, repositoryCommitRef) : row.name}</span></button>}{row.cached ? row.cached.status !== 'clean' ? <b>{row.cached.status === 'renamed' ? 'R' : row.cached.status === 'added' ? 'A' : row.cached.status === 'deleted' ? 'D' : 'M'}</b> : <i className="cached" title="已拉取并同步" /> : <i className="remote" title="尚未拉取" />}</div>
                  }) : <div className="github-empty">{githubBusy ? '正在读取仓库…' : '仓库中没有 Markdown 文件'}</div>}
                </div>
                <footer className="repository-status"><span className={changedFiles.length && !repositoryCommitRef ? 'dirty' : 'clean'} /><span className="repository-status-label">{repositoryCommitRef ? `查看 commit ${repositoryCommitRef.slice(0, 7)} · 文件打开后为独立缓存` : changedFiles.length ? `${changedFiles.length} 个文件已暂存但未推送` : '所有缓存文件均已同步'}</span><button className="repository-branch-button" title="查看仓库 Git Graph 与切换分支" aria-label="查看仓库 Git Graph 与切换分支" aria-expanded={Boolean(repositoryGraph)} onClick={() => { if (repositoryGraph) setRepositoryGraph(null); else void openRepositoryGraph() }}><Icon name="branch" /><span>{githubConfig.branch}</span></button></footer>
                {repositoryGraph && <div className="repository-graph-popover" onMouseDown={(event) => event.stopPropagation()}>
                  <header><div><strong>仓库提交历史</strong><small>{githubConfig.owner}/{githubConfig.repo} · {githubConfig.branch}</small></div><button className="header-icon" aria-label="关闭仓库提交历史" onClick={() => setRepositoryGraph(null)}><Icon name="x" /></button></header>
                  {repositoryGraph.error && <div className="repository-graph-error"><Icon name="warning" /><span>{repositoryGraph.error}</span></div>}
                  <button className="repository-graph-branch-toggle" aria-expanded={repositoryGraphBranchesOpen} onClick={() => setRepositoryGraphBranchesOpen((value) => !value)}><Icon name="branch" /><span>分支</span><strong>{githubConfig.branch}</strong><Icon name={repositoryGraphBranchesOpen ? 'chevron-down' : 'chevron-right'} /></button>
                  {repositoryGraphBranchesOpen && <div className="repository-graph-branches">{repositoryGraph.branches.length ? repositoryGraph.branches.map((branch) => <button className={branch.name === githubConfig.branch ? 'active' : ''} key={branch.name} disabled={githubBusy || repositoryGraph.loading} onClick={() => void switchRepositoryBranch(branch)}><Icon name="branch" /><span>{branch.name}</span><small>{branch.sha.slice(0, 7)}</small></button>) : <span>没有可用分支</span>}</div>}
                  {repositoryGraph.loading && !repositoryGraph.commits.length ? <div className="repository-graph-state"><Icon name="refresh" /><span>正在读取仓库提交历史…</span></div> : repositoryGraph.commits.length ? <div className="repository-graph-list">{repositoryGraph.commits.map((commit) => <button className={`repository-graph-commit ${repositoryCommitRef === commit.sha ? 'active' : ''}`} key={commit.sha} disabled={repositoryGraph.loading || githubBusy} onClick={() => void openRepositoryCommit(commit)}><span className="repository-graph-rail"><i /></span><span className="repository-graph-commit-info"><strong title={commit.message}>{commit.message.split('\n')[0]}</strong><small><code title={commit.sha}>{commit.sha.slice(0, 7)}</code><em> · {githubConfig.branch} · {commit.author} · {formatCommitDate(commit.date)}</em></small></span><Icon name="chevron-right" /></button>)}</div> : <div className="repository-graph-state"><Icon name="clock" /><span>没有找到仓库提交记录</span></div>}
                </div>}
                {repositoryMenu && <div className="repository-context-menu" style={{ left: repositoryMenu.x, top: repositoryMenu.y }} onPointerDown={(event) => event.stopPropagation()}>
                  <strong>{repositoryMenu.target.name}</strong>
                  {repositoryMenu.target.type !== 'root' && <><button onClick={() => { const target = repositoryMenu.target; setRepositoryMenu(null); startRepositoryRename(target) }}>重命名</button><button onClick={() => { setRepositoryClipboard({ mode: 'copy', target: repositoryMenu.target }); setRepositoryMenu(null) }}>复制</button><button onClick={() => { setRepositoryClipboard({ mode: 'cut', target: repositoryMenu.target }); setRepositoryMenu(null) }}>剪切</button></>}
                  {repositoryMenu.target.type === 'file' && <button disabled={!repositoryMenuFile?.remote} title={repositoryMenuFile?.remote ? '查看该文件的历史提交' : '本地新增文件还没有远程提交记录'} onClick={() => { const menu = repositoryMenu; if (menu) void openRepositoryHistory(menu.target, menu.x, menu.y) }}>查看历史提交</button>}
                  {(repositoryMenu.target.type === 'folder' || repositoryMenu.target.type === 'root') && <><hr/><button disabled={!repositoryClipboard} onClick={() => { const folder = repositoryMenu.target.path; setRepositoryMenu(null); void pasteRepositoryClipboard(folder) }}>粘贴{repositoryClipboard ? `“${repositoryClipboard.target.name}”` : ''}</button><button onClick={() => { const folder = repositoryMenu.target.path; setRepositoryMenu(null); void createRepositoryFile(folder) }}>新建 Markdown</button><button onClick={() => { const folder = repositoryMenu.target.path; setRepositoryMenu(null); createRepositoryFolder(folder) }}>新建文件夹</button></>}
                  {repositoryMenu.target.type !== 'root' && <><hr/><button className="danger" onClick={() => { const target = repositoryMenu.target; setRepositoryMenu(null); void deleteRepositoryTarget(target) }}>删除</button></>}
                </div>}
                {repositoryHistory && <div className="repository-history-popover" style={{ left: repositoryHistory.x, top: repositoryHistory.y }} onPointerDown={(event) => event.stopPropagation()}>
                  <header><div><strong>文件历史</strong><small title={repositoryHistory.target.path}>{repositoryHistory.target.path}</small></div><button className="header-icon" aria-label="关闭历史记录" onClick={() => setRepositoryHistory(null)}><Icon name="x" /></button></header>
                  {repositoryHistory.error && <div className="repository-history-error"><Icon name="warning" /><span>{repositoryHistory.error}</span></div>}
                  {repositoryHistory.loading && !repositoryHistory.commits.length ? <div className="repository-history-state"><Icon name="refresh" /><span>正在读取提交历史…</span></div> : repositoryHistory.commits.length ? <div className="repository-history-list" role="list">{repositoryHistory.commits.map((commit) => <button className="repository-history-item" key={commit.sha} disabled={repositoryHistory.loading} onClick={() => void openRepositoryHistoryVersion(commit)}><Icon name="clock" /><span><strong>{formatCommitDate(commit.date)}</strong><small><code title={commit.sha}>{commit.sha.slice(0, 7)}</code><em> · {githubConfig?.branch || '当前分支'} · {commit.author}</em></small><b title={commit.message}>{commit.message.split('\n')[0]}</b></span><Icon name="chevron-right" /></button>)}</div> : <div className="repository-history-state"><Icon name="clock" /><span>没有找到该文件的提交记录</span></div>}
                </div>}
                {repositoryTouchDrag?.dragging && <div className={`repository-touch-drag-ghost ${repositoryTouchDrag.dropFolder === null ? 'invalid' : ''}`} style={{ left: Math.min(repositoryTouchDrag.x + 14, window.innerWidth - 190), top: Math.min(repositoryTouchDrag.y + 14, window.innerHeight - 48) }}><Icon name={repositoryTouchDrag.target.type === 'folder' ? 'folder' : 'map'} /><span>{repositoryTouchDrag.target.name}</span></div>}
                {repositoryTouchDrag && <div className="repository-touch-drag-indicator"><Icon name={repositoryTouchDrag.dragging ? 'folder' : 'more'} /><span>{repositoryTouchDrag.dragging ? repositoryTouchDrag.dropFolder !== null ? `移动到 ${repositoryTouchDrag.dropFolder || '仓库根目录'}` : '这里不能放置' : '松开打开菜单，移动手指可拖拽'}</span></div>}
              </>}
            </div>}
          </>}
        </section>

        <div className="split-handle"><div className="grab-zone" onPointerDown={startResize} role="separator" aria-label="调整编辑器与预览宽度"><span /></div><button className="split-toggle" onClick={toggleEditor} title={editorCollapsed ? '展开编辑器' : '收起编辑器'} aria-label={editorCollapsed ? '展开编辑器' : '收起编辑器'}><Icon name={editorCollapsed ? 'chevron-right' : 'chevron-left'} /></button></div>

        <section className="preview-pane" aria-label="思维导图预览">
          <>
            <div className="pane-header"><div><span className="status-light purple" />思维导图</div><button type="button" className="mobile-pane-switch" onClick={() => setMobilePane('editor')} title="返回 Markdown"><Icon name="chevron-left" /><span>Markdown</span></button><button type="button" className="fit-button" onClick={() => mmRef.current?.fit()} title="适应画布" aria-label="适应画布"><Icon name="focus" /></button><button className="header-icon" onClick={() => setActivePanel('preview')} title="预览设置"><Icon name="settings" /></button></div>
            <div className={`map-canvas ${effectiveShowGrid ? '' : 'no-grid'}`}><svg id={MARKMAP_PREVIEW_ID} ref={svgRef} /></div>
          </>
        </section>
      </section>

      {activePanel && <div className="panel-backdrop" onMouseDown={() => { if (repositorySaveMode) cancelRepositorySave(); setActivePanel(null) }}>
        <section className={`settings-panel ${activePanel === 'help' ? 'help-panel' : ''} ${activePanel === 'github' ? 'github-panel' : ''} ${activePanel === 'export' && exportTab === 'repository' && repositorySaveMode ? 'repository-save-panel' : ''}`} role="dialog" aria-label={activePanel === 'export' ? '导出设置' : activePanel === 'github' ? 'GitHub 仓库' : activePanel === 'help' ? '使用说明' : '显示设置'} onMouseDown={(event) => event.stopPropagation()}>
          <header><div><strong>{activePanel === 'editor' ? '编辑器设置' : activePanel === 'preview' ? '预览设置' : activePanel === 'github' ? 'GitHub 仓库' : activePanel === 'help' ? '使用说明' : exportTab === 'repository' ? '另存到 Git 仓库' : '导出思维导图'}</strong><small>{activePanel === 'export' ? exportTab === 'repository' ? '选择仓库位置并暂存当前 Markdown' : '选择格式与清晰度' : activePanel === 'github' ? '本地暂存，确认后一次提交并推送' : activePanel === 'help' ? '不会覆盖当前 Markdown' : '更改会立即生效'}</small></div><div className="panel-header-actions">{(activePanel === 'editor' || activePanel === 'preview') && <button className="reset-settings-button" onClick={resetSettings}><Icon name="refresh" />恢复默认设置</button>}<button className="header-icon" onClick={() => { if (repositorySaveMode) cancelRepositorySave(); setActivePanel(null) }} aria-label="关闭"><Icon name="x" /></button></div></header>
          {activePanel === 'github' && <div className="github-body">
            {!githubConfig ? <div className="github-bind-form">
              <label className="field"><span>仓库</span><input type="text" value={repositoryInput} onChange={(event) => setRepositoryInput(event.target.value)} placeholder="owner/repository" /></label>
              <label className="field"><span>分支</span><input type="text" value={branchInput} onChange={(event) => setBranchInput(event.target.value)} placeholder="main" /></label>
              <label className="field"><span>GitHub 令牌</span><input type="password" value={tokenInput} onChange={(event) => setTokenInput(event.target.value)} placeholder="Fine-grained personal access token" /></label>
              <div className="settings-note"><Icon name="github" /><span>令牌保存在当前浏览器。请选择该仓库，并授予 Contents 读写权限。</span></div>
              {githubError && <div className="export-error"><Icon name="warning" />{githubError}</div>}
              <button className="export-submit" disabled={githubBusy} onClick={() => void bindRepository()}><Icon name="github" />{githubBusy ? '正在连接…' : '绑定仓库'}</button>
            </div> : <div className="github-bound-settings">
              <div className="github-repo-card"><Icon name="github" /><span><strong>{githubConfig.owner}/{githubConfig.repo}</strong><small>{githubConfig.branch} · {remoteHead ? remoteHead.slice(0, 7) : '尚未刷新'}</small></span></div>
              <div className="settings-note"><Icon name="check" /><span>编辑只写入浏览器本地缓存。只有点击仓库页的“同步”按钮时，才会自动创建一个 commit 并推送。</span></div>
              {githubError && <div className="export-error"><Icon name="warning" />{githubError}</div>}
              {githubNotice && <div className="github-notice"><Icon name="check" />{githubNotice}</div>}
              <button className="github-unbind" type="button" onClick={() => { cancelRepositorySave(); saveGitHubConfig(null); setGithubConfig(null); setRemoteFiles([]); setRemoteHead(''); setEditorView('markdown'); setGithubNotice('') }}>解除仓库绑定</button>
            </div>}
          </div>}
          {activePanel === 'help' && <div className="help-body">
            <div className="help-callout"><strong>单击是选中，双击才是编辑</strong><span>只单击节点时，Enter 会新增同级节点；双击出现输入框后，Enter 才会保存文字。</span></div>
            <dl><div><dt>单击节点</dt><dd>选中节点</dd></div><div><dt>双击节点</dt><dd>编辑文字</dd></div><div><dt>Enter</dt><dd>选中时新增同级；编辑时保存</dd></div><div><dt>Tab</dt><dd>新增子节点</dd></div><div><dt>Delete / Backspace</dt><dd>删除选中的整个节点</dd></div><div><dt>撤回</dt><dd>恢复最近一次修改或误删</dd></div></dl>
            <p>画布支持拖动、滚轮缩放和点击圆点折叠分支。</p>
          </div>}
          {activePanel === 'editor' && <div className="settings-body">
            <label className="field"><span>字号 <b>{settings.editorFontSize}px</b></span><input type="range" min="12" max="22" value={settings.editorFontSize} onChange={(event) => updateSettings('editorFontSize', Number(event.target.value))} /></label>
            <label className="field"><span>高亮方案</span><select value={settings.highlightScheme} onChange={(event) => updateSettings('highlightScheme', event.target.value as HighlightScheme)}><option value="violet">Violet</option><option value="github">GitHub</option><option value="solarized">Solarized</option></select></label>
            <div className="settings-note"><Icon name="warning" /><span>语法检查包括标题层级、代码块闭合与缩进一致性，问题会直接标记在编辑器中。</span></div>
          </div>}
          {activePanel === 'preview' && <div className="settings-body">
            {documentRenderConfig.optionKeys.length > 0 && <div className="settings-note code-options-note"><Icon name="check" /><span>Frontmatter 正在控制：{documentRenderConfig.optionKeys.join('、')}。代码配置优先于此面板。</span></div>}
            <label className={`field ${codeFont.controlsSize ? 'code-controlled' : ''}`}><span>节点字号 <b>{codeFont.controlsSize ? `${effectiveFontSizeCss} · 代码` : `${settings.previewFontSize}px`}</b></span><input type="range" min="12" max="28" value={settings.previewFontSize} disabled={codeFont.controlsSize} onChange={(event) => updateSettings('previewFontSize', Number(event.target.value))} /></label>
            <label className={`field ${codeFont.controlsFamily ? 'code-controlled' : ''}`}><span>字体{codeFont.controlsFamily && <b>由代码控制</b>}</span><select value={settings.previewFont} disabled={codeFont.controlsFamily} onChange={(event) => updateSettings('previewFont', event.target.value as PreviewFont)}>{Object.entries(previewFonts).map(([value, font]) => <option key={value} value={value}>{font.label}</option>)}</select></label>
            <label className={`field ${codeFont.controlsWeight ? 'code-controlled' : ''}`}><span>字重 <b>{codeFont.controlsWeight ? `${effectiveFontWeightCss} · 代码` : settings.previewWeight}</b></span><input type="range" min="300" max="700" step="50" value={settings.previewWeight} disabled={codeFont.controlsWeight} onChange={(event) => updateSettings('previewWeight', Number(event.target.value))} /></label>
            <label className={`field ${documentRenderConfig.colorFreezeLevel !== undefined ? 'code-controlled' : ''}`}><span>颜色层级 <b>{documentRenderConfig.colorFreezeLevel !== undefined ? `${effectiveColorFreezeLevel} · 代码` : effectiveColorFreezeLevel}</b></span><input type="range" min="0" max="6" step="1" value={effectiveColorFreezeLevel} disabled={documentRenderConfig.colorFreezeLevel !== undefined} onChange={(event) => updateSettings('colorFreezeLevel', Number(event.target.value))} /><small>从指定层级开始继承分支颜色，0 表示不锁定</small></label>
            <label className={`switch-field ${documentRenderConfig.showGrid !== undefined ? 'code-controlled' : ''}`}><span><strong>点阵背景</strong><small>{documentRenderConfig.showGrid !== undefined ? '由 Frontmatter 代码控制' : '辅助观察画布移动与缩放'}</small></span><input type="checkbox" checked={effectiveShowGrid} disabled={documentRenderConfig.showGrid !== undefined} onChange={(event) => updateSettings('showGrid', event.target.checked)} /></label>
            <div className="font-samples"><small>字体预览{(codeFont.controlsFamily || codeFont.controlsSize || codeFont.controlsWeight) && ' · 代码配置'}</small><span style={fontPreviewStyle}>思维导图 Mind Map 0123</span></div>
          </div>}
          {activePanel === 'export' && <div className="settings-body export-panel-body">
            <div className="export-tabs" role="tablist" aria-label="导出方式">
              <button role="tab" aria-selected={exportTab === 'file'} className={exportTab === 'file' ? 'active' : ''} onClick={() => { setExportError(''); cancelRepositorySave(); setExportTab('file') }}><Icon name="download" /><span>导出文件</span></button>
              <button role="tab" aria-selected={exportTab === 'repository'} className={exportTab === 'repository' ? 'active' : ''} onClick={() => { setExportError(''); setExportTab('repository') }}><Icon name="github" /><span>另存到仓库</span></button>
            </div>
            {exportTab === 'file' ? <>
              <div className="format-grid">{(['png', 'jpeg', 'svg', 'html', 'md'] as ExportFormat[]).map((format) => <button key={format} className={exportFormat === format ? 'active' : ''} onClick={() => { setExportError(''); setExportFormat(format) }}><strong>{format === 'md' ? 'MD' : format.toUpperCase()}</strong><small>{format === 'png' ? '无损位图' : format === 'jpeg' ? '体积更小' : format === 'svg' ? '无限清晰' : format === 'html' ? '网页文件' : '源文件'}</small></button>)}</div>
              <label className="field"><span>渲染倍率 <b>{exportScale}×</b></span><input type="range" min="1" max="4" step="1" value={exportScale} onChange={(event) => setExportScale(Number(event.target.value))} disabled={exportFormat === 'md'} /><small>{exportFormat === 'svg' ? '倍率设置 SVG 的画布尺寸，矢量内容始终清晰' : exportFormat === 'html' ? 'HTML 将保留可缩放矢量图' : exportFormat === 'md' ? 'Markdown 源文件无需倍率' : `预计输出为当前内容尺寸的 ${exportScale} 倍`}</small></label>
              {exportError && <div className="export-error"><Icon name="warning" />{exportError}</div>}
              <button className="export-submit" disabled={exporting} onClick={() => void exportDocument()}><Icon name="download" />{exporting ? '正在生成…' : `导出 ${exportFormat.toUpperCase()}`}</button>
            </> : repositorySaveMode ? <div className="repository-save-dialog">
              <div className="repository-save-dialog-head">
                <div className="repository-save-breadcrumbs"><button onClick={() => setRepositorySaveFolder('')} className={!repositorySaveFolder ? 'active' : ''}><Icon name="github" /><span>{githubConfig?.repo || '仓库'}</span></button>{repositorySaveFolder.split('/').filter(Boolean).map((part, index, parts) => { const path = parts.slice(0, index + 1).join('/'); return <span className="repository-save-breadcrumb" key={path}><Icon name="chevron-right" /><button onClick={() => setRepositorySaveFolder(path)} className={path === repositorySaveFolder ? 'active' : ''}>{part}</button></span> })}</div>
                <button className="repository-new-folder-button" disabled={githubBusy} onClick={beginRepositoryFolderCreation}><Icon name="folder" /><span>新建文件夹</span></button>
              </div>
              {repositoryNewFolderParent !== null && <div className="repository-new-folder-form"><Icon name="folder" /><input autoFocus value={repositoryNewFolderName} placeholder="文件夹名称" aria-label="新建文件夹名称" onChange={(event) => setRepositoryNewFolderName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') finishRepositoryFolderCreation(); if (event.key === 'Escape') { setRepositoryNewFolderParent(null); setRepositoryNewFolderName('') } }} /><button className="confirm" onClick={finishRepositoryFolderCreation}>创建</button><button onClick={() => { setRepositoryNewFolderParent(null); setRepositoryNewFolderName('') }}>取消</button></div>}
              <div className="repository-save-tree-area">
                {githubError && <div className="export-error"><Icon name="warning" />{githubError}</div>}
                <div className="repository-save-tree" role="tree" aria-label="选择 GitHub 保存位置">
                  <button className={`repository-save-tree-row root ${!repositorySaveFolder ? 'selected' : ''}`} onClick={() => setRepositorySaveFolder('')}><Icon name="github" /><span>{githubConfig?.repo || '仓库根目录'}</span></button>
                  {repositorySaveRows.length ? repositorySaveRows.map((row) => row.type === 'folder' ? <button className={`repository-save-tree-row folder ${row.path === repositorySaveFolder ? 'selected' : ''}`} key={`save-folder:${row.path}`} style={{ paddingLeft: 12 + row.depth * 18 }} title="选择位置并展开或收起" onClick={() => { setRepositorySaveFolder(row.path); setRepositorySaveCollapsedFolders((current) => { const next = new Set(current); if (next.has(row.path)) next.delete(row.path); else next.add(row.path); return next }) }}><Icon name={repositorySaveCollapsedFolders.has(row.path) ? 'chevron-right' : 'chevron-down'} /><Icon name="folder" /><span>{row.name}</span></button> : <button className={`repository-save-tree-row file ${parentPath(row.path) === repositorySaveFolder ? 'in-folder' : ''}`} key={`save-file:${row.path}`} style={{ paddingLeft: 31 + row.depth * 18 }} onClick={() => { setRepositorySaveFolder(parentPath(row.path)); setRepositorySaveName(row.name) }}><Icon name="map" /><span>{row.name}</span>{row.cached?.status === 'added' && <b>A</b>}{row.cached?.status === 'modified' && <b>M</b>}</button>) : <div className="repository-save-empty">仓库中还没有 Markdown 文件，可以直接在当前目录保存。</div>}
                </div>
              </div>
              <div className="repository-save-footer">
                <label className="repository-save-name"><span>文件名</span><input value={repositorySaveName} aria-label="另存文件名" onChange={(event) => setRepositorySaveName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void saveCurrentDocumentToRepository() }} /></label>
                <small>保存位置：{repositorySaveFolder || '仓库根目录'}</small>
                <div className="repository-save-actions"><button className="repository-save-confirm" onClick={() => void saveCurrentDocumentToRepository()} disabled={githubBusy}>保存</button><button onClick={cancelRepositorySave} disabled={githubBusy}>取消</button></div>
              </div>
            </div> : <>
              {!githubConfig ? <>
                <div className="settings-note"><Icon name="github" /><span>先绑定一个 GitHub 仓库，之后可以浏览仓库文件树、创建文件夹，并将当前 Markdown 暂存到指定位置。</span></div>
                <button className="export-submit" onClick={() => setActivePanel('github')}><Icon name="github" />绑定 GitHub 仓库</button>
              </> : <>
                <div className="github-repo-card"><Icon name="github" /><span><strong>{githubConfig.owner}/{githubConfig.repo}</strong><small>{githubConfig.branch} · {remoteHead ? remoteHead.slice(0, 7) : '尚未刷新'}</small></span></div>
                <div className="settings-note"><Icon name="folder" /><span>进入仓库文件树后，点击文件夹选择保存位置；也可以新建文件夹并编辑文件名。</span></div>
                {githubNotice && <div className="github-notice"><Icon name="check" />{githubNotice}</div>}
                <button className="export-submit" disabled={githubBusy} onClick={startRepositorySave}><Icon name="folder" />选择仓库位置</button>
              </>}
            </>}
          </div>}
        </section>
      </div>}
    </main>
  )
}
