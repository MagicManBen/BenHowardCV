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
    pillResearch:     document.getElementById("pill-research"),
    pillGenerate:     document.getElementById("pill-generate"),
    resultsPanel:     document.getElementById("results-panel"),
    resultsTitle:     document.getElementById("results-title"),
    advertResults:    document.getElementById("advert-results"),
    researchResults:  document.getElementById("research-results"),
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

      const response = await publishApplication(pendingApplication);
      const application = response.application || pendingApplication;
      const publicUrl = buildShortJobUrl(application);

      localPreviewUrl = buildLocalPreviewUrl(application);
      localPrintUrl = buildLocalPrintUrl(application);

      await renderPublishedResult(dom, application, publicUrl, localPreviewUrl);
      dom.resultPanel.hidden = false;
      dom.confirmStatus.textContent = "Published.";
      showToast(dom, response.publishedToGitHub ? "CV published." : "Saved locally.");
      dom.resultPanel.scrollIntoView({ behavior: "smooth", block: "start" });

      window.open(localPreviewUrl, "_blank", "noopener,noreferrer");

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

  dom.downloadCvButton.addEventListener("click", () => {
    if (localPrintUrl) window.open(localPrintUrl, "_blank", "noopener,noreferrer");
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
    setPill(dom.pillResearch, "waiting");
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

    /* STEP 2 \u2014 Company research */
    setPill(dom.pillResearch, "running");
    dom.pipelineMessage.textContent = "Running company research\u2026";

    try {
      const researchData = await runCompanyResearch(pendingApplication);
      pendingApplication.research = researchData;

      const findings = researchData.rawFindings || [];
      if (findings.length > 0) {
        try {
          const filtered = await filterResearchFindings(pendingApplication, findings);
          pendingApplication.research.filteredFindings = filtered;
        } catch (_) { /* filtering failed, continue */ }
      }

      setPill(dom.pillResearch, "done");
      const count = (pendingApplication.research.filteredFindings && pendingApplication.research.filteredFindings.sourceItems
        ? pendingApplication.research.filteredFindings.sourceItems
        : researchData.rawFindings || []).length;
      dom.pipelineMessage.textContent = "Research done (" + count + " findings). Generating content\u2026";

      renderResearchGroup(dom, pendingApplication.research);
    } catch (_) {
      setPill(dom.pillResearch, "skipped");
      dom.pipelineMessage.textContent = "Research unavailable. Generating content\u2026";
      dom.researchResults.innerHTML = '<p class="results-group-heading">Company research</p><p class="card-helper">Research API was unavailable \u2014 skipped.</p>';
      dom.researchResults.hidden = false;
    }

    /* STEP 3 \u2014 Generate */
    await runGeneration(dom, pendingApplication);

    dom.confirmButton.disabled = false;
    dom.confirmStatus.textContent = "Review the results, then confirm.";
    dom.regenerateButton.hidden = false;
  }

  async function runGeneration(dom, app) {
    setPill(dom.pillGenerate, "running");
    dom.pipelineMessage.textContent = "Generating tailored content\u2026";

    try {
      const filteredFindings = buildFilteredFromCheckboxes(app);
      const result = await generatePersonalisedContent(app, filteredFindings);
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

  function buildFilteredFromCheckboxes(app) {
    const research = app.research;
    if (!research || !research.filteredFindings) return {};
    const filtered = Object.assign({}, research.filteredFindings);
    const checkboxes = document.querySelectorAll("#research-results input[type=checkbox]");
    if (checkboxes.length === 0) return filtered;
    const sourceItems = filtered.sourceItems || [];
    const kept = [];
    checkboxes.forEach(function (cb, i) {
      if (cb.checked && sourceItems[i]) kept.push(sourceItems[i]);
    });
    filtered.sourceItems = kept;
    return filtered;
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

function renderResearchGroup(dom, research) {
  var filtered = research.filteredFindings;
  var items = (filtered && filtered.sourceItems) ? filtered.sourceItems : (research.rawFindings || []);

  /* Build the summary line from filtered metadata */
  var summaryParts = [];
  if (filtered) {
    var fields = [
      ["Name", filtered.canonicalCompanyName],
      ["Description", filtered.bestEntityDescription],
      ["Website", filtered.officialWebsite],
      ["Industry", filtered.industry],
      ["Type", filtered.companyType],
      ["HQ", filtered.headquarters],
    ];
    for (var f = 0; f < fields.length; f++) {
      if (fields[f][1]) summaryParts.push("<strong>" + esc(fields[f][0]) + ":</strong> " + esc(fields[f][1]));
    }
  }

  /* Nothing useful to show */
  if (items.length === 0 && summaryParts.length === 0) {
    dom.researchResults.innerHTML = '<p class="results-group-heading">Company research</p><p class="card-helper">No research findings returned for this company.</p>';
    dom.researchResults.hidden = false;
    return;
  }

  var parts = ['<p class="results-group-heading">Company research</p>'];

  if (summaryParts.length) {
    parts.push('<p class="card-helper" style="margin-bottom:0.6rem">' + summaryParts.join(" &middot; ") + '</p>');
  }

  if (items.length === 0) {
    parts.push('<p class="card-helper">No individual findings to review.</p>');
  }

  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    var id = "research-cb-" + i;
    var title = item.title || "Untitled";
    var desc = item.snippet || item.description || "";
    var meta = [];
    if (item.confidence > 0) meta.push((item.confidence * 100).toFixed(0) + "%");
    if (item.sourceName) meta.push(item.sourceName);
    if (item.relevanceReason) meta.push(item.relevanceReason);

    parts.push('<div class="research-check-item">');
    parts.push('<input type="checkbox" id="' + id + '" checked>');
    parts.push('<div>');
    parts.push('<label class="check-label" for="' + id + '"><strong>' + esc(title) + '</strong></label>');
    if (desc) parts.push('<div class="research-check-meta">' + esc(desc) + '</div>');
    if (meta.length) parts.push('<div class="research-check-meta">' + esc(meta.join(" \u00b7 ")) + '</div>');
    parts.push('</div></div>');
  }

  dom.researchResults.innerHTML = parts.join("");
  dom.researchResults.hidden = false;
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
        '<div class="research-check-meta" style="padding:0.3rem 0;border-bottom:1px solid rgba(0,0,0,0.06)">' +
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

async function runCompanyResearch(application) {
  var response = await fetch(LOCAL_API_BASE + "/research", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ application: application }),
  });
  var payload = await response.json().catch(function () { return {}; });
  if (!response.ok) throw new Error(payload.error || "Research API returned " + response.status);
  return payload;
}

async function filterResearchFindings(application, rawFindings) {
  var response = await fetch(LOCAL_API_BASE + "/research/filter", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ application: application, rawFindings: rawFindings }),
  });
  var payload = await response.json().catch(function () { return {}; });
  if (!response.ok) throw new Error(payload.error || "Filter API returned " + response.status);
  return payload;
}

