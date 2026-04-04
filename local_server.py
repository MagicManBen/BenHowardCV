#!/usr/bin/env python3

import base64
import html
import json
import os
import re
import secrets
import shutil
import string
import subprocess
import sys
import tempfile
import time
import traceback
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, quote, urlencode, urljoin, urlparse
from urllib.request import Request, urlopen

CHROME_CANDIDATES = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  shutil.which("chromium") or "",
  shutil.which("google-chrome") or "",
]


def find_chrome():
  for path in CHROME_CANDIDATES:
    if path and os.path.isfile(path):
      return path
  return None


def generate_pdf_from_html(html_content):
  """Convert HTML string to PDF bytes using Chrome headless. Returns (pdf_bytes, error_str)."""
  chrome = find_chrome()
  if not chrome:
    return None, "Chrome/Chromium not found."

  with tempfile.TemporaryDirectory() as tmp:
    html_path = os.path.join(tmp, "cv.html")
    pdf_path = os.path.join(tmp, "cv.pdf")
    Path(html_path).write_text(html_content, encoding="utf-8")

    cmd = [
      chrome,
      "--headless=new",
      "--no-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--disable-extensions",
      "--disable-background-networking",
      "--no-first-run",
      "--no-default-browser-check",
      "--run-all-compositor-stages-before-draw",
      "--virtual-time-budget=5000",
      f"--print-to-pdf={pdf_path}",
      f"--user-data-dir={tmp}/profile",
      f"file://{html_path}",
    ]
    env = {**os.environ, "DISPLAY": ""}  # Avoid display issues
    try:
      proc = subprocess.Popen(
        cmd,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
        stdin=subprocess.DEVNULL,
        close_fds=True,
        start_new_session=True,
        env=env,
      )
    except OSError as exc:
      return None, str(exc)

    # Chrome on macOS often writes the PDF but never exits when the
    # main browser is already running.  Poll for the PDF file first,
    # then fall back to waiting for the process to finish.
    deadline = 60
    interval = 0.5
    elapsed = 0.0
    pdf_ready = False
    prev_size = -1
    stable_ticks = 0
    while elapsed < deadline:
      retcode = proc.poll()
      if retcode is not None:
        break
      if os.path.exists(pdf_path):
        cur_size = os.path.getsize(pdf_path)
        if cur_size > 0 and cur_size == prev_size:
          stable_ticks += 1
          if stable_ticks >= 3:
            pdf_ready = True
            break
        else:
          stable_ticks = 0
        prev_size = cur_size
      time.sleep(interval)
      elapsed += interval

    # If Chrome is still running, kill it — we have the PDF (or timed out)
    if proc.poll() is None:
      try:
        proc.kill()
        proc.wait(timeout=5)
      except Exception:
        pass

    if not os.path.exists(pdf_path) or os.path.getsize(pdf_path) == 0:
      stderr_out = ""
      try:
        stderr_out = proc.stderr.read().decode("utf-8", errors="replace")[:500]
      except Exception:
        pass
      return None, f"Chrome did not produce a PDF. {stderr_out}".strip()
    return Path(pdf_path).read_bytes(), None

from content_generation import generate_application_from_advert, generate_personalised_content


ROOT = Path(__file__).resolve().parent
PUBLIC_DATA_DIR = ROOT / "data"
LOCAL_ADMIN_DIR = ROOT / "local-admin"
LOCAL_CACHE_DIR = ROOT / "local-cache"
LOCAL_CACHE_DATA_DIR = LOCAL_CACHE_DIR / "data"
LOCAL_CONFIG_PATH = LOCAL_ADMIN_DIR / "secrets.local.json"
JOB_SEARCH_PREFERENCES_PATH = LOCAL_ADMIN_DIR / "job-search-preferences.json"
CV_HTML_PATH = ROOT / "BH CV.html"
OPENCODE_QUOTA_PATH = ROOT / "support" / "opencode-quota"
DEBUG_DIR = ROOT / "debug"
PUBLISH_DEBUG_DIR = DEBUG_DIR / "publish"
PUBLISH_DEBUG_INDEX = DEBUG_DIR / "publish.log"
KEYCHAIN_SERVICE_GITHUB_TOKEN = "benhowardcv-github-token"
KEYCHAIN_SERVICE_ADZUNA_APP_ID = "benhowardcv-adzuna-app-id"
KEYCHAIN_SERVICE_ADZUNA_API_KEY = "benhowardcv-adzuna-api-key"
KEYCHAIN_SERVICE_REED_API_KEY = "benhowardcv-reed-api-key"

GITHUB_OWNER = "MagicManBen"
GITHUB_REPO = "BenHowardCV"
GITHUB_BRANCH = "main"
APPLICATIONS_INDEX_PATH = "data/applications.json"
DEFAULT_PUBLIC_CV_BASE_URL = "https://checkloops.co.uk/cv.html"
SUPABASE_DEFAULT_BUCKET = "cv-files"
SUPABASE_APPLICATIONS_TABLE = "applications"
SUPABASE_REVIEWED_JOBS_TABLE = "reviewed_jobs"
KEYCHAIN_SERVICE_OPENAI_KEY = "benhowardcv-openai-api-key"

# GraphHopper driving-time config
GRAPHHOPPER_API_KEY = "b1ddded7-02e5-40b1-adea-d82c590120a2"
GRAPHHOPPER_HOME_LAT = 53.106
GRAPHHOPPER_HOME_LON = -1.984  # ST13 5QR, Leek, Staffordshire

INDEED_SEARCH_QUERY_TEMPLATE = """
query GetJobData {{
  jobSearch(
    {what}
    {location}
    limit: {limit}
    sort: RELEVANCE
    {cursor}
    {filters}
  ) {{
    pageInfo {{
      nextCursor
    }}
    results {{
      trackingKey
      job {{
        key
        title
        datePublished
        description {{
          html
        }}
        location {{
          countryName
          countryCode
          admin1Code
          city
          postalCode
          streetAddress
          formatted {{
            short
            long
          }}
        }}
        compensation {{
          estimated {{
            currencyCode
            baseSalary {{
              unitOfWork
              range {{
                ... on Range {{
                  min
                  max
                }}
              }}
            }}
          }}
          baseSalary {{
            unitOfWork
            range {{
              ... on Range {{
                min
                max
              }}
            }}
          }}
          currencyCode
        }}
        attributes {{
          key
          label
        }}
        employer {{
          relativeCompanyPageUrl
          name
          dossier {{
            employerDetails {{
              addresses
              industry
              employeesLocalizedLabel
              revenueLocalizedLabel
              briefDescription
            }}
            images {{
              squareLogoUrl
            }}
            links {{
              corporateWebsite
            }}
          }}
        }}
        recruit {{
          viewJobUrl
          detailedSalary
          workSchedule
        }}
      }}
    }}
  }}
}}
""".strip()
INDEED_API_HEADERS = {
  "Host": "apis.indeed.com",
  "content-type": "application/json",
  "indeed-api-key": "161092c2017b5bbab13edb12461a62d5a833871e7cad6d9d475304573de67ac8",
  "accept": "application/json",
  "indeed-locale": "en-GB",
  "accept-language": "en-GB,en;q=0.9",
  "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Indeed App 193.1",
  "indeed-app-info": "appv=193.1; appid=com.indeed.jobsearch; osv=16.6.1; os=ios; dtype=phone",
}
INDEED_COUNTRIES = {
  "UK": ("uk", "GB", "en-GB"),
  "USA": ("www", "US", "en-US"),
  "CANADA": ("ca", "CA", "en-CA"),
  "AUSTRALIA": ("au", "AU", "en-AU"),
  "IRELAND": ("ie", "IE", "en-IE"),
}


def read_keychain_secret(service_name):
  if not service_name:
    return ""
  try:
    result = subprocess.run(
      ["security", "find-generic-password", "-s", service_name, "-w"],
      check=False,
      capture_output=True,
      text=True,
    )
  except FileNotFoundError:
    return ""
  if result.returncode != 0:
    return ""
  return result.stdout.strip()


def load_local_config():
  keychain_github_token = read_keychain_secret(KEYCHAIN_SERVICE_GITHUB_TOKEN)
  keychain_adzuna_app_id = read_keychain_secret(KEYCHAIN_SERVICE_ADZUNA_APP_ID)
  keychain_adzuna_api_key = read_keychain_secret(KEYCHAIN_SERVICE_ADZUNA_API_KEY)
  keychain_reed_api_key = read_keychain_secret(KEYCHAIN_SERVICE_REED_API_KEY)
  keychain_openai_api_key = read_keychain_secret(KEYCHAIN_SERVICE_OPENAI_KEY)

  if not LOCAL_CONFIG_PATH.exists():
    return {
      "githubToken": os.environ.get("GITHUB_TOKEN", "").strip() or keychain_github_token,
      "publicCvBaseUrl": DEFAULT_PUBLIC_CV_BASE_URL,
      "openaiGenerationModel": os.environ.get("OPENAI_GENERATION_MODEL", "gpt-4.5-mini").strip() or "gpt-4.5-mini",
      # Legacy, not used by the active local-admin generation flow:
      "ollamaBaseUrl": os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434").strip(),
      "ollamaModel": os.environ.get("OLLAMA_MODEL", "llama3.2").strip(),
      "supabaseUrl": os.environ.get("SUPABASE_URL", "").strip(),
      "supabaseAnonKey": os.environ.get("SUPABASE_ANON_KEY", "").strip(),
      "supabaseServiceRoleKey": os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip(),
      "supabaseBucket": os.environ.get("SUPABASE_BUCKET", SUPABASE_DEFAULT_BUCKET).strip() or SUPABASE_DEFAULT_BUCKET,
      "adzunaAppId": os.environ.get("ADZUNA_APP_ID", "").strip() or keychain_adzuna_app_id,
      "adzunaApiKey": os.environ.get("ADZUNA_API_KEY", "").strip() or keychain_adzuna_api_key,
      "reedApiKey": os.environ.get("REED_API_KEY", "").strip() or keychain_reed_api_key,
      "openaiApiKey": os.environ.get("OPENAI_API_KEY", "").strip() or keychain_openai_api_key,
    }

  try:
    payload = json.loads(LOCAL_CONFIG_PATH.read_text(encoding="utf-8"))
  except json.JSONDecodeError as exc:
    raise RuntimeError(f"Invalid local config JSON in {LOCAL_CONFIG_PATH.name}: {exc}") from exc

  return {
    "githubToken": str(payload.get("githubToken", "")).strip() or os.environ.get("GITHUB_TOKEN", "").strip() or keychain_github_token,
    "publicCvBaseUrl": str(payload.get("cvBaseUrl", "")).strip() or DEFAULT_PUBLIC_CV_BASE_URL,
    "openaiGenerationModel": str(payload.get("openaiGenerationModel", "")).strip() or os.environ.get("OPENAI_GENERATION_MODEL", "gpt-4.5-mini").strip() or "gpt-4.5-mini",
    # Legacy, not used by the active local-admin generation flow:
    "ollamaBaseUrl": str(payload.get("ollamaBaseUrl", "")).strip() or os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434").strip(),
    "ollamaModel": str(payload.get("ollamaModel", "")).strip() or os.environ.get("OLLAMA_MODEL", "llama3.2").strip(),
    "supabaseUrl": str(payload.get("supabaseUrl", "")).strip() or os.environ.get("SUPABASE_URL", "").strip(),
    "supabaseAnonKey": str(payload.get("supabaseAnonKey", "")).strip() or os.environ.get("SUPABASE_ANON_KEY", "").strip(),
    "supabaseServiceRoleKey": str(payload.get("supabaseServiceRoleKey", "")).strip() or os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip(),
    "supabaseBucket": str(payload.get("supabaseBucket", "")).strip() or os.environ.get("SUPABASE_BUCKET", SUPABASE_DEFAULT_BUCKET).strip() or SUPABASE_DEFAULT_BUCKET,
    "adzunaAppId": str(payload.get("adzunaAppId", "")).strip() or os.environ.get("ADZUNA_APP_ID", "").strip() or keychain_adzuna_app_id,
    "adzunaApiKey": str(payload.get("adzunaApiKey", "")).strip() or os.environ.get("ADZUNA_API_KEY", "").strip() or keychain_adzuna_api_key,
    "reedApiKey": str(payload.get("reedApiKey", "")).strip() or os.environ.get("REED_API_KEY", "").strip() or keychain_reed_api_key,
    "openaiApiKey": str(payload.get("openaiApiKey", "")).strip() or os.environ.get("OPENAI_API_KEY", "").strip() or keychain_openai_api_key,
  }


def decode_jwt_payload(token):
  parts = str(token or "").split(".")
  if len(parts) < 2:
    return {}

  payload = parts[1]
  padding = "=" * ((4 - len(payload) % 4) % 4)
  try:
    raw = base64.urlsafe_b64decode((payload + padding).encode("utf-8")).decode("utf-8")
    data = json.loads(raw)
    return data if isinstance(data, dict) else {}
  except Exception:
    return {}


def derive_supabase_url(config):
  configured = str(config.get("supabaseUrl", "")).strip()
  if configured:
    return configured.rstrip("/")

  for candidate in (config.get("supabaseServiceRoleKey", ""), config.get("supabaseAnonKey", "")):
    payload = decode_jwt_payload(candidate)
    ref = str(payload.get("ref", "")).strip()
    if ref:
      return f"https://{ref}.supabase.co"

  return ""


def supabase_settings(config):
  return {
    "url": derive_supabase_url(config),
    "anonKey": str(config.get("supabaseAnonKey", "")).strip(),
    "serviceRoleKey": str(config.get("supabaseServiceRoleKey", "")).strip(),
    "bucket": str(config.get("supabaseBucket", SUPABASE_DEFAULT_BUCKET)).strip() or SUPABASE_DEFAULT_BUCKET,
  }


def has_supabase_access(config):
  settings = supabase_settings(config)
  return bool(settings["url"] and settings["serviceRoleKey"])


def supabase_headers(key, extra=None):
  headers = {
    "apikey": key,
    "Authorization": f"Bearer {key}",
    "Accept": "application/json",
  }
  if extra:
    headers.update(extra)
  return headers


