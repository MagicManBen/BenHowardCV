#!/usr/bin/env python3
"""Extract technical/code clues from both HAR files."""
import json

def analyze_seeker_har():
    print("=" * 70)
    print("JOB SEEKER HAR (uk.indeed.com.har) - CODE CLUES")
    print("=" * 70)

    with open("uk.indeed.com.har", "r") as f:
        har = json.load(f)

    entries = har["log"]["entries"]
    print(f"Total entries: {len(entries)}\n")

    # Main search page request
    for e in entries:
        url = e["request"]["url"]
        if "uk.indeed.com/jobs?" in url and e["request"]["method"] == "GET":
            print("=== MAIN SEARCH PAGE REQUEST ===")
            print(f"URL: {url[:200]}")
            print(f"Status: {e['response']['status']}")
            print("\nREQUEST HEADERS:")
            for h in e["request"]["headers"]:
                print(f"  {h['name']}: {h['value'][:150]}")
            print("\nQUERY PARAMS:")
            for q in e["request"].get("queryString", []):
                print(f"  {q['name']}: {q['value'][:100]}")
            content = e["response"]["content"]
            print(f"\nResponse MIME: {content.get('mimeType', '')}")
            print(f"Response size: {content.get('size', 0)}")
            # Check for mosaic data in response
            text = content.get("text", "")
            if "mosaic" in text:
                print("  -> Contains mosaic provider data")
                # Extract the mosaic JSON structure keys
                import re
                m = re.search(r'window\.mosaic\.providerData\["mosaic-provider-jobcards"\]\s*=\s*(\{.+?\});\s*</script>', text, re.DOTALL)
                if m:
                    data = json.loads(m.group(1))
                    print(f"  -> Top keys: {list(data.keys())}")
                    meta = data.get("metaData", {})
                    print(f"  -> metaData keys: {list(meta.keys())}")
                    model = meta.get("mosaicProviderJobCardsModel", {})
                    print(f"  -> mosaicProviderJobCardsModel keys: {list(model.keys())}")
                    results = model.get("results", [])
                    if results:
                        print(f"  -> Number of results: {len(results)}")
                        print(f"  -> First result keys: {sorted(results[0].keys())}")
                        # Show full first result
                        print(f"\n  --- FIRST JOB RESULT (ALL FIELDS) ---")
                        print(json.dumps(results[0], indent=4, default=str))
                    # Check for total count / pagination info
                    for k, v in model.items():
                        if k != "results" and v:
                            print(f"  -> model['{k}']: {json.dumps(v, default=str)[:200]}")
            break

    # All JSON/API calls
    print("\n\n=== ALL JSON/API CALLS ===")
    for e in entries:
        url = e["request"]["url"]
        resp_mime = e["response"]["content"].get("mimeType", "")
        if "json" in resp_mime or "graphql" in url:
            method = e["request"]["method"]
            status = e["response"]["status"]
            size = e["response"]["content"].get("size", 0)
            print(f"\n{method} {url[:150]} -> {status} ({size} bytes)")
            for h in e["request"]["headers"]:
                name = h["name"].lower()
                if name in ("indeed-api-key", "indeed-ctk", "cookie", "x-indeed-rqctx",
                            "indeedcsrftoken", "authorization", "content-type"):
                    val = h["value"]
                    if name == "cookie":
                        val = val[:100] + "..."
                    print(f"  {h['name']}: {val[:150]}")
            if e["request"].get("postData"):
                body = e["request"]["postData"].get("text", "")
                try:
                    j = json.loads(body)
                    print(f"  Operation: {j.get('operationName', '?')}")
                    if j.get("variables"):
                        print(f"  Variables: {json.dumps(j['variables'], default=str)[:200]}")
                except Exception:
                    pass

    # Look for any mosaic providers besides jobcards
    print("\n\n=== ALL MOSAIC PROVIDERS IN HTML ===")
    for e in entries:
        text = e["response"]["content"].get("text", "")
        if text and "mosaic" in text:
            import re
            providers = re.findall(r'window\.mosaic\.providerData\["([^"]+)"\]', text)
            for p in set(providers):
                print(f"  Provider: {p}")

    # Look for interesting cookies set by responses
    print("\n\n=== RESPONSE SET-COOKIE HEADERS ===")
    seen_cookies = set()
    for e in entries:
        for h in e["response"]["headers"]:
            if h["name"].lower() == "set-cookie":
                name = h["value"].split("=")[0]
                if name not in seen_cookies:
                    seen_cookies.add(name)
                    print(f"  {h['value'][:150]}")


def analyze_employer_har():
    print("\n\n" + "=" * 70)
    print("EMPLOYER HAR (employers.indeed.com.har) - CODE CLUES")
    print("=" * 70)

    with open("employers.indeed.com.har", "r") as f:
        har = json.load(f)

    entries = har["log"]["entries"]
    print(f"Total entries: {len(entries)}\n")

    # Find GraphQL calls with full response bodies that reveal job data structure
    print("=== GRAPHQL OPERATIONS WITH JOB/CANDIDATE DATA ===")
    interesting_ops = [
        "Jmfe_JobDetails_Node", "GetHostedEmployerJob",
        "GetEmployerJobPostByEmployerJobId", "CRP_CandidateSubmissions",
        "GetCandidateSubmission", "SuggestedQualifications",
        "QualificationQuestionSetByEntity", "ClassifyOccupations",
        "FindRCPMatches", "GatheredFeedback",
    ]

    for e in entries:
        url = e["request"]["url"]
        if "graphql" not in url:
            continue
        body = e["request"].get("postData", {}).get("text", "")
        try:
            j = json.loads(body)
        except Exception:
            continue
        op = j.get("operationName", "")
        if op not in interesting_ops:
            continue

        resp_text = e["response"]["content"].get("text", "")
        try:
            resp = json.loads(resp_text)
        except Exception:
            continue

        print(f"\n--- {op} ---")
        print(f"Full response ({len(resp_text)} chars):")
        # Print full response but cap at 3000 chars
        formatted = json.dumps(resp, indent=2, default=str)
        if len(formatted) > 3000:
            print(formatted[:3000])
            print(f"  ... truncated ({len(formatted)} total chars)")
        else:
            print(formatted)


if __name__ == "__main__":
    analyze_seeker_har()
    analyze_employer_har()
