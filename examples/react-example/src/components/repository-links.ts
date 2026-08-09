export interface RepositoryHeading {
  level: number
  line: number
  text: string
  slug: string
}

export interface ParsedMarkdownLink {
  label: string
  href: string
  line: number
  from: number
  to: number
  destinationFrom: number
  destinationTo: number
}

export interface ResolvedRepositoryLink {
  kind: 'internal'
  path: string
  fragment: string
}

export interface ExternalRepositoryLink {
  kind: 'external'
  href: string
}

export interface InvalidRepositoryLink {
  kind: 'invalid'
  href: string
  reason: string
}

export type RepositoryLinkResolution = ResolvedRepositoryLink | ExternalRepositoryLink | InvalidRepositoryLink

export interface RepositoryNoteIndex {
  path: string
  headings: RepositoryHeading[]
  links: Array<ParsedMarkdownLink & { resolution: RepositoryLinkResolution }>
}

const MARKDOWN_EXTENSION = /\.md(?:own)?$/i
const EXTERNAL_SCHEME = /^[a-z][a-z\d+.-]*:/i

function decodeLinkPart(value: string) {
  try { return decodeURIComponent(value) } catch { return value }
}

function encodeReadableLinkPart(value: string) {
  return value.replace(/[\s"#%()[\]<>?\\^`{|}]/g, (character) => {
    const code = character.charCodeAt(0)
    return code <= 0x7f ? `%${code.toString(16).toUpperCase().padStart(2, '0')}` : encodeURIComponent(character)
  })
}

function cleanHeadingText(value: string) {
  return value
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/[`*_~]/g, '')
    .replace(/&(?:amp|lt|gt|quot|#39);/g, (entity) => ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" }[entity] || entity))
    .trim()
}

export function slugifyRepositoryHeading(value: string) {
  return cleanHeadingText(value)
    .toLocaleLowerCase()
    .replace(/[^\p{Letter}\p{Number}\s_-]/gu, '')
    .replace(/\s/g, '-')
}

export function extractRepositoryHeadings(markdown: string): RepositoryHeading[] {
  const counts = new Map<string, number>()
  const headings: RepositoryHeading[] = []
  let fence = ''
  markdown.split('\n').forEach((line, index) => {
    const fenceMatch = line.match(/^\s*(`{3,}|~{3,})/)
    if (fenceMatch) {
      const marker = fenceMatch[1][0]
      if (!fence) fence = marker
      else if (fence === marker) fence = ''
      return
    }
    if (fence) return
    const match = line.match(/^\s*(#{1,6})\s+(.+?)\s*#*\s*$/)
    if (!match) return
    const text = cleanHeadingText(match[2])
    const base = slugifyRepositoryHeading(text)
    if (!base) return
    const duplicate = counts.get(base) || 0
    counts.set(base, duplicate + 1)
    headings.push({ level: match[1].length, line: index + 1, text, slug: duplicate ? `${base}-${duplicate}` : base })
  })
  return headings
}

function isInsideInlineCode(line: string, offset: number) {
  const prefix = line.slice(0, offset)
  return (prefix.match(/(?<!\\)`/g)?.length || 0) % 2 === 1
}

export function extractMarkdownLinks(markdown: string): ParsedMarkdownLink[] {
  const links: ParsedMarkdownLink[] = []
  let fence = ''
  let absoluteOffset = 0
  markdown.split('\n').forEach((line, index) => {
    const fenceMatch = line.match(/^\s*(`{3,}|~{3,})/)
    if (fenceMatch) {
      const marker = fenceMatch[1][0]
      if (!fence) fence = marker
      else if (fence === marker) fence = ''
      absoluteOffset += line.length + 1
      return
    }
    if (!fence) {
      const pattern = /(?<!!)\[([^\]\n]+)\]\(\s*(<[^>\n]+>|[^)\s]+)(?:\s+["'](?:[^"']*)["'])?\s*\)/g
      for (const match of line.matchAll(pattern)) {
        if (match.index === undefined || isInsideInlineCode(line, match.index)) continue
        const rawDestination = match[2]
        const href = rawDestination.startsWith('<') ? rawDestination.slice(1, -1) : rawDestination
        const relativeDestination = match[0].indexOf(rawDestination)
        links.push({
          label: match[1],
          href,
          line: index + 1,
          from: absoluteOffset + match.index,
          to: absoluteOffset + match.index + match[0].length,
          destinationFrom: absoluteOffset + match.index + relativeDestination,
          destinationTo: absoluteOffset + match.index + relativeDestination + rawDestination.length,
        })
      }
    }
    absoluteOffset += line.length + 1
  })
  return links
}

