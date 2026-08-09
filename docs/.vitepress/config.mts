import { defineConfig } from 'vitepress';

export default defineConfig({
  lang: 'zh-CN',
  title: 'markmap++ 文档',
  description: 'markmap++ Markdown 思维导图工作台使用与部署文档',
  base: process.env.VITEPRESS_BASE_PATH || '/',
  cleanUrls: true,
  themeConfig: {
    siteTitle: 'markmap++',
    nav: [
      { text: '项目概览', link: '/introduction/' },
      { text: '快速开始', link: '/installation/' },
      { text: 'Agent', link: '/agent/' },
      { text: 'GitHub 同步', link: '/example/' },
      { text: '打开应用', link: 'https://jeoitim.github.io/markmap-pp/' },
    ],
    sidebar: [
      {
        text: 'markmap++ 指南',
        items: [
          { text: '项目概览', link: '/introduction/' },
          { text: '快速开始', link: '/installation/' },
          { text: '编辑与思维导图', link: '/mind-map-usage/' },
          { text: 'Agent 知识与仓库操作', link: '/agent/' },
          { text: 'GitHub 仓库同步', link: '/example/' },
          { text: '导出、部署与开发', link: '/api/' },
        ],
      },
    ],
    socialLinks: [
      { icon: 'github', link: 'https://github.com/Jeoitim/markmap-pp' },
    ],
    search: { provider: 'local' },
    outline: { level: [2, 3], label: '本页目录' },
    docFooter: { prev: '上一页', next: '下一页' },
    lastUpdated: { text: '最后更新' },
    returnToTopLabel: '返回顶部',
    sidebarMenuLabel: '目录',
    darkModeSwitchLabel: '主题',
  },
});
