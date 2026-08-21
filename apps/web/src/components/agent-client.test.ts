import { afterEach, describe, expect, it, vi } from 'vitest'
import { agentClientTestUtils, askAgent } from './agent-client'
import { agentApiProtocol, defaultAgentApiProtocol, defaultAgentProviderConfig, nativeWebSearchProvider, nativeWebSearchProviderForProtocol, providerDefinition, supportsNativeWebSearch, supportsNativeWebSearchForProtocol, type AgentProviderConfig } from './agent-provider'

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
  webSearchEnabled: false,
}

function modelResponse(message: Record<string, unknown>) {
  return new Response(JSON.stringify({ choices: [{ message }] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function modelStreamResponse(chunks: Array<Record<string, unknown>>) {
  const body = [...chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`), 'data: [DONE]\n\n'].join('')
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
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
    const onOperation = vi.fn()

    const result = await askAgent(
      config,
      'edit',
      [{ role: 'user', content: '完善计划并提交' }],
      [{ path: 'notes/plan.md', content: '# 计划', status: 'modified' }],
      '',
      { activePath: 'notes/plan.md', getGitContext, onOperation },
    )

    expect(result.reply).toContain('待确认')
    expect(result.proposals).toMatchObject([{ path: 'notes/plan.md', action: 'update', reason: '补充下一步' }])
    expect(result.commitRequested).toBe(true)
    expect(result.operations.map((item) => item.tool)).toEqual(['read_note', 'read_git_history', 'propose_note_change', 'request_git_commit'])
    expect(onOperation.mock.calls.map(([operation]) => `${operation.tool}:${operation.status}`)).toEqual([
      'read_note:running', 'read_note:succeeded',
      'read_git_history:running', 'read_git_history:succeeded',
      'propose_note_change:running', 'propose_note_change:succeeded',
      'request_git_commit:running', 'request_git_commit:succeeded',
    ])
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
    expect(providerDefinition('deepseek').baseUrl).toBe('https://api.deepseek.com')
    expect(defaultAgentProviderConfig.model).toBe('deepseek-v4-flash')
    expect(defaultAgentProviderConfig.baseUrl).toBe('https://api.deepseek.com')
    expect(defaultAgentProviderConfig.maxTokens).toBe(16000)
  })

  it('识别 MiMo、Groq GPT-OSS 和 DeepSeek Responses 的原生搜索模型', () => {
    expect(nativeWebSearchProvider({ provider: 'mimo', baseUrl: 'https://api.xiaomimimo.com/v1', model: 'mimo-v2.5-pro' })).toBe('mimo')
    expect(supportsNativeWebSearch({ provider: 'custom', baseUrl: 'https://api.xiaomimimo.com/v1', model: 'mimo-v2.5' })).toBe(true)
    expect(nativeWebSearchProvider({ provider: 'groq', baseUrl: 'https://api.groq.com/openai/v1', model: 'openai/gpt-oss-120b' })).toBe('groq')
    expect(nativeWebSearchProvider({ provider: 'moonshot', baseUrl: 'https://api.moonshot.cn/v1', model: 'kimi-k3' })).toBe('moonshot')
    expect(nativeWebSearchProvider({ provider: 'deepseek', baseUrl: 'https://api.deepseek.com/anthropic', model: 'deepseek-v4-flash' })).toBe('deepseek')
    expect(nativeWebSearchProvider({ provider: 'deepseek', baseUrl: 'https://api.deepseek.com', model: 'deepseek-v4-flash' })).toBe('deepseek')
    expect(nativeWebSearchProvider({ provider: 'deepseek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-v4-pro' })).toBe('deepseek')
    expect(nativeWebSearchProvider({ provider: 'deepseek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' })).toBeNull()
  })

  it('保留 MiMo Chat Completions 默认值，并允许高级设置覆盖上游格式', () => {
    const mimoConfig: AgentProviderConfig = { ...config, provider: 'mimo', baseUrl: 'https://api.xiaomimimo.com/v1', model: 'mimo-v2.5-pro', webSearchEnabled: true }
    expect(defaultAgentApiProtocol(mimoConfig)).toBe('openai-chat')
    expect(agentApiProtocol(mimoConfig)).toBe('openai-chat')
    expect(agentApiProtocol({ ...mimoConfig, apiProtocol: 'openai-responses' })).toBe('openai-responses')
    expect(nativeWebSearchProviderForProtocol(mimoConfig)).toBe('mimo')
    expect(nativeWebSearchProviderForProtocol({ ...mimoConfig, apiProtocol: 'openai-responses' })).toBeNull()
    expect(defaultAgentApiProtocol({ ...config, provider: 'openai', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4.1-mini', webSearchEnabled: false })).toBe('openai-chat')
  })

  it('识别 Gemini 2.5 的 Native generateContent 搜索与 grounding 来源', async () => {
    const geminiConfig: AgentProviderConfig = { ...config, provider: 'gemini', baseUrl: 'https://generativelanguage.googleapis.com', model: 'gemini-2.5-flash', webSearchEnabled: true }
    expect(supportsNativeWebSearchForProtocol(geminiConfig)).toBe(true)
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { tools: Array<Record<string, unknown>> }
      expect(body.tools.some((tool) => tool.google_search !== undefined)).toBe(true)
      return new Response(JSON.stringify({
        candidates: [{
          content: { parts: [{ text: 'Gemini 搜索回答。' }] },
          groundingMetadata: {
            webSearchQueries: ['Gemini 最新资料'],
            groundingChunks: [{ web: { uri: 'https://ai.google.dev/gemini-api/docs', title: 'Gemini API 文档' } }],
          },
        }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await askAgent(geminiConfig, 'chat', [{ role: 'user', content: '查一下 Gemini 最新资料' }], [])

    expect(result.webSearchUsed).toBe(true)
    expect(result.webSearchQueries).toEqual(['Gemini 最新资料'])
    expect(result.sources).toEqual([{ title: 'Gemini API 文档', url: 'https://ai.google.dev/gemini-api/docs' }])
    expect(result.reply).toContain('Gemini 搜索回答')
  })

  it('普通 DeepSeek OpenAI 入口使用 Responses 的原生 web_search', async () => {
    const deepSeekConfig: AgentProviderConfig = { ...config, baseUrl: 'https://api.deepseek.com', model: 'deepseek-v4-flash', reasoningEnabled: true, webSearchEnabled: true }
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('https://api.deepseek.com/responses')
      const body = JSON.parse(String(init?.body)) as { tools: Array<Record<string, unknown>>; instructions: string; input: Array<Record<string, unknown>>; reasoning?: { effort: string }; include?: string[] }
      expect(body.tools.some((tool) => tool.type === 'web_search')).toBe(true)
      expect(body.include).toContain('web_search_call.action.sources')
      expect(body.instructions).toContain('工具名是 `web_search`')
      expect(body.input).toMatchObject([{ role: 'user', content: '查一下最新资料' }])
      expect(body.reasoning).toEqual({ effort: 'medium' })
      return new Response(JSON.stringify({
        output: [
          { type: 'reasoning', content: '先核验实时资料，再整理成回答。' },
          { type: 'web_search_call', action: { type: 'search', queries: ['最新资料'], sources: [{ title: 'DeepSeek 官方文档', url: 'https://api-docs.deepseek.com/guides/responses_api/' }] } },
          { type: 'message', annotations: [{ type: 'url_citation', url_citation: { title: 'DeepSeek 官方文档', url: 'https://api-docs.deepseek.com/guides/responses_api/' } }], content: [{ type: 'output_text', text: '这是 DeepSeek Responses 搜索后的回答。' }] },
        ],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await askAgent(deepSeekConfig, 'chat', [{ role: 'user', content: '查一下最新资料' }], [])

    expect(result.webSearchUsed).toBe(true)
    expect(result.webSearchQueries).toEqual(['最新资料'])
    expect(result.sources).toEqual([{ title: 'DeepSeek 官方文档', url: 'https://api-docs.deepseek.com/guides/responses_api/' }])
    expect(result.reasoningSummary).toContain('先核验实时资料')
    expect(result.reasoningPreview).toBeUndefined()
    expect(result.reply).toContain('DeepSeek Responses')
  })

  it('只有 Responses 明确返回摘要时才显示摘要行', async () => {
    const deepSeekConfig: AgentProviderConfig = { ...config, baseUrl: 'https://api.deepseek.com', model: 'deepseek-v4-flash', reasoningEnabled: true, webSearchEnabled: true }
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      output: [
        { type: 'reasoning', content: '完整思考第一行。\n完整思考第二行。', summary: [{ type: 'summary_text', text: '思考摘要第一行。\n思考摘要第二行。' }] },
        { type: 'message', content: [{ type: 'output_text', text: '带摘要的回答。' }] },
      ],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await askAgent(deepSeekConfig, 'chat', [{ role: 'user', content: '解释一下' }], [])

    expect(result.reasoningSummary).toContain('完整思考第一行。\n完整思考第二行。')
    expect(result.reasoningPreview).toBe('思考摘要第一行。\n思考摘要第二行。')
  })

  it('按 Kimi 官方 builtin_function 流程回传搜索参数，并继续生成最终回答', async () => {
    const moonshotConfig: AgentProviderConfig = { ...config, provider: 'moonshot', baseUrl: 'https://api.moonshot.cn/v1', model: 'kimi-k3', webSearchEnabled: true }
    const replies = [
      modelResponse({ content: null, tool_calls: [{ id: 'search-1', type: 'builtin_function', function: { name: '$web_search', arguments: JSON.stringify({ query: '最新的 MiMo 搜索能力' }) } }] }),
      modelResponse({ content: '这是 Kimi 搜索后的回答。' }),
    ]
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { tools: Array<Record<string, unknown>>; messages: Array<{ role: string; name?: string; content?: string }> }
      expect(body.tools.some((tool) => tool.type === 'builtin_function' && (tool.function as Record<string, unknown>)?.name === '$web_search')).toBe(true)
      if (body.messages.some((message) => message.role === 'tool')) expect(body.messages.find((message) => message.role === 'tool')).toMatchObject({ name: '$web_search', content: '{"query":"最新的 MiMo 搜索能力"}' })
      return replies.shift()!
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await askAgent(moonshotConfig, 'chat', [{ role: 'user', content: '搜索一下' }], [])

    expect(result.webSearchUsed).toBe(true)
    expect(result.webSearchQueries).toEqual(['最新的 MiMo 搜索能力'])
    expect(result.operations).toMatchObject([{ tool: '$web_search', status: 'succeeded' }])
    expect(result.reply).toContain('Kimi 搜索')
  })
})

describe('DeepSeek Anthropic 兼容联网搜索', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('识别官方 Anthropic 入口并使用服务端 web_search', async () => {
    const deepSeekConfig: AgentProviderConfig = { ...config, provider: 'deepseek', baseUrl: 'https://api.deepseek.com/anthropic', model: 'deepseek-v4-flash', webSearchEnabled: true }
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('https://api.deepseek.com/anthropic/v1/messages')
      const body = JSON.parse(String(init?.body)) as { tools: Array<Record<string, unknown>> }
      expect(body.tools.some((tool) => tool.type === 'web_search_20250305' && tool.name === 'web_search')).toBe(true)
      return new Response(JSON.stringify({
        content: [
          { type: 'server_tool_use', name: 'web_search', input: { query: '最新资料' } },
          { type: 'web_search_tool_result', content: [{ type: 'web_search_result', title: 'DeepSeek 官方文档', url: 'https://api-docs.deepseek.com/quick_start/agent_integrations/claude_code' }] },
          { type: 'text', text: '这是 DeepSeek 搜索后的回答。' },
        ],
        stop_reason: 'end_turn',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await askAgent(deepSeekConfig, 'chat', [{ role: 'user', content: '查一下最新资料' }], [])

    expect(result.webSearchUsed).toBe(true)
    expect(result.webSearchQueries).toEqual(['最新资料'])
    expect(result.sources).toEqual([{ title: 'DeepSeek 官方文档', url: 'https://api-docs.deepseek.com/quick_start/agent_integrations/claude_code' }])
    expect(result.reply).toContain('DeepSeek 搜索')
  })
})

describe('MiMo 原生联网搜索', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('发送 MiMo web_search 工具并展示服务商返回的来源', async () => {
    const mimoConfig: AgentProviderConfig = { ...config, provider: 'mimo', baseUrl: 'https://api.xiaomimimo.com/v1', model: 'mimo-v2.5-pro', reasoningEnabled: true, webSearchEnabled: true }
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { tools: Array<Record<string, unknown>>; tool_choice: string; thinking: { type: string }; max_completion_tokens: number; stream: boolean }
      expect(body.tool_choice).toBe('auto')
      expect(body.thinking).toEqual({ type: 'enabled' })
      expect(body.max_completion_tokens).toBe(4000)
      expect(body.stream).toBe(true)
      expect(body.tools.some((tool) => tool.type === 'web_search' && tool.max_keyword === 3 && tool.force_search === false && tool.limit === 1)).toBe(true)
      expect((init?.headers as Record<string, string>)['api-key']).toBe('test-key')
      expect((init?.headers as Record<string, string>).Authorization).toBeUndefined()
      return modelResponse({ content: '这是带来源的实时回答。', reasoning_content: '第一步：判断是否需要联网。\n第二步：整理搜索结果。', tool_calls: [{ id: 'mimo-search-1', type: 'function', function: { name: 'web_search', arguments: JSON.stringify({ query: '最新资料' }) } }], annotations: [{ type: 'url_citation', title: 'MiMo Web Search', url: 'https://mimo.mi.com/docs/zh-CN/usage-guide/tool-calling/web-search' }] })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await askAgent(mimoConfig, 'chat', [{ role: 'user', content: '查一下最新资料' }], [])

    expect(result.webSearchUsed).toBe(true)
    expect(result.sources).toEqual([{ title: 'MiMo Web Search', url: 'https://mimo.mi.com/docs/zh-CN/usage-guide/tool-calling/web-search' }])
    expect(result.reasoningSummary).toContain('第一步：判断是否需要联网。\n第二步：整理搜索结果。')
    expect(result.reasoningPreview).toBeUndefined()
    expect(result.operations).toMatchObject([{ tool: 'web_search', summary: '搜索了“最新资料”', status: 'succeeded' }])
    expect(result.reply).toContain('实时回答')
  })

  it('MiMo 强制联网开关映射为 force_search', async () => {
    const mimoConfig: AgentProviderConfig = { ...config, provider: 'mimo', baseUrl: 'https://api.xiaomimimo.com/v1', model: 'mimo-v2.5-pro', reasoningEnabled: false, webSearchEnabled: true, forceWebSearch: true }
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { tools: Array<Record<string, unknown>>; thinking: { type: string } }
      expect(body.thinking).toEqual({ type: 'disabled' })
      expect(body.tools).toContainEqual({ type: 'web_search', max_keyword: 3, force_search: true, limit: 1 })
      return modelResponse({ content: '强制搜索后的回答。' })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await askAgent(mimoConfig, 'chat', [{ role: 'user', content: '强制查一下' }], [])

    expect(result.reply).toContain('强制搜索')
  })

  it('MiMo 可切换 Responses API，但默认不注入未验证的 web_search 扩展', async () => {
    const mimoConfig: AgentProviderConfig = { ...config, provider: 'mimo', baseUrl: 'https://api.xiaomimimo.com/v1', model: 'mimo-v2.5-pro', apiProtocol: 'openai-responses', reasoningEnabled: false, webSearchEnabled: true }
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('https://api.xiaomimimo.com/v1/responses')
      expect((init?.headers as Record<string, string>)['api-key']).toBe('test-key')
      const body = JSON.parse(String(init?.body)) as { tools: Array<Record<string, unknown>>; reasoning?: { effort: string } }
      expect(body.tools.some((tool) => tool.type === 'web_search')).toBe(false)
      expect(body.reasoning).toEqual({ effort: 'none' })
      return new Response(JSON.stringify({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'MiMo Responses 回答。' }] }] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await askAgent(mimoConfig, 'chat', [{ role: 'user', content: '测试 Responses' }], [])

    expect(result.webSearchUsed).toBeUndefined()
    expect(result.reply).toContain('MiMo Responses')
  })

  it('流式 MiMo 先显示搜索来源，再继续输出回答', async () => {
    const mimoConfig: AgentProviderConfig = { ...config, provider: 'mimo', baseUrl: 'https://api.xiaomimimo.com/v1', model: 'mimo-v2.5-pro', reasoningEnabled: true, webSearchEnabled: true }
    const events: string[] = []
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { stream: boolean }
      expect(body.stream).toBe(true)
      return modelStreamResponse([
        { choices: [{ delta: { query: '奥德赛', annotations: [{ type: 'url_citation', title: '搜索来源', url: 'https://example.com/odyssey' }] } }] },
        { choices: [{ delta: { reasoning_content: '先核对公开资料。' } }] },
        { choices: [{ delta: { content: '这是' } }] },
        { choices: [{ delta: { content: '流式回答。' } }] },
      ])
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await askAgent(mimoConfig, 'chat', [{ role: 'user', content: '查一下奥德赛' }], [], '', {
      onWebSearch: () => events.push('search'),
      onDelta: (delta) => { if (delta.content) events.push('content') },
    })

    expect(events.indexOf('search')).toBeGreaterThanOrEqual(0)
    expect(events.indexOf('search')).toBeLessThan(events.indexOf('content'))
    expect(result.sources).toEqual([{ title: '搜索来源', url: 'https://example.com/odyssey' }])
    expect(result.reply).toBe('这是流式回答。')
  })

  it('关闭 MiMo 思考时明确发送 disabled，并保留界面过滤推理内容所需的状态', async () => {
    const mimoConfig: AgentProviderConfig = { ...config, provider: 'mimo', baseUrl: 'https://api.xiaomimimo.com/v1', model: 'mimo-v2.5-pro', reasoningEnabled: false, webSearchEnabled: false }
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { thinking: { type: string }; tools: Array<Record<string, unknown>> }
      expect(body.thinking).toEqual({ type: 'disabled' })
      expect(body.tools.some((tool) => tool.type === 'web_search')).toBe(false)
      return modelResponse({ content: '关闭思考后的回答。', reasoning_content: '这段内容不应该被界面当作思考展示。' })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await askAgent(mimoConfig, 'chat', [{ role: 'user', content: '直接回答' }], [])

    expect(result.reply).toContain('关闭思考')
    expect(result.reasoningSummary).toContain('这段内容不应该被界面当作思考展示。')
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('MiMo 关闭联网搜索时仍保留普通思考配置', async () => {
    const mimoConfig: AgentProviderConfig = { ...config, provider: 'mimo', baseUrl: 'https://api.xiaomimimo.com/v1', model: 'mimo-v2.5-pro', reasoningEnabled: true, webSearchEnabled: false }
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { tools: Array<Record<string, unknown>>; thinking: { type: string }; max_completion_tokens: number }
      expect(body.thinking).toEqual({ type: 'enabled' })
      expect(body.max_completion_tokens).toBe(4000)
      expect(body.tools.some((tool) => tool.type === 'web_search')).toBe(false)
      return modelResponse({ content: '普通 MiMo 回答。' })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await askAgent(mimoConfig, 'chat', [{ role: 'user', content: '解释一下' }], [])

    expect(result.reply).toContain('普通 MiMo')
  })

  it('MiMo 非思考模式允许有进展的检索，并在连续无进展后停止循环', async () => {
    const mimoConfig: AgentProviderConfig = { ...config, provider: 'mimo', baseUrl: 'https://api.xiaomimimo.com/v1', model: 'mimo-v2.5-pro', reasoningEnabled: false, webSearchEnabled: true }
    let requestNumber = 0
    const toolNamesByRequest: string[][] = []
    const queries = ['诺兰', 'Nolan', '奥德赛', '不存在的关键词一', '不存在的关键词二', '不存在的关键词三']
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      requestNumber += 1
      const body = JSON.parse(String(init?.body)) as { tools: Array<{ type?: string; function?: { name?: string } }> }
      toolNamesByRequest.push(body.tools.filter((tool) => tool.type === 'function').map((tool) => tool.function?.name || ''))
      if (requestNumber <= queries.length) {
        return modelResponse({ content: null, tool_calls: [{ id: `search-${requestNumber}`, type: 'function', function: { name: 'search_notes', arguments: JSON.stringify({ query: queries[requestNumber - 1] }) } }] })
      }
      return modelResponse({ content: '最终回答' })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await askAgent(mimoConfig, 'chat', [{ role: 'user', content: '查一下诺兰和奥德赛的资料' }], [{ path: 'film.md', content: '# 诺兰\n## 奥德赛' }])

    expect(result.reply).toBe('最终回答')
    expect(result.operations.filter((operation) => operation.tool === 'search_notes')).toHaveLength(6)
    expect(toolNamesByRequest[2]).toContain('search_notes')
    expect(toolNamesByRequest[6]).not.toContain('search_notes')
    expect(fetchMock).toHaveBeenCalledTimes(7)
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
    expect(prompt).toContain('结合实时工作区、笔记和可靠的通用知识回答问题')
    expect(prompt).toContain('避免机械复述')
    expect(prompt).toContain('读取了 idea.md')
  })

  it('明确告诉模型 MiMo 的服务端搜索不在仓库函数列表中', () => {
    const prompt = agentClientTestUtils.systemPrompt('chat', [], { webSearchEnabled: true, webSearchProvider: 'mimo' })
    expect(prompt).toContain('服务商工具名是 `web_search`')
    expect(prompt).toContain('不属于仓库函数列表')
    expect(prompt).toContain('不要声称没有工具')
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

describe('不同 API 的完整思考链解析', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('Anthropic 没有摘要时只保留可换行展开的完整思考链', async () => {
    const anthropicConfig: AgentProviderConfig = { ...config, provider: 'anthropic', baseUrl: 'https://api.anthropic.com', model: 'claude-sonnet-4-20250514', reasoningEnabled: true, webSearchEnabled: false }
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      content: [
        { type: 'thinking', thinking: '先分析问题。\n再组织答案。' },
        { type: 'text', text: 'Anthropic 回答。' },
      ],
      stop_reason: 'end_turn',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await askAgent(anthropicConfig, 'chat', [{ role: 'user', content: '解释一下' }], [])

    expect(result.reasoningSummary).toContain('先分析问题。\n再组织答案。')
    expect(result.reasoningPreview).toBeUndefined()
  })

  it('Gemini 没有摘要时不把思考链压缩成摘要行', async () => {
    const geminiConfig: AgentProviderConfig = { ...config, provider: 'gemini', baseUrl: 'https://generativelanguage.googleapis.com', model: 'gemini-2.5-flash', reasoningEnabled: true, webSearchEnabled: false }
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ thought: true, text: '第一步思考。\n第二步思考。' }, { text: 'Gemini 回答。' }] } }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await askAgent(geminiConfig, 'chat', [{ role: 'user', content: '解释一下' }], [])

    expect(result.reasoningSummary).toContain('第一步思考。\n第二步思考。')
    expect(result.reasoningPreview).toBeUndefined()
  })
})
