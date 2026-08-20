import { useEffect, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from 'react'
import { Editor, defaultValueCtx, editorViewCtx, parserCtx, rootCtx, serializerCtx } from '@milkdown/kit/core'
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener'
import { commonmark } from '@milkdown/kit/preset/commonmark'
import { gfm } from '@milkdown/kit/preset/gfm'
import { Milkdown, MilkdownProvider, useEditor, useInstance } from '@milkdown/react'

export interface VisualMarkdownEditorProps {
  value: string
  onChange: (value: string) => void
  dark: boolean
  fontSize: number
  fontFamily: string
  fontWeight: number
}

interface MarkdownParts {
  frontmatter: string
  body: string
}

function splitMarkdown(source: string): MarkdownParts {
  const match = source.match(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/)
  if (!match) return { frontmatter: '', body: source }
  return { frontmatter: match[0], body: source.slice(match[0].length) }
}

function joinMarkdown(frontmatter: string, body: string) {
  return frontmatter ? `${frontmatter}${body}` : body
}

function VisualMarkdownEditorInner({ value, onChange, dark, fontSize, fontFamily, fontWeight }: VisualMarkdownEditorProps) {
  const [initialParts] = useState(() => splitMarkdown(value))
  const latestValueRef = useRef(value)
  const latestPartsRef = useRef(initialParts)
  const bodyRef = useRef(initialParts.body)
  const onChangeRef = useRef(onChange)
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
    const target = event.target instanceof Element ? event.target.closest<HTMLLIElement>('li[data-item-type="task"]') : null
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

  const editorStyle = {
    '--visual-editor-font-size': `${fontSize}px`,
    '--visual-editor-font-family': fontFamily,
    '--visual-editor-font-weight': fontWeight,
  } as CSSProperties
  const currentParts = splitMarkdown(value)

  return <div className={`visual-markdown-editor ${dark ? 'dark' : ''}`} style={editorStyle}>
    <div className="visual-markdown-scroll">
      <div className="visual-markdown-surface">
        {currentParts.frontmatter && <section className="visual-frontmatter">
          <div className="visual-frontmatter-header">
            <span>文档元数据</span>
            <small>YAML · 视觉模式保留为可编辑源码块</small>
          </div>
          <textarea aria-label="YAML 文档元数据" value={currentParts.frontmatter} onChange={(event) => handleFrontmatterChange(event.target.value)} spellCheck={false} />
        </section>}
        <div className="visual-markdown-content" aria-label="视觉 Markdown 编辑器" onClick={handleContentClick}>
          <Milkdown />
        </div>
        {loading && <div className="visual-markdown-loading">正在加载视觉编辑器…</div>}
      </div>
    </div>
  </div>
}

export default function VisualMarkdownEditor(props: VisualMarkdownEditorProps) {
  return <MilkdownProvider><VisualMarkdownEditorInner {...props} /></MilkdownProvider>
}
