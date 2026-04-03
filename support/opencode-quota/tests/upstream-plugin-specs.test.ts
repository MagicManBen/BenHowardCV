import { describe, expect, it } from "vitest";

import {
  getUpstreamPluginIssueTitle,
  getUpstreamPluginSpec,
  UPSTREAM_PLUGIN_REFERENCE_ROOT,
  UPSTREAM_PLUGIN_SPECS,
} from "../scripts/lib/upstream-plugin-specs.mjs";

describe("upstream-plugin-specs", () => {
  it("tracks the expected upstream plugin ids", () => {
    expect(UPSTREAM_PLUGIN_SPECS.map((spec) => spec.pluginId)).toEqual([
      "opencode-antigravity-auth",
      "opencode-cursor-oauth",
      "opencode-qwencode-auth",
    ]);
  });

  it("builds the expected check issue titles", () => {
    expect(getUpstreamPluginIssueTitle("opencode-cursor-oauth")).toBe(
      "[check] opencode-cursor-oauth had update",
    );
  });

  it("stores references under the shared upstream plugin root", () => {
    for (const spec of UPSTREAM_PLUGIN_SPECS) {
      expect(spec.referenceDir).toBe(`${UPSTREAM_PLUGIN_REFERENCE_ROOT}/${spec.pluginId}`);
    }
  });

  it("keeps the cursor plugin id mapped to the published repository slug", () => {
    expect(getUpstreamPluginSpec("opencode-cursor-oauth")).toMatchObject({
      packageName: "opencode-cursor-oauth",
      pluginId: "opencode-cursor-oauth",
      repo: "ephraimduncan/opencode-cursor",
    });
  });
});

