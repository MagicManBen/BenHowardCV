/**
 * Shared "Session Tokens" rendering block.
 *
 * Extracted from format.ts, toast-format-grouped.ts, and
 * quota-command-format.ts to eliminate verbatim duplication.
 */

import type { SessionTokensData } from "./entries.js";
import { formatTokenCount, padLeft, padRight, shortenModelName } from "./format-utils.js";

/**
 * Render the "Session Tokens" section lines.
 *
 * Returns an empty array when there is no data to display.
 * Callers are responsible for inserting a leading blank line if needed.
 */
export function renderSessionTokensLines(sessionTokens?: SessionTokensData): string[] {
  if (!sessionTokens || sessionTokens.models.length === 0) return [];

  const lines: string[] = [];
  lines.push("Session Tokens");

  for (const model of sessionTokens.models) {
    const shortName = shortenModelName(model.modelID, 20);
    const inStr = formatTokenCount(model.input);
    const outStr = formatTokenCount(model.output);
    lines.push(`  ${padRight(shortName, 20)}  ${padLeft(inStr, 6)} in  ${padLeft(outStr, 6)} out`);
  }

  return lines;
}
