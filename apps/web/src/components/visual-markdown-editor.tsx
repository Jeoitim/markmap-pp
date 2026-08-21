import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { Editor, defaultValueCtx, editorViewCtx, parserCtx, rootCtx, serializerCtx } from '@milkdown/kit/core'
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener'
import { clipboard } from '@milkdown/kit/plugin/clipboard'
import { commonmark } from '@milkdown/kit/preset/commonmark'
import { addRowWithAlignment, gfm } from '@milkdown/kit/preset/gfm'
import { Fragment, type Node as ProseNode, type NodeType, type Schema } from '@milkdown/kit/prose/model'
import { addColumnAfter, deleteColumn, deleteRow, isInTable, selectedRect } from '@milkdown/kit/prose/tables'
import { TextSelection } from '@milkdown/kit/prose/state'
import { $nodeSchema, $remark } from '@milkdown/kit/utils'
import type { MarkdownNode, Root } from '@milkdown/kit/transformer'
import { Milkdown, MilkdownProvider, useEditor, useInstance } from '@milkdown/react'
import { useI18n } from '../i18n-hook'

export interface VisualMarkdownEditorProps {
  value: string
  onChange: (value: string) => void
  dark: boolean
  fontSize: number
  fontFamily: string
  fontWeight: number
  spellCheck: boolean
  spellCheckLanguage: string
  userDictionary: string[]
  onSelectionContextMenu?: (selection: VisualMarkdownSelection) => void
  onSelectionChange?: (selection: VisualMarkdownSelection | null) => void
  nativeSelectionMode?: boolean
  onOpenLink?: (href: string) => void
}

export interface VisualMarkdownEditorHandle {
  revealLine: (line: number, text?: string) => void
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
  toggleMark: (mark: VisualInlineMark) => void
  isMarkActive: (mark: VisualInlineMark) => boolean
  setInlineStyle: (style: VisualInlineStyle | null) => void
  isInlineStyleActive: (style: VisualInlineStyle) => boolean
  allowNative: () => void
}

export type VisualInlineMark = 'strong' | 'emphasis' | 'strikethrough' | 'inlineCode'
export type VisualInlineStyle = 'underline' | `color:${string}`

interface MarkdownParts {
  frontmatter: string
  body: string
}

type VisualBlockKind = 'heading' | 'paragraph' | 'blockquote' | 'code' | 'bullet-list' | 'ordered-list' | 'task' | 'list-item' | 'table' | 'horizontal-rule'

type BlockConversion =
  | { kind: 'heading'; level: number }
  | { kind: 'code' }
  | { kind: 'blockquote' }
  | { kind: 'bullet-list' }
  | { kind: 'ordered-list' }
  | { kind: 'task' }

interface ActiveBlock {
  kind: VisualBlockKind
  listType?: 'bullet' | 'ordered'
  level?: number
  position: number
  top: number
  left: number
  handleSize: number
}

type BlockOption = BlockConversion & {
  label: string
  icon: string
  shortcut?: string
}

type VisualBlockAction = 'duplicate' | 'delete' | 'table-add-row' | 'table-add-column' | 'table-delete-row' | 'table-delete-column' | BlockConversion

const visualBlockHandleFallbackSize = 18
const visualBlockHandleGap = 6

function splitMarkdown(source: string): MarkdownParts {
  const match = source.match(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/)
  if (!match) return { frontmatter: '', body: source }
  return { frontmatter: match[0], body: source.slice(match[0].length) }
}

function joinMarkdown(frontmatter: string, body: string) {
  return frontmatter ? `${frontmatter}${body}` : body
}

