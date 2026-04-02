(function() {
  function esc(value) {
    if (value === null || value === undefined) return "";
    var node = document.createElement("div");
    node.textContent = String(value);
    return node.innerHTML;
  }

  function fmtDate(value) {
    if (!value) return "";
    try {
      return new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    } catch (error) {
      return String(value);
    }
  }

  function isRecent(value, days) {
    if (!value) return false;
    try {
      return Date.now() - new Date(value).getTime() < days * 86400000;
    } catch (error) {
      return false;
    }
  }

  function isClosingSoon(value) {
    if (!value) return false;
    try {
      var delta = (new Date(value).getTime() - Date.now()) / 86400000;
      return delta >= 0 && delta <= 7;
    } catch (error) {
      return false;
    }
  }

  function setStatus(dotId, labelId, color, text) {
    var dot = document.getElementById(dotId);
    var label = document.getElementById(labelId);
    if (dot) dot.className = "status-dot status-dot--" + color;
    if (label) label.textContent = text;
  }

  function renderBadges(badges) {
    return (badges || []).map(function(badge) {
      return '<span class="badge badge--' + esc(badge.tone || "neutral") + '">' + esc(badge.label) + "</span>";
    }).join("");
  }

  function renderJobs(targetId, jobs, options) {
    options = options || {};
    var target = document.getElementById(targetId);
    if (!target) return;
    if (!jobs || !jobs.length) {
      target.innerHTML = '<p class="empty-msg">' + esc(options.emptyText || "No results.") + "</p>";
      return;
    }

    var summary = options.summary ? '<div class="results-header"><p class="result-count">' + esc(options.summary) + "</p></div>" : "";
    var cards = jobs.map(function(job) {
      var company = job.company || "";
      var location = job.location || "";
      var salary = job.salary || "";
      var source = job.source || "";
      var metaLine = [source, company, location, salary].filter(Boolean).join(" · ");
      var subMeta = [job.dateText, job.metaText].filter(Boolean).join(" · ");
      var actions = [];
      if (job.url) actions.push('<a href="' + esc(job.url) + '" target="_blank" rel="noopener noreferrer">Open advert</a>');
      if (job.applyUrl) actions.push('<a href="' + esc(job.applyUrl) + '" target="_blank" rel="noopener noreferrer">Direct link</a>');
      return ''
        + '<article class="job-card">'
        + '<h3><a href="' + esc(job.url || "#") + '" target="_blank" rel="noopener noreferrer">' + esc(job.title || "Untitled") + "</a>" + renderBadges(job.badges) + "</h3>"
        + (metaLine ? '<div class="meta">' + esc(metaLine) + "</div>" : "")
        + (subMeta ? '<div class="meta-row">' + esc(subMeta) + "</div>" : "")
        + (job.description ? '<div class="description">' + esc(job.description) + "</div>" : "")
        + (actions.length ? '<div class="actions">' + actions.join("") + "</div>" : "")
        + "</article>";
    }).join("");

    target.innerHTML = summary + '<div class="jobs-grid">' + cards + "</div>";
  }

  function renderApplicationsTable(targetId, applications, cvBase, options) {
    options = options || {};
    var target = document.getElementById(targetId);
    if (!target) return;
    if (!applications || !applications.length) {
      target.innerHTML = '<p class="empty-msg">No applications yet.</p>';
      return;
    }

    var rows = applications.map(function(app) {
      var ref = app.ref || "";
      var company = app.company_name || app.companyName || ref;
      var role = app.role_title || app.roleTitle || "";
      var location = app.location || "";
      var shortCode = app.short_code || app.shortCode || "";
      var createdRaw = app.created_at || app.createdAt || "";
      var cvUrl = shortCode ? cvBase + "?sc=" + encodeURIComponent(shortCode) : cvBase + "?ref=" + encodeURIComponent(ref);
      var created = createdRaw ? fmtDate(createdRaw) : "";
      var deleteCell = options.showDelete
        ? '<button class="table-delete-btn app-delete-btn" data-ref="' + esc(ref) + '" data-company="' + esc(company) + '">Delete</button>'
        : '<a href="' + esc(cvUrl) + '" target="_blank" rel="noopener noreferrer">View CV</a>';
      return "<tr>"
        + '<td><a href="' + esc(cvUrl) + '" target="_blank" rel="noopener noreferrer">' + esc(company) + "</a></td>"
        + "<td>" + esc(role) + "</td>"
        + "<td>" + esc(location) + "</td>"
        + "<td>" + esc(created) + "</td>"
        + "<td>" + deleteCell + "</td>"
        + "</tr>";
    }).join("");

    target.innerHTML =
      '<div class="results-header"><p class="result-count">' + esc(applications.length + " application(s)") + "</p></div>"
      + '<div class="table-card"><table class="data-table"><thead><tr><th>Company</th><th>Role</th><th>Location</th><th>Date</th><th></th></tr></thead><tbody>'
      + rows
      + "</tbody></table></div>";
  }

  window.JobBoardUI = {
    esc: esc,
    fmtDate: fmtDate,
    isRecent: isRecent,
    isClosingSoon: isClosingSoon,
    setStatus: setStatus,
    renderJobs: renderJobs,
    renderApplicationsTable: renderApplicationsTable
  };
})();
