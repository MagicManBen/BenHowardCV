// script.js — Ben Howard CV dashboard
//
// Static GitHub Pages dashboard.
// No server. No Supabase.
// Admin page pastes finished JSON and writes data/{ref}.json via the GitHub API.
// CV preview page fetches data/{ref}.json from GitHub Pages.

const GITHUB_OWNER = "MagicManBen";
const GITHUB_REPO = "BenHowardCV";
const GITHUB_BRANCH = "main";
const CV_BASE_URL = "https://checkloops.co.uk/cv.html";

const CAPABILITY_CARDS = Object.freeze([
  {
    title: "Operations leadership",
    copy: "Visible, hands-on leadership that improves rhythm, standards, and delivery across busy teams."
  },
  {
    title: "Change and improvement",
    copy: "Comfortable translating broad goals into practical structure, clearer processes, and stronger follow-through."
  },
  {
    title: "Data and reporting",
    copy: "Confident using reporting, trend visibility, and performance insight to support better operational decisions."
  },
  {
    title: "People and accountability",
    copy: "Strong on expectations, coaching, and creating the kind of ownership that lifts team consistency."
  }
]);

const CAREER_SNAPSHOT = Object.freeze([
  {
    stage: "Experian",
    summary: "Strengthened reporting, operational clarity, and structured improvement in a high-volume environment."
  },
  {
    stage: "Alton Towers",
    summary: "Worked close to guest-facing operations where pace, standards, and frontline coordination mattered daily."
  },
  {
    stage: "Merlin Entertainments",
    summary: "Built experience across commercial service environments that depend on consistency and high-energy execution."
  },
  {
    stage: "Copper Alloys",
    summary: "Developed process discipline, operational awareness, and an eye for practical improvement."
  },
  {
    stage: "Harley Street Medical Centre",
    summary: "Delivered calm, accurate service in a setting where trust, organisation, and responsiveness were essential."
  }
]);

let toastTimer = null;
let previewDom = null;

document.addEventListener("DOMContentLoaded", () => {
  const page = document.body.dataset.page;

  if (page === "generator") {
    initGeneratorPage();
  }

  if (page === "cv-preview") {
    initCvPreviewPage();
  }
});

