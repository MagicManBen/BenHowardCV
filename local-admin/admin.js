const LOCAL_API_BASE = "/api";
const DEFAULT_PUBLIC_CV_BASE_URL = "https://checkloops.co.uk/cv.html";

const REVIEW_FIELDS = [
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
  ["probablePriorities", "Probable priorities"],
  ["keyFocusAreas", "Key focus areas"],
  ["essentialRequirements", "Essential requirements"],
  ["preferredRequirements", "Preferred requirements"],
  ["skillsWanted", "Skills wanted"],
  ["likelyBusinessNeeds", "Likely business needs"],
  ["impliedStrategicGoals", "Implied strategic goals"],
];

let toastTimer = null;
let publicCvBaseUrl = DEFAULT_PUBLIC_CV_BASE_URL;
let publicJobBaseUrl = new URL("j/", DEFAULT_PUBLIC_CV_BASE_URL).href;
let publicRedirectBaseUrl = new URL("r/", DEFAULT_PUBLIC_CV_BASE_URL).href;

document.addEventListener("DOMContentLoaded", initLocalAdminPage);

async function initLocalAdminPage() {
  const dom = {
    keysStatus:       document.getElementById("keys-status"),
    jobJsonInput:     document.getElementById("job-json-input"),
    goButton:         document.getElementById("go-button"),
    clearButton:      document.getElementById("clear-button"),
    inputStatus:      document.getElementById("input-status"),
    inputError:       document.getElementById("input-error"),
    pipelinePanel:    document.getElementById("pipeline-panel"),
    pipelineMessage:  document.getElementById("pipeline-message"),
    pipelineError:    document.getElementById("pipeline-error"),
    pillParse:        document.getElementById("pill-parse"),
    pillGenerate:     document.getElementById("pill-generate"),
    resultsPanel:     document.getElementById("results-panel"),
    resultsTitle:     document.getElementById("results-title"),
    advertResults:    document.getElementById("advert-results"),
    contentResults:   document.getElementById("content-results"),
    debugJson:        document.getElementById("debug-json"),
    confirmButton:    document.getElementById("confirm-button"),
    regenerateButton: document.getElementById("regenerate-button"),
    confirmStatus:    document.getElementById("confirm-status"),
    confirmError:     document.getElementById("confirm-error"),
    resultPanel:      document.getElementById("result-panel"),
    resultCompany:    document.getElementById("result-company"),
    resultRole:       document.getElementById("result-role"),
    resultLocation:   document.getElementById("result-location"),
    resultRef:        document.getElementById("result-ref"),
    resultUrl:        document.getElementById("result-url"),
    copyUrlButton:    document.getElementById("copy-url-button"),
    openPreviewLink:  document.getElementById("open-preview-link"),
    downloadCvButton: document.getElementById("download-cv-button"),
    resultQrImage:    document.getElementById("result-qr-image"),
    resultQrUrl:      document.getElementById("result-qr-url"),
    copyQrUrlButton:  document.getElementById("copy-qr-url-button"),
    toast:            document.getElementById("toast"),
  };

  let pendingApplication = null;
  let localPreviewUrl = "";
  let localPrintUrl = "";

  await loadLocalStatus(dom);

  dom.goButton.addEventListener("click", () => runPipeline(dom));

  dom.clearButton.addEventListener("click", () => {
    dom.jobJsonInput.value = "";
    pendingApplication = null;
    dom.inputStatus.textContent = "Waiting for JSON.";
    dom.inputError.hidden = true;
    dom.pipelinePanel.hidden = true;
    dom.resultsPanel.hidden = true;
    dom.resultPanel.hidden = true;
    dom.pipelineError.hidden = true;
    dom.confirmError.hidden = true;
    showToast(dom, "Cleared.");
  });

  dom.regenerateButton.addEventListener("click", async () => {
    if (!pendingApplication) return;
    dom.regenerateButton.hidden = true;
    await runGeneration(dom, pendingApplication);
    dom.regenerateButton.hidden = false;
  });

  dom.confirmButton.addEventListener("click", async () => {
    dom.confirmError.hidden = true;
    if (!pendingApplication) {
      showError(dom.confirmError, "No application to publish.");
      return;
    }

    dom.confirmButton.disabled = true;
    dom.confirmButton.textContent = "Publishing\u2026";
    dom.confirmStatus.textContent = "Pushing to GitHub\u2026";

    try {
      const publishApplicationData = sanitizeApplicationForPublish(pendingApplication);
      const gen = pendingApplication.personalisedContent || {};
      if (gen.personalisedOpening) pendingApplication.personalisedIntro = gen.personalisedOpening;
      if (gen.whyThisCompany) pendingApplication.shortCompanyReason = gen.whyThisCompany;
      if (gen.whyThisRole) pendingApplication.whyThisRole = gen.whyThisRole;
      if (gen.fitSummary) pendingApplication.advertSummary = gen.fitSummary;
      if (gen.closingSummary) pendingApplication.closingSummary = gen.closingSummary;

      pendingApplication.genPersonalisedOpening = gen.personalisedOpening || "";
      pendingApplication.genWhyThisCompany = gen.whyThisCompany || "";
      pendingApplication.genWhyThisRole = gen.whyThisRole || "";
      pendingApplication.genFitSummary = gen.fitSummary || "";
      pendingApplication.genLikelyContribution = gen.likelyContributionSummary || "";
      pendingApplication.genCultureFit = gen.cultureFitSummary || "";
      pendingApplication.genClosingSummary = gen.closingSummary || "";
      pendingApplication.genCompanyHighlights = Array.isArray(gen.companyHighlights) ? gen.companyHighlights : [];
      pendingApplication.genEvidenceExamples = Array.isArray(gen.selectedEvidenceExamples) ? gen.selectedEvidenceExamples : [];

      const response = await publishApplication(publishApplicationData);
      const application = response.application || pendingApplication;
      const publicUrl = buildShortJobUrl(application);

      localPreviewUrl = buildLocalPreviewUrl(application);
      localPrintUrl = buildLocalPrintUrl(application);

      await renderPublishedResult(dom, application, publicUrl, localPreviewUrl);
      dom.resultPanel.hidden = false;
      dom.confirmStatus.textContent = "Published.";
      showToast(dom, response.publishedToGitHub ? "CV published." : "Saved locally.");
      dom.resultPanel.scrollIntoView({ behavior: "smooth", block: "start" });

      if (!response.publishedToGitHub) {
        showError(dom.confirmError, "Saved locally, but GitHub publish did not complete.");
      }
    } catch (error) {
      showError(dom.confirmError, error instanceof Error ? error.message : "Publish failed.");
      dom.confirmStatus.textContent = "Publish failed.";
    } finally {
      dom.confirmButton.disabled = false;
      dom.confirmButton.textContent = "Confirm & Publish";
    }
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
    }
  });

  if (dom.copyQrUrlButton) {
    dom.copyQrUrlButton.addEventListener("click", async () => {
      const url = dom.resultQrUrl ? dom.resultQrUrl.value : "";
      if (!url) return;
      try {
        await navigator.clipboard.writeText(url);
        showToast(dom, "QR URL copied.");
      } catch {
        if (dom.resultQrUrl) { dom.resultQrUrl.focus(); dom.resultQrUrl.select(); }
      }
    });
  }

  dom.downloadCvButton.addEventListener("click", async () => {
    var qrUrl = dom.resultQrUrl ? dom.resultQrUrl.value : "";
    var roleTitle = dom.resultRole ? dom.resultRole.value : "";
    var companyName = dom.resultCompany ? dom.resultCompany.value : "";
    if (!qrUrl) { showToast(dom, "No short URL available yet."); return; }
    dom.downloadCvButton.disabled = true;
    dom.downloadCvButton.textContent = "Uploading\u2026";
    try {
      var publicUrl = await downloadCvWithQr(qrUrl, roleTitle, companyName);
      showToast(dom, publicUrl ? "CV saved to GitHub and downloaded." : "CV downloaded.");
    } catch (err) {
      showToast(dom, "Download failed: " + (err.message || err));
    } finally {
      dom.downloadCvButton.disabled = false;
      dom.downloadCvButton.textContent = "Download CV";
    }
  });

  /* ── Pipeline ─────────────────────────────────────── */

  async function runPipeline(dom) {
    dom.inputError.hidden = true;
    dom.pipelineError.hidden = true;
    dom.confirmError.hidden = true;

    const rawText = dom.jobJsonInput.value.trim();
    if (!rawText) {
      showError(dom.inputError, "Paste the application JSON first.");
      return;
    }

    dom.pipelinePanel.hidden = false;
    dom.resultsPanel.hidden = true;
    dom.resultPanel.hidden = true;
    setPill(dom.pillParse, "running");
    setPill(dom.pillGenerate, "waiting");
    dom.pipelineMessage.textContent = "Parsing JSON\u2026";
    dom.pipelinePanel.scrollIntoView({ behavior: "smooth", block: "start" });

    /* STEP 1 \u2014 Parse */
    try {
      const parsed = JSON.parse(rawText);
      pendingApplication = normaliseApplicationPayload(parsed);
    } catch (error) {
      setPill(dom.pillParse, "error");
      dom.pipelineMessage.textContent = "Parse failed.";
      showError(dom.pipelineError, error instanceof Error ? error.message : "Invalid JSON.");
      dom.inputStatus.textContent = "Parse failed.";
      return;
    }

    setPill(dom.pillParse, "done");
    dom.inputStatus.textContent = "Parsed: " + pendingApplication.companyName + " / " + pendingApplication.roleTitle;

    dom.resultsPanel.hidden = false;
    dom.resultsTitle.textContent = pendingApplication.companyName + " \u2014 " + pendingApplication.roleTitle;
    dom.advertResults.innerHTML = renderAdvertGroup(pendingApplication);
    dom.pipelineMessage.textContent = "Generating tailored content\u2026";
    await runGeneration(dom, pendingApplication);

    dom.confirmButton.disabled = false;
    dom.confirmStatus.textContent = "Review the results, then confirm.";
    dom.regenerateButton.hidden = false;
  }

  async function runGeneration(dom, app) {
    setPill(dom.pillGenerate, "running");
    dom.pipelineMessage.textContent = "Generating tailored content\u2026";

    try {
      if (app.personalisedContent) {
        setPill(dom.pillGenerate, "done");
        dom.pipelineMessage.textContent = "Used pasted personalised content.";
        renderContentGroup(dom, {
          generatedContent: app.personalisedContent,
          evidenceSelection: app.evidenceSelection || { count: 0, error: null, examples: [] },
          meta: {
            success: true,
            source: "pasted-json",
          },
        });
        dom.debugJson.textContent = JSON.stringify(app, null, 2);
        showToast(dom, "Pasted personalised content loaded.");
        return;
      }

      const result = await generatePersonalisedContent(app);
      const meta = result.meta || {};

      if (!meta.success) {
        setPill(dom.pillGenerate, "error");
        dom.pipelineMessage.textContent = "Generation failed.";
        showError(dom.pipelineError, meta.error || "Generation did not succeed.");
        dom.confirmButton.disabled = false;
        dom.confirmStatus.textContent = "You can still publish without generated content.";
        return;
      }

      app.personalisedContent = result.generatedContent;
      app.evidenceSelection = result.evidenceSelection;

      setPill(dom.pillGenerate, "done");
      dom.pipelineMessage.textContent = "All done.";

      renderContentGroup(dom, result);
      dom.debugJson.textContent = JSON.stringify(app, null, 2);
      showToast(dom, "Pipeline complete.");
    } catch (error) {
      setPill(dom.pillGenerate, "error");
      dom.pipelineMessage.textContent = "Generation failed.";
      showError(dom.pipelineError, error instanceof Error ? error.message : "Generation failed.");
      dom.confirmButton.disabled = false;
      dom.confirmStatus.textContent = "You can still publish without generated content.";
    }
  }
}

