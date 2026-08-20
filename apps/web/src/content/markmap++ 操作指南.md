---
title: markmap++ 操作指南
options:
  colorFreezeLevel: 2
---

# markmap++

## 👋 欢迎使用

- 左侧编写 **Markdown**，右侧即时生成思维导图
- 这里集中介绍节点、画布、Markdown、导出与 GitHub 文档同步
- 需要修改内容时，请回到左侧 Markdown 编辑器；重要内容请使用顶部 **导出** 保存
- [markmap++ 文档站](https://jeoitim.github.io/markmap-pp/doc/) · GitHub 项目：[Jeoitim/markmap-pp](https://github.com/Jeoitim/markmap-pp)

## 🧭 节点与画布操作

| 图标 | 操作 | 效果 |
| :--: | --- | --- |
| 🖱️ | 单击 / 双击节点 | 选中节点 / 编辑文字 |
| ↩️ | 选中后按 Enter | 新增同级节点 |
| ⇥ | 选中后按 Tab | 新增子节点 |
| ⌫ | Delete / Backspace | 删除整个节点 |
| ↶ | 点击顶部“撤回” | 恢复最近一次修改 |
| ✥ | 拖动画布 / 滚轮 | 移动画布 / 缩放视图 |
| ◉ | 点击节点圆点 | 折叠或展开分支 |

## ✍️ Markdown 丰富语法

### 文字样式

- **粗体**、*斜体*、~~删除线~~、==高亮== 与 `行内代码`
- 很长很长的文字会根据可用宽度自动换行，你也可以手动设定maxWidth参数，适合记录完整说明
- 有序步骤
  1. 在左侧拖动光标选中文字
  2. 输入或粘贴 Markdown
  3. 在右侧查看实时结果

### 任务清单

- [x] 表格
- [x] LaTeX 公式
- [x] Checkbox
- [x] 在线图片
- [ ] 用你的内容继续探索

### 代码块

```js
const message = 'Hello, markmap++'
console.log(message)
```

## ∑ LaTeX 公式

### 实际渲染

- 行内公式：圆的面积是 $A = \pi r^2$
- 二次方程求根公式：$x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}$

### 公式源码示例

```latex
\int_{-\infty}^{\infty} e^{-x^2} \, dx = \sqrt{\pi}
```

## 🖼️ 在线图片

### Markmap

![Markmap 图标](https://markmap.js.org/favicon.png)

### GitHub

![GitHub 图标](https://cdn.simpleicons.org/github/7056e8)

## 🎛️ 编辑与显示

| 位置 | 能做什么 |
| --- | --- |
| 中间分割线 | 拖动调整两侧宽度；长条按钮收起或展开编辑器 |
| 编辑器右上角 | 调整字号与语法高亮方案 |
| 预览右上角 | 适应画布、切换字体/字重和点阵背景 |
| 页面右上角 | 打开说明、撤回、导出、全屏和深浅色模式 |

## ☁️ GitHub 多端同步

| 状态 | 含义 | 下一步 |
| :--: | --- | --- |
| 灰点 | 文件尚未拉取 | 单击文件下载到本机缓存 |
| A / M | 新增 / 已修改 | 检查内容后点击“同步” |
| R / D | 已重命名 / 已删除 | 同步后写入远端仓库 |
| 🟢 | 已同步 | 可以继续编辑 |
| 🟠 | 已暂存、未推送 | 点击“同步”创建提交并推送 |

## 📦 导出

- Markdown：保留可继续编辑的源文件
- SVG / HTML：适合网页与无限缩放
- PDF：静态矢量页面，适合打印；网页端会打开打印对话框
- PNG / JPEG：适合分享，可选择 1×–4× 渲染倍率
