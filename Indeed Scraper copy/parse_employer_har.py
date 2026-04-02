"""
Employer HAR Deep Analysis
===========================
Parses employers.indeed.com.har to reverse-engineer:
- How employers post jobs (fields, tags, keywords, categories)
- What screening/filtering/matching criteria exist
- What the ATS (Applicant Tracking System) looks at
- Scoring, ranking, or qualification signals
"""

import json
import re
from collections import Counter
from urllib.parse import urlparse, parse_qs

with open("employers.indeed.com.har", "r") as f:
    har = json.load(f)

entries = har["log"]["entries"]
print(f"Total requests captured: {len(entries)}")
print()

# ============================================================
# 1. DOMAINS
# ============================================================
domains = Counter()
for e in entries:
    url = e["request"]["url"]
    if url.startswith("http"):
        domains[urlparse(url).netloc] += 1

print("=" * 70)
print("  DOMAINS CONTACTED")
print("=" * 70)
for d, count in domains.most_common():
    print(f"  {count:4d}  {d}")
print()

# ============================================================
# 2. API / RPC ENDPOINTS (unique paths)
# ============================================================
print("=" * 70)
print("  API / RPC ENDPOINTS")
print("=" * 70)
api_paths = {}
for e in entries:
    url = e["request"]["url"]
    parsed = urlparse(url)
    if any(kw in url.lower() for kw in ["/api/", "/rpc/", "/graphql", "/v1/", "/v2/", "/v3/"]):
        path = parsed.path
        key = f"{e['request']['method']} {parsed.netloc}{path}"
        if key not in api_paths:
            api_paths[key] = url[:200]
for key in sorted(api_paths):
    print(f"  {key}")
print()

# ============================================================
# 3. GRAPHQL OPERATIONS
# ============================================================
print("=" * 70)
print("  GRAPHQL OPERATIONS")
print("=" * 70)
for e in entries:
    if "graphql" in e["request"]["url"].lower():
        post = e["request"].get("postData", {})
        text = post.get("text", "")
        if text:
            try:
                body = json.loads(text)
                # Could be a list of operations
                ops = body if isinstance(body, list) else [body]
                for op in ops:
                    name = op.get("operationName", "unknown")
                    variables = op.get("variables", {})
                    query_text = op.get("query", "")[:300]
                    print(f"\n  Operation: {name}")
                    print(f"  Variables: {json.dumps(variables, indent=4)[:500]}")
                    print(f"  Query: {query_text}...")
                    
                    # Check response
                    resp_text = e["response"]["content"].get("text", "")
                    if resp_text:
                        try:
                            resp_data = json.loads(resp_text)
                            print(f"  Response keys: {list(resp_data.get('data', {}).keys()) if isinstance(resp_data, dict) else 'array'}")
                            # Print a preview
                            preview = json.dumps(resp_data, indent=2)[:800]
                            print(f"  Response preview:\n{preview}")
                        except json.JSONDecodeError:
                            pass
            except json.JSONDecodeError:
                pass
print()

# ============================================================
# 4. JOB POSTING RELATED ENDPOINTS & DATA
# ============================================================
print("=" * 70)
print("  JOB POSTING / SCREENING / MATCHING DATA")
print("=" * 70)

keywords_of_interest = [
    "skill", "qualification", "screening", "question", "filter", "match",
    "score", "rank", "keyword", "tag", "category", "occupation", "experience",
    "education", "resume", "applicant", "candidate", "apply", "assessment",
    "dealbreaker", "must-have", "preferred", "requirement", "criteria",
    "job_description", "jobDescription", "posting", "sponsor", "budget",
    "urgentHire", "easyApply", "indeedApply", "jobType", "schedule",
    "salary", "compensation", "benefit", "remote", "hybrid",
]

for e in entries:
    url = e["request"]["url"]
    resp_text = e["response"]["content"].get("text", "")
    post_text = e["request"].get("postData", {}).get("text", "")
    
    combined = (resp_text + post_text).lower()
    
    # Check if this endpoint contains interesting employer/posting data
    hits = [kw for kw in keywords_of_interest if kw.lower() in combined]
    
    if len(hits) >= 3 and resp_text:
        parsed = urlparse(url)
        print(f"\n  [{e['request']['method']} {e['response']['status']}] {parsed.netloc}{parsed.path[:100]}")
        print(f"  Keyword hits: {', '.join(hits[:15])}")
        
        # Try to extract structured data
        try:
            data = json.loads(resp_text)
            preview = json.dumps(data, indent=2)[:1500]
            print(f"  Response:\n{preview}")
        except (json.JSONDecodeError, TypeError):
            # Check for interesting patterns in HTML
            for kw in hits[:5]:
                matches = re.findall(rf'.{{0,80}}{re.escape(kw)}.{{0,80}}', resp_text[:50000], re.IGNORECASE)
                if matches:
                    print(f"  Context for '{kw}': {matches[0][:200]}")
        print()

