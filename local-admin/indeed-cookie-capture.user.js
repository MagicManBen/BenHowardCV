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

  var SAVE_COOKIES_URL = "https://jntpyqguonknixyksqbp.supabase.co/functions/v1/save-cookies";
  var SUPABASE_REST = "https://jntpyqguonknixyksqbp.supabase.co/rest/v1/indeed_jobs";
  var SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpudHB5cWd1b25rbml4eWtzcWJwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwODYxNTEsImV4cCI6MjA5MDY2MjE1MX0.Tx2nMTKuguGIRnSwLR2Wm47d68p99DrH2ldIWWKOuBs";
  var CHECK_INTERVAL = 5000;
  var LAST_SAVE_KEY = "bh_indeed_cookie_last_save";
  var LAST_SCRAPE_KEY = "bh_indeed_scrape_last";

  // ── Notification helper ───────────────────────────────────────
  function showNotification(msg, color) {
    var bg = color || "#155724";
    var el = document.createElement("div");
    el.textContent = msg;
    el.style.cssText =
      "position:fixed;top:10px;right:10px;z-index:999999;background:" + bg + ";" +
      "color:#fff;padding:8px 16px;border-radius:6px;font-size:13px;" +
      "font-family:system-ui;box-shadow:0 2px 8px rgba(0,0,0,0.3);" +
      "transition:opacity 0.3s;";
    document.body.appendChild(el);
    setTimeout(function () {
      el.style.opacity = "0";
      setTimeout(function () { el.remove(); }, 400);
    }, 4000);
  }

  // ── Cookie capture ────────────────────────────────────────────
  function isLoggedIn() {
    return document.cookie.length > 20;
  }

  function shouldSaveCookies() {
    var last = localStorage.getItem(LAST_SAVE_KEY);
    if (!last) return true;
    return Date.now() - parseInt(last, 10) > 600000; // 10 min
  }

  function saveCookies() {
    var cookies = document.cookie;
    if (!cookies) return;

    GM_xmlhttpRequest({
      method: "POST",
      url: SAVE_COOKIES_URL,
      headers: { "Content-Type": "application/json" },
      data: JSON.stringify({ source: "indeed", cookies: cookies }),
      onload: function (response) {
        try {
          var data = JSON.parse(response.responseText);
          if (data.ok) {
            localStorage.setItem(LAST_SAVE_KEY, String(Date.now()));
            console.log("[BH] Cookies saved");
          }
        } catch (e) {
          console.error("[BH] Cookie save parse error:", e);
        }
      },
      onerror: function (err) {
        console.error("[BH] Cookie save failed:", err);
      },
    });
  }

  // ── Job scraping ──────────────────────────────────────────────
  function isSearchPage() {
    return /\/(jobs|search)/.test(window.location.pathname) ||
           window.location.search.indexOf("q=") !== -1;
  }

  function extractJobs() {
    var jobs = [];
    var seen = {};

    // Try mosaic data first (Indeed embeds JSON in script tags)
    var scripts = document.querySelectorAll("script");
    for (var i = 0; i < scripts.length; i++) {
      var text = scripts[i].textContent;
      if (text.indexOf("mosaic-provider-jobcards") !== -1 ||
          text.indexOf("jobResults") !== -1) {
        try {
          // Extract JSON array of results from mosaic data
          var match = text.match(/"results"\s*:\s*(\[[\s\S]*?\])\s*,\s*"/);
          if (match) {
            var results = JSON.parse(match[1]);
            for (var j = 0; j < results.length; j++) {
              var r = results[j];
              if (r.jobkey && !seen[r.jobkey]) {
                seen[r.jobkey] = true;
                jobs.push({
                  id: r.jobkey,
                  title: r.title || r.displayTitle || "",
                  company: r.company || (r.companyName) || "",
                  location: r.formattedLocation || r.jobLocationCity || "",
                  salary: r.salarySnippet ? (r.salarySnippet.text || "") : (r.extractedSalary ? ("£" + r.extractedSalary.min + " - £" + r.extractedSalary.max) : ""),
                  url: "https://uk.indeed.com/viewjob?jk=" + r.jobkey,
                  description: r.snippet || "",
                  date_posted: r.formattedRelativeTime || ""
                });
              }
            }
          }
        } catch (e) {
          console.log("[BH] Mosaic parse failed, falling back to DOM:", e);
        }
      }
    }

    // Fallback: parse DOM job cards
    if (jobs.length === 0) {
      var cards = document.querySelectorAll('[data-jk], .job_seen_beacon, .resultContent, .jobsearch-ResultsList > li');
      cards.forEach(function (card) {
        var jk = card.getAttribute("data-jk");
        if (!jk) {
          var link = card.querySelector("a[data-jk]");
          if (link) jk = link.getAttribute("data-jk");
        }
        if (!jk || seen[jk]) return;
        seen[jk] = true;

        var titleEl = card.querySelector("h2.jobTitle a, h2 a, .jobTitle > a, a.jcs-JobTitle");
        var companyEl = card.querySelector('[data-testid="company-name"], .companyName, .company');
        var locationEl = card.querySelector('[data-testid="text-location"], .companyLocation, .location');
        var salaryEl = card.querySelector('[data-testid="attribute_snippet_testid"], .salary-snippet-container, .salaryText');
        var snippetEl = card.querySelector(".job-snippet, .underShelfFooter, td.snip");
        var dateEl = card.querySelector(".date, .myJobsState");

        jobs.push({
          id: jk,
          title: titleEl ? titleEl.textContent.trim() : "",
          company: companyEl ? companyEl.textContent.trim() : "",
          location: locationEl ? locationEl.textContent.trim() : "",
          salary: salaryEl ? salaryEl.textContent.trim() : "",
          url: "https://uk.indeed.com/viewjob?jk=" + jk,
          description: snippetEl ? snippetEl.textContent.trim() : "",
          date_posted: dateEl ? dateEl.textContent.trim() : ""
        });
      });
    }

    return jobs;
  }

  function saveJobs(jobs) {
    if (jobs.length === 0) return;

    // Get search params for metadata
    var params = new URLSearchParams(window.location.search);
    var searchQuery = params.get("q") || "";
    var searchLocation = params.get("l") || "";
    var now = new Date().toISOString();

    var rows = jobs.map(function (j) {
      return {
        id: j.id,
        title: j.title,
        company: j.company,
        location: j.location,
        salary: j.salary,
        url: j.url,
        description: j.description,
        date_posted: j.date_posted,
        search_query: searchQuery,
        search_location: searchLocation,
        scraped_at: now
      };
    });

    GM_xmlhttpRequest({
      method: "POST",
      url: SUPABASE_REST,
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_ANON,
        "Authorization": "Bearer " + SUPABASE_ANON,
        "Prefer": "resolution=merge-duplicates"
      },
      data: JSON.stringify(rows),
      onload: function (response) {
        if (response.status >= 200 && response.status < 300) {
          localStorage.setItem(LAST_SCRAPE_KEY, String(Date.now()));
          showNotification("✓ Scraped " + jobs.length + " jobs → Supabase", "#155724");
          console.log("[BH] Saved " + jobs.length + " jobs to Supabase");
        } else {
          console.error("[BH] Job save failed:", response.status, response.responseText);
          showNotification("✗ Job save failed (" + response.status + ")", "#721c24");
        }
      },
      onerror: function (err) {
        console.error("[BH] Job save request failed:", err);
        showNotification("✗ Job save request failed", "#721c24");
      }
    });
  }

  function scrapeAndSave() {
    var jobs = extractJobs();
    console.log("[BH] Found " + jobs.length + " jobs on page");
    if (jobs.length > 0) {
      saveJobs(jobs);
    } else {
      showNotification("No jobs found on this page", "#856404");
    }
  }

  // ── Init ──────────────────────────────────────────────────────

  // Always try cookie save
  if (isLoggedIn() && shouldSaveCookies()) {
    saveCookies();
  }

  // Periodic cookie save
  setInterval(function () {
    if (isLoggedIn() && shouldSaveCookies()) {
      saveCookies();
    }
  }, CHECK_INTERVAL);

  // Auto-scrape search results after page load
  if (isSearchPage()) {
    // Wait a moment for Indeed to finish rendering
    setTimeout(function () {
      scrapeAndSave();
    }, 2000);
  }

})();