def http_request_json(url, method="GET", headers=None, payload=None, timeout=20):
  request_headers = dict(headers or {})
  body = None
  if payload is not None:
    request_headers["Content-Type"] = "application/json"
    body = json.dumps(payload).encode("utf-8")

  request = Request(url, data=body, headers=request_headers, method=method)

  try:
    with urlopen(request, timeout=timeout) as response:
      raw = response.read().decode("utf-8")
      return response.getcode(), json.loads(raw) if raw else {}
  except HTTPError as exc:
    raw = exc.read().decode("utf-8")
    try:
      payload = json.loads(raw) if raw else {}
    except json.JSONDecodeError:
      payload = {"message": raw.strip()}
    return exc.code, payload
  except URLError as exc:
    raise RuntimeError(f"Could not reach {urlparse(url).netloc}: {exc.reason}") from exc


def supabase_request_json(config, path, method="GET", payload=None, extra_headers=None):
  settings = supabase_settings(config)
  if not settings["url"] or not settings["serviceRoleKey"]:
    raise RuntimeError("No Supabase service role key configured.")

  url = settings["url"].rstrip("/") + path
  headers = supabase_headers(settings["serviceRoleKey"], extra_headers)
  return http_request_json(url, method=method, headers=headers, payload=payload)


def supabase_request_raw(config, path, method="POST", body=b"", extra_headers=None):
  settings = supabase_settings(config)
  if not settings["url"] or not settings["serviceRoleKey"]:
    raise RuntimeError("No Supabase service role key configured.")

  url = settings["url"].rstrip("/") + path
  headers = supabase_headers(settings["serviceRoleKey"], extra_headers)
  request = Request(url, data=body, headers=headers, method=method)

  try:
    with urlopen(request, timeout=30) as response:
      raw = response.read().decode("utf-8")
      return response.getcode(), json.loads(raw) if raw else {}
  except HTTPError as exc:
    raw = exc.read().decode("utf-8")
    try:
      payload = json.loads(raw) if raw else {}
    except json.JSONDecodeError:
      payload = {"message": raw.strip()}
    return exc.code, payload
  except URLError as exc:
    raise RuntimeError(f"Could not reach {urlparse(url).netloc}: {exc.reason}") from exc


def supabase_public_url(config, object_path):
  settings = supabase_settings(config)
  if not settings["url"]:
    return ""
  return f"{settings['url'].rstrip('/')}/storage/v1/object/public/{quote(settings['bucket'], safe='')}/{quote(object_path, safe='/')}"


def supabase_summary_from_row(row):
  if not isinstance(row, dict):
    return None

  application = row.get("application") if isinstance(row.get("application"), dict) else {}
  summary = {
    "ref": str(row.get("ref") or application.get("ref", "")).strip(),
    "companyName": str(row.get("company_name") or application.get("companyName", "")).strip(),
    "roleTitle": str(row.get("role_title") or application.get("roleTitle", "")).strip(),
    "location": str(row.get("location") or application.get("location", "")).strip(),
    "createdAt": str(row.get("created_at") or application.get("createdAt", "")).strip(),
    "updatedAt": str(row.get("updated_at") or application.get("updatedAt", "")).strip(),
  }
  if row.get("short_code") and not application.get("shortCode"):
    summary["shortCode"] = str(row.get("short_code", "")).strip()
  elif application.get("shortCode"):
    summary["shortCode"] = str(application.get("shortCode", "")).strip()
  return summary if summary["ref"] else None


def supabase_application_from_row(row):
  if not isinstance(row, dict):
    return None

  application = row.get("application") if isinstance(row.get("application"), dict) else {}
  payload = dict(application)
  payload.setdefault("ref", str(row.get("ref", "")).strip())
  payload.setdefault("companyName", str(row.get("company_name", "")).strip())
  payload.setdefault("roleTitle", str(row.get("role_title", "")).strip())
  payload.setdefault("location", str(row.get("location", "")).strip())
  payload.setdefault("createdAt", str(row.get("created_at", "")).strip())
  payload.setdefault("updatedAt", str(row.get("updated_at", "")).strip())
  if row.get("short_code") and not payload.get("shortCode"):
    payload["shortCode"] = str(row.get("short_code", "")).strip()
  if payload.get("ref") and not payload.get("slug"):
    payload["slug"] = payload["ref"]
  return payload if payload.get("ref") else None


def read_json(path, default):
  if not path.exists():
    return default

  try:
    return json.loads(path.read_text(encoding="utf-8"))
  except json.JSONDecodeError:
    return default


def write_json(path, payload):
  path.parent.mkdir(parents=True, exist_ok=True)
  path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def safe_filename(value):
  text = str(value or "").strip().lower()
  if not text:
    return "unknown"

  text = re.sub(r"[^a-z0-9]+", "-", text)
  text = text.strip("-")
  return text[:80] or "unknown"


def html_to_text(value):
  text = re.sub(r"<br\s*/?>", "\n", str(value or ""), flags=re.IGNORECASE)
  text = re.sub(r"</p\s*>", "\n\n", text, flags=re.IGNORECASE)
  text = re.sub(r"<[^>]+>", " ", text)
  text = html.unescape(text)
  text = re.sub(r"\r\n?", "\n", text)
  text = re.sub(r"[ \t]+", " ", text)
  text = re.sub(r"\n{3,}", "\n\n", text)
  return text.strip()


def compact_currency(currency_code):
  code = str(currency_code or "").strip().upper()
  return {
    "GBP": "GBP ",
    "USD": "$",
    "CAD": "CAD ",
    "AUD": "AUD ",
    "EUR": "EUR ",
  }.get(code, (code + " ") if code else "")


def call_openai_chat(api_key, prompt, model="gpt-4.5-mini"):
  """Call OpenAI chat completions and return parsed JSON response."""
  body = json.dumps({
    "model": model,
    "messages": [{"role": "user", "content": prompt}],
    "temperature": 0.3,
    "max_tokens": 1500,
  }).encode("utf-8")

  req = Request(
    "https://api.openai.com/v1/chat/completions",
    data=body,
    headers={
      "Content-Type": "application/json",
      "Authorization": f"Bearer {api_key}",
    },
    method="POST",
  )

  try:
    with urlopen(req, timeout=60) as resp:
      data = json.loads(resp.read().decode("utf-8"))
  except HTTPError as exc:
    error_body = exc.read().decode("utf-8", errors="replace") if exc.fp else ""
    raise RuntimeError(f"OpenAI API returned {exc.code}: {error_body}") from exc
  except URLError as exc:
    raise RuntimeError(f"OpenAI connection error: {exc.reason}") from exc

  content = (data.get("choices") or [{}])[0].get("message", {}).get("content", "")
  content = content.strip()
  if content.startswith("```"):
    content = re.sub(r"^```(?:json)?\s*", "", content)
    content = re.sub(r"\s*```$", "", content)

  try:
    return json.loads(content)
  except json.JSONDecodeError:
    return {
      "strengths": [],
      "weaknesses": [],
      "dealbreakers": [],
      "summary": content,
    }


# ---------------------------------------------------------------------------
# GraphHopper helpers — geocode a location string then compute driving time
# ---------------------------------------------------------------------------

def graphhopper_geocode(location_text):
  """Return (lat, lon) for a location string, or None on failure."""
  if not location_text or not location_text.strip():
    return None
  qs = urlencode({"q": location_text, "locale": "en", "limit": "1", "key": GRAPHHOPPER_API_KEY})
  url = f"https://graphhopper.com/api/1/geocode?{qs}"
  req = Request(url, method="GET")
  try:
    with urlopen(req, timeout=10) as resp:
      data = json.loads(resp.read().decode("utf-8"))
    hits = data.get("hits") or []
    if not hits:
      return None
    return (hits[0]["point"]["lat"], hits[0]["point"]["lng"])
  except Exception:
    return None


def graphhopper_driving_time(dest_lat, dest_lon):
  """Return driving info dict {minutes, distance_miles, text} from home to dest, or None."""
  qs = urlencode({
    "point": [f"{GRAPHHOPPER_HOME_LAT},{GRAPHHOPPER_HOME_LON}", f"{dest_lat},{dest_lon}"],
    "vehicle": "car",
    "locale": "en",
    "calc_points": "false",
    "key": GRAPHHOPPER_API_KEY,
  }, doseq=True)
  url = f"https://graphhopper.com/api/1/route?{qs}"
  req = Request(url, method="GET")
  try:
    with urlopen(req, timeout=10) as resp:
      data = json.loads(resp.read().decode("utf-8"))
    paths = data.get("paths") or []
    if not paths:
      return None
    time_ms = paths[0].get("time", 0)
    distance_m = paths[0].get("distance", 0)
    minutes = round(time_ms / 60000)
    miles = round(distance_m / 1609.344, 1)
    hours = minutes // 60
    mins = minutes % 60
    text = f"{hours}h {mins}m" if hours else f"{mins} min"
    return {"minutes": minutes, "distance_miles": miles, "text": f"{text} ({miles} mi)"}
  except Exception:
    return None


def get_driving_time_for_location(location_text):
  """Geocode a job location and return driving info dict, or None."""
  coords = graphhopper_geocode(location_text)
  if not coords:
    return None
  return graphhopper_driving_time(coords[0], coords[1])


def salary_range_summary(min_amount=None, max_amount=None, currency_code="", interval=""):
  if min_amount in ("", None) and max_amount in ("", None):
    return ""
  prefix = compact_currency(currency_code)
  interval_text = f" / {interval}" if interval else ""
  if min_amount not in ("", None) and max_amount not in ("", None):
    return f"{prefix}{int(float(min_amount)):,} - {prefix}{int(float(max_amount)):,}{interval_text}".strip()
  amount = min_amount if min_amount not in ("", None) else max_amount
  return f"{prefix}{int(float(amount)):,}{interval_text}".strip()


def basic_auth_header(username, password=""):
  token = base64.b64encode(f"{username}:{password}".encode("utf-8")).decode("ascii")
  return f"Basic {token}"


def build_reed_search_url(keywords="", location="", distance=25):
  params = {}
  if keywords:
    params["keywords"] = keywords
  if location:
    params["location"] = location
  if distance:
    params["distancefromlocation"] = int(distance)
  query = urlencode(params)
  return f"https://www.reed.co.uk/jobs?{query}" if query else "https://www.reed.co.uk/jobs"


def fetch_reed_jobs(api_key, keywords="", location="", distance=25, results_to_take=50, results_to_skip=0):
  fallback_url = build_reed_search_url(keywords=keywords, location=location, distance=distance)
  if not api_key:
    return {
      "jobs": [],
      "count": 0,
      "totalResults": 0,
      "source": "Reed website fallback",
      "fallbackUrl": fallback_url,
      "requiresApiKey": True,
      "unavailableReason": "No Reed API key configured locally.",
      "docs": "https://www.reed.co.uk/developers/jobseeker",
    }

  params = {
    "keywords": keywords,
    "locationName": location,
    "distanceFromLocation": max(1, int(distance or 25)),
    "resultsToTake": max(1, min(int(results_to_take or 50), 100)),
    "resultsToSkip": max(0, int(results_to_skip or 0)),
  }
  query = urlencode({key: value for key, value in params.items() if value not in ("", None)})
  status, payload = http_request_json(
    f"https://www.reed.co.uk/api/1.0/search?{query}",
    headers={
      "Authorization": basic_auth_header(api_key),
      "Accept": "application/json",
      "User-Agent": "BenHowardCV-LocalServer",
    },
    timeout=20,
  )
  if status < 200 or status >= 300:
    raise RuntimeError((payload.get("message") or payload.get("error") or f"Reed API returned {status}"))

  jobs = []
  for job in payload.get("results") or []:
    jobs.append({
      "jobId": job.get("jobId"),
      "title": job.get("jobTitle") or "",
      "employer": job.get("employerName") or "",
      "location": job.get("locationName") or "",
      "salary": salary_range_summary(
        job.get("minimumSalary"),
        job.get("maximumSalary"),
        job.get("currency") or "GBP",
        job.get("salaryType") or "",
      ),
      "description": html_to_text(job.get("jobDescription") or ""),
      "url": job.get("jobUrl") or "",
      "externalUrl": job.get("externalUrl") or "",
      "postDate": job.get("date") or "",
      "expirationDate": job.get("expirationDate") or "",
      "applications": job.get("applications"),
      "minimumSalary": job.get("minimumSalary"),
      "maximumSalary": job.get("maximumSalary"),
      "salaryType": job.get("salaryType") or "",
      "currency": job.get("currency") or "GBP",
      "type": job.get("jobType") or "",
    })

  return {
    "jobs": jobs,
    "count": len(jobs),
    "totalResults": payload.get("totalResults", len(jobs)),
    "source": "Reed Jobseeker API",
    "docs": "https://www.reed.co.uk/developers/jobseeker",
    "fallbackUrl": fallback_url,
    "requiresApiKey": False,
  }


def fetch_adzuna_jobs(app_id, api_key, what="", where="", distance=50, max_days_old=14, sort_by="date", page=1, results_per_page=50, country="gb"):
  if not app_id or not api_key:
    raise RuntimeError("Adzuna credentials are not configured locally.")

  page_number = max(1, int(page or 1))
  params = {
    "app_id": app_id,
    "app_key": api_key,
    "what": what,
    "where": where,
    "distance": max(1, int(distance or 50)),
    "max_days_old": max(1, int(max_days_old or 14)),
    "sort_by": sort_by or "date",
    "results_per_page": max(1, min(int(results_per_page or 50), 50)),
    "content-type": "application/json",
  }
  query = urlencode({key: value for key, value in params.items() if value not in ("", None)})
  url = f"https://api.adzuna.com/v1/api/jobs/{str(country or 'gb').lower()}/search/{page_number}?{query}"
  status, payload = http_request_json(url, timeout=20)
  if status < 200 or status >= 300:
    raise RuntimeError(payload.get("message") or payload.get("error") or f"Adzuna API returned {status}")

  jobs = []
  for job in payload.get("results") or []:
    location = (job.get("location") or {})
    category = (job.get("category") or {})
    company = (job.get("company") or {})
    jobs.append({
      "id": job.get("id"),
      "title": job.get("title") or "",
      "company": company.get("display_name") or "",
      "location": location.get("display_name") or "",
      "salary": salary_range_summary(job.get("salary_min"), job.get("salary_max"), "GBP"),
      "description": job.get("description") or "",
      "url": job.get("redirect_url") or "",
      "created": job.get("created") or "",
      "category": category.get("label") or "",
      "contractType": job.get("contract_type") or "",
      "contractTime": job.get("contract_time") or "",
      "salaryMin": job.get("salary_min"),
      "salaryMax": job.get("salary_max"),
    })

  return {
    "jobs": jobs,
    "count": len(jobs),
    "totalResults": payload.get("count", len(jobs)),
    "source": "Adzuna API",
    "docs": "https://developer.adzuna.com/docs/search",
    "country": str(country or "gb").upper(),
  }


