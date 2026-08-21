---
title: Agent 知识问答与仓库操作
outline: deep
---

# Agent 知识问答与仓库操作

Agent 是 markmap++ 内置的笔记知识伙伴。它不仅能阅读当前笔记，还能按需搜索已缓存的仓库 Markdown、结合模型的通用知识回答问题，并在 Edit 模式中生成可审核的文件修改。

## 开始使用

1. 打开左侧编辑区的 **Agent** 页签。
2. 点击右上角配置按钮，选择 AI 服务商。
3. 填写 API 密钥、Base URL 和模型名称，也可以点击“获取模型列表”。
4. 点击“测试连接”，成功后保存到当前浏览器。
5. 返回对话，选择 Chat 或 Edit 模式后开始提问。

内置配置支持 OpenAI、Anthropic、Google Gemini、Azure OpenAI、DeepSeek、Groq、Mistral AI、Moonshot / Kimi、智谱 AI、腾讯混元、NVIDIA NIM、硅基流动、Ollama 和自定义 OpenAI 兼容接口。服务商之间的密钥、地址、模型及模型列表会分别保存，切换时不必重复填写。

## API 格式与联网搜索

Agent 设置提供四种上游请求格式：

- **Anthropic Messages**
- **OpenAI Chat Completions**
- **OpenAI Responses API**
- **Gemini Native `generateContent`**

通常应保留“默认”。默认值会结合服务商、Base URL、模型和联网搜索开关选择：OpenAI、Azure 和普通 DeepSeek 在启用搜索时优先使用 Responses；Anthropic 以及 DeepSeek 的 `/anthropic` 入口使用 Messages；Gemini 使用 Native；MiMo 和其他 OpenAI 兼容服务默认使用 Chat Completions。只有在服务商文档明确要求另一种格式时，才在“高级设置”中手动覆盖。

“联网搜索”只会在当前服务商、模型和所选 API 格式被应用识别为兼容时启用。这里的“支持”表示 markmap++ 已经实现了对应请求和结果解析，不代表服务商的所有模型、区域、账户或部署都一定开通。服务商可能还要求在控制台启用插件、申请权限或单独计费。

| 服务商 | 推荐 API 格式 | 当前应用自动适配的联网搜索 | 使用注意 |
| --- | --- | --- | --- |
| OpenAI | Responses API | `web_search` | 搜索调用和返回的 URL 来源会尽量显示；可用模型与账户权限仍以 OpenAI 控制台为准。 |
| Anthropic | Anthropic Messages | server-side `web_search` | 搜索由 Anthropic 服务端执行并返回引用；组织设置可能需要启用该工具。第三方 Anthropic 兼容地址不会被无条件当作官方能力。 |
| Google Gemini | Native `generateContent` | Gemini 2.0、2.5、3 系列的 `google_search` grounding | 来源来自 `groundingMetadata`；其他模型会显示当前没有可用的原生联网搜索。 |
| Xiaomi MiMo | OpenAI Chat Completions | `mimo-v2.5` / `mimo-v2.5-pro` 的 `web_search` 扩展 | 需要在 MiMo 控制台启用 Web Search 插件；“强制联网搜索”映射为 `force_search`，会增加调用和费用。MiMo Responses 可以正常生成回答，但当前应用没有启用未经验证的 Responses `web_search` 扩展，因此要联网时请选择 Chat Completions。 |
| Azure OpenAI | Responses API | `web_search_preview` | 需要正确的 Azure 资源、部署名、区域和搜索权限；Azure 不能直接使用 OpenAI 的 `web_search` 名称。 |
| DeepSeek | 普通入口用 Responses；`/anthropic` 入口用 Messages | `deepseek-v4-pro` / `deepseek-v4-flash`：普通入口使用 `web_search`，Anthropic 兼容入口使用 server-side `web_search` | 普通 Base URL 使用 `https://api.deepseek.com`，不要手动追加 `/v1`；Anthropic 兼容地址使用 `https://api.deepseek.com/anthropic`。服务商没有返回来源字段时，面板只能显示已使用搜索，无法生成来源卡片。 |
| Groq | OpenAI Chat Completions | `openai/gpt-oss-20b` / `openai/gpt-oss-120b` 的 `browser_search` | 只有当前识别的 GPT-OSS 模型会自动启用；Groq Compound 等系统暂未自动接入，因为 Agent 还需要同时使用本地仓库工具。 |
| Moonshot / Kimi | OpenAI Chat Completions | Kimi K3、K2.6、K2.5 的 `$web_search` | 模型名称必须与服务商实际开放的版本一致。 |
| Mistral AI | OpenAI Chat Completions | 当前应用未自动适配 | OpenAI 兼容只说明普通对话格式兼容，不等于该端点提供同名原生搜索。 |
| 智谱 AI / GLM | OpenAI Chat Completions | 当前应用未自动适配 | 如服务商新增搜索能力，需要后续按其官方工具格式适配。 |
| 腾讯混元 | OpenAI Chat Completions | 当前应用未自动适配 | 兼容接口可用于普通问答，但不会由应用自动注入联网工具。 |
| NVIDIA NIM | OpenAI Chat Completions | 当前应用未自动适配 | NIM 部署的上游模型能力不由应用猜测。 |
| 硅基流动 | OpenAI Chat Completions | 当前应用未自动适配 | 即使某个聚合模型自身提供搜索，当前版本也不会跨服务商自动推断。 |
| Ollama（本地） | OpenAI Chat Completions | 当前应用未自动适配 | 本地模型默认不具备外网访问能力；需要额外的本地工具或网关。 |
| 自定义 | OpenAI Chat Completions | 当前应用未自动适配 | 可以手动选择其他请求格式，但应用不会猜测自定义端点的搜索工具名或结果结构。 |

