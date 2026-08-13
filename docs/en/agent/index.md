---
title: Agent knowledge and repository actions
outline: deep
---

# Agent knowledge and repository actions

Agent is markmap++'s built-in note knowledge partner. It can read the current note, search cached repository Markdown on demand, combine notes with general model knowledge and generate reviewable file changes in Edit mode.

## Get started

1. Open the **Agent** tab in the left workspace.
2. Open settings and choose an AI provider.
3. Enter the API key, Base URL and model, or fetch the model list.
4. Test the connection and save locally.
5. Return to the conversation, choose Chat or Edit and ask a question.

Built-in providers include OpenAI, Anthropic, Google Gemini, Azure OpenAI, DeepSeek, Groq, Mistral AI, Moonshot / Kimi, Zhipu AI, Tencent Hunyuan, NVIDIA NIM, SiliconFlow, Ollama and custom OpenAI-compatible endpoints. Keys, URLs, models and model lists are stored per provider.

::: warning API key safety
Configuration is stored locally in the current browser. Exported JSON **contains API keys** and must be treated as a sensitive file. Do not upload it to a repository or send it to another person.
:::

## Chat and Edit

| Mode | Good for | Available actions |
| --- | --- | --- |
| Chat | Questions, explanations, summaries, comparisons and cross-note connections | List, search and read notes without editing files |
| Edit | Organizing, adding content, creating notes and cross-file changes | Read real files, propose changes and request a Git commit |

Chat can add general knowledge, counterexamples, derivations and connections. When extra context could be confused with a note, Agent distinguishes recorded notes from general knowledge.

Edit follows an observe → propose → execute workflow. It reads current files, creates a file-by-file Diff and, by default, writes only changes that you accept into the local draft.

## Context and memory

The Agent toolbar shows the current note path, Git branch, cached note count, repository Markdown count and pending local changes. Conversations retain questions, answer versions, approved changes and recent tool operations, while file contents and Git state always come from the current workspace.

The edit scope can be:

- **Current file**: analyze only the open Markdown file.
- **Workspace notes**: search cached files; load all notes first when needed.

## Review changes and commit

1. Describe the goal, such as “organize this note and add two counterexamples.”
2. Agent searches and reads relevant notes while showing live operations.
3. Each file receives an expandable Diff.
4. Accept or reject each proposal; acceptance writes only a local draft.
5. Ask Agent to commit, or confirm the commit card after reviewing it.
6. If the remote branch changed, the operation stops safely instead of overwriting it.

Action permissions are **Request approval** by default. **Auto-run** can accept changes and commit requests automatically, but important repositories should still be checked before execution.

## Conversation versions and history

- Editing an old question creates a new conversation branch.
- Regenerate stores another answer version.
- `Esc` cancels question editing; `Ctrl/⌘ + Enter` resubmits it.
- History shows Chat / Edit mode, pending review counts and update times.
- Search, rename, delete, export a conversation to Markdown, or import/export all history as JSON.

History stays in the current browser. For migration, export the Agent configuration JSON and conversation-history JSON separately.

## Output length, randomness and reasoning

Advanced settings default to **16,000 tokens** and Temperature **0.3**. Maximum tokens limit a single model response, while Temperature controls variation. Reasoning can be set to low, medium, high, extra high or maximum when the provider supports it.

Provider context windows, output limits, pricing and rate limits still apply. A larger token limit does not automatically improve answer quality.

## Import and export

| Data | Format | Contains keys | Use |
| --- | --- | --- | --- |
| Agent configuration | JSON | Yes | Migrate providers, models and settings |
| Conversation history | JSON | No | Restore conversations and review state |
| Single conversation | Markdown | No | Read, archive or place in a note repository |

Imports are read and stored by the current browser; they are not uploaded to a markmap++ server.

## FAQ

### Why does the answer only cite notes?

Ask Agent to combine the notes with general knowledge, counterexamples and other viewpoints.

### Why did Agent miss a repository note?

Check that the scope is **Workspace notes** and inspect the “loaded x/y” count. Load all notes before asking again.

### Why did a change not appear on GitHub?

Accepting a Diff updates the local draft only. Run repository sync or explicitly request a Git commit.

### Why did fetching models fail?

Check the API key, Base URL and provider. Some compatible services do not expose a model-list endpoint; enter the model name manually and test the connection.
