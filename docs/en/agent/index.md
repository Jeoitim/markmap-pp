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

## API formats and web search

Agent settings provide four upstream request formats:

- **Anthropic Messages**
- **OpenAI Chat Completions**
- **OpenAI Responses API**
- **Gemini Native `generateContent`**

Keep **Default** unless a provider explicitly documents another format. The default is selected from the provider, Base URL, model and web-search setting: OpenAI, Azure and ordinary DeepSeek prefer Responses when search is enabled; Anthropic and DeepSeek's `/anthropic` endpoint use Messages; Gemini uses its native API; MiMo and other OpenAI-compatible providers use Chat Completions by default. Use the manual override only when the upstream documentation requires it.

The **Web search** switch is enabled only when markmap++ recognizes the current provider, model and selected API format as compatible. “Supported” here means that the app has implemented the request and response parsing; it does not guarantee that every model, region, account or deployment has access. A provider may also require a console plugin, an entitlement or separate billing.

| Provider | Recommended API | Web search automatically adapted by the app | Notes |
| --- | --- | --- | --- |
| OpenAI | Responses API | `web_search` | Search calls and returned URL sources are shown when available; model and account access still follow OpenAI settings. |
| Anthropic | Anthropic Messages | Server-side `web_search` | Anthropic executes the search and returns citations; the organization may need to enable the tool. A third-party Anthropic-compatible endpoint is not assumed to have the same capability. |
| Google Gemini | Native `generateContent` | `google_search` grounding for Gemini 2.0, 2.5 and 3 models | Sources are read from `groundingMetadata`; other models show that no native search is available. |
| Xiaomi MiMo | OpenAI Chat Completions | `web_search` for `mimo-v2.5` / `mimo-v2.5-pro` | Activate the Web Search plugin in the MiMo console. The **Force web search** switch maps to `force_search` and can increase calls and cost. MiMo Responses can generate normal answers, but the app does not enable its unverified Responses `web_search` extension, so use Chat Completions when search is needed. |
| Azure OpenAI | Responses API | `web_search_preview` | The Azure resource, deployment, region and search permission must be configured; Azure does not use OpenAI's `web_search` name here. |
| DeepSeek | Responses for the regular endpoint; Messages for `/anthropic` | `deepseek-v4-pro` / `deepseek-v4-flash`: `web_search` on the regular endpoint and server-side `web_search` on the Anthropic-compatible endpoint | Use `https://api.deepseek.com` as the regular Base URL without adding `/v1`; use `https://api.deepseek.com/anthropic` for the Anthropic-compatible endpoint. If the provider omits source fields, the panel can only report that search was used and cannot build source cards. |
| Groq | OpenAI Chat Completions | `browser_search` for `openai/gpt-oss-20b` / `openai/gpt-oss-120b` | Only the recognized GPT-OSS models are enabled automatically. Groq Compound is not auto-wired yet because Agent also needs local repository tools. |
| Moonshot / Kimi | OpenAI Chat Completions | `$web_search` for Kimi K3, K2.6 and K2.5 | The model name must match the version available to the account. |
| Mistral AI | OpenAI Chat Completions | Not automatically adapted by the app | OpenAI compatibility covers normal conversation format, not necessarily a native search tool with the same name. |
| Zhipu AI / GLM | OpenAI Chat Completions | Not automatically adapted by the app | A later integration is needed if the provider adds a supported search format. |
| Tencent Hunyuan | OpenAI Chat Completions | Not automatically adapted by the app | Compatible chat endpoints do not cause the app to inject a web tool. |
| NVIDIA NIM | OpenAI Chat Completions | Not automatically adapted by the app | The app does not infer capabilities from the upstream model behind a NIM deployment. |
| SiliconFlow | OpenAI Chat Completions | Not automatically adapted by the app | Even if an aggregated model has its own search feature, the current app does not infer it across providers. |
| Ollama (local) | OpenAI Chat Completions | Not automatically adapted by the app | Local models do not normally have external network access; use a separate local tool or gateway if needed. |
| Custom | OpenAI Chat Completions | Not automatically adapted by the app | You may choose another request format, but the app does not guess a custom endpoint's tool name or source schema. |

### How to verify that search worked

When enabled, Agent shows a web-search operation in the conversation activity area. If the provider returns URLs, citations or grounding sources, the panel also shows an expandable source card. Therefore, “search was used but the provider returned no displayable sources” does not necessarily mean that the search failed.

Web search and repository tools are separate capabilities: `list_notes`, `search_notes` and `read_note` operate on the workspace, while native search is executed by the provider. Enabling search does not automatically turn off reasoning; if a provider recommends disabling or lowering reasoning for search, choose that setting yourself. Search can add latency, input tokens and provider charges.

If a manually selected API format does not match the provider's native search protocol, the search switch is disabled to prevent sending one provider's tool schema through another protocol. Returning to **Default** normally restores it.

Official references: [OpenAI Web search](https://platform.openai.com/docs/guides/tools-web-search), [Anthropic Web search](https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool), [Gemini Google Search grounding](https://ai.google.dev/gemini-api/docs/generate-content/google-search), [MiMo Web Search](https://mimo.mi.com/docs/en-US/usage-guide/tool-calling/web-search), [MiMo Responses API](https://mimo.mi.com/docs/en-US/api/chat/responses), [Azure OpenAI Web search](https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/web-search) and [Groq Browser Search](https://console.groq.com/docs/tool-use/built-in-tools/browser-search).

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
