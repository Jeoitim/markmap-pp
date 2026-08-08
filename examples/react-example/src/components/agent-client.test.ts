import { afterEach, describe, expect, it, vi } from 'vitest'
import { agentClientTestUtils, askAgent } from './agent-client'
import { defaultAgentProviderConfig, providerDefinition, type AgentProviderConfig } from './agent-provider'

const config: AgentProviderConfig = {
  provider: 'deepseek',
  apiKey: 'test-key',
  baseUrl: 'https://example.test/v1',
  model: 'test-model',
  availableModels: [],
  providerProfiles: {},
  maxTokens: 4000,
  temperature: 0.4,
  permissionMode: 'confirm',
  reasoningEnabled: false,
  reasoningEffort: 'medium',
}

function modelResponse(message: Record<string, unknown>) {
  return new Response(JSON.stringify({ choices: [{ message }] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('笔记 Agent 工具循环', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('把工具结果返回模型，并生成受控修改与 Git 提交提案', async () => {
    const replies = [
      modelResponse({
        content: null,
        tool_calls: [
          { id: 'read-1', type: 'function', function: { name: 'read_note', arguments: JSON.stringify({ path: 'notes/plan.md' }) } },
          { id: 'git-1', type: 'function', function: { name: 'read_git_history', arguments: JSON.stringify({ path: 'notes/plan.md' }) } },
        ],
      }),
      modelResponse({
        content: null,
        tool_calls: [
          { id: 'edit-1', type: 'function', function: { name: 'propose_note_change', arguments: JSON.stringify({ path: 'notes/plan.md', action: 'update', content: '# 计划\n\n- 下一步', reason: '补充下一步' }) } },
          { id: 'commit-1', type: 'function', function: { name: 'request_git_commit', arguments: JSON.stringify({ reason: '用户明确要求提交' }) } },
        ],
      }),
      modelResponse({ content: '我已基于当前文件提出修改，并登记了待确认的提交请求。' }),
    ]
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      void input
      void init
      return replies.shift()!
    })
    vi.stubGlobal('fetch', fetchMock)
    const getGitContext = vi.fn(async () => 'abc1234 | user | 2026-08-08 | update plan')

    const result = await askAgent(
      config,
      'edit',
      [{ role: 'user', content: '完善计划并提交' }],
      [{ path: 'notes/plan.md', content: '# 计划', status: 'modified' }],
      '',
      { activePath: 'notes/plan.md', getGitContext },
    )

    expect(result.reply).toContain('待确认')
    expect(result.proposals).toMatchObject([{ path: 'notes/plan.md', action: 'update', reason: '补充下一步' }])
    expect(result.commitRequested).toBe(true)
    expect(result.operations.map((item) => item.tool)).toEqual(['read_note', 'read_git_history', 'propose_note_change', 'request_git_commit'])
    expect(getGitContext).toHaveBeenCalledWith(['notes/plan.md'])
    expect(fetchMock).toHaveBeenCalledTimes(3)
    const secondRequest = JSON.parse(String(fetchMock.mock.calls[1][1]?.body)) as { messages: Array<{ role: string; content?: string }> }
    expect(secondRequest.messages.filter((message) => message.role === 'tool').map((message) => message.content).join('\n')).toContain('# 计划')
    expect(secondRequest.messages.filter((message) => message.role === 'tool').map((message) => message.content).join('\n')).toContain('abc1234')
  })

  it('Chat 模式不向模型暴露写入工具', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { tools: Array<{ function: { name: string } }> }
      expect(body.tools.map((tool) => tool.function.name)).not.toContain('propose_note_change')
      expect(body.tools.map((tool) => tool.function.name)).not.toContain('request_git_commit')
      return modelResponse({ content: '回答' })
    })
    vi.stubGlobal('fetch', fetchMock)

    await askAgent(config, 'chat', [{ role: 'user', content: '解释这个概念' }], [{ path: 'idea.md', content: '# 想法' }])
    expect(fetchMock).toHaveBeenCalledOnce()
  })
})

describe('Agent 默认模型预算', () => {
  it('为支持工具调用的默认模型提供 16K 输出空间', () => {
    expect(providerDefinition('deepseek').model).toBe('deepseek-v4-flash')
    expect(defaultAgentProviderConfig.model).toBe('deepseek-v4-flash')
    expect(defaultAgentProviderConfig.maxTokens).toBe(16000)
  })
})

describe('笔记检索与提示词', () => {
  it('搜索结果包含文件和准确行号', () => {
    expect(agentClientTestUtils.searchFiles([
      { path: 'a.md', content: '# 标题\n第一行\n关键概念在这里' },
      { path: 'b.md', content: '没有匹配' },
    ], '关键概念', '')).toEqual([{ path: 'a.md', line: 3, text: '关键概念在这里' }])
  })

  it('提示词要求融合知识而非机械总结，并保留操作记忆', () => {
    const prompt = agentClientTestUtils.systemPrompt('chat', [{ path: 'idea.md', content: '正文' }], {
      activePath: 'idea.md',
      operationMemory: [{ tool: 'read_note', summary: '读取了 idea.md', at: 1 }],
    })
    expect(prompt).toContain('笔记是用户资料和一手上下文，不是你知识的边界')
    expect(prompt).toContain('避免机械复述')
    expect(prompt).toContain('读取了 idea.md')
  })

  it('为 Anthropic 和 Gemini 合并同一轮的多个工具结果', () => {
    const messages = [
      { role: 'assistant' as const, content: '', toolCalls: [
        { id: 'one', name: 'read_note', arguments: { path: 'a.md' } },
        { id: 'two', name: 'read_git_history', arguments: {} },
      ] },
      { role: 'tool' as const, content: 'note', toolCallId: 'one', toolName: 'read_note' },
      { role: 'tool' as const, content: 'history', toolCallId: 'two', toolName: 'read_git_history' },
    ]
    const anthropic = agentClientTestUtils.anthropicMessages(messages) as Array<{ role: string; content: unknown[] }>
    const gemini = agentClientTestUtils.geminiContents(messages) as Array<{ role: string; parts: unknown[] }>
    expect(anthropic).toHaveLength(2)
    expect(anthropic[1]).toMatchObject({ role: 'user' })
    expect(anthropic[1].content).toHaveLength(2)
    expect(gemini).toHaveLength(2)
    expect(gemini[1]).toMatchObject({ role: 'user' })
    expect(gemini[1].parts).toHaveLength(2)
  })
})
