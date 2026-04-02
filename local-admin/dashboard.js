/* Dashboard JS v2 — Applied Jobs + Unified Multi-Source Job Search */
var SUPABASE_URL  = "https://jntpyqguonknixyksqbp.supabase.co";
var SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpudHB5cWd1b25rbml4eWtzcWJwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwODYxNTEsImV4cCI6MjA5MDY2MjE1MX0.Tx2nMTKuguGIRnSwLR2Wm47d68p99DrH2ldIWWKOuBs";
var EDGE_FN_BASE  = SUPABASE_URL + "/functions/v1";
var CV_BASE_URL   = "https://checkloops.co.uk/cv.html";

var GOOGLE_CLIENT_ID = "160469505712-97u4r4u4p5o611tkgd3au2eto3n6sim0.apps.googleusercontent.com";

/* ── State ────────────────────────────────────────── */
var allJobs = [];          // merged results from all sources
var activeFilter = "all";  // current source filter
var sourceResults = { indeed: [], nhs: [], google: [] };
var sourceTotals  = { indeed: 0, nhs: 0, google: 0 };
var sourceErrors  = { indeed: null, nhs: null, google: null };
var currentPage   = { indeed: 0, nhs: 1, google: 0 };  // indeed/google 0-based, nhs 1-based
var searchInProgress = false;
var toastTimer = null;

document.addEventListener("DOMContentLoaded", initDashboard);

function initDashboard() {
  var dom = getDom();

  // Tab switching
  document.querySelectorAll(".tab").forEach(function (tab) {
    tab.addEventListener("click", function () {
      document.querySelectorAll(".tab").forEach(function (t) { t.classList.remove("tab--active"); });
      document.querySelectorAll(".tab-panel").forEach(function (p) { p.classList.remove("tab-panel--active"); });
      tab.classList.add("tab--active");
      var panel = document.getElementById("panel-" + tab.dataset.tab);
      if (panel) panel.classList.add("tab-panel--active");
    });
  });

  // Source filter pills
  document.querySelectorAll(".source-pill").forEach(function (pill) {
    pill.addEventListener("click", function () {
      document.querySelectorAll(".source-pill").forEach(function (p) { p.classList.remove("source-pill--active"); });
      pill.classList.add("source-pill--active");
      activeFilter = pill.dataset.source;
      renderFilteredResults(dom);
    });
  });

  // Search button
  dom.searchButton.addEventListener("click", function () { runUnifiedSearch(dom); });
  dom.keywords.addEventListener("keydown", function (e) {
    if (e.key === "Enter") runUnifiedSearch(dom);
  });

  // Pagination
  dom.prevPage.addEventListener("click", function () { pageNav(dom, -1); });
  dom.nextPage.addEventListener("click", function () { pageNav(dom, 1); });

  // Google OAuth callback check
  handleGoogleCallback(dom);

  // Google connect button
  dom.googleConnectBtn.addEventListener("click", function () { startGoogleAuth(); });

  // Initial loads
  checkConnection(dom);
  loadApplications(dom);
  checkSourceStatuses(dom);
}

function getDom() {
  return {
    statusBar:       document.getElementById("status-bar"),
    trackerContent:  document.getElementById("tracker-content"),
    searchResults:   document.getElementById("search-results"),
    searchStatus:    document.getElementById("search-status"),
    searchButton:    document.getElementById("search-button"),
    keywords:        document.getElementById("search-keywords"),
    location:        document.getElementById("search-location"),
    radius:          document.getElementById("search-radius"),
    sourceFilters:   document.getElementById("source-filters"),
    pagination:      document.getElementById("pagination"),
    prevPage:        document.getElementById("prev-page"),
    nextPage:        document.getElementById("next-page"),
    pageInfo:        document.getElementById("page-info"),
    toast:           document.getElementById("toast"),
    indeedStatus:    document.getElementById("indeed-status"),
    indeedLoginLink: document.getElementById("indeed-login-link"),
    googleStatus:    document.getElementById("google-status"),
    googleConnectBtn:document.getElementById("google-connect-btn"),
    countAll:        document.getElementById("count-all"),
    countIndeed:     document.getElementById("count-indeed"),
    countNhs:        document.getElementById("count-nhs"),
    countGoogle:     document.getElementById("count-google"),
  };
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

/* ── Check source connection statuses ─────────────── */
async function checkSourceStatuses(dom) {
  // Indeed: check if cookies exist in DB
  try {
    var res = await fetch(EDGE_FN_BASE + "/scrape-indeed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "", location: "", radius: "1", page: 0 }),
    });
    var data = await res.json();
    if (data.needsCookies) {
      dom.indeedStatus.innerHTML = '<span style="color:#856404;">⚠ Cookies expired</span>';
      dom.indeedLoginLink.style.display = "inline";
    } else if (data.blocked) {
      dom.indeedStatus.innerHTML = '<span style="color:#c0392b;">✗ Blocked — cookies expired</span>';
      dom.indeedLoginLink.style.display = "inline";
    } else {
      var msg = "✓ Connected";
      if (data.cookieSource === "database" && data.cookieAge) msg += " (cookies: " + data.cookieAge + " old)";
      dom.indeedStatus.innerHTML = '<span style="color:#155724;">' + msg + '</span>';
      dom.indeedLoginLink.style.display = "none";
    }
  } catch (e) {
    dom.indeedStatus.innerHTML = '<span style="color:#c0392b;">✗ Error checking</span>';
  }

  // Google: check if OAuth tokens exist
  try {
    var gRes = await fetch(EDGE_FN_BASE + "/search-google-jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "status" }),
    });
    var gData = await gRes.json();
    if (gData.connected) {
      dom.googleStatus.innerHTML = '<span style="color:#155724;">✓ Connected</span>';
      dom.googleConnectBtn.style.display = "none";
    } else {
      dom.googleStatus.innerHTML = '<span style="color:#856404;">⚠ Not connected</span>';
      dom.googleConnectBtn.style.display = "inline-block";
    }
  } catch (e) {
    dom.googleStatus.innerHTML = '<span style="color:#c0392b;">✗ Error checking</span>';
  }
}

