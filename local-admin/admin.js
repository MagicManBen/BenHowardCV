const EDGE_FN_BASE = "https://jntpyqguonknixyksqbp.supabase.co/functions/v1";
const SUPABASE_URL  = "https://jntpyqguonknixyksqbp.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpudHB5cWd1b25rbml4eWtzcWJwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwODYxNTEsImV4cCI6MjA5MDY2MjE1MX0.Tx2nMTKuguGIRnSwLR2Wm47d68p99DrH2ldIWWKOuBs";
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

const KNOWN_APPLICATION_KEYS = new Set([
  "ref", "slug", "createdAt", "updatedAt",
  "companyName", "roleTitle", "location", "sector", "salary",
  "employmentType", "hours", "workplaceType",
  "cvText", "candidateCvText", "candidateCv", "cvSummary", "candidateCvSummary",
  "shortCompanyReason", "shortRoleReason", "companySummary", "roleSummary",
  "headlineAttraction", "rolePurpose", "travelRequired", "advertSummary",
  "personalisedIntro", "whyThisRole",
  "toneKeywords", "probablePriorities", "keyFocusAreas", "companyPridePoints",
  "coreResponsibilities", "essentialRequirements", "preferredRequirements",
  "skillsWanted", "toolsMethodsMentioned", "stakeholderGroups", "teamTypesMentioned",
  "senioritySignals", "cultureSignals", "likelyBusinessNeeds",
  "impliedStrategicGoals", "deliverablesLikely", "possibleHeadlineFacts", "matchCategories",
  "personalisedContent", "generatedContent", "evidenceSelection",
  "heroPositioning", "personalisedOpening", "whyThisCompany",
  "roleNeedsSummary", "experienceMappings", "focusAreasToBring",
  "fitSummary", "likelyContributionSummary", "companyHighlights", "cultureFitSummary",
  "first90DaysPlan", "closingSummary", "closingProofPoints",
  "selectedEvidenceExamples", "contentNotes"
]);

const KNOWN_PERSONALISED_KEYS = new Set([
  "heroPositioning",
  "personalisedOpening",
  "whyThisCompany",
  "whyThisRole",
  "selectedEvidenceExamples",
  "roleNeedsSummary",
  "experienceMappings",
  "focusAreasToBring",
  "fitSummary",
  "likelyContributionSummary",
  "companyHighlights",
  "cultureFitSummary",
  "first90DaysPlan",
  "closingSummary",
  "closingProofPoints",
  "contentNotes",
]);

let toastTimer = null;
let publicCvBaseUrl = DEFAULT_PUBLIC_CV_BASE_URL;

document.addEventListener("DOMContentLoaded", initLocalAdminPage);

