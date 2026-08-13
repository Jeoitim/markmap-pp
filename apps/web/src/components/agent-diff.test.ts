import { describe, expect, it } from 'vitest'
import { buildAgentDiff } from './agent-diff'

describe('Agent 多段 Diff', () => {
  it('新建文件不会产生虚假的删除行', () => {
    const result = buildAgentDiff('', '# 标题\n\n正文')
    expect(result.removed).toBe(0)
    expect(result.added).toBe(3)
    expect(result.rows.some((row) => row.type === 'removed')).toBe(false)
  })

  it('保留多个独立修改并折叠大段未变化内容', () => {
    const before = ['第一行', ...Array.from({ length: 12 }, (_, index) => `内容 ${index + 1}`), '最后一行'].join('\n')
    const after = ['修改后的第一行', ...Array.from({ length: 12 }, (_, index) => `内容 ${index + 1}`), '修改后的最后一行'].join('\n')
    const result = buildAgentDiff(before, after, 2)
    expect(result.added).toBe(2)
    expect(result.removed).toBe(2)
    expect(result.rows.some((row) => row.type === 'gap' && row.count > 0)).toBe(true)
  })

  it('为上下文与差异提供对应的新旧行号', () => {
    const result = buildAgentDiff('a\nb\nc', 'a\nB\nc')
    expect(result.rows).toContainEqual({ type: 'removed', content: 'b', oldLine: 2 })
    expect(result.rows).toContainEqual({ type: 'added', content: 'B', newLine: 2 })
  })
})
