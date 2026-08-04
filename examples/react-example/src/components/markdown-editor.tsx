import { useEffect, useRef } from 'react'
import { indentWithTab } from '@codemirror/commands'
import { Compartment } from '@codemirror/state'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { markdown } from '@codemirror/lang-markdown'
import { linter, lintGutter } from '@codemirror/lint'
import { EditorView, keymap } from '@codemirror/view'
import { tags } from '@lezer/highlight'
import { basicSetup } from 'codemirror'
import { inspectMarkdown } from './markdown-lint'

export type HighlightScheme = 'violet' | 'github' | 'solarized'

const palette = {
  violet: { heading: '#7559db', keyword: '#b453a8', link: '#3268c7', code: '#c05a35', quote: '#57806a' },
  github: { heading: '#0969da', keyword: '#cf222e', link: '#0969da', code: '#953800', quote: '#57606a' },
  solarized: { heading: '#268bd2', keyword: '#d33682', link: '#2aa198', code: '#cb4b16', quote: '#859900' },
}

function editorTheme(dark: boolean, fontSize: number, scheme: HighlightScheme) {
  const colors = palette[scheme]
  return [
    EditorView.theme({
      '&': { height: '100%', backgroundColor: 'var(--editor-bg)', color: 'var(--editor-text)' },
      '.cm-scroller': { fontFamily: '"JetBrains Mono Variable", ui-monospace, monospace', fontSize: `${fontSize}px`, lineHeight: '1.72' },
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
  scheme: HighlightScheme
}

export default function MarkdownEditor({ value, onChange, dark, fontSize, scheme }: MarkdownEditorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  const themeCompartment = useRef(new Compartment())
  const externalUpdate = useRef(false)
  const initialConfigRef = useRef({ value, dark, fontSize, scheme })

  useEffect(() => { onChangeRef.current = onChange }, [onChange])

  useEffect(() => {
    if (!hostRef.current) return
    const view = new EditorView({
      doc: initialConfigRef.current.value,
      parent: hostRef.current,
      extensions: [
        basicSetup,
        markdown(),
        lintGutter(),
        linter((editor) => inspectMarkdown(editor.state.doc.toString()), { delay: 250 }),
        EditorView.lineWrapping,
        keymap.of([indentWithTab]),
        EditorView.contentAttributes.of({ 'aria-label': 'Markdown 内容', spellcheck: 'false' }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged && !externalUpdate.current) onChangeRef.current(update.state.doc.toString())
        }),
        themeCompartment.current.of(editorTheme(initialConfigRef.current.dark, initialConfigRef.current.fontSize, initialConfigRef.current.scheme)),
      ],
    })
    viewRef.current = view
    return () => {
      view.destroy()
      viewRef.current = null
    }
  }, [])

  useEffect(() => {
    const view = viewRef.current
    if (!view || view.state.doc.toString() === value) return
    externalUpdate.current = true
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } })
    externalUpdate.current = false
  }, [value])

  useEffect(() => {
    viewRef.current?.dispatch({ effects: themeCompartment.current.reconfigure(editorTheme(dark, fontSize, scheme)) })
  }, [dark, fontSize, scheme])

  return <div className="code-editor" ref={hostRef} />
}
