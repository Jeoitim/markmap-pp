import { useCallback, useLayoutEffect, useMemo, useState, type ReactNode } from 'react'
import { I18nContext } from './i18n-context'
import { detectLocale, LOCALE_KEY, syncUiLocale, translate, type Locale } from './i18n'

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(detectLocale)
  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next)
    if (typeof window !== 'undefined') window.localStorage.setItem(LOCALE_KEY, next)
  }, [])
  const toggleLocale = useCallback(() => {
    setLocaleState((current) => {
      const next = current === 'zh-CN' ? 'en-US' : 'zh-CN'
      if (typeof window !== 'undefined') window.localStorage.setItem(LOCALE_KEY, next)
      return next
    })
  }, [])
  useLayoutEffect(() => {
    document.documentElement.dataset.locale = locale
    document.documentElement.lang = locale
    document.title = locale === 'en-US' ? 'markmap++ · Markdown mind-map workspace' : 'markmap++ · 本地思维导图编辑器'
    return syncUiLocale(locale)
  }, [locale])
  const value = useMemo(() => ({
    locale,
    setLocale,
    toggleLocale,
    t: (source: string) => translate(locale, source),
  }), [locale, setLocale, toggleLocale])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}
