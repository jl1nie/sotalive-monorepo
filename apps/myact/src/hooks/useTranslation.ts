import { useCallback } from 'react';
import { usePrefsStore } from '@/stores';
import { translations, type TranslationKey } from '@/i18n';

export function useTranslation() {
  const language = usePrefsStore((s) => s.language);

  const t = useCallback(
    (key: TranslationKey): string => {
      return translations[language][key] || translations.ja[key] || key;
    },
    [language]
  );

  return { t, language };
}
