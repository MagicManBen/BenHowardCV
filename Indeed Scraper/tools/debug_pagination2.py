"""Test: don't follow redirects on page 2, or try allow_redirects=False."""
import re
import json
import time
from curl_cffi import requests

s = requests.Session(impersonate="chrome")

print("Warming up...")
s.get("https://uk.indeed.com/", timeout=15)

# Page 1
print("\n--- Page 1 ---")
resp1 = s.get("https://uk.indeed.com/jobs?q=&l=Staffordshire&radius=25&sort=date&start=0", timeout=20)
print(f"Status: {resp1.status_code}, Size: {len(resp1.text)}, Mosaic: {'mosaic-provider-jobcards' in resp1.text}")
p1_cookies = dict(s.cookies)
print(f"Cookies: {list(p1_cookies.keys())}")

time.sleep(1.5)

# Test 1: Try with allow_redirects=False
print("\n--- Page 2 (no redirects) ---")
resp2a = s.get(
    "https://uk.indeed.com/jobs?q=&l=Staffordshire&radius=25&sort=date&start=10",
    headers={"Referer": "https://uk.indeed.com/jobs?q=&l=Staffordshire&radius=25&sort=date&start=0"},
    allow_redirects=False,
    timeout=20,
)
print(f"Status: {resp2a.status_code}, Size: {len(resp2a.text)}")
if resp2a.status_code in (301, 302, 303, 307, 308):
    loc = resp2a.headers.get("location", "")
    print(f"Redirect to: {loc}")
else:
    has_mosaic = "mosaic-provider-jobcards" in resp2a.text
    pgid = re.search(r"pgid\s*=\s*encodeURIComponent\('([^']+)'\)", resp2a.text[:3000])
    print(f"Mosaic: {has_mosaic}, PageID: {pgid.group(1) if pgid else 'none'}")

time.sleep(1.5)

# Test 2: New session per page (no cookie accumulation)
print("\n--- Page 2 (fresh session) ---")
s2 = requests.Session(impersonate="chrome")
s2.get("https://uk.indeed.com/", timeout=15)
resp2b = s2.get(
    "https://uk.indeed.com/jobs?q=&l=Staffordshire&radius=25&sort=date&start=10",
    timeout=20,
)
print(f"Status: {resp2b.status_code}, Size: {len(resp2b.text)}, Mosaic: {'mosaic-provider-jobcards' in resp2b.text}")
pgid2 = re.search(r"pgid\s*=\s*encodeURIComponent\('([^']+)'\)", resp2b.text[:3000])
print(f"PageID: {pgid2.group(1) if pgid2 else 'none'}")

time.sleep(1.5)

# Test 3: Clean cookies before page 2 (remove auth-related ones)
print("\n--- Page 2 (cleaned cookies from page 1 session) ---")
s3 = requests.Session(impersonate="chrome")
# Copy only the essential cookies from page 1
for name in ['CTK', 'CSRF', '__cf_bm', '_cfuvid', 'INDEED_CSRF_TOKEN']:
    if name in p1_cookies:
        s3.cookies.set(name, p1_cookies[name], domain=".indeed.com")
resp2c = s3.get(
    "https://uk.indeed.com/jobs?q=&l=Staffordshire&radius=25&sort=date&start=10",
    timeout=20,
)
print(f"Status: {resp2c.status_code}, Size: {len(resp2c.text)}, Mosaic: {'mosaic-provider-jobcards' in resp2c.text}")
pgid3 = re.search(r"pgid\s*=\s*encodeURIComponent\('([^']+)'\)", resp2c.text[:3000])
title3 = re.search(r"<title>(.*?)</title>", resp2c.text[:5000])
print(f"PageID: {pgid3.group(1) if pgid3 else 'none'}, Title: {title3.group(1) if title3 else 'none'}")