/* ── Render helpers ────────────────────────────────── */

function renderAdvertGroup(app) {
  var parts = ['<p class="results-group-heading">Parsed advert</p>'];
  parts.push('<div class="review-grid">');
  for (var i = 0; i < REVIEW_FIELDS.length; i++) {
    var key = REVIEW_FIELDS[i][0], label = REVIEW_FIELDS[i][1];
    var value = app[key];
    if (!value || (Array.isArray(value) && value.length === 0)) continue;
    var display = Array.isArray(value) ? value.join(", ") : value;
    parts.push(
      '<article class="review-item"><span class="review-label">' + esc(label) +
      '</span><p class="review-value">' + esc(display) + '</p></article>'
    );
  }
  parts.push('</div>');
  return parts.join("");
}

function renderContentGroup(dom, result) {
  var content = result.generatedContent || {};
  var parts = ['<p class="results-group-heading">Generated content</p>'];

  var textFields = [
    ["Personalised opening", content.personalisedOpening],
    ["Why this company", content.whyThisCompany],
    ["Why this role", content.whyThisRole],
    ["Fit summary", content.fitSummary],
    ["Likely contribution", content.likelyContributionSummary],
    ["Culture fit", content.cultureFitSummary],
    ["Closing summary", content.closingSummary],
  ];

  parts.push('<div class="review-grid">');
  for (var i = 0; i < textFields.length; i++) {
    if (!textFields[i][1]) continue;
    parts.push(
      '<article class="review-item"><span class="review-label">' + esc(textFields[i][0]) +
      '</span><p class="review-value">' + esc(textFields[i][1]) + '</p></article>'
    );
  }
  parts.push('</div>');

  var highlights = content.companyHighlights || [];
  if (highlights.length) {
    parts.push('<p style="margin-top:0.6rem"><strong>Company highlights:</strong> ' + esc(highlights.join(" \u00b7 ")) + '</p>');
  }

  var examples = content.selectedEvidenceExamples || [];
  if (examples.length) {
    parts.push('<p style="margin-top:0.6rem"><strong>Evidence examples (' + examples.length + '):</strong></p>');
    for (var j = 0; j < examples.length; j++) {
      var ex = examples[j];
      parts.push(
        '<div class="review-value" style="padding:0.3rem 0;border-bottom:1px solid rgba(0,0,0,0.06)">' +
        '<strong>' + esc(ex.exampleTitle || "?") + '</strong> \u2014 ' +
        esc(ex.shortLine || ex.whyChosen || "") + '</div>'
      );
    }
  }

  dom.contentResults.innerHTML = parts.join("");
  dom.contentResults.hidden = false;
}

