// Ben Howard CV system
// Dashboard: track applications and open custom URLs.
// New job: review pasted JSON, save locally, generate QR code.
// CV preview: render the personalised page and printable PDF view.

const CV_BASE_URL = new URL("cv.html", window.location.href).href;
const NEW_JOB_URL = new URL("new-job.html", window.location.href).href;
const APPLICATIONS_STORE_KEY = "cv_applications_local";
const APPLICATIONS_INDEX_PATH = "data/applications.json";

const CAPABILITY_CARDS = Object.freeze([
  { title: "Operations leadership", copy: "Visible, hands-on leadership that improves rhythm, standards, and delivery across busy teams." },
  { title: "Change and improvement", copy: "Comfortable translating broad goals into practical structure, clearer processes, and stronger follow-through." },
  { title: "Data and reporting", copy: "Confident using reporting, trend visibility, and performance insight to support better operational decisions." },
  { title: "People and accountability", copy: "Strong on expectations, coaching, and creating the kind of ownership that lifts team consistency." }
]);

const CAREER_SNAPSHOT = Object.freeze([
  { stage: "Experian", summary: "Strengthened reporting, operational clarity, and structured improvement in a high-volume environment." },
  { stage: "Alton Towers", summary: "Worked close to guest-facing operations where pace, standards, and frontline coordination mattered daily." },
  { stage: "Merlin Entertainments", summary: "Built experience across commercial service environments that depend on consistency and high-energy execution." },
  { stage: "Copper Alloys", summary: "Developed process discipline, operational awareness, and an eye for practical improvement." },
  { stage: "Harley Street Medical Centre", summary: "Delivered calm, accurate service in a setting where trust, organisation, and responsiveness were essential." }
]);

const REVIEW_FIELDS = [
  ["ref", "Generated ref"],
  ["slug", "Slug"],
  ["companyName", "Company"],
  ["roleTitle", "Role"],
  ["location", "Location"],
  ["sector", "Sector"],
  ["salary", "Salary"],
  ["employmentType", "Employment type"],
  ["shortCompanyReason", "Short company reason"],
  ["shortRoleReason", "Short role reason"],
  ["toneKeywords", "Tone keywords"],
  ["probablePriorities", "Probable priorities"],
  ["advertSummary", "Advert summary"],
  ["personalisedIntro", "Personalised intro"],
  ["whyThisRole", "Why this role"],
  ["keyFocusAreas", "Key focus areas"]
];

let toastTimer = null;
let previewDom = null;
let savedApplications = [];
let savedApplicationMap = new Map();

document.addEventListener("DOMContentLoaded", () => {
  const page = document.body.dataset.page;

  if (page === "dashboard") {
    initDashboardPage();
  } else if (page === "new-job") {
    initNewJobPage();
  } else if (page === "cv-preview") {
    initCvPreviewPage();
  }
});

function initDashboardPage() {
  const dom = {
    statsTotal: document.getElementById("stats-total"),
    statsLatest: document.getElementById("stats-latest"),
    savedList: document.getElementById("saved-list"),
    refreshListButton: document.getElementById("refresh-list-button"),
    newJobButton: document.getElementById("new-job-button"),
    toast: document.getElementById("toast")
  };

  dom.newJobButton?.addEventListener("click", () => {
    window.location.href = NEW_JOB_URL;
  });

  dom.refreshListButton?.addEventListener("click", () => loadSavedList(dom));

  dom.savedList?.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const actionButton = target.closest("button[data-action]");
    if (!actionButton) return;

    const action = actionButton.dataset.action;
    const ref = actionButton.dataset.ref;
    if (!action || !ref) return;

    const application = savedApplicationMap.get(ref) || null;
    const previewUrl = application ? buildPreviewUrl(application) : buildPreviewUrl(ref);
    const printUrl = application ? buildPrintUrl(application) : buildPrintUrl(ref);

    if (action === "copy-url") {
      try {
        await navigator.clipboard.writeText(previewUrl);
        showToast(dom, "URL copied.");
      } catch {
        showToast(dom, "Could not copy automatically.");
      }
      return;
    }

    if (action === "open-preview") {
      window.open(previewUrl, "_blank", "noopener,noreferrer");
      return;
    }

    if (action === "open-pdf") {
      window.open(printUrl, "_blank", "noopener,noreferrer");
    }
  });

  loadSavedList(dom);
}

