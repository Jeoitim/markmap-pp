---
layout: home

hero:
  name: 'markmap++'
  text: 'Markdown 知识与思维导图工作台'
  tagline: 实时编辑、可视化思考、AI 知识问答与可审核的仓库操作，并通过 GitHub 实现多端同步
  image:
    src: /hero-demo.svg
    alt: Markdown 输入实时生成思维导图的示例动画
  actions:
    - theme: brand
      text: 打开 markmap++
      link: https://jeoitim.github.io/markmap-pp/
    - theme: alt
      text: App 介绍与下载
      link: /app/
    - theme: alt
      text: 快速开始
      link: /installation/
    - theme: alt
      text: GitHub 同步
      link: /example/
    - theme: alt
      text: Agent 指南
      link: /agent/

features:
  - icon:
      src: https://api.iconify.design/simple-icons/markdown.svg?color=%237056e8
      alt: Markdown 文档
    title: Markdown 是唯一源文件
    details: 左侧编辑 Markdown，右侧实时生成可缩放、可折叠、可直接编辑节点的 SVG 思维导图。
  - icon:
      src: https://api.iconify.design/lucide/git-branch.svg?color=%237056e8
      alt: 思维导图工作区
    title: 浏览器本地工作区
    details: 支持源码 / WYSIWYG 视觉编辑、语法诊断、拼写检查、撤回、主题与字体设置，草稿和模式偏好在离开页面后仍可保留。
  - icon:
      src: https://api.iconify.design/simple-icons/github.svg?color=%237056e8
      alt: GitHub 同步
    title: GitHub 多端同步
    details: 以 IDE 风格文件树管理仓库 Markdown；修改先在本地暂存，确认后一次提交并推送。
  - icon:
      src: https://api.iconify.design/lucide/sparkles.svg?color=%237056e8
      alt: Agent
    title: Agent 知识伙伴
    details: 按需搜索和读取笔记，融合模型通用知识回答问题；Edit 模式通过 Diff 审核修改并可请求 Git 提交。
  - icon:
      src: https://api.iconify.design/lucide/download.svg?color=%237056e8
      alt: 导出
    title: 多格式高清导出
    details: 导出 Markdown、SVG、静态矢量 PDF、PNG、JPEG 和 HTML；位图支持 1–4 倍渲染倍率。
  - icon:
      src: https://api.iconify.design/lucide/monitor-smartphone.svg?color=%237056e8
      alt: 桌面与移动设备
    title: 桌面与移动设备
    details: 桌面端可调节和收起编辑区，移动端可在编辑与预览间切换，保留系统选中栏并支持点击仓库文件回到编辑器。
  - icon:
      src: https://api.iconify.design/lucide/folder-lock.svg?color=%237056e8
      alt: 本地优先
    title: 本地优先与静态部署
    details: 草稿、仓库绑定、Agent 配置和历史保存在浏览器，无需数据库或自建后端。
---

## 从这里开始

markmap++ 完全运行在浏览器中。第一次使用可以直接打开应用并修改欢迎示例；示例会在下次打开时恢复，因此需要保留的内容应导出为 Markdown，或者绑定 GitHub 仓库进行持久保存。

<section class="home-app-spotlight" aria-labelledby="home-app-title">
  <div class="home-app-copy">
    <div class="home-app-brand">
      <img src="./brand/markmap-plus-plus-icon.svg" alt="markmap++ 应用图标" />
      <div>
        <span class="home-app-kicker">Web + Desktop</span>
        <h2 id="home-app-title">把笔记变成可以继续工作的导图</h2>
      </div>
    </div>
    <p>浏览器版适合随时打开，桌面 App 适合直接读写本地 Markdown 和 Git 工作区。两者共享编辑器、导图、Agent 与 GitHub 同步能力。</p>
    <div class="home-app-actions">
      <a class="home-app-primary" href="./app/">了解 App 与下载方式</a>
      <a class="home-app-secondary" href="https://jeoitim.github.io/markmap-pp/">立即打开 Web 版</a>
    </div>
  </div>
  <div class="home-map-art">
    <img src="./markmap-art.png" alt="markmap++ 彩色思维导图示例" />
  </div>
</section>

<section class="home-workflow" aria-labelledby="home-workflow-title">
  <div class="home-section-heading">
    <span class="home-section-kicker">One source, more momentum</span>
    <h2 id="home-workflow-title">一份 Markdown，三种继续工作的方式</h2>
    <p>从记录到整理，再到跨设备同步，markmap++ 让内容始终留在你能审阅和带走的源文件里。</p>
  </div>
  <div class="home-workflow-grid">
    <article class="home-workflow-card">
      <span class="home-workflow-number">01</span>
      <h3>写下来，马上看见结构</h3>
      <p>左侧编辑 Markdown，右侧实时展开思维导图；节点、画布和主题都能继续调整。</p>
      <span class="home-workflow-tag">Markdown → Mind map</span>
    </article>
    <article class="home-workflow-card">
      <span class="home-workflow-number">02</span>
      <h3>让 Agent 帮你继续整理</h3>
      <p>结合当前笔记和上下文提问，在 Edit 模式中先看方案、再审核每一处修改。</p>
      <span class="home-workflow-tag">Ask → Review → Apply</span>
    </article>
    <article class="home-workflow-card">
      <span class="home-workflow-number">03</span>
      <h3>带着自己的仓库走</h3>
      <p>连接 GitHub 笔记仓库，在浏览器、桌面 App 和移动设备之间继续你的工作。</p>
      <span class="home-workflow-tag">GitHub sync</span>
    </article>
  </div>
</section>
