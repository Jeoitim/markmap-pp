import { useLayoutEffect, useMemo, useState, type ReactNode } from 'react'
import { I18nContext } from './i18n-context'
import { detectLocale, syncUiLocale, translate, type Locale } from './i18n'

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(detectLocale)
  useLayoutEffect(() => {
    document.documentElement.dataset.locale = locale
    document.documentElement.lang = locale
    document.title = locale === 'en-US' ? 'markmap++ · Markdown mind-map workspace' : 'markmap++ · 本地思维导图编辑器'
    window.localStorage.setItem('markmap-plus-plus:locale', locale)
    return syncUiLocale(locale)
  }, [locale])
  const value = useMemo(() => ({
    locale,
    setLocale,
    toggleLocale: () => setLocale((current) => current === 'zh-CN' ? 'en-US' : 'zh-CN'),
    t: (source: string) => translate(locale, source),
  }), [locale])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}
