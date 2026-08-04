import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Markmap, toMarkdown, Transformer } from 'markmap-plus'
import '@fontsource-variable/inter'
import '@fontsource-variable/jetbrains-mono'
import '@fontsource-variable/noto-sans-sc/wght.css'
import '@fontsource-variable/noto-serif-sc/wght.css'
import 'lxgw-wenkai-webfont/lxgwwenkai-regular.css'
import MarkdownEditor, { type HighlightScheme } from './markdown-editor'
import { inspectMarkdown } from './markdown-lint'
import {
  downloadMarkdown,
  listCachedFiles,
  listRemoteMarkdown,
  loadGitHubConfig,
  pushCachedChanges,
  putCachedFile,
  removeCachedFile,
  repoKeyOf,
  saveGitHubConfig,
  verifyRepository,
  type CachedMarkdownFile,
  type GitHubConfig,
  type RemoteMarkdownFile,
} from './github-sync'

const transformer = new Transformer()
const SETTINGS_KEY = 'markmap-plus-plus:settings'

const starterDocument = `# markmap++

## 欢迎使用
- 左侧是 Markdown 编辑器，右侧是实时思维导图
- 可以直接修改这份示例来体验功能
- 刷新或重新打开页面后，示例会恢复为这份操作指南
- 需要保留内容时，请使用顶部“导出”保存 Markdown

## 节点操作
- 单击节点：只选中节点，不会进入文字编辑
- 双击节点：进入文字编辑，此时按 Enter 保存文字
- 单击选中后按 Enter：新增同级节点
- 单击选中后按 Tab：新增子节点
- 单击选中后按 Delete 或 Backspace：删除整个节点
- 误操作后可以点击顶部的“撤回”

## 画布操作
- 拖动画布自由移动
- 滚轮缩放视图
- 点击圆点折叠分支
- 点击预览右上角的适应图标，让导图重新居中

## 编辑与显示
- 拖动中间分割线可以调整编辑器和预览宽度
- 分割线上的长条按钮可以收起或展开编辑器
- 编辑器和预览右上角都可以调整字号与显示设置
- 顶部按钮可以切换全屏和深浅色模式

## GitHub 多端同步
- 点击顶部“GitHub”绑定仓库，编辑区可在 Markdown 与仓库文件树之间切换
- 点击仓库中的 Markdown 文件后，它会下载到当前设备并长期缓存
- 编辑和重命名只会保存在本地，文件树使用橙色 M 或 R 标记待推送文件
- 标题栏绿点表示已同步，橙点表示已暂存但未推送，黄点表示正在同步
- 确认修改后点击“同步”，markmap++ 才会创建一次提交并推送全部修改

## 导出
- 支持 SVG、PNG、JPEG 和 HTML
- 位图可选择渲染倍率
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
  showGrid: boolean
}

const defaultSettings: AppSettings = {
  editorFontSize: 14,
  highlightScheme: 'violet',
  previewFontSize: 16,
  previewFont: 'notoSans',
  previewWeight: 400,
  showGrid: true,
}

const previewFonts: Record<PreviewFont, { label: string; family: string }> = {
  notoSans: { label: '思源黑体（Noto Sans SC Variable）', family: '"Noto Sans SC Variable", sans-serif' },
  notoSerif: { label: '思源宋体（Noto Serif SC Variable）', family: '"Noto Serif SC Variable", serif' },
  wenkai: { label: '霞鹜文楷（LXGW WenKai）', family: '"LXGW WenKai", cursive' },
  inter: { label: 'Inter Variable', family: '"Inter Variable", sans-serif' },
  mono: { label: 'JetBrains Mono Variable', family: '"JetBrains Mono Variable", monospace' },
}

interface RepositoryRow {
  type: 'folder' | 'file'
  path: string
  name: string
  depth: number
  remote?: RemoteMarkdownFile
  cached?: CachedMarkdownFile
}

function buildRepositoryRows(remoteFiles: RemoteMarkdownFile[], cachedFiles: CachedMarkdownFile[]): RepositoryRow[] {
  const files = new Map<string, { remote?: RemoteMarkdownFile; cached?: CachedMarkdownFile }>()
  remoteFiles.forEach((remote) => {
    const cached = cachedFiles.find((file) => file.path === remote.path || file.originalPath === remote.path)
    files.set(cached?.status === 'renamed' ? cached.path : remote.path, { remote, cached })
  })
  cachedFiles.forEach((cached) => {
    if (!files.has(cached.path)) files.set(cached.path, { cached })
  })
  const rows: RepositoryRow[] = []
  const folders = new Set<string>()
  Array.from(files.entries()).sort(([a], [b]) => a.localeCompare(b)).forEach(([path, value]) => {
    const parts = path.split('/')
    for (let index = 0; index < parts.length - 1; index += 1) {
      const folderPath = parts.slice(0, index + 1).join('/')
      if (!folders.has(folderPath)) {
        folders.add(folderPath)
        rows.push({ type: 'folder', path: folderPath, name: parts[index], depth: index })
      }
    }
    rows.push({ type: 'file', path, name: parts.at(-1) || path, depth: parts.length - 1, ...value })
  })
  return rows
}

type IconName = 'check' | 'chevron-left' | 'chevron-right' | 'download' | 'expand' | 'focus' | 'folder' | 'github' | 'help' | 'map' | 'moon' | 'settings' | 'sun' | 'undo' | 'warning' | 'x'

const iconPaths: Record<IconName, React.ReactNode> = {
  check: <path d="m5 12 4 4L19 6"/>,
  'chevron-left': <path d="m15 18-6-6 6-6"/>,
  'chevron-right': <path d="m9 18 6-6-6-6"/>,
  download: <><path d="M12 3v12m0 0 4-4m-4 4-4-4"/><path d="M5 19h14"/></>,
  expand: <><path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5"/><path d="m3 8 5-5m8-5 5 5M3 16l5 5m8 0 5-5"/></>,
  focus: <><circle cx="12" cy="12" r="3"/><path d="M12 2v4m0 12v4M2 12h4m12 0h4"/></>,
  folder: <><path d="M3 7.5V6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3Z"/><path d="M3 9h18"/></>,
  github: <><circle cx="6" cy="5" r="2"/><circle cx="18" cy="6" r="2"/><circle cx="8" cy="19" r="2"/><path d="M6 7v5a3 3 0 0 0 3 3h5a4 4 0 0 0 4-4V8M8 17v-2"/></>,
  help: <><circle cx="12" cy="12" r="9"/><path d="M9.8 9a2.3 2.3 0 1 1 3.4 2c-.8.5-1.2 1-1.2 2"/><path d="M12 17h.01"/></>,
  map: <><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3Z"/><path d="M9 3v15m6-12v15"/></>,
  moon: <path d="M20 15.2A8 8 0 1 1 8.8 4 6.5 6.5 0 0 0 20 15.2Z"/>,
  settings: <><path d="M4 7h10m4 0h2M4 12h3m4 0h9M4 17h8m4 0h4"/><circle cx="16" cy="7" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="14" cy="17" r="2"/></>,
  sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/></>,
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
  const [exportFormat, setExportFormat] = useState<ExportFormat>('png')
  const [exportScale, setExportScale] = useState(2)
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
  const [activeRepoPath, setActiveRepoPath] = useState<string | null>(null)
  const [githubBusy, setGithubBusy] = useState(false)
  const [githubError, setGithubError] = useState('')
  const [githubNotice, setGithubNotice] = useState('')
  const initialMarkdownRef = useRef(markdown)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const mmRef = useRef<Markmap | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const workspaceRef = useRef<HTMLElement | null>(null)
  const resizeWidthRef = useRef(editorWidth)
  const markdownRef = useRef(markdown)
  const historyRef = useRef<string[]>([])
  const lastEditRef = useRef({ source: '', time: 0 })

  const diagnostics = useMemo(() => inspectMarkdown(markdown), [markdown])
  const updateSettings = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => setSettings((current) => ({ ...current, [key]: value }))
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

  const renameCachedMarkdown = async (file: CachedMarkdownFile) => {
    const nextPath = window.prompt('输入新的仓库路径（以 .md 结尾）', file.path)?.trim().replace(/^\/+/, '')
    if (!nextPath || nextPath === file.path) return
    if (!/\.md$/i.test(nextPath) || nextPath.split('/').includes('..')) { setGithubError('文件路径必须以 .md 结尾，且不能包含 ..'); return }
    if (cachedFiles.some((item) => item.path === nextPath)) { setGithubError('本地缓存中已存在同名路径'); return }
    const renamed = { ...file, id: `${file.repoKey}:${nextPath}`, path: nextPath, status: 'renamed' as const, updatedAt: Date.now() }
    await removeCachedFile(file.id)
    await putCachedFile(renamed)
    setCachedFiles((current) => current.map((item) => item.id === file.id ? renamed : item).sort((a, b) => a.path.localeCompare(b.path)))
    if (activeRepoPath === file.path) { setActiveRepoPath(nextPath); setFileName(nextPath) }
  }

  const pushRepositoryChanges = async () => {
    if (!githubConfig) return
    setGithubBusy(true); setGithubError(''); setGithubNotice('')
    try {
      const result = await pushCachedChanges(githubConfig, cachedFiles)
      const refreshed = await listRemoteMarkdown(githubConfig)
      setRemoteHead(refreshed.head); setRemoteFiles(refreshed.files)
      const cleanFiles = cachedFiles.map((file) => {
        if (file.status === 'clean') return file
        const remote = refreshed.files.find((item) => item.path === file.path)
        return { ...file, originalPath: file.path, baseContent: file.content, baseSha: remote?.sha || file.baseSha, baseCommit: result.commitSha, status: 'clean' as const, updatedAt: Date.now() }
      })
      await Promise.all(cleanFiles.map(putCachedFile))
      setCachedFiles(cleanFiles)
      setGithubNotice(`已推送：${result.message}`)
    } catch (error) {
      setGithubError(error instanceof Error ? error.message : '推送失败')
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
      setGithubNotice('仓库文件列表已刷新')
    } catch (error) {
      setGithubError(error instanceof Error ? error.message : '刷新仓库失败')
    } finally { setGithubBusy(false) }
  }

  const openRepositoryRow = (row: RepositoryRow) => {
    if (row.remote) void openRepositoryFile(row.remote)
    else if (row.cached) activateCachedFile(row.cached)
  }

  const renameRepositoryRow = async (row: RepositoryRow) => {
    if (row.cached) { await renameCachedMarkdown(row.cached); return }
    if (!row.remote || !githubConfig) return
    setGithubBusy(true); setGithubError('')
    try {
      const file = await downloadMarkdown(githubConfig, row.remote, remoteHead)
      await putCachedFile(file)
      setCachedFiles((current) => [...current, file].sort((a, b) => a.path.localeCompare(b.path)))
      await renameCachedMarkdown(file)
    } catch (error) {
      setGithubError(error instanceof Error ? error.message : '重命名文件失败')
    } finally { setGithubBusy(false) }
  }

  useEffect(() => {
    if (!svgRef.current) return
    const mm = Markmap.create(svgRef.current, {
      mode: 'editable', autoFit: false, collapseOnHover: false, duration: 220,
      inputPlaceholder: '输入节点内容', onNodeEdit: syncFromMap, onNodeAdd: syncFromMap,
    })
    mmRef.current = mm
    const { root } = transformer.transform(initialMarkdownRef.current)
    void mm.setData(root).then(() => mm.fit())
    return () => { mm.destroy(); mmRef.current = null }
  }, [syncFromMap])

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
    void listCachedFiles(repoKeyOf(githubConfig)).then(setCachedFiles).catch(() => setGithubError('无法读取本地仓库缓存'))
  }, [githubConfig])

  useEffect(() => {
    if (!activeRepoPath) return
    const timer = window.setTimeout(() => {
      setCachedFiles((current) => {
        const file = current.find((item) => item.path === activeRepoPath)
        if (!file || file.content === markdown) return current
        const next = {
          ...file,
          content: markdown,
          status: (file.originalPath !== file.path ? 'renamed' : markdown === file.baseContent ? 'clean' : 'modified') as CachedMarkdownFile['status'],
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
    if (!mm) return
    const { root } = transformer.transform(renderedMarkdown)
    void mm.setData(root)
  }, [renderedMarkdown])

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
    const svg = svgRef.current
    if (svg) {
      svg.style.setProperty('--markmap-text-color', dark ? '#f4f6f9' : '#30333a')
      svg.style.setProperty('--markmap-circle-open-bg', dark ? '#191c22' : '#ffffff')
      svg.style.setProperty('--markmap-code-bg', dark ? '#2a303a' : '#eef0f4')
      svg.style.setProperty('--markmap-code-color', dark ? '#ffffff' : '#444852')
    }
  }, [dark])

  useEffect(() => {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)) } catch { /* storage may be disabled */ }
    const svg = svgRef.current
    if (!svg) return
    const { family } = previewFonts[settings.previewFont]
    svg.style.setProperty('--markmap-font', `${settings.previewWeight} ${settings.previewFontSize}px/${Math.round(settings.previewFontSize * 1.35)}px ${family}`)
    window.setTimeout(() => void mmRef.current?.setData().then(() => mmRef.current?.fit()), 50)
  }, [settings])

  useEffect(() => {
    const handleFullscreen = () => setFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', handleFullscreen)
    return () => document.removeEventListener('fullscreenchange', handleFullscreen)
  }, [])

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
    workspaceRef.current?.classList.add('resizing')
    const move = (pointer: PointerEvent) => {
      const rect = workspaceRef.current?.getBoundingClientRect()
      if (!rect) return
      const width = Math.max(24, Math.min(76, ((pointer.clientX - rect.left) / rect.width) * 100))
      resizeWidthRef.current = width
      workspaceRef.current!.style.gridTemplateColumns = `${width}% 18px 1fr`
    }
    const stop = () => {
      setEditorWidth(resizeWidthRef.current)
      workspaceRef.current?.classList.remove('resizing')
      document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', stop)
    }
    document.addEventListener('pointermove', move); document.addEventListener('pointerup', stop)
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
    const documentNode = new DOMParser().parseFromString(source, 'image/svg+xml')
    documentNode.querySelectorAll('foreignObject').forEach((foreignObject) => {
      const text = documentNode.createElementNS('http://www.w3.org/2000/svg', 'text')
      const x = Number(foreignObject.getAttribute('x') || 0) + 6
      const height = Number(foreignObject.getAttribute('height') || settings.previewFontSize * 1.5)
      text.setAttribute('x', String(x))
      text.setAttribute('y', String(height / 2))
      text.setAttribute('dominant-baseline', 'middle')
      text.setAttribute('fill', dark ? '#f4f6f9' : '#30333a')
      text.setAttribute('font-size', String(settings.previewFontSize))
      text.setAttribute('font-weight', String(settings.previewWeight))
      text.setAttribute('font-family', settings.previewFont === 'notoSerif' ? 'SimSun, serif' : settings.previewFont === 'wenkai' ? 'KaiTi, cursive' : settings.previewFont === 'mono' ? 'Consolas, monospace' : 'Arial, sans-serif')
      text.textContent = foreignObject.textContent?.replace(/\s+/g, ' ').trim() || ''
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
  const repositoryRows = buildRepositoryRows(remoteFiles, cachedFiles)
  const titleSyncState = activeCachedFile ? githubBusy ? 'syncing' : activeCachedFile.status === 'clean' ? 'synced' : 'dirty' : saveState
  const titleSyncText = activeCachedFile ? githubBusy ? '同步中' : activeCachedFile.status === 'clean' ? '已同步' : '已暂存但未推送' : saveState === 'saved' ? '当前内容已更新' : '正在更新预览…'

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand" aria-label="markmap++"><span className="brand-mark"><Icon name="map" /></span><span className="brand-name">markmap<span>++</span></span></div>
        <div className="document-name" title={fileName}><span className={`save-dot ${titleSyncState}`} /><span>{fileName}</span><small>{titleSyncText}</small></div>
        <nav className="actions" aria-label="文档操作">
          <input ref={fileInputRef} className="visually-hidden" type="file" accept=".md,.markdown,text/markdown,text/plain" onChange={openFile} />
          <button type="button" className="button secondary" onClick={() => fileInputRef.current?.click()}><Icon name="folder" /><span>打开</span></button>
          <button type="button" className="button secondary github-button" onClick={openGitHubPanel}><Icon name="github" /><span>GitHub</span>{changedFiles.length > 0 && <b>{changedFiles.length}</b>}</button>
          <button type="button" className="button secondary" onClick={() => setActivePanel('help')}><Icon name="help" /><span>说明</span></button>
          <button type="button" className="button secondary" onClick={undoLastChange} disabled={!canUndo} title="撤回上一次修改"><Icon name="undo" /><span>撤回</span></button>
          <button type="button" className="button primary" onClick={() => { setExportError(''); setActivePanel('export') }}><Icon name="download" /><span>导出</span></button>
          <button type="button" className="icon-button" aria-label={fullscreen ? '退出全屏' : '进入全屏'} title={fullscreen ? '退出全屏' : '全屏'} onClick={() => void toggleFullscreen()}><Icon name={fullscreen ? 'x' : 'expand'} /></button>
          <button type="button" className="icon-button" aria-label={dark ? '切换浅色模式' : '切换深色模式'} title={dark ? '浅色模式' : '深色模式'} onClick={() => setDark((value) => !value)}><Icon name={dark ? 'sun' : 'moon'} /></button>
        </nav>
      </header>

      <div className="mobile-tabs" role="tablist" aria-label="工作区视图"><button className={mobilePane === 'editor' ? 'active' : ''} onClick={() => setMobilePane('editor')}>Markdown</button><button className={mobilePane === 'preview' ? 'active' : ''} onClick={() => setMobilePane('preview')}>思维导图</button></div>

      <section ref={workspaceRef} className={`workspace mobile-${mobilePane}`} style={{ gridTemplateColumns: gridColumns }}>
        <section className={`editor-pane ${editorCollapsed ? 'collapsed' : ''} ${editorView === 'repository' ? 'repository-view' : ''}`} aria-label="Markdown 编辑器">
          {!editorCollapsed && <>
            <div className="pane-header"><div className="editor-view-tabs"><button className={editorView === 'markdown' ? 'active' : ''} onClick={() => setEditorView('markdown')}><span className="status-light" />Markdown</button><button className={editorView === 'repository' ? 'active' : ''} onClick={openGitHubPanel}><Icon name="github" />仓库{changedFiles.length > 0 && <b>{changedFiles.length}</b>}</button></div><button className="header-icon" onClick={() => setActivePanel(editorView === 'repository' ? 'github' : 'editor')} title={editorView === 'repository' ? '仓库设置' : '编辑器设置'}><Icon name="settings" /></button></div>
            {editorView === 'markdown' ? <>
              <MarkdownEditor value={markdown} onChange={updateMarkdown} dark={dark} fontSize={settings.editorFontSize} scheme={settings.highlightScheme} />
              <footer className="editor-status"><button className={`lint-status ${diagnostics.length ? 'has-issues' : ''}`} onClick={() => diagnostics.length && setShowDiagnostics((value) => !value)} disabled={!diagnostics.length}><Icon name={diagnostics.length ? 'warning' : 'check'} />{diagnostics.length ? diagnostics.length : '语法正常'}</button><span>{lineCount} 行</span><span>{markdown.length} 字符</span><span>Markdown</span></footer>
              {showDiagnostics && diagnostics.length > 0 && <div className="diagnostics-popover"><header><strong>语法问题</strong><button className="header-icon" onClick={() => setShowDiagnostics(false)} aria-label="关闭问题列表"><Icon name="x" /></button></header>{diagnostics.map((item, index) => { const line = markdown.slice(0, item.from).split('\n').length; return <button key={`${item.from}-${index}`} onClick={() => setShowDiagnostics(false)}><Icon name="warning" /><span><strong>第 {line} 行</strong><small>{item.message}</small></span></button> })}</div>}
            </> : <div className="repository-workspace">
              {!githubConfig ? <div className="repository-unbound"><Icon name="github" /><strong>尚未绑定 GitHub 仓库</strong><span>绑定后可浏览 Markdown 文件并在本地暂存修改。</span><button onClick={() => setActivePanel('github')}>绑定仓库</button></div> : <>
                <div className="repository-toolbar"><div><strong>{githubConfig.owner}/{githubConfig.repo}</strong><small>{githubConfig.branch}</small></div><button title="刷新仓库" onClick={() => void refreshRepositoryView()} disabled={githubBusy}>刷新</button><button className="sync-button" onClick={() => void pushRepositoryChanges()} disabled={githubBusy || !changedFiles.length}>{githubBusy ? '同步中…' : `同步${changedFiles.length ? ` ${changedFiles.length}` : ''}`}</button></div>
                {githubError && <div className="repository-error"><Icon name="warning" />{githubError}</div>}
                {githubNotice && <div className="repository-notice"><Icon name="check" />{githubNotice}</div>}
                <div className="repository-tree" role="tree" aria-label="GitHub Markdown 文件树">
                  {repositoryRows.length ? repositoryRows.map((row) => row.type === 'folder' ? <div className="tree-folder" key={`folder:${row.path}`} style={{ paddingLeft: 12 + row.depth * 16 }}><Icon name="folder" /><span>{row.name}</span></div> : <div className={`tree-file ${activeRepoPath === row.path ? 'active' : ''}`} key={`file:${row.path}`} style={{ paddingLeft: 12 + row.depth * 16 }}><button className="tree-open" onClick={() => openRepositoryRow(row)}><Icon name="map" /><span>{row.name}</span></button>{row.cached?.status !== 'clean' && <b>{row.cached?.status === 'renamed' ? 'R' : 'M'}</b>}{row.cached?.status === 'clean' && <i /> }<button className="tree-rename" title={`重命名 ${row.path}`} onClick={() => void renameRepositoryRow(row)}>重命名</button></div>) : <div className="github-empty">{githubBusy ? '正在读取仓库…' : '仓库中没有 Markdown 文件'}</div>}
                </div>
                <footer className="repository-status"><span className={changedFiles.length ? 'dirty' : 'clean'} />{changedFiles.length ? `${changedFiles.length} 个文件已暂存但未推送` : '所有缓存文件均已同步'}<button onClick={() => setActivePanel('github')}>仓库设置</button></footer>
              </>}
            </div>}
          </>}
        </section>

        <div className="split-handle"><div className="grab-zone" onPointerDown={startResize} role="separator" aria-label="调整编辑器与预览宽度"><span /></div><button className="split-toggle" onClick={toggleEditor} title={editorCollapsed ? '展开编辑器' : '收起编辑器'} aria-label={editorCollapsed ? '展开编辑器' : '收起编辑器'}><Icon name={editorCollapsed ? 'chevron-right' : 'chevron-left'} /></button></div>

        <section className="preview-pane" aria-label="思维导图预览">
          <>
            <div className="pane-header"><div><span className="status-light purple" />思维导图</div><button type="button" className="fit-button" onClick={() => mmRef.current?.fit()} title="适应画布" aria-label="适应画布"><Icon name="focus" /></button><button className="header-icon" onClick={() => setActivePanel('preview')} title="预览设置"><Icon name="settings" /></button></div>
            <div className={`map-canvas ${settings.showGrid ? '' : 'no-grid'}`}><svg ref={svgRef} /></div>
          </>
        </section>
      </section>

      {activePanel && <div className="panel-backdrop" onMouseDown={() => setActivePanel(null)}>
        <section className={`settings-panel ${activePanel === 'help' ? 'help-panel' : ''} ${activePanel === 'github' ? 'github-panel' : ''}`} role="dialog" aria-label={activePanel === 'export' ? '导出设置' : activePanel === 'github' ? 'GitHub 仓库' : activePanel === 'help' ? '使用说明' : '显示设置'} onMouseDown={(event) => event.stopPropagation()}>
          <header><div><strong>{activePanel === 'editor' ? '编辑器设置' : activePanel === 'preview' ? '预览设置' : activePanel === 'github' ? 'GitHub 仓库' : activePanel === 'help' ? '使用说明' : '导出思维导图'}</strong><small>{activePanel === 'export' ? '选择格式与清晰度' : activePanel === 'github' ? '本地暂存，确认后一次提交并推送' : activePanel === 'help' ? '不会覆盖当前 Markdown' : '更改会立即生效'}</small></div><button className="header-icon" onClick={() => setActivePanel(null)} aria-label="关闭"><Icon name="x" /></button></header>
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
              <button className="export-submit" onClick={() => { setEditorView('repository'); setActivePanel(null) }}><Icon name="folder" />打开仓库文件树</button>
              <button className="github-unbind" type="button" onClick={() => { saveGitHubConfig(null); setGithubConfig(null); setRemoteFiles([]); setRemoteHead(''); setEditorView('markdown'); setGithubNotice('') }}>解除仓库绑定</button>
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
            <label className="field"><span>节点字号 <b>{settings.previewFontSize}px</b></span><input type="range" min="12" max="28" value={settings.previewFontSize} onChange={(event) => updateSettings('previewFontSize', Number(event.target.value))} /></label>
            <label className="field"><span>字体</span><select value={settings.previewFont} onChange={(event) => updateSettings('previewFont', event.target.value as PreviewFont)}>{Object.entries(previewFonts).map(([value, font]) => <option key={value} value={value}>{font.label}</option>)}</select></label>
            <label className="field"><span>字重 <b>{settings.previewWeight}</b></span><input type="range" min="300" max="700" step="50" value={settings.previewWeight} onChange={(event) => updateSettings('previewWeight', Number(event.target.value))} /></label>
            <label className="switch-field"><span><strong>点阵背景</strong><small>辅助观察画布移动与缩放</small></span><input type="checkbox" checked={settings.showGrid} onChange={(event) => updateSettings('showGrid', event.target.checked)} /></label>
            <div className="font-samples"><small>字体预览</small><span style={{ fontFamily: previewFonts[settings.previewFont].family, fontWeight: settings.previewWeight }}>思维导图 Mind Map 0123</span></div>
          </div>}
          {activePanel === 'export' && <div className="settings-body">
            <div className="format-grid">{(['png', 'jpeg', 'svg', 'html', 'md'] as ExportFormat[]).map((format) => <button key={format} className={exportFormat === format ? 'active' : ''} onClick={() => { setExportError(''); setExportFormat(format) }}><strong>{format === 'md' ? 'MD' : format.toUpperCase()}</strong><small>{format === 'png' ? '无损位图' : format === 'jpeg' ? '体积更小' : format === 'svg' ? '无限清晰' : format === 'html' ? '网页文件' : '源文件'}</small></button>)}</div>
            <label className="field"><span>渲染倍率 <b>{exportScale}×</b></span><input type="range" min="1" max="4" step="1" value={exportScale} onChange={(event) => setExportScale(Number(event.target.value))} disabled={exportFormat === 'md'} /><small>{exportFormat === 'svg' ? '倍率设置 SVG 的画布尺寸，矢量内容始终清晰' : exportFormat === 'html' ? 'HTML 将保留可缩放矢量图' : exportFormat === 'md' ? 'Markdown 源文件无需倍率' : `预计输出为当前内容尺寸的 ${exportScale} 倍`}</small></label>
            {exportError && <div className="export-error"><Icon name="warning" />{exportError}</div>}
            <button className="export-submit" disabled={exporting} onClick={() => void exportDocument()}><Icon name="download" />{exporting ? '正在生成…' : `导出 ${exportFormat.toUpperCase()}`}</button>
          </div>}
        </section>
      </div>}
    </main>
  )
}