/* ── Google OAuth flow ────────────────────────────── */
function startGoogleAuth() {
  var redirectUri = window.location.origin + window.location.pathname;
  var url = "https://accounts.google.com/o/oauth2/v2/auth"
    + "?client_id=" + encodeURIComponent(GOOGLE_CLIENT_ID)
    + "&redirect_uri=" + encodeURIComponent(redirectUri)
    + "&response_type=code"
    + "&scope=" + encodeURIComponent("https://www.googleapis.com/auth/jobs")
    + "&access_type=offline"
    + "&prompt=consent";
  window.location.href = url;
}

async function handleGoogleCallback(dom) {
  var params = new URLSearchParams(window.location.search);
  var code = params.get("code");
  if (!code) return;

  // Clean URL
  window.history.replaceState({}, "", window.location.pathname);

  dom.googleStatus.innerHTML = '<span style="color:#856404;">Exchanging token…</span>';

  try {
    var redirectUri = window.location.origin + window.location.pathname;
    var res = await fetch(EDGE_FN_BASE + "/search-google-jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "exchange", code: code, redirect_uri: redirectUri }),
    });
    var data = await res.json();
    if (data.ok) {
      dom.googleStatus.innerHTML = '<span style="color:#155724;">✓ Connected</span>';
      dom.googleConnectBtn.style.display = "none";
      showToast(dom, "Google connected successfully");
    } else {
      dom.googleStatus.innerHTML = '<span style="color:#c0392b;">✗ ' + esc(data.error) + '</span>';
      dom.googleConnectBtn.style.display = "inline-block";
    }
  } catch (e) {
    dom.googleStatus.innerHTML = '<span style="color:#c0392b;">✗ Token exchange failed</span>';
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

/* ── Unified Search — fires all sources in parallel ── */
async function runUnifiedSearch(dom) {
  if (searchInProgress) return;
  searchInProgress = true;
  dom.searchButton.disabled = true;
  dom.searchButton.textContent = "Searching…";
  dom.searchStatus.innerHTML = '<span class="loading-spinner"></span> Searching all sources…';
  dom.searchStatus.className = "search-status";
  dom.searchResults.innerHTML = "";
  dom.sourceFilters.style.display = "none";
  dom.pagination.hidden = true;

  var query    = dom.keywords.value.trim();
  var location = dom.location.value.trim();
  var radius   = dom.radius.value;

  // Reset state
  sourceResults = { indeed: [], nhs: [], google: [] };
  sourceTotals  = { indeed: 0, nhs: 0, google: 0 };
  sourceErrors  = { indeed: null, nhs: null, google: null };
  currentPage   = { indeed: 0, nhs: 1, google: 0 };
  activeFilter  = "all";

  // Fire all three requests in parallel
  var promises = [
    searchIndeed(query, location, radius, 0),
    searchNHS(query, location, radius, 1),
    searchGoogle(query, location, radius),
  ];

  await Promise.allSettled(promises);

  // Merge and display
  mergeResults();
  updateCounts(dom);
  renderFilteredResults(dom);

  // Status summary
  var parts = [];
  if (sourceResults.indeed.length) parts.push(sourceTotals.indeed + " Indeed");
  if (sourceResults.nhs.length)    parts.push(sourceTotals.nhs + " NHS");
  if (sourceResults.google.length) parts.push(sourceTotals.google + " Google");

  var errorParts = [];
  if (sourceErrors.indeed) errorParts.push("Indeed: " + sourceErrors.indeed);
  if (sourceErrors.nhs)    errorParts.push("NHS: " + sourceErrors.nhs);
  if (sourceErrors.google) errorParts.push("Google: " + sourceErrors.google);

  var statusMsg = parts.length ? "Found: " + parts.join(", ") + "." : "No results found.";
  if (errorParts.length) statusMsg += " Errors: " + errorParts.join("; ");

  dom.searchStatus.textContent = statusMsg;
  dom.searchStatus.className = errorParts.length && !parts.length ? "search-status search-status--error" : "search-status";
  dom.searchButton.disabled = false;
  dom.searchButton.textContent = "Search All Sources";
  searchInProgress = false;
}

/* ── Individual source search functions ───────────── */
async function searchIndeed(query, location, radius, page) {
  try {
    var res = await fetch(EDGE_FN_BASE + "/scrape-indeed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: query, location: location, radius: radius, page: page }),
    });
    var data = await res.json();

    if (data.needsCookies || data.blocked) {
      sourceErrors.indeed = data.error || "Cookies expired — log in to Indeed";
      return;
    }
    if (data.error && !data.jobs) {
      sourceErrors.indeed = data.error;
      return;
    }

    sourceResults.indeed = (data.jobs || []).map(function (j) {
      j._source = "indeed";
      return j;
    });
    sourceTotals.indeed = data.totalResults || sourceResults.indeed.length;
  } catch (e) {
    sourceErrors.indeed = e.message;
  }
}