/* ── API calls ─────────────────────────────────────── */

async function loadLocalStatus(dom) {
  try {
    var response = await fetch(LOCAL_API_BASE + "/status?t=" + Date.now(), { cache: "no-store" });
    var payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Could not read local server status.");
    publicCvBaseUrl = payload.publicCvBaseUrl || DEFAULT_PUBLIC_CV_BASE_URL;
    publicJobBaseUrl = new URL("j/", publicCvBaseUrl).href;
    publicRedirectBaseUrl = new URL("r/", publicCvBaseUrl).href;
    if (!payload.hasGithubToken) {
      dom.keysStatus.textContent = "Local server running, but no GitHub token configured.";
      return;
    }
    dom.keysStatus.textContent = payload.githubAccessOk
      ? "Server ready. GitHub access confirmed."
      : "GitHub token loaded, but rejected: " + (payload.githubMessage || "Unknown error.");
  } catch (_) {
    dom.keysStatus.textContent = "Could not reach the local server.";
  }
}

async function publishApplication(application) {
  var response = await fetch(LOCAL_API_BASE + "/publish", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ application: application, clientContext: buildClientContext() }),
  });
  var payload = await response.json().catch(function () { return {}; });
  if (!response.ok) {
    var err = new Error(payload.error || "Server returned " + response.status);
    err.debugLogPath = payload.debugLogPath || "";
    throw err;
  }
  return payload;
}

