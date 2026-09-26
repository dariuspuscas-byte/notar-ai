import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './locales/en/translation.json'

// English is the only shipped locale. To add one later: create
// src/locales/<lng>/translation.json with the same keys, import it here and
// add `<lng>: { translation: <lng> }` to `resources`. `en` stays the fallback.
export const resources = {
  en: { translation: en },
} as const

// Resources are bundled and `initAsync: false` makes init complete
// synchronously, so `t` is ready before the first render.
void i18n.use(initReactI18next).init({
  resources,
  initAsync: false,
  lng: 'en',
  fallbackLng: 'en',
  defaultNS: 'translation',
  interpolation: { escapeValue: false }, // React already escapes output
})

export default i18n
