document.addEventListener("DOMContentLoaded", () => {
  initQrPage().catch((error) => {
    console.error(error);
    showQrError("Could not load this tailored page.");
  });
});

async function initQrPage() {
  const runtime = window.CVRuntime;
  if (!runtime) {
    throw new Error("CV runtime not available.");
  }

  showQrLoading();

  let state;
  try {
    state = await runtime.loadState();
  } catch (error) {
    console.error(error);
    state = runtime.defaults;
  }

  if (!state || !state.companyName || !state.roleTitle) {
    showQrError("This link is missing the application data.");
    return;
  }

  renderQrPage(state, runtime);
  showQrContent();
}

function renderQrPage(state, runtime) {
  const {
    pickDistinctText,
    pickOptionalDistinctText,
    pickFirst,
    rememberText,
    shortenText,
    uniqueStrings,
    cleanEvidenceExamples,
    pickShowcaseEvidenceExamples,
    buildHeroStrengthLine,
    buildHeroStatement,
    buildWhyCompany,
    buildWhyRole,
    buildFitSummary,
    buildLikelyContribution,
    buildRoleNeedsSummary,
    buildClosingSummary,
    buildFocusCards,
    buildEvidenceUsageLine,
    buildContractFact,
    looksRoleLedText,
    looksCompanyLedText,
    compactValue
  } = runtime;

  const used = [];
  const heroPositioning = pickDistinctText(
    [state.genHeroPositioning, buildHeroStrengthLine(state)],
    used,
    buildHeroStrengthLine(state)
  );
  rememberText(used, heroPositioning);

  const heroSummary = pickDistinctText(
    [state.genPersonalisedOpening, state.personalisedIntro, buildHeroStatement(state)],
    used,
    buildHeroStatement(state)
  );
  rememberText(used, heroSummary);

  const fitSummary = pickDistinctText(
    [state.genFitSummary, buildFitSummary(state)],
    used,
    buildFitSummary(state)
  );
  rememberText(used, fitSummary);

  const likelyContribution = pickDistinctText(
    [state.genLikelyContribution, buildLikelyContribution(state)],
    used,
    buildLikelyContribution(state)
  );
  rememberText(used, likelyContribution);

  const whyCompany = pickOptionalDistinctText(
    [
      looksRoleLedText(state.genWhyThisCompany, state) ? "" : state.genWhyThisCompany,
      buildWhyCompany(state)
    ],
    used
  );
  rememberText(used, whyCompany);

  const whyRole = pickOptionalDistinctText(
    [
      looksCompanyLedText(state.genWhyThisRole, state) ? "" : state.genWhyThisRole,
      buildWhyRole(state)
    ],
    used
  );
  rememberText(used, whyRole);

  const roleNeeds = pickOptionalDistinctText(
    [state.genRoleNeedsSummary, buildRoleNeedsSummary(state)],
    used
  );
  rememberText(used, roleNeeds);

  const closingSummary = pickDistinctText(
    [state.genClosingSummary, buildClosingSummary(state)],
    used,
    buildClosingSummary(state)
  );

  const evidenceExamples = pickShowcaseEvidenceExamples(cleanEvidenceExamples(state.genEvidenceExamples), 3);
  const focusCards = buildFocusCards(state).slice(0, 3);

  const heroTitle = state.companyName && state.companyName !== runtime.defaults.companyName
    ? `Why I’m a strong fit for ${state.companyName}.`
    : "Why I’m a strong fit for this role.";

  setText("qr-hero-title", heroTitle);
  setText("qr-hero-summary", shortenText(pickFirst(heroSummary, fitSummary, heroPositioning), 240));
  setText("qr-hero-role", [state.roleTitle, state.companyName].filter(Boolean).join(" · "));
  setText("qr-fit-summary", pickFirst(fitSummary, likelyContribution, heroSummary));
  setText("qr-closing-summary", closingSummary);
  setHref("qr-full-link", buildFullVersionUrl());

  document.title = `Ben T. Howard | ${state.companyName} | QR page`;

  renderChipRow(
    "qr-facts",
    uniqueStrings(
      [
        compactValue(state.location),
        compactValue(state.sector),
        buildContractFact(state)
      ],
      4,
      [state.companyName, state.roleTitle]
    )
  );

  const reasons = [
    { title: "What makes the work a good fit", copy: whyRole },
    { title: "Why the environment appeals", copy: whyCompany },
    { title: "Where I would help quickly", copy: pickFirst(roleNeeds, likelyContribution) }
  ].filter((item) => item.copy);
  renderReasonCards("qr-reasons", reasons);

  const proofCards = evidenceExamples.map((item) => ({
    title: pickFirst(item.exampleTitle, item.suggestedUsage, "Relevant example"),
    copy: pickFirst(item.shortLine, item.whyChosen),
    meta: uniqueStrings(
      [
        item.proofAngle,
        item.bestMatchedRoleNeed,
        buildEvidenceUsageLine(item)
      ],
      2,
      [item.shortLine, item.whyChosen]
    )
  })).filter((item) => item.copy);
  renderProofCards("qr-proof-list", "qr-proof-section", proofCards);

  const bringCards = focusCards.map((item) => ({
    title: item.title,
    copy: item.copy,
    meta: item.tags || []
  })).filter((item) => item.title && item.copy);
  renderBringCards("qr-bring-list", "qr-bring-section", bringCards);
}

