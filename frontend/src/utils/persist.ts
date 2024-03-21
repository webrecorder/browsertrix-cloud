/**
 * Persist shared state properties in browser storage
 */
import type {
  ReadonlyStateVar,
  StateOptions,
  StateVar,
} from "lit-shared-state";

const STORAGE_KEY_PREFIX = "btrix.app";

export const persist = (storage: Storage): StateOptions => ({
  set(stateVar: StateVar, v: string) {
    storage.setItem(`${STORAGE_KEY_PREFIX}.${stateVar.key}`, JSON.stringify(v));
    stateVar.notifyObservers(
      `${STORAGE_KEY_PREFIX}.${stateVar.key}`,
      stateVar.value,
    );
  },
  get(stateVar: ReadonlyStateVar) {
    const stored = storage.getItem(`${STORAGE_KEY_PREFIX}.${stateVar.key}`);
    return stored ? (JSON.parse(stored) as unknown) : undefined;
  },
  init(stateVar: ReadonlyStateVar, valueInit?: unknown) {
    return stateVar.options.get(stateVar) || valueInit;
  },
});