def indeed_country_meta(country_name):
  key = str(country_name or "UK").strip().upper()
  if key not in INDEED_COUNTRIES:
    raise ValueError(f"Unsupported Indeed country: {country_name}")
  subdomain, api_country, locale = INDEED_COUNTRIES[key]
  return {
    "label": key,
    "subdomain": subdomain,
    "apiCountry": api_country,
    "locale": locale,
  }


def indeed_compensation_summary(compensation):
  if not isinstance(compensation, dict):
    return ""
  source = compensation.get("baseSalary") or ((compensation.get("estimated") or {}).get("baseSalary"))
  if not isinstance(source, dict):
    return ""
  unit = str(source.get("unitOfWork") or "").upper()
  interval_map = {
    "YEAR": "year",
    "MONTH": "month",
    "WEEK": "week",
    "DAY": "day",
    "HOUR": "hour",
  }
  interval = interval_map.get(unit, unit.lower())
  salary_range = source.get("range") if isinstance(source.get("range"), dict) else {}
  min_amount = salary_range.get("min")
  max_amount = salary_range.get("max")
  currency = compensation.get("currencyCode") or ((compensation.get("estimated") or {}).get("currencyCode")) or ""
  currency_symbol = {"USD": "$", "GBP": "GBP ", "CAD": "CAD ", "AUD": "AUD ", "EUR": "EUR "}.get(currency, (currency + " ") if currency else "")
  if min_amount is None and max_amount is None:
    return ""
  if min_amount is not None and max_amount is not None:
    return f"{currency_symbol}{int(min_amount):,} - {currency_symbol}{int(max_amount):,} / {interval}".strip()
  amount = min_amount if min_amount is not None else max_amount
  return f"{currency_symbol}{int(amount):,} / {interval}".strip()


def indeed_compensation_details(compensation):
  if not isinstance(compensation, dict):
    return {"min": None, "max": None, "currency": "", "interval": ""}
  source = compensation.get("baseSalary") or ((compensation.get("estimated") or {}).get("baseSalary"))
  if not isinstance(source, dict):
    return {"min": None, "max": None, "currency": "", "interval": ""}
  unit = str(source.get("unitOfWork") or "").upper()
  interval_map = {
    "YEAR": "year",
    "MONTH": "month",
    "WEEK": "week",
    "DAY": "day",
    "HOUR": "hour",
  }
  salary_range = source.get("range") if isinstance(source.get("range"), dict) else {}
  return {
    "min": salary_range.get("min"),
    "max": salary_range.get("max"),
    "currency": compensation.get("currencyCode") or ((compensation.get("estimated") or {}).get("currencyCode")) or "",
    "interval": interval_map.get(unit, unit.lower()),
  }


def indeed_job_types(attributes):
  labels = []
  seen = set()
  for attribute in attributes or []:
    label = str((attribute or {}).get("label", "")).strip()
    normalized = label.lower()
    if not label or normalized in seen:
      continue
    seen.add(normalized)
    if any(token in normalized for token in ("full-time", "full time", "part-time", "part time", "contract", "intern", "temporary")):
      labels.append(label)
  return labels


def indeed_is_remote(job):
  description = html_to_text(((job.get("description") or {}).get("html")) if isinstance(job, dict) else "")
  location_long = ((((job.get("location") or {}).get("formatted")) or {}).get("long")) if isinstance(job, dict) else ""
  haystacks = [description.lower(), str(location_long or "").lower()]
  for attribute in (job.get("attributes") or []) if isinstance(job, dict) else []:
    haystacks.append(str((attribute or {}).get("label", "")).lower())
  return any("remote" in value or "work from home" in value or "wfh" in value for value in haystacks)


def build_indeed_filters(hours_old=None, is_remote=False, job_type=""):
  job_type = str(job_type or "").strip().lower()
  if hours_old and (is_remote or job_type):
    raise ValueError("Indeed supports either posted-within filtering or remote/job type filtering, not both together.")
  if hours_old:
    return f"""
    filters: {{
      date: {{
        field: "dateOnIndeed",
        start: "{int(hours_old)}h"
      }}
    }}
    """.strip()
  keys = []
  job_type_map = {
    "fulltime": "CF3CP",
    "parttime": "75GKK",
    "contract": "NJXCK",
    "internship": "VDTG7",
  }
  if job_type:
    if job_type not in job_type_map:
      raise ValueError(f"Unsupported Indeed job type: {job_type}")
    keys.append(job_type_map[job_type])
  if is_remote:
    keys.append("DSQF7")
  if not keys:
    return ""
  joined = '", "'.join(keys)
  return f"""
  filters: {{
    composite: {{
      filters: [{{
        keyword: {{
          field: "attributes",
          keys: ["{joined}"]
        }}
      }}]
    }}
  }}
  """.strip()


def build_indeed_search_query(search_term="", location="", distance=25, limit=20, cursor=None, hours_old=None, is_remote=False, job_type=""):
  safe_term = str(search_term or "").replace("\\", "\\\\").replace('"', '\\"').strip()
  safe_location = str(location or "").replace("\\", "\\\\").replace('"', '\\"').strip()
  return INDEED_SEARCH_QUERY_TEMPLATE.format(
    what=f'what: "{safe_term}"' if safe_term else "",
    location=(f'location: {{where: "{safe_location}", radius: {int(distance)}, radiusUnit: MILES}}' if safe_location else ""),
    limit=max(1, min(int(limit), 100)),
    cursor=(f'cursor: "{cursor}"' if cursor else ""),
    filters=build_indeed_filters(hours_old=hours_old, is_remote=is_remote, job_type=job_type),
  )


def fetch_indeed_jobs(search_term="", location="", distance=25, results_wanted=20, country="UK", hours_old=None, is_remote=False, job_type=""):
  country_meta = indeed_country_meta(country)
  headers = dict(INDEED_API_HEADERS)
  headers["indeed-co"] = country_meta["apiCountry"]
  headers["indeed-locale"] = country_meta["locale"]
  headers["accept-language"] = f"{country_meta['locale']},en;q=0.9"
  base_url = f"https://{country_meta['subdomain']}.indeed.com"

  jobs = []
  seen = set()
  cursor = None
  while len(jobs) < results_wanted:
    query = build_indeed_search_query(
      search_term=search_term,
      location=location,
      distance=distance,
      limit=min(100, max(1, results_wanted)),
      cursor=cursor,
      hours_old=hours_old,
      is_remote=is_remote,
      job_type=job_type,
    )
    status, payload = http_request_json(
      "https://apis.indeed.com/graphql",
      method="POST",
      headers=headers,
      payload={"query": query},
      timeout=20,
    )
    if status < 200 or status >= 300:
      raise RuntimeError(f"Indeed API returned {status}")
    page_info = (((payload.get("data") or {}).get("jobSearch")) or {}).get("pageInfo") or {}
    results = (((payload.get("data") or {}).get("jobSearch")) or {}).get("results") or []
    if not isinstance(results, list) or not results:
      break
    cursor = page_info.get("nextCursor")
    for item in results:
      job = (item or {}).get("job") or {}
      job_key = str(job.get("key") or "").strip()
      if not job_key:
        continue
      job_url = f"{base_url}/viewjob?jk={job_key}"
      if job_url in seen:
        continue
      seen.add(job_url)
      location_data = job.get("location") or {}
      formatted = location_data.get("formatted") or {}
      description_html = ((job.get("description") or {}).get("html")) or ""
      compensation = indeed_compensation_details(job.get("compensation") or {})
      jobs.append({
        "id": f"in-{job_key}",
        "title": job.get("title") or "",
        "company": ((job.get("employer") or {}).get("name")) or "",
        "location": formatted.get("long") or formatted.get("short") or ", ".join([part for part in [location_data.get("city"), location_data.get("admin1Code"), location_data.get("countryCode")] if part]),
        "date_posted": datetime.fromtimestamp((job.get("datePublished") or 0) / 1000).strftime("%Y-%m-%d") if job.get("datePublished") else "",
        "salary": indeed_compensation_summary(job.get("compensation") or {}),
        "salary_min": compensation["min"],
        "salary_max": compensation["max"],
        "salary_currency": compensation["currency"],
        "salary_interval": compensation["interval"],
        "job_url": job_url,
        "job_url_direct": ((job.get("recruit") or {}).get("viewJobUrl")) or "",
        "description": html_to_text(description_html),
        "description_html": description_html,
        "remote": indeed_is_remote(job),
        "job_type": indeed_job_types(job.get("attributes") or []),
        "company_industry": ((((job.get("employer") or {}).get("dossier")) or {}).get("employerDetails") or {}).get("industry") or "",
        "attributes": job.get("attributes") or [],
      })
      if len(jobs) >= results_wanted:
        break
    if not cursor:
      break
  return {
    "jobs": jobs,
    "count": len(jobs),
    "source": "JobSpy-inspired Indeed GraphQL integration",
    "repo": "https://github.com/speedyapply/JobSpy",
    "country": country_meta["label"],
  }


def job_search_default_preferences():
  return {
    "profileName": "Ben Howard",
    "homeLocation": {
      "label": "Leek, Staffordshire",
      "postcode": "ST13 5QR",
      "radiusMiles": 50,
      "priorityLocationTerms": [
        "leek",
        "st13",
        "staffordshire",
        "stoke",
        "newcastle-under-lyme",
        "ashbourne",
        "buxton",
        "uttoxeter",
        "congleton",
        "macclesfield",
      ],
    },
    "searchDefaults": {
      "keywords": "practice manager OR operations manager OR operations director OR transformation manager OR service improvement manager OR continuous improvement manager OR digital transformation manager OR systems improvement manager OR power bi",
      "location": "Leek, Staffordshire",
      "radiusMiles": 50,
      "postedWithinDays": 30,
      "minimumSalaryAnnual": 30000,
      "perSourceLimit": 25,
      "sortBy": "best_fit",
      "remoteOnly": False,
      "hideLowFit": True,
      "showUnknownSalary": True,
    },
    "sources": {
      "indeed": True,
      "reed": True,
      "nhs": True,
      "adzuna": True,
    },
    "priorityRules": [
      {
        "label": "GP Practice Leadership",
        "weight": 90,
        "keywords": [
          "practice manager",
          "gp practice",
          "gp surgery",
          "medical practice",
          "primary care",
          "practice operations",
          "patient services manager",
        ],
      },
      {
        "label": "Operations / Transformation Leadership",
        "weight": 60,
        "keywords": [
          "operations manager",
          "operations director",
          "director of operations",
          "associate director of operations",
          "transformation manager",
          "service improvement manager",
          "continuous improvement manager",
          "operational excellence",
        ],
      },
      {
        "label": "Digital / Systems Improvement",
        "weight": 42,
        "keywords": [
          "digital transformation",
          "systems improvement",
          "process improvement",
          "power bi",
          "workflow",
          "emis",
          "accurx",
          "service redesign",
        ],
      },
    ],
    "cvKeywords": [
      "nhs primary care",
      "operations",
      "transformation",
      "continuous improvement",
      "service redesign",
      "kpi reporting",
      "financial control",
      "workforce planning",
      "patient access",
      "power bi",
      "emis",
      "accurx",
      "manufacturing operations",
    ],
    "excludeKeywords": [
      "healthcare assistant",
      "staff nurse",
      "registered nurse",
      "clinical fellow",
      "consultant",
      "occupational therapist",
      "physiotherapist",
      "radiographer",
      "pharmacist",
      "dentist",
      "doctor",
      "gp partner",
      "care assistant",
      "support worker",
      "midwife",
    ],
  }


def deep_merge_dicts(base, override):
  result = dict(base)
  for key, value in (override or {}).items():
    if isinstance(value, dict) and isinstance(result.get(key), dict):
      result[key] = deep_merge_dicts(result[key], value)
    else:
      result[key] = value
  return result


def load_job_search_preferences():
  defaults = job_search_default_preferences()
  stored = read_json(JOB_SEARCH_PREFERENCES_PATH, {})
  if not isinstance(stored, dict):
    return defaults
  return deep_merge_dicts(defaults, stored)


def extract_list_section(html_source, heading):
  match = re.search(rf"<h2>{re.escape(heading)}</h2>(.*?)</section>", html_source, re.IGNORECASE | re.DOTALL)
  if not match:
    return []
  return [html_to_text(item).strip() for item in re.findall(r"<li>(.*?)</li>", match.group(1), re.IGNORECASE | re.DOTALL) if html_to_text(item).strip()]


def extract_cv_profile():
  if not CV_HTML_PATH.exists():
    return {
      "summary": "",
      "roleTitles": [],
      "skills": [],
      "sectors": [],
      "leadershipThemes": [],
    }

  html_source = CV_HTML_PATH.read_text(encoding="utf-8")
  summary_match = re.search(r'class="summary-copy">(.*?)</p>', html_source, re.IGNORECASE | re.DOTALL)
  role_titles = [html_to_text(item).strip() for item in re.findall(r'class="role-name">(.*?)</h2>', html_source, re.IGNORECASE | re.DOTALL)]
  return {
    "summary": html_to_text(summary_match.group(1) if summary_match else ""),
    "roleTitles": role_titles,
    "skills": extract_list_section(html_source, "Core Skills"),
    "sectors": extract_list_section(html_source, "Sector Experience"),
    "leadershipThemes": extract_list_section(html_source, "Leadership Themes"),
  }


def parse_flexible_date(value):
  text = str(value or "").strip()
  if not text:
    return None
  for fmt in ("%Y-%m-%d", "%Y-%m-%dT%H:%M:%S.%f", "%Y-%m-%dT%H:%M:%S", "%d/%m/%Y"):
    try:
      return datetime.strptime(text[:26], fmt)
    except ValueError:
      continue
  try:
    return datetime.fromisoformat(text.replace("Z", "+00:00"))
  except ValueError:
    return None


