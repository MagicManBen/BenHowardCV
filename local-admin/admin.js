const LOCAL_API_BASE = "/api";
const DEFAULT_PUBLIC_CV_BASE_URL = "https://checkloops.co.uk/cv.html";

const REVIEW_FIELDS = [
  ["ref", "Generated ref"],
  ["slug", "Slug"],
  ["companyName", "Company"],
  ["roleTitle", "Role"],
  ["location", "Location"],
  ["sector", "Sector"],
  ["salary", "Salary"],
  ["employmentType", "Employment type"],
  ["hours", "Hours"],
  ["workplaceType", "Workplace type"],
  ["shortCompanyReason", "Short company reason"],
  ["shortRoleReason", "Short role reason"],
  ["companySummary", "Company summary"],
  ["roleSummary", "Role summary"],
  ["headlineAttraction", "Headline attraction"],
  ["rolePurpose", "Role purpose"],
  ["travelRequired", "Travel required"],
  ["toneKeywords", "Tone keywords"],
  ["probablePriorities", "Probable priorities"],
  ["advertSummary", "Advert summary"],
  ["personalisedIntro", "Personalised intro"],
  ["whyThisRole", "Why this role"],
  ["keyFocusAreas", "Key focus areas"],
  ["companyPridePoints", "Company pride points"],
  ["coreResponsibilities", "Core responsibilities"],
  ["essentialRequirements", "Essential requirements"],
  ["preferredRequirements", "Preferred requirements"],
  ["skillsWanted", "Skills wanted"],
  ["toolsMethodsMentioned", "Tools / methods mentioned"],
  ["stakeholderGroups", "Stakeholder groups"],
  ["teamTypesMentioned", "Team types mentioned"],
  ["senioritySignals", "Seniority signals"],
  ["cultureSignals", "Culture signals"],
  ["likelyBusinessNeeds", "Likely business needs"],
  ["impliedStrategicGoals", "Implied strategic goals"],
  ["deliverablesLikely", "Deliverables likely"],
  ["possibleHeadlineFacts", "Possible headline facts"],
  ["matchCategories", "Match categories"]
];

let toastTimer = null;
let publicCvBaseUrl = DEFAULT_PUBLIC_CV_BASE_URL;

document.addEventListener("DOMContentLoaded", initLocalAdminPage);

async function initLocalAdminPage() {
  const dom = {
    keysStatus: document.getElementById("keys-status"),
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
  let localPreviewUrl = "";
  let localPrintUrl = "";

  await loadLocalStatus(dom);

  dom.clearJsonButton?.addEventListener("click", () => {
    dom.jobJsonInput.value = "";
    pendingApplication = null;
    dom.reviewPanel.hidden = true;
    dom.resultPanel.hidden = true;
    dom.reviewError.hidden = true;
    dom.publishError.hidden = true;
    dom.reviewStatus.textContent = "Waiting for JSON.";
    dom.publishStatus.textContent = "Ready to publish.";
    dom.rawJsonOutput.textContent = "No application loaded yet.";
    showToast(dom, "JSON form cleared.");
  });

  dom.jobJsonInput?.addEventListener("input", () => {
    if (!pendingApplication) return;
    pendingApplication = null;
    dom.confirmPublishButton.disabled = true;
    dom.reviewStatus.textContent = "JSON changed. Review again before publishing.";
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
      dom.reviewStatus.textContent = `Ready to publish ${pendingApplication.companyName} / ${pendingApplication.roleTitle}.`;
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
      showError(dom.publishError, "Review the JSON before publishing.");
      return;
    }

    dom.confirmPublishButton.disabled = true;
    dom.confirmPublishButton.textContent = "Publishing...";
    dom.publishStatus.textContent = "Saving locally and pushing to GitHub...";

    try {
      const response = await publishApplication(pendingApplication);
      const application = response.application || pendingApplication;
      const publicUrl = buildPublicPreviewUrl(application);

      localPreviewUrl = buildLocalPreviewUrl(application);
      localPrintUrl = buildLocalPrintUrl(application);

      await renderPublishedResult(dom, application, publicUrl, localPreviewUrl);
      dom.resultPanel.hidden = false;
      dom.publishStatus.textContent = response.publishedToGitHub
        ? `Published. Debug log: ${response.debugLogPath || "not reported"}`
        : `Saved locally. Debug log: ${response.debugLogPath || "not reported"}`;
      showToast(dom, response.publishedToGitHub ? "Application published." : "Saved locally.");
      dom.resultPanel.scrollIntoView({ behavior: "smooth", block: "start" });

      if (!response.publishedToGitHub) {
        showError(dom.publishError, "Saved locally, but GitHub publish did not complete.");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not publish the application.";
      showError(dom.publishError, message);
      dom.publishStatus.textContent = error instanceof Error && "debugLogPath" in error && error.debugLogPath
        ? `Publish failed. Debug log: ${error.debugLogPath}`
        : "Publish failed.";
    } finally {
      dom.confirmPublishButton.disabled = false;
      dom.confirmPublishButton.textContent = "Confirm & Publish";
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
    if (!localPrintUrl) return;
    window.open(localPrintUrl, "_blank", "noopener,noreferrer");
  });
}

async function loadLocalStatus(dom) {
  try {
    const response = await fetch(`${LOCAL_API_BASE}/status?t=${Date.now()}`, { cache: "no-store" });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || "Could not read local server status.");
    }

    publicCvBaseUrl = payload.publicCvBaseUrl || DEFAULT_PUBLIC_CV_BASE_URL;
    if (!payload.hasGithubToken) {
      dom.keysStatus.textContent = "Local server is running, but no GitHub token is configured yet.";
      return;
    }

    dom.keysStatus.textContent = payload.githubAccessOk
      ? "Local server ready. GitHub access confirmed."
      : `GitHub token loaded, but GitHub rejected it: ${payload.githubMessage || "Unknown error."}`;
  } catch (error) {
    dom.keysStatus.textContent = "Could not reach the local server.";
    if (error instanceof Error) {
      console.error(error.message);
    }
  }
}

