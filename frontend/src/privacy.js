import * as i18n from './ui/i18n.js';

// The notice in the reader's language, chosen as the app chooses it (ui/i18n.js).
await i18n.init();
document.title = `${i18n.t('privacy.title')} · BikeBuddy`;
