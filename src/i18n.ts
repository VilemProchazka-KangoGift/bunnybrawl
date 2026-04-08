import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import cs from './locales/cs.json';
import en from './locales/en.json';
import fil from './locales/fil.json';
import hi from './locales/hi.json';

i18n.use(initReactI18next).init({
  resources: {
    cs: { translation: cs },
    en: { translation: en },
    fil: { translation: fil },
    hi: { translation: hi },
  },
  lng: 'cs', // Czech is default
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export default i18n;
