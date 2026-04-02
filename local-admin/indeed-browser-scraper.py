#!/usr/bin/env python3
"""
Indeed Browser Scraper — uses AppleScript to control Chrome directly.
Extracts job listings from the real browser (no 403 issues) and uploads
to Supabase. Reads search config from Supabase, or uses defaults.

Called by 'Capture Indeed Cookies.command' after cookie capture.
"""

import json
import subprocess
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

DEFAULT_CONFIG = {
    "query": "manager OR director OR operations OR continuous improvement",
    "location": "Leek, Staffordshire",
    "radius": 50,
    "days": 7,
    "pages": 3,
    "sort": "date",
}

# JavaScript to extract jobs from an Indeed search results page.
# Written to a temp file and executed via AppleScript to avoid quoting issues.
EXTRACT_JS = r"""(function(){
  var jobs = [], seen = {};

  // Method 1: mosaic provider data (JSON embedded in script tags)
  var scripts = document.querySelectorAll('script');
  for (var i = 0; i < scripts.length; i++) {
    var text = scripts[i].textContent;
    if (text.indexOf('mosaic-provider-jobcards') !== -1 || text.indexOf('jobResults') !== -1) {
      try {
        var m = text.match(/"results"\s*:\s*(\[[\s\S]*?\])\s*,\s*"/);
        if (m) {
          var results = JSON.parse(m[1]);
          for (var j = 0; j < results.length; j++) {
            var r = results[j];
            if (r.jobkey && !seen[r.jobkey]) {
              seen[r.jobkey] = 1;
              jobs.push({
                id: r.jobkey,
                title: r.title || r.displayTitle || '',
                company: r.company || r.companyName || '',
                location: r.formattedLocation || r.jobLocationCity || '',
                salary: r.salarySnippet ? (r.salarySnippet.text || '') : (r.extractedSalary ? (r.extractedSalary.min + '-' + r.extractedSalary.max) : ''),
                url: 'https://uk.indeed.com/viewjob?jk=' + r.jobkey,
                description: r.snippet || '',
                date_posted: r.formattedRelativeTime || ''
              });
            }
          }
        }
      } catch(e) {}
    }
  }

  // Method 2: DOM fallback
  if (jobs.length === 0) {
    var cards = document.querySelectorAll('[data-jk], .job_seen_beacon, .resultContent');
    cards.forEach(function(card) {
      var jk = card.getAttribute('data-jk');
      if (!jk) {
        var link = card.querySelector('a[data-jk]');
        if (link) jk = link.getAttribute('data-jk');
      }
      if (!jk || seen[jk]) return;
      seen[jk] = 1;
      var t = card.querySelector('h2 a, a.jcs-JobTitle, h2.jobTitle a');
      var c = card.querySelector('[data-testid=company-name], .companyName, .company');
      var l = card.querySelector('[data-testid=text-location], .companyLocation, .location');
      var s = card.querySelector('.salary-snippet-container, .salaryText, [data-testid=attribute_snippet_testid]');
      var d = card.querySelector('.job-snippet, td.snip, .underShelfFooter');
      var dt = card.querySelector('.date, .myJobsState');
      jobs.push({
        id: jk,
        title: t ? t.textContent.trim() : '',
        company: c ? c.textContent.trim() : '',
        location: l ? l.textContent.trim() : '',
        salary: s ? s.textContent.trim() : '',
        url: 'https://uk.indeed.com/viewjob?jk=' + jk,
        description: d ? d.textContent.trim() : '',
        date_posted: dt ? dt.textContent.trim() : ''
      });
    });
  }

  return JSON.stringify(jobs);
})()"""

GREEN = "\033[0;32m"
YELLOW = "\033[1;33m"
RED = "\033[0;31m"
CYAN = "\033[0;36m"
NC = "\033[0m"


def run_applescript(*lines):
    """Run AppleScript with multiple -e arguments."""
    cmd = ["osascript"]
    for line in lines:
        cmd.extend(["-e", line])
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
    if result.returncode != 0 and result.stderr:
        return None
    return result.stdout.strip()


def chrome_navigate(url):
    """Navigate Chrome's active tab to URL."""
    run_applescript(
        'tell application "Google Chrome"',
        f'set URL of active tab of front window to "{url}"',
        "end tell",
    )


def chrome_execute_js(js_code):
    """Execute JavaScript in Chrome's active tab via a temp file."""
    js_path = "/tmp/bh_indeed_extract.js"
    with open(js_path, "w") as f:
        f.write(js_code)

    result = run_applescript(
        'tell application "Google Chrome"',
        'set jsCode to do shell script "cat /tmp/bh_indeed_extract.js"',
        "execute front window's active tab javascript jsCode",
        "end tell",
    )
    return result


def wait_for_page_load(timeout=25):
    """Wait for Chrome's active tab to finish loading."""
    for _ in range(timeout):
        state = run_applescript(
            'tell application "Google Chrome"',
            'execute front window\'s active tab javascript "document.readyState"',
            "end tell",
        )
        if state == "complete":
            return True
        time.sleep(1)
    return False


