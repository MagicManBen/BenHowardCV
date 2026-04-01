#!/usr/bin/env python3

import base64
import json
import os
import re
import sys
import traceback
from datetime import datetime, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, urlparse
from urllib.request import Request, urlopen

from company_research import run_company_research, filter_research_findings
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


def load_local_config():
  if not LOCAL_CONFIG_PATH.exists():
    return {
      "githubToken": "",
      "publicCvBaseUrl": DEFAULT_PUBLIC_CV_BASE_URL,
      "googleKgApiKey": os.environ.get("GOOGLE_KG_API_KEY", "").strip(),
      "ollamaBaseUrl": os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434").strip(),
      "ollamaModel": os.environ.get("OLLAMA_MODEL", "llama3.2").strip(),
    }

  try:
    payload = json.loads(LOCAL_CONFIG_PATH.read_text(encoding="utf-8"))
  except json.JSONDecodeError as exc:
    raise RuntimeError(f"Invalid local config JSON in {LOCAL_CONFIG_PATH.name}: {exc}") from exc

  return {
    "githubToken": str(payload.get("githubToken", "")).strip(),
    "publicCvBaseUrl": str(payload.get("cvBaseUrl", "")).strip() or DEFAULT_PUBLIC_CV_BASE_URL,
    "googleKgApiKey": str(payload.get("googleKgApiKey", "")).strip() or os.environ.get("GOOGLE_KG_API_KEY", "").strip(),
    "ollamaBaseUrl": str(payload.get("ollamaBaseUrl", "")).strip() or os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434").strip(),
    "ollamaModel": str(payload.get("ollamaModel", "")).strip() or os.environ.get("OLLAMA_MODEL", "llama3.2").strip(),
  }


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


def read_merged_index():
  return merge_application_lists(read_public_index(), read_local_index())


def read_application_by_ref(ref):
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
  return f"https://api.github.com/repos/{GITHUB_OWNER}/{GITHUB_REPO}/contents/{path}"


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


def push_application_to_github(application, token):
  steps = []

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

  return {
    "publishedToGitHub": True,
    "steps": steps,
    "remoteIndexCount": len(remote_items),
    "remoteIndexSha": remote_index_sha,
  }


