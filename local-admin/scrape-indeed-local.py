#!/usr/bin/env python3
"""
Local Indeed scraper — runs from your machine (residential IP) to avoid
cloud-IP blocking. Fetches cookies captured by the Tampermonkey userscript
from Supabase, scrapes Indeed page-by-page (fresh session per page), and
writes results to the Supabase indeed_jobs table.

Usage:
  python3 scrape-indeed-local.py                          # defaults
  python3 scrape-indeed-local.py --query "project manager" --location "Birmingham" --pages 3
"""

import argparse
import hashlib
import json
import re
import sys
import time
import urllib.parse
import urllib.request

SUPABASE_URL = "https://jntpyqguonknixyksqbp.supabase.co"
SUPABASE_ANON = (
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
    "eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpudHB5cWd1b25rbml4eWtzcWJwIiwi"
    "cm9sZSI6ImFub24iLCJpYXQiOjE3NzUwODYxNTEsImV4cCI6MjA5MDY2MjE1MX0."
    "Tx2nMTKuguGIRnSwLR2Wm47d68p99DrH2ldIWWKOuBs"
)

USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)

# ── helpers ───────────────────────────────────────────────────────────────

def supabase_get(path):
    """GET from Supabase REST API."""
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    req = urllib.request.Request(url, headers={
        "apikey": SUPABASE_ANON,
        "Authorization": f"Bearer {SUPABASE_ANON}",
    })
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())


def supabase_upsert(table, rows):
    """Upsert rows into a Supabase table (merge on PK)."""
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    data = json.dumps(rows).encode()
    req = urllib.request.Request(url, data=data, method="POST", headers={
        "apikey": SUPABASE_ANON,
        "Authorization": f"Bearer {SUPABASE_ANON}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates",
    })
    with urllib.request.urlopen(req) as resp:
        return resp.status


def fetch_cookies():
    """Retrieve the saved Indeed cookie string from Supabase."""
    rows = supabase_get("cookies?source=eq.indeed&select=cookie_data")
    if not rows:
        print("✗ No Indeed cookies found in Supabase.  Open Indeed in Chrome "
              "with Tampermonkey enabled to capture them.", file=sys.stderr)
        sys.exit(1)
    cookie_str = rows[0]["cookie_data"]
    print(f"✓ Loaded cookies ({len(cookie_str)} chars)")
    return cookie_str


def build_indeed_url(query, location, radius=50, from_days=7, start=0, sort="date"):
    """Build an Indeed UK search URL."""
    params = {
        "q": query,
        "l": location,
        "radius": str(radius),
        "fromage": str(from_days),
        "start": str(start),
        "sort": sort,
        "filter": "0",
        "vjk": "",
    }
    return "https://uk.indeed.com/jobs?" + urllib.parse.urlencode(params)


def scrape_page(url, cookie_str):
    """
    Fetch one Indeed results page using a fresh connection and the captured
    cookies.  Returns the raw HTML.
    """
    req = urllib.request.Request(url, headers={
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-GB,en;q=0.9",
        "Cookie": cookie_str,
        "Referer": "https://uk.indeed.com/",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "same-origin",
        "Upgrade-Insecure-Requests": "1",
    })
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode("utf-8", errors="replace")


def parse_jobs(html, search_query, search_location):
    """
    Extract job listings from Indeed HTML.  Tries the mosaic JSON blob first,
    then falls back to regex extraction from job cards.
    """
    jobs = []

    # Method 1: mosaic provider data (JSON embedded in the page)
    mosaic_match = re.search(
        r'window\.mosaic\.providerData\["mosaic-provider-jobcards"\]\s*=\s*({.+?});\s*</script>',
        html, re.DOTALL
    )
    if mosaic_match:
        try:
            mosaic = json.loads(mosaic_match.group(1))
            results = mosaic.get("metaData", {}).get("mosaicProviderJobCardsModel", {}).get("results", [])
            if not results:
                # try alternate path
                results = mosaic.get("results", [])
            for r in results:
                job_key = r.get("jobkey", "")
                jobs.append({
                    "id": job_key or hashlib.sha256(json.dumps(r, sort_keys=True).encode()).hexdigest()[:16],
                    "title": r.get("title", r.get("displayTitle", "")),
                    "company": r.get("company", ""),
                    "location": r.get("formattedLocation", r.get("jobLocationCity", "")),
                    "salary": r.get("formattedSalarySnippet", r.get("salarySnippet", {}).get("text", "") if isinstance(r.get("salarySnippet"), dict) else ""),
                    "url": f"https://uk.indeed.com/viewjob?jk={job_key}" if job_key else "",
                    "description": r.get("snippet", ""),
                    "date_posted": r.get("formattedRelativeTime", ""),
                    "search_query": search_query,
                    "search_location": search_location,
                })
            if jobs:
                return jobs
        except (json.JSONDecodeError, KeyError) as e:
            print(f"  ⚠ Mosaic JSON parse failed: {e}")

    # Method 2: fallback — look for jobsearch-ResultsList data
    card_pattern = re.compile(
        r'data-jk="([^"]*)"[^>]*>.*?'
        r'class="jobTitle[^"]*"[^>]*>.*?<a[^>]*>(?:<span[^>]*>)?([^<]+)',
        re.DOTALL
    )
    for match in card_pattern.finditer(html):
        jk, title = match.group(1), match.group(2).strip()
        jobs.append({
            "id": jk or hashlib.sha256(title.encode()).hexdigest()[:16],
            "title": title,
            "company": "",
            "location": "",
            "salary": "",
            "url": f"https://uk.indeed.com/viewjob?jk={jk}" if jk else "",
            "description": "",
            "date_posted": "",
            "search_query": search_query,
            "search_location": search_location,
        })

    return jobs


