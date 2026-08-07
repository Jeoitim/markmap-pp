import { Children, isValidElement, useEffect, useId, useMemo, useRef, useState, type ComponentPropsWithoutRef, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode, type WheelEvent as ReactWheelEvent } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { askAgent, testAgentConnection, type AgentMessage, type AgentProposal } from './agent-client'
import { conversationMarkdown, createConversation, loadAgentConversations, saveAgentConversations, type AgentConversation } from './agent-history'
import { defaultAgentProviderConfig, fetchProviderModels, loadAgentProviderConfig, providerDefinition, providerDefinitions, saveAgentProviderConfig, type AgentProviderConfig, type AgentProviderId, type AgentProviderProfile } from './agent-provider'
import type { CachedMarkdownFile } from './github-sync'

type AgentMode = 'chat' | 'edit'

function profileOf(config: AgentProviderConfig): AgentProviderProfile {
  return { apiKey: config.apiKey, baseUrl: config.baseUrl, model: config.model, availableModels: config.availableModels }
}

function withActiveProfile(config: AgentProviderConfig): AgentProviderConfig {
  return { ...config, providerProfiles: { ...config.providerProfiles, [config.provider]: profileOf(config) } }
}

function MermaidDiagram({ chart }: { chart: string }) {
  const [result, setResult] = useState<{ chart: string; svg: string; error: string }>({ chart: '', svg: '', error: '' })
  const [sourceOpen, setSourceOpen] = useState(false)
  const [sourceCopied, setSourceCopied] = useState(false)
  const [zoomOpen, setZoomOpen] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const id = useId().replace(/:/g, '')
  const gesture = useRef<{ points: Record<number, { x: number; y: number }>; panStart?: { x: number; y: number; originX: number; originY: number }; pinchStart?: { distance: number; zoom: number } }>({ points: {} })

  useEffect(() => {
    let active = true
    void import('mermaid').then(({ default: mermaid }) => {
      mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: document.documentElement.dataset.theme === 'dark' ? 'dark' : 'default' })
      return mermaid.render(`agent-mermaid-${id}`, chart)
    }).then((rendered) => { if (active) setResult({ chart, svg: rendered.svg, error: '' }) }).catch(() => { if (active) setResult({ chart, svg: '', error: '图表语法无法渲染，以下保留原始 Mermaid 代码。' }) })
    return () => { active = false }
  }, [chart, id])

  const current = result.chart === chart ? result : { svg: '', error: '' }
  const copySource = async () => {
    try { await navigator.clipboard.writeText(chart); setSourceCopied(true); window.setTimeout(() => setSourceCopied(false), 1600) } catch { setSourceCopied(false) }
  }
  const toggleSource = () => { setSourceOpen((value) => !value); setSourceCopied(false) }
  const openFullscreen = () => {
    setPan({ x: 0, y: 0 }); setZoomOpen(true)
    window.requestAnimationFrame(() => {
      const viewport = document.querySelector<HTMLDivElement>('.agent-mermaid-modal .agent-mermaid-viewport')
      const viewBox = current.svg.match(/viewBox=["']\s*[\d.-]+\s+[\d.-]+\s+([\d.-]+)\s+([\d.-]+)/i)
      const width = Number(viewBox?.[1]) || 720
      const height = Number(viewBox?.[2]) || 480
      if (viewport) setZoom(Math.max(.35, Math.min(4, viewport.clientWidth * .86 / width, viewport.clientHeight * .86 / height)))
    })
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
      setZoom(Math.min(4, Math.max(.35, state.pinchStart.zoom * distance / Math.max(1, state.pinchStart.distance))))
    } else if (points.length === 1 && state.panStart) setPan({ x: state.panStart.originX + event.clientX - state.panStart.x, y: state.panStart.originY + event.clientY - state.panStart.y })
  }
  const pointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => { delete gesture.current.points[event.pointerId]; gesture.current.panStart = undefined; gesture.current.pinchStart = undefined }
  const zoomWithWheel = (event: ReactWheelEvent<HTMLDivElement>) => { event.preventDefault(); setZoom((value) => Math.min(4, Math.max(.35, value * (event.deltaY < 0 ? 1.1 : .9)))) }
  return <figure className="agent-mermaid"><figcaption><span>Mermaid 图表</span><span><button type="button" className="agent-icon-button" onClick={toggleSource} title={sourceOpen ? '查看图表' : '查看源代码'} aria-label={sourceOpen ? '查看图表' : '查看源代码'}><AgentGlyph name={sourceOpen ? 'diagram' : 'code'} /></button><button type="button" className="agent-icon-button" onClick={openFullscreen} disabled={!current.svg} title="全屏查看" aria-label="全屏查看"><AgentGlyph name="fullscreen" /></button></span></figcaption>{sourceOpen ? <section className="agent-code-block agent-mermaid-source"><header><span>mermaid</span><button type="button" className="agent-icon-button" onClick={() => void copySource()} title={sourceCopied ? '已复制' : '复制源代码'} aria-label={sourceCopied ? '已复制' : '复制源代码'}><AgentGlyph name="copy" /></button></header><pre><code>{chart}</code></pre></section> : current.svg ? <div dangerouslySetInnerHTML={{ __html: current.svg }} /> : current.error ? <small>{current.error}</small> : <small>正在渲染图表…</small>}{zoomOpen && current.svg && <div className="agent-mermaid-modal" role="dialog" aria-modal="true" aria-label="全屏查看 Mermaid 图表" onMouseDown={(event) => { if (event.target === event.currentTarget) setZoomOpen(false) }}><section><header><strong>Mermaid 图表 <small>{Math.round(zoom * 100)}%</small></strong><button type="button" onClick={() => setZoomOpen(false)} aria-label="退出全屏查看"><AgentGlyph name="close" /></button></header><div className="agent-mermaid-viewport" onWheel={zoomWithWheel} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerEnd} onPointerCancel={pointerEnd}><div className="agent-mermaid-zoom-layer" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }} dangerouslySetInnerHTML={{ __html: current.svg }} /></div></section></div>}</figure>
}