async function generatePersonalisedContent(application) {
  var response = await fetch(LOCAL_API_BASE + "/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ application: application }),
  });
  var payload = await response.json().catch(function () { return {}; });
  if (!response.ok) throw new Error(payload.error || "Generate API returned " + response.status);
  return payload;
}

/* ── Utility ───────────────────────────────────────── */

function buildClientContext() {
  return { pageUrl: window.location.href, origin: window.location.origin, timestamp: new Date().toISOString() };
}

function normaliseApplicationPayload(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("JSON must be a single object.");
  var companyName = str(input.companyName);
  var roleTitle = str(input.roleTitle);
  var location = str(input.location);
  if (!companyName) throw new Error("companyName is required.");
  if (!roleTitle) throw new Error("roleTitle is required.");
  var baseRef = str(input.ref) || str(input.slug) || [companyName, roleTitle, location].filter(Boolean).join(" ");
  var ref = slugify(baseRef);
  if (!ref) throw new Error("Could not build a usable ref.");
  var now = new Date().toISOString();
  var providedContent = normaliseProvidedPersonalisedContent(input);
  return {
    ref: ref, companyName: companyName, roleTitle: roleTitle, location: location,
    sector: str(input.sector), salary: str(input.salary),
    employmentType: str(input.employmentType), hours: str(input.hours),
    workplaceType: str(input.workplaceType),
    cvText: str(input.cvText) || str(input.candidateCvText) || str(input.candidateCv),
    cvSummary: str(input.cvSummary) || str(input.candidateCvSummary),
    shortCompanyReason: str(input.shortCompanyReason), shortRoleReason: str(input.shortRoleReason),
    companySummary: str(input.companySummary), roleSummary: str(input.roleSummary),
    headlineAttraction: str(input.headlineAttraction), rolePurpose: str(input.rolePurpose),
    travelRequired: str(input.travelRequired),
    toneKeywords: arr(input.toneKeywords), probablePriorities: arr(input.probablePriorities),
    advertSummary: str(input.advertSummary), slug: ref,
    personalisedIntro: str(input.personalisedIntro), whyThisRole: str(input.whyThisRole),
    keyFocusAreas: arr(input.keyFocusAreas), companyPridePoints: arr(input.companyPridePoints),
    coreResponsibilities: arr(input.coreResponsibilities),
    essentialRequirements: arr(input.essentialRequirements), preferredRequirements: arr(input.preferredRequirements),
    skillsWanted: arr(input.skillsWanted), toolsMethodsMentioned: arr(input.toolsMethodsMentioned),
    stakeholderGroups: arr(input.stakeholderGroups), teamTypesMentioned: arr(input.teamTypesMentioned),
    senioritySignals: arr(input.senioritySignals), cultureSignals: arr(input.cultureSignals),
    likelyBusinessNeeds: arr(input.likelyBusinessNeeds), impliedStrategicGoals: arr(input.impliedStrategicGoals),
    deliverablesLikely: arr(input.deliverablesLikely), possibleHeadlineFacts: arr(input.possibleHeadlineFacts),
    matchCategories: arr(input.matchCategories),
    personalisedContent: providedContent,
    evidenceSelection: buildEvidenceSelectionFromContent(providedContent),
    createdAt: str(input.createdAt) || now, updatedAt: now,
  };
}

