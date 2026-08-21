import { loadLocalSetting, saveLocalSetting } from './github-sync'

export type AgentProviderId = 'openai' | 'anthropic' | 'gemini' | 'mimo' | 'azure' | 'deepseek' | 'groq' | 'mistral' | 'moonshot' | 'zhipu' | 'hunyuan' | 'nvidia' | 'siliconflow' | 'ollama' | 'custom'
export type AgentProtocol = 'openai-compatible' | 'anthropic' | 'gemini'
export type AgentApiProtocol = 'anthropic' | 'openai-chat' | 'openai-responses' | 'gemini'

export interface AgentProviderProfile {
  apiKey: string
  baseUrl: string
  model: string
  availableModels: string[]
  /** 留空时使用当前服务商的默认上游格式。 */
  apiProtocol?: AgentApiProtocol
  /** MiMo Chat Completions 的 force_search。 */
  forceWebSearch?: boolean
}

export interface AgentProviderConfig {
  provider: AgentProviderId
  apiKey: string
  baseUrl: string
  model: string
  availableModels: string[]
  providerProfiles: Partial<Record<AgentProviderId, AgentProviderProfile>>
  maxTokens: number
  temperature: number
  permissionMode: 'confirm' | 'auto'
  reasoningEnabled: boolean
  reasoningEffort: 'low' | 'medium' | 'high' | 'xhigh' | 'max'
  /** 在服务商提供原生搜索时，允许模型按需访问实时互联网。 */
  webSearchEnabled: boolean
  /** 高级设置中的上游格式覆盖；未设置时按服务商和当前功能选择默认格式。 */
  apiProtocol?: AgentApiProtocol
  /** 仅对 MiMo 的 Chat Completions web_search 生效。 */
  forceWebSearch?: boolean
}

export interface ProviderDefinition {
  id: AgentProviderId
  label: string
  protocol: AgentProtocol
  baseUrl: string
  model: string
}