function normalizeRepositoryPath(path: string) {
  const output: string[] = []
  for (const segment of path.replace(/\\/g, '/').split('/')) {
    if (!segment || segment === '.') continue
    if (segment === '..') {
      if (!output.length) return null
      output.pop()
    } else output.push(segment)
  }
  return output.join('/')
}

function parentRepositoryPath(path: string) {
  const index = path.lastIndexOf('/')
  return index < 0 ? '' : path.slice(0, index)
}

export function resolveRepositoryLink(href: string, sourcePath: string): RepositoryLinkResolution {
  const value = href.trim()
  if (!value) return { kind: 'invalid', href, reason: '链接地址为空' }
  if (value.startsWith('//') || EXTERNAL_SCHEME.test(value)) return { kind: 'external', href: value }
  const hashIndex = value.indexOf('#')
  const rawPath = hashIndex < 0 ? value : value.slice(0, hashIndex)
  const fragment = hashIndex < 0 ? '' : decodeLinkPart(value.slice(hashIndex + 1))
  if (rawPath && !MARKDOWN_EXTENSION.test(rawPath.split(/[?#]/)[0])) return { kind: 'external', href: value }
  const decodedPath = decodeLinkPart(rawPath.split('?')[0])
  const joined = !decodedPath
    ? sourcePath
    : decodedPath.startsWith('/')
      ? decodedPath.slice(1)
      : `${parentRepositoryPath(sourcePath)}/${decodedPath}`
  const path = normalizeRepositoryPath(joined)
  if (!path || !MARKDOWN_EXTENSION.test(path)) return { kind: 'invalid', href, reason: '仓库链接必须指向 Markdown 文件' }
  return { kind: 'internal', path, fragment }
}

export function repositoryLinkHref(path: string, fragment = '') {
  const readablePath = path.split('/').map(encodeReadableLinkPart).join('/')
  return `/${readablePath}${fragment ? `#${encodeReadableLinkPart(fragment)}` : ''}`
}

export function repositoryMarkdownLink(label: string, path: string, fragment = '') {
  const safeLabel = label.replace(/([\]\\])/g, '\\$1')
  return `[${safeLabel}](${repositoryLinkHref(path, fragment)})`
}

export function indexRepositoryNote(path: string, markdown: string): RepositoryNoteIndex {
  return {
    path,
    headings: extractRepositoryHeadings(markdown),
    links: extractMarkdownLinks(markdown).map((link) => ({ ...link, resolution: resolveRepositoryLink(link.href, path) })),
  }
}

export function resolveHeading(index: RepositoryNoteIndex | undefined, fragment: string) {
  if (!index || !fragment) return undefined
  const decoded = decodeLinkPart(fragment)
  return index.headings.find((heading) => heading.slug === decoded)
    || index.headings.find((heading) => heading.slug === slugifyRepositoryHeading(decoded))
}

export function rewriteRepositoryLinks(markdown: string, sourcePath: string, oldPath: string, newPath: string, nextSourcePath = sourcePath) {
  const replacements = extractMarkdownLinks(markdown).flatMap((link) => {
    const resolved = resolveRepositoryLink(link.href, sourcePath)
    if (resolved.kind !== 'internal') return []
    if (resolved.path !== oldPath && sourcePath === nextSourcePath) return []
    const targetPath = resolved.path === oldPath ? newPath : resolved.path
    return [{ from: link.destinationFrom, to: link.destinationTo, insert: repositoryLinkHref(targetPath, resolved.fragment) }]
  }).sort((a, b) => b.from - a.from)
  return {
    content: replacements.reduce((value, replacement) => `${value.slice(0, replacement.from)}${replacement.insert}${value.slice(replacement.to)}`, markdown),
    count: replacements.length,
  }
}

export function findMarkdownLinkAt(markdown: string, position: number) {
  return extractMarkdownLinks(markdown).find((link) => position >= link.from && position <= link.to)
}
