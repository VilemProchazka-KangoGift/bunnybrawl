import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import cs from './locales/cs.json';
import en from './locales/en.json';
import fil from './locales/fil.json';
import hi from './locales/hi.json';

const savedLng = (() => { try { return localStorage.getItem('bunnybrawl_lang'); } catch { return null; } })();

i18n.use(initReactI18next).init({
  resources: {
    cs: { translation: cs },
    en: { translation: en },
    fil: { translation: fil },
    hi: { translation: hi },
  },
  lng: savedLng || 'cs',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

i18n.on('languageChanged', (lng) => {
  try { localStorage.setItem('bunnybrawl_lang', lng); } catch { /* noop */ }
});

export default i18n;