function initGeneratorPage() {
  const dom = {
    githubToken: document.getElementById("github-token"),
    saveKeysButton: document.getElementById("save-keys-button"),
    clearKeysButton: document.getElementById("clear-keys-button"),
    keysStatus: document.getElementById("keys-status"),
    jsonInput: document.getElementById("json-input"),
    publishButton: document.getElementById("publish-button"),
    resetJsonButton: document.getElementById("reset-json-button"),
    publishStatus: document.getElementById("publish-status"),
    publishError: document.getElementById("publish-error"),
    statsTotal: document.getElementById("stats-total"),
    statsLatest: document.getElementById("stats-latest"),
    resultPanel: document.getElementById("result-panel"),
    resultEmpty: document.getElementById("result-empty"),
    resultCompany: document.getElementById("result-company"),
    resultRole: document.getElementById("result-role"),
    resultLocation: document.getElementById("result-location"),
    resultRef: document.getElementById("result-ref"),
    resultUrl: document.getElementById("result-url"),
    copyUrlButton: document.getElementById("copy-url-button"),
    openPreviewLink: document.getElementById("open-preview-link"),
    openPdfLink: document.getElementById("open-pdf-link"),
    savedList: document.getElementById("saved-list"),
    rawJsonOutput: document.getElementById("raw-json-output"),
    toast: document.getElementById("toast")
  };

  dom.githubToken.value = localStorage.getItem("cv_github_token") || "";
  updateKeysStatus(dom);

  dom.saveKeysButton.addEventListener("click", () => {
    localStorage.setItem("cv_github_token", dom.githubToken.value.trim());
    updateKeysStatus(dom);
    showToast(dom, "GitHub token saved.");
  });

  dom.clearKeysButton.addEventListener("click", () => {
    localStorage.removeItem("cv_github_token");
    dom.githubToken.value = "";
    updateKeysStatus(dom);
    showToast(dom, "GitHub token cleared.");
  });

  dom.resetJsonButton.addEventListener("click", () => {
    dom.jsonInput.value = "";
    dom.publishError.hidden = true;
    dom.publishError.textContent = "";
    dom.publishStatus.textContent = "Ready.";
    dom.rawJsonOutput.textContent = "No application loaded yet.";
    showToast(dom, "JSON form cleared.");
  });

  dom.copyUrlButton.addEventListener("click", async () => {
    const url = dom.resultUrl.value;
    if (!url) return;

    try {
      await navigator.clipboard.writeText(url);
      showToast(dom, "URL copied.");
    } catch {
      dom.resultUrl.focus();
      dom.resultUrl.select();
      showToast(dom, "Select and copy manually.");
    }
  });

  dom.publishButton.addEventListener("click", () => handleJsonPublish(dom));

  dom.savedList.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const actionButton = target.closest("button[data-action]");
    if (!actionButton) return;

    const action = actionButton.dataset.action;
    const ref = actionButton.dataset.ref;
    if (!action || !ref) return;

    if (action === "copy-url") {
      const url = buildPreviewUrl(ref);
      try {
        await navigator.clipboard.writeText(url);
        showToast(dom, "URL copied.");
      } catch {
        showToast(dom, "Could not copy automatically.");
      }
      return;
    }

    if (action === "load-json") {
      try {
        const application = await fetchApplicationByRef(ref);
        dom.jsonInput.value = JSON.stringify(application, null, 2);
        dom.rawJsonOutput.textContent = JSON.stringify(application, null, 2);
        dom.publishStatus.textContent = `Loaded ${ref} into the editor.`;
        dom.publishError.hidden = true;
        populateResult(dom, application);
        showToast(dom, "Application loaded into editor.");
      } catch (error) {
        showError(dom, error instanceof Error ? error.message : "Could not load that application.");
      }
    }
  });

  loadSavedList(dom);
}

function updateKeysStatus(dom) {
  const hasGithub = Boolean(dom.githubToken.value.trim());
  dom.keysStatus.textContent = hasGithub ? "GitHub token set." : "No GitHub token set.";
}

async function handleJsonPublish(dom) {
  const githubToken = dom.githubToken.value.trim() || localStorage.getItem("cv_github_token") || "";

  dom.publishError.hidden = true;
  dom.publishError.textContent = "";

  if (!githubToken) {
    showError(dom, "Enter your GitHub token first.");
    return;
  }

  const rawText = dom.jsonInput.value.trim();
  if (!rawText) {
    showError(dom, "Paste the application JSON first.");
    return;
  }

  dom.publishButton.disabled = true;
  dom.publishButton.textContent = "Publishing…";
  dom.publishStatus.textContent = "Validating JSON…";

  try {
    const parsed = JSON.parse(rawText);
    const data = normaliseApplicationPayload(parsed);

    dom.rawJsonOutput.textContent = JSON.stringify(data, null, 2);
    dom.publishStatus.textContent = "Saving to GitHub…";

    await saveToGitHub(githubToken, data.ref, data);

    populateResult(dom, data);
    dom.publishStatus.textContent = "Done!";
    dom.publishError.hidden = true;
    showToast(dom, "Application published.");

    await loadSavedList(dom, data);
  } catch (error) {
    showError(dom, error instanceof Error ? error.message : "Something went wrong.");
    dom.publishStatus.textContent = "Failed.";
  } finally {
    dom.publishButton.disabled = false;
    dom.publishButton.textContent = "Publish Application";
  }
}

