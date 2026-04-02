"""Check what job data format the pages actually use."""
import re
import json
from curl_cffi import requests

s = requests.Session(impersonate="chrome")
s.get("https://uk.indeed.com/", timeout=15)

# Page 1
resp = s.get("https://uk.indeed.com/jobs?q=&l=staffordshire&radius=25&start=0", timeout=20)
print(f"Page 1: {len(resp.text)} bytes, status={resp.status_code}")

# Check various mosaic patterns
patterns = [
    (r'window\.mosaic\.providerData\["mosaic-provider-jobcards"\]', "mosaic-provider-jobcards"),
    (r'window\.mosaic', "window.mosaic"),
    (r'providerData', "providerData"),
    (r'"jobkey"', "jobkey field"),
    (r'"jobTitle"', "jobTitle field (old)"),
    (r'"title"', "title field"),
    (r'"displayTitle"', "displayTitle"),
    (r'data-jk=', "data-jk attribute"),
    (r'jobsearch-ResultsList', "ResultsList class"),
    (r'mosaic-provider-jobcards', "mosaic-provider-jobcards string"),
]

for pat, name in patterns:
    matches = re.findall(pat, resp.text)
    print(f"  {name}: {len(matches)} matches")

# Find the actual mosaic data
m = re.search(r'window\.mosaic\.providerData\["mosaic-provider-jobcards"\]\s*=\s*(\{)', resp.text)
if m:
    print(f"\n  Mosaic data starts at offset {m.start()}")
    context = resp.text[m.start():m.start()+500]
    print(f"  Context: {context[:300]}")
else:
    print("\n  Mosaic provider-jobcards not found")
    # Look for any providerData
    for m2 in re.finditer(r'window\.mosaic\.providerData\["([^"]+)"\]', resp.text):
        print(f"  Found provider: {m2.group(1)}")

# Check page 2
import time
time.sleep(1)
resp2 = s.get("https://uk.indeed.com/jobs?q=&l=staffordshire&radius=25&start=10", timeout=20)
print(f"\nPage 2: {len(resp2.text)} bytes, status={resp2.status_code}")
title = re.search(r"<title>(.*?)</title>", resp2.text[:5000])
print(f"  Title: {title.group(1) if title else 'none'}")
# Check for redirect indicators or different page structure
if "cf-" in resp2.text[:2000].lower() or "cloudflare" in resp2.text[:2000].lower():
    print("  Cloudflare content detected")
body_start = resp2.text[:500]
print(f"  First 300 chars: {body_start[:300]}")
