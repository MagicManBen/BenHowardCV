"""Quick debug: save what Playwright headless actually fetches from Indeed."""
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE_DIR = Path(__file__).resolve().parents[1]
ARTIFACTS_DIR = BASE_DIR / "data" / "artifacts"
url = "https://uk.indeed.com/jobs?q=&l=st135qr&radius=25"

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(
        user_agent=(
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/146.0.0.0 Safari/537.36"
        ),
        viewport={"width": 1280, "height": 900},
        locale="en-GB",
    )
    page = context.new_page()
    page.goto(url, wait_until="domcontentloaded", timeout=20000)
    page.wait_for_timeout(3000)
    html = page.content()
    context.close()
    browser.close()

ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
with open(ARTIFACTS_DIR / "debug_page.html", "w", encoding="utf-8") as f:
    f.write(html)

print(f"Saved {len(html)} chars to {ARTIFACTS_DIR / 'debug_page.html'}")
print(f"Contains 'mosaic-provider-jobcards': {'mosaic-provider-jobcards' in html}")
print(f"Contains 'jobTitle': {'jobTitle' in html}")
print(f"Contains 'window.mosaic': {'window.mosaic' in html}")

# Check for captcha / block
if "captcha" in html.lower() or "blocked" in html.lower():
    print("WARNING: Page contains captcha/block!")
if "cf-browser-verification" in html.lower():
    print("WARNING: Cloudflare verification page!")

# Show title
import re
title = re.search(r"<title>(.*?)</title>", html)
if title:
    print(f"Page title: {title.group(1)}")
