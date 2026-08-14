import { Children, isValidElement, useEffect, useId, useMemo, useRef, useState, type ComponentPropsWithoutRef, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject, type WheelEvent as ReactWheelEvent } from 'react'
import { createPortal } from 'react-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { askAgent, testAgentConnection, type AgentAppliedChange, type AgentMessage, type AgentProposal, type AgentSourceFile } from './agent-client'
import { buildAgentDiff } from './agent-diff'
import { activeContent, AGENT_WELCOME_MESSAGE, conversationMarkdown, createConversation, flattenMessages, loadAgentConversations, normalizeStoredWorkspaceKey, saveAgentConversations, truncateAtPath, updateAtPath, type AgentConversation, type AgentWorkspaceRef, type AgentWorkspaceSelectionResult } from './agent-history'
import { defaultAgentProviderConfig, fetchProviderModels, loadAgentProviderConfig, providerDefinition, providerDefinitions, saveAgentProviderConfig, type AgentProviderConfig, type AgentProviderId, type AgentProviderProfile } from './agent-provider'
import { saveBlob } from './desktop-api'
import { useI18n } from '../i18n-hook'

type AgentMode = 'chat' | 'edit'

export type AgentMutationResult = { ok: true } | { ok: false; error: string }
export type AgentCommitResult = { ok: true; commitSha: string; message: string } | { ok: false; error: string }

function profileOf(config: AgentProviderConfig): AgentProviderProfile {
  return { apiKey: config.apiKey, baseUrl: config.baseUrl, model: config.model, availableModels: config.availableModels }
}

// 工具行是横向滚动容器（overflow-x），absolute 定位的 popover 会被裁剪，
// 所以挂载时直接转 fixed 锚定到触发按钮；优先向上弹，上方空间不足则改为向下弹，
// 并清除 CSS 的 bottom（否则 fixed 下 top+bottom 会把高度压扁）。
function clampPopover(el: HTMLDivElement | null) {
  if (!el) return
  const margin = 12
  const trigger = el.closest('.agent-option-wrap')?.querySelector<HTMLButtonElement>('.agent-option-trigger')
  if (trigger) {
    const t = trigger.getBoundingClientRect()
    const w = el.offsetWidth
    const h = el.offsetHeight
    const x = Math.min(Math.max(margin, t.left), Math.max(margin, window.innerWidth - w - margin))
    const y = t.top - margin >= h + 7 ? t.top - h - 7 : Math.min(t.bottom + 7, window.innerHeight - h - margin)
    el.style.position = 'fixed'
    el.style.left = `${x}px`
    el.style.top = `${Math.max(margin, y)}px`
    el.style.bottom = 'auto'
    el.style.transform = ''
    return
  }
  const rect = el.getBoundingClientRect()
  const viewport = document.documentElement.clientWidth
  let dx = 0
  let dy = 0
  if (rect.right > viewport - margin) dx = viewport - margin - rect.right
  if (rect.left + dx < margin) dx = margin - rect.left
  if (rect.top < margin) dy = margin - rect.top
  if (dx || dy) el.style.transform = `translate(${dx}px, ${dy}px)`
}

function withActiveProfile(config: AgentProviderConfig): AgentProviderConfig {
  return { ...config, providerProfiles: { ...config.providerProfiles, [config.provider]: profileOf(config) } }
}

function downloadJson(name: string, data: unknown) {
  void saveBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), name)
}

function backupDate() {
  return new Date().toISOString().slice(0, 10)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

// 暗色模式下节点背景若是浅色（classDef/style 里写的浅色填充），与浅色文字对比度不足。
// 处理：保留色相与饱和度，反相明度——纯白变纯黑，浅彩变深彩，文字仍是浅色，对比度达标。
function adaptDarkMermaidSvg(svg: string): string {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml')
  const cache = new Map<string, string>()
  const parseColor = (raw: string): [number, number, number] | null => {
    const value = raw.trim()
    const hex = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)
    if (hex) {
      const full = hex[1].length === 3 ? hex[1].split('').map((c) => c + c).join('') : hex[1]
      return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)]
    }
    const rgb = value.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/)
    if (rgb) return [Math.min(255, Number(rgb[1])), Math.min(255, Number(rgb[2])), Math.min(255, Number(rgb[3]))]
    return null
  }
  const toHex = (r: number, g: number, b: number) => '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')
  const rgbToHsl = (rgb: [number, number, number]): [number, number, number] => {
    const [r, g, b] = [rgb[0] / 255, rgb[1] / 255, rgb[2] / 255]
    const max = Math.max(r, g, b), min = Math.min(r, g, b)
    const l = (max + min) / 2
    if (max === min) return [0, 0, l]
    const d = max - min
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    let h = 0
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
    else if (max === g) h = ((b - r) / d + 2) / 6
    else h = ((r - g) / d + 4) / 6
    return [h, s, l]
  }
  const hslToHex = ([h, s, l]: [number, number, number]): string => {
    if (s === 0) return toHex(l * 255, l * 255, l * 255)
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s
    const p = 2 * l - q
    const channel = (t: number) => {
      const tt = ((t % 1) + 1) % 1
      return tt < 1 / 6 ? p + (q - p) * 6 * tt : tt < 1 / 2 ? q : tt < 2 / 3 ? p + (q - p) * (2 / 3 - tt) * 6 : p
    }
    return toHex(channel(h + 1 / 3) * 255, channel(h) * 255, channel(h - 1 / 3) * 255)
  }
  const transform = (raw: string) => {
    const rgb = parseColor(raw)
    if (!rgb) return raw
    const [h, s, l] = rgbToHsl(rgb)
    if (l < 0.55) return raw // 本身够深，浅色文字可读
    return hslToHex([h, s, 1 - l]) // 色相/饱和度不变，明度反相
  }
  doc.querySelectorAll('g.node > rect, g.node > circle, g.node > ellipse, g.node > polygon, g.node > path').forEach((shape) => {
    const style = shape.getAttribute('style') || ''
    const match = style.match(/fill\s*:\s*([^;!]+)/i)
    if (!match) return
    const key = match[1].trim()
    if (!cache.has(key)) cache.set(key, transform(key))
    const next = cache.get(key)
    if (next === key) return
    shape.setAttribute('style', style.replace(/fill\s*:\s*[^;!]+/i, 'fill:' + next))
    const label = shape.parentElement?.querySelector(':scope > .label') ?? shape.parentElement?.querySelector('.label')
    if (label) {
      const current = label.getAttribute('style') || ''
      label.setAttribute('style', /fill\s*:/.test(current) ? current.replace(/fill\s*:\s*[^;!]+/i, 'fill:#ccc') : current + (current ? ';' : '') + 'fill:#ccc')
    }
  })
  return new XMLSerializer().serializeToString(doc)
}

function MermaidDiagram({ chart }: { chart: string }) {
  const { t } = useI18n()
  const [result, setResult] = useState<{ chart: string; svg: string; error: string }>({ chart: '', svg: '', error: '' })
  const [sourceOpen, setSourceOpen] = useState(false)
  const [sourceCopied, setSourceCopied] = useState(false)
  const [zoomOpen, setZoomOpen] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [diagramSize, setDiagramSize] = useState<{ w: number; h: number } | null>(null)
  const id = useId().replace(/:/g, '')
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const gesture = useRef<{ points: Record<number, { x: number; y: number }>; panStart?: { x: number; y: number; originX: number; originY: number }; pinchStart?: { distance: number; zoom: number } }>({ points: {} })
  // 跟随应用主题：监听 <html> 的 data-theme 属性变化（浅/深色切换），变化时用新主题重新渲染图表。
  const [theme, setTheme] = useState<'dark' | 'default'>(() => document.documentElement.dataset.theme === 'dark' ? 'dark' : 'default')
  useEffect(() => {
    const element = document.documentElement
    const sync = () => setTheme(element.dataset.theme === 'dark' ? 'dark' : 'default')
    const observer = new MutationObserver(sync)
    observer.observe(element, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    let active = true
    void import('mermaid').then(({ default: mermaid }) => {
      // htmlLabels: false 让节点标签渲染为 SVG <text>（纯矢量），放大时保持清晰；否则标签是 foreignObject（HTML 位图），缩放会变糊。
      mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', htmlLabels: false, theme })
      return mermaid.render(`agent-mermaid-${id}`, chart)
    }).then((rendered) => { if (active) setResult({ chart, svg: theme === 'dark' ? adaptDarkMermaidSvg(rendered.svg) : rendered.svg, error: '' }) }).catch(() => { if (active) setResult({ chart, svg: '', error: '图表语法无法渲染，以下保留原始 Mermaid 代码。' }) })
    return () => { active = false }
  }, [chart, id, theme])

  useEffect(() => {
    if (!zoomOpen) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setZoomOpen(false) }
    window.addEventListener('keydown', closeOnEscape)
    return () => { document.body.style.overflow = previous; window.removeEventListener('keydown', closeOnEscape) }
  }, [zoomOpen])

  const current = result.chart === chart ? result : { svg: '', error: '' }

  useEffect(() => {
    if (!zoomOpen || !current.svg) return
    const viewport = viewportRef.current
    if (!viewport) return
    const viewBox = current.svg.match(/viewBox=["']\s*[\d.-]+\s+[\d.-]+\s+([\d.-]+)\s+([\d.-]+)/i)
    const w = Number(viewBox?.[1]) || 720
    const h = Number(viewBox?.[2]) || 480
    setDiagramSize({ w, h }); setPan({ x: 0, y: 0 })
    setZoom(Math.max(.2, Math.min(8, viewport.clientWidth * .9 / w, viewport.clientHeight * .9 / h)))
  }, [zoomOpen, current.svg])

  const copySource = async () => {
    try { await navigator.clipboard.writeText(chart); setSourceCopied(true); window.setTimeout(() => setSourceCopied(false), 1600) } catch { setSourceCopied(false) }
  }
  const toggleSource = () => { setSourceOpen((value) => !value); setSourceCopied(false) }
  const openFullscreen = () => { setZoomOpen(true); setPan({ x: 0, y: 0 }); setDiagramSize(null) }
  const zoomBy = (factor: number) => setZoom((value) => Math.min(8, Math.max(.2, value * factor)))
  const fitToViewport = () => {
    const viewport = viewportRef.current
    if (!viewport || !diagramSize) return
    setZoom(Math.max(.2, Math.min(8, viewport.clientWidth * .9 / diagramSize.w, viewport.clientHeight * .9 / diagramSize.h)))
  }
  const downloadSvg = () => {
    if (!current.svg) return
    void saveBlob(new Blob([current.svg], { type: 'image/svg+xml' }), `mermaid-${id}.svg`)
  }
  const pointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    const state = gesture.current
    state.points[event.pointerId] = { x: event.clientX, y: event.clientY }
    const points = Object.values(state.points)
    if (points.length === 1) state.panStart = { x: event.clientX, y: event.clientY, originX: pan.x, originY: pan.y }
    if (points.length === 2) state.pinchStart = { distance: Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y), zoom }
  }
  const pointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const state = gesture.current
    if (!state.points[event.pointerId]) return
    state.points[event.pointerId] = { x: event.clientX, y: event.clientY }
    const points = Object.values(state.points)
    if (points.length === 2 && state.pinchStart) {
      const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y)
      setZoom(Math.min(8, Math.max(.2, state.pinchStart.zoom * distance / Math.max(1, state.pinchStart.distance))))
    } else if (points.length === 1 && state.panStart) setPan({ x: state.panStart.originX + event.clientX - state.panStart.x, y: state.panStart.originY + event.clientY - state.panStart.y })
  }
  const pointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => { delete gesture.current.points[event.pointerId]; gesture.current.panStart = undefined; gesture.current.pinchStart = undefined }
  const zoomWithWheel = (event: ReactWheelEvent<HTMLDivElement>) => { event.preventDefault(); setZoom((value) => Math.min(8, Math.max(.2, value * (event.deltaY < 0 ? 1.1 : .9)))) }
  return <figure className="agent-mermaid"><figcaption><span>{t('Mermaid 图表')}</span><span><button type="button" className="agent-icon-button" onClick={() => void copySource()} title={sourceCopied ? t('已复制') : t('复制源代码')} aria-label={t('复制源代码')}><AgentGlyph name="copy" /></button><button type="button" className="agent-icon-button" onClick={toggleSource} title={sourceOpen ? t('查看图表') : t('查看源代码')} aria-label={sourceOpen ? t('查看图表') : t('查看源代码')}><AgentGlyph name={sourceOpen ? 'diagram' : 'code'} /></button><button type="button" className="agent-icon-button" onClick={openFullscreen} disabled={!current.svg} title={t('全屏查看')} aria-label={t('全屏查看')}><AgentGlyph name="fullscreen" /></button></span></figcaption>{sourceOpen ? <pre className="agent-mermaid-source"><code>{chart}</code></pre> : current.svg ? <div dangerouslySetInnerHTML={{ __html: current.svg }} /> : current.error ? <small>{t(current.error)}</small> : <small>{t('正在渲染图表…')}</small>}{zoomOpen && <div className="agent-mermaid-modal" role="dialog" aria-modal="true" aria-label={t('全屏查看 Mermaid 图表')}><div className="agent-mermaid-viewport" ref={viewportRef} onWheel={zoomWithWheel} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerEnd} onPointerCancel={pointerEnd}>{diagramSize && <div className="agent-mermaid-zoom-layer" style={{ '--diagram-w': `${diagramSize.w * zoom}px`, '--diagram-h': `${diagramSize.h * zoom}px`, transform: `translate(${pan.x}px, ${pan.y}px)` } as CSSProperties} dangerouslySetInnerHTML={{ __html: current.svg }} />}</div><div className="agent-mermaid-tools"><button type="button" onClick={() => zoomBy(1 / 1.2)} aria-label={t('缩小')} title={t('缩小')}><AgentGlyph name="minus" /></button><b title={t('适应窗口')} onClick={fitToViewport}>{Math.round(zoom * 100)}%</b><button type="button" onClick={() => zoomBy(1.2)} aria-label={t('放大')} title={t('放大')}><AgentGlyph name="plus" /></button><i aria-hidden="true" /><button type="button" onClick={downloadSvg} aria-label={t('下载 SVG')} title={t('下载 SVG')}><AgentGlyph name="download" /></button></div><button type="button" className="agent-mermaid-close" onClick={() => setZoomOpen(false)} aria-label={t('关闭全屏查看')}><AgentGlyph name="close" /></button></div>}</figure>
}

