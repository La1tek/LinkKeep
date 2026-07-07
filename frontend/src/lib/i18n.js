import { useEffect, useState } from 'react'

const KEY = 'lk_lang'
const STRINGS = {
  en: {
    settings: 'Settings',
    language: 'Language',
    publicShares: 'Shared Collections',
    recommendations: 'Recommendations',
    admin: 'Admin',
  },
  ru: {
    settings: 'Настройки',
    language: 'Язык',
    publicShares: 'Общие коллекции',
    recommendations: 'Рекомендации',
    admin: 'Админка',
  },
}

export function getLanguage() {
  return localStorage.getItem(KEY) || 'en'
}

export function setLanguage(lang) {
  const next = STRINGS[lang] ? lang : 'en'
  localStorage.setItem(KEY, next)
  document.documentElement.lang = next
  window.dispatchEvent(new CustomEvent('language-changed', { detail: next }))
}

export function useI18n() {
  const [lang, setLang] = useState(getLanguage())
  useEffect(() => {
    document.documentElement.lang = lang
    const handler = (event) => setLang(event.detail || getLanguage())
    window.addEventListener('language-changed', handler)
    return () => window.removeEventListener('language-changed', handler)
  }, [lang])
  const t = (key) => STRINGS[lang]?.[key] || STRINGS.en[key] || key
  return { lang, setLanguage, t }
}