function AgentPre({ children, ...props }: ComponentPropsWithoutRef<'pre'>) {
  const child = Children.toArray(children)[0]
  const code = isValidElement<{ className?: string; children?: ReactNode }>(child) ? child : null
  const language = code?.props.className?.match(/language-([\w-]+)/)?.[1] || 'text'
  const raw = String(code?.props.children || '').replace(/\n$/, '')
  const [copied, setCopied] = useState(false)

  if (language === 'mermaid') return <MermaidDiagram chart={raw} />
  const copy = async () => {
    try { await navigator.clipboard.writeText(raw); setCopied(true); window.setTimeout(() => setCopied(false), 1600) } catch { setCopied(false) }
  }
  return <section className="agent-code-block"><header><span>{language}</span><button type="button" className="agent-icon-button" onClick={() => void copy()} title={copied ? '已复制' : '复制代码'} aria-label={copied ? '已复制' : '复制代码'}><AgentGlyph name="copy" /></button></header><pre {...props}>{children}</pre></section>
}

function StreamingAgentPre({ children, ...props }: ComponentPropsWithoutRef<'pre'>) {
  const child = Children.toArray(children)[0]
  const code = isValidElement<{ className?: string }>(child) ? child : null
  const language = code?.props.className?.match(/language-([\w-]+)/)?.[1] || 'text'
  if (language !== 'mermaid') return <AgentPre {...props}>{children}</AgentPre>
  return <section className="agent-code-block agent-mermaid-pending"><header><span>mermaid</span><small>回答完成后渲染图表</small></header><pre {...props}>{children}</pre></section>
}

function AgentMarkdown({ children, streaming = false }: { children: string; streaming?: boolean }) {
  const content = <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ pre: streaming ? StreamingAgentPre : AgentPre }}>{children}</ReactMarkdown>
  return <div className={`agent-markdown${streaming ? ' agent-streaming-markdown' : ''}`}>{content}{streaming && <b aria-hidden="true" />}</div>
}