def datetime_to_timestamp(value):
  parsed = parse_flexible_date(value)
  return parsed.timestamp() if parsed else 0


def normalise_token(value):
  return re.sub(r"[^a-z0-9]+", "", str(value or "").lower())


def normalise_phrase(value):
  return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", str(value or "").lower())).strip()


def annualise_salary_bounds(min_amount, max_amount, interval):
  if min_amount in ("", None) and max_amount in ("", None):
    return None, None
  factor = {
    "year": 1,
    "annum": 1,
    "month": 12,
    "week": 52,
    "day": 260,
    "hour": 1950,
  }.get(str(interval or "year").strip().lower(), 1)
  min_value = float(min_amount) * factor if min_amount not in ("", None) else None
  max_value = float(max_amount) * factor if max_amount not in ("", None) else None
  return min_value, max_value


def salary_bounds_from_text(text):
  raw = str(text or "").strip()
  if not raw:
    return None, None
  lowered = raw.lower()
  if "negotiable" in lowered:
    return None, None
  matches = re.findall(r"(\d[\d,]*(?:\.\d+)?)", raw)
  if not matches:
    return None, None
  values = [float(item.replace(",", "")) for item in matches]
  interval = "year"
  if "hour" in lowered:
    interval = "hour"
  elif "day" in lowered:
    interval = "day"
  elif "week" in lowered:
    interval = "week"
  elif "month" in lowered:
    interval = "month"
  min_value = values[0]
  max_value = values[1] if len(values) > 1 else values[0]
  return annualise_salary_bounds(min_value, max_value, interval)


def remote_state_from_text(*parts):
  haystack = " ".join(str(part or "") for part in parts).lower()
  is_hybrid = "hybrid" in haystack
  is_remote = any(token in haystack for token in ("remote", "work from home", "wfh"))
  return is_remote, is_hybrid


def employer_type(company, title, description):
  haystack = " ".join([str(company or ""), str(title or ""), str(description or "")]).lower()
  company_text = str(company or "").lower()
  if any(token in haystack for token in ("gp practice", "gp surgery", "medical centre", "medical center", "doctor surgery")):
    return "GP Practice"
  if "primary care" in haystack:
    return "Primary Care"
  if "nhs england" in company_text:
    return "NHS England"
  if "nhs" in company_text and "trust" in company_text:
    return "NHS Trust"
  if "nhs" in company_text or ("nhs" in haystack and any(token in haystack for token in ("foundation trust", "nhs trust", "hospital", "integrated care board"))):
    return "NHS"
  if "hospice" in haystack:
    return "Hospice"
  return ""


def extract_nhs_band(*parts):
  haystack = " ".join(str(part or "") for part in parts)
  match = re.search(r"\bband\s*([1-9][a-z]?)\b", haystack, re.IGNORECASE)
  return f"Band {match.group(1).upper()}" if match else ""


def location_fit_score(location, preferences, is_remote=False, is_hybrid=False):
  if is_remote:
    return 72
  location_text = normalise_phrase(location)
  terms = ((preferences.get("homeLocation") or {}).get("priorityLocationTerms") or [])
  score = 0
  for index, term in enumerate(terms):
    if term in location_text:
      score = max(score, max(20, 100 - index * 8))
  if "west midlands" in location_text:
    score = max(score, 25)
  if is_hybrid:
    score = max(score, 50)
  return score


def source_badge_label(source_key):
  return {
    "indeed": "Indeed",
    "reed": "Reed",
    "nhs": "NHS Jobs",
    "adzuna": "Adzuna",
  }.get(source_key, source_key.title())


def normalise_search_job(job, source_key):
  title = str(job.get("title") or "").strip()
  company = str(job.get("company") or job.get("employer") or "").strip()
  description = str(job.get("description") or "").strip()
  salary_text = str(job.get("salary") or "").strip()
  location = str(job.get("location") or "").strip()
  is_remote, is_hybrid = remote_state_from_text(title, company, location, description, job.get("type"), job.get("category"))
  if source_key == "indeed":
    is_remote = bool(job.get("remote")) or is_remote

  if source_key == "reed":
    salary_min_annual, salary_max_annual = annualise_salary_bounds(job.get("minimumSalary"), job.get("maximumSalary"), job.get("salaryType") or "year")
  elif source_key == "adzuna":
    salary_min_annual, salary_max_annual = annualise_salary_bounds(job.get("salaryMin"), job.get("salaryMax"), "year")
  elif source_key == "indeed":
    salary_min_annual, salary_max_annual = annualise_salary_bounds(job.get("salary_min"), job.get("salary_max"), job.get("salary_interval") or "year")
  else:
    salary_min_annual, salary_max_annual = salary_bounds_from_text(salary_text)

  employer_kind = employer_type(company, title, description)
  band = extract_nhs_band(title, description, salary_text)
  return {
    "dedupeKey": f"{normalise_token(title)}|{normalise_token(company)}",
    "sourceKey": source_key,
    "sourceLabel": source_badge_label(source_key),
    "sourceKeys": [source_key],
    "sourceLabels": [source_badge_label(source_key)],
    "sourceCount": 1,
    "title": title,
    "company": company,
    "location": location,
    "salaryText": salary_text,
    "salaryMinAnnual": salary_min_annual,
    "salaryMaxAnnual": salary_max_annual,
    "salaryKnown": salary_min_annual is not None or salary_max_annual is not None,
    "url": str(job.get("job_url") or job.get("url") or "").strip(),
    "applyUrl": str(job.get("job_url_direct") or job.get("externalUrl") or "").strip(),
    "description": description,
    "postedAt": str(job.get("date_posted") or job.get("postDate") or job.get("created") or "").strip(),
    "closingAt": str(job.get("expirationDate") or job.get("closeDate") or "").strip(),
    "employmentType": str(job.get("type") or job.get("contractTime") or "").strip(),
    "contractType": str(job.get("contractType") or "").strip(),
    "category": str(job.get("category") or job.get("company_industry") or "").strip(),
    "employerType": employer_kind,
    "nhsBand": band,
    "isRemote": is_remote,
    "isHybrid": is_hybrid,
  }


def merge_duplicate_jobs(jobs):
  merged = {}
  duplicates_removed = 0
  for job in jobs:
    existing = merged.get(job["dedupeKey"])
    if not existing:
      merged[job["dedupeKey"]] = dict(job)
      continue
    duplicates_removed += 1
    existing["sourceKeys"] = sorted(set(existing["sourceKeys"] + job["sourceKeys"]))
    existing["sourceLabels"] = [source_badge_label(item) for item in existing["sourceKeys"]]
    existing["sourceCount"] = len(existing["sourceKeys"])
    for field in ("salaryText", "url", "applyUrl", "employmentType", "contractType", "category", "nhsBand", "employerType", "location", "closingAt"):
      if not existing.get(field) and job.get(field):
        existing[field] = job[field]
    if len(job.get("description") or "") > len(existing.get("description") or ""):
      existing["description"] = job.get("description") or ""
    if datetime_to_timestamp(job.get("postedAt")) > datetime_to_timestamp(existing.get("postedAt")):
      existing["postedAt"] = job.get("postedAt") or existing.get("postedAt")
    existing["isRemote"] = existing.get("isRemote") or job.get("isRemote")
    existing["isHybrid"] = existing.get("isHybrid") or job.get("isHybrid")
    existing["salaryMinAnnual"] = existing.get("salaryMinAnnual") if existing.get("salaryMinAnnual") is not None else job.get("salaryMinAnnual")
    existing["salaryMaxAnnual"] = existing.get("salaryMaxAnnual") if existing.get("salaryMaxAnnual") is not None else job.get("salaryMaxAnnual")
    existing["salaryKnown"] = existing.get("salaryKnown") or job.get("salaryKnown")
  return list(merged.values()), duplicates_removed


def match_rule(haystack, title_text, rule):
  keywords = [normalise_phrase(item) for item in rule.get("keywords") or [] if str(item).strip()]
  title_hits = [keyword for keyword in keywords if keyword and keyword in title_text]
  body_hits = [keyword for keyword in keywords if keyword and keyword in haystack and keyword not in title_hits]
  if title_hits:
    return rule.get("weight", 0), rule.get("label", ""), title_hits[:2]
  if body_hits:
    return int(rule.get("weight", 0) * 0.65), rule.get("label", ""), body_hits[:2]
  return 0, "", []


def score_job(job, preferences, cv_profile):
  title_text = normalise_phrase(job.get("title"))
  haystack = normalise_phrase(" ".join([
    job.get("title", ""),
    job.get("company", ""),
    job.get("location", ""),
    job.get("description", ""),
    job.get("employmentType", ""),
    job.get("contractType", ""),
    job.get("category", ""),
    job.get("employerType", ""),
  ]))
  score = 0
  reasons = []

  gp_context = any(term in haystack for term in ("gp practice", "gp surgery", "primary care", "medical practice", "medical centre", "medical center"))
  if (("practice manager" in title_text or "patient services manager" in title_text) and ("best practice manager" not in title_text or gp_context)) or (gp_context and any(term in title_text for term in ("manager", "operations", "patient services"))):
    score += 90
    reasons.append("GP Practice Leadership")

  for rule in preferences.get("priorityRules") or []:
    if rule.get("label") == "GP Practice Leadership":
      continue
    rule_score, label, hits = match_rule(haystack, title_text, rule)
    if rule_score:
      score += rule_score
      reasons.append(label if not hits else f"{label}: {', '.join(hits)}")

  if job.get("employerType") in {"GP Practice", "Primary Care"}:
    score += 20
    reasons.append(job["employerType"])
  elif job.get("employerType") in {"NHS Trust", "NHS England", "NHS"}:
    score += 12
    reasons.append(job["employerType"])

  for keyword in preferences.get("cvKeywords") or []:
    normalized = normalise_phrase(keyword)
    if normalized and normalized in haystack:
      score += 4

  for title in cv_profile.get("roleTitles") or []:
    title_words = [word for word in normalise_phrase(title).split(" ") if len(word) > 4]
    overlap = sum(1 for word in title_words if word in haystack)
    if overlap >= 2:
      score += 6

  salary_floor = ((preferences.get("searchDefaults") or {}).get("minimumSalaryAnnual") or 0)
  salary_max = job.get("salaryMaxAnnual") or job.get("salaryMinAnnual")
  if salary_max is not None and salary_floor:
    if salary_max >= salary_floor:
      score += min(12, int((salary_max - salary_floor) / 10000) + 4)
      reasons.append("Salary clears floor")
    else:
      score -= 45
      reasons.append("Salary below floor")
  elif salary_floor:
    reasons.append("Salary not stated")

  if job.get("isRemote"):
    score += 4
  if job.get("isHybrid"):
    score += 3

  location_score = location_fit_score(job.get("location", ""), preferences, is_remote=job.get("isRemote"), is_hybrid=job.get("isHybrid"))
  score += int(location_score / 8)

  exclude_hits = [term for term in (preferences.get("excludeKeywords") or []) if normalise_phrase(term) in haystack]
  management_present = any(term in haystack for term in ("manager", "director", "lead", "head of"))
  if exclude_hits and not management_present:
    score -= 80
    reasons.append("Role appears clinically focused")

  score = max(0, min(100, score))
  if score >= 80:
    tier = "Top Match"
  elif score >= 60:
    tier = "Strong Match"
  elif score >= 40:
    tier = "Worth Reviewing"
  else:
    tier = "Low Match"

  tags = [{"label": tier, "tone": "brand" if score >= 80 else ("accent" if score >= 60 else "neutral")}]
  if job.get("employerType"):
    tags.append({"label": job["employerType"], "tone": "neutral"})
  if job.get("nhsBand"):
    tags.append({"label": job["nhsBand"], "tone": "neutral"})
  if job.get("isRemote"):
    tags.append({"label": "Remote", "tone": "brand"})
  elif job.get("isHybrid"):
    tags.append({"label": "Hybrid", "tone": "brand"})
  if salary_max is not None:
    if salary_max >= 50000:
      tags.append({"label": "£50k+", "tone": "accent"})
    elif salary_max >= salary_floor and salary_floor:
      tags.append({"label": "£30k+", "tone": "accent"})
  if job.get("sourceCount", 1) > 1:
    tags.append({"label": f"{job['sourceCount']} sources", "tone": "neutral"})

  job["locationScore"] = location_score
  job["matchScore"] = score
  job["matchTier"] = tier
  job["matchReasons"] = reasons[:4]
  job["tags"] = tags
  return job


def sort_search_jobs(jobs, sort_by):
  if sort_by == "salary_desc":
    return sorted(jobs, key=lambda job: (job.get("salaryMaxAnnual") or job.get("salaryMinAnnual") or -1, job.get("matchScore", 0), datetime_to_timestamp(job.get("postedAt"))), reverse=True)
  if sort_by == "newest":
    return sorted(jobs, key=lambda job: (datetime_to_timestamp(job.get("postedAt")), job.get("matchScore", 0)), reverse=True)
  if sort_by == "closest":
    return sorted(jobs, key=lambda job: (job.get("locationScore", 0), job.get("matchScore", 0), datetime_to_timestamp(job.get("postedAt"))), reverse=True)
  return sorted(jobs, key=lambda job: (job.get("matchScore", 0), job.get("salaryMaxAnnual") or job.get("salaryMinAnnual") or -1, datetime_to_timestamp(job.get("postedAt"))), reverse=True)


def filter_ranked_jobs(jobs, preferences, remote_only=False, min_salary=None, sources=None, hide_low_fit=False, show_unknown_salary=True):
  source_set = set(sources or [])
  filtered = []
  for job in jobs:
    if source_set and not any(source in source_set for source in job.get("sourceKeys", [])):
      continue
    if remote_only and not (job.get("isRemote") or job.get("isHybrid")):
      continue
    if hide_low_fit and job.get("matchScore", 0) < 40:
      continue
    if min_salary:
      salary_max = job.get("salaryMaxAnnual") or job.get("salaryMinAnnual")
      if salary_max is None and not show_unknown_salary:
        continue
      if salary_max is not None and salary_max < min_salary:
        continue
    filtered.append(job)
  return filtered