def validate_github_token(token):
  if not token:
    return False, "No GitHub token configured."

  status, payload = github_request("", token)
  if 200 <= status < 300:
    return True, "GitHub access confirmed."

  message = payload.get("message") or f"GitHub API returned {status}"
  return False, message


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
        self.send_json(
          200,
          {
            "hasGithubToken": bool(config["githubToken"]),
            "githubAccessOk": github_ok,
            "githubMessage": github_message,
            "publicCvBaseUrl": config["publicCvBaseUrl"],
          },
        )
      except RuntimeError as exc:
        self.send_json(500, {"error": str(exc)})
      return

    if parsed.path == "/api/applications":
      self.send_json(200, read_merged_index())
      return

    if parsed.path == "/api/application":
      ref = (parse_qs(parsed.query).get("ref", [""])[0] or "").strip().lower()
      if not ref:
        self.send_json(400, {"error": "Missing ref"})
        return

      application = read_application_by_ref(ref)
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
    if parsed.path not in ("/api/publish", "/api/research", "/api/research/filter", "/api/generate"):
      self.send_error(404)
      return

    if parsed.path == "/api/research":
      self._handle_research()
      return

    if parsed.path == "/api/research/filter":
      self._handle_research_filter()
      return

    if parsed.path == "/api/generate":
      self._handle_generate()
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
      upsert_local_application(application)
      config = load_local_config()
      public_url = f"{config['publicCvBaseUrl']}?ref={application['ref']}"
      debug_entry["publicUrl"] = public_url
      debug_entry["publicCvBaseUrl"] = config["publicCvBaseUrl"]
      debug_entry["githubTokenConfigured"] = bool(config["githubToken"])

      if not config["githubToken"]:
        debug_entry["status"] = "saved-locally-no-token"
        debug_entry["result"] = {
          "savedLocally": True,
          "publishedToGitHub": False,
          "error": f"Missing GitHub token in {LOCAL_CONFIG_PATH.name}",
        }
        debug_path = write_publish_debug_log(debug_entry)
        self.send_json(
          500,
          {
            "error": f"Missing GitHub token in {LOCAL_CONFIG_PATH.name}",
            "savedLocally": True,
            "application": application,
            "publicUrl": public_url,
            "debugLogPath": debug_path,
          },
        )
        return

      github_result = push_application_to_github(application, config["githubToken"])
      debug_entry["githubResult"] = github_result
      debug_entry["status"] = "published" if github_result.get("publishedToGitHub") else "failed"
      debug_entry["result"] = {
        "savedLocally": True,
        "publishedToGitHub": github_result.get("publishedToGitHub", False),
        "error": github_result.get("error"),
      }
      debug_path = write_publish_debug_log(debug_entry)

      if github_result.get("publishedToGitHub"):
        self.send_json(
          200,
          {
            "application": application,
            "publicUrl": public_url,
            "savedLocally": True,
            "publishedToGitHub": True,
            "debugLogPath": debug_path,
            "githubResult": github_result,
          },
        )
        return

      self.send_json(
        502,
        {
          "error": github_result.get("error") or "GitHub publish did not complete.",
          "savedLocally": True,
          "application": application,
          "publicUrl": public_url,
          "debugLogPath": debug_path,
          "githubResult": github_result,
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


  def _handle_research(self):
    """Run company research APIs and return raw findings."""
    length = int(self.headers.get("Content-Length", "0") or 0)
    raw = self.rfile.read(length).decode("utf-8") if length else ""

    try:
      payload = json.loads(raw) if raw else {}
    except json.JSONDecodeError:
      self.send_json(400, {"error": "Invalid JSON"})
      return

    application = payload.get("application") if isinstance(payload, dict) and isinstance(payload.get("application"), dict) else payload
    if not isinstance(application, dict) or not application.get("companyName"):
      self.send_json(400, {"error": "Application payload is missing companyName"})
      return

    try:
      config = load_local_config()
    except RuntimeError as exc:
      self.send_json(500, {"error": str(exc)})
      return

    try:
      research = run_company_research(application, config)
      self.send_json(200, research)
    except Exception as exc:
      self.send_json(500, {
        "error": f"Research failed: {exc}",
        "traceback": traceback.format_exc(),
      })

  def _handle_research_filter(self):
    """Filter/rank raw findings into a structured company profile."""
    length = int(self.headers.get("Content-Length", "0") or 0)
    raw = self.rfile.read(length).decode("utf-8") if length else ""

    try:
      payload = json.loads(raw) if raw else {}
    except json.JSONDecodeError:
      self.send_json(400, {"error": "Invalid JSON"})
      return

    application = payload.get("application") if isinstance(payload, dict) and isinstance(payload.get("application"), dict) else {}
    raw_findings = payload.get("rawFindings") if isinstance(payload, dict) and isinstance(payload.get("rawFindings"), list) else []

    if not isinstance(application, dict) or not application.get("companyName"):
      self.send_json(400, {"error": "Application payload is missing companyName"})
      return

    if not raw_findings:
      self.send_json(400, {"error": "No rawFindings provided to filter"})
      return

    try:
      filtered = filter_research_findings(application, raw_findings)
      self.send_json(200, filtered)
    except Exception as exc:
      self.send_json(500, {
        "error": f"Filtering failed: {exc}",
        "traceback": traceback.format_exc(),
      })

  def _handle_generate(self):
    """Generate personalised CV content using Ollama."""
    length = int(self.headers.get("Content-Length", "0") or 0)
    raw = self.rfile.read(length).decode("utf-8") if length else ""

    try:
      payload = json.loads(raw) if raw else {}
    except json.JSONDecodeError:
      self.send_json(400, {"error": "Invalid JSON"})
      return

    application = payload.get("application") if isinstance(payload, dict) and isinstance(payload.get("application"), dict) else {}
    filtered_findings = payload.get("filteredFindings") if isinstance(payload, dict) and isinstance(payload.get("filteredFindings"), dict) else {}

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
      result = generate_personalised_content(application, filtered_findings, config)
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

  server = ThreadingHTTPServer(("127.0.0.1", port), AppHandler)
  print(f"Serving BenHowardCV locally at http://localhost:{port}/")
  try:
    server.serve_forever()
  except KeyboardInterrupt:
    pass
  finally:
    server.server_close()


if __name__ == "__main__":
  main()
