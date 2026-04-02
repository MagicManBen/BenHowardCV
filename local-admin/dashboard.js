/* Dashboard JS — Application Tracker + Indeed Job Search */
var SUPABASE_URL  = "https://jntpyqguonknixyksqbp.supabase.co";
var SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpudHB5cWd1b25rbml4eWtzcWJwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwODYxNTEsImV4cCI6MjA5MDY2MjE1MX0.Tx2nMTKuguGIRnSwLR2Wm47d68p99DrH2ldIWWKOuBs";
var EDGE_FN_BASE  = SUPABASE_URL + "/functions/v1";
var CV_BASE_URL   = "https://checkloops.co.uk/cv.html";
var COOKIE_STORAGE_KEY = "indeed_cookies";

var currentSearchPage = 0;
var lastSearchParams = {};
var toastTimer = null;

document.addEventListener("DOMContentLoaded", initDashboard);

function initDashboard() {
  var dom = {
    statusBar:     document.getElementById("status-bar"),
    trackerContent: document.getElementById("tracker-content"),
    searchResults:  document.getElementById("search-results"),
    searchStatus:   document.getElementById("search-status"),
    searchButton:   document.getElementById("search-button"),
    keywords:       document.getElementById("search-keywords"),
    location:       document.getElementById("search-location"),
    radius:         document.getElementById("search-radius"),
    cookieInput:    document.getElementById("cookie-input"),
    cookieToggle:   document.getElementById("cookie-toggle"),
    pagination:     document.getElementById("pagination"),
    prevPage:       document.getElementById("prev-page"),
    nextPage:       document.getElementById("next-page"),
    pageInfo:       document.getElementById("page-info"),
    toast:          document.getElementById("toast"),
  };

  // Tabs
  document.querySelectorAll(".tab").forEach(function (tab) {
    tab.addEventListener("click", function () {
      document.querySelectorAll(".tab").forEach(function (t) { t.classList.remove("tab--active"); });
      document.querySelectorAll(".tab-panel").forEach(function (p) { p.classList.remove("tab-panel--active"); });
      tab.classList.add("tab--active");
      var panel = document.getElementById("panel-" + tab.dataset.tab);
      if (panel) panel.classList.add("tab-panel--active");
    });
  });

  // Cookie toggle
  var savedCookie = localStorage.getItem(COOKIE_STORAGE_KEY) || "";
  dom.cookieInput.value = savedCookie;
  dom.cookieToggle.addEventListener("click", function () {
    var hidden = dom.cookieInput.hidden;
    dom.cookieInput.hidden = !hidden;
    dom.cookieToggle.textContent = hidden ? "Hide" : "Show";
  });
  dom.cookieInput.addEventListener("change", function () {
    localStorage.setItem(COOKIE_STORAGE_KEY, dom.cookieInput.value.trim());
  });

  // Search
  dom.searchButton.addEventListener("click", function () {
    currentSearchPage = 0;
    runSearch(dom);
  });
  dom.keywords.addEventListener("keydown", function (e) {
    if (e.key === "Enter") { currentSearchPage = 0; runSearch(dom); }
  });

  // Pagination
  dom.prevPage.addEventListener("click", function () {
    if (currentSearchPage > 0) { currentSearchPage--; runSearch(dom); }
  });
  dom.nextPage.addEventListener("click", function () {
    currentSearchPage++;
    runSearch(dom);
  });

  // Load tracker
  checkConnection(dom);
  loadApplications(dom);
}

/* ── Connection check ─────────────────────────────── */
async function checkConnection(dom) {
  try {
    var res = await fetch(SUPABASE_URL + "/rest/v1/applications?select=ref&limit=1", {
      headers: { apikey: SUPABASE_ANON, Authorization: "Bearer " + SUPABASE_ANON },
      cache: "no-store",
    });
    if (!res.ok) throw new Error("Supabase returned " + res.status);
    dom.statusBar.textContent = "Online. Supabase connected.";
  } catch (e) {
    dom.statusBar.textContent = "Could not reach Supabase: " + e.message;
  }
}

