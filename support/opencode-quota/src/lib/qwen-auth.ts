import type { AuthData } from "./types.js";
import { readAuthFileCached } from "./opencode-auth.js";

export const DEFAULT_QWEN_AUTH_CACHE_MAX_AGE_MS = 5_000;
const QWEN_AUTH_KEYS = ["qwen-code", "opencode-qwencode-auth"] as const;

export type ResolvedQwenLocalPlan =
  | { state: "none" }
  | { state: "qwen_free"; accessToken: string };

function getQwenOAuthAccessToken(auth: AuthData | null | undefined): string | null {
  for (const key of QWEN_AUTH_KEYS) {
    const qwen = auth?.[key];
    if (!qwen || qwen.type !== "oauth") {
      continue;
    }

    const access = typeof qwen.access === "string" ? qwen.access.trim() : "";
    if (access) {
      return access;
    }
  }

  return null;
}

export function hasQwenOAuthAuth(auth: AuthData | null | undefined): boolean {
  return getQwenOAuthAccessToken(auth) !== null;
}

export async function hasQwenOAuthAuthCached(params?: {
  maxAgeMs?: number;
}): Promise<boolean> {
  const auth = await readAuthFileCached({
    maxAgeMs: Math.max(0, params?.maxAgeMs ?? DEFAULT_QWEN_AUTH_CACHE_MAX_AGE_MS),
  });
  return hasQwenOAuthAuth(auth);
}

export function resolveQwenLocalPlan(auth: AuthData | null | undefined): ResolvedQwenLocalPlan {
  const accessToken = getQwenOAuthAccessToken(auth);
  if (!accessToken) {
    return { state: "none" };
  }

  return { state: "qwen_free", accessToken };
}

export async function resolveQwenLocalPlanCached(params?: {
  maxAgeMs?: number;
}): Promise<ResolvedQwenLocalPlan> {
  const auth = await readAuthFileCached({
    maxAgeMs: Math.max(0, params?.maxAgeMs ?? DEFAULT_QWEN_AUTH_CACHE_MAX_AGE_MS),
  });
  return resolveQwenLocalPlan(auth);
}

export function isQwenCodeModelId(model?: string): boolean {
  return typeof model === "string" && model.toLowerCase().startsWith("qwen-code/");
}
