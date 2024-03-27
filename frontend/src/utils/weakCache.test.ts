import { expect } from "@open-wc/testing";
import { fake } from "sinon";

import { cached, WeakRefMap, WeakRefMapInnerValue } from "./weakCache";

describe("WeakRefMap", () => {
  it("works with objects", () => {
    const cache = new WeakRefMap<object, object>();
    const objs = { key: { a: 1 }, value: { b: 2 } } as {
      key: { a: 1 };
      value?: { b: 2 };
    };
    cache.set(objs.key, objs.value!);
    expect(cache.get(objs.key)).to.equal(objs.value);
  });

  it("works with strings", () => {
    const cache = new WeakRefMap<string, string>();
    cache.set("a", "b");
    expect(cache.get("a")).to.equal("b");
    expect(cache.cacheMap.get("a")?.deref()?.[WeakRefMapInnerValue]).to.equal(
      "b",
    );
  });

  it("works with booleans", () => {
    const cache = new WeakRefMap<boolean, boolean>();
    cache.set(true, false);
    cache.set(false, true);
    expect(cache.get(true)).to.equal(false);
    expect(cache.get(false)).to.equal(true);
  });

  it("works with nulls, undefined values, and symbols", () => {
    const cache = new WeakRefMap<
      null | undefined | symbol,
      null | undefined | symbol
    >();
    cache.set(null, undefined);
    cache.set(undefined, Symbol.for("abc"));
    cache.set(Symbol.for("abc"), null);
    expect(cache.get(null)).to.be.undefined;
    expect(cache.get(undefined)).to.equal(Symbol.for("abc"));
    expect(cache.get(Symbol.for("abc"))).to.be.null;

    // Ensure that we're getting the values from within the WeakRefs
    expect(cache.cacheMap.get(null)!.deref()![WeakRefMapInnerValue]).to.be
      .undefined;
    expect(
      cache.cacheMap.get(Symbol.for("abc"))!.deref()![WeakRefMapInnerValue],
    ).to.be.null;
  });

  it("removes entries when memory is cleared", function (done) {
    this.timeout(20_000);

    // Adapted from https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/FinalizationRegistry#callbacks_never_called_synchronously
    const cache = new WeakRefMap<string, object>();
    let counter = 0;
    cache.set("a", { b: 1 });
    (function allocateMemory() {
      // Allocate 50000 functions — a lot of memory!
      Array.from({ length: 50000 }, () => () => {});
      const memoryFreed = !cache.cacheMap.has("a");
      if (counter === 1) {
        expect(memoryFreed).to.be.false;
        console.log("Cache retained at 1 iteration");
      }
      if (counter > 5000 || memoryFreed) {
        console.log(
          `${memoryFreed ? "Memory freed" : "Reached counter limit"} at ${counter} iterations`,
        );
        expect(memoryFreed).to.be.true;

        done();
        return;
      }
      counter++;
      setTimeout(allocateMemory);
    })();
    expect(cache.get("a")).property("b").to.equal(1);
  });
});

describe("cached helper function", () => {
  it("caches the result of a long computation", () => {
    let b = 0;
    const expensiveCalculation = fake((obj: object) => ({
      ...obj,
      b: ++b,
    }));
    const cachedFn = cached(expensiveCalculation);

    cachedFn({ a: 1 });
    cachedFn({ a: 1 });
    cachedFn({ a: 1 });

    expect(expensiveCalculation.callCount).to.equal(1);
  });
});
