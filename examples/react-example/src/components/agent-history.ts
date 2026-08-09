import { loadLocalSetting, saveLocalSetting } from './github-sync'
import type { AgentMessage, AgentMode } from './agent-client'

export interface AgentConversation {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  /** 该对话使用的模式，打开对话时恢复，避免上次是 Edit 的对话默认进入 Chat。 */
  mode?: AgentMode
  /** 对话只属于一个明确工作区，避免切换仓库后误用旧提案。 */
  workspaceKey?: string
  messages: AgentMessage[]
}

const HISTORY_KEY = 'agent-conversations'

export async function loadAgentConversations() {
  return (await loadLocalSetting<AgentConversation[]>(HISTORY_KEY) || []).sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function saveAgentConversations(conversations: AgentConversation[]) {
  await saveLocalSetting(HISTORY_KEY, conversations.slice(0, 80))
}

export function createConversation(workspaceKey?: string): AgentConversation {
  const now = Date.now()
  return { id: crypto.randomUUID(), title: '新对话', createdAt: now, updatedAt: now, workspaceKey, messages: [{ role: 'assistant', content: '你好，我会结合你的 Markdown 笔记、当前操作上下文和通用知识来回答；也可以在 Edit 模式中生成可审核、可追踪的文件修改。' }] }
}

export function activeContent(message: AgentMessage): string {
  const version = message.questionVersions?.[message.activeQuestionVersion ?? 0]
  return version?.content ?? message.content
}

/** The visible conversation: question messages followed by the tail of their active question version. */
export function flattenMessages(messages: AgentMessage[]): { message: AgentMessage; path: number[] }[] {
  const out: { message: AgentMessage; path: number[] }[] = []
  const walk = (list: AgentMessage[], prefix: number[]) => {
    list.forEach((message, index) => {
      const path = [...prefix, index]
      out.push({ message, path })
      const active = message.activeQuestionVersion ?? 0
      const tail = message.questionVersions?.[active]?.tail
      if (tail?.length) walk(tail, [...path, active])
    })
  }
  walk(messages, [])
  return out
}

/** Update the message at the given path (nested through question version tails). */
export function updateAtPath(messages: AgentMessage[], path: number[], updater: (message: AgentMessage) => AgentMessage): AgentMessage[] {
  if (path.length === 1) return messages.map((message, index) => index === path[0] ? updater(message) : message)
  const [head, version, ...rest] = path
  return messages.map((message, index) => {
    if (index !== head) return message
    return { ...message, questionVersions: message.questionVersions!.map((item, vi) => vi === version ? { ...item, tail: updateAtPath(item.tail, rest, updater) } : item) }
  })
}

/** Keep everything up to and including the message at the given path; drop the rest. */
export function truncateAtPath(messages: AgentMessage[], path: number[]): AgentMessage[] {
  if (path.length === 1) return messages.slice(0, path[0] + 1)
  const [head, version, ...rest] = path
  return messages.map((message, index) => {
    if (index < head) return message
    if (index > head) return null
    return { ...message, questionVersions: message.questionVersions!.map((item, vi) => vi === version ? { ...item, tail: truncateAtPath(item.tail, rest) } : item) }
  }).filter((message): message is AgentMessage => message !== null)
}

export function conversationMarkdown(conversation: AgentConversation) {
  const time = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(conversation.createdAt)
  const lines = flattenMessages(conversation.messages).map(({ message }) => `## ${message.role === 'user' ? '用户' : 'Agent'}\n\n${activeContent(message)}`)
  return `# ${conversation.title}\n\n创建于：${time}\n\n${lines.join('\n\n')}`
}
