import json
import os
import re
import time
from urllib.parse import quote_plus
from flask import Flask, Response, request as flask_request, send_file, stream_with_context
from curl_cffi import requests as cffi_requests

app = Flask(__name__)

SEARCH_URL = "https://uk.indeed.com/jobs"
JOBS_PER_PAGE = 10  # Indeed returns ~10-15 per page
COOKIE_FILE = os.path.join(os.path.dirname(__file__), "cookies.json")

# Persistent session that impersonates Chrome's TLS fingerprint
_session = None


def _load_cookies(session):
    """Load cookies from cookies.json (exported from browser)."""
    if not os.path.exists(COOKIE_FILE):
        return False
    with open(COOKIE_FILE) as f:
        cookies = json.load(f)
    for c in cookies:
        name = c.get("name", "")
        value = c.get("value", "")
        domain = c.get("domain", ".indeed.com")
        if name and value:
            session.cookies.set(name, value, domain=domain)
    return True


def get_session():
    global _session
    if _session is None:
        _session = cffi_requests.Session(impersonate="chrome")
        _session.headers.update({
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-GB,en;q=0.9",
            "Accept-Encoding": "gzip, deflate, br",
            "Sec-Fetch-Dest": "document",
            "Sec-Fetch-Mode": "navigate",
            "Sec-Fetch-Site": "none",
            "Sec-Fetch-User": "?1",
            "Upgrade-Insecure-Requests": "1",
        })
        # Load browser cookies if available (needed for pagination past page 1)
        has_cookies = _load_cookies(_session)
        # Warm up session to collect Cloudflare tokens
        _session.get("https://uk.indeed.com/", timeout=15)
        if has_cookies:
            print("  Loaded cookies from cookies.json")
        else:
            print("  ⚠ No cookies.json — pagination will be limited to page 1")
            print("  → Export cookies from Chrome and save as cookies.json")
    return _session


def scrape_one_page(query="", location="st135qr", radius=25, start=0, sort="date"):
    """Fetch one page of Indeed search results via HTTP (no browser).
    Returns (jobs, debug_info) tuple."""
    global _session
    q = quote_plus(query)
    l = quote_plus(location)
    url = f"{SEARCH_URL}?q={q}&l={l}&radius={radius}&sort={sort}&start={start}"

    for attempt in range(2):
        session = get_session()
        # Indeed requires Referer for pagination pages
        headers = {}
        if start > 0:
            headers["Referer"] = f"{SEARCH_URL}?q={q}&l={l}&radius={radius}&sort={sort}&start={start - JOBS_PER_PAGE}"
            headers["Sec-Fetch-Site"] = "same-origin"
        resp = session.get(url, headers=headers, allow_redirects=False, timeout=20)

        debug_info = {
            "url": url,
            "status": resp.status_code,
            "response_size": len(resp.text),
            "response_headers": dict(resp.headers),
            "request_headers": dict(session.headers),
            "cookies": {k: v for k, v in session.cookies.items()},
            "attempt": attempt + 1,
            "html": resp.text,
        }

        # Auth wall redirect (page 2+ without login cookies)
        if resp.status_code in (301, 302, 303, 307, 308):
            location_header = resp.headers.get("location", "")
            debug_info["blocked"] = True
            debug_info["redirect_to"] = location_header
            if "secure.indeed.com/auth" in location_header:
                raise RuntimeError(
                    "Indeed requires login for page 2+. "
                    "Export cookies from Chrome (use EditThisCookie extension) "
                    "and save as cookies.json in the scraper folder."
                )
            # Other redirect — follow it manually
            resp = session.get(location_header, timeout=20)
            debug_info["html"] = resp.text
            debug_info["status"] = resp.status_code
            debug_info["response_size"] = len(resp.text)

        # Cloudflare challenge or block — reset session and retry
        if resp.status_code == 403 or "challenge-platform" in resp.text[:2000]:
            debug_info["blocked"] = True
            _session = None
            time.sleep(2)
            continue

        resp.raise_for_status()
        debug_info["blocked"] = False
        return parse_jobs_from_html(resp.text), debug_info

    raise RuntimeError("Blocked by Cloudflare after retry")


def _extract_mosaic_json(html):
    """Find the mosaic-provider-jobcards JSON using JSONDecoder for balanced braces."""
    marker = 'window.mosaic.providerData["mosaic-provider-jobcards"]'
    idx = html.find(marker)
    if idx == -1:
        return None
    # Skip past the `= ` to the opening `{`
    eq_idx = html.find("=", idx + len(marker))
    if eq_idx == -1:
        return None
    start = eq_idx + 1
    # Skip whitespace
    while start < len(html) and html[start] in " \t\n\r":
        start += 1
    if start >= len(html) or html[start] != "{":
        return None
    try:
        decoder = json.JSONDecoder()
        obj, _ = decoder.raw_decode(html, start)
        return obj
    except (json.JSONDecodeError, ValueError):
        return None


