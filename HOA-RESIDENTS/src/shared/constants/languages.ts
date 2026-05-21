export interface LanguageInfo {
  code: string;
  name: string;
  nativeName: string;
  region: string;
}

export const Languages: Record<string, LanguageInfo> = {
  en: { code: 'en', name: 'English', nativeName: 'English', region: 'Pan-Africa, Global' },
  fr: { code: 'fr', name: 'French', nativeName: 'Français', region: 'West/Central Africa' },
  pt: { code: 'pt', name: 'Portuguese', nativeName: 'Português', region: 'Mozambique, Angola' },
  sw: { code: 'sw', name: 'Swahili', nativeName: 'Kiswahili', region: 'East Africa' },
  af: { code: 'af', name: 'Afrikaans', nativeName: 'Afrikaans', region: 'South Africa' },
  ha: { code: 'ha', name: 'Hausa', nativeName: 'Hausa', region: 'Nigeria, Niger' },
  yo: { code: 'yo', name: 'Yoruba', nativeName: 'Yorùbá', region: 'Nigeria' },
  zu: { code: 'zu', name: 'Zulu', nativeName: 'isiZulu', region: 'South Africa' },
};

export const LanguageCodes = Object.keys(Languages);