async function searchNHS(query, location, radius, page) {
  try {
    // NHS uses distance in miles, and the location name (not postcode)
    var res = await fetch(EDGE_FN_BASE + "/search-nhs-jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        keyword: query,
        location: location,
        distance: radius,
        page: page,
        limit: 20,
        sort: "publicationDateDesc",
      }),
    });
    var data = await res.json();

    if (data.error) {
      sourceErrors.nhs = data.error;
      return;
    }

    sourceResults.nhs = (data.jobs || []).map(function (j) {
      return {
        _source: "nhs",
        title: j.title,
        company: j.employer,
        location: j.location,
        salary: j.salary,
        snippet: j.description,
        url: j.url,
        postedDate: j.postDate ? formatDate(j.postDate) : "",
        closeDate: j.closeDate,
        type: j.type,
        isNew: isRecentDate(j.postDate, 3),
      };
    });
    sourceTotals.nhs = data.totalResults || sourceResults.nhs.length;
  } catch (e) {
    sourceErrors.nhs = e.message;
  }
}

async function searchGoogle(query, location, radius) {
  try {
    var res = await fetch(EDGE_FN_BASE + "/search-google-jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "search",
        query: query,
        location: location,
        distance: parseInt(radius, 10),
      }),
    });
    var data = await res.json();

    if (data.needsAuth) {
      sourceErrors.google = "Not connected — click Connect Google in Settings";
      return;
    }
    if (data.error) {
      sourceErrors.google = data.error;
      return;
    }

    sourceResults.google = (data.jobs || []).map(function (j) {
      return {
        _source: "google",
        title: j.title,
        company: j.company,
        location: j.location,
        salary: j.salary,
        snippet: j.description,
        url: j.url,
        postedDate: j.postDate ? formatDate(j.postDate) : "",
        type: j.type,
      };
    });
    sourceTotals.google = data.totalResults || sourceResults.google.length;
  } catch (e) {
    sourceErrors.google = e.message;
  }
}

/* ── Merge and render ─────────────────────────────── */
function mergeResults() {
  allJobs = []
    .concat(sourceResults.indeed)
    .concat(sourceResults.nhs)
    .concat(sourceResults.google);
}

function updateCounts(dom) {
  var iCount = sourceResults.indeed.length;
  var nCount = sourceResults.nhs.length;
  var gCount = sourceResults.google.length;
  dom.countAll.textContent    = "(" + (iCount + nCount + gCount) + ")";
  dom.countIndeed.textContent = "(" + iCount + ")";
  dom.countNhs.textContent    = "(" + nCount + ")";
  dom.countGoogle.textContent = "(" + gCount + ")";
  dom.sourceFilters.style.display = "flex";

  // Reset active pill
  document.querySelectorAll(".source-pill").forEach(function (p) {
    p.classList.toggle("source-pill--active", p.dataset.source === activeFilter);
  });
}

