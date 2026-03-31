#!/usr/bin/env python3

import base64
import json
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, urlparse
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parent
PUBLIC_DATA_DIR = ROOT / "data"
LOCAL_ADMIN_DIR = ROOT / "local-admin"
LOCAL_CACHE_DIR = ROOT / "local-cache"
LOCAL_CACHE_DATA_DIR = LOCAL_CACHE_DIR / "data"
LOCAL_CONFIG_PATH = LOCAL_ADMIN_DIR / "secrets.local.json"

GITHUB_OWNER = "MagicManBen"
GITHUB_REPO = "BenHowardCV"
GITHUB_BRANCH = "main"
APPLICATIONS_INDEX_PATH = "data/applications.json"
DEFAULT_PUBLIC_CV_BASE_URL = "https://checkloops.co.uk/cv.html"


def load_local_config():
  if not LOCAL_CONFIG_PATH.exists():
    return {"githubToken": "", "publicCvBaseUrl": DEFAULT_PUBLIC_CV_BASE_URL}

  try:
    payload = json.loads(LOCAL_CONFIG_PATH.read_text(encoding="utf-8"))
  except json.JSONDecodeError as exc:
    raise RuntimeError(f"Invalid local config JSON in {LOCAL_CONFIG_PATH.name}: {exc}") from exc

  return {
    "githubToken": str(payload.get("githubToken", "")).strip(),
    "publicCvBaseUrl": str(payload.get("cvBaseUrl", "")).strip() or DEFAULT_PUBLIC_CV_BASE_URL,
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
  _, current_sha = fetch_remote_json(path, token)

  request_body = {
    "message": message,
    "content": base64.b64encode((json.dumps(payload, indent=2) + "\n").encode("utf-8")).decode("utf-8"),
    "branch": GITHUB_BRANCH,
  }
  if current_sha:
    request_body["sha"] = current_sha

  status, response = github_request(path, token, method="PUT", payload=request_body)
  if status < 200 or status >= 300:
    message = response.get("message") or f"GitHub API returned {status}"
    raise RuntimeError(message)


def push_application_to_github(application, token):
  put_remote_json(
    f"data/{application['ref']}.json",
    application,
    token,
    f"Add/update application: {application.get('companyName', '')} / {application.get('roleTitle', '')}",
  )

  remote_index, _ = fetch_remote_json(APPLICATIONS_INDEX_PATH, token)
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
  put_remote_json(APPLICATIONS_INDEX_PATH, merged, token, f"Update applications index: {application['ref']}")


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
    if parsed.path != "/api/publish":
      self.send_error(404)
      return

    length = int(self.headers.get("Content-Length", "0") or 0)
    raw = self.rfile.read(length).decode("utf-8") if length else ""

    try:
      payload = json.loads(raw) if raw else {}
    except json.JSONDecodeError:
      self.send_json(400, {"error": "Invalid JSON"})
      return

    application = payload.get("application") if isinstance(payload, dict) and isinstance(payload.get("application"), dict) else payload
    if not isinstance(application, dict) or not application.get("ref"):
      self.send_json(400, {"error": "Application payload is missing ref"})
      return

    try:
      upsert_local_application(application)
      config = load_local_config()
      if not config["githubToken"]:
        self.send_json(
          500,
          {
            "error": f"Missing GitHub token in {LOCAL_CONFIG_PATH.name}",
            "savedLocally": True,
            "application": application,
          },
        )
        return

      push_application_to_github(application, config["githubToken"])
      self.send_json(
        200,
        {
          "application": application,
          "publicUrl": f"{config['publicCvBaseUrl']}?ref={application['ref']}",
          "savedLocally": True,
          "publishedToGitHub": True,
        },
      )
    except RuntimeError as exc:
      self.send_json(
        502,
        {
          "error": str(exc),
          "savedLocally": True,
          "application": application,
          "publicUrl": f"{load_local_config()['publicCvBaseUrl']}?ref={application['ref']}",
        },
      )


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
