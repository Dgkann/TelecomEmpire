// The simulation writes finished sentences into the event log and the customer feed, and the save keeps
// them as text. Rather than change the save format, each line is written in the language the player is
// reading at that moment; the store sets this whenever the locale changes. English stays the default so
// the invariant checks and the tests read the same wording as before.
let language: 'en' | 'tr' = 'en';

export function setGameLanguage(locale: 'en' | 'tr') {
  language = locale;
}

export const isTurkish = () => language === 'tr';

// Both wordings sit side by side at the call site, so a log line reads the same in either language.
export const line = (en: string, tr: string) => (language === 'tr' ? tr : en);
