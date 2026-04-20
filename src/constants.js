'use strict';

const CBT_URL = 'https://cbt.mtssupel.sch.id';
const CBT_DOMAIN = 'cbt.mtssupel.sch.id';
const INTERNET_CHECK_TIMEOUT_MS = 10_000;
const SERVER_LOAD_TIMEOUT_MS = 30_000;
const MIN_FREE_RAM_BYTES = 512 * 1024 * 1024; // 512 MB
const EXIT_SHORTCUT = 'Ctrl+Shift+Q';

module.exports = {
  CBT_URL,
  CBT_DOMAIN,
  INTERNET_CHECK_TIMEOUT_MS,
  SERVER_LOAD_TIMEOUT_MS,
  MIN_FREE_RAM_BYTES,
  EXIT_SHORTCUT,
};
