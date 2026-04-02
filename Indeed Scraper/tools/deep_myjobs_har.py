"""Deep-dive into interesting endpoints from myjobs HAR."""
import json
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[1]
RAW_DIR = BASE_DIR / "data" / "raw"

with open(RAW_DIR / "myjobs.indeed.com.har", "r", encoding="utf-8") as f:
    har = json.load(f)

entries = har["log"]["entries"]

# 1. Full appStatusJobs response
print("=" * 80)
print("1. myjobs.indeed.com/api/v1/appStatusJobs RESPONSES")
print("=" * 80)
for e in entries:
    url = e["request"]["url"]
    if "appStatusJobs" in url:
        print(f"\nURL: {url}")
        print(f"Method: {e['request']['method']}")
        # Request headers
        print("Request headers:")
        for h in e["request"]["headers"]:
            if h["name"].lower() not in [":method", ":path", ":scheme", "accept-encoding", "accept-language", "sec-ch-ua", "sec-ch-ua-mobile", "sec-ch-ua-platform", "sec-fetch-dest", "sec-fetch-mode", "sec-fetch-site", "user-agent", "dnt", "pragma", "cache-control", "referer"]:
                print(f"  {h['name']}: {h['value'][:120]}")
        # Cookies
        cookies = e["request"].get("cookies", [])
        if cookies:
            print(f"Cookies ({len(cookies)}):")
            for c in cookies:
                print(f"  {c['name']}: {c['value'][:80]}")
        # Response
        text = e["response"]["content"].get("text", "")
        if text:
            try:
                parsed = json.loads(text)
                print(f"\nFull response:\n{json.dumps(parsed, indent=2)}")
            except:
                print(f"Response: {text[:2000]}")

# 2. All GraphQL operations
print("\n" + "=" * 80)
print("2. ALL GraphQL OPERATIONS")
print("=" * 80)
for e in entries:
    if "graphql" in e["request"]["url"]:
        post = e["request"].get("postData", {})
        text = post.get("text", "")
        try:
            parsed = json.loads(text)
            op = parsed.get("operationName", "unknown")
        except:
            op = "parse-error"
        
        resp_text = e["response"]["content"].get("text", "")
        resp_size = len(resp_text) if resp_text else 0
        
        print(f"\n  Operation: {op}")
        print(f"  Response size: {resp_size} bytes")
        
        # Show request headers
        for h in e["request"]["headers"]:
            if "api-key" in h["name"].lower() or "indeed-" in h["name"].lower():
                print(f"  {h['name']}: {h['value'][:120]}")
        
        if resp_text:
            try:
                resp_parsed = json.loads(resp_text)
                print(f"  Response: {json.dumps(resp_parsed, indent=2)[:500]}")
            except:
                print(f"  Response: {resp_text[:500]}")

# 3. m/newjobs endpoint
print("\n" + "=" * 80)
print("3. m/newjobs RESPONSES")
print("=" * 80)
for e in entries:
    if "/m/newjobs" in e["request"]["url"]:
        url = e["request"]["url"]
        print(f"\nURL: {url}")
        text = e["response"]["content"].get("text", "")
        if text:
            try:
                parsed = json.loads(text)
                print(f"Response: {json.dumps(parsed, indent=2)}")
            except:
                print(f"Response: {text[:500]}")

# 4. jobalerts endpoint
print("\n" + "=" * 80)
print("4. jobalerts ENDPOINT")
print("=" * 80)  
for e in entries:
    if "jobalert" in e["request"]["url"].lower():
        url = e["request"]["url"]
        print(f"\nURL: {url}")
        print(f"Method: {e['request']['method']}")
        for h in e["request"]["headers"]:
            if h["name"].lower() not in [":method", ":path", ":scheme", "accept-encoding", "accept-language", "sec-ch-ua", "sec-ch-ua-mobile", "sec-ch-ua-platform", "sec-fetch-dest", "sec-fetch-mode", "sec-fetch-site", "user-agent", "dnt", "pragma", "cache-control", "referer"]:
                print(f"  {h['name']}: {h['value'][:120]}")
        post = e["request"].get("postData", {})
        if post and post.get("text"):
            print(f"  POST body: {post['text'][:500]}")
        text = e["response"]["content"].get("text", "")
        if text:
            try:
                parsed = json.loads(text)
                print(f"  Response: {json.dumps(parsed, indent=2)}")
            except:
                print(f"  Response: {text[:500]}")

# 5. Check for any search/jobs API endpoints we missed
print("\n" + "=" * 80)
print("5. ALL apis.indeed.com ENDPOINTS (non-graphql)")
print("=" * 80)
for e in entries:
    url = e["request"]["url"]
    if "apis.indeed.com" in url and "graphql" not in url:
        print(f"  [{e['request']['method']}] {url}")

# 6. All uk.indeed.com API/RPC endpoints
print("\n" + "=" * 80)
print("6. uk.indeed.com API/RPC ENDPOINTS")
print("=" * 80)
for e in entries:
    url = e["request"]["url"]
    if "uk.indeed.com" in url and ("/api/" in url or "/rpc/" in url or "/m/" in url):
        size = e["response"]["content"].get("size", 0)
        print(f"  [{e['request']['method']} {e['response']['status']}] ({size} bytes) {url[:180]}")
