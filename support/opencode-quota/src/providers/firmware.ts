/**
 * Firmware AI provider wrapper.
 */

import type { QuotaProvider, QuotaProviderContext, QuotaProviderResult } from "../lib/entries.js";
import { fmtUsdAmount } from "../lib/format-utils.js";
import { hasFirmwareApiKeyConfigured, queryFirmwareQuota } from "../lib/firmware.js";

export const firmwareProvider: QuotaProvider = {
  id: "firmware",

  async isAvailable(ctx: QuotaProviderContext): Promise<boolean> {
    // Best-effort: if OpenCode exposes a firmware provider, prefer that.
    // Otherwise, fallback to local auth.json presence.
    try {
      const resp = await ctx.client.config.providers();
      const ids = new Set((resp.data?.providers ?? []).map((p) => p.id));
      if (ids.has("firmware") || ids.has("firmware-ai")) return true;
    } catch {
      // ignore
    }

    return await hasFirmwareApiKeyConfigured();
  },

  matchesCurrentModel(model: string): boolean {
    const provider = model.split("/")[0]?.toLowerCase();
    if (!provider) return false;
    return provider.includes("firmware");
  },

  async fetch(_ctx: QuotaProviderContext): Promise<QuotaProviderResult> {
    const result = await queryFirmwareQuota();

    if (!result) {
      return { attempted: false, entries: [], errors: [] };
    }

    if (!result.success) {
      return {
        attempted: true,
        entries: [],
        errors: [{ label: "Firmware", message: result.error }],
      };
    }

    const value = fmtUsdAmount(result.creditsUsd);

    return {
      attempted: true,
      entries: [
        {
          kind: "value",
          name: "Firmware",
          value,
          resetTimeIso: result.resetTimeIso,
        },
      ],
      errors: [],
    };
  },
};
