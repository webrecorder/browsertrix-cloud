import type { DebouncedFunc } from "lodash";

/**
 * Gets the underlying function type of a debounced function.
 * Useful because lit-plugin doesn't recognize debounced function types as callable
 *
 * @example
 * <sl-input ‍‍@sl-input={this.onInput as UnderlyingFunction<typeof this.onInput>} >
 */
export type UnderlyingFunction<T> = T extends DebouncedFunc<infer F> ? F : T;

type Enumerate<
  N extends number,
  Acc extends number[] = [],
> = Acc["length"] extends N
  ? Acc[number]
  : Enumerate<N, [...Acc, Acc["length"]]>;

/** Number literal range from `F` to `T` (exclusive) */
export type Range<F extends number, T extends number> = Exclude<
  Enumerate<T>,
  Enumerate<F>
>;
