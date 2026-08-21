import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { indentWithTab } from '@codemirror/commands'
import { Compartment } from '@codemirror/state'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { markdown } from '@codemirror/lang-markdown'
import { forceLinting, linter, lintGutter } from '@codemirror/lint'
import { EditorView, keymap } from '@codemirror/view'
import { tags } from '@lezer/highlight'
import { basicSetup } from 'codemirror'
import { inspectMarkdown } from './markdown-lint'
import { inspectMermaid } from './mermaid-lint'
import { findMarkdownLinkAt, type ParsedMarkdownLink } from './repository-links'
import type { Locale } from '../i18n'

export type HighlightScheme = 'violet' | 'github' | 'solarized'

const palette = {
  violet: { heading: '#7559db', keyword: '#b453a8', link: '#3268c7', code: '#c05a35', quote: '#57806a' },
  github: { heading: '#0969da', keyword: '#cf222e', link: '#0969da', code: '#953800', quote: '#57606a' },
  solarized: { heading: '#268bd2', keyword: '#d33682', link: '#2aa198', code: '#cb4b16', quote: '#859900' },
}

function editorTheme(dark: boolean, fontSize: number, fontFamily: string, fontWeight: number, scheme: HighlightScheme) {
  const colors = palette[scheme]
  return [
    EditorView.theme({
      '&': { height: '100%', backgroundColor: 'var(--editor-bg)', color: 'var(--editor-text)' },
      '.cm-scroller': { fontFamily, fontSize: `${fontSize}px`, fontWeight: String(fontWeight), lineHeight: '1.72' },
      '.cm-content': {
        padding: '18px 10px 60px 4px',
        caretColor: 'var(--accent)',
        cursor: 'text',
      },
      '.cm-line': { paddingLeft: '8px' },
      '.cm-gutters': { backgroundColor: 'var(--editor-bg)', color: 'var(--editor-gutter)', border: 'none', paddingLeft: '8px' },
      '.cm-activeLine': { backgroundColor: 'transparent' },
      '.cm-activeLineGutter': { backgroundColor: 'var(--editor-active)' },
      '.cm-selectionLayer .cm-selectionBackground, &.cm-focused .cm-selectionLayer .cm-selectionBackground': {
        backgroundColor: dark ? '#9d8cff66 !important' : '#7056e852 !important',
      },
      '& ::selection': { backgroundColor: dark ? '#9d8cff66' : '#7056e852' },
      '&.cm-focused': { outline: 'none' },
      '.cm-lintRange-error': { backgroundImage: 'none', textDecoration: 'underline wavy #d84b4b' },
      '.cm-lintRange-warning': { backgroundImage: 'none', textDecoration: 'underline wavy #d39b35' },
    }, { dark }),
    syntaxHighlighting(HighlightStyle.define([
      { tag: [tags.heading1, tags.heading2, tags.heading3, tags.heading4, tags.heading5, tags.heading6], color: colors.heading, fontWeight: '700' },
      { tag: [tags.strong, tags.keyword], color: colors.keyword, fontWeight: '700' },
      { tag: tags.emphasis, color: colors.keyword, fontStyle: 'italic' },
      { tag: [tags.link, tags.url], color: colors.link, textDecoration: 'underline' },
      { tag: [tags.monospace, tags.string], color: colors.code },
      { tag: [tags.quote, tags.meta], color: colors.quote },
      { tag: tags.strikethrough, textDecoration: 'line-through' },
    ])),
  ]
}

interface MarkdownEditorProps {
  value: string
  onChange: (value: string) => void
  dark: boolean
  fontSize: number
  fontFamily: string
  fontWeight: number
  spellCheck: boolean
  spellCheckLanguage: string
  userDictionary: string[]
  scheme: HighlightScheme
  locale: Locale
  mode: 'markdown' | 'mermaid'
  onSelectionContextMenu?: (selection: MarkdownEditorSelection) => void
  onSelectionChange?: (selection: MarkdownEditorSelection | null) => void
  nativeSelectionMode?: boolean
  onOpenLink?: (href: string) => void
}