def get_search_config():
    """Read search config from Supabase cookies table, or return defaults."""
    try:
        url = (
            f"{SUPABASE_URL}/rest/v1/cookies"
            "?source=eq.indeed_search_config&select=cookie_data"
        )
        req = urllib.request.Request(
            url,
            headers={
                "apikey": SUPABASE_ANON,
                "Authorization": f"Bearer {SUPABASE_ANON}",
            },
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            rows = json.loads(resp.read())
        if rows and rows[0].get("cookie_data"):
            config = json.loads(rows[0]["cookie_data"])
            print(f"  {GREEN}✓{NC} Loaded search config from Supabase")
            return config
    except Exception as e:
        print(f"  {YELLOW}⚠{NC} Could not read search config: {e}")

    print(f"  {YELLOW}ℹ{NC} Using default search config")
    return dict(DEFAULT_CONFIG)


def build_url(config, start=0):
    """Build an Indeed UK search URL."""
    params = {
        "q": config["query"],
        "l": config["location"],
        "radius": str(config.get("radius", 50)),
        "fromage": str(config.get("days", 7)),
        "start": str(start),
        "sort": config.get("sort", "date"),
        "filter": "0",
    }
    return "https://uk.indeed.com/jobs?" + urllib.parse.urlencode(params)


def upsert_jobs(jobs, search_query, search_location):
    """Upload jobs to Supabase indeed_jobs table."""
    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    rows = [
        {
            "id": j["id"],
            "title": j["title"],
            "company": j["company"],
            "location": j["location"],
            "salary": j["salary"],
            "url": j["url"],
            "description": j["description"],
            "date_posted": j["date_posted"],
            "search_query": search_query,
            "search_location": search_location,
            "scraped_at": now,
        }
        for j in jobs
    ]

    url = f"{SUPABASE_URL}/rest/v1/indeed_jobs"
    data = json.dumps(rows).encode()
    req = urllib.request.Request(
        url,
        data=data,
        method="POST",
        headers={
            "apikey": SUPABASE_ANON,
            "Authorization": f"Bearer {SUPABASE_ANON}",
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.status


def main():
    print()
    print(f"  {CYAN}── Indeed Browser Scraper ──{NC}")
    print()

    # Read search config
    config = get_search_config()
    print(f"  Query:    {config['query']}")
    print(f"  Location: {config['location']}")
    print(
        f"  Radius:   {config.get('radius', 50)} mi  |  "
        f"Days: {config.get('days', 7)}  |  "
        f"Pages: {config.get('pages', 3)}"
    )

    all_jobs = []
    seen = set()
    pages = config.get("pages", 3)

    for page in range(pages):
        start = page * 10
        url = build_url(config, start)
        print(f"\n  {YELLOW}Page {page + 1}/{pages}{NC} (start={start})")

        # Navigate Chrome
        chrome_navigate(url)
        time.sleep(3)

        if not wait_for_page_load(20):
            print(f"  {RED}✗{NC} Page load timeout — skipping")
            continue

        # Extra wait for Indeed's JavaScript to finish rendering
        time.sleep(2)

        # Extract jobs from the browser
        result = chrome_execute_js(EXTRACT_JS)
        if not result:
            print(f"  {RED}✗{NC} No data extracted from browser")
            continue

        try:
            jobs = json.loads(result)
        except json.JSONDecodeError:
            print(f"  {RED}✗{NC} Could not parse job data")
            # Check for CAPTCHA
            captcha_check = run_applescript(
                'tell application "Google Chrome"',
                "execute front window's active tab javascript "
                '"document.title"',
                "end tell",
            )
            if captcha_check and (
                "captcha" in captcha_check.lower()
                or "verify" in captcha_check.lower()
            ):
                print(f"  {RED}✗{NC} CAPTCHA detected — solve it in Chrome and re-run")
                return 0
            continue

        new_jobs = [j for j in jobs if j["id"] not in seen]
        seen.update(j["id"] for j in new_jobs)
        all_jobs.extend(new_jobs)
        print(f"  {GREEN}✓{NC} Found {len(jobs)} jobs ({len(new_jobs)} new)")

        if len(jobs) == 0:
            print(f"  {CYAN}ℹ{NC} No more results — stopping")
            break

        if page < pages - 1:
            time.sleep(2)

    print(f"\n  ── Summary ──")
    print(f"  Total unique jobs: {len(all_jobs)}")

    if all_jobs:
        print(f"  Uploading to Supabase…")
        try:
            status = upsert_jobs(all_jobs, config["query"], config["location"])
            print(f"  {GREEN}✓{NC} Uploaded {len(all_jobs)} jobs (HTTP {status})")
        except Exception as e:
            print(f"  {RED}✗{NC} Upload failed: {e}")
            fallback = "/tmp/indeed_jobs.json"
            with open(fallback, "w") as f:
                json.dump(all_jobs, f, indent=2)
            print(f"  {YELLOW}⚠{NC} Saved to {fallback} as fallback")
    else:
        print(f"  {YELLOW}ℹ{NC} No jobs found to upload")

    return len(all_jobs)


if __name__ == "__main__":
    count = main()
    sys.exit(0 if count > 0 else 1)