def fetch_nhs_jobs(config, keyword="", location="", distance=50, limit=25, page=1, sort="publicationDateDesc"):
  settings = supabase_settings(config)
  if not settings["url"] or not settings["anonKey"]:
    raise RuntimeError("No Supabase anon key configured for NHS search.")
  status, payload = http_request_json(
    settings["url"].rstrip("/") + "/functions/v1/search-nhs-jobs",
    method="POST",
    headers={
      "apikey": settings["anonKey"],
      "Authorization": f"Bearer {settings['anonKey']}",
      "Accept": "application/json",
      "Content-Type": "application/json",
    },
    payload={
      "keyword": keyword,
      "location": location,
      "distance": int(distance or 50),
      "page": int(page or 1),
      "limit": max(1, min(int(limit or 25), 100)),
      "sort": sort or "publicationDateDesc",
    },
    timeout=25,
  )
  if status < 200 or status >= 300:
    raise RuntimeError(payload.get("error") or payload.get("message") or f"NHS search returned {status}")
  return payload


def build_job_search_payload(params=None):
  params = params or {}
  config = load_local_config()
  preferences = load_job_search_preferences()
  cv_profile = extract_cv_profile()
  defaults = preferences.get("searchDefaults") or {}
  sources_config = preferences.get("sources") or {}

  keywords = str(params.get("q") or defaults.get("keywords") or "").strip()
  location = str(params.get("location") or params.get("l") or defaults.get("location") or (preferences.get("homeLocation") or {}).get("label") or "").strip()
  radius = int(params.get("distance") or params.get("radius") or defaults.get("radiusMiles") or 50)
  posted_within_days = int(params.get("days") or defaults.get("postedWithinDays") or 30)
  per_source_limit = int(params.get("limit") or defaults.get("perSourceLimit") or 25)
  sort_by = str(params.get("sort") or defaults.get("sortBy") or "best_fit").strip()
  remote_only = str(params.get("remote") or "").strip().lower() in {"1", "true", "yes", "on"}
  hide_low_fit = str(params.get("hide_low_fit") or defaults.get("hideLowFit") or "").strip().lower() in {"1", "true", "yes", "on"}
  min_salary = int(params.get("min_salary") or defaults.get("minimumSalaryAnnual") or 0)
  show_unknown_salary = str(params.get("show_unknown_salary") or defaults.get("showUnknownSalary", True)).strip().lower() not in {"0", "false", "no", "off"}
  source_param = str(params.get("sources") or "").strip()
  selected_sources = [item.strip().lower() for item in source_param.split(",") if item.strip()] or [key for key, enabled in sources_config.items() if enabled]

  fetch_tasks = {}
  with ThreadPoolExecutor(max_workers=4) as executor:
    if "indeed" in selected_sources:
      fetch_tasks[executor.submit(fetch_indeed_jobs, search_term=keywords, location=location, distance=radius, results_wanted=per_source_limit, country="UK", hours_old=posted_within_days * 24)] = "indeed"
    if "reed" in selected_sources:
      fetch_tasks[executor.submit(fetch_reed_jobs, config.get("reedApiKey", ""), keywords=keywords, location=location, distance=radius, results_to_take=per_source_limit)] = "reed"
    if "nhs" in selected_sources:
      fetch_tasks[executor.submit(fetch_nhs_jobs, config, keyword=keywords, location=location, distance=radius, limit=per_source_limit)] = "nhs"
    if "adzuna" in selected_sources:
      fetch_tasks[executor.submit(fetch_adzuna_jobs, config.get("adzunaAppId", ""), config.get("adzunaApiKey", ""), what=keywords, where=location, distance=radius, max_days_old=posted_within_days, sort_by="date", results_per_page=per_source_limit)] = "adzuna"

    source_status = []
    source_jobs = []
    raw_source_counts = {}
    for future in as_completed(fetch_tasks):
      source_key = fetch_tasks[future]
      try:
        payload = future.result()
        jobs = payload.get("jobs") or []
        raw_source_counts[source_key] = len(jobs)
        source_status.append({
          "sourceKey": source_key,
          "sourceLabel": source_badge_label(source_key),
          "ok": True,
          "count": len(jobs),
          "message": payload.get("source") or "Loaded",
          "requiresApiKey": payload.get("requiresApiKey", False),
          "fallbackUrl": payload.get("fallbackUrl", ""),
        })
        source_jobs.extend(normalise_search_job(job, source_key) for job in jobs)
      except Exception as exc:
        raw_source_counts[source_key] = 0
        source_status.append({
          "sourceKey": source_key,
          "sourceLabel": source_badge_label(source_key),
          "ok": False,
          "count": 0,
          "message": str(exc),
        })

  deduped_jobs, duplicates_removed = merge_duplicate_jobs(source_jobs)
  ranked_jobs = [score_job(job, preferences, cv_profile) for job in deduped_jobs]
  sorted_jobs = sort_search_jobs(ranked_jobs, sort_by)

  tier_counts = {}
  for job in sorted_jobs:
    tier_counts[job["matchTier"]] = tier_counts.get(job["matchTier"], 0) + 1

  return {
    "criteria": {
      "keywords": keywords,
      "location": location,
      "radiusMiles": radius,
      "postedWithinDays": posted_within_days,
      "minimumSalaryAnnual": min_salary,
      "sortBy": sort_by,
      "remoteOnly": remote_only,
      "hideLowFit": hide_low_fit,
      "showUnknownSalary": show_unknown_salary,
      "sources": selected_sources,
    },
    "preferences": preferences,
    "cvProfile": cv_profile,
    "jobs": sorted_jobs,
    "stats": {
      "rawCount": len(source_jobs),
      "dedupedCount": len(deduped_jobs),
      "visibleCount": len(sorted_jobs),
      "duplicatesRemoved": duplicates_removed,
      "rawSourceCounts": raw_source_counts,
      "tierCounts": tier_counts,
    },
    "sourceStatus": sorted(source_status, key=lambda item: item["sourceLabel"]),
    "preferencesPath": str(JOB_SEARCH_PREFERENCES_PATH.relative_to(ROOT)),
    "cvPath": str(CV_HTML_PATH.relative_to(ROOT)),
  }


def opencode_quota_status():
  package = read_json(OPENCODE_QUOTA_PATH / "package.json", {})
  return {
    "installed": bool(package),
    "path": str(OPENCODE_QUOTA_PATH.relative_to(ROOT)) if OPENCODE_QUOTA_PATH.exists() else "",
    "version": package.get("version", ""),
    "name": package.get("name", ""),
    "hasOpencodeCli": bool(shutil.which("opencode")),
    "nodeVersion": subprocess.run(["node", "-v"], capture_output=True, text=True, check=False).stdout.strip() if shutil.which("node") else "",
    "npmVersion": subprocess.run(["npm", "-v"], capture_output=True, text=True, check=False).stdout.strip() if shutil.which("npm") else "",
    "repo": "https://github.com/slkiser/opencode-quota",
  }


def now_iso():
  return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def filter_request_headers(headers):
  allowlist = {"user-agent", "content-length", "content-type", "origin", "referer"}
  return {
    key: value
    for key, value in headers.items()
    if key.lower() in allowlist
  }


def write_publish_debug_log(entry):
  PUBLISH_DEBUG_DIR.mkdir(parents=True, exist_ok=True)
  PUBLISH_DEBUG_INDEX.parent.mkdir(parents=True, exist_ok=True)

  ref = entry.get("application", {}).get("ref") or "unknown"
  timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S.%fZ")
  filename = f"{timestamp}-{safe_filename(ref)}.json"
  path = PUBLISH_DEBUG_DIR / filename

  write_json(path, entry)

  summary = {
    "timestamp": entry.get("timestamp"),
    "ref": ref,
    "companyName": entry.get("application", {}).get("companyName", ""),
    "roleTitle": entry.get("application", {}).get("roleTitle", ""),
    "publishedToGitHub": entry.get("result", {}).get("publishedToGitHub"),
    "status": entry.get("status", "unknown"),
    "debugPath": str(path.relative_to(ROOT)),
  }
  with PUBLISH_DEBUG_INDEX.open("a", encoding="utf-8") as handle:
    handle.write(json.dumps(summary) + "\n")

  return str(path.relative_to(ROOT))


def is_application_summary(item):
  return isinstance(item, dict) and isinstance(item.get("ref"), str) and item["ref"].strip()


def merge_application_lists(*lists):
  merged = {}
  for items in lists:
    for item in items:
      if is_application_summary(item):
        merged[item["ref"]] = item

  return sorted(
    merged.values(),
    key=lambda item: item.get("updatedAt") or item.get("createdAt") or "",
    reverse=True,
  )


def read_public_index():
  payload = read_json(PUBLIC_DATA_DIR / "applications.json", [])
  return payload if isinstance(payload, list) else []


def read_local_index():
  payload = read_json(LOCAL_CACHE_DATA_DIR / "applications.json", [])
  return payload if isinstance(payload, list) else []


def read_supabase_index(config):
  if not has_supabase_access(config):
    return []

  path = f"/rest/v1/{SUPABASE_APPLICATIONS_TABLE}?select=ref,company_name,role_title,location,created_at,updated_at,short_code,application&order=updated_at.desc&limit=1000"
  status, payload = supabase_request_json(config, path)
  if status < 200 or status >= 300:
    return []

  rows = payload if isinstance(payload, list) else []
  return [item for item in (supabase_summary_from_row(row) for row in rows) if item]


def read_supabase_application_by_ref(ref, config):
  if not has_supabase_access(config):
    return None

  encoded_ref = quote(ref, safe="")
  path = f"/rest/v1/{SUPABASE_APPLICATIONS_TABLE}?ref=eq.{encoded_ref}&select=ref,company_name,role_title,location,created_at,updated_at,short_code,application&limit=1"
  status, payload = supabase_request_json(config, path)
  if status < 200 or status >= 300:
    return None

  rows = payload if isinstance(payload, list) else []
  if not rows:
    return None

  application = supabase_application_from_row(rows[0])
  if application:
    upsert_local_application(application)
  return application


def read_supabase_application_by_short_code(short_code, config):
  if not has_supabase_access(config):
    return None

  encoded_short_code = quote(short_code, safe="")
  path = f"/rest/v1/{SUPABASE_APPLICATIONS_TABLE}?short_code=eq.{encoded_short_code}&select=ref,company_name,role_title,location,created_at,updated_at,short_code,application&limit=1"
  status, payload = supabase_request_json(config, path)
  if status < 200 or status >= 300:
    return None

  rows = payload if isinstance(payload, list) else []
  if not rows:
    return None

  application = supabase_application_from_row(rows[0])
  if application:
    upsert_local_application(application)
  return application


def upsert_supabase_application(application, config):
  if not has_supabase_access(config):
    return {
      "publishedToSupabase": False,
      "error": "No Supabase service role key configured.",
    }

  row = {
    "ref": application["ref"],
    "company_name": application.get("companyName", ""),
    "role_title": application.get("roleTitle", ""),
    "location": application.get("location", ""),
    "short_code": application.get("shortCode", ""),
    "created_at": application.get("createdAt", now_iso()),
    "updated_at": application.get("updatedAt", now_iso()),
    "application": application,
  }

  path = f"/rest/v1/{SUPABASE_APPLICATIONS_TABLE}?on_conflict=ref"
  status, payload = supabase_request_json(
    config,
    path,
    method="POST",
    payload=[row],
    extra_headers={"Prefer": "resolution=merge-duplicates,return=representation"},
  )

  ok = 200 <= status < 300
  result = {
    "publishedToSupabase": ok,
    "status": status,
    "response": payload,
  }
  if not ok:
    result["error"] = payload.get("message") or f"Supabase API returned {status}"
  return result


def ensure_supabase_bucket(config):
  settings = supabase_settings(config)
  if not settings["url"] or not settings["serviceRoleKey"]:
    return {
      "ok": False,
      "error": "No Supabase service role key configured.",
    }

  bucket = settings["bucket"]
  path = f"/storage/v1/bucket/{quote(bucket, safe='')}"
  status, payload = supabase_request_json(config, path)
  if status == 200:
    return {
      "ok": True,
      "bucket": bucket,
      "status": status,
      "response": payload,
    }

  if status != 404:
    return {
      "ok": False,
      "bucket": bucket,
      "status": status,
      "response": payload,
      "error": payload.get("message") or f"Supabase API returned {status}",
    }

  status, payload = supabase_request_json(
    config,
    "/storage/v1/bucket",
    method="POST",
    payload={
      "id": bucket,
      "name": bucket,
      "public": True,
    },
  )
  ok = 200 <= status < 300
  result = {
    "ok": ok,
    "bucket": bucket,
    "status": status,
    "response": payload,
  }
  if not ok:
    result["error"] = payload.get("message") or f"Supabase API returned {status}"
  return result


def upload_cv_to_supabase(filename, html_content, config):
  bucket_result = ensure_supabase_bucket(config)
  if not bucket_result.get("ok"):
    return {
      "ok": False,
      "error": bucket_result.get("error") or "Could not prepare Supabase bucket.",
      "bucketResult": bucket_result,
    }

  safe = re.sub(r'[^\w\s().,-]', '', filename).strip()
  if not safe:
    safe = "Ben Howard CV"
  object_path = "downloads/" + safe + ".html"
  request_path = f"/storage/v1/object/{quote(bucket_result['bucket'], safe='')}/{quote(object_path, safe='/')}"
  status, payload = supabase_request_raw(
    config,
    request_path,
    method="POST",
    body=html_content.encode("utf-8"),
    extra_headers={
      "Content-Type": "text/html; charset=utf-8",
      "x-upsert": "true",
      "Cache-Control": "no-cache",
    },
  )

  ok = 200 <= status < 300
  result = {
    "ok": ok,
    "bucket": bucket_result["bucket"],
    "path": object_path,
    "status": status,
    "response": payload,
    "publicUrl": supabase_public_url(config, object_path),
  }
  if not ok:
    result["error"] = payload.get("message") or f"Supabase API returned {status}"
  return result


def read_merged_index(config=None):
  config = config or load_local_config()
  return merge_application_lists(
    read_public_index(),
    read_local_index(),
    read_supabase_index(config),
  )