function sanitizeApplicationForPublish(application) {
  var payload = {};
  for (var key in application) {
    if (Object.prototype.hasOwnProperty.call(application, key)) {
      payload[key] = application[key];
    }
  }
  delete payload.cvText;
  delete payload.cvSummary;
  delete payload.candidateCv;
  delete payload.candidateCvText;
  delete payload.candidateCvSummary;
  return payload;
}

function normaliseProvidedPersonalisedContent(input) {
  var source = null;
  if (input.personalisedContent && typeof input.personalisedContent === "object" && !Array.isArray(input.personalisedContent)) {
    source = input.personalisedContent;
  } else if (input.generatedContent && typeof input.generatedContent === "object" && !Array.isArray(input.generatedContent)) {
    source = input.generatedContent;
  } else if (
    input.personalisedOpening || input.whyThisCompany || input.whyThisRole ||
    input.fitSummary || input.likelyContributionSummary || input.companyHighlights ||
    input.cultureFitSummary || input.closingSummary || input.selectedEvidenceExamples ||
    input.contentNotes
  ) {
    source = input;
  }

  if (!source) return null;

  return {
    personalisedOpening: str(source.personalisedOpening),
    whyThisCompany: str(source.whyThisCompany),
    whyThisRole: str(source.whyThisRole),
    selectedEvidenceExamples: normaliseEvidenceExamples(source.selectedEvidenceExamples),
    fitSummary: str(source.fitSummary),
    likelyContributionSummary: str(source.likelyContributionSummary),
    companyHighlights: arr(source.companyHighlights),
    cultureFitSummary: str(source.cultureFitSummary),
    closingSummary: str(source.closingSummary),
    contentNotes: arr(source.contentNotes),
  };
}

function normaliseEvidenceExamples(value) {
  if (!Array.isArray(value)) return [];
  return value.map(function (item) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    return {
      exampleId: str(item.exampleId),
      exampleTitle: str(item.exampleTitle),
      whyChosen: str(item.whyChosen),
      suggestedUsage: str(item.suggestedUsage),
      shortLine: str(item.shortLine),
    };
  }).filter(Boolean);
}

