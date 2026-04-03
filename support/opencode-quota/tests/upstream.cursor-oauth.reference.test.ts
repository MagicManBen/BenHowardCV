import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const CURSOR_MODELS_PATH = new URL(
  "../references/upstream-plugins/opencode-cursor-oauth/dist/models.js",
  import.meta.url,
);

const CURSOR_PROXY_PATH = new URL(
  "../references/upstream-plugins/opencode-cursor-oauth/dist/proxy.js",
  import.meta.url,
);

describe("synced Cursor OAuth reference guards", () => {
  it("does not memoize fallback models after discovery failure", () => {
    const source = readFileSync(CURSOR_MODELS_PATH, "utf8");

    expect(source).toContain("if (discovered && discovered.length > 0) {");
    expect(source).toContain("cachedModels = discovered;");
    expect(source).toContain("return FALLBACK_MODELS;");
    expect(source).not.toContain(
      "cachedModels = discovered && discovered.length > 0 ? discovered : FALLBACK_MODELS;",
    );
  });

  it("keys conversation reuse from the normalized transcript, not the first prompt alone", () => {
    const source = readFileSync(CURSOR_PROXY_PATH, "utf8");

    expect(source).toContain('.filter((m) => m.role !== "tool")');
    expect(source).toContain("messages: normalizedMessages");
    expect(source).not.toContain("const firstUserMsg = messages.find((m) => m.role === \"user\");");
    expect(source).not.toContain("firstUserText.slice(0, 200)");
  });
});