async function generatePersonalisedContent(application, filteredFindings) {
  var response = await fetch(LOCAL_API_BASE + "/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ application: application, filteredFindings: filteredFindings }),
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
  return {
    ref: ref, companyName: companyName, roleTitle: roleTitle, location: location,
    sector: str(input.sector), salary: str(input.salary),
    employmentType: str(input.employmentType), hours: str(input.hours),
    workplaceType: str(input.workplaceType),
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
    createdAt: str(input.createdAt) || now, updatedAt: now,
  };
}

async function renderPublishedResult(dom, application, publicUrl, localPreviewUrl) {
  dom.resultCompany.value = application.companyName || "";
  dom.resultRole.value = application.roleTitle || "";
  dom.resultLocation.value = application.location || "";
  dom.resultRef.value = application.ref || "";
  dom.resultUrl.value = publicUrl;
  dom.openPreviewLink.href = localPreviewUrl;
  try { await renderQrImage(dom.resultQrImage, publicUrl); } catch (_) { dom.resultQrImage.hidden = true; }
}

function buildPublicPreviewUrl(app) {
  return publicCvBaseUrl + "#app=" + encodePayload(buildEmbeddedPayload(app));
}
function buildShortJobUrl(app) {
  return publicJobBaseUrl + "?r=" + encodeURIComponent(app.ref || "");
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