function buildEvidenceSelectionFromContent(content) {
  var examples = content && Array.isArray(content.selectedEvidenceExamples) ? content.selectedEvidenceExamples : [];
  return {
    count: examples.length,
    error: null,
    examples: examples.map(function (item) {
      return {
        id: item.exampleId || "",
        title: item.exampleTitle || "",
        employer: "",
        sector: "",
        matchScore: 0,
      };
    }),
  };
}

async function renderPublishedResult(dom, application, publicUrl, localPreviewUrl) {
  dom.resultCompany.value = application.companyName || "";
  dom.resultRole.value = application.roleTitle || "";
  dom.resultLocation.value = application.location || "";
  dom.resultRef.value = application.ref || "";
  dom.resultUrl.value = publicUrl;

  var qrUrl = buildShortQrUrl(application);
  if (qrUrl && dom.resultQrUrl) dom.resultQrUrl.value = qrUrl;
  var shortUrl = qrUrl || publicUrl;
  dom.openPreviewLink.href = shortUrl;
  var qrTarget = shortUrl;
  try { await renderQrImage(dom.resultQrImage, qrTarget); } catch (_) { dom.resultQrImage.hidden = true; }
}

function buildPublicPreviewUrl(app) {
  return publicCvBaseUrl + "#app=" + encodePayload(buildEmbeddedPayload(app));
}
function buildShortJobUrl(app) {
  return publicJobBaseUrl + "?r=" + encodeURIComponent(app.ref || "");
}
function buildShortQrUrl(app) {
  if (!app.shortCode) return "";
  return publicRedirectBaseUrl + encodeURIComponent(app.shortCode);
}
function buildLocalPreviewUrl(app) {
  return new URL("../cv.html#app=" + encodePayload(buildEmbeddedPayload(app)), window.location.href).href;
}
function buildLocalPrintUrl(app) {
  return new URL("../cv.html?print=1#app=" + encodePayload(buildEmbeddedPayload(app)), window.location.href).href;
}

function buildEmbeddedPayload(a) {
  return {
    c: a.companyName || "", r: a.roleTitle || "", l: a.location || "",
    s: a.sector || "", y: a.salary || "", e: a.employmentType || "",
    n: a.shortCompanyReason || "", o: a.shortRoleReason || "",
    a: a.advertSummary || "", i: a.personalisedIntro || "",
    w: a.whyThisRole || "",
    t: a.toneKeywords || [], p: a.probablePriorities || [],
    f: a.keyFocusAreas || [], h: a.hours || "", wp: a.workplaceType || "",
    cs: a.companySummary || "", rs: a.roleSummary || "",
    ha: a.headlineAttraction || "", rp: a.rolePurpose || "",
    travelRequired: a.travelRequired || "",
    companyPridePoints: a.companyPridePoints || [],
    coreResponsibilities: a.coreResponsibilities || [],
    essentialRequirements: a.essentialRequirements || [],
    preferredRequirements: a.preferredRequirements || [],
    skillsWanted: a.skillsWanted || [],
    toolsMethodsMentioned: a.toolsMethodsMentioned || [],
    stakeholderGroups: a.stakeholderGroups || [],
    teamTypesMentioned: a.teamTypesMentioned || [],
    senioritySignals: a.senioritySignals || [],
    cultureSignals: a.cultureSignals || [],
    likelyBusinessNeeds: a.likelyBusinessNeeds || [],
    impliedStrategicGoals: a.impliedStrategicGoals || [],
    deliverablesLikely: a.deliverablesLikely || [],
    phf: a.possibleHeadlineFacts || [],
    mc: a.matchCategories || [],
    gpo: a.genPersonalisedOpening || "", gwc: a.genWhyThisCompany || "",
    gwr: a.genWhyThisRole || "", gfs: a.genFitSummary || "",
    glc: a.genLikelyContribution || "", gcf: a.genCultureFit || "",
    gcs: a.genClosingSummary || "",
    gch: a.genCompanyHighlights || [], gee: a.genEvidenceExamples || [],
  };
}

