/**
 * Google Antigravity provider wrapper.
 */

import type {
  QuotaProvider,
  QuotaProviderContext,
  QuotaProviderResult,
  QuotaToastError,
} from "../lib/entries.js";
import type { GoogleModelId, GoogleResult } from "../lib/types.js";
import { hasAntigravityAccountsConfigured, queryGoogleQuota } from "../lib/google.js";

function truncateEmail(email?: string): string {
  if (!email) return "Unknown";
  const prefix = email.slice(0, 3);
  return `${prefix}..gmail`;
}

function normalizeGoogleErrors(result: GoogleResult): QuotaToastError[] {
  if (!result || !result.success || !result.errors || result.errors.length === 0) return [];
  return result.errors.map((e) => ({ label: truncateEmail(e.email), message: e.error }));
}

async function isAccountsConfigured(): Promise<boolean> {
  try {
    return await hasAntigravityAccountsConfigured();
  } catch {
    return false;
  }
}

export const googleAntigravityProvider: QuotaProvider = {
  id: "google-antigravity",

  async isAvailable(ctx: QuotaProviderContext): Promise<boolean> {
    try {
      const resp = await ctx.client.config.providers();
      const ids = new Set((resp.data?.providers ?? []).map((p) => p.id));
      if (ids.has("google") || ids.has("antigravity")) return true;

      // Even if OpenCode doesn't report the provider (or uses different ids),
      // the presence of the accounts file is enough to attempt quota.
      return await isAccountsConfigured();
    } catch {
      // Best-effort fallback: if accounts file exists, consider provider available.
      return await isAccountsConfigured();
    }
  },

  matchesCurrentModel(model: string): boolean {
    const provider = model.split("/")[0]?.toLowerCase();
    if (!provider) return false;
    return (
      provider.includes("google") ||
      provider.includes("antigravity") ||
      provider.includes("opencode")
    );
  },

  async fetch(ctx: QuotaProviderContext): Promise<QuotaProviderResult> {
    const modelIds = ctx.config.googleModels as GoogleModelId[];
    const result = await queryGoogleQuota(modelIds);

    if (!result) {
      return { attempted: false, entries: [], errors: [] };
    }

    if (!result.success) {
      return {
        attempted: true,
        entries: [],
        errors: [{ label: "Antigravity", message: result.error }],
      };
    }

    const entries = result.models.map((m) => {
      const emailLabel = truncateEmail(m.accountEmail) || "Antigravity";
      return {
        name: `${m.displayName} (${emailLabel})`,
        percentRemaining: m.percentRemaining,
        resetTimeIso: m.resetTimeIso,
      };
    });

    return {
      attempted: true,
      entries,
      errors: normalizeGoogleErrors(result),
    };
  },
};
