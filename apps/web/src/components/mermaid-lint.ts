import type { Diagnostic } from '@codemirror/lint'
import type { Locale } from '../i18n'
import { parseMermaidSyntax } from './mermaid-renderer'

export async function inspectMermaid(source: string, locale: Locale = 'zh-CN'): Promise<Diagnostic[]> {
  const firstCharacter = source.search(/\S/)
  if (firstCharacter < 0) return []
  try {
    await parseMermaidSyntax(source)
    return []
  } catch (reason) {
    const detail = reason instanceof Error ? reason.message.replace(/\s+/g, ' ').trim() : ''
    const message = locale === 'en-US'
      ? `Mermaid syntax error${detail ? `: ${detail}` : ''}`
      : `Mermaid 语法错误${detail ? `：${detail}` : ''}`
    return [{
      from: firstCharacter,
      to: Math.min(source.length, firstCharacter + Math.max(1, source.slice(firstCharacter).split('\n', 1)[0].length)),
      severity: 'error',
      source: 'Mermaid',
      message,
    }]
  }
}
