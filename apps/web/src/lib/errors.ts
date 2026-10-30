import { es, type TranslationKey, type Translator } from '../i18n';
import { ApiError } from './api';

export function errorText(t: Translator, error: unknown) {
  if (error instanceof ApiError) {
    const key = `errors.${error.code}` as TranslationKey;
    if (key in es) return t(key);
    return error.message;
  }
  if (error instanceof TypeError) return t('errors.network');
  return t('errors.default');
}