function normaliseApplicationPayload(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("The pasted JSON must be a single object.");
  }

  const companyName = toCleanString(input.companyName);
  const roleTitle = toCleanString(input.roleTitle);
  const location = toCleanString(input.location);

  if (!companyName) {
    throw new Error("companyName is required.");
  }

  if (!roleTitle) {
    throw new Error("roleTitle is required.");
  }

  const baseRef = toCleanString(input.ref) || toCleanString(input.slug) || [companyName, roleTitle, location].filter(Boolean).join(" ");
  const ref = slugify(baseRef);

  if (!ref) {
    throw new Error("Could not build a usable ref from the JSON.");
  }

  const nowIso = new Date().toISOString();
  const createdAt = toCleanString(input.createdAt) || nowIso;

  return {
    ref,
    companyName,
    roleTitle,
    location,
    sector: toCleanString(input.sector),
    salary: toCleanString(input.salary),
    employmentType: toCleanString(input.employmentType),
    shortCompanyReason: toCleanString(input.shortCompanyReason),
    shortRoleReason: toCleanString(input.shortRoleReason),
    toneKeywords: normaliseStringArray(input.toneKeywords),
    probablePriorities: normaliseStringArray(input.probablePriorities),
    advertSummary: toCleanString(input.advertSummary),
    slug: ref,
    personalisedIntro: toCleanString(input.personalisedIntro),
    whyThisRole: toCleanString(input.whyThisRole),
    keyFocusAreas: normaliseStringArray(input.keyFocusAreas),
    createdAt,
    updatedAt: nowIso
  };
}

function toCleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normaliseStringArray(value) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

async function saveToGitHub(token, ref, data) {
  const path = `data/${ref}.json`;
  const content = btoa(unescape(encodeURIComponent(JSON.stringify(data, null, 2))));
  const apiUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`;

  let sha = null;
  const checkResponse = await fetch(apiUrl, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (checkResponse.ok) {
    const existing = await checkResponse.json();
    sha = existing.sha;
  }

  const body = {
    message: `Add/update application: ${data.companyName} / ${data.roleTitle}`,
    content,
    branch: GITHUB_BRANCH
  };

  if (sha) {
    body.sha = sha;
  }

  const putResponse = await fetch(apiUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!putResponse.ok) {
    const errBody = await putResponse.json().catch(() => ({}));
    throw new Error(errBody.message || `GitHub API returned ${putResponse.status}`);
  }
}

async function loadSavedList(dom, latestApplication = null) {
  try {
    const apiUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/data`;
    const response = await fetch(apiUrl);

    if (!response.ok) {
      dom.savedList.innerHTML = '<p class="empty-state">No applications saved yet.</p>';
      dom.statsTotal.textContent = "0";
      dom.statsLatest.textContent = "None yet";
      return;
    }

    const files = await response.json();
    const jsonFiles = Array.isArray(files) ? files.filter((file) => file.name.endsWith(".json")) : [];

    if (!jsonFiles.length) {
      dom.savedList.innerHTML = '<p class="empty-state">No applications saved yet.</p>';
      dom.statsTotal.textContent = "0";
      dom.statsLatest.textContent = "None yet";
      return;
    }

    const applications = await Promise.all(
      jsonFiles.map(async (file) => {
        try {
          const applicationResponse = await fetch(file.download_url, { cache: "no-store" });
          const application = await applicationResponse.json();
          return normaliseApplicationPayload({ ...application, updatedAt: application.updatedAt || application.createdAt || "" });
        } catch {
          const ref = file.name.replace(/\.json$/i, "");
          return {
            ref,
            slug: ref,
            companyName: ref,
            roleTitle: "Application",
            location: "",
            sector: "",
            salary: "",
            employmentType: "",
            shortCompanyReason: "",
            shortRoleReason: "",
            toneKeywords: [],
            probablePriorities: [],
            advertSummary: "",
            personalisedIntro: "",
            whyThisRole: "",
            keyFocusAreas: [],
            createdAt: "",
            updatedAt: ""
          };
        }
      })
    );

    applications.sort((a, b) => {
      const aTime = Date.parse(a.updatedAt || a.createdAt || "") || 0;
      const bTime = Date.parse(b.updatedAt || b.createdAt || "") || 0;
      return bTime - aTime;
    });

    dom.statsTotal.textContent = String(applications.length);

    const latest = latestApplication || applications[0];
    dom.statsLatest.textContent = latest ? `${latest.companyName} · ${latest.roleTitle}` : "None yet";

    dom.savedList.innerHTML = applications.map((application) => renderSavedApplicationCard(application)).join("");
  } catch {
    dom.savedList.innerHTML = '<p class="empty-state">Could not load saved applications.</p>';
    dom.statsTotal.textContent = "-";
    dom.statsLatest.textContent = "Unavailable";
  }
}

