import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import DOMPurify from 'dompurify'
import katex from 'katex'
import { defaultOptions, deriveOptions, Markmap, toMarkdown, Transformer } from 'markmap-plus'
import type { IMarkmapJSONOptions, IMarkmapOptions } from 'markmap-plus'
import katexStyles from 'katex/dist/katex.min.css?inline'
import 'katex/dist/katex.min.css'
import '@fontsource-variable/inter'
import '@fontsource-variable/jetbrains-mono'
import '@fontsource-variable/noto-sans-sc/wght.css'
import '@fontsource-variable/noto-serif-sc/wght.css'
import 'lxgw-wenkai-webfont/lxgwwenkai-regular.css'
import MarkdownEditor, { type HighlightScheme, type MarkdownEditorHandle, type MarkdownEditorSelection } from './markdown-editor'
import AgentPanel, { type AgentCommitResult, type AgentMutationResult } from './agent-panel'
import type { AgentSourceFile } from './agent-client'
import { normalizeWorkspaceLocator, workspaceKeyFor, type AgentWorkspaceRef, type AgentWorkspaceSelectionResult } from './agent-history'
import guideEnglish from '../content/markmap++ guide.md?raw'
import guideChinese from '../content/markmap++ 操作指南.md?raw'
import { useI18n } from '../i18n-hook'
import type { Locale } from '../i18n'
import { desktopApi, saveBlob, type DesktopLocalGitCommit, type DesktopLocalGitFile, type DesktopLocalGitGraph, type DesktopLocalGitState } from './desktop-api'
import { inspectMarkdown } from './markdown-lint'
import { NoteLinksPanel, RepositoryLinkPicker, SelectionActionMenu, type BacklinkEntry, type LinkTarget, type OutgoingLinkEntry } from './note-link-ui'
import { indexRepositoryNote, repositoryLinkHref, repositoryMarkdownLink, resolveHeading, resolveRepositoryLink, rewriteRepositoryLinks } from './repository-links'
import {
  downloadMarkdown,
  downloadMarkdownAtCommit,
  listCachedFiles,
  listFileCommits,
  listRemoteMarkdown,
  listRepositoryBranches,
  listRepositoryCommits,
  loadGitHubConfig,
  loadStoredGitHubConfig,
  loadStoredGitHubProfiles,
  pushCachedChanges,
  putCachedFile,
  removeCachedFile,
  repoKeyOf,
  repositoryProfileId,
  saveGitHubConfig,
  saveStoredGitHubProfiles,
  verifyRepository,
  type CachedMarkdownFile,
  type GitHubBranch,
  type GitHubFileCommit,
  type GitHubRepositoryCommit,
  type GitHubRepositoryProfile,
  type GitHubConfig,
  type RemoteMarkdownFile,
} from './github-sync'

window.katex = katex as unknown as typeof window.katex
const transformer = new Transformer()
const SETTINGS_KEY = 'markmap-plus-plus:settings'
const VIRTUAL_FOLDERS_KEY = 'markmap-plus-plus:virtual-folders'
const DESKTOP_WORKSPACE_KEY = 'markmap-plus-plus:desktop-workspace'
const MARKMAP_PREVIEW_ID = 'markmap-preview'
const brandIconUrl = `${import.meta.env.BASE_URL}brand/markmap-plus-plus-icon.png`

type Pane = 'editor' | 'preview'
type Panel = Pane | 'export' | 'github' | 'help' | 'links' | null
const HELP_TIP_COUNT = 5
type ExportFormat = 'md' | 'svg' | 'png' | 'jpeg' | 'html'
type ExportTextTheme = 'auto' | 'light' | 'dark'
type PreviewFont = 'inter' | 'notoSans' | 'notoSerif' | 'wenkai' | 'mono'
type EditorView = 'markdown' | 'repository' | 'agent'

interface DesktopWorkspaceSession {
  repositorySource: 'remote' | 'local'
  editorView: EditorView
  localRepositoryId: string | null
  localPath: string | null
  remotePath: string | null
}

function loadDesktopWorkspaceSession(): DesktopWorkspaceSession | null {
  if (!desktopApi()) return null
  try {
    const value = JSON.parse(localStorage.getItem(DESKTOP_WORKSPACE_KEY) || 'null') as Partial<DesktopWorkspaceSession> | null
    if (!value || (value.repositorySource !== 'remote' && value.repositorySource !== 'local')) return null
    return {
      repositorySource: value.repositorySource,
      editorView: value.editorView === 'repository' || value.editorView === 'agent' ? value.editorView : 'markdown',
      localRepositoryId: typeof value.localRepositoryId === 'string' ? value.localRepositoryId : null,
      localPath: typeof value.localPath === 'string' ? value.localPath : null,
      remotePath: typeof value.remotePath === 'string' ? value.remotePath : null,
    }
  } catch { return null }
}

type TextSelectionTarget = ({ source: 'editor' } & MarkdownEditorSelection) | {
  source: 'preview'
  x: number
  y: number
  text: string
  range: Range
  nodePath: string
  contentElement: HTMLElement
  anchor?: HTMLAnchorElement
}

interface PendingRepositoryNavigation {
  path: string
  fragment: string
  line?: number
}

interface AppSettings {
  editorFontSize: number
  editorFont: PreviewFont
  editorWeight: number
  highlightScheme: HighlightScheme
  previewFontSize: number
  previewFont: PreviewFont
  previewWeight: number
  colorFreezeLevel: number
  showGrid: boolean
  previewBackgroundColor: string
}

const defaultSettings: AppSettings = {
  editorFontSize: 14,
  editorFont: 'notoSans',
  editorWeight: 400,
  highlightScheme: 'violet',
  previewFontSize: 16,
  previewFont: 'notoSans',
  previewWeight: 400,
  colorFreezeLevel: 2,
  showGrid: true,
  previewBackgroundColor: '#fafafa',
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

function getForeignContentElement(foreignObject: SVGForeignObjectElement) {
  const content = foreignObject.firstElementChild?.firstElementChild
  return content instanceof HTMLElement ? content : null
}

function inlineComputedStyles(source: Element, target: Element) {
  const computed = getComputedStyle(source)
  const declarations: string[] = []
  for (let index = 0; index < computed.length; index += 1) {
    const property = computed.item(index)
    const isThemeColor = property === 'color' || property === '-webkit-text-fill-color' || property === 'text-decoration-color' || (property.endsWith('color') && !property.startsWith('background')) || property === 'fill' || property === 'stroke'
    if (isThemeColor) continue
    const value = computed.getPropertyValue(property)
    if (value) declarations.push(`${property}:${value}`)
  }
  target.setAttribute('style', declarations.join(';'))
  const sourceChildren = Array.from(source.children)
  const targetChildren = Array.from(target.children)
  sourceChildren.forEach((child, index) => {
    const targetChild = targetChildren[index]
    if (targetChild && child.tagName.toLowerCase() === targetChild.tagName.toLowerCase()) inlineComputedStyles(child, targetChild)
  })
}

function readBlobAsDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error || new Error('无法读取图片资源'))
    reader.readAsDataURL(blob)
  })
}

function removeExternalFontFaces(css: string) {
  return css.replace(/@font-face\s*\{[^{}]*\}/g, '')
}

async function resolveExportImageSource(source: string) {
  if (!source || source.startsWith('data:')) return source
  try {
    const response = await fetch(new URL(source, window.location.href), { mode: 'cors' })
    if (!response.ok) return source
    return await readBlobAsDataUrl(await response.blob())
  } catch {
    return source
  }
}

function buildDocumentRenderConfig(markdown: string): DocumentRenderConfig {
  const transformed = transformer.transform(markdown)
  const sanitizeNode = (value: unknown) => {
    if (!value || typeof value !== 'object') return
    const node = value as { content?: unknown; children?: unknown[] }
    if (typeof node.content === 'string') node.content = DOMPurify.sanitize(node.content)
    node.children?.forEach(sanitizeNode)
  }
  sanitizeNode(transformed.root)
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
  local?: DesktopLocalGitFile
}

