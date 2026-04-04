#!/usr/bin/python3
"""Generate CV GUI — paste a job URL, get a published CV + PDF."""

import tkinter as tk
from tkinter import ttk
import threading
import subprocess
import json
import re
import os
import base64
from urllib.request import Request, urlopen
from urllib.parse import quote

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
APPLIED_DIR = os.path.expanduser("~/Desktop/Applied Jobs CVs")

# ── Colours ──
BG = "#1e1e2e"
FG = "#cdd6f4"
ACCENT = "#89b4fa"
GREEN = "#a6e3a1"
RED = "#f38ba8"
SURFACE = "#313244"
OVERLAY = "#45475a"


def detect_server():
    """Find the running local server port."""
    for p in range(8000, 8006):
        try:
            urlopen(f"http://127.0.0.1:{p}/api/status", timeout=2)
            return f"http://127.0.0.1:{p}"
        except Exception:
            continue
    return None


def fetch_url_text(url):
    """Fetch a URL and extract text content."""
    req = Request(url, headers={
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
    })
    html = urlopen(req, timeout=20).read().decode("utf-8", errors="replace")
    html = re.sub(r"<(script|style|noscript)[^>]*>.*?</\1>", "", html, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r"<[^>]+>", " ", html)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    return text[:15000]


def slugify(text):
    """Create a URL-safe slug."""
    text = text.lower()
    text = re.sub(r"[^a-z0-9 ]", "", text)
    text = re.sub(r" +", "-", text).strip("-")
    return text


