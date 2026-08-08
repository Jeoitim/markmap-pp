import { diffLines } from 'diff'

export interface AgentDiffLine {
  type: 'context' | 'added' | 'removed'
  content: string
  oldLine?: number
  newLine?: number
}

export interface AgentDiffGap {
  type: 'gap'
  count: number
}

export type AgentDiffRow = AgentDiffLine | AgentDiffGap

function linesOf(value: string) {
  if (!value) return []
  const lines = value.replace(/\r\n/g, '\n').split('\n')
  if (lines.at(-1) === '') lines.pop()
  return lines
}

export function buildAgentDiff(before: string, after: string, contextLines = 3) {
  const lines: AgentDiffLine[] = []
  let oldLine = 1
  let newLine = 1
  for (const change of diffLines(before, after)) {
    for (const content of linesOf(change.value)) {
      if (change.added) {
        lines.push({ type: 'added', content, newLine })
        newLine += 1
      } else if (change.removed) {
        lines.push({ type: 'removed', content, oldLine })
        oldLine += 1
      } else {
        lines.push({ type: 'context', content, oldLine, newLine })
        oldLine += 1
        newLine += 1
      }
    }
  }

  const added = lines.filter((line) => line.type === 'added').length
  const removed = lines.filter((line) => line.type === 'removed').length
  if (!added && !removed) return { rows: [], added, removed }

  const rows: AgentDiffRow[] = []
  for (let index = 0; index < lines.length;) {
    if (lines[index].type !== 'context') {
      rows.push(lines[index])
      index += 1
      continue
    }
    let end = index
    while (end < lines.length && lines[end].type === 'context') end += 1
    const run = lines.slice(index, end)
    if (run.length <= contextLines * 2 + 1) rows.push(...run)
    else rows.push(...run.slice(0, contextLines), { type: 'gap', count: run.length - contextLines * 2 }, ...run.slice(-contextLines))
    index = end
  }

  return {
    rows,
    added,
    removed,
  }
}
