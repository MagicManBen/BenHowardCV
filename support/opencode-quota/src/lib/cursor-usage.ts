import { lookupCost } from "./modelsdev-pricing.js";
import type { OpenCodeMessage } from "./opencode-storage.js";
import { iterAssistantMessages } from "./opencode-storage.js";
import type { TokenBuckets } from "./quota-stats.js";
import { resolvePricingKey } from "./quota-stats.js";
import {
  isCursorModelId,
  isCursorProviderId,
  lookupCursorLocalCost,
  resolveCursorModel,
} from "./cursor-pricing.js";
import { calculateUsdFromTokenBuckets } from "./token-cost.js";

export interface CursorCycleWindow {
  sinceMs: number;
  untilMs: number;
  resetTimeIso: string;
  source: "configured_day" | "calendar_month";
}

export interface CursorUsageBucket {
  costUsd: number;
  tokens: TokenBuckets;
  messageCount: number;
}

export interface CursorUsageSummary {
  window: CursorCycleWindow;
  api: CursorUsageBucket;
  autoComposer: CursorUsageBucket;
  total: CursorUsageBucket;
  unknownModels: Array<{ sourceModelID: string; messageCount: number; tokens: TokenBuckets }>;
}

function emptyBuckets(): TokenBuckets {
  return { input: 0, output: 0, reasoning: 0, cache_read: 0, cache_write: 0 };
}

function emptyUsageBucket(): CursorUsageBucket {
  return { costUsd: 0, tokens: emptyBuckets(), messageCount: 0 };
}

function addBuckets(a: TokenBuckets, b: TokenBuckets): TokenBuckets {
  return {
    input: a.input + b.input,
    output: a.output + b.output,
    reasoning: a.reasoning + b.reasoning,
    cache_read: a.cache_read + b.cache_read,
    cache_write: a.cache_write + b.cache_write,
  };
}

function messageBuckets(msg: OpenCodeMessage): TokenBuckets {
  const t = msg.tokens;
  if (!t) return emptyBuckets();
  return {
    input: typeof t.input === "number" ? t.input : 0,
    output: typeof t.output === "number" ? t.output : 0,
    reasoning: typeof t.reasoning === "number" ? t.reasoning : 0,
    cache_read: typeof t.cache?.read === "number" ? t.cache.read : 0,
    cache_write: typeof t.cache?.write === "number" ? t.cache.write : 0,
  };
}

function accumulateBucket(bucket: CursorUsageBucket, tokens: TokenBuckets, costUsd: number): void {
  bucket.tokens = addBuckets(bucket.tokens, tokens);
  bucket.costUsd += costUsd;
  bucket.messageCount += 1;
}

function isCursorMessage(msg: OpenCodeMessage): boolean {
  return isCursorProviderId(msg.providerID) || isCursorModelId(msg.modelID);
}

export function computeCursorCycleWindow(params?: {
  nowMs?: number;
  billingCycleStartDay?: number;
}): CursorCycleWindow {
  const nowMs = params?.nowMs ?? Date.now();
  const now = new Date(nowMs);
  const day = params?.billingCycleStartDay;

  if (typeof day === "number" && Number.isInteger(day) && day >= 1 && day <= 28) {
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), day);
    const start =
      nowMs >= currentMonthStart.getTime()
        ? currentMonthStart
        : new Date(now.getFullYear(), now.getMonth() - 1, day);
    const reset = new Date(start.getFullYear(), start.getMonth() + 1, day);
    return {
      sinceMs: start.getTime(),
      untilMs: reset.getTime(),
      resetTimeIso: reset.toISOString(),
      source: "configured_day",
    };
  }

  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const reset = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return {
    sinceMs: start.getTime(),
    untilMs: reset.getTime(),
    resetTimeIso: reset.toISOString(),
    source: "calendar_month",
  };
}

export async function getCurrentCursorUsageSummary(params?: {
  nowMs?: number;
  billingCycleStartDay?: number;
}): Promise<CursorUsageSummary> {
  const nowMs = params?.nowMs ?? Date.now();
  const window = computeCursorCycleWindow({
    nowMs,
    billingCycleStartDay: params?.billingCycleStartDay,
  });
  const messages = await iterAssistantMessages({ sinceMs: window.sinceMs, untilMs: nowMs });

  const api = emptyUsageBucket();
  const autoComposer = emptyUsageBucket();
  const total = emptyUsageBucket();
  const unknownModels = new Map<string, { sourceModelID: string; messageCount: number; tokens: TokenBuckets }>();

  for (const msg of messages) {
    if (!isCursorMessage(msg)) continue;

    const sourceModelID = msg.modelID ?? "unknown";
    const tokens = messageBuckets(msg);
    const resolved = resolveCursorModel(sourceModelID);

    if (resolved.kind === "local") {
      const cost = lookupCursorLocalCost(resolved.model);
      if (!cost) continue;
      const costUsd = calculateUsdFromTokenBuckets(cost, tokens);
      accumulateBucket(autoComposer, tokens, costUsd);
      accumulateBucket(total, tokens, costUsd);
      continue;
    }

    if (resolved.kind === "official") {
      const mapped = resolvePricingKey({
        providerID: resolved.providerHint,
        modelID: `${resolved.providerHint}/${resolved.modelHint}`,
      });
      if (mapped.ok) {
        const cost = lookupCost(mapped.key.provider, mapped.key.model);
        if (cost) {
          const costUsd = calculateUsdFromTokenBuckets(cost, tokens);
          accumulateBucket(api, tokens, costUsd);
          accumulateBucket(total, tokens, costUsd);
          continue;
        }
      }
    }

    total.tokens = addBuckets(total.tokens, tokens);
    total.messageCount += 1;
    const existing = unknownModels.get(sourceModelID);
    if (existing) {
      existing.tokens = addBuckets(existing.tokens, tokens);
      existing.messageCount += 1;
    } else {
      unknownModels.set(sourceModelID, { sourceModelID, messageCount: 1, tokens });
    }
  }

  return {
    window,
    api,
    autoComposer,
    total,
    unknownModels: [...unknownModels.values()].sort((a, b) => b.messageCount - a.messageCount),
  };
}