function renderSavedApplicationCard(application) {
  const url = buildPreviewUrl(application.ref);
  const printUrl = buildPrintUrl(application.ref);
  const updated = formatDateTime(application.updatedAt || application.createdAt);
  const metaBits = [application.location, updated ? `Updated ${updated}` : ""].filter(Boolean).join(" · ");

  return `
    <article class="saved-application-card">
      <div class="saved-application-header">
        <div>
          <h3 class="saved-application-title">${escapeHtml(application.companyName)} · ${escapeHtml(application.roleTitle)}</h3>
          <p class="saved-application-meta">${escapeHtml(metaBits || application.ref)}</p>
        </div>
      </div>
      <div class="saved-application-actions">
        <a class="saved-action" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">Open page</a>
        <a class="saved-action" href="${escapeHtml(printUrl)}" target="_blank" rel="noopener noreferrer">PDF view</a>
        <button class="saved-action" type="button" data-action="copy-url" data-ref="${escapeHtml(application.ref)}">Copy URL</button>
        <button class="saved-action" type="button" data-action="load-json" data-ref="${escapeHtml(application.ref)}">Load into editor</button>
      </div>
    </article>
  `;
}

function populateResult(dom, application) {
  const url = buildPreviewUrl(application.ref);
  const printUrl = buildPrintUrl(application.ref);

  dom.resultCompany.value = application.companyName || "";
  dom.resultRole.value = application.roleTitle || "";
  dom.resultLocation.value = application.location || "";
  dom.resultRef.value = application.ref || "";
  dom.resultUrl.value = url;
  dom.openPreviewLink.href = url;
  dom.openPdfLink.href = printUrl;
  dom.resultPanel.hidden = false;
  dom.resultEmpty.hidden = true;
}

function buildPreviewUrl(ref) {
  return `${CV_BASE_URL}?ref=${encodeURIComponent(ref)}`;
}

function buildPrintUrl(ref) {
  return `${CV_BASE_URL}?ref=${encodeURIComponent(ref)}&print=1`;
}

