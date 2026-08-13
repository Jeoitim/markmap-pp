export type Locale = 'zh-CN' | 'en-US'

const LOCALE_KEY = 'markmap-plus-plus:locale'

const translations: Record<string, string> = {
  '使用说明': 'Guide',
  '显示设置': 'Display settings',
  '编辑器设置': 'Editor settings',
  '仓库设置': 'Repository settings',
  '导出设置': 'Export settings',
  '导出思维导图': 'Export mind map',
  '另存到 Git 仓库': 'Save to Git repository',
  '笔记链接': 'Note links',
  '编辑、显示与导出': 'Edit, display and export',
  '更改会立即生效': 'Changes take effect immediately',
  '在远程仓库与本地文件夹之间随时切换': 'Switch between remote repositories and local folders',
  '反向链接、出站链接与失效目标': 'Backlinks, outgoing links and broken targets',
  '选择格式与清晰度': 'Choose a format and resolution',
  '选择仓库位置并暂存当前 Markdown': 'Choose a repository location and stage the current Markdown',
  '恢复默认设置': 'Reset settings',
  '关闭': 'Close',
  '撤回上一次修改': 'Undo last change',
  '应用菜单': 'Application menu',
  'markmap++ 应用菜单': 'markmap++ application menu',
  '窗口控制': 'Window controls',
  '文件': 'File',
  '编辑': 'Edit',
  '视图': 'View',
  '帮助': 'Help',
  '新建标签页': 'New tab',
  '打开文件…': 'Open file…',
  '打开': 'Open',
  '说明': 'Guide',
  '撤回': 'Undo',
  '撤回修改': 'Undo change',
  '收起编辑器': 'Collapse editor',
  '展开编辑器': 'Expand editor',
  '切换深色模式': 'Switch to dark mode',
  '切换浅色模式': 'Switch to light mode',
  '浅色模式 · 雾白背景': 'Light mode · mist white background',
  '深色模式 · 深灰背景': 'Dark mode · dark gray background',
  '打开本地文件夹…': 'Open local folder…',
  '保存': 'Save',
  '另存 / 导出…': 'Save as / Export…',
  '关闭标签页': 'Close tab',
  '编辑器偏好设置': 'Editor preferences',
  'Markdown 编辑器': 'Markdown editor',
  '仓库': 'Repository',
  '进入全屏': 'Enter fullscreen',
  '退出全屏': 'Exit fullscreen',
  'GitHub 项目': 'GitHub project',
  '快速上手': 'Quick start',
  '节点与画布操作': 'Nodes and canvas',
  'Markdown 丰富语法': 'Rich Markdown syntax',
  'GitHub 文档同步': 'GitHub document sync',
  '预览设置': 'Preview settings',
  '导出': 'Export',
  '语言': 'Language',
  '中文': '中文',
  '英文': 'English',
  '切换到英文': 'Switch to English',
  '切换到中文': 'Switch to Chinese',
  '打开的文档': 'Open documents',
  '新建空白文档标签': 'New blank document tab',
  '新建标签': 'New tab',
  '关闭标签': 'Close tab',
  '有未保存的修改': 'Unsaved changes',
  'Git 仓库文档': 'Git repository document',
  '本地文件夹文档': 'Local folder document',
  '已保存到磁盘': 'Saved to disk',
  '新建或打开 Markdown 后，这里会显示思维导图。': 'Create or open a Markdown file to see its mind map here.',
  '打开文件': 'Open file',
  '返回 Markdown': 'Back to Markdown',
  '切换到思维导图': 'Switch to mind map',
  '导图': 'Mind map',
  '适应画布': 'Fit canvas',
  '调整编辑器与预览宽度': 'Resize editor and preview',
  '思维导图预览': 'Mind map preview',
  '文档标签': 'Document tabs',
  '个打开的文档': ' open documents',
  '当前没有打开文件': 'No file is open',
  '行': 'lines',
  '字符': 'characters',
  '导出方式': 'Export method',
  '导出文件': 'Export file',
  '无损位图': 'Lossless bitmap',
  '体积更小': 'Smaller file',
  '无限清晰': 'Infinite clarity',
  '网页文件': 'Web page',
  '源文件': 'Source file',
  '渲染倍率': 'Render scale',
  '背景与文字': 'Background and text',
  '背景颜色': 'Background color',
  '透明背景': 'Transparent background',
  '自动适配文字主题': 'Auto text theme',
  '内容暗黑模式': 'Dark content mode',
  '仅 PNG 支持透明背景': 'Transparent background is supported by PNG only',
  '与预览共用': 'Same as preview',
  '导出文件会使用以下画布与文字主题': 'The exported file uses the following canvas and text theme',
  'PNG 保留透明通道；文字主题仍按当前颜色判断': 'PNG keeps transparency; the text theme still follows the current colors',
  'WCAG 自动主题': 'WCAG automatic theme',
  '雾白': 'Mist white',
  '纯白': 'White',
  '深灰': 'Dark gray',
  '黑色': 'Black',
  '预览背景颜色预设': 'Preview background presets',
  '背景颜色预设': 'Background color presets',
  '预览背景色：': 'Preview background: ',
  '背景色：': 'Background: ',
  '正在生成…': 'Generating…',
  '导出失败，请重试': 'Export failed. Please try again.',
  '导出文件生成失败': 'Failed to generate the export file',
  '浏览器不支持画布导出': 'This browser does not support canvas export',
  '字号': 'Font size',
  '字体': 'Font',
  '字重': 'Font weight',
  '高亮方案': 'Highlight scheme',
  '颜色层级': 'Color freeze level',
  '点阵背景': 'Grid background',
  '辅助观察画布移动与缩放': 'Helps track canvas movement and zoom',
  '编辑器与 AI 聊天预览': 'Editor and AI chat preview',
  '思维导图 Mind Map 0123': 'Mind map 0123',
  '由代码控制': 'Controlled by code',
  '由 Frontmatter 代码控制': 'Controlled by Frontmatter',
  '由 Markdown style 控制': 'Controlled by Markdown style',
  '代码配置优先于此面板。': 'Code configuration takes priority over this panel.',
  '语法检查包括标题层级、代码块闭合与缩进一致性，问题会直接标记在编辑器中。': 'Syntax checks cover heading levels, closed code blocks and consistent indentation. Problems are marked directly in the editor.',
  '语法正常': 'Syntax looks good',
  '语法问题': 'Syntax issues',
  '上一条说明': 'Previous tip',
  '下一条说明': 'Next tip',
  '使用说明提示卡片': 'Guide tip cards',
  '选择说明提示': 'Choose a guide tip',
  '当前提示': 'Current tip',
  '更多操作': 'More actions',
  '文档操作': 'Document actions',
  '全屏': 'Fullscreen',
  '最小化': 'Minimize',
  '最大化': 'Maximize',
  '恢复窗口': 'Restore window',
  'Agent': 'Agent',
  '你好，我会结合你的 Markdown 笔记、当前操作上下文和通用知识来回答；也可以在 Edit 模式中生成可审核、可追踪的文件修改。': 'Hello. I can answer using your Markdown notes, the current workspace context and general knowledge. In Edit mode, I can also generate reviewable, traceable file changes.',
  '询问笔记内容，Enter 发送…': 'Ask about your notes, then press Enter to send…',
  '描述要修改或新建的笔记。AI 会先给出可审核的方案。': 'Describe the note to edit or create. AI will first propose a reviewable plan.',
  '描述要如何修改当前文件。AI 会先给出可审核的方案。': 'Describe how to modify the current file. AI will first propose a reviewable plan.',
  '未配置': 'Not configured',
  '已配置': 'Configured',
  '检查中': 'Checking',
  '已连接': 'Connected',
  '连接失败': 'Connection failed',
  '未选择模型': 'No model selected',
  '当前内容已更新': 'Current content updated',
  '正在更新预览…': 'Updating preview…',
  '未保存': 'Unsaved',
  '同步中': 'Syncing',
  '已同步': 'Synced',
  '已暂存但未推送': 'Staged, not pushed',
  '保存到原文件': 'Save to original file',
  '下载副本': 'Download a copy',
  '保存并关闭': 'Save and close',
  '下载副本并关闭': 'Download a copy and close',
  '可以先下载一份 Markdown 副本，再关闭标签。': 'Download a Markdown copy before closing the tab.',
  '保存会把当前内容写回磁盘，然后关闭标签。': 'Save the current content to disk, then close the tab.',
  '取消': 'Cancel',
  '确认': 'Confirm',
  '放弃': 'Discard',
  '放弃所有本地修改': 'Discard all local changes',
  '新建 Markdown 文件': 'New Markdown file',
  '新建文件夹': 'New folder',
  '文件夹名称': 'Folder name',
  '新建文件夹名称': 'New folder name',
  '文件名': 'File name',
  '另存文件名': 'Save as filename',
  '仓库根目录': 'Repository root',
  '选择 GitHub 保存位置': 'Choose a GitHub save location',
  '选择位置并展开或收起': 'Choose a location and expand or collapse it',
  '绑定 GitHub 仓库': 'Connect GitHub repository',
  '添加仓库': 'Add repository',
  '远程': 'Remote',
  '本地': 'Local',
  '分支': 'Branch',
  'GitHub 令牌': 'GitHub token',
  '令牌保存在当前浏览器的站点存储中。': 'The token is stored in this browser site storage.',
  '令牌由操作系统加密后保存在本机。': 'The token is encrypted by the operating system and stored locally.',
  '远程仓库': 'Remote repository',
  '本地文件夹': 'Local folder',
  'GitHub Markdown 文件树': 'GitHub Markdown file tree',
  '本地 Markdown 文件树': 'Local Markdown file tree',
  '普通本地文件夹 · 文档自动保存': 'Local folder · Documents auto-save',
  '普通本地文件夹 · 自动保存': 'Local folder · Auto-save',
  '普通本地文件夹不支持 Git 版本管理': '普通本地文件夹不支持 Git 版本管理',
  '所有缓存文件均已同步': 'All cached files are synced',
  'Git 工作区干净': 'Git working tree is clean',
  '正在读取仓库…': 'Loading repository…',
  '正在读取提交历史…': 'Loading commit history…',
  '没有找到该文件的提交记录': 'No commit history found for this file',
  '查看历史提交': 'View commit history',
  '文件历史': 'File history',
  '仓库提交历史': 'Repository commit history',
  '本地提交历史': 'Local commit history',
  '关闭历史记录': 'Close history',
  '关闭本地提交历史': 'Close local commit history',
  '关闭仓库提交历史': 'Close repository commit history',
  '关闭问题列表': 'Close issue list',
  '加载全部': 'Load all',
  '笔记': 'notes',
  '索引全部': 'Index all',
  '索引中…': 'Indexing…',
  '链接到笔记…': 'Link to note…',
  '更改笔记链接…': 'Change note link…',
  '创建': 'Create',
  '创建中…': 'Creating…',
  '搜索文件，或查找标题…': 'Search files or headings…',
  '搜索仓库笔记': 'Search repository notes',
  '新建笔记并链接': 'Create and link a note',
  '例如 doc/新笔记.md': 'e.g. docs/new-note.md',
  'Markdown 内容': 'Markdown content',
  'AI 服务配置': 'AI service settings',
  '连接模型、调整回答策略与 Agent 权限': 'Connect a model, tune responses and manage Agent permissions',
  '导入配置': 'Import config',
  '导出配置': 'Export config',
  '备份包含 API 密钥，请勿发送给他人': 'The backup contains API keys. Do not share it.',
  'AI 服务商': 'AI provider',
  'API 密钥': 'API key',
  '输入 API Key': 'Enter API key',
  '模型名称': 'Model name',
  '请选择模型': 'Choose a model',
  '获取模型列表': 'Fetch models',
  '获取中…': 'Fetching…',
  '测试连接': 'Test connection',
  '测试中…': 'Testing…',
  '连接成功': 'Connected',
  '保存到本地': 'Save locally',
  '保存中…': 'Saving…',
  '高级设置': 'Advanced settings',
  '展开': 'Expand',
  '收起': 'Collapse',
  '最大 Token 数': 'Max tokens',
  'Temperature（随机性）': 'Temperature (randomness)',
  '思考': 'Reasoning',
  '开启思考': 'Enable reasoning',
  '关闭思考': 'Disable reasoning',
  '操作许可': 'Action permissions',
  '自动执行': 'Auto-run',
  '每次确认': 'Confirm each action',
  '请求批准': 'Request approval',
  '当前文件': 'Current file',
  '工作区笔记': 'Workspace notes',
  '读取全部笔记': 'Load all notes',
  '正在读取全部笔记…': 'Loading all notes…',
  '对话历史': 'Conversation history',
  '搜索、管理和恢复 Agent 任务': 'Search, manage and restore Agent tasks',
  '导入历史': 'Import history',
  '导出全部': 'Export all',
  '使用 JSON 备份，可跨浏览器恢复': 'Use a JSON backup to restore across browsers',
  '搜索对话标题': 'Search conversation titles',
  '新对话标题': 'New conversation title',
  '重命名': 'Rename',
  '删除': 'Delete',
  '重试': 'Retry',
  '重新生成': 'Regenerate',
  '发送': 'Send',
  '停止回答': 'Stop response',
  '修改提问': 'Edit question',
  '打开完整对比': 'Open full diff',
  '接受修改': 'Accept changes',
  '拒绝': 'Reject',
  '重试应用': 'Retry apply',
  '正在写入并校验…': 'Writing and validating…',
  '已应用到本地': 'Applied locally',
  '待审核': 'Needs review',
  '正在应用': 'Applying',
  '检查并提交': 'Review and commit',
  '稍后处理': 'Handle later',
  '整理并完善笔记': 'Organize and improve notes',
  '发现跨笔记关联': 'Find connections across notes',
  '补充背景与反例': 'Add context and counterexamples',
  '正在渲染图表…': 'Rendering diagram…',
  '全屏查看': 'View fullscreen',
  '查看图表': 'View diagram',
  '查看源代码': 'View source',
  '复制源代码': 'Copy source',
  '复制代码': 'Copy code',
  '缩小': 'Zoom out',
  '放大': 'Zoom in',
  '下载 SVG': 'Download SVG',
  '关闭全屏查看': 'Close fullscreen view',
  '图表语法无法渲染，以下保留原始 Mermaid 代码。': 'The diagram syntax could not be rendered. The original Mermaid code is kept below.',
  '把 Markdown 当作内容，把思维导图当作结构预览。': 'Treat Markdown as content and the mind map as a structural preview.',
  '左侧写内容，右侧看结构。': 'Write on the left, see structure on the right.',
  '输入 Markdown 后，预览会即时生成；本页用于快速了解编辑器和思维导图的主要功能。': 'The preview updates as you type Markdown. This page introduces the main editor and mind-map features.',
  '编写': 'Write',
  '观察': 'Review',
  '在左侧编辑器中输入标题、列表或正文。': 'Enter headings, lists or body text in the editor on the left.',
  '右侧会同步更新节点、层级和连接关系。': 'Nodes, levels and connections update on the right.',
  '使用顶部导出保存副本，或绑定 GitHub 管理文档。': 'Use Export in the top bar to save a copy, or connect GitHub to manage documents.',
  '刷新页面会恢复默认操作指南；重要内容请及时导出或保存到仓库。': 'Refreshing restores the default guide. Export important content or save it to a repository.',
  '先选中，再编辑；画布本身可以自由移动和缩放。': 'Select first, then edit. The canvas can be freely panned and zoomed.',
  '单击节点': 'Click a node',
  '选中节点，Enter 新增同级节点。': 'Select a node; press Enter to add a sibling.',
  '双击节点': 'Double-click a node',
  '进入文字编辑，Enter 保存当前文字。': 'Edit its text; press Enter to save.',
  '为当前节点新增一个子节点。': 'Add a child to the current node.',
  '删除选中的整个节点；需要时可点击顶部“撤回”。': 'Delete the selected node; use Undo in the top bar if needed.',
  '拖动画布': 'Drag the canvas',
  '按住空白区域拖动，浏览超出视口的内容。': 'Drag an empty area to browse content outside the viewport.',
  '滚轮 / 触控板': 'Wheel / trackpad',
  '缩放画布；点击节点圆点折叠或展开分支。': 'Zoom the canvas; click a node dot to collapse or expand a branch.',
  '点击预览右上角的适应按钮，让完整导图回到视口。': 'Click Fit in the preview toolbar to bring the whole map into view.',
  '分割线': 'Split handle',
  '拖动中间分割线调整编辑器和预览的宽度。': 'Drag the split handle to resize the editor and preview.',
  '用轻量语法表达层级、重点和更完整的资料。': 'Use lightweight syntax to express hierarchy, emphasis and complete notes.',
  '文字与结构': 'Text and structure',
  '标题': 'heading',
  '粗体': 'bold',
  '斜体': 'italic',
  '删除线': 'strikethrough',
  '高亮': 'highlight',
  '行内代码': 'inline code',
  '适合思维导图的内容': 'Content that works well in a mind map',
  '使用标题和缩进列表组织层级，标题越深，分支层级越深。': 'Use headings and indented lists to organize levels; deeper headings create deeper branches.',
  '有序列表、无序列表和任务清单适合拆解步骤与待办事项。': 'Ordered lists, unordered lists and task lists work well for steps and todos.',
  '表格、LaTeX 公式、代码块和在线图片可以保留在 Markdown 中。': 'Tables, LaTeX formulas, code blocks and online images can stay in Markdown.',
  '较长文字会按节点最大宽度自动换行；需要更清晰的结构时，可以拆成多个子节点。': 'Long text wraps at the node max width; split it into child nodes for clearer structure.',
  '调整 Markdown 字号和语法高亮方案。': 'Adjust the Markdown font size and syntax highlighting.',
  '调整节点字号、字体、字重、配色冻结层级和点阵背景。': 'Adjust node size, font, weight, color freeze level and grid background.',
  '主题切换': 'Theme switching',
  '顶部月亮/太阳按钮切换深色与浅色模式。': 'Use the moon/sun button to switch between dark and light modes.',
  '导出 Markdown': 'Export Markdown',
  '保留可继续编辑的源文件。': 'Keep an editable source file.',
  '导出 SVG / HTML': 'Export SVG / HTML',
  '适合网页、分享和无限缩放。': 'Suitable for web pages, sharing and infinite zoom.',
  '导出 PNG / JPEG': 'Export PNG / JPEG',
  '适合图片分享，可选择渲染倍率。': 'Suitable for image sharing, with a selectable render scale.',
  '文件先保存在浏览器本地缓存，确认后再推送到远程仓库。': 'Files are cached locally in the browser, then pushed to the remote repository after confirmation.',
  '绑定': 'Connect',
  '在仓库设置中填写仓库、分支和具有 Contents 权限的令牌。': 'Enter the repository, branch and a token with Contents permission in repository settings.',
  '打开文件后修改内容，状态会显示为 M；新文件显示为 A。': 'Edit an opened file; its status becomes M. New files show A.',
  '同步': 'Sync',
  '点击仓库页同步按钮，一次性创建 commit 并推送。': 'Click Sync in the repository view to create and push a commit.',
  '已修改': 'Modified',
  '新文件': 'New file',
  '尚未拉取': 'Not pulled',
  '仓库底部的分支按钮可以查看 Git Graph、切换分支，或打开某个 commit 阶段的文件树。历史文件打开后是独立缓存，不会改变当前分支的编辑状态。': 'The branch button at the bottom opens the Git graph, switches branches or views a commit snapshot. Historical files open as independent cached tabs and do not change the current branch.',
  '思源黑体（Noto Sans SC Variable）': 'Noto Sans SC Variable',
  '思源宋体（Noto Serif SC Variable）': 'Noto Serif SC Variable',
  '霞鹜文楷（LXGW WenKai）': 'LXGW WenKai',
}

