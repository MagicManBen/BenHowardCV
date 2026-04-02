#!/usr/bin/env python3
import json
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[1]
RAW_DIR = BASE_DIR / "data" / "raw"

with open(RAW_DIR / "uk.indeed.com.har", "r", encoding="utf-8") as f:
    har = json.load(f)

for e in har["log"]["entries"]:
    text = e["response"]["content"].get("text", "")
    if not text:
        continue
    marker = 'window.mosaic.providerData["mosaic-provider-jobcards"]'
    idx = text.find(marker)
    if idx == -1:
        continue
    # Find the opening {
    start = text.find("{", idx)
    # Balance braces to find proper end
    depth = 0
    end = start
    for i in range(start, min(start + 300000, len(text))):
        if text[i] == "{":
            depth += 1
        elif text[i] == "}":
            depth -= 1
            if depth == 0:
                end = i + 1
                break
    raw = text[start:end]
    data = json.loads(raw)
    model = data.get("metaData", {}).get("mosaicProviderJobCardsModel", {})
    results = model.get("results", [])
    print(f"Results count: {len(results)}")

    print("\n=== MODEL KEYS (non-results) ===")
    for k in sorted(model.keys()):
        if k != "results":
            v = model[k]
            s = json.dumps(v, default=str)
            if len(s) > 300:
                s = s[:300] + "..."
            print(f"  {k}: {s}")

    if results:
        print(f"\n=== FIRST JOB - ALL FIELDS ===")
        print(json.dumps(results[0], indent=2, default=str))

        print(f"\n=== ALL FIELD NAMES ===")
        all_keys = set()
        for r in results:
            all_keys.update(r.keys())
        for k in sorted(all_keys):
            print(f"  {k}")

        # Show fields we're NOT currently extracting
        current = {"title", "company", "formattedLocation", "snippet", "formattedRelativeDateTime",
                   "jobkey", "isSponsored", "estimatedSalary", "salarySnippet"}
        extra = all_keys - current
        print(f"\n=== FIELDS NOT CURRENTLY EXTRACTED ({len(extra)}) ===")
        for k in sorted(extra):
            samples = [r.get(k) for r in results[:3] if r.get(k) is not None]
            if samples:
                sample = samples[0]
                if isinstance(sample, (dict, list)):
                    sample = json.dumps(sample, default=str)[:150]
                print(f"  {k}: {sample}")
            else:
                print(f"  {k}: (all null)")
    break