async function initLocalAdminPage() {
  const dom = {
    keysStatus:       document.getElementById("keys-status"),
    jobAdvertInput:   document.getElementById("job-advert-input"),
    backupJsonInput:  document.getElementById("backup-json-input"),
    backupJsonButton: document.getElementById("backup-json-button"),
    backupJsonStatus: document.getElementById("backup-json-status"),
    backupJsonError:  document.getElementById("backup-json-error"),
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
    usageSummary:     document.getElementById("usage-summary"),
    debugJson:        document.getElementById("debug-json"),
    confirmButton:    document.getElementById("confirm-button"),
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

  await loadLocalStatus(dom);

  dom.goButton.addEventListener("click", () => runPipeline(dom));
  if (dom.backupJsonButton) {
    dom.backupJsonButton.addEventListener("click", () => runBackupJsonPipeline(dom));
  }

  dom.clearButton.addEventListener("click", () => {
    dom.jobAdvertInput.value = "";
    if (dom.backupJsonInput) dom.backupJsonInput.value = "";
    pendingApplication = null;
    dom.inputStatus.textContent = "Waiting for advert text.";
    if (dom.backupJsonStatus) dom.backupJsonStatus.textContent = "Use only for debugging or recovery.";
    dom.inputError.hidden = true;
    if (dom.backupJsonError) dom.backupJsonError.hidden = true;
    dom.pipelinePanel.hidden = true;
    dom.resultsPanel.hidden = true;
    dom.resultPanel.hidden = true;
    dom.pipelineError.hidden = true;
    dom.confirmError.hidden = true;
    showToast(dom, "Cleared.");
  });

  dom.confirmButton.addEventListener("click", async () => {
    dom.confirmError.hidden = true;
    if (!pendingApplication) {
      showError(dom.confirmError, "No application to publish.");
      return;
    }

    dom.confirmButton.disabled = true;
    dom.confirmButton.textContent = "Publishing\u2026";
    dom.confirmStatus.textContent = "Saving application\u2026";

    try {
      const publishApplicationData = sanitizeApplicationForPublish(pendingApplication);
      const gen = pendingApplication.personalisedContent || {};
      if (gen.personalisedOpening) pendingApplication.personalisedIntro = gen.personalisedOpening;
      if (gen.whyThisCompany) pendingApplication.shortCompanyReason = gen.whyThisCompany;
      if (gen.whyThisRole) pendingApplication.whyThisRole = gen.whyThisRole;
      if (gen.fitSummary) pendingApplication.advertSummary = gen.fitSummary;
      if (gen.closingSummary) pendingApplication.closingSummary = gen.closingSummary;

      pendingApplication.genHeroPositioning = gen.heroPositioning || "";
      pendingApplication.genPersonalisedOpening = gen.personalisedOpening || "";
      pendingApplication.genWhyThisCompany = gen.whyThisCompany || "";
      pendingApplication.genWhyThisRole = gen.whyThisRole || "";
      pendingApplication.genFitSummary = gen.fitSummary || "";
      pendingApplication.genLikelyContribution = gen.likelyContributionSummary || "";
      pendingApplication.genCultureFit = gen.cultureFitSummary || "";
      pendingApplication.genClosingSummary = gen.closingSummary || "";
      pendingApplication.genRoleNeedsSummary = gen.roleNeedsSummary || "";
      pendingApplication.genCompanyHighlights = Array.isArray(gen.companyHighlights) ? gen.companyHighlights : [];
      pendingApplication.genEvidenceExamples = Array.isArray(gen.selectedEvidenceExamples) ? gen.selectedEvidenceExamples : [];
      pendingApplication.genExperienceMappings = Array.isArray(gen.experienceMappings) ? gen.experienceMappings : [];
      pendingApplication.genFocusAreasToBring = Array.isArray(gen.focusAreasToBring) ? gen.focusAreasToBring : [];
      pendingApplication.genFirst90DaysPlan = Array.isArray(gen.first90DaysPlan) ? gen.first90DaysPlan : [];
      pendingApplication.genClosingProofPoints = Array.isArray(gen.closingProofPoints) ? gen.closingProofPoints : [];

      const response = await publishApplication(publishApplicationData);
      const application = response.application || pendingApplication;
      const fullUrl = response.fullUrl || buildFullEmployerPageUrl(application);

      await renderPublishedResult(dom, application, fullUrl);
      dom.resultPanel.hidden = false;
      dom.confirmStatus.textContent = "Published.";
      showToast(dom, response.publishedToSupabase || response.publishedToGitHub ? "CV saved." : "Saved locally.");
      dom.resultPanel.scrollIntoView({ behavior: "smooth", block: "start" });

      if (!response.publishedToSupabase && !response.publishedToGitHub) {
        showError(dom.confirmError, "Saved locally, but no remote backend completed.");
      }
    } catch (error) {
      showError(dom.confirmError, error instanceof Error ? error.message : "Publish failed.");
      dom.confirmStatus.textContent = "Publish failed.";
    } finally {
      dom.confirmButton.disabled = false;
      dom.confirmButton.textContent = "Confirm & Publish";
    }
  });

  if (dom.copyUrlButton) {
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
  }

  dom.downloadCvButton.addEventListener("click", async () => {
    var cvUrl = dom.resultUrl ? dom.resultUrl.value : "";
    var roleTitle = dom.resultRole ? dom.resultRole.value : "";
    var companyName = dom.resultCompany ? dom.resultCompany.value : "";
    if (!cvUrl) { showToast(dom, "No CV URL available yet."); return; }
    dom.downloadCvButton.disabled = true;
    dom.downloadCvButton.textContent = "Generating PDF\u2026";
    try {
      await downloadCvWithQr(cvUrl, roleTitle, companyName);
      showToast(dom, "PDF downloaded.");
    } catch (err) {
      showToast(dom, "Download failed: " + (err.message || err));
    } finally {
      dom.downloadCvButton.disabled = false;
      dom.downloadCvButton.textContent = "Save CV as PDF";
    }
  });

  /* ── Pipeline ─────────────────────────────────────── */

  async function runPipeline(dom) {
    dom.inputError.hidden = true;
    dom.pipelineError.hidden = true;
    dom.confirmError.hidden = true;
    if (dom.backupJsonError) dom.backupJsonError.hidden = true;
    if (dom.backupJsonStatus) dom.backupJsonStatus.textContent = "Use only for debugging or recovery.";

    const rawText = dom.jobAdvertInput.value.trim();
    if (!rawText) {
      showError(dom.inputError, "Paste the job advert text first.");
      return;
    }

    dom.pipelinePanel.hidden = false;
    dom.resultsPanel.hidden = true;
    dom.resultPanel.hidden = true;
    setPill(dom.pillParse, "running");
    setPill(dom.pillGenerate, "waiting");
    dom.pipelineMessage.textContent = "Preparing advert text\u2026";
    dom.pipelinePanel.scrollIntoView({ behavior: "smooth", block: "start" });

    /* STEP 1 \u2014 Basic advert check */
    pendingApplication = null;

    setPill(dom.pillParse, "done");
    dom.pipelineMessage.textContent = "Generating tailored application server-side with OpenAI\u2026";

    /* STEP 2 \u2014 Generate */
    setPill(dom.pillGenerate, "running");
    var generationMeta = null;
    try {
      const result = await generateApplicationFromAdvert(rawText);
      const meta = result && result.meta ? result.meta : {};
      generationMeta = meta;
      if (!result || !result.application) {
        throw new Error("Generation returned no application object.");
      }
      if (meta.success === false) {
        throw new Error(meta.error || "Generation failed.");
      }
      pendingApplication = normaliseApplicationPayload(result.application);
      if (!pendingApplication.personalisedContent && result.generatedContent) {
        pendingApplication.personalisedContent = normaliseProvidedPersonalisedContent({ personalisedContent: result.generatedContent });
      }
      pendingApplication.evidenceSelection = result.evidenceSelection || pendingApplication.evidenceSelection || { count: 0, error: null, examples: [] };
      dom.debugJson.textContent = JSON.stringify(result, null, 2);
    } catch (error) {
      setPill(dom.pillGenerate, "error");
      dom.pipelineMessage.textContent = "Generation failed.";
      showError(dom.pipelineError, error instanceof Error ? error.message : "Generation failed.");
      dom.inputStatus.textContent = "Generation failed.";
      dom.confirmButton.disabled = true;
      dom.confirmStatus.textContent = "Fix the issue and try again.";
      return;
    }

    setPill(dom.pillGenerate, "done");
    dom.pipelineMessage.textContent = "Tailored application generated and ready for review.";
    dom.inputStatus.textContent = "Generated: " + pendingApplication.companyName + " / " + pendingApplication.roleTitle;

    dom.resultsPanel.hidden = false;
    dom.resultsTitle.textContent = pendingApplication.companyName + " \u2014 " + pendingApplication.roleTitle;
    dom.advertResults.innerHTML = renderAdvertGroup(pendingApplication);
    renderContentGroup(dom, {
      generatedContent: pendingApplication.personalisedContent,
      evidenceSelection: pendingApplication.evidenceSelection || { count: 0, error: null, examples: [] },
      meta: { success: true, source: "local-openai" },
    });
    renderUsageSummary(dom, generationMeta);
    dom.confirmButton.disabled = false;
    dom.confirmStatus.textContent = "Review the generated output, then confirm.";
    showToast(dom, "Generated with OpenAI.");
  }

  function runBackupJsonPipeline(dom) {
    if (!dom.backupJsonInput) return;
    dom.inputError.hidden = true;
    dom.pipelineError.hidden = true;
    dom.confirmError.hidden = true;
    if (dom.backupJsonError) dom.backupJsonError.hidden = true;

    var rawJson = dom.backupJsonInput.value.trim();
    if (!rawJson) {
      if (dom.backupJsonError) showError(dom.backupJsonError, "Paste a finished application JSON object first.");
      if (dom.backupJsonStatus) dom.backupJsonStatus.textContent = "No JSON provided.";
      return;
    }

    dom.pipelinePanel.hidden = false;
    dom.resultsPanel.hidden = true;
    dom.resultPanel.hidden = true;
    setPill(dom.pillParse, "running");
    setPill(dom.pillGenerate, "waiting");
    dom.pipelineMessage.textContent = "Loading backup JSON\u2026";

    try {
      var parsed = JSON.parse(rawJson);
      var source = (parsed && typeof parsed === "object" && parsed.application && typeof parsed.application === "object")
        ? parsed.application
        : parsed;
      pendingApplication = normaliseApplicationPayload(source);
      if (parsed && typeof parsed === "object") {
        if (!pendingApplication.personalisedContent && parsed.generatedContent) {
          pendingApplication.personalisedContent = normaliseProvidedPersonalisedContent({ personalisedContent: parsed.generatedContent });
        }
        if (parsed.evidenceSelection && typeof parsed.evidenceSelection === "object") {
          pendingApplication.evidenceSelection = parsed.evidenceSelection;
        }
      }
      setPill(dom.pillParse, "done");
      setPill(dom.pillGenerate, "skipped");
      dom.pipelineMessage.textContent = "Backup JSON loaded (generation skipped).";
      dom.inputStatus.textContent = "Loaded backup JSON: " + pendingApplication.companyName + " / " + pendingApplication.roleTitle;
      if (dom.backupJsonStatus) dom.backupJsonStatus.textContent = "Backup JSON loaded.";

      dom.resultsPanel.hidden = false;
      dom.resultsTitle.textContent = pendingApplication.companyName + " \u2014 " + pendingApplication.roleTitle;
      dom.advertResults.innerHTML = renderAdvertGroup(pendingApplication);
      renderContentGroup(dom, {
        generatedContent: pendingApplication.personalisedContent,
        evidenceSelection: pendingApplication.evidenceSelection || { count: 0, error: null, examples: [] },
        meta: { success: true, source: "backup-json" },
      });
      dom.debugJson.textContent = JSON.stringify(parsed, null, 2);
      dom.confirmButton.disabled = false;
      dom.confirmStatus.textContent = "Review the loaded backup JSON, then confirm.";
      showToast(dom, "Backup JSON loaded.");
    } catch (error) {
      setPill(dom.pillParse, "error");
      setPill(dom.pillGenerate, "waiting");
      dom.pipelineMessage.textContent = "Backup JSON load failed.";
      if (dom.backupJsonError) showError(dom.backupJsonError, error instanceof Error ? error.message : "Invalid JSON.");
      if (dom.backupJsonStatus) dom.backupJsonStatus.textContent = "Backup load failed.";
      dom.inputStatus.textContent = "Backup load failed.";
      dom.confirmButton.disabled = true;
      dom.confirmStatus.textContent = "Fix the JSON and try again.";
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

function renderUsageSummary(dom, meta) {
  if (!dom.usageSummary || !meta) return;
  var usage = meta.usage;
  var cost = meta.estimated_cost_usd;
  if (!usage) return;
  var fmt = function(n) { return (n || 0).toLocaleString(); };
  var parts = [];
  parts.push('<p class="results-group-heading">Token usage</p>');
  parts.push('<p style="font-size:0.95em;color:#555">');
  parts.push('Model: <strong>' + (meta.model || 'unknown') + '</strong>');
  parts.push(' &middot; Tokens: ' + fmt(usage.input_tokens) + ' in / ' + fmt(usage.output_tokens) + ' out');
  parts.push(' (' + fmt((usage.input_tokens || 0) + (usage.output_tokens || 0)) + ' total)');
  if (cost != null) parts.push(' &middot; Est. cost: <strong>$' + cost.toFixed(6) + '</strong>');
  parts.push('</p>');
  dom.usageSummary.innerHTML = parts.join('');
  dom.usageSummary.hidden = false;
}

function renderContentGroup(dom, result) {
  var content = result.generatedContent || {};
  var parts = ['<p class="results-group-heading">Generated tailored content</p>'];

  var textFields = [
    ["Hero positioning", content.heroPositioning],
    ["Personalised opening", content.personalisedOpening],
    ["Why this company", content.whyThisCompany],
    ["Why this role", content.whyThisRole],
    ["Role needs summary", content.roleNeedsSummary],
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

  var mappings = content.experienceMappings || [];
  if (mappings.length) {
    parts.push('<p style="margin-top:0.6rem"><strong>Experience mappings (' + mappings.length + '):</strong></p>');
    for (var k = 0; k < mappings.length; k++) {
      var mapping = mappings[k];
      parts.push(
        '<div class="review-value" style="padding:0.3rem 0;border-bottom:1px solid rgba(0,0,0,0.06)">' +
        '<strong>' + esc(mapping.roleNeed || "?") + '</strong><br>' +
        esc(mapping.myEvidence || "") +
        (mapping.relevance ? '<br><em>' + esc(mapping.relevance) + '</em>' : "") +
        '</div>'
      );
    }
  }

  var focusAreas = content.focusAreasToBring || [];
  if (focusAreas.length) {
    parts.push('<p style="margin-top:0.6rem"><strong>Focus areas to bring (' + focusAreas.length + '):</strong></p>');
    for (var m = 0; m < focusAreas.length; m++) {
      var focusArea = focusAreas[m];
      parts.push(
        '<div class="review-value" style="padding:0.3rem 0;border-bottom:1px solid rgba(0,0,0,0.06)">' +
        '<strong>' + esc(focusArea.title || "?") + '</strong> \u2014 ' +
        esc(focusArea.summary || "") + '</div>'
      );
    }
  }

  var examples = content.selectedEvidenceExamples || [];
  if (examples.length) {
    parts.push('<p style="margin-top:0.6rem"><strong>Evidence examples (' + examples.length + '):</strong></p>');
    for (var j = 0; j < examples.length; j++) {
      var ex = examples[j];
      parts.push(
        '<div class="review-value" style="padding:0.3rem 0;border-bottom:1px solid rgba(0,0,0,0.06)">' +
        '<strong>' + esc(ex.exampleTitle || "?") + '</strong> \u2014 ' +
        esc(ex.shortLine || ex.whyChosen || "") +
        ((ex.bestMatchedRoleNeed || ex.proofAngle)
          ? '<br><em>' + esc([ex.proofAngle, ex.bestMatchedRoleNeed].filter(Boolean).join(" · ")) + '</em>'
          : '') +
        '</div>'
      );
    }
  }

  var first90DaysPlan = content.first90DaysPlan || [];
  if (first90DaysPlan.length) {
    parts.push('<p style="margin-top:0.6rem"><strong>First 90 days (' + first90DaysPlan.length + '):</strong></p>');
    for (var n = 0; n < first90DaysPlan.length; n++) {
      var phase = first90DaysPlan[n];
      parts.push(
        '<div class="review-value" style="padding:0.3rem 0;border-bottom:1px solid rgba(0,0,0,0.06)">' +
        '<strong>' + esc(phase.phase || "?") + '</strong> \u2014 ' +
        esc(phase.focus || "") +
        (phase.detail ? '<br>' + esc(phase.detail) : "") +
        '</div>'
      );
    }
  }

  var closingProofPoints = content.closingProofPoints || [];
  if (closingProofPoints.length) {
    parts.push('<p style="margin-top:0.6rem"><strong>Closing proof points:</strong> ' + esc(closingProofPoints.join(" \u00b7 ")) + '</p>');
  }

  dom.contentResults.innerHTML = parts.join("");
  dom.contentResults.hidden = false;
}

/* ── API calls ─────────────────────────────────────── */

async function loadLocalStatus(dom) {
  try {
    var response = await fetch(SUPABASE_URL + "/rest/v1/applications?select=ref&limit=1", {
      headers: { apikey: SUPABASE_ANON, Authorization: "Bearer " + SUPABASE_ANON },
      cache: "no-store",
    });
    if (!response.ok) throw new Error("Supabase returned " + response.status);
    dom.keysStatus.textContent = "Online mode. Supabase access confirmed.";
  } catch (e) {
    dom.keysStatus.textContent = "Could not reach Supabase: " + e.message;
  }
}

async function publishApplication(application) {
  var response = await fetch(EDGE_FN_BASE + "/publish", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ application: application, clientContext: buildClientContext() }),
  });
  var payload = await response.json().catch(function () { return {}; });
  if (!response.ok) {
    throw new Error(payload.error || "Publish failed with status " + response.status);
  }
  return payload;
}

async function generateApplicationFromAdvert(advertText) {
  var response = await fetch("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ advertText: advertText, clientContext: buildClientContext() }),
  });
  var payload = await response.json().catch(function () { return {}; });
  if (!response.ok) {
    throw new Error(payload.error || "Local generation failed with status " + response.status);
  }
  if (payload.meta && payload.meta.success === false) {
    throw new Error(payload.meta.error || "Local generation failed.");
  }
  return payload;
}

/* ── Utility ───────────────────────────────────────── */

function buildClientContext() {
  return { pageUrl: window.location.href, origin: window.location.origin, timestamp: new Date().toISOString() };
}

function normaliseApplicationPayload(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Application payload must be a single object.");
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
  if (!providedContent) throw new Error("Generated output is missing personalisedContent.");

  var preservedTopLevel = {};
  for (var inputKey in input) {
    if (!Object.prototype.hasOwnProperty.call(input, inputKey)) continue;
    if (inputKey === "__proto__" || inputKey === "constructor" || inputKey === "prototype") continue;
    if (KNOWN_APPLICATION_KEYS.has(inputKey)) continue;
    preservedTopLevel[inputKey] = input[inputKey];
  }

  var normalised = {
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

  return Object.assign({}, preservedTopLevel, normalised);
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
    input.heroPositioning || input.personalisedOpening || input.whyThisCompany || input.whyThisRole ||
    input.roleNeedsSummary || input.experienceMappings || input.focusAreasToBring ||
    input.fitSummary || input.likelyContributionSummary || input.companyHighlights ||
    input.cultureFitSummary || input.first90DaysPlan || input.closingSummary || input.closingProofPoints || input.selectedEvidenceExamples ||
    input.contentNotes
  ) {
    source = input;
  }

  if (!source) return null;

  var preserved = {};
  for (var key in source) {
    if (!Object.prototype.hasOwnProperty.call(source, key)) continue;
    if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
    if (KNOWN_PERSONALISED_KEYS.has(key)) continue;
    preserved[key] = source[key];
  }

  var normalised = {
    heroPositioning: str(source.heroPositioning),
    personalisedOpening: str(source.personalisedOpening),
    whyThisCompany: str(source.whyThisCompany),
    whyThisRole: str(source.whyThisRole),
    selectedEvidenceExamples: normaliseEvidenceExamples(source.selectedEvidenceExamples),
    roleNeedsSummary: str(source.roleNeedsSummary),
    experienceMappings: normaliseExperienceMappings(source.experienceMappings),
    focusAreasToBring: normaliseFocusAreasToBring(source.focusAreasToBring),
    fitSummary: str(source.fitSummary),
    likelyContributionSummary: str(source.likelyContributionSummary),
    companyHighlights: arr(source.companyHighlights),
    cultureFitSummary: str(source.cultureFitSummary),
    first90DaysPlan: normaliseFirst90DaysPlan(source.first90DaysPlan),
    closingSummary: str(source.closingSummary),
    closingProofPoints: arr(source.closingProofPoints),
    contentNotes: arr(source.contentNotes),
  };

  return Object.assign({}, preserved, normalised);
}

function normaliseEvidenceExamples(value) {
  if (!Array.isArray(value)) return [];
  return value.map(function (item) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    var output = {};
    for (var key in item) {
      if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
      if (Object.prototype.hasOwnProperty.call(item, key)) output[key] = item[key];
    }
    output.exampleId = str(item.exampleId);
    output.exampleTitle = str(item.exampleTitle);
    output.bestMatchedRoleNeed = str(item.bestMatchedRoleNeed);
    output.proofAngle = str(item.proofAngle);
    output.whyChosen = str(item.whyChosen);
    output.suggestedUsage = str(item.suggestedUsage);
    output.shortLine = str(item.shortLine);
    return output;
  }).filter(Boolean);
}

