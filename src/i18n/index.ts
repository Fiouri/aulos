import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';

import { en } from './en';

export const defaultNS = 'translation';

export const i18n = createInstance();

// initReactI18next registers this instance for useTranslation().
void i18n.use(initReactI18next).init({
  lng: 'en',
  fallbackLng: 'en',
  supportedLngs: ['en'],
  defaultNS,
  resources: { en: { [defaultNS]: en } },
  initAsync: false,
  interpolation: { escapeValue: false },
  returnNull: false,
});
