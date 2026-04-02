import json

with open("uk.indeed.com.har", "r") as f:
    har = json.load(f)

entries = har["log"]["entries"]
print(f"Total entries: {len(entries)}")
print()

# Unique domains
domains = sorted(set(
    e["request"]["url"].split("/")[2]
    for e in entries
    if e["request"]["url"].startswith("http")
))
print(f"DOMAINS ({len(domains)}):")
for d in domains:
    print(f"  {d}")
print()

# Cookies from first request to uk.indeed.com
for e in entries:
    if "uk.indeed.com/jobs" in e["request"]["url"]:
        print("COOKIES (from first job search request):")
        for c in e["request"]["cookies"]:
            print(f"  {c['name']:40s} = {str(c['value'])[:80]}")
        print()

        print("REQUEST HEADERS:")
        for h in e["request"]["headers"]:
            print(f"  {h['name']:40s} = {str(h['value'])[:120]}")
        print()

        print("RESPONSE HEADERS:")
        for h in e["response"]["headers"]:
            print(f"  {h['name']:40s} = {str(h['value'])[:120]}")
        print()
        break

# Find JSON API endpoints
print("JSON/API ENDPOINTS:")
for e in entries:
    url = e["request"]["url"]
    resp_ct = ""
    for h in e["response"]["headers"]:
        if h["name"].lower() == "content-type":
            resp_ct = h["value"]
            break
    if "json" in resp_ct.lower():
        status = e["response"]["status"]
        method = e["request"]["method"]
        short_url = url[:150]
        print(f"  [{method} {status}] {short_url}")
print()

# Find search/jobs related endpoints
print("INDEED JOB-RELATED ENDPOINTS:")
for e in entries:
    url = e["request"]["url"]
    if any(kw in url.lower() for kw in ["/jobs", "search", "serp", "jobsearch", "rpc", "api"]):
        status = e["response"]["status"]
        method = e["request"]["method"]
        short_url = url[:150]
        resp_size = e["response"]["content"].get("size", 0)
        print(f"  [{method} {status}] ({resp_size:>8} bytes) {short_url}")
print()

# Show Set-Cookie headers from responses
print("SET-COOKIE HEADERS FROM RESPONSES:")
seen = set()
for e in entries:
    for h in e["response"]["headers"]:
        if h["name"].lower() == "set-cookie":
            cookie_name = h["value"].split("=")[0].strip()
            if cookie_name not in seen:
                seen.add(cookie_name)
                print(f"  {h['value'][:150]}")
print()

# Check for any interesting response bodies (job data)
print("RESPONSES WITH JOB DATA (checking for jobTitle/company patterns):")
for e in entries:
    content = e["response"]["content"]
    text = content.get("text", "")
    if text and any(kw in text.lower() for kw in ["jobtitle", "job_title", "companyname", "company_name", "jobkey"]):
        url = e["request"]["url"][:120]
        size = content.get("size", 0)
        print(f"  [{e['response']['status']}] ({size:>8} bytes) {url}")
        # Print a small preview
        preview = text[:500].replace("\n", " ")
        print(f"    Preview: {preview[:300]}...")
        print()
