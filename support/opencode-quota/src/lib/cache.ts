/**
 * Cache and throttling system for quota fetching
 *
 * Implements:
 * - Throttling: Only fetch if minIntervalMs has passed since last fetch
 * - Caching: Store last toast message for immediate display
 * - Deduplication: Use inFlightPromise to prevent concurrent fetches
 */

import type { CachedToast } from "./types.js";

/** Cached toast data */
let cachedToast: CachedToast | null = null;

/** In-flight promise for deduplication */
let inFlightPromise: Promise<string | null> | null = null;

/** Timestamp of last fetch start */
let lastFetchTime = 0;

/**
 * Get the cached toast message if still valid
 *
 * @param minIntervalMs - Minimum interval between fetches
 * @returns Cached message or null if stale/missing
 */
export function getCachedToast(minIntervalMs: number): string | null {
  if (!cachedToast) {
    return null;
  }

  const now = Date.now();
  const age = now - cachedToast.timestamp;

  // Return cached value if within throttle window
  if (age < minIntervalMs) {
    return cachedToast.message;
  }

  return null;
}

/**
 * Check if a new fetch should be initiated
 *
 * @param minIntervalMs - Minimum interval between fetches
 * @returns true if a fetch should be started
 */
export function shouldFetch(minIntervalMs: number): boolean {
  const now = Date.now();
  return now - lastFetchTime >= minIntervalMs;
}

/**
 * Get or start a fetch operation with deduplication
 *
 * @param fetchFn - Function that performs the actual fetch
 * @param minIntervalMs - Minimum interval between fetches
 * @returns Promise resolving to toast message or null
 */
export async function getOrFetch(
  fetchFn: () => Promise<string | null>,
  minIntervalMs: number,
): Promise<string | null> {
  const wrapped = async () => {
    const message = await fetchFn();
    return { message, cache: true };
  };
  return getOrFetchWithCacheControl(wrapped, minIntervalMs);
}

/**
 * Get or start a fetch operation with deduplication and cache control.
 *
 * This is useful when some results should be displayed but not cached
 * (e.g. transient "all providers failed" cases).
 */
export async function getOrFetchWithCacheControl(
  fetchFn: () => Promise<{ message: string | null; cache?: boolean }>,
  minIntervalMs: number,
): Promise<string | null> {
  // Check cache first
  const cached = getCachedToast(minIntervalMs);
  if (cached !== null) {
    return cached;
  }

  // If there's already a fetch in progress, wait for it
  if (inFlightPromise) {
    return inFlightPromise;
  }

  // Check if we should start a new fetch
  if (!shouldFetch(minIntervalMs)) {
    // Within throttle window but cache is empty/stale
    // Return cached message anyway if available
    return cachedToast?.message ?? null;
  }

  // Start a new fetch
  lastFetchTime = Date.now();
  inFlightPromise = (async () => {
    try {
      const out = await fetchFn();
      const result = out.message;
      const cache = out.cache ?? true;

      // If there is no message, don't throttle future fetches.
      // This is important when users enable providers or connect accounts and
      // want the toast to appear on the next trigger.
      if (result === null) {
        lastFetchTime = 0;
        return null;
      }

      if (!cache) {
        // Display, but don't cache or throttle the next attempt.
        lastFetchTime = 0;
        return result;
      }

      cachedToast = {
        message: result,
        timestamp: Date.now(),
      };

      return result;
    } finally {
      inFlightPromise = null;
    }
  })();

  return inFlightPromise;
}

/**
 * Clear the cache (for testing or reset)
 */
export function clearCache(): void {
  cachedToast = null;
  inFlightPromise = null;
  lastFetchTime = 0;
}

/**
 * Force update the cache with a new message
 */
export function updateCache(message: string): void {
  cachedToast = {
    message,
    timestamp: Date.now(),
  };
}
