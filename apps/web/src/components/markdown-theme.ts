export type MarkdownThemeKey =
  | 'github-light'
  | 'solarized-light'
  | 'gruvbox-light'
  | 'catppuccin-latte'
  | 'everforest-light'
  | 'tokyonight-day'
  | 'everforest'
  | 'gruvbox-dark'
  | 'tokyonight'
  | 'catppuccin-mocha'
  | 'nord'
  | 'dracula'

export interface MarkdownThemePalette {
  foreground: string
  heading: string
  keyword: string
  link: string
  code: string
  codeBackground: string
  quote: string
}

export const markdownThemePalette: Record<MarkdownThemeKey, MarkdownThemePalette> = {
  'github-light': { foreground: '#1f2328', heading: '#0969da', keyword: '#cf222e', link: '#0969da', code: '#953800', codeBackground: '#f6f8fa', quote: '#57606a' },
  'solarized-light': { foreground: '#586e75', heading: '#268bd2', keyword: '#d33682', link: '#2aa198', code: '#cb4b16', codeBackground: '#eee8d5', quote: '#859900' },
  'gruvbox-light': { foreground: '#3c3836', heading: '#076678', keyword: '#9d0006', link: '#076678', code: '#af3a03', codeBackground: '#f2e5bc', quote: '#79740e' },
  'catppuccin-latte': { foreground: '#4c4f69', heading: '#1e66f5', keyword: '#d20f39', link: '#8839ef', code: '#fe640b', codeBackground: '#e6e9ef', quote: '#40a02b' },
  'everforest-light': { foreground: '#5c6a72', heading: '#3a94c5', keyword: '#f85552', link: '#8da101', code: '#f57d26', codeBackground: '#e9dfc0', quote: '#35a77c' },
  'tokyonight-day': { foreground: '#3760bf', heading: '#2e7de9', keyword: '#f52a65', link: '#9854f1', code: '#b15c00', codeBackground: '#d5d6db', quote: '#587539' },
  everforest: { foreground: '#d3c6aa', heading: '#a7c080', keyword: '#e67e80', link: '#7fbbb3', code: '#e69875', codeBackground: '#3d484d', quote: '#a7c080' },
  'gruvbox-dark': { foreground: '#ebdbb2', heading: '#83a598', keyword: '#fb4934', link: '#83a598', code: '#fe8019', codeBackground: '#3c3836', quote: '#b8bb26' },
  tokyonight: { foreground: '#c0caf5', heading: '#7aa2f7', keyword: '#f7768e', link: '#bb9af7', code: '#ff9e64', codeBackground: '#24283b', quote: '#9ece6a' },
  'catppuccin-mocha': { foreground: '#cdd6f4', heading: '#89b4fa', keyword: '#f38ba8', link: '#cba6f7', code: '#fab387', codeBackground: '#313244', quote: '#a6e3a1' },
  nord: { foreground: '#d8dee9', heading: '#88c0d0', keyword: '#bf616a', link: '#81a1c1', code: '#d08770', codeBackground: '#434c5e', quote: '#a3be8c' },
  dracula: { foreground: '#f8f8f2', heading: '#8be9fd', keyword: '#ff79c6', link: '#8be9fd', code: '#ffb86c', codeBackground: '#44475a', quote: '#50fa7b' },
}
