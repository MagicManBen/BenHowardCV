"""Analyse myjobs.indeed.com.har for API endpoints, auth tokens, and job data."""
import json
from urllib.parse import urlparse
from collections import Counter
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[1]
RAW_DIR = BASE_DIR / "data" / "raw"

with open(RAW_DIR / "myjobs.indeed.com.har", "r", encoding="utf-8") as f:
    har = json.load(f)

entries = har["log"]["entries"]
print(f"Total entries: {len(entries)}\n")

# 1. Unique domains
domains = Counter()
for e in entries:
    url = e["request"]["url"]
    if url.startswith("http"):
        domains[urlparse(url).netloc] += 1
print("DOMAINS:")
for d, c in domains.most_common():
    print(f"  {c:4d}  {d}")
print()

# 2. All JSON API endpoints (the interesting ones)
print("JSON API ENDPOINTS:")
for e in entries:
    url = e["request"]["url"]
    resp_ct = ""
    for h in e["response"]["headers"]:
        if h["name"].lower() == "content-type":
            resp_ct = h["value"]
            break
    if "json" in resp_ct.lower():
        method = e["request"]["method"]
        status = e["response"]["status"]
        size = e["response"]["content"].get("size", 0)
        short = url[:180]
        print(f"  [{method} {status}] ({size:>8} bytes) {short}")
print()

# 3. Find API/RPC endpoints with meaningful data (non-tracking)
print("LARGE API RESPONSES (>500 bytes, likely real data):")
for e in entries:
    url = e["request"]["url"]
    resp_ct = ""
    for h in e["response"]["headers"]:
        if h["name"].lower() == "content-type":
            resp_ct = h["value"]
            break
    size = e["response"]["content"].get("size", 0)
    if "json" in resp_ct.lower() and size > 500:
        method = e["request"]["method"]
        status = e["response"]["status"]
        short = url[:180]
        print(f"  [{method} {status}] ({size:>8} bytes) {short}")
        
        # Show request headers for auth tokens
        auth_headers = {}
        for h in e["request"]["headers"]:
            name_lower = h["name"].lower()
            if any(k in name_lower for k in ["auth", "token", "key", "api", "csrf", "cookie", "indeed"]):
                auth_headers[h["name"]] = h["value"][:120]
        if auth_headers:
            print(f"    Auth headers:")
            for k, v in auth_headers.items():
                print(f"      {k}: {v}")
        
        # Show POST body if present
        post = e["request"].get("postData", {})
        if post and post.get("text"):
            text = post["text"]
            try:
                parsed = json.loads(text)
                print(f"    POST body: {json.dumps(parsed, indent=2)[:500]}")
            except:
                print(f"    POST body: {text[:500]}")
        
        # Show response preview
        resp_text = e["response"]["content"].get("text", "")
        if resp_text:
            try:
                parsed = json.loads(resp_text)
                preview = json.dumps(parsed, indent=2)[:600]
            except:
                preview = resp_text[:600]
            print(f"    Response preview: {preview}")
        print()
print()

# 4. Find any endpoints with job-related data in responses
print("RESPONSES CONTAINING JOB DATA:")
job_keywords = ["jobtitle", "job_title", "companyname", "company_name", "jobkey", "jobLocation", "displaytitle"]
for e in entries:
    text = e["response"]["content"].get("text", "")
    if text and any(kw in text.lower() for kw in job_keywords):
        url = e["request"]["url"][:150]
        size = e["response"]["content"].get("size", 0)
        method = e["request"]["method"]
        status = e["response"]["status"]
        resp_ct = ""
        for h in e["response"]["headers"]:
            if h["name"].lower() == "content-type":
                resp_ct = h["value"]
                break
        print(f"  [{method} {status}] ({size:>8} bytes) [{resp_ct[:40]}] {url}")

# 5. Check all cookies sent/received
print("\nCOOKIES SENT (unique names):")
cookie_names = set()
for e in entries:
    for c in e["request"].get("cookies", []):
        cookie_names.add(c["name"])
for name in sorted(cookie_names):
    print(f"  {name}")

print("\nSET-COOKIE RESPONSES (unique names):")
set_cookie_names = set()
for e in entries:
    for h in e["response"]["headers"]:
        if h["name"].lower() == "set-cookie":
            cname = h["value"].split("=")[0].strip()
            set_cookie_names.add(cname)
for name in sorted(set_cookie_names):
    print(f"  {name}")
