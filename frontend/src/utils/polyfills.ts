/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unnecessary-condition */
// cSpell:disable
/**
 * Object.entriesFrom() polyfill
 * @author Chris Ferdinandi
 * @license MIT
 */

if (!Object.fromEntries) {
  Object.fromEntries = function <T = any>(
    entries: Iterable<readonly [PropertyKey, T]>,
  ): { [k: string]: T } {
    if (!entries?.[Symbol.iterator]) {
      throw new Error(
        "Object.fromEntries() requires a single iterable argument",
      );
    }
    const obj: { [k: PropertyKey]: T } = {};
    for (const [key, value] of entries) {
      obj[key] = value;
    }
    return obj;
  };
}