export interface MarkdownEditorSelection {
  x: number
  y: number
  from: number
  to: number
  text: string
  link?: ParsedMarkdownLink
}

export interface MarkdownEditorHandle {
  allowNativeContextMenuOnce: () => void
  focus: () => void
  getSelection: () => { from: number; to: number; text: string }
  replaceRange: (from: number, to: number, insert: string) => void
  replaceSelection: (insert: string) => void
  revealLine: (line: number) => void
}

const MarkdownEditor = forwardRef<MarkdownEditorHandle, MarkdownEditorProps>(function MarkdownEditor({ value, onChange, dark, fontSize, fontFamily, fontWeight, spellCheck, spellCheckLanguage, userDictionary, scheme, locale, mode, onSelectionContextMenu, onSelectionChange, nativeSelectionMode = false, onOpenLink }, ref) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  const onSelectionContextMenuRef = useRef(onSelectionContextMenu)
  const onSelectionChangeRef = useRef(onSelectionChange)
  const onOpenLinkRef = useRef(onOpenLink)
  const nativeContextMenuOnceRef = useRef(false)
  const nativeSelectionModeRef = useRef(nativeSelectionMode)
  const themeCompartment = useRef(new Compartment())
  const externalUpdate = useRef(false)
  const localeRef = useRef(locale)
  const modeRef = useRef(mode)
  const initialConfigRef = useRef({ value, dark, fontSize, fontFamily, fontWeight, spellCheck, spellCheckLanguage, userDictionary, scheme })

  useEffect(() => { onChangeRef.current = onChange }, [onChange])
  useEffect(() => { onSelectionContextMenuRef.current = onSelectionContextMenu }, [onSelectionContextMenu])
  useEffect(() => { onSelectionChangeRef.current = onSelectionChange }, [onSelectionChange])
  useEffect(() => { onOpenLinkRef.current = onOpenLink }, [onOpenLink])
  useEffect(() => { nativeSelectionModeRef.current = nativeSelectionMode }, [nativeSelectionMode])
  useEffect(() => { localeRef.current = locale }, [locale])
  useEffect(() => { modeRef.current = mode; if (viewRef.current) forceLinting(viewRef.current) }, [mode])

  useImperativeHandle(ref, () => ({
    allowNativeContextMenuOnce: () => { nativeContextMenuOnceRef.current = true },
    focus: () => viewRef.current?.focus(),
    getSelection: () => {
      const view = viewRef.current
      if (!view) return { from: 0, to: 0, text: '' }
      const { from, to } = view.state.selection.main
      return { from, to, text: view.state.sliceDoc(from, to) }
    },
    replaceRange: (from, to, insert) => {
      const view = viewRef.current
      if (!view) return
      view.dispatch({ changes: { from, to, insert }, selection: { anchor: from + insert.length }, scrollIntoView: true })
      view.focus()
    },
    replaceSelection: (insert) => {
      const view = viewRef.current
      if (!view) return
      const { from, to } = view.state.selection.main
      view.dispatch({ changes: { from, to, insert }, selection: { anchor: from + insert.length }, scrollIntoView: true })
      view.focus()
    },
    revealLine: (lineNumber) => {
      const view = viewRef.current
      if (!view) return
      const line = view.state.doc.line(Math.max(1, Math.min(lineNumber, view.state.doc.lines)))
      view.dispatch({ selection: { anchor: line.from, head: line.to }, effects: EditorView.scrollIntoView(line.from, { y: 'center' }) })
      view.focus()
    },
  }), [])

  useEffect(() => {
    if (!hostRef.current) return
    const view = new EditorView({
      doc: initialConfigRef.current.value,
      parent: hostRef.current,
      extensions: [
        basicSetup,
        markdown(),
        lintGutter(),
        linter((editor) => modeRef.current === 'mermaid' ? inspectMermaid(editor.state.doc.toString(), localeRef.current) : inspectMarkdown(editor.state.doc.toString(), localeRef.current), { delay: 250 }),
        EditorView.lineWrapping,
        keymap.of([indentWithTab]),
        EditorView.contentAttributes.of({ 'aria-label': 'Markdown 内容', spellcheck: String(initialConfigRef.current.spellCheck), ...(initialConfigRef.current.spellCheckLanguage === 'auto' ? {} : { lang: initialConfigRef.current.spellCheckLanguage }), 'data-user-dictionary': initialConfigRef.current.userDictionary.join('|') }),
        EditorView.domEventHandlers({
          contextmenu: (event, editor) => {
            if (nativeSelectionModeRef.current) return false
            if (event.shiftKey || nativeContextMenuOnceRef.current) {
              nativeContextMenuOnceRef.current = false
              return false
            }
            const { from, to } = editor.state.selection.main
            if (from === to) return false
            event.preventDefault()
            const markdownValue = editor.state.doc.toString()
            onSelectionContextMenuRef.current?.({ x: event.clientX, y: event.clientY, from, to, text: editor.state.sliceDoc(from, to), link: findMarkdownLinkAt(markdownValue, from) })
            return true
          },
          click: (event, editor) => {
            if (!event.metaKey && !event.ctrlKey) return false
            const position = editor.posAtCoords({ x: event.clientX, y: event.clientY })
            if (position === null) return false
            const link = findMarkdownLinkAt(editor.state.doc.toString(), position)
            if (!link) return false
            event.preventDefault()
            onOpenLinkRef.current?.(link.href)
            return true
          },
        }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged && !externalUpdate.current) onChangeRef.current(update.state.doc.toString())
          if (update.selectionSet || update.docChanged) {
            const { from, to } = update.state.selection.main
            if (from === to) {
              onSelectionChangeRef.current?.(null)
            } else {
              let x = 0
              let y = 0
              try {
                const coords = update.view.coordsAtPos(from)
                if (coords) { x = coords.left; y = coords.bottom }
              } catch { /* The view may be between layout passes. */ }
              const markdownValue = update.state.doc.toString()
              onSelectionChangeRef.current?.({ x, y, from, to, text: update.state.sliceDoc(from, to), link: findMarkdownLinkAt(markdownValue, from) })
            }
          }
        }),
        themeCompartment.current.of(editorTheme(initialConfigRef.current.dark, initialConfigRef.current.fontSize, initialConfigRef.current.fontFamily, initialConfigRef.current.fontWeight, initialConfigRef.current.scheme)),
      ],
    })
    viewRef.current = view
    return () => {
      view.destroy()
      viewRef.current = null
    }
  }, [])

  useEffect(() => {
    const content = viewRef.current?.contentDOM
    if (content) content.setAttribute('spellcheck', String(spellCheck))
  }, [spellCheck])

  useEffect(() => {
    const content = viewRef.current?.contentDOM
    if (!content) return
    if (spellCheckLanguage === 'auto') content.removeAttribute('lang')
    else content.setAttribute('lang', spellCheckLanguage)
  }, [spellCheckLanguage])

  useEffect(() => {
    viewRef.current?.contentDOM.setAttribute('data-user-dictionary', userDictionary.join('|'))
  }, [userDictionary])

  useEffect(() => {
    const view = viewRef.current
    if (!view || view.state.doc.toString() === value) return
    externalUpdate.current = true
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } })
    externalUpdate.current = false
  }, [value])

  useEffect(() => {
    if (viewRef.current) forceLinting(viewRef.current)
  }, [locale])

  useEffect(() => {
    viewRef.current?.dispatch({ effects: themeCompartment.current.reconfigure(editorTheme(dark, fontSize, fontFamily, fontWeight, scheme)) })
  }, [dark, fontSize, fontFamily, fontWeight, scheme])

  return <div className="code-editor" ref={hostRef} />
})

export default MarkdownEditor
