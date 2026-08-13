import { createContext } from 'react'
import type { Locale } from './i18n'

export interface I18nContextValue {
  locale: Locale
  setLocale: (locale: Locale) => void
  toggleLocale: () => void
  t: (source: string) => string
}

export const I18nContext = createContext<I18nContextValue | null>(null)