def parse_jobs_from_html(html):
    """Extract job listings from Indeed HTML."""
    jobs = []

    data = _extract_mosaic_json(html)
    if data:
        try:
            results = data.get("metaData", {}).get("mosaicProviderJobCardsModel", {}).get("results", [])
            for r in results:
                job = {
                    "title": r.get("title", ""),
                    "company": r.get("company", ""),
                    "location": r.get("formattedLocation", ""),
                    "salary": "",
                    "snippet": r.get("snippet", ""),
                    "date": r.get("formattedRelativeDateTime", ""),
                    "jobkey": r.get("jobkey", ""),
                    "link": f"https://uk.indeed.com/viewjob?jk={r.get('jobkey', '')}",
                    "sponsored": r.get("isSponsored", False),
                }
                sal = r.get("estimatedSalary", {}) or r.get("salarySnippet", {})
                if sal:
                    job["salary"] = sal.get("text", "") or sal.get("formattedRange", "")
                jobs.append(job)
        except (json.JSONDecodeError, KeyError):
            pass

    if not jobs:
        titles = re.findall(r'"jobTitle"\s*:\s*"([^"]+)"', html)
        companies = re.findall(r'"company"\s*:\s*"([^"]+)"', html)
        locations = re.findall(r'"formattedLocation"\s*:\s*"([^"]+)"', html)
        jobkeys = re.findall(r'"jobkey"\s*:\s*"([^"]+)"', html)
        salaries = re.findall(r'"salarySnippet"\s*:\s*\{[^}]*"text"\s*:\s*"([^"]+)"', html)
        dates = re.findall(r'"formattedRelativeDateTime"\s*:\s*"([^"]+)"', html)

        for i, title in enumerate(titles):
            job = {
                "title": title,
                "company": companies[i] if i < len(companies) else "",
                "location": locations[i] if i < len(locations) else "",
                "salary": salaries[i] if i < len(salaries) else "",
                "date": dates[i] if i < len(dates) else "",
                "jobkey": jobkeys[i] if i < len(jobkeys) else "",
                "link": f"https://uk.indeed.com/viewjob?jk={jobkeys[i]}" if i < len(jobkeys) else "",
                "sponsored": False,
                "snippet": "",
            }
            jobs.append(job)

    return jobs


@app.route("/")
def index():
    return send_file("index.html")


@app.route("/api/cookies", methods=["GET"])
def cookie_status():
    exists = os.path.exists(COOKIE_FILE)
    count = 0
    if exists:
        with open(COOKIE_FILE) as f:
            count = len(json.load(f))
    return {"has_cookies": exists, "count": count}


@app.route("/api/cookies", methods=["POST"])
def upload_cookies():
    global _session
    data = flask_request.get_json(force=True)
    if not isinstance(data, list):
        return {"error": "Expected a JSON array of cookie objects"}, 400
    with open(COOKIE_FILE, "w") as f:
        json.dump(data, f, indent=2)
    _session = None  # force session reset
    return {"ok": True, "count": len(data)}


@app.route("/api/pull")
def pull_jobs():
    query = flask_request.args.get("q", "")
    location = flask_request.args.get("l", "Staffordshire")
    radius = flask_request.args.get("radius", "25")
    sort = flask_request.args.get("sort", "date")
    max_pages = flask_request.args.get("pages", "20")  # default: 20 pages = ~200 jobs

    try:
        max_p = min(int(max_pages), 50)  # cap at 50 pages = ~500 jobs
    except ValueError:
        max_p = 20

    def generate():
        all_jobs = []
        seen_keys = set()
        empty_pages = 0

        yield f"data: {json.dumps({'type': 'start', 'max_pages': max_p})}\n\n"

        for page_num in range(max_p):
            start = page_num * JOBS_PER_PAGE
            try:
                page_jobs, debug_info = scrape_one_page(
                    query=query,
                    location=location,
                    radius=int(radius),
                    start=start,
                    sort=sort,
                )
            except Exception as e:
                yield f"data: {json.dumps({'type': 'error', 'page': page_num + 1, 'error': str(e)})}\n\n"
                break

            # Deduplicate by jobkey
            new_jobs = []
            for j in page_jobs:
                if j["jobkey"] and j["jobkey"] not in seen_keys:
                    seen_keys.add(j["jobkey"])
                    new_jobs.append(j)
                elif not j["jobkey"]:
                    new_jobs.append(j)

            all_jobs.extend(new_jobs)

            # Send debug event with full details (HTML sent separately to keep page event small)
            debug_summary = {
                "type": "debug",
                "page": page_num + 1,
                "url": debug_info["url"],
                "status": debug_info["status"],
                "response_size": debug_info["response_size"],
                "response_headers": debug_info["response_headers"],
                "request_headers": debug_info["request_headers"],
                "cookies": debug_info["cookies"],
                "attempt": debug_info["attempt"],
                "blocked": debug_info["blocked"],
                "jobs_parsed": len(page_jobs),
                "jobs_new": len(new_jobs),
                "html": debug_info["html"],
            }
            yield f"data: {json.dumps(debug_summary)}\n\n"

            yield f"data: {json.dumps({'type': 'page', 'page': page_num + 1, 'new': len(new_jobs), 'total': len(all_jobs)})}\n\n"

            # Stop if page returned no new jobs
            if len(new_jobs) == 0:
                empty_pages += 1
                if empty_pages >= 2:
                    break
            else:
                empty_pages = 0

            # Small delay to not hammer Indeed
            if page_num < max_p - 1:
                time.sleep(1)

        yield f"data: {json.dumps({'type': 'done', 'count': len(all_jobs), 'jobs': all_jobs})}\n\n"

    return Response(
        stream_with_context(generate()),
        mimetype="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


if __name__ == "__main__":
    print("  Warming up session (TLS handshake + cookies)...")
    get_session()
    print("  Session ready — no browser needed.")
    print("\n  Open http://localhost:5050 in your browser\n")
    app.run(port=5050)
