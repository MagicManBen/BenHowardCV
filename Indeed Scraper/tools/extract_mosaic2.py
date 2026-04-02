#!/usr/bin/env python3
import json, re
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[1]
RAW_DIR = BASE_DIR / "data" / "raw"

with open(RAW_DIR / "uk.indeed.com.har", "r", encoding="utf-8") as f:
    har = json.load(f)

found = False
for e in har["log"]["entries"]:
    text = e["response"]["content"].get("text", "")
    if not text:
        continue
    idx = text.find('window.mosaic.providerData["mosaic-provider-jobcards"]')
    if idx == -1:
        continue
    found = True
    print(f"Found mosaic-provider-jobcards at char offset {idx}")
    # Extract from = to ;\n</script>
    eq = text.find("=", idx)
    chunk = text[eq+1:eq+100]
    print(f"After '=': {repr(chunk[:80])}")
    # Use a different approach: find the start of { and then find the matching }
    start = text.find("{", eq)
    # Find </script> after it
    end_marker = text.find("</script>", start)
    raw = text[start:end_marker].rstrip().rstrip(";")
    print(f"Raw JSON length: {len(raw)}")
    try:
        data = json.loads(raw)
        print(f"Parsed OK! Top keys: {list(data.keys())}")
        model = data.get("metaData", {}).get("mosaicProviderJobCardsModel", {})
        results = model.get("results", [])
        print(f"Results count: {len(results)}")
        for k in sorted(model.keys()):
            if k != "results":
                v = model[k]
                print(f"  model[{k}]: {json.dumps(v, default=str)[:300]}")
        if results:
            print("\n=== FIRST JOB - ALL FIELDS ===")
            print(json.dumps(results[0], indent=2, default=str)[:5000])
            print("\n=== ALL FIELD NAMES ===")
            all_keys = set()
            for r in results:
                all_keys.update(r.keys())
            for k in sorted(all_keys):
                print(f"  {k}")
    except json.JSONDecodeError as exc:
        print(f"JSON parse error: {exc}")
        print(f"First 200 chars: {raw[:200]}")
        print(f"Last 200 chars: {raw[-200:]}")
    break

if not found:
    print("mosaic-provider-jobcards NOT found in any response")