function AgentPre({ children, ...props }: ComponentPropsWithoutRef<'pre'>) {
  const { t } = useI18n()
  const child = Children.toArray(children)[0]
  const code = isValidElement<{ className?: string; children?: ReactNode }>(child) ? child : null
  const language = code?.props.className?.match(/language-([\w-]+)/)?.[1] || 'text'
  const raw = String(code?.props.children || '').replace(/\n$/, '')
  const [copied, setCopied] = useState(false)

  if (language === 'mermaid') return <MermaidDiagram chart={raw} />
  const copy = async () => {
    try { await navigator.clipboard.writeText(raw); setCopied(true); window.setTimeout(() => setCopied(false), 1600) } catch { setCopied(false) }
  }
  return <section className="agent-code-block"><header><span>{language}</span><button type="button" className="agent-icon-button" onClick={() => void copy()} title={copied ? t('已复制') : t('复制代码')} aria-label={copied ? t('已复制') : t('复制代码')}><AgentGlyph name="copy" /></button></header><pre {...props}>{children}</pre></section>
}

function StreamingAgentPre({ children, ...props }: ComponentPropsWithoutRef<'pre'>) {
  const { t } = useI18n()
  const child = Children.toArray(children)[0]
  const code = isValidElement<{ className?: string }>(child) ? child : null
  const language = code?.props.className?.match(/language-([\w-]+)/)?.[1] || 'text'
  if (language !== 'mermaid') return <AgentPre {...props}>{children}</AgentPre>
  return <section className="agent-code-block agent-mermaid-pending"><header><span>mermaid</span><small>{t('回答完成后渲染图表')}</small></header><pre {...props}>{children}</pre></section>
}

function AgentMarkdown({ children, streaming = false }: { children: string; streaming?: boolean }) {
  const content = <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ pre: streaming ? StreamingAgentPre : AgentPre }}>{children}</ReactMarkdown>
  return <div className={`agent-markdown${streaming ? ' agent-streaming-markdown' : ''}`}>{content}{streaming && <b aria-hidden="true" />}</div>
}

function useDialogFocus(open: boolean, ref: RefObject<HTMLElement | null>, onClose: () => void) {
  const closeRef = useRef(onClose)
  useEffect(() => { closeRef.current = onClose }, [onClose])
  useEffect(() => {
    if (!open) return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const dialog = ref.current
    const focusable = () => Array.from(dialog?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])') || [])
    window.requestAnimationFrame(() => (dialog?.querySelector<HTMLElement>('[data-autofocus]') || focusable()[0] || dialog)?.focus())
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); closeRef.current(); return }
      if (event.key !== 'Tab') return
      const items = focusable()
      if (!items.length) { event.preventDefault(); dialog?.focus(); return }
      const first = items[0], last = items.at(-1)!
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', keydown)
    return () => { document.removeEventListener('keydown', keydown); previous?.focus() }
  }, [open, ref])
}

function conversationPendingCount(item: AgentConversation) {
  return flattenMessages(item.messages).reduce((count, { message }) => {
    const applied = new Set(message.appliedFiles?.map((file) => file.path))
    const proposals = (message.proposals || []).filter((proposal) => proposal.status === 'failed' || proposal.status === 'pending' || proposal.status === 'applying' || (!proposal.status && !applied.has(proposal.path))).length
    return count + proposals + (message.commitRequested && !message.commitDone ? 1 : 0)
  }, 0)
}

interface AgentHistoryDrawerProps {
  conversations: AgentConversation[]
  activeId: string
  currentWorkspaceKey: string
  onClose: () => void
  onNew: () => void
  onSelect: (item: AgentConversation) => void
  workspaceWarning: { item: AgentConversation; message: string } | null
  onConfirmWorkspaceWarning: () => void
  onCancelWorkspaceWarning: () => void
  onRename: (id: string, title: string) => void
  onDelete: (id: string) => void
  onExport: (item: AgentConversation) => void
  onImportAll: (file: File) => void
  onExportAll: () => void
}

function AgentHistoryDrawer({ conversations, activeId, currentWorkspaceKey, onClose, onNew, onSelect, workspaceWarning, onConfirmWorkspaceWarning, onCancelWorkspaceWarning, onRename, onDelete, onExport, onImportAll, onExportAll }: AgentHistoryDrawerProps) {
  const { locale, t } = useI18n()
  const drawerRef = useRef<HTMLElement | null>(null)
  const importRef = useRef<HTMLInputElement | null>(null)
  const [query, setQuery] = useState('')
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  useDialogFocus(true, drawerRef, onClose)
  const visible = conversations.filter((item) => item.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  const finishRename = () => {
    const title = renameValue.trim()
    if (renamingId && title) onRename(renamingId, title)
    setRenamingId(null)
  }
  return <><button type="button" className="agent-drawer-backdrop" onClick={onClose} aria-label={t('关闭对话历史')} tabIndex={-1} /><section className="agent-drawer agent-history-drawer" ref={drawerRef} role="dialog" aria-modal="true" aria-labelledby="agent-history-title" tabIndex={-1}>
    <header><div><strong id="agent-history-title">{t('对话历史')}</strong><small>{t('搜索、管理和恢复 Agent 任务')}</small></div><button type="button" className="agent-drawer-close" onClick={onClose} aria-label={t('关闭对话历史')}><AgentGlyph name="close" /></button></header>
    <div className="agent-history-body">
      <div className="agent-transfer-bar"><div><button type="button" onClick={() => importRef.current?.click()}><AgentGlyph name="upload" />{t('导入历史')}</button><button type="button" onClick={onExportAll} disabled={!conversations.length}><AgentGlyph name="download" />{t('导出全部')}</button></div><small>{t('使用 JSON 备份，可跨浏览器恢复')}</small><input ref={importRef} className="visually-hidden" type="file" accept=".json,application/json" aria-label={t('选择对话历史 JSON 文件')} onChange={(event) => { const file = event.target.files?.[0]; if (file) onImportAll(file); event.target.value = '' }} /></div>
      <div className="agent-history-search"><AgentGlyph name="search" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('搜索对话标题')} aria-label={t('搜索对话标题')} data-autofocus /></div>
      <button type="button" className="agent-history-new" onClick={onNew}><AgentGlyph name="plus" />{t('新建对话')}</button>
      <div className="agent-history-list">{visible.length ? visible.map((item) => {
        const pending = conversationPendingCount(item)
        const itemWorkspaceKey = normalizeStoredWorkspaceKey(item.workspace?.key || item.workspaceKey)
        const workspaceLabel = item.workspace?.label || (itemWorkspaceKey === currentWorkspaceKey ? t('当前工作区') : t('其他工作区'))
        return <article className={item.id === activeId ? 'active' : ''} key={item.id}>
          {renamingId === item.id ? <div className="agent-history-rename"><input autoFocus value={renameValue} onChange={(event) => setRenameValue(event.target.value)} onBlur={finishRename} onKeyDown={(event) => { if (event.key === 'Enter') finishRename(); if (event.key === 'Escape') setRenamingId(null) }} aria-label={t('新对话标题')} /><button type="button" onMouseDown={(event) => event.preventDefault()} onClick={finishRename}><AgentGlyph name="check" /></button></div> : <button type="button" className="agent-history-main" onClick={() => onSelect(item)}><strong>{item.title}</strong><span><i className={`agent-mode-badge ${item.mode === 'edit' ? 'edit' : 'chat'}`}>{item.mode === 'edit' ? t('编辑') : t('对话')}</i>{pending > 0 && <b>{pending} {t('项待处理')}</b>}<small>{new Date(item.updatedAt).toLocaleString(locale === 'en-US' ? 'en-US' : 'zh-CN')}</small></span><em className="agent-history-workspace" title={item.workspace?.locator || workspaceLabel}>{workspaceLabel}{itemWorkspaceKey === currentWorkspaceKey ? ` · ${t('当前')}` : ''}</em></button>}
          <div className="agent-history-actions"><button type="button" onClick={() => { setRenamingId(item.id); setRenameValue(item.title) }} title={t('重命名')} aria-label={`${t('重命名')} ${item.title}`}><AgentGlyph name="edit" /></button><button type="button" onClick={() => onExport(item)} title={t('导出 Markdown')} aria-label={`${t('导出')} ${item.title}`}><AgentGlyph name="download" /></button><button type="button" className="danger" onClick={() => onDelete(item.id)} title={t('删除')} aria-label={`${t('删除')} ${item.title}`}><AgentGlyph name="trash" /></button></div>
        </article>
      }) : <div className="agent-history-empty">{t('没有匹配的对话')}</div>}</div>
    </div>
    {workspaceWarning && <div className="agent-history-workspace-warning" role="alertdialog" aria-live="assertive"><strong>{t('找不到该对话工作区')}</strong><p>{workspaceWarning.message}</p><footer><button type="button" onClick={onCancelWorkspaceWarning}>{t('取消')}</button><button type="button" className="primary" onClick={onConfirmWorkspaceWarning}>{t('仍然继续')}</button></footer></div>}
  </section></>
}

interface ConversationMessageProps {
  message: AgentMessage
  path: number[]
  editing: boolean
  editText: string
  files: AgentSourceFile[]
  busy: string | null
  repositoryBranch?: string
  changedFileCount: number
  textStyle: CSSProperties
  onEdit: (path: number[]) => void
  onEditText: (value: string) => void
  onCancelEdit: () => void
  onSubmitEdit: (path: number[]) => void
  onRegenerate: (path: number[]) => void
  onSelectVersion: (path: number[], version: number) => void
  onSelectQuestionVersion: (path: number[], delta: number) => void
  onAcceptProposal: (path: number[], proposalId: string) => void
  onRejectProposal: (path: number[], proposalId: string) => void
  onOpenFile: (path: string) => void
  onCommitFromMessage: (path: number[]) => void
  onCancelCommitFromMessage: (path: number[]) => void
}