function ConversationMessage({ message, editing, editText, onEdit, onEditText, onCancelEdit, onSubmitEdit, onRegenerate, onSelectVersion }: { message: AgentMessage; editing: boolean; editText: string; onEdit: () => void; onEditText: (value: string) => void; onCancelEdit: () => void; onSubmitEdit: () => void; onRegenerate: () => void; onSelectVersion: (index: number) => void }) {
  const [copied, setCopied] = useState(false)
  const version = message.answerVersions?.[message.activeAnswerVersion || 0]
  const content = version?.content || message.content
  const reasoningSummary = version?.reasoningSummary || message.reasoningSummary
  const reasoningDurationSeconds = version?.reasoningDurationSeconds ?? message.reasoningDurationSeconds
  const copy = async () => { try { await navigator.clipboard.writeText(content); setCopied(true); window.setTimeout(() => setCopied(false), 1600) } catch { setCopied(false) } }
  return <div className={`agent-message ${message.role}`}><i><AgentGlyph name={message.role === 'assistant' ? 'bot' : 'send'} /></i><div>{message.role === 'assistant' && reasoningDurationSeconds !== undefined && <details className="agent-reasoning"><summary><AgentGlyph name="brain" />已思考（用时 {reasoningDurationSeconds}s）</summary>{reasoningSummary && <span>{reasoningSummary}</span>}</details>}{message.role === 'user' && editing ? <div className="agent-question-editor"><textarea value={editText} onChange={(event) => onEditText(event.target.value)} /><footer><button type="button" onClick={onCancelEdit}>取消</button><button type="button" onClick={onSubmitEdit} disabled={!editText.trim()}>重新提问</button></footer></div> : <AgentMarkdown>{content}</AgentMarkdown>}<footer className="agent-message-actions">{message.role === 'user' ? <button type="button" className="agent-icon-button" onClick={onEdit} title="修改提问" aria-label="修改提问"><AgentGlyph name="edit" /></button> : <><button type="button" className="agent-icon-button" onClick={() => void copy()} title={copied ? '已复制' : '复制回答'} aria-label={copied ? '已复制' : '复制回答'}><AgentGlyph name="copy" /></button><button type="button" className="agent-icon-button" onClick={onRegenerate} title="重新生成" aria-label="重新生成"><AgentGlyph name="refresh" /></button>{(message.answerVersions?.length || 0) > 1 && <span className="agent-answer-switch"><button type="button" onClick={() => onSelectVersion(Math.max(0, (message.activeAnswerVersion || 0) - 1))} disabled={(message.activeAnswerVersion || 0) === 0} aria-label="上一版回答"><AgentGlyph name="arrow-left" /></button><small>{(message.activeAnswerVersion || 0) + 1}/{message.answerVersions!.length}</small><button type="button" onClick={() => onSelectVersion(Math.min(message.answerVersions!.length - 1, (message.activeAnswerVersion || 0) + 1))} disabled={(message.activeAnswerVersion || 0) === message.answerVersions!.length - 1} aria-label="下一版回答"><AgentGlyph name="arrow-right" /></button></span>}</>}</footer></div></div>
}

interface AgentPanelProps {
  files: CachedMarkdownFile[]
  activePath: string | null
  onApplyChange: (path: string, content: string) => void
  onCreateFile: (path: string, content: string) => void
  onCommit: () => Promise<void>
  getGitContext: (paths: string[]) => Promise<string>
  remoteFileCount: number
  onLoadAllFiles: () => Promise<void>
  loadingFiles: boolean
  fontSize: number
  fontFamily: string
  fontWeight: number
}

function AgentGlyph({ name }: { name: 'bot' | 'send' | 'settings' | 'refresh' | 'check' | 'close' | 'history' | 'download' | 'plus' | 'git' | 'shield' | 'alert' | 'brain' | 'chevron' | 'folder' | 'file' | 'copy' | 'code' | 'diagram' | 'fullscreen' | 'edit' | 'arrow-left' | 'arrow-right' }) {
  const paths = {
    bot: <><rect x="4" y="7" width="16" height="12" rx="3"/><path d="M12 3v4M9 12h.01M15 12h.01M8 16c2 1.3 6 1.3 8 0"/></>,
    send: <><path d="m21 3-7.5 18-3.8-7.7L2 9.5 21 3Z"/><path d="m9.7 13.3 4.1-4.1"/></>,
    settings: <><path d="M4 7h10m4 0h2M4 12h3m4 0h9M4 17h8m4 0h4"/><circle cx="16" cy="7" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="14" cy="17" r="2"/></>,
    refresh: <><path d="M20 7v5h-5"/><path d="M18.2 16.5A8 8 0 1 1 19.8 9L20 12"/></>,
    check: <path d="m5 12 4 4L19 6"/>, close: <path d="m6 6 12 12M18 6 6 18"/>,
    history: <><path d="M3.5 12a8.5 8.5 0 1 0 2.5-6"/><path d="M3.5 4v4h4"/><path d="M12 7v5l3.5 2"/></>,
    download: <><path d="M12 3v12m0 0 4-4m-4 4-4-4"/><path d="M5 19h14"/></>, plus: <path d="M12 5v14M5 12h14"/>,
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
    'arrow-left': <path d="m14 6-6 6 6 6"/>, 'arrow-right': <path d="m10 6 6 6-6 6"/>,
  }
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>
}