function buildLocalRepositoryRows(files: DesktopLocalGitFile[], collapsedFolders: Set<string>): RepositoryRow[] {
  const folders = new Set<string>()
  files.forEach((file) => {
    const parts = file.path.split('/')
    for (let index = 0; index < parts.length - 1; index += 1) folders.add(parts.slice(0, index + 1).join('/'))
  })
  return [
    ...Array.from(folders, (path) => ({ type: 'folder' as const, path, name: baseName(path), depth: path.split('/').length - 1 })),
    ...files.map((local) => ({ type: 'file' as const, path: local.path, name: baseName(local.path), depth: local.path.split('/').length - 1, local })),
  ]
    .sort((left, right) => left.path.localeCompare(right.path) || (left.type === 'folder' ? -1 : 1))
    .filter((row) => !Array.from(collapsedFolders).some((folder) => row.path !== folder && row.path.startsWith(`${folder}/`)))
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
type LocalRepositoryHistoryState = Omit<RepositoryHistoryState, 'commits'> & { commits: DesktopLocalGitCommit[] }
type RepositoryGraphState = {
  branches: GitHubBranch[]
  commits: GitHubRepositoryCommit[]
  loading: boolean
  error: string
}
type GitHubBusyAction = 'bind' | 'open-file' | 'load-repository' | 'save' | 'move' | 'delete' | 'sync' | 'discard' | 'refresh' | 'open-history-file' | 'switch-branch' | 'open-commit'

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

type IconName = 'bot' | 'branch' | 'check' | 'chevron-down' | 'chevron-left' | 'chevron-right' | 'clock' | 'collapse' | 'download' | 'expand' | 'focus' | 'folder' | 'github' | 'globe' | 'help' | 'link' | 'map' | 'menu' | 'moon' | 'more' | 'plus' | 'refresh' | 'settings' | 'sun' | 'sync' | 'tabs' | 'undo' | 'warning' | 'window-minimize' | 'window-maximize' | 'window-restore' | 'x'

const iconPaths: Record<IconName, React.ReactNode> = {
  bot: <><rect x="4" y="7" width="16" height="12" rx="3"/><path d="M12 3v4M9 12h.01M15 12h.01M8 16c2 1.3 6 1.3 8 0"/></>,
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
  globe: <><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.4 2.5 3.5 5.5 3.5 9s-1.1 6.5-3.5 9c-2.4-2.5-3.5-5.5-3.5-9S9.6 5.5 12 3Z"/></>,
  help: <><circle cx="12" cy="12" r="9"/><path d="M9.8 9a2.3 2.3 0 1 1 3.4 2c-.8.5-1.2 1-1.2 2"/><path d="M12 17h.01"/></>,
  link: <><path d="M10 13a5 5 0 0 0 7.1.1l2-2A5 5 0 0 0 12 4l-1.1 1.1"/><path d="M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1"/></>,
  map: <><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3Z"/><path d="M9 3v15m6-12v15"/></>,
  menu: <path d="M4 7h16M4 12h16M4 17h16"/>,
  moon: <path d="M20 15.2A8 8 0 1 1 8.8 4 6.5 6.5 0 0 0 20 15.2Z"/>,
  more: <><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>,
  plus: <path d="M12 5v14M5 12h14"/>,
  refresh: <><path d="M20 7v5h-5"/><path d="M18.2 16.5A8 8 0 1 1 19.8 9L20 12"/></>,
  settings: <><path d="M4 7h10m4 0h2M4 12h3m4 0h9M4 17h8m4 0h4"/><circle cx="16" cy="7" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="14" cy="17" r="2"/></>,
  sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/></>,
  sync: <><path d="m8 15 4-4 4 4m-4-4v9"/><path d="M7 18H5.8A3.8 3.8 0 0 1 5 10.5 7 7 0 0 1 18.5 9a4.5 4.5 0 0 1 .5 8.9"/></>,
  tabs: <><rect x="7" y="4" width="13" height="15" rx="2"/><path d="M4 8v10a2 2 0 0 0 2 2h10"/></>,
  undo: <><path d="M9 7 4 12l5 5"/><path d="M5 12h8a6 6 0 0 1 6 6v1"/></>,
  warning: <><path d="M10.3 3.7 2.5 17.2A2 2 0 0 0 4.2 20h15.6a2 2 0 0 0 1.7-2.8L13.7 3.7a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4m0 3h.01"/></>,
  'window-minimize': <path d="M5 18h14"/>,
  'window-maximize': <rect x="5" y="5" width="14" height="14" rx="1"/>,
  'window-restore': <><path d="M8 8h11v11H8z"/><path d="M5 16H4V5h11v1"/></>,
  x: <path d="m6 6 12 12M18 6 6 18"/>,
}

function Icon({ name, className }: { name: IconName; className?: string }) {
  return <svg className={className} aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{iconPaths[name]}</svg>
}

function loadDocument(locale: Locale) {
  return locale === 'en-US' ? guideEnglish : guideChinese
}

interface DocumentTab {
  id: string
  sourceKey: string
  name: string
  content: string
  repositoryPath: string | null
  localRepositoryId: string | null
  localPath: string | null
  savedContent: string | null
  desktopFileId: string | null
  desktopPath: string | null
}

type DocumentTabPersistence = Pick<DocumentTab, 'savedContent' | 'desktopFileId' | 'desktopPath'>

let documentTabSequence = 0

function createDocumentTab(name: string, content: string, sourceKey?: string, repositoryPath: string | null = null, localRepositoryId: string | null = null, localPath: string | null = null, persistence: Partial<DocumentTabPersistence> = {}): DocumentTab {
  documentTabSequence += 1
  return {
    id: `document-${Date.now().toString(36)}-${documentTabSequence.toString(36)}`,
    sourceKey: sourceKey || `document:${Date.now()}:${documentTabSequence}`,
    name,
    content,
    repositoryPath,
    localRepositoryId,
    localPath,
    savedContent: 'savedContent' in persistence ? persistence.savedContent ?? null : content,
    desktopFileId: persistence.desktopFileId ?? null,
    desktopPath: persistence.desktopPath ?? null,
  }
}

function tabHasUnsavedChanges(tab: DocumentTab) {
  if (tab.repositoryPath) return false
  return tab.savedContent === null || tab.content !== tab.savedContent
}

function loadSettings(): AppSettings {
  try {
    const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') as Partial<AppSettings> & { previewFont?: string }
    const legacyFonts: Record<string, PreviewFont> = { serif: 'notoSerif' }
    const requestedFont = stored.previewFont ? legacyFonts[stored.previewFont] || stored.previewFont : defaultSettings.previewFont
    const previewFont = requestedFont in previewFonts ? requestedFont as PreviewFont : defaultSettings.previewFont
    const previewBackgroundColor = typeof stored.previewBackgroundColor === 'string' && /^#[\da-f]{6}$/i.test(stored.previewBackgroundColor)
      ? stored.previewBackgroundColor
      : defaultSettings.previewBackgroundColor
    return { ...defaultSettings, ...stored, previewFont, previewBackgroundColor }
  } catch {
    return defaultSettings
  }
}

const systemThemeBackgrounds = new Set(['#fafafa', '#15181d'])

function loadInitialSettings() {
  const settings = loadSettings()
  const desktop = desktopApi()
  if (!desktop || !window.matchMedia) return settings
  const storedBackground = settings.previewBackgroundColor.toLowerCase()
  if (!systemThemeBackgrounds.has(storedBackground)) return settings
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  return { ...settings, previewBackgroundColor: systemDark ? '#15181d' : '#fafafa' }
}

const previewLightText = '#f4f6f9'
const previewDarkText = '#30333a'
const defaultLinkColor = '#0097e6'

function colorChannels(color: string) {
  const value = color.trim()
  const hex = value.match(/^#([\da-f]{3}|[\da-f]{6})$/i)
  if (hex) {
    const digits = hex[1].length === 3 ? hex[1].split('').map((channel) => `${channel}${channel}`).join('') : hex[1]
    return [0, 2, 4].map((start) => Number.parseInt(digits.slice(start, start + 2), 16) / 255)
  }
  const rgb = value.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i)
  if (rgb) return rgb.slice(1, 4).map((channel) => Math.min(255, Number(channel)) / 255)
  return null
}

function colorLuminance(color: string) {
  const channels = colorChannels(color)
  if (!channels) return 1
  const linear = channels.map((channel) => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4)
  return linear[0] * .2126 + linear[1] * .7152 + linear[2] * .0722
}

function rgbToHsl(color: string) {
  const channels = colorChannels(color)
  if (!channels) return null
  const [red, green, blue] = channels
  const max = Math.max(red, green, blue)
  const min = Math.min(red, green, blue)
  const lightness = (max + min) / 2
  const distance = max - min
  if (!distance) return { hue: 0, saturation: 0, lightness }
  const saturation = lightness > .5 ? distance / (2 - max - min) : distance / (max + min)
  let hue = 0
  if (max === red) hue = ((green - blue) / distance + (green < blue ? 6 : 0)) / 6
  else if (max === green) hue = ((blue - red) / distance + 2) / 6
  else hue = ((red - green) / distance + 4) / 6
  return { hue: hue * 360, saturation, lightness }
}

function hslToHex(hue: number, saturation: number, lightness: number) {
  const normalizedHue = ((hue % 360) + 360) % 360 / 360
  const hueToRgb = (p: number, q: number, t: number) => {
    let value = t
    if (value < 0) value += 1
    if (value > 1) value -= 1
    if (value < 1 / 6) return p + (q - p) * 6 * value
    if (value < 1 / 2) return q
    if (value < 2 / 3) return p + (q - p) * (2 / 3 - value) * 6
    return p
  }
  if (saturation === 0) {
    const channel = Math.round(lightness * 255).toString(16).padStart(2, '0')
    return `#${channel}${channel}${channel}`
  }
  const q = lightness < .5 ? lightness * (1 + saturation) : lightness + saturation - lightness * saturation
  const p = 2 * lightness - q
  const channels = [hueToRgb(p, q, normalizedHue + 1 / 3), hueToRgb(p, q, normalizedHue), hueToRgb(p, q, normalizedHue - 1 / 3)]
  return `#${channels.map((channel) => Math.round(channel * 255).toString(16).padStart(2, '0')).join('')}`
}

function contrastRatio(first: number, second: number) {
  const lighter = Math.max(first, second)
  const darker = Math.min(first, second)
  return (lighter + .05) / (darker + .05)
}

function shouldUseDarkTheme(backgroundColor: string) {
  const backgroundLuminance = colorLuminance(backgroundColor)
  return contrastRatio(backgroundLuminance, colorLuminance(previewLightText)) >= contrastRatio(backgroundLuminance, colorLuminance(previewDarkText))
}

function accessibleLinkColor(backgroundColor: string, baseColor = defaultLinkColor) {
  const backgroundLuminance = colorLuminance(backgroundColor)
  const baseLuminance = colorLuminance(baseColor)
  if (contrastRatio(backgroundLuminance, baseLuminance) >= 4.5) return baseColor
  const hsl = rgbToHsl(baseColor)
  if (!hsl) return baseColor
  const darken = backgroundLuminance > baseLuminance
  const lightnessStep = .005
  const saturationStep = .02
  for (let saturation = hsl.saturation; saturation >= -.001; saturation -= saturationStep) {
    for (let index = 1; index <= 200; index += 1) {
      const lightness = hsl.lightness + (darken ? -index : index) * lightnessStep
      if (lightness < 0 || lightness > 1) break
      const candidate = hslToHex(hsl.hue, Math.max(0, saturation), lightness)
      if (contrastRatio(backgroundLuminance, colorLuminance(candidate)) >= 4.5) return candidate
    }
  }
  return darken ? '#000000' : '#ffffff'
}

function mixHexColors(first: string, second: string, amount: number) {
  const firstChannels = colorChannels(first)
  const secondChannels = colorChannels(second)
  if (!firstChannels || !secondChannels) return first
  const channels = [0, 2, 4].map((start) => {
    const firstChannel = firstChannels[start / 2] * 255
    const secondChannel = secondChannels[start / 2] * 255
    return Math.round(firstChannel + (secondChannel - firstChannel) * amount)
  })
  return `#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`
}

function codeBackgroundColor(backgroundColor: string, darkMode: boolean) {
  return mixHexColors(backgroundColor, darkMode ? '#ffffff' : '#000000', darkMode ? .16 : .06)
}

function extractCssColor(value: string | undefined) {
  if (!value) return undefined
  return value.match(/#[\da-f]{3,8}|rgba?\([^)]*\)|\b(?:transparent|white|black)\b/i)?.[0]
}

function readUserPreviewBackground(style: string) {
  const rule = style.match(new RegExp(`[^{}]*#${MARKMAP_PREVIEW_ID}[^{}]*\\{([^{}]*)\\}`, 'i'))?.[1]
  if (!rule) return undefined
  return extractCssColor(cssDeclaration(rule, 'background-color') || cssDeclaration(rule, 'background'))
}

export default function MarkmapHooks() {
  const { locale, toggleLocale, t } = useI18n()
  const desktopWorkspaceSessionRef = useRef(loadDesktopWorkspaceSession())
  const initialSettingsRef = useRef(loadInitialSettings())
  const [documentTabs, setDocumentTabs] = useState<DocumentTab[]>(() => [createDocumentTab(locale === 'en-US' ? 'markmap++ guide.md' : 'markmap++ 操作指南.md', loadDocument(locale), 'starter')])
  const [activeTabId, setActiveTabId] = useState(() => documentTabs[0].id)
  const [pendingCloseTabId, setPendingCloseTabId] = useState<string | null>(null)
  const [pendingCloseBusy, setPendingCloseBusy] = useState(false)
  const [pendingCloseError, setPendingCloseError] = useState('')
  const [windowClosePending, setWindowClosePending] = useState(false)
  const [mobileTabsOpen, setMobileTabsOpen] = useState(false)
  const documentTabsRef = useRef(documentTabs)
  const [markdown, setMarkdown] = useState(() => documentTabs[0].content)
  const [renderedMarkdown, setRenderedMarkdown] = useState(markdown)
  const [fileName, setFileName] = useState(() => documentTabs[0].name)
  const activeDocumentTab = documentTabs.find((tab) => tab.id === activeTabId) || documentTabs[0]
  const [mobilePane, setMobilePane] = useState<Pane>('editor')
  const [editorView, setEditorView] = useState<EditorView>(() => desktopWorkspaceSessionRef.current?.editorView || 'markdown')
  const [saveState, setSaveState] = useState<'saved' | 'saving'>('saved')
  const [settings, setSettings] = useState(() => initialSettingsRef.current)
  const [dark, setDark] = useState(() => shouldUseDarkTheme(initialSettingsRef.current.previewBackgroundColor))
  const nativeThemeSyncSkippedRef = useRef(false)
  const nativeThemeSystemUpdateRef = useRef(false)
  const [activePanel, setActivePanel] = useState<Panel>(null)
  const [helpTipIndex, setHelpTipIndex] = useState(0)
  const [editorWidth, setEditorWidth] = useState(38)
  const [editorCollapsed, setEditorCollapsed] = useState(false)
  const [canUndo, setCanUndo] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [desktopPlatform, setDesktopPlatform] = useState<string | null>(null)
  const [desktopWindowMaximized, setDesktopWindowMaximized] = useState(false)
  const [actionMenuOpen, setActionMenuOpen] = useState(false)
  const [desktopMenuOpen, setDesktopMenuOpen] = useState(false)
  const [desktopMenuSection, setDesktopMenuSection] = useState<'file' | 'edit' | 'view' | 'help'>('file')
  const [exportFormat, setExportFormat] = useState<ExportFormat>('png')
  const [exportScale, setExportScale] = useState(2)
  const [exportTransparentBackground, setExportTransparentBackground] = useState(false)
  const [exportTextTheme, setExportTextTheme] = useState<ExportTextTheme>('auto')
  const [exportTab, setExportTab] = useState<'file' | 'repository'>('file')
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState('')
  const [showDiagnostics, setShowDiagnostics] = useState(false)
  const [githubConfig, setGithubConfig] = useState<GitHubConfig | null>(loadGitHubConfig)
  const [githubProfiles, setGithubProfiles] = useState<GitHubRepositoryProfile[]>([])
  const [addingRemoteRepository, setAddingRemoteRepository] = useState(false)
  const [repositorySettingsTab, setRepositorySettingsTab] = useState<'remote' | 'local'>('remote')
  const [repositorySource, setRepositorySource] = useState<'remote' | 'local'>(() => desktopWorkspaceSessionRef.current?.repositorySource || 'remote')
  const [repositoryInput, setRepositoryInput] = useState(() => { const config = loadGitHubConfig(); return config ? `${config.owner}/${config.repo}` : '' })
  const [branchInput, setBranchInput] = useState(() => loadGitHubConfig()?.branch || 'main')
  const [tokenInput, setTokenInput] = useState(() => loadGitHubConfig()?.token || '')
  const [remoteFiles, setRemoteFiles] = useState<RemoteMarkdownFile[]>([])
  const [cachedFiles, setCachedFiles] = useState<CachedMarkdownFile[]>([])
  // Agent 自动应用后可能在 React 下一次渲染前立即请求提交；ref 保证提交读取到刚写入的实时文件集合。
  const cachedFilesRef = useRef<CachedMarkdownFile[]>([])
  const remoteCacheRevisionRef = useRef(new Map<string, number>())
  const remoteCacheQueueRef = useRef(new Map<string, Promise<void>>())
  const [remoteHead, setRemoteHead] = useState('')
  const [repositoryCommitRef, setRepositoryCommitRef] = useState<string | null>(null)
  const [repositoryGraph, setRepositoryGraph] = useState<RepositoryGraphState | null>(null)
  const [repositoryGraphBranchesOpen, setRepositoryGraphBranchesOpen] = useState(false)
  const [activeRepoPath, setActiveRepoPath] = useState<string | null>(null)
  const [activeLocalFile, setActiveLocalFile] = useState<{ repositoryId: string; path: string } | null>(null)
  const [localGitState, setLocalGitState] = useState<DesktopLocalGitState>({ activeId: null, repositories: [] })
  const [localGitLoaded, setLocalGitLoaded] = useState(false)
  const [localAgentContext, setLocalAgentContext] = useState<{ repositoryId: string | null; files: AgentSourceFile[] }>({ repositoryId: null, files: [] })
  const [localGitBusy, setLocalGitBusy] = useState(false)
  const [localGitActivity, setLocalGitActivity] = useState<'refresh' | 'sync' | 'commit' | 'push' | 'move' | 'remove' | 'discard' | 'graph' | 'switch' | null>(null)
  const [localGitError, setLocalGitError] = useState('')
  const [localGitNotice, setLocalGitNotice] = useState('')
  const [githubBusyAction, setGithubBusyAction] = useState<GitHubBusyAction | null>(null)
  const githubBusy = githubBusyAction !== null
  const [githubError, setGithubError] = useState('')
  const [githubNotice, setGithubNotice] = useState('')
  const [virtualFolders, setVirtualFolders] = useState<string[]>([])
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(() => new Set())
  const [localCollapsedFolders, setLocalCollapsedFolders] = useState<Set<string>>(() => new Set())
  const [repositorySaveCollapsedFolders, setRepositorySaveCollapsedFolders] = useState<Set<string>>(() => new Set())
  const [repositoryClipboard, setRepositoryClipboard] = useState<RepositoryClipboard | null>(null)
  const [localRepositoryClipboard, setLocalRepositoryClipboard] = useState<RepositoryClipboard | null>(null)
  const [repositoryMenu, setRepositoryMenu] = useState<{ x: number; y: number; target: RepositoryTarget } | null>(null)
  const [localRepositoryMenu, setLocalRepositoryMenu] = useState<{ x: number; y: number; target: RepositoryTarget } | null>(null)
  const [localRepositoryGraph, setLocalRepositoryGraph] = useState<(DesktopLocalGitGraph & { loading: boolean; error: string }) | null>(null)
  const [localRepositoryGraphBranchesOpen, setLocalRepositoryGraphBranchesOpen] = useState(false)
  const [localRepositoryHistory, setLocalRepositoryHistory] = useState<LocalRepositoryHistoryState | null>(null)
  const [repositoryHistory, setRepositoryHistory] = useState<RepositoryHistoryState | null>(null)
  const [repositoryLoadingPath, setRepositoryLoadingPath] = useState<string | null>(null)
  const [repositorySaveMode, setRepositorySaveMode] = useState(false)
  const [repositorySaveFolder, setRepositorySaveFolder] = useState('')
  const [repositorySaveName, setRepositorySaveName] = useState('')
  const [repositoryNewFolderParent, setRepositoryNewFolderParent] = useState<string | null>(null)
  const [repositoryNewFolderName, setRepositoryNewFolderName] = useState('')
  const [draggedRepositoryTarget, setDraggedRepositoryTarget] = useState<RepositoryTarget | null>(null)
  const [draggedLocalRepositoryTarget, setDraggedLocalRepositoryTarget] = useState<RepositoryTarget | null>(null)
  const [repositoryDropFolder, setRepositoryDropFolder] = useState<string | null>(null)
  const [localRepositoryDropFolder, setLocalRepositoryDropFolder] = useState<string | null>(null)
  const [repositoryTouchDrag, setRepositoryTouchDrag] = useState<{ target: RepositoryTarget; dropFolder: string | null; dragging: boolean; x: number; y: number } | null>(null)
  const [renamingRepositoryTarget, setRenamingRepositoryTarget] = useState<RepositoryTarget | null>(null)
  const [repositoryRenameValue, setRepositoryRenameValue] = useState('')
  const [renamingLocalRepositoryTarget, setRenamingLocalRepositoryTarget] = useState<RepositoryTarget | null>(null)
  const [localRepositoryRenameValue, setLocalRepositoryRenameValue] = useState('')
  const [selectionMenu, setSelectionMenu] = useState<TextSelectionTarget | null>(null)
  const [linkPickerSelection, setLinkPickerSelection] = useState<TextSelectionTarget | null>(null)
  const [linkNotice, setLinkNotice] = useState('')
  const [pendingRepositoryNavigation, setPendingRepositoryNavigation] = useState<PendingRepositoryNavigation | null>(null)
  useEffect(() => {
    const nextName = locale === 'en-US' ? 'markmap++ guide.md' : 'markmap++ 操作指南.md'
    const nextContent = loadDocument(locale)
    const previousContent = loadDocument(locale === 'en-US' ? 'zh-CN' : 'en-US')
    const current = documentTabsRef.current.find((tab) => tab.id === activeTabId)
    if (!current || current.sourceKey !== 'starter' || (current.content !== previousContent && markdown !== previousContent)) return
    setDocumentTabs((tabs) => tabs.map((tab) => tab.id === current.id ? { ...tab, name: nextName, content: nextContent } : tab))
    setMarkdown(nextContent)
    setRenderedMarkdown(nextContent)
    setFileName(nextName)
  }, [activeTabId, documentTabsRef, locale, markdown])
  const initialMarkdownRef = useRef(markdown)
  const markdownEditorRef = useRef<MarkdownEditorHandle | null>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const mmRef = useRef<Markmap | null>(null)
  const previewNativeContextMenuOnceRef = useRef(false)
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
  const desktopMenuRef = useRef<HTMLDivElement | null>(null)
  const workspaceRef = useRef<HTMLElement | null>(null)
  const settingsPanelRef = useRef<HTMLElement | null>(null)
  const panelReturnFocusRef = useRef<HTMLElement | null>(null)
  const resizeWidthRef = useRef(editorWidth)
  const markdownRef = useRef(markdown)
  const localAutosaveRevisionRef = useRef(new Map<string, number>())
  const localAutosaveQueueRef = useRef(new Map<string, Promise<void>>())
  const localAutosaveTimersRef = useRef(new Map<string, number>())
  const historyRef = useRef<string[]>([])
  const lastEditRef = useRef({ source: '', time: 0 })
  const helpTouchStartRef = useRef<{ x: number; y: number } | null>(null)
  const desktopWorkspaceRestoredRef = useRef(!desktopWorkspaceSessionRef.current)

  useEffect(() => () => {
    const gesture = repositoryTouchGestureRef.current
    if (!gesture) return
    window.clearTimeout(gesture.timer)
    gesture.element.draggable = gesture.originalDraggable
  }, [])

  useEffect(() => () => {
    localAutosaveTimersRef.current.forEach((timer) => window.clearTimeout(timer))
    localAutosaveTimersRef.current.clear()
  }, [])

  useEffect(() => { cachedFilesRef.current = cachedFiles }, [cachedFiles])

  useEffect(() => {
    let disposed = false
    void Promise.all([loadStoredGitHubConfig(), loadStoredGitHubProfiles()]).then(([config, profiles]) => {
      if (disposed) return
      setGithubProfiles(profiles)
      if (!config) return
      setGithubConfig(config)
      setGithubProfiles(profiles.length ? profiles : [{ id: repositoryProfileId(config), config, updatedAt: Date.now() }])
      setRepositoryInput(`${config.owner}/${config.repo}`)
      setBranchInput(config.branch)
      setTokenInput(config.token)
    }).catch(() => { if (!disposed) setGithubError('无法读取本地 GitHub 配置') })
    return () => { disposed = true }
  }, [])

  useEffect(() => {
    const desktop = desktopApi()
    if (!desktop) return
    let disposed = false
    void desktop.localGit.get()
      .then((state) => { if (!disposed) setLocalGitState(state) })
      .catch((error) => { if (!disposed) setLocalGitError(error instanceof Error ? error.message : '无法读取本地 Git 仓库') })
      .finally(() => { if (!disposed) setLocalGitLoaded(true) })
    return () => { disposed = true }
  }, [])

  useEffect(() => {
    const desktop = desktopApi()
    const repositoryId = localGitState.activeId
    if (!desktop || repositorySource !== 'local' || !repositoryId) return
    let disposed = false
    const checkRemote = async () => {
      try {
        const repository = await desktop.localGit.refresh(repositoryId)
        if (!disposed) setLocalGitState((current) => ({ ...current, repositories: current.repositories.map((item) => item.id === repository.id ? repository : item) }))
      } catch {
        // 后台检查不打断编辑；手动刷新仍会显示完整错误。
      }
    }
    void checkRemote()
    const timer = window.setInterval(checkRemote, 60_000)
    return () => { disposed = true; window.clearInterval(timer) }
  }, [localGitState.activeId, repositorySource])

  useEffect(() => {
    const desktop = desktopApi()
    const repositoryId = localGitState.activeId
    if (!desktop || repositorySource !== 'local' || !repositoryId) return
    let disposed = false
    let inspecting = false
    let pending = false
    const inspect = async () => {
      if (inspecting) { pending = true; return }
      inspecting = true
      try {
        const repository = await desktop.localGit.inspect(repositoryId)
        if (!disposed) setLocalGitState((current) => ({ ...current, repositories: current.repositories.map((item) => item.id === repository.id ? repository : item) }))
      } catch {
        // 文件监听是后台状态同步；手动刷新仍负责向用户展示错误。
      } finally {
        inspecting = false
        if (pending && !disposed) { pending = false; void inspect() }
      }
    }
    const unsubscribe = desktop.localGit.onChanged((changedId) => { if (changedId === repositoryId) void inspect() })
    void desktop.localGit.watch(repositoryId).catch(() => {})
    return () => {
      disposed = true
      unsubscribe()
      void desktop.localGit.watch(null).catch(() => {})
    }
  }, [localGitState.activeId, repositorySource])

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
  const repositoryPaths = useMemo(() => Array.from(new Set([
    ...remoteFiles.map((file) => file.path),
    ...cachedFiles.filter((file) => file.status !== 'deleted').map((file) => file.path),
  ])).sort((first, second) => first.localeCompare(second)), [cachedFiles, remoteFiles])
  const repositoryIndexes = useMemo(() => cachedFiles
    .filter((file) => file.status !== 'deleted')
    .map((file) => indexRepositoryNote(file.path, file.path === activeRepoPath ? markdown : file.content)), [activeRepoPath, cachedFiles, markdown])
  const repositoryIndexByPath = useMemo(() => new Map(repositoryIndexes.map((index) => [index.path, index])), [repositoryIndexes])
  const activeRepositoryIndex = activeRepoPath ? repositoryIndexByPath.get(activeRepoPath) : undefined
  const backlinks = useMemo<BacklinkEntry[]>(() => activeRepoPath ? repositoryIndexes.flatMap((index) => index.path !== activeRepoPath ? index.links.flatMap((link) => link.resolution.kind === 'internal' && link.resolution.path === activeRepoPath
    ? [{ sourcePath: index.path, line: link.line, label: link.label }]
    : []) : []) : [], [activeRepoPath, repositoryIndexes])
  const outgoingLinks = useMemo<OutgoingLinkEntry[]>(() => {
    const entries: OutgoingLinkEntry[] = []
    for (const link of activeRepositoryIndex?.links || []) {
      if (link.resolution.kind === 'external') continue
      if (link.resolution.kind === 'invalid') { entries.push({ label: link.label, href: link.href, line: link.line, broken: true, reason: link.resolution.reason }); continue }
      const targetIndex = repositoryIndexByPath.get(link.resolution.path)
      const missingPath = !repositoryPaths.includes(link.resolution.path)
      const missingHeading = Boolean(link.resolution.fragment && targetIndex && !resolveHeading(targetIndex, link.resolution.fragment))
      entries.push({ label: link.label, href: link.href, line: link.line, targetPath: link.resolution.path, broken: missingPath || missingHeading, reason: missingPath ? '目标笔记不存在' : missingHeading ? '目标标题不存在' : undefined })
    }
    return entries
  }, [activeRepositoryIndex, repositoryIndexByPath, repositoryPaths])
  const documentRenderConfig = useMemo(() => buildDocumentRenderConfig(renderedMarkdown), [renderedMarkdown])
  const codeFont = documentRenderConfig.font
  const selectedFontFamily = previewFonts[settings.previewFont].family
  const effectiveFontFamily = resolveFontFamily(codeFont.family, selectedFontFamily)
  const effectiveFontSizeCss = codeFont.size || `${settings.previewFontSize}px`
  const effectiveFontWeightCss = codeFont.weight || String(settings.previewWeight)
  const effectiveColorFreezeLevel = documentRenderConfig.colorFreezeLevel ?? settings.colorFreezeLevel
  const effectiveShowGrid = documentRenderConfig.showGrid ?? settings.showGrid
  const userPreviewBackground = readUserPreviewBackground(documentRenderConfig.style)
  const previewBackgroundColor = userPreviewBackground || settings.previewBackgroundColor
  const previewDarkMode = userPreviewBackground ? shouldUseDarkTheme(previewBackgroundColor) : dark
  const previewCodeBackground = codeBackgroundColor(previewBackgroundColor, previewDarkMode)
  const previewLinkColor = cssDeclaration(documentRenderConfig.style, '--markmap-a-color') || accessibleLinkColor(previewBackgroundColor)
  const exportAutoDarkMode = shouldUseDarkTheme(previewBackgroundColor)
  const exportDarkMode = exportTextTheme === 'auto' ? exportAutoDarkMode : exportTextTheme === 'dark'
  const exportUsesTransparentBackground = exportFormat === 'png' && exportTransparentBackground
  const effectiveMarkmapOptions = useMemo<Partial<IMarkmapOptions>>(() => deriveOptions({
    ...documentRenderConfig.jsonOptions,
    colorFreezeLevel: effectiveColorFreezeLevel,
  }), [documentRenderConfig.jsonOptions, effectiveColorFreezeLevel])
  const fontPreviewStyle: React.CSSProperties = codeFont.shorthand
    ? { font: codeFont.shorthand }
    : { fontFamily: effectiveFontFamily, fontSize: effectiveFontSizeCss, fontWeight: effectiveFontWeightCss }
  const updateSettings = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => setSettings((current) => ({ ...current, [key]: value }))
  const updatePreviewBackground = (color: string) => {
    updateSettings('previewBackgroundColor', color)
    setDark(shouldUseDarkTheme(color))
  }
  const resetSettings = () => {
    setSettings({ ...defaultSettings })
    setDark(shouldUseDarkTheme(defaultSettings.previewBackgroundColor))
  }
  const openHelpPanel = () => { setHelpTipIndex(0); setActivePanel('help') }
  const moveHelpTip = (direction: number) => setHelpTipIndex((current) => (current + direction + HELP_TIP_COUNT) % HELP_TIP_COUNT)
  const startHelpSwipe = (event: React.TouchEvent<HTMLElement>) => {
    const touch = event.touches[0]
    if (touch) helpTouchStartRef.current = { x: touch.clientX, y: touch.clientY }
  }
  const endHelpSwipe = (event: React.TouchEvent<HTMLElement>) => {
    const start = helpTouchStartRef.current
    helpTouchStartRef.current = null
    const touch = event.changedTouches[0]
    if (!start || !touch) return
    const deltaX = touch.clientX - start.x
    const deltaY = touch.clientY - start.y
    if (Math.abs(deltaX) < 42 || Math.abs(deltaX) < Math.abs(deltaY)) return
    moveHelpTip(deltaX < 0 ? 1 : -1)
  }

  const displayDocumentTab = useCallback((tab: DocumentTab) => {
    historyRef.current = []
    lastEditRef.current = { source: '', time: 0 }
    markdownRef.current = tab.content
    setCanUndo(false)
    setMarkdown(tab.content)
    setRenderedMarkdown(tab.content)
    setFileName(tab.name)
    setActiveRepoPath(tab.repositoryPath)
    setActiveLocalFile(tab.localRepositoryId && tab.localPath ? { repositoryId: tab.localRepositoryId, path: tab.localPath } : null)
    setSaveState('saved')
    setMobileTabsOpen(false)
    window.setTimeout(() => mmRef.current?.fit(), 60)
  }, [])

  const displayNoOpenDocument = useCallback(() => {
    historyRef.current = []
    lastEditRef.current = { source: '', time: 0 }
    markdownRef.current = ''
    setMarkdown('')
    setRenderedMarkdown('')
    setFileName('')
    setActiveRepoPath(null)
    setActiveLocalFile(null)
    setCanUndo(false)
    setSaveState('saved')
    setMobileTabsOpen(false)
  }, [])

  const persistActiveDocumentTab = useCallback(() => {
    const nextTabs = documentTabsRef.current.map((tab) => tab.id === activeTabId
      ? { ...tab, name: fileName, content: markdownRef.current, repositoryPath: activeRepoPath, localRepositoryId: activeLocalFile?.repositoryId || null, localPath: activeLocalFile?.path || null }
      : tab)
    documentTabsRef.current = nextTabs
    setDocumentTabs(nextTabs)
    return nextTabs
  }, [activeLocalFile, activeRepoPath, activeTabId, fileName])

  const markActiveDocumentSaved = useCallback((content: string) => {
    const nextTabs = documentTabsRef.current.map((tab) => tab.id === activeTabId ? { ...tab, content, savedContent: content } : tab)
    documentTabsRef.current = nextTabs
    setDocumentTabs(nextTabs)
  }, [activeTabId])

  const markDocumentSaved = useCallback((tabId: string, content: string) => {
    const nextTabs = documentTabsRef.current.map((tab) => tab.id === tabId ? { ...tab, content, savedContent: content } : tab)
    documentTabsRef.current = nextTabs
    setDocumentTabs(nextTabs)
  }, [])

  const openDocumentTab = useCallback((name: string, content: string, sourceKey?: string, repositoryPath: string | null = null, localRepositoryId: string | null = null, localPath: string | null = null, persistence: Partial<DocumentTabPersistence> = {}) => {
    const savedTabs = persistActiveDocumentTab()
    const existing = sourceKey ? savedTabs.find((tab) => tab.sourceKey === sourceKey) : undefined
    const tab = existing
      ? { ...existing, name, content, repositoryPath, localRepositoryId, localPath, ...persistence }
      : createDocumentTab(name, content, sourceKey, repositoryPath, localRepositoryId, localPath, persistence)
    const nextTabs = existing ? savedTabs.map((item) => item.id === tab.id ? tab : item) : [...savedTabs, tab]
    documentTabsRef.current = nextTabs
    setDocumentTabs(nextTabs)
    setActiveTabId(tab.id)
    displayDocumentTab(tab)
  }, [displayDocumentTab, persistActiveDocumentTab])

  const activateDocumentTab = useCallback((tabId: string) => {
    if (tabId === activeTabId) { setMobileTabsOpen(false); return }
    const savedTabs = persistActiveDocumentTab()
    const tab = savedTabs.find((item) => item.id === tabId)
    if (!tab) return
    setActiveTabId(tab.id)
    displayDocumentTab(tab)
  }, [activeTabId, displayDocumentTab, persistActiveDocumentTab])

  const closeDocumentTab = useCallback((tabId: string, discardUnsaved = false) => {
    const savedTabs = persistActiveDocumentTab()
    const closingIndex = savedTabs.findIndex((tab) => tab.id === tabId)
    if (closingIndex < 0) return
    const nextTabs = savedTabs.filter((tab) => tab.id !== tabId)
    const closing = savedTabs[closingIndex]
    if (closing && tabHasUnsavedChanges(closing) && !discardUnsaved) {
      if (closing.localRepositoryId && closing.localPath) {
        const desktop = desktopApi()
        if (desktop) {
          setLocalGitBusy(true)
          void desktop.localGit.write(closing.localRepositoryId, closing.localPath, closing.content).then((result) => {
            setLocalGitState((current) => ({ ...current, repositories: current.repositories.map((item) => item.id === result.repository.id ? result.repository : item) }))
            markDocumentSaved(closing.id, closing.content)
            closeDocumentTab(closing.id, true)
          }).catch((error) => setLocalGitError(error instanceof Error ? error.message : '自动保存本地 Markdown 失败')).finally(() => setLocalGitBusy(false))
          return
        }
      }
      setPendingCloseTabId(tabId)
      setPendingCloseError('')
      return
    }
    documentTabsRef.current = nextTabs
    setDocumentTabs(nextTabs)
    if (tabId !== activeTabId) return
    if (!nextTabs.length) {
      setActiveTabId('')
      displayNoOpenDocument()
      return
    }
    const nextTab = nextTabs[Math.min(closingIndex, nextTabs.length - 1)]
    setActiveTabId(nextTab.id)
    displayDocumentTab(nextTab)
  }, [activeTabId, displayDocumentTab, displayNoOpenDocument, markDocumentSaved, persistActiveDocumentTab])

  const savePendingDocumentAndClose = useCallback(async () => {
    const tab = documentTabsRef.current.find((item) => item.id === pendingCloseTabId)
    if (!tab) { setPendingCloseTabId(null); return }
    setPendingCloseBusy(true); setPendingCloseError('')
    try {
      const desktop = desktopApi()
      if (tab.localRepositoryId && tab.localPath) {
        if (!desktop) throw new Error('请在桌面应用中保存本地 Git 文件')
        const result = await desktop.localGit.write(tab.localRepositoryId, tab.localPath, tab.content)
        setLocalGitState((current) => ({ ...current, repositories: current.repositories.map((item) => item.id === result.repository.id ? result.repository : item) }))
      } else if (tab.desktopFileId) {
        if (!desktop) throw new Error('文件授权已失效，请重新打开')
        await desktop.saveOpenedMarkdown(tab.desktopFileId, tab.content)
      } else {
        const result = await saveBlob(new Blob([tab.content], { type: 'text/markdown;charset=utf-8' }), tab.name)
        if (result.canceled) return
      }
      const nextTabs = documentTabsRef.current.map((item) => item.id === tab.id ? { ...item, savedContent: item.content } : item)
      documentTabsRef.current = nextTabs
      setDocumentTabs(nextTabs)
      setPendingCloseTabId(null)
      closeDocumentTab(tab.id, true)
    } catch (error) { setPendingCloseError(error instanceof Error ? error.message : '保存文件失败') }
    finally { setPendingCloseBusy(false) }
  }, [closeDocumentTab, pendingCloseTabId])

  const createBlankDocumentTab = useCallback(() => {
    openDocumentTab('未命名.md', '# 新思维导图\n\n- 开始输入内容\n', undefined, null, null, null, { savedContent: null })
  }, [openDocumentTab])

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
  const applyOpenedMarkdown = useCallback((name: string, content: string, sourceKey?: string, persistence: Partial<DocumentTabPersistence> = {}) => {
    openDocumentTab(name, content, sourceKey, null, null, null, persistence)
  }, [openDocumentTab])

  useEffect(() => desktopApi()?.onOpenedMarkdown((file) => applyOpenedMarkdown(file.name, file.content, `desktop:${file.id}`, { desktopFileId: file.id, desktopPath: file.path, savedContent: file.content })), [applyOpenedMarkdown])


  const applyAgentChange = useCallback(async (path: string, content: string): Promise<AgentMutationResult> => {
    const current = cachedFilesRef.current
    const file = current.find((item) => item.path === path)
    if (!file) return { ok: false, error: `尚未读取 ${path}，请先将该笔记加载到本地。` }
    const next = {
      ...file,
      content,
      status: (file.status === 'added' ? 'added' : file.originalPath !== file.path ? 'renamed' : content === file.baseContent ? 'clean' : 'modified') as CachedMarkdownFile['status'],
      updatedAt: Date.now(),
    }
    try {
      await putCachedFile(next)
      const updated = current.map((item) => item.id === next.id ? next : item)
      cachedFilesRef.current = updated
      setCachedFiles(updated)
      if (activeRepoPath === path) updateMarkdown(content, 'agent')
      return { ok: true }
    } catch {
      const error = '本地缓存写入失败'
      setGithubError(error)
      return { ok: false, error }
    }
  }, [activeRepoPath, updateMarkdown])

  const createAgentFile = useCallback(async (path: string, content: string): Promise<AgentMutationResult> => {
    if (!githubConfig || !remoteHead) {
      const error = '请先绑定并刷新 GitHub 仓库'
      setGithubError(error)
      return { ok: false, error }
    }
    const occupied = cachedFilesRef.current.some((file) => file.path === path) || remoteFiles.some((file) => file.path === path)
    if (!validRepositoryPath(path) || !/\.md$/i.test(path) || occupied) {
      const error = occupied ? '该笔记文件已存在' : 'AI 提议的文件路径无效'
      setGithubError(error)
      return { ok: false, error }
    }
    const file: CachedMarkdownFile = { id: `${repoKeyOf(githubConfig)}:${path}`, repoKey: repoKeyOf(githubConfig), path, originalPath: path, content, baseContent: '', baseSha: '', baseCommit: remoteHead, status: 'added', updatedAt: Date.now() }
    try {
      await putCachedFile(file)
      const updated = [...cachedFilesRef.current, file].sort((first, second) => first.path.localeCompare(second.path))
      cachedFilesRef.current = updated
      setCachedFiles(updated)
      return { ok: true }
    } catch {
      const error = '本地缓存写入失败'
      setGithubError(error)
      return { ok: false, error }
    }
  }, [githubConfig, remoteFiles, remoteHead])
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
    const repositoryKey = githubConfig ? repoKeyOf(githubConfig) : 'github'
    openDocumentTab(file.path, file.content, `repository:${repositoryKey}:${file.path}`, file.path)
  }, [githubConfig, openDocumentTab])

  useEffect(() => {
    const session = desktopWorkspaceSessionRef.current
    if (desktopWorkspaceRestoredRef.current || session?.repositorySource !== 'remote') return
    if (!session.remotePath) { desktopWorkspaceRestoredRef.current = true; return }
    const file = cachedFiles.find((item) => item.path === session.remotePath && item.status !== 'deleted')
    if (!file) return
    desktopWorkspaceRestoredRef.current = true
    activateCachedFile(file)
  }, [activateCachedFile, cachedFiles])

  const activateHistoricalFile = useCallback((content: string, path: string, commitSha: string) => {
    const repositoryKey = githubConfig ? repoKeyOf(githubConfig) : 'github'
    openDocumentTab(historicalFileName(path, commitSha), content, `history:${repositoryKey}:${commitSha}:${path}`)
  }, [githubConfig, openDocumentTab])

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

  const loadAllRepositoryNotes = useCallback(async () => {
    if (!githubConfig) { setGithubError('请先绑定 GitHub 仓库'); return }
    const existing = new Map(cachedFiles.map((file) => [file.path, file]))
    const pending = remoteFiles.filter((remote) => {
      const file = existing.get(remote.path)
      return !file || (file.status === 'clean' && file.baseSha !== remote.sha)
    })
    if (!pending.length) return
    setGithubBusyAction('load-repository'); setGithubError('')
    try {
      const downloaded: CachedMarkdownFile[] = []
      for (const remote of pending) {
        const file = await downloadMarkdown(githubConfig, remote, remoteHead)
        await putCachedFile(file)
        downloaded.push(file)
      }
      setCachedFiles((current) => [...current.filter((file) => !downloaded.some((item) => item.id === file.id)), ...downloaded].sort((a, b) => a.path.localeCompare(b.path)))
      setGithubNotice(`已读取 ${downloaded.length} 个 Markdown 文件，AI 现在可编辑整个仓库。`)
    } catch (error) {
      setGithubError(error instanceof Error ? error.message : '读取仓库笔记失败')
    } finally { setGithubBusyAction(null) }
  }, [cachedFiles, githubConfig, remoteFiles, remoteHead])

  const getAgentGitContext = useCallback(async (paths: string[]) => {
    if (!githubConfig) return ''
    try {
      const [commits, fileCommits] = await Promise.all([
        listRepositoryCommits(githubConfig),
        paths[0] ? listFileCommits(githubConfig, paths[0]) : Promise.resolve([]),
      ])
      const repositoryHistory = commits.slice(0, 12).map((commit) => `${commit.sha.slice(0, 7)} | ${commit.author} | ${formatCommitDate(commit.date)} | ${commit.message.split('\n')[0]}`).join('\n')
      const fileHistory = fileCommits.slice(0, 12).map((commit) => `${commit.sha.slice(0, 7)} | ${commit.author} | ${formatCommitDate(commit.date)} | ${commit.message.split('\n')[0]}`).join('\n')
      return `当前分支最近提交：\n${repositoryHistory || '无'}${paths[0] ? `\n\n文件 ${paths[0]} 的提交：\n${fileHistory || '无'}` : ''}`
    } catch (error) {
      setGithubError(error instanceof Error ? error.message : '读取 Git 历史失败')
      return ''
    }
  }, [githubConfig])

  const bindRepository = async () => {
    const [owner, repo, extra] = repositoryInput.trim().replace(/^https:\/\/github\.com\//, '').replace(/\.git$/, '').split('/').filter(Boolean)
    if (!owner || !repo || extra) { setGithubError('仓库请填写为 owner/repo 或完整 GitHub 仓库地址'); return }
    if (!tokenInput.trim()) { setGithubError('请输入具有 Contents 读写权限的 GitHub 令牌'); return }
    setGithubBusyAction('bind'); setGithubError(''); setGithubNotice('')
    try {
      const candidate = { owner, repo, branch: branchInput.trim(), token: tokenInput.trim() }
      const verified = await verifyRepository(candidate)
      const config = { ...candidate, branch: verified.branch }
      saveGitHubConfig(config)
      const profile = { id: repositoryProfileId(config), config, updatedAt: Date.now() }
      const nextProfiles = [profile, ...githubProfiles.filter((item) => item.id !== profile.id)]
      setGithubProfiles(nextProfiles)
      await saveStoredGitHubProfiles(nextProfiles)
      setGithubConfig(config)
      setAddingRemoteRepository(false)
      setRepositorySource('remote')
      setBranchInput(config.branch)
      await refreshRepository(config)
      setGithubNotice(`已绑定 ${verified.fullName} · ${config.branch}`)
      setEditorView('repository')
      setActivePanel(null)
    } catch (error) {
      setGithubError(error instanceof Error ? error.message : '绑定仓库失败')
    } finally { setGithubBusyAction(null) }
  }

  const switchRemoteRepository = async (profileId: string, targetView: EditorView = 'repository') => {
    const profile = githubProfiles.find((item) => item.id === profileId)
    if (!profile || repositoryProfileId(githubConfig || profile.config) === profileId) return
    setGithubBusyAction('load-repository'); setGithubError(''); setGithubNotice('')
    try {
      saveGitHubConfig(profile.config)
      setGithubConfig(profile.config)
      setRepositoryInput(`${profile.config.owner}/${profile.config.repo}`)
      setBranchInput(profile.config.branch)
      setTokenInput(profile.config.token)
      setActiveRepoPath(null)
      setRepositoryCommitRef(null)
      await refreshRepository(profile.config)
      setRepositorySource('remote')
      setEditorView(targetView)
      setActivePanel(null)
      setGithubNotice(`已切换到 ${profile.config.owner}/${profile.config.repo}`)
    } catch (error) {
      setGithubError(error instanceof Error ? error.message : '切换远程仓库失败')
    } finally { setGithubBusyAction(null) }
  }

  const removeRemoteRepository = async () => {
    if (!githubConfig) return
    const currentId = repositoryProfileId(githubConfig)
    const nextProfiles = githubProfiles.filter((item) => item.id !== currentId)
    setGithubProfiles(nextProfiles)
    await saveStoredGitHubProfiles(nextProfiles)
    cancelRepositorySave()
    setRemoteFiles([]); setRemoteHead(''); setGithubNotice(''); setActiveRepoPath(null)
    const next = nextProfiles[0]
    if (next) await switchRemoteRepository(next.id)
    else { saveGitHubConfig(null); setGithubConfig(null); setEditorView('markdown') }
  }

  const refreshLocalGitState = async () => {
    const desktop = desktopApi()
    if (!desktop) return
    setLocalGitBusy(true); setLocalGitActivity('refresh'); setLocalGitError('')
    try {
      const repositoryId = localGitState.activeId
      if (!repositoryId) setLocalGitState(await desktop.localGit.get())
      else {
        const repository = await desktop.localGit.refresh(repositoryId)
        setLocalGitState((current) => ({ ...current, repositories: current.repositories.map((item) => item.id === repository.id ? repository : item) }))
      }
    }
    catch (error) { setLocalGitError(error instanceof Error ? error.message : '刷新本地文件夹失败') }
    finally { setLocalGitBusy(false); setLocalGitActivity(null) }
  }

  const openLocalGitFolder = async () => {
    const desktop = desktopApi()
    if (!desktop) { setLocalGitError('网页端不能直接打开本地文件夹，请使用桌面应用。'); return }
    setLocalGitBusy(true); setLocalGitError(''); setLocalGitNotice('')
    try {
      const state = await desktop.localGit.open()
      if (!state) return
      setLocalGitState(state)
      setRepositorySource('local')
      setEditorView('repository')
      setActivePanel(null)
      const opened = state.repositories.find((item) => item.id === state.activeId)
      setLocalGitNotice(opened?.isGitRepository ? '本地 Git 仓库已打开，文档会自动保存。' : '本地文件夹已打开；未检测到 Git，仅提供文件浏览、编辑与自动保存。')
    } catch (error) { setLocalGitError(error instanceof Error ? error.message : '打开本地文件夹失败') }
    finally { setLocalGitBusy(false) }
  }

  const selectLocalRepository = async (id: string, targetView: EditorView = 'repository') => {
    const desktop = desktopApi()
    if (!desktop) return
    setLocalGitBusy(true); setLocalGitError(''); setLocalGitNotice('')
    try {
      setLocalGitState(await desktop.localGit.select(id))
      setRepositorySource('local')
      setEditorView(targetView)
      setActivePanel(null)
    } catch (error) { setLocalGitError(error instanceof Error ? error.message : '切换本地文件夹失败') }
    finally { setLocalGitBusy(false) }
  }

  const forgetLocalRepository = async (id: string) => {
    const desktop = desktopApi()
    if (!desktop) return
    setLocalGitBusy(true); setLocalGitError('')
    try {
      setLocalGitState(await desktop.localGit.forget(id))
      if (activeLocalFile?.repositoryId === id) setActiveLocalFile(null)
    } catch (error) { setLocalGitError(error instanceof Error ? error.message : '移除本地仓库记录失败') }
    finally { setLocalGitBusy(false) }
  }

  const openLocalRepositoryFile = async (repositoryId: string, path: string) => {
    const desktop = desktopApi()
    if (!desktop) return
    setLocalGitBusy(true); setLocalGitError(''); setLocalGitNotice('')
    try {
      const file = await desktop.localGit.read(repositoryId, path)
      setLocalAgentContext((current) => ({
        repositoryId,
        files: [...(current.repositoryId === repositoryId ? current.files.filter((item) => item.path !== file.path) : []), { path: file.path, content: file.content, status: 'clean' }].sort((left, right) => left.path.localeCompare(right.path)),
      }))
      openDocumentTab(file.path, file.content, `local-git:${repositoryId}:${file.path}`, null, repositoryId, file.path)
      setRepositorySource('local')
      setActivePanel(null)
    } catch (error) { setLocalGitError(error instanceof Error ? error.message : '读取本地 Markdown 失败') }
    finally { setLocalGitBusy(false) }
  }

  useEffect(() => {
    const desktop = desktopApi()
    const session = desktopWorkspaceSessionRef.current
    if (!desktop || !localGitLoaded || desktopWorkspaceRestoredRef.current || session?.repositorySource !== 'local') return
    const repositoryId = session.localRepositoryId || localGitState.activeId
    const repository = localGitState.repositories.find((item) => item.id === repositoryId)
    desktopWorkspaceRestoredRef.current = true
    if (!repositoryId || !repository) { setEditorView('repository'); return }
    const restore = async () => {
      if (localGitState.activeId !== repositoryId) setLocalGitState(await desktop.localGit.select(repositoryId))
      if (session.localPath && repository.files.some((file) => file.path === session.localPath && file.gitStatus !== 'D')) await openLocalRepositoryFile(repositoryId, session.localPath)
    }
    void restore().catch((error) => { setEditorView('repository'); setLocalGitError(error instanceof Error ? error.message : '无法恢复上次打开的本地工作区') })
  }, [localGitLoaded, localGitState.activeId, localGitState.repositories])

  const replaceLocalRepository = useCallback((repository: DesktopLocalGitState['repositories'][number]) => {
    setLocalGitState((current) => ({ ...current, repositories: current.repositories.map((item) => item.id === repository.id ? repository : item) }))
  }, [])

  const rewriteOpenLocalPaths = useCallback((repositoryId: string, sourcePath: string, destinationPath: string, kind: 'file' | 'folder') => {
    const rewrite = (path: string) => kind === 'file' ? destinationPath : path === sourcePath ? destinationPath : path.startsWith(`${sourcePath}/`) ? `${destinationPath}${path.slice(sourcePath.length)}` : path
    const nextTabs = documentTabsRef.current.map((tab) => {
      if (tab.localRepositoryId !== repositoryId || !tab.localPath || (kind === 'file' ? tab.localPath !== sourcePath : tab.localPath !== sourcePath && !tab.localPath.startsWith(`${sourcePath}/`))) return tab
      const localPath = rewrite(tab.localPath)
      return { ...tab, name: baseName(localPath), localPath, sourceKey: `local-git:${repositoryId}:${localPath}` }
    })
    documentTabsRef.current = nextTabs
    setDocumentTabs(nextTabs)
    setLocalAgentContext((current) => current.repositoryId !== repositoryId ? current : { ...current, files: current.files.map((file) => file.path === sourcePath || (kind === 'folder' && file.path.startsWith(`${sourcePath}/`)) ? { ...file, path: rewrite(file.path) } : file) })
    if (activeLocalFile?.repositoryId === repositoryId && (activeLocalFile.path === sourcePath || (kind === 'folder' && activeLocalFile.path.startsWith(`${sourcePath}/`)))) {
      const path = rewrite(activeLocalFile.path)
      setActiveLocalFile({ repositoryId, path })
      setFileName(baseName(path))
    }
  }, [activeLocalFile])

  const pasteLocalRepositoryClipboard = async (destinationFolder: string) => {
    const desktop = desktopApi()
    const repositoryId = localGitState.activeId
    const repository = localGitState.repositories.find((item) => item.id === repositoryId)
    const clipboard = localRepositoryClipboard
    if (!desktop || !repositoryId || !repository || !clipboard || clipboard.target.type === 'root') return
    if (clipboard.mode === 'cut') {
      await moveLocalRepositoryTarget(clipboard.target, destinationFolder)
      setLocalRepositoryClipboard(null)
      return
    }
    const occupied = new Set(buildLocalRepositoryRows(repository.files, new Set()).map((row) => row.path))
    const extension = clipboard.target.type === 'file' ? clipboard.target.name.match(/(\.(?:md|markdown))$/i)?.[1] || '' : ''
    const stem = extension ? clipboard.target.name.slice(0, -extension.length) : clipboard.target.name
    let destinationName = clipboard.target.name
    let destinationRoot = joinPath(destinationFolder, destinationName)
    for (let index = 1; occupied.has(destinationRoot); index += 1) {
      destinationName = `${stem} 副本${index > 1 ? ` ${index}` : ''}${extension}`
      destinationRoot = joinPath(destinationFolder, destinationName)
    }
    setLocalGitBusy(true); setLocalGitActivity('move'); setLocalGitError(''); setLocalGitNotice('')
    try {
      const sources = clipboard.target.type === 'file'
        ? repository.files.filter((file) => file.path === clipboard.target.path)
        : repository.files.filter((file) => file.path.startsWith(`${clipboard.target.path}/`))
      let nextRepository = repository
      for (const source of sources) {
        if (source.gitStatus === 'D') continue
        const file = await desktop.localGit.read(repositoryId, source.path)
        const destinationPath = clipboard.target.type === 'file' ? destinationRoot : `${destinationRoot}${source.path.slice(clipboard.target.path.length)}`
        nextRepository = (await desktop.localGit.write(repositoryId, destinationPath, file.content)).repository
      }
      replaceLocalRepository(nextRepository)
      setLocalGitNotice(`已复制 ${clipboard.target.name}`)
    } catch (error) { setLocalGitError(error instanceof Error ? error.message : '复制本地文件失败') }
    finally { setLocalGitBusy(false); setLocalGitActivity(null) }
  }

  const moveLocalRepositoryTarget = async (target: RepositoryTarget, destinationFolder: string) => {
    const desktop = desktopApi()
    const repositoryId = localGitState.activeId
    if (!desktop || !repositoryId || target.type === 'root') return
    const destinationPath = joinPath(destinationFolder, target.name)
    if (destinationPath === target.path) return
    setLocalGitBusy(true); setLocalGitActivity('move'); setLocalGitError(''); setLocalGitNotice('')
    try {
      const repository = await desktop.localGit.move(repositoryId, target.path, destinationPath, target.type)
      replaceLocalRepository(repository)
      rewriteOpenLocalPaths(repositoryId, target.path, destinationPath, target.type)
      setLocalGitNotice(`已移动 ${target.name}`)
    } catch (error) { setLocalGitError(error instanceof Error ? error.message : '移动本地文件失败') }
    finally { setLocalGitBusy(false); setLocalGitActivity(null); setDraggedLocalRepositoryTarget(null); setLocalRepositoryDropFolder(null) }
  }

  const dropLocalRepositoryTarget = async (destinationFolder: string) => {
    const target = draggedLocalRepositoryTarget
    const normalized = target ? normalizeRepositoryDropFolder(target, destinationFolder) : null
    if (target && normalized !== null) await moveLocalRepositoryTarget(target, normalized)
    else { setDraggedLocalRepositoryTarget(null); setLocalRepositoryDropFolder(null) }
  }

  const openLocalRepositoryMenu = (event: React.MouseEvent, target: RepositoryTarget) => {
    event.preventDefault(); event.stopPropagation()
    setLocalRepositoryMenu({ x: Math.min(event.clientX, window.innerWidth - 196), y: Math.min(event.clientY, window.innerHeight - 230), target })
  }

  const startLocalRepositoryRename = (target: RepositoryTarget) => {
    if (target.type === 'root') return
    setRenamingLocalRepositoryTarget(target)
    setLocalRepositoryRenameValue(target.name)
  }

  const finishLocalRepositoryRename = async () => {
    const target = renamingLocalRepositoryTarget
    const name = localRepositoryRenameValue.trim()
    setRenamingLocalRepositoryTarget(null)
    if (!target || target.type === 'root' || !name || name === target.name || name.includes('/') || name.includes('\\')) return
    if (target.type === 'file' && !/\.(md|markdown)$/i.test(name)) { setLocalGitError('Markdown 文件名需要以 .md 或 .markdown 结尾'); return }
    if (name !== target.name) {
      const desktop = desktopApi()
      const repositoryId = localGitState.activeId
      if (!desktop || !repositoryId) return
      setLocalGitBusy(true); setLocalGitActivity('move'); setLocalGitError('')
      try {
        const destinationPath = joinPath(parentPath(target.path), name)
        const repository = await desktop.localGit.move(repositoryId, target.path, destinationPath, target.type)
        replaceLocalRepository(repository)
        rewriteOpenLocalPaths(repositoryId, target.path, destinationPath, target.type)
        setLocalGitNotice(`已重命名为 ${name}`)
      } catch (error) { setLocalGitError(error instanceof Error ? error.message : '重命名失败') }
      finally { setLocalGitBusy(false); setLocalGitActivity(null) }
    }
  }

  const removeLocalRepositoryTarget = async (target: RepositoryTarget) => {
    const desktop = desktopApi()
    const repositoryId = localGitState.activeId
    if (!desktop || !repositoryId || target.type === 'root') return
    if (!window.confirm(`确定删除“${target.name}”吗？此操作会修改磁盘中的文件。`)) return
    setLocalGitBusy(true); setLocalGitActivity('remove'); setLocalGitError(''); setLocalGitNotice('')
    try {
      const repository = await desktop.localGit.remove(repositoryId, target.path, target.type)
      replaceLocalRepository(repository)
      setLocalAgentContext((current) => current.repositoryId === repositoryId ? { ...current, files: current.files.filter((file) => file.path !== target.path && (target.type !== 'folder' || !file.path.startsWith(`${target.path}/`))) } : current)
      const removed = (tab: DocumentTab) => tab.localRepositoryId === repositoryId && Boolean(tab.localPath) && (tab.localPath === target.path || (target.type === 'folder' && tab.localPath!.startsWith(`${target.path}/`)))
      const nextTabs = documentTabsRef.current.filter((tab) => !removed(tab))
      documentTabsRef.current = nextTabs; setDocumentTabs(nextTabs)
      if (activeDocumentTab && removed(activeDocumentTab)) {
        const nextTab = nextTabs[0]
        if (nextTab) { setActiveTabId(nextTab.id); displayDocumentTab(nextTab) }
        else { setActiveTabId(''); displayNoOpenDocument() }
      }
      setLocalGitNotice(`已删除 ${target.name}`)
    } catch (error) { setLocalGitError(error instanceof Error ? error.message : '删除本地文件失败') }
    finally { setLocalGitBusy(false); setLocalGitActivity(null) }
  }

  const reloadLocalRepositoryTabs = async (repositoryId: string, availablePaths: Set<string>) => {
    const desktop = desktopApi()
    if (!desktop) return
    const refreshed = new Map<string, string>()
    for (const tab of documentTabsRef.current) {
      if (tab.localRepositoryId !== repositoryId || !tab.localPath || !availablePaths.has(tab.localPath)) continue
      const file = await desktop.localGit.read(repositoryId, tab.localPath)
      refreshed.set(tab.localPath, file.content)
    }
    const nextTabs = documentTabsRef.current
      .filter((tab) => tab.localRepositoryId !== repositoryId || !tab.localPath || availablePaths.has(tab.localPath))
      .map((tab) => tab.localRepositoryId === repositoryId && tab.localPath && refreshed.has(tab.localPath) ? { ...tab, content: refreshed.get(tab.localPath)!, savedContent: refreshed.get(tab.localPath)! } : tab)
    documentTabsRef.current = nextTabs; setDocumentTabs(nextTabs)
    const active = nextTabs.find((tab) => tab.id === activeTabId) || nextTabs[0]
    if (active) {
      if (active.id !== activeTabId) setActiveTabId(active.id)
      displayDocumentTab(active)
    } else {
      setActiveTabId('')
      displayNoOpenDocument()
    }
  }

  const discardLocalRepositoryChanges = async () => {
    const desktop = desktopApi()
    const repositoryId = localGitState.activeId
    if (!desktop || !repositoryId || !window.confirm('放弃所有未提交的 Markdown 修改？其他类型文件不会受到影响。')) return
    setLocalGitBusy(true); setLocalGitActivity('discard'); setLocalGitError(''); setLocalGitNotice('')
    try {
      const repository = await desktop.localGit.discard(repositoryId)
      replaceLocalRepository(repository)
      await reloadLocalRepositoryTabs(repositoryId, new Set(repository.files.filter((file) => file.gitStatus !== 'D').map((file) => file.path)))
      setLocalGitNotice('已放弃所有未提交的 Markdown 修改')
    } catch (error) { setLocalGitError(error instanceof Error ? error.message : '放弃本地修改失败') }
    finally { setLocalGitBusy(false); setLocalGitActivity(null) }
  }

  const discardLocalRepositoryFile = async (target: RepositoryTarget) => {
    const desktop = desktopApi()
    const repositoryId = localGitState.activeId
    if (!desktop || !repositoryId || target.type !== 'file' || !window.confirm(`放弃“${target.name}”的未提交修改？`)) return
    const key = `${repositoryId}:${target.path}`
    const timer = localAutosaveTimersRef.current.get(key)
    if (timer) window.clearTimeout(timer)
    localAutosaveTimersRef.current.delete(key)
    localAutosaveRevisionRef.current.set(key, (localAutosaveRevisionRef.current.get(key) || 0) + 1)
    setLocalGitBusy(true); setLocalGitActivity('discard'); setLocalGitError(''); setLocalGitNotice('')
    try {
      await localAutosaveQueueRef.current.get(key)?.catch(() => {})
      const repository = await desktop.localGit.discardFile(repositoryId, target.path)
      replaceLocalRepository(repository)
      await reloadLocalRepositoryTabs(repositoryId, new Set(repository.files.filter((file) => file.gitStatus !== 'D').map((file) => file.path)))
      setLocalGitNotice(`已放弃 ${target.name} 的修改`)
    } catch (error) { setLocalGitError(error instanceof Error ? error.message : '放弃文件修改失败') }
    finally { setLocalGitBusy(false); setLocalGitActivity(null) }
  }

  const openLocalRepositoryGraph = async () => {
    const desktop = desktopApi()
    const repositoryId = localGitState.activeId
    if (!desktop || !repositoryId) return
    setLocalRepositoryGraph({ branches: [], commits: [], loading: true, error: '' }); setLocalRepositoryGraphBranchesOpen(false)
    setLocalGitActivity('graph')
    try { setLocalRepositoryGraph({ ...(await desktop.localGit.graph(repositoryId)), loading: false, error: '' }) }
    catch (error) { setLocalRepositoryGraph({ branches: [], commits: [], loading: false, error: error instanceof Error ? error.message : '读取本地提交历史失败' }) }
    finally { setLocalGitActivity(null) }
  }

  const openLocalRepositoryHistory = async (target: RepositoryTarget, x: number, y: number) => {
    const desktop = desktopApi()
    const repositoryId = localGitState.activeId
    if (!desktop || !repositoryId || target.type !== 'file') return
    const state: LocalRepositoryHistoryState = {
      target,
      x: Math.max(8, Math.min(x, window.innerWidth - 428)),
      y: Math.max(8, Math.min(y, window.innerHeight - 568)),
      commits: [],
      loading: true,
      error: '',
    }
    setLocalRepositoryMenu(null)
    setLocalRepositoryHistory(state)
    try {
      const commits = await desktop.localGit.fileHistory(repositoryId, target.path)
      setLocalRepositoryHistory((current) => current?.target.path === target.path ? { ...current, commits, loading: false } : current)
    } catch (error) {
      setLocalRepositoryHistory((current) => current?.target.path === target.path ? { ...current, loading: false, error: error instanceof Error ? error.message : '读取本地文件历史失败' } : current)
    }
  }

  const openLocalRepositoryHistoryVersion = async (commit: DesktopLocalGitCommit) => {
    const desktop = desktopApi()
    const repositoryId = localGitState.activeId
    const history = localRepositoryHistory
    if (!desktop || !repositoryId || !history || history.target.type !== 'file') return
    setLocalRepositoryHistory((current) => current ? { ...current, loading: true, error: '' } : current)
    try {
      const file = await desktop.localGit.readVersion(repositoryId, history.target.path, commit.sha)
      openDocumentTab(historicalFileName(file.path, commit.sha), file.content, `local-history:${repositoryId}:${commit.sha}:${file.path}`)
      setLocalRepositoryHistory(null)
    } catch (error) {
      setLocalRepositoryHistory((current) => current ? { ...current, loading: false, error: error instanceof Error ? error.message : '打开本地历史版本失败' } : current)
    }
  }

  const switchLocalRepositoryBranch = async (branch: string) => {
    const desktop = desktopApi()
    const repositoryId = localGitState.activeId
    if (!desktop || !repositoryId) return
    setLocalGitBusy(true); setLocalGitActivity('switch'); setLocalGitError(''); setLocalGitNotice('')
    try {
      const repository = await desktop.localGit.switchBranch(repositoryId, branch)
      replaceLocalRepository(repository)
      await reloadLocalRepositoryTabs(repositoryId, new Set(repository.files.filter((file) => file.gitStatus !== 'D').map((file) => file.path)))
      setLocalGitNotice(`已切换到 ${repository.branch}`)
      setLocalRepositoryGraph({ ...(await desktop.localGit.graph(repositoryId)), loading: false, error: '' })
    } catch (error) { setLocalGitError(error instanceof Error ? error.message : '切换本地分支失败') }
    finally { setLocalGitBusy(false); setLocalGitActivity(null) }
  }

  const loadAllLocalAgentNotes = useCallback(async () => {
    const desktop = desktopApi()
    const repositoryId = activeLocalFile?.repositoryId || localGitState.activeId
    const repository = localGitState.repositories.find((item) => item.id === repositoryId)
    if (!desktop || !repositoryId || !repository) return
    setLocalGitBusy(true); setLocalGitError('')
    try {
      const files: AgentSourceFile[] = []
      for (const entry of repository.files) {
        const file = await desktop.localGit.read(repositoryId, entry.path)
        files.push({ path: file.path, content: file.content, status: 'clean' })
      }
      setLocalAgentContext({ repositoryId, files })
      setLocalGitNotice(`Agent 已读取 ${files.length} 个本地 Markdown 文件`)
    } catch (error) { setLocalGitError(error instanceof Error ? error.message : '读取本地仓库失败') }
    finally { setLocalGitBusy(false) }
  }, [activeLocalFile?.repositoryId, localGitState.activeId, localGitState.repositories])

  const applyLocalAgentChange = useCallback(async (path: string, content: string): Promise<AgentMutationResult> => {
    const desktop = desktopApi()
    const repositoryId = activeLocalFile?.repositoryId || localGitState.activeId
    if (!desktop || !repositoryId || localAgentContext.repositoryId !== repositoryId) return { ok: false, error: '当前本地仓库上下文已切换，请重新读取后再修改。' }
    try {
      const result = await desktop.localGit.write(repositoryId, path, content)
      setLocalGitState((current) => ({ ...current, repositories: current.repositories.map((item) => item.id === result.repository.id ? result.repository : item) }))
      setLocalAgentContext((current) => ({ ...current, files: current.files.map((file) => file.path === path ? { ...file, content, status: 'modified' } : file) }))
      if (activeLocalFile?.repositoryId === repositoryId && activeLocalFile.path === path) {
        updateMarkdown(content, 'agent')
        markActiveDocumentSaved(content)
      }
      return { ok: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : '写入本地仓库失败'
      setLocalGitError(message)
      return { ok: false, error: message }
    }
  }, [activeLocalFile, localAgentContext.repositoryId, localGitState.activeId, markActiveDocumentSaved, updateMarkdown])

  const applyStandaloneAgentChange = useCallback(async (path: string, content: string): Promise<AgentMutationResult> => {
    if (path !== fileName) return { ok: false, error: '单文件模式只能修改当前文件。' }
    updateMarkdown(content, 'agent')
    return { ok: true }
  }, [fileName, updateMarkdown])

  const rejectStandaloneAgentCreate = useCallback(async (): Promise<AgentMutationResult> => ({ ok: false, error: '单文件模式不能新建其他文件，请先打开 Git 仓库。' }), [])
  const rejectStandaloneAgentCommit = useCallback(async (): Promise<AgentCommitResult> => ({ ok: false, error: '当前文件不属于 Git 仓库，无法提交。' }), [])
  const emptyAgentGitContext = useCallback(async () => '', [])
  const noopLoadAgentFiles = useCallback(async () => {}, [])

  const createLocalAgentFile = useCallback(async (path: string, content: string): Promise<AgentMutationResult> => {
    const desktop = desktopApi()
    const repositoryId = activeLocalFile?.repositoryId || localGitState.activeId
    if (!desktop || !repositoryId || localAgentContext.repositoryId !== repositoryId) return { ok: false, error: '当前本地仓库上下文已切换，请重新读取后再新建。' }
    if (localAgentContext.files.some((file) => file.path === path)) return { ok: false, error: '该笔记文件已存在' }
    try {
      const result = await desktop.localGit.write(repositoryId, path, content)
      setLocalGitState((current) => ({ ...current, repositories: current.repositories.map((item) => item.id === result.repository.id ? result.repository : item) }))
      setLocalAgentContext((current) => ({ ...current, files: [...current.files, { path, content, status: 'added' }].sort((left, right) => left.path.localeCompare(right.path)) }))
      return { ok: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : '新建本地笔记失败'
      setLocalGitError(message)
      return { ok: false, error: message }
    }
  }, [activeLocalFile?.repositoryId, localAgentContext.files, localAgentContext.repositoryId, localGitState.activeId])

  const getLocalAgentGitContext = useCallback(async (paths: string[]) => {
    const desktop = desktopApi()
    const repositoryId = activeLocalFile?.repositoryId || localGitState.activeId
    const repository = localGitState.repositories.find((item) => item.id === repositoryId)
    if (!desktop || !repositoryId || !repository?.isGitRepository) return ''
    try { return await desktop.localGit.history(repositoryId, paths) }
    catch (error) { setLocalGitError(error instanceof Error ? error.message : '读取本地 Git 历史失败'); return '' }
  }, [activeLocalFile?.repositoryId, localGitState.activeId, localGitState.repositories])

  const commitLocalAgentChanges = useCallback(async (): Promise<AgentCommitResult> => {
    const desktop = desktopApi()
    const repositoryId = activeLocalFile?.repositoryId || localGitState.activeId
    const currentRepository = localGitState.repositories.find((item) => item.id === repositoryId)
    if (!desktop || !repositoryId) return { ok: false, error: '请先打开本地 Git 仓库' }
    if (!currentRepository?.isGitRepository) return { ok: false, error: '当前是普通本地文件夹，不能创建 Git 提交。' }
    try {
      let repository = await desktop.localGit.commit(repositoryId, 'docs: update notes with markmap++ Agent')
      if (repository.remoteName) repository = await desktop.localGit.push(repositoryId)
      setLocalGitState((current) => ({ ...current, repositories: current.repositories.map((item) => item.id === repository.id ? repository : item) }))
      setLocalAgentContext((current) => ({ ...current, files: current.files.map((file) => ({ ...file, status: 'clean' })) }))
      return { ok: true, commitSha: repository.head, message: repository.remoteName ? '已提交并推送本地仓库' : '已提交到本地仓库' }
    } catch (error) {
      const message = error instanceof Error ? error.message : '本地 Git 提交失败'
      setLocalGitError(message)
      return { ok: false, error: message }
    }
  }, [activeLocalFile?.repositoryId, localGitState.activeId, localGitState.repositories])

  const saveActiveLocalDocument = async () => {
    const desktop = desktopApi()
    if (!desktop || !activeLocalFile) return
    setLocalGitBusy(true); setLocalGitError(''); setLocalGitNotice('')
    try {
      const result = await desktop.localGit.write(activeLocalFile.repositoryId, activeLocalFile.path, markdownRef.current)
      setLocalGitState((current) => ({ ...current, repositories: current.repositories.map((item) => item.id === result.repository.id ? result.repository : item) }))
      setLocalGitNotice(`已保存 ${activeLocalFile.path}`)
      markActiveDocumentSaved(markdownRef.current)
      setSaveState('saved')
    } catch (error) { setLocalGitError(error instanceof Error ? error.message : '保存本地 Markdown 失败') }
    finally { setLocalGitBusy(false) }
  }

  useEffect(() => {
    const desktop = desktopApi()
    if (!desktop || !activeLocalFile) return
    const tab = documentTabsRef.current.find((item) => item.id === activeTabId)
    if (!tab || tab.savedContent === markdown) return
    const repositoryId = activeLocalFile.repositoryId
    const path = activeLocalFile.path
    const tabId = activeTabId
    const content = markdown
    const key = `${repositoryId}:${path}`
    const revision = (localAutosaveRevisionRef.current.get(key) || 0) + 1
    localAutosaveRevisionRef.current.set(key, revision)
    const previousTimer = localAutosaveTimersRef.current.get(key)
    if (previousTimer) window.clearTimeout(previousTimer)
    const timer = window.setTimeout(() => {
      localAutosaveTimersRef.current.delete(key)
      if (localAutosaveRevisionRef.current.get(key) !== revision) return
      const previous = localAutosaveQueueRef.current.get(key) || Promise.resolve()
      const operation = previous.catch(() => {}).then(async () => {
        const result = await desktop.localGit.write(repositoryId, path, content)
        if (localAutosaveRevisionRef.current.get(key) !== revision) return
        setLocalGitState((current) => ({ ...current, repositories: current.repositories.map((item) => item.id === result.repository.id ? result.repository : item) }))
        setLocalAgentContext((current) => current.repositoryId === repositoryId ? { ...current, files: current.files.map((file) => file.path === path ? { ...file, content, status: 'modified' } : file) } : current)
        markDocumentSaved(tabId, content)
        setSaveState('saved')
        setLocalGitError('')
      }).catch((error) => {
        if (localAutosaveRevisionRef.current.get(key) === revision) setLocalGitError(error instanceof Error ? error.message : '自动保存本地 Markdown 失败')
      })
      localAutosaveQueueRef.current.set(key, operation)
    }, 350)
    localAutosaveTimersRef.current.set(key, timer)
  }, [activeLocalFile, activeTabId, markdown, markDocumentSaved])

  const saveStandaloneDocument = useCallback(async () => {
    const tab = documentTabsRef.current.find((item) => item.id === activeTabId)
    if (!tab || tab.repositoryPath || tab.localRepositoryId) return
    const desktop = desktopApi()
    try {
      if (desktop && tab.desktopFileId) {
        await desktop.saveOpenedMarkdown(tab.desktopFileId, markdownRef.current)
        markActiveDocumentSaved(markdownRef.current)
        setLocalGitNotice(`已保存 ${tab.name}`)
        return
      }
      const result = await saveBlob(new Blob([markdownRef.current], { type: 'text/markdown;charset=utf-8' }), tab.name)
      if (!result.canceled) {
        markActiveDocumentSaved(markdownRef.current)
        setLocalGitNotice(`已下载 ${tab.name} 的副本`)
      }
    } catch (error) { setLocalGitError(error instanceof Error ? error.message : '保存 Markdown 失败') }
  }, [activeTabId, markActiveDocumentSaved])

  useEffect(() => {
    if (desktopApi()) return
    const hasUnsaved = documentTabs.some((tab) => tabHasUnsavedChanges(tab.id === activeTabId ? { ...tab, content: markdown } : tab))
    if (!hasUnsaved) return
    const warnBeforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warnBeforeUnload)
    return () => window.removeEventListener('beforeunload', warnBeforeUnload)
  }, [activeTabId, documentTabs, markdown])

  useEffect(() => {
    const desktop = desktopApi()
    if (!desktop) return
    return desktop.windowControl.onCloseRequested(() => {
      const hasUnsaved = documentTabsRef.current.some((tab) => tabHasUnsavedChanges(tab.id === activeTabId ? { ...tab, content: markdownRef.current } : tab))
      if (hasUnsaved) setWindowClosePending(true)
      else void desktop.windowControl.close()
    })
  }, [activeTabId])

  useEffect(() => {
    const desktop = desktopApi()
    if (!desktop) return
    let active = true
    void desktop.getAppInfo().then(({ platform }) => { if (active) setDesktopPlatform(platform) }).catch(() => {})
    return () => { active = false }
  }, [])

  const isWindowsDesktop = desktopPlatform === 'win32'

  useEffect(() => {
    const desktop = desktopApi()
    if (!desktop || !isWindowsDesktop) return
    let active = true
    void desktop.windowControl.getMaximized().then((maximized) => { if (active) setDesktopWindowMaximized(maximized) }).catch(() => {})
    const unsubscribe = desktop.windowControl.onMaximizedChanged(setDesktopWindowMaximized)
    return () => { active = false; unsubscribe() }
  }, [isWindowsDesktop])

  useEffect(() => {
    const saveWithShortcut = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLocaleLowerCase() !== 's') return
      event.preventDefault()
      if (activeLocalFile) void saveActiveLocalDocument()
      else if (!activeRepoPath) void saveStandaloneDocument()
    }
    window.addEventListener('keydown', saveWithShortcut)
    return () => window.removeEventListener('keydown', saveWithShortcut)
  }, [activeLocalFile, activeRepoPath, saveStandaloneDocument])

  const commitLocalRepository = async () => {
    const desktop = desktopApi()
    const repositoryId = localGitState.activeId
    if (!desktop || !repositoryId) return
    setLocalGitBusy(true); setLocalGitActivity('commit'); setLocalGitError(''); setLocalGitNotice('')
    try {
      const repository = await desktop.localGit.commit(repositoryId, '')
      setLocalGitState((current) => ({ ...current, repositories: current.repositories.map((item) => item.id === repository.id ? repository : item) }))
      setLocalGitNotice(`已创建本地提交 ${repository.head}`)
    } catch (error) { setLocalGitError(error instanceof Error ? error.message : '创建本地提交失败') }
    finally { setLocalGitBusy(false); setLocalGitActivity(null) }
  }

  const pushLocalRepository = async () => {
    const desktop = desktopApi()
    const repositoryId = localGitState.activeId
    if (!desktop || !repositoryId) return
    setLocalGitBusy(true); setLocalGitActivity('push'); setLocalGitError(''); setLocalGitNotice('')
    try {
      const repository = await desktop.localGit.push(repositoryId)
      setLocalGitState((current) => ({ ...current, repositories: current.repositories.map((item) => item.id === repository.id ? repository : item) }))
      setLocalGitNotice(`已推送到 ${repository.remoteLabel || repository.remoteName}`)
    } catch (error) { setLocalGitError(error instanceof Error ? error.message : '推送本地仓库失败') }
    finally { setLocalGitBusy(false); setLocalGitActivity(null) }
  }

  const syncLocalRepository = async () => {
    const desktop = desktopApi()
    const repositoryId = localGitState.activeId
    if (!desktop || !repositoryId) return
    setLocalGitBusy(true); setLocalGitActivity('sync'); setLocalGitError(''); setLocalGitNotice('')
    try {
      const repository = await desktop.localGit.sync(repositoryId)
      setLocalGitState((current) => ({ ...current, repositories: current.repositories.map((item) => item.id === repository.id ? repository : item) }))
      setLocalGitNotice(repository.behindCount ? '仍有远端提交待同步' : '已同步远端更新，本地编辑内容保持不变')
    } catch (error) { setLocalGitError(error instanceof Error ? error.message : '同步本地仓库失败') }
    finally { setLocalGitBusy(false); setLocalGitActivity(null) }
  }

  const openRepositoryFile = async (remote: RemoteMarkdownFile) => {
    if (!githubConfig) return
    setRepositoryLoadingPath(remote.path)
    setGithubBusyAction('open-file'); setGithubError(''); setGithubNotice('')
    try {
      const local = cachedFiles.find((file) => file.path === remote.path || file.originalPath === remote.path)
      if (local && (local.status !== 'clean' || local.baseSha === remote.sha)) activateCachedFile(local)
      else {
        const file = await downloadMarkdown(githubConfig, remote, remoteHead)
        await putCachedFile(file)
        setCachedFiles((current) => [...current.filter((item) => item.id !== file.id), file].sort((a, b) => a.path.localeCompare(b.path)))
        activateCachedFile(file)
      }
      setActivePanel(null)
    } catch (error) {
      setGithubError(error instanceof Error ? error.message : '下载文件失败')
    } finally { setRepositoryLoadingPath(null); setGithubBusyAction(null) }
  }

  const openRepositoryLink = async (href: string, sourcePath = activeRepoPath || fileName) => {
    const resolution = resolveRepositoryLink(href, sourcePath)
    if (resolution.kind === 'external') {
      window.open(resolution.href, '_blank', 'noopener,noreferrer')
      return
    }
    if (resolution.kind === 'invalid') { setLinkNotice(resolution.reason); return }
    const local = cachedFilesRef.current.find((file) => file.status !== 'deleted' && file.path === resolution.path)
    const remote = remoteFiles.find((file) => file.path === resolution.path)
    if (!local && !remote) { setLinkNotice(`找不到仓库笔记：${resolution.path}`); return }
    setPendingRepositoryNavigation({ path: resolution.path, fragment: resolution.fragment })
    if (local) activateCachedFile(local)
    else if (remote) await openRepositoryFile(remote)
  }

  const openRepositoryLocation = async (path: string, line: number) => {
    const local = cachedFilesRef.current.find((file) => file.status !== 'deleted' && file.path === path)
    const remote = remoteFiles.find((file) => file.path === path)
    if (!local && !remote) { setLinkNotice(`找不到仓库笔记：${path}`); return }
    setPendingRepositoryNavigation({ path, fragment: '', line })
    if (local) activateCachedFile(local)
    else if (remote) await openRepositoryFile(remote)
  }

  const handlePreviewContextMenu = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.shiftKey || previewNativeContextMenuOnceRef.current) {
      previewNativeContextMenuOnceRef.current = false
      return
    }
    const selection = window.getSelection()
    if (!selection || selection.isCollapsed || !selection.rangeCount) return
    const range = selection.getRangeAt(0).cloneRange()
    const common = range.commonAncestorContainer instanceof HTMLElement ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement
    const nodeGroup = common?.closest<SVGGElement>('g.markmap-node')
    const contentElement = nodeGroup?.querySelector<HTMLElement>('foreignObject > div > div')
    const nodePath = nodeGroup?.dataset.path
    const text = selection.toString().trim()
    if (!contentElement || !nodePath || !text || !contentElement.contains(range.commonAncestorContainer)) return
    event.preventDefault()
    setSelectionMenu({ source: 'preview', x: event.clientX, y: event.clientY, text, range, nodePath, contentElement, anchor: common?.closest<HTMLAnchorElement>('a') || undefined })
  }

  const handlePreviewLinkClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href]') : null
    if (!target || !activeRepoPath) return
    const resolution = resolveRepositoryLink(target.getAttribute('href') || '', activeRepoPath)
    if (resolution.kind !== 'internal') return
    event.preventDefault()
    event.stopPropagation()
    void openRepositoryLink(target.getAttribute('href') || '', activeRepoPath)
  }

  const syncPreviewSelection = (selection: Extract<TextSelectionTarget, { source: 'preview' }>) => {
    const root = mmRef.current?.getData()
    if (!root) return
    const update = (node: typeof root): boolean => {
      if (node.state.path === selection.nodePath) { node.content = selection.contentElement.innerHTML; return true }
      return node.children.some(update)
    }
    if (update(root)) syncFromMap()
  }

  const copySelection = async (selection: TextSelectionTarget) => {
    try { await navigator.clipboard.writeText(selection.text); setLinkNotice('已复制所选文字') }
    catch { setLinkNotice('浏览器未允许读取剪贴板，请使用 Ctrl+C') }
    setSelectionMenu(null)
  }

  const cutSelection = async (selection: TextSelectionTarget) => {
    try { await navigator.clipboard.writeText(selection.text) } catch { setLinkNotice('无法写入剪贴板') }
    if (selection.source === 'editor') markdownEditorRef.current?.replaceRange(selection.from, selection.to, '')
    else {
      selection.range.deleteContents()
      syncPreviewSelection(selection)
    }
    setSelectionMenu(null)
  }

  const pasteSelection = async (selection: TextSelectionTarget) => {
    try {
      const text = await navigator.clipboard.readText()
      if (selection.source === 'editor') markdownEditorRef.current?.replaceRange(selection.from, selection.to, text)
      else {
        selection.range.deleteContents()
        selection.range.insertNode(document.createTextNode(text))
        syncPreviewSelection(selection)
      }
    } catch { setLinkNotice('浏览器未允许读取剪贴板，请使用 Ctrl+V') }
    setSelectionMenu(null)
  }

  const removeSelectionLink = (selection: TextSelectionTarget) => {
    if (selection.source === 'editor') {
      if (selection.link) markdownEditorRef.current?.replaceRange(selection.link.from, selection.link.to, selection.link.label)
    } else if (selection.anchor) {
      selection.anchor.replaceWith(...Array.from(selection.anchor.childNodes))
      syncPreviewSelection(selection)
    }
    setSelectionMenu(null)
  }

  const chooseRepositoryLink = (selection: TextSelectionTarget, target: LinkTarget) => {
    const href = repositoryLinkHref(target.path, target.heading?.slug)
    if (selection.source === 'editor') {
      if (selection.link) markdownEditorRef.current?.replaceRange(selection.link.destinationFrom, selection.link.destinationTo, href)
      else markdownEditorRef.current?.replaceRange(selection.from, selection.to, repositoryMarkdownLink(selection.text, target.path, target.heading?.slug))
    } else if (selection.anchor) {
      selection.anchor.setAttribute('href', href)
      syncPreviewSelection(selection)
    } else {
      const anchor = document.createElement('a')
      anchor.href = href
      anchor.append(selection.range.extractContents())
      selection.range.insertNode(anchor)
      syncPreviewSelection(selection)
    }
    setLinkPickerSelection(null)
    setLinkNotice(target.heading ? `已链接到 ${target.path} › ${target.heading.text}` : `已链接到 ${target.path}`)
  }

  const allowNativeSelectionMenu = (selection: TextSelectionTarget) => {
    if (selection.source === 'editor') markdownEditorRef.current?.allowNativeContextMenuOnce()
    else previewNativeContextMenuOnceRef.current = true
    setSelectionMenu(null)
    setLinkNotice('已切换到浏览器菜单，请在原位置再次右键；也可按住 Shift 右键直接打开。')
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
    setGithubBusyAction('load-repository')
    void refreshRepository(githubConfig)
      .catch((error) => setGithubError(error instanceof Error ? error.message : '刷新仓库失败'))
      .finally(() => setGithubBusyAction(null))
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

    setGithubBusyAction('save'); setGithubError(''); setGithubNotice('')
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
    } finally { setGithubBusyAction(null) }
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
      const files = Array.from(merged.values()).sort((a, b) => a.path.localeCompare(b.path))
      cachedFilesRef.current = files
      return files
    })
    return rows.map((row) => ({ sourcePath: row.path, file: downloaded.find((file) => file.path === row.path || file.originalPath === row.remote?.path) })).filter((item): item is { sourcePath: string; file: CachedMarkdownFile } => Boolean(item.file))
  }

  const relocateRepositoryTarget = async (target: RepositoryTarget, nextRoot: string, copy: boolean) => {
    if (!githubConfig || target.type === 'root' || !validRepositoryPath(nextRoot)) return
    if (target.type === 'folder' && (nextRoot === target.path || nextRoot.startsWith(`${target.path}/`))) { setGithubError('不能把文件夹移动到自身内部'); return }
    setGithubBusyAction('move'); setGithubError(''); setGithubNotice('')
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
      const removed = new Set(changes.flatMap(({ previous }) => previous ? [previous.id] : []))
      const available = new Map(cachedFilesRef.current.map((file) => [file.id, file]))
      sources.forEach(({ file }) => available.set(file.id, file))
      const baseFiles = [...Array.from(available.values()).filter((file) => !removed.has(file.id) && !changes.some(({ next }) => next.id === file.id)), ...changes.map(({ next }) => next)]
      const sourceBefore = new Map(changes.map(({ previous, next }, index) => [next.id, previous?.path || sources[index].sourcePath]))
      const mappings = copy ? [] : changes.map(({ previous, next }, index) => ({ oldPath: previous?.path || sources[index].sourcePath, newPath: next.path }))
      let updatedReferenceCount = 0
      const nextFiles = baseFiles.map((file) => {
        let content = file.content
        let sourcePath = sourceBefore.get(file.id) || file.path
        if (sourcePath !== file.path) {
          const rewritten = rewriteRepositoryLinks(content, sourcePath, '__relocated_source__', '__relocated_source__', file.path)
          content = rewritten.content
          updatedReferenceCount += rewritten.count
          sourcePath = file.path
        }
        for (const mapping of mappings) {
          const rewritten = rewriteRepositoryLinks(content, sourcePath, mapping.oldPath, mapping.newPath, file.path)
          content = rewritten.content
          updatedReferenceCount += rewritten.count
          sourcePath = file.path
        }
        if (content === file.content) return file
        return { ...file, content, status: (file.status === 'clean' ? 'modified' : file.status) as CachedMarkdownFile['status'], updatedAt: Date.now() }
      }).sort((a, b) => a.path.localeCompare(b.path))
      await Promise.all([
        ...changes.flatMap(({ previous }) => previous ? [removeCachedFile(previous.id)] : []),
        ...nextFiles.filter((file) => !available.has(file.id) || available.get(file.id)?.content !== file.content || changes.some(({ next }) => next.id === file.id)).map(putCachedFile),
      ])
      cachedFilesRef.current = nextFiles
      setCachedFiles(nextFiles)
      if (!copy && activeRepoPath && (activeRepoPath === target.path || activeRepoPath.startsWith(`${target.path}/`))) {
        const nextActivePath = `${nextRoot}${activeRepoPath.slice(target.path.length)}`
        setActiveRepoPath(nextActivePath); setFileName(nextActivePath)
      }
      const activeAfterMove = !copy && activeRepoPath && (activeRepoPath === target.path || activeRepoPath.startsWith(`${target.path}/`)) ? `${nextRoot}${activeRepoPath.slice(target.path.length)}` : activeRepoPath
      const activeFile = nextFiles.find((file) => file.path === activeAfterMove)
      if (activeFile && activeFile.content !== markdownRef.current) updateMarkdown(activeFile.content, 'repository-link-rewrite')
      if (target.type === 'folder') {
        const folderPaths = new Set([target.path, ...virtualFolders.filter((folder) => folder.startsWith(`${target.path}/`))])
        visibleRows.filter((row) => row.type === 'folder' && row.path.startsWith(`${target.path}/`)).forEach((row) => folderPaths.add(row.path))
        const mapped = Array.from(folderPaths, (folder) => `${nextRoot}${folder.slice(target.path.length)}`)
        const nextFolders = Array.from(new Set([...(copy ? virtualFolders : virtualFolders.filter((folder) => !folderPaths.has(folder))), ...mapped])).sort()
        setVirtualFolders(nextFolders); saveVirtualFolders(repoKeyOf(githubConfig), nextFolders)
      }
      setGithubNotice(`${copy ? '已复制' : '已移动'}到本地暂存区${updatedReferenceCount ? `，并更新 ${updatedReferenceCount} 处笔记链接` : ''}`)
    } catch (error) {
      setGithubError(error instanceof Error ? error.message : '文件操作失败')
    } finally { setGithubBusyAction(null) }
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
    setGithubBusyAction('delete'); setGithubError(''); setGithubNotice('')
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
    } finally { setGithubBusyAction(null) }
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

  const pushRepositoryChanges = async (): Promise<AgentCommitResult> => {
    if (!githubConfig) return { ok: false, error: '请先绑定 GitHub 仓库' }
    setGithubBusyAction('sync'); setGithubError(''); setGithubNotice('')
    try {
      const filesToPush = cachedFilesRef.current
      const result = await pushCachedChanges(githubConfig, filesToPush)
      const refreshed = await listRemoteMarkdown(githubConfig)
      setRemoteHead(refreshed.head); setRemoteFiles(refreshed.files)
      const deletedFiles = filesToPush.filter((file) => file.status === 'deleted')
      await Promise.all(deletedFiles.map((file) => removeCachedFile(file.id)))
      const cleanFiles = filesToPush.filter((file) => file.status !== 'deleted').map((file) => {
        const remote = refreshed.files.find((item) => item.path === file.path)
        return { ...file, originalPath: file.path, baseContent: file.content, baseSha: remote?.sha || file.baseSha, baseCommit: result.commitSha, status: 'clean' as const, updatedAt: Date.now() }
      })
      await Promise.all(cleanFiles.map(putCachedFile))
      cachedFilesRef.current = cleanFiles
      setCachedFiles(cleanFiles)
      setVirtualFolders([])
      saveVirtualFolders(repoKeyOf(githubConfig), [])
      setGithubNotice(`已推送：${result.message}`)
      return { ok: true, commitSha: result.commitSha, message: result.message }
    } catch (error) {
      const message = error instanceof Error ? error.message : '推送失败'
      setGithubError(message)
      return { ok: false, error: message }
    } finally { setGithubBusyAction(null) }
  }

  const discardRepositoryChanges = async () => {
    if (!githubConfig || !window.confirm('放弃当前仓库的全部本地修改，并恢复到远程最新 commit？')) return
    setGithubBusyAction('discard'); setGithubError(''); setGithubNotice('')
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
    } finally { setGithubBusyAction(null) }
  }

  const discardRepositoryFile = async (target: RepositoryTarget) => {
    if (!githubConfig || target.type !== 'file') return
    const row = buildRepositoryRows(remoteFiles, cachedFilesRef.current, virtualFolders, new Set()).find((item) => item.type === 'file' && item.path === target.path)
    const file = row?.cached
    if (!file || file.status === 'clean' || !window.confirm(`放弃“${target.name}”的本地修改？`)) return
    remoteCacheRevisionRef.current.set(file.path, (remoteCacheRevisionRef.current.get(file.path) || 0) + 1)
    setGithubBusyAction('discard'); setGithubError(''); setGithubNotice('')
    try {
      await remoteCacheQueueRef.current.get(file.path)?.catch(() => {})
      let nextFiles: CachedMarkdownFile[]
      let restored: CachedMarkdownFile | null = null
      if (file.status === 'added') {
        await removeCachedFile(file.id)
        nextFiles = cachedFilesRef.current.filter((item) => item.id !== file.id)
      } else {
        restored = {
          ...file,
          id: `${file.repoKey}:${file.originalPath}`,
          path: file.originalPath,
          content: file.baseContent,
          status: 'clean',
          updatedAt: Date.now(),
        }
        if (restored.id !== file.id) await removeCachedFile(file.id)
        await putCachedFile(restored)
        nextFiles = cachedFilesRef.current.filter((item) => item.id !== file.id && item.id !== restored!.id).concat(restored).sort((left, right) => left.path.localeCompare(right.path))
      }
      cachedFilesRef.current = nextFiles
      setCachedFiles(nextFiles)
      const affectedTabs = (tab: DocumentTab) => tab.repositoryPath === file.path
      const nextTabs = restored
        ? documentTabsRef.current.map((tab) => affectedTabs(tab) ? { ...tab, name: restored!.path, content: restored!.content, savedContent: restored!.content, repositoryPath: restored!.path, sourceKey: `repository:${file.repoKey}:${restored!.path}` } : tab)
        : documentTabsRef.current.filter((tab) => !affectedTabs(tab))
      documentTabsRef.current = nextTabs
      setDocumentTabs(nextTabs)
      const active = nextTabs.find((tab) => tab.id === activeTabId) || nextTabs[0]
      if (!active) {
        setActiveTabId('')
        displayNoOpenDocument()
      } else if (affectedTabs(activeDocumentTab || active) || !nextTabs.some((tab) => tab.id === activeTabId)) {
        setActiveTabId(active.id)
        displayDocumentTab(active)
      }
      setGithubNotice(`已放弃 ${target.name} 的修改`)
    } catch (error) {
      setGithubError(error instanceof Error ? error.message : '放弃文件修改失败')
    } finally { setGithubBusyAction(null) }
  }

  const openGitHubPanel = () => {
    setGithubError(''); setGithubNotice('')
    if (repositorySource === 'local') {
      if (!localGitState.activeId) { setRepositorySettingsTab('local'); setActivePanel('github'); return }
      setEditorView('repository')
      void refreshLocalGitState()
      return
    }
    if (!githubConfig) { setActivePanel('github'); return }
    setEditorView('repository')
    setGithubBusyAction('load-repository')
    void refreshRepository(githubConfig)
      .catch((error) => setGithubError(error instanceof Error ? error.message : '刷新仓库失败'))
      .finally(() => setGithubBusyAction(null))
  }

  const refreshRepositoryView = async () => {
    if (!githubConfig) return
    setGithubBusyAction('refresh'); setGithubError(''); setGithubNotice('')
    try {
      await refreshRepository(githubConfig)
      setRepositoryCommitRef(null)
      setActiveRepoPath(null)
      setGithubNotice('仓库文件列表已刷新')
    } catch (error) {
      setGithubError(error instanceof Error ? error.message : '刷新仓库失败')
    } finally { setGithubBusyAction(null) }
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
    setRepositoryLoadingPath(remote.path)
    setGithubBusyAction('open-history-file'); setGithubError(''); setGithubNotice('')
    try {
      const content = await downloadMarkdownAtCommit(githubConfig, remote.path, commitSha)
      activateHistoricalFile(content, remote.path, commitSha)
      setActivePanel(null)
    } catch (error) {
      setGithubError(error instanceof Error ? error.message : '下载历史文件失败')
    } finally { setRepositoryLoadingPath(null); setGithubBusyAction(null) }
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
    setGithubBusyAction('switch-branch'); setGithubError(''); setGithubNotice('')
    setRepositoryGraph((current) => current ? { ...current, commits: [], loading: true, error: '' } : current)
    try {
      const [refreshed, commits] = await Promise.all([refreshRepository(nextConfig), listRepositoryCommits(nextConfig, branch.name)])
      setRepositoryCommitRef(null)
      setActiveRepoPath(null)
      saveGitHubConfig(nextConfig)
      setGithubConfig(nextConfig)
      const nextProfiles = githubProfiles.map((profile) => profile.id === repositoryProfileId(nextConfig) ? { ...profile, config: nextConfig, updatedAt: Date.now() } : profile)
      setGithubProfiles(nextProfiles)
      void saveStoredGitHubProfiles(nextProfiles)
      setBranchInput(branch.name)
      setRepositoryGraph((current) => current ? { ...current, commits, loading: false, error: '' } : current)
      setGithubNotice(`已切换到分支 ${branch.name}`)
      setRemoteHead(refreshed.head)
    } catch (error) {
      setRepositoryGraph((current) => current ? { ...current, loading: false, error: error instanceof Error ? error.message : '切换分支失败' } : current)
      setGithubError(error instanceof Error ? error.message : '切换分支失败')
    } finally { setGithubBusyAction(null) }
  }

  const openRepositoryCommit = async (commit: GitHubRepositoryCommit) => {
    if (!githubConfig) return
    const branchHeadSha = repositoryGraph?.branches.find((branch) => branch.name === githubConfig.branch)?.sha
    const isLatestCommit = commit.sha === branchHeadSha || (!repositoryCommitRef && commit.sha === remoteHead)
    setGithubBusyAction('open-commit'); setGithubError(''); setGithubNotice('')
    if (!isLatestCommit) setRepositoryCommitRef(commit.sha)
    setRemoteHead('')
    setRemoteFiles([])
    setActiveRepoPath(null)
    setRepositoryMenu(null)
    setRepositoryHistory(null)
    setDraggedRepositoryTarget(null)
    setRepositoryDropFolder(null)
    setRepositoryGraph(null)
    try {
      const result = await (isLatestCommit ? refreshRepository(githubConfig) : listRemoteMarkdown(githubConfig, commit.sha))
      setRemoteHead(result.head)
      setRemoteFiles(result.files)
      setRepositoryCommitRef(isLatestCommit ? null : commit.sha)
      setEditorView('repository')
      setGithubNotice(isLatestCommit ? '已回到最新 commit，可继续编辑并查看 Git 状态' : `正在查看 commit ${commit.sha.slice(0, 7)} 的文件状态`)
    } catch (error) {
      setRepositoryCommitRef(isLatestCommit ? repositoryCommitRef : commit.sha)
      setGithubError(error instanceof Error ? error.message : '切换到 commit 失败')
    } finally { setGithubBusyAction(null) }
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
    if (activePanel !== 'help') return
    const moveWithKeyboard = (event: KeyboardEvent) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
      event.preventDefault()
      setHelpTipIndex((current) => (current + (event.key === 'ArrowRight' ? 1 : -1) + HELP_TIP_COUNT) % HELP_TIP_COUNT)
    }
    window.addEventListener('keydown', moveWithKeyboard)
    return () => window.removeEventListener('keydown', moveWithKeyboard)
  }, [activePanel])

  useEffect(() => {
    if (!activePanel) return
    panelReturnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const frame = window.requestAnimationFrame(() => settingsPanelRef.current?.focus())
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (repositorySaveMode) cancelRepositorySave()
      setActivePanel(null)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('keydown', closeOnEscape)
      panelReturnFocusRef.current?.focus()
    }
  }, [activePanel, repositorySaveMode])

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
    if (!repositoryMenu && !repositoryHistory && !localRepositoryMenu && !localRepositoryHistory) return
    const closePopovers = () => { setRepositoryMenu(null); setRepositoryHistory(null); setLocalRepositoryMenu(null); setLocalRepositoryHistory(null) }
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') closePopovers() }
    window.addEventListener('pointerdown', closePopovers)
    window.addEventListener('keydown', closeOnEscape)
    return () => { window.removeEventListener('pointerdown', closePopovers); window.removeEventListener('keydown', closeOnEscape) }
  }, [repositoryMenu, repositoryHistory, localRepositoryMenu, localRepositoryHistory])

  useEffect(() => {
    if (!selectionMenu) return
    const closeMenu = () => setSelectionMenu(null)
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') closeMenu() }
    window.addEventListener('pointerdown', closeMenu)
    window.addEventListener('keydown', closeOnEscape)
    return () => { window.removeEventListener('pointerdown', closeMenu); window.removeEventListener('keydown', closeOnEscape) }
  }, [selectionMenu])

  useEffect(() => {
    if (!linkNotice) return
    const timer = window.setTimeout(() => setLinkNotice(''), 4200)
    return () => window.clearTimeout(timer)
  }, [linkNotice])

  useEffect(() => {
    if (!pendingRepositoryNavigation || activeRepoPath !== pendingRepositoryNavigation.path) return
    let disposed = false
    const timer = window.setTimeout(() => {
      if (disposed) return
      const currentIndex = indexRepositoryNote(activeRepoPath, markdown)
      const line = pendingRepositoryNavigation.line || resolveHeading(currentIndex, pendingRepositoryNavigation.fragment)?.line || 1
      markdownEditorRef.current?.revealLine(line)
      const root = mmRef.current?.getData()
      if (root) {
        let target: typeof root | undefined
        let targetAncestors: Array<typeof root> = []
        const sourceLine = line - 1
        const visit = (node: typeof root, ancestors: Array<typeof root>) => {
          if (node.content.includes(`data-lines="${sourceLine},`)) { target = node; targetAncestors = ancestors; return }
          for (const child of node.children || []) { if (!target) visit(child, [...ancestors, node]) }
        }
        visit(root, [])
        if (target) {
          targetAncestors.forEach((node) => { if (node.payload?.fold) node.payload.fold = 0 })
          void mmRef.current?.renderData().then(async () => {
            if (!target) return
            await mmRef.current?.setHighlight(target)
            await mmRef.current?.centerNode(target, { left: 48, right: 48, top: 48, bottom: 48 })
          })
        }
      }
      setPendingRepositoryNavigation(null)
    }, 280)
    return () => { disposed = true; window.clearTimeout(timer) }
  }, [activeRepoPath, markdown, pendingRepositoryNavigation])

  useEffect(() => {
    if (!activeRepoPath) return
    const revision = (remoteCacheRevisionRef.current.get(activeRepoPath) || 0) + 1
    remoteCacheRevisionRef.current.set(activeRepoPath, revision)
    const timer = window.setTimeout(() => {
      if (remoteCacheRevisionRef.current.get(activeRepoPath) !== revision) return
      setCachedFiles((current) => {
        const file = current.find((item) => item.path === activeRepoPath)
        if (!file || file.content === markdown) return current
        const next = {
          ...file,
          content: markdown,
          status: (file.status === 'added' ? 'added' : file.originalPath !== file.path ? 'renamed' : markdown === file.baseContent ? 'clean' : 'modified') as CachedMarkdownFile['status'],
          updatedAt: Date.now(),
        }
        const operation = putCachedFile(next).catch(() => setGithubError('本地缓存写入失败'))
        remoteCacheQueueRef.current.set(activeRepoPath, operation)
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
    document.documentElement.dataset.theme = previewDarkMode ? 'dark' : 'light'
    const svg = svgRef.current
    if (svg) {
      const codeStyle = documentRenderConfig.style
      svg.style.setProperty('--markmap-text-color', cssDeclaration(codeStyle, '--markmap-text-color') || (previewDarkMode ? previewLightText : previewDarkText))
      svg.style.setProperty('--markmap-circle-open-bg', cssDeclaration(codeStyle, '--markmap-circle-open-bg') || (previewDarkMode ? '#191c22' : '#ffffff'))
      svg.style.setProperty('--markmap-code-bg', cssDeclaration(codeStyle, '--markmap-code-bg') || previewCodeBackground)
      svg.style.setProperty('--markmap-code-color', cssDeclaration(codeStyle, '--markmap-code-color') || (previewDarkMode ? previewLightText : previewDarkText))
      svg.style.setProperty('--markmap-a-color', previewLinkColor)
    }
  }, [documentRenderConfig.style, previewCodeBackground, previewDarkMode, previewLinkColor])

  useEffect(() => {
    const desktop = desktopApi()
    if (!desktop) return
    if (!nativeThemeSyncSkippedRef.current) {
      nativeThemeSyncSkippedRef.current = true
      return
    }
    if (nativeThemeSystemUpdateRef.current) {
      nativeThemeSystemUpdateRef.current = false
      return
    }
    void desktop.setNativeTheme(previewDarkMode ? 'dark' : 'light').catch(() => {})
  }, [previewDarkMode])

  useEffect(() => {
    const desktop = desktopApi()
    if (!desktop || !systemThemeBackgrounds.has(settings.previewBackgroundColor.toLowerCase())) return
    return desktop.onNativeThemeChanged(({ shouldUseDarkColors, themeSource }) => {
      if (themeSource !== 'system') return
      nativeThemeSystemUpdateRef.current = true
      const nextBackground = shouldUseDarkColors ? '#15181d' : '#fafafa'
      setDark(shouldUseDarkColors)
      setSettings((current) => ({ ...current, previewBackgroundColor: nextBackground }))
    })
  }, [settings.previewBackgroundColor])

  useEffect(() => {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)) } catch { /* storage may be disabled */ }
    const svg = svgRef.current
    if (!svg) return
    const font = codeFont.shorthand || `${effectiveFontWeightCss} ${effectiveFontSizeCss}/1.35 ${effectiveFontFamily}`
    svg.style.setProperty('--markmap-font', font)
    window.setTimeout(() => void mmRef.current?.setData().then(() => mmRef.current?.fit()), 50)
  }, [codeFont.shorthand, effectiveFontFamily, effectiveFontSizeCss, effectiveFontWeightCss, settings])

  useEffect(() => {
    if (!desktopApi() || !desktopWorkspaceRestoredRef.current) return
    const session: DesktopWorkspaceSession = {
      repositorySource,
      editorView,
      localRepositoryId: activeLocalFile?.repositoryId || localGitState.activeId,
      localPath: activeLocalFile?.path || null,
      remotePath: activeRepoPath,
    }
    try { localStorage.setItem(DESKTOP_WORKSPACE_KEY, JSON.stringify(session)) } catch { /* storage may be disabled */ }
  }, [activeLocalFile, activeRepoPath, editorView, localGitState.activeId, repositorySource])

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

  useEffect(() => {
    if (!desktopMenuOpen) return
    const closeMenu = (event: PointerEvent) => {
      if (!desktopMenuRef.current?.contains(event.target as Node)) setDesktopMenuOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setDesktopMenuOpen(false) }
    document.addEventListener('pointerdown', closeMenu)
    document.addEventListener('keydown', closeOnEscape)
    return () => { document.removeEventListener('pointerdown', closeMenu); document.removeEventListener('keydown', closeOnEscape) }
  }, [desktopMenuOpen])

  const openFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => applyOpenedMarkdown(file.name, String(reader.result || ''), `upload:${file.name}:${file.size}:${file.lastModified}`)
    reader.readAsText(file)
    event.target.value = ''
  }

  const chooseMarkdownFile = async () => {
    const desktop = desktopApi()
    if (!desktop) {
      fileInputRef.current?.click()
      return
    }
    const file = await desktop.openMarkdown()
    if (file) applyOpenedMarkdown(file.name, file.content, `desktop:${file.id}`, { desktopFileId: file.id, desktopPath: file.path, savedContent: file.content })
  }

  useEffect(() => {
    if (!desktopApi()) return
    const handleDesktopShortcut = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return
      const key = event.key.toLocaleLowerCase()
      if (!['t', 'o', 'w'].includes(key)) return
      event.preventDefault()
      if (key === 't') createBlankDocumentTab()
      else if (key === 'o') void chooseMarkdownFile()
      else closeDocumentTab(activeTabId)
    }
    window.addEventListener('keydown', handleDesktopShortcut)
    return () => window.removeEventListener('keydown', handleDesktopShortcut)
  }, [activeTabId, closeDocumentTab, createBlankDocumentTab])

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

  const createExportSvg = (backgroundColor: string, darkMode: boolean, transparentBackground: boolean) => {
    const svg = svgRef.current
    const mm = mmRef.current
    if (!svg || !mm) throw new Error('思维导图尚未准备好')
    const { x1, y1, x2, y2 } = mm.state.rect
    const padding = 48
    const width = Math.max(1, Math.ceil(x2 - x1 + padding * 2))
    const height = Math.max(1, Math.ceil(y2 - y1 + padding * 2))
    const clone = svg.cloneNode(true) as SVGSVGElement
    const tablePadding = clone.querySelectorAll('foreignObject table').length * 20
    const outputHeight = height + tablePadding
    const textColor = darkMode ? previewLightText : previewDarkText
    const exportCodeBackground = codeBackgroundColor(backgroundColor, darkMode)
    const linkColor = cssDeclaration(documentRenderConfig.style, '--markmap-a-color') || accessibleLinkColor(backgroundColor)
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    clone.style.setProperty('--markmap-text-color', textColor)
    clone.style.setProperty('--markmap-code-bg', exportCodeBackground)
    clone.style.setProperty('--markmap-code-color', textColor)
    clone.style.setProperty('--markmap-circle-open-bg', darkMode ? '#191c22' : '#ffffff')
    clone.style.setProperty('--markmap-a-color', linkColor)
    clone.querySelectorAll<SVGTextElement>('text, tspan').forEach((element) => element.style.setProperty('fill', textColor, 'important'))
    const style = document.createElementNS('http://www.w3.org/2000/svg', 'style')
    style.textContent = `${katexStyles}
.markmap-foreign { color: ${textColor} !important; font-family: ${effectiveFontFamily}; font-size: ${effectiveFontSizeCss}; line-height: 1.35; }
.markmap-foreign, .markmap-foreign * { color: ${textColor} !important; }
.markmap-foreign a, .markmap-foreign a * { color: ${linkColor} !important; -webkit-text-fill-color: ${linkColor} !important; }
.markmap-foreign table { border-spacing: 0; font-size: .9em; }
.markmap-foreign th, .markmap-foreign td { padding: .3em .55em; }
.markmap-foreign table, .markmap-foreign th, .markmap-foreign td { background: transparent !important; }
.markmap-foreign th { font-weight: 650; }
.markmap-foreign img { display: block; width: auto; max-width: min(28em, 420px); height: auto; max-height: 280px; object-fit: contain; border-radius: 8px; }
.markmap-foreign img[alt$='图标'] { width: 44px; height: 44px; max-width: 44px; max-height: 44px; border-radius: 6px; }
.markmap-foreign pre { max-width: 100%; white-space: pre-wrap !important; overflow-wrap: anywhere !important; word-break: break-word !important; }
.markmap-foreign pre > code { display: block; width: 100%; max-width: 100%; box-sizing: border-box; white-space: inherit !important; overflow-wrap: inherit !important; word-break: inherit !important; }
.markmap-foreign pre, .markmap-foreign code { color: ${textColor} !important; background: ${exportCodeBackground} !important; }
.markmap-foreign .markmap-task-box { display: inline-block; width: 1em; height: 1em; margin: 0 .35em -.15em 0; border: 1.5px solid currentColor; border-radius: .25em; vertical-align: baseline; }
.markmap-foreign .markmap-task-box[data-checked='true'] { color: #fff !important; background: #7056e8 !important; border-color: #7056e8 !important; }
.markmap-foreign .markmap-task-box[data-checked='true']::after { content: '✓'; display: block; font-size: .75em; line-height: 1.25em; text-align: center; }
.markmap-collapse-control, .markmap-collapse-hit { cursor: pointer; pointer-events: all; }
${documentRenderConfig.style}
.markmap-node text { fill: ${textColor} !important; }`
    clone.prepend(style)
    clone.setAttribute('viewBox', `${x1 - padding} ${y1 - padding} ${width} ${outputHeight}`)
    clone.setAttribute('width', String(width * exportScale))
    clone.setAttribute('height', String(outputHeight * exportScale))
    clone.querySelectorAll('g.markmap-node[data-path]').forEach((node) => {
      const circle = node.querySelector(':scope > circle')
      if (!circle) return
      circle.classList.add('markmap-collapse-control')
      circle.setAttribute('pointer-events', 'all')
      node.append(circle)
      const hitArea = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
      hitArea.setAttribute('class', 'markmap-collapse-hit')
      hitArea.setAttribute('cx', circle.getAttribute('cx') || '0')
      hitArea.setAttribute('cy', circle.getAttribute('cy') || '0')
      hitArea.setAttribute('r', '12')
      hitArea.setAttribute('fill', 'transparent')
      hitArea.setAttribute('stroke', 'none')
      hitArea.setAttribute('pointer-events', 'all')
      node.append(hitArea)
    })
    clone.querySelector('g')?.removeAttribute('transform')
    const background = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    background.setAttribute('x', String(x1 - padding)); background.setAttribute('y', String(y1 - padding))
    background.setAttribute('width', String(width)); background.setAttribute('height', String(outputHeight))
    background.setAttribute('fill', transparentBackground ? 'none' : backgroundColor)
    const firstGroup = clone.querySelector('g')
    if (firstGroup) clone.insertBefore(background, firstGroup)
    return { source: new XMLSerializer().serializeToString(clone), width, height: outputHeight }
  }

  const prepareExportSvg = async (source: string, darkMode: boolean) => {
    const liveForeignObjects = Array.from(svgRef.current?.querySelectorAll<SVGForeignObjectElement>('foreignObject') || [])
    const documentNode = new DOMParser().parseFromString(source, 'image/svg+xml')
    documentNode.querySelectorAll('style').forEach((style) => { style.textContent = removeExternalFontFaces(style.textContent || '') })
    const foreignObjects = Array.from(documentNode.querySelectorAll('foreignObject'))
    foreignObjects.forEach((foreignObject, index) => {
      const liveForeignObject = liveForeignObjects[index]
      const liveContent = liveForeignObject ? getForeignContentElement(liveForeignObject) : null
      const targetContent = foreignObject.firstElementChild?.firstElementChild
      if (liveContent && targetContent) inlineComputedStyles(liveContent, targetContent)
    })
    const textColor = darkMode ? previewLightText : previewDarkText
    const exportCodeBackground = codeBackgroundColor(previewBackgroundColor, darkMode)
    const linkColor = cssDeclaration(documentRenderConfig.style, '--markmap-a-color') || accessibleLinkColor(previewBackgroundColor)
    const appendInlineStyle = (element: Element, declarations: string) => {
      const existing = element.getAttribute('style') || ''
      element.setAttribute('style', `${existing}${existing ? ';' : ''}${declarations}`)
    }
    foreignObjects.forEach((foreignObject) => {
      const content = foreignObject.querySelector('.markmap-foreign') || foreignObject.firstElementChild?.firstElementChild
      if (!content) return
      appendInlineStyle(content, `color:${textColor} !important;-webkit-text-fill-color:${textColor} !important`)
      content.querySelectorAll('a, a *').forEach((element) => appendInlineStyle(element, `color:${linkColor} !important;-webkit-text-fill-color:${linkColor} !important`))
      content.querySelectorAll('pre, code').forEach((element) => appendInlineStyle(element, `color:${textColor} !important;background-color:${exportCodeBackground} !important`))
      content.querySelectorAll('table, th, td').forEach((element) => appendInlineStyle(element, `background-color:transparent !important`))
      content.querySelectorAll('th').forEach((element) => appendInlineStyle(element, `color:${textColor} !important`))
    })
    const exportNodes = Array.from(documentNode.querySelectorAll('g.markmap-node[data-path]')).map((element) => {
      const transform = element.getAttribute('transform') || 'translate(0, 0)'
      const match = transform.match(/translate\(\s*(-?[\d.]+)[,\s]+(-?[\d.]+)/)
      const foreignObject = element.querySelector(':scope > foreignObject')
      const extraHeight = foreignObject?.querySelector('table') ? 20 : 0
      const height = Number(foreignObject?.getAttribute('height') || 30) + extraHeight
      if (foreignObject && extraHeight) foreignObject.setAttribute('height', String(height))
      const line = element.querySelector(':scope > line')
      if (line && extraHeight) {
        line.setAttribute('y1', String(height + .6875))
        line.setAttribute('y2', String(height + .6875))
      }
      return { element, path: element.getAttribute('data-path') || '', x: match ? Number(match[1]) : 0, baseY: match ? Number(match[2]) : 0, height, extraHeight }
    })
    const exportNodeByPath = new Map(exportNodes.map((node) => [node.path, node]))
    const exportPositions = new Map<string, number>()
    let exportVerticalOffset = 0
    exportNodes.slice().sort((a, b) => a.baseY - b.baseY).forEach((node) => {
      const nextY = node.baseY + exportVerticalOffset
      exportPositions.set(node.path, nextY)
      node.element.setAttribute('transform', `translate(${node.x}, ${nextY})`)
      exportVerticalOffset += node.extraHeight
    })
    documentNode.querySelectorAll<SVGPathElement>('.markmap-link[data-path]').forEach((link) => {
      const path = link.getAttribute('data-path') || ''
      const node = exportNodeByPath.get(path)
      const parent = exportNodeByPath.get(path.split('.').slice(0, -1).join('.'))
      const numbers = link.getAttribute('d')?.match(/-?[\d.]+/g)?.map(Number) || []
      if (!node || !parent || numbers.length < 8) return
      const startY = (exportPositions.get(parent.path) || parent.baseY) + parent.height + .6875
      const endY = (exportPositions.get(node.path) || node.baseY) + node.height + .6875
      link.setAttribute('d', `M${numbers[0]},${startY}C${numbers[2]},${startY},${numbers[4]},${endY},${numbers[6]},${endY}`)
    })
    const liveInputs = Array.from(svgRef.current?.querySelectorAll<HTMLInputElement>('foreignObject input[type="checkbox"]') || [])
    const inputs = Array.from(documentNode.querySelectorAll('foreignObject input[type="checkbox"]'))
    inputs.forEach((input, index) => {
      const liveInput = liveInputs[index]
      const checked = liveInput?.checked ?? input.hasAttribute('checked')
      const box = documentNode.createElementNS('http://www.w3.org/1999/xhtml', 'span')
      box.setAttribute('class', 'markmap-task-box')
      box.setAttribute('data-checked', String(checked))
      input.replaceWith(box)
    })
    const liveImages = Array.from(svgRef.current?.querySelectorAll<HTMLImageElement>('foreignObject img') || [])
    const images = Array.from(documentNode.querySelectorAll('foreignObject img'))
    await Promise.all(images.map(async (image, index) => {
      const liveImage = liveImages[index]
      const sourceUrl = liveImage?.currentSrc || liveImage?.getAttribute('src') || image.getAttribute('src') || ''
      const resolvedSource = await resolveExportImageSource(sourceUrl)
      if (resolvedSource && resolvedSource !== sourceUrl) image.setAttribute('src', resolvedSource)
    }))
    return new XMLSerializer().serializeToString(documentNode.documentElement)
  }

  const createInteractiveHtml = (source: string, baseName: string, backgroundColor: string, darkMode: boolean) => {
    const safeSource = source.replace(/<\/script/gi, '<\\/script')
  const script = `
<script>
(() => {
  const svg = document.querySelector('svg.markmap');
  if (!svg) return;
  const view = (svg.getAttribute('viewBox') || '0 0 100 100').split(/\\s+/).map(Number);
  const state = { x: view[0], y: view[1], width: view[2], height: view[3], base: view.slice() };
  const nodes = Array.from(svg.querySelectorAll('g.markmap-node[data-path]')).map((element) => {
    const transform = element.getAttribute('transform') || 'translate(0, 0)';
    const match = transform.match(/translate\\(\\s*(-?[\\d.]+)[,\\s]+(-?[\\d.]+)/);
    const foreignObject = element.querySelector('foreignObject');
    return {
      element,
      path: element.getAttribute('data-path'),
      x: match ? Number(match[1]) : 0,
      baseY: match ? Number(match[2]) : 0,
      height: Number(foreignObject?.getAttribute('height') || 30),
      parent: null,
      children: [],
    };
  });
  const nodeByPath = new Map(nodes.map((node) => [node.path, node]));
  nodes.forEach((node) => {
    const parentPath = node.path?.split('.').slice(0, -1).join('.') || '';
    const parent = parentPath ? nodeByPath.get(parentPath) : null;
    if (parent) {
      node.parent = parent;
      parent.children.push(node);
    }
  });
  nodes.forEach((node) => node.children.sort((a, b) => a.baseY - b.baseY));
  const root = nodeByPath.get('1') || nodes.find((node) => !node.parent) || null;
  const links = Array.from(svg.querySelectorAll('.markmap-link[data-path]')).map((element) => ({
    element,
    path: element.getAttribute('data-path'),
    numbers: (element.getAttribute('d') || '').match(/-?[\\d.]+/g)?.map(Number) || [],
  }));
  const render = () => svg.setAttribute('viewBox', state.x + ' ' + state.y + ' ' + state.width + ' ' + state.height);
  const zoom = (factor, clientX, clientY) => {
    const rect = svg.getBoundingClientRect();
    const px = clientX == null ? .5 : (clientX - rect.left) / rect.width;
    const py = clientY == null ? .5 : (clientY - rect.top) / rect.height;
    const worldX = state.x + state.width * px;
    const worldY = state.y + state.height * py;
    state.width = Math.max(state.base[2] * .08, Math.min(state.base[2] * 20, state.width * factor));
    state.height = Math.max(state.base[3] * .08, Math.min(state.base[3] * 20, state.height * factor));
    state.x = worldX - state.width * px;
    state.y = worldY - state.height * py;
    render();
  };
  const fit = () => { state.x = state.base[0]; state.y = state.base[1]; state.width = state.base[2]; state.height = state.base[3]; render(); };
  const isCollapsed = (node) => node?.element.getAttribute('data-collapsed') === 'true';
  const isHidden = (node) => {
    let current = node?.parent;
    while (current) {
      if (isCollapsed(current)) return true;
      current = current.parent;
    }
    return false;
  };
  const visibleChildren = (node) => (isCollapsed(node) ? [] : node.children);
  const calculateLayout = () => {
    const positions = new Map();
    const leaves = [];
    const cursor = { value: 0 };
    const place = (node) => {
      const children = visibleChildren(node);
      if (!children.length) {
        positions.set(node.path, cursor.value);
        leaves.push(node);
        cursor.value += node.height + 6;
        return;
      }
      children.forEach(place);
      const first = children[0];
      const last = children[children.length - 1];
      const firstCenter = positions.get(first.path) + first.height / 2;
      const lastCenter = positions.get(last.path) + last.height / 2;
      positions.set(node.path, (firstCenter + lastCenter) / 2 - node.height / 2);
    };
    if (root) {
      if (!isCollapsed(root)) root.children.forEach(place);
      positions.set(root.path, root.baseY);
    } else {
      nodes.filter((node) => !node.parent).forEach(place);
    }
    if (root && leaves.length) {
      const contentTop = Math.min(...leaves.map((node) => positions.get(node.path)));
      const contentBottom = Math.max(...leaves.map((node) => positions.get(node.path) + node.height));
      const offset = root.baseY + root.height / 2 - (contentTop + contentBottom) / 2;
      positions.forEach((value, path) => { if (path !== root.path) positions.set(path, value + offset); });
    }
    return positions;
  };
  const visibleAnchor = (node, positions) => {
    let current = node;
    while (current) {
      const y = positions.get(current.path);
      if (Number.isFinite(y) && !isHidden(current)) return { node: current, y };
      current = current.parent;
    }
    return null;
  };
  const transitionDuration = 240;
  let animationFrame = 0;
  const easeCubic = (value) => 1 - Math.pow(1 - value, 3);
  const readTransform = (element, fallbackX, fallbackY) => {
    const match = (element.getAttribute('transform') || '').match(/translate\\(\\s*(-?[\\d.]+)[,\\s]+(-?[\\d.]+)/);
    return { x: match ? Number(match[1]) : fallbackX, y: match ? Number(match[2]) : fallbackY };
  };
  const readOpacity = (element) => {
    const value = Number.parseFloat(element.style.opacity);
    return Number.isFinite(value) ? value : 1;
  };
  const pathForLink = (link, positions) => {
    const node = nodeByPath.get(link.path);
    const parent = node?.parent;
    if (!node || !parent) return null;
    const parentY = positions.get(parent.path);
    const nodeY = positions.get(node.path);
    if (!Number.isFinite(parentY) || !Number.isFinite(nodeY)) return null;
    const startY = parentY + parent.height + .6875;
    const endY = nodeY + node.height + .6875;
    const numbers = link.numbers;
    return [numbers[0], startY, numbers[2], startY, numbers[4], endY, numbers[6], endY];
  };
  const pathString = (numbers) => 'M' + numbers[0] + ',' + numbers[1] + 'C' + numbers[2] + ',' + numbers[3] + ',' + numbers[4] + ',' + numbers[5] + ',' + numbers[6] + ',' + numbers[7];
  const collapsePathForLink = (link, positions) => {
    const node = nodeByPath.get(link.path);
    const anchor = visibleAnchor(node?.parent, positions);
    const numbers = link.numbers;
    if (!anchor || numbers.length < 8) return null;
    const x = numbers[0];
    const y = anchor.y + anchor.node.height + .6875;
    return [x, y, x, y, x, y, x, y];
  };
  const applyLayout = (animate = false) => {
    const positions = calculateLayout();
    const nodeAnimations = nodes.map((node) => {
      const hidden = isHidden(node) || !Number.isFinite(positions.get(node.path));
      const current = readTransform(node.element, node.x, node.baseY);
      const anchor = visibleAnchor(node.parent, positions);
      const targetY = hidden
        ? (anchor ? anchor.y : node.baseY)
        : positions.get(node.path);
      return { node, hidden, from: { ...current, opacity: readOpacity(node.element) }, to: { x: node.x, y: targetY, opacity: hidden ? 0 : 1 } };
    });
    const linkAnimations = links.map((link) => {
      const node = nodeByPath.get(link.path);
      const parent = node?.parent;
      const target = pathForLink(link, positions);
      const hidden = !node || !parent || isHidden(node) || isHidden(parent) || !target;
      const current = link.element.getAttribute('d')?.match(/-?[\\d.]+/g)?.map(Number) || [];
      const source = current.length >= 8 ? current.slice(0, 8) : (target || [0, 0, 0, 0, 0, 0, 0, 0]);
      const collapseTarget = collapsePathForLink(link, positions) || source;
      return { link, hidden, from: source, to: hidden ? collapseTarget : target, fromOpacity: readOpacity(link.element), toOpacity: hidden ? 0 : 1 };
    });
    if (!animate) {
      nodeAnimations.forEach(({ node, hidden, to }) => {
        node.element.setAttribute('transform', 'translate(' + to.x + ', ' + to.y + ')');
        node.element.style.opacity = String(to.opacity);
        node.element.style.pointerEvents = hidden ? 'none' : '';
        node.element.setAttribute('visibility', hidden ? 'hidden' : 'visible');
      });
      linkAnimations.forEach(({ link, hidden, from, to, toOpacity }) => {
        link.element.setAttribute('d', pathString(to || from));
        link.element.style.opacity = String(toOpacity);
        link.element.setAttribute('visibility', hidden ? 'hidden' : 'visible');
      });
      return;
    }
    cancelAnimationFrame(animationFrame);
    nodeAnimations.forEach(({ node, hidden }) => {
      node.element.style.pointerEvents = hidden ? 'none' : '';
      node.element.setAttribute('visibility', 'visible');
    });
    linkAnimations.forEach(({ link }) => link.element.setAttribute('visibility', 'visible'));
    const startedAt = performance.now();
    const tick = (now) => {
      const progress = Math.min(1, (now - startedAt) / transitionDuration);
      const eased = easeCubic(progress);
      nodeAnimations.forEach(({ node, from, to }) => {
        const x = from.x + (to.x - from.x) * eased;
        const y = from.y + (to.y - from.y) * eased;
        node.element.setAttribute('transform', 'translate(' + x + ', ' + y + ')');
        node.element.style.opacity = String(from.opacity + (to.opacity - from.opacity) * eased);
      });
      linkAnimations.forEach(({ link, from, to, fromOpacity, toOpacity }) => {
        const numbers = from.map((value, index) => value + (to[index] - value) * eased);
        link.element.setAttribute('d', pathString(numbers));
        link.element.style.opacity = String(fromOpacity + (toOpacity - fromOpacity) * eased);
      });
      if (progress < 1) {
        animationFrame = requestAnimationFrame(tick);
        return;
      }
      nodeAnimations.forEach(({ node, hidden, to }) => {
        node.element.setAttribute('transform', 'translate(' + to.x + ', ' + to.y + ')');
        node.element.style.opacity = String(to.opacity);
        node.element.style.pointerEvents = hidden ? 'none' : '';
        node.element.setAttribute('visibility', hidden ? 'hidden' : 'visible');
      });
      linkAnimations.forEach(({ link, hidden, to, toOpacity }) => {
        link.element.setAttribute('d', pathString(to));
        link.element.style.opacity = String(toOpacity);
        link.element.setAttribute('visibility', hidden ? 'hidden' : 'visible');
      });
    };
    animationFrame = requestAnimationFrame(tick);
  };
  svg.addEventListener('wheel', (event) => { event.preventDefault(); zoom(event.deltaY > 0 ? 1.1 : .9, event.clientX, event.clientY); }, { passive: false });
  const toggleNode = (node) => {
    const collapsed = node.getAttribute('data-collapsed') !== 'true';
    node.setAttribute('data-collapsed', String(collapsed));
    applyLayout(true);
  };
  svg.querySelectorAll('circle.markmap-collapse-control, circle.markmap-collapse-hit').forEach((control) => {
    control.addEventListener('pointerup', (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      const node = control.closest('g.markmap-node[data-path]');
      if (node) toggleNode(node);
    });
  });
  let drag = null;
  svg.addEventListener('pointerdown', (event) => {
    if (event.target.closest && event.target.closest('foreignObject, g.markmap-node')) return;
    event.preventDefault();
    window.getSelection()?.removeAllRanges();
    drag = { x: event.clientX, y: event.clientY, viewX: state.x, viewY: state.y };
    svg.setPointerCapture(event.pointerId);
  });
  svg.addEventListener('pointermove', (event) => {
    if (!drag) return;
    const rect = svg.getBoundingClientRect();
    state.x = drag.viewX - (event.clientX - drag.x) * state.width / rect.width;
    state.y = drag.viewY - (event.clientY - drag.y) * state.height / rect.height;
    render();
  });
  svg.addEventListener('pointerup', () => { drag = null; });
  document.querySelector('[data-action="fit"]').addEventListener('click', fit);
  document.querySelector('[data-action="zoom-in"]').addEventListener('click', () => zoom(.8));
  document.querySelector('[data-action="zoom-out"]').addEventListener('click', () => zoom(1.25));
  applyLayout();
})();
</script>`
  const toolbarBackground = darkMode ? '#252a33dd' : '#ffffffdd'; const toolbarColor = darkMode ? '#f4f6f9' : '#30333a'; const toolbarBorder = darkMode ? '#4c5666' : '#dfe2e8';
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${baseName}</title><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:${backgroundColor}}body{font-family:system-ui,sans-serif;user-select:none}svg.markmap{display:block;width:100%;height:100%;touch-action:none}svg.markmap .markmap-node,svg.markmap .markmap-link{transition:none}.markmap-foreign,.markmap-foreign *{user-select:text}.markmap-export-toolbar{position:fixed;z-index:2;top:14px;right:14px;display:flex;gap:6px;padding:6px;border:1px solid ${toolbarBorder};border-radius:10px;background:${toolbarBackground};box-shadow:0 8px 22px #10131a1c}.markmap-export-toolbar button{height:30px;min-width:30px;padding:0 9px;border:1px solid ${toolbarBorder};border-radius:7px;background:${darkMode ? '#303743' : '#fff'};color:${toolbarColor};cursor:pointer;font:12px system-ui,sans-serif;user-select:none}.markmap-export-toolbar button:hover{border-color:#7056e8;color:#7056e8}</style></head><body><div class="markmap-export-toolbar" aria-label="思维导图工具"><button type="button" data-action="zoom-out" aria-label="缩小">−</button><button type="button" data-action="zoom-in" aria-label="放大">＋</button><button type="button" data-action="fit">适应</button></div>${safeSource}${script}</body></html>`
  }

  const exportDocument = async () => {
    setExporting(true)
    setExportError('')
    const baseName = fileName.replace(/\.(md|markdown)$/i, '') || 'markmap'
    try {
      if (exportFormat === 'md') {
        await saveBlob(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }), `${baseName}.md`)
      } else {
        await document.fonts.ready
        const { source, width, height } = createExportSvg(previewBackgroundColor, exportDarkMode, exportUsesTransparentBackground)
        const exportSource = await prepareExportSvg(source, exportDarkMode)
        if (exportFormat === 'svg') await saveBlob(new Blob([exportSource], { type: 'image/svg+xml;charset=utf-8' }), `${baseName}.svg`)
        else if (exportFormat === 'html') {
          await saveBlob(new Blob([createInteractiveHtml(exportSource, baseName, previewBackgroundColor, exportDarkMode)], { type: 'text/html;charset=utf-8' }), `${baseName}.html`)
        } else {
          const svgUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(exportSource)}`
          const image = new Image()
          await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('图像渲染失败')); image.src = svgUrl })
          const canvas = document.createElement('canvas')
          canvas.width = width * exportScale; canvas.height = height * exportScale
          const context = canvas.getContext('2d')
          if (!context) throw new Error('浏览器不支持画布导出')
          context.drawImage(image, 0, 0, canvas.width, canvas.height)
          const mime = exportFormat === 'png' ? 'image/png' : 'image/jpeg'
          const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mime, 0.94))
          if (!blob) throw new Error('导出文件生成失败')
          await saveBlob(blob, `${baseName}.${exportFormat === 'jpeg' ? 'jpg' : 'png'}`)
        }
      }
      setActivePanel(null)
    } catch (error) {
      setExportError(error instanceof Error ? error.message : '导出失败，请重试')
    } finally { setExporting(false) }
  }

  const gridColumns = editorCollapsed ? '0 18px 1fr' : `${editorWidth}% 18px 1fr`
  const hasOpenDocument = Boolean(activeDocumentTab)
  const lineCount = hasOpenDocument ? markdown.split('\n').length : 0
  const activeCachedFile = activeRepoPath ? cachedFiles.find((file) => file.path === activeRepoPath) : undefined
  const activeTabSnapshot = activeDocumentTab ? { ...activeDocumentTab, name: fileName, content: markdown } : null
  const activeTabUnsaved = activeTabSnapshot ? tabHasUnsavedChanges(activeTabSnapshot) : false
  const pendingCloseTab = pendingCloseTabId ? documentTabs.find((tab) => tab.id === pendingCloseTabId) : null
  const windowUnsavedCount = documentTabs.filter((tab) => tabHasUnsavedChanges(tab.id === activeTabId ? { ...tab, content: markdown } : tab)).length
  const activeLocalRepository = localGitState.repositories.find((repository) => repository.id === localGitState.activeId)
  const localRepositoryAction = !activeLocalRepository
    ? 'clean'
    : !activeLocalRepository.isGitRepository
      ? 'clean'
    : activeLocalRepository.behindCount > 0
      ? 'sync'
      : activeLocalRepository.markdownChangedCount > 0
        ? 'commit'
        : activeLocalRepository.aheadCount > 0 || Boolean(activeLocalRepository.remoteName && !activeLocalRepository.upstream)
          ? 'push'
          : 'clean'
  const localRepositoryActionTitle = !activeLocalRepository
    ? 'Git 工作区干净'
    : !activeLocalRepository.isGitRepository
      ? '普通本地文件夹不支持 Git 版本管理'
    : localRepositoryAction === 'sync'
      ? `远端领先 ${activeLocalRepository.behindCount} 个提交，先同步后才能提交`
      : localRepositoryAction === 'commit'
        ? `自动生成说明并提交 ${activeLocalRepository.markdownChangedCount} 个 Markdown 变更`
        : localRepositoryAction === 'push'
          ? activeLocalRepository.upstream ? `推送 ${activeLocalRepository.aheadCount} 个本地提交` : '发布当前分支到远程'
          : 'Git 工作区干净'
  const agentLocalRepository = repositorySource === 'local' ? localGitState.repositories.find((repository) => repository.id === (activeLocalFile?.repositoryId || localGitState.activeId)) : undefined
  const agentUsesLocalRepository = repositorySource === 'local' && Boolean(agentLocalRepository)
  const agentUsesStandaloneFile = repositorySource !== 'local' && hasOpenDocument && !activeLocalFile && !activeRepoPath
  const agentLocalFiles = agentLocalRepository && localAgentContext.repositoryId === agentLocalRepository.id ? localAgentContext.files : []
  const agentWorkspaceKind: AgentWorkspaceRef['kind'] = agentUsesStandaloneFile ? 'file' : repositorySource === 'local' ? 'local' : 'remote'
  const agentWorkspaceLocator = agentWorkspaceKind === 'file' ? (activeDocumentTab?.sourceKey || activeTabId) : agentWorkspaceKind === 'local' ? agentLocalRepository?.root || 'unbound' : githubConfig ? `${githubConfig.owner}/${githubConfig.repo}` : 'unbound'
  const agentWorkspaceKey = workspaceKeyFor(agentWorkspaceKind, agentWorkspaceLocator)
  const agentWorkspaceLabel = agentWorkspaceKind === 'file' ? fileName : agentWorkspaceKind === 'local' ? agentLocalRepository?.name || '未绑定本地文件夹' : githubConfig ? `${githubConfig.owner}/${githubConfig.repo}` : '未绑定远程仓库'
  const agentWorkspace = useMemo<AgentWorkspaceRef>(() => ({ key: agentWorkspaceKey, kind: agentWorkspaceKind, label: agentWorkspaceLabel, locator: agentWorkspaceLocator }), [agentWorkspaceKey, agentWorkspaceKind, agentWorkspaceLabel, agentWorkspaceLocator])
  const selectAgentWorkspace = useCallback(async (target: AgentWorkspaceRef): Promise<AgentWorkspaceSelectionResult> => {
    if (target.key === agentWorkspace.key) {
      setEditorView('agent')
      return { matched: true }
    }
    if (target.kind === 'remote') {
      const locator = normalizeWorkspaceLocator('remote', target.locator || target.key.replace(/^remote:/, ''))
      const profile = githubProfiles.find((item) => normalizeWorkspaceLocator('remote', `${item.config.owner}/${item.config.repo}`) === locator)
      if (!profile) return { matched: false, message: '继续使用该工作区对话可能出现问题。当前设备没有找到对应的远程仓库配置。' }
      await switchRemoteRepository(profile.id, 'agent')
      return { matched: true }
    }
    if (target.kind === 'local') {
      const locator = normalizeWorkspaceLocator('local', target.locator || '')
      const repository = localGitState.repositories.find((item) => normalizeWorkspaceLocator('local', item.root) === locator)
      if (!repository) return { matched: false, message: '继续使用该工作区对话可能出现问题。当前设备没有找到根目录完全匹配的本地文件夹。' }
      setActiveLocalFile(null)
      setActiveRepoPath(null)
      await selectLocalRepository(repository.id, 'agent')
      return { matched: true }
    }
    return { matched: false, message: '继续使用该工作区对话可能出现问题。独立文件在当前设备上没有找到完全匹配的来源。' }
  }, [agentWorkspace.key, githubProfiles, localGitState.repositories, selectLocalRepository, switchRemoteRepository])
  const standaloneAgentFiles: AgentSourceFile[] = agentUsesStandaloneFile ? [{ path: fileName, content: markdown, status: activeTabUnsaved ? 'modified' : 'clean' }] : []
  const agentFiles = agentUsesStandaloneFile ? standaloneAgentFiles : agentUsesLocalRepository ? agentLocalFiles : cachedFiles.filter((file) => file.status !== 'deleted')
  const agentActivePath = agentUsesStandaloneFile ? fileName : agentUsesLocalRepository ? activeLocalFile?.path || null : activeRepoPath
  const agentApplyChange = agentUsesStandaloneFile ? applyStandaloneAgentChange : agentUsesLocalRepository ? applyLocalAgentChange : applyAgentChange
  const agentCreateFile = agentUsesStandaloneFile ? rejectStandaloneAgentCreate : agentUsesLocalRepository ? createLocalAgentFile : createAgentFile
  const agentCommit = agentUsesStandaloneFile ? rejectStandaloneAgentCommit : agentUsesLocalRepository ? commitLocalAgentChanges : pushRepositoryChanges
  const agentGitContext = agentUsesStandaloneFile ? emptyAgentGitContext : agentUsesLocalRepository ? getLocalAgentGitContext : getAgentGitContext
  const agentFileCount = agentUsesStandaloneFile ? 1 : agentUsesLocalRepository ? agentLocalRepository?.files.length || 0 : remoteFiles.length
  const agentPaths = agentUsesStandaloneFile ? [fileName] : agentUsesLocalRepository ? agentLocalRepository?.files.map((file) => file.path) || [] : remoteFiles.map((file) => file.path)
  const loadAgentFiles = agentUsesStandaloneFile ? noopLoadAgentFiles : agentUsesLocalRepository ? loadAllLocalAgentNotes : loadAllRepositoryNotes
  const changedFiles = cachedFiles.filter((file) => file.status !== 'clean')
  const hasRepositoryDrafts = changedFiles.length > 0 || virtualFolders.length > 0
  const repositoryDisplayCachedFiles = repositoryCommitRef ? [] : cachedFiles
  const repositoryDisplayVirtualFolders = repositoryCommitRef ? [] : virtualFolders
  const repositoryRows = buildRepositoryRows(remoteFiles, repositoryDisplayCachedFiles, repositoryDisplayVirtualFolders, collapsedFolders)
  const localRepositoryRows = buildLocalRepositoryRows(activeLocalRepository?.files || [], localCollapsedFolders)
  const repositorySaveRows = buildRepositoryRows(remoteFiles, cachedFiles, virtualFolders, repositorySaveCollapsedFolders)
  const repositoryMenuFile = repositoryMenu?.target.type === 'file' ? repositoryRows.find((row) => row.type === 'file' && row.path === repositoryMenu.target.path) : undefined
  const repositoryRefreshLoading = githubBusyAction === 'load-repository' || githubBusyAction === 'refresh' || githubBusyAction === 'switch-branch' || githubBusyAction === 'open-commit'
  const repositoryDiscardLoading = githubBusyAction === 'discard'
  const repositorySyncLoading = githubBusyAction === 'sync'
  const titleSyncState = activeTabUnsaved ? 'dirty' : activeCachedFile ? githubBusy ? 'syncing' : activeCachedFile.status === 'clean' ? 'synced' : 'dirty' : saveState
  const titleSyncText = activeTabUnsaved ? '未保存' : activeCachedFile ? githubBusy ? '同步中' : activeCachedFile.status === 'clean' ? '已同步' : '已暂存但未推送' : activeDocumentTab?.desktopFileId || activeLocalFile ? '已保存到磁盘' : saveState === 'saved' ? '当前内容已更新' : '正在更新预览…'
  const helpTips = [
    {
      kicker: 'TIP 01 · START',
      title: t('快速上手'),
      description: t('把 Markdown 当作内容，把思维导图当作结构预览。'),
      content: <>
        <div className="help-tip-callout"><Icon name="map" /><span><strong>{t('左侧写内容，右侧看结构。')}</strong> {t('输入 Markdown 后，预览会即时生成；本页用于快速了解编辑器和思维导图的主要功能。')}</span></div>
        <div className="help-tip-steps"><div><b>01</b><span><strong>{t('编写')}</strong>{t('在左侧编辑器中输入标题、列表或正文。')}</span></div><div><b>02</b><span><strong>{t('观察')}</strong>{t('右侧会同步更新节点、层级和连接关系。')}</span></div><div><b>03</b><span><strong>{t('保存')}</strong>{t('使用顶部导出保存副本，或绑定 GitHub 管理文档。')}</span></div></div>
        <p className="help-tip-note">{t('刷新页面会恢复默认操作指南；重要内容请及时导出或保存到仓库。')}</p>
      </>,
    },
    {
      kicker: 'TIP 02 · CANVAS',
      title: t('节点与画布操作'),
      description: t('先选中，再编辑；画布本身可以自由移动和缩放。'),
      content: <div className="help-tip-actions"><div><b>{t('单击节点')}</b><span>{t('选中节点，Enter 新增同级节点。')}</span></div><div><b>{t('双击节点')}</b><span>{t('进入文字编辑，Enter 保存当前文字。')}</span></div><div><b>Tab</b><span>{t('为当前节点新增一个子节点。')}</span></div><div><b>Delete / Backspace</b><span>{t('删除选中的整个节点；需要时可点击顶部“撤回”。')}</span></div><div><b>{t('拖动画布')}</b><span>{t('按住空白区域拖动，浏览超出视口的内容。')}</span></div><div><b>{t('滚轮 / 触控板')}</b><span>{t('缩放画布；点击节点圆点折叠或展开分支。')}</span></div><div><b>{t('适应画布')}</b><span>{t('点击预览右上角的适应按钮，让完整导图回到视口。')}</span></div><div><b>{t('分割线')}</b><span>{t('拖动中间分割线调整编辑器和预览的宽度。')}</span></div></div>,
    },
    {
      kicker: 'TIP 03 · MARKDOWN',
      title: t('Markdown 丰富语法'),
      description: t('用轻量语法表达层级、重点和更完整的资料。'),
      content: <>
        <div className="help-tip-section"><strong>{t('文字与结构')}</strong><div className="help-tip-chip-row"><code># {t('标题')}</code><code>**{t('粗体')}**</code><code>*{t('斜体')}*</code><code>~~{t('删除线')}~~</code><code>=={t('高亮')}==</code><code>`{t('行内代码')}`</code></div></div>
        <div className="help-tip-section"><strong>{t('适合思维导图的内容')}</strong><ul><li>{t('使用标题和缩进列表组织层级，标题越深，分支层级越深。')}</li><li>{t('有序列表、无序列表和任务清单适合拆解步骤与待办事项。')}</li><li>{t('表格、LaTeX 公式、代码块和在线图片可以保留在 Markdown 中。')}</li></ul></div>
        <div className="help-tip-callout subtle"><Icon name="check" /><span>{t('较长文字会按节点最大宽度自动换行；需要更清晰的结构时，可以拆成多个子节点。')}</span></div>
      </>,
    },
    {
      kicker: 'TIP 04 · EDIT & EXPORT',
      title: t('编辑、显示与导出'),
      description: t('把阅读体验调到合适状态，再选择适合用途的输出格式。'),
      content: <div className="help-tip-grid"><div><strong>{t('编辑器设置')}</strong><span>{t('调整 Markdown 字号和语法高亮方案。')}</span></div><div><strong>{t('预览设置')}</strong><span>{t('调整节点字号、字体、字重、配色冻结层级和点阵背景。')}</span></div><div><strong>{t('主题切换')}</strong><span>{t('顶部月亮/太阳按钮切换深色与浅色模式。')}</span></div><div><strong>{t('导出 Markdown')}</strong><span>{t('保留可继续编辑的源文件。')}</span></div><div><strong>{t('导出 SVG / HTML')}</strong><span>{t('适合网页、分享和无限缩放。')}</span></div><div><strong>{t('导出 PNG / JPEG')}</strong><span>{t('适合图片分享，可选择渲染倍率。')}</span></div></div>,
    },
    {
      kicker: 'TIP 05 · GITHUB',
      title: t('GitHub 文档同步'),
      description: t('文件先保存在浏览器本地缓存，确认后再推送到远程仓库。'),
      content: <>
        <div className="help-tip-steps"><div><b>01</b><span><strong>绑定</strong>在仓库设置中填写仓库、分支和具有 Contents 权限的令牌。</span></div><div><b>02</b><span><strong>编辑</strong>打开文件后修改内容，状态会显示为 M；新文件显示为 A。</span></div><div><b>03</b><span><strong>同步</strong>点击仓库页同步按钮，一次性创建 commit 并推送。</span></div></div>
        <div className="help-tip-statuses"><span><i className="clean" />已同步</span><span><i className="dirty" />已修改</span><span><i className="added" />新文件</span><span><i className="remote" />尚未拉取</span></div>
        <p className="help-tip-note">仓库底部的分支按钮可以查看 Git Graph、切换分支，或打开某个 commit 阶段的文件树。历史文件打开后是独立缓存，不会改变当前分支的编辑状态。</p>
      </>,
    },
  ]
  const currentHelpTip = helpTips[helpTipIndex]

  return (
    <main className="app-shell">
      {documentRenderConfig.style && <style>{documentRenderConfig.style}</style>}
      <header className="topbar">
        <div className="brand-area" ref={desktopMenuRef}>{desktopApi() && <button type="button" className="desktop-menu-trigger" aria-label="应用菜单" title="应用菜单" aria-expanded={desktopMenuOpen} onClick={() => setDesktopMenuOpen((value) => !value)}><Icon name="menu" /></button>}<div className="brand" aria-label="markmap++"><span className="brand-mark"><img src={brandIconUrl} alt="" /></span><span className="brand-name">markmap<span>++</span></span></div>{desktopMenuOpen && <div className="desktop-app-menu" role="menu" aria-label="markmap++ 应用菜单"><nav><button className={desktopMenuSection === 'file' ? 'active' : ''} onMouseEnter={() => setDesktopMenuSection('file')} onClick={() => setDesktopMenuSection('file')}>文件<Icon name="chevron-right" /></button><button className={desktopMenuSection === 'edit' ? 'active' : ''} onMouseEnter={() => setDesktopMenuSection('edit')} onClick={() => setDesktopMenuSection('edit')}>编辑<Icon name="chevron-right" /></button><button className={desktopMenuSection === 'view' ? 'active' : ''} onMouseEnter={() => setDesktopMenuSection('view')} onClick={() => setDesktopMenuSection('view')}>视图<Icon name="chevron-right" /></button><button className={desktopMenuSection === 'help' ? 'active' : ''} onMouseEnter={() => setDesktopMenuSection('help')} onClick={() => setDesktopMenuSection('help')}>帮助<Icon name="chevron-right" /></button></nav><section>{desktopMenuSection === 'file' ? <><button onClick={() => { setDesktopMenuOpen(false); createBlankDocumentTab() }}><span>新建标签页</span><kbd>Ctrl+T</kbd></button><button onClick={() => { setDesktopMenuOpen(false); void chooseMarkdownFile() }}><span>打开文件…</span><kbd>Ctrl+O</kbd></button><button onClick={() => { setDesktopMenuOpen(false); void openLocalGitFolder() }}><span>打开本地文件夹…</span></button><hr/><button disabled={Boolean(activeRepoPath) || !activeTabUnsaved} onClick={() => { setDesktopMenuOpen(false); if (activeLocalFile) void saveActiveLocalDocument(); else void saveStandaloneDocument() }}><span>保存</span><kbd>Ctrl+S</kbd></button><button onClick={() => { setDesktopMenuOpen(false); setExportError(''); setExportFormat('md'); setExportTab('file'); setActivePanel('export') }}><span>另存 / 导出…</span></button><hr/><button onClick={() => { setDesktopMenuOpen(false); closeDocumentTab(activeTabId) }}><span>关闭标签页</span><kbd>Ctrl+W</kbd></button></> : desktopMenuSection === 'edit' ? <><button disabled={!canUndo} onClick={() => { setDesktopMenuOpen(false); undoLastChange() }}><span>撤销上次修改</span><kbd>Ctrl+Z</kbd></button><button onClick={() => { setDesktopMenuOpen(false); setActivePanel('editor') }}><span>编辑器偏好设置</span></button></> : desktopMenuSection === 'view' ? <><button onClick={() => { setDesktopMenuOpen(false); setEditorView('markdown') }}><span>Markdown 编辑器</span></button><button onClick={() => { setDesktopMenuOpen(false); openGitHubPanel() }}><span>仓库</span></button><button onClick={() => { setDesktopMenuOpen(false); setEditorView('agent') }}><span>Agent</span></button><hr/><button onClick={() => { setDesktopMenuOpen(false); setActivePanel('preview') }}><span>预览设置</span></button><button onClick={() => { setDesktopMenuOpen(false); void toggleFullscreen() }}><span>{fullscreen ? '退出全屏' : '进入全屏'}</span></button></> : <><button onClick={() => { setDesktopMenuOpen(false); openHelpPanel() }}><span>使用说明</span></button><button onClick={() => { setDesktopMenuOpen(false); void desktopApi()?.openExternal('https://github.com/Jeoitim/markmap-pp') }}><span>GitHub 项目</span></button></>}</section></div>}</div>
        <div className="document-name" title={fileName || '当前没有打开文件'}>{hasOpenDocument && <span className={`save-dot ${titleSyncState}`} />}<span>{fileName || '当前没有打开文件'}</span><small>{hasOpenDocument ? titleSyncText : '打开或新建 Markdown'}</small></div>
        <nav ref={actionsRef} className="actions" aria-label="文档操作">
          <input ref={fileInputRef} className="visually-hidden" type="file" accept=".md,.markdown,text/markdown,text/plain" onChange={openFile} />
          <button type="button" className="button secondary collapsible-action" onClick={() => void chooseMarkdownFile()}><Icon name="folder" /><span>打开</span></button>
          <button type="button" className="button secondary collapsible-action" onClick={openHelpPanel}><Icon name="help" /><span>说明</span></button>
          <button type="button" className="button secondary collapsible-action" onClick={undoLastChange} disabled={!canUndo} title="撤回上一次修改"><Icon name="undo" /><span>撤回</span></button>
          <button type="button" className="button primary" disabled={!hasOpenDocument} onClick={() => { setExportError(''); setExportTab('file'); setActivePanel('export') }}><Icon name="download" /><span>导出</span></button>
          <button type="button" className="locale-toggle" aria-label={locale === 'en-US' ? t('切换到中文') : t('切换到英文')} title={locale === 'en-US' ? t('切换到中文') : t('切换到英文')} onClick={toggleLocale}><Icon name="globe" /></button>
          <button type="button" className="icon-button" aria-label={fullscreen ? t('退出全屏') : t('进入全屏')} title={fullscreen ? t('退出全屏') : t('全屏')} onClick={() => void toggleFullscreen()}><Icon name={fullscreen ? 'collapse' : 'expand'} /></button>
          <button type="button" className="icon-button" aria-label={previewDarkMode ? '切换浅色模式' : '切换深色模式'} title={previewDarkMode ? '浅色模式 · 雾白背景' : '深色模式 · 深灰背景'} onClick={() => updatePreviewBackground(previewDarkMode ? '#fafafa' : '#15181d')}><Icon name={previewDarkMode ? 'sun' : 'moon'} /></button>
          <button type="button" className="icon-button mobile-tabs-trigger" aria-label={`打开文档标签，共 ${documentTabs.length} 个`} title="文档标签" aria-expanded={mobileTabsOpen} onClick={() => setMobileTabsOpen(true)}><Icon name="tabs" /><b>{documentTabs.length}</b></button>
          <button type="button" className="icon-button more-action" aria-label="更多操作" title="更多操作" aria-expanded={actionMenuOpen} onClick={() => setActionMenuOpen((value) => !value)}><Icon name="more" /></button>
          {actionMenuOpen && <div className="action-overflow-menu">
            <button type="button" onClick={() => { setActionMenuOpen(false); void chooseMarkdownFile() }}><Icon name="folder" /><span>打开 Markdown</span></button>
            <button type="button" onClick={() => { setActionMenuOpen(false); openHelpPanel() }}><Icon name="help" /><span>使用说明</span></button>
            <button type="button" onClick={() => { setActionMenuOpen(false); undoLastChange() }} disabled={!canUndo}><Icon name="undo" /><span>撤回修改</span></button>
          </div>}
          {isWindowsDesktop && <div className="desktop-window-controls" aria-label="窗口控制"><button type="button" aria-label="最小化" title="最小化" onClick={() => void desktopApi()?.windowControl.minimize()}><Icon name="window-minimize" /></button><button type="button" aria-label={desktopWindowMaximized ? '还原' : '最大化'} title={desktopWindowMaximized ? '还原' : '最大化'} onClick={() => void desktopApi()?.windowControl.toggleMaximize()}><Icon name={desktopWindowMaximized ? 'window-restore' : 'window-maximize'} /></button><button type="button" className="window-close-button" aria-label="关闭" title="关闭" onClick={() => void desktopApi()?.windowControl.requestClose()}><Icon name="x" /></button></div>}
        </nav>
      </header>

      <section ref={workspaceRef} className={`workspace mobile-${mobilePane}`} style={{ gridTemplateColumns: gridColumns }}>
        <section className={`editor-pane ${editorCollapsed ? 'collapsed' : ''} ${editorView === 'repository' || editorView === 'agent' ? 'repository-view' : ''}`} aria-label="Markdown 编辑器">
          {!editorCollapsed && <>
            <div className="pane-header"><div className="editor-view-tabs"><button className={editorView === 'markdown' ? 'active' : ''} onClick={() => setEditorView('markdown')}><span className="status-light" />Markdown</button><button className={editorView === 'repository' ? 'active' : ''} onClick={openGitHubPanel}><Icon name="github" />仓库{changedFiles.length > 0 && <b>{changedFiles.length}</b>}</button><button className={editorView === 'agent' ? 'active' : ''} onClick={() => setEditorView('agent')} title="Agent"><Icon name="bot" />Agent</button></div><button type="button" className="mobile-pane-switch" onClick={() => setMobilePane('preview')} title={t('切换到思维导图')}><Icon name="map" /><span>{t('导图')}</span></button></div>
              {editorView === 'markdown' ? <>
              {!hasOpenDocument && <div className="document-empty-state editor-empty-state"><Icon name="map" /><strong>当前没有打开文件</strong><span>打开现有 Markdown，或新建一个空白标签。</span><div><button type="button" onClick={() => void chooseMarkdownFile()}><Icon name="folder" />打开文件</button><button type="button" className="primary" onClick={createBlankDocumentTab}><Icon name="plus" />新建标签</button></div></div>}
              <MarkdownEditor ref={markdownEditorRef} value={markdown} onChange={updateMarkdown} dark={dark} fontSize={settings.editorFontSize} fontFamily={previewFonts[settings.editorFont].family} fontWeight={settings.editorWeight} scheme={settings.highlightScheme} onSelectionContextMenu={(selection) => setSelectionMenu({ source: 'editor', ...selection })} onOpenLink={(href) => void openRepositoryLink(href)} />
              <footer className="editor-status"><button className={`lint-status ${diagnostics.length ? 'has-issues' : ''}`} onClick={() => diagnostics.length && setShowDiagnostics((value) => !value)} disabled={!diagnostics.length}><Icon name={diagnostics.length ? 'warning' : 'check'} />{diagnostics.length ? diagnostics.length : '语法正常'}</button><span>{lineCount} 行</span><span>{markdown.length} 字符</span>{activeTabUnsaved && <span className="editor-unsaved"><i />{activeLocalFile ? '自动保存中' : '未保存'}</span>}<span className="editor-status-language">Markdown</span><span className="editor-status-actions">{agentUsesStandaloneFile && activeTabUnsaved && activeDocumentTab?.sourceKey !== 'starter' && (!desktopApi() || Boolean(activeDocumentTab?.desktopFileId)) && <button type="button" className="editor-local-save" onClick={() => void saveStandaloneDocument()} title={activeDocumentTab?.desktopFileId ? '保存到原文件' : '下载 Markdown 副本'}><Icon name="download" /><span>{activeDocumentTab?.desktopFileId ? '保存' : '下载副本'}</span></button>}{activeRepoPath && <button type="button" className="editor-status-settings" onClick={() => setActivePanel('links')} title={`笔记链接 · ${backlinks.length} 个反向链接`} aria-label={`打开笔记链接面板，${backlinks.length} 个反向链接`}><Icon name="link" /></button>}<button type="button" className="editor-status-settings" onClick={() => setActivePanel('editor')} title="编辑器设置" aria-label="编辑器设置"><Icon name="settings" /></button></span></footer>
              {showDiagnostics && diagnostics.length > 0 && <div className="diagnostics-popover"><header><strong>语法问题</strong><button className="header-icon" onClick={() => setShowDiagnostics(false)} aria-label="关闭问题列表"><Icon name="x" /></button></header>{diagnostics.map((item, index) => { const line = markdown.slice(0, item.from).split('\n').length; return <button key={`${item.from}-${index}`} onClick={() => { markdownEditorRef.current?.revealLine(line); setShowDiagnostics(false) }} title={`跳转到第 ${line} 行`}><Icon name="warning" /><span><strong>第 {line} 行</strong><small>{item.message}</small></span></button> })}</div>}
            </> : editorView === 'agent' ? <AgentPanel workspaceKey={agentWorkspaceKey} workspaceLabel={agentWorkspaceLabel} workspaceKind={agentWorkspaceKind} workspaceLocator={agentWorkspace.locator} onSelectWorkspace={selectAgentWorkspace} repositoryScopeEnabled={!agentUsesStandaloneFile} canCreateFiles={!agentUsesStandaloneFile} canCommit={!agentUsesStandaloneFile && (!agentUsesLocalRepository || Boolean(agentLocalRepository?.isGitRepository))} files={agentFiles} activePath={agentActivePath} onApplyChange={agentApplyChange} onCreateFile={agentCreateFile} onOpenFile={(path) => { if (agentUsesLocalRepository && agentLocalRepository) void openLocalRepositoryFile(agentLocalRepository.id, path); else if (!agentUsesStandaloneFile) { const file = cachedFilesRef.current.find((item) => item.path === path); if (file) activateCachedFile(file) } }} onCommit={agentCommit} getGitContext={agentGitContext} remoteFileCount={agentFileCount} remotePaths={agentPaths} repositoryBranch={agentUsesLocalRepository && agentLocalRepository?.isGitRepository ? agentLocalRepository.branch : agentUsesStandaloneFile ? undefined : githubConfig?.branch} onLoadAllFiles={loadAgentFiles} loadingFiles={agentUsesStandaloneFile ? false : agentUsesLocalRepository ? localGitBusy : githubBusyAction === 'load-repository'} fontSize={settings.editorFontSize} fontFamily={previewFonts[settings.editorFont].family} fontWeight={settings.editorWeight} /> : <div className="repository-workspace" style={{ fontSize: settings.editorFontSize, fontFamily: previewFonts[settings.editorFont].family, fontWeight: settings.editorWeight }}>
              {repositorySource === 'local' ? !activeLocalRepository ? <div className="repository-unbound"><Icon name="folder" /><strong>尚未打开本地文件夹</strong><span>{desktopApi() ? 'Git 仓库和普通文件夹都可以打开并编辑 Markdown。' : '网页端不能直接访问本地文件夹，请使用桌面应用。'}</span><button onClick={() => { setRepositorySettingsTab('local'); setActivePanel('github') }}>管理本地文件夹</button></div> : <>
                <div className="repository-toolbar local-repository-toolbar"><div><strong>{activeLocalRepository.name}</strong><small>{activeLocalRepository.isGitRepository ? `${activeLocalRepository.branch} · ${activeLocalRepository.remoteLabel || '仅本地'} · ${activeLocalRepository.head || '暂无提交'}` : '普通本地文件夹 · 自动保存'}</small></div>{activeLocalRepository.isGitRepository && <button className="discard-button" title="放弃所有未提交的 Markdown 修改" onClick={() => void discardLocalRepositoryChanges()} disabled={localGitBusy || !activeLocalRepository.markdownChangedCount}><Icon name="undo" className={localGitActivity === 'discard' ? 'loading-icon' : undefined} /><span>放弃</span></button>}<button className="repository-icon-button" title="文件夹设置" aria-label="文件夹设置" onClick={() => { setRepositorySettingsTab('local'); setActivePanel('github') }}><i><Icon name="settings" /></i></button><button className="repository-icon-button" title={activeLocalRepository.isGitRepository ? '检查本地与远端状态' : '刷新文件树'} aria-label={activeLocalRepository.isGitRepository ? '检查本地与远端状态' : '刷新文件树'} onClick={() => void refreshLocalGitState()} disabled={localGitBusy}><i><Icon name="refresh" className={localGitActivity === 'refresh' ? 'loading-icon' : undefined} /></i></button>{activeLocalRepository.isGitRepository && <button className={`repository-icon-button local-source-action ${localRepositoryAction}`} title={localRepositoryActionTitle} aria-label={localRepositoryActionTitle} onClick={() => { if (localRepositoryAction === 'sync') void syncLocalRepository(); else if (localRepositoryAction === 'push') void pushLocalRepository(); else if (localRepositoryAction === 'commit') void commitLocalRepository() }} disabled={localGitBusy || localRepositoryAction === 'clean' || (localRepositoryAction === 'sync' && activeTabUnsaved)}><i><Icon name={localRepositoryAction === 'sync' ? 'download' : localRepositoryAction === 'push' ? 'sync' : 'check'} className={localGitActivity === localRepositoryAction ? 'loading-icon' : undefined} /></i>{localRepositoryAction === 'sync' && <b>{activeLocalRepository.behindCount}</b>}{localRepositoryAction === 'push' && activeLocalRepository.aheadCount > 0 && <b>{activeLocalRepository.aheadCount}</b>}</button>}</div>
                {localGitError && <div className="repository-error"><Icon name="warning" />{localGitError}</div>}
                {localGitNotice && <div className="repository-notice"><Icon name="check" />{localGitNotice}</div>}
                {!activeLocalRepository.isGitRepository && <div className="repository-warning"><Icon name="warning" /><span><strong>这不是 Git 仓库</strong><small>可以浏览、编辑并自动保存文件，但不能提交、推送或查看版本历史。</small></span></div>}
                <div className={`repository-tree ${localRepositoryDropFolder === '' ? 'drop-root' : ''}`} role="tree" aria-label="本地 Markdown 文件树" data-repository-type="root" data-repository-path="" onContextMenu={(event) => openLocalRepositoryMenu(event, { type: 'root', path: '', name: '仓库根目录' })} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; const target = draggedLocalRepositoryTarget; setLocalRepositoryDropFolder(target ? normalizeRepositoryDropFolder(target, '') : null) }} onDrop={(event) => { event.preventDefault(); void dropLocalRepositoryTarget('') }}>
                  {localRepositoryRows.length ? localRepositoryRows.map((row) => {
                    const isRenaming = renamingLocalRepositoryTarget?.type === row.type && renamingLocalRepositoryTarget.path === row.path
                    const isDropZone = localRepositoryDropFolder !== null && localRepositoryDropFolder !== '' && (row.path === localRepositoryDropFolder || row.path.startsWith(`${localRepositoryDropFolder}/`))
                    if (row.type === 'folder') return <div className={`tree-folder ${isDropZone ? 'drop-zone' : ''}`} role="treeitem" aria-expanded={!localCollapsedFolders.has(row.path)} data-repository-type="folder" data-repository-path={row.path} draggable={!isRenaming && !localGitBusy} key={`local-folder:${row.path}`} style={{ paddingLeft: 8 + row.depth * 16 }} onDragStart={(event) => { event.stopPropagation(); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', row.path); event.dataTransfer.setData('application/x-markmap-local-path', row.path); setDraggedLocalRepositoryTarget(row); setLocalRepositoryDropFolder(null) }} onDragEnd={() => { setDraggedLocalRepositoryTarget(null); setLocalRepositoryDropFolder(null) }} onDragOver={(event) => { event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = 'move'; const target = draggedLocalRepositoryTarget; setLocalRepositoryDropFolder(target ? normalizeRepositoryDropFolder(target, row.path) : null) }} onDrop={(event) => { event.preventDefault(); event.stopPropagation(); void dropLocalRepositoryTarget(row.path) }} onContextMenu={(event) => openLocalRepositoryMenu(event, row)}><span className="tree-indent-guides" aria-hidden="true" style={{ width: row.depth * 16 }} />{isRenaming ? <div className="tree-inline-edit"><Icon name="folder" /><input autoFocus value={localRepositoryRenameValue} onFocus={(event) => event.currentTarget.select()} onChange={(event) => setLocalRepositoryRenameValue(event.target.value)} onBlur={() => void finishLocalRepositoryRename()} onContextMenu={(event) => event.stopPropagation()} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); if (event.key === 'Escape') setRenamingLocalRepositoryTarget(null) }} /></div> : <button onClick={() => setLocalCollapsedFolders((current) => { const next = new Set(current); if (next.has(row.path)) next.delete(row.path); else next.add(row.path); return next })}><Icon name={localCollapsedFolders.has(row.path) ? 'chevron-right' : 'chevron-down'} /><Icon name="folder" /><span>{row.name}</span></button>}</div>
                    const destination = parentPath(row.path)
                    const status = row.local?.gitStatus
                    return <div className={`tree-file ${activeLocalFile?.repositoryId === activeLocalRepository.id && activeLocalFile.path === row.path ? 'active' : ''} ${status === 'D' ? 'deleted' : ''} ${isDropZone ? 'drop-zone' : ''}`} role="treeitem" data-repository-type="file" data-repository-path={row.path} draggable={!isRenaming && !localGitBusy && status !== 'D'} key={`local-file:${row.path}`} style={{ paddingLeft: 12 + row.depth * 16 }} onDragStart={(event) => { event.stopPropagation(); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', row.path); event.dataTransfer.setData('application/x-markmap-local-path', row.path); setDraggedLocalRepositoryTarget(row); setLocalRepositoryDropFolder(null) }} onDragEnd={() => { setDraggedLocalRepositoryTarget(null); setLocalRepositoryDropFolder(null) }} onDragOver={(event) => { event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = 'move'; const target = draggedLocalRepositoryTarget; setLocalRepositoryDropFolder(target ? normalizeRepositoryDropFolder(target, destination) : null) }} onDrop={(event) => { event.preventDefault(); event.stopPropagation(); void dropLocalRepositoryTarget(destination) }} onContextMenu={(event) => openLocalRepositoryMenu(event, row)}><span className="tree-indent-guides" aria-hidden="true" style={{ width: row.depth * 16 }} />{isRenaming ? <div className="tree-open tree-inline-edit"><Icon name="map" /><input autoFocus value={localRepositoryRenameValue} onFocus={(event) => event.currentTarget.select()} onChange={(event) => setLocalRepositoryRenameValue(event.target.value)} onBlur={() => void finishLocalRepositoryRename()} onContextMenu={(event) => event.stopPropagation()} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); if (event.key === 'Escape') setRenamingLocalRepositoryTarget(null) }} /></div> : <button className="tree-open" disabled={status === 'D'} onClick={() => void openLocalRepositoryFile(activeLocalRepository.id, row.path)}><Icon name="map" /><span>{row.name}</span></button>}{activeLocalRepository.isGitRepository ? status ? <b title={status === '?' ? '未跟踪' : status === 'M' ? '已修改' : status === 'A' ? '已添加' : status === 'D' ? '已删除' : status === 'R' ? '已重命名' : '存在冲突'}>{status === '?' ? 'U' : status}</b> : <i className="cached" title="Git 工作区干净" /> : null}</div>
                  }) : <div className="github-empty">文件夹中没有 Markdown 文件</div>}
                </div>
                <footer className="repository-status"><span className={activeLocalRepository.isGitRepository && (activeLocalRepository.changedCount || activeLocalRepository.aheadCount || activeLocalRepository.behindCount) ? 'dirty' : 'clean'} /><span className="repository-status-label">{!activeLocalRepository.isGitRepository ? '普通本地文件夹 · 文档自动保存' : activeLocalRepository.behindCount ? `远端有 ${activeLocalRepository.behindCount} 个新提交 · 请先同步` : activeLocalRepository.markdownChangedCount ? `${activeLocalRepository.markdownChangedCount} 个 Markdown 变更 · 已自动保存` : activeLocalRepository.changedCount ? `${activeLocalRepository.changedCount} 个非 Markdown 变更 · 不会由应用提交` : activeLocalRepository.aheadCount ? `${activeLocalRepository.aheadCount} 个本地提交待推送` : 'Git 工作区干净 · 文档自动保存'}</span>{activeLocalRepository.isGitRepository && <button className="repository-branch-button" title={`查看分支与提交历史${activeLocalRepository.aheadCount || activeLocalRepository.behindCount ? ` · 本地 ↑${activeLocalRepository.aheadCount} ↓${activeLocalRepository.behindCount}` : ''}`} aria-label="查看本地仓库分支与提交历史" aria-expanded={Boolean(localRepositoryGraph)} onClick={() => { if (localRepositoryGraph) setLocalRepositoryGraph(null); else void openLocalRepositoryGraph() }}><Icon name="branch" /><span>{activeLocalRepository.branch}{activeLocalRepository.aheadCount || activeLocalRepository.behindCount ? ` ↑${activeLocalRepository.aheadCount} ↓${activeLocalRepository.behindCount}` : ''}</span></button>}</footer>
                {localRepositoryGraph && <div className="repository-graph-popover local-repository-graph" onMouseDown={(event) => event.stopPropagation()}>
                  <header><div><strong>本地提交历史</strong><small>{activeLocalRepository.name} · {activeLocalRepository.branch}{activeLocalRepository.upstream ? ` ↔ ${activeLocalRepository.upstream}` : ''}</small></div><button className="header-icon" aria-label="关闭本地提交历史" onClick={() => setLocalRepositoryGraph(null)}><Icon name="x" /></button></header>
                  {localRepositoryGraph.error && <div className="repository-graph-error"><Icon name="warning" /><span>{localRepositoryGraph.error}</span></div>}
                  <button className="repository-graph-branch-toggle" aria-expanded={localRepositoryGraphBranchesOpen} onClick={() => setLocalRepositoryGraphBranchesOpen((value) => !value)}><Icon name="branch" /><span>分支</span><strong>{activeLocalRepository.branch}</strong><Icon name={localRepositoryGraphBranchesOpen ? 'chevron-down' : 'chevron-right'} /></button>
                  {localRepositoryGraphBranchesOpen && <div className="repository-graph-branches">{localRepositoryGraph.branches.length ? localRepositoryGraph.branches.map((branch) => <button className={branch.current ? 'active' : ''} key={`${branch.remote ? 'remote' : 'local'}:${branch.name}`} disabled={localGitBusy || localRepositoryGraph.loading} onClick={() => void switchLocalRepositoryBranch(branch.name)}><Icon name="branch" /><span>{branch.name}<em>{branch.remote ? '远程' : '本地'}</em></span><small>{branch.sha.slice(0, 7)}</small></button>) : <span>没有可用分支</span>}</div>}
                  {localRepositoryGraph.loading && !localRepositoryGraph.commits.length ? <div className="repository-graph-state"><Icon name="refresh" className="loading-icon" /><span>正在读取本地提交历史…</span></div> : localRepositoryGraph.commits.length ? <div className="repository-graph-list">{localRepositoryGraph.commits.map((commit) => <article className="repository-graph-commit local-graph-commit" key={commit.sha}><span className="repository-graph-rail"><i /></span><span className="repository-graph-commit-info"><strong title={commit.message}>{commit.message.split('\n')[0]}</strong>{commit.refs.length > 0 && <span className="local-commit-refs">{commit.refs.map((ref) => <b className={ref.includes('/') ? 'remote' : ''} key={ref}>{ref}</b>)}</span>}<small><code title={commit.sha}>{commit.sha.slice(0, 7)}</code><em> · {commit.author} · {formatCommitDate(commit.date)}</em></small></span></article>)}</div> : <div className="repository-graph-state"><Icon name="clock" /><span>没有找到提交记录</span></div>}
                </div>}
                {localRepositoryMenu && <div className="repository-context-menu" style={{ left: localRepositoryMenu.x, top: localRepositoryMenu.y }} onPointerDown={(event) => event.stopPropagation()}>
                  <strong>{localRepositoryMenu.target.name}</strong>
                  {localRepositoryMenu.target.type === 'file' && <button disabled={localRepositoryMenu.target.path.endsWith('/') || activeLocalRepository.files.find((file) => file.path === localRepositoryMenu.target.path)?.gitStatus === 'D'} onClick={() => { const target = localRepositoryMenu.target; setLocalRepositoryMenu(null); void openLocalRepositoryFile(activeLocalRepository.id, target.path) }}>打开</button>}
                  {activeLocalRepository.isGitRepository && localRepositoryMenu.target.type === 'file' && <button disabled={['?', 'A'].includes(activeLocalRepository.files.find((file) => file.path === localRepositoryMenu.target.path)?.gitStatus || '')} title={['?', 'A'].includes(activeLocalRepository.files.find((file) => file.path === localRepositoryMenu.target.path)?.gitStatus || '') ? '新增文件还没有提交历史' : '查看该文件的历史提交'} onClick={() => { const menu = localRepositoryMenu; if (menu) void openLocalRepositoryHistory(menu.target, menu.x, menu.y) }}>查看历史提交</button>}
                  {activeLocalRepository.isGitRepository && localRepositoryMenu.target.type === 'file' && <button disabled={!activeLocalRepository.files.find((file) => file.path === localRepositoryMenu.target.path)?.gitStatus} onClick={() => { const target = localRepositoryMenu.target; setLocalRepositoryMenu(null); void discardLocalRepositoryFile(target) }}>放弃该文件修改</button>}
                  {localRepositoryMenu.target.type !== 'root' && <><button onClick={() => { const target = localRepositoryMenu.target; setLocalRepositoryMenu(null); startLocalRepositoryRename(target) }}>重命名</button><button onClick={() => { setLocalRepositoryClipboard({ mode: 'copy', target: localRepositoryMenu.target }); setLocalRepositoryMenu(null); setLocalGitNotice(`已复制 ${localRepositoryMenu.target.name}，请在目标文件夹右键粘贴`) }}>复制</button><button onClick={() => { setLocalRepositoryClipboard({ mode: 'cut', target: localRepositoryMenu.target }); setLocalRepositoryMenu(null); setLocalGitNotice(`已剪切 ${localRepositoryMenu.target.name}，请在目标文件夹右键粘贴`) }}>剪切</button><button onClick={() => { void navigator.clipboard.writeText(localRepositoryMenu.target.path); setLocalRepositoryMenu(null); setLocalGitNotice('已复制相对路径') }}>复制相对路径</button></>}
                  {(localRepositoryMenu.target.type === 'folder' || localRepositoryMenu.target.type === 'root') && <><hr/><button disabled={!localRepositoryClipboard} onClick={() => { const folder = localRepositoryMenu.target.path; setLocalRepositoryMenu(null); void pasteLocalRepositoryClipboard(folder) }}>粘贴{localRepositoryClipboard ? `“${localRepositoryClipboard.target.name}”` : ''}</button></>}
                  {localRepositoryMenu.target.type !== 'root' && <><hr/><button className="danger" onClick={() => { const target = localRepositoryMenu.target; setLocalRepositoryMenu(null); void removeLocalRepositoryTarget(target) }}>删除</button></>}
                  {localRepositoryMenu.target.type === 'root' && <button onClick={() => { void navigator.clipboard.writeText(activeLocalRepository.root); setLocalRepositoryMenu(null); setLocalGitNotice('已复制文件夹路径') }}>复制文件夹路径</button>}
                </div>}
                {localRepositoryHistory && <div className="repository-history-popover" style={{ left: localRepositoryHistory.x, top: localRepositoryHistory.y }} onPointerDown={(event) => event.stopPropagation()}>
                  <header><div><strong>文件历史</strong><small title={localRepositoryHistory.target.path}>{localRepositoryHistory.target.path}</small></div><button className="header-icon" aria-label="关闭历史记录" onClick={() => setLocalRepositoryHistory(null)}><Icon name="x" /></button></header>
                  {localRepositoryHistory.error && <div className="repository-history-error"><Icon name="warning" /><span>{localRepositoryHistory.error}</span></div>}
                  {localRepositoryHistory.loading && !localRepositoryHistory.commits.length ? <div className="repository-history-state"><Icon name="refresh" className="loading-icon" /><span>正在读取提交历史…</span></div> : localRepositoryHistory.commits.length ? <div className="repository-history-list" role="list">{localRepositoryHistory.commits.map((commit) => <button className="repository-history-item" key={commit.sha} disabled={localRepositoryHistory.loading} onClick={() => void openLocalRepositoryHistoryVersion(commit)}><Icon name="clock" className={localRepositoryHistory.loading ? 'loading-icon' : undefined} /><span><strong>{formatCommitDate(commit.date)}</strong><small><code title={commit.sha}>{commit.sha.slice(0, 7)}</code><em> · {activeLocalRepository.branch} · {commit.author}</em></small><b title={commit.message}>{commit.message.split('\n')[0]}</b></span><Icon name="chevron-right" /></button>)}</div> : <div className="repository-history-state"><Icon name="clock" /><span>没有找到该文件的提交记录</span></div>}
                </div>}
              </> : !githubConfig ? <div className="repository-unbound"><Icon name="github" /><strong>尚未绑定 GitHub 仓库</strong><span>绑定后可浏览 Markdown 文件并在本地暂存修改。</span><button onClick={() => { setRepositorySettingsTab('remote'); setActivePanel('github') }}>绑定仓库</button></div> : <>
                <div className="repository-toolbar"><div><strong>{githubConfig.owner}/{githubConfig.repo}</strong><small>{repositoryCommitRef ? `commit ${repositoryCommitRef.slice(0, 7)}` : githubConfig.branch}</small></div><button className="discard-button" title={repositoryCommitRef ? '查看 commit 阶段时不能放弃当前分支修改' : '放弃所有本地修改'} onClick={() => void discardRepositoryChanges()} disabled={githubBusy || Boolean(repositoryCommitRef) || !hasRepositoryDrafts}><Icon name="undo" className={repositoryDiscardLoading ? 'loading-icon' : undefined} /><span>放弃</span></button><button className="repository-icon-button" title="仓库设置" aria-label="仓库设置" onClick={() => setActivePanel('github')}><i><Icon name="settings" /></i></button><button className="repository-icon-button" title="刷新当前分支" aria-label="刷新当前分支" onClick={() => void refreshRepositoryView()} disabled={githubBusy}><i><Icon name="refresh" className={repositoryRefreshLoading ? 'loading-icon' : undefined} /></i></button><button className="repository-icon-button sync-button" title={repositoryCommitRef ? '查看 commit 阶段时不能同步' : changedFiles.length ? `同步 ${changedFiles.length} 个修改` : '没有待同步修改'} aria-label={repositoryCommitRef ? '查看 commit 阶段时不能同步' : changedFiles.length ? `同步 ${changedFiles.length} 个修改` : '没有待同步修改'} onClick={() => void pushRepositoryChanges()} disabled={githubBusy || Boolean(repositoryCommitRef) || !changedFiles.length}><i><Icon name="sync" className={repositorySyncLoading ? 'loading-icon' : undefined} /></i></button></div>
                {githubError && <div className="repository-error"><Icon name="warning" />{githubError}</div>}
                {githubNotice && <div className="repository-notice"><Icon name="check" />{githubNotice}</div>}
                <div className={`repository-tree ${(repositoryTouchDrag ? repositoryTouchDrag.dropFolder : repositoryDropFolder) === '' ? 'drop-root' : ''} ${repositoryTouchDrag?.dragging ? 'touch-dragging' : ''}`} role="tree" aria-label="GitHub Markdown 文件树" data-repository-type="root" data-repository-path="" onContextMenu={(event) => openRepositoryMenu(event, { type: 'root', path: '', name: '仓库根目录' })} onTouchStart={(event) => startRepositoryTouch(event, { type: 'root', path: '', name: '仓库根目录' })} onTouchMove={moveRepositoryTouch} onTouchEnd={endRepositoryTouch} onTouchCancel={cancelRepositoryTouchGesture} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; const target = draggedRepositoryTarget; setRepositoryDropFolder(target ? normalizeRepositoryDropFolder(target, '') : null) }} onDrop={(event) => { event.preventDefault(); void dropRepositoryTarget('') }}>
                  {repositoryRows.length ? repositoryRows.map((row) => {
                    const isRenaming = renamingRepositoryTarget?.type === row.type && renamingRepositoryTarget.path === row.path
                    const activeDropFolder = repositoryTouchDrag ? repositoryTouchDrag.dropFolder : repositoryDropFolder
                    const isDropZone = activeDropFolder !== null && activeDropFolder !== '' && (row.path === activeDropFolder || row.path.startsWith(`${activeDropFolder}/`))
                    const isTouchSource = repositoryTouchDrag?.target.path === row.path
                    const isLoading = repositoryLoadingPath === row.path
                    if (row.type === 'folder') return <div className={`tree-folder ${isDropZone ? 'drop-zone' : ''} ${isTouchSource ? 'touch-source' : ''}`} role="treeitem" aria-expanded={!collapsedFolders.has(row.path)} data-repository-type="folder" data-repository-path={row.path} draggable={!repositoryCommitRef && !isRenaming} key={`folder:${row.path}`} style={{ paddingLeft: 8 + row.depth * 16 }} onTouchStart={(event) => startRepositoryTouch(event, row)} onTouchMove={moveRepositoryTouch} onTouchEnd={endRepositoryTouch} onTouchCancel={cancelRepositoryTouchGesture} onDragStart={(event) => { event.stopPropagation(); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', row.path); event.dataTransfer.setData('application/x-markmap-repository-path', row.path); setDraggedRepositoryTarget(row); setRepositoryDropFolder(null) }} onDragEnd={() => { setDraggedRepositoryTarget(null); setRepositoryDropFolder(null) }} onDragOver={(event) => { event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = 'move'; const target = draggedRepositoryTarget; setRepositoryDropFolder(target ? normalizeRepositoryDropFolder(target, row.path) : null) }} onDrop={(event) => { event.preventDefault(); event.stopPropagation(); void dropRepositoryTarget(row.path) }} onContextMenu={(event) => openRepositoryMenu(event, row)}><span className="tree-indent-guides" aria-hidden="true" style={{ width: row.depth * 16 }} />{isRenaming ? <div className="tree-inline-edit"><Icon name="folder" /><input autoFocus value={repositoryRenameValue} onFocus={(event) => event.currentTarget.select()} onChange={(event) => setRepositoryRenameValue(event.target.value)} onBlur={finishRepositoryRename} onContextMenu={(event) => event.stopPropagation()} onKeyDown={(event) => { if (event.key === 'Enter') finishRepositoryRename(); if (event.key === 'Escape') setRenamingRepositoryTarget(null) }} /></div> : <button onClick={() => { if (consumeRepositoryLongPressClick()) return; setCollapsedFolders((current) => { const next = new Set(current); if (next.has(row.path)) next.delete(row.path); else next.add(row.path); return next }) }}><Icon name={collapsedFolders.has(row.path) ? 'chevron-right' : 'chevron-down'} /><Icon name="folder" /><span>{row.name}</span></button>}</div>
                    const destination = parentPath(row.path)
                    return <div className={`tree-file ${activeRepoPath === row.path ? 'active' : ''} ${row.cached?.status === 'deleted' ? 'deleted' : ''} ${isDropZone ? 'drop-zone' : ''} ${isTouchSource ? 'touch-source' : ''}`} role="treeitem" data-repository-type="file" data-repository-path={row.path} draggable={!repositoryCommitRef && !isRenaming && row.cached?.status !== 'deleted'} key={`file:${row.path}`} style={{ paddingLeft: 12 + row.depth * 16 }} onTouchStart={(event) => startRepositoryTouch(event, row)} onTouchMove={moveRepositoryTouch} onTouchEnd={endRepositoryTouch} onTouchCancel={cancelRepositoryTouchGesture} onDragStart={(event) => { event.stopPropagation(); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', row.path); event.dataTransfer.setData('application/x-markmap-repository-path', row.path); setDraggedRepositoryTarget(row); setRepositoryDropFolder(null) }} onDragEnd={() => { setDraggedRepositoryTarget(null); setRepositoryDropFolder(null) }} onDragOver={(event) => { event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = 'move'; const target = draggedRepositoryTarget; setRepositoryDropFolder(target ? normalizeRepositoryDropFolder(target, destination) : null) }} onDrop={(event) => { event.preventDefault(); event.stopPropagation(); void dropRepositoryTarget(destination) }} onContextMenu={(event) => openRepositoryMenu(event, row)}><span className="tree-indent-guides" aria-hidden="true" style={{ width: row.depth * 16 }} />{isRenaming ? <div className="tree-open tree-inline-edit"><Icon name="map" /><input autoFocus value={repositoryRenameValue} onFocus={(event) => event.currentTarget.select()} onChange={(event) => setRepositoryRenameValue(event.target.value)} onBlur={finishRepositoryRename} onContextMenu={(event) => event.stopPropagation()} onKeyDown={(event) => { if (event.key === 'Enter') finishRepositoryRename(); if (event.key === 'Escape') setRenamingRepositoryTarget(null) }} /></div> : <button className="tree-open" disabled={row.cached?.status === 'deleted'} onClick={() => { if (!consumeRepositoryLongPressClick()) openRepositoryRow(row) }}><Icon name={isLoading ? 'refresh' : 'map'} className={isLoading ? 'loading-icon' : undefined} /><span>{repositoryCommitRef ? historicalFileName(row.name, repositoryCommitRef) : row.name}</span></button>}{row.cached ? row.cached.status !== 'clean' ? <b>{row.cached.status === 'renamed' ? 'R' : row.cached.status === 'added' ? 'A' : row.cached.status === 'deleted' ? 'D' : 'M'}</b> : <i className="cached" title="已拉取并同步" /> : <i className="remote" title="尚未拉取" />}</div>
                  }) : <div className="github-empty">{githubBusy ? '正在读取仓库…' : '仓库中没有 Markdown 文件'}</div>}
                </div>
                <footer className="repository-status"><span className={changedFiles.length && !repositoryCommitRef ? 'dirty' : 'clean'} /><span className="repository-status-label">{repositoryCommitRef ? `查看 commit ${repositoryCommitRef.slice(0, 7)} · 文件打开后为独立缓存` : changedFiles.length ? `${changedFiles.length} 个文件已暂存但未推送` : '所有缓存文件均已同步'}</span><button className="repository-branch-button" title="查看仓库 Git Graph 与切换分支" aria-label="查看仓库 Git Graph 与切换分支" aria-expanded={Boolean(repositoryGraph)} onClick={() => { if (repositoryGraph) setRepositoryGraph(null); else void openRepositoryGraph() }}><Icon name="branch" /><span>{githubConfig.branch}</span></button></footer>
                {repositoryGraph && <div className="repository-graph-popover" onMouseDown={(event) => event.stopPropagation()}>
                  <header><div><strong>仓库提交历史</strong><small>{githubConfig.owner}/{githubConfig.repo} · {githubConfig.branch}</small></div><button className="header-icon" aria-label="关闭仓库提交历史" onClick={() => setRepositoryGraph(null)}><Icon name="x" /></button></header>
                  {repositoryGraph.error && <div className="repository-graph-error"><Icon name="warning" /><span>{repositoryGraph.error}</span></div>}
                  <button className="repository-graph-branch-toggle" aria-expanded={repositoryGraphBranchesOpen} onClick={() => setRepositoryGraphBranchesOpen((value) => !value)}><Icon name="branch" /><span>分支</span><strong>{githubConfig.branch}</strong><Icon name={repositoryGraphBranchesOpen ? 'chevron-down' : 'chevron-right'} /></button>
                  {repositoryGraphBranchesOpen && <div className="repository-graph-branches">{repositoryGraph.branches.length ? repositoryGraph.branches.map((branch) => <button className={branch.name === githubConfig.branch ? 'active' : ''} key={branch.name} disabled={githubBusy || repositoryGraph.loading} onClick={() => void switchRepositoryBranch(branch)}><Icon name="branch" /><span>{branch.name}</span><small>{branch.sha.slice(0, 7)}</small></button>) : <span>没有可用分支</span>}</div>}
                  {repositoryGraph.loading && !repositoryGraph.commits.length ? <div className="repository-graph-state"><Icon name="refresh" className="loading-icon" /><span>正在读取仓库提交历史…</span></div> : repositoryGraph.commits.length ? <div className="repository-graph-list">{repositoryGraph.commits.map((commit) => <button className={`repository-graph-commit ${repositoryCommitRef === commit.sha ? 'active' : ''}`} key={commit.sha} disabled={repositoryGraph.loading || githubBusy} onClick={() => void openRepositoryCommit(commit)}><span className="repository-graph-rail"><i /></span><span className="repository-graph-commit-info"><strong title={commit.message}>{commit.message.split('\n')[0]}</strong><small><code title={commit.sha}>{commit.sha.slice(0, 7)}</code><em> · {githubConfig.branch} · {commit.author} · {formatCommitDate(commit.date)}</em></small></span><Icon name="chevron-right" /></button>)}</div> : <div className="repository-graph-state"><Icon name="clock" /><span>没有找到仓库提交记录</span></div>}
                </div>}
                {repositoryMenu && <div className="repository-context-menu" style={{ left: repositoryMenu.x, top: repositoryMenu.y }} onPointerDown={(event) => event.stopPropagation()}>
                  <strong>{repositoryMenu.target.name}</strong>
                  {repositoryMenu.target.type !== 'root' && <><button onClick={() => { const target = repositoryMenu.target; setRepositoryMenu(null); startRepositoryRename(target) }}>重命名</button><button onClick={() => { setRepositoryClipboard({ mode: 'copy', target: repositoryMenu.target }); setRepositoryMenu(null) }}>复制</button><button onClick={() => { setRepositoryClipboard({ mode: 'cut', target: repositoryMenu.target }); setRepositoryMenu(null) }}>剪切</button></>}
                  {repositoryMenu.target.type === 'file' && <button disabled={!repositoryMenuFile?.remote} title={repositoryMenuFile?.remote ? '查看该文件的历史提交' : '本地新增文件还没有远程提交记录'} onClick={() => { const menu = repositoryMenu; if (menu) void openRepositoryHistory(menu.target, menu.x, menu.y) }}>查看历史提交</button>}
                  {repositoryMenu.target.type === 'file' && <button disabled={!repositoryMenuFile?.cached || repositoryMenuFile.cached.status === 'clean'} onClick={() => { const target = repositoryMenu.target; setRepositoryMenu(null); void discardRepositoryFile(target) }}>放弃该文件修改</button>}
                  {(repositoryMenu.target.type === 'folder' || repositoryMenu.target.type === 'root') && <><hr/><button disabled={!repositoryClipboard} onClick={() => { const folder = repositoryMenu.target.path; setRepositoryMenu(null); void pasteRepositoryClipboard(folder) }}>粘贴{repositoryClipboard ? `“${repositoryClipboard.target.name}”` : ''}</button><button onClick={() => { const folder = repositoryMenu.target.path; setRepositoryMenu(null); void createRepositoryFile(folder) }}>新建 Markdown</button><button onClick={() => { const folder = repositoryMenu.target.path; setRepositoryMenu(null); createRepositoryFolder(folder) }}>新建文件夹</button></>}
                  {repositoryMenu.target.type !== 'root' && <><hr/><button className="danger" onClick={() => { const target = repositoryMenu.target; setRepositoryMenu(null); void deleteRepositoryTarget(target) }}>删除</button></>}
                </div>}
                {repositoryHistory && <div className="repository-history-popover" style={{ left: repositoryHistory.x, top: repositoryHistory.y }} onPointerDown={(event) => event.stopPropagation()}>
                  <header><div><strong>文件历史</strong><small title={repositoryHistory.target.path}>{repositoryHistory.target.path}</small></div><button className="header-icon" aria-label="关闭历史记录" onClick={() => setRepositoryHistory(null)}><Icon name="x" /></button></header>
                  {repositoryHistory.error && <div className="repository-history-error"><Icon name="warning" /><span>{repositoryHistory.error}</span></div>}
                  {repositoryHistory.loading && !repositoryHistory.commits.length ? <div className="repository-history-state"><Icon name="refresh" className="loading-icon" /><span>正在读取提交历史…</span></div> : repositoryHistory.commits.length ? <div className="repository-history-list" role="list">{repositoryHistory.commits.map((commit) => <button className="repository-history-item" key={commit.sha} disabled={repositoryHistory.loading} onClick={() => void openRepositoryHistoryVersion(commit)}><Icon name="clock" className={repositoryHistory.loading ? 'loading-icon' : undefined} /><span><strong>{formatCommitDate(commit.date)}</strong><small><code title={commit.sha}>{commit.sha.slice(0, 7)}</code><em> · {githubConfig?.branch || '当前分支'} · {commit.author}</em></small><b title={commit.message}>{commit.message.split('\n')[0]}</b></span><Icon name="chevron-right" /></button>)}</div> : <div className="repository-history-state"><Icon name="clock" /><span>没有找到该文件的提交记录</span></div>}
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
            <nav className="document-tabs-bar" aria-label="打开的文档">
              <div className="document-tabs-scroll" role="tablist">
                {documentTabs.map((tab) => <div className={`document-tab ${tab.id === activeTabId ? 'active' : ''}`} key={tab.id}>
                  <button type="button" className="document-tab-select" role="tab" aria-selected={tab.id === activeTabId} title={tab.name} onClick={() => activateDocumentTab(tab.id)}><Icon name="map" /><span>{tab.name}</span>{tabHasUnsavedChanges(tab.id === activeTabId ? { ...tab, content: markdown } : tab) ? <i className="dirty" title="有未保存的修改" /> : (tab.repositoryPath || tab.localPath || tab.desktopFileId) && <i title={tab.repositoryPath ? 'Git 仓库文档' : tab.localPath ? '本地文件夹文档' : '已保存到磁盘'} />}</button>
                  <button type="button" className="document-tab-close" aria-label={`关闭 ${tab.name}`} title="关闭标签" onClick={() => closeDocumentTab(tab.id)}><Icon name="x" /></button>
                </div>)}
              </div>
              <button type="button" className="document-tab-new" aria-label="新建空白文档标签" title="新建标签" onClick={createBlankDocumentTab}><Icon name="plus" /></button>
            </nav>
            {!hasOpenDocument && <div className="document-empty-state preview-empty-state"><Icon name="map" /><strong>当前没有打开文件</strong><span>新建或打开 Markdown 后，这里会显示思维导图。</span><div><button type="button" onClick={() => void chooseMarkdownFile()}><Icon name="folder" />打开文件</button><button type="button" className="primary" onClick={createBlankDocumentTab}><Icon name="plus" />新建标签</button></div></div>}
            <div className={`map-canvas ${effectiveShowGrid ? '' : 'no-grid'}`} onContextMenu={handlePreviewContextMenu} onClickCapture={handlePreviewLinkClick} style={{ '--preview-background': previewBackgroundColor, '--preview-foreground': previewDarkMode ? previewLightText : previewDarkText } as React.CSSProperties}><div className="preview-floating-tools"><button type="button" className="mobile-pane-switch" onClick={() => setMobilePane('editor')} title="返回 Markdown"><Icon name="chevron-left" /><span>返回 Markdown</span></button><button type="button" onClick={() => mmRef.current?.fit()} title="适应画布" aria-label="适应画布"><Icon name="focus" /></button><button type="button" onClick={() => setActivePanel('preview')} title="预览设置" aria-label="预览设置"><Icon name="settings" /></button></div><svg id={MARKMAP_PREVIEW_ID} ref={svgRef} /></div>
          </>
        </section>
      </section>

      {mobileTabsOpen && <div className="mobile-tabs-backdrop" onMouseDown={() => setMobileTabsOpen(false)}>
        <section className="mobile-tabs-sheet" role="dialog" aria-modal="true" aria-label="文档标签" onMouseDown={(event) => event.stopPropagation()}>
          <header><div><strong>文档标签</strong><small>{documentTabs.length} 个打开的文档</small></div><button type="button" className="header-icon" aria-label="关闭文档标签" onClick={() => setMobileTabsOpen(false)}><Icon name="x" /></button></header>
          <div className="mobile-tabs-list" role="tablist">{documentTabs.map((tab, index) => <article className={`${tab.id === activeTabId ? 'active' : ''} ${tabHasUnsavedChanges(tab.id === activeTabId ? { ...tab, content: markdown } : tab) ? 'dirty' : ''}`} key={tab.id}>
            <button type="button" className="mobile-tab-select" role="tab" aria-selected={tab.id === activeTabId} onClick={() => activateDocumentTab(tab.id)}><span><Icon name="map" /><b>{index + 1}</b></span><span><strong>{tab.name}</strong><small>{tabHasUnsavedChanges(tab.id === activeTabId ? { ...tab, content: markdown } : tab) ? '未保存的修改' : tab.repositoryPath ? 'Git 仓库文档' : tab.localPath ? '本地文件夹文档' : tab.desktopFileId ? '已保存到磁盘' : tab.id === activeTabId ? '当前文档' : 'Markdown 文档'}</small></span></button>
            <button type="button" className="mobile-tab-close" aria-label={`关闭 ${tab.name}`} onClick={() => closeDocumentTab(tab.id)}><Icon name="x" /></button>
          </article>)}</div>
          <footer><button type="button" onClick={() => { setMobileTabsOpen(false); void chooseMarkdownFile() }}><Icon name="folder" />打开文件</button><button type="button" className="primary" onClick={createBlankDocumentTab}><Icon name="plus" />新建标签</button></footer>
        </section>
      </div>}

      {pendingCloseTab && <div className="unsaved-dialog-backdrop" onMouseDown={() => !pendingCloseBusy && setPendingCloseTabId(null)}>
        <section className="unsaved-dialog" role="alertdialog" aria-modal="true" aria-labelledby="unsaved-dialog-title" onMouseDown={(event) => event.stopPropagation()}>
          <header><span><Icon name="warning" /></span><div><strong id="unsaved-dialog-title">保存对“{pendingCloseTab.name}”的修改？</strong><small>{pendingCloseTab.localPath || pendingCloseTab.desktopPath || '当前标签还没有可持续写入的位置'}</small></div></header>
          <p>{pendingCloseTab.localRepositoryId || pendingCloseTab.desktopFileId ? '保存会把当前内容写回磁盘，然后关闭标签。' : '可以先下载一份 Markdown 副本，再关闭标签。'}</p>
          {pendingCloseError && <div className="export-error"><Icon name="warning" />{pendingCloseError}</div>}
          <footer><button type="button" disabled={pendingCloseBusy} onClick={() => setPendingCloseTabId(null)}>取消</button><button type="button" className="danger" disabled={pendingCloseBusy} onClick={() => { const id = pendingCloseTab.id; setPendingCloseTabId(null); closeDocumentTab(id, true) }}>不保存</button><button type="button" className="primary" disabled={pendingCloseBusy} onClick={() => void savePendingDocumentAndClose()}>{pendingCloseBusy ? '正在保存…' : pendingCloseTab.localRepositoryId || pendingCloseTab.desktopFileId ? '保存并关闭' : '下载副本并关闭'}</button></footer>
        </section>
      </div>}

      {windowClosePending && <div className="unsaved-dialog-backdrop">
        <section className="unsaved-dialog" role="alertdialog" aria-modal="true" aria-labelledby="window-close-dialog-title">
          <header><span><Icon name="warning" /></span><div><strong id="window-close-dialog-title">关闭 markmap++？</strong><small>{windowUnsavedCount} 个文件有未保存的修改</small></div></header>
          <p>不保存并退出会丢弃这些标签中尚未写入磁盘或下载的内容。</p>
          <footer><button type="button" onClick={() => setWindowClosePending(false)}>继续编辑</button><button type="button" className="danger" onClick={() => { setWindowClosePending(false); void desktopApi()?.windowControl.close() }}>不保存并退出</button></footer>
        </section>
      </div>}

      {selectionMenu && <SelectionActionMenu x={selectionMenu.x} y={selectionMenu.y} text={selectionMenu.text} hasLink={selectionMenu.source === 'editor' ? Boolean(selectionMenu.link) : Boolean(selectionMenu.anchor)} onCopy={() => void copySelection(selectionMenu)} onCut={() => void cutSelection(selectionMenu)} onPaste={() => void pasteSelection(selectionMenu)} onLink={() => { setLinkPickerSelection(selectionMenu); setSelectionMenu(null) }} onRemoveLink={() => removeSelectionLink(selectionMenu)} onNativeMenu={() => allowNativeSelectionMenu(selectionMenu)} />}
      {linkPickerSelection && <RepositoryLinkPicker selectionText={linkPickerSelection.text} paths={repositoryPaths} indexes={repositoryIndexes} onChoose={(target) => chooseRepositoryLink(linkPickerSelection, target)} onCreate={async (path) => (await createAgentFile(path, `# ${linkPickerSelection.text}\n`)).ok} onClose={() => setLinkPickerSelection(null)} />}
      {linkNotice && <div className="link-notice" role="status" aria-live="polite">{linkNotice}</div>}

      {activePanel && <div className="panel-backdrop" onMouseDown={() => { if (repositorySaveMode) cancelRepositorySave(); setActivePanel(null) }}>
        <section ref={settingsPanelRef} tabIndex={-1} className={`settings-panel ${activePanel === 'help' ? 'help-panel' : ''} ${activePanel === 'github' ? 'github-panel' : ''} ${activePanel === 'links' ? 'note-links-settings-panel' : ''} ${activePanel === 'export' && exportTab === 'repository' && repositorySaveMode ? 'repository-save-panel' : ''}`} role="dialog" aria-label={activePanel === 'export' ? '导出设置' : activePanel === 'github' ? 'GitHub 仓库' : activePanel === 'help' ? '使用说明' : activePanel === 'links' ? '笔记链接' : '显示设置'} onMouseDown={(event) => event.stopPropagation()}>
          <header><div><strong>{activePanel === 'editor' ? '编辑器设置' : activePanel === 'preview' ? '预览设置' : activePanel === 'github' ? '仓库设置' : activePanel === 'help' ? '使用说明' : activePanel === 'links' ? '笔记链接' : exportTab === 'repository' ? '另存到 Git 仓库' : '导出思维导图'}</strong>{activePanel !== 'help' && <small>{activePanel === 'export' ? exportTab === 'repository' ? '选择仓库位置并暂存当前 Markdown' : '选择格式与清晰度' : activePanel === 'github' ? '在远程仓库与本地文件夹之间随时切换' : activePanel === 'links' ? '反向链接、出站链接与失效目标' : '更改会立即生效'}</small>}</div><div className="panel-header-actions">{(activePanel === 'editor' || activePanel === 'preview') && <button className="reset-settings-button" onClick={resetSettings}><Icon name="refresh" />恢复默认设置</button>}<button className="header-icon" onClick={() => { if (repositorySaveMode) cancelRepositorySave(); setActivePanel(null) }} aria-label="关闭"><Icon name="x" /></button></div></header>
          {activePanel === 'github' && <div className="github-body">
            <div className="repository-settings-tabs" role="tablist"><button role="tab" aria-selected={repositorySettingsTab === 'remote'} className={repositorySettingsTab === 'remote' ? 'active' : ''} onClick={() => { setRepositorySettingsTab('remote'); if (githubConfig) setRepositorySource('remote') }}><Icon name="github" /><span>远程仓库</span><b>{githubProfiles.length}</b></button><button role="tab" aria-selected={repositorySettingsTab === 'local'} className={repositorySettingsTab === 'local' ? 'active' : ''} onClick={() => { setRepositorySettingsTab('local'); if (localGitState.activeId) setRepositorySource('local') }}><Icon name="folder" /><span>本地文件夹</span><b>{localGitState.repositories.length}</b></button></div>
            {repositorySettingsTab === 'remote' ? !githubConfig || addingRemoteRepository ? <div className="github-bind-form repository-bind-panel">
              <label className="field"><span>仓库</span><input type="text" value={repositoryInput} onChange={(event) => setRepositoryInput(event.target.value)} placeholder="owner/repository" /></label>
              <label className="field"><span>分支</span><input type="text" value={branchInput} onChange={(event) => setBranchInput(event.target.value)} placeholder="main" /></label>
              <label className="field"><span>GitHub 令牌</span><input type="password" value={tokenInput} onChange={(event) => setTokenInput(event.target.value)} placeholder="Fine-grained personal access token" /></label>
              <div className="settings-note"><Icon name="github" /><span>{desktopApi() ? '令牌由操作系统加密后保存在本机。' : '令牌保存在当前浏览器的站点存储中。'}请选择该仓库，并授予 Contents 读写权限。</span></div>
              {githubError && <div className="export-error"><Icon name="warning" />{githubError}</div>}
              <div className="repository-bind-actions"><button className="export-submit" disabled={githubBusy} onClick={() => void bindRepository()}><Icon name="github" className={githubBusy ? 'loading-icon' : undefined} />{githubBusy ? '正在连接…' : githubConfig ? '添加仓库' : '绑定仓库'}</button>{githubConfig && <button type="button" onClick={() => setAddingRemoteRepository(false)}>取消</button>}</div>
            </div> : <div className="github-bound-settings">
              {githubProfiles.length > 1 && <label className="field repository-profile-select"><span>当前远程仓库</span><select value={repositoryProfileId(githubConfig)} onChange={(event) => void switchRemoteRepository(event.target.value)}>{githubProfiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.config.owner}/{profile.config.repo} · {profile.config.branch}</option>)}</select></label>}
              <div className="github-repo-card"><Icon name="github" /><span><strong>{githubConfig.owner}/{githubConfig.repo}</strong><small>{githubConfig.branch} · {remoteHead ? remoteHead.slice(0, 7) : '尚未刷新'}</small></span></div>
              <div className="settings-note"><Icon name="check" /><span>编辑只写入浏览器本地缓存。只有点击仓库页的“同步”按钮时，才会自动创建一个 commit 并推送。</span></div>
              {githubError && <div className="export-error"><Icon name="warning" />{githubError}</div>}
              {githubNotice && <div className="github-notice"><Icon name="check" />{githubNotice}</div>}
              <div className="repository-profile-actions"><button type="button" onClick={() => { setRepositoryInput(''); setBranchInput('main'); setTokenInput(''); setAddingRemoteRepository(true) }}><Icon name="plus" />绑定其他仓库</button><button className="github-unbind" type="button" onClick={() => void removeRemoteRepository()}>移除当前绑定</button></div>
            </div> : <div className="local-repositories-panel">
              <div className="local-repositories-intro"><Icon name="folder" /><span><strong>本地文件夹</strong><small>{desktopApi() ? '通过受限接口浏览和自动保存 Markdown；检测到 Git 时再启用提交、同步与历史。路径记录使用系统加密缓存。' : '浏览器无法直接访问本地文件夹，请在 markmap++ 桌面版中打开。'}</small></span></div>
              <button className="local-repository-open" type="button" disabled={localGitBusy || !desktopApi()} onClick={() => void openLocalGitFolder()}><Icon name="folder" className={localGitBusy ? 'loading-icon' : undefined} />{localGitBusy ? '正在打开…' : '打开本地文件夹'}</button>
              {localGitError && <div className="export-error"><Icon name="warning" />{localGitError}</div>}
              {localGitNotice && <div className="github-notice"><Icon name="check" />{localGitNotice}</div>}
              <div className="local-repository-cards">{localGitState.repositories.map((repository) => <article className={repository.id === localGitState.activeId ? 'active' : ''} key={repository.id}><button type="button" className="local-repository-select" onClick={() => void selectLocalRepository(repository.id)}><Icon name={repository.isGitRepository ? 'branch' : 'folder'} /><span><strong>{repository.name}</strong><small title={repository.root}>{repository.root}</small><em>{repository.isGitRepository ? `${repository.branch} · ${repository.remoteLabel || '仅本地'}` : '非 Git 文件夹'} · {repository.files.length} 个 Markdown</em></span></button><button type="button" className="local-repository-forget" aria-label={`移除 ${repository.name} 的打开记录`} title="仅移除记录，不删除文件" onClick={() => void forgetLocalRepository(repository.id)}><Icon name="x" /></button></article>)}</div>
              {!localGitState.repositories.length && <div className="local-repositories-empty">还没有打开过本地文件夹。</div>}
            </div>}
          </div>}
          {activePanel === 'links' && activeRepoPath && <NoteLinksPanel embedded activePath={activeRepoPath} backlinks={backlinks} outgoing={outgoingLinks} indexedCount={repositoryIndexes.length} totalCount={repositoryPaths.length} loading={githubBusyAction === 'load-repository'} onOpenBacklink={(entry) => { setActivePanel(null); void openRepositoryLocation(entry.sourcePath, entry.line) }} onOpenOutgoing={(entry) => { if (!entry.broken) { setActivePanel(null); void openRepositoryLink(entry.href) } }} onIndexAll={() => void loadAllRepositoryNotes()} />}
          {activePanel === 'help' && <div className="help-body">
            <div className="help-tip-stage" role="region" aria-roledescription="carousel" aria-label="使用说明提示卡片" onTouchStart={startHelpSwipe} onTouchEnd={endHelpSwipe}>
              <button type="button" className="help-tip-nav" onClick={() => moveHelpTip(-1)} aria-label="上一条说明"><Icon name="chevron-left" /></button>
              <article className="help-tip-card" aria-live="polite">
                <div className="help-tip-heading"><span>{currentHelpTip.kicker}</span><small>{helpTipIndex + 1} / {HELP_TIP_COUNT}</small></div>
                <h2>{currentHelpTip.title}</h2>
                <p className="help-tip-description">{currentHelpTip.description}</p>
                {currentHelpTip.content}
              </article>
              <button type="button" className="help-tip-nav" onClick={() => moveHelpTip(1)} aria-label="下一条说明"><Icon name="chevron-right" /></button>
            </div>
            <div className="help-tip-footer"><div className="help-tip-dots" role="tablist" aria-label="选择说明提示"><span className="sr-only">当前提示</span>{helpTips.map((tip, index) => <button type="button" key={tip.kicker} className={index === helpTipIndex ? 'active' : ''} role="tab" aria-selected={index === helpTipIndex} aria-label={`查看第 ${index + 1} 条：${tip.title}`} onClick={() => setHelpTipIndex(index)} />)}</div></div>
          </div>}
          {activePanel === 'editor' && <div className="settings-body">
            <label className="field"><span>字号 <b>{settings.editorFontSize}px</b></span><input type="range" min="12" max="22" value={settings.editorFontSize} onChange={(event) => updateSettings('editorFontSize', Number(event.target.value))} /></label>
            <label className="field"><span>字体</span><select value={settings.editorFont} onChange={(event) => updateSettings('editorFont', event.target.value as PreviewFont)}>{Object.entries(previewFonts).map(([value, font]) => <option key={value} value={value}>{font.label}</option>)}</select></label>
            <label className="field"><span>字重 <b>{settings.editorWeight}</b></span><input type="range" min="300" max="700" step="50" value={settings.editorWeight} onChange={(event) => updateSettings('editorWeight', Number(event.target.value))} /></label>
            <label className="field"><span>高亮方案</span><select value={settings.highlightScheme} onChange={(event) => updateSettings('highlightScheme', event.target.value as HighlightScheme)}><option value="violet">Violet</option><option value="github">GitHub</option><option value="solarized">Solarized</option></select></label>
            <div className="font-samples"><small>编辑器与 AI 聊天预览</small><span style={{ fontFamily: previewFonts[settings.editorFont].family, fontSize: `${settings.editorFontSize}px`, fontWeight: settings.editorWeight }}>Markdown AI Chat 0123</span></div>
            <div className="settings-note"><Icon name="warning" /><span>语法检查包括标题层级、代码块闭合与缩进一致性，问题会直接标记在编辑器中。</span></div>
          </div>}
          {activePanel === 'preview' && <div className="settings-body">
            {documentRenderConfig.optionKeys.length > 0 && <div className="settings-note code-options-note"><Icon name="check" /><span>Frontmatter 正在控制：{documentRenderConfig.optionKeys.join('、')}。代码配置优先于此面板。</span></div>}
            <label className={`field ${codeFont.controlsSize ? 'code-controlled' : ''}`}><span>节点字号 <b>{codeFont.controlsSize ? `${effectiveFontSizeCss} · 代码` : `${settings.previewFontSize}px`}</b></span><input type="range" min="12" max="28" value={settings.previewFontSize} disabled={codeFont.controlsSize} onChange={(event) => updateSettings('previewFontSize', Number(event.target.value))} /></label>
            <label className={`field ${codeFont.controlsFamily ? 'code-controlled' : ''}`}><span>字体{codeFont.controlsFamily && <b>由代码控制</b>}</span><select value={settings.previewFont} disabled={codeFont.controlsFamily} onChange={(event) => updateSettings('previewFont', event.target.value as PreviewFont)}>{Object.entries(previewFonts).map(([value, font]) => <option key={value} value={value}>{font.label}</option>)}</select></label>
            <label className={`field ${codeFont.controlsWeight ? 'code-controlled' : ''}`}><span>字重 <b>{codeFont.controlsWeight ? `${effectiveFontWeightCss} · 代码` : settings.previewWeight}</b></span><input type="range" min="300" max="700" step="50" value={settings.previewWeight} disabled={codeFont.controlsWeight} onChange={(event) => updateSettings('previewWeight', Number(event.target.value))} /></label>
            <label className={`field ${documentRenderConfig.colorFreezeLevel !== undefined ? 'code-controlled' : ''}`}><span>颜色层级 <b>{documentRenderConfig.colorFreezeLevel !== undefined ? `${effectiveColorFreezeLevel} · 代码` : effectiveColorFreezeLevel}</b></span><input type="range" min="0" max="6" step="1" value={effectiveColorFreezeLevel} disabled={documentRenderConfig.colorFreezeLevel !== undefined} onChange={(event) => updateSettings('colorFreezeLevel', Number(event.target.value))} /><small>从指定层级开始继承分支颜色，0 表示不锁定</small></label>
            <label className={`export-color-field preview-background-field ${userPreviewBackground ? 'code-controlled' : ''}`}><span>画布背景 <small>{userPreviewBackground ? '由 Markdown style 控制' : 'WCAG 自动主题'}</small></span><span className="export-color-control"><input type="color" value={settings.previewBackgroundColor} disabled={Boolean(userPreviewBackground)} onChange={(event) => updatePreviewBackground(event.target.value)} /><code>{settings.previewBackgroundColor.toUpperCase()}</code></span></label>
            <div className={`export-color-presets preview-background-presets ${userPreviewBackground ? 'code-controlled' : ''}`} aria-label="预览背景颜色预设">{[['#fafafa', '雾白'], ['#ffffff', '纯白'], ['#15181d', '深灰'], ['#000000', '黑色']].map(([color, label]) => <button type="button" key={color} className={settings.previewBackgroundColor === color ? 'active' : ''} title={label} aria-label={`预览背景色：${label}`} disabled={Boolean(userPreviewBackground)} onClick={() => updatePreviewBackground(color)}><span style={{ background: color }} /></button>)}</div>
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
              <div className="export-appearance-options">
                <div className="export-section-heading"><strong>背景与文字</strong><small>{exportFormat === 'md' ? 'Markdown 源文件不包含画布样式' : '导出文件会使用以下画布与文字主题'}</small></div>
                <label className={`export-color-field ${userPreviewBackground ? 'code-controlled' : ''}`}><span>背景颜色 <small>{userPreviewBackground ? '由 Markdown style 控制' : '与预览共用'}</small></span><span className="export-color-control"><input type="color" value={settings.previewBackgroundColor} disabled={exportFormat === 'md' || Boolean(userPreviewBackground)} onChange={(event) => updatePreviewBackground(event.target.value)} /><code>{settings.previewBackgroundColor.toUpperCase()}</code></span></label>
                <div className={`export-color-presets ${userPreviewBackground ? 'code-controlled' : ''}`} aria-label="背景颜色预设">{[['#fafafa', '雾白'], ['#ffffff', '纯白'], ['#15181d', '深灰'], ['#000000', '黑色']].map(([color, label]) => <button type="button" key={color} className={settings.previewBackgroundColor === color ? 'active' : ''} title={label} aria-label={`背景色：${label}`} disabled={exportFormat === 'md' || Boolean(userPreviewBackground)} onClick={() => updatePreviewBackground(color)}><span style={{ background: color }} /></button>)}</div>
                <label className={`switch-field export-appearance-switch ${exportFormat !== 'png' ? 'code-controlled' : ''}`}><span><strong>透明背景</strong><small>{exportFormat === 'png' ? 'PNG 保留透明通道；文字主题仍按当前颜色判断' : '仅 PNG 支持透明背景'}</small></span><input type="checkbox" checked={exportTransparentBackground} disabled={exportFormat !== 'png'} onChange={(event) => setExportTransparentBackground(event.target.checked)} /></label>
                <label className="switch-field export-appearance-switch"><span><strong>自动适配文字主题</strong><small>{exportTextTheme === 'auto' ? `当前自动使用${exportAutoDarkMode ? '深色' : '浅色'}主题` : '关闭后可手动指定内容是否使用暗黑模式'}</small></span><input type="checkbox" checked={exportTextTheme === 'auto'} onChange={(event) => setExportTextTheme(event.target.checked ? 'auto' : (exportDarkMode ? 'dark' : 'light'))} /></label>
                <label className={`switch-field export-appearance-switch ${exportTextTheme === 'auto' ? 'code-controlled' : ''}`}><span><strong>内容暗黑模式</strong><small>{exportTextTheme === 'auto' ? `自动结果：${exportDarkMode ? '开启（浅色文字）' : '关闭（深色文字）'}` : exportDarkMode ? '手动：使用浅色文字和深色内容样式' : '手动：使用深色文字和浅色内容样式'}</small></span><input type="checkbox" checked={exportDarkMode} disabled={exportTextTheme === 'auto'} onChange={(event) => setExportTextTheme(event.target.checked ? 'dark' : 'light')} /></label>
              </div>
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
