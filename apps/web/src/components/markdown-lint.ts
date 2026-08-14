import type { Diagnostic } from '@codemirror/lint'
import type { Locale } from '../i18n'

export function inspectMarkdown(source: string, locale: Locale = 'zh-CN'): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  const lines = source.split('\n')
  let offset = 0
  let previousHeading = 0
  let fenceStart = -1

  lines.forEach((line) => {
    const heading = /^(#{1,6})\s+/.exec(line)
    if (heading) {
      const level = heading[1].length
      if (previousHeading && level > previousHeading + 1) {
        diagnostics.push({
          from: offset,
          to: offset + heading[1].length,
          severity: 'warning',
          source: 'Markmap',
          message: locale === 'en-US'
            ? `Heading jumps from H${previousHeading} to H${level}, which may create an unexpected hierarchy`
            : `标题从 H${previousHeading} 跳到了 H${level}，可能产生意外层级`,
        })
      }
      previousHeading = level
    }
    if (/^\s*```/.test(line)) fenceStart = fenceStart < 0 ? offset : -1
    const tabIndex = line.indexOf('\t')
    if (tabIndex >= 0) {
      diagnostics.push({
        from: offset + tabIndex,
        to: offset + tabIndex + 1,
        severity: 'warning',
        source: 'Markmap',
        message: locale === 'en-US' ? 'Use spaces for indentation; tabs may create different nesting on different devices' : '建议使用空格缩进，Tab 在不同设备上的层级可能不一致',
      })
    }
    offset += line.length + 1
  })

  if (fenceStart >= 0) {
    diagnostics.push({
      from: fenceStart,
      to: Math.min(fenceStart + 3, source.length),
      severity: 'error',
      source: 'Markdown',
      message: locale === 'en-US' ? 'Code block is not closed; add the closing ```' : '代码块没有闭合，请补充结束的 ```',
    })
  }
  return diagnostics
}