class GenerateCVApp:
    def __init__(self):
        self.root = tk.Tk()
        self.root.title("Generate CV")
        self.root.configure(bg=BG)
        self.root.geometry("520x480")
        self.root.resizable(False, False)

        # Try to get clipboard
        try:
            clip = self.root.clipboard_get()
        except Exception:
            clip = ""

        self.cv_url = ""
        self.build_ui(clip)

    def build_ui(self, clipboard_text):
        root = self.root

        # ── Title ──
        tk.Label(root, text="Generate CV", font=("SF Pro Display", 22, "bold"),
                 bg=BG, fg=FG).pack(pady=(18, 4))
        tk.Label(root, text="Paste a job advert URL and click Generate",
                 font=("SF Pro Text", 12), bg=BG, fg=OVERLAY).pack(pady=(0, 12))

        # ── URL input ──
        input_frame = tk.Frame(root, bg=BG)
        input_frame.pack(padx=24, fill="x")

        tk.Label(input_frame, text="Job URL:", font=("SF Pro Text", 12),
                 bg=BG, fg=FG).pack(anchor="w")

        self.url_var = tk.StringVar(value=clipboard_text if clipboard_text.startswith("http") else "")
        self.url_entry = tk.Entry(input_frame, textvariable=self.url_var,
                                   font=("SF Mono", 12), bg=SURFACE, fg=FG,
                                   insertbackground=FG, relief="flat", bd=8)
        self.url_entry.pack(fill="x", pady=(4, 0))
        self.url_entry.focus_set()
        self.url_entry.select_range(0, "end")

        # ── Generate button ──
        self.gen_btn = tk.Button(root, text="Generate", font=("SF Pro Text", 14, "bold"),
                                 bg=ACCENT, fg="#1e1e2e", activebackground="#74c7ec",
                                 relief="flat", bd=0, padx=24, pady=8,
                                 command=self.start_generate)
        self.gen_btn.pack(pady=16)

        # ── Progress bar ──
        style = ttk.Style()
        style.theme_use("clam")
        style.configure("Custom.Horizontal.TProgressbar",
                         troughcolor=SURFACE, background=ACCENT, thickness=8)
        self.progress = ttk.Progressbar(root, style="Custom.Horizontal.TProgressbar",
                                         mode="determinate", maximum=100)
        self.progress.pack(padx=24, fill="x", pady=(0, 8))

        # ── Status log ──
        self.log_text = tk.Text(root, height=10, font=("SF Mono", 11),
                                 bg=SURFACE, fg=FG, relief="flat", bd=8,
                                 wrap="word", state="disabled",
                                 insertbackground=FG)
        self.log_text.pack(padx=24, fill="both", expand=True, pady=(0, 8))
        self.log_text.tag_configure("ok", foreground=GREEN)
        self.log_text.tag_configure("err", foreground=RED)
        self.log_text.tag_configure("info", foreground=ACCENT)

        # ── Bottom buttons (hidden until done) ──
        self.btn_frame = tk.Frame(root, bg=BG)

        self.open_url_btn = tk.Button(self.btn_frame, text="Open CV URL",
                                       font=("SF Pro Text", 12, "bold"),
                                       bg=ACCENT, fg="#1e1e2e", relief="flat",
                                       bd=0, padx=16, pady=6,
                                       command=self.open_cv_url)

        self.open_folder_btn = tk.Button(self.btn_frame, text="Open Folder",
                                          font=("SF Pro Text", 12),
                                          bg=OVERLAY, fg=FG, relief="flat",
                                          bd=0, padx=16, pady=6,
                                          command=self.open_folder)

        self.done_btn = tk.Button(self.btn_frame, text="Done",
                                   font=("SF Pro Text", 12),
                                   bg=OVERLAY, fg=FG, relief="flat",
                                   bd=0, padx=16, pady=6,
                                   command=self.root.destroy)

        # Bind Enter key
        self.root.bind("<Return>", lambda e: self.start_generate())

    def log(self, msg, tag="info"):
        self.log_text.configure(state="normal")
        self.log_text.insert("end", msg + "\n", tag)
        self.log_text.see("end")
        self.log_text.configure(state="disabled")

    def set_progress(self, value):
        self.progress["value"] = value
        self.root.update_idletasks()

    def start_generate(self):
        url = self.url_var.get().strip()
        if not url.startswith("http"):
            self.log("Please enter a valid URL starting with http", "err")
            return

        self.gen_btn.configure(state="disabled", text="Working…")
        self.url_entry.configure(state="disabled")
        self.set_progress(0)

        thread = threading.Thread(target=self.run_pipeline, args=(url,), daemon=True)
        thread.start()

    def run_pipeline(self, url):
        try:
            self._run_pipeline(url)
        except Exception as e:
            self.root.after(0, self.log, f"Error: {e}", "err")
            self.root.after(0, self.on_error)

    def _run_pipeline(self, url):
        # ── Find server ──
        self.root.after(0, self.log, "Finding server…")
        self.root.after(0, self.set_progress, 5)

        server = detect_server()
        if not server:
            raise Exception("Server not running. Open 'OPEN THIS - Ben Howard CV.command' first.")

        self.root.after(0, self.log, f"Server found at {server}", "ok")
        self.root.after(0, self.set_progress, 10)

        # ── Fetch URL ──
        self.root.after(0, self.log, f"Fetching job advert…")
        advert_text = fetch_url_text(url)
        if not advert_text:
            raise Exception("Could not extract text from URL")

        preview = advert_text[:100].replace("\n", " ")
        self.root.after(0, self.log, f"Fetched: {preview}…", "ok")
        self.root.after(0, self.set_progress, 20)

        # ── Generate ──
        self.root.after(0, self.log, "Generating tailored CV via OpenAI…")
        gen_payload = json.dumps({"advertText": advert_text}).encode()
        req = Request(f"{server}/api/generate", data=gen_payload, method="POST",
                      headers={"Content-Type": "application/json"})
        with urlopen(req, timeout=120) as resp:
            gen_resp = json.loads(resp.read().decode())

        meta = gen_resp.get("meta", {})
        if meta.get("error"):
            raise Exception(f"Generation failed: {meta['error']}")

        app_data = gen_resp.get("application", {})
        gen_content = gen_resp.get("generatedContent", {})
        company = app_data.get("companyName", "Unknown")
        role = app_data.get("roleTitle", "Unknown")
        location = app_data.get("location", "")
        cost = meta.get("estimated_cost_usd", "?")

        self.root.after(0, self.log, f"Generated: {company} — {role}  (${cost})", "ok")
        self.root.after(0, self.set_progress, 50)

        # ── Publish ──
        self.root.after(0, self.log, "Publishing to GitHub + Supabase…")

        ref = slugify(f"{company} {role} {location}")
        if not ref:
            ref = f"application-{int(__import__('time').time())}"

        pub_app = dict(app_data)
        pub_app["ref"] = ref
        pub_app["personalisedContent"] = gen_content
        pub_app["generatedContent"] = gen_content
        pub_app["personalisedIntro"] = gen_content.get("personalisedOpening", "")
        pub_app["whyThisRole"] = gen_content.get("whyThisRole", "")
        pub_app["shortCompanyReason"] = app_data.get("shortCompanyReason") or gen_content.get("whyThisCompany", "")
        pub_app["closingSummary"] = gen_content.get("closingSummary", "")
        pub_app["genHeroPositioning"] = gen_content.get("heroPositioning", "")
        pub_app["genPersonalisedOpening"] = gen_content.get("personalisedOpening", "")
        pub_app["genWhyThisCompany"] = gen_content.get("whyThisCompany", "")
        pub_app["genWhyThisRole"] = gen_content.get("whyThisRole", "")
        pub_app["genFitSummary"] = gen_content.get("fitSummary", "")
        pub_app["genLikelyContribution"] = gen_content.get("likelyContributionSummary", "")
        pub_app["genCultureFit"] = gen_content.get("cultureFitSummary", "")
        pub_app["genClosingSummary"] = gen_content.get("closingSummary", "")
        pub_app["genRoleNeedsSummary"] = gen_content.get("roleNeedsSummary", "")
        pub_app["genCompanyHighlights"] = gen_content.get("companyHighlights", [])
        pub_app["genEvidenceExamples"] = gen_content.get("selectedEvidenceExamples", [])
        pub_app["genExperienceMappings"] = gen_content.get("experienceMappings", [])
        pub_app["genFocusAreasToBring"] = gen_content.get("focusAreasToBring", [])
        pub_app["genFirst90DaysPlan"] = gen_content.get("first90DaysPlan", [])
        pub_app["genClosingProofPoints"] = gen_content.get("closingProofPoints", [])

        pub_payload = json.dumps({"application": pub_app}).encode()
        req = Request(f"{server}/api/publish", data=pub_payload, method="POST",
                      headers={"Content-Type": "application/json"})
        with urlopen(req, timeout=60) as resp:
            pub_resp = json.loads(resp.read().decode())

        if pub_resp.get("error"):
            self.root.after(0, self.log, f"Publish warning: {pub_resp['error']}", "err")

        self.cv_url = pub_resp.get("fullUrl", "")
        short_code = pub_resp.get("application", {}).get("shortCode", "")
        gh_ok = pub_resp.get("publishedToGitHub", False)
        sb_ok = pub_resp.get("publishedToSupabase", False)

        self.root.after(0, self.log, f"Published — GitHub: {gh_ok}, Supabase: {sb_ok}", "ok")
        self.root.after(0, self.set_progress, 75)

        # ── Generate PDF ──
        self.root.after(0, self.log, "Generating PDF with QR code…")

        html = urlopen(f"{server}/BH%20CV.html", timeout=10).read().decode("utf-8")

        qr_target = (f"https://checkloops.co.uk/j/#{short_code}") if short_code else self.cv_url
        qr_img_html = ""
        if qr_target:
            # Try qrcode library, fall back to API URL
            qr_src = ""
            try:
                import qrcode as _qr
                from io import BytesIO
                qr = _qr.QRCode(error_correction=_qr.constants.ERROR_CORRECT_M, box_size=8, border=1)
                qr.add_data(qr_target)
                qr.make(fit=True)
                img = qr.make_image(fill_color="#284a5b", back_color="white")
                buf = BytesIO()
                img.save(buf, format="PNG")
                qr_src = "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()
            except ImportError:
                qr_src = f"https://quickchart.io/qr?text={quote(qr_target)}&size=256&dark=284a5b&light=ffffff&format=png"

            qr_img_html = (
                f'<a href="{qr_target}" target="_blank" rel="noopener noreferrer" '
                f'style="display:flex; align-items:center; justify-content:center; width:88px; height:88px; margin:0.38rem auto 0; background:#fff; border-radius:6px; line-height:0; text-decoration:none;">'
                f'<img src="{qr_src}" width="80" height="80" alt="QR code" style="display:block; width:80px; height:80px; margin:0 auto; object-fit:contain;">'
                f'</a>'
            )

        short_display = f"checkloops.co.uk/j/#{short_code}" if short_code else ""
        if short_code:
            qr_label = (f'I have prepared a personalised CV for {company}.<br>'
                        f'Scan QR or visit <strong style="letter-spacing:0.02em;">{short_display}</strong>')
        else:
            qr_label = f"I have prepared a personalised CV for {company}. Scan or tap to view."

        qr_block = (
            '<section class="sidebar-card" style="margin-top:auto; padding-top:0.6rem; border-top:1px solid rgba(255,255,255,0.14); display:flex; flex-direction:column; align-items:center; text-align:center;">'
            '<h2 style="margin:0;">Tailored CV</h2>'
            f'{qr_img_html}'
            f'<p style="margin-top:0.3rem; font-size:0.58rem; line-height:1.35; color:rgba(245,245,241,0.88);">{qr_label}</p>'
            '</section>'
        )

        # Inject into every </aside>
        offset = 0
        while True:
            idx = html.find("</aside>", offset)
            if idx == -1:
                break
            block = qr_block + "\n"
            html = html[:idx] + block + html[idx:]
            offset = idx + len(block) + len("</aside>")

        # Inject "Prepared for" line
        if company:
            rt = re.search(r'class="role-title".*?</p>', html, re.DOTALL)
            if rt:
                end = rt.end()
                prepared = f'\n<p class="role-title" style="font-size:0.54rem; margin-top:0.12rem; letter-spacing:0.18em; opacity:0.82;">Prepared for {company}</p>'
                html = html[:end] + prepared + html[end:]

        pdf_filename = f"Ben Howard CV - {role}"
        pdf_payload = json.dumps({"filename": pdf_filename, "content": html}).encode()
        req = Request(f"{server}/api/pdf", data=pdf_payload, method="POST",
                      headers={"Content-Type": "application/json"})
        with urlopen(req, timeout=60) as resp:
            resp.read()

        self.root.after(0, self.log, f"PDF saved: {pdf_filename}.pdf", "ok")
        self.root.after(0, self.set_progress, 100)

        # ── Done ──
        if short_code:
            self.root.after(0, self.log, f"\nCV: {self.cv_url}")
            self.root.after(0, self.log, f"Short: {short_display}")
        self.root.after(0, self.log, f"PDF: {APPLIED_DIR}/{pdf_filename}.pdf")
        self.root.after(0, self.on_complete)

    def on_complete(self):
        self.gen_btn.configure(text="Done!", bg=GREEN, state="disabled")
        self.btn_frame.pack(pady=(4, 16))
        self.open_url_btn.pack(side="left", padx=6)
        self.open_folder_btn.pack(side="left", padx=6)
        self.done_btn.pack(side="left", padx=6)

    def on_error(self):
        self.gen_btn.configure(text="Generate", bg=ACCENT, state="normal")
        self.url_entry.configure(state="normal")

    def open_cv_url(self):
        if self.cv_url:
            os.system(f"open {self.cv_url}")

    def open_folder(self):
        os.system(f'open "{APPLIED_DIR}"')

    def run(self):
        self.root.mainloop()


if __name__ == "__main__":
    GenerateCVApp().run()