def read_application_by_ref(ref, config=None):
  config = config or load_local_config()
  application = read_supabase_application_by_ref(ref, config)
  if application:
    return application

  local_path = LOCAL_CACHE_DATA_DIR / f"{ref}.json"
  if local_path.exists():
    payload = read_json(local_path, {})
    if isinstance(payload, dict):
      return payload

  public_path = PUBLIC_DATA_DIR / f"{ref}.json"
  if public_path.exists():
    payload = read_json(public_path, {})
    if isinstance(payload, dict):
      return payload

  return None


def read_application_by_short_code(short_code, config=None):
  config = config or load_local_config()
  application = read_supabase_application_by_short_code(short_code, config)
  if application:
    return application

  merged_index = read_merged_index(config)
  match = next(
    (
      item for item in merged_index
      if str(item.get("shortCode", "")).strip().lower() == str(short_code or "").strip().lower()
    ),
    None,
  )
  if match and match.get("ref"):
    return read_application_by_ref(str(match["ref"]).strip().lower(), config)

  return None


# ---------------------------------------------------------------------------
# Usage log helpers
# ---------------------------------------------------------------------------

USAGE_LOG_PATH = Path(__file__).resolve().parent / "local-cache" / "usage-log.jsonl"


def append_usage_log(entry):
  """Append a JSON line to the local usage log."""
  USAGE_LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
  with open(USAGE_LOG_PATH, "a", encoding="utf-8") as f:
    f.write(json.dumps(entry, ensure_ascii=False) + "\n")


def read_usage_log():
  """Read all usage log entries as a list of dicts."""
  if not USAGE_LOG_PATH.exists():
    return []
  entries = []
  with open(USAGE_LOG_PATH, "r", encoding="utf-8") as f:
    for line in f:
      line = line.strip()
      if line:
        try:
          entries.append(json.loads(line))
        except json.JSONDecodeError:
          pass
  return entries


def build_application_urls(application, config=None):
  config = config or load_local_config()
  full_url = f"{config['publicCvBaseUrl']}?ref={quote(str(application.get('ref', '')).strip())}"
  # LEGACY: cv-qr.html is inactive. directQrUrl now points to the full CV page.
  direct_qr_url = f"{config['publicCvBaseUrl']}?ref={quote(str(application.get('ref', '')).strip())}"

  short_code = str(application.get("shortCode", "")).strip()
  if short_code:
    qr_url = urljoin(config["publicCvBaseUrl"], f"r/{quote(short_code)}/")
  else:
    qr_url = urljoin(config["publicCvBaseUrl"], f"j/?r={quote(str(application.get('ref', '')).strip())}")

  return {
    "fullUrl": full_url,
    "directQrUrl": direct_qr_url,
    "qrUrl": qr_url,
  }


def upsert_local_application(application):
  local_index = read_local_index()
  summary = {
    "ref": application["ref"],
    "companyName": application.get("companyName", ""),
    "roleTitle": application.get("roleTitle", ""),
    "location": application.get("location", ""),
    "shortCode": application.get("shortCode", ""),
    "updatedAt": application.get("updatedAt", ""),
    "createdAt": application.get("createdAt", ""),
  }

  existing = next((idx for idx, item in enumerate(local_index) if item.get("ref") == summary["ref"]), None)
  if existing is None:
    local_index.append(summary)
  else:
    local_index[existing] = {**local_index[existing], **summary}

  local_index = merge_application_lists(local_index)
  write_json(LOCAL_CACHE_DATA_DIR / f"{application['ref']}.json", application)
  write_json(LOCAL_CACHE_DATA_DIR / "applications.json", local_index)


def delete_local_application(ref):
  ref = str(ref or "").strip().lower()
  local_path = LOCAL_CACHE_DATA_DIR / f"{ref}.json"
  existed = local_path.exists()
  if local_path.exists():
    local_path.unlink()

  previous_index = read_local_index()
  local_index = [item for item in previous_index if str(item.get("ref", "")).strip().lower() != ref]
  if len(local_index) != len(previous_index):
    write_json(LOCAL_CACHE_DATA_DIR / "applications.json", merge_application_lists(local_index))
  return {
    "deletedLocalFile": existed,
    "deletedFromLocalIndex": len(local_index) != len(previous_index),
    "localIndexCount": len(local_index),
  }


def build_github_contents_url(path):
  encoded = quote(path, safe="/")
  return f"https://api.github.com/repos/{GITHUB_OWNER}/{GITHUB_REPO}/contents/{encoded}"


def github_request(path, token, method="GET", payload=None):
  headers = {
    "Authorization": f"token {token}",
    "Accept": "application/vnd.github+json",
    "User-Agent": "BenHowardCV-LocalServer",
  }

  body = None
  if payload is not None:
    headers["Content-Type"] = "application/json"
    body = json.dumps(payload).encode("utf-8")

  request = Request(build_github_contents_url(path), data=body, headers=headers, method=method)

  try:
    with urlopen(request, timeout=20) as response:
      raw = response.read().decode("utf-8")
      return response.getcode(), json.loads(raw) if raw else {}
  except HTTPError as exc:
    raw = exc.read().decode("utf-8")
    payload = json.loads(raw) if raw else {}
    return exc.code, payload
  except URLError as exc:
    raise RuntimeError(f"Could not reach GitHub: {exc.reason}") from exc


def fetch_remote_json(path, token):
  status, payload = github_request(path, token)
  if status == 404:
    return None, None
  if status < 200 or status >= 300:
    message = payload.get("message") or f"GitHub API returned {status}"
    raise RuntimeError(message)

  content = payload.get("content", "")
  decoded = base64.b64decode(content.replace("\n", "")).decode("utf-8") if content else ""
  data = json.loads(decoded) if decoded else None
  return data, payload.get("sha")


def put_remote_json(path, payload, token, message):
  try:
    _, current_sha = fetch_remote_json(path, token)
  except RuntimeError as exc:
    return {
      "path": path,
      "message": message,
      "ok": False,
      "phase": "fetch-sha",
      "error": str(exc),
    }

  request_body = {
    "message": message,
    "content": base64.b64encode((json.dumps(payload, indent=2) + "\n").encode("utf-8")).decode("utf-8"),
    "branch": GITHUB_BRANCH,
  }
  if current_sha:
    request_body["sha"] = current_sha

  status, response = github_request(path, token, method="PUT", payload=request_body)
  ok = 200 <= status < 300
  result = {
    "path": path,
    "message": message,
    "ok": ok,
    "status": status,
    "request": {
      "branch": GITHUB_BRANCH,
      "hasSha": bool(current_sha),
      "sha": current_sha,
    },
    "response": response,
  }
  if not ok:
    result["error"] = response.get("message") or f"GitHub API returned {status}"
  return result


def generate_short_code(length=8):
  alphabet = string.ascii_lowercase + string.digits
  return ''.join(secrets.choice(alphabet) for _ in range(length))


def fetch_remote_sha(path, token):
  """Get the SHA of a file on GitHub, or None if it doesn't exist."""
  status, payload = github_request(path, token)
  if status == 404:
    return None
  if status < 200 or status >= 300:
    message = payload.get("message") or f"GitHub API returned {status}"
    raise RuntimeError(message)
  return payload.get("sha")


def put_remote_text(path, content, token, message):
  """Push raw text content to a GitHub repo file."""
  try:
    current_sha = fetch_remote_sha(path, token)
  except RuntimeError as exc:
    return {
      "path": path,
      "message": message,
      "ok": False,
      "phase": "fetch-sha",
      "error": str(exc),
    }

  request_body = {
    "message": message,
    "content": base64.b64encode(content.encode("utf-8")).decode("utf-8"),
    "branch": GITHUB_BRANCH,
  }
  if current_sha:
    request_body["sha"] = current_sha

  try:
    status, response = github_request(path, token, method="PUT", payload=request_body)
  except RuntimeError as exc:
    return {
      "path": path,
      "message": message,
      "ok": False,
      "phase": "put",
      "error": str(exc),
    }

  ok = 200 <= status < 300
  result = {
    "path": path,
    "message": message,
    "ok": ok,
    "status": status,
  }
  if not ok:
    result["error"] = response.get("message") or f"GitHub API returned {status}"
  return result


def delete_remote_path(path, token, message):
  try:
    current_sha = fetch_remote_sha(path, token)
  except RuntimeError as exc:
    return {
      "path": path,
      "message": message,
      "ok": False,
      "phase": "fetch-sha",
      "error": str(exc),
    }

  if not current_sha:
    return {
      "path": path,
      "message": message,
      "ok": True,
      "status": 404,
      "skipped": True,
      "reason": "File does not exist",
    }

  request_body = {
    "message": message,
    "sha": current_sha,
    "branch": GITHUB_BRANCH,
  }

  try:
    status, response = github_request(path, token, method="DELETE", payload=request_body)
  except RuntimeError as exc:
    return {
      "path": path,
      "message": message,
      "ok": False,
      "phase": "delete",
      "error": str(exc),
    }

  ok = 200 <= status < 300
  result = {
    "path": path,
    "message": message,
    "ok": ok,
    "status": status,
    "response": response,
  }
  if not ok:
    result["error"] = response.get("message") or f"GitHub API returned {status}"
  return result


def delete_supabase_application(ref, config):
  if not has_supabase_access(config):
    return {
      "deletedFromSupabase": False,
      "skipped": True,
      "reason": "No Supabase service role key configured.",
    }

  encoded_ref = quote(str(ref).strip().lower(), safe="")
  status, payload = supabase_request_json(config, f"/rest/v1/{SUPABASE_APPLICATIONS_TABLE}?ref=eq.{encoded_ref}", method="DELETE")
  ok = 200 <= status < 300
  return {
    "deletedFromSupabase": ok,
    "status": status,
    "response": payload,
    "error": None if ok else (payload.get("message") or f"Supabase API returned {status}"),
  }


def delete_application_from_github(ref, short_code, token, found=False):
  if not token:
    return {
      "deletedFromGitHub": False,
      "skipped": True,
      "reason": "No GitHub token configured.",
    }
  if not found:
    return {
      "deletedFromGitHub": False,
      "skipped": True,
      "reason": "Application not found in configured sources.",
    }

  steps = []
  delete_app = delete_remote_path(f"data/{ref}.json", token, f"Delete application: {ref}")
  steps.append(delete_app)

  try:
    remote_index, _ = fetch_remote_json(APPLICATIONS_INDEX_PATH, token)
    remote_items = remote_index if isinstance(remote_index, list) else []
    merged = [item for item in remote_items if str(item.get("ref", "")).strip().lower() != str(ref).strip().lower()]
    index_result = put_remote_json(APPLICATIONS_INDEX_PATH, merged, token, f"Remove application from index: {ref}")
    steps.append(index_result)
  except RuntimeError as exc:
    steps.append({
      "path": APPLICATIONS_INDEX_PATH,
      "ok": False,
      "error": str(exc),
      "phase": "update-index",
    })

  if short_code:
    delete_redirect = delete_remote_path(f"r/{short_code}/index.html", token, f"Delete short redirect: {short_code}")
    steps.append(delete_redirect)

  ok = all(step.get("ok") for step in steps if not step.get("skipped"))
  return {
    "deletedFromGitHub": ok,
    "steps": steps,
    "error": None if ok else next((step.get("error") for step in steps if step.get("error")), "GitHub delete failed"),
  }


def build_redirect_html(ref):
  """Build a minimal HTML redirect page pointing to /j/?r=<ref>."""
  safe_ref = ref.replace('"', '&quot;').replace('<', '&lt;').replace('>', '&gt;')
  url = f"/j/?r={safe_ref}"
  return (
    '<!DOCTYPE html>'
    '<html><head>'
    '<meta charset="UTF-8">'
    f'<meta http-equiv="refresh" content="0;url={url}">'
    f'<script>location.replace("{url}")</script>'
    '</head><body></body></html>\n'
  )


def push_application_to_github(application, token):
  steps = []

  # Generate short code if not already present
  if not application.get("shortCode"):
    application["shortCode"] = generate_short_code()

  app_result = put_remote_json(
    f"data/{application['ref']}.json",
    application,
    token,
    f"Add/update application: {application.get('companyName', '')} / {application.get('roleTitle', '')}",
  )
  steps.append(app_result)
  if not app_result.get("ok"):
    return {
      "publishedToGitHub": False,
      "steps": steps,
      "error": app_result.get("error") or "Could not publish application file.",
    }

  try:
    remote_index, remote_index_sha = fetch_remote_json(APPLICATIONS_INDEX_PATH, token)
  except RuntimeError as exc:
    steps.append(
      {
        "path": APPLICATIONS_INDEX_PATH,
        "message": f"Update applications index: {application['ref']}",
        "ok": False,
        "phase": "fetch-index",
        "error": str(exc),
      }
    )
    return {
      "publishedToGitHub": False,
      "steps": steps,
      "error": str(exc),
    }

  remote_items = remote_index if isinstance(remote_index, list) else []
  summary = {
    "ref": application["ref"],
    "companyName": application.get("companyName", ""),
    "roleTitle": application.get("roleTitle", ""),
    "location": application.get("location", ""),
    "shortCode": application.get("shortCode", ""),
    "updatedAt": application.get("updatedAt", ""),
    "createdAt": application.get("createdAt", ""),
  }

  merged = merge_application_lists(remote_items, [summary])
  index_result = put_remote_json(APPLICATIONS_INDEX_PATH, merged, token, f"Update applications index: {application['ref']}")
  index_result["remoteIndexSha"] = remote_index_sha
  index_result["remoteIndexCount"] = len(remote_items)
  steps.append(index_result)
  if not index_result.get("ok"):
    return {
      "publishedToGitHub": False,
      "steps": steps,
      "error": index_result.get("error") or "Could not update applications index.",
    }

  # Push short-code redirect file
  short_code = application.get("shortCode", "")
  if short_code:
    redirect_html = build_redirect_html(application["ref"])
    redirect_result = put_remote_text(
      f"r/{short_code}/index.html",
      redirect_html,
      token,
      f"Add short redirect: {application.get('companyName', '')} / {application.get('roleTitle', '')}",
    )
    steps.append(redirect_result)
    # Log but don't fail the whole publish if redirect push fails

  return {
    "publishedToGitHub": True,
    "steps": steps,
    "shortCode": short_code,
    "remoteIndexCount": len(remote_items),
    "remoteIndexSha": remote_index_sha,
  }


