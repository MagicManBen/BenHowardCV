#!/usr/bin/env python3
"""Extract all fields from mosaic job cards in the seeker HAR."""
import json, re, os

os.chdir(os.path.dirname(os.path.abspath(__file__)))

with open("uk.indeed.com.har", "r") as f:
    har = json.load(f)

for e in har["log"]["entries"]:
    text = e["response"]["content"].get("text", "")
    if not text or "mosaic-provider-jobcards" not in text:
        continue
    m = re.search(
        r'window\.mosaic\.providerData\["mosaic-provider-jobcards"\]\s*=\s*(\{.+?\});\s*</script>',
        text, re.DOTALL,
    )
    if m:
        data = json.loads(m.group(1))
        print("=== TOP-LEVEL KEYS ===")
        print(json.dumps(list(data.keys()), indent=2))

        model = data.get("metaData", {}).get("mosaicProviderJobCardsModel", {})
        results = model.get("results", [])
        print(f"\nResults count: {len(results)}")

        # Print ALL keys from model (pagination, total count etc)
        print("\n=== MODEL KEYS (non-results) ===")
        for k in sorted(model.keys()):
            if k != "results":
                v = model[k]
                print(f"  {k}: {json.dumps(v, default=str)[:300]}")

        # Print first job with ALL fields
        if results:
            print("\n=== FIRST JOB - ALL FIELDS ===")
            print(json.dumps(results[0], indent=2, default=str))

            print("\n=== ALL FIELD NAMES ACROSS ALL JOBS ===")
            all_keys = set()
            for r in results:
                all_keys.update(r.keys())
            for k in sorted(all_keys):
                # Show sample values
                samples = [r.get(k) for r in results[:3] if r.get(k)]
                print(f"  {k}: {samples[0] if samples else 'null'}  (type: {type(samples[0]).__name__ if samples else '?'})")

        # Check other providers
        print("\n=== OTHER MOSAIC PROVIDERS ===")
        providers = re.findall(
            r'window\.mosaic\.providerData\["([^"]+)"\]\s*=\s*(\{.+?\});\s*</script>',
            text, re.DOTALL,
        )
        for pname, pdata in providers:
            if pname == "mosaic-provider-jobcards":
                continue
            try:
                pd = json.loads(pdata)
                print(f"\n--- {pname} ---")
                print(f"  Keys: {list(pd.keys())[:10]}")
                # Show a brief preview
                preview = json.dumps(pd, default=str)[:500]
                print(f"  Preview: {preview}")
            except Exception:
                print(f"\n--- {pname} --- (parse error)")

        break