async function publishApplication(application) {
  const response = await fetch(`${LOCAL_API_BASE}/publish`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      application,
      clientContext: buildClientContext()
    })
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload.error || `Local server returned ${response.status}`;
    const error = new Error(message);
    error.debugLogPath = payload.debugLogPath || "";
    error.response = payload;
    throw error;
  }

  return payload;
}

function buildClientContext() {
  return {
    pageUrl: window.location.href,
    origin: window.location.origin,
    referrer: document.referrer || "",
    title: document.title,
    userAgent: navigator.userAgent,
    timestamp: new Date().toISOString()
  };
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
    hours: toCleanString(input.hours),
    workplaceType: toCleanString(input.workplaceType),
    shortCompanyReason: toCleanString(input.shortCompanyReason),
    shortRoleReason: toCleanString(input.shortRoleReason),
    companySummary: toCleanString(input.companySummary),
    roleSummary: toCleanString(input.roleSummary),
    headlineAttraction: toCleanString(input.headlineAttraction),
    rolePurpose: toCleanString(input.rolePurpose),
    travelRequired: toCleanString(input.travelRequired),
    toneKeywords: normaliseStringArray(input.toneKeywords),
    probablePriorities: normaliseStringArray(input.probablePriorities),
    advertSummary: toCleanString(input.advertSummary),
    slug: ref,
    personalisedIntro: toCleanString(input.personalisedIntro),
    whyThisRole: toCleanString(input.whyThisRole),
    keyFocusAreas: normaliseStringArray(input.keyFocusAreas),
    companyPridePoints: normaliseStringArray(input.companyPridePoints),
    coreResponsibilities: normaliseStringArray(input.coreResponsibilities),
    essentialRequirements: normaliseStringArray(input.essentialRequirements),
    preferredRequirements: normaliseStringArray(input.preferredRequirements),
    skillsWanted: normaliseStringArray(input.skillsWanted),
    toolsMethodsMentioned: normaliseStringArray(input.toolsMethodsMentioned),
    stakeholderGroups: normaliseStringArray(input.stakeholderGroups),
    teamTypesMentioned: normaliseStringArray(input.teamTypesMentioned),
    senioritySignals: normaliseStringArray(input.senioritySignals),
    cultureSignals: normaliseStringArray(input.cultureSignals),
    likelyBusinessNeeds: normaliseStringArray(input.likelyBusinessNeeds),
    impliedStrategicGoals: normaliseStringArray(input.impliedStrategicGoals),
    deliverablesLikely: normaliseStringArray(input.deliverablesLikely),
    possibleHeadlineFacts: normaliseStringArray(input.possibleHeadlineFacts),
    matchCategories: normaliseStringArray(input.matchCategories),
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

async function renderPublishedResult(dom, application, publicUrl, localPreviewUrl) {
  dom.resultCompany.value = application.companyName || "";
  dom.resultRole.value = application.roleTitle || "";
  dom.resultLocation.value = application.location || "";
  dom.resultRef.value = application.ref || "";
  dom.resultUrl.value = publicUrl;
  dom.openPreviewLink.href = localPreviewUrl;
  dom.resultPanel.hidden = false;

  try {
    await renderQrImage(dom.resultQrImage, publicUrl);
  } catch {
    dom.resultQrImage.hidden = true;
  }
}

function buildPublicPreviewUrl(application) {
  return `${publicCvBaseUrl}#app=${encodeApplicationPayload(buildEmbeddedPreviewPayload(application))}`;
}

function buildLocalPreviewUrl(application) {
  return new URL(`../cv.html#app=${encodeApplicationPayload(buildEmbeddedPreviewPayload(application))}`, window.location.href).href;
}

function buildLocalPrintUrl(application) {
  return new URL(`../cv.html?print=1#app=${encodeApplicationPayload(buildEmbeddedPreviewPayload(application))}`, window.location.href).href;
}

function buildEmbeddedPreviewPayload(application) {
  return {
    c: application.companyName || "",
    r: application.roleTitle || "",
    l: application.location || "",
    s: application.sector || "",
    y: application.salary || "",
    e: application.employmentType || "",
    n: application.shortCompanyReason || "",
    o: application.shortRoleReason || "",
    a: application.advertSummary || "",
    i: application.personalisedIntro || "",
    w: application.whyThisRole || "",
    t: Array.isArray(application.toneKeywords) ? application.toneKeywords : [],
    p: Array.isArray(application.probablePriorities) ? application.probablePriorities : [],
    f: Array.isArray(application.keyFocusAreas) ? application.keyFocusAreas : [],
    h: application.hours || "",
    wp: application.workplaceType || "",
    cs: application.companySummary || "",
    rs: application.roleSummary || "",
    ha: application.headlineAttraction || "",
    rp: application.rolePurpose || "",
    travelRequired: application.travelRequired || "",
    companyPridePoints: Array.isArray(application.companyPridePoints) ? application.companyPridePoints : [],
    coreResponsibilities: Array.isArray(application.coreResponsibilities) ? application.coreResponsibilities : [],
    essentialRequirements: Array.isArray(application.essentialRequirements) ? application.essentialRequirements : [],
    preferredRequirements: Array.isArray(application.preferredRequirements) ? application.preferredRequirements : [],
    skillsWanted: Array.isArray(application.skillsWanted) ? application.skillsWanted : [],
    toolsMethodsMentioned: Array.isArray(application.toolsMethodsMentioned) ? application.toolsMethodsMentioned : [],
    stakeholderGroups: Array.isArray(application.stakeholderGroups) ? application.stakeholderGroups : [],
    teamTypesMentioned: Array.isArray(application.teamTypesMentioned) ? application.teamTypesMentioned : [],
    senioritySignals: Array.isArray(application.senioritySignals) ? application.senioritySignals : [],
    cultureSignals: Array.isArray(application.cultureSignals) ? application.cultureSignals : [],
    likelyBusinessNeeds: Array.isArray(application.likelyBusinessNeeds) ? application.likelyBusinessNeeds : [],
    impliedStrategicGoals: Array.isArray(application.impliedStrategicGoals) ? application.impliedStrategicGoals : [],
    deliverablesLikely: Array.isArray(application.deliverablesLikely) ? application.deliverablesLikely : [],
    phf: Array.isArray(application.possibleHeadlineFacts) ? application.possibleHeadlineFacts : [],
    mc: Array.isArray(application.matchCategories) ? application.matchCategories : []
  };
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

function slugify(text) {
  return String(text)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function toCleanString(value) {
  return typeof value === "string" ? value.trim() : "";
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

async function renderQrImage(img, text) {
  if (!img || !window.QRious) {
    if (img) img.hidden = true;
    return "";
  }

  const qr = new window.QRious({
    value: text,
    size: 300,
    level: "M",
    background: "white",
    foreground: "black"
  });

  const dataUrl = qr.toDataURL();
  img.src = dataUrl;
  img.hidden = false;
  return dataUrl;
}