def detect_block(html):
    """Check whether Indeed returned a CAPTCHA or block page."""
    lower = html[:5000].lower()
    if "captcha" in lower or "unusual traffic" in lower or "verify you are human" in lower:
        return True
    if "<title>hcaptcha" in lower or "challenge-platform" in lower:
        return True
    return False


# ── main ──────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Local Indeed scraper → Supabase")
    parser.add_argument("--query", "-q", default="Practice Manager OR operations manager OR continuous improvement",
                        help="Search keywords")
    parser.add_argument("--location", "-l", default="Staffordshire",
                        help="Search location")
    parser.add_argument("--radius", "-r", type=int, default=50, help="Radius in miles")
    parser.add_argument("--days", "-d", type=int, default=7, help="Posted within N days")
    parser.add_argument("--pages", "-p", type=int, default=3, help="Max pages to scrape")
    parser.add_argument("--sort", "-s", default="date", choices=["date", "relevance"])
    parser.add_argument("--delay", type=float, default=3.0, help="Delay between pages (seconds)")
    args = parser.parse_args()

    print(f"Indeed Local Scraper")
    print(f"  Query:    {args.query}")
    print(f"  Location: {args.location}")
    print(f"  Radius:   {args.radius} mi  |  Days: {args.days}  |  Pages: {args.pages}")
    print()

    cookie_str = fetch_cookies()
    all_jobs = []
    seen_ids = set()

    for page in range(args.pages):
        start = page * 10
        url = build_indeed_url(args.query, args.location, args.radius, args.days, start, args.sort)
        print(f"\n── Page {page + 1} (start={start}) ──")
        print(f"   {url}")

        try:
            html = scrape_page(url, cookie_str)
        except Exception as e:
            print(f"   ✗ Request failed: {e}")
            break

        if detect_block(html):
            print("   ✗ Blocked (CAPTCHA/anti-bot).  Try refreshing cookies in Chrome.")
            # Save a debug file for inspection
            debug_path = f"/tmp/indeed_page_{page+1}.html"
            with open(debug_path, "w") as f:
                f.write(html)
            print(f"   ⚠ Saved blocked page to {debug_path}")
            break

        jobs = parse_jobs(html, args.query, args.location)
        new_jobs = [j for j in jobs if j["id"] not in seen_ids]
        seen_ids.update(j["id"] for j in new_jobs)
        all_jobs.extend(new_jobs)
        print(f"   ✓ Found {len(jobs)} jobs ({len(new_jobs)} new)")

        if len(jobs) == 0:
            print("   ℹ No more results — stopping.")
            break

        if page < args.pages - 1:
            print(f"   ⏳ Waiting {args.delay}s before next page…")
            time.sleep(args.delay)

    print(f"\n── Summary ──")
    print(f"   Total unique jobs: {len(all_jobs)}")

    if all_jobs:
        print(f"   Uploading to Supabase…")
        try:
            status = supabase_upsert("indeed_jobs", all_jobs)
            print(f"   ✓ Upserted {len(all_jobs)} jobs (HTTP {status})")
        except Exception as e:
            print(f"   ✗ Supabase upsert failed: {e}")
            # dump to local JSON as fallback
            fallback = "/tmp/indeed_jobs.json"
            with open(fallback, "w") as f:
                json.dump(all_jobs, f, indent=2)
            print(f"   ⚠ Saved to {fallback} as fallback")
    else:
        print("   No jobs to upload.")


if __name__ == "__main__":
    main()
