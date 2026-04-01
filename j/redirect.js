document.addEventListener("DOMContentLoaded", initRedirectPage);

const IS_LOCAL_RUNTIME = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
const LOCAL_API_BASE = "/api";
const PUBLIC_CV_BASE_URL = IS_LOCAL_RUNTIME ? "https://checkloops.co.uk/cv.html" : new URL("../cv.html", window.location.href).href;

async function initRedirectPage() {
  const titleEl = document.getElementById("redirect-title");
  const messageEl = document.getElementById("redirect-message");
  const params = new URLSearchParams(window.location.search);

  const ref = params.get("r") || "";
  if (!ref) {
    setMessage(titleEl, messageEl, "Missing job reference", "This short link does not include a job reference.");
    return;
  }

  try {
    const application = await fetchApplicationByRef(ref);
    const payload = buildEmbeddedPreviewPayload(application);
    const printSuffix = params.get("print") === "1" ? "?print=1" : "";
    const target = `${PUBLIC_CV_BASE_URL}${printSuffix}#app=${encodeApplicationPayload(payload)}`;
    window.location.replace(target);
  } catch {
    setMessage(titleEl, messageEl, "Could not open the CV", "The job link could not be resolved.");
  }
}

async function fetchApplicationByRef(ref) {
  const target = IS_LOCAL_RUNTIME
    ? `${LOCAL_API_BASE}/application?ref=${encodeURIComponent(ref)}&t=${Date.now()}`
    : `/data/${encodeURIComponent(ref)}.json?t=${Date.now()}`;
  const response = await fetch(target, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Could not load ${ref}.json`);
  }
  return response.json();
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
    cpp: Array.isArray(application.companyPridePoints) ? application.companyPridePoints : [],
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

function setMessage(titleEl, messageEl, title, message) {
  if (titleEl) titleEl.textContent = title;
  if (messageEl) messageEl.textContent = message;
}