function renderFilteredResults(dom) {
  var jobs = activeFilter === "all" ? allJobs : allJobs.filter(function (j) { return j._source === activeFilter; });

  if (!jobs.length) {
    var msg = activeFilter === "all" ? "No results found." : "No " + activeFilter + " results.";
    if (sourceErrors[activeFilter]) msg = sourceErrors[activeFilter];
    dom.searchResults.innerHTML = '<p class="tracker-empty">' + esc(msg) + '</p>';
    dom.pagination.hidden = true;
    return;
  }

  dom.searchResults.innerHTML = jobs.map(function (job) { return renderJobCard(job); }).join("");

  // Pagination (simple: show if any source has more results)
  var showPagination = false;
  if (activeFilter === "indeed" || activeFilter === "all") showPagination = showPagination || (sourceTotals.indeed > sourceResults.indeed.length);
  if (activeFilter === "nhs" || activeFilter === "all")    showPagination = showPagination || (sourceTotals.nhs > sourceResults.nhs.length);
  dom.pagination.hidden = !showPagination;
}

function renderJobCard(job) {
  var source = job._source || "unknown";
  var sourceBadge = '<span class="source-badge source-badge--' + source + '">' + source.toUpperCase() + '</span>';

  var badges = "";
  if (job.isNew) badges += ' <span class="job-card__badge job-card__badge--new">New</span>';
  if (job.isSponsored) badges += ' <span class="job-card__badge job-card__badge--sponsored">Sponsored</span>';
  if (job.closeDate && isClosingSoon(job.closeDate)) {
    badges += ' <span class="job-card__badge job-card__badge--closing">Closing ' + esc(job.closeDate) + '</span>';
  }

  var meta = [];
  if (job.location) meta.push(esc(job.location));
  if (job.salary) meta.push(esc(job.salary));
  if (job.type) meta.push(esc(job.type));
  if (job.jobTypes && job.jobTypes.length) meta.push(esc(job.jobTypes.join(", ")));
  if (job.postedDate) meta.push(esc(job.postedDate));

  var rating = "";
  if (job.companyRating) rating = ' <span style="color:#f5a623;">★ ' + Number(job.companyRating).toFixed(1) + '</span>';

  return '<div class="job-card">'
    + '<p class="job-card__title"><a href="' + esc(job.url) + '" target="_blank" rel="noopener">' + esc(job.title) + '</a>' + sourceBadge + badges + '</p>'
    + '<p class="job-card__company">' + esc(job.company) + rating + '</p>'
    + '<p class="job-card__meta">' + meta.join(' &middot; ') + '</p>'
    + (job.snippet ? '<p class="job-card__snippet">' + esc(job.snippet) + '</p>' : '')
    + '</div>';
}

/* ── Pagination ───────────────────────────────────── */
function pageNav(dom, direction) {
  var query    = dom.keywords.value.trim();
  var location = dom.location.value.trim();
  var radius   = dom.radius.value;

  // Page the active source (or all sources)
  if (activeFilter === "indeed" || activeFilter === "all") {
    currentPage.indeed += direction;
    if (currentPage.indeed < 0) currentPage.indeed = 0;
  }
  if (activeFilter === "nhs" || activeFilter === "all") {
    currentPage.nhs += direction;
    if (currentPage.nhs < 1) currentPage.nhs = 1;
  }

  dom.searchStatus.innerHTML = '<span class="loading-spinner"></span> Loading page…';
  dom.searchButton.disabled = true;

  var promises = [];
  if (activeFilter === "indeed" || activeFilter === "all") {
    promises.push(searchIndeed(query, location, radius, currentPage.indeed));
  }
  if (activeFilter === "nhs" || activeFilter === "all") {
    promises.push(searchNHS(query, location, radius, currentPage.nhs));
  }

  Promise.allSettled(promises).then(function () {
    mergeResults();
    updateCounts(dom);
    renderFilteredResults(dom);
    dom.searchStatus.textContent = "Page loaded.";
    dom.searchButton.disabled = false;
  });
}

/* ── Toast ────────────────────────────────────────── */
function showToast(dom, msg) {
  dom.toast.textContent = msg;
  dom.toast.classList.add("is-visible");
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { dom.toast.classList.remove("is-visible"); }, 3000);
}

/* ── Utilities ────────────────────────────────────── */
function esc(s) {
  if (!s) return "";
  var d = document.createElement("div");
  d.textContent = String(s);
  return d.innerHTML;
}

function formatDate(dateStr) {
  try {
    var d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  } catch (e) {
    return dateStr;
  }
}

function isRecentDate(dateStr, days) {
  if (!dateStr) return false;
  try {
    var d = new Date(dateStr);
    return (Date.now() - d.getTime()) < days * 86400000;
  } catch (e) {
    return false;
  }
}

function isClosingSoon(dateStr) {
  if (!dateStr) return false;
  try {
    var d = new Date(dateStr);
    var daysLeft = (d.getTime() - Date.now()) / 86400000;
    return daysLeft >= 0 && daysLeft <= 7;
  } catch (e) {
    return false;
  }
}