const agentTranslations: Record<string, string> = {
  'Mermaid 图表': 'Mermaid diagram',
  '复制源代码': 'Copy source',
  '查看图表': 'View diagram',
  '查看源代码': 'View source',
  '全屏查看': 'View fullscreen',
  '正在渲染图表…': 'Rendering diagram…',
  '图表语法无法渲染，以下保留原始 Mermaid 代码。': 'The diagram could not be rendered. The original Mermaid code is preserved below.',
  '缩小': 'Zoom out',
  '适应窗口': 'Fit to window',
  '放大': 'Zoom in',
  '下载 SVG': 'Download SVG',
  '关闭全屏查看': 'Close fullscreen view',
  '回答完成后渲染图表': 'The diagram will render when the answer is complete',
  '复制代码': 'Copy code',
  '关闭对话历史': 'Close conversation history',
  '对话历史': 'Conversation history',
  '搜索、管理和恢复 Agent 任务': 'Search, manage and restore Agent tasks',
  '导入历史': 'Import history',
  '导出全部': 'Export all',
  '使用 JSON 备份，可跨浏览器恢复': 'Use a JSON backup to restore conversations in another browser',
  '选择对话历史 JSON 文件': 'Choose a conversation history JSON file',
  '搜索对话标题': 'Search conversation titles',
  '新建对话': 'New conversation',
  '当前工作区': 'Current workspace',
  '其他工作区': 'Other workspace',
  '新对话标题': 'New conversation title',
  '重命名': 'Rename',
  '导出 Markdown': 'Export Markdown',
  '没有匹配的对话': 'No matching conversations',
  '找不到该对话工作区': 'Conversation workspace not found',
  '仍然继续': 'Continue anyway',
  '取消提交': 'Cancel commit',
  '提交并推送修改': 'Commit and push changes',
  '确认后会创建一次 Git commit 并推送到远程分支': 'A Git commit will be created and pushed to the remote branch after confirmation',
  '目标分支': 'Target branch',
  '本地修改': 'Local changes',
  '只提交已接受并成功写入本地缓存的修改': 'Only accepted changes successfully written to the local cache will be committed',
  '如果远程分支已有新提交，操作会安全停止': 'The operation stops safely if the remote branch has new commits',
  '返回检查': 'Back to review',
  '确认提交并推送': 'Confirm commit and push',
  '修改提问': 'Edit question',
  '修改提问内容': 'Edit question content',
  '重新发送': 'Send again',
  '复制回答': 'Copy answer',
  '重新生成': 'Regenerate',
  '上一版问题': 'Previous question',
  '下一版问题': 'Next question',
  '上一版回答': 'Previous answer',
  '下一版回答': 'Next answer',
  '已应用到本地': 'Applied locally',
  '已拒绝': 'Rejected',
  '应用失败': 'Apply failed',
  '内容没有变化': 'No content changes',
  '关闭 Diff': 'Close diff',
  '新建笔记': 'Create note',
  '修改笔记': 'Edit note',
  '的修改预览': ' change preview',
  '重试应用': 'Retry apply',
  '接受修改': 'Accept changes',
  '拒绝': 'Reject',
  '打开文件': 'Open file',
  '该修改已拒绝，记录仍保留在对话中。': 'This change was rejected; its record remains in the conversation.',
  '取消': 'Cancel',
  '提交 Git 仓库': 'Commit Git repository changes',
  '检查并提交': 'Review and commit',
  '稍后处理': 'Handle later',
  'Git 修改': 'Git changes',
  '已停止回答。': 'Response stopped.',
  '模型请求失败': 'Model request failed',
  'Git 提交失败': 'Git commit failed',
  'AI 模式': 'Agent mode',
  '打开对话历史': 'Open conversation history',
  '打开 AI 配置': 'Open AI settings',
  '全屏查看 Mermaid 图表': 'View Mermaid diagram fullscreen',
  '打开完整对比': 'Open full diff',
  '已保留修改记录，可展开重新查看': 'The change record is kept and can be expanded for review',
  '正在写入并校验…': 'Writing and validating…',
  'AI 当前上下文': 'Agent current context',
  'Agent 当前上下文': 'Agent current context',
  '建议问法': 'Suggested prompts',
  '发现跨笔记关联': 'Find connections across notes',
  '补充背景与反例': 'Add context and counterexamples',
  '整理并完善笔记': 'Organize and improve notes',
  '正在分析仓库并生成修改方案…': 'Analyzing the repository and generating a change plan…',
  '正在结合笔记与通用知识思考…': 'Thinking with your notes and general knowledge…',
  '重试': 'Retry',
  '编辑范围': 'Edit scope',
  '当前文件': 'Current file',
  '工作区笔记': 'Workspace notes',
  '请先从工作区中打开一个文件': 'Open a file from the workspace first',
  '正在读取全部笔记…': 'Reading all notes…',
  '读取全部笔记': 'Read all notes',
  '思考': 'Reasoning',
  '低': 'Low',
  '中': 'Medium',
  '高': 'High',
  '极高': 'Very high',
  '最高': 'Maximum',
  '关': 'Off',
  '让支持推理的模型返回可展开的思考过程。': 'Allow reasoning-capable models to return an expandable reasoning trace.',
  '关闭思考': 'Turn off reasoning',
  '开启思考': 'Turn on reasoning',
  '操作许可': 'Action permissions',
  '自动执行': 'Run automatically',
  '每次确认': 'Confirm each time',
  '请求批准': 'Ask for approval',
  '修改、新建或提交 Git 前逐项确认。': 'Confirm each edit, new file or Git commit.',
  '修改当前文件前逐项确认。': 'Confirm each edit to the current file.',
  '收到方案后直接暂存修改与提交请求。': 'Stage changes and commit requests directly after receiving a plan.',
  '收到方案后直接应用到当前标签。': 'Apply the plan directly to the current tab.',
  '停止回答': 'Stop response',
  '发送': 'Send',
  'AI 配置': 'AI settings',
  'AI 服务配置': 'AI service settings',
  '连接模型、调整回答策略与 Agent 权限': 'Connect a model, tune response behavior and manage Agent permissions',
  '关闭 AI 配置': 'Close AI settings',
  '关闭配置': 'Close settings',
  '导入配置': 'Import settings',
  '导出配置': 'Export settings',
  '备份包含 API 密钥，请勿发送给他人': 'The backup contains API keys. Do not send it to others.',
  'AI 服务商': 'AI provider',
  'API 密钥': 'API key',
  '本地 Ollama 通常不需要密钥': 'Local Ollama usually does not need a key',
  '输入 API Key': 'Enter API key',
  '模型名称': 'Model name',
  '请选择模型': 'Select a model',
  '获取中…': 'Loading…',
  '获取模型列表': 'Fetch model list',
  '测试中…': 'Testing…',
  '连接成功': 'Connected successfully',
  '测试连接': 'Test connection',
  '保存中…': 'Saving…',
  '保存到本地': 'Save locally',
  '高级设置': 'Advanced settings',
  '收起': 'Collapse',
  '展开': 'Expand',
  '最大 Token 数': 'Maximum tokens',
  'Temperature（随机性）': 'Temperature (randomness)',
  '密钥仅保存在当前浏览器本地；请求会直接发送到所选 AI 服务商。': 'Keys are stored only in this browser; requests are sent directly to the selected AI provider.',
  '未配置': 'Not configured',
  '已配置': 'Configured',
  '检查中': 'Checking',
  '已连接': 'Connected',
  '连接失败': 'Connection failed',
  '未选择模型': 'No model selected',
  '无法读取本地 AI 配置': 'Could not read local AI settings',
  '无法读取本地对话历史': 'Could not read local conversation history',
  'AI 对话': 'AI conversation',
  '对话历史保存失败': 'Could not save conversation history',
  '文件中没有可识别的对话历史': 'The file contains no recognizable conversation history',
  '导入的对话': 'Imported conversation',
  '没有找到有效对话': 'No valid conversations found',
  'AI 配置与 API 密钥已完整导出，请妥善保管备份文件。': 'AI settings and API keys were exported. Keep the backup safe.',
  '文件中没有可识别的 AI 配置': 'The file contains no recognizable AI settings',
  'AI 配置与 API 密钥已导入，可以直接迁移使用。': 'AI settings and API keys were imported and are ready to use.',
  'AI 配置保存失败': 'Could not save AI settings',
  'AI 配置已保存在当前浏览器本地。': 'AI settings were saved in this browser.',
  '服务商没有返回可用模型，请手动填写。': 'The provider returned no available models. Enter one manually.',
  '获取模型列表失败': 'Could not fetch the model list',
  '连接成功，当前服务商和模型可以正常使用。': 'Connection succeeded. The current provider and model are ready to use.',
  '请先填写 Base URL': 'Enter a Base URL first',
  '请先填写 API 密钥': 'Enter an API key first',
  '获取模型失败：': 'Could not fetch models: ',
  '智谱 AI / GLM': 'Zhipu AI / GLM',
  '腾讯混元': 'Tencent Hunyuan',
  '硅基流动': 'SiliconFlow',
  'Ollama（本地）': 'Ollama (local)',
  '自定义': 'Custom',
}

