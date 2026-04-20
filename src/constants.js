'use strict';

const CBT_URL = 'https://cbt.mtssupel.sch.id';
const CBT_DOMAIN = 'cbt.mtssupel.sch.id';
const INTERNET_CHECK_TIMEOUT_MS = 10_000;
const SERVER_LOAD_TIMEOUT_MS = 30_000;
const MIN_FREE_RAM_BYTES = 512 * 1024 * 1024; // 512 MB
const EXIT_SHORTCUT = 'Ctrl+Shift+Q';

// Branding — edit these to customise the launcher appearance.
// APP_LOGO: filename of the logo image inside src/ (e.g. 'logo.png').
//           Set to null to use the default SVG icon.
const APP_NAME    = 'Yamitra.com';
const APP_TAGLINE = 'Management a SaaS Application';
const APP_LOGO    = null; // e.g. 'logo.png'

module.exports = {
  CBT_URL,
  CBT_DOMAIN,
  INTERNET_CHECK_TIMEOUT_MS,
  SERVER_LOAD_TIMEOUT_MS,
  MIN_FREE_RAM_BYTES,
  EXIT_SHORTCUT,
  APP_NAME,
  APP_TAGLINE,
  APP_LOGO,
};