function fileDiff(before: string, after: string) {
  const oldLines = before.split('\n')
  const newLines = after.split('\n')
  let start = 0
  while (start < oldLines.length && start < newLines.length && oldLines[start] === newLines[start]) start += 1
  let oldEnd = oldLines.length - 1
  let newEnd = newLines.length - 1
  while (oldEnd >= start && newEnd >= start && oldLines[oldEnd] === newLines[newEnd]) { oldEnd -= 1; newEnd -= 1 }
  return { start, removed: oldLines.slice(start, oldEnd + 1), added: newLines.slice(start, newEnd + 1) }
}

function ProposalDiff({ proposal, file, onAccept, onReject }: { proposal: AgentProposal; file?: CachedMarkdownFile; onAccept: () => void; onReject: () => void }) {
  const diff = fileDiff(file?.content || '', proposal.content)
  return <article className="agent-proposal">
    <header><div><strong>{proposal.path}</strong><small>{proposal.action === 'create' ? `新建笔记 · ${proposal.reason}` : proposal.reason}</small></div><button type="button" onClick={onReject} title="丢弃修改"><AgentGlyph name="close" /></button></header>
    <div className="agent-diff" aria-label={`${proposal.path} 的修改预览`}>
      <span className="agent-diff-context">… 第 {diff.start + 1} 行开始</span>
      {diff.removed.map((line, index) => <code className="removed" key={`r:${index}`}>− {line || ' '}</code>)}
      {diff.added.map((line, index) => <code className="added" key={`a:${index}`}>+ {line || ' '}</code>)}
      {!diff.removed.length && !diff.added.length && <span className="agent-diff-context">内容没有变化</span>}
    </div>
    <footer><button type="button" className="agent-apply-button" onClick={onAccept}><AgentGlyph name="check" />接受修改</button><button type="button" onClick={onReject}>拒绝</button></footer>
  </article>
}