# ============================================================
# 5. SCREENING QUESTIONS & DEALBREAKERS
# ============================================================
print("=" * 70)
print("  SCREENING QUESTIONS / DEALBREAKERS / QUALIFICATIONS")
print("=" * 70)
screening_patterns = [
    r'"screeningQuestion[^"]*"',
    r'"dealbreaker[^"]*"',
    r'"qualificationType[^"]*"',
    r'"questionText"\s*:\s*"([^"]+)"',
    r'"screenerQuestion[^"]*"',
    r'"mustHave[^"]*"',
    r'"preferredQualification[^"]*"',
    r'"requiredQualification[^"]*"',
]

all_text = ""
for e in entries:
    resp = e["response"]["content"].get("text", "")
    post = e["request"].get("postData", {}).get("text", "")
    all_text += resp + post

for pattern in screening_patterns:
    matches = re.findall(pattern, all_text[:5000000], re.IGNORECASE)
    if matches:
        unique = list(set(matches))[:20]
        print(f"\n  Pattern: {pattern}")
        for m in unique:
            print(f"    {m[:200]}")

# ============================================================
# 6. COOKIES & AUTH TOKENS
# ============================================================
print()
print("=" * 70)
print("  EMPLOYER-SIDE COOKIES & TOKENS")
print("=" * 70)
seen_cookies = set()
for e in entries:
    for c in e["request"].get("cookies", []):
        if c["name"] not in seen_cookies:
            seen_cookies.add(c["name"])
            print(f"  {c['name']:50s} = {str(c['value'])[:80]}")

# Auth headers
print()
print("  AUTH / API HEADERS:")
auth_headers = set()
for e in entries:
    for h in e["request"]["headers"]:
        name_lower = h["name"].lower()
        if any(kw in name_lower for kw in ["auth", "token", "key", "csrf", "indeed-"]):
            key = h["name"]
            if key not in auth_headers:
                auth_headers.add(key)
                print(f"    {h['name']:40s} = {h['value'][:120]}")

# ============================================================
# 7. JOB POSTING FORM FIELDS / SCHEMA
# ============================================================
print()
print("=" * 70)
print("  JOB POSTING FIELDS / FORM SCHEMA")
print("=" * 70)

field_patterns = [
    r'"fieldName"\s*:\s*"([^"]+)"',
    r'"inputName"\s*:\s*"([^"]+)"',
    r'"name"\s*:\s*"(job[A-Z][^"]+)"',
    r'"label"\s*:\s*"([^"]{3,60})"',
]

for pattern in field_patterns:
    matches = re.findall(pattern, all_text[:5000000])
    if matches:
        unique = sorted(set(matches))[:30]
        print(f"\n  Pattern: {pattern}")
        for m in unique:
            print(f"    {m}")

# ============================================================
# 8. LARGE JSON RESPONSE BODIES (likely config/schema)
# ============================================================
print()
print("=" * 70)
print("  LARGE JSON RESPONSES (likely schemas/configs)")
print("=" * 70)
for e in entries:
    content = e["response"]["content"]
    ct = ""
    for h in e["response"]["headers"]:
        if h["name"].lower() == "content-type":
            ct = h["value"]
            break
    
    text = content.get("text", "")
    size = len(text)
    
    if "json" in ct.lower() and size > 2000:
        parsed = urlparse(e["request"]["url"])
        print(f"\n  [{e['response']['status']}] ({size:>8} chars) {e['request']['method']} {parsed.netloc}{parsed.path[:100]}")
        try:
            data = json.loads(text)
            # Show top-level keys
            if isinstance(data, dict):
                print(f"  Top keys: {list(data.keys())[:15]}")
                # Look for interesting nested keys
                def find_keys(obj, prefix="", depth=0):
                    interesting = []
                    if depth > 3 or not isinstance(obj, dict):
                        return interesting
                    for k, v in obj.items():
                        full = f"{prefix}.{k}" if prefix else k
                        if any(kw in k.lower() for kw in ["screen", "question", "skill", "qual", "match", "score", "keyword", "tag", "deal", "require"]):
                            interesting.append((full, type(v).__name__, str(v)[:200]))
                        interesting.extend(find_keys(v, full, depth + 1))
                    return interesting
                
                findings = find_keys(data)
                if findings:
                    print(f"  Interesting fields:")
                    for path, typ, val in findings[:20]:
                        print(f"    {path} ({typ}): {val}")
        except json.JSONDecodeError:
            pass

print("\n\nDone.")