function AgentCommitDialog({ branch, count, busy, onClose, onConfirm }: { branch?: string; count: number; busy: boolean; onClose: () => void; onConfirm: () => void }) {
  const { t } = useI18n()
  const dialogRef = useRef<HTMLElement | null>(null)
  const titleId = `agent-commit-${useId().replace(/:/g, '')}`
  useDialogFocus(true, dialogRef, onClose)
  return createPortal(<><button type="button" className="agent-drawer-backdrop portal" onClick={onClose} aria-label={t('取消提交')} tabIndex={-1} /><section className="agent-confirm-dialog" ref={dialogRef} role="alertdialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
    <header><span><AgentGlyph name="git" /></span><div><strong id={titleId}>{t('提交并推送修改')}</strong><small>{t('确认后会创建一次 Git commit 并推送到远程分支')}</small></div></header>
    <div className="agent-confirm-summary"><div><span>{t('目标分支')}</span><strong>{branch || t('当前分支')}</strong></div><div><span>{t('本地修改')}</span><strong>{count} {t('个文件')}</strong></div></div>
    <ul><li>{t('只提交已接受并成功写入本地缓存的修改')}</li><li>{t('如果远程分支已有新提交，操作会安全停止')}</li></ul>
    <footer><button type="button" onClick={onClose} data-autofocus>{t('返回检查')}</button><button type="button" className="primary" disabled={busy || count === 0} onClick={onConfirm}><AgentGlyph name="git" />{busy ? t('提交中…') : t('确认提交并推送')}</button></footer>
  </section></>, document.body)
}

function ConversationMessage({ message, path, editing, editText, files, busy, repositoryBranch, changedFileCount, textStyle, onEdit, onEditText, onCancelEdit, onSubmitEdit, onRegenerate, onSelectVersion, onSelectQuestionVersion, onAcceptProposal, onRejectProposal, onOpenFile, onCommitFromMessage, onCancelCommitFromMessage }: ConversationMessageProps) {
  const { t } = useI18n()
  const [copied, setCopied] = useState(false)
  const [commitDialogOpen, setCommitDialogOpen] = useState(false)
  const version = message.answerVersions?.[message.activeAnswerVersion || 0]
  const content = message.role === 'user' ? activeContent(message) : version?.content || message.content
  const localizedContent = content === AGENT_WELCOME_MESSAGE ? t(AGENT_WELCOME_MESSAGE) : content
  const reasoningSummary = version?.reasoningSummary || message.reasoningSummary
  const reasoningDurationSeconds = version?.reasoningDurationSeconds ?? message.reasoningDurationSeconds
  const copy = async () => { try { await navigator.clipboard.writeText(content); setCopied(true); window.setTimeout(() => setCopied(false), 1600) } catch { setCopied(false) } }
  const recordedProposalPaths = new Set(message.proposals?.map((proposal) => proposal.path))
  return <><div className={`agent-message ${message.role}`}><i><AgentGlyph name={message.role === 'assistant' ? 'bot' : 'send'} /></i><div>
    {message.role === 'assistant' && reasoningDurationSeconds !== undefined && <details className="agent-reasoning"><summary><AgentGlyph name="brain" />{t('已思考（用时')} {reasoningDurationSeconds}s）</summary>{reasoningSummary && <span>{reasoningSummary}</span>}</details>}
    {message.role === 'assistant' && Boolean(message.operations?.length) && <details className="agent-reasoning"><summary><AgentGlyph name="code" />{t('已完成')} {message.operations!.length} {t('项仓库操作')}</summary><span>{message.operations!.map((operation) => `${operation.status === 'failed' ? '×' : '✓'} ${operation.summary}`).join('\n')}</span></details>}
    {message.role === 'user' && editing ? <div className="agent-question-editor" role="group" aria-label={t('修改提问')}>
      <textarea autoFocus value={editText} onChange={(event) => onEditText(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); onCancelEdit() } else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && editText.trim()) { event.preventDefault(); onSubmitEdit(path) } }} aria-label={t('修改提问内容')} />
      <div className="agent-question-actions"><button type="button" className="agent-question-cancel" onClick={onCancelEdit}>{t('取消')}</button><button type="button" className="agent-question-submit" onClick={() => onSubmitEdit(path)} disabled={!editText.trim()}><AgentGlyph name="send" />{t('重新发送')}</button></div>
    </div> : <AgentMarkdown>{localizedContent}</AgentMarkdown>}
    {message.role === 'assistant' && (message.proposals?.length || message.appliedFiles?.length || message.commitRequested || message.commitDone || message.commitError) && <div className="agent-bubble-reviews">
      {message.proposals?.map((proposal) => <ProposalDiff key={proposal.id} proposal={proposal.status ? proposal : { ...proposal, status: message.appliedFiles?.some((item) => item.path === proposal.path) ? 'applied' : 'pending' }} file={files.find((item) => item.path === proposal.path)} textStyle={textStyle} onAccept={() => onAcceptProposal(path, proposal.id)} onReject={() => onRejectProposal(path, proposal.id)} onOpen={() => onOpenFile(proposal.path)} />)}
      {message.appliedFiles?.filter((item) => !recordedProposalPaths.has(item.path)).map((item) => <p className="agent-applied" key={item.path}><AgentGlyph name="edit" />{item.action === 'create' ? t('新建') : t('修改')} {item.path}</p>)}
      {message.commitRequested && !message.commitDone && <article className="agent-proposal agent-git-proposal"><header><div><strong><AgentGlyph name="git" />{t('提交 Git 仓库')}</strong><small>{repositoryBranch || t('当前分支')} · {changedFileCount} {t('个本地修改待提交')}</small></div></header>{message.commitError && <p className="agent-proposal-error">{message.commitError}</p>}<footer><button type="button" className="agent-apply-button" disabled={busy !== null || changedFileCount === 0} onClick={() => setCommitDialogOpen(true)}><AgentGlyph name="check" />{t('检查并提交')}</button><button type="button" disabled={busy !== null} onClick={() => onCancelCommitFromMessage(path)}>{t('稍后处理')}</button></footer></article>}
      {message.commitDone && <p className="agent-applied"><AgentGlyph name="git" />{t('已提交')} {message.commitSha ? <code>{message.commitSha.slice(0, 7)}</code> : t('Git 修改')}{message.commitMessage ? ` · ${message.commitMessage}` : ''}</p>}
    </div>}
    <footer className="agent-message-actions">{message.role === 'user' ? <><button type="button" className="agent-icon-button" onClick={() => onEdit(path)} title={t('修改提问')} aria-label={t('修改提问')}><AgentGlyph name="edit" /></button>{(message.questionVersions?.length || 0) > 1 && <span className="agent-answer-switch"><button type="button" onClick={() => onSelectQuestionVersion(path, -1)} disabled={(message.activeQuestionVersion || 0) === 0} aria-label={t('上一版问题')}><AgentGlyph name="arrow-left" /></button><small>{(message.activeQuestionVersion || 0) + 1}/{message.questionVersions!.length}</small><button type="button" onClick={() => onSelectQuestionVersion(path, 1)} disabled={(message.activeQuestionVersion || 0) === message.questionVersions!.length - 1} aria-label={t('下一版问题')}><AgentGlyph name="arrow-right" /></button></span>}</> : <><button type="button" className="agent-icon-button" onClick={() => void copy()} title={copied ? t('已复制') : t('复制回答')} aria-label={copied ? t('已复制') : t('复制回答')}><AgentGlyph name="copy" /></button><button type="button" className="agent-icon-button" onClick={() => onRegenerate(path)} title={t('重新生成')} aria-label={t('重新生成')}><AgentGlyph name="refresh" /></button>{(message.answerVersions?.length || 0) > 1 && <span className="agent-answer-switch"><button type="button" onClick={() => onSelectVersion(path, Math.max(0, (message.activeAnswerVersion || 0) - 1))} disabled={(message.activeAnswerVersion || 0) === 0} aria-label={t('上一版回答')}><AgentGlyph name="arrow-left" /></button><small>{(message.activeAnswerVersion || 0) + 1}/{message.answerVersions!.length}</small><button type="button" onClick={() => onSelectVersion(path, Math.min(message.answerVersions!.length - 1, (message.activeAnswerVersion || 0) + 1))} disabled={(message.activeAnswerVersion || 0) === message.answerVersions!.length - 1} aria-label={t('下一版回答')}><AgentGlyph name="arrow-right" /></button></span>}</>}</footer>
  </div></div>{commitDialogOpen && <AgentCommitDialog branch={repositoryBranch} count={changedFileCount} busy={busy !== null} onClose={() => setCommitDialogOpen(false)} onConfirm={() => { setCommitDialogOpen(false); onCommitFromMessage(path) }} />}</>
}

interface AgentPanelProps {
  workspaceKey: string
  workspaceLabel: string
  workspaceKind: 'remote' | 'local' | 'file'
  workspaceLocator?: string
  onSelectWorkspace?: (workspace: AgentWorkspaceRef) => Promise<AgentWorkspaceSelectionResult>
  repositoryScopeEnabled?: boolean
  canCreateFiles?: boolean
  canCommit?: boolean
  files: AgentSourceFile[]
  activePath: string | null
  onApplyChange: (path: string, content: string) => Promise<AgentMutationResult>
  onCreateFile: (path: string, content: string) => Promise<AgentMutationResult>
  onOpenFile: (path: string) => void
  onCommit: () => Promise<AgentCommitResult>
  getGitContext: (paths: string[]) => Promise<string>
  remoteFileCount: number
  remotePaths: string[]
  repositoryBranch?: string
  onLoadAllFiles: () => Promise<void>
  loadingFiles: boolean
  fontSize: number
  fontFamily: string
  fontWeight: number
}

