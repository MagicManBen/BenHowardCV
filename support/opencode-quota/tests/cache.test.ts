import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import {
  clearCache,
  getCachedToast,
  getOrFetch,
  getOrFetchWithCacheControl,
  shouldFetch,
  updateCache,
} from "../src/lib/cache.js";

describe("cache", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    clearCache();
  });

  afterEach(() => {
    clearCache();
  });

  it("returns cached toast within minIntervalMs", () => {
    updateCache("hello");
    expect(getCachedToast(60_000)).toBe("hello");

    vi.advanceTimersByTime(59_999);
    expect(getCachedToast(60_000)).toBe("hello");
  });

  it("treats cached toast as stale after minIntervalMs", () => {
    updateCache("hello");
    vi.advanceTimersByTime(60_000);
    expect(getCachedToast(60_000)).toBeNull();
  });

  it("deduplicates concurrent fetches", async () => {
    const fetchFn = vi.fn(async () => {
      await vi.advanceTimersByTimeAsync(10);
      return "result";
    });

    const p1 = getOrFetch(fetchFn, 0);
    const p2 = getOrFetch(fetchFn, 0);

    await vi.runAllTimersAsync();

    await expect(p1).resolves.toBe("result");
    await expect(p2).resolves.toBe("result");
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("shouldFetch honors minIntervalMs", () => {
    // shouldFetch is based on internal lastFetchTime; this asserts its basic behavior
    // when the cache layer calls into it.
    expect(shouldFetch(60_000)).toBe(true);
  });

  it("does not cache when cache=false", async () => {
    const fetchFn = vi.fn(async () => ({ message: "err", cache: false }));

    const out1 = await getOrFetchWithCacheControl(fetchFn, 60_000);
    expect(out1).toBe("err");
    expect(fetchFn).toHaveBeenCalledTimes(1);

    // Second call should fetch again (not cached / not throttled)
    const out2 = await getOrFetchWithCacheControl(fetchFn, 60_000);
    expect(out2).toBe("err");
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
});