function normalizeRevealText(value: string) {
  return value
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}(?:#{1,6}|[-+*]|\d+[.)])\s+/, '')
    .replace(/[*_~`>#]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase()
}

function frontmatterLineCount(frontmatter: string) {
  return frontmatter ? Math.max(0, frontmatter.split(/\r?\n/).length - 1) : 0
}

function findVisualBlockElement(element: Element | null): HTMLElement | null {
  if (!element) return null
  const editorRoot = element.closest<HTMLElement>('.ProseMirror')
  if (!editorRoot) return null

  const table = element.closest<HTMLTableElement>('table')
  if (table && editorRoot.contains(table)) return table

  const listItem = element.closest<HTMLLIElement>('li')
  if (listItem && editorRoot.contains(listItem)) return listItem

  const blockquote = element.closest<HTMLElement>('blockquote')
  if (blockquote && editorRoot.contains(blockquote)) return blockquote

  const codeBlock = element.closest<HTMLElement>('pre')
  if (codeBlock && editorRoot.contains(codeBlock)) return codeBlock

  const block = element.closest<HTMLElement>('h1, h2, h3, h4, h5, h6, p, ul, ol, hr')
  return block && editorRoot.contains(block) ? block : null
}

function visualFirstLineRect(element: HTMLElement) {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
  let textNode = walker.nextNode()
  while (textNode) {
    if (textNode.textContent?.trim()) {
      const range = document.createRange()
      range.selectNodeContents(textNode)
      const rect = range.getClientRects()[0]
      if (rect) return rect
    }
    textNode = walker.nextNode()
  }
  return element.getBoundingClientRect()
}

function visualBlockHandleSizeFor(contentElement: HTMLElement) {
  const fontSize = Number.parseFloat(getComputedStyle(contentElement).fontSize)
  if (!Number.isFinite(fontSize) || fontSize <= 0) return visualBlockHandleFallbackSize
  // H4-H6 are the smallest heading level in the visual editor: 1em × 1.25 line-height.
  return Math.max(16, fontSize * 1.25)
}

function visualBlockHandlePosition(blockElement: HTMLElement, contentElement: HTMLElement) {
  const contentRect = contentElement.getBoundingClientRect()
  const blockRect = blockElement.getBoundingClientRect()
  const handleSize = visualBlockHandleSizeFor(contentElement)
  const listText = blockElement.matches('li')
    ? blockElement.querySelector<HTMLElement>(':scope > p, :scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6')
    : null
  const anchorRect = listText?.getBoundingClientRect() || blockRect
  const firstLineRect = visualFirstLineRect(listText || blockElement)
  let left = anchorRect.left - contentRect.left - handleSize - visualBlockHandleGap
  if (blockElement.matches('li')) {
    let listRoot = blockElement.parentElement?.closest<HTMLElement>('ul, ol') || null
    while (listRoot) {
      const parentList = listRoot.parentElement?.closest('li')?.parentElement?.closest<HTMLElement>('ul, ol') || null
      if (!parentList) break
      listRoot = parentList
    }
    const rootText = listRoot?.querySelector<HTMLElement>(':scope > li > p, :scope > li > h1, :scope > li > h2, :scope > li > h3, :scope > li > h4, :scope > li > h5, :scope > li > h6')
    const rootTextRect = rootText?.getBoundingClientRect()
    if (rootTextRect) {
      // The outer list starts in the page shoulder; nested lists inherit only their own indent.
      left = anchorRect.left - rootTextRect.left - handleSize - visualBlockHandleGap
    }
  }
  return {
    // Center the handle on the first line only. A tall paragraph should not move it to its block center.
    top: Math.max(-handleSize, firstLineRect.top - contentRect.top + (firstLineRect.height - handleSize) / 2),
    left,
    handleSize,
  }
}

function isVisualTextBlock(node: ProseNode) {
  return node.type.name === 'paragraph' || node.type.name === 'heading' || node.type.name === 'code_block'
}

function visualNodeDefaults(nodeType: NodeType) {
  const attrs = nodeType.spec.attrs
  if (!attrs) return null
  const defaults: Record<string, unknown> = {}
  for (const [name, spec] of Object.entries(attrs)) {
    if (!Object.prototype.hasOwnProperty.call(spec, 'default')) return null
    defaults[name] = (spec as { default?: unknown }).default
  }
  return defaults
}

function visualParagraphFromNode(node: ProseNode, schema: Schema) {
  const paragraph = schema.nodes.paragraph
  if (!paragraph) return null
  const source = node.type.name === 'blockquote' && node.childCount === 1 ? node.firstChild : node
  if (!source || (source.type.name !== 'paragraph' && source.type.name !== 'heading' && source.type.name !== 'code_block')) return null
  return paragraph.create(null, source.content)
}

function visualListFromNode(node: ProseNode, target: BlockConversion, schema: Schema) {
  if (target.kind !== 'bullet-list' && target.kind !== 'ordered-list' && target.kind !== 'task') return null
  const listItemType = schema.nodes.list_item
  const listType = target.kind === 'ordered-list' ? schema.nodes.ordered_list : schema.nodes.bullet_list
  const paragraph = visualParagraphFromNode(node, schema)
  if (!listItemType || !listType || !paragraph) return null
  const listTypeName = target.kind === 'ordered-list' ? 'ordered' : 'bullet'
  const itemAttrs = {
    ...(visualNodeDefaults(listItemType) || {}),
    label: listTypeName === 'ordered' ? '1' : '•',
    listType: listTypeName,
    checked: target.kind === 'task' ? false : null,
  }
  const listItem = listItemType.create(itemAttrs, paragraph)
  const listAttrs = target.kind === 'ordered-list' ? { order: 1 } : visualNodeDefaults(listType)
  return listType.create(listAttrs, Fragment.fromArray([listItem]))
}

function visualListWithKind(node: ProseNode, target: BlockConversion, schema: Schema) {
  if (node.type.name !== 'bullet_list' && node.type.name !== 'ordered_list') return null
  if (target.kind !== 'bullet-list' && target.kind !== 'ordered-list' && target.kind !== 'task') return null
  const listItemType = schema.nodes.list_item
  const listType = target.kind === 'ordered-list' ? schema.nodes.ordered_list : schema.nodes.bullet_list
  if (!listItemType || !listType) return null
  const listTypeName = target.kind === 'ordered-list' ? 'ordered' : 'bullet'
  const items: ProseNode[] = []
  node.forEach((child) => {
    if (child.type.name !== 'list_item') {
      items.push(child)
      return
    }
    items.push(listItemType.create({
      ...child.attrs,
      label: listTypeName === 'ordered' ? '1' : '•',
      listType: listTypeName,
      checked: target.kind === 'task' ? false : null,
    }, child.content))
  })
  const listAttrs = target.kind === 'ordered-list' ? { order: node.attrs.order || 1 } : visualNodeDefaults(listType)
  return listType.create(listAttrs, Fragment.fromArray(items))
}

function sanitizeVisualInlineStyle(value: string) {
  const normalized = value.trim().toLocaleLowerCase()
  if (normalized === 'underline' || normalized === 'text-decoration: underline' || normalized === 'text-decoration:underline') return 'underline'
  const color = normalized.match(/^color\s*:\s*(#[0-9a-f]{3,8}|(?:rgb|hsl)a?\([^)]*\)|[a-z]+)\s*;?$/)
  return color ? `color:${color[1]}` : ''
}

function visualInlineStyleCss(value: string) {
  const style = sanitizeVisualInlineStyle(value)
  if (style === 'underline') return 'text-decoration: underline; text-underline-offset: 2px;'
  if (style.startsWith('color:')) return style
  return ''
}

function visualHtmlAttribute(value: string) {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

const visualStyledTextSchema = $nodeSchema('visual_styled_text', () => ({
  group: 'inline',
  inline: true,
  content: 'inline*',
  attrs: {
    style: {
      default: 'underline',
      validate: 'string',
    },
  },
  parseDOM: [
    {
      tag: 'span[data-markmap-style]',
      getAttrs: (dom) => ({ style: sanitizeVisualInlineStyle(dom.getAttribute('data-markmap-style') || '') }),
    },
    {
      tag: 'u',
      getAttrs: () => ({ style: 'underline' }),
    },
  ],
  toDOM: (node) => ['span', { 'data-markmap-style': node.attrs.style, style: visualInlineStyleCss(node.attrs.style) }, 0],
  parseMarkdown: {
    match: ({ type }) => type === 'visualStyledText',
    runner: (state, node, type) => {
      state.openNode(type, { style: sanitizeVisualInlineStyle(String(node.style || '')) || 'underline' })
      state.next(node.children || [])
      state.closeNode()
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === 'visual_styled_text',
    runner: (state, node) => {
      const style = sanitizeVisualInlineStyle(node.attrs.style)
      if (!style) {
        state.next(node.content)
        return
      }
      state.addNode('html', undefined, `<span data-markmap-style="${visualHtmlAttribute(style)}">`)
      state.next(node.content)
      state.addNode('html', undefined, '</span>')
    },
  },
}))

const visualStyledTextRemark = $remark('visualStyledTextRemark', () => () => (tree: Root) => {
  const root = tree as unknown as MarkdownNode
  const convert = (nodes: MarkdownNode[]): MarkdownNode[] => {
    const result: MarkdownNode[] = []
    for (let index = 0; index < nodes.length; index += 1) {
      const current = nodes[index]
      const opening = typeof current.value === 'string' ? current.value.match(/^<span\s+data-markmap-style="([^"]+)">$/i) : null
      if (opening) {
        const closingIndex = nodes.slice(index + 1).findIndex((node) => node.type === 'html' && node.value === '</span>')
        if (closingIndex >= 0) {
          const end = index + 1 + closingIndex
          const style = sanitizeVisualInlineStyle(opening[1])
          if (style) {
            result.push({ type: 'visualStyledText', style, children: convert(nodes.slice(index + 1, end)) })
            index = end
            continue
          }
        }
      }
      if (current.children) current.children = convert(current.children)
      result.push(current)
    }
    return result
  }

  if (root.children) root.children = convert(root.children)
  return tree
})

const VisualMarkdownEditorInner = forwardRef<VisualMarkdownEditorHandle, VisualMarkdownEditorProps>(function VisualMarkdownEditorInner({ value, onChange, dark, fontSize, fontFamily, fontWeight, spellCheck, spellCheckLanguage, userDictionary, onSelectionContextMenu, onSelectionChange, nativeSelectionMode = false, onOpenLink }, ref) {
  const { t } = useI18n()
  const [initialParts] = useState(() => splitMarkdown(value))
  const [activeBlock, setActiveBlock] = useState<ActiveBlock | null>(null)
  const [blockMenuOpen, setBlockMenuOpen] = useState(false)
  const [conversionMenuOpen, setConversionMenuOpen] = useState(false)
  const latestValueRef = useRef(value)
  const latestPartsRef = useRef(initialParts)
  const bodyRef = useRef(initialParts.body)
  const frontmatterRef = useRef<HTMLTextAreaElement | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)
  const activeBlockElementRef = useRef<HTMLElement | null>(null)
  const onChangeRef = useRef(onChange)
  const onSelectionContextMenuRef = useRef(onSelectionContextMenu)
  const onSelectionChangeRef = useRef(onSelectionChange)
  const nativeContextMenuOnceRef = useRef(false)
  const nativeSelectionModeRef = useRef(nativeSelectionMode)
  const selectingPointerRef = useRef(false)
  const pendingSelectionTargetRef = useRef<VisualMarkdownSelection | null>(null)
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
    onSelectionChangeRef.current = onSelectionChange
  }, [onSelectionChange])

  useEffect(() => {
    nativeSelectionModeRef.current = nativeSelectionMode
  }, [nativeSelectionMode])

  useEffect(() => {
    const textarea = frontmatterRef.current
    if (!textarea) return
    textarea.style.height = 'auto'
    textarea.style.height = `${Math.max(104, textarea.scrollHeight)}px`
  }, [value])

  useEffect(() => {
    if (!activeBlock) return
    const content = contentRef.current
    const block = activeBlockElementRef.current
    if (!content || !block) return

    const updatePosition = () => {
      const { top, left, handleSize } = visualBlockHandlePosition(block, content)
      setActiveBlock((current) => {
        if (!current || (current.top === top && current.left === left && current.handleSize === handleSize)) return current
        return { ...current, top, left, handleSize }
      })
    }

    const scroll = content.closest('.visual-markdown-scroll')
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updatePosition)
    observer?.observe(content)
    observer?.observe(block)
    window.addEventListener('resize', updatePosition)
    scroll?.addEventListener('scroll', updatePosition, { passive: true })
    updatePosition()
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', updatePosition)
      scroll?.removeEventListener('scroll', updatePosition)
    }
  }, [activeBlock?.position])

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
    .use(visualStyledTextSchema)
    .use(visualStyledTextRemark)
    .use(clipboard)
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

  useEffect(() => {
    const editor = getInstance()
    if (!editor) return
    editor.action((ctx) => {
      const dom = ctx.get(editorViewCtx).dom
      dom.setAttribute('spellcheck', String(spellCheck))
      if (spellCheckLanguage === 'auto') dom.removeAttribute('lang')
      else dom.setAttribute('lang', spellCheckLanguage)
      dom.setAttribute('data-user-dictionary', userDictionary.join('|'))
    })
  }, [getInstance, loading, spellCheck, spellCheckLanguage, userDictionary])

  useImperativeHandle(ref, () => ({
    revealLine: (lineNumber, text) => {
      const editor = getInstance()
      if (!editor) return
      editor.action((ctx) => {
        const view = ctx.get(editorViewCtx)
        const parts = latestPartsRef.current
        const bodyLines = parts.body.split(/\r?\n/)
        const bodyLine = Math.max(1, lineNumber - frontmatterLineCount(parts.frontmatter))
        const sourceLine = bodyLines[bodyLine - 1] || ''
        const targetText = normalizeRevealText(text || sourceLine)
        const headingMatch = sourceLine.match(/^\s*(#{1,6})\s+(.+?)\s*#*\s*$/)
        let targetElement: HTMLElement | null = null

        if (headingMatch) {
          const level = headingMatch[1].length
          const headingText = normalizeRevealText(headingMatch[2])
          const occurrence = bodyLines.slice(0, bodyLine).filter((line) => {
            const match = line.match(/^\s*(#{1,6})\s+(.+?)\s*#*\s*$/)
            return match && match[1].length === level && normalizeRevealText(match[2]) === headingText
          }).length - 1
          const headings = Array.from(view.dom.querySelectorAll<HTMLHeadingElement>(`h${level}`)).filter((heading) => normalizeRevealText(heading.textContent || '') === headingText)
          targetElement = headings[Math.max(0, occurrence)] || headings[0] || null
        }

        if (!targetElement && targetText) {
          let exactTargetElement: HTMLElement | null = null
          let exactTargetLength = Number.POSITIVE_INFINITY
          let containingTarget: HTMLElement | null = null
          view.state.doc.descendants((_, position) => {
            const dom = view.nodeDOM(position)
            if (!(dom instanceof HTMLElement)) return
            const nodeText = normalizeRevealText(dom.textContent || '')
            if (!nodeText) return
            if (nodeText === targetText) {
              if (!exactTargetElement || nodeText.length <= exactTargetLength) {
                exactTargetElement = dom
                exactTargetLength = nodeText.length
              }
            } else if (!containingTarget && (nodeText.includes(targetText) || targetText.includes(nodeText))) {
              containingTarget = dom
            }
          })
          targetElement = exactTargetElement || containingTarget
        }

        if (targetElement) {
          const scroll = view.dom.closest<HTMLElement>('.visual-markdown-scroll')
          if (scroll) {
            const scrollRect = scroll.getBoundingClientRect()
            const targetRect = targetElement.getBoundingClientRect()
            const targetTop = scroll.scrollTop + targetRect.top - scrollRect.top - (scroll.clientHeight - targetRect.height) / 2
            scroll.scrollTo({ top: Math.max(0, Math.min(scroll.scrollHeight - scroll.clientHeight, targetTop)), behavior: 'smooth' })
          } else {
            targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
          }
          view.focus()
          return
        }

        const scroll = view.dom.closest<HTMLElement>('.visual-markdown-scroll')
        if (scroll) {
          const denominator = Math.max(1, bodyLines.length - 1)
          const ratio = Math.min(1, Math.max(0, (bodyLine - 1) / denominator))
          scroll.scrollTo({ top: (scroll.scrollHeight - scroll.clientHeight) * ratio, behavior: 'smooth' })
          view.focus()
        }
      })
    },
  }), [getInstance])

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

    const target = element?.closest<HTMLLIElement>('li[data-item-type="task"]')
    if (target) {
      const targetRect = target.getBoundingClientRect()
      if (event.clientX <= targetRect.left + 28) {
        const editor = getInstance()
        if (!editor) return
        activeBlockElementRef.current = null
        setActiveBlock(null)
        setBlockMenuOpen(false)
        setConversionMenuOpen(false)
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
        return
      }
    }

    const blockElement = findVisualBlockElement(element)
    if (blockElement) {
      const editor = getInstance()
      const targetBlock = editor?.action((ctx) => {
        const view = ctx.get(editorViewCtx)
        const tagName = blockElement.tagName.toLowerCase()
        const candidateNames = tagName === 'li'
          ? new Set(['list_item'])
          : tagName === 'table'
            ? new Set(['table'])
            : tagName === 'blockquote'
              ? new Set(['blockquote'])
              : tagName === 'pre'
                ? new Set(['code_block'])
                : tagName === 'ul' || tagName === 'ol'
                  ? new Set([tagName === 'ul' ? 'bullet_list' : 'ordered_list'])
                  : tagName === 'hr'
                    ? new Set(['hr'])
                    : new Set(['paragraph', 'heading'])
        let targetPosition = -1
        let targetNode: ProseNode | null = null
        let containingPosition = -1
        let containingNode: ProseNode | null = null
        view.state.doc.descendants((node, nodePosition) => {
          if (!candidateNames.has(node.type.name)) return
          const dom = view.nodeDOM(nodePosition)
          if (!(dom instanceof HTMLElement)) return
          if (dom === blockElement) {
            targetPosition = nodePosition
            targetNode = node
            return
          }
          if (containingPosition < 0 && (dom.contains(blockElement) || blockElement.contains(dom))) {
            containingPosition = nodePosition
            containingNode = node
          }
        })
        if (targetPosition < 0) {
          targetPosition = containingPosition
          targetNode = containingNode
        }
        const selectedNode = targetNode as ProseNode | null
        if (targetPosition < 0 || !selectedNode) return null

        let kind: VisualBlockKind
        let listType: 'bullet' | 'ordered' | undefined
        switch (selectedNode.type.name) {
          case 'heading':
            kind = 'heading'
            break
          case 'paragraph':
            kind = 'paragraph'
            break
          case 'blockquote':
            kind = 'blockquote'
            break
          case 'code_block':
            kind = 'code'
            break
          case 'bullet_list':
            kind = 'bullet-list'
            selectedNode.forEach((child) => {
              if (child.type.name === 'list_item' && child.attrs.checked != null) kind = 'task'
            })
            listType = 'bullet'
            break
          case 'ordered_list':
            kind = 'ordered-list'
            listType = 'ordered'
            break
          case 'list_item':
            listType = selectedNode.attrs.listType === 'ordered' ? 'ordered' : 'bullet'
            kind = selectedNode.attrs.checked != null ? 'task' : 'list-item'
            break
          case 'table':
            kind = 'table'
            break
          default:
            kind = 'horizontal-rule'
            break
        }

        const { top, left, handleSize } = visualBlockHandlePosition(blockElement, event.currentTarget)
        return {
          kind,
          listType,
          level: selectedNode.type.name === 'heading' ? Number(selectedNode.attrs.level) : undefined,
          position: targetPosition,
          top,
          left,
          handleSize,
        }
      })
      if (targetBlock) {
        activeBlockElementRef.current = blockElement
        setActiveBlock(targetBlock)
        setBlockMenuOpen(false)
        setConversionMenuOpen(false)
        return
      }
    }

    activeBlockElementRef.current = null
    setActiveBlock(null)
    setBlockMenuOpen(false)
    setConversionMenuOpen(false)
  }

  const buildSelectionTarget = (range: Range, element: Element | null, x = 0, y = 0): VisualMarkdownSelection | null => {
    const editorRoot = element?.closest<HTMLElement>('.ProseMirror')
    if (!editorRoot || !editorRoot.contains(range.commonAncestorContainer)) return null

    const text = range.toString()
    const targetAnchor = element?.closest<HTMLAnchorElement>('a[href]')
    if (!text.trim() && !targetAnchor) return null

    const editor = getInstance()
    if (!editor) return null
    const positions = editor.action((ctx) => {
      const view = ctx.get(editorViewCtx)
      try {
        const start = view.posAtDOM(range.startContainer, range.startOffset)
        const end = view.posAtDOM(range.endContainer, range.endOffset)
        return { from: Math.min(start, end), to: Math.max(start, end) }
      } catch {
        return { from: view.state.selection.from, to: view.state.selection.to }
      }
    })
    if (!positions) return null

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
    const toggleMark = (markName: VisualInlineMark) => {
      editor.action((ctx) => {
        const view = ctx.get(editorViewCtx)
        const markType = view.state.schema.marks[markName]
        if (!markType || positions.from === positions.to) return
        const transaction = view.state.tr
        if (view.state.doc.rangeHasMark(positions.from, positions.to, markType)) transaction.removeMark(positions.from, positions.to, markType)
        else transaction.addMark(positions.from, positions.to, markType.create())
        view.dispatch(transaction.scrollIntoView())
        view.focus()
      })
    }
    const isMarkActive = (markName: VisualInlineMark) => editor.action((ctx) => {
      const view = ctx.get(editorViewCtx)
      const markType = view.state.schema.marks[markName]
      return Boolean(markType && view.state.doc.rangeHasMark(positions.from, positions.to, markType))
    }) ?? false
    const setInlineStyle = (style: VisualInlineStyle | null) => {
      editor.action((ctx) => {
        const view = ctx.get(editorViewCtx)
        const styledText = view.state.schema.nodes.visual_styled_text
        if (!styledText || positions.from === positions.to) return
        const { from, to } = positions
        const $from = view.state.doc.resolve(from)
        const $to = view.state.doc.resolve(to)
        if (style === null) {
          for (let depth = $from.depth; depth > 0; depth -= 1) {
            const node = $from.node(depth)
            if (node.type !== styledText) continue
            const nodePosition = $from.before(depth)
            view.dispatch(view.state.tr.replaceWith(nodePosition, nodePosition + node.nodeSize, node.content).scrollIntoView())
            view.focus()
            return
          }
          return
        }
        if (!$from.sameParent($to) || !$from.parent.inlineContent) return
        const styledNode = styledText.create({ style: sanitizeVisualInlineStyle(style) }, view.state.doc.slice(from, to).content)
        const transaction = view.state.tr.replaceWith(from, to, styledNode)
        transaction.setSelection(TextSelection.create(transaction.doc, from + 1, from + 1 + styledNode.content.size))
        view.dispatch(transaction.scrollIntoView())
        view.focus()
      })
    }
    const isInlineStyleActive = (style: VisualInlineStyle) => editor.action((ctx) => {
      const view = ctx.get(editorViewCtx)
      const styledText = view.state.schema.nodes.visual_styled_text
      if (!styledText) return false
      const $from = view.state.doc.resolve(positions.from)
      for (let depth = $from.depth; depth > 0; depth -= 1) {
        const node = $from.node(depth)
        if (node.type === styledText) return node.attrs.style === sanitizeVisualInlineStyle(style)
      }
      return false
    }) ?? false

    const common = range.commonAncestorContainer instanceof Element ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement
    const rangeAnchor = common?.closest<HTMLAnchorElement>('a[href]')
    return {
      source: 'visual',
      x,
      y,
      text,
      range,
      anchor: targetAnchor || rangeAnchor || undefined,
      replace,
      removeLink,
      setLink,
      toggleMark,
      isMarkActive,
      setInlineStyle,
      isInlineStyleActive,
      allowNative: () => { nativeContextMenuOnceRef.current = true },
    }
  }

  const publishSelectionTarget = (target: VisualMarkdownSelection | null) => {
    pendingSelectionTargetRef.current = target
    if (target) {
      activeBlockElementRef.current = null
      setActiveBlock(null)
      setBlockMenuOpen(false)
      setConversionMenuOpen(false)
      if (!nativeSelectionModeRef.current) onSelectionContextMenuRef.current?.(target)
    }
    onSelectionChangeRef.current?.(target)
  }

  const publishCurrentSelection = () => {
    const browserSelection = window.getSelection()
    if (!browserSelection || browserSelection.isCollapsed || !browserSelection.rangeCount) {
      publishSelectionTarget(null)
      return
    }
    const range = browserSelection.getRangeAt(0).cloneRange()
    const element = range.commonAncestorContainer instanceof Element ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement
    const rect = range.getBoundingClientRect()
    publishSelectionTarget(buildSelectionTarget(range, element, rect.left, rect.top))
  }

  const handleContentPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || (event.target instanceof Element && event.target.closest('.visual-block-actions'))) return
    selectingPointerRef.current = true
    pendingSelectionTargetRef.current = null
  }

  const handleContentPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !selectingPointerRef.current) return
    selectingPointerRef.current = false
    window.requestAnimationFrame(() => publishCurrentSelection())
  }

  const handleContentPointerCancel = () => {
    selectingPointerRef.current = false
    pendingSelectionTargetRef.current = null
  }

  useEffect(() => {
    const handleSelectionChange = () => {
      const browserSelection = window.getSelection()
      if (!browserSelection || browserSelection.isCollapsed || !browserSelection.rangeCount) {
        pendingSelectionTargetRef.current = null
        if (!selectingPointerRef.current) onSelectionChangeRef.current?.(null)
        return
      }
      const range = browserSelection.getRangeAt(0).cloneRange()
      const element = range.commonAncestorContainer instanceof Element ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement
      const rect = range.getBoundingClientRect()
      const target = buildSelectionTarget(range, element, rect.left, rect.top)
      pendingSelectionTargetRef.current = target
      if (!selectingPointerRef.current) publishSelectionTarget(target)
    }
    document.addEventListener('selectionchange', handleSelectionChange)
    return () => document.removeEventListener('selectionchange', handleSelectionChange)
  }, [getInstance, loading])

  const handleContentContextMenu = () => {
    // Keep the browser's native copy/paste/context menu available on desktop.
  }

  const runBlockAction = (action: VisualBlockAction) => {
    const active = activeBlock
    const editor = getInstance()
    if (!active || active.position < 0 || !editor) return

    editor.action((ctx) => {
      const view = ctx.get(editorViewCtx)
      const node = view.state.doc.nodeAt(active.position)
      if (!node) return

      if (action === 'table-add-row' || action === 'table-add-column' || action === 'table-delete-row' || action === 'table-delete-column') {
        if (!isInTable(view.state)) return
        if (action === 'table-add-row') {
          const rect = selectedRect(view.state)
          view.dispatch(addRowWithAlignment(ctx, view.state.tr, rect, rect.bottom).scrollIntoView())
        } else if (action === 'table-add-column') {
          addColumnAfter(view.state, (transaction) => view.dispatch(transaction.scrollIntoView()))
        } else if (action === 'table-delete-row') {
          deleteRow(view.state, (transaction) => view.dispatch(transaction.scrollIntoView()))
        } else {
          deleteColumn(view.state, (transaction) => view.dispatch(transaction.scrollIntoView()))
        }
        return
      }

      if (action === 'duplicate') {
        view.dispatch(view.state.tr.insert(active.position + node.nodeSize, node.copy(node.content)).scrollIntoView())
        return
      }
      if (action === 'delete') {
        view.dispatch(view.state.tr.delete(active.position, active.position + node.nodeSize).scrollIntoView())
        return
      }

      if (action.kind === 'heading' || action.kind === 'code') {
        const targetType = action.kind === 'heading' ? view.state.schema.nodes.heading : view.state.schema.nodes.code_block
        if (!targetType) return
        const source = node.type.name === 'blockquote' && node.childCount === 1 ? node.firstChild : node
        if (!source || !isVisualTextBlock(source)) return
        const attrs = action.kind === 'heading'
          ? { level: action.level }
          : { language: source.attrs.language || '' }
        const marks = action.kind === 'code' ? [] : source.marks
        if (node.type.name === 'blockquote') {
          view.dispatch(view.state.tr.replaceWith(active.position, active.position + node.nodeSize, targetType.create(attrs, source.content, marks)).scrollIntoView())
        } else {
          view.dispatch(view.state.tr.setNodeMarkup(active.position, targetType, attrs, marks).scrollIntoView())
        }
        return
      }

      if (action.kind === 'blockquote') {
        const blockquote = view.state.schema.nodes.blockquote
        if (!blockquote || node.type.name === 'blockquote' || node.type.name === 'list_item' || node.type.name === 'bullet_list' || node.type.name === 'ordered_list') return
        view.dispatch(view.state.tr.replaceWith(active.position, active.position + node.nodeSize, blockquote.create(null, node)).scrollIntoView())
        return
      }

      if (action.kind === 'bullet-list' || action.kind === 'ordered-list' || action.kind === 'task') {
        if (node.type.name === 'bullet_list' || node.type.name === 'ordered_list') {
          const list = visualListWithKind(node, action, view.state.schema)
          if (list) view.dispatch(view.state.tr.replaceWith(active.position, active.position + node.nodeSize, list).scrollIntoView())
          return
        }

        if (node.type.name === 'list_item') {
          const listItemType = view.state.schema.nodes.list_item
          if (!listItemType) return
          const inside = view.state.doc.resolve(active.position + 1)
          let listPosition = -1
          let listNode: ProseNode | null = null
          for (let depth = inside.depth; depth > 0; depth -= 1) {
            const parent = inside.node(depth)
            if (parent.type.name === 'bullet_list' || parent.type.name === 'ordered_list') {
              listPosition = inside.before(depth)
              listNode = parent
              break
            }
          }
          if (!listNode || listPosition < 0) return
          const targetListType = action.kind === 'ordered-list' ? view.state.schema.nodes.ordered_list : view.state.schema.nodes.bullet_list
          if (!targetListType) return
          const listAttrs = action.kind === 'ordered-list' ? { order: listNode.attrs.order || 1 } : visualNodeDefaults(targetListType)
          const nextItemAttrs = {
            ...node.attrs,
            label: action.kind === 'ordered-list' ? '1' : '•',
            listType: action.kind === 'ordered-list' ? 'ordered' : 'bullet',
            checked: action.kind === 'task' ? false : null,
          }
          let transaction = view.state.tr
          transaction = transaction.setNodeMarkup(listPosition, targetListType, listAttrs)
          transaction = transaction.setNodeMarkup(active.position, listItemType, nextItemAttrs)
          view.dispatch(transaction.scrollIntoView())
          return
        }

        const list = visualListFromNode(node, action, view.state.schema)
        if (list) view.dispatch(view.state.tr.replaceWith(active.position, active.position + node.nodeSize, list).scrollIntoView())
      }
    })

    if (action === 'delete') {
      activeBlockElementRef.current = null
      setActiveBlock(null)
      setBlockMenuOpen(false)
    } else if (typeof action === 'object') {
      setActiveBlock((current) => current ? { ...current, kind: action.kind, level: action.kind === 'heading' ? action.level : undefined, listType: action.kind === 'ordered-list' ? 'ordered' : action.kind === 'bullet-list' || action.kind === 'task' ? 'bullet' : current.listType } : current)
      setConversionMenuOpen(false)
    }
  }

  const editorStyle = {
    '--visual-editor-font-size': `${fontSize}px`,
    '--visual-editor-font-family': fontFamily,
    '--visual-editor-font-weight': fontWeight,
  } as CSSProperties
  const currentParts = splitMarkdown(value)
  const blockOptions: BlockOption[] = [
    { kind: 'heading', level: 1, label: t('标题 1'), icon: 'H1', shortcut: 'Ctrl+1' },
    { kind: 'heading', level: 2, label: t('标题 2'), icon: 'H2', shortcut: 'Ctrl+2' },
    { kind: 'heading', level: 3, label: t('标题 3'), icon: 'H3', shortcut: 'Ctrl+3' },
    { kind: 'heading', level: 4, label: t('标题 4'), icon: 'H4', shortcut: 'Ctrl+4' },
    { kind: 'heading', level: 5, label: t('标题 5'), icon: 'H5', shortcut: 'Ctrl+5' },
    { kind: 'heading', level: 6, label: t('标题 6'), icon: 'H6', shortcut: 'Ctrl+6' },
    { kind: 'code', label: t('代码'), icon: '</>' },
    { kind: 'blockquote', label: t('引用'), icon: '❝' },
    { kind: 'bullet-list', label: t('无序列表'), icon: '•' },
    { kind: 'ordered-list', label: t('有序列表'), icon: '1.' },
    { kind: 'task', label: t('待办事项'), icon: '☐' },
  ]
  const listBlock = activeBlock && (activeBlock.kind === 'bullet-list' || activeBlock.kind === 'ordered-list' || activeBlock.kind === 'task' || activeBlock.kind === 'list-item')
  const activeBlockOptions = activeBlock?.kind === 'table'
    ? []
    : listBlock
      ? blockOptions.filter((option) => option.kind === 'bullet-list' || option.kind === 'ordered-list' || option.kind === 'task')
      : blockOptions
  const blockHandleLabel = !activeBlock
    ? ''
    : activeBlock.kind === 'heading'
      ? `H${activeBlock.level}`
      : activeBlock.kind === 'code'
        ? '</>'
        : activeBlock.kind === 'blockquote'
          ? '❝'
          : activeBlock.kind === 'ordered-list'
            ? '1.'
            : activeBlock.kind === 'bullet-list' || activeBlock.kind === 'list-item'
              ? '•'
              : activeBlock.kind === 'task'
                ? '☐'
                : activeBlock.kind === 'table'
                  ? '▦'
                  : activeBlock.kind === 'horizontal-rule'
                    ? '—'
                    : '¶'
  const blockHandleText = !activeBlock
    ? ''
    : activeBlock.kind === 'heading'
      ? t(`标题 ${activeBlock.level}`)
      : activeBlock.kind === 'code'
        ? t('代码')
        : activeBlock.kind === 'blockquote'
          ? t('引用')
          : activeBlock.kind === 'ordered-list' || (activeBlock.kind === 'list-item' && activeBlock.listType === 'ordered')
            ? t('有序列表')
            : activeBlock.kind === 'bullet-list' || activeBlock.kind === 'list-item'
              ? t('无序列表')
              : activeBlock.kind === 'task'
                ? t('待办事项')
                : activeBlock.kind === 'table'
                  ? t('表格')
                  : activeBlock.kind === 'horizontal-rule'
                    ? t('分隔线')
                    : t('段落')
  const isActiveBlockOption = (option: BlockOption) => {
    if (!activeBlock) return false
    return option.kind === 'heading'
      ? activeBlock.kind === 'heading' && activeBlock.level === option.level
      : activeBlock.kind === option.kind
  }

  return <div className={`visual-markdown-editor ${dark ? 'dark' : ''}${activeBlock ? ' has-active-heading' : ''}`} style={editorStyle}>
      <div className="visual-markdown-scroll">
      <div className="visual-markdown-surface">
        {currentParts.frontmatter && <section className="visual-frontmatter">
          <div className="visual-frontmatter-header">
            <span>{t('文档元数据')}</span>
          </div>
          <textarea ref={frontmatterRef} aria-label={t('YAML 文档元数据')} value={currentParts.frontmatter} onChange={(event) => handleFrontmatterChange(event.target.value)} spellCheck={false} />
        </section>}
        <div ref={contentRef} className="visual-markdown-content" aria-label={t('视觉 Markdown 编辑器')} onPointerDown={handleContentPointerDown} onPointerUp={handleContentPointerUp} onPointerCancel={handleContentPointerCancel} onClick={handleContentClick} onContextMenu={handleContentContextMenu}>
          {activeBlock && <div className={`visual-block-actions${blockMenuOpen ? ' expanded' : ''}`} style={{ top: activeBlock.top, left: activeBlock.left, '--visual-block-handle-size': `${activeBlock.handleSize}px` } as CSSProperties} onPointerDown={(event) => event.stopPropagation()}>
            <button type="button" className="visual-block-type-trigger" aria-label={t('区块类型')} title={`${blockHandleLabel} · ${t('区块类型')}`} aria-expanded={blockMenuOpen} onClick={() => { setBlockMenuOpen((open) => !open); setConversionMenuOpen(false) }}><span className="visual-block-handle-dots" aria-hidden="true">{Array.from({ length: 6 }, (_, index) => <i key={index} />)}</span><b className="visually-hidden">{blockHandleLabel}</b></button>
            {blockMenuOpen && <>
              <div className="visual-block-menu" role="menu">
              <button type="button" role="menuitem" onClick={() => runBlockAction('duplicate')}><span>▣</span>{t('创建副本')}</button>
              {activeBlockOptions.length > 0 && <button type="button" role="menuitem" onClick={() => setConversionMenuOpen((open) => !open)}><span>¶</span>{t('转换为')}<b>›</b></button>}
              {activeBlock.kind === 'table' && <>
                <button type="button" role="menuitem" onClick={() => runBlockAction('table-add-row')}><span>＋</span>{t('新增行')}</button>
                <button type="button" role="menuitem" onClick={() => runBlockAction('table-add-column')}><span>＋</span>{t('新增列')}</button>
                <button type="button" role="menuitem" onClick={() => runBlockAction('table-delete-row')}><span>−</span>{t('删除行')}</button>
                <button type="button" role="menuitem" onClick={() => runBlockAction('table-delete-column')}><span>−</span>{t('删除列')}</button>
              </>}
              <button type="button" role="menuitem" className="danger" onClick={() => runBlockAction('delete')}><span>♜</span>{t('删除')}</button>
              {conversionMenuOpen && <div className="visual-block-conversion-menu" role="menu">
                {activeBlockOptions.map((option) => <button type="button" role="menuitem" className={isActiveBlockOption(option) ? 'active' : ''} key={`${option.kind}-${option.kind === 'heading' ? option.level : ''}`} onClick={() => runBlockAction(option)}><span>{option.icon}</span><em>{option.label}</em><kbd>{option.shortcut || ''}</kbd></button>)}
              </div>}
              </div>
            </>}
          </div>}
          <Milkdown />
        </div>
        {loading && <div className="visual-markdown-loading">{t('正在加载视觉编辑器…')}</div>}
      </div>
    </div>
        {activeBlock && <div className="visual-mobile-block-toolbar" role="toolbar" aria-label={t('区块操作')} onPointerDown={(event) => event.stopPropagation()}>
      <div className="visual-mobile-block-toolbar-row">
        <button type="button" className="visual-mobile-heading-trigger" aria-label={`${t('转换为')} ${blockHandleText}`} aria-expanded={conversionMenuOpen} disabled={activeBlockOptions.length === 0} onClick={() => { setConversionMenuOpen((open) => !open); setBlockMenuOpen(false) }}><span aria-hidden="true">{blockHandleLabel}</span><em>{blockHandleText}</em></button>
        <button type="button" onClick={() => runBlockAction('duplicate')}><span>▣</span><em>{t('创建副本')}</em></button>
        {activeBlock.kind === 'table' && <>
          <button type="button" onClick={() => runBlockAction('table-add-row')}><span>＋</span><em>{t('新增行')}</em></button>
          <button type="button" onClick={() => runBlockAction('table-add-column')}><span>＋</span><em>{t('新增列')}</em></button>
          <button type="button" onClick={() => runBlockAction('table-delete-row')}><span>−</span><em>{t('删除行')}</em></button>
          <button type="button" onClick={() => runBlockAction('table-delete-column')}><span>−</span><em>{t('删除列')}</em></button>
        </>}
        <button type="button" className="danger" onClick={() => runBlockAction('delete')}><span>♜</span><em>{t('删除')}</em></button>
      </div>
      {conversionMenuOpen && <div className="visual-mobile-block-conversion-menu" role="menu">
        {activeBlockOptions.map((option) => <button type="button" role="menuitem" className={isActiveBlockOption(option) ? 'active' : ''} key={`${option.kind}-${option.kind === 'heading' ? option.level : ''}`} onClick={() => runBlockAction(option)}><span>{option.icon}</span><em>{option.label}</em></button>)}
      </div>}
    </div>}
  </div>
})

const VisualMarkdownEditor = forwardRef<VisualMarkdownEditorHandle, VisualMarkdownEditorProps>(function VisualMarkdownEditor(props, ref) {
  return <MilkdownProvider><VisualMarkdownEditorInner ref={ref} {...props} /></MilkdownProvider>
})

export default VisualMarkdownEditor
