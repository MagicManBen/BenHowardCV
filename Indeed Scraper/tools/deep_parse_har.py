import json
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[1]
RAW_DIR = BASE_DIR / "data" / "raw"

with open(RAW_DIR / "uk.indeed.com.har", "r", encoding="utf-8") as f:
    har = json.load(f)

entries = har["log"]["entries"]

# 1. Extract the main search page HTML and find embedded job data
for e in entries:
    if "uk.indeed.com/jobs" in e["request"]["url"] and e["response"]["status"] == 200:
        text = e["response"]["content"].get("text", "")
        if "mosaic-provider-jobcards" in text or "jobTitle" in text.lower():
            # Look for JSON data embedded in the HTML (window.mosaic or similar)
            import re
            
            # Find mosaic data blocks
            mosaic_matches = re.findall(r'window\.mosaic\.providerData\["([^"]+)"\]\s*=\s*(\{.+?\});', text, re.DOTALL)
            for name, data in mosaic_matches:
                print(f"\n{'='*60}")
                print(f"  MOSAIC PROVIDER: {name}")
                print(f"{'='*60}")
                try:
                    parsed = json.loads(data)
                    print(json.dumps(parsed, indent=2)[:3000])
                except json.JSONDecodeError:
                    print(data[:2000])
            
            # Also look for jobResults / metaData patterns
            job_matches = re.findall(r'"jobTitle"\s*:\s*"([^"]+)"', text)
            company_matches = re.findall(r'"company"\s*:\s*"([^"]+)"', text)
            location_matches = re.findall(r'"formattedLocation"\s*:\s*"([^"]+)"', text)
            
            if job_matches:
                print(f"\n{'='*60}")
                print(f"  JOB TITLES FOUND IN HTML ({len(job_matches)})")
                print(f"{'='*60}")
                for i, t in enumerate(job_matches):
                    company = company_matches[i] if i < len(company_matches) else "?"
                    location = location_matches[i] if i < len(location_matches) else "?"
                    print(f"  {i+1}. {t} | {company} | {location}")
            
            # Find jobKey patterns
            jobkey_matches = re.findall(r'"jobkey"\s*:\s*"([^"]+)"', text)
            if jobkey_matches:
                print(f"\n  JOB KEYS ({len(jobkey_matches)}): {jobkey_matches[:5]}")
            
            break

# 2. Extract GraphQL request/response
print(f"\n{'='*60}")
print("  GRAPHQL ENDPOINT DETAILS")
print(f"{'='*60}")
for e in entries:
    if "apis.indeed.com/graphql" in e["request"]["url"]:
        print(f"\n  URL: {e['request']['url']}")
        print(f"  Method: {e['request']['method']}")
        print(f"\n  Request Headers:")
        for h in e["request"]["headers"]:
            print(f"    {h['name']:40s} = {h['value'][:120]}")
        
        post = e["request"].get("postData", {})
        if post:
            print(f"\n  POST Body:")
            text = post.get("text", "")
            if text:
                try:
                    parsed = json.loads(text)
                    print(f"    {json.dumps(parsed, indent=2)[:2000]}")
                except:
                    print(f"    {text[:2000]}")
        
        resp_text = e["response"]["content"].get("text", "")
        if resp_text:
            print(f"\n  Response Body:")
            try:
                parsed = json.loads(resp_text)
                print(f"    {json.dumps(parsed, indent=2)[:2000]}")
            except:
                print(f"    {resp_text[:2000]}")
        print()

# 3. Find all unique Indeed API paths
print(f"\n{'='*60}")
print("  ALL INDEED RPC/API PATHS")
print(f"{'='*60}")
seen_paths = set()
for e in entries:
    url = e["request"]["url"]
    if "indeed.com" in url and any(p in url for p in ["/rpc/", "/api/", "/graphql", "/m/rpc/"]):
        from urllib.parse import urlparse
        parsed_url = urlparse(url)
        path = parsed_url.path
        if path not in seen_paths:
            seen_paths.add(path)
            print(f"  {e['request']['method']:6s} {parsed_url.netloc}{path}")
