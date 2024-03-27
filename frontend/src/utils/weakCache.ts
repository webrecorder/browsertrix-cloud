export const WeakRefMapInnerValue = Symbol("inner value");

type WeakRefValue<T> = T extends object
  ? T & object
  : { [WeakRefMapInnerValue]: T };

const isWrapped = <V>(
  cache: (V & object) | { [WeakRefMapInnerValue]: V } | undefined,
): cache is { [WeakRefMapInnerValue]: V } => {
  return Object.prototype.hasOwnProperty.call(
    cache ?? {},
    WeakRefMapInnerValue,
  );
};

const isObj = (v: unknown): v is object => typeof v === "object" && v !== null;

const wrapValue = <V>(value: V) =>
  (isObj(value) ? value : { [WeakRefMapInnerValue]: value }) as WeakRefValue<V>;

const unwrapValue = <V>(val: WeakRef<WeakRefValue<V>> | undefined) => {
  const cache = val?.deref();
  return isWrapped(cache) ? cache[WeakRefMapInnerValue] : (cache as V);
};

/**
 * Maps arbitrary keys to values, using {@linkcode WeakRef}s for the values and a {@linkcode FinalizationRegistry} so that data is deleted when a cached value is garbage-collected. This is sort of the inverse of a {@linkcode WeakMap}.
 *
 * Adapted from https://developer.mozilla.org/en-US/docs/Web/JavaScript/Memory_management#weakrefs_and_finalizationregistry and https://stackoverflow.com/a/72896692
 */
export class WeakRefMap<K, V> {
  readonly cacheMap = new Map<K, WeakRef<WeakRefValue<V>>>();
  private readonly finalizer = new FinalizationRegistry((key: K) => {
    this.cacheMap.delete(key);
  });

  set(key: K, value: V): V {
    const cache = this.get(key);
    if (cache) {
      if (cache === value) return value;
      if (typeof cache === "object") {
        this.finalizer.unregister(cache);
      }
    }
    const objVal = wrapValue(value);
    const ref = new WeakRef(objVal);
    this.cacheMap.set(key, ref);
    this.finalizer.register(objVal, key, objVal);

    return isWrapped(objVal) ? objVal[WeakRefMapInnerValue] : (objVal as V);
  }

  get(key: K): V | undefined {
    return unwrapValue(this.cacheMap.get(key));
  }

  has(key: K): boolean {
    return this.cacheMap.has(key);
  }
}

export const InnerCache = Symbol("Inner cache");

export function cached<
  Args extends unknown[],
  Result,
  Serializer extends (args: Args) => unknown = (args: Args) => string,
>(
  fn: (...args: Args) => Result,
  serializer: Serializer = JSON.stringify as Serializer,
) {
  type Key = ReturnType<Serializer>;
  const cache = new WeakRefMap<Key, Result>();
  const cachedFn: {
    (...args: Args): Result;
    [InnerCache]: WeakRefMap<Key, Result>;
  } = (...args: Args) => {
    let k;
    try {
      k = serializer(args) as Key;
    } catch (e) {
      throw new Error(
        "Unable to serialize function arguments successfully - ensure your serializer function is able to handle the args you're passing in",
      );
    }
    return cache.get(k) ?? cache.set(k, fn(...args));
  };
  cachedFn[InnerCache] = cache;
  return cachedFn;
}
