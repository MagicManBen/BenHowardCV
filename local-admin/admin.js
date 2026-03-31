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
      const publicUrl = response.publicUrl || buildPublicPreviewUrl(application.ref);

      localPreviewUrl = buildLocalPreviewUrl(application.ref);
      localPrintUrl = buildLocalPrintUrl(application.ref);

      await renderPublishedResult(dom, application, publicUrl, localPreviewUrl);
      dom.resultPanel.hidden = false;
      dom.publishStatus.textContent = response.publishedToGitHub ? "Published." : "Saved locally.";
      showToast(dom, response.publishedToGitHub ? "Application published." : "Saved locally.");
      dom.resultPanel.scrollIntoView({ behavior: "smooth", block: "start" });

      if (!response.publishedToGitHub) {
        showError(dom.publishError, "Saved locally, but GitHub publish did not complete.");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not publish the application.";
      showError(dom.publishError, message);
      dom.publishStatus.textContent = "Publish failed.";
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
    body: JSON.stringify({ application })
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload.error || `Local server returned ${response.status}`;
    throw new Error(message);
  }

  return payload;
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

function buildPublicPreviewUrl(ref) {
  return `${publicCvBaseUrl}?ref=${encodeURIComponent(ref)}`;
}

function buildLocalPreviewUrl(ref) {
  return new URL(`../cv.html?ref=${encodeURIComponent(ref)}`, window.location.href).href;
}

function buildLocalPrintUrl(ref) {
  return new URL(`../cv.html?ref=${encodeURIComponent(ref)}&print=1`, window.location.href).href;
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