function buildFullVersionUrl() {
  const params = new URLSearchParams(window.location.search);
  const target = new URL("cv.html", window.location.href);
  if (params.get("sc")) {
    target.searchParams.set("sc", params.get("sc"));
  } else if (params.get("ref")) {
    target.searchParams.set("ref", params.get("ref"));
  }
  if (window.location.hash.startsWith("#app=")) {
    target.hash = window.location.hash;
  }
  return target.href;
}

function renderChipRow(id, values) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = "";
  values.forEach((value) => {
    const span = document.createElement("span");
    span.className = "fact-chip";
    span.textContent = value;
    el.appendChild(span);
  });
}

function renderReasonCards(id, items) {
  const container = document.getElementById(id);
  if (!container) return;
  container.innerHTML = "";
  items.slice(0, 3).forEach((item) => {
    const article = document.createElement("article");
    article.className = "reason-card";

    const title = document.createElement("h3");
    title.className = "item-title";
    title.textContent = item.title;

    const copy = document.createElement("p");
    copy.className = "item-copy";
    copy.textContent = item.copy;

    article.appendChild(title);
    article.appendChild(copy);
    container.appendChild(article);
  });
}

function renderProofCards(listId, sectionId, items) {
  const container = document.getElementById(listId);
  const section = document.getElementById(sectionId);
  if (!container || !section) return;
  container.innerHTML = "";
  if (!items.length) {
    section.hidden = true;
    return;
  }
  section.hidden = false;

  items.slice(0, 3).forEach((item) => {
    const article = document.createElement("article");
    article.className = "proof-card";

    const title = document.createElement("h3");
    title.className = "item-title";
    title.textContent = item.title;

    const copy = document.createElement("p");
    copy.className = "item-copy";
    copy.textContent = item.copy;

    article.appendChild(title);
    article.appendChild(copy);

    if (item.meta.length) {
      const meta = document.createElement("div");
      meta.className = "item-meta";
      item.meta.forEach((value) => {
        const span = document.createElement("span");
        span.textContent = value;
        meta.appendChild(span);
      });
      article.appendChild(meta);
    }

    container.appendChild(article);
  });
}

function renderBringCards(listId, sectionId, items) {
  const container = document.getElementById(listId);
  const section = document.getElementById(sectionId);
  if (!container || !section) return;
  container.innerHTML = "";
  if (!items.length) {
    section.hidden = true;
    return;
  }
  section.hidden = false;

  items.slice(0, 3).forEach((item) => {
    const article = document.createElement("article");
    article.className = "bring-card";

    const title = document.createElement("h3");
    title.className = "item-title";
    title.textContent = item.title;

    const copy = document.createElement("p");
    copy.className = "item-copy";
    copy.textContent = item.copy;

    article.appendChild(title);
    article.appendChild(copy);

    if (item.meta.length) {
      const meta = document.createElement("div");
      meta.className = "item-meta";
      item.meta.slice(0, 3).forEach((value) => {
        const span = document.createElement("span");
        span.textContent = value;
        meta.appendChild(span);
      });
      article.appendChild(meta);
    }

    container.appendChild(article);
  });
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value || "";
}

function setHref(id, value) {
  const el = document.getElementById(id);
  if (el) el.href = value || "#";
}

function showQrLoading() {
  document.getElementById("qr-loading")?.removeAttribute("hidden");
  document.getElementById("qr-error")?.setAttribute("hidden", "");
  document.getElementById("qr-content")?.setAttribute("hidden", "");
}

function showQrError(message) {
  document.getElementById("qr-loading")?.setAttribute("hidden", "");
  document.getElementById("qr-content")?.setAttribute("hidden", "");
  const error = document.getElementById("qr-error");
  const messageEl = document.getElementById("qr-error-message");
  if (messageEl) messageEl.textContent = message;
  error?.removeAttribute("hidden");
}

function showQrContent() {
  document.getElementById("qr-loading")?.setAttribute("hidden", "");
  document.getElementById("qr-error")?.setAttribute("hidden", "");
  document.getElementById("qr-content")?.removeAttribute("hidden");
}
