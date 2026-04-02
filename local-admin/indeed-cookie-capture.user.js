// ==UserScript==
// @name         Indeed Cookie Capture + Job Scraper → Supabase
// @namespace    https://checkloops.co.uk
// @version      2.0
// @description  Auto-captures Indeed cookies and scrapes search results to Supabase
// @author       Ben Howard
// @match        https://uk.indeed.com/*
// @match        https://secure.indeed.com/*
// @grant        GM_xmlhttpRequest
// @connect      jntpyqguonknixyksqbp.supabase.co
// @run-at       document-idle
// ==/UserScript==

(function () {
  "use strict";

  // ── Config ────────────────────────────────────────────────────
  var SUPABASE_URL  = "https://jntpyqguonknixyksqbp.supabase.co";
  var SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpudHB5cWd1b25rbml4eWtzcWJwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwODYxNTEsImV4cCI6MjA5MDY2MjE1MX0.Tx2nMTKuguGIRnSwLR2Wm47d68p99DrH2ldIWWKOuBs";

  var SAVE_COOKIES_URL = SUPABASE_URL + "/functions/v1/save-cookies";
  var JOBS_REST_URL    = SUPABASE_URL + "/rest/v1/indeed_jobs";

  var COOKIE_INTERVAL  = 5000;   // check every 5 s
  var COOKIE_THROTTLE  = 600000; // save at most every 10 min
  var SCRAPE_DELAY     = 2500;   // wait for Indeed to finish rendering

  var KEY_COOKIE_SAVE  = "bh_indeed_cookie_ts";
  var KEY_SCRAPE_SAVE  = "bh_indeed_scrape_ts";

  // ── Notification ──────────────────────────────────────────────
  function notify(msg, type) {
    var colours = {
      ok:    { bg: "#155724", border: "#2ecc40" },
      warn:  { bg: "#856404", border: "#f1c40f" },
      error: { bg: "#721c24", border: "#e74c3c" }
    };
    var c = colours[type] || colours.ok;

    var el = document.createElement("div");
    el.textContent = msg;
    el.style.cssText =
      "position:fixed;top:12px;right:12px;z-index:999999;" +
      "background:" + c.bg + ";color:#fff;" +
      "padding:8px 16px;border-radius:6px;border-left:3px solid " + c.border + ";" +
      "font:600 13px/1.4 system-ui,sans-serif;" +
      "box-shadow:0 2px 8px rgba(0,0,0,0.3);transition:opacity 0.3s;";
    document.body.appendChild(el);
    setTimeout(function () {
      el.style.opacity = "0";
      setTimeout(function () { el.remove(); }, 400);
    }, 4000);
  }

  // ── Cookie capture ────────────────────────────────────────────
  function hasSession() {
    return document.cookie.length > 20;
  }

  function cookiesDue() {
    var ts = localStorage.getItem(KEY_COOKIE_SAVE);
    return !ts || Date.now() - parseInt(ts, 10) > COOKIE_THROTTLE;
  }

  function saveCookies() {
    if (!hasSession() || !cookiesDue()) return;
    var raw = document.cookie;
    if (!raw) return;

    GM_xmlhttpRequest({
      method: "POST",
      url: SAVE_COOKIES_URL,
      headers: { "Content-Type": "application/json" },
      data: JSON.stringify({ source: "indeed", cookies: raw }),
      onload: function (res) {
        try {
          var d = JSON.parse(res.responseText);
          if (d.ok) {
            localStorage.setItem(KEY_COOKIE_SAVE, String(Date.now()));
            console.log("[BH] Cookies saved");
          }
        } catch (e) {
          console.error("[BH] Cookie parse error:", e);
        }
      },
      onerror: function (e) {
        console.error("[BH] Cookie save failed:", e);
      }
    });
  }

  // ── Job scraping ──────────────────────────────────────────────
  function isSearchPage() {
    return /\/(jobs|search)/.test(location.pathname) ||
           location.search.indexOf("q=") !== -1;
  }

  function extractJobs() {
    var jobs = [];
    var seen = {};

    // Strategy 1: parse mosaic JSON embedded in <script> tags
    var scripts = document.querySelectorAll("script");
    for (var i = 0; i < scripts.length; i++) {
      var text = scripts[i].textContent;
      if (text.indexOf("mosaic-provider-jobcards") === -1 &&
          text.indexOf("jobResults") === -1) continue;
      try {
        var m = text.match(/"results"\s*:\s*(\[[\s\S]*?\])\s*,\s*"/);
        if (!m) continue;
        var results = JSON.parse(m[1]);
        for (var j = 0; j < results.length; j++) {
          var r = results[j];
          if (!r.jobkey || seen[r.jobkey]) continue;
          seen[r.jobkey] = true;
          var salary = "";
          if (r.salarySnippet && r.salarySnippet.text) {
            salary = r.salarySnippet.text;
          } else if (r.extractedSalary) {
            salary = "\u00A3" + r.extractedSalary.min + " \u2013 \u00A3" + r.extractedSalary.max;
          }
          jobs.push({
            id:          r.jobkey,
            title:       r.title || r.displayTitle || "",
            company:     r.company || r.companyName || "",
            location:    r.formattedLocation || r.jobLocationCity || "",
            salary:      salary,
            url:         "https://uk.indeed.com/viewjob?jk=" + r.jobkey,
            description: r.snippet || "",
            date_posted: r.formattedRelativeTime || ""
          });
        }
      } catch (e) {
        console.log("[BH] Mosaic parse failed, trying DOM:", e);
      }
    }

    // Strategy 2: fall back to DOM scraping
    if (jobs.length === 0) {
      var cards = document.querySelectorAll(
        "[data-jk], .job_seen_beacon, .resultContent, .jobsearch-ResultsList > li"
      );
      cards.forEach(function (card) {
        var jk = card.getAttribute("data-jk");
        if (!jk) {
          var link = card.querySelector("a[data-jk]");
          if (link) jk = link.getAttribute("data-jk");
        }
        if (!jk || seen[jk]) return;
        seen[jk] = true;

        var q = function (sel) {
          var el = card.querySelector(sel);
          return el ? el.textContent.trim() : "";
        };

        jobs.push({
          id:          jk,
          title:       q("h2.jobTitle a, h2 a, .jobTitle > a, a.jcs-JobTitle"),
          company:     q('[data-testid="company-name"], .companyName, .company'),
          location:    q('[data-testid="text-location"], .companyLocation, .location'),
          salary:      q('[data-testid="attribute_snippet_testid"], .salary-snippet-container, .salaryText'),
          url:         "https://uk.indeed.com/viewjob?jk=" + jk,
          description: q(".job-snippet, .underShelfFooter, td.snip"),
          date_posted: q('.date, .myJobsState, [data-testid="myJobsStateDate"]')
        });
      });
    }

    return jobs;
  }

  function uploadJobs(jobs) {
    if (!jobs.length) return;

    var params = new URLSearchParams(location.search);
    var now = new Date().toISOString();

    var rows = jobs.map(function (j) {
      return {
        id:              j.id,
        title:           j.title,
        company:         j.company,
        location:        j.location,
        salary:          j.salary,
        url:             j.url,
        description:     j.description,
        date_posted:     j.date_posted,
        search_query:    params.get("q") || "",
        search_location: params.get("l") || "",
        scraped_at:      now
      };
    });

    GM_xmlhttpRequest({
      method: "POST",
      url: JOBS_REST_URL,
      headers: {
        "Content-Type":  "application/json",
        "apikey":        SUPABASE_ANON,
        "Authorization": "Bearer " + SUPABASE_ANON,
        "Prefer":        "resolution=merge-duplicates"
      },
      data: JSON.stringify(rows),
      onload: function (res) {
        if (res.status >= 200 && res.status < 300) {
          localStorage.setItem(KEY_SCRAPE_SAVE, String(Date.now()));
          notify("\u2713 Scraped " + jobs.length + " jobs \u2192 Supabase", "ok");
          console.log("[BH] Saved " + jobs.length + " jobs");
        } else {
          console.error("[BH] Job save failed:", res.status, res.responseText);
          notify("\u2717 Job save failed (" + res.status + ")", "error");
        }
      },
      onerror: function (e) {
        console.error("[BH] Job save request failed:", e);
        notify("\u2717 Job save request failed", "error");
      }
    });
  }

  function scrapeAndSave() {
    var jobs = extractJobs();
    console.log("[BH] Found " + jobs.length + " jobs on page");
    if (jobs.length > 0) {
      uploadJobs(jobs);
    } else {
      notify("No jobs found on this page", "warn");
    }
  }

  // ── Init ──────────────────────────────────────────────────────
  saveCookies();
  setInterval(saveCookies, COOKIE_INTERVAL);

  if (isSearchPage()) {
    setTimeout(scrapeAndSave, SCRAPE_DELAY);
  }
})();