### 如何确认搜索真的生效

开启后，Agent 会在对话操作区显示联网搜索操作；如果服务商返回 URL、引用或 grounding 来源，面板还会显示可展开的来源卡片。只有在服务商返回这些来源字段时才能展示链接，因此“已使用联网搜索但服务商未返回可展示来源”不一定表示搜索失败。

联网搜索和本地仓库工具是两套能力：`list_notes`、`search_notes`、`read_note` 负责当前工作区，原生搜索由服务商在云端执行。开启搜索不会替用户自动关闭“思考”；如果服务商建议搜索时关闭或降低思考强度，需要在 Agent 设置中自行选择。搜索可能增加延迟、输入 Token 和服务商费用。

如果手动切换了不匹配的 API 格式，搜索开关会被禁用，这是为了避免把某家服务商的工具定义发送到另一种协议。切回“默认”通常即可恢复。

相关官方说明： [OpenAI Web search](https://platform.openai.com/docs/guides/tools-web-search)、[Anthropic Web search](https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool)、[Gemini Google Search grounding](https://ai.google.dev/gemini-api/docs/generate-content/google-search)、[MiMo Web Search](https://mimo.mi.com/docs/en-US/usage-guide/tool-calling/web-search)、[MiMo Responses API](https://mimo.mi.com/docs/en-US/api/chat/responses)、[Azure OpenAI Web search](https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/web-search) 和 [Groq Browser Search](https://console.groq.com/docs/tool-use/built-in-tools/browser-search)。

::: warning API 密钥安全
配置保存在当前浏览器本地，请勿在公共设备上长期保存。导出的配置 JSON **包含 API 密钥**，用于一键迁移，也意味着它应被视为敏感文件，不要上传到仓库或发送给他人。
:::

## Chat 与 Edit

| 模式 | 适合任务                                 | 可执行操作                                        |
| ---- | ---------------------------------------- | ------------------------------------------------- |
| Chat | 提问、解释、总结、比较、发现跨笔记关联   | 列出、搜索和读取笔记，不修改文件                  |
| Edit | 整理结构、补充内容、新建笔记、跨文件调整 | 读取真实文件，提出修改或新建方案，可请求 Git 提交 |

Chat 模式不会把笔记当成模型知识的边界。回答会优先解决问题，并可补充通用知识、反例、推导和跨领域联系；当补充内容可能与笔记原文混淆时，Agent 会区分“笔记中记录”和“基于通用知识的补充”。

Edit 模式遵循“先观察、再提案、后执行”的工作流。Agent 会先定位相关文件并读取实时内容，再生成逐文件 Diff。默认情况下，每个修改都必须由用户接受后才会写入浏览器中的本地草稿。

## 操作上下文与记忆

Agent 顶部会持续显示当前工作上下文：

- 当前打开的笔记路径。
- 当前 Git 分支。
- 已缓存笔记数与仓库 Markdown 总数。
- 尚未同步的本地修改数量。

对话会保留问题、回答版本、已批准修改和近期工具操作。Agent 用这些信息保持任务连续性，但文件内容和 Git 状态始终以当前工作区的实时读取结果为准，不会把旧对话误当成最新事实。

编辑范围可以选择：

- **当前文件**：只分析当前打开的 Markdown。
- **仓库笔记**：在已缓存文件中搜索和读取；需要时可先“读取全部笔记”。

## 审核修改与 Git 提交

Edit 模式的典型流程如下：

1. 描述目标，例如“整理当前笔记，并补充两个反例”。
2. Agent 搜索、读取相关笔记，并在对话中显示操作进度。
3. 每个文件生成可展开的 Diff，字体设置与编辑器保持一致。
4. 选择“接受”或“拒绝”；接受后只写入本地草稿，不会立即推送。
5. 需要提交时明确要求 Agent 提交，或在提交卡片中检查后确认。
6. 推送前若远程分支已变化，操作会安全停止，避免覆盖远程提交。

操作许可提供两种选择：

- **请求批准**（默认）：修改、新建或提交前逐项确认。
- **自动执行**：自动接受修改和提交请求，适合目标明确且已做好版本保护的任务。

建议日常使用“请求批准”。即使启用自动执行，也应在重要仓库中先确认当前分支和本地修改数量。

## 对话版本与历史

- 修改旧问题会从该问题创建新的对话分支，原问题和后续回答仍可切换查看。
- 重新生成会为同一问题保存新的回答版本。
- 修改提问时输入框会跟随 Agent 面板宽度缩放；按 `Esc` 取消，按 `Ctrl/⌘ + Enter` 重新发送。
- 历史抽屉显示 Chat / Edit 模式、待审核数量和更新时间。
- 支持搜索、重命名、删除、导出单个对话 Markdown，以及用 JSON 导入或导出全部历史。

历史保存在当前浏览器中。跨设备迁移时，需要分别导出 Agent 配置 JSON 和对话历史 JSON。

## 输出长度、随机性与思考

高级设置默认最大输出为 **16,000 Token**，Temperature 为 **0.3**。

- 最大 Token 数限制单次模型输出长度，不等同于整个 Agent 可读取的上下文长度。复杂的跨文件任务可保留默认值；普通问答可调到 4,000–8,000，以降低延迟和成本。
- Temperature 越高，表达和联想通常越发散；越低则更稳定。笔记整理建议使用 0.2–0.4，创意探索可适度提高。
- “思考”可按模型能力选择低、中、高、极高或最高。它主要影响支持推理模型的思考预算，不保证所有服务商都返回可展示的推理摘要。

模型自身仍受服务商上下文窗口、输出上限、计费和速率限制。将最大 Token 设置得很高不会自动提升回答质量。

## 导入与导出

| 数据         | 导出格式 | 是否包含密钥 | 用途                                      |
| ------------ | -------- | ------------ | ----------------------------------------- |
| Agent 配置   | JSON     | 是           | 一键迁移服务商、模型、高级设置与 API 密钥 |
| 全部对话历史 | JSON     | 否           | 在另一个浏览器恢复完整对话和审核状态      |
| 单个对话     | Markdown | 否           | 阅读、归档或放入笔记仓库                  |

导入不会把文件上传到 markmap++ 服务器；应用是纯前端站点，文件由当前浏览器读取并保存到本地存储。

## 常见问题

### 为什么回答只引用笔记？

可以直接要求“结合你的通用知识补充背景、反例和不同观点”。当前提示策略允许模型使用自身知识，同时要求在可能混淆时区分笔记事实与外部补充。最终效果仍取决于所选模型的能力。

### 为什么 Agent 没有看到某篇仓库笔记？

确认编辑范围是否为“仓库笔记”，并检查顶部的“已读取 x/y 篇”。未缓存的远程文件不会被假装读取；点击“读取全部笔记”后再提问。

### 为什么修改没有出现在 GitHub？

接受 Diff 只会更新本地草稿。需要再执行仓库同步，或明确要求 Agent 创建 Git 提交并在确认对话框中批准。

### 为什么模型列表获取失败？

检查 API 密钥、Base URL 和服务商是否匹配。某些兼容服务不提供模型列表接口，此时可以直接填写模型名称并测试连接。