function normaliseExperienceMappings(value) {
  if (!Array.isArray(value)) return [];
  return value.map(function (item) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    var output = {};
    for (var key in item) {
      if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
      if (Object.prototype.hasOwnProperty.call(item, key)) output[key] = item[key];
    }
    output.roleNeed = str(item.roleNeed);
    output.evidenceExampleId = str(item.evidenceExampleId);
    output.myEvidence = str(item.myEvidence);
    output.relevance = str(item.relevance);
    output.proofAngle = str(item.proofAngle);
    return output;
  }).filter(function (item) {
    return item && (item.roleNeed || item.myEvidence || item.relevance);
  });
}

function normaliseFocusAreasToBring(value) {
  if (!Array.isArray(value)) return [];
  return value.map(function (item) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    var output = {};
    for (var key in item) {
      if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
      if (Object.prototype.hasOwnProperty.call(item, key)) output[key] = item[key];
    }
    output.title = str(item.title);
    output.summary = str(item.summary);
    return output;
  }).filter(function (item) {
    return item && (item.title || item.summary);
  });
}

function normaliseFirst90DaysPlan(value) {
  if (!Array.isArray(value)) return [];
  return value.map(function (item) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    var output = {};
    for (var key in item) {
      if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
      if (Object.prototype.hasOwnProperty.call(item, key)) output[key] = item[key];
    }
    output.phase = str(item.phase);
    output.focus = str(item.focus);
    output.detail = str(item.detail);
    return output;
  }).filter(function (item) {
    return item && (item.phase || item.focus || item.detail);
  });
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