export const providerDefinitions: ProviderDefinition[] = [
  { id: 'openai', label: 'OpenAI', protocol: 'openai-compatible', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4.1-mini' },
  { id: 'anthropic', label: 'Anthropic', protocol: 'anthropic', baseUrl: 'https://api.anthropic.com', model: 'claude-sonnet-4-20250514' },
  { id: 'gemini', label: 'Google Gemini', protocol: 'gemini', baseUrl: 'https://generativelanguage.googleapis.com', model: 'gemini-2.5-flash' },
  { id: 'mimo', label: 'Xiaomi MiMo', protocol: 'openai-compatible', baseUrl: 'https://api.xiaomimimo.com/v1', model: 'mimo-v2.5-pro' },
  { id: 'azure', label: 'Azure OpenAI', protocol: 'openai-compatible', baseUrl: '', model: '' },
  { id: 'deepseek', label: 'DeepSeek', protocol: 'openai-compatible', baseUrl: 'https://api.deepseek.com', model: 'deepseek-v4-flash' },
  { id: 'groq', label: 'Groq', protocol: 'openai-compatible', baseUrl: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile' },
  { id: 'mistral', label: 'Mistral AI', protocol: 'openai-compatible', baseUrl: 'https://api.mistral.ai/v1', model: 'mistral-small-latest' },
  { id: 'moonshot', label: 'Moonshot / Kimi', protocol: 'openai-compatible', baseUrl: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' },
  { id: 'zhipu', label: '智谱 AI / GLM', protocol: 'openai-compatible', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash' },
  { id: 'hunyuan', label: '腾讯混元', protocol: 'openai-compatible', baseUrl: '', model: '' },
  { id: 'nvidia', label: 'NVIDIA NIM', protocol: 'openai-compatible', baseUrl: 'https://integrate.api.nvidia.com/v1', model: '' },
  { id: 'siliconflow', label: '硅基流动', protocol: 'openai-compatible', baseUrl: 'https://api.siliconflow.cn/v1', model: '' },
  { id: 'ollama', label: 'Ollama（本地）', protocol: 'openai-compatible', baseUrl: 'http://localhost:11434/v1', model: '' },
  { id: 'custom', label: '自定义', protocol: 'openai-compatible', baseUrl: '', model: '' },
]

const STORAGE_KEY = 'agent-provider-config'

export const defaultAgentProviderConfig: AgentProviderConfig = {
  provider: 'deepseek', apiKey: '', baseUrl: 'https://api.deepseek.com', model: 'deepseek-v4-flash', availableModels: [], providerProfiles: {}, maxTokens: 16000, temperature: 0.3, permissionMode: 'confirm', reasoningEnabled: false, reasoningEffort: 'medium', webSearchEnabled: true, forceWebSearch: false,
}

export function providerDefinition(id: AgentProviderId) {
  return providerDefinitions.find((item) => item.id === id) || providerDefinitions.at(-1)!
}

export function providerProtocol(config: AgentProviderConfig) {
  return providerDefinition(config.provider).protocol
}

const apiProtocols = new Set<AgentApiProtocol>(['anthropic', 'openai-chat', 'openai-responses', 'gemini'])

/**
 * 返回未手动覆盖时的默认请求格式。
 * MiMo 保持已验证的 Chat Completions；OpenAI、Azure 和普通 DeepSeek
 * 在启用其 Responses 原生搜索时沿用 Responses，否则保持 Chat Completions。
 */
export function defaultAgentApiProtocol(config: Pick<AgentProviderConfig, 'provider' | 'baseUrl' | 'model' | 'webSearchEnabled'>): AgentApiProtocol {
  const baseUrl = config.baseUrl.trim().toLowerCase()
  if (config.provider === 'anthropic' || (config.provider === 'deepseek' && baseUrl.includes('/anthropic'))) return 'anthropic'
  if (config.provider === 'gemini') return 'gemini'
  if (config.provider === 'mimo') return 'openai-chat'
  if (config.webSearchEnabled && (config.provider === 'openai' || config.provider === 'azure' || (config.provider === 'deepseek' && nativeWebSearchProvider(config) === 'deepseek'))) return 'openai-responses'
  return 'openai-chat'
}

export function agentApiProtocol(config: Pick<AgentProviderConfig, 'provider' | 'baseUrl' | 'model' | 'webSearchEnabled' | 'apiProtocol'>): AgentApiProtocol {
  return config.apiProtocol && apiProtocols.has(config.apiProtocol) ? config.apiProtocol : defaultAgentApiProtocol(config)
}

export type NativeWebSearchProvider = 'openai' | 'anthropic' | 'gemini' | 'mimo' | 'groq' | 'moonshot' | 'azure' | 'deepseek'

/**
 * 返回当前配置能使用的服务商原生联网搜索协议。
 * OpenAI 的原生搜索走 Responses API；Anthropic 走 server-side web_search；
 * Gemini 2.0、2.5 和 3 系列使用 Gemini Native generateContent 的 Google Search grounding；
 * MiMo 使用其 OpenAI-compatible Chat Completions web_search 扩展；
 * Groq 只启用官方支持与本地函数工具并用的 GPT-OSS browser_search。
 * Groq Compound 虽然有原生搜索，但官方不支持自定义工具，不能用于当前仓库 Agent。
 * Moonshot/Kimi 使用其 Chat Completions builtin_function `$web_search`。
 * Azure OpenAI 使用 Responses API 的 `web_search_preview` 工具。
 * DeepSeek 的普通 OpenAI 入口使用 Responses API 的 web_search；
 * Anthropic 兼容入口使用 Messages API 的 server-side web_search。
 */
export function nativeWebSearchProvider(config: Pick<AgentProviderConfig, 'provider' | 'model' | 'baseUrl'>): NativeWebSearchProvider | null {
  if (config.provider === 'openai') return 'openai'
  if (config.provider === 'anthropic') return 'anthropic'
  if (config.provider === 'gemini' && /^gemini-(?:2\.0|2\.5|3)(?:[.-]|$)/i.test(config.model.trim())) return 'gemini'
  const model = config.model.trim().toLowerCase()
  const baseUrl = config.baseUrl.trim().toLowerCase()
  if ((config.provider === 'mimo' || baseUrl.includes('xiaomimimo.com')) && /^mimo-v2\.5(?:-pro)?$/.test(model)) return 'mimo'
  if ((config.provider === 'groq' || baseUrl.includes('api.groq.com')) && /^openai\/gpt-oss-(?:20b|120b)$/.test(model)) return 'groq'
  if ((config.provider === 'moonshot' || baseUrl.includes('moonshot')) && /^kimi-k(?:3|2\.6|2\.5)$/.test(model)) return 'moonshot'
  if ((config.provider === 'azure' || baseUrl.includes('.openai.azure.com')) && Boolean(model) && Boolean(baseUrl)) return 'azure'
  if ((config.provider === 'deepseek' || baseUrl.includes('api.deepseek.com')) && /^deepseek-v4-(?:pro|flash)(?:\[1m\])?$/.test(model)) return 'deepseek'
  return null
}

export function supportsNativeWebSearch(config: Pick<AgentProviderConfig, 'provider' | 'model' | 'baseUrl'>) {
  return nativeWebSearchProvider(config) !== null
}

/** 当前手动选择的 API 格式是否仍然能使用该服务商的原生搜索。 */
export function nativeWebSearchProviderForProtocol(config: AgentProviderConfig): NativeWebSearchProvider | null {
  const provider = nativeWebSearchProvider(config)
  if (!provider) return null
  const protocol = agentApiProtocol(config)
  const supportedProtocols: Record<NativeWebSearchProvider, AgentApiProtocol> = {
    openai: 'openai-responses',
    anthropic: 'anthropic',
    gemini: 'gemini',
    mimo: 'openai-chat',
    groq: 'openai-chat',
    moonshot: 'openai-chat',
    azure: 'openai-responses',
    deepseek: config.baseUrl.trim().toLowerCase().includes('/anthropic') ? 'anthropic' : 'openai-responses',
  }
  return supportedProtocols[provider] === protocol ? provider : null
}

export function supportsNativeWebSearchForProtocol(config: AgentProviderConfig) {
  return nativeWebSearchProviderForProtocol(config) !== null
}

export async function loadAgentProviderConfig() {
  return { ...defaultAgentProviderConfig, ...(await loadLocalSetting<Partial<AgentProviderConfig>>(STORAGE_KEY) || {}) }
}

export async function saveAgentProviderConfig(config: AgentProviderConfig) {
  await saveLocalSetting(STORAGE_KEY, config)
}

function endpoint(baseUrl: string, suffix: string) {
  return `${baseUrl.replace(/\/$/, '')}${suffix}`
}

export async function fetchProviderModels(config: AgentProviderConfig): Promise<string[]> {
  if (!config.baseUrl.trim()) throw new Error('请先填写 Base URL')
  if (!config.apiKey.trim() && config.provider !== 'ollama') throw new Error('请先填写 API 密钥')
  const protocol = agentApiProtocol(config)
  if (protocol === 'gemini') {
    const response = await fetch(endpoint(config.baseUrl, `/v1beta/models?key=${encodeURIComponent(config.apiKey)}`))
    if (!response.ok) throw new Error(`获取模型失败：${response.status}`)
    const result = await response.json() as { models?: Array<{ name?: string; supportedGenerationMethods?: string[] }> }
    return (result.models || []).filter((item) => item.supportedGenerationMethods?.includes('generateContent')).map((item) => item.name?.replace(/^models\//, '') || '').filter(Boolean)
  }
  const isMimo = config.provider === 'mimo' || config.baseUrl.trim().toLowerCase().includes('xiaomimimo.com')
  const headers: Record<string, string> = protocol === 'anthropic'
    ? { 'x-api-key': config.apiKey, 'anthropic-version': '2023-06-01' }
    : { Authorization: `Bearer ${config.apiKey}`, ...(isMimo ? { 'api-key': config.apiKey } : {}) }
  const response = await fetch(endpoint(config.baseUrl, protocol === 'anthropic' ? '/v1/models?limit=100' : '/models'), { headers })
  if (!response.ok) throw new Error(`获取模型失败：${response.status}`)
  const result = await response.json() as { data?: Array<{ id?: string; name?: string }> }
  return (result.data || []).map((item) => item.id || item.name || '').filter(Boolean)
}
