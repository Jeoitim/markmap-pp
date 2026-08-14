import { defineConfig } from 'vitepress';

const zhNav = [
  {
    text: '文档',
    items: [
      { text: '项目概览', link: '/introduction/' },
      { text: '功能导航', link: '/modules/' },
      { text: '快速开始', link: '/installation/' },
    ],
  },
  {
    text: '使用模块',
    items: [
      { text: '编辑与思维导图', link: '/mind-map-usage/' },
      { text: 'Agent 知识与仓库操作', link: '/agent/' },
      { text: 'GitHub 仓库同步', link: '/example/' },
      { text: 'Web 与桌面 App', link: '/app/' },
      { text: '导出、部署与开发', link: '/api/' },
    ],
  },
  { text: '打开应用', link: 'https://jeoitim.github.io/markmap-pp/' },
];

const enNav = [
  {
    text: 'Docs',
    items: [
      { text: 'Overview', link: '/en/introduction/' },
      { text: 'Feature map', link: '/en/modules/' },
      { text: 'Quick start', link: '/en/installation/' },
    ],
  },
  {
    text: 'Modules',
    items: [
      { text: 'Editing and mind maps', link: '/en/mind-map-usage/' },
      { text: 'Agent knowledge and repository actions', link: '/en/agent/' },
      { text: 'GitHub repository sync', link: '/en/example/' },
      { text: 'Web and desktop apps', link: '/en/app/' },
      { text: 'Export, deploy and develop', link: '/en/api/' },
    ],
  },
  { text: 'Open app', link: 'https://jeoitim.github.io/markmap-pp/' },
];

const zhSidebar = {
  '/': [{
    text: 'markmap++ 指南',
    collapsed: true,
    items: [
      { text: '项目概览', link: '/introduction/' },
      { text: '快速开始', link: '/installation/' },
      { text: 'Web 与桌面 App', link: '/app/' },
      { text: 'Electron 桌面开发', link: '/desktop/' },
    ],
  }, {
    text: '功能模块',
    collapsed: true,
    items: [
      { text: '功能导航', link: '/modules/' },
      { text: '编辑与思维导图', link: '/mind-map-usage/' },
      { text: 'Agent 知识与仓库操作', link: '/agent/' },
      { text: 'GitHub 仓库同步', link: '/example/' },
      { text: '导出、部署与开发', link: '/api/' },
    ],
  }],
};

const enSidebar = {
  '/en/': [{
    text: 'markmap++ guide',
    collapsed: true,
    items: [
      { text: 'Overview', link: '/en/introduction/' },
      { text: 'Quick start', link: '/en/installation/' },
      { text: 'Web and desktop apps', link: '/en/app/' },
      { text: 'Electron desktop development', link: '/en/desktop/' },
    ],
  }, {
    text: 'Features',
    collapsed: true,
    items: [
      { text: 'Feature map', link: '/en/modules/' },
      { text: 'Editing and mind maps', link: '/en/mind-map-usage/' },
      { text: 'Agent knowledge and repository actions', link: '/en/agent/' },
      { text: 'GitHub repository sync', link: '/en/example/' },
      { text: 'Export, deploy and develop', link: '/en/api/' },
    ],
  }],
};

export default defineConfig({
  lang: 'zh-CN',
  title: 'markmap++ 文档',
  description: 'markmap++ Markdown 思维导图工作台使用与部署文档',
  base: process.env.VITEPRESS_BASE_PATH || '/',
  cleanUrls: true,
  locales: {
    root: {
      label: '简体中文',
      lang: 'zh-CN',
      link: '/',
      themeConfig: {
        nav: zhNav,
        sidebar: zhSidebar,
        outline: { level: [2, 3], label: '本页目录' },
        docFooter: { prev: '上一页', next: '下一页' },
        lastUpdated: { text: '最后更新' },
        returnToTopLabel: '返回顶部',
        sidebarMenuLabel: '目录',
        darkModeSwitchLabel: '主题',
      },
    },
    en: {
      label: 'English',
      lang: 'en-US',
      link: '/en/',
      themeConfig: {
        nav: enNav,
        sidebar: enSidebar,
        outline: { level: [2, 3], label: 'On this page' },
        docFooter: { prev: 'Previous page', next: 'Next page' },
        lastUpdated: { text: 'Last updated' },
        returnToTopLabel: 'Back to top',
        sidebarMenuLabel: 'Menu',
        darkModeSwitchLabel: 'Theme',
      },
    },
  },
  themeConfig: {
    siteTitle: 'markmap++',
    logo: {
      src: '/brand/markmap-plus-plus-icon.svg',
      alt: 'markmap++',
    },
    aside: true,
    socialLinks: [
      { icon: 'github', link: 'https://github.com/Jeoitim/markmap-pp' },
    ],
    search: { provider: 'local' },
  },
});