function initNewJobPage() {
  const dom = {
    jobJsonInput: document.getElementById("job-json-input"),
    reviewButton: document.getElementById("review-json-button"),
    clearJsonButton: document.getElementById("clear-json-button"),
    reviewStatus: document.getElementById("review-status"),
    reviewError: document.getElementById("review-error"),
    reviewPanel: document.getElementById("review-panel"),
    reviewPreview: document.getElementById("review-preview"),
    rawJsonOutput: document.getElementById("raw-json-output"),
    confirmPublishButton: document.getElementById("confirm-publish-button"),
    editJsonButton: document.getElementById("edit-json-button"),
    publishStatus: document.getElementById("publish-status"),
    publishError: document.getElementById("publish-error"),
    resultPanel: document.getElementById("result-panel"),
    resultCompany: document.getElementById("result-company"),
    resultRole: document.getElementById("result-role"),
    resultLocation: document.getElementById("result-location"),
    resultRef: document.getElementById("result-ref"),
    resultUrl: document.getElementById("result-url"),
    copyUrlButton: document.getElementById("copy-url-button"),
    openPreviewLink: document.getElementById("open-preview-link"),
    downloadCvButton: document.getElementById("download-cv-button"),
    resultQrImage: document.getElementById("result-qr-image"),
    toast: document.getElementById("toast")
  };

  let pendingApplication = null;

  dom.clearJsonButton?.addEventListener("click", () => {
    dom.jobJsonInput.value = "";
    pendingApplication = null;
    dom.reviewPanel.hidden = true;
    dom.resultPanel.hidden = true;
    dom.reviewError.hidden = true;
    dom.publishError.hidden = true;
    dom.reviewStatus.textContent = "Waiting for JSON.";
    dom.publishStatus.textContent = "Ready to save.";
    dom.rawJsonOutput.textContent = "No application loaded yet.";
    showToast(dom, "JSON form cleared.");
  });

  dom.jobJsonInput?.addEventListener("input", () => {
    if (!pendingApplication) return;
    pendingApplication = null;
    dom.confirmPublishButton.disabled = true;
    dom.reviewStatus.textContent = "JSON changed. Review again before saving.";
  });

  dom.reviewButton?.addEventListener("click", () => {
    dom.reviewError.hidden = true;
    dom.publishError.hidden = true;

    const rawText = dom.jobJsonInput.value.trim();
    if (!rawText) {
      showError(dom.reviewError, "Paste the application JSON first.");
      dom.reviewStatus.textContent = "Waiting for JSON.";
      return;
    }

    try {
      const parsed = JSON.parse(rawText);
      pendingApplication = normaliseApplicationPayload(parsed);
      dom.reviewPreview.innerHTML = renderReviewPreview(pendingApplication);
      dom.rawJsonOutput.textContent = JSON.stringify(pendingApplication, null, 2);
      dom.reviewPanel.hidden = false;
      dom.confirmPublishButton.disabled = false;
      dom.reviewStatus.textContent = `Ready to save ${pendingApplication.companyName} / ${pendingApplication.roleTitle}.`;
      showToast(dom, "JSON parsed successfully.");
      dom.reviewPanel.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      pendingApplication = null;
      dom.confirmPublishButton.disabled = true;
      showError(dom.reviewError, error instanceof Error ? error.message : "Something went wrong.");
      dom.reviewStatus.textContent = "Review failed.";
    }
  });

  dom.editJsonButton?.addEventListener("click", () => {
    dom.jobJsonInput.focus();
    dom.jobJsonInput.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  dom.confirmPublishButton?.addEventListener("click", async () => {
    dom.publishError.hidden = true;

    if (!pendingApplication) {
      showError(dom.publishError, "Review the JSON before saving.");
      return;
    }

    dom.confirmPublishButton.disabled = true;
    dom.confirmPublishButton.textContent = "Saving…";
    dom.publishStatus.textContent = "Saving application on this device…";

    try {
      const saved = saveApplicationLocally(pendingApplication);
      await renderPublishedResult(dom, saved);
      dom.resultPanel.hidden = false;
      dom.publishStatus.textContent = "Saved.";
      showToast(dom, "Application saved.");
      dom.resultPanel.scrollIntoView({ behavior: "smooth", block: "start" });
      loadSavedList({
        statsTotal: document.getElementById("stats-total"),
        statsLatest: document.getElementById("stats-latest"),
        savedList: document.getElementById("saved-list"),
        toast: document.getElementById("toast")
      }, saved);
    } catch (error) {
      showError(dom.publishError, error instanceof Error ? error.message : "Could not save the application.");
      dom.publishStatus.textContent = "Save failed.";
    } finally {
      dom.confirmPublishButton.disabled = false;
      dom.confirmPublishButton.textContent = "Save & Generate";
    }
  });

  dom.copyUrlButton?.addEventListener("click", async () => {
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

  dom.downloadCvButton?.addEventListener("click", () => {
    const url = dom.resultUrl.value;
    if (!url) return;
    window.open(buildPrintUrlFromUrl(url), "_blank", "noopener,noreferrer");
  });
}

function initCvPreviewPage() {
  previewDom = {
    loadingState: document.getElementById("cv-loading-state"),
    errorState: document.getElementById("cv-error-state"),
    errorTitle: document.getElementById("cv-error-title"),
    errorMessage: document.getElementById("cv-error-message"),
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
    printButton: document.getElementById("cv-print-button"),
    qrBadge: document.getElementById("cv-qr-badge"),
    qrImage: document.getElementById("cv-qr-image")
  };

  previewDom.printButton?.addEventListener("click", () => {
    window.print();
  });

  renderCapabilityCards();
  renderCareerSnapshot();
  loadPreviewApplication();
}

function normaliseApplicationPayload(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("The pasted JSON must be a single object.");
  }

  const companyName = toCleanString(input.companyName);
  const roleTitle = toCleanString(input.roleTitle);
  const location = toCleanString(input.location);

  if (!companyName) throw new Error("companyName is required.");
  if (!roleTitle) throw new Error("roleTitle is required.");

  const baseRef = toCleanString(input.ref) || toCleanString(input.slug) || [companyName, roleTitle, location].filter(Boolean).join(" ");
  const ref = slugify(baseRef);

  if (!ref) throw new Error("Could not build a usable ref from the JSON.");

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

function renderReviewPreview(application) {
  return REVIEW_FIELDS.map(([key, label]) => {
    const value = application[key];
    const display = Array.isArray(value) ? value.join(", ") : value || "Not provided";

    return `
      <article class="review-item">
        <span class="review-label">${escapeHtml(label)}</span>
        <p class="review-value">${escapeHtml(display)}</p>
      </article>
    `;
  }).join("");
}

async function renderPublishedResult(dom, application) {
  const url = buildPreviewUrl(application);

  dom.resultCompany.value = application.companyName || "";
  dom.resultRole.value = application.roleTitle || "";
  dom.resultLocation.value = application.location || "";
  dom.resultRef.value = application.ref || "";
  dom.resultUrl.value = url;
  dom.openPreviewLink.href = url;
  dom.resultPanel.hidden = false;

  try {
    await renderQrImage(dom.resultQrImage, url);
  } catch {
    dom.resultQrImage.hidden = true;
  }
}

function saveApplicationLocally(application) {
  const current = readStoredApplications();
  const nowIso = new Date().toISOString();
  const payload = {
    ...application,
    createdAt: application.createdAt || nowIso,
    updatedAt: nowIso
  };

  const existingIndex = current.findIndex((item) => item.ref === payload.ref);
  if (existingIndex >= 0) {
    current[existingIndex] = payload;
  } else {
    current.unshift(payload);
  }

  current.sort((a, b) => {
    const aTime = Date.parse(a.updatedAt || a.createdAt || "") || 0;
    const bTime = Date.parse(b.updatedAt || b.createdAt || "") || 0;
    return bTime - aTime;
  });

  localStorage.setItem(APPLICATIONS_STORE_KEY, JSON.stringify(current));
  return payload;
}

function readStoredApplications() {
  try {
    const raw = localStorage.getItem(APPLICATIONS_STORE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isApplicationObject) : [];
  } catch {
    return [];
  }
}

function isApplicationObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && typeof value.ref === "string");
}

async function loadSavedList(dom, latestApplication = null) {
  try {
    const applications = await fetchSeedApplications();
    savedApplications = applications;
    savedApplicationMap = new Map(applications.map((application) => [application.ref, application]));

    if (!applications.length) {
      dom.savedList.innerHTML = '<p class="empty-state">No applications saved yet.</p>';
      dom.statsTotal.textContent = "0";
      dom.statsLatest.textContent = latestApplication ? `${latestApplication.companyName} · ${latestApplication.roleTitle}` : "None yet";
      return;
    }

    applications.sort((a, b) => {
      const aTime = Date.parse(a.updatedAt || a.createdAt || "") || 0;
      const bTime = Date.parse(b.updatedAt || b.createdAt || "") || 0;
      return bTime - aTime;
    });

    dom.statsTotal.textContent = String(applications.length);
    const latest = latestApplication || applications[0];
    dom.statsLatest.textContent = latest ? `${latest.companyName || latest.ref} · ${latest.roleTitle || "Saved CV"}` : "None yet";
    dom.savedList.innerHTML = applications.map((application) => renderSavedApplicationCard(application)).join("");
  } catch {
    dom.savedList.innerHTML = '<p class="empty-state">Could not load saved applications.</p>';
    if (dom.statsTotal) dom.statsTotal.textContent = "-";
    if (dom.statsLatest) dom.statsLatest.textContent = "Unavailable";
  }
}

async function fetchSeedApplications() {
  try {
    const response = await fetch(`${APPLICATIONS_INDEX_PATH}?t=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) return [];
    const items = await response.json();
    return Array.isArray(items) ? items.filter(isApplicationObject) : [];
  } catch {
    return [];
  }
}

function renderSavedApplicationCard(application) {
  const previewUrl = buildPreviewUrl(application);
  const printUrl = buildPrintUrl(application);
  const updated = formatDateTime(application.updatedAt || application.createdAt);
  const metaBits = [application.location, updated ? `Updated ${updated}` : ""].filter(Boolean).join(" · ");

  return `
    <article class="saved-application-card">
      <div class="saved-application-header">
        <div>
          <h3 class="saved-application-title">${escapeHtml(application.companyName || application.ref)} · ${escapeHtml(application.roleTitle || "Saved CV")}</h3>
          <p class="saved-application-meta">${escapeHtml(metaBits || application.ref)}</p>
        </div>
      </div>
      <div class="saved-application-actions">
        <button class="saved-action" type="button" data-action="open-preview" data-ref="${escapeHtml(application.ref)}">Open CV</button>
        <button class="saved-action" type="button" data-action="open-pdf" data-ref="${escapeHtml(application.ref)}">PDF view</button>
        <button class="saved-action" type="button" data-action="copy-url" data-ref="${escapeHtml(application.ref)}">Copy URL</button>
      </div>
      <p class="saved-application-meta">Preview: ${escapeHtml(previewUrl)}<br>PDF: ${escapeHtml(printUrl)}</p>
    </article>
  `;
}

function buildPreviewUrl(refOrApplication) {
  if (typeof refOrApplication === "string") {
    return `${CV_BASE_URL}?ref=${encodeURIComponent(refOrApplication)}`;
  }

  if (isEmbeddedPayloadReady(refOrApplication)) {
    const payload = buildEmbeddedPreviewPayload(refOrApplication);
    return `${CV_BASE_URL}#app=${encodeApplicationPayload(payload)}`;
  }

  return `${CV_BASE_URL}?ref=${encodeURIComponent(refOrApplication.ref || "")}`;
}

function buildPrintUrl(refOrApplication) {
  if (typeof refOrApplication === "string") {
    return `${CV_BASE_URL}?ref=${encodeURIComponent(refOrApplication)}&print=1`;
  }

  if (isEmbeddedPayloadReady(refOrApplication)) {
    const payload = buildEmbeddedPreviewPayload(refOrApplication);
    return `${CV_BASE_URL}?print=1#app=${encodeApplicationPayload(payload)}`;
  }

  return `${CV_BASE_URL}?ref=${encodeURIComponent(refOrApplication.ref || "")}&print=1`;
}

function buildPrintUrlFromUrl(url) {
  try {
    const parsed = new URL(url, window.location.href);
    const hash = parsed.hash;

    if (hash.startsWith("#app=")) {
      parsed.hash = hash;
      parsed.searchParams.set("print", "1");
      return parsed.href;
    }

    const ref = (parsed.searchParams.get("ref") || "").trim();
    if (!ref) return url;
    parsed.searchParams.set("print", "1");
    return parsed.href;
  } catch {
    return url;
  }
}

function isEmbeddedPayloadReady(application) {
  return Boolean(
    application &&
      typeof application === "object" &&
      !Array.isArray(application) &&
      application.companyName &&
      application.roleTitle &&
      (Array.isArray(application.toneKeywords) ||
        Array.isArray(application.probablePriorities) ||
        Array.isArray(application.keyFocusAreas) ||
        typeof application.personalisedIntro === "string")
  );
}

function buildEmbeddedPreviewPayload(application) {
  return {
    ref: application.ref || slugify([application.companyName, application.roleTitle, application.location].filter(Boolean).join(" ")),
    companyName: application.companyName || "",
    roleTitle: application.roleTitle || "",
    location: application.location || "",
    sector: application.sector || "",
    salary: application.salary || "",
    employmentType: application.employmentType || "",
    shortCompanyReason: application.shortCompanyReason || "",
    shortRoleReason: application.shortRoleReason || "",
    toneKeywords: Array.isArray(application.toneKeywords) ? application.toneKeywords : [],
    probablePriorities: Array.isArray(application.probablePriorities) ? application.probablePriorities : [],
    advertSummary: application.advertSummary || "",
    personalisedIntro: application.personalisedIntro || "",
    whyThisRole: application.whyThisRole || "",
    keyFocusAreas: Array.isArray(application.keyFocusAreas) ? application.keyFocusAreas : []
  };
}

function readEmbeddedApplicationFromLocation() {
  try {
    const hash = window.location.hash.replace(/^#/, "");
    if (!hash) return null;

    const hashParams = new URLSearchParams(hash);
    const encoded = (hashParams.get("app") || "").trim();
    if (!encoded) return null;

    const decoded = decodeApplicationPayload(encoded);
    const parsed = JSON.parse(decoded);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }

    return normaliseEmbeddedApplication(parsed);
  } catch {
    return null;
  }
}

function normaliseEmbeddedApplication(input) {
  const application = {
    ref: toCleanString(input.ref) || slugify([input.companyName, input.roleTitle, input.location].filter(Boolean).join(" ")),
    companyName: toCleanString(input.companyName),
    roleTitle: toCleanString(input.roleTitle),
    location: toCleanString(input.location),
    sector: toCleanString(input.sector),
    salary: toCleanString(input.salary),
    employmentType: toCleanString(input.employmentType),
    shortCompanyReason: toCleanString(input.shortCompanyReason),
    shortRoleReason: toCleanString(input.shortRoleReason),
    toneKeywords: normaliseStringArray(input.toneKeywords),
    probablePriorities: normaliseStringArray(input.probablePriorities),
    advertSummary: toCleanString(input.advertSummary),
    personalisedIntro: toCleanString(input.personalisedIntro),
    whyThisRole: toCleanString(input.whyThisRole),
    keyFocusAreas: normaliseStringArray(input.keyFocusAreas)
  };

  if (!application.companyName || !application.roleTitle) {
    throw new Error("Embedded application data is missing companyName or roleTitle.");
  }

  return application;
}

function encodeApplicationPayload(value) {
  const json = typeof value === "string" ? value : JSON.stringify(value);
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function decodeApplicationPayload(value) {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function fetchApplicationByRef(ref) {
  const response = await fetch(`data/${encodeURIComponent(ref)}.json?t=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Could not load ${ref}.json`);
  }
  return response.json();
}

function loadPreviewApplication() {
  const embeddedApplication = readEmbeddedApplicationFromLocation();
  const params = new URLSearchParams(window.location.search);
  const requestedRef = (params.get("ref") || "").trim().toLowerCase();
  const shouldAutoPrint = params.get("print") === "1";

  if (embeddedApplication) {
    renderPreviewApplication(embeddedApplication);
    const previewUrl = buildPreviewUrl(embeddedApplication);
    showPreviewLoading();
    renderQrImage(previewDom.qrImage, previewUrl)
      .then(() => {
        previewDom.qrBadge.hidden = false;
        showPreviewContent();
        if (shouldAutoPrint) {
          window.setTimeout(() => window.print(), 450);
        }
      })
      .catch(() => {
        previewDom.qrBadge.hidden = true;
        showPreviewContent();
        if (shouldAutoPrint) {
          window.setTimeout(() => window.print(), 450);
        }
      });
    return;
  }

  if (!requestedRef) {
    showPreviewError("Missing preview reference", "Open this page with a ?ref=... value or a #app=... payload so it knows which application to load.");
    return;
  }

  showPreviewLoading();

  fetchApplicationByRef(requestedRef)
    .then((application) => {
      renderPreviewApplication(application);
      const previewUrl = buildPreviewUrl(application.ref || requestedRef);
      return renderQrImage(previewDom.qrImage, previewUrl)
        .then(() => {
          previewDom.qrBadge.hidden = false;
          showPreviewContent();
          if (shouldAutoPrint) {
            window.setTimeout(() => window.print(), 450);
          }
        })
        .catch(() => {
          previewDom.qrBadge.hidden = true;
          showPreviewContent();
          if (shouldAutoPrint) {
            window.setTimeout(() => window.print(), 450);
          }
        });
    })
    .catch((error) => {
      const message = error instanceof Error ? error.message : "The application data could not be loaded.";
      showPreviewError("Could not load preview data", message);
    });
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
  if (!container) return;
  container.innerHTML = "";
  values.forEach((value) => {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.textContent = value;
    container.appendChild(chip);
  });
}

function renderPriorityPanels(container, values) {
  if (!container) return;
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

function updateKeysStatus() {}

function toCleanString(value) {
  return typeof value === "string" ? value.trim() : "";
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

function normaliseStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean);
}

function showError(el, message) {
  if (!el) return;
  el.hidden = false;
  el.textContent = message;
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

async function renderQrImage(img, text) {
  if (!img) return "";

  if (!window.QRCode?.toDataURL) {
    img.hidden = true;
    return "";
  }

  const dataUrl = await window.QRCode.toDataURL(text, {
    width: 300,
    margin: 1,
    errorCorrectionLevel: "M"
  });

  img.src = dataUrl;
  img.hidden = false;
  return dataUrl;
}
