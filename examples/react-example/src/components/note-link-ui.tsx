import { useEffect, useMemo, useRef, useState } from 'react'
import type { RepositoryHeading, RepositoryNoteIndex } from './repository-links'

export interface LinkTarget {
  path: string
  heading?: RepositoryHeading
}

interface SelectionActionMenuProps {
  x: number
  y: number
  text: string
  hasLink: boolean
  onCopy: () => void
  onCut: () => void
  onPaste: () => void
  onLink: () => void
  onRemoveLink: () => void
  onNativeMenu: () => void
}

export function SelectionActionMenu(props: SelectionActionMenuProps) {
  const menuRef = useRef<HTMLDivElement | null>(null)
  const left = Math.min(props.x, Math.max(8, window.innerWidth - 252))
  const top = Math.min(props.y, Math.max(8, window.innerHeight - (props.hasLink ? 300 : 260)))
  useEffect(() => { menuRef.current?.querySelector<HTMLButtonElement>('button')?.focus() }, [])
  return <div ref={menuRef} className="selection-action-menu" role="menu" aria-label="所选文字操作" style={{ left, top }} onPointerDown={(event) => event.stopPropagation()}>
    <div className="selection-action-summary" title={props.text}>{props.text}</div>
    <button role="menuitem" onClick={props.onCopy}><span>复制</span><kbd>Ctrl C</kbd></button>
    <button role="menuitem" onClick={props.onCut}><span>剪切</span><kbd>Ctrl X</kbd></button>
    <button role="menuitem" onClick={props.onPaste}><span>粘贴</span><kbd>Ctrl V</kbd></button>
    <hr />
    <button role="menuitem" className="link-action" onClick={props.onLink}><span>{props.hasLink ? '更改笔记链接…' : '链接到笔记…'}</span><kbd>⌘ K</kbd></button>
    {props.hasLink && <button role="menuitem" onClick={props.onRemoveLink}><span>移除链接</span></button>}
    <hr />
    <button role="menuitem" className="native-menu-action" onClick={props.onNativeMenu}><span>更多浏览器选项</span><kbd>再次右键</kbd></button>
  </div>
}

interface RepositoryLinkPickerProps {
  selectionText: string
  paths: string[]
  indexes: RepositoryNoteIndex[]
  onChoose: (target: LinkTarget) => void
  onCreate: (path: string) => Promise<boolean>
  onClose: () => void
}

export function RepositoryLinkPicker({ selectionText, paths, indexes, onChoose, onCreate, onClose }: RepositoryLinkPickerProps) {
  const [query, setQuery] = useState('')
  const [newPath, setNewPath] = useState('')
  const [creating, setCreating] = useState(false)
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const indexByPath = useMemo(() => new Map(indexes.map((index) => [index.path, index])), [indexes])
  const results = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase()
    return paths.flatMap((path) => {
      const fileMatch = !normalized || path.toLocaleLowerCase().includes(normalized)
      const headings = indexByPath.get(path)?.headings.filter((heading) => !normalized || heading.text.toLocaleLowerCase().includes(normalized)) || []
      return [...(fileMatch ? [{ path } as LinkTarget] : []), ...headings.map((heading) => ({ path, heading }))]
    }).slice(0, 100)
  }, [indexByPath, paths, query])
  useEffect(() => {
    dialogRef.current?.querySelector<HTMLInputElement>('.link-picker-search')?.focus()
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose])
  const create = async () => {
    let path = newPath.trim().replace(/^\/+/, '')
    if (!path) return
    if (!/\.md(?:own)?$/i.test(path)) path += '.md'
    setCreating(true)
    const created = await onCreate(path)
    setCreating(false)
    if (created) onChoose({ path })
  }
  return <div className="link-picker-backdrop" onMouseDown={onClose}>
    <div ref={dialogRef} className="link-picker-dialog" role="dialog" aria-modal="true" aria-labelledby="link-picker-title" onMouseDown={(event) => event.stopPropagation()}>
      <header><div><strong id="link-picker-title">链接到仓库笔记</strong><small>选择文件或精确到标题</small></div><button onClick={onClose} aria-label="关闭链接选择器">×</button></header>
      <div className="link-picker-selection" title={selectionText}>为“{selectionText}”添加链接</div>
      <input className="link-picker-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索文件或标题…" aria-label="搜索仓库笔记" />
      <div className="link-picker-results" role="listbox" aria-label="链接目标">
        {results.length ? results.map((target) => <button key={`${target.path}#${target.heading?.slug || ''}`} role="option" onClick={() => onChoose(target)}>
          <span className={target.heading ? 'heading-target' : 'file-target'}>{target.heading ? `H${target.heading.level}` : 'MD'}</span>
          <span><strong>{target.heading?.text || target.path.split('/').pop()}</strong><small>{target.heading ? target.path : target.path.includes('/') ? target.path.slice(0, target.path.lastIndexOf('/')) : '仓库根目录'}</small></span>
        </button>) : <div className="link-picker-empty">没有匹配的文件或标题</div>}
      </div>
      <footer><label><span>新建笔记并链接</span><span><input value={newPath} onChange={(event) => setNewPath(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void create() }} placeholder="例如 doc/新笔记.md" /><button disabled={!newPath.trim() || creating} onClick={() => void create()}>{creating ? '创建中…' : '创建'}</button></span></label></footer>
    </div>
  </div>
}

