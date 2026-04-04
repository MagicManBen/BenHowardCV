window.CVRuntime = (() => {
      const defaults = {
        ref: "general-preview",
        companyName: "Your team",
        roleTitle: "Operations leadership opportunity",
        location: "United Kingdom",
        sector: "Operations",
        salary: "Not specified",
        employmentType: "",
        hours: "",
        workplaceType: "",
        shortCompanyReason: "Service-led organisation where reliability, standards and customer experience matter.",
        shortRoleReason: "Leadership role centred on people, performance and day-to-day operational control.",
        companySummary: "",
        roleSummary: "",
        headlineAttraction: "",
        rolePurpose: "",
        travelRequired: "",
        advertSummary: "",
        personalisedIntro: "",
        whyThisRole: "The brief points to a role where clearer priorities, steadier reporting, and practical follow-through all matter.",
        toneKeywords: ["steady", "collaborative", "accountable", "practical"],
        probablePriorities: [
          "Operational performance and follow-through",
          "Team leadership and accountability",
          "Service quality and delivery standards"
        ],
        keyFocusAreas: [
          "KPI governance and reporting",
          "Continuous improvement",
          "Cross-functional coordination"
        ],
        companyPridePoints: [],
        coreResponsibilities: [],
        essentialRequirements: [],
        preferredRequirements: [],
        skillsWanted: [],
        toolsMethodsMentioned: [],
        stakeholderGroups: [],
        teamTypesMentioned: [],
        senioritySignals: [],
        cultureSignals: [],
        likelyBusinessNeeds: [],
        impliedStrategicGoals: [],
        deliverablesLikely: [],
        possibleHeadlineFacts: [],
        matchCategories: [],
        genHeroPositioning: "",
        genPersonalisedOpening: "",
        genWhyThisCompany: "",
        genWhyThisRole: "",
        genRoleNeedsSummary: "",
        genExperienceMappings: [],
        genFocusAreasToBring: [],
        genFitSummary: "",
        genLikelyContribution: "",
        genCompanyHighlights: [],
        genCultureFit: "",
        genFirst90DaysPlan: [],
        genClosingSummary: "",
        genClosingProofPoints: [],
        genEvidenceExamples: []
      };

      const STOPWORDS = new Set([
        "about", "across", "along", "also", "although", "always", "among", "and", "around", "because",
        "before", "being", "bring", "brief", "build", "built", "clear", "clearly", "could", "company",
        "deliver", "delivering", "delivery", "employer", "environment", "experience", "focus", "focused",
        "from", "have", "help", "into", "itself", "likely", "more", "most", "much", "need", "needs",
        "opportunity", "organisation", "organization", "practical", "role", "roles", "same", "seems",
        "show", "shows", "still", "strong", "stronger", "support", "supports", "team", "teams", "that",
        "their", "them", "then", "there", "these", "they", "this", "those", "through", "together",
        "under", "used", "using", "value", "very", "where", "which", "while", "with", "work", "working",
        "would", "your"
      ]);

      const LOW_SIGNAL_TAGS = new Set([
        "accountable", "adaptable", "agile", "collaborative", "communication", "continuous improvement",
        "customer focused", "customer focus", "detail focused", "driven", "flexible", "hands on",
        "inclusive", "innovative", "leadership", "organised", "organized", "people skills", "proactive",
        "professional", "quality", "reliable", "resilient", "service", "stakeholder communication",
        "structured", "supportive", "team player"
      ]);

      function cleanString(value) {
        return typeof value === "string" ? value.trim() : "";
      }

      function cleanArray(value) {
        return Array.isArray(value) ? value.map((item) => cleanString(item)).filter(Boolean) : [];
      }

      function cleanEvidenceExamples(value) {
        if (!Array.isArray(value)) return [];
        return value.map((item) => {
          if (!item || typeof item !== "object" || Array.isArray(item)) return null;
          return {
            exampleId: cleanString(item.exampleId),
            exampleTitle: cleanString(item.exampleTitle),
            bestMatchedRoleNeed: cleanString(item.bestMatchedRoleNeed),
            proofAngle: cleanString(item.proofAngle),
            whyChosen: cleanString(item.whyChosen),
            suggestedUsage: cleanString(item.suggestedUsage),
            shortLine: cleanString(item.shortLine)
          };
        }).filter((item) => item && (item.exampleTitle || item.whyChosen || item.shortLine));
      }

      function cleanExperienceMappings(value) {
        if (!Array.isArray(value)) return [];
        return value.map((item) => {
          if (!item || typeof item !== "object" || Array.isArray(item)) return null;
          return {
            roleNeed: cleanString(item.roleNeed),
            evidenceExampleId: cleanString(item.evidenceExampleId),
            myEvidence: cleanString(item.myEvidence),
            relevance: cleanString(item.relevance),
            proofAngle: cleanString(item.proofAngle)
          };
        }).filter((item) => item && (item.roleNeed || item.myEvidence || item.relevance));
      }

      function cleanFocusAreasToBring(value) {
        if (!Array.isArray(value)) return [];
        return value.map((item) => {
          if (!item || typeof item !== "object" || Array.isArray(item)) return null;
          return {
            title: cleanString(item.title),
            summary: cleanString(item.summary)
          };
        }).filter((item) => item && (item.title || item.summary));
      }

      function cleanFirst90DaysPlan(value) {
        if (!Array.isArray(value)) return [];
        return value.map((item) => {
          if (!item || typeof item !== "object" || Array.isArray(item)) return null;
          return {
            phase: cleanString(item.phase),
            focus: cleanString(item.focus),
            detail: cleanString(item.detail)
          };
        }).filter((item) => item && (item.phase || item.focus || item.detail));
      }

      function decodePayload(encoded) {
        try {
          const base64 = encoded.replaceAll("-", "+").replaceAll("_", "/");
          const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
          const binary = atob(padded);
          const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
          return JSON.parse(new TextDecoder().decode(bytes));
        } catch {
          return null;
        }
      }

      function readEmbeddedApplication() {
        try {
          const hash = window.location.hash.replace(/^#/, "");
          if (!hash) return null;
          const params = new URLSearchParams(hash);
          const encoded = cleanString(params.get("app"));
          if (!encoded) return null;
          const parsed = decodePayload(encoded);
          return parsed && typeof parsed === "object" ? parsed : null;
        } catch {
          return null;
        }
      }

      function normaliseApplication(input) {
        const data = input || {};
        const companyName = cleanString(data.companyName || data.c) || defaults.companyName;
        const roleTitle = cleanString(data.roleTitle || data.r) || defaults.roleTitle;
        const location = cleanString(data.location || data.l) || defaults.location;

        const result = {
          ref: cleanString(data.ref) || cleanString(data.slug) || defaults.ref,
          companyName,
          roleTitle,
          location,
          sector: cleanString(data.sector || data.s) || defaults.sector,
          salary: cleanString(data.salary || data.y) || defaults.salary,
          employmentType: cleanString(data.employmentType || data.e) || defaults.employmentType,
          hours: cleanString(data.hours || data.h) || defaults.hours,
          workplaceType: cleanString(data.workplaceType || data.wp) || defaults.workplaceType,
          shortCompanyReason: cleanString(data.shortCompanyReason || data.n) || defaults.shortCompanyReason,
          shortRoleReason: cleanString(data.shortRoleReason || data.o) || defaults.shortRoleReason,
          companySummary: cleanString(data.companySummary || data.cs) || defaults.companySummary,
          roleSummary: cleanString(data.roleSummary || data.rs) || defaults.roleSummary,
          headlineAttraction: cleanString(data.headlineAttraction || data.ha) || defaults.headlineAttraction,
          rolePurpose: cleanString(data.rolePurpose || data.rp) || defaults.rolePurpose,
          travelRequired: cleanString(data.travelRequired) || defaults.travelRequired,
          advertSummary: cleanString(data.advertSummary || data.a) || defaults.advertSummary,
          personalisedIntro: cleanString(data.personalisedIntro || data.i) || defaults.personalisedIntro,
          whyThisRole: cleanString(data.whyThisRole || data.w) || defaults.whyThisRole,
          toneKeywords: cleanArray(data.toneKeywords || data.t).length ? cleanArray(data.toneKeywords || data.t) : defaults.toneKeywords,
          probablePriorities: cleanArray(data.probablePriorities || data.p).length ? cleanArray(data.probablePriorities || data.p) : defaults.probablePriorities,
          keyFocusAreas: cleanArray(data.keyFocusAreas || data.f).length ? cleanArray(data.keyFocusAreas || data.f) : defaults.keyFocusAreas,
          companyPridePoints: cleanArray(data.companyPridePoints || data.cpp),
          coreResponsibilities: cleanArray(data.coreResponsibilities),
          essentialRequirements: cleanArray(data.essentialRequirements),
          preferredRequirements: cleanArray(data.preferredRequirements),
          skillsWanted: cleanArray(data.skillsWanted),
          toolsMethodsMentioned: cleanArray(data.toolsMethodsMentioned),
          stakeholderGroups: cleanArray(data.stakeholderGroups),
          teamTypesMentioned: cleanArray(data.teamTypesMentioned),
          senioritySignals: cleanArray(data.senioritySignals),
          cultureSignals: cleanArray(data.cultureSignals),
          likelyBusinessNeeds: cleanArray(data.likelyBusinessNeeds),
          impliedStrategicGoals: cleanArray(data.impliedStrategicGoals),
          deliverablesLikely: cleanArray(data.deliverablesLikely),
          possibleHeadlineFacts: cleanArray(data.possibleHeadlineFacts || data.phf),
          matchCategories: cleanArray(data.matchCategories || data.mc),
          genHeroPositioning: cleanString(data.genHeroPositioning || data.ghp),
          genPersonalisedOpening: cleanString(data.genPersonalisedOpening || data.gpo),
          genWhyThisCompany: cleanString(data.genWhyThisCompany || data.gwc),
          genWhyThisRole: cleanString(data.genWhyThisRole || data.gwr),
          genRoleNeedsSummary: cleanString(data.genRoleNeedsSummary || data.grn),
          genExperienceMappings: cleanExperienceMappings(data.genExperienceMappings || data.gem),
          genFocusAreasToBring: cleanFocusAreasToBring(data.genFocusAreasToBring || data.gfb),
          genFitSummary: cleanString(data.genFitSummary || data.gfs),
          genLikelyContribution: cleanString(data.genLikelyContribution || data.glc),
          genCompanyHighlights: cleanArray(data.genCompanyHighlights || data.gch),
          genCultureFit: cleanString(data.genCultureFit || data.gcf),
          genFirst90DaysPlan: cleanFirst90DaysPlan(data.genFirst90DaysPlan || data.g90),
          genClosingSummary: cleanString(data.genClosingSummary || data.gcs),
          genClosingProofPoints: cleanArray(data.genClosingProofPoints || data.gcp),
          genEvidenceExamples: cleanEvidenceExamples(data.genEvidenceExamples || data.gee)
        };

        if (typeof data.personalisedContent === "object" && data.personalisedContent !== null) {
          const pc = data.personalisedContent;
          result.genHeroPositioning = cleanString(pc.heroPositioning) || result.genHeroPositioning;
          result.genPersonalisedOpening = cleanString(pc.personalisedOpening) || result.genPersonalisedOpening;
          result.genWhyThisCompany = cleanString(pc.whyThisCompany) || result.genWhyThisCompany;
          result.genWhyThisRole = cleanString(pc.whyThisRole) || result.genWhyThisRole;
          result.genRoleNeedsSummary = cleanString(pc.roleNeedsSummary) || result.genRoleNeedsSummary;
          result.genExperienceMappings = cleanExperienceMappings(pc.experienceMappings).length ? cleanExperienceMappings(pc.experienceMappings) : result.genExperienceMappings;
          result.genFocusAreasToBring = cleanFocusAreasToBring(pc.focusAreasToBring).length ? cleanFocusAreasToBring(pc.focusAreasToBring) : result.genFocusAreasToBring;
          result.genFitSummary = cleanString(pc.fitSummary) || result.genFitSummary;
          result.genLikelyContribution = cleanString(pc.likelyContributionSummary) || result.genLikelyContribution;
          result.genCompanyHighlights = cleanArray(pc.companyHighlights).length ? cleanArray(pc.companyHighlights) : result.genCompanyHighlights;
          result.genCultureFit = cleanString(pc.cultureFitSummary) || result.genCultureFit;
          result.genFirst90DaysPlan = cleanFirst90DaysPlan(pc.first90DaysPlan).length ? cleanFirst90DaysPlan(pc.first90DaysPlan) : result.genFirst90DaysPlan;
          result.genClosingSummary = cleanString(pc.closingSummary) || result.genClosingSummary;
          result.genClosingProofPoints = cleanArray(pc.closingProofPoints).length ? cleanArray(pc.closingProofPoints) : result.genClosingProofPoints;
          result.genEvidenceExamples = cleanEvidenceExamples(pc.selectedEvidenceExamples).length ? cleanEvidenceExamples(pc.selectedEvidenceExamples) : result.genEvidenceExamples;
        }

        return result;
      }

      const SUPABASE_URL = "https://jntpyqguonknixyksqbp.supabase.co";
      const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpudHB5cWd1b25rbml4eWtzcWJwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwODYxNTEsImV4cCI6MjA5MDY2MjE1MX0.Tx2nMTKuguGIRnSwLR2Wm47d68p99DrH2ldIWWKOuBs";

      async function fetchApplicationByRef(ref) {
        const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";

        if (isLocal) {
          const response = await fetch(`/api/application?ref=${encodeURIComponent(ref)}&t=${Date.now()}`, { cache: "no-store" });
          if (!response.ok) throw new Error(`Could not load application record for ${ref}`);
          return response.json();
        }

        const url = `${SUPABASE_URL}/rest/v1/applications?ref=eq.${encodeURIComponent(ref)}&select=application&limit=1`;
        const response = await fetch(url, {
          headers: { "apikey": SUPABASE_ANON_KEY, "Accept": "application/json" },
          cache: "no-store"
        });
        if (!response.ok) throw new Error(`Could not load application record for ${ref}`);
        const rows = await response.json();
        if (!rows.length || !rows[0].application) throw new Error(`No application found for ${ref}`);
        return rows[0].application;
      }

      async function fetchApplicationByShortCode(sc) {
        const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
        if (isLocal) {
          const response = await fetch(`/api/application?sc=${encodeURIComponent(sc)}&t=${Date.now()}`, { cache: "no-store" });
          if (!response.ok) throw new Error(`Could not load application for short code ${sc}`);
          return response.json();
        }

        const url = `${SUPABASE_URL}/rest/v1/applications?short_code=eq.${encodeURIComponent(sc)}&select=application&limit=1`;
        const response = await fetch(url, {
          headers: { "apikey": SUPABASE_ANON_KEY, "Accept": "application/json" },
          cache: "no-store"
        });
        if (!response.ok) throw new Error(`Could not load application for short code ${sc}`);
        const rows = await response.json();
        if (!rows.length || !rows[0].application) throw new Error(`No application found for short code ${sc}`);
        return rows[0].application;
      }

      function compactValue(value) {
        return value && value !== "Not specified" ? value : "";
      }

      function normaliseKey(value) {
        return cleanString(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      }

      function textWordCount(value) {
        return cleanString(value).split(/\s+/).filter(Boolean).length;
      }

      function textLength(value) {
        return cleanString(value).length;
      }

      function similarityThreshold(value) {
        const words = textWordCount(value);
        if (words <= 2) return 0.92;
        if (words <= 4) return 0.82;
        return 0.7;
      }

      function textSimilarity(left, right) {
        const a = cleanString(left);
        const b = cleanString(right);
        if (!a || !b) return 0;

        const aKey = normaliseKey(a);
        const bKey = normaliseKey(b);
        if (aKey && aKey === bKey) return 1;

        const shorter = a.length <= b.length ? a : b;
        const longer = shorter === a ? b : a;
        if (shorter.length >= 40 && normaliseKey(longer).includes(normaliseKey(shorter))) return 0.95;

        const leftTokens = tokenise(a);
        const rightTokens = tokenise(b);
        if (!leftTokens.size || !rightTokens.size) return 0;

        let overlap = 0;
        leftTokens.forEach((token) => {
          if (rightTokens.has(token)) overlap += 1;
        });

        return overlap / Math.min(leftTokens.size, rightTokens.size);
      }

      function isSimilarText(left, right, threshold = similarityThreshold(left || right)) {
        return textSimilarity(left, right) >= threshold;
      }

      function uniqueStrings(values, limit = Infinity, exclusions = []) {
        const comparisonPool = exclusions.map((item) => cleanString(item)).filter(Boolean);
        const output = [];
        values.forEach((value) => {
          const cleaned = cleanString(value);
          if (!cleaned) return;
          if (comparisonPool.some((item) => isSimilarText(cleaned, item))) return;
          comparisonPool.push(cleaned);
          output.push(cleaned);
        });
        return output.slice(0, limit);
      }

      function formatList(values) {
        const items = values.filter(Boolean);
        if (!items.length) return "";
        if (items.length === 1) return items[0];
        if (items.length === 2) return `${items[0]} and ${items[1]}`;
        return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
      }

      function shortenText(value, maxLength = 170) {
        const cleaned = cleanString(value).replace(/\s+/g, " ");
        if (cleaned.length <= maxLength) return cleaned;
        const shortened = cleaned.slice(0, maxLength);
        const lastBreak = Math.max(
          shortened.lastIndexOf(". "),
          shortened.lastIndexOf("; "),
          shortened.lastIndexOf(", "),
          shortened.lastIndexOf(" ")
        );
        const cutAt = lastBreak > Math.max(70, Math.floor(maxLength * 0.55)) ? lastBreak : maxLength;
        return `${shortened.slice(0, cutAt).trim()}...`;
      }

      function tokenise(value) {
        return new Set(
          cleanString(value)
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, " ")
            .split(" ")
            .filter((token) => token.length >= 4 && !STOPWORDS.has(token))
        );
      }

      function pickFirst(...values) {
        for (const value of values) {
          const cleaned = cleanString(value);
          if (cleaned) return cleaned;
        }
        return "";
      }

      function pickDistinctText(candidates, usedTexts = [], fallback = "") {
        const pool = candidates.map((value) => cleanString(value)).filter(Boolean);
        for (const candidate of pool) {
          if (!usedTexts.some((used) => isSimilarText(candidate, used))) {
            return candidate;
          }
        }

        const fallbackValue = cleanString(fallback);
        if (fallbackValue && !usedTexts.some((used) => isSimilarText(fallbackValue, used))) {
          return fallbackValue;
        }

        return pool[0] || fallbackValue;
      }

      function pickOptionalDistinctText(candidates, usedTexts = []) {
        const pool = candidates.map((value) => cleanString(value)).filter(Boolean);
        for (const candidate of pool) {
          if (!usedTexts.some((used) => isSimilarText(candidate, used))) {
            return candidate;
          }
        }
        return "";
      }

      function rememberText(store, ...values) {
        values.forEach((value) => {
          const cleaned = cleanString(value);
          if (cleaned) store.push(cleaned);
        });
      }

      function pruneDisplayTags(tags, context = []) {
        const contextValues = context.map((value) => cleanString(value)).filter(Boolean);
        return uniqueStrings(tags, 6, contextValues).filter((tag) => (
          !isLowSignalTag(tag) &&
          !contextValues.some((value) => isSimilarText(tag, value, 0.86))
        )).slice(0, 4);
      }

      function filterDistinctCards(cards, maxCards = 4) {
        const kept = [];
        const seen = [];
        cards.forEach((card) => {
          if (!card || !cleanString(card.title) || !cleanString(card.copy)) return;
          const cardCopy = cleanString(card.copy);
          const cardTitle = cleanString(card.title);
          if (seen.some((value) => isSimilarText(cardCopy, value) || isSimilarText(cardTitle, value, 0.86))) return;
          kept.push({
            title: cardTitle,
            copy: cardCopy,
            tags: pruneDisplayTags(card.tags || [], [cardTitle, cardCopy])
          });
          seen.push(cardCopy, cardTitle);
        });
        return kept.slice(0, maxCards);
      }

      function isLowSignalTag(value) {
        const key = normaliseKey(value);
        if (!key) return true;
        return LOW_SIGNAL_TAGS.has(key);
      }

      function containsProofMetric(value) {
        return /£\s?\d[\d.,]*/i.test(value) || /\d+(?:\.\d+)?%/.test(value) || /\d+[+]/.test(value);
      }

      function extractProofMetric(value) {
        const text = cleanString(value);
        if (!text) return "";
        const matchers = [
          /£\s?\d[\d.,]*(?:\s?[mk]|k)?/i,
          /\d+(?:\.\d+)?%/,
          /\d+(?:\.\d+)?x/i,
          /\d+[+]\s?(?:staff|sites?|teams?|reviews?|hours?|months?|days?|years?)?/i,
          /\d+\s?(?:staff|sites?|teams?|reviews?|hours?|months?|days?|years?)/i
        ];
        for (const pattern of matchers) {
          const match = text.match(pattern);
          if (match) return cleanString(match[0]);
        }
        return "";
      }

      function buildRoleSignalTokens(state) {
        return tokenise([
          state.roleTitle,
          state.rolePurpose,
          state.shortRoleReason,
          state.roleSummary,
          state.probablePriorities.join(" "),
          state.keyFocusAreas.join(" "),
          state.essentialRequirements.join(" "),
          state.skillsWanted.join(" ")
        ].join(" "));
      }

      function buildCompanySignalTokens(state) {
        return tokenise([
          state.companyName,
          state.companySummary,
          state.shortCompanyReason,
          state.companyPridePoints.join(" "),
          state.genCompanyHighlights.join(" "),
          state.cultureSignals.join(" ")
        ].join(" "));
      }

      function tokenOverlapRatio(value, referenceTokens) {
        const tokens = tokenise(value);
        if (!tokens.size || !referenceTokens.size) return 0;
        let overlap = 0;
        tokens.forEach((token) => {
          if (referenceTokens.has(token)) overlap += 1;
        });
        return overlap / tokens.size;
      }

      function looksRoleLedText(value, state) {
        const text = cleanString(value);
        if (!text) return false;
        const roleRatio = tokenOverlapRatio(text, buildRoleSignalTokens(state));
        const companyRatio = tokenOverlapRatio(text, buildCompanySignalTokens(state));
        return roleRatio >= 0.34 && roleRatio > companyRatio + 0.08;
      }

      function looksCompanyLedText(value, state) {
        const text = cleanString(value);
        if (!text) return false;
        const companyRatio = tokenOverlapRatio(text, buildCompanySignalTokens(state));
        const roleRatio = tokenOverlapRatio(text, buildRoleSignalTokens(state));
        return companyRatio >= 0.28 && companyRatio >= roleRatio;
      }

      function findEvidenceById(examples, exampleId) {
        const id = cleanString(exampleId);
        if (!id) return null;
        return cleanEvidenceExamples(examples).find((example) => cleanString(example.exampleId) === id) || null;
      }

      function evidencePriority(example) {
        const usage = normaliseKey(example.suggestedUsage);
        let score = 0;
        if (containsProofMetric(example.shortLine)) score += 3;
        if (usage.includes("hero")) score += 2;
        if (example.bestMatchedRoleNeed) score += 1.5;
        if (example.proofAngle) score += 1;
        if (example.whyChosen) score += 1;
        if (textLength(example.shortLine) >= 56) score += 0.4;
        return score;
      }

      function pickShowcaseEvidenceExamples(examples, limit = 3) {
        const ranked = cleanEvidenceExamples(examples)
          .slice()
          .sort((left, right) => evidencePriority(right) - evidencePriority(left));

        const selected = [];
        const seenNeeds = new Set();
        const seenAngles = new Set();
        const seenCopy = [];

        ranked.forEach((example) => {
          if (selected.length >= limit) return;
          const evidenceCopy = pickFirst(example.shortLine, example.whyChosen, example.exampleTitle);
          if (!evidenceCopy) return;
          if (seenCopy.some((value) => isSimilarText(evidenceCopy, value) || isSimilarText(example.exampleTitle, value, 0.84))) return;

          const needKey = normaliseKey(example.bestMatchedRoleNeed);
          const angleKey = normaliseKey(example.proofAngle);
          const repeatNeed = needKey && seenNeeds.has(needKey);
          const repeatAngle = angleKey && seenAngles.has(angleKey);
          if ((repeatNeed || repeatAngle) && selected.length < limit - 1) return;

          selected.push(example);
          seenCopy.push(evidenceCopy, example.exampleTitle);
          if (needKey) seenNeeds.add(needKey);
          if (angleKey) seenAngles.add(angleKey);
        });

        return selected.slice(0, limit);
      }

      function buildEvidenceUsageLine(example) {
        const proofBits = uniqueStrings(
          [example.proofAngle, example.bestMatchedRoleNeed, example.suggestedUsage],
          2,
          [example.exampleTitle, example.shortLine, example.whyChosen]
        );
        const whyChosen = cleanString(example.whyChosen);
        if (whyChosen && !proofBits.some((item) => isSimilarText(item, whyChosen))) {
          return proofBits.length ? `${proofBits.join(" · ")}. ${whyChosen}` : whyChosen;
        }
        return proofBits.join(" · ");
      }

      function buildHeroProofItems(examples) {
        return pickShowcaseEvidenceExamples(examples, 3).map((example) => {
          const value = extractProofMetric(pickFirst(example.shortLine, example.whyChosen));
          const copy = shortenText(
            pickFirst(example.proofAngle, example.bestMatchedRoleNeed, example.exampleTitle),
            58
          );
          if (!value || !copy) return null;
          return { value, copy };
        }).filter(Boolean);
      }

      function buildContractFact(state) {
        const parts = [];
        const employmentType = compactValue(state.employmentType);
        const workplaceType = compactValue(state.workplaceType);
        const hours = compactValue(state.hours);
        if (employmentType) parts.push(employmentType);
        if (workplaceType) parts.push(workplaceType);
        if (hours) parts.push(hours.includes("hour") ? hours : `${hours} hours`);
        return parts.join(" · ");
      }

      function buildAdvertFactExclusions(state) {
        return [
          state.companyName,
          state.roleTitle,
          state.location,
          state.sector,
          state.employmentType,
          state.workplaceType,
          state.hours,
          buildContractFact(state)
        ];
      }

      function buildHeroStrengthLine(state) {
        const facts = buildAdvertFactExclusions(state);
        const strengths = uniqueStrings(
          [
            ...cleanEvidenceExamples(state.genEvidenceExamples).map((item) => item.proofAngle),
            ...cleanEvidenceExamples(state.genEvidenceExamples).map((item) => item.bestMatchedRoleNeed),
            ...state.matchCategories,
            ...cleanFocusAreasToBring(state.genFocusAreasToBring).map((item) => item.title),
            ...state.skillsWanted,
            ...state.keyFocusAreas,
          ],
          3,
          facts
        ).filter((item) => !isLowSignalTag(item));
        if (strengths.length >= 2) return strengths.slice(0, 2).join(" · ");
        if (strengths.length) return strengths[0];
        return "Delivery control · clearer reporting · measurable improvement";
      }

      function buildHeroStatement(state) {
        return pickFirst(
          state.personalisedIntro,
          "I tend to be most useful where the work is complex, the priorities need tightening, and the team would benefit from steadier operational follow-through. The brief suggests that kind of opportunity, which is why I wanted to add some focused context alongside my CV."
        );
      }

      function buildHeroPullNote(state, fitSummary, likelyContribution) {
        const note = pickFirst(likelyContribution, fitSummary, buildFitSummary(state));
        return `<strong>What I would bring</strong>${shortenText(note || buildHeroStrengthLine(state), 155)}`;
      }

      function buildHeroKickerCopy(state) {
        const facts = buildAdvertFactExclusions(state);
        const positioning = uniqueStrings(
          [
            ...cleanEvidenceExamples(state.genEvidenceExamples).map((item) => item.proofAngle),
            ...cleanEvidenceExamples(state.genEvidenceExamples).map((item) => item.bestMatchedRoleNeed),
            ...state.matchCategories,
            ...state.keyFocusAreas
          ],
          3,
          facts
        ).filter((item) => !isLowSignalTag(item));

        return pickFirst(
          formatList(positioning.slice(0, 3)),
          state.shortRoleReason,
          "Operational leadership across healthcare, manufacturing, live operations, and regulated service environments"
        );
      }

      function buildCompanyHighlights(state) {
        return uniqueStrings(
          [
            ...state.genCompanyHighlights,
            ...state.companyPridePoints
          ],
          4,
          buildAdvertFactExclusions(state)
        ).filter((item) => !isLowSignalTag(item));
      }

      function buildHeroKickerNotes(state) {
        const examples = pickShowcaseEvidenceExamples(state.genEvidenceExamples, 3);
        return uniqueStrings(
          [
            ...examples.map((item) => item.proofAngle),
            ...examples.map((item) => item.bestMatchedRoleNeed),
            ...state.possibleHeadlineFacts
          ],
          2,
          buildAdvertFactExclusions(state)
        ).filter((item) => !isLowSignalTag(item)).map((item) => shortenText(item, 42));
      }

      function buildWhyCompany(state) {
        const highlights = buildCompanyHighlights(state);
        const companySummary = looksRoleLedText(state.companySummary, state) ? "" : state.companySummary;
        const shortCompanyReason = looksRoleLedText(state.shortCompanyReason, state) ? "" : state.shortCompanyReason;
        return pickFirst(
          companySummary,
          shortCompanyReason,
          highlights.length
            ? `What appeals to me most is the sense of ${formatList(highlights.slice(0, 3))}. That usually points to an environment where good judgement, operational steadiness, and practical improvement are valued.`
            : "The company detail in the advert is fairly light, but the overall environment still comes across as one where well-run operations and sensible decision-making matter."
        );
      }

      function buildWhyRole(state) {
        const roleThemes = uniqueStrings(
          [...state.probablePriorities, ...state.keyFocusAreas],
          3,
          buildAdvertFactExclusions(state)
        );
        return pickFirst(
          state.whyThisRole,
          state.shortRoleReason,
          state.rolePurpose,
          state.roleSummary,
          roleThemes.length
            ? `What appeals to me most is the work itself: ${formatList(roleThemes.slice(0, 3))}. That is usually where I can contribute best by improving visibility, tightening follow-through, and helping the work move with fewer avoidable gaps.`
            : "I tend to be at my best in roles that bring together delivery rhythm, stakeholder clarity, and practical improvement."
        );
      }

      function buildRoleNeedsSummary(state) {
        const priorities = uniqueStrings(state.probablePriorities, 4, buildAdvertFactExclusions(state));
        const businessNeeds = uniqueStrings(state.likelyBusinessNeeds, 3, buildAdvertFactExclusions(state));
        if (priorities.length || businessNeeds.length) {
          const clauses = [];
          if (priorities.length) clauses.push(`keep ${formatList(priorities.slice(0, 3))} clear and moving`);
          if (businessNeeds.length) clauses.push(`reduce friction around ${formatList(businessNeeds.slice(0, 2))}`);
          return `From the brief, I read this as a role that needs someone who can ${clauses.join(" and ")}. In practice, that usually means bringing better judgement, steadier control, and clearer follow-through to the day-to-day running of the work.`;
        }
        return pickFirst(
          state.rolePurpose,
          state.shortRoleReason,
          state.roleSummary,
          "I read this as a role that needs visible priorities, steady operational control, and fewer avoidable gaps between plans and delivery."
        );
      }

      function buildFitSummary(state) {
        const strengths = uniqueStrings(
          [...state.matchCategories, ...state.skillsWanted, ...state.keyFocusAreas],
          4,
          buildAdvertFactExclusions(state)
        ).filter((item) => !isLowSignalTag(item));
        return pickFirst(
          strengths.length
            ? `What makes this a sensible fit is the overlap between the brief and the kind of work I have done repeatedly: ${formatList(strengths.slice(0, 3))}. I tend to add most value where the work needs to be made clearer, steadier, and easier to run well.`
            : "My background is strongest where operational control, reporting, and cross-functional coordination all need to work together."
        );
      }

      function buildLikelyContribution(state) {
        const priorities = uniqueStrings(
          [...state.keyFocusAreas, ...state.probablePriorities],
          3,
          buildAdvertFactExclusions(state)
        ).filter((item) => !isLowSignalTag(item));
        if (priorities.length) {
          return `Based on the brief, I would expect to be most useful by giving the team better visibility around ${formatList(priorities)} and by helping the work run with a steadier rhythm.`;
        }
        return "Based on the brief, I would expect to focus on tightening delivery rhythm, improving visibility, and helping the work operate with clearer priorities.";
      }

      function buildCultureFit(state) {
        const signals = uniqueStrings(
          [...state.toneKeywords, ...state.cultureSignals],
          4,
          buildAdvertFactExclusions(state)
        ).filter((item) => !isLowSignalTag(item));
        if (signals.length) {
          return `I work best in ${formatList(signals)} environments where expectations are clear and improvement is taken seriously.`;
        }
        return "I tend to do my best work in collaborative, structured environments where expectations are clear and improvement is practical.";
      }

      function buildClosingSummary(state) {
        return "I would welcome the chance to bring that mix of operational judgement, delivery clarity, and evidence-backed improvement into the role.";
      }

      function buildIntroTraits(state) {
        const facts = buildAdvertFactExclusions(state);
        const primarySignals = uniqueStrings(
          [...buildCompanyHighlights(state), ...state.cultureSignals],
          2,
          facts
        ).filter((item) => !isLowSignalTag(item));
        if (primarySignals.length) return primarySignals;
        return uniqueStrings(state.companyPridePoints, 2, facts).filter((item) => !isLowSignalTag(item));
      }

      function buildIntroStrengthLines(state) {
        return uniqueStrings(
          [
            ...pickShowcaseEvidenceExamples(state.genEvidenceExamples, 3).map((item) => pickFirst(item.proofAngle, item.bestMatchedRoleNeed, item.exampleTitle)),
            ...state.matchCategories
          ],
          3,
          buildAdvertFactExclusions(state)
        ).filter((item) => !isLowSignalTag(item));
      }

      function buildRoleNeedsCards(state, roleNeedsSummary) {
        const facts = buildAdvertFactExclusions(state);
        const priorities = uniqueStrings([...state.probablePriorities, ...state.keyFocusAreas], 4, facts);
        const businessNeeds = uniqueStrings(state.likelyBusinessNeeds, 4, facts);
        const outcomes = uniqueStrings([...state.impliedStrategicGoals, ...state.deliverablesLikely], 4, facts);
        const cards = [];

        cards.push({
          title: "What the role seems to need most",
          copy: roleNeedsSummary,
          tags: pruneDisplayTags([state.rolePurpose, state.headlineAttraction], [roleNeedsSummary])
        });

        if (priorities.length) {
          cards.push({
            title: "Where the pressure likely sits",
            copy: `The role looks likely to turn on how well ${formatList(priorities.slice(0, 3))} are kept visible, coordinated, and moving without drift.`,
            tags: priorities.slice(0, 4)
          });
        }

        if (businessNeeds.length || outcomes.length) {
          const supportTags = uniqueStrings([...businessNeeds, ...outcomes], 4, facts);
          cards.push({
            title: "What success probably looks like",
            copy: businessNeeds.length
              ? `Underneath the advert, this looks to be about ${formatList(businessNeeds.slice(0, 3))}, so the team can operate with less friction and more confidence.`
              : `Success here seems to depend on stronger control around ${formatList(outcomes.slice(0, 3))}.`,
            tags: supportTags
          });
        }

        return filterDistinctCards(cards, 3);
      }

      function buildFitCards(state, fitSummary, likelyContribution, cultureFit) {
        const facts = buildAdvertFactExclusions(state);
        const cards = filterDistinctCards([
          {
            title: "Why my background transfers",
            copy: fitSummary,
            tags: pruneDisplayTags([...state.matchCategories, ...state.skillsWanted], [fitSummary])
          },
          {
            title: "What I would add early",
            copy: likelyContribution,
            tags: pruneDisplayTags([...state.keyFocusAreas, ...state.probablePriorities], [likelyContribution])
          },
          {
            title: "How I tend to work",
            copy: cultureFit,
            tags: pruneDisplayTags([...state.toneKeywords, ...state.cultureSignals], [cultureFit])
          }
        ], 3);
        return cards.filter((card) => card.copy);
      }

      function pickBestEvidenceForNeed(need, examples) {
        if (!examples.length) return null;
        const needTokens = tokenise(need);
        let best = null;
        let bestScore = -1;
        examples.forEach((example, index) => {
          const pool = [example.exampleTitle, example.shortLine, example.whyChosen].join(" ");
          const exampleTokens = tokenise(pool);
          let score = 0;
          needTokens.forEach((token) => {
            if (exampleTokens.has(token)) score += 1;
          });
          if (score > bestScore) {
            best = example;
            bestScore = score;
          }
          if (score === bestScore && !best && index === 0) {
            best = example;
          }
        });
        return best || examples[0];
      }

      function buildExperienceMappings(state) {
        const generated = cleanExperienceMappings(state.genExperienceMappings);
        if (generated.length) return generated;

        const examples = cleanEvidenceExamples(state.genEvidenceExamples);
        if (!examples.length) return [];

        const needs = uniqueStrings(
          [...state.essentialRequirements, ...state.skillsWanted, ...state.matchCategories, ...state.keyFocusAreas],
          4,
          buildAdvertFactExclusions(state)
        );

        return needs.map((need) => {
          const example = pickBestEvidenceForNeed(need, examples);
          return {
            roleNeed: need,
            evidenceExampleId: example ? example.exampleId : "",
            myEvidence: example ? pickFirst(example.shortLine, example.exampleTitle) : buildFitSummary(state),
            relevance: example
              ? pickFirst(example.whyChosen, example.suggestedUsage, `That experience maps directly to the role's need for ${need}.`)
              : "This maps well to the kind of operational support the brief appears to need.",
            proofAngle: example ? pickFirst(example.proofAngle, example.bestMatchedRoleNeed) : ""
          };
        }).filter((item) => item.roleNeed && item.myEvidence);
      }

      function buildFocusSummary(title) {
        const key = normaliseKey(title);
        if (key.includes("capacity") || key.includes("resource") || key.includes("planning")) {
          return "I would want demand, capacity, and forward planning to be visible enough that the team can make better decisions earlier.";
        }
        if (key.includes("governance") || key.includes("workflow") || key.includes("jira") || key.includes("report")) {
          return "I would tighten the operating rhythm around workflow visibility, ownership, and reporting so progress is easier to track and problems surface sooner.";
        }
        if (key.includes("stakeholder") || key.includes("communication") || key.includes("coordination")) {
          return "I would keep expectations clear across teams through practical updates, visible priorities, and quicker handling of blockers.";
        }
        if (key.includes("vendor") || key.includes("procurement") || key.includes("financial")) {
          return "I would bring order to supplier, procurement, and spend-related work so avoidable friction does not slow delivery down.";
        }
        if (key.includes("improvement") || key.includes("continuous")) {
          return "I would look for targeted process improvements that reduce ambiguity, improve flow, and make delivery easier to sustain.";
        }
        return `I would bring a more structured, visible approach to ${title}, with clearer ownership and steadier follow-through.`;
      }

      function buildFocusCards(state) {
        const generated = cleanFocusAreasToBring(state.genFocusAreasToBring);
        if (generated.length) {
          return filterDistinctCards(
            generated.slice(0, 3).map((item) => ({
              title: item.title,
              copy: item.summary,
              tags: []
            })),
            3
          );
        }

        const focusAreas = uniqueStrings(
          [...state.keyFocusAreas, ...state.matchCategories],
          4,
          buildAdvertFactExclusions(state)
        );

        return filterDistinctCards(focusAreas.map((title) => ({
          title,
          copy: buildFocusSummary(title),
          tags: []
        })), 3);
      }

      function buildSkillsCards(state) {
        const facts = buildAdvertFactExclusions(state);
        const skillAreas = uniqueStrings([...state.skillsWanted, ...state.matchCategories], 6, facts).filter((item) => !isLowSignalTag(item));
        const tools = uniqueStrings(state.toolsMethodsMentioned, 6, facts);
        const stakeholderGroups = uniqueStrings([...state.stakeholderGroups, ...state.teamTypesMentioned], 6, facts);
        const deliverables = uniqueStrings(state.deliverablesLikely, 5, facts);
        const cards = [];

        if (stakeholderGroups.length) {
          cards.push({
            title: "How I work across the role",
            copy: `I am used to keeping ${formatList(stakeholderGroups.slice(0, 4))} aligned around priorities, updates, handoffs, and blockers so the work keeps moving cleanly.`,
            tags: pruneDisplayTags([...stakeholderGroups.slice(0, 3), ...skillAreas.slice(0, 2)], [])
          });
        }

        if (tools.length || deliverables.length) {
          const toolingSentence = tools.length
            ? `I am comfortable working within ${formatList(tools.slice(0, 3))} environments where delivery needs to stay visible and well governed.`
            : "";
          const deliverableSentence = deliverables.length
            ? ` The role's emphasis on ${formatList(deliverables.slice(0, 3))} fits well with the kind of operational reporting and control I have had to maintain before.`
            : "";
          cards.push({
            title: "Tools, methods, and working rhythm",
            copy: `${toolingSentence}${deliverableSentence}`.trim(),
            tags: pruneDisplayTags([...tools.slice(0, 3), ...deliverables.slice(0, 2)], [])
          });
        }

        if (!cards.length && skillAreas.length >= 3) {
          cards.push({
            title: "Where the overlap is strongest",
            copy: `The strongest overlap here sits around ${formatList(skillAreas.slice(0, 3))}. That is work I have repeatedly had to make clearer, steadier, and easier to run well.`,
            tags: pruneDisplayTags(skillAreas.slice(0, 4), [])
          });
        }

        return filterDistinctCards(cards, 2);
      }

      function buildFirst90DaysPlan(state) {
        const generated = cleanFirst90DaysPlan(state.genFirst90DaysPlan);
        if (generated.length) return generated.slice(0, 3);

        const priorities = uniqueStrings(state.probablePriorities, 3, buildAdvertFactExclusions(state));
        const needs = uniqueStrings(state.likelyBusinessNeeds, 3, buildAdvertFactExclusions(state));
        const goals = uniqueStrings(state.impliedStrategicGoals, 3, buildAdvertFactExclusions(state));

        return [
          {
            phase: "First 30 days",
            focus: "Understand the operating rhythm",
            detail: priorities.length
              ? `I would start by understanding the current approach to ${formatList(priorities)}, the stakeholder landscape, and the reporting cadence.`
              : "I would start by understanding the operating rhythm, stakeholder expectations, and where current delivery feels most stretched."
          },
          {
            phase: "Days 30-60",
            focus: "Improve visibility and prioritisation",
            detail: needs.length
              ? `I would focus on improving visibility around ${formatList(needs)} and tightening prioritisation where needed.`
              : "I would focus on improving workload visibility, surfacing blockers earlier, and tightening prioritisation where needed."
          },
          {
            phase: "Days 60-90",
            focus: "Embed a steadier delivery rhythm",
            detail: goals.length
              ? `I would look to embed governance that supports ${formatList(goals)} with clearer forecasting and fewer surprises.`
              : "I would look to embed a steadier delivery rhythm with clearer governance, stronger forecasting confidence, and fewer avoidable blockers."
          }
        ];
      }

      function buildHeroFocusItems(state, evidenceExamples) {
        const examples = pickShowcaseEvidenceExamples(evidenceExamples, 3);
        if (examples.length) {
          return uniqueStrings(
            examples.map((item) => shortenText(pickFirst(item.shortLine, item.whyChosen), 88)),
            3,
            buildAdvertFactExclusions(state)
          );
        }

        return uniqueStrings(
          [...state.matchCategories, ...state.keyFocusAreas, ...state.probablePriorities],
          3,
          buildAdvertFactExclusions(state)
        ).filter((item) => !isLowSignalTag(item));
      }

      function buildHeroMetaChips(state, narrativeContext = []) {
        return uniqueStrings(
          [
            ...state.toolsMethodsMentioned,
            ...state.deliverablesLikely,
            ...state.matchCategories,
            ...state.skillsWanted
          ],
          3,
          [...buildAdvertFactExclusions(state), ...narrativeContext]
        ).filter((item) => !isLowSignalTag(item)).map((item) => shortenText(item, 42));
      }

      function buildHeroToneChips(state, narrativeContext = []) {
        return uniqueStrings(
          [...state.cultureSignals, ...state.toneKeywords],
          2,
          [...buildAdvertFactExclusions(state), ...narrativeContext]
        ).filter((item) => !isLowSignalTag(item));
      }

      function renderLines(id, values, className = "") {
        const el = document.getElementById(id);
        if (!el) return 0;
        const items = uniqueStrings(values);
        el.innerHTML = "";
        if (!items.length) {
          el.style.display = "none";
          return 0;
        }
        el.style.display = "";
        items.forEach((value) => {
          const line = document.createElement("span");
          if (className) line.className = className;
          line.textContent = value;
          el.appendChild(line);
        });
        return items.length;
      }

      function renderThemeCards(sectionId, containerId, cards, skipDedup) {
        const section = document.getElementById(sectionId);
        const container = document.getElementById(containerId);
        if (!section || !container) return;

        const usableCards = skipDedup ? cards.filter((c) => c && cleanString(c.title) && cleanString(c.copy)) : filterDistinctCards(cards);
        container.innerHTML = "";
        if (!usableCards.length) {
          section.style.display = "none";
          return;
        }

        section.style.display = "";
        usableCards.forEach((card) => {
          const article = document.createElement("article");
          article.className = "theme-item";
          article.setAttribute("data-reveal", "");

          const heading = document.createElement("h3");
          heading.textContent = card.title;

          const copy = document.createElement("p");
          copy.textContent = card.copy;

          article.appendChild(heading);
          article.appendChild(copy);

          const tags = pruneDisplayTags(card.tags || [], [card.title, card.copy]).slice(0, 4);
          if (tags.length) {
            const tagsEl = document.createElement("div");
            tagsEl.className = "theme-tags";
            tags.forEach((tag) => {
              const span = document.createElement("span");
              span.textContent = tag;
              tagsEl.appendChild(span);
            });
            article.appendChild(tagsEl);
          }

          container.appendChild(article);
        });
      }

      function renderMappingCards(mappings) {
        const section = document.getElementById("mapping");
        const grid = document.getElementById("mapping-grid");
        if (!section || !grid) return;

        const usable = mappings.filter((item) => item && item.roleNeed && item.myEvidence);
        grid.innerHTML = "";
        if (!usable.length) {
          section.style.display = "none";
          return;
        }

        section.style.display = "";
        usable.forEach((item, index) => {
          const card = document.createElement("div");
          card.className = "evidence-item";
          card.setAttribute("data-reveal", "");
          const matchedExample = findEvidenceById(window.__currentEvidenceExamples || [], item.evidenceExampleId);

          const marker = document.createElement("span");
          marker.className = "evidence-marker";
          marker.textContent = String(index + 1).padStart(2, "0");

          const title = document.createElement("span");
          title.className = "evidence-title";
          title.textContent = item.roleNeed;

          const evidence = document.createElement("span");
          evidence.className = "evidence-line";
          evidence.textContent = item.myEvidence;

          card.appendChild(marker);
          card.appendChild(title);
          card.appendChild(evidence);

          const usageBits = uniqueStrings(
            [
              matchedExample ? matchedExample.exampleTitle : "",
              item.proofAngle,
              item.relevance
            ],
            2,
            [item.roleNeed, item.myEvidence]
          );

          if (usageBits.length) {
            const relevance = document.createElement("span");
            relevance.className = "evidence-usage";
            relevance.textContent = usageBits.join(" · ");
            card.appendChild(relevance);
          }

          grid.appendChild(card);
        });
      }

      function renderEvidenceExamples(examples) {
        const section = document.getElementById("evidence-fit");
        const grid = document.getElementById("evidence-grid");
        if (!section || !grid) return;

        const usable = cleanEvidenceExamples(examples);
        grid.innerHTML = "";
        if (!usable.length) {
          section.style.display = "none";
          return;
        }

        section.style.display = "";
        pickShowcaseEvidenceExamples(usable, 3).forEach((example, index) => {
          const item = document.createElement("div");
          item.className = "evidence-item";
          item.setAttribute("data-reveal", "");

          const marker = document.createElement("span");
          marker.className = "evidence-marker";
          marker.textContent = String(index + 1).padStart(2, "0");

          const title = document.createElement("span");
          title.className = "evidence-title";
          title.textContent = pickFirst(example.exampleTitle, example.suggestedUsage, `Example ${index + 1}`);

          item.appendChild(marker);
          item.appendChild(title);

          if (example.shortLine) {
            const line = document.createElement("span");
            line.className = "evidence-line";
            line.textContent = example.shortLine;
            item.appendChild(line);
          }

          const usageText = buildEvidenceUsageLine(example);
          if (usageText) {
            const usage = document.createElement("span");
            usage.className = "evidence-usage";
            usage.textContent = usageText;
            item.appendChild(usage);
          }

          grid.appendChild(item);
        });
      }

      function renderHeroProofItems(examples) {
        const strip = document.getElementById("hero-proof-strip");
        if (!strip) return;
        const items = buildHeroProofItems(examples);
        strip.innerHTML = "";
        if (items.length < 2) {
          strip.style.display = "none";
          return;
        }

        strip.style.display = "grid";
        items.forEach((item) => {
          const article = document.createElement("article");
          article.className = "hero-proof-item";

          const value = document.createElement("span");
          value.className = "hero-proof-value";
          value.textContent = item.value;

          const copy = document.createElement("span");
          copy.className = "hero-proof-copy";
          copy.textContent = item.copy;

          article.appendChild(value);
          article.appendChild(copy);
          strip.appendChild(article);
        });
      }

      function renderTailoredHighlights(values) {
        const container = document.getElementById("tailored-highlight-list");
        if (!container) return;
        const highlights = uniqueStrings(values, 4);
        container.innerHTML = "";
        if (!highlights.length) {
          container.style.display = "none";
          return;
        }

        container.style.display = "grid";
        highlights.forEach((value) => {
          const span = document.createElement("span");
          span.textContent = value;
          container.appendChild(span);
        });
      }

      function setText(id, value) {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
      }

      function setHtml(id, value) {
        const el = document.getElementById(id);
        if (el) el.innerHTML = value;
      }

      function setFactRow(rowId, spanId, value) {
        const row = document.getElementById(rowId);
        const span = document.getElementById(spanId);
        if (!row || !span) return;
        const cleaned = cleanString(value);
        if (!cleaned || cleaned === "Not specified") {
          row.style.display = "none";
          return;
        }
        row.style.display = "";
        span.textContent = cleaned;
      }

      function setElementVisibility(id, visible) {
        const el = document.getElementById(id);
        if (el) el.style.display = visible ? "" : "none";
      }

      function setParagraph(id, value) {
        const el = document.getElementById(id);
        if (!el) return;
        const cleaned = cleanString(value);
        el.textContent = cleaned;
        el.style.display = cleaned ? "" : "none";
      }

      function buildClosingHighlights(state, evidenceExamples) {
        const generatedProof = cleanArray(state.genClosingProofPoints).map((item) => shortenText(item, 90));
        if (generatedProof.length) {
          return uniqueStrings(generatedProof, 3, buildAdvertFactExclusions(state));
        }

        return uniqueStrings(
          [
            ...pickShowcaseEvidenceExamples(evidenceExamples, 3).map((item) => shortenText(pickFirst(item.shortLine, item.whyChosen), 90)),
            ...buildExperienceMappings(state).slice(0, 2).map((item) => shortenText(pickFirst(item.myEvidence, item.relevance), 90))
          ],
          3,
          buildAdvertFactExclusions(state)
        );
      }

      function buildClosingQuote(state, closingSummary, fitSummary, likelyContribution) {
        return shortenText(
          pickFirst(
            textLength(state.genHeroPositioning) <= 92 && !isSimilarText(state.genHeroPositioning, closingSummary) ? state.genHeroPositioning : "",
            cleanArray(state.genClosingProofPoints).find((item) => textLength(item) <= 92 && !isSimilarText(item, closingSummary)) || "",
            textLength(likelyContribution) <= 92 && !isSimilarText(likelyContribution, closingSummary) ? likelyContribution : "",
            textLength(fitSummary) <= 92 && !isSimilarText(fitSummary, closingSummary) ? fitSummary : "",
            buildHeroStrengthLine(state),
            "Clearer priorities, better visibility, and steadier follow-through."
          ),
          92
        );
      }

      function buildClosingSupportLine(state, evidenceExamples, usedTexts) {
        const generated = pickOptionalDistinctText(
          [buildLikelyContribution(state), buildFitSummary(state), buildWhyRole(state)],
          usedTexts
        );
        if (generated) return generated;
        const strongestProof = pickShowcaseEvidenceExamples(evidenceExamples, 3)[0];
        if (strongestProof) {
          return pickFirst(strongestProof.whyChosen, strongestProof.shortLine);
        }
        return "I tend to add value where the work needs firmer control, clearer visibility, and more consistent follow-through.";
      }

      function buildClosingSecondaryLine(state, evidenceExamples, usedTexts) {
        const candidate = pickOptionalDistinctText(
          [buildCultureFit(state), buildWhyCompany(state), state.headlineAttraction],
          usedTexts
        );
        if (candidate && !looksRoleLedText(candidate, state)) return candidate;
        const secondaryProof = pickShowcaseEvidenceExamples(evidenceExamples, 3)[1];
        if (secondaryProof) {
          return pickOptionalDistinctText(
            [secondaryProof.whyChosen, secondaryProof.shortLine, buildEvidenceUsageLine(secondaryProof)],
            usedTexts
          );
        }
        return "";
      }

      function applyState(state) {
        const companyHighlights = buildCompanyHighlights(state);
        const allEvidenceExamples = cleanEvidenceExamples(state.genEvidenceExamples);
        const evidenceExamples = pickShowcaseEvidenceExamples(allEvidenceExamples, 3);
        window.__currentEvidenceExamples = allEvidenceExamples;
        const usedNarrative = [];
        const heroPositioning = pickDistinctText(
          [state.genHeroPositioning, buildHeroStrengthLine(state)],
          usedNarrative,
          buildHeroStrengthLine(state)
        );
        rememberText(usedNarrative, heroPositioning);

        const heroStatement = pickDistinctText(
          [state.genPersonalisedOpening, state.personalisedIntro, buildHeroStatement(state)],
          usedNarrative,
          buildHeroStatement(state)
        );
        rememberText(usedNarrative, heroStatement);

        const whyCompany = pickDistinctText(
          [
            looksRoleLedText(state.genWhyThisCompany, state) ? "" : state.genWhyThisCompany,
            buildWhyCompany(state)
          ],
          usedNarrative,
          buildWhyCompany(state)
        );
        rememberText(usedNarrative, whyCompany);

        const whyRole = pickDistinctText(
          [
            looksCompanyLedText(state.genWhyThisRole, state) ? "" : state.genWhyThisRole,
            buildWhyRole(state)
          ],
          usedNarrative,
          buildWhyRole(state)
        );
        rememberText(usedNarrative, whyRole);

        const roleNeedsSummary = pickDistinctText(
          [state.genRoleNeedsSummary, buildRoleNeedsSummary(state)],
          usedNarrative,
          buildRoleNeedsSummary(state)
        );
        rememberText(usedNarrative, roleNeedsSummary);

        const fitSummary = pickDistinctText(
          [state.genFitSummary, buildFitSummary(state)],
          usedNarrative,
          buildFitSummary(state)
        );
        rememberText(usedNarrative, fitSummary);

        const likelyContribution = pickDistinctText(
          [state.genLikelyContribution, buildLikelyContribution(state)],
          usedNarrative,
          buildLikelyContribution(state)
        );
        rememberText(usedNarrative, likelyContribution);

        const cultureFit = pickOptionalDistinctText(
          [state.genCultureFit, buildCultureFit(state)],
          usedNarrative
        );
        rememberText(usedNarrative, cultureFit);

        const closingSummary = pickDistinctText(
          [state.genClosingSummary, buildClosingSummary(state)],
          usedNarrative,
          buildClosingSummary(state)
        );

        const experienceMappings = buildExperienceMappings(state);
        const first90DaysPlan = buildFirst90DaysPlan(state);
        const closingHighlights = buildClosingHighlights(state, evidenceExamples);
        const closingSupportLine = buildClosingSupportLine(state, evidenceExamples, [closingSummary, ...usedNarrative]);
        const closingSecondaryLine = buildClosingSecondaryLine(state, evidenceExamples, [closingSummary, closingSupportLine, ...usedNarrative]);

        document.title = state.companyName !== defaults.companyName
          ? `Ben T. Howard | ${state.companyName} | ${state.roleTitle}`
          : `Ben T. Howard | ${state.roleTitle}`;

        setText("hero-kicker", state.companyName === defaults.companyName ? "Application support" : `Application support for ${state.companyName}`);
        setText("hero-topline-meta-1", "Companion to my CV");
        setText("hero-topline-meta-2", "Focused on fit and evidence");
        setText("hero-role", state.companyName !== defaults.companyName
          ? `${state.roleTitle} for ${state.companyName}`
          : state.roleTitle);
        setText("hero-positioning", heroPositioning);
        setText("hero-statement", heroStatement);
        setHtml("hero-pull-note", buildHeroPullNote(state, fitSummary, likelyContribution));
        setText("hero-kicker-copy", buildHeroKickerCopy(state));
        renderLines("hero-kicker-notes", buildHeroKickerNotes(state));
        setText("hero-tailored-heading", "Why this opportunity fits");
        setText("hero-context-line", shortenText(pickFirst(state.headlineAttraction, state.rolePurpose, state.shortRoleReason, roleNeedsSummary), 145));
        setFactRow("hero-row-company", "hero-fact-company", state.companyName);
        setFactRow("hero-row-role", "hero-fact-role", state.roleTitle);
        setFactRow("hero-row-location", "hero-fact-location", compactValue(state.location));
        setFactRow("hero-row-sector", "hero-fact-sector", compactValue(state.sector));
        setFactRow("hero-row-contract", "hero-fact-contract", buildContractFact(state));
        renderLines(
          "hero-focus-list",
          buildHeroFocusItems(state, evidenceExamples),
          "hero-focus-chip"
        );
        renderHeroProofItems(evidenceExamples);
        renderLines("hero-meta-list", buildHeroMetaChips(state, usedNarrative), "hero-meta-chip");
        const toneCount = renderLines("hero-tone-list", buildHeroToneChips(state, usedNarrative), "hero-tone-chip");
        setElementVisibility("hero-tone-wrap", toneCount > 0);

        setText("intro-note", pickFirst(state.headlineAttraction, companyHighlights[0], state.shortCompanyReason, "A role and company combination where practical delivery and judgement both matter."));
        setText("intro-summary", whyCompany);
        setText("intro-detail", whyRole);
        renderLines("intro-traits", buildIntroTraits(state));
        renderLines("intro-strength-lines", buildIntroStrengthLines(state));

        setText("role-needs-note", "My read on where the role seems to need the strongest operational support.");
        renderThemeCards("role-needs", "role-needs-grid", buildRoleNeedsCards(state, roleNeedsSummary));

        setText("fit-note", "The strongest reasons I believe my background transfers well here.");
        renderThemeCards("fit", "fit-grid", buildFitCards(state, fitSummary, likelyContribution, cultureFit));

        setText("mapping-note", "How the brief maps to the strongest supporting evidence from my background.");
        renderMappingCards(experienceMappings);

        setText("focus-note", "The practical areas I would want to strengthen or steady early on.");
        renderThemeCards("focus-areas", "focus-grid", buildFocusCards(state));

        setText("evidence-note", evidenceExamples.length
          ? "The examples below are the clearest proof points for the kind of contribution I could make here."
          : "Relevant examples appear here when tailored evidence has been selected.");
        renderEvidenceExamples(evidenceExamples);

        setText("skills-note", "The delivery habits, tools, and coordination strengths that look most relevant here.");
        renderThemeCards("skills", "skills-grid", buildSkillsCards(state));

        setText("ninety-note", "A grounded starting view of where I would focus first.");
        renderThemeCards(
          "first-90-days",
          "ninety-grid",
          first90DaysPlan.map((item) => ({
            title: pickFirst(item.phase, item.focus, "Next phase"),
            copy: pickFirst(item.detail, item.focus, "A practical phase of work."),
            tags: uniqueStrings([item.focus], 1)
          })),
          true
        );

        setText("tailored-heading", "My closing case.");
        setText("tailored-note", "Why I believe I could make a useful contribution.");
        setText("tailored-quote", buildClosingQuote(state, closingSummary, fitSummary, likelyContribution));
        setText("tailored-rationale", closingSummary);
        setText("tailored-company-line", closingHighlights.length ? "Supporting proof" : "What I would bring");
        renderTailoredHighlights(closingHighlights);
        setParagraph("why-this-role", closingSupportLine);
        setParagraph("role-summary", closingSecondaryLine);

        const summaryEvidenceEl = document.getElementById("summary-evidence-lines");
        if (summaryEvidenceEl) {
          const summaryLines = uniqueStrings(evidenceExamples.map((item) => item.shortLine), 2, closingHighlights);
          summaryEvidenceEl.innerHTML = "";
          if (!summaryLines.length) {
            summaryEvidenceEl.style.display = "none";
          } else {
            summaryEvidenceEl.style.display = "";
            summaryLines.forEach((line) => {
              const span = document.createElement("span");
              span.className = "summary-evidence-line";
              span.textContent = line;
              summaryEvidenceEl.appendChild(span);
            });
          }
        }

        setText("contact-heading", "Open to discussing the opportunity.");
        setText("contact-note-top", "If this feels like a strong fit, I would welcome a conversation.");
        setText("contact-copy", "Thank you for taking the time to review both this page and my CV. I would welcome the chance to discuss where my background could be most useful in the role.");
      }

      function initReveal() {
        const targets = document.querySelectorAll("[data-reveal]");
        const drawTargets = document.querySelectorAll(".draw-line");

        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) {
          targets.forEach((target) => target.classList.add("is-visible"));
          drawTargets.forEach((target) => target.classList.add("is-visible"));
          return;
        }

        const revealObserver = new IntersectionObserver((entries, observer) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            entry.target.classList.add("is-visible");
            entry.target.querySelectorAll?.(".draw-line").forEach((line) => line.classList.add("is-visible"));
            observer.unobserve(entry.target);
          });
        }, { threshold: 0.15, rootMargin: "0px 0px -8% 0px" });

        targets.forEach((target, index) => {
          target.style.transitionDelay = `${Math.min(index * 45, 260)}ms`;
          revealObserver.observe(target);
        });
      }

      function initScrollVariable() {
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
        const update = () => {
          document.documentElement.style.setProperty("--scroll-y", `${window.scrollY}px`);
        };
        update();
        window.addEventListener("scroll", update, { passive: true });
      }

      async function loadState() {
        const embedded = readEmbeddedApplication();
        if (embedded) return normaliseApplication(embedded);

        const params = new URLSearchParams(window.location.search);
        const sc = cleanString(params.get("sc"));
        if (sc) {
          try {
            return normaliseApplication(await fetchApplicationByShortCode(sc));
          } catch (error) {
            console.error(error);
          }
        }
        const ref = cleanString(params.get("ref"));
        if (ref) {
          try {
            return normaliseApplication(await fetchApplicationByRef(ref));
          } catch (error) {
            console.error(error);
          }
        }

        return defaults;
      }

      /* ── Contact form logic ── */
      function showToast(el, msg, ok) {
        el.textContent = msg;
        el.className = 'contact-toast ' + (ok ? 'contact-toast--ok' : 'contact-toast--err');
      }

      async function supabaseInsert(table, row) {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
          method: 'POST',
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify(row)
        });
        if (!res.ok) throw new Error(`Insert failed (${res.status})`);
      }

      function getRef() {
        const p = new URLSearchParams(window.location.search);
        return p.get('ref') || p.get('sc') || 'direct';
      }

      function initContactForms() {
        const contactMeForm = document.getElementById('contactMeForm');
        if (contactMeForm && !contactMeForm.dataset.bound) {
          contactMeForm.dataset.bound = '1';
          contactMeForm.addEventListener('submit', async function (e) {
            e.preventDefault();
            const btn = document.getElementById('cm-send');
            const toast = document.getElementById('cm-toast');
            if (!btn || !toast) return;
            btn.disabled = true;
            btn.textContent = 'Sending…';
            try {
              await supabaseInsert('cv_contact_requests', {
                direction: 'contact_me',
                cv_ref: getRef(),
                sender_name: document.getElementById('cm-name')?.value.trim() || '',
                message: document.getElementById('cm-message')?.value.trim() || '',
                page_url: window.location.href
              });
              showToast(toast, 'Message sent — thank you!', true);
              this.reset();
            } catch (err) {
              showToast(toast, 'Could not send. Please try email or phone instead.', false);
            } finally {
              btn.disabled = false;
              btn.textContent = 'Send Message';
            }
          });
        }

        const contactYouForm = document.getElementById('contactYouForm');
        if (contactYouForm && !contactYouForm.dataset.bound) {
          contactYouForm.dataset.bound = '1';
          contactYouForm.addEventListener('submit', async function (e) {
            e.preventDefault();
            const email = document.getElementById('cy-email')?.value.trim() || '';
            const toast = document.getElementById('cy-toast');
            if (!toast) return;
            if (!email) {
              showToast(toast, 'Please enter your email address.', false);
              return;
            }
            const btn = document.getElementById('cy-email-btn');
            if (!btn) return;
            btn.disabled = true;
            btn.textContent = 'Sending…';
            try {
              await supabaseInsert('cv_contact_requests', {
                direction: 'contact_you_email',
                cv_ref: getRef(),
                sender_name: document.getElementById('cy-name')?.value.trim() || '',
                sender_email: email,
                page_url: window.location.href
              });
              showToast(toast, 'Got it — I\'ll email you shortly.', true);
              this.reset();
            } catch (err) {
              showToast(toast, 'Could not send. Please email me directly.', false);
            } finally {
              btn.disabled = false;
              btn.textContent = 'Email Me Back';
            }
          });
        }

        const callButton = document.getElementById('cy-call-btn');
        if (callButton && !callButton.dataset.bound) {
          callButton.dataset.bound = '1';
          callButton.addEventListener('click', async function () {
            const phone = document.getElementById('cy-phone')?.value.trim() || '';
            const toast = document.getElementById('cy-toast');
            if (!toast) return;
            if (!phone) {
              showToast(toast, 'Please enter your phone number.', false);
              return;
            }
            const btn = this;
            btn.disabled = true;
            btn.textContent = 'Sending…';
            try {
              await supabaseInsert('cv_contact_requests', {
                direction: 'contact_you_call',
                cv_ref: getRef(),
                sender_name: document.getElementById('cy-name')?.value.trim() || '',
                sender_phone: phone,
                page_url: window.location.href
              });
              showToast(toast, 'Got it — I\'ll call you back soon.', true);
              document.getElementById('contactYouForm')?.reset();
            } catch (err) {
              showToast(toast, 'Could not send. Please call me directly on 07507 789672.', false);
            } finally {
              btn.disabled = false;
              btn.textContent = 'Call Me Back';
            }
          });
        }
      }

      async function initFullPage() {
        try {
          const state = await loadState();
          applyState(state);
        } catch (error) {
          console.error(error);
          applyState(defaults);
        }
        initReveal();
        initScrollVariable();
        initContactForms();
      }

      return {
        defaults,
        cleanString,
        cleanArray,
        cleanEvidenceExamples,
        cleanExperienceMappings,
        cleanFocusAreasToBring,
        cleanFirst90DaysPlan,
        decodePayload,
        readEmbeddedApplication,
        normaliseApplication,
        fetchApplicationByRef,
        fetchApplicationByShortCode,
        compactValue,
        normaliseKey,
        textWordCount,
        textLength,
        similarityThreshold,
        textSimilarity,
        isSimilarText,
        uniqueStrings,
        formatList,
        shortenText,
        tokenise,
        pickFirst,
        pickDistinctText,
        pickOptionalDistinctText,
        rememberText,
        pruneDisplayTags,
        filterDistinctCards,
        isLowSignalTag,
        containsProofMetric,
        extractProofMetric,
        buildRoleSignalTokens,
        buildCompanySignalTokens,
        tokenOverlapRatio,
        looksRoleLedText,
        looksCompanyLedText,
        findEvidenceById,
        pickShowcaseEvidenceExamples,
        buildEvidenceUsageLine,
        buildCompanyHighlights,
        buildHeroStrengthLine,
        buildHeroStatement,
        buildHeroPullNote,
        buildHeroKickerCopy,
        buildHeroKickerNotes,
        buildHeroMetaChips,
        buildHeroToneChips,
        buildHeroProofItems,
        buildHeroFocusItems,
        buildContractFact,
        buildWhyCompany,
        buildWhyRole,
        buildRoleNeedsSummary,
        buildFitSummary,
        buildLikelyContribution,
        buildCultureFit,
        buildExperienceMappings,
        buildRoleNeedsCards,
        buildFitCards,
        buildFocusCards,
        buildSkillsCards,
        buildFirst90DaysPlan,
        buildClosingSummary,
        buildAdvertFactExclusions,
        buildClosingHighlights,
        buildClosingQuote,
        buildClosingSupportLine,
        buildClosingSecondaryLine,
        renderLines,
        renderThemeCards,
        renderMappingCards,
        renderEvidenceExamples,
        renderHeroProofItems,
        renderTailoredHighlights,
        setText,
        setHtml,
        setFactRow,
        setElementVisibility,
        setParagraph,
        applyState,
        initReveal,
        initScrollVariable,
        loadState,
        showToast,
        supabaseInsert,
        getRef,
        initContactForms,
        initFullPage
      };
})();
