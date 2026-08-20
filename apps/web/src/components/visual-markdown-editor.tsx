import { useEffect, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from 'react'
import { Editor, defaultValueCtx, editorViewCtx, parserCtx, rootCtx, serializerCtx } from '@milkdown/kit/core'
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener'
import { commonmark } from '@milkdown/kit/preset/commonmark'
import { gfm } from '@milkdown/kit/preset/gfm'
import { Milkdown, MilkdownProvider, useEditor, useInstance } from '@milkdown/react'
import { useI18n } from '../i18n-hook'

export interface VisualMarkdownEditorProps {
  value: string
  onChange: (value: string) => void
  dark: boolean
  fontSize: number
  fontFamily: string
  fontWeight: number
  onSelectionContextMenu?: (selection: VisualMarkdownSelection) => void
  onOpenLink?: (href: string) => void
}

export interface VisualMarkdownSelection {
  source: 'visual'
  x: number
  y: number
  text: string
  range: Range
  anchor?: HTMLAnchorElement
  replace: (text: string) => void
  removeLink: () => void
  setLink: (href: string) => void
  allowNative: () => void
}

interface MarkdownParts {
  frontmatter: string
  body: string
}

interface ActiveHeading {
  level: number
  text: string
  position: number
  top: number
  left: number
}

function splitMarkdown(source: string): MarkdownParts {
  const match = source.match(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/)
  if (!match) return { frontmatter: '', body: source }
  return { frontmatter: match[0], body: source.slice(match[0].length) }
}

function joinMarkdown(frontmatter: string, body: string) {
  return frontmatter ? `${frontmatter}${body}` : body
}

function VisualMarkdownEditorInner({ value, onChange, dark, fontSize, fontFamily, fontWeight, onSelectionContextMenu, onOpenLink }: VisualMarkdownEditorProps) {
  const { t } = useI18n()
  const [initialParts] = useState(() => splitMarkdown(value))
  const [activeHeading, setActiveHeading] = useState<ActiveHeading | null>(null)
  const [blockMenuOpen, setBlockMenuOpen] = useState(false)
  const [conversionMenuOpen, setConversionMenuOpen] = useState(false)
  const latestValueRef = useRef(value)
  const latestPartsRef = useRef(initialParts)
  const bodyRef = useRef(initialParts.body)
  const frontmatterRef = useRef<HTMLTextAreaElement | null>(null)
  const onChangeRef = useRef(onChange)
  const onSelectionContextMenuRef = useRef(onSelectionContextMenu)
  const nativeContextMenuOnceRef = useRef(false)
  const [loading, getInstance] = useInstance()

  useEffect(() => {
    const parts = splitMarkdown(value)
    latestValueRef.current = value
    latestPartsRef.current = parts
    bodyRef.current = parts.body
  }, [value])

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    onSelectionContextMenuRef.current = onSelectionContextMenu
  }, [onSelectionContextMenu])

  useEffect(() => {
    const textarea = frontmatterRef.current
    if (!textarea) return
    textarea.style.height = 'auto'
    textarea.style.height = `${Math.max(104, textarea.scrollHeight)}px`
  }, [value])

  useEditor((root) => Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, root)
      ctx.set(defaultValueCtx, initialParts.body)
      ctx.get(listenerCtx).markdownUpdated((_, markdown) => {
        bodyRef.current = markdown
        const nextValue = joinMarkdown(latestPartsRef.current.frontmatter, markdown)
        if (nextValue !== latestValueRef.current) onChangeRef.current(nextValue)
      })
    })
    .use(commonmark)
    .use(gfm)
    .use(listener), [])

  useEffect(() => {
    const parts = splitMarkdown(value)
    latestValueRef.current = value
    latestPartsRef.current = parts
    bodyRef.current = parts.body

    const editor = getInstance()
    if (!editor) return

    const currentBody = editor.action((ctx) => {
      const view = ctx.get(editorViewCtx)
      return ctx.get(serializerCtx)(view.state.doc)
    })
    if (currentBody === parts.body) return

    editor.action((ctx) => {
      const view = ctx.get(editorViewCtx)
      const nextDoc = ctx.get(parserCtx)(parts.body)
      view.dispatch(view.state.tr.replaceWith(0, view.state.doc.content.size, nextDoc.content))
    })
  }, [getInstance, loading, value])

  const handleFrontmatterChange = (nextFrontmatter: string) => {
    latestPartsRef.current = { frontmatter: nextFrontmatter, body: bodyRef.current }
    const nextValue = joinMarkdown(nextFrontmatter, bodyRef.current)
    latestValueRef.current = nextValue
    onChangeRef.current(nextValue)
  }

  const handleContentClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    const element = event.target instanceof Element ? event.target : null
    if (element?.closest('.visual-block-actions')) return
    const anchor = element?.closest<HTMLAnchorElement>('a[href]')
    if (anchor && onOpenLink) {
      const href = anchor.getAttribute('href') || ''
      if (href) {
        event.preventDefault()
        event.stopPropagation()
        onOpenLink(href)
        return
      }
    }

    const heading = element?.closest<HTMLHeadingElement>('h1, h2, h3, h4, h5, h6')
    if (heading) {
      const level = Number(heading.tagName.slice(1))
      const editor = getInstance()
      const position = editor?.action((ctx) => {
        const view = ctx.get(editorViewCtx)
        let targetPosition = -1
        view.state.doc.descendants((node, nodePosition) => {
          if (node.type.name === 'heading' && view.nodeDOM(nodePosition) === heading) targetPosition = nodePosition
        })
        return targetPosition
      }) ?? -1
      const contentRect = event.currentTarget.getBoundingClientRect()
      const headingRect = heading.getBoundingClientRect()
      setActiveHeading({
        level,
        text: heading.textContent?.replace(/\s+/g, ' ').trim() || '',
        position,
        top: Math.max(0, headingRect.top - contentRect.top - 2),
        left: Math.max(-22, headingRect.left - contentRect.left - 68),
      })
      setBlockMenuOpen(false)
      setConversionMenuOpen(false)
      return
    }
    setActiveHeading(null)
    setBlockMenuOpen(false)
    setConversionMenuOpen(false)

    const target = element?.closest<HTMLLIElement>('li[data-item-type="task"]')
    if (!target) return
    const targetRect = target.getBoundingClientRect()
    if (event.clientX > targetRect.left + 28) return

    const editor = getInstance()
    if (!editor) return
    event.preventDefault()
    editor.action((ctx) => {
      const view = ctx.get(editorViewCtx)
      let targetPosition = -1
      view.state.doc.descendants((node, position) => {
        if (node.type.name === 'list_item' && view.nodeDOM(position) === target) targetPosition = position
      })
      if (targetPosition < 0) return
      const listItem = view.state.doc.nodeAt(targetPosition)
      if (!listItem) return
      view.dispatch(view.state.tr.setNodeMarkup(targetPosition, undefined, { ...listItem.attrs, checked: !listItem.attrs.checked }))
    })
  }

  const handleContentContextMenu = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.shiftKey || nativeContextMenuOnceRef.current) {
      nativeContextMenuOnceRef.current = false
      return
    }

    const element = event.target instanceof Element ? event.target : null
    const editorRoot = element?.closest<HTMLElement>('.ProseMirror')
    if (!editorRoot) return

    const browserSelection = window.getSelection()
    let range = browserSelection && browserSelection.rangeCount ? browserSelection.getRangeAt(0).cloneRange() : null
    const targetAnchor = element?.closest<HTMLAnchorElement>('a[href]')
    if ((!range || browserSelection?.isCollapsed) && targetAnchor) {
      range = document.createRange()
      range.selectNodeContents(targetAnchor)
    }
    if (!range || !editorRoot.contains(range.commonAncestorContainer)) return

    const text = range.toString()
    if (!text.trim() && !targetAnchor) return

    const editor = getInstance()
    if (!editor) return
    const positions = editor.action((ctx) => {
      const view = ctx.get(editorViewCtx)
      try {
        const start = view.posAtDOM(range!.startContainer, range!.startOffset)
        const end = view.posAtDOM(range!.endContainer, range!.endOffset)
        return { from: Math.min(start, end), to: Math.max(start, end) }
      } catch {
        return { from: view.state.selection.from, to: view.state.selection.to }
      }
    })
    if (!positions) return

    const replace = (insert: string) => {
      editor.action((ctx) => {
        const view = ctx.get(editorViewCtx)
        const { from, to } = positions
        view.dispatch(view.state.tr.insertText(insert, from, to).scrollIntoView())
        view.focus()
      })
    }
    const removeLink = () => {
      editor.action((ctx) => {
        const view = ctx.get(editorViewCtx)
        const { from, to } = positions
        const linkMark = view.state.schema.marks.link
        if (!linkMark) return
        view.dispatch(view.state.tr.removeMark(from, to, linkMark).scrollIntoView())
        view.focus()
      })
    }
    const setLink = (href: string) => {
      editor.action((ctx) => {
        const view = ctx.get(editorViewCtx)
        const { from, to } = positions
        const linkMark = view.state.schema.marks.link
        if (!linkMark || from === to) return
        view.dispatch(view.state.tr.addMark(from, to, linkMark.create({ href })).scrollIntoView())
        view.focus()
      })
    }

    event.preventDefault()
    event.stopPropagation()
    const rangeAnchor = (range.commonAncestorContainer instanceof Element ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement)?.closest<HTMLAnchorElement>('a[href]')
    onSelectionContextMenuRef.current?.({
      source: 'visual',
      x: event.clientX,
      y: event.clientY,
      text,
      range,
      anchor: targetAnchor || rangeAnchor || undefined,
      replace,
      removeLink,
      setLink,
      allowNative: () => { nativeContextMenuOnceRef.current = true },
    })
  }

  const runBlockAction = (action: 'duplicate' | 'paragraph' | 'delete' | number) => {
    const active = activeHeading
    const editor = getInstance()
    if (!active || active.position < 0 || !editor) return
    editor.action((ctx) => {
      const view = ctx.get(editorViewCtx)
      const node = view.state.doc.nodeAt(active.position)
      if (!node) return
      if (action === 'duplicate') {
        view.dispatch(view.state.tr.insert(active.position + node.nodeSize, node.copy(node.content)).scrollIntoView())
        return
      }
      if (action === 'paragraph') {
        const paragraph = view.state.schema.nodes.paragraph?.create()
        if (paragraph) view.dispatch(view.state.tr.insert(active.position + node.nodeSize, paragraph).scrollIntoView())
        return
      }
      if (action === 'delete') {
        view.dispatch(view.state.tr.delete(active.position, active.position + node.nodeSize).scrollIntoView())
        return
      }
      if (action === 0) {
        const paragraph = view.state.schema.nodes.paragraph
        if (paragraph) view.dispatch(view.state.tr.setNodeMarkup(active.position, paragraph).scrollIntoView())
        return
      }
      const heading = view.state.schema.nodes.heading || node.type
      view.dispatch(view.state.tr.setNodeMarkup(active.position, heading, { ...node.attrs, level: action }).scrollIntoView())
    })
    if (action === 'delete' || action === 0) setActiveHeading(null)
    else if (typeof action === 'number') setActiveHeading((current) => current ? { ...current, level: action } : current)
    setConversionMenuOpen(false)
    if (action === 'delete') setBlockMenuOpen(false)
  }

  const editorStyle = {
    '--visual-editor-font-size': `${fontSize}px`,
    '--visual-editor-font-family': fontFamily,
    '--visual-editor-font-weight': fontWeight,
  } as CSSProperties
  const currentParts = splitMarkdown(value)
  const blockOptions = [
    { level: 0, label: t('段落') },
    { level: 1, label: t('标题 1') },
    { level: 2, label: t('标题 2') },
    { level: 3, label: t('标题 3') },
    { level: 4, label: t('标题 4') },
    { level: 5, label: t('标题 5') },
    { level: 6, label: t('标题 6') },
  ]

  return <div className={`visual-markdown-editor ${dark ? 'dark' : ''}`} style={editorStyle}>
      <div className="visual-markdown-scroll">
      <div className="visual-markdown-surface">
        {currentParts.frontmatter && <section className="visual-frontmatter">
          <div className="visual-frontmatter-header">
            <span>{t('文档元数据')}</span>
          </div>
          <textarea ref={frontmatterRef} aria-label={t('YAML 文档元数据')} value={currentParts.frontmatter} onChange={(event) => handleFrontmatterChange(event.target.value)} spellCheck={false} />
        </section>}
        <div className="visual-markdown-content" aria-label={t('视觉 Markdown 编辑器')} onClick={handleContentClick} onContextMenu={handleContentContextMenu}>
          {activeHeading && <div className={`visual-block-actions${blockMenuOpen ? ' expanded' : ''}`} style={{ top: activeHeading.top, left: activeHeading.left }} onPointerDown={(event) => event.stopPropagation()}>
            <button type="button" className="visual-block-type-trigger" aria-label={t('标题类型')} aria-expanded={blockMenuOpen} onClick={() => { setBlockMenuOpen((open) => !open); setConversionMenuOpen(false) }}>{`H${activeHeading.level}`}</button>
            {blockMenuOpen && <>
              <div className="visual-block-menu" role="menu">
              <button type="button" role="menuitem" onClick={() => runBlockAction('duplicate')}><span>▣</span>{t('创建副本')}</button>
              <button type="button" role="menuitem" onClick={() => setConversionMenuOpen((open) => !open)}><span>¶</span>{t('转换为')}<b>›</b></button>
              <button type="button" role="menuitem" onClick={() => runBlockAction('paragraph')}><span>¶</span>{t('新段落')}</button>
              <button type="button" role="menuitem" className="danger" onClick={() => runBlockAction('delete')}><span>♜</span>{t('删除')}</button>
              {conversionMenuOpen && <div className="visual-block-conversion-menu" role="menu">
                {blockOptions.map((option) => <button type="button" role="menuitem" className={option.level === activeHeading.level ? 'active' : ''} key={option.level} onClick={() => runBlockAction(option.level)}><span>{option.level === 0 ? '¶' : `H${option.level}`}</span><em>{option.label}</em><kbd>{option.level === 0 ? '' : `Ctrl+${option.level}`}</kbd></button>)}
              </div>}
              </div>
            </>}
          </div>}
          <Milkdown />
        </div>
        {loading && <div className="visual-markdown-loading">{t('正在加载视觉编辑器…')}</div>}
      </div>
    </div>
  </div>
}

export default function VisualMarkdownEditor(props: VisualMarkdownEditorProps) {
  return <MilkdownProvider><VisualMarkdownEditorInner {...props} /></MilkdownProvider>
}