async function fetchApplicationByRef(ref) {
  const response = await fetch(`data/${encodeURIComponent(ref)}.json`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Could not load ${ref}.json`);
  }
  return response.json();
}

function slugify(text) {
  return String(text)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function showError(dom, message) {
  dom.publishError.hidden = false;
  dom.publishError.textContent = message;
}

function showToast(dom, message) {
  const el = dom.toast;
  if (!el) return;

  el.textContent = message;
  el.classList.add("is-visible");

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.remove("is-visible");
  }, 3000);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function initCvPreviewPage() {
  previewDom = {
    loadingState: document.getElementById("cv-loading-state"),
    errorState: document.getElementById("cv-error-state"),
    errorTitle: document.getElementById("cv-error-title"),
    errorMessage: document.getElementById("cv-error-message"),
    sampleLink: document.getElementById("cv-sample-link"),
    content: document.getElementById("cv-content"),
    previewTitle: document.getElementById("cv-preview-title"),
    previewSubtitle: document.getElementById("cv-preview-subtitle"),
    heroRef: document.getElementById("cv-hero-ref"),
    greeting: document.getElementById("cv-greeting"),
    heroName: document.getElementById("cv-hero-name"),
    heroThanks: document.getElementById("cv-hero-thanks"),
    personalisedIntro: document.getElementById("cv-personalised-intro"),
    metaLocation: document.getElementById("cv-meta-location"),
    metaSector: document.getElementById("cv-meta-sector"),
    metaSalary: document.getElementById("cv-meta-salary"),
    metaEmploymentType: document.getElementById("cv-meta-employmentType"),
    roleCardTitle: document.getElementById("cv-role-card-title"),
    roleSummary: document.getElementById("cv-role-summary"),
    toneList: document.getElementById("cv-tone-list"),
    whyThisRoleCopy: document.getElementById("cv-why-this-role-copy"),
    shortReasons: document.getElementById("cv-short-reasons"),
    focusAreasList: document.getElementById("cv-focus-areas-list"),
    capabilitiesGrid: document.getElementById("cv-capabilities-grid"),
    prioritiesList: document.getElementById("cv-priorities-list"),
    timeline: document.getElementById("cv-timeline"),
    closingCopy: document.getElementById("cv-closing-copy"),
    printButton: document.getElementById("cv-print-button")
  };

  if (previewDom.printButton) {
    previewDom.printButton.addEventListener("click", () => {
      window.print();
    });
  }

  renderCapabilityCards();
  renderCareerSnapshot();
  loadPreviewApplication();
}

async function loadPreviewApplication() {
  const params = new URLSearchParams(window.location.search);
  const requestedRef = (params.get("ref") || "").trim().toLowerCase();
  const shouldAutoPrint = params.get("print") === "1";

  if (!requestedRef) {
    showPreviewError(
      "Missing preview reference",
      "Open this page with a ?ref=... value so it knows which application to load."
    );
    return;
  }

  showPreviewLoading();

  try {
    const jsonUrl = `data/${encodeURIComponent(requestedRef)}.json`;
    const response = await fetch(jsonUrl, { cache: "no-store" });

    if (!response.ok) {
      if (response.status === 404) {
        showPreviewError(
          "Application not found",
          `No application matches the ref “${requestedRef}”. It may not have been published yet, or GitHub Pages may still be deploying.`
        );
        return;
      }
      throw new Error(`Failed to load application data (${response.status}).`);
    }

    const application = await response.json();
    renderPreviewApplication(application);
    showPreviewContent();

    if (shouldAutoPrint) {
      window.setTimeout(() => window.print(), 350);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "The application data could not be loaded.";
    showPreviewError("Could not load preview data", message);
  }
}

function showPreviewLoading() {
  previewDom.loadingState.hidden = false;
  previewDom.errorState.hidden = true;
  previewDom.content.hidden = true;
}

function showPreviewError(title, message) {
  previewDom.loadingState.hidden = true;
  previewDom.errorState.hidden = false;
  previewDom.content.hidden = true;
  previewDom.errorTitle.textContent = title;
  previewDom.errorMessage.textContent = message;
}

function showPreviewContent() {
  previewDom.loadingState.hidden = true;
  previewDom.errorState.hidden = true;
  previewDom.content.hidden = false;
}

function renderPreviewApplication(app) {
  document.title = `${app.companyName} | Ben Howard`;
  previewDom.previewTitle.textContent = "Ben Howard";
  previewDom.previewSubtitle.textContent = `${app.roleTitle} preview for ${app.companyName}`;
  previewDom.heroRef.textContent = `Preview ref: ${app.ref}`;
  previewDom.greeting.textContent = `Hi ${app.companyName}`;
  previewDom.heroName.textContent = "I’m Ben Howard";
  previewDom.heroThanks.textContent = `Thanks for taking a look at my application for the ${app.roleTitle} role.`;
  previewDom.personalisedIntro.textContent = app.personalisedIntro || composePersonalisedIntro(app);
  previewDom.metaLocation.textContent = app.location || "Not specified";
  previewDom.metaSector.textContent = app.sector || "General operations";
  previewDom.metaSalary.textContent = app.salary || "Not specified";
  previewDom.metaEmploymentType.textContent = app.employmentType || "Not specified";
  previewDom.roleCardTitle.textContent = `${app.roleTitle} | ${app.companyName}`;
  previewDom.roleSummary.textContent = app.advertSummary || buildAdvertSummaryFallback(app);
  previewDom.whyThisRoleCopy.textContent = app.whyThisRole || composeWhyThisRole(app);
  previewDom.shortReasons.textContent = buildReasonSummary(app);
  previewDom.closingCopy.textContent = buildClosingCopy(app);

  renderChipElements(previewDom.toneList, app.toneKeywords || []);
  renderChipElements(previewDom.focusAreasList, app.keyFocusAreas || []);
  renderPriorityPanels(previewDom.prioritiesList, app.probablePriorities || []);
}

function renderChipElements(container, values) {
  container.innerHTML = "";
  values.forEach((value) => {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.textContent = value;
    container.appendChild(chip);
  });
}

function renderPriorityPanels(container, values) {
  container.innerHTML = "";
  values.forEach((value, index) => {
    const panel = document.createElement("article");
    panel.className = "highlight-card";

    const badge = document.createElement("span");
    badge.className = "highlight-index";
    badge.textContent = String(index + 1);

    const copy = document.createElement("p");
    copy.textContent = value;

    panel.append(badge, copy);
    container.appendChild(panel);
  });
}

function renderCapabilityCards() {
  previewDom.capabilitiesGrid.innerHTML = "";
  CAPABILITY_CARDS.forEach((card) => {
    const el = document.createElement("article");
    el.className = "capability-card";

    const title = document.createElement("h3");
    title.textContent = card.title;

    const copy = document.createElement("p");
    copy.textContent = card.copy;

    el.append(title, copy);
    previewDom.capabilitiesGrid.appendChild(el);
  });
}

function renderCareerSnapshot() {
  previewDom.timeline.innerHTML = "";
  CAREER_SNAPSHOT.forEach((item, index) => {
    const entry = document.createElement("article");
    entry.className = "timeline-item";

    const stage = document.createElement("span");
    stage.className = "timeline-stage";
    stage.textContent = `Step ${index + 1}`;

    const title = document.createElement("h3");
    title.textContent = item.stage;

    const copy = document.createElement("p");
    copy.textContent = item.summary;

    entry.append(stage, title, copy);
    previewDom.timeline.appendChild(entry);
  });
}

function composePersonalisedIntro(app) {
  const role = app.roleTitle || "this opportunity";
  const company = app.companyName || "your team";
  const sector = app.sector ? `${app.sector} environment` : "operational environment";
  const location = app.location ? ` in ${app.location}` : "";

  return `I am an operations-led leader who enjoys bringing clarity, pace, and accountability to ambitious teams in a ${sector}. The ${role} opportunity with ${company}${location} stands out because it appears to combine visible leadership with the chance to raise standards and build momentum.`;
}

function composeWhyThisRole(app) {
  const reasons = [app.shortCompanyReason, app.shortRoleReason].filter(Boolean);
  if (reasons.length) {
    return `${reasons.join(" ")} It looks like a role where structured leadership, follow-through, and practical problem solving would make a clear difference.`;
  }
  return "This looks like a role where practical leadership, accountability, and operational judgement would matter day to day, which is where I am at my strongest.";
}

function buildAdvertSummaryFallback(app) {
  const parts = [app.shortCompanyReason, app.shortRoleReason].filter(Boolean);
  return parts.length ? parts.join(" ") : "This application record needs a short role summary.";
}

function buildReasonSummary(app) {
  const reasons = [app.shortCompanyReason, app.shortRoleReason].filter(Boolean);
  if (reasons.length) return reasons.join(" ");
  if (app.probablePriorities && app.probablePriorities.length) {
    return `The brief suggests a strong focus on ${app.probablePriorities.slice(0, 3).join(", ")}.`;
  }
  return "";
}

function buildClosingCopy(app) {
  const company = app.companyName || "your team";
  const role = app.roleTitle || "the role";
  return `Thank you for reviewing this personalised overview. I would welcome the chance to discuss how my background in operations leadership could support ${company} in the ${role} position. I am happy to provide further detail, references, or arrange a conversation at your convenience.`;
}