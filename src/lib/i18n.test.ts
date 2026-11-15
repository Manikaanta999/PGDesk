import assert from 'node:assert/strict';
import test from 'node:test';
import {
  HEADING_TRANSLATIONS,
  LANGUAGE_PROMPT_COPY,
  LANGUAGE_STORAGE_KEY,
  readStoredLanguage,
  resolveInitialLanguage,
  shouldShowLanguagePrompt,
  translateHeading,
  type HeadingTranslationKey,
} from './i18n.ts';

test('default language is English and prompt displays only when no preference is stored', () => {
  assert.equal(LANGUAGE_STORAGE_KEY, 'pgdesk_language');
  assert.equal(resolveInitialLanguage(null), 'en');
  assert.equal(resolveInitialLanguage('invalid'), 'en');
  assert.equal(resolveInitialLanguage('en'), 'en');
  assert.equal(resolveInitialLanguage('te'), 'te');

  assert.equal(shouldShowLanguagePrompt(null), true);
  assert.equal(shouldShowLanguagePrompt('unknown'), true);
  assert.equal(shouldShowLanguagePrompt('en'), false);
  assert.equal(shouldShowLanguagePrompt('te'), false);
});

test('heading dictionary contains only approved heading keys with non-empty EN and TE entries', () => {
  const keys = Object.keys(HEADING_TRANSLATIONS.en) as HeadingTranslationKey[];
  assert.ok(keys.length >= 25);

  for (const key of keys) {
    assert.ok(key.startsWith('heading.'), `Expected heading-only key, got ${key}`);
    assert.ok(HEADING_TRANSLATIONS.en[key].trim().length > 0, `Missing EN heading for ${key}`);
    assert.ok(HEADING_TRANSLATIONS.te[key].trim().length > 0, `Missing TE heading for ${key}`);
    assert.equal(translateHeading('en', key), HEADING_TRANSLATIONS.en[key]);
    assert.equal(translateHeading('te', key), HEADING_TRANSLATIONS.te[key]);
  }
});

test('translateHeading falls back cleanly to English if language is unknown', () => {
  const fakeLang = 'fr' as unknown as 'en' | 'te';
  assert.equal(translateHeading(fakeLang, 'heading.pageOverview'), 'Your Hostel Overview');
  assert.equal(translateHeading('te', 'heading.pageOverview'), 'మీ హాస్టల్ వివరాలు');
  assert.equal(LANGUAGE_PROMPT_COPY.keepEnglish, 'English is fine');
  assert.equal(LANGUAGE_PROMPT_COPY.useTelugu, 'Use Telugu');
});

test('readStoredLanguage returns null safely outside browser window', () => {
  assert.equal(readStoredLanguage(), null);
});