function encodePayload(value) {
  var json = typeof value === "string" ? value : JSON.stringify(value);
  var bytes = new TextEncoder().encode(json);
  var binary = "";
  bytes.forEach(function (b) { binary += String.fromCharCode(b); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function setPill(el, state) {
  if (!el) return;
  el.className = "pill pill--" + state;
}

function slugify(text) {
  return String(text).normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
}
function str(v) { return typeof v === "string" ? v.trim() : ""; }
function arr(v) { return Array.isArray(v) ? v.map(function (i) { return typeof i === "string" ? i.trim() : ""; }).filter(Boolean) : []; }
function showError(el, msg) { if (el) { el.hidden = false; el.textContent = msg; } }
function showToast(dom, msg) {
  var el = dom.toast; if (!el) return;
  el.textContent = msg; el.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { el.classList.remove("is-visible"); }, 3000);
}
function esc(v) {
  return String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

async function renderQrImage(img, text) {
  if (!img || !window.QRious) { if (img) img.hidden = true; return; }
  var qr = new window.QRious({ value: text, size: 300, level: "M", background: "white", foreground: "black" });
  img.src = qr.toDataURL();
  img.hidden = false;
}

async function downloadCvWithQr(shortUrl, roleTitle, companyName) {
  /* 1. Generate QR data-URI */
  var qr = new window.QRious({ value: shortUrl, size: 240, level: "M", background: "#ffffff", foreground: "#284a5b" });
  var qrDataUrl = qr.toDataURL();

  /* 2. Fetch the base CV HTML */
  var response = await fetch("../BH%20CV.html?t=" + Date.now(), { cache: "no-store" });
  if (!response.ok) throw new Error("Could not fetch BH CV.html");
  var html = await response.text();

  /* 3. Build QR block label */
  var label = companyName
    ? "I have prepared a personalised CV for " + esc(companyName) + ". Scan or tap to view."
    : "I have prepared a more detailed CV tailored for this role. Scan or tap to view.";

  function makeQrBlock() {
    return (
      '<section class="sidebar-card" style="margin-top:auto; padding-top:0.8rem; border-top:1px solid rgba(255,255,255,0.14); text-align:center;">'
      + '<h2>Tailored CV</h2>'
      + '<a href="' + esc(shortUrl) + '" target="_blank" rel="noopener noreferrer" style="display:inline-block; margin-top:0.45rem; background:#fff; padding:6px; border-radius:6px; line-height:0;">'
      + '<img src="' + qrDataUrl + '" width="100" height="100" alt="QR code" style="display:block; width:100px; height:100px;">'
      + '</a>'
      + '<p style="margin-top:0.45rem; font-size:0.65rem; line-height:1.4; color:rgba(245,245,241,0.88);">' + label + '</p>'
      + '</section>'
    );
  }

  /* 4. Inject into BOTH sidebars (page 1 and page 2) */
  var positions = [];
  var search = html;
  var offset = 0;
  var idx;
  while ((idx = search.indexOf('</aside>')) !== -1) {
    positions.push(offset + idx);
    offset += idx + 8;
    search = search.slice(idx + 8);
  }
  if (positions.length === 0) throw new Error("Could not find any sidebar in BH CV.html");
  // Inject from last to first so earlier offsets stay valid
  for (var i = positions.length - 1; i >= 0; i--) {
    var pos = positions[i];
    html = html.slice(0, pos) + makeQrBlock() + '\n' + html.slice(pos);
  }

  /* 5. Build a safe filename */
  var safeName = "Ben Howard CV" + (companyName ? " - " + companyName : "");

  /* 6. Upload HTML to GitHub via local server */
  var uploadRes = await fetch(LOCAL_API_BASE + "/upload-cv", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename: safeName, content: html }),
  });
  var uploadPayload = await uploadRes.json().catch(function () { return {}; });
  if (!uploadRes.ok) throw new Error(uploadPayload.error || "Upload failed.");

  /* 7. Open in new window and trigger print-to-PDF */
  var printHtml = html.replace('</body>', '<script>window.onload=function(){window.print();}<\/script></body>');
  var pdfBlob = new Blob([printHtml], { type: 'text/html' });
  var blobUrl = URL.createObjectURL(pdfBlob);
  var win = window.open(blobUrl, '_blank');
  if (win) {
    win.addEventListener('afterprint', function () {
      URL.revokeObjectURL(blobUrl);
    });
  } else {
    setTimeout(function () { URL.revokeObjectURL(blobUrl); }, 30000);
  }

  return uploadPayload.publicUrl || "";
}