function AgentGlyph({ name }: { name: 'bot' | 'send' | 'stop' | 'settings' | 'refresh' | 'check' | 'close' | 'history' | 'download' | 'upload' | 'plus' | 'minus' | 'git' | 'shield' | 'alert' | 'brain' | 'chevron' | 'folder' | 'file' | 'copy' | 'code' | 'diagram' | 'fullscreen' | 'edit' | 'search' | 'trash' | 'arrow-left' | 'arrow-right' }) {
  const paths = {
    bot: <><rect x="4" y="7" width="16" height="12" rx="3"/><path d="M12 3v4M9 12h.01M15 12h.01M8 16c2 1.3 6 1.3 8 0"/></>,
    send: <><path d="m21 3-7.5 18-3.8-7.7L2 9.5 21 3Z"/><path d="m9.7 13.3 4.1-4.1"/></>,
    stop: <rect x="6.5" y="6.5" width="11" height="11" rx="2"/>,
    settings: <><path d="M4 7h10m4 0h2M4 12h3m4 0h9M4 17h8m4 0h4"/><circle cx="16" cy="7" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="14" cy="17" r="2"/></>,
    refresh: <><path d="M20 7v5h-5"/><path d="M18.2 16.5A8 8 0 1 1 19.8 9L20 12"/></>,
    check: <path d="m5 12 4 4L19 6"/>, close: <path d="m6 6 12 12M18 6 6 18"/>,
    history: <><path d="M3.5 12a8.5 8.5 0 1 0 2.5-6"/><path d="M3.5 4v4h4"/><path d="M12 7v5l3.5 2"/></>,
    download: <><path d="M12 3v12m0 0 4-4m-4 4-4-4"/><path d="M5 19h14"/></>, upload: <><path d="M12 16V4m0 0 4 4m-4-4-4 4"/><path d="M5 20h14"/></>, plus: <path d="M12 5v14M5 12h14"/>, minus: <path d="M5 12h14"/>,
    git: <><circle cx="6" cy="5" r="2"/><circle cx="18" cy="6" r="2"/><circle cx="8" cy="19" r="2"/><path d="M6 7v5a3 3 0 0 0 3 3h5a4 4 0 0 0 4-4V8M8 17v-2"/></>,
    shield: <><path d="M12 3 20 6v5c0 5-3.5 8.4-8 10-4.5-1.6-8-5-8-10V6l8-3Z"/><path d="m9 12 2 2 4-4"/></>,
    alert: <><path d="M10.3 3.7 2.5 17.2A2 2 0 0 0 4.2 20h15.6a2 2 0 0 0 1.7-2.8L13.7 3.7a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4m0 3h.01"/></>,
    brain: <><path d="M9.2 4.2A3.2 3.2 0 0 0 4 6.7a3.1 3.1 0 0 0-1 5.7A3.4 3.4 0 0 0 6.2 18c.8 0 1.5-.3 2-.8M14.8 4.2A3.2 3.2 0 0 1 20 6.7a3.1 3.1 0 0 1 1 5.7A3.4 3.4 0 0 1 17.8 18c-.8 0-1.5-.3-2-.8M12 4v16M8 8.5c1 0 1.8.6 2 1.5M16 8.5c-1 0-1.8.6-2 1.5"/></>,
    chevron: <path d="m7 10 5 5 5-5"/>,
    folder: <><path d="M3 7.5V6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3Z"/><path d="M3 9h18"/></>,
    file: <><path d="M6 3h8l4 4v14H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"/><path d="M14 3v5h5M8 13h8M8 17h6"/></>,
    copy: <><rect x="8" y="8" width="11" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h2"/></>,
    code: <><path d="m8 8-4 4 4 4M16 8l4 4-4 4M14 5l-4 14"/></>,
    diagram: <><rect x="3" y="4" width="18" height="16" rx="2"/><path d="m7 15 3-3 3 2 4-5M7 8h.01"/></>,
    fullscreen: <><path d="M8 3H3v5M16 3h5v5M21 16v5h-5M3 16v5h5"/></>,
    edit: <><path d="m4 20 4.2-1 10-10a2.2 2.2 0 0 0-3.1-3.1l-10 10L4 20Z"/><path d="m13.5 6.5 4 4"/></>,
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
    trash: <><path d="M4 7h16M9 3h6l1 4H8l1-4ZM7 7l1 14h8l1-14M10 11v6M14 11v6"/></>,
    'arrow-left': <path d="m14 6-6 6 6 6"/>, 'arrow-right': <path d="m10 6 6 6-6 6"/>,
  }
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>
}

function fileDiff(before: string, after: string) {
  const oldLines = before ? before.split('\n') : []
  const newLines = after ? after.split('\n') : []
  let start = 0
  while (start < oldLines.length && start < newLines.length && oldLines[start] === newLines[start]) start += 1
  let oldEnd = oldLines.length - 1
  let newEnd = newLines.length - 1
  while (oldEnd >= start && newEnd >= start && oldLines[oldEnd] === newLines[newEnd]) { oldEnd -= 1; newEnd -= 1 }
  return { start, removed: oldLines.slice(start, oldEnd + 1), added: newLines.slice(start, newEnd + 1) }
}

function ProposalDiff({ proposal, file, textStyle, onAccept, onReject, onOpen }: { proposal: AgentProposal; file?: AgentSourceFile; textStyle: CSSProperties; onAccept: () => void; onReject: () => void; onOpen: () => void }) {
  const { t } = useI18n()
  const status = proposal.status || 'pending'
  const [expanded, setExpanded] = useState(false)
  const drawerRef = useRef<HTMLElement | null>(null)
  const titleId = `agent-diff-${useId().replace(/:/g, '')}`
  useDialogFocus(expanded, drawerRef, () => setExpanded(false))
  const diff = useMemo(() => buildAgentDiff(proposal.beforeContent ?? file?.content ?? '', proposal.content), [file?.content, proposal.beforeContent, proposal.content])
  const labels = { pending: t('待审核'), applying: t('正在应用'), applied: t('已应用到本地'), rejected: t('已拒绝'), failed: t('应用失败') }
  const diffRows = <>{diff.rows.map((row, index) => row.type === 'gap'
    ? <span className="agent-diff-gap" key={`gap:${index}`}>{t('折叠')} {row.count} {t('行未修改内容')}</span>
    : <code className={row.type} key={`${row.type}:${row.oldLine || 0}:${row.newLine || 0}:${index}`}><span>{row.oldLine || ''}</span><span>{row.newLine || ''}</span><b>{row.type === 'added' ? '+' : row.type === 'removed' ? '−' : ' '}</b><em>{row.content || ' '}</em></code>)}
    {!diff.added && !diff.removed && <span className="agent-diff-context">{t('内容没有变化')}</span>}</>
  return <article className={`agent-proposal ${status}`}>
    <header><div><strong>{proposal.path}</strong><small>{proposal.action === 'create' ? t('新建笔记') : t('修改笔记')} · {proposal.reason}</small></div><span className={`agent-proposal-status ${status}`}>{labels[status]}</span></header>
    <button type="button" className="agent-diff-toggle" onClick={() => setExpanded(true)} aria-haspopup="dialog" aria-expanded={expanded}><span>Diff <b>+{diff.added}</b> <i>−{diff.removed}</i></span><span>{t('打开完整对比')}</span></button>
    {proposal.error && <p className="agent-proposal-error" role="alert">{proposal.error}</p>}
    <footer>
      {(status === 'pending' || status === 'failed') && <><button type="button" className="agent-apply-button" onClick={onAccept}><AgentGlyph name="check" />{status === 'failed' ? t('重试应用') : t('接受修改')}</button><button type="button" onClick={onReject}>{t('拒绝')}</button></>}
      {status === 'applying' && <span className="agent-applied-inline"><span className="agent-operation-spinner" />{t('正在写入并校验…')}</span>}
      {status === 'applied' && <><span className="agent-applied-inline"><AgentGlyph name="check" />{t('已应用到本地')}</span><button type="button" onClick={onOpen}>{t('打开文件')}</button></>}
      {status === 'rejected' && <span className="agent-proposal-muted">{t('已保留修改记录，可展开重新查看')}</span>}
    </footer>
    {expanded && typeof document !== 'undefined' && createPortal(<><button type="button" className="agent-drawer-backdrop portal agent-diff-backdrop" onClick={() => setExpanded(false)} aria-label={t('关闭 Diff')} tabIndex={-1} /><section className="agent-drawer agent-diff-drawer" ref={drawerRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} style={textStyle}>
      <header><div><strong id={titleId}>{proposal.path}</strong><small>{proposal.action === 'create' ? t('新建笔记') : t('修改笔记')} · {proposal.reason}</small></div><button type="button" className="agent-drawer-close" onClick={() => setExpanded(false)} data-autofocus aria-label={t('关闭 Diff')}><AgentGlyph name="close" /></button></header>
      <div className="agent-diff-summary"><span className={`agent-proposal-status ${status}`}>{labels[status]}</span><span><b>+{diff.added}</b><i>−{diff.removed}</i></span></div>
      <div className="agent-diff" aria-label={`${proposal.path}${t('的修改预览')}`}>{diffRows}</div>
      {proposal.error && <p className="agent-proposal-error" role="alert">{proposal.error}</p>}
      <footer>{(status === 'pending' || status === 'failed') && <><button type="button" className="agent-apply-button" onClick={onAccept}><AgentGlyph name="check" />{status === 'failed' ? t('重试应用') : t('接受修改')}</button><button type="button" onClick={onReject}>{t('拒绝')}</button></>}{status === 'applying' && <span className="agent-applied-inline"><span className="agent-operation-spinner" />{t('正在写入并校验…')}</span>}{status === 'applied' && <button type="button" className="agent-apply-button" onClick={() => { setExpanded(false); onOpen() }}><AgentGlyph name="file" />{t('打开文件')}</button>}{status === 'rejected' && <span className="agent-proposal-muted">{t('该修改已拒绝，记录仍保留在对话中。')}</span>}</footer>
    </section></>, document.body)}
  </article>
}