async function renderPublishedResult(dom, application, fullUrl) {
  dom.resultCompany.value = application.companyName || "";
  dom.resultRole.value = application.roleTitle || "";
  dom.resultLocation.value = application.location || "";
  dom.resultRef.value = application.ref || "";
  dom.resultUrl.value = fullUrl;

  if (dom.openPreviewLink) dom.openPreviewLink.href = fullUrl;
  try { await renderQrImage(dom.resultQrImage, fullUrl); } catch (_) { dom.resultQrImage.hidden = true; }
}

function buildFullEmployerPageUrl(app) {
  return publicCvBaseUrl + "?ref=" + encodeURIComponent(app.ref || "");
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
    ghp: a.genHeroPositioning || "",
    gpo: a.genPersonalisedOpening || "", gwc: a.genWhyThisCompany || "",
    gwr: a.genWhyThisRole || "", gfs: a.genFitSummary || "",
    glc: a.genLikelyContribution || "", gcf: a.genCultureFit || "",
    gcs: a.genClosingSummary || "", grn: a.genRoleNeedsSummary || "",
    gch: a.genCompanyHighlights || [], gee: a.genEvidenceExamples || [],
    gem: a.genExperienceMappings || [], gfb: a.genFocusAreasToBring || [],
    g90: a.genFirst90DaysPlan || [], gcp: a.genClosingProofPoints || [],
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

async function downloadCvWithQr(cvUrl, roleTitle, companyName) {
  /* 1. Generate QR data-URI */
  var qr = new window.QRious({ value: cvUrl, size: 240, level: "M", background: "#ffffff", foreground: "#284a5b" });
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
      + '<a href="' + esc(cvUrl) + '" target="_blank" rel="noopener noreferrer" style="display:inline-block; margin-top:0.45rem; background:#fff; padding:6px; border-radius:6px; line-height:0;">'
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

  /* 6. Generate and download PDF locally */
  var pdfRes = await fetch("/api/pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename: safeName, content: html }),
  });
  if (!pdfRes.ok) {
    var errPayload = await pdfRes.json().catch(function () { return {}; });
    throw new Error(errPayload.error || ("PDF generation failed with status " + pdfRes.status));
  }
  var blob = await pdfRes.blob();
  var url = URL.createObjectURL(blob);
  var a = document.createElement("a");
  a.href = url;
  a.download = safeName + ".pdf";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
}