export function detectLocale(): Locale {
  if (typeof window === 'undefined') return 'zh-CN'
  const stored = window.localStorage.getItem(LOCALE_KEY)
  if (stored === 'zh-CN' || stored === 'en-US') return stored
  return navigator.language.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US'
}

export function translate(locale: Locale, source: string) {
  return locale === 'en-US' ? translations[source] || agentTranslations[source] || source : source
}

const originalText = new WeakMap<Text, { source: string; localized: string }>()
const originalAttributes = new WeakMap<HTMLElement, Map<string, { source: string; localized: string }>>()

function translateUiText(locale: Locale, value: string) {
  const leading = value.match(/^\s*/)?.[0] || ''
  const trailing = value.match(/\s*$/)?.[0] || ''
  const core = value.slice(leading.length, value.length - trailing.length || undefined)
  if (!core) return value
  let translated = translate(locale, core)
  if (locale === 'en-US') {
    translated = translated
      .replace(/^(\d+) 个打开的文档$/, '$1 open documents')
      .replace(/^打开文档标签，共 (\d+) 个$/, 'Open document tabs, $1')
      .replace(/^(\d+) 行$/, '$1 lines')
      .replace(/^(\d+) 字符$/, '$1 characters')
      .replace(/^第 (\d+) 行$/, 'Line $1')
      .replace(/^查看第 (\d+) 条：/, 'View tip $1: ')
      .replace(/^关闭 (.+)$/, 'Close $1')
      .replace(/^导出 (.+)$/, 'Export $1')
      .replace(/^同步 (\d+) 个修改$/, 'Sync $1 changes')
      .replace(/^移除 (.+) 的打开记录$/, 'Remove the open record for $1')
      .replace(/^删除 (.+)$/, 'Delete $1')
      .replace(/^重命名 (.+)$/, 'Rename $1')
      .replace(/^预计输出为当前内容尺寸的 (\d+) 倍$/, 'Estimated output is $1× the current content size')
      .replace(/^未读取 (\d+) 篇$/, '$1 notes not loaded')
      .replace(/^(\d+) 个修改$/, '$1 changes')
      .replace(/^已读取 (\d+)\/(\d+) 个 Markdown 文件$/, '$1/$2 Markdown files loaded')
      .replace(/^(\d+) 项待处理$/, '$1 pending')
      .replace(/^(\d+) 个本地修改待提交$/, '$1 local changes pending')
      .replace(/^折叠 (\d+) 行未修改内容$/, 'Collapse $1 unchanged lines')
      .replace(/^已导出 (\d+) 条对话历史。$/, 'Exported $1 conversation(s).')
      .replace(/^已导入 (\d+) 条对话，并与现有历史合并。$/, 'Imported $1 conversation(s) and merged them with existing history.')
      .replace(/^已获取 (\d+) 个模型。$/, 'Fetched $1 model(s).')
      .replace(/^已应用 (.+)。$/, 'Applied $1.')
      .replace(/^已提交 Git 修改：(.+)$/, 'Committed Git changes: $1')
      .replace(/^已思考（用时 (\d+)s）$/, 'Thought for $1s')
      .replace(/^思考中（(\d+)s）$/, 'Thinking ($1s)')
      .replace(/^已完成 (\d+) 项仓库操作$/, 'Completed $1 repository operation(s)')
      .replace(/^(.+) 的修改预览$/, '$1 change preview')
      .replace(/^(.+) · (\d+) 个本地修改待提交$/, '$1 · $2 local changes pending')
      .replace(/^有 (\d+) 个文件应用失败，已暂停自动提交。$/, '$1 file(s) failed to apply; automatic commit paused.')
      .replace(/^已生成 (\d+) 个待审核文件修改，请在回答气泡里确认。$/, 'Generated $1 file change proposal(s). Review them in the answer bubble.')
      .replace(/^已按自动执行许可应用 (\d+) 个文件修改。$/, 'Applied $1 file change(s) with automatic execution enabled.')
      .replace(/^已应用 (\d+) 个文件，(\d+) 个失败，可在 Diff 记录中重试。$/, 'Applied $1 file(s); $2 failed. Retry them in the diff history.')
      .replace(/^导入对话失败：(.+)$/, 'Could not import conversations: $1')
      .replace(/^导入配置失败：(.+)$/, 'Could not import settings: $1')
      .replace(/^获取模型失败：(.+)$/, 'Could not fetch models: $1')
      .replace(/^切换工作区失败：(.+)$/, 'Could not switch workspace: $1')
      .replace(/^删除对话“(.+)”？此操作无法撤销。$/, 'Delete conversation “$1”? This cannot be undone.')
  }
  return leading + translated + trailing
}

