import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  generateCommitMessage,
  pushCachedChanges,
  type CachedMarkdownFile,
  type GitHubConfig,
} from './github-sync'

function cachedFile(path: string, status: CachedMarkdownFile['status'], originalPath = path): CachedMarkdownFile {
  return {
    id: `owner/repo@main:${path}`,
    repoKey: 'owner/repo@main',
    path,
    originalPath,
    content: '# current',
    baseContent: '# original',
    baseSha: 'blob-sha',
    baseCommit: 'commit-sha',
    status,
    updatedAt: 1,
  }
}

describe('GitHub 自动提交信息', () => {
  it('为单个编辑生成 edit 信息', () => {
    expect(generateCommitMessage([cachedFile('maps/plan.md', 'modified')])).toBe('update: edit maps/plan.md')
  })

  it('为重命名保留新旧路径', () => {
    expect(generateCommitMessage([cachedFile('maps/new.md', 'renamed', 'maps/old.md')])).toBe(
      'update: rename maps/old.md to maps/new.md',
    )
  })

  it('把多个文件合并到一次 change 提交', () => {
    expect(generateCommitMessage([
      cachedFile('maps/one.md', 'modified'),
      cachedFile('notes/two.md', 'renamed', 'notes/old.md'),
    ])).toBe('update: change maps/one.md, notes/two.md')
  })
})

describe('GitHub 手动同步', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('把全部本地修改写入一个提交后再更新分支', async () => {
    const replies = [
      { object: { sha: 'base-commit' } },
      { tree: { sha: 'base-tree' } },
      { sha: 'next-tree' },
      { sha: 'next-commit' },
      { object: { sha: 'next-commit' } },
    ]
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(replies.shift()), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)
    const config: GitHubConfig = { owner: 'owner', repo: 'repo', branch: 'main', token: 'test-token' }
    const files = [
      { ...cachedFile('maps/one.md', 'modified'), baseCommit: 'base-commit' },
      { ...cachedFile('notes/new.md', 'renamed', 'notes/old.md'), baseCommit: 'base-commit' },
    ]

    const result = await pushCachedChanges(config, files)

    expect(result).toEqual({ commitSha: 'next-commit', message: 'update: change maps/one.md, notes/new.md' })
    expect(fetchMock).toHaveBeenCalledTimes(5)
    const createCommit = fetchMock.mock.calls[3]
    expect(createCommit[0]).toContain('/git/commits')
    expect(JSON.parse(String(createCommit[1]?.body))).toMatchObject({
      message: 'update: change maps/one.md, notes/new.md',
      tree: 'next-tree',
      parents: ['base-commit'],
    })
    const updateBranch = fetchMock.mock.calls[4]
    expect(updateBranch[0]).toContain('/git/refs/heads/main')
    expect(JSON.parse(String(updateBranch[1]?.body))).toEqual({ sha: 'next-commit', force: false })
  })

  it('远程分支变化时拒绝覆盖', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ object: { sha: 'remote-newer' } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })))
    const config: GitHubConfig = { owner: 'owner', repo: 'repo', branch: 'main', token: 'test-token' }

    await expect(pushCachedChanges(config, [cachedFile('maps/one.md', 'modified')])).rejects.toThrow(
      '远程分支在缓存后已有新提交',
    )
  })
})
