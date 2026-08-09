import { describe, expect, it } from 'vitest'
import { extractRepositoryHeadings, indexRepositoryNote, repositoryMarkdownLink, resolveHeading, resolveRepositoryLink, rewriteRepositoryLinks } from './repository-links'

describe('repository links', () => {
  it('distinguishes repository Markdown links from normal browser links', () => {
    expect(resolveRepositoryLink('/doc/guide.md#安装', 'notes/start.md')).toEqual({ kind: 'internal', path: 'doc/guide.md', fragment: '安装' })
    expect(resolveRepositoryLink('/%E5%8F%A4%E4%BB%A3%E6%96%87%E5%AD%A6/%E9%9A%8B%E5%94%90%E6%96%87%E5%AD%A6%EF%BC%9A%E6%9D%8E%E7%99%BD.md', 'notes/start.md')).toEqual({ kind: 'internal', path: '古代文学/隋唐文学：李白.md', fragment: '' })
    expect(resolveRepositoryLink('../guide.md', 'notes/start.md')).toEqual({ kind: 'internal', path: 'guide.md', fragment: '' })
    expect(resolveRepositoryLink('#本页标题', 'notes/start.md')).toEqual({ kind: 'internal', path: 'notes/start.md', fragment: '本页标题' })
    expect(resolveRepositoryLink('https://example.com/guide.md', 'notes/start.md')).toEqual({ kind: 'external', href: 'https://example.com/guide.md' })
    expect(resolveRepositoryLink('mailto:notes@example.com', 'notes/start.md')).toEqual({ kind: 'external', href: 'mailto:notes@example.com' })
    expect(resolveRepositoryLink('/assets/logo.svg', 'notes/start.md').kind).toBe('external')
  })

  it('creates stable Chinese and duplicate heading slugs', () => {
    expect(extractRepositoryHeadings('# 项目介绍\n## 快速 开始\n## 快速 开始')).toEqual([
      { level: 1, line: 1, text: '项目介绍', slug: '项目介绍' },
      { level: 2, line: 2, text: '快速 开始', slug: '快速-开始' },
      { level: 2, line: 3, text: '快速 开始', slug: '快速-开始-1' },
    ])
  })

  it('finds a heading from an encoded fragment', () => {
    const note = indexRepositoryNote('doc/guide.md', '# 使用说明\n\n内容')
    expect(resolveHeading(note, '%E4%BD%BF%E7%94%A8%E8%AF%B4%E6%98%8E')?.line).toBe(1)
  })

  it('indexes a bold repository link rendered inside a mind-map node', () => {
    const note = indexRepositoryNote('古代文学/诗人.md', '- **[李白](/古代文学/隋唐文学：李白.md)** (浪漫主义)')
    expect(note.links[0]).toMatchObject({
      label: '李白',
      href: '/古代文学/隋唐文学：李白.md',
      resolution: { kind: 'internal', path: '古代文学/隋唐文学：李白.md', fragment: '' },
    })
  })

  it('writes portable root-relative Markdown links', () => {
    expect(repositoryMarkdownLink('查看说明', 'doc/使用说明.md', '快速-开始')).toBe('[查看说明](/doc/使用说明.md#快速-开始)')
    expect(repositoryMarkdownLink('专题', '古代 文学/隋唐文学（李白）.md')).toBe('[专题](/古代%20文学/隋唐文学（李白）.md)')
  })

  it('updates incoming links after a file move without touching web links', () => {
    const source = '[内部](../doc/guide.md#intro) 与 [网站](https://example.com/doc/guide.md)'
    const result = rewriteRepositoryLinks(source, 'notes/start.md', 'doc/guide.md', 'archive/guide.md')
    expect(result.count).toBe(1)
    expect(result.content).toBe('[内部](/archive/guide.md#intro) 与 [网站](https://example.com/doc/guide.md)')
  })
})
