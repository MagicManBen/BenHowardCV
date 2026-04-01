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
    toast: document.getElementById("toast"),
    // Research panel
    researchPanel: document.getElementById("research-panel"),
    runResearchButton: document.getElementById("run-research-button"),
    researchStatus: document.getElementById("research-status"),
    researchError: document.getElementById("research-error"),
    researchFindings: document.getElementById("research-findings"),
    researchDebugPanel: document.getElementById("research-debug-panel"),
    researchRawJson: document.getElementById("research-raw-json"),
    // Filter panel
    filterFindingsButton: document.getElementById("filter-findings-button"),
    filteredPanel: document.getElementById("filtered-panel"),
    filterStatus: document.getElementById("filter-status"),
    filterError: document.getElementById("filter-error"),
    filteredFindings: document.getElementById("filtered-findings"),
    filteredDebugPanel: document.getElementById("filtered-debug-panel"),
    filteredRawJson: document.getElementById("filtered-raw-json"),
    // Generate panel
    generatePanel: document.getElementById("generate-panel"),
    generateContentButton: document.getElementById("generate-content-button"),
    generateStatus: document.getElementById("generate-status"),
    generateError: document.getElementById("generate-error"),
    generatedContent: document.getElementById("generated-content"),
    generateDebugPanel: document.getElementById("generate-debug-panel"),
    generateRawJson: document.getElementById("generate-raw-json"),
    // Apply panel
    applyPanel: document.getElementById("apply-panel"),
    applyContentButton: document.getElementById("apply-content-button"),
    applyStatus: document.getElementById("apply-status"),
    applyError: document.getElementById("apply-error"),
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
    dom.researchPanel.hidden = true;
    dom.researchFindings.hidden = true;
    dom.researchDebugPanel.hidden = true;
    dom.researchError.hidden = true;
    dom.researchStatus.textContent = "Ready to research.";
    dom.researchRawJson.textContent = "No research run yet.";
    dom.filterFindingsButton.disabled = true;
    dom.filteredPanel.hidden = true;
    dom.filterError.hidden = true;
    dom.filterStatus.textContent = "";
    dom.filteredDebugPanel.hidden = true;
    dom.filteredRawJson.textContent = "No filtering run yet.";
    dom.generatePanel.hidden = true;
    dom.generateContentButton.disabled = true;
    dom.generateError.hidden = true;
    dom.generateStatus.textContent = "Review the advert first.";
    dom.generatedContent.hidden = true;
    dom.generateDebugPanel.hidden = true;
    dom.generateRawJson.textContent = "No generation run yet.";
    dom.applyPanel.hidden = true;
    dom.applyContentButton.disabled = true;
    dom.applyError.hidden = true;
    dom.applyStatus.textContent = "Generate content first.";
    dom.confirmPublishButton.disabled = true;
    dom.reviewError.hidden = true;
    dom.publishError.hidden = true;
    dom.reviewStatus.textContent = "Waiting for JSON.";
    dom.publishStatus.textContent = "";
    dom.publishStatus.hidden = true;
    dom.rawJsonOutput.textContent = "No application loaded yet.";
    showToast(dom, "Cleared.");
  });

  dom.jobJsonInput?.addEventListener("input", () => {
    if (!pendingApplication) return;
    pendingApplication = null;
    dom.confirmPublishButton.disabled = true;
    dom.reviewStatus.textContent = "JSON changed — review again.";
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
      dom.researchPanel.hidden = false;
      dom.generatePanel.hidden = false;
      dom.generateContentButton.disabled = false;
      dom.generateStatus.textContent = "Ready to generate.";
      // Show apply panel so the "Publish without generation" fallback is accessible
      dom.applyPanel.hidden = false;
      dom.confirmPublishButton.disabled = false;
      dom.applyStatus.textContent = "Generate content first, or publish without it.";
      dom.reviewStatus.textContent = `Parsed ${pendingApplication.companyName} / ${pendingApplication.roleTitle}.`;
      showToast(dom, "Advert parsed.");
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
    dom.applyStatus.textContent = "Publishing without generated content...";

    try {
      const response = await publishApplication(pendingApplication);
      const application = response.application || pendingApplication;
      const publicUrl = buildPublicPreviewUrl(application);

      localPreviewUrl = buildLocalPreviewUrl(application);
      localPrintUrl = buildLocalPrintUrl(application);

      await renderPublishedResult(dom, application, publicUrl, localPreviewUrl);
      dom.resultPanel.hidden = false;
      dom.publishStatus.hidden = false;
      dom.publishStatus.textContent = response.publishedToGitHub
        ? `Published (without generation). Debug log: ${response.debugLogPath || "not reported"}`
        : `Saved locally (without generation). Debug log: ${response.debugLogPath || "not reported"}`;
      showToast(dom, response.publishedToGitHub ? "CV published." : "Saved locally.");
      dom.resultPanel.scrollIntoView({ behavior: "smooth", block: "start" });

      if (!response.publishedToGitHub) {
        showError(dom.publishError, "Saved locally, but GitHub publish did not complete.");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not publish the application.";
      showError(dom.publishError, message);
      dom.applyStatus.textContent = error instanceof Error && "debugLogPath" in error && error.debugLogPath
        ? `Publish failed. Debug log: ${error.debugLogPath}`
        : "Publish failed.";
    } finally {
      dom.confirmPublishButton.disabled = false;
      dom.confirmPublishButton.textContent = "Publish without generation";
    }
  });

  dom.runResearchButton?.addEventListener("click", async () => {
    dom.researchError.hidden = true;

    if (!pendingApplication) {
      showError(dom.researchError, "Review the JSON first before running research.");
      return;
    }

    dom.runResearchButton.disabled = true;
    dom.runResearchButton.textContent = "Running APIs...";
    dom.researchStatus.textContent = "Calling research APIs...";
    dom.researchFindings.hidden = true;
    dom.researchDebugPanel.hidden = true;

    try {
      const research = await runCompanyResearch(pendingApplication);

      // Store research on the application object for later stages
      pendingApplication.research = research;

      dom.researchRawJson.textContent = JSON.stringify(research, null, 2);
      dom.researchDebugPanel.hidden = false;

      const findings = research.rawFindings || [];
      const meta = research.meta || {};
      const sourceErrors = meta.sourceErrors || {};

      if (findings.length === 0 && Object.keys(sourceErrors).length === 0) {
        dom.researchStatus.textContent = "No findings returned from any source.";
        dom.researchFindings.innerHTML = '<p class="card-helper">No results found. This may be expected for small or private companies.</p>';
        dom.researchFindings.hidden = false;
      } else {
        const errorCount = Object.keys(sourceErrors).length;
        const statusParts = [`${findings.length} finding${findings.length !== 1 ? "s" : ""} from ${(meta.sourcesRun || []).length} source${(meta.sourcesRun || []).length !== 1 ? "s" : ""}`];
        if (errorCount > 0) {
          statusParts.push(`${errorCount} source error${errorCount !== 1 ? "s" : ""}`);
        }
        dom.researchStatus.textContent = statusParts.join(". ") + ".";
        dom.researchFindings.innerHTML = renderResearchFindings(findings, meta);
        dom.researchFindings.hidden = false;
      }

      showToast(dom, `Research complete: ${findings.length} finding${findings.length !== 1 ? "s" : ""}.`);

      // Enable filtering now that raw findings exist
      dom.filterFindingsButton.disabled = findings.length === 0;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Research request failed.";
      showError(dom.researchError, message);
      dom.researchStatus.textContent = "Research failed.";
    } finally {
      dom.runResearchButton.disabled = false;
      dom.runResearchButton.textContent = "Run APIs";
    }
  });

  dom.filterFindingsButton?.addEventListener("click", async () => {
    dom.filterError.hidden = true;

    if (!pendingApplication || !pendingApplication.research || !pendingApplication.research.rawFindings) {
      showError(dom.filterError, "Run the research APIs first.");
      return;
    }

    dom.filterFindingsButton.disabled = true;
    dom.filterFindingsButton.textContent = "Filtering...";
    dom.filterStatus.textContent = "Filtering and ranking findings...";
    dom.filteredPanel.hidden = false;
    dom.filteredFindings.innerHTML = "";
    dom.filteredDebugPanel.hidden = true;

    try {
      const filtered = await filterResearchFindings(pendingApplication, pendingApplication.research.rawFindings);

      // Store on application for later stages
      pendingApplication.research.filteredFindings = filtered;

      dom.filteredRawJson.textContent = JSON.stringify(filtered, null, 2);
      dom.filteredDebugPanel.hidden = false;

      const sourceCount = (filtered.sourceItems || []).length;
      const meta = filtered.meta || {};
      dom.filterStatus.textContent = `Filtered: ${meta.scoredAboveThreshold || 0} relevant finding${(meta.scoredAboveThreshold || 0) !== 1 ? "s" : ""} from ${meta.totalRawFindings || 0} raw.`;
      dom.filteredFindings.innerHTML = renderFilteredProfile(filtered);

      showToast(dom, `Filtering complete: ${sourceCount} source item${sourceCount !== 1 ? "s" : ""} retained.`);
      dom.filteredPanel.scrollIntoView({ behavior: "smooth", block: "start" });

      // If generation hasn't run yet, note that research is now available
      if (!pendingApplication.personalisedContent) {
        dom.generateStatus.textContent = "Ready to generate (research included).";
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Filtering request failed.";
      showError(dom.filterError, message);
      dom.filterStatus.textContent = "Filtering failed.";
    } finally {
      dom.filterFindingsButton.disabled = false;
      dom.filterFindingsButton.textContent = "Filter Findings";
    }
  });

  dom.generateContentButton?.addEventListener("click", async () => {
    dom.generateError.hidden = true;

    if (!pendingApplication) {
      showError(dom.generateError, "Review the advert JSON first.");
      return;
    }

    dom.generateContentButton.disabled = true;
    dom.generateContentButton.textContent = "Generating...";
    dom.generateStatus.textContent = "Calling OpenAI — this may take a few seconds...";
    dom.generatedContent.hidden = true;
    dom.generateDebugPanel.hidden = true;

    try {
      // Pass filtered research if available, otherwise empty object
      const filteredFindings = (pendingApplication.research && pendingApplication.research.filteredFindings) || {};
      const result = await generatePersonalisedContent(
        pendingApplication,
        filteredFindings
      );

      dom.generateRawJson.textContent = JSON.stringify(result, null, 2);
      dom.generateDebugPanel.hidden = false;

      const meta = result.meta || {};
      if (!meta.success) {
        showError(dom.generateError, meta.error || "Generation did not succeed.");
        dom.generateStatus.textContent = "Generation failed.";
        return;
      }

      // Store on application for later use
      pendingApplication.personalisedContent = result.generatedContent;
      pendingApplication.evidenceSelection = result.evidenceSelection;

      dom.generatedContent.innerHTML = renderGeneratedContent(result);
      dom.generatedContent.hidden = false;
      const hasResearch = pendingApplication.research && pendingApplication.research.filteredFindings;
      dom.generateStatus.textContent = `Done${hasResearch ? " (with company research)" : ""} — continue to Step 4.`;
      showToast(dom, "Content generated.");
      dom.generatePanel.scrollIntoView({ behavior: "smooth", block: "start" });

      // Enable apply step
      dom.applyPanel.hidden = false;
      dom.applyContentButton.disabled = false;
      dom.applyStatus.textContent = "Ready to publish.";
    } catch (error) {
      const message = error instanceof Error ? error.message : "Generation request failed.";
      showError(dom.generateError, message);
      dom.generateStatus.textContent = "Generation failed.";
    } finally {
      dom.generateContentButton.disabled = false;
      dom.generateContentButton.textContent = "Generate Personalised Content";
    }
  });

  dom.applyContentButton?.addEventListener("click", async () => {
    dom.applyError.hidden = true;

    if (!pendingApplication || !pendingApplication.personalisedContent) {
      showError(dom.applyError, "Generate personalised content first.");
      return;
    }

    dom.applyContentButton.disabled = true;
      dom.applyContentButton.textContent = "Publishing...";
      dom.applyStatus.textContent = "Applying content and pushing to GitHub...";
    try {
      // Merge generated content fields into the application
      const gen = pendingApplication.personalisedContent;
      if (gen.personalisedOpening) pendingApplication.personalisedIntro = gen.personalisedOpening;
      if (gen.whyThisCompany) pendingApplication.shortCompanyReason = gen.whyThisCompany;
      if (gen.whyThisRole) pendingApplication.whyThisRole = gen.whyThisRole;
      if (gen.fitSummary) pendingApplication.advertSummary = gen.fitSummary;
      if (gen.closingSummary) pendingApplication.closingSummary = gen.closingSummary;

      // Store generated-only fields directly on the application
      pendingApplication.genPersonalisedOpening = gen.personalisedOpening || "";
      pendingApplication.genWhyThisCompany = gen.whyThisCompany || "";
      pendingApplication.genWhyThisRole = gen.whyThisRole || "";
      pendingApplication.genFitSummary = gen.fitSummary || "";
      pendingApplication.genLikelyContribution = gen.likelyContributionSummary || "";
      pendingApplication.genCultureFit = gen.cultureFitSummary || "";
      pendingApplication.genClosingSummary = gen.closingSummary || "";
      pendingApplication.genCompanyHighlights = Array.isArray(gen.companyHighlights) ? gen.companyHighlights : [];
      pendingApplication.genEvidenceExamples = Array.isArray(gen.selectedEvidenceExamples) ? gen.selectedEvidenceExamples : [];

      // Now publish
      dom.publishError.hidden = true;
      dom.confirmPublishButton.disabled = true;

      const response = await publishApplication(pendingApplication);
      const application = response.application || pendingApplication;
      const publicUrl = buildPublicPreviewUrl(application);

      localPreviewUrl = buildLocalPreviewUrl(application);
      localPrintUrl = buildLocalPrintUrl(application);

      await renderPublishedResult(dom, application, publicUrl, localPreviewUrl);
      dom.resultPanel.hidden = false;
      dom.applyStatus.textContent = "Published.";
      dom.publishStatus.hidden = false;
      dom.publishStatus.textContent = response.publishedToGitHub
        ? `Published with generated content. Debug log: ${response.debugLogPath || "not reported"}`
        : `Saved locally with generated content. Debug log: ${response.debugLogPath || "not reported"}`;
      showToast(dom, response.publishedToGitHub ? "CV published." : "Saved locally.");
      dom.resultPanel.scrollIntoView({ behavior: "smooth", block: "start" });

      if (!response.publishedToGitHub) {
        showError(dom.applyError, "Saved locally, but GitHub publish did not complete.");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not apply and publish the application.";
      showError(dom.applyError, message);
      dom.applyStatus.textContent = "Publish failed.";
    } finally {
      dom.applyContentButton.disabled = false;
      dom.applyContentButton.textContent = "Publish CV";
      dom.confirmPublishButton.disabled = false;
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
    mc: Array.isArray(application.matchCategories) ? application.matchCategories : [],
    // Generated content (Stage 4)
    gpo: application.genPersonalisedOpening || "",
    gwc: application.genWhyThisCompany || "",
    gwr: application.genWhyThisRole || "",
    gfs: application.genFitSummary || "",
    glc: application.genLikelyContribution || "",
    gcf: application.genCultureFit || "",
    gcs: application.genClosingSummary || "",
    gch: Array.isArray(application.genCompanyHighlights) ? application.genCompanyHighlights : [],
    gee: Array.isArray(application.genEvidenceExamples) ? application.genEvidenceExamples : []
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

// ---------------------------------------------------------------------------
// Company research (Stage 1)
// ---------------------------------------------------------------------------

async function runCompanyResearch(application) {
  const response = await fetch(`${LOCAL_API_BASE}/research`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ application }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `Research API returned ${response.status}`);
  }
  return payload;
}

function renderResearchFindings(findings, meta) {
  const sourceErrors = meta.sourceErrors || {};
  const parts = [];

  // Show source errors if any
  if (Object.keys(sourceErrors).length > 0) {
    parts.push('<div class="research-errors">');
    for (const [source, error] of Object.entries(sourceErrors)) {
      parts.push(`<p class="inline-feedback"><strong>${escapeHtml(source)}:</strong> ${escapeHtml(error)}</p>`);
    }
    parts.push("</div>");
  }

  if (findings.length === 0) {
    return parts.join("");
  }

  // Group findings by source
  const grouped = {};
  for (const f of findings) {
    const src = f.sourceName || "Unknown";
    if (!grouped[src]) grouped[src] = [];
    grouped[src].push(f);
  }

  for (const [sourceName, items] of Object.entries(grouped)) {
    parts.push(`<div class="research-source-group">`);
    parts.push(`<h3 class="research-source-heading">${escapeHtml(sourceName)} <span class="research-count">(${items.length})</span></h3>`);

    for (const f of items) {
      parts.push('<article class="research-finding">');
      parts.push(`<p class="research-finding-title">${escapeHtml(f.title || "Untitled")}</p>`);

      if (f.description || f.snippet) {
        parts.push(`<p class="research-finding-desc">${escapeHtml(f.snippet || f.description)}</p>`);
      }

      const meta_bits = [];
      if (f.confidence > 0) meta_bits.push(`Confidence: ${(f.confidence * 100).toFixed(0)}%`);
      if (f.matchReason) meta_bits.push(f.matchReason);
      if (f.entityId) meta_bits.push(`ID: ${f.entityId}`);
      if (meta_bits.length > 0) {
        parts.push(`<p class="research-finding-meta">${escapeHtml(meta_bits.join(" · "))}</p>`);
      }

      if (f.url) {
        parts.push(`<p class="research-finding-link"><a href="${escapeHtml(f.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(f.url)}</a></p>`);
      }

      parts.push("</article>");
    }

    parts.push("</div>");
  }

  // Stage 2 hook: filtering controls added above
  // Stage 3 hook: add OpenAI generation trigger here

  return parts.join("");
}

// ---------------------------------------------------------------------------
// Company research filtering (Stage 2)
// ---------------------------------------------------------------------------

async function filterResearchFindings(application, rawFindings) {
  const response = await fetch(`${LOCAL_API_BASE}/research/filter`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ application, rawFindings }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `Filter API returned ${response.status}`);
  }
  return payload;
}

function renderFilteredProfile(profile) {
  const parts = [];

  // Summary fields
  const fields = [
    ["Canonical name", profile.canonicalCompanyName],
    ["Description", profile.bestEntityDescription],
    ["Official website", profile.officialWebsite],
    ["Company type", profile.companyType],
    ["Industry", profile.industry],
    ["Headquarters", profile.headquarters],
    ["Parent company", profile.parentCompany],
  ];

  parts.push('<div class="filtered-profile-grid">');
  for (const [label, value] of fields) {
    if (!value) continue;
    const isUrl = value.startsWith("http://") || value.startsWith("https://");
    const display = isUrl
      ? `<a href="${escapeHtml(value)}" target="_blank" rel="noopener noreferrer">${escapeHtml(value)}</a>`
      : escapeHtml(value);
    parts.push(`
      <article class="review-item">
        <span class="review-label">${escapeHtml(label)}</span>
        <p class="review-value">${display}</p>
      </article>
    `);
  }
  parts.push("</div>");

  // List fields
  const listFields = [
    ["Regions", profile.regions],
    ["Notable products / services", profile.notableProductsOrServices],
    ["Notable facts", profile.notableFacts],
    ["Strategic signals", profile.strategicSignals],
    ["Credibility notes", profile.credibilityNotes],
  ];

  for (const [label, items] of listFields) {
    if (!Array.isArray(items) || items.length === 0) continue;
    parts.push(`<div class="filtered-list-section">`);
    parts.push(`<h4 class="filtered-list-heading">${escapeHtml(label)}</h4>`);
    parts.push("<ul class=\"filtered-list\">");
    for (const item of items) {
      parts.push(`<li>${escapeHtml(item)}</li>`);
    }
    parts.push("</ul></div>");
  }

  // Source items
  const sourceItems = profile.sourceItems || [];
  if (sourceItems.length > 0) {
    parts.push('<div class="research-source-group">');
    parts.push(`<h4 class="filtered-list-heading">Retained sources <span class="research-count">(${sourceItems.length})</span></h4>`);
    for (const s of sourceItems) {
      parts.push('<article class="research-finding">');
      parts.push(`<p class="research-finding-title">${escapeHtml(s.title || "Untitled")} <span class="research-count">— ${escapeHtml(s.sourceName)}</span></p>`);
      if (s.snippet) {
        parts.push(`<p class="research-finding-desc">${escapeHtml(s.snippet)}</p>`);
      }
      const bits = [];
      if (s.confidence > 0) bits.push(`Score: ${(s.confidence * 100).toFixed(0)}%`);
      if (s.relevanceReason) bits.push(s.relevanceReason);
      if (bits.length > 0) {
        parts.push(`<p class="research-finding-meta">${escapeHtml(bits.join(" · "))}</p>`);
      }
      if (s.url) {
        parts.push(`<p class="research-finding-link"><a href="${escapeHtml(s.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(s.url)}</a></p>`);
      }
      parts.push("</article>");
    }
    parts.push("</div>");
  }

  // Stage 3 hook: add OpenAI generation button/trigger here

  if (parts.length === 0 || (profile.sourceItems || []).length === 0) {
    parts.push('<p class="card-helper">No useful company information could be extracted from the raw findings.</p>');
  }

  return parts.join("");
}

// ---------------------------------------------------------------------------
// Personalised content generation (Stage 3)
// ---------------------------------------------------------------------------

async function generatePersonalisedContent(application, filteredFindings) {
  const response = await fetch(`${LOCAL_API_BASE}/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ application, filteredFindings }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `Generate API returned ${response.status}`);
  }
  return payload;
}

function renderGeneratedContent(result) {
  const content = result.generatedContent || {};
  const evidence = result.evidenceSelection || {};
  const parts = [];

  // Text fields
  const textFields = [
    ["Personalised opening", content.personalisedOpening],
    ["Why this company", content.whyThisCompany],
    ["Why this role", content.whyThisRole],
    ["Fit summary", content.fitSummary],
    ["Likely contribution", content.likelyContributionSummary],
    ["Culture fit", content.cultureFitSummary],
    ["Closing summary", content.closingSummary],
  ];

  parts.push('<div class="filtered-profile-grid">');
  for (const [label, value] of textFields) {
    if (!value) continue;
    parts.push(`
      <article class="review-item">
        <span class="review-label">${escapeHtml(label)}</span>
        <p class="review-value">${escapeHtml(value)}</p>
      </article>
    `);
  }
  parts.push("</div>");

  // Company highlights
  const highlights = content.companyHighlights || [];
  if (highlights.length > 0) {
    parts.push('<div class="filtered-list-section">');
    parts.push('<h4 class="filtered-list-heading">Company highlights</h4>');
    parts.push('<ul class="filtered-list">');
    for (const h of highlights) {
      parts.push(`<li>${escapeHtml(h)}</li>`);
    }
    parts.push("</ul></div>");
  }

  // Selected evidence examples
  const examples = content.selectedEvidenceExamples || [];
  if (examples.length > 0) {
    parts.push('<div class="research-source-group">');
    parts.push(`<h4 class="filtered-list-heading">Selected evidence examples <span class="research-count">(${examples.length})</span></h4>`);
    for (const ex of examples) {
      parts.push('<article class="research-finding">');
      parts.push(`<p class="research-finding-title">${escapeHtml(ex.exampleTitle || "Untitled")} <span class="research-count">— ID ${escapeHtml(String(ex.exampleId || "?"))}</span></p>`);
      if (ex.shortLine) {
        parts.push(`<p class="research-finding-desc"><strong>${escapeHtml(ex.shortLine)}</strong></p>`);
      }
      if (ex.whyChosen) {
        parts.push(`<p class="research-finding-desc">${escapeHtml(ex.whyChosen)}</p>`);
      }
      const bits = [];
      if (ex.suggestedUsage) bits.push(`Usage: ${ex.suggestedUsage}`);
      if (bits.length > 0) {
        parts.push(`<p class="research-finding-meta">${escapeHtml(bits.join(" · "))}</p>`);
      }
      parts.push("</article>");
    }
    parts.push("</div>");
  }

  // Evidence selection summary
  if (evidence.count > 0) {
    parts.push('<div class="filtered-list-section">');
    parts.push(`<h4 class="filtered-list-heading">Evidence bank shortlist <span class="research-count">(${evidence.count} considered)</span></h4>`);
    parts.push('<ul class="filtered-list">');
    for (const ex of (evidence.examples || [])) {
      parts.push(`<li>${escapeHtml(ex.title || "?")} (${escapeHtml(ex.employer || "?")}) — match: ${((ex.matchScore || 0) * 100).toFixed(0)}%</li>`);
    }
    parts.push("</ul></div>");
    if (evidence.error) {
      parts.push(`<p class="inline-feedback">${escapeHtml(evidence.error)}</p>`);
    }
  }

  // Content notes
  const notes = content.contentNotes || [];
  if (notes.length > 0) {
    parts.push('<div class="filtered-list-section">');
    parts.push('<h4 class="filtered-list-heading">Content notes</h4>');
    parts.push('<ul class="filtered-list">');
    for (const n of notes) {
      parts.push(`<li>${escapeHtml(n)}</li>`);
    }
    parts.push("</ul></div>");
  }

  if (!content.personalisedOpening && examples.length === 0) {
    parts.push('<p class="card-helper">No personalised content was generated. Check the debug JSON for details.</p>');
  }

  return parts.join("");
}

// ---------------------------------------------------------------------------
// QR code rendering
// ---------------------------------------------------------------------------

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
