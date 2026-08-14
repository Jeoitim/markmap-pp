---
layout: home

hero:
  name: 'markmap++'
  text: 'Markdown 知识与思维导图工作台'
  tagline: 实时编辑、可视化思考、AI 知识问答与可审核的仓库操作，并通过 GitHub 实现多端同步
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
  - title: Markdown 是唯一源文件
    details: 左侧编辑 Markdown，右侧实时生成可缩放、可折叠、可直接编辑节点的 SVG 思维导图。
  - title: 浏览器本地工作区
    details: 支持语法高亮、问题诊断、撤回、主题与字体设置，草稿在离开页面后仍可保留。
  - title: GitHub 多端同步
    details: 以 IDE 风格文件树管理仓库 Markdown；修改先在本地暂存，确认后一次提交并推送。
  - title: Agent 知识伙伴
    details: 按需搜索和读取笔记，融合模型通用知识回答问题；Edit 模式通过 Diff 审核修改并可请求 Git 提交。
  - title: 多格式高清导出
    details: 导出 Markdown、SVG、PNG、JPEG 和 HTML，位图支持 1–4 倍渲染倍率。
  - title: 桌面与移动设备
    details: 桌面端可调节和收起编辑区，移动端可在编辑与预览间切换，并支持浏览器全屏。
  - title: 本地优先与静态部署
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