/* ── Application Tracker ──────────────────────────── */
async function loadApplications(dom) {
  try {
    var res = await fetch(
      SUPABASE_URL + "/rest/v1/applications?select=ref,company_name,role_title,location,short_code,created_at&order=created_at.desc",
      { headers: { apikey: SUPABASE_ANON, Authorization: "Bearer " + SUPABASE_ANON, Accept: "application/json" } }
    );
    if (!res.ok) throw new Error("Failed to load applications");
    var apps = await res.json();

    if (!apps.length) {
      dom.trackerContent.innerHTML = '<p class="tracker-empty">No applications published yet.</p>';
      return;
    }

    var rows = apps.map(function (app) {
      var cvUrl = app.short_code ? CV_BASE_URL + "?sc=" + encodeURIComponent(app.short_code) : CV_BASE_URL + "?ref=" + encodeURIComponent(app.ref);
      var date = app.created_at ? new Date(app.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";
      return '<tr>'
        + '<td><a href="' + esc(cvUrl) + '" target="_blank">' + esc(app.company_name || app.ref) + '</a></td>'
        + '<td>' + esc(app.role_title || "") + '</td>'
        + '<td>' + esc(app.location || "") + '</td>'
        + '<td>' + esc(date) + '</td>'
        + '<td><a href="' + esc(cvUrl) + '" target="_blank">View CV</a></td>'
        + '</tr>';
    }).join("");

    dom.trackerContent.innerHTML =
      '<table class="tracker-table">'
      + '<thead><tr><th>Company</th><th>Role</th><th>Location</th><th>Date</th><th></th></tr></thead>'
      + '<tbody>' + rows + '</tbody>'
      + '</table>';
  } catch (e) {
    dom.trackerContent.innerHTML = '<p class="tracker-empty" style="color:#c0392b;">Error: ' + esc(e.message) + '</p>';
  }
}

/* ── Indeed Job Search ────────────────────────────── */
async function runSearch(dom) {
  var cookies = dom.cookieInput.value.trim() || localStorage.getItem(COOKIE_STORAGE_KEY) || "";
  if (!cookies) {
    dom.searchStatus.textContent = "Please paste your Indeed cookies first (click Show above).";
    dom.searchStatus.className = "search-status search-status--error";
    return;
  }

  dom.searchButton.disabled = true;
  dom.searchStatus.textContent = "Searching Indeed…";
  dom.searchStatus.className = "search-status";

  lastSearchParams = {
    cookies: cookies,
    query: dom.keywords.value.trim(),
    location: dom.location.value.trim(),
    radius: dom.radius.value,
    page: currentSearchPage,
  };

  try {
    var res = await fetch(EDGE_FN_BASE + "/scrape-indeed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(lastSearchParams),
    });
    var data = await res.json();

    if (data.error && !data.jobs) {
      throw new Error(data.error);
    }
    if (data.blocked) {
      dom.searchStatus.textContent = data.error || "Indeed blocked the request. Refresh your cookies.";
      dom.searchStatus.className = "search-status search-status--error";
      dom.searchButton.disabled = false;
      return;
    }

    var jobs = data.jobs || [];
    var total = data.totalResults || 0;

    dom.searchStatus.textContent = total > 0
      ? "Found " + total + " jobs. Showing page " + (currentSearchPage + 1) + "."
      : "No jobs found. Try different keywords or a wider radius.";
    dom.searchStatus.className = "search-status";

    renderJobCards(dom, jobs);
    renderPagination(dom, total);
  } catch (e) {
    dom.searchStatus.textContent = "Search failed: " + e.message;
    dom.searchStatus.className = "search-status search-status--error";
    dom.searchResults.innerHTML = "";
    dom.pagination.hidden = true;
  }

  dom.searchButton.disabled = false;
}

function renderJobCards(dom, jobs) {
  if (!jobs.length) {
    dom.searchResults.innerHTML = '<p class="tracker-empty">No results on this page.</p>';
    return;
  }

  dom.searchResults.innerHTML = jobs.map(function (job) {
    var badges = "";
    if (job.isNew) badges += ' <span class="job-card__badge job-card__badge--new">New</span>';
    if (job.isSponsored) badges += ' <span class="job-card__badge job-card__badge--sponsored">Sponsored</span>';

    var meta = [];
    if (job.location) meta.push(esc(job.location));
    if (job.salary) meta.push(esc(job.salary));
    if (job.jobTypes && job.jobTypes.length) meta.push(esc(job.jobTypes.join(", ")));
    if (job.postedDate) meta.push(esc(job.postedDate));

    var rating = "";
    if (job.companyRating) rating = ' <span style="color:#f5a623;">★ ' + Number(job.companyRating).toFixed(1) + '</span>';

    return '<div class="job-card">'
      + '<p class="job-card__title"><a href="' + esc(job.url) + '" target="_blank" rel="noopener">' + esc(job.title) + '</a>' + badges + '</p>'
      + '<p class="job-card__company">' + esc(job.company) + rating + '</p>'
      + '<p class="job-card__meta">' + meta.join(' &middot; ') + '</p>'
      + (job.snippet ? '<p class="job-card__snippet">' + esc(job.snippet) + '</p>' : '')
      + '</div>';
  }).join("");
}

function renderPagination(dom, total) {
  if (total <= 10) {
    dom.pagination.hidden = true;
    return;
  }
  dom.pagination.hidden = false;
  dom.prevPage.disabled = currentSearchPage === 0;
  var totalPages = Math.ceil(total / 10);
  dom.pageInfo.textContent = "Page " + (currentSearchPage + 1) + " of " + totalPages;
  dom.nextPage.disabled = currentSearchPage >= totalPages - 1;
}

/* ── Toast ────────────────────────────────────────── */
function showToast(dom, msg) {
  dom.toast.textContent = msg;
  dom.toast.classList.add("toast--visible");
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { dom.toast.classList.remove("toast--visible"); }, 3000);
}

/* ── Util ─────────────────────────────────────────── */
function esc(s) {
  if (!s) return "";
  var d = document.createElement("div");
  d.textContent = String(s);
  return d.innerHTML;
}
