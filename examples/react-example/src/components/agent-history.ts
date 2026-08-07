import { loadLocalSetting, saveLocalSetting } from './github-sync'
import type { AgentMessage } from './agent-client'

export interface AgentConversation {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  messages: AgentMessage[]
}

const HISTORY_KEY = 'agent-conversations'

export async function loadAgentConversations() {
  return (await loadLocalSetting<AgentConversation[]>(HISTORY_KEY) || []).sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function saveAgentConversations(conversations: AgentConversation[]) {
  await saveLocalSetting(HISTORY_KEY, conversations.slice(0, 80))
}

export function createConversation(): AgentConversation {
  const now = Date.now()
  return { id: crypto.randomUUID(), title: '新对话', createdAt: now, updatedAt: now, messages: [{ role: 'assistant', content: '你好，我可以基于已缓存的 Markdown 笔记回答问题，或在 Edit 模式中生成可审核的修改。' }] }
}

export function conversationMarkdown(conversation: AgentConversation) {
  const time = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(conversation.createdAt)
  return `# ${conversation.title}\n\n创建于：${time}\n\n${conversation.messages.map((message) => `## ${message.role === 'user' ? '用户' : 'AI Agent'}\n\n${message.content}`).join('\n\n')}`
}
