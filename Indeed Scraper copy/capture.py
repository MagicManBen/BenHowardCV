"""
Indeed Network Capture Tool
============================
Opens https://uk.indeed.com in a real Chromium browser via Playwright.
You browse around normally. Every network request/response is logged.
When you're done, close the browser window OR press Ctrl+C in this terminal.
A full dump of captured data is saved to captured_data.json.
"""

import json
import signal
import sys
import time
from datetime import datetime
from playwright.sync_api import sync_playwright

URL = "https://uk.indeed.com/jobs?q=&l=st135qr"

captured_requests = []
captured_responses = []


def on_request(request):
    entry = {
        "timestamp": datetime.now().isoformat(),
        "url": request.url,
        "method": request.method,
        "headers": dict(request.headers),
        "post_data": request.post_data,
        "resource_type": request.resource_type,
    }
    captured_requests.append(entry)


def on_response(response):
    body_preview = None
    try:
        ct = response.headers.get("content-type", "")
        if any(t in ct for t in ["json", "html", "text", "javascript", "xml"]):
            raw = response.body()
            body_preview = raw[:2000].decode("utf-8", errors="replace")
    except Exception:
        pass

    entry = {
        "timestamp": datetime.now().isoformat(),
        "url": response.url,
        "status": response.status,
        "headers": dict(response.headers),
        "body_preview": body_preview,
    }
    captured_responses.append(entry)


def save_and_report(cookies=None, storage=None):
    """Save captured data and print summary. Always runs, even on Ctrl+C."""
    cookies = cookies or []
    storage = storage or {}

    output = {
        "capture_time": datetime.now().isoformat(),
        "target_url": URL,
        "cookies": cookies,
        "storage": storage,
        "total_requests": len(captured_requests),
        "total_responses": len(captured_responses),
        "requests": captured_requests,
        "responses": captured_responses,
    }

    out_file = "captured_data.json"
    with open(out_file, "w") as f:
        json.dump(output, f, indent=2, default=str)

    print(f"\n{'='*60}")
    print("  CAPTURE COMPLETE")
    print(f"{'='*60}")
    print(f"  Requests captured  : {len(captured_requests)}")
    print(f"  Responses captured : {len(captured_responses)}")
    print(f"  Cookies captured   : {len(cookies)}")
    print(f"  Storage entries    : {sum(len(v.get('localStorage',{})) + len(v.get('sessionStorage',{})) for v in storage.values())}")
    print(f"\n  Full dump saved to : {out_file}")
    print(f"{'='*60}\n")

    if cookies:
        print("  COOKIES:")
        for c in cookies:
            flags = []
            if c.get("httpOnly"):
                flags.append("HttpOnly")
            if c.get("secure"):
                flags.append("Secure")
            print(f"    {c['name']:40s} = {str(c['value'])[:60]:60s}  [{', '.join(flags)}]")
        print()

    domains = sorted(set(
        r["url"].split("/")[2]
        for r in captured_requests
        if r["url"].startswith("http")
    ))
    if domains:
        print(f"  DOMAINS CONTACTED ({len(domains)}):")
        for d in domains:
            print(f"    {d}")
        print()

    api_endpoints = [
        r for r in captured_responses
        if "json" in r.get("headers", {}).get("content-type", "")
    ]
    if api_endpoints:
        print(f"  API/JSON ENDPOINTS ({len(api_endpoints)}):")
        for ep in api_endpoints:
            print(f"    [{ep['status']}] {ep['url'][:120]}")
        print()


def main():
    cookies = []
    storage = {}
    browser = None
    context = None

    def cleanup(*_):
        """Ensure we always save data, even on Ctrl+C."""
        nonlocal cookies, storage
        print("\n\nInterrupted! Saving captured data...")
        try:
            if context:
                cookies = context.cookies()
                for pg in context.pages:
                    try:
                        local = pg.evaluate("() => JSON.parse(JSON.stringify(localStorage))")
                        sess = pg.evaluate("() => JSON.parse(JSON.stringify(sessionStorage))")
                        storage[pg.url] = {"localStorage": local, "sessionStorage": sess}
                    except Exception:
                        pass
        except Exception:
            pass
        try:
            if browser:
                browser.close()
        except Exception:
            pass
        save_and_report(cookies, storage)
        sys.exit(0)

    signal.signal(signal.SIGINT, cleanup)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        context = browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/123.0.0.0 Safari/537.36"
            ),
            viewport={"width": 1280, "height": 900},
        )

        page = context.new_page()
        page.on("request", on_request)
        page.on("response", on_response)

        print(f"\n{'='*60}")
        print("  INDEED NETWORK CAPTURE")
        print(f"{'='*60}")
        print(f"\n  Opening: {URL}")
        print("  Browse around normally in the browser window.")
        print("  When done: CLOSE THE BROWSER or press Ctrl+C here.")
        print(f"\n{'='*60}\n")

        page.goto(URL, wait_until="domcontentloaded", timeout=30000)

        # Wait until browser is closed by user
        try:
            while True:
                try:
                    # This will throw if the page/context is gone
                    _ = context.pages
                    if not context.pages:
                        break
                    time.sleep(0.5)
                except Exception:
                    break
        except Exception:
            pass

        # ---- Capture final state ----
        print("\nBrowser closed. Collecting final data...")
        try:
            cookies = context.cookies()
        except Exception:
            pass

        for pg in context.pages:
            try:
                local = pg.evaluate("() => JSON.parse(JSON.stringify(localStorage))")
                sess = pg.evaluate("() => JSON.parse(JSON.stringify(sessionStorage))")
                storage[pg.url] = {"localStorage": local, "sessionStorage": sess}
            except Exception:
                pass

        try:
            browser.close()
        except Exception:
            pass

    save_and_report(cookies, storage)


if __name__ == "__main__":
    main()
