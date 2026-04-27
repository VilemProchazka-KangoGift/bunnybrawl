import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import cs from './locales/cs.json';
import en from './locales/en.json';
import fil from './locales/fil.json';
import hi from './locales/hi.json';
import { safeStorage } from './storage';

const LS_LANG = 'carrotroyale_lang';
const savedLng = safeStorage.get(LS_LANG);

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
  safeStorage.set(LS_LANG, lng);
});

export default i18n;
