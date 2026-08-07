import { loadLocalSetting, saveLocalSetting } from './github-sync'

export type AgentProviderId = 'openai' | 'anthropic' | 'gemini' | 'azure' | 'deepseek' | 'groq' | 'mistral' | 'moonshot' | 'zhipu' | 'hunyuan' | 'nvidia' | 'siliconflow' | 'ollama' | 'custom'
export type AgentProtocol = 'openai-compatible' | 'anthropic' | 'gemini'

export interface AgentProviderProfile {
  apiKey: string
  baseUrl: string
  model: string
  availableModels: string[]
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
  { id: 'azure', label: 'Azure OpenAI', protocol: 'openai-compatible', baseUrl: '', model: '' },
  { id: 'deepseek', label: 'DeepSeek', protocol: 'openai-compatible', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
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
  provider: 'deepseek', apiKey: '', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat', availableModels: [], providerProfiles: {}, maxTokens: 8000, temperature: 0.3, permissionMode: 'confirm', reasoningEnabled: false, reasoningEffort: 'medium',
}

export function providerDefinition(id: AgentProviderId) {
  return providerDefinitions.find((item) => item.id === id) || providerDefinitions.at(-1)!
}

export function providerProtocol(config: AgentProviderConfig) {
  return providerDefinition(config.provider).protocol
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
  const protocol = providerProtocol(config)
  if (protocol === 'gemini') {
    const response = await fetch(endpoint(config.baseUrl, `/v1beta/models?key=${encodeURIComponent(config.apiKey)}`))
    if (!response.ok) throw new Error(`获取模型失败：${response.status}`)
    const result = await response.json() as { models?: Array<{ name?: string; supportedGenerationMethods?: string[] }> }
    return (result.models || []).filter((item) => item.supportedGenerationMethods?.includes('generateContent')).map((item) => item.name?.replace(/^models\//, '') || '').filter(Boolean)
  }
  const headers: Record<string, string> = protocol === 'anthropic'
    ? { 'x-api-key': config.apiKey, 'anthropic-version': '2023-06-01' }
    : { Authorization: `Bearer ${config.apiKey}` }
  const response = await fetch(endpoint(config.baseUrl, protocol === 'anthropic' ? '/v1/models?limit=100' : '/models'), { headers })
  if (!response.ok) throw new Error(`获取模型失败：${response.status}`)
  const result = await response.json() as { data?: Array<{ id?: string; name?: string }> }
  return (result.data || []).map((item) => item.id || item.name || '').filter(Boolean)
}
