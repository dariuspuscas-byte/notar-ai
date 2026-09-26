import 'i18next'
import type en from './locales/en/translation.json'

// Types `t()` keys against the English catalog, so a wrong key fails `tsc`.
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation'
    resources: { translation: typeof en }
  }
}
