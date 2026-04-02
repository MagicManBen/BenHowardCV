#!/usr/bin/env python3

import base64
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
from datetime import datetime, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, quote, urlparse
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
        stderr=subprocess.DEVNULL,
        stdin=subprocess.DEVNULL,
        close_fds=True,
        start_new_session=True,
        env=env,
      )
    except OSError as exc:
      return None, str(exc)

    # Poll for completion up to 90 seconds
    deadline = 90
    interval = 0.5
    elapsed = 0.0
    while elapsed < deadline:
      retcode = proc.poll()
      if retcode is not None:
        break
      time.sleep(interval)
      elapsed += interval
    else:
      proc.kill()
      return None, "Chrome timed out after 90 seconds."

    if not os.path.exists(pdf_path):
      return None, f"Chrome exited with code {retcode} but produced no PDF."
    return Path(pdf_path).read_bytes(), None

from content_generation import generate_personalised_content


ROOT = Path(__file__).resolve().parent
PUBLIC_DATA_DIR = ROOT / "data"
LOCAL_ADMIN_DIR = ROOT / "local-admin"
LOCAL_CACHE_DIR = ROOT / "local-cache"
LOCAL_CACHE_DATA_DIR = LOCAL_CACHE_DIR / "data"
LOCAL_CONFIG_PATH = LOCAL_ADMIN_DIR / "secrets.local.json"
DEBUG_DIR = ROOT / "debug"
PUBLISH_DEBUG_DIR = DEBUG_DIR / "publish"
PUBLISH_DEBUG_INDEX = DEBUG_DIR / "publish.log"

GITHUB_OWNER = "MagicManBen"
GITHUB_REPO = "BenHowardCV"
GITHUB_BRANCH = "main"
APPLICATIONS_INDEX_PATH = "data/applications.json"
DEFAULT_PUBLIC_CV_BASE_URL = "https://checkloops.co.uk/cv.html"
SUPABASE_DEFAULT_BUCKET = "cv-files"
SUPABASE_APPLICATIONS_TABLE = "applications"


def load_local_config():
  if not LOCAL_CONFIG_PATH.exists():
    return {
      "githubToken": "",
      "publicCvBaseUrl": DEFAULT_PUBLIC_CV_BASE_URL,
      "ollamaBaseUrl": os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434").strip(),
      "ollamaModel": os.environ.get("OLLAMA_MODEL", "llama3.2").strip(),
      "supabaseUrl": os.environ.get("SUPABASE_URL", "").strip(),
      "supabaseAnonKey": os.environ.get("SUPABASE_ANON_KEY", "").strip(),
      "supabaseServiceRoleKey": os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip(),
      "supabaseBucket": os.environ.get("SUPABASE_BUCKET", SUPABASE_DEFAULT_BUCKET).strip() or SUPABASE_DEFAULT_BUCKET,
    }

  try:
    payload = json.loads(LOCAL_CONFIG_PATH.read_text(encoding="utf-8"))
  except json.JSONDecodeError as exc:
    raise RuntimeError(f"Invalid local config JSON in {LOCAL_CONFIG_PATH.name}: {exc}") from exc

  return {
    "githubToken": str(payload.get("githubToken", "")).strip(),
    "publicCvBaseUrl": str(payload.get("cvBaseUrl", "")).strip() or DEFAULT_PUBLIC_CV_BASE_URL,
    "ollamaBaseUrl": str(payload.get("ollamaBaseUrl", "")).strip() or os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434").strip(),
    "ollamaModel": str(payload.get("ollamaModel", "")).strip() or os.environ.get("OLLAMA_MODEL", "llama3.2").strip(),
    "supabaseUrl": str(payload.get("supabaseUrl", "")).strip() or os.environ.get("SUPABASE_URL", "").strip(),
    "supabaseAnonKey": str(payload.get("supabaseAnonKey", "")).strip() or os.environ.get("SUPABASE_ANON_KEY", "").strip(),
    "supabaseServiceRoleKey": str(payload.get("supabaseServiceRoleKey", "")).strip() or os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip(),
    "supabaseBucket": str(payload.get("supabaseBucket", "")).strip() or os.environ.get("SUPABASE_BUCKET", SUPABASE_DEFAULT_BUCKET).strip() or SUPABASE_DEFAULT_BUCKET,
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


def upsert_local_application(application):
  local_index = read_local_index()
  summary = {
    "ref": application["ref"],
    "companyName": application.get("companyName", ""),
    "roleTitle": application.get("roleTitle", ""),
    "location": application.get("location", ""),
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
      ref = (parse_qs(parsed.query).get("ref", [""])[0] or "").strip().lower()
      if not ref:
        self.send_json(400, {"error": "Missing ref"})
        return

      try:
        config = load_local_config()
      except RuntimeError as exc:
        self.send_json(500, {"error": str(exc)})
        return

      application = read_application_by_ref(ref, config)
      if not application:
        self.send_json(404, {"error": "Application not found"})
        return

      self.send_json(200, application)
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
    if parsed.path not in ("/api/publish", "/api/generate", "/api/upload-cv", "/api/pdf"):
      self.send_error(404)
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
      public_url = f"{config['publicCvBaseUrl']}?ref={application['ref']}"
      debug_entry["publicUrl"] = public_url
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
      self.send_json(
        500,
        {
          "error": str(exc),
          "savedLocally": True,
          "application": application,
          "publicUrl": f"{load_local_config()['publicCvBaseUrl']}?ref={application['ref']}",
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
    content_disposition = f'attachment; filename="{safe_name}.pdf"'
    self.send_response(200)
    self.send_header("Content-Type", "application/pdf")
    self.send_header("Content-Length", str(len(pdf_bytes)))
    self.send_header("Content-Disposition", content_disposition)
    self.send_header("Cache-Control", "no-store")
    self.end_headers()
    self.wfile.write(pdf_bytes)

  def _handle_generate(self):
    length = int(self.headers.get("Content-Length", "0") or 0)
    raw = self.rfile.read(length).decode("utf-8") if length else ""

    try:
      payload = json.loads(raw) if raw else {}
    except json.JSONDecodeError:
      self.send_json(400, {"error": "Invalid JSON"})
      return

    application = payload.get("application") if isinstance(payload, dict) and isinstance(payload.get("application"), dict) else {}
    if not isinstance(application, dict) or not application.get("companyName"):
      self.send_json(400, {"error": "Application payload is missing companyName"})
      return

    try:
      config = load_local_config()
    except RuntimeError as exc:
      self.send_json(500, {"error": str(exc)})
      return

    if not config.get("ollamaBaseUrl"):
      self.send_json(400, {"error": "Ollama base URL not configured."})
      return

    if not config.get("ollamaModel"):
      self.send_json(400, {"error": "Ollama model not configured."})
      return

    try:
      result = generate_personalised_content(application, config)
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