export default function AgentPanel({ files, activePath, onApplyChange, onCreateFile, onCommit, getGitContext, remoteFileCount, onLoadAllFiles, loadingFiles, fontSize, fontFamily, fontWeight }: AgentPanelProps) {
  const [mode, setMode] = useState<AgentMode>('chat')
  const [config, setConfig] = useState<AgentProviderConfig>(defaultAgentProviderConfig)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [models, setModels] = useState<string[]>([])
  const [conversation, setConversation] = useState<AgentConversation>(() => createConversation())
  const [conversations, setConversations] = useState<AgentConversation[]>([])
  const [historyOpen, setHistoryOpen] = useState(false)
  const [input, setInput] = useState('')
  const [proposals, setProposals] = useState<AgentProposal[]>([])
  const [commitRequested, setCommitRequested] = useState(false)
  const [permissionOpen, setPermissionOpen] = useState(false)
  const [reasoningOpen, setReasoningOpen] = useState(false)
  const [scopeOpen, setScopeOpen] = useState(false)
  const [scope, setScope] = useState<'current' | 'cached'>('cached')
  const [busy, setBusy] = useState<'send' | 'models' | 'test' | 'save' | 'commit' | null>(null)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [streamingReply, setStreamingReply] = useState('')
  const [streamingReasoning, setStreamingReasoning] = useState('')
  const [editingQuestion, setEditingQuestion] = useState<number | null>(null)
  const [editedQuestion, setEditedQuestion] = useState('')
  const [lastRequest, setLastRequest] = useState<{ text: string; userIndex?: number } | null>(null)
  const [thinkingStartedAt, setThinkingStartedAt] = useState<number | null>(null)
  const [thinkingSeconds, setThinkingSeconds] = useState(0)
  const [answerStarted, setAnswerStarted] = useState(false)
  const historyRef = useRef<HTMLElement | null>(null)
  const historyButtonRef = useRef<HTMLButtonElement | null>(null)
  const replyBufferRef = useRef('')
  const receivedStreamTextRef = useRef(false)

  useEffect(() => {
    let disposed = false
    void loadAgentProviderConfig().then((saved) => {
      if (disposed) return
      setConfig(saved)
      setModels(saved.availableModels || [])
      setSettingsOpen(!saved.apiKey)
    }).catch(() => { if (!disposed) setError('无法读取本地 AI 配置') })
    return () => { disposed = true }
  }, [])

  useEffect(() => {
    if (!historyOpen) return
    const closeHistory = (event: PointerEvent) => {
      const target = event.target as Node
      if (historyRef.current?.contains(target) || historyButtonRef.current?.contains(target)) return
      setHistoryOpen(false)
    }
    window.addEventListener('pointerdown', closeHistory)
    return () => window.removeEventListener('pointerdown', closeHistory)
  }, [historyOpen])

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
      setConversations(saved); setConversation(saved[0])
    }).catch(() => { if (!disposed) setError('无法读取本地对话历史') })
    return () => { disposed = true }
  }, [])

  const saveConversation = (next: AgentConversation) => {
    setConversation(next)
    setConversations((current) => {
      const updated = [next, ...current.filter((item) => item.id !== next.id)].sort((a, b) => b.updatedAt - a.updatedAt)
      void saveAgentConversations(updated).catch(() => setError('对话历史保存失败'))
      return updated
    })
  }

  const startConversation = () => { const next = createConversation(); setProposals([]); setCommitRequested(false); saveConversation(next); setHistoryOpen(false) }

  const exportConversation = (item: AgentConversation) => {
    const url = URL.createObjectURL(new Blob([conversationMarkdown(item)], { type: 'text/markdown;charset=utf-8' }))
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${item.title || 'AI 对话'}.md`; anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const selectedFiles = useMemo(() => scope === 'current' && activePath ? files.filter((file) => file.path === activePath) : files, [activePath, files, scope])

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
    void saveAgentProviderConfig(nextConfig).catch(() => setError('AI 配置保存失败'))
  }

  const saveConfig = async () => {
    setBusy('save'); setError(''); setNotice('')
    const nextConfig = withActiveProfile(config)
    setConfig(nextConfig)
    try { await saveAgentProviderConfig(nextConfig); setNotice('AI 配置已保存在当前浏览器本地。') } catch { setError('AI 配置保存失败') } finally { setBusy(null) }
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
    setBusy('test'); setError(''); setNotice('')
    try { await testAgentConnection(config); setNotice('连接成功。') } catch (reason) { setError(reason instanceof Error ? reason.message : '连接失败') } finally { setBusy(null) }
  }

  const send = async (replacement?: { text: string; userIndex?: number }) => {
    const text = (replacement?.text || input).trim()
    if (!text || busy) return
    const revising = replacement?.userIndex !== undefined
    const revisionIndex = replacement?.userIndex ?? -1
    const sourceMessages = revising ? conversation.messages.map((message, index) => index === revisionIndex ? { ...message, content: text } : message) : conversation.messages
    const answerIndex = revising ? revisionIndex + 1 : -1
    const replacingAnswer = revising && sourceMessages[answerIndex]?.role === 'assistant'
    const nextMessages = revising ? sourceMessages : [...sourceMessages, { role: 'user' as const, content: text }]
    const requestMessages = revising ? sourceMessages.slice(1, revisionIndex + 1) : [...sourceMessages.filter((_, index) => index > 0), { role: 'user' as const, content: text }]
    setLastRequest(revising ? { text, userIndex: revisionIndex } : { text })
    const startedAt = Date.now()
    saveConversation({ ...conversation, title: conversation.title === '新对话' ? text.slice(0, 28) : conversation.title, messages: nextMessages, updatedAt: Date.now() })
    if (!revising) setInput('')
    setEditingQuestion(null); setBusy('send'); setError(''); setStreamingReply(''); setStreamingReasoning(''); setAnswerStarted(false); setThinkingSeconds(0); setThinkingStartedAt(startedAt); replyBufferRef.current = ''; receivedStreamTextRef.current = false
    try {
      const sources = selectedFiles.map((file) => ({ path: file.path, content: file.content }))
      const gitContext = await getGitContext(sources.map((file) => file.path))
      const result = await askAgent(config, mode, requestMessages, sources, gitContext, (delta) => {
        if (delta.reasoning) setStreamingReasoning((current) => current + delta.reasoning!)
        if (delta.content && mode === 'chat') { receivedStreamTextRef.current = true; setThinkingSeconds(Math.max(1, Math.round((Date.now() - startedAt) / 1000))); setAnswerStarted(true); replyBufferRef.current += delta.content }
      })
      if (mode === 'edit' || !receivedStreamTextRef.current) { setThinkingSeconds(Math.max(1, Math.round((Date.now() - startedAt) / 1000))); setAnswerStarted(true); replyBufferRef.current += result.reply }
      await new Promise<void>((resolve) => {
        const waitForReply = () => replyBufferRef.current ? window.setTimeout(waitForReply, 20) : resolve()
        waitForReply()
      })
      const reasoningDurationSeconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000))
      const answer: AgentMessage = { role: 'assistant', content: result.reply, reasoningSummary: result.reasoningSummary, reasoningDurationSeconds }
      const finalMessages = replacingAnswer ? nextMessages.map((message, index) => {
        if (index !== answerIndex) return message
        const versions = [...(message.answerVersions || [{ content: message.content, reasoningSummary: message.reasoningSummary, reasoningDurationSeconds: message.reasoningDurationSeconds }]), { content: result.reply, reasoningSummary: result.reasoningSummary, reasoningDurationSeconds }]
        return { ...answer, answerVersions: versions, activeAnswerVersion: versions.length - 1 }
      }) : [...nextMessages, answer]
      saveConversation({ ...conversation, title: conversation.title === '新对话' ? text.slice(0, 28) : conversation.title, messages: finalMessages, updatedAt: Date.now() })
      if (result.proposals.length) {
        if (config.permissionMode === 'auto') {
          result.proposals.forEach((proposal) => { if (proposal.action === 'create') onCreateFile(proposal.path, proposal.content); else onApplyChange(proposal.path, proposal.content) })
          setNotice(`已按自动执行许可暂存 ${result.proposals.length} 个文件修改。`)
        } else { setProposals((current) => [...result.proposals, ...current]); setNotice(`已生成 ${result.proposals.length} 个待审核文件修改。`) }
      }
      if (result.commitRequested) {
        if (config.permissionMode === 'auto') { setBusy('commit'); await onCommit(); setNotice('已按自动执行许可提交 Git 修改。') } else setCommitRequested(true)
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : '模型请求失败') } finally { setBusy(null); setThinkingStartedAt(null) }
  }

  const selectAnswerVersion = (messageIndex: number, versionIndex: number) => {
    const messages = conversation.messages.map((message, index) => index === messageIndex ? { ...message, activeAnswerVersion: versionIndex } : message)
    // eslint-disable-next-line react-hooks/purity -- version switching updates history timing on click.
    saveConversation({ ...conversation, messages, updatedAt: Date.now() })
  }
  const beginQuestionEdit = (index: number, text: string) => { setEditingQuestion(index); setEditedQuestion(text); setError('') }

  return <div className="agent-workspace" style={{ '--agent-font-size': `${fontSize}px`, '--agent-font-family': fontFamily, '--agent-font-weight': fontWeight } as CSSProperties}>
    <header className="agent-toolbar"><div className="agent-mode-tabs" role="tablist"><button type="button" className={mode === 'chat' ? 'active' : ''} onClick={() => setMode('chat')}>Chat</button><button type="button" className={mode === 'edit' ? 'active' : ''} onClick={() => setMode('edit')}>Edit</button></div><span>{providerDefinition(config.provider).label} · {config.model || '未选择模型'}</span><button ref={historyButtonRef} type="button" className="agent-settings-button" onClick={() => setHistoryOpen((value) => !value)} title="对话历史"><AgentGlyph name="history" /></button><button type="button" className="agent-settings-button" onClick={() => setSettingsOpen((value) => !value)} title="AI 配置"><AgentGlyph name="settings" /></button></header>
    {settingsOpen && <section className="agent-settings" aria-label="AI 服务配置">
      <header><div><strong>AI 服务配置</strong><small>配置 AI Agent 的聊天与笔记编辑能力</small></div><button type="button" onClick={() => setSettingsOpen(false)} aria-label="关闭配置"><AgentGlyph name="close" /></button></header>
      <label className="agent-field agent-provider-field"><span>AI 服务商</span><select value={config.provider} onChange={(event) => chooseProvider(event.target.value as AgentProviderId)}>{providerDefinitions.map((provider) => <option key={provider.id} value={provider.id}>{provider.label}</option>)}</select></label>
      <div className="agent-field-grid"><label className="agent-field"><span>API 密钥</span><input type="password" autoComplete="off" value={config.apiKey} onChange={(event) => setConfig((current) => ({ ...current, apiKey: event.target.value }))} placeholder={config.provider === 'ollama' ? '本地 Ollama 通常不需要密钥' : '输入 API Key'} /></label><label className="agent-field"><span>Base URL</span><input value={config.baseUrl} onChange={(event) => setConfig((current) => ({ ...current, baseUrl: event.target.value }))} placeholder="https://api.example.com/v1" /></label></div>
      <label className="agent-field"><span>模型名称</span><div className="agent-model-input"><select value={config.model} onChange={(event) => setConfig((current) => ({ ...current, model: event.target.value }))}>{!models.includes(config.model) && <option value={config.model}>{config.model || '请选择模型'}</option>}{models.map((model) => <option key={model} value={model}>{model}</option>)}</select><button type="button" onClick={() => void getModels()} disabled={busy !== null}><AgentGlyph name="refresh" />{busy === 'models' ? '获取中…' : '获取模型列表'}</button></div></label>
      <div className="agent-settings-actions"><button type="button" className="agent-test-button" onClick={() => void testConnection()} disabled={busy !== null}><AgentGlyph name="check" />{busy === 'test' ? '测试中…' : '测试连接'}</button><button type="button" className="agent-save-button" onClick={() => void saveConfig()} disabled={busy !== null}>{busy === 'save' ? '保存中…' : '保存到本地'}</button></div>
      <div className="agent-advanced"><button type="button" onClick={() => setAdvancedOpen((value) => !value)}><strong>高级设置</strong><span>{advancedOpen ? '隐藏' : '展开'}</span></button>{advancedOpen && <div className="agent-field-grid"><label className="agent-field"><span>最大 Token 数</span><input type="number" min="128" max="32000" value={config.maxTokens} onChange={(event) => setConfig((current) => ({ ...current, maxTokens: Number(event.target.value) || 128 }))} /></label><label className="agent-field"><span>Temperature（随机性）</span><input type="number" min="0" max="2" step="0.1" value={config.temperature} onChange={(event) => setConfig((current) => ({ ...current, temperature: Number(event.target.value) || 0 }))} /></label></div>}</div>
      <p className="agent-local-note">密钥仅保存在当前浏览器本地；请求会直接发送到所选 AI 服务商。</p>
    </section>}
    {notice && <div className="agent-notice"><AgentGlyph name="check" />{notice}</div>}
    {error && <div className="agent-error"><span>{error}</span>{lastRequest && <button type="button" onClick={() => void send(lastRequest)}><AgentGlyph name="refresh" />重试</button>}</div>}
    {historyOpen && <section className="agent-history" ref={historyRef}><header><strong>对话历史</strong><button type="button" onClick={startConversation}><AgentGlyph name="plus" />新对话</button></header>{conversations.map((item) => <div className={item.id === conversation.id ? 'active' : ''} key={item.id}><button type="button" onClick={() => { setConversation(item); setProposals([]); setCommitRequested(false); setHistoryOpen(false) }}><strong>{item.title}</strong><small>{new Date(item.updatedAt).toLocaleString('zh-CN')}</small></button><button type="button" onClick={() => exportConversation(item)} title="导出 Markdown"><AgentGlyph name="download" /></button></div>)}</section>}
    <div className="agent-conversation">{conversation.messages.map((message, index) => <ConversationMessage key={`${message.role}:${index}`} message={message} editing={editingQuestion === index} editText={editedQuestion} onEdit={() => beginQuestionEdit(index, message.content)} onEditText={setEditedQuestion} onCancelEdit={() => setEditingQuestion(null)} onSubmitEdit={() => void send({ text: editedQuestion, userIndex: index })} onRegenerate={() => { const question = conversation.messages[index - 1]; if (question?.role === 'user') void send({ text: question.content, userIndex: index - 1 }) }} onSelectVersion={(version) => selectAnswerVersion(index, version)} />)}{busy === 'send' && <div className="agent-message assistant"><i><AgentGlyph name="bot" /></i><div><details className="agent-reasoning" open={!answerStarted}><summary><AgentGlyph name="brain" />{answerStarted ? `已思考（用时 ${thinkingSeconds}s）` : `思考中（${thinkingSeconds}s）`}</summary>{streamingReasoning && <span>{streamingReasoning}</span>}</details>{answerStarted && <AgentMarkdown streaming>{streamingReply}</AgentMarkdown>}</div></div>}</div>
    {(proposals.length > 0 || commitRequested) && <section className="agent-proposals"><header><strong>待审核操作</strong><span>{proposals.length + (commitRequested ? 1 : 0)} 项</span></header>{proposals.map((proposal) => {
      const file = files.find((item) => item.path === proposal.path)
      if (!file && proposal.action !== 'create') return null
      return <ProposalDiff key={proposal.id} proposal={proposal} file={file} onAccept={() => { if (proposal.action === 'create') onCreateFile(proposal.path, proposal.content); else onApplyChange(proposal.path, proposal.content); setProposals((current) => current.filter((item) => item.id !== proposal.id)) }} onReject={() => setProposals((current) => current.filter((item) => item.id !== proposal.id))} />
    })}{commitRequested && <article className="agent-proposal agent-git-proposal"><header><div><strong><AgentGlyph name="git" />提交 Git 仓库</strong><small>AI 请求将当前已暂存的修改提交并推送到 GitHub。</small></div></header><footer><button type="button" className="agent-apply-button" disabled={busy !== null} onClick={() => { setBusy('commit'); void onCommit().then(() => { setCommitRequested(false); setNotice('已提交 Git 修改。') }).catch((reason) => setError(reason instanceof Error ? reason.message : 'Git 提交失败')).finally(() => setBusy(null)) }}><AgentGlyph name="check" />确认提交</button><button type="button" onClick={() => setCommitRequested(false)}>取消</button></footer></article>}</section>}
    <footer className="agent-composer"><textarea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send() } }} placeholder={mode === 'edit' ? '描述要修改或新建的笔记。AI 会先给出可审核的方案。' : '询问笔记内容，Enter 发送…'} /><div className="agent-composer-tools">{mode === 'edit' && <div className="agent-option-wrap"><button type="button" className="agent-option-trigger" onClick={() => setScopeOpen((value) => !value)}><AgentGlyph name={scope === 'current' ? 'file' : 'folder'} />{scope === 'current' ? '当前文件' : '仓库笔记'}<AgentGlyph name="chevron" /></button>{scopeOpen && <div className="agent-option-popover scope-popover"><header><strong>编辑范围</strong></header><button type="button" className={scope === 'current' ? 'selected' : ''} disabled={!activePath} onClick={() => { setScope('current'); setScopeOpen(false) }}><AgentGlyph name="file" /><span><strong>当前文件</strong><small>{activePath || '请先从仓库中打开一个文件'}</small></span><i>✓</i></button><button type="button" className={scope === 'cached' ? 'selected' : ''} onClick={() => { setScope('cached'); setScopeOpen(false) }}><AgentGlyph name="folder" /><span><strong>仓库笔记</strong><small>已缓存 {files.length}/{remoteFileCount} 个 Markdown 文件</small></span><i>✓</i></button>{files.length < remoteFileCount && <button type="button" className="scope-load-button" onClick={() => void onLoadAllFiles()} disabled={loadingFiles}>{loadingFiles ? '正在读取全部笔记…' : '读取全部笔记'}</button>}</div>}</div>}<div className="agent-option-wrap"><button type="button" className={`agent-option-trigger ${config.reasoningEnabled ? 'active' : ''}`} onClick={() => setReasoningOpen((value) => !value)}><AgentGlyph name="brain" />思考{config.reasoningEnabled ? ` · ${{ low: '低', medium: '中', high: '高', xhigh: '极高', max: '最高' }[config.reasoningEffort]}` : ' · 关'}<AgentGlyph name="chevron" /></button>{reasoningOpen && <div className="agent-option-popover reasoning-popover"><header><strong>思考</strong></header><div className="agent-effort"><span>思考强度</span>{(['low', 'medium', 'high', 'xhigh', 'max'] as const).map((effort) => <button type="button" className={config.reasoningEffort === effort ? 'active' : ''} key={effort} onClick={() => setConfig((current) => ({ ...current, reasoningEffort: effort, reasoningEnabled: true }))}>{{ low: '低', medium: '中', high: '高', xhigh: '极高', max: '最高' }[effort]}</button>)}</div><p>让支持推理的模型返回可展开的思考过程。</p><button type="button" className={`reasoning-toggle ${config.reasoningEnabled ? 'on' : ''}`} onClick={() => setConfig((current) => ({ ...current, reasoningEnabled: !current.reasoningEnabled }))}><AgentGlyph name="brain" />{config.reasoningEnabled ? '关闭思考' : '开启思考'}</button></div>}</div>{mode === 'edit' && <div className="agent-option-wrap"><button type="button" className={`agent-option-trigger ${config.permissionMode === 'auto' ? 'auto' : ''}`} onClick={() => setPermissionOpen((value) => !value)}><AgentGlyph name={config.permissionMode === 'auto' ? 'alert' : 'shield'} />{config.permissionMode === 'auto' ? '自动执行' : '每次确认'}<AgentGlyph name="chevron" /></button>{permissionOpen && <div className="agent-option-popover permission-popover"><header><strong>操作许可</strong></header><button type="button" className={config.permissionMode === 'confirm' ? 'selected' : ''} onClick={() => { setConfig((current) => ({ ...current, permissionMode: 'confirm' })); setPermissionOpen(false) }}><AgentGlyph name="shield" /><span><strong>请求批准</strong><small>修改、新建或提交 Git 前逐项确认。</small></span><i>✓</i></button><button type="button" className={config.permissionMode === 'auto' ? 'selected auto' : ''} onClick={() => { setConfig((current) => ({ ...current, permissionMode: 'auto' })); setPermissionOpen(false) }}><AgentGlyph name="alert" /><span><strong>自动执行</strong><small>收到方案后直接暂存修改与提交请求。</small></span><i>✓</i></button></div>}</div>}<button type="button" className="agent-send-button" onClick={() => void send()} disabled={!input.trim() || busy !== null}><AgentGlyph name="send" />发送</button></div></footer>
  </div>
}
