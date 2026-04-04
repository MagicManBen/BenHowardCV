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
    buildCultureFit,
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

  const roleNeeds = pickDistinctText(
    [state.genRoleNeedsSummary, buildRoleNeedsSummary(state)],
    used,
    buildRoleNeedsSummary(state)
  );
  rememberText(used, roleNeeds);

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

  const cultureFit = pickOptionalDistinctText(
    [state.genCultureFit, buildCultureFit(state)],
    used
  );
  rememberText(used, cultureFit);

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

  const closingSummary = pickDistinctText(
    [state.genClosingSummary, buildClosingSummary(state)],
    used,
    buildClosingSummary(state)
  );

  const evidenceExamples = pickShowcaseEvidenceExamples(cleanEvidenceExamples(state.genEvidenceExamples), 3);
  const focusCards = buildFocusCards(state).slice(0, 3);
  const roleReadSummary = buildRoleReadSummary(state, runtime, roleNeeds);
  const rolePriorityLine = pickOptionalDistinctText(
    [buildRolePriorityLine(state, runtime), state.roleSummary, state.rolePurpose],
    [roleReadSummary, whyRole]
  );
  const roleBridge = pickOptionalDistinctText(
    [state.headlineAttraction, state.shortRoleReason, whyRole, state.rolePurpose, heroPositioning],
    [roleReadSummary, rolePriorityLine]
  );
  const fitTransferLine = pickOptionalDistinctText(
    [buildFitTransferLine(state, runtime), state.roleSummary, state.shortRoleReason],
    [fitSummary, roleReadSummary, likelyContribution]
  );
  const fitBridge = buildFitBridge(state, runtime, fitTransferLine);
  const proofBridge = buildProofBridge();
  const bringSummary = pickFirst(likelyContribution, buildBringSummary(runtime, focusCards));
  const heroGuide = buildHeroGuide(state, runtime);

  const heroTitle = state.companyName && state.companyName !== runtime.defaults.companyName
    ? `A quick read on why ${state.companyName} feels like a strong fit.`
    : "A quick read on why this role feels like a strong fit.";

  setText("qr-hero-title", heroTitle);
  setText("qr-hero-summary", shortenText(pickFirst(heroSummary, roleReadSummary, fitSummary, heroPositioning), 240));
  setText("qr-hero-guide", heroGuide);
  setText("qr-hero-role", [state.roleTitle, state.companyName].filter(Boolean).join(" · "));
  setText("qr-role-summary", roleReadSummary);
  setOptionalText("qr-role-bridge", shortenText(roleBridge, 170));
  setText("qr-fit-summary", pickFirst(fitSummary, likelyContribution, heroSummary));
  setOptionalText("qr-fit-bridge", fitBridge);
  setOptionalText("qr-proof-bridge", proofBridge);
  setOptionalText("qr-bring-summary", shortenText(bringSummary, 205));
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

  const roleSignals = [
    { title: "What seems most important", copy: rolePriorityLine },
    { title: "Why it pulled me in", copy: shortenText(roleBridge, 180) }
  ].filter((item) => item.copy);
  renderReasonCards("qr-role-signals", roleSignals);

  const reasons = [
    { title: "Where the overlap is strongest", copy: fitTransferLine },
    { title: "Why the setting makes sense", copy: whyCompany },
    { title: "How I tend to work", copy: cultureFit }
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

function buildHeroGuide(state, runtime) {
  const companyTail = state.companyName && state.companyName !== runtime.defaults.companyName
    ? ` for ${state.companyName}`
    : "";
  return `You scanned this from my CV. This is the shorter phone-first view${companyTail}: my read on the role, the strongest proof behind that fit, and where I would expect to add value early.`;
}

function toSentenceFragment(value) {
  const text = (value || "").trim();
  if (!text) return "";
  return text.replace(/^[A-Z][a-z]/, (match) => match.toLowerCase());
}

function looksLikeActionClause(value) {
  return /^(ensure|maintain|support|handle|manage|improve|strengthen|keep|reduce|deliver|oversee|coordinate|lead)\b/i.test((value || "").trim());
}

function buildRoleReadSummary(state, runtime, fallback) {
  const focusAreas = runtime.uniqueStrings(
    [...state.keyFocusAreas, ...state.matchCategories],
    3,
    runtime.buildAdvertFactExclusions(state)
  ).filter((item) => !runtime.isLowSignalTag(item));
  const businessNeeds = runtime.uniqueStrings(
    state.likelyBusinessNeeds,
    2,
    runtime.buildAdvertFactExclusions(state)
  );
  const stakeholders = runtime.uniqueStrings(
    state.stakeholderGroups,
    3,
    runtime.buildAdvertFactExclusions(state)
  );

  if (focusAreas.length || businessNeeds.length || stakeholders.length) {
    const sentences = [];
    if (focusAreas.length) {
      sentences.push(`I read this as a role that sits where ${runtime.formatList(focusAreas.slice(0, 3).map(toSentenceFragment))} all need to stay well controlled.`);
    }
    if (businessNeeds.length) {
      const needs = businessNeeds.slice(0, 2).map(toSentenceFragment);
      const needsLine = businessNeeds.every(looksLikeActionClause)
        ? `helping the team ${runtime.formatList(needs)}`
        : `keeping ${runtime.formatList(needs)} steady`;
      sentences.push(`The real value looks to be in ${needsLine} without creating extra friction for the wider team.`);
    } else if (stakeholders.length) {
      sentences.push(`That matters because it supports ${runtime.formatList(stakeholders.slice(0, 3).map(toSentenceFragment))} and helps the wider operation keep moving.`);
    }
    return sentences.join(" ");
  }

  return fallback;
}

function buildRolePriorityLine(state, runtime) {
  const priorities = runtime.uniqueStrings(
    [...state.probablePriorities, ...state.keyFocusAreas, ...state.likelyBusinessNeeds],
    3,
    runtime.buildAdvertFactExclusions(state)
  );
  if (priorities.length) {
    return `The brief keeps pointing back to ${runtime.formatList(priorities.slice(0, 3).map(toSentenceFragment))}, which usually means the role needs someone who can keep the moving parts visible, coordinated, and under control.`;
  }
  return runtime.pickFirst(state.roleSummary, state.rolePurpose, state.shortRoleReason);
}

function buildFitTransferLine(state, runtime) {
  const overlap = runtime.uniqueStrings(
    [...state.matchCategories, ...state.skillsWanted, ...state.keyFocusAreas],
    3,
    runtime.buildAdvertFactExclusions(state)
  ).filter((item) => !runtime.isLowSignalTag(item));

  if (overlap.length) {
    return `The strongest transfer looks to be around ${runtime.formatList(overlap.slice(0, 3).map(toSentenceFragment))}, which is the kind of work I have repeatedly had to steady, structure, and improve.`;
  }

  return runtime.pickFirst(
    state.roleSummary,
    state.shortRoleReason,
    "The overlap is strongest in roles where delivery, coordination, and practical improvement all need to happen together."
  );
}

function buildFitBridge(state, runtime, fitTransferLine) {
  const anchors = runtime.uniqueStrings(
    [...state.matchCategories, ...state.keyFocusAreas],
    2,
    runtime.buildAdvertFactExclusions(state)
  ).filter((item) => !runtime.isLowSignalTag(item));

  if (anchors.length) {
    return `That is why the fit feels specific rather than generic: the overlap sits in ${runtime.formatList(anchors.map(toSentenceFragment))}, not just in broad adjacent experience.`;
  }

  return runtime.pickFirst(
    fitTransferLine,
    "That is why the fit feels specific rather than generic: it lines up with the kind of operational judgement and follow-through this brief seems to need."
  );
}

function buildProofBridge() {
  return "If my read is right, these are the clearest examples of the kind of contribution I could make here.";
}

function buildBringSummary(runtime, focusCards) {
  const focusTitles = focusCards.map((item) => item.title).filter(Boolean);
  if (focusTitles.length) {
    return `Taken together, I would focus early on ${runtime.formatList(focusTitles.slice(0, 3))}, so the role starts feeling clearer, steadier, and easier to run well.`;
  }
  return "I would focus early on making priorities clearer, progress easier to see, and the operating rhythm steadier.";
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

function setOptionalText(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  if (value) {
    el.textContent = value;
    el.hidden = false;
    return;
  }
  el.textContent = "";
  el.hidden = true;
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