function isContentNode(node: Node) {
  const element = node.parentElement
  return Boolean(element?.closest('.code-editor, .markdown-editor, #markmap-preview, .agent-markdown, .locale-toggle, textarea, input'))
}

export function syncUiLocale(locale: Locale) {
  if (typeof document === 'undefined') return () => undefined
  let updating = false
  const visit = (root: Node) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    const textNodes: Text[] = []
    while (walker.nextNode()) textNodes.push(walker.currentNode as Text)
    textNodes.forEach((node) => {
      if (isContentNode(node)) return
      const current = node.nodeValue ?? ''
      const previous = originalText.get(node)
      const source = previous && current === previous.localized ? previous.source : current
      const next = locale === 'en-US' ? translateUiText(locale, source) : source
      originalText.set(node, { source, localized: next })
      if (node.nodeValue !== next) node.nodeValue = next
    })
    if (!(root instanceof Element)) return
    const elements = [root, ...Array.from(root.querySelectorAll<HTMLElement>('*'))]
    elements.forEach((element) => {
      if (element.closest('.markdown-editor, #markmap-preview, .agent-markdown')) return
      const attributes = ['title', 'aria-label', 'placeholder']
      const htmlElement = element as HTMLElement
      const stored = originalAttributes.get(htmlElement) || new Map<string, { source: string; localized: string }>()
      attributes.forEach((name) => {
        const current = element.getAttribute(name)
        const previous = stored.get(name)
        const source = previous && current === previous.localized ? previous.source : current
        if (source !== null && source !== undefined) {
          const next = locale === 'en-US' ? translateUiText(locale, source) : source
          stored.set(name, { source, localized: next })
          if (current !== next) element.setAttribute(name, next)
        }
      })
      originalAttributes.set(htmlElement, stored)
    })
  }
  visit(document.body)
  const observer = new MutationObserver((records) => {
    if (document.documentElement.lang !== locale) return
    if (updating) return
    updating = true
    records.forEach((record) => {
      if (record.type === 'characterData') visit(record.target.parentElement || record.target)
      if (record.type === 'attributes') visit(record.target)
      record.addedNodes.forEach((node) => visit(node))
    })
    updating = false
  })
  observer.observe(document.body, { attributes: true, attributeFilter: ['title', 'aria-label', 'placeholder'], childList: true, subtree: true, characterData: true })
  return () => observer.disconnect()
}
