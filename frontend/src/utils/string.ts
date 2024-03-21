/**
 * Escape string to use as regex
 * From https://github.com/tc39/proposal-regex-escaping/blob/main/polyfill.js#L3
 */
export function regexEscape(s: unknown) {
  return String(s).replace(/[\\^$*+?.()|[\]{}]/g, "\\$&");
}

export function regexUnescape(s: unknown) {
  return String(s).replace(/(\\|\/\.\*)/g, "");
}
