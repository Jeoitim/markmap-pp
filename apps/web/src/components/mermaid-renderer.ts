export type MermaidTheme = 'dark' | 'default'

let mermaidModule: Promise<typeof import('mermaid')> | null = null

// 暗色模式下，Mermaid 的默认浅色节点背景会和浅色文字形成低对比度。
// 保留色相与饱和度，只反转过亮颜色的明度，让 SVG 在暗色画布中仍然可读。
export function adaptDarkMermaidSvg(svg: string): string {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml')
  const cache = new Map<string, string>()
  const parseColor = (raw: string): [number, number, number] | null => {
    const value = raw.trim()
    const hex = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)
    if (hex) {
      const full = hex[1].length === 3 ? hex[1].split('').map((c) => c + c).join('') : hex[1]
      return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)]
    }
    const rgb = value.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/)
    if (rgb) return [Math.min(255, Number(rgb[1])), Math.min(255, Number(rgb[2])), Math.min(255, Number(rgb[3]))]
    return null
  }
  const toHex = (r: number, g: number, b: number) => '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')
  const rgbToHsl = (rgb: [number, number, number]): [number, number, number] => {
    const [r, g, b] = [rgb[0] / 255, rgb[1] / 255, rgb[2] / 255]
    const max = Math.max(r, g, b), min = Math.min(r, g, b)
    const l = (max + min) / 2
    if (max === min) return [0, 0, l]
    const d = max - min
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    let h = 0
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
    else if (max === g) h = ((b - r) / d + 2) / 6
    else h = ((r - g) / d + 4) / 6
    return [h, s, l]
  }
  const hslToHex = ([h, s, l]: [number, number, number]): string => {
    if (s === 0) return toHex(l * 255, l * 255, l * 255)
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s
    const p = 2 * l - q
    const channel = (t: number) => {
      const tt = ((t % 1) + 1) % 1
      return tt < 1 / 6 ? p + (q - p) * 6 * tt : tt < 1 / 2 ? q : tt < 2 / 3 ? p + (q - p) * (2 / 3 - tt) * 6 : p
    }
    return toHex(channel(h + 1 / 3) * 255, channel(h) * 255, channel(h - 1 / 3) * 255)
  }
  const transform = (raw: string) => {
    const rgb = parseColor(raw)
    if (!rgb) return raw
    const [h, s, l] = rgbToHsl(rgb)
    if (l < 0.55) return raw
    return hslToHex([h, s, 1 - l])
  }
  doc.querySelectorAll('g.node > rect, g.node > circle, g.node > ellipse, g.node > polygon, g.node > path').forEach((shape) => {
    const style = shape.getAttribute('style') || ''
    const match = style.match(/fill\s*:\s*([^;!]+)/i)
    if (!match) return
    const key = match[1].trim()
    if (!cache.has(key)) cache.set(key, transform(key))
    const next = cache.get(key)
    if (next === key) return
    shape.setAttribute('style', style.replace(/fill\s*:\s*[^;!]+/i, 'fill:' + next))
    const label = shape.parentElement?.querySelector(':scope > .label') ?? shape.parentElement?.querySelector('.label')
    if (label) {
      const current = label.getAttribute('style') || ''
      label.setAttribute('style', /fill\s*:/.test(current) ? current.replace(/fill\s*:\s*[^;!]+/i, 'fill:#ccc') : current + (current ? ';' : '') + 'fill:#ccc')
    }
  })
  return new XMLSerializer().serializeToString(doc)
}

export async function renderMermaidSvg(chart: string, id: string, theme: MermaidTheme): Promise<string> {
  mermaidModule ||= import('mermaid')
  const { default: mermaid } = await mermaidModule
  mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', htmlLabels: false, theme })
  const rendered = await mermaid.render(id, chart)
  return theme === 'dark' ? adaptDarkMermaidSvg(rendered.svg) : rendered.svg
}

export function mermaidViewBoxSize(svg: string) {
  const viewBox = svg.match(/viewBox=["']\s*[\d.-]+\s+[\d.-]+\s+([\d.-]+)\s+([\d.-]+)/i)
  return { w: Number(viewBox?.[1]) || 720, h: Number(viewBox?.[2]) || 480 }
}

export function mermaidRenderId(seed: string) {
  let hash = 2166136261
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `markmap-mermaid-${(hash >>> 0).toString(16)}`
}