export interface BacklinkEntry {
  sourcePath: string
  line: number
  label: string
}

export interface OutgoingLinkEntry {
  label: string
  href: string
  line: number
  targetPath?: string
  broken?: boolean
  reason?: string
}

interface NoteLinksPanelProps {
  activePath: string
  backlinks: BacklinkEntry[]
  outgoing: OutgoingLinkEntry[]
  indexedCount: number
  totalCount: number
  loading: boolean
  onOpenBacklink: (entry: BacklinkEntry) => void
  onOpenOutgoing: (entry: OutgoingLinkEntry) => void
  onIndexAll: () => void
  onClose?: () => void
  embedded?: boolean
}

export function NoteLinksPanel(props: NoteLinksPanelProps) {
  return <aside className={`note-links-panel ${props.embedded ? 'embedded' : ''}`} aria-label="笔记链接">
    {!props.embedded && <header><div><strong>笔记链接</strong><small title={props.activePath}>{props.activePath}</small></div><button onClick={props.onClose} aria-label="关闭笔记链接">×</button></header>}
    {props.embedded && <div className="note-links-active-path" title={props.activePath}>{props.activePath}</div>}
    <div className="note-links-coverage"><span>已索引 {props.indexedCount} / {props.totalCount} 篇笔记</span>{props.indexedCount < props.totalCount && <button disabled={props.loading} onClick={props.onIndexAll}>{props.loading ? '索引中…' : '索引全部'}</button>}</div>
    <section><h3>反向链接 <b>{props.backlinks.length}</b></h3>{props.backlinks.length ? props.backlinks.map((entry, index) => <button key={`${entry.sourcePath}:${entry.line}:${index}`} onClick={() => props.onOpenBacklink(entry)}><span><strong>{entry.sourcePath}</strong><small>第 {entry.line} 行 · {entry.label}</small></span><em>↗</em></button>) : <p>还没有其他笔记链接到这里。</p>}</section>
    <section><h3>出站链接 <b>{props.outgoing.length}</b></h3>{props.outgoing.length ? props.outgoing.map((entry, index) => <button className={entry.broken ? 'broken' : ''} key={`${entry.href}:${entry.line}:${index}`} onClick={() => props.onOpenOutgoing(entry)}><span><strong>{entry.label}</strong><small>{entry.broken ? entry.reason : entry.href}</small></span><em>{entry.broken ? '!' : '↗'}</em></button>) : <p>这篇笔记还没有仓库内链接。</p>}</section>
  </aside>
}