def upload_cv_to_github(filename, html_content, token):
  """Push a CV HTML file to the downloads/ folder in the repo."""
  safe = re.sub(r'[^\w\s().,-]', '', filename).strip()
  if not safe:
    safe = "Ben Howard CV"
  path = "downloads/" + safe + ".html"
  return put_remote_text(
    path,
    html_content,
    token,
    "Add CV download: " + safe,
  )


def validate_github_token(token):
  if not token:
    return False, "No GitHub token configured."

  status, payload = github_request("", token)
  if 200 <= status < 300:
    return True, "GitHub access confirmed."

  message = payload.get("message") or f"GitHub API returned {status}"
  return False, message


def validate_supabase_access(config):
  settings = supabase_settings(config)
  if not settings["url"] or not settings["serviceRoleKey"]:
    return False, "No Supabase service role key configured."

  path = f"/rest/v1/{SUPABASE_APPLICATIONS_TABLE}?select=ref&limit=1"
  status, payload = supabase_request_json(config, path)
  if 200 <= status < 300:
    return True, "Supabase access confirmed."

  return False, payload.get("message") or f"Supabase API returned {status}"


class AppHandler(SimpleHTTPRequestHandler):
  def __init__(self, *args, **kwargs):
    super().__init__(*args, directory=str(ROOT), **kwargs)

  def end_headers(self):
    self.send_header("Cache-Control", "no-store")
    super().end_headers()

  def send_json(self, status, payload):
    body = json.dumps(payload).encode("utf-8")
    self.send_response(status)
    self.send_header("Content-Type", "application/json; charset=utf-8")
    self.send_header("Content-Length", str(len(body)))
    self.end_headers()
    self.wfile.write(body)

  def is_blocked_path(self, path):
    return path in {"/local-admin/secrets.local.json", "/local-admin/secrets.local.js"} or path.startswith("/local-cache/")

  def do_GET(self):
    parsed = urlparse(self.path)

    # Redirect root to job search page
    if parsed.path in ("/", "/index.html"):
      self.send_response(302)
      self.send_header("Location", "/local-admin/jobspy.html")
      self.end_headers()
      return

    if parsed.path == "/api/status":
      try:
        config = load_local_config()
        github_ok, github_message = validate_github_token(config["githubToken"])
        supabase_ok, supabase_message = validate_supabase_access(config)
        self.send_json(
          200,
          {
            "hasGithubToken": bool(config["githubToken"]),
            "githubAccessOk": github_ok,
            "githubMessage": github_message,
            "hasSupabase": has_supabase_access(config),
            "supabaseAccessOk": supabase_ok,
            "supabaseMessage": supabase_message,
            "supabaseBucket": supabase_settings(config)["bucket"],
            "publicCvBaseUrl": config["publicCvBaseUrl"],
            "hasAdzunaCredentials": bool(config.get("adzunaAppId") and config.get("adzunaApiKey")),
            "hasReedApiKey": bool(config.get("reedApiKey")),
          },
        )
      except RuntimeError as exc:
        self.send_json(500, {"error": str(exc)})
      return

    if parsed.path == "/api/applications":
      try:
        config = load_local_config()
        self.send_json(200, read_merged_index(config))
      except RuntimeError as exc:
        self.send_json(500, {"error": str(exc)})
      return

    if parsed.path == "/api/application":
      params = parse_qs(parsed.query)
      ref = (params.get("ref", [""])[0] or "").strip().lower()
      short_code = (params.get("sc", [""])[0] or "").strip().lower()
      if not ref and not short_code:
        self.send_json(400, {"error": "Missing ref or sc"})
        return

      try:
        config = load_local_config()
      except RuntimeError as exc:
        self.send_json(500, {"error": str(exc)})
        return

      application = read_application_by_ref(ref, config) if ref else read_application_by_short_code(short_code, config)
      if not application:
        self.send_json(404, {"error": "Application not found"})
        return

      self.send_json(200, application)
      return

    if parsed.path == "/api/indeed-search":
      params = parse_qs(parsed.query)
      try:
        search_term = (params.get("q", [""])[0] or "").strip()
        location = (params.get("l", [""])[0] or "").strip()
        distance = int((params.get("distance", ["25"])[0] or "25").strip())
        results_wanted = int((params.get("limit", ["20"])[0] or "20").strip())
        country = (params.get("country", ["UK"])[0] or "UK").strip()
        days = (params.get("days", [""])[0] or "").strip()
        job_type = (params.get("job_type", [""])[0] or "").strip()
        is_remote = (params.get("remote", ["false"])[0] or "").strip().lower() in {"1", "true", "yes", "on"}
        hours_old = int(days) * 24 if days else None
      except ValueError as exc:
        self.send_json(400, {"error": f"Invalid search parameters: {exc}"})
        return

      try:
        payload = fetch_indeed_jobs(
          search_term=search_term,
          location=location,
          distance=distance,
          results_wanted=results_wanted,
          country=country,
          hours_old=hours_old,
          is_remote=is_remote,
          job_type=job_type,
        )
      except Exception as exc:
        self.send_json(502, {"error": str(exc)})
        return

      self.send_json(200, payload)
      return

    if parsed.path == "/api/job-search-preferences":
      try:
        self.send_json(
          200,
          {
            "preferences": load_job_search_preferences(),
            "cvProfile": extract_cv_profile(),
            "preferencesPath": str(JOB_SEARCH_PREFERENCES_PATH.relative_to(ROOT)),
            "cvPath": str(CV_HTML_PATH.relative_to(ROOT)),
          },
        )
      except Exception as exc:
        self.send_json(500, {"error": str(exc)})
      return

    if parsed.path == "/api/job-search":
      params = {key: values[0] for key, values in parse_qs(parsed.query).items()}
      try:
        self.send_json(200, build_job_search_payload(params))
      except ValueError as exc:
        self.send_json(400, {"error": f"Invalid search parameters: {exc}"})
      except Exception as exc:
        self.send_json(502, {"error": str(exc)})
      return

    if parsed.path == "/api/reed-search":
      params = parse_qs(parsed.query)
      try:
        config = load_local_config()
        payload = fetch_reed_jobs(
          config.get("reedApiKey", ""),
          keywords=(params.get("q", [""])[0] or "").strip(),
          location=(params.get("l", [""])[0] or "").strip(),
          distance=int((params.get("distance", ["25"])[0] or "25").strip()),
          results_to_take=int((params.get("limit", ["50"])[0] or "50").strip()),
          results_to_skip=int((params.get("skip", ["0"])[0] or "0").strip()),
        )
      except ValueError as exc:
        self.send_json(400, {"error": f"Invalid search parameters: {exc}"})
        return
      except RuntimeError as exc:
        self.send_json(500, {"error": str(exc)})
        return
      except Exception as exc:
        self.send_json(502, {"error": str(exc)})
        return

      self.send_json(200, payload)
      return

    if parsed.path == "/api/nhs-search":
      params = parse_qs(parsed.query)
      try:
        config = load_local_config()
        payload = fetch_nhs_jobs(
          config,
          keyword=(params.get("q", [""])[0] or "").strip(),
          location=(params.get("l", [""])[0] or "").strip(),
          distance=int((params.get("distance", ["50"])[0] or "50").strip()),
          limit=int((params.get("limit", ["50"])[0] or "50").strip()),
          page=int((params.get("page", ["1"])[0] or "1").strip()),
          sort=(params.get("sort", ["publicationDateDesc"])[0] or "publicationDateDesc").strip(),
        )
      except ValueError as exc:
        self.send_json(400, {"error": f"Invalid search parameters: {exc}"})
        return
      except RuntimeError as exc:
        self.send_json(500, {"error": str(exc)})
        return
      except Exception as exc:
        self.send_json(502, {"error": str(exc)})
        return

      self.send_json(200, payload)
      return

    if parsed.path == "/api/adzuna-search":
      params = parse_qs(parsed.query)
      try:
        config = load_local_config()
        payload = fetch_adzuna_jobs(
          config.get("adzunaAppId", ""),
          config.get("adzunaApiKey", ""),
          what=(params.get("q", [""])[0] or "").strip(),
          where=(params.get("l", [""])[0] or "").strip(),
          distance=int((params.get("distance", ["50"])[0] or "50").strip()),
          max_days_old=int((params.get("days", ["14"])[0] or "14").strip()),
          sort_by=(params.get("sort", ["date"])[0] or "date").strip(),
          page=int((params.get("page", ["1"])[0] or "1").strip()),
          results_per_page=int((params.get("limit", ["50"])[0] or "50").strip()),
          country=(params.get("country", ["gb"])[0] or "gb").strip(),
        )
      except ValueError as exc:
        self.send_json(400, {"error": f"Invalid search parameters: {exc}"})
        return
      except RuntimeError as exc:
        self.send_json(500, {"error": str(exc)})
        return
      except Exception as exc:
        self.send_json(502, {"error": str(exc)})
        return

      self.send_json(200, payload)
      return

    if parsed.path == "/api/usage-log":
      try:
        entries = read_usage_log()
        qs = parse_qs(parsed.query)
        limit = int(qs.get("limit", [str(len(entries))])[0])
        self.send_json(200, entries[-limit:] if limit < len(entries) else entries)
      except Exception as exc:
        self.send_json(500, {"error": str(exc)})
      return

    if parsed.path == "/api/opencode-quota-status":
      self.send_json(200, opencode_quota_status())
      return

    if parsed.path == "/api/reviewed-jobs":
      try:
        config = load_local_config()
        status, rows = supabase_request_json(
          config,
          f"/rest/v1/{SUPABASE_REVIEWED_JOBS_TABLE}?select=*&order=created_at.desc",
        )
        if 200 <= status < 300:
          self.send_json(200, rows if isinstance(rows, list) else [])
        else:
          self.send_json(status, {"error": rows.get("message", "Supabase error") if isinstance(rows, dict) else "Supabase error"})
      except Exception as exc:
        self.send_json(500, {"error": str(exc)})
      return

    if self.is_blocked_path(parsed.path):
      self.send_error(404)
      return

    super().do_GET()

  def do_HEAD(self):
    parsed = urlparse(self.path)
    if self.is_blocked_path(parsed.path):
      self.send_error(404)
      return

    super().do_HEAD()

  def do_POST(self):
    parsed = urlparse(self.path)
    if parsed.path not in ("/api/publish", "/api/generate", "/api/upload-cv", "/api/pdf", "/api/delete-application", "/api/review-job"):
      self.send_error(404)
      return

    if parsed.path == "/api/review-job":
      self._handle_review_job()
      return

    if parsed.path == "/api/generate":
      self._handle_generate()
      return

    if parsed.path == "/api/upload-cv":
      self._handle_upload_cv()
      return

    if parsed.path == "/api/pdf":
      self._handle_pdf()
      return

    if parsed.path == "/api/delete-application":
      self._handle_delete_application()
      return

    length = int(self.headers.get("Content-Length", "0") or 0)
    raw = self.rfile.read(length).decode("utf-8") if length else ""

    try:
      payload = json.loads(raw) if raw else {}
    except json.JSONDecodeError:
      self.send_json(400, {"error": "Invalid JSON"})
      return

    client_context = payload.get("clientContext") if isinstance(payload, dict) and isinstance(payload.get("clientContext"), dict) else {}
    application = payload.get("application") if isinstance(payload, dict) and isinstance(payload.get("application"), dict) else payload
    if not isinstance(application, dict) or not application.get("ref"):
      self.send_json(400, {"error": "Application payload is missing ref"})
      return

    debug_entry = {
      "timestamp": now_iso(),
      "event": "publish",
      "request": {
        "path": parsed.path,
        "query": parsed.query,
        "clientAddress": {
          "host": self.client_address[0],
          "port": self.client_address[1],
        },
        "headers": filter_request_headers(self.headers),
      },
      "clientContext": client_context,
      "application": application,
      "status": "started",
    }

    try:
      if not application.get("shortCode"):
        application["shortCode"] = generate_short_code()

      upsert_local_application(application)
      config = load_local_config()
      urls = build_application_urls(application, config)
      public_url = urls["fullUrl"]
      debug_entry["publicUrl"] = public_url
      debug_entry["fullUrl"] = urls["fullUrl"]
      debug_entry["directQrUrl"] = urls["directQrUrl"]
      debug_entry["qrUrl"] = urls["qrUrl"]
      debug_entry["publicCvBaseUrl"] = config["publicCvBaseUrl"]
      debug_entry["githubTokenConfigured"] = bool(config["githubToken"])
      debug_entry["supabaseConfigured"] = has_supabase_access(config)

      if not config["githubToken"] and not has_supabase_access(config):
        debug_entry["status"] = "saved-locally-no-backend"
        debug_entry["result"] = {
          "savedLocally": True,
          "publishedToGitHub": False,
          "publishedToSupabase": False,
          "error": "No GitHub token or Supabase service role key configured.",
        }
        debug_path = write_publish_debug_log(debug_entry)
        self.send_json(
          500,
          {
            "error": "No GitHub token or Supabase service role key configured.",
            "savedLocally": True,
            "publishedToGitHub": False,
            "publishedToSupabase": False,
            "application": application,
            "publicUrl": public_url,
            "fullUrl": urls["fullUrl"],
            "directQrUrl": urls["directQrUrl"],
            "qrUrl": urls["qrUrl"],
            "debugLogPath": debug_path,
          },
        )
        return

      github_result = None
      supabase_result = None

      if has_supabase_access(config):
        supabase_result = upsert_supabase_application(application, config)
        debug_entry["supabaseResult"] = supabase_result

      if config["githubToken"]:
        github_result = push_application_to_github(application, config["githubToken"])
        debug_entry["githubResult"] = github_result

      github_ok = bool(github_result and github_result.get("publishedToGitHub"))
      supabase_ok = bool(supabase_result and supabase_result.get("publishedToSupabase"))
      debug_entry["status"] = "published" if (github_ok or supabase_ok) else "failed"
      debug_entry["result"] = {
        "savedLocally": True,
        "publishedToGitHub": github_ok,
        "publishedToSupabase": supabase_ok,
        "error": (github_result or {}).get("error") or (supabase_result or {}).get("error"),
      }
      debug_path = write_publish_debug_log(debug_entry)

      if github_ok or supabase_ok:
        self.send_json(
          200,
          {
            "application": application,
            "publicUrl": public_url,
            "fullUrl": urls["fullUrl"],
            "directQrUrl": urls["directQrUrl"],
            "qrUrl": urls["qrUrl"],
            "savedLocally": True,
            "publishedToGitHub": github_ok,
            "publishedToSupabase": supabase_ok,
            "debugLogPath": debug_path,
            "githubResult": github_result,
            "supabaseResult": supabase_result,
          },
        )
        return

      self.send_json(
        502,
        {
          "error": (github_result or {}).get("error") or (supabase_result or {}).get("error") or "Publish did not complete.",
          "savedLocally": True,
          "application": application,
          "publicUrl": public_url,
          "fullUrl": urls["fullUrl"],
          "directQrUrl": urls["directQrUrl"],
          "qrUrl": urls["qrUrl"],
          "debugLogPath": debug_path,
          "githubResult": github_result,
          "supabaseResult": supabase_result,
        },
      )
    except Exception as exc:
      debug_entry["status"] = "error"
      debug_entry["error"] = str(exc)
      debug_entry["traceback"] = traceback.format_exc()
      debug_path = write_publish_debug_log(debug_entry)
      error_urls = build_application_urls(application, load_local_config())
      self.send_json(
        500,
        {
          "error": str(exc),
          "savedLocally": True,
          "application": application,
          "publicUrl": error_urls["fullUrl"],
          "fullUrl": error_urls["fullUrl"],
          "directQrUrl": error_urls["directQrUrl"],
          "qrUrl": error_urls["qrUrl"],
          "debugLogPath": debug_path,
        },
      )
  def _handle_upload_cv(self):
    """Upload a generated CV HTML file to Supabase Storage, with GitHub fallback."""
    length = int(self.headers.get("Content-Length", "0") or 0)
    raw = self.rfile.read(length).decode("utf-8") if length else ""

    try:
      payload = json.loads(raw) if raw else {}
    except json.JSONDecodeError:
      self.send_json(400, {"error": "Invalid JSON"})
      return

    filename = str(payload.get("filename", "")).strip()
    html_content = str(payload.get("content", "")).strip()
    if not filename or not html_content:
      self.send_json(400, {"error": "filename and content are required"})
      return

    try:
      config = load_local_config()
    except RuntimeError as exc:
      self.send_json(500, {"error": str(exc)})
      return

    supabase_result = None
    github_result = None

    if has_supabase_access(config):
      try:
        supabase_result = upload_cv_to_supabase(filename, html_content, config)
      except Exception as exc:
        supabase_result = {
          "ok": False,
          "error": f"Upload error: {exc}",
        }

    if not (supabase_result and supabase_result.get("ok")) and config["githubToken"]:
      try:
        github_result = upload_cv_to_github(filename, html_content, config["githubToken"])
      except Exception as exc:
        github_result = {
          "ok": False,
          "error": f"Upload error: {exc}",
        }

    if supabase_result and supabase_result.get("ok"):
      self.send_json(
        200,
        {
          "ok": True,
          "backend": "supabase",
          "path": supabase_result["path"],
          "publicUrl": supabase_result.get("publicUrl", ""),
          "supabaseResult": supabase_result,
          "githubResult": github_result,
        },
      )
      return

    if github_result and github_result.get("ok"):
      safe = re.sub(r'[^\w\s().,-]', '', filename).strip() or "Ben Howard CV"
      public_url = config["publicCvBaseUrl"].rstrip("/").replace("/cv.html", "") + "/downloads/" + quote(safe + ".html")
      self.send_json(
        200,
        {
          "ok": True,
          "backend": "github",
          "path": github_result["path"],
          "publicUrl": public_url,
          "supabaseResult": supabase_result,
          "githubResult": github_result,
        },
      )
      return

    self.send_json(
      502,
      {
        "error": (supabase_result or {}).get("error") or (github_result or {}).get("error") or "Upload failed.",
        "supabaseResult": supabase_result,
        "githubResult": github_result,
      },
    )

  def _handle_delete_application(self):
    length = int(self.headers.get("Content-Length", "0") or 0)
    raw = self.rfile.read(length).decode("utf-8") if length else ""

    try:
      payload = json.loads(raw) if raw else {}
    except json.JSONDecodeError:
      self.send_json(400, {"error": "Invalid JSON"})
      return

    ref = str(payload.get("ref", "")).strip().lower()
    if not ref:
      self.send_json(400, {"error": "ref is required"})
      return

    try:
      config = load_local_config()
    except RuntimeError as exc:
      self.send_json(500, {"error": str(exc)})
      return

    application = read_application_by_ref(ref, config) or {}
    found = bool(application)
    short_code = str(application.get("shortCode", "")).strip()

    try:
      local_result = delete_local_application(ref)
      supabase_result = delete_supabase_application(ref, config) if found else {
        "deletedFromSupabase": False,
        "skipped": True,
        "reason": "Application not found in configured sources.",
      }
      github_result = delete_application_from_github(ref, short_code, config.get("githubToken", ""), found=found)
    except Exception as exc:
      self.send_json(500, {"error": str(exc)})
      return

    failed = []
    if not supabase_result.get("deletedFromSupabase") and not supabase_result.get("skipped"):
      failed.append("supabase")
    if not github_result.get("deletedFromGitHub") and not github_result.get("skipped"):
      failed.append("github")

    status = 200 if not failed else 502
    self.send_json(
      status,
      {
        "deleted": not failed,
        "ref": ref,
        "shortCode": short_code,
        "localResult": local_result,
        "supabaseResult": supabase_result,
        "githubResult": github_result,
        "error": None if not failed else ("Delete partially failed: " + ", ".join(failed)),
      },
    )

  def _handle_pdf(self):
    """Convert posted HTML to PDF using Chrome headless and return as a download."""
    length = int(self.headers.get("Content-Length", "0") or 0)
    raw = self.rfile.read(length).decode("utf-8") if length else ""

    try:
      payload = json.loads(raw) if raw else {}
    except json.JSONDecodeError:
      self.send_json(400, {"error": "Invalid JSON"})
      return

    html_content = str(payload.get("content", "")).strip()
    filename = str(payload.get("filename", "Ben Howard CV")).strip() or "Ben Howard CV"
    if not html_content:
      self.send_json(400, {"error": "content is required"})
      return

    pdf_bytes, error = generate_pdf_from_html(html_content)
    if error:
      self.send_json(500, {"error": f"PDF generation failed: {error}"})
      return

    safe_name = re.sub(r'[^\w\s().,-]', '', filename).strip() or "Ben Howard CV"

    # Save a copy to Applied Jobs CVs folder
    applied_cvs_dir = Path.home() / "Desktop" / "Applied Jobs CVs"
    try:
      applied_cvs_dir.mkdir(parents=True, exist_ok=True)
      (applied_cvs_dir / f"{safe_name}.pdf").write_bytes(pdf_bytes)
    except Exception:
      pass  # best-effort save; don't block the download

    content_disposition = f'attachment; filename="{safe_name}.pdf"'
    self.send_response(200)
    self.send_header("Content-Type", "application/pdf")
    self.send_header("Content-Length", str(len(pdf_bytes)))
    self.send_header("Content-Disposition", content_disposition)
    self.send_header("Cache-Control", "no-store")
    self.end_headers()
    self.wfile.write(pdf_bytes)

  def _handle_review_job(self):
    length = int(self.headers.get("Content-Length", "0") or 0)
    raw = self.rfile.read(length).decode("utf-8") if length else ""

    try:
      payload = json.loads(raw) if raw else {}
    except json.JSONDecodeError:
      self.send_json(400, {"error": "Invalid JSON"})
      return

    fingerprint = str(payload.get("fingerprint", "")).strip()
    if not fingerprint:
      self.send_json(400, {"error": "Missing fingerprint"})
      return

    try:
      config = load_local_config()
    except RuntimeError as exc:
      self.send_json(500, {"error": str(exc)})
      return

    openai_key = config.get("openaiApiKey", "")
    if not openai_key:
      self.send_json(400, {"error": "No OpenAI API key configured. Add openaiApiKey to secrets.local.json."})
      return

    cv_profile = extract_cv_profile()
    cv_html = ""
    if CV_HTML_PATH.exists():
      cv_html = CV_HTML_PATH.read_text(encoding="utf-8")
    cv_text = html_to_text(cv_html)[:6000] if cv_html else ""

    job_text = (
      f"Title: {payload.get('title', '')}\n"
      f"Company: {payload.get('company', '')}\n"
      f"Location: {payload.get('location', '')}\n"
      f"Salary: {payload.get('salary', '')}\n"
      f"Remote: {payload.get('isRemote', False)}\n"
      f"Posted: {payload.get('postedAt', '')}\n\n"
      f"Description:\n{payload.get('description', '')}"
    )

    prompt = (
      "You are reviewing a job advert against the candidate's CV. "
      "Return a JSON object with these keys:\n"
      "- strengths: array of bullet point strings listing the candidate's strongest matches for this role\n"
      "- weaknesses: array of bullet point strings listing weak points or gaps\n"
      "- dealbreakers: array of bullet point strings prefixed with ! for any hard requirements the candidate lacks (e.g. specific qualifications, certifications, mandatory experience)\n"
      "- summary: a short 2-3 sentence summary of overall thoughts\n\n"
      "Respond ONLY with valid JSON, no markdown.\n\n"
      f"--- CANDIDATE CV ---\n{cv_text}\n\n"
      f"--- JOB ADVERT ---\n{job_text}"
    )

    try:
      review = call_openai_chat(openai_key, prompt)
    except Exception as exc:
      self.send_json(502, {"error": f"OpenAI call failed: {exc}"})
      return

    # Calculate driving time from home to job location
    driving = get_driving_time_for_location(str(payload.get("location", "")))

    row = {
      "fingerprint": fingerprint,
      "title": str(payload.get("title", ""))[:500],
      "company": str(payload.get("company", ""))[:500],
      "location": str(payload.get("location", ""))[:500],
      "url": str(payload.get("url", ""))[:2000],
      "salary": str(payload.get("salary", ""))[:200],
      "description": str(payload.get("description", "")).replace("\x00", "")[:10000],
      "match_score": int(payload.get("matchScore", 0) or 0),
      "posted_at": str(payload.get("postedAt", ""))[:100] or None,
      "source_labels": [str(s) for s in (payload.get("sourceLabels") or []) if s],
      "is_remote": bool(payload.get("isRemote")),
      "is_hybrid": bool(payload.get("isHybrid")),
      "review": review,
      "driving_time": driving.get("text", "") if driving else "",
      "driving_minutes": driving.get("minutes", None) if driving else None,
      "driving_miles": driving.get("distance_miles", None) if driving else None,
    }

    try:
      status, result = supabase_request_json(
        config,
        f"/rest/v1/{SUPABASE_REVIEWED_JOBS_TABLE}?on_conflict=fingerprint",
        method="POST",
        payload=row,
        extra_headers={
          "Prefer": "return=representation,resolution=merge-duplicates",
        },
      )
      if not (200 <= status < 300):
        err_detail = ""
        if isinstance(result, dict):
          err_detail = result.get("message", "") or result.get("details", "") or result.get("hint", "") or json.dumps(result)
        else:
          err_detail = f"Status {status}"
        self.send_json(status, {"error": f"Supabase insert failed: {err_detail}"})
        return
    except Exception as exc:
      self.send_json(500, {"error": f"Supabase save failed: {exc}"})
      return

    self.send_json(200, {"ok": True, "review": review, "fingerprint": fingerprint, "driving": driving})

  def _handle_generate(self):
    length = int(self.headers.get("Content-Length", "0") or 0)
    raw = self.rfile.read(length).decode("utf-8") if length else ""

    try:
      payload = json.loads(raw) if raw else {}
    except json.JSONDecodeError:
      self.send_json(400, {"error": "Invalid JSON"})
      return

    if not isinstance(payload, dict):
      self.send_json(400, {"error": "Request payload must be a JSON object."})
      return

    advert_text = str(payload.get("advertText", "")).strip()
    application = payload.get("application") if isinstance(payload.get("application"), dict) else {}

    if not advert_text and (not isinstance(application, dict) or not application.get("companyName")):
      self.send_json(400, {"error": "Provide advertText or an application object with companyName."})
      return

    try:
      config = load_local_config()
    except RuntimeError as exc:
      self.send_json(500, {"error": str(exc)})
      return

    if not config.get("openaiApiKey"):
      self.send_json(400, {"error": "No OpenAI API key configured. Add openaiApiKey to secrets.local.json or set OPENAI_API_KEY."})
      return

    try:
      if advert_text:
        result = generate_application_from_advert(advert_text, config)
      else:
        result = generate_personalised_content(application, config)

      # Write usage log entry if generation returned usage data
      meta = result.get("meta") if isinstance(result, dict) else None
      if isinstance(meta, dict) and meta.get("usage"):
        try:
          append_usage_log({
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "model": meta.get("model", ""),
            "provider": meta.get("provider", "openai"),
            "input_tokens": meta["usage"].get("input_tokens", 0),
            "output_tokens": meta["usage"].get("output_tokens", 0),
            "total_tokens": meta["usage"].get("total_tokens", 0),
            "estimated_cost_usd": meta.get("estimated_cost_usd", 0),
            "companyName": meta.get("companyName", ""),
            "roleTitle": meta.get("roleTitle", ""),
            "stage": meta.get("stage", ""),
            "success": meta.get("success", False),
          })
        except Exception:
          pass  # usage log write should not break generation

      self.send_json(200, result)
    except Exception as exc:
      self.send_json(500, {
        "error": f"Generation failed: {exc}",
        "traceback": traceback.format_exc(),
      })


def main():
  port = 8000
  if len(sys.argv) > 1:
    port = int(sys.argv[1])

  # Bind to 0.0.0.0 inside Docker so port-forwarding works; 127.0.0.1 otherwise.
  bind_host = "0.0.0.0" if os.environ.get("DOCKER_CONTAINER") else "127.0.0.1"
  server = ThreadingHTTPServer((bind_host, port), AppHandler)
  print(f"Serving BenHowardCV locally at http://localhost:{port}/")
  try:
    server.serve_forever()
  except KeyboardInterrupt:
    pass
  finally:
    server.server_close()


if __name__ == "__main__":
  main()
