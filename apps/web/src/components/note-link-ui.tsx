import { useEffect, useMemo, useRef, useState } from 'react'
import { useI18n } from '../i18n-hook'
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
  showNativeMenu: boolean
  shortcutModifier: string
}

export function SelectionActionMenu(props: SelectionActionMenuProps) {
  const { t } = useI18n()
  const menuRef = useRef<HTMLDivElement | null>(null)
  const left = Math.min(props.x, Math.max(8, window.innerWidth - 252))
  const top = Math.min(props.y, Math.max(8, window.innerHeight - (props.hasLink ? 300 : 260)))
  useEffect(() => { menuRef.current?.querySelector<HTMLButtonElement>('button')?.focus() }, [])
  return <div ref={menuRef} className="selection-action-menu" role="menu" aria-label={t('所选文字操作')} style={{ left, top }} onPointerDown={(event) => event.stopPropagation()}>
    <div className="selection-action-summary" title={props.text}>{props.text}</div>
    <button role="menuitem" onClick={props.onCopy}><span>{t('复制')}</span><kbd>{props.shortcutModifier} C</kbd></button>
    <button role="menuitem" onClick={props.onCut}><span>{t('剪切')}</span><kbd>{props.shortcutModifier} X</kbd></button>
    <button role="menuitem" onClick={props.onPaste}><span>{t('粘贴')}</span><kbd>{props.shortcutModifier} V</kbd></button>
    <hr />
    <button role="menuitem" className="link-action" onClick={props.onLink}><span>{props.hasLink ? t('更改笔记链接…') : t('链接到笔记…')}</span><kbd>{props.shortcutModifier} K</kbd></button>
    {props.hasLink && <button role="menuitem" onClick={props.onRemoveLink}><span>{t('移除链接')}</span></button>}
    {props.showNativeMenu && <><hr /><button role="menuitem" className="native-menu-action" onClick={props.onNativeMenu}><span>{t('更多浏览器选项')}</span><kbd>{t('再次右键')}</kbd></button></>}
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

type LinkTreeRow =
  | { type: 'folder'; path: string; name: string; depth: number }
  | { type: 'file'; path: string; name: string; depth: number; headings: RepositoryHeading[] }
  | { type: 'heading'; path: string; name: string; depth: number; heading: RepositoryHeading }

function pathName(path: string) {
  return path.slice(path.lastIndexOf('/') + 1)
}

function pathParent(path: string) {
  const index = path.lastIndexOf('/')
  return index < 0 ? '' : path.slice(0, index)
}

function pathFolders(path: string) {
  const parts = path.split('/').slice(0, -1)
  return parts.map((_, index) => parts.slice(0, index + 1).join('/'))
}

function TreeChevron({ expanded }: { expanded: boolean }) {
  return <svg className={`link-tree-chevron ${expanded ? 'expanded' : ''}`} viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3.5 4.5 4.5L6 12.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
}

function FolderGlyph() {
  return <svg className="link-tree-glyph folder" viewBox="0 0 18 18" aria-hidden="true"><path d="M2.5 5.1c0-1 .8-1.8 1.8-1.8h3l1.5 1.6h4.9c1 0 1.8.8 1.8 1.8v6c0 1-.8 1.8-1.8 1.8H4.3c-1 0-1.8-.8-1.8-1.8V5.1Z" fill="currentColor" opacity=".22"/><path d="M2.5 6.1h13M4.3 3.3h3l1.5 1.6h4.9c1 0 1.8.8 1.8 1.8v6c0 1-.8 1.8-1.8 1.8H4.3c-1 0-1.8-.8-1.8-1.8V5.1c0-1 .8-1.8 1.8-1.8Z" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round"/></svg>
}

function FileGlyph() {
  return <svg className="link-tree-glyph file" viewBox="0 0 18 18" aria-hidden="true"><path d="M4 2.5h6.2l3.8 3.8v9.2H4z" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round"/><path d="M10.2 2.5v3.8H14M6.2 9h5.6M6.2 11.8h4.4" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round"/></svg>
}

export function RepositoryLinkPicker({ selectionText, paths, indexes, onChoose, onCreate, onClose }: RepositoryLinkPickerProps) {
  const [query, setQuery] = useState('')
  const [newPath, setNewPath] = useState('')
  const [creating, setCreating] = useState(false)
  const [collapsedFolders, setCollapsedFolders] = useState(() => new Set(paths.flatMap(pathFolders)))
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(() => new Set())
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const indexByPath = useMemo(() => new Map(indexes.map((index) => [index.path, index])), [indexes])
  const treeRows = useMemo<LinkTreeRow[]>(() => {
    const normalized = query.trim().toLocaleLowerCase()
    const matches = paths.map((path) => {
      const headings = indexByPath.get(path)?.headings || []
      const matchedHeadings = normalized ? headings.filter((heading) => heading.text.toLocaleLowerCase().includes(normalized)) : []
      return { path, headings, matchedHeadings, fileMatch: !normalized || path.toLocaleLowerCase().includes(normalized) }
    }).filter((item) => item.fileMatch || item.matchedHeadings.length)
    const visiblePaths = new Set(matches.map((item) => item.path))
    const folders = new Set(Array.from(visiblePaths).flatMap(pathFolders))
    const childFolders = new Map<string, string[]>()
    for (const folder of folders) {
      const parent = pathParent(folder)
      childFolders.set(parent, [...(childFolders.get(parent) || []), folder])
    }
    const filesByParent = new Map<string, typeof matches>()
    for (const item of matches) {
      const parent = pathParent(item.path)
      filesByParent.set(parent, [...(filesByParent.get(parent) || []), item])
    }
    const rows: LinkTreeRow[] = []
    const walk = (folder: string, depth: number) => {
      for (const child of (childFolders.get(folder) || []).sort((first, second) => first.localeCompare(second))) {
        rows.push({ type: 'folder', path: child, name: pathName(child), depth })
        if (normalized || !collapsedFolders.has(child)) walk(child, depth + 1)
      }
      for (const item of (filesByParent.get(folder) || []).sort((first, second) => first.path.localeCompare(second.path))) {
        rows.push({ type: 'file', path: item.path, name: pathName(item.path), depth, headings: item.headings })
        const headings = normalized && item.matchedHeadings.length ? item.matchedHeadings : expandedFiles.has(item.path) ? item.headings : []
        headings.forEach((heading) => rows.push({ type: 'heading', path: item.path, name: heading.text, depth: depth + 1, heading }))
      }
    }
    walk('', 0)
    return rows.slice(0, 300)
  }, [collapsedFolders, expandedFiles, indexByPath, paths, query])
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
      <header><div><strong id="link-picker-title">链接到仓库笔记</strong><small>从文件树选择，需要时再展开标题</small></div><button onClick={onClose} aria-label="关闭链接选择器">×</button></header>
      <div className="link-picker-selection" title={selectionText}>为“{selectionText}”添加链接</div>
      <input className="link-picker-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索文件，或查找标题…" aria-label="搜索仓库笔记" />
      <div className="link-picker-tree" role="tree" aria-label="仓库 Markdown 文件树">
        <div className="link-picker-tree-root"><FolderGlyph /><span>仓库根目录</span><small>{paths.length} 个 Markdown</small></div>
        {treeRows.length ? treeRows.map((row) => {
          if (row.type === 'folder') {
            const expanded = Boolean(query.trim()) || !collapsedFolders.has(row.path)
            return <button type="button" className="link-tree-row folder" role="treeitem" aria-expanded={expanded} key={`folder:${row.path}`} style={{ paddingLeft: 10 + row.depth * 18 }} onClick={() => setCollapsedFolders((current) => { const next = new Set(current); if (next.has(row.path)) next.delete(row.path); else next.add(row.path); return next })}><TreeChevron expanded={expanded} /><FolderGlyph /><span>{row.name}</span></button>
          }
          if (row.type === 'heading') return <button type="button" className="link-tree-row heading" role="treeitem" key={`${row.path}#${row.heading.slug}`} style={{ paddingLeft: 42 + row.depth * 18 + Math.max(0, row.heading.level - 1) * 8 }} onClick={() => onChoose({ path: row.path, heading: row.heading })}><span className="link-heading-level">H{row.heading.level}</span><span>{row.name}</span></button>
          const expanded = expandedFiles.has(row.path) || Boolean(query.trim() && row.headings.some((heading) => heading.text.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())))
          return <div className="link-tree-file-row" role="treeitem" aria-expanded={row.headings.length ? expanded : undefined} key={`file:${row.path}`} style={{ paddingLeft: 10 + row.depth * 18 }}>
            {row.headings.length ? <button type="button" className="link-tree-toggle" onClick={() => setExpandedFiles((current) => { const next = new Set(current); if (next.has(row.path)) next.delete(row.path); else next.add(row.path); return next })} aria-label={`${expanded ? '收起' : '展开'} ${row.name} 的标题`}><TreeChevron expanded={expanded} /></button> : <span className="link-tree-spacer" />}
            <button type="button" className="link-tree-file-target" onClick={() => onChoose({ path: row.path })}><FileGlyph /><span><strong>{row.name}</strong><small>{pathParent(row.path) || '仓库根目录'}</small></span><em>链接文件</em></button>
          </div>
        }) : <div className="link-picker-empty">没有匹配的 Markdown 文件或标题</div>}
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