export default function AgentPanel({ workspaceKey, workspaceLabel, workspaceKind, workspaceLocator, onSelectWorkspace, repositoryScopeEnabled = true, canCreateFiles = true, canCommit = true, files, activePath, onApplyChange, onCreateFile, onOpenFile, onCommit, getGitContext, remoteFileCount, remotePaths, repositoryBranch, onLoadAllFiles, loadingFiles, fontSize, fontFamily, fontWeight }: AgentPanelProps) {
  const { locale, t } = useI18n()
  const workspace = useMemo<AgentWorkspaceRef>(() => ({ key: workspaceKey, kind: workspaceKind, label: workspaceLabel, locator: workspaceLocator }), [workspaceKey, workspaceKind, workspaceLabel, workspaceLocator])
  const [mode, setMode] = useState<AgentMode>('chat')
  const [config, setConfig] = useState<AgentProviderConfig>(defaultAgentProviderConfig)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [models, setModels] = useState<string[]>([])
  const [connectionStatus, setConnectionStatus] = useState<'unconfigured' | 'configured' | 'checking' | 'connected' | 'failed'>('unconfigured')
  const [conversation, setConversation] = useState<AgentConversation>(() => createConversation(workspace))
  const [conversations, setConversations] = useState<AgentConversation[]>([])
  const [historyOpen, setHistoryOpen] = useState(false)
  const [workspaceWarning, setWorkspaceWarning] = useState<{ item: AgentConversation; message: string } | null>(null)
  const [input, setInput] = useState('')
  const [permissionOpen, setPermissionOpen] = useState(false)
  const [reasoningOpen, setReasoningOpen] = useState(false)
  const [scopeOpen, setScopeOpen] = useState(false)
  const [scope, setScope] = useState<'current' | 'cached'>('cached')
  const [busy, setBusy] = useState<'send' | 'models' | 'test' | 'save' | 'commit' | null>(null)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [streamingReply, setStreamingReply] = useState('')
  const [streamingReasoning, setStreamingReasoning] = useState('')
  const [liveOperations, setLiveOperations] = useState<NonNullable<AgentMessage['operations']>>([])
  const [editingQuestion, setEditingQuestion] = useState<number | null>(null)
  const [editedQuestion, setEditedQuestion] = useState('')
  const [lastRequest, setLastRequest] = useState<{ text: string; userIndex?: number } | null>(null)
  const [thinkingStartedAt, setThinkingStartedAt] = useState<number | null>(null)
  const [thinkingSeconds, setThinkingSeconds] = useState(0)
  const [answerStarted, setAnswerStarted] = useState(false)
  const settingsRef = useRef<HTMLElement | null>(null)
  const configImportRef = useRef<HTMLInputElement | null>(null)
  const replyBufferRef = useRef('')
  const receivedStreamTextRef = useRef(false)
  const streamedContentRef = useRef('')
  const abortRef = useRef<AbortController | null>(null)
  const conversationRef = useRef<HTMLDivElement | null>(null)
  const conversationStateRef = useRef<AgentConversation | null>(null)
  const stickToBottomRef = useRef(true)
  const pendingConversationIdRef = useRef<string | null>(null)

  useDialogFocus(settingsOpen, settingsRef, () => setSettingsOpen(false))

  useEffect(() => {
    const composer = document.querySelector<HTMLTextAreaElement>('.agent-composer textarea')
    if (!composer) return
    composer.placeholder = mode === 'edit'
      ? (canCreateFiles ? t('描述要修改或新建的笔记。AI 会先给出可审核的方案。') : t('描述要如何修改当前文件。AI 会先给出可审核的方案。'))
      : t('询问笔记内容，Enter 发送…')
  }, [canCreateFiles, mode, t])

  useEffect(() => {
    conversationStateRef.current = conversation
  }, [conversation])

  useEffect(() => {
    let disposed = false
    void loadAgentProviderConfig().then((saved) => {
      if (disposed) return
      setConfig(saved)
      setModels(saved.availableModels || [])
      setConnectionStatus(saved.provider === 'ollama' || saved.apiKey ? 'configured' : 'unconfigured')
      setSettingsOpen(saved.provider !== 'ollama' && !saved.apiKey)
    }).catch(() => { if (!disposed) setError('无法读取本地 AI 配置') })
    return () => { disposed = true }
  }, [])

  useEffect(() => {
    if (!permissionOpen && !reasoningOpen && !scopeOpen) return
    const closeOptions = (event: PointerEvent) => {
      const target = event.target as HTMLElement
      const trigger = target.closest('.agent-option-trigger')
      if (trigger) {
        const label = trigger.textContent || ''
        if (label.includes('思考')) { setPermissionOpen(false); setScopeOpen(false) }
        else if (label.includes('确认') || label.includes('自动执行')) { setReasoningOpen(false); setScopeOpen(false) }
        else { setPermissionOpen(false); setReasoningOpen(false) }
        return
      }
      if (target.closest('.agent-option-wrap')) return
      setPermissionOpen(false); setReasoningOpen(false); setScopeOpen(false)
    }
    window.addEventListener('pointerdown', closeOptions)
    return () => window.removeEventListener('pointerdown', closeOptions)
  }, [permissionOpen, reasoningOpen, scopeOpen])

  useEffect(() => {
    if (busy !== 'send' || !thinkingStartedAt) return
    const timer = window.setInterval(() => setThinkingSeconds(Math.max(0, Math.floor((Date.now() - thinkingStartedAt) / 1000))), 250)
    return () => window.clearInterval(timer)
  }, [busy, thinkingStartedAt])

  useEffect(() => {
    if (busy !== 'send') return
    const timer = window.setInterval(() => {
      const container = conversationRef.current
      if (container && stickToBottomRef.current) container.scrollTop = container.scrollHeight
      const next = replyBufferRef.current.slice(0, 1)
      if (!next) return
      replyBufferRef.current = replyBufferRef.current.slice(1)
      setStreamingReply((current) => current + next)
    }, 14)
    return () => window.clearInterval(timer)
  }, [busy])

  useEffect(() => {
    let disposed = false
    void loadAgentConversations().then((saved) => {
      if (disposed || !saved.length) return
      setConversations(saved)
      const pendingId = pendingConversationIdRef.current
      const current = (pendingId ? saved.find((item) => item.id === pendingId) : undefined) || saved.find((item) => normalizeStoredWorkspaceKey(item.workspace?.key || item.workspaceKey) === workspaceKey) || createConversation(workspace)
      pendingConversationIdRef.current = null
      setConversation(current); setMode(current.mode ?? 'chat')
    }).catch(() => { if (!disposed) setError('无法读取本地对话历史') })
    return () => { disposed = true }
  }, [workspace, workspaceKey])

  const saveConversation = (next: AgentConversation) => {
    const normalized = next.workspaceKey === workspaceKey && !next.workspace ? { ...next, workspace } : next
    conversationStateRef.current = normalized
    setConversation(normalized)
    setConversations((current) => {
      const updated = [normalized, ...current.filter((item) => item.id !== normalized.id)].sort((a, b) => b.updatedAt - a.updatedAt)
      void saveAgentConversations(updated).catch(() => setError('对话历史保存失败'))
      return updated
    })
  }

  const startConversation = () => { const next = { ...createConversation(workspace), mode }; saveConversation(next); setHistoryOpen(false); setWorkspaceWarning(null) }

  const switchMode = (next: AgentMode) => {
    if (next === mode) return
    setMode(next)
    // 只有真实对话（不是初始欢迎语）才记忆模式；空对话由下次发送时记录。
    if (conversation.messages.length > 1) saveConversation({ ...conversation, mode: next, updatedAt: Date.now() })
  }

  const exportConversation = (item: AgentConversation) => {
    void saveBlob(new Blob([conversationMarkdown(item)], { type: 'text/markdown;charset=utf-8' }), `${item.title || 'AI 对话'}.md`)
  }

  const conversationSnapshot = () => [conversation, ...conversations.filter((item) => item.id !== conversation.id)].sort((a, b) => b.updatedAt - a.updatedAt)

  const exportConversationHistory = () => {
    const items = conversationSnapshot()
    downloadJson(`markmap-agent-history-${backupDate()}.json`, { kind: 'markmap-agent-history', version: 1, exportedAt: new Date().toISOString(), conversations: items })
    setNotice(`已导出 ${items.length} 条对话历史。`); setError('')
  }

  const importConversationHistory = async (file: File) => {
    try {
      const raw = JSON.parse(await file.text()) as unknown
      const source = isRecord(raw) ? raw.conversations : raw
      if (!Array.isArray(source)) throw new Error('文件中没有可识别的对话历史')
      const imported = source.map((value): AgentConversation | null => {
        if (!isRecord(value) || !Array.isArray(value.messages)) return null
        const messages = value.messages.filter((message) => isRecord(message) && (message.role === 'user' || message.role === 'assistant')) as AgentMessage[]
        if (!messages.length) return null
        const now = Date.now()
        const importedWorkspace = isRecord(value.workspace) && typeof value.workspace.key === 'string' && (value.workspace.kind === 'remote' || value.workspace.kind === 'local' || value.workspace.kind === 'file')
          ? { key: normalizeStoredWorkspaceKey(value.workspace.key) || value.workspace.key, kind: value.workspace.kind as AgentWorkspaceRef['kind'], label: typeof value.workspace.label === 'string' ? value.workspace.label : '其他工作区', locator: typeof value.workspace.locator === 'string' ? value.workspace.locator : undefined }
          : undefined
        const importedWorkspaceKey = normalizeStoredWorkspaceKey(importedWorkspace?.key || (typeof value.workspaceKey === 'string' ? value.workspaceKey : undefined)) || workspaceKey
        return { id: typeof value.id === 'string' && value.id ? value.id : crypto.randomUUID(), title: typeof value.title === 'string' && value.title.trim() ? value.title.trim() : '导入的对话', createdAt: typeof value.createdAt === 'number' ? value.createdAt : now, updatedAt: typeof value.updatedAt === 'number' ? value.updatedAt : now, mode: value.mode === 'edit' ? 'edit' : 'chat', workspaceKey: importedWorkspaceKey, workspace: importedWorkspace, messages }
      }).filter((item): item is AgentConversation => item !== null)
      if (!imported.length) throw new Error('没有找到有效对话')
      const merged = new Map(conversationSnapshot().map((item) => [item.id, item]))
      imported.forEach((item) => merged.set(item.id, item))
      const next = Array.from(merged.values()).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 80)
      await saveAgentConversations(next)
      const current = next.find((item) => item.id === conversation.id) || next.find((item) => normalizeStoredWorkspaceKey(item.workspace?.key || item.workspaceKey) === workspaceKey) || conversation
      setConversations(next); setConversation(current); setMode(current.mode ?? 'chat'); setHistoryOpen(true); setWorkspaceWarning(null)
      setNotice(`已导入 ${imported.length} 条对话，并与现有历史合并。`); setError('')
    } catch (reason) { setError(reason instanceof Error ? `导入对话失败：${reason.message}` : '导入对话失败') }
  }

  const exportAgentConfig = () => {
    const complete = withActiveProfile(config)
    downloadJson(`markmap-agent-config-${backupDate()}.json`, { kind: 'markmap-agent-config', version: 1, exportedAt: new Date().toISOString(), config: complete })
    setNotice('AI 配置与 API 密钥已完整导出，请妥善保管备份文件。'); setError('')
  }

  const importAgentConfig = async (file: File) => {
    try {
      const raw = JSON.parse(await file.text()) as unknown
      const source = isRecord(raw) && isRecord(raw.config) ? raw.config : raw
      if (!isRecord(source)) throw new Error('文件中没有可识别的 AI 配置')
      const provider = typeof source.provider === 'string' && providerDefinitions.some((item) => item.id === source.provider) ? source.provider as AgentProviderId : config.provider
      const profiles: AgentProviderConfig['providerProfiles'] = { ...config.providerProfiles }
      if (isRecord(source.providerProfiles)) Object.entries(source.providerProfiles).forEach(([id, value]) => {
        if (!providerDefinitions.some((item) => item.id === id) || !isRecord(value)) return
        const key = id as AgentProviderId
        const current = profiles[key]
        profiles[key] = { apiKey: typeof value.apiKey === 'string' && value.apiKey ? value.apiKey : current?.apiKey || '', baseUrl: typeof value.baseUrl === 'string' ? value.baseUrl : current?.baseUrl || '', model: typeof value.model === 'string' ? value.model : current?.model || '', availableModels: Array.isArray(value.availableModels) ? value.availableModels.filter((item): item is string => typeof item === 'string') : current?.availableModels || [] }
      })
      const next: AgentProviderConfig = { ...config, provider, apiKey: typeof source.apiKey === 'string' && source.apiKey ? source.apiKey : config.apiKey, baseUrl: typeof source.baseUrl === 'string' ? source.baseUrl : config.baseUrl, model: typeof source.model === 'string' ? source.model : config.model, availableModels: Array.isArray(source.availableModels) ? source.availableModels.filter((item): item is string => typeof item === 'string') : config.availableModels, providerProfiles: profiles, maxTokens: typeof source.maxTokens === 'number' ? Math.min(32000, Math.max(128, source.maxTokens)) : config.maxTokens, temperature: typeof source.temperature === 'number' ? Math.min(2, Math.max(0, source.temperature)) : config.temperature, permissionMode: source.permissionMode === 'auto' ? 'auto' : 'confirm', reasoningEnabled: typeof source.reasoningEnabled === 'boolean' ? source.reasoningEnabled : config.reasoningEnabled, reasoningEffort: ['low', 'medium', 'high', 'xhigh', 'max'].includes(String(source.reasoningEffort)) ? source.reasoningEffort as AgentProviderConfig['reasoningEffort'] : config.reasoningEffort }
      await saveAgentProviderConfig(next)
      setConfig(next); setModels(next.availableModels); setConnectionStatus(next.provider === 'ollama' || next.apiKey ? 'configured' : 'unconfigured')
      setNotice('AI 配置与 API 密钥已导入，可以直接迁移使用。'); setError('')
    } catch (reason) { setError(reason instanceof Error ? `导入配置失败：${reason.message}` : '导入配置失败') }
  }

  const renameConversation = (id: string, title: string) => {
    const updated = conversations.map((item) => item.id === id ? { ...item, title, updatedAt: Date.now() } : item).sort((a, b) => b.updatedAt - a.updatedAt)
    setConversations(updated)
    if (conversation.id === id) setConversation(updated.find((item) => item.id === id)!)
    void saveAgentConversations(updated).catch(() => setError('对话历史保存失败'))
  }

  const deleteConversation = (id: string) => {
    const target = conversations.find((item) => item.id === id)
    if (!target || !window.confirm(`删除对话“${target.title}”？此操作无法撤销。`)) return
    let updated = conversations.filter((item) => item.id !== id)
    if (conversation.id === id) {
      const next = updated.find((item) => normalizeStoredWorkspaceKey(item.workspace?.key || item.workspaceKey) === workspaceKey) || { ...createConversation(workspace), mode }
      if (!updated.length) updated = [next]
      setConversation(next); setMode(next.mode ?? 'chat')
    }
    setConversations(updated)
    void saveAgentConversations(updated).catch(() => setError('对话历史保存失败'))
  }

  const selectConversation = async (item: AgentConversation, force = false) => {
    const itemWorkspaceKey = normalizeStoredWorkspaceKey(item.workspace?.key || item.workspaceKey)
    if (!force && itemWorkspaceKey !== workspaceKey) {
      pendingConversationIdRef.current = item.id
      if (item.workspace && onSelectWorkspace) {
        try {
          const result = await onSelectWorkspace(item.workspace)
          if (result.matched) {
            setConversation(item)
            setMode(item.mode ?? 'chat')
            setWorkspaceWarning(null)
            setHistoryOpen(false)
            return
          }
          pendingConversationIdRef.current = null
          setWorkspaceWarning({ item, message: result.message || '继续使用该工作区对话可能出现问题。' })
        } catch (reason) {
          pendingConversationIdRef.current = null
          setWorkspaceWarning({ item, message: reason instanceof Error ? `切换工作区失败：${reason.message}` : '切换工作区失败，继续使用该工作区对话可能出现问题。' })
        }
        return
      }
      pendingConversationIdRef.current = null
      setWorkspaceWarning({ item, message: '继续使用该工作区对话可能出现问题。当前应用找不到与它完全匹配的工作区。' })
      return
    }
    pendingConversationIdRef.current = null
    setConversation(item)
    setMode(item.mode ?? 'chat')
    setWorkspaceWarning(null)
    setHistoryOpen(false)
  }

  const selectedFiles = useMemo(() => scope === 'current' && activePath ? files.filter((file) => file.path === activePath) : files, [activePath, files, scope])

  useEffect(() => {
    if (repositoryScopeEnabled) return
    const timer = window.setTimeout(() => setScope('current'), 0)
    return () => window.clearTimeout(timer)
  }, [repositoryScopeEnabled])

  const chooseProvider = (id: AgentProviderId) => {
    const definition = providerDefinition(id)
    const currentWithProfile = withActiveProfile(config)
    const targetProfile = currentWithProfile.providerProfiles[id]
    const nextConfig: AgentProviderConfig = {
      ...currentWithProfile,
      provider: id,
      apiKey: targetProfile?.apiKey || '',
      baseUrl: targetProfile?.baseUrl || definition.baseUrl,
      model: targetProfile?.model || definition.model,
      availableModels: targetProfile?.availableModels || [],
    }
    setConfig(nextConfig); setModels(nextConfig.availableModels); setNotice(''); setError('')
    setConnectionStatus(id === 'ollama' || nextConfig.apiKey ? 'configured' : 'unconfigured')
    void saveAgentProviderConfig(nextConfig).catch(() => setError('AI 配置保存失败'))
  }

  const saveConfig = async () => {
    setBusy('save'); setError(''); setNotice('')
    const nextConfig = withActiveProfile(config)
    setConfig(nextConfig)
    try { await saveAgentProviderConfig(nextConfig); setConnectionStatus(nextConfig.provider === 'ollama' || nextConfig.apiKey ? 'configured' : 'unconfigured'); setNotice('AI 配置已保存在当前浏览器本地。') } catch { setError('AI 配置保存失败') } finally { setBusy(null) }
  }

  const getModels = async () => {
    setBusy('models'); setError(''); setNotice('')
    try {
      const result = await fetchProviderModels(config)
      setModels(result)
      const nextConfig = withActiveProfile({ ...config, availableModels: result, model: result.includes(config.model) ? config.model : (result[0] || config.model) })
      setConfig(nextConfig)
      await saveAgentProviderConfig(nextConfig)
      setNotice(result.length ? `已获取 ${result.length} 个模型。` : '服务商没有返回可用模型，请手动填写。')
    } catch (reason) { setError(reason instanceof Error ? reason.message : '获取模型列表失败') } finally { setBusy(null) }
  }

  const testConnection = async () => {
    setBusy('test'); setConnectionStatus('checking'); setError(''); setNotice('')
    try { await testAgentConnection(config); setConnectionStatus('connected'); setNotice('连接成功，当前服务商和模型可以正常使用。') } catch (reason) { setConnectionStatus('failed'); setError(reason instanceof Error ? reason.message : '连接失败') } finally { setBusy(null) }
  }

  const send = async (replacement?: { text: string; userIndex?: number }) => {
    const text = (replacement?.text || input).trim()
    if (!text || busy) return
    stickToBottomRef.current = true
    const flat = flattenMessages(conversation.messages)
    const revising = replacement?.userIndex !== undefined
    const revisionIndex = replacement?.userIndex ?? -1
    const questionPath = revising ? flat[revisionIndex]?.path ?? null : null
    // 重新生成：文本与当前激活版本完全一致，只给回答追加新版本；修改提问：新建问题分支，隐藏旧尾巴。
    const edited = revising && questionPath !== null && text !== activeContent(flat[revisionIndex].message)
    let nextMessages: AgentMessage[] = conversation.messages
    let requestMessages: AgentMessage[]
    let replacingAnswerPath: number[] | null = null
    if (edited) {
      const oldTail = flat.slice(revisionIndex + 1).map((entry) => entry.message)
      nextMessages = truncateAtPath(updateAtPath(conversation.messages, questionPath!, (question) => {
        const versions = question.questionVersions?.length
          ? [...question.questionVersions.map((version, vi) => vi === (question.activeQuestionVersion ?? 0) ? { ...version, tail: oldTail } : version), { content: text, tail: [] }]
          : [{ content: question.content, tail: oldTail }, { content: text, tail: [] }]
        return { ...question, content: text, questionVersions: versions, activeQuestionVersion: versions.length - 1 }
      }), questionPath!)
      requestMessages = flattenMessages(nextMessages).slice(1, revisionIndex + 1).map((entry) => ({ role: entry.message.role, content: activeContent(entry.message) }))
    } else if (revising) {
      replacingAnswerPath = flat[revisionIndex + 1]?.message.role === 'assistant' ? flat[revisionIndex + 1].path : null
      requestMessages = [...flat.slice(1, revisionIndex).map((entry) => ({ role: entry.message.role, content: activeContent(entry.message) })), { role: 'user' as const, content: text }]
    } else {
      nextMessages = [...conversation.messages, { role: 'user' as const, content: text }]
      requestMessages = [...flat.slice(1).map((entry) => ({ role: entry.message.role, content: activeContent(entry.message) })), { role: 'user' as const, content: text }]
    }
    setLastRequest({ text, userIndex: revising ? revisionIndex : flattenMessages(nextMessages).length - 1 })
    const startedAt = Date.now()
    saveConversation({ ...conversation, mode, title: conversation.title === '新对话' ? text.slice(0, 28) : conversation.title, messages: nextMessages, updatedAt: Date.now() })
    if (!revising) setInput('')
    setEditingQuestion(null); setBusy('send'); setError(''); setStreamingReply(''); setStreamingReasoning(''); setLiveOperations([]); setAnswerStarted(false); setThinkingSeconds(0); setThinkingStartedAt(startedAt); replyBufferRef.current = ''; receivedStreamTextRef.current = false; streamedContentRef.current = ''; abortRef.current = new AbortController()
    // 把新的回答挂到正确位置：重新生成覆盖旧回答（加新版本），修改提问追加到问题分支尾部，普通发送直接追加。
    const withAnswer = (messages: AgentMessage[], answer: AgentMessage, reply: string, reasoningSummary: string | undefined, duration: number) => replacingAnswerPath
      ? updateAtPath(messages, replacingAnswerPath, (message) => {
          const versions = [...(message.answerVersions || [{ content: message.content, reasoningSummary: message.reasoningSummary, reasoningDurationSeconds: message.reasoningDurationSeconds }]), { content: reply, reasoningSummary, reasoningDurationSeconds: duration }]
          return {
            ...message,
            answerVersions: versions,
            activeAnswerVersion: versions.length - 1,
            operations: answer.operations,
            proposals: answer.proposals,
            commitRequested: answer.commitRequested,
            appliedFiles: [...(message.appliedFiles || []), ...(answer.appliedFiles || [])],
            commitDone: message.commitDone || answer.commitDone,
            commitSha: answer.commitSha || message.commitSha,
            commitMessage: answer.commitMessage || message.commitMessage,
            commitError: answer.commitError,
          }
        })
      : edited
        ? updateAtPath(messages, questionPath!, (question) => {
            const versions = question.questionVersions!.map((version, vi) => vi === question.questionVersions!.length - 1 ? { ...version, tail: [...version.tail, answer] } : version)
            return { ...question, questionVersions: versions }
          })
        : [...messages, answer]
    try {
      const sources = selectedFiles.map((file) => ({ path: file.path, content: file.content, status: file.status }))
      // 把本对话已批准应用过的修改（含行级 diff）带给模型，让它知道自己改了什么。
      const appliedChanges: AgentAppliedChange[] = flattenMessages(nextMessages).flatMap((entry) => (entry.message.appliedFiles || []).flatMap((file) => file.diff ? [{ path: file.path, action: file.action, diff: file.diff }] : []))
      const operationMemory = flattenMessages(nextMessages).flatMap((entry) => [
        ...(entry.message.operations || []),
        ...(entry.message.commitDone ? [{ tool: 'git_commit', summary: '已完成 Git 提交并推送', at: Date.now() }] : []),
      ])
      const result = await askAgent(config, mode, requestMessages, sources, '', {
        appliedChanges,
        operationMemory,
        activePath,
        workspaceLabel,
        allowCreate: canCreateFiles,
        allowCommit: canCommit,
        repositoryPaths: [...new Set([...remotePaths, ...files.map((file) => file.path)])],
        getGitContext,
        onOperation: (operation) => setLiveOperations((current) => {
          const index = current.findIndex((item) => item.id === operation.id)
          return index < 0 ? [...current, operation] : current.map((item, itemIndex) => itemIndex === index ? operation : item)
        }),
        signal: abortRef.current?.signal,
        onDelta: (delta) => {
          // 关闭思考时不累积推理内容；推理模型仍可能返回 reasoning，但界面不再显示。
          if (delta.reasoning && config.reasoningEnabled) setStreamingReasoning((current) => current + delta.reasoning!)
          if (delta.content && mode === 'chat') { receivedStreamTextRef.current = true; streamedContentRef.current += delta.content; setThinkingSeconds(Math.max(1, Math.round((Date.now() - startedAt) / 1000))); setAnswerStarted(true); replyBufferRef.current += delta.content }
        },
      })
      if (mode === 'edit' || !receivedStreamTextRef.current) { setThinkingSeconds(Math.max(1, Math.round((Date.now() - startedAt) / 1000))); setAnswerStarted(true); replyBufferRef.current += result.reply }
      await new Promise<void>((resolve) => {
        const waitForReply = () => replyBufferRef.current ? window.setTimeout(waitForReply, 20) : resolve()
        waitForReply()
      })
      const reasoningDurationSeconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000))
      // 关闭思考时落盘也不带思考字段，历史里不再出现"已思考"气泡。
      const keepReasoning = config.reasoningEnabled
      let resolvedProposals = result.proposals
      const appliedFiles: NonNullable<AgentMessage['appliedFiles']> = []
      if (mode === 'edit' && config.permissionMode === 'auto' && result.proposals.length) {
        resolvedProposals = []
        for (const proposal of result.proposals) {
          const applying = { ...proposal, status: 'applying' as const }
          resolvedProposals.push(applying)
          const mutation = proposal.action === 'create'
            ? await onCreateFile(proposal.path, proposal.content)
            : await onApplyChange(proposal.path, proposal.content)
          const resolved = mutation.ok
            ? { ...proposal, status: 'applied' as const, error: undefined, resolvedAt: Date.now() }
            : { ...proposal, status: 'failed' as const, error: mutation.error, resolvedAt: Date.now() }
          resolvedProposals = resolvedProposals.map((item) => item.id === proposal.id ? resolved : item)
          if (mutation.ok) {
            const source = sources.find((item) => item.path === proposal.path)
            const before = proposal.beforeContent ?? source?.content ?? ''
            appliedFiles.push({ path: proposal.path, action: proposal.action, diff: fileDiff(before, proposal.content) })
          }
        }
      }
      const failedChanges = resolvedProposals.filter((proposal) => proposal.status === 'failed').length
      const answer: AgentMessage = {
        role: 'assistant',
        content: result.reply,
        operations: result.operations,
        ...(keepReasoning ? { reasoningSummary: result.reasoningSummary, reasoningDurationSeconds } : {}),
        ...(mode === 'edit' && resolvedProposals.length ? { proposals: resolvedProposals } : {}),
        ...(mode === 'edit' && result.commitRequested ? { commitRequested: true } : {}),
        ...(appliedFiles.length ? { appliedFiles } : {}),
        ...(failedChanges && result.commitRequested ? { commitError: `有 ${failedChanges} 个文件应用失败，已暂停自动提交。` } : {}),
      }
      let finalMessages = withAnswer(nextMessages, answer, result.reply, keepReasoning ? result.reasoningSummary : undefined, reasoningDurationSeconds)
      const conversationTitle = conversation.title === '新对话' ? text.slice(0, 28) : conversation.title
      saveConversation({ ...conversation, mode, title: conversationTitle, messages: finalMessages, updatedAt: Date.now() })
      if (result.proposals.length) {
        if (config.permissionMode === 'auto') {
          setNotice(failedChanges
            ? `已应用 ${appliedFiles.length} 个文件，${failedChanges} 个失败，可在 Diff 记录中重试。`
            : `已按自动执行许可应用 ${appliedFiles.length} 个文件修改。`)
        } else setNotice(`已生成 ${result.proposals.length} 个待审核文件修改，请在回答气泡里确认。`)
      }
      if (result.commitRequested && config.permissionMode === 'auto' && !failedChanges) {
        setBusy('commit')
        const commit = await onCommit()
        const answerPath = replacingAnswerPath || flattenMessages(finalMessages).at(-1)?.path
        if (answerPath) {
          finalMessages = updateAtPath(finalMessages, answerPath, (message) => commit.ok
            ? { ...message, commitRequested: false, commitDone: true, commitSha: commit.commitSha, commitMessage: commit.message, commitError: undefined }
            : { ...message, commitRequested: true, commitDone: false, commitError: commit.error })
          saveConversation({ ...(conversationStateRef.current || conversation), mode, title: conversationTitle, messages: finalMessages, updatedAt: Date.now() })
        }
        if (commit.ok) setNotice(`已提交 Git 修改：${commit.commitSha.slice(0, 7)}`)
        else setError(commit.error)
      }
    } catch (reason) {
      if (reason instanceof Error && reason.name === 'AbortError') {
        // 手动停止：等缓冲里的部分回答吐完，把它落盘保留下来；不做版本化，简单追加。
        await new Promise<void>((resolve) => {
          const waitForReply = () => replyBufferRef.current ? window.setTimeout(waitForReply, 20) : resolve()
          waitForReply()
        })
        const partial = streamedContentRef.current
        if (partial) {
          const answer: AgentMessage = { role: 'assistant', content: partial }
          const finalMessages = replacingAnswerPath ? updateAtPath(nextMessages, replacingAnswerPath, () => answer) : [...nextMessages, answer]
          saveConversation({ ...conversation, mode, title: conversation.title === '新对话' ? text.slice(0, 28) : conversation.title, messages: finalMessages, updatedAt: Date.now() })
        }
        setNotice('已停止回答。')
      } else {
        setError(reason instanceof Error ? reason.message : '模型请求失败')
      }
    } finally { setBusy(null); setThinkingStartedAt(null); abortRef.current = null }
  }

  const selectAnswerVersion = (path: number[], versionIndex: number) => {
    const messages = updateAtPath(conversation.messages, path, (message) => ({ ...message, activeAnswerVersion: versionIndex }))
    saveConversation({ ...conversation, messages, updatedAt: Date.now() })
  }
  const selectQuestionVersion = (path: number[], delta: number) => {
    const messages = updateAtPath(conversation.messages, path, (message) => {
      const count = message.questionVersions?.length || 0
      const active = Math.max(0, Math.min(count - 1, (message.activeQuestionVersion || 0) + delta))
      return { ...message, activeQuestionVersion: active }
    })
    saveConversation({ ...conversation, messages, updatedAt: Date.now() })
  }
  const beginQuestionEdit = (index: number, text: string) => { setEditingQuestion(index); setEditedQuestion(text); setError('') }
  const acceptProposalInMessage = async (msgPath: number[], proposalId: string) => {
    const entry = flattenMessages(conversation.messages).find((item) => item.path.length === msgPath.length && item.path.every((part, index) => part === msgPath[index]))
    const proposal = entry?.message.proposals?.find((item) => item.id === proposalId)
    if (!proposal) return
    const applyingMessages = updateAtPath(conversation.messages, msgPath, (message) => ({ ...message, proposals: message.proposals?.map((item) => item.id === proposalId ? { ...item, status: 'applying', error: undefined } : item) }))
    saveConversation({ ...conversation, messages: applyingMessages, updatedAt: Date.now() })
    const mutation = proposal.action === 'create'
      ? await onCreateFile(proposal.path, proposal.content)
      : await onApplyChange(proposal.path, proposal.content)
    const messages = updateAtPath(applyingMessages, msgPath, (message) => ({
      ...message,
      proposals: message.proposals?.map((item) => item.id === proposalId
        ? { ...item, status: mutation.ok ? 'applied' : 'failed', error: mutation.ok ? undefined : mutation.error, resolvedAt: Date.now() }
        : item),
      ...(mutation.ok ? { appliedFiles: [...(message.appliedFiles || []), { path: proposal.path, action: proposal.action, diff: fileDiff(proposal.beforeContent ?? files.find((item) => item.path === proposal.path)?.content ?? '', proposal.content) }] } : {}),
    }))
    saveConversation({ ...conversation, messages, updatedAt: Date.now() })
    if (mutation.ok) setNotice(`已应用 ${proposal.path}。`)
    else setError(mutation.error)
  }
  const rejectProposalInMessage = (msgPath: number[], proposalId: string) => {
    const messages = updateAtPath(conversation.messages, msgPath, (message) => ({ ...message, proposals: message.proposals?.map((item) => item.id === proposalId ? { ...item, status: 'rejected', error: undefined, resolvedAt: Date.now() } : item) }))
    saveConversation({ ...conversation, messages, updatedAt: Date.now() })
  }
  const commitFromMessage = async (msgPath: number[]) => {
    setBusy('commit'); setError('')
    try {
      const commit = await onCommit()
      const current = conversationStateRef.current || conversation
      const messages = updateAtPath(current.messages, msgPath, (message) => commit.ok
        ? { ...message, commitRequested: false, commitDone: true, commitSha: commit.commitSha, commitMessage: commit.message, commitError: undefined }
        : { ...message, commitRequested: true, commitDone: false, commitError: commit.error })
      saveConversation({ ...current, messages, updatedAt: Date.now() })
      if (commit.ok) setNotice(`已提交 Git 修改：${commit.commitSha.slice(0, 7)}`)
      else setError(commit.error)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Git 提交失败') } finally { setBusy(null) }
  }
  const cancelCommitFromMessage = (msgPath: number[]) => {
    const current = conversationStateRef.current || conversation
    const messages = updateAtPath(current.messages, msgPath, (message) => ({ ...message, commitRequested: false, commitError: undefined }))
    saveConversation({ ...current, messages, updatedAt: Date.now() })
  }
  const connectionLabel = { unconfigured: t('未配置'), configured: t('已配置'), checking: t('检查中'), connected: t('已连接'), failed: t('连接失败') }[connectionStatus]
  const providerLabel = providerDefinition(config.provider).label
  const modelLabel = config.model || t('未选择模型')
  const agentTextStyle = { '--agent-font-size': `${fontSize}px`, '--agent-font-family': fontFamily, '--agent-font-weight': fontWeight } as CSSProperties
  const changedFileCount = files.filter((file) => file.status !== 'clean').length
  const contextStatus = [files.length < remoteFileCount ? `未读取 ${remoteFileCount - files.length} 篇` : '', changedFileCount ? `${changedFileCount} 个修改` : ''].filter(Boolean)

  return <div className="agent-workspace" style={agentTextStyle}>
    <header className="agent-toolbar"><div className="agent-mode-tabs" role="tablist" aria-label={t('AI 模式')}><button type="button" role="tab" aria-selected={mode === 'chat'} className={mode === 'chat' ? 'active' : ''} onClick={() => switchMode('chat')}>{t('对话')}</button><button type="button" role="tab" aria-selected={mode === 'edit'} className={mode === 'edit' ? 'active' : ''} onClick={() => switchMode('edit')}>{t('编辑')}</button></div><span className="agent-provider-summary" title={`${providerLabel} · ${modelLabel} · ${connectionLabel}`} aria-label={`${providerLabel}，${modelLabel}，${connectionLabel}`}><i className={`agent-connection-dot ${connectionStatus}`} /><b>{providerLabel}</b><small>{connectionLabel}</small></span><button type="button" className="agent-settings-button" onClick={() => { setHistoryOpen((value) => !value); setSettingsOpen(false) }} title={t('对话历史')} aria-label={historyOpen ? t('关闭对话历史') : t('打开对话历史')} aria-expanded={historyOpen}><AgentGlyph name="history" /></button><button type="button" className="agent-settings-button" onClick={() => { setSettingsOpen((value) => !value); setHistoryOpen(false) }} title={locale === 'en-US' ? `${t('AI 配置')}: ${modelLabel}` : `${t('AI 配置')}：${modelLabel}`} aria-label={settingsOpen ? t('关闭 AI 配置') : t('打开 AI 配置')} aria-expanded={settingsOpen}><AgentGlyph name="settings" /></button></header>
    {settingsOpen && <><button type="button" className="agent-drawer-backdrop" onClick={() => setSettingsOpen(false)} aria-label="关闭 AI 配置" tabIndex={-1} /><section className="agent-drawer agent-settings" ref={settingsRef} role="dialog" aria-modal="true" aria-labelledby="agent-settings-title" tabIndex={-1}>
      <header><div><strong id="agent-settings-title">{t('AI 服务配置')}</strong><small>{t('连接模型、调整回答策略与 Agent 权限')}</small></div><button type="button" className="agent-drawer-close" onClick={() => setSettingsOpen(false)} data-autofocus aria-label={t('关闭配置')}><AgentGlyph name="close" /></button></header>
      <div className="agent-settings-body"><div className="agent-transfer-bar sensitive"><div><button type="button" onClick={() => configImportRef.current?.click()}><AgentGlyph name="upload" />{t('导入配置')}</button><button type="button" onClick={exportAgentConfig}><AgentGlyph name="download" />{t('导出配置')}</button></div><small><AgentGlyph name="shield" />{t('备份包含 API 密钥，请勿发送给他人')}</small><input ref={configImportRef} className="visually-hidden" type="file" accept=".json,application/json" aria-label={t('选择 Agent 配置 JSON 文件')} onChange={(event) => { const file = event.target.files?.[0]; if (file) void importAgentConfig(file); event.target.value = '' }} /></div>
      <label className="agent-field agent-provider-field"><span>{t('AI 服务商')}</span><div className="agent-select-control"><select value={config.provider} onChange={(event) => chooseProvider(event.target.value as AgentProviderId)}>{providerDefinitions.map((provider) => <option key={provider.id} value={provider.id}>{t(provider.label)}</option>)}</select><AgentGlyph name="chevron" /></div></label>
      <div className="agent-field-grid"><label className="agent-field"><span>{t('API 密钥')}</span><input type="password" autoComplete="off" value={config.apiKey} onChange={(event) => setConfig((current) => ({ ...current, apiKey: event.target.value }))} placeholder={config.provider === 'ollama' ? t('本地 Ollama 通常不需要密钥') : t('输入 API Key')} /></label><label className="agent-field"><span>Base URL</span><input value={config.baseUrl} onChange={(event) => setConfig((current) => ({ ...current, baseUrl: event.target.value }))} placeholder="https://api.example.com/v1" /></label></div>
      <label className="agent-field"><span>{t('模型名称')}</span><div className="agent-model-input"><div className="agent-select-control"><select value={config.model} onChange={(event) => setConfig((current) => ({ ...current, model: event.target.value }))}>{!models.includes(config.model) && <option value={config.model}>{config.model || t('请选择模型')}</option>}{models.map((model) => <option key={model} value={model}>{model}</option>)}</select><AgentGlyph name="chevron" /></div><button type="button" onClick={() => void getModels()} disabled={busy !== null}><AgentGlyph name="refresh" />{busy === 'models' ? t('获取中…') : t('获取模型列表')}</button></div></label>
      {(notice || error) && <div className={`agent-settings-result ${error ? 'error' : 'success'}`} role={error ? 'alert' : 'status'}><AgentGlyph name={error ? 'alert' : 'check'} /><span>{error || notice}</span></div>}
      <div className="agent-advanced"><button type="button" onClick={() => setAdvancedOpen((value) => !value)} aria-expanded={advancedOpen}><strong>{t('高级设置')}</strong><span className={advancedOpen ? 'open' : ''}><small>{advancedOpen ? t('收起') : t('展开')}</small><AgentGlyph name="chevron" /></span></button>{advancedOpen && <div className="agent-field-grid"><label className="agent-field"><span>{t('最大 Token 数')}</span><input type="number" min="128" max="32000" value={config.maxTokens} onChange={(event) => setConfig((current) => ({ ...current, maxTokens: Number(event.target.value) || 128 }))} /></label><label className="agent-field"><span>{t('Temperature（随机性）')}</span><input type="number" min="0" max="2" step="0.1" value={config.temperature} onChange={(event) => setConfig((current) => ({ ...current, temperature: Number(event.target.value) || 0 }))} /></label></div>}</div>
      <p className="agent-local-note">{t('密钥仅保存在当前浏览器本地；请求会直接发送到所选 AI 服务商。')}</p>
      </div>
      <div className="agent-settings-actions"><button type="button" className="agent-test-button" onClick={() => void testConnection()} disabled={busy !== null}><AgentGlyph name={busy === 'test' ? 'refresh' : 'check'} />{busy === 'test' ? t('测试中…') : connectionStatus === 'connected' ? t('连接成功') : t('测试连接')}</button><button type="button" className="agent-save-button" onClick={() => void saveConfig()} disabled={busy !== null}><AgentGlyph name="download" />{busy === 'save' ? t('保存中…') : t('保存到本地')}</button></div>
    </section></>}
    <div className="agent-context-bar" aria-label={t('Agent 当前上下文')}><span><AgentGlyph name={workspaceKind === 'file' ? 'file' : 'folder'} /><strong title={workspaceLabel}>{workspaceLabel}</strong>{activePath && activePath !== workspaceLabel && <em>· {activePath}</em>}</span>{contextStatus.length > 0 && <small>{contextStatus.join(' · ')}</small>}</div>
    {notice && <div className="agent-notice" role="status" aria-live="polite" aria-atomic="true"><AgentGlyph name="check" />{notice}</div>}
    {error && <div className="agent-error" role="alert" aria-live="assertive" aria-atomic="true"><span>{error}</span>{lastRequest && <button type="button" onClick={() => void send(lastRequest)}><AgentGlyph name="refresh" />{t('重试')}</button>}</div>}
    {historyOpen && <AgentHistoryDrawer conversations={conversations} activeId={conversation.id} currentWorkspaceKey={workspaceKey} onClose={() => { pendingConversationIdRef.current = null; setHistoryOpen(false); setWorkspaceWarning(null) }} onNew={startConversation} onSelect={(item) => void selectConversation(item)} workspaceWarning={workspaceWarning} onConfirmWorkspaceWarning={() => { if (workspaceWarning) void selectConversation(workspaceWarning.item, true) }} onCancelWorkspaceWarning={() => { pendingConversationIdRef.current = null; setWorkspaceWarning(null) }} onRename={renameConversation} onDelete={deleteConversation} onExport={exportConversation} onImportAll={(file) => void importConversationHistory(file)} onExportAll={exportConversationHistory} />}
    <div className="agent-conversation" ref={conversationRef} onScroll={(event) => { const el = event.currentTarget; stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 32 }}>{flattenMessages(conversation.messages).map((entry, index) => <ConversationMessage key={entry.path.join('.')} message={entry.message} path={entry.path} editing={editingQuestion === index} editText={editedQuestion} files={files} busy={busy} repositoryBranch={repositoryBranch} changedFileCount={files.filter((file) => file.status !== 'clean').length} textStyle={agentTextStyle} onEdit={() => beginQuestionEdit(index, activeContent(entry.message))} onEditText={setEditedQuestion} onCancelEdit={() => setEditingQuestion(null)} onSubmitEdit={() => void send({ text: editedQuestion, userIndex: index })} onRegenerate={() => { const question = flattenMessages(conversation.messages)[index - 1]; if (question?.message.role === 'user') void send({ text: activeContent(question.message), userIndex: index - 1 }) }} onSelectVersion={(path, version) => selectAnswerVersion(path, version)} onSelectQuestionVersion={(path, delta) => selectQuestionVersion(path, delta)} onAcceptProposal={(path, proposalId) => void acceptProposalInMessage(path, proposalId)} onRejectProposal={rejectProposalInMessage} onOpenFile={onOpenFile} onCommitFromMessage={(msgPath) => void commitFromMessage(msgPath)} onCancelCommitFromMessage={cancelCommitFromMessage} />)}{conversation.messages.length === 1 && <div className="agent-starters" aria-label="建议问法"><button type="button" onClick={() => setInput('结合这些笔记和你的知识，找出三个值得继续探索的关联。')}>发现跨笔记关联</button><button type="button" onClick={() => setInput('检查当前笔记的逻辑缺口，补充我可能忽略的背景知识。')}>补充背景与反例</button><button type="button" onClick={() => { setMode('edit'); setInput('整理当前笔记的结构，保留原意并提升可读性。') }}>整理并完善笔记</button></div>}{busy === 'send' && <div className="agent-message assistant"><i><AgentGlyph name="bot" /></i><div>{config.reasoningEnabled && <details className="agent-reasoning" open={!answerStarted}><summary><AgentGlyph name="brain" />{answerStarted ? `已思考（用时 ${thinkingSeconds}s）` : `思考中（${thinkingSeconds}s）`}</summary>{streamingReasoning && <span>{streamingReasoning}</span>}</details>}{!answerStarted && Boolean(liveOperations.length) && <div className="agent-live-operations">{liveOperations.map((operation) => <span className={operation.status || 'succeeded'} key={operation.id || `${operation.tool}:${operation.at}`}><i>{operation.status === 'running' ? <span className="agent-operation-spinner" /> : operation.status === 'failed' ? '×' : '✓'}</i>{operation.summary}</span>)}</div>}{!answerStarted && !liveOperations.length && <div className="agent-pending"><span className="agent-typing"><span /><span /><span /></span>{mode === 'edit' ? '正在分析仓库并生成修改方案…' : '正在结合笔记与通用知识思考…'}</div>}{answerStarted && <AgentMarkdown streaming>{streamingReply}</AgentMarkdown>}</div></div>}</div>
    <footer className="agent-composer">
      <div className="agent-composer-input">
        <textarea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send() } }} placeholder={mode === 'edit' ? canCreateFiles ? t('描述要修改或新建的笔记。AI 会先给出可审核的方案。') : t('描述要如何修改当前文件。AI 会先给出可审核的方案。') : t('询问笔记内容，Enter 发送…')} />
      </div>
      <div className="agent-composer-tools">
        {mode === 'edit' && repositoryScopeEnabled && <div className="agent-option-wrap"><button type="button" title={t('编辑范围')} className="agent-option-trigger agent-scope-trigger" onClick={() => setScopeOpen((value) => !value)}><AgentGlyph name={scope === 'current' ? 'file' : 'folder'} />{scope === 'current' ? t('当前文件') : locale === 'en-US' ? 'Workspace' : t('工作区笔记')}</button>{scopeOpen && <div className="agent-option-popover scope-popover" ref={clampPopover}><header><strong>{t('编辑范围')}</strong></header><button type="button" className={scope === 'current' ? 'selected' : ''} disabled={!activePath} onClick={() => { setScope('current'); setScopeOpen(false) }}><AgentGlyph name="file" /><span><strong>{t('当前文件')}</strong><small>{activePath || t('请先从工作区中打开一个文件')}</small></span><i>✓</i></button><button type="button" className={scope === 'cached' ? 'selected' : ''} onClick={() => { setScope('cached'); setScopeOpen(false) }}><AgentGlyph name="folder" /><span><strong>{t('工作区笔记')}</strong><small>{t('已读取')} {files.length}/{remoteFileCount} {t('个 Markdown 文件')}</small></span><i>✓</i></button>{files.length < remoteFileCount && <button type="button" className="scope-load-button" onClick={() => void onLoadAllFiles()} disabled={loadingFiles}>{loadingFiles ? t('正在读取全部笔记…') : t('读取全部笔记')}</button>}</div>}</div>}
        <div className="agent-option-wrap"><button type="button" title={t('思考')} className={`agent-option-trigger agent-reasoning-trigger ${config.reasoningEnabled ? 'active' : ''}`} onClick={() => setReasoningOpen((value) => !value)}><AgentGlyph name="brain" />{t('思考')}</button>{reasoningOpen && <div className="agent-option-popover reasoning-popover" ref={clampPopover}><header><strong>{t('思考')}</strong></header><div className="agent-effort">{(['low', 'medium', 'high', 'xhigh', 'max'] as const).map((effort) => <button type="button" className={config.reasoningEffort === effort ? 'active' : ''} key={effort} onClick={() => setConfig((current) => ({ ...current, reasoningEffort: effort, reasoningEnabled: true }))}><span>{{ low: t('低'), medium: t('中'), high: t('高'), xhigh: t('极高'), max: t('最高') }[effort]}</span>{config.reasoningEffort === effort && <AgentGlyph name="check" />}</button>)}</div><p>{t('让支持推理的模型返回可展开的思考过程。')}</p><button type="button" className={`reasoning-toggle ${config.reasoningEnabled ? 'on' : ''}`} onClick={() => setConfig((current) => ({ ...current, reasoningEnabled: !current.reasoningEnabled }))}><AgentGlyph name="brain" />{config.reasoningEnabled ? t('关闭思考') : t('开启思考')}</button></div>}</div>
        {mode === 'edit' && <div className="agent-option-wrap"><button type="button" title={t('操作许可')} className={`agent-option-trigger agent-permission-trigger ${config.permissionMode === 'auto' ? 'auto' : ''}`} onClick={() => setPermissionOpen((value) => !value)}><AgentGlyph name={config.permissionMode === 'auto' ? 'alert' : 'shield'} />{config.permissionMode === 'auto' ? t('自动执行') : locale === 'en-US' ? 'Confirm first' : t('每次确认')}</button>{permissionOpen && <div className="agent-option-popover permission-popover" ref={clampPopover}><header><strong>{t('操作许可')}</strong></header><button type="button" className={config.permissionMode === 'confirm' ? 'selected' : ''} onClick={() => { setConfig((current) => ({ ...current, permissionMode: 'confirm' })); setPermissionOpen(false) }}><AgentGlyph name="shield" /><span><strong>{t('请求批准')}</strong><small>{canCommit ? t('修改、新建或提交 Git 前逐项确认。') : t('修改当前文件前逐项确认。')}</small></span><i>✓</i></button><button type="button" className={config.permissionMode === 'auto' ? 'selected auto' : ''} onClick={() => { setConfig((current) => ({ ...current, permissionMode: 'auto' })); setPermissionOpen(false) }}><AgentGlyph name="alert" /><span><strong>{t('自动执行')}</strong><small>{canCommit ? t('收到方案后直接暂存修改与提交请求。') : t('收到方案后直接应用到当前标签页。')}</small></span><i>✓</i></button></div>}</div>}
        <button type="button" className="agent-send-button" title={busy === 'send' ? '停止回答' : '发送'} onClick={() => { if (busy === 'send') abortRef.current?.abort(); else void send() }} disabled={busy === 'send' ? false : busy !== null || !input.trim()}><AgentGlyph name={busy === 'send' ? 'stop' : 'send'} /></button>
      </div>
    </footer>
  </div>
}
