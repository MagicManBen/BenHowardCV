"""Test pagination with sort=date and the full URL pattern from the user."""
import re
import json
import time
from curl_cffi import requests

s = requests.Session(impersonate="chrome")

# Warm up
print("Warming up...")
resp0 = s.get("https://uk.indeed.com/", timeout=15)
print(f"Homepage: {resp0.status_code}, cookies: {list(s.cookies.keys())}")

# Page 1 with sort=date (like user's URL)
print("\n--- Page 1 ---")
resp1 = s.get("https://uk.indeed.com/jobs?q=&l=Staffordshire&radius=25&sort=date&start=0", timeout=20)
print(f"Status: {resp1.status_code}, Size: {len(resp1.text)}")
has_mosaic = "mosaic-provider-jobcards" in resp1.text
title = re.search(r"<title>(.*?)</title>", resp1.text[:5000])
print(f"Mosaic: {has_mosaic}, Title: {title.group(1) if title else 'none'}")
print(f"Cookies after p1: {list(s.cookies.keys())}")

# Check if page 1 set any auth redirect cookies
pgid = re.search(r"pgid\s*=\s*encodeURIComponent\('([^']+)'\)", resp1.text[:3000])
print(f"Page ID: {pgid.group(1) if pgid else 'not found'}")

time.sleep(1.5)

# Page 2 with Referer
print("\n--- Page 2 ---")
resp2 = s.get(
    "https://uk.indeed.com/jobs?q=&l=Staffordshire&radius=25&sort=date&start=10",
    headers={
        "Referer": "https://uk.indeed.com/jobs?q=&l=Staffordshire&radius=25&sort=date&start=0",
        "Sec-Fetch-Site": "same-origin",
    },
    timeout=20,
)
print(f"Status: {resp2.status_code}, Size: {len(resp2.text)}")
has_mosaic2 = "mosaic-provider-jobcards" in resp2.text
title2 = re.search(r"<title>(.*?)</title>", resp2.text[:5000])
pgid2 = re.search(r"pgid\s*=\s*encodeURIComponent\('([^']+)'\)", resp2.text[:3000])
print(f"Mosaic: {has_mosaic2}, Title: {title2.group(1) if title2 else 'none'}, PageID: {pgid2.group(1) if pgid2 else 'none'}")
print(f"Cookies after p2: {list(s.cookies.keys())}")

# Check if there's a meta redirect or JS redirect
redirect = re.search(r'(window\.location|location\.href|http-equiv="refresh")', resp2.text[:5000], re.IGNORECASE)
print(f"Redirect detected: {redirect.group(0) if redirect else 'none'}")

time.sleep(1.5)

# Page 3
print("\n--- Page 3 ---")
resp3 = s.get(
    "https://uk.indeed.com/jobs?q=&l=Staffordshire&radius=25&sort=date&start=20",
    headers={
        "Referer": "https://uk.indeed.com/jobs?q=&l=Staffordshire&radius=25&sort=date&start=10",
        "Sec-Fetch-Site": "same-origin",
    },
    timeout=20,
)
print(f"Status: {resp3.status_code}, Size: {len(resp3.text)}")
has_mosaic3 = "mosaic-provider-jobcards" in resp3.text
title3 = re.search(r"<title>(.*?)</title>", resp3.text[:5000])
pgid3 = re.search(r"pgid\s*=\s*encodeURIComponent\('([^']+)'\)", resp3.text[:3000])
print(f"Mosaic: {has_mosaic3}, Title: {title3.group(1) if title3 else 'none'}, PageID: {pgid3.group(1) if pgid3 else 'none'}")
